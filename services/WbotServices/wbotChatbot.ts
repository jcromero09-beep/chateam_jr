/**
 * wbotChatbot.ts — [Refactor Ola 5] subsistema de CHATBOT de selección de cola,
 * extraído VERBATIM de wbotMessageListener (-1.846 L del monolito).
 *
 * Qué vive aquí: el menú que se le presenta al contacto cuando la empresa tiene
 * más de una cola, en sus tres formas (texto numerado, lista interactiva y
 * botones), más `verifyQueue`, que decide cuál de las tres se usa, construye el
 * VerifyQueueCtx y despacha.
 *
 * Las tres bot* eran closures dentro de verifyQueue; la Ola 4 las subió a nivel de
 * módulo pasándoles un ctx explícito de 14 variables (verificado con
 * tests/harness/wbotClosureFreeVars.cjs). Esta ola solo cambia de fichero.
 *
 * Dependencias: este módulo NO importa NADA de wbotMessageListener. La pila
 * de persistencia (verifyMessage/verifyMediaMessage) y handleMessageIntegration
 * se importan normal desde ./wbotMessagePersistence y ./wbotIntegrations, que
 * salieron del monolito en los lotes anteriores justo para
 * que este bloque pudiera moverse sin ciclo.
 */
import path from "path";
import fs from "fs";
import moment from "moment";
import lodash from "lodash";
const { isNil } = lodash;

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

import {
  delay,
  generateWAMessageContent,
  generateWAMessageFromContent,
  proto,
  WASocket,
} from "baileys";

import Contact from "../../models/Contact";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import TicketTraking from "../../models/TicketTraking";
import Whatsapp from "../../models/Whatsapp";

import logger, { logInfo } from "../../utils/logger";
import { debounce } from "../../helpers/Debounce";
import formatBody from "../../helpers/Mustache";

import VerifyCurrentSchedule from "../CompanyService/VerifyCurrentSchedule";
import ShowFileService from "../FileServices/ShowService";
import ShowQueueIntegrationService from "../QueueIntegrationServices/ShowQueueIntegrationService";
import CreateLogTicketService from "../TicketServices/CreateLogTicketService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import ListUserQueueServices from "../UserQueueServices/ListUserQueueServices";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";

import SendWhatsAppMedia, { getMessageOptions } from "./SendWhatsAppMedia";
import { getBodyMessage } from "./wbotMessageParsers";
import { verifyMediaMessage, verifyMessage } from "./wbotMessagePersistence";
// [Refactor Ola 7] Era el único `await import` de este módulo: handleMessageIntegration
// salió del monolito a ./wbotIntegrations y ya no hay ciclo que romper.
import { handleMessageIntegration } from "./wbotIntegrations";

// Mismo alias que el monolito (y que libs/wbot): el socket con el id de la sesión.
type Session = WASocket & {
  id?: number;
};

interface VerifyQueueCtx {
  wbot: Session;
  ticket: Ticket;
  contact: Contact;
  settings: any;
  ticketTraking: TicketTraking;
  companyId: number;
  queues: any;
  greetingMessage: any;
  maxUseBotQueues: any;
  timeUseBotQueues: any;
  chatbot: boolean;
  enableQueuePosition: boolean;
  choosenQueue: any;
  randomUserId: any;
}

// [Refactor Ola 4] botText extraído de las closures de verifyQueue a función módulo-nivel.
// Recibe VerifyQueueCtx explícito (14 vars verificadas por tests/harness/wbotClosureFreeVars.cjs).
// Movimiento VERBATIM del cuerpo. verifyQueue construye el ctx y despacha.
async function botText(ctx: VerifyQueueCtx) {
  // `choosenQueue` es la única del ctx que se reasigna (cuando hay una sola cola,
  // más abajo). El resto es de solo lectura: separarlas quita 13 avisos de
  // prefer-const por función sin tocar una coma de la lógica.
  let { choosenQueue } = ctx;
  const {
    chatbot,
    companyId,
    contact,
    enableQueuePosition,
    greetingMessage,
    maxUseBotQueues,
    queues,
    randomUserId,
    settings,
    ticket,
    ticketTraking,
    timeUseBotQueues,
    wbot,
  } = ctx;

  if (choosenQueue || (queues.length === 1 && chatbot)) {
    // // console.log("entrou no choose", ticket.isOutOfHour, ticketTraking.chatbotAt)
    if (queues.length === 1) choosenQueue = queues[0];
    const queue = await Queue.findByPk(choosenQueue.id);

    if (ticket.isOutOfHour === false && ticketTraking.chatbotAt !== null) {
      await ticketTraking.update({
        chatbotAt: null,
      });
      await ticket.update({
        amountUsedBotQueues: 0,
      });
    }

    let currentSchedule;

    if (settings?.scheduleType === "queue") {
      currentSchedule = await VerifyCurrentSchedule(companyId, queue.id, 0);
    }

    if (
      settings?.scheduleType === "queue" &&
      ticket.status !== "open" &&
      !isNil(currentSchedule) &&
      (ticket.amountUsedBotQueues < maxUseBotQueues || maxUseBotQueues === 0) &&
      (!currentSchedule || currentSchedule.inActivity === false) &&
      (!ticket.isGroup || ticket.whatsapp?.groupAsTicket === "enabled")
    ) {
      if (timeUseBotQueues !== "0") {
        //Regra para desabilitar o chatbot por x minutos/horas após o primeiro envio
        //const ticketTraking = await FindOrCreateATicketTrakingService({ ticketId: ticket.id, companyId });
        const dataLimite = new Date();
        const Agora = new Date();

        if (ticketTraking.chatbotAt !== null) {
          dataLimite.setMinutes(
            ticketTraking.chatbotAt.getMinutes() + Number(timeUseBotQueues),
          );

          if (
            ticketTraking.chatbotAt !== null &&
            Agora < dataLimite &&
            timeUseBotQueues !== "0" &&
            ticket.amountUsedBotQueues !== 0
          ) {
            return;
          }
        }
        await ticketTraking.update({
          chatbotAt: null,
        });
      }

      const outOfHoursMessage = queue.outOfHoursMessage;

      if (outOfHoursMessage !== "") {
        // // console.log("entrei3");
        const body = formatBody(`${outOfHoursMessage}`, ticket);

        const debouncedSentMessage = debounce(
          async () => {
            await wbot.sendMessage(
              `${ticket.contact.number}@${
                ticket.isGroup ? "g.us" : "s.whatsapp.net"
              }`,
              {
                text: body,
              },
            );
          },
          1000,
          ticket.id,
        );
        debouncedSentMessage();

        //atualiza o contador de vezes que enviou o bot e que foi enviado fora de hora
        // await ticket.update({
        //   queueId: queue.id,
        //   isOutOfHour: true,
        //   amountUsedBotQueues: ticket.amountUsedBotQueues + 1
        // });

        // return;
      }
      //atualiza o contador de vezes que enviou o bot e que foi enviado fora de hora
      await ticket.update({
        queueId: queue.id,
        isOutOfHour: true,
        amountUsedBotQueues: ticket.amountUsedBotQueues + 1,
      });
      return;
    }

    await UpdateTicketService({
      ticketData: {
        // amountUsedBotQueues: 0,
        queueId: choosenQueue.id,
      },
      // ticketData: { queueId: queues.length ===1 ? null : choosenQueue.id },
      ticketId: ticket.id,
      companyId,
    });
    // }

    if (choosenQueue.chatbots.length > 0 && !ticket.isGroup) {
      let options = "";
      choosenQueue.chatbots.forEach((chatbot, index) => {
        options += `*[ ${index + 1} ]* - ${chatbot.name}\n`;
      });

      const body = formatBody(
        `\u200e ${choosenQueue.greetingMessage}\n\n${options}\n*[ # ]* Voltar para o menu principal\n*[ Sair ]* Encerrar atendimento`,
        ticket,
      );

      const sentMessage = await wbot.sendMessage(
        `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,

        {
          text: body,
        },
      );

      await verifyMessage(sentMessage, ticket, contact, ticketTraking);

      if (settings?.settingsUserRandom === "enabled") {
        await UpdateTicketService({
          ticketData: { userId: randomUserId },
          ticketId: ticket.id,
          companyId,
        });
      }
    }

    if (
      !choosenQueue.chatbots.length &&
      choosenQueue.greetingMessage.length !== 0
    ) {
      const body = formatBody(`\u200e${choosenQueue.greetingMessage}`, ticket);
      const sentMessage = await wbot.sendMessage(
        `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
        {
          text: body,
        },
      );

      await verifyMessage(sentMessage, ticket, contact, ticketTraking);
    }

    if (!isNil(choosenQueue.fileListId)) {
      try {
        const publicFolder = path.resolve(
          currentDir,
          "..",
          "..",
          "..",
          "public",
        );

        const files = await ShowFileService(
          choosenQueue.fileListId,
          ticket.companyId,
        );

        const folder = path.resolve(
          publicFolder,
          `company${ticket.companyId}`,
          "fileList",
          String(files.id),
        );

        for (const [_index, file] of files.options.entries()) {
          const mediaSrc = {
            fieldname: "medias",
            originalname: file.path,
            encoding: "7bit",
            mimetype: file.mediaType,
            filename: file.path,
            path: path.resolve(folder, file.path),
          } as Express.Multer.File;

          // const debouncedSentMessagePosicao = debounce(
          //   async () => {
          const sentMessage = await SendWhatsAppMedia({
            media: mediaSrc,
            ticket,
            body: `\u200e ${file.name}`,
            isPrivate: false,
            isForwarded: false,
          });

          await verifyMediaMessage(
            sentMessage,
            ticket,
            ticket.contact,
            ticketTraking,
            false,
            false,
            wbot,
          );
          //   },
          //   2000,
          //   ticket.id
          // );
          // debouncedSentMessagePosicao();
        }
      } catch (error) {
        logInfo(error);
      }
    }

    await delay(4000);

    //se fila está parametrizada para encerrar ticket automaticamente
    if (choosenQueue.closeTicket) {
      try {
        await UpdateTicketService({
          ticketData: {
            status: "closed",
            queueId: choosenQueue.id,
            // sendFarewellMessage: false,
          },
          ticketId: ticket.id,
          companyId,
        });
      } catch (error) {
        logInfo(error);
      }

      return;
    }

    const count = await Ticket.findAndCountAll({
      where: {
        userId: null,
        status: "pending",
        companyId,
        queueId: choosenQueue.id,
        whatsappId: wbot.id,
        isGroup: false,
      },
    });

    await CreateLogTicketService({
      ticketId: ticket.id,
      type: "queue",
      queueId: choosenQueue.id,
    });

    if (enableQueuePosition && !choosenQueue.chatbots.length) {
      // Lógica para enviar posição da fila de atendimento
      const qtd = count.count === 0 ? 1 : count.count;
      const msgFila = `${settings.sendQueuePositionMessage} *${qtd}*`;
      // const msgFila = `*Assistente Virtual:*\n{{ms}} *{{name}}*, sua posição na fila de atendimento é: *${qtd}*`;
      const bodyFila = formatBody(`${msgFila}`, ticket);
      const debouncedSentMessagePosicao = debounce(
        async () => {
          await wbot.sendMessage(
            `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
            {
              text: bodyFila,
            },
          );
        },
        3000,
        ticket.id,
      );
      debouncedSentMessagePosicao();
    }
  } else {
    if (ticket.isGroup) return;

    if (
      maxUseBotQueues &&
      maxUseBotQueues !== 0 &&
      ticket.amountUsedBotQueues >= maxUseBotQueues
    ) {
      // await UpdateTicketService({
      //   ticketData: { queueId: queues[0].id },
      //   ticketId: ticket.id
      // });

      return;
    }

    if (timeUseBotQueues !== "0") {
      //Regra para desabilitar o chatbot por x minutos/horas após o primeiro envio
      //const ticketTraking = await FindOrCreateATicketTrakingService({ ticketId: ticket.id, companyId });
      const dataLimite = new Date();
      const Agora = new Date();

      if (ticketTraking.chatbotAt !== null) {
        dataLimite.setMinutes(
          ticketTraking.chatbotAt.getMinutes() + Number(timeUseBotQueues),
        );

        if (
          ticketTraking.chatbotAt !== null &&
          Agora < dataLimite &&
          timeUseBotQueues !== "0" &&
          ticket.amountUsedBotQueues !== 0
        ) {
          return;
        }
      }
      await ticketTraking.update({
        chatbotAt: null,
      });
    }

    // if (wbot.waitForSocketOpen()) {
    //   // console.log("AGUARDANDO")
    //   // console.log(wbot.waitForSocketOpen())
    // }

    wbot.presenceSubscribe(contact.remoteJid);

    let options = "";

    wbot.sendPresenceUpdate("composing", contact.remoteJid);

    queues.forEach((queue, index) => {
      options += `*[ ${index + 1} ]* - ${queue.name}\n`;
    });
    options += `\n*[ Sair ]* - Encerrar atendimento`;

    const body = formatBody(`\u200e${greetingMessage}\n\n${options}`, ticket);

    await CreateLogTicketService({
      ticketId: ticket.id,
      type: "chatBot",
    });

    await delay(1000);

    await wbot.sendPresenceUpdate("paused", contact.remoteJid);

    if (ticket.whatsapp.greetingMediaAttachment !== null) {
      const filePath = path.resolve(
        "public",
        `company${companyId}`,
        ticket.whatsapp.greetingMediaAttachment,
      );

      const fileExists = fs.existsSync(filePath);
      // // console.log(fileExists);
      if (fileExists) {
        const messagePath = ticket.whatsapp.greetingMediaAttachment;
        const optionsMsg = await getMessageOptions(
          messagePath,
          filePath,
          String(companyId),
          body,
        );

        const debouncedSentgreetingMediaAttachment = debounce(
          async () => {
            const sentMessage = await wbot.sendMessage(
              `${ticket.contact.number}@${
                ticket.isGroup ? "g.us" : "s.whatsapp.net"
              }`,
              { ...optionsMsg },
            );

            await verifyMediaMessage(
              sentMessage,
              ticket,
              contact,
              ticketTraking,
              false,
              false,
              wbot,
            );
          },
          1000,
          ticket.id,
        );
        debouncedSentgreetingMediaAttachment();
      } else {
        const debouncedSentMessage = debounce(
          async () => {
            const sentMessage = await wbot.sendMessage(
              `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
              {
                text: body,
              },
            );

            await verifyMessage(sentMessage, ticket, contact, ticketTraking);
          },
          1000,
          ticket.id,
        );
        debouncedSentMessage();
      }

      await UpdateTicketService({
        ticketData: {
          // amountUsedBotQueues: ticket.amountUsedBotQueues + 1
        },
        ticketId: ticket.id,
        companyId,
      });

      return;
    } else {
      const debouncedSentMessage = debounce(
        async () => {
          const sentMessage = await wbot.sendMessage(
            `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
            {
              text: body,
            },
          );

          await verifyMessage(sentMessage, ticket, contact, ticketTraking);
        },
        1000,
        ticket.id,
      );

      await UpdateTicketService({
        ticketData: {},
        ticketId: ticket.id,
        companyId,
      });

      debouncedSentMessage();
    }
  }
}

// [Refactor Ola 4] botList extraído a función módulo-nivel (VerifyQueueCtx). Movimiento VERBATIM.
async function botList(ctx: VerifyQueueCtx) {
  // `choosenQueue` es la única del ctx que se reasigna (cuando hay una sola cola,
  // más abajo). El resto es de solo lectura: separarlas quita 13 avisos de
  // prefer-const por función sin tocar una coma de la lógica.
  let { choosenQueue } = ctx;
  const {
    chatbot,
    companyId,
    contact,
    enableQueuePosition,
    greetingMessage,
    maxUseBotQueues,
    queues,
    randomUserId,
    settings,
    ticket,
    ticketTraking,
    timeUseBotQueues,
    wbot,
  } = ctx;

  if (choosenQueue || (queues.length === 1 && chatbot)) {
    // // console.log("entrou no choose", ticket.isOutOfHour, ticketTraking.chatbotAt)
    if (queues.length === 1) choosenQueue = queues[0];
    const queue = await Queue.findByPk(choosenQueue.id);

    if (ticket.isOutOfHour === false && ticketTraking.chatbotAt !== null) {
      await ticketTraking.update({
        chatbotAt: null,
      });
      await ticket.update({
        amountUsedBotQueues: 0,
      });
    }

    let currentSchedule;

    if (settings?.scheduleType === "queue") {
      currentSchedule = await VerifyCurrentSchedule(companyId, queue.id, 0);
    }

    if (
      settings?.scheduleType === "queue" &&
      ticket.status !== "open" &&
      !isNil(currentSchedule) &&
      (ticket.amountUsedBotQueues < maxUseBotQueues || maxUseBotQueues === 0) &&
      (!currentSchedule || currentSchedule.inActivity === false) &&
      (!ticket.isGroup || ticket.whatsapp?.groupAsTicket === "enabled")
    ) {
      if (timeUseBotQueues !== "0") {
        //Regra para desabilitar o chatbot por x minutos/horas após o primeiro envio
        //const ticketTraking = await FindOrCreateATicketTrakingService({ ticketId: ticket.id, companyId });
        const dataLimite = new Date();
        const Agora = new Date();

        if (ticketTraking.chatbotAt !== null) {
          dataLimite.setMinutes(
            ticketTraking.chatbotAt.getMinutes() + Number(timeUseBotQueues),
          );

          if (
            ticketTraking.chatbotAt !== null &&
            Agora < dataLimite &&
            timeUseBotQueues !== "0" &&
            ticket.amountUsedBotQueues !== 0
          ) {
            return;
          }
        }
        await ticketTraking.update({
          chatbotAt: null,
        });
      }

      const outOfHoursMessage = queue.outOfHoursMessage;

      if (outOfHoursMessage !== "") {
        // // console.log("entrei3");
        const body = formatBody(`${outOfHoursMessage}`, ticket);

        const debouncedSentMessage = debounce(
          async () => {
            await wbot.sendMessage(
              `${ticket.contact.number}@${
                ticket.isGroup ? "g.us" : "s.whatsapp.net"
              }`,
              {
                text: body,
              },
            );
          },
          1000,
          ticket.id,
        );
        debouncedSentMessage();

        //atualiza o contador de vezes que enviou o bot e que foi enviado fora de hora
        // await ticket.update({
        //   queueId: queue.id,
        //   isOutOfHour: true,
        //   amountUsedBotQueues: ticket.amountUsedBotQueues + 1
        // });

        // return;
      }
      //atualiza o contador de vezes que enviou o bot e que foi enviado fora de hora
      await ticket.update({
        queueId: queue.id,
        isOutOfHour: true,
        amountUsedBotQueues: ticket.amountUsedBotQueues + 1,
      });
      return;
    }

    await UpdateTicketService({
      ticketData: {
        // amountUsedBotQueues: 0,
        queueId: choosenQueue.id,
      },
      // ticketData: { queueId: queues.length ===1 ? null : choosenQueue.id },
      ticketId: ticket.id,
      companyId,
    });
    // }

    if (choosenQueue.chatbots.length > 0 && !ticket.isGroup) {
      const sectionsRows = [];

      choosenQueue.chatbots.forEach((chatbot, index) => {
        sectionsRows.push({
          title: chatbot.name,
          rowId: `${index + 1}`,
        });
      });
      sectionsRows.push({
        title: "Voltar Menu Inicial",
        rowId: "#",
      });
      const sections = [
        {
          title: "Lista de Botões",
          rows: sectionsRows,
        },
      ];

      const listMessage = {
        text: formatBody(`\u200e${queue.greetingMessage}\n`),
        title: "Lista\n",
        buttonText: "Clique aqui",
        //footer: ".",
        //listType: 2,
        sections,
      };
      const sendMsg = await wbot.sendMessage(
        `${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
        listMessage,
      );

      await verifyMessage(sendMsg, ticket, contact, ticketTraking);

      if (settings?.settingsUserRandom === "enabled") {
        await UpdateTicketService({
          ticketData: { userId: randomUserId },
          ticketId: ticket.id,
          companyId,
        });
      }
    }

    if (
      !choosenQueue.chatbots.length &&
      choosenQueue.greetingMessage.length !== 0
    ) {
      const body = formatBody(`\u200e${choosenQueue.greetingMessage}`, ticket);
      const sentMessage = await wbot.sendMessage(
        `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
        {
          text: body,
        },
      );

      await verifyMessage(sentMessage, ticket, contact, ticketTraking);
    }

    if (!isNil(choosenQueue.fileListId)) {
      try {
        const publicFolder = path.resolve(currentDir, "..", "..", "public");

        const files = await ShowFileService(
          choosenQueue.fileListId,
          ticket.companyId,
        );

        const folder = path.resolve(
          publicFolder,
          `company${ticket.companyId}`,
          "fileList",
          String(files.id),
        );

        for (const [_index, file] of files.options.entries()) {
          const mediaSrc = {
            fieldname: "medias",
            originalname: file.path,
            encoding: "7bit",
            mimetype: file.mediaType,
            filename: file.path,
            path: path.resolve(folder, file.path),
          } as Express.Multer.File;

          // const debouncedSentMessagePosicao = debounce(
          //   async () => {
          const sentMessage = await SendWhatsAppMedia({
            media: mediaSrc,
            ticket,
            body: `\u200e ${file.name}`,
            isPrivate: false,
            isForwarded: false,
          });

          await verifyMediaMessage(
            sentMessage,
            ticket,
            ticket.contact,
            ticketTraking,
            false,
            false,
            wbot,
          );
          //   },
          //   2000,
          //   ticket.id
          // );
          // debouncedSentMessagePosicao();
        }
      } catch (error) {
        logInfo(error);
      }
    }

    await delay(4000);

    //se fila está parametrizada para encerrar ticket automaticamente
    if (choosenQueue.closeTicket) {
      try {
        await UpdateTicketService({
          ticketData: {
            status: "closed",
            queueId: choosenQueue.id,
            // sendFarewellMessage: false,
          },
          ticketId: ticket.id,
          companyId,
        });
      } catch (error) {
        logInfo(error);
      }

      return;
    }

    const count = await Ticket.findAndCountAll({
      where: {
        userId: null,
        status: "pending",
        companyId,
        queueId: choosenQueue.id,
        whatsappId: wbot.id,
        isGroup: false,
      },
    });

    await CreateLogTicketService({
      ticketId: ticket.id,
      type: "queue",
      queueId: choosenQueue.id,
    });

    if (enableQueuePosition && !choosenQueue.chatbots.length) {
      // Lógica para enviar posição da fila de atendimento
      const qtd = count.count === 0 ? 1 : count.count;
      const msgFila = `${settings.sendQueuePositionMessage} *${qtd}*`;
      // const msgFila = `*Assistente Virtual:*\n{{ms}} *{{name}}*, sua posição na fila de atendimento é: *${qtd}*`;
      const bodyFila = formatBody(`${msgFila}`, ticket);
      const debouncedSentMessagePosicao = debounce(
        async () => {
          await wbot.sendMessage(
            `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
            {
              text: bodyFila,
            },
          );
        },
        3000,
        ticket.id,
      );
      debouncedSentMessagePosicao();
    }
  } else {
    if (ticket.isGroup) return;

    if (
      maxUseBotQueues &&
      maxUseBotQueues !== 0 &&
      ticket.amountUsedBotQueues >= maxUseBotQueues
    ) {
      // await UpdateTicketService({
      //   ticketData: { queueId: queues[0].id },
      //   ticketId: ticket.id
      // });

      return;
    }

    if (timeUseBotQueues !== "0") {
      //Regra para desabilitar o chatbot por x minutos/horas após o primeiro envio
      //const ticketTraking = await FindOrCreateATicketTrakingService({ ticketId: ticket.id, companyId });
      const dataLimite = new Date();
      const Agora = new Date();

      if (ticketTraking.chatbotAt !== null) {
        dataLimite.setMinutes(
          ticketTraking.chatbotAt.getMinutes() + Number(timeUseBotQueues),
        );

        if (
          ticketTraking.chatbotAt !== null &&
          Agora < dataLimite &&
          timeUseBotQueues !== "0" &&
          ticket.amountUsedBotQueues !== 0
        ) {
          return;
        }
      }
      await ticketTraking.update({
        chatbotAt: null,
      });
    }

    // if (wbot.waitForSocketOpen()) {
    //   // console.log("AGUARDANDO")
    //   // console.log(wbot.waitForSocketOpen())
    // }

    wbot.presenceSubscribe(contact.remoteJid);

    const options = "";

    wbot.sendPresenceUpdate("composing", contact.remoteJid);

    const sectionsRows = [];

    queues.forEach((queue, index) => {
      sectionsRows.push({
        title: `${queue.name}`, //queue.name,
        description: `_`,
        rowId: `${index + 1}`,
      });
    });

    sectionsRows.push({
      title: "Voltar Menu Inicial",
      rowId: "#",
    });

    await CreateLogTicketService({
      ticketId: ticket.id,
      type: "chatBot",
    });

    await delay(1000);
    const body = formatBody(`\u200e${greetingMessage}\n\n${options}`, ticket);

    await wbot.sendPresenceUpdate("paused", contact.remoteJid);

    if (ticket.whatsapp.greetingMediaAttachment !== null) {
      const filePath = path.resolve(
        "public",
        `company${companyId}`,
        ticket.whatsapp.greetingMediaAttachment,
      );

      const fileExists = fs.existsSync(filePath);
      // // console.log(fileExists);
      if (fileExists) {
        const messagePath = ticket.whatsapp.greetingMediaAttachment;
        const optionsMsg = await getMessageOptions(
          messagePath,
          filePath,
          String(companyId),
          body,
        );

        const debouncedSentgreetingMediaAttachment = debounce(
          async () => {
            const sentMessage = await wbot.sendMessage(
              `${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
              { ...optionsMsg },
            );

            await verifyMediaMessage(
              sentMessage,
              ticket,
              contact,
              ticketTraking,
              false,
              false,
              wbot,
            );
          },
          1000,
          ticket.id,
        );
        debouncedSentgreetingMediaAttachment();
      } else {
        const debouncedSentMessage = debounce(
          async () => {
            const sections = [
              {
                title: "Lista de Botões",
                rows: sectionsRows,
              },
            ];

            const listMessage = {
              title: "Lista\n",
              text: formatBody(`\u200e${greetingMessage}\n`),
              buttonText: "Clique aqui",
              //footer: "_",
              sections,
            };

            const sendMsg = await wbot.sendMessage(
              `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
              listMessage,
            );

            await verifyMessage(sendMsg, ticket, contact, ticketTraking);
          },
          1000,
          ticket.id,
        );
        debouncedSentMessage();
      }

      await UpdateTicketService({
        ticketData: {
          // amountUsedBotQueues: ticket.amountUsedBotQueues + 1
        },
        ticketId: ticket.id,
        companyId,
      });

      return;
    } else {
      const debouncedSentMessage = debounce(
        async () => {
          const sections = [
            {
              title: "Lista de Botões",
              rows: sectionsRows,
            },
          ];

          const listMessage = {
            title: "Lista\n",
            text: formatBody(`\u200e${greetingMessage}\n`),
            buttonText: "Clique aqui",
            //footer: "_",
            sections,
          };

          const sendMsg = await wbot.sendMessage(
            `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
            listMessage,
          );

          await verifyMessage(sendMsg, ticket, contact, ticketTraking);
        },
        1000,
        ticket.id,
      );

      await UpdateTicketService({
        ticketData: {},
        ticketId: ticket.id,
        companyId,
      });

      debouncedSentMessage();
    }
  }
}

// [Refactor Ola 4] botButton extraído a función módulo-nivel (VerifyQueueCtx). Movimiento VERBATIM.
async function botButton(ctx: VerifyQueueCtx) {
  // `choosenQueue` es la única del ctx que se reasigna (cuando hay una sola cola,
  // más abajo). El resto es de solo lectura: separarlas quita 13 avisos de
  // prefer-const por función sin tocar una coma de la lógica.
  let { choosenQueue } = ctx;
  const {
    chatbot,
    companyId,
    contact,
    enableQueuePosition,
    greetingMessage,
    maxUseBotQueues,
    queues,
    randomUserId,
    settings,
    ticket,
    ticketTraking,
    timeUseBotQueues,
    wbot,
  } = ctx;

  if (choosenQueue || (queues.length === 1 && chatbot)) {
    // // console.log("entrou no choose", ticket.isOutOfHour, ticketTraking.chatbotAt)
    if (queues.length === 1) choosenQueue = queues[0];
    const queue = await Queue.findByPk(choosenQueue.id);

    if (ticket.isOutOfHour === false && ticketTraking.chatbotAt !== null) {
      await ticketTraking.update({
        chatbotAt: null,
      });
      await ticket.update({
        amountUsedBotQueues: 0,
      });
    }

    let currentSchedule;

    if (settings?.scheduleType === "queue") {
      currentSchedule = await VerifyCurrentSchedule(companyId, queue.id, 0);
    }

    if (
      settings?.scheduleType === "queue" &&
      ticket.status !== "open" &&
      !isNil(currentSchedule) &&
      (ticket.amountUsedBotQueues < maxUseBotQueues || maxUseBotQueues === 0) &&
      (!currentSchedule || currentSchedule.inActivity === false) &&
      (!ticket.isGroup || ticket.whatsapp?.groupAsTicket === "enabled")
    ) {
      if (timeUseBotQueues !== "0") {
        //Regra para desabilitar o chatbot por x minutos/horas após o primeiro envio
        //const ticketTraking = await FindOrCreateATicketTrakingService({ ticketId: ticket.id, companyId });
        const dataLimite = new Date();
        const Agora = new Date();

        if (ticketTraking.chatbotAt !== null) {
          dataLimite.setMinutes(
            ticketTraking.chatbotAt.getMinutes() + Number(timeUseBotQueues),
          );

          if (
            ticketTraking.chatbotAt !== null &&
            Agora < dataLimite &&
            timeUseBotQueues !== "0" &&
            ticket.amountUsedBotQueues !== 0
          ) {
            return;
          }
        }
        await ticketTraking.update({
          chatbotAt: null,
        });
      }

      const outOfHoursMessage = queue.outOfHoursMessage;

      if (outOfHoursMessage !== "") {
        // // console.log("entrei3");
        const body = formatBody(`${outOfHoursMessage}`, ticket);

        const debouncedSentMessage = debounce(
          async () => {
            await wbot.sendMessage(
              `${ticket.contact.number}@${
                ticket.isGroup ? "g.us" : "s.whatsapp.net"
              }`,
              {
                text: body,
              },
            );
          },
          1000,
          ticket.id,
        );
        debouncedSentMessage();
      }

      await ticket.update({
        queueId: queue.id,
        isOutOfHour: true,
        amountUsedBotQueues: ticket.amountUsedBotQueues + 1,
      });
      return;
    }

    await UpdateTicketService({
      ticketData: {
        queueId: choosenQueue.id,
      },
      ticketId: ticket.id,
      companyId,
    });
    // }

    if (choosenQueue.chatbots.length > 0 && !ticket.isGroup) {
      const debouncedSentMessage = debounce(
        async () => {
          try {
            // Busca o número do WhatsApp associado ao ticket
            const whatsapp = await Whatsapp.findOne({
              where: { id: ticket.whatsappId },
            });
            if (!whatsapp || !whatsapp.number) {
              throw new Error("Número de WhatsApp não encontrado");
            }
            const botNumber = whatsapp.number;

            const buttons = [];

            // Adiciona os chatbots como botões
            choosenQueue.chatbots.forEach((chatbot, index) => {
              buttons.push({
                name: "quick_reply", // Substitua por 'quick_reply' se necessário, dependendo do contexto
                buttonParamsJson: JSON.stringify({
                  display_text: chatbot.name,
                  id: `${index + 1}`,
                }),
              });
            });

            buttons.push({
              name: "quick_reply",
              buttonParamsJson: JSON.stringify({
                display_text: "Voltar Menu Inicial",
                id: "#",
              }),
            });
            const interactiveMsg = {
              viewOnceMessage: {
                message: {
                  interactiveMessage: {
                    body: {
                      text: `\u200e${choosenQueue.greetingMessage}`,
                    },
                    nativeFlowMessage: {
                      buttons: buttons,
                      messageParamsJson: JSON.stringify({
                        from: "apiv2",
                        templateId: "4194019344155670",
                      }),
                    },
                  },
                },
              },
            };
            const jid = `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`;
            const newMsg = generateWAMessageFromContent(jid, interactiveMsg, {
              userJid: botNumber,
            });
            await wbot.relayMessage(jid, newMsg.message!, {
              messageId: newMsg.key.id,
            });
            if (newMsg) {
              await wbot.upsertMessage(newMsg, "notify");
            }
          } catch (error) {
            console.error("Erro ao enviar ou fazer upsert da mensagem:", error);
          }
        },
        1000,
        ticket.id,
      );
      debouncedSentMessage();

      if (settings?.settingsUserRandom === "enabled") {
        await UpdateTicketService({
          ticketData: { userId: randomUserId },
          ticketId: ticket.id,
          companyId,
        });
      }
    }

    if (
      !choosenQueue.chatbots.length &&
      choosenQueue.greetingMessage.length !== 0
    ) {
      const body = formatBody(`\u200e${choosenQueue.greetingMessage}`, ticket);
      const sentMessage = await wbot.sendMessage(
        `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
        {
          text: body,
        },
      );

      await verifyMessage(sentMessage, ticket, contact, ticketTraking);
    }

    if (!isNil(choosenQueue.fileListId)) {
      try {
        const publicFolder = path.resolve(currentDir, "..", "..", "public");

        const files = await ShowFileService(
          choosenQueue.fileListId,
          ticket.companyId,
        );

        const folder = path.resolve(
          publicFolder,
          `company${ticket.companyId}`,
          "fileList",
          String(files.id),
        );

        for (const [_index, file] of files.options.entries()) {
          const mediaSrc = {
            fieldname: "medias",
            originalname: file.path,
            encoding: "7bit",
            mimetype: file.mediaType,
            filename: file.path,
            path: path.resolve(folder, file.path),
          } as Express.Multer.File;

          // const debouncedSentMessagePosicao = debounce(
          //   async () => {
          const sentMessage = await SendWhatsAppMedia({
            media: mediaSrc,
            ticket,
            body: `\u200e ${file.name}`,
            isPrivate: false,
            isForwarded: false,
          });

          await verifyMediaMessage(
            sentMessage,
            ticket,
            ticket.contact,
            ticketTraking,
            false,
            false,
            wbot,
          );
          //   },
          //   2000,
          //   ticket.id
          // );
          // debouncedSentMessagePosicao();
        }
      } catch (error) {
        logInfo(error);
      }
    }

    await delay(4000);

    //se fila está parametrizada para encerrar ticket automaticamente
    if (choosenQueue.closeTicket) {
      try {
        await UpdateTicketService({
          ticketData: {
            status: "closed",
            queueId: choosenQueue.id,
            // sendFarewellMessage: false,
          },
          ticketId: ticket.id,
          companyId,
        });
      } catch (error) {
        logInfo(error);
      }

      return;
    }

    const count = await Ticket.findAndCountAll({
      where: {
        userId: null,
        status: "pending",
        companyId,
        queueId: choosenQueue.id,
        whatsappId: wbot.id,
        isGroup: false,
      },
    });

    await CreateLogTicketService({
      ticketId: ticket.id,
      type: "queue",
      queueId: choosenQueue.id,
    });

    if (enableQueuePosition && !choosenQueue.chatbots.length) {
      // Lógica para enviar posição da fila de atendimento
      const qtd = count.count === 0 ? 1 : count.count;
      const msgFila = `${settings.sendQueuePositionMessage} *${qtd}*`;
      // const msgFila = `*Assistente Virtual:*\n{{ms}} *{{name}}*, sua posição na fila de atendimento é: *${qtd}*`;
      const bodyFila = formatBody(`${msgFila}`, ticket);
      const debouncedSentMessagePosicao = debounce(
        async () => {
          await wbot.sendMessage(
            `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
            {
              text: bodyFila,
            },
          );
        },
        3000,
        ticket.id,
      );
      debouncedSentMessagePosicao();
    }
  } else {
    if (ticket.isGroup) return;

    if (
      maxUseBotQueues &&
      maxUseBotQueues !== 0 &&
      ticket.amountUsedBotQueues >= maxUseBotQueues
    ) {
      // await UpdateTicketService({
      //   ticketData: { queueId: queues[0].id },
      //   ticketId: ticket.id
      // });

      return;
    }

    if (timeUseBotQueues !== "0") {
      //Regra para desabilitar o chatbot por x minutos/horas após o primeiro envio
      //const ticketTraking = await FindOrCreateATicketTrakingService({ ticketId: ticket.id, companyId });
      const dataLimite = new Date();
      const Agora = new Date();

      if (ticketTraking.chatbotAt !== null) {
        dataLimite.setMinutes(
          ticketTraking.chatbotAt.getMinutes() + Number(timeUseBotQueues),
        );

        if (
          ticketTraking.chatbotAt !== null &&
          Agora < dataLimite &&
          timeUseBotQueues !== "0" &&
          ticket.amountUsedBotQueues !== 0
        ) {
          return;
        }
      }
      await ticketTraking.update({
        chatbotAt: null,
      });
    }

    wbot.presenceSubscribe(contact.remoteJid);

    const options = "";

    wbot.sendPresenceUpdate("composing", contact.remoteJid);

    const _body = formatBody(`\u200e${greetingMessage}\n\n${options}`, ticket);

    await CreateLogTicketService({
      ticketId: ticket.id,
      type: "chatBot",
    });

    await delay(1000);

    await wbot.sendPresenceUpdate("paused", contact.remoteJid);

    if (ticket.whatsapp.greetingMediaAttachment !== null) {
      const filePath = path.resolve(
        "public",
        `company${companyId}`,
        ticket.whatsapp.greetingMediaAttachment,
      );

      const fileExists = fs.existsSync(filePath);
      // // console.log(fileExists);
      if (fileExists) {
        const debouncedSentgreetingMediaAttachment = debounce(
          async () => {
            try {
              const whatsapp = await Whatsapp.findOne({
                where: { id: ticket.whatsappId },
              });
              if (!whatsapp || !whatsapp.number) {
                throw new Error("Número de WhatsApp não encontrado");
              }
              const botNumber = whatsapp.number;

              const buttons = [];

              queues.forEach((queue, index) => {
                buttons.push({
                  name: "quick_reply",
                  buttonParamsJson: JSON.stringify({
                    display_text: queue.name,
                    id: `${index + 1}`,
                  }),
                });
              });

              buttons.push({
                name: "quick_reply",
                buttonParamsJson: JSON.stringify({
                  display_text: "Encerrar atendimento",
                  id: "Sair",
                }),
              });

              // Verifica se há uma mídia para enviar
              if (ticket.whatsapp.greetingMediaAttachment) {
                const filePath = path.resolve(
                  "public",
                  `company${companyId}`,
                  ticket.whatsapp.greetingMediaAttachment,
                );
                const fileExists = fs.existsSync(filePath);

                if (fileExists) {
                  // Carrega a imagem local
                  const imageMessageContent = await generateWAMessageContent(
                    { image: { url: filePath } }, // Caminho da imagem local
                    { upload: wbot.waUploadToServer! },
                  );
                  const imageMessage = imageMessageContent.imageMessage;

                  // Mensagem interativa com mídia
                  const interactiveMsg = {
                    viewOnceMessage: {
                      message: {
                        interactiveMessage: {
                          body: {
                            text: `\u200e${greetingMessage}`,
                          },
                          header: {
                            imageMessage, // Anexa a imagem
                            hasMediaAttachment: true,
                          },
                          nativeFlowMessage: {
                            buttons: buttons,
                            messageParamsJson: JSON.stringify({
                              from: "apiv2",
                              templateId: "4194019344155670",
                            }),
                          },
                        },
                      },
                    },
                  };

                  const jid = `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`;
                  const newMsg = generateWAMessageFromContent(
                    jid,
                    interactiveMsg,
                    { userJid: botNumber },
                  );
                  await wbot.relayMessage(jid, newMsg.message!, {
                    messageId: newMsg.key.id,
                  });

                  if (newMsg) {
                    await wbot.upsertMessage(newMsg, "notify");
                  }
                }
              }
            } catch (error) {
              console.error(
                "Erro ao enviar ou fazer upsert da mensagem:",
                error,
              );
            }
          },
          1000,
          ticket.id,
        );
        debouncedSentgreetingMediaAttachment();
      } else {
        const debouncedSentButton = debounce(
          async () => {
            try {
              const whatsapp = await Whatsapp.findOne({
                where: { id: ticket.whatsappId },
              });
              if (!whatsapp || !whatsapp.number) {
                throw new Error("Número de WhatsApp não encontrado");
              }
              const botNumber = whatsapp.number;

              const buttons = [];

              queues.forEach((queue, index) => {
                buttons.push({
                  name: "quick_reply",
                  buttonParamsJson: JSON.stringify({
                    display_text: queue.name,
                    id: `${index + 1}`,
                  }),
                });
              });

              buttons.push({
                name: "quick_reply",
                buttonParamsJson: JSON.stringify({
                  display_text: "Encerrar atendimento",
                  id: "Sair",
                }),
              });

              const interactiveMsg = {
                viewOnceMessage: {
                  message: {
                    interactiveMessage: {
                      body: {
                        text: `\u200e${greetingMessage}`,
                      },
                      nativeFlowMessage: {
                        buttons: buttons,
                        messageParamsJson: JSON.stringify({
                          from: "apiv2",
                          templateId: "4194019344155670",
                        }),
                      },
                    },
                  },
                },
              };

              const jid = `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`;
              const newMsg = generateWAMessageFromContent(jid, interactiveMsg, {
                userJid: botNumber,
              });
              await wbot.relayMessage(jid, newMsg.message!, {
                messageId: newMsg.key.id,
              });

              if (newMsg) {
                await wbot.upsertMessage(newMsg, "notify");
              }
            } catch (error) {
              /* se ignora a propósito: el envío es best-effort */
            }
          },
          1000,
          ticket.id,
        );

        debouncedSentButton();
      }

      await UpdateTicketService({
        ticketData: {},
        ticketId: ticket.id,
        companyId,
      });

      return;
    } else {
      const debouncedSentButton = debounce(
        async () => {
          try {
            const whatsapp = await Whatsapp.findOne({
              where: { id: ticket.whatsappId },
            });
            if (!whatsapp || !whatsapp.number) {
              throw new Error("Número de WhatsApp não encontrado");
            }
            const botNumber = whatsapp.number;

            const buttons = [];

            queues.forEach((queue, index) => {
              buttons.push({
                name: "quick_reply",
                buttonParamsJson: JSON.stringify({
                  display_text: queue.name,
                  id: `${index + 1}`,
                }),
              });
            });

            buttons.push({
              name: "quick_reply",
              buttonParamsJson: JSON.stringify({
                display_text: "Encerrar atendimento",
                id: "Sair",
              }),
            });

            const interactiveMsg = {
              viewOnceMessage: {
                message: {
                  interactiveMessage: {
                    body: {
                      text: `\u200e${greetingMessage}`,
                    },
                    nativeFlowMessage: {
                      buttons: buttons,
                      messageParamsJson: JSON.stringify({
                        from: "apiv2",
                        templateId: "4194019344155670",
                      }),
                    },
                  },
                },
              },
            };

            const jid = `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`;
            const newMsg = generateWAMessageFromContent(jid, interactiveMsg, {
              userJid: botNumber,
            });
            await wbot.relayMessage(jid, newMsg.message!, {
              messageId: newMsg.key.id,
            });

            if (newMsg) {
              await wbot.upsertMessage(newMsg, "notify");
            }
          } catch (error) {
            /* se ignora a propósito: el envío es best-effort */
          }
        },
        1000,
        ticket.id,
      );

      await UpdateTicketService({
        ticketData: {},
        ticketId: ticket.id,
        companyId,
      });
      debouncedSentButton();
    }
  }
}

const verifyQueue = async (
  wbot: Session,
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact,
  settings?: any,
  ticketTraking?: TicketTraking,
) => {
  const companyId = ticket.companyId;

  // // console.log("GETTING WHATSAPP VERIFY QUEUE", ticket.whatsappId, wbot.id)
  const {
    queues,
    greetingMessage,
    maxUseBotQueues,
    timeUseBotQueues,
    useAIOrchestrator,
  } = await ShowWhatsAppService(wbot.id!, companyId);

  let chatbot = false;

  if (queues.length === 1) {
    chatbot = queues[0]?.chatbots.length > 1;
  }

  const enableQueuePosition = settings.sendQueuePosition === "enabled";

  if (queues.length === 1 && !chatbot) {
    const sendGreetingMessageOneQueues =
      settings.sendGreetingMessageOneQueues === "enabled" || false;

    //inicia integração dialogflow/n8n
    // Verificacion de integracion
    if (!msg.key.fromMe && !ticket.isGroup && queues[0].integrationId) {
      const integrations = await ShowQueueIntegrationService(
        queues[0].integrationId,
        companyId,
      );

      // 🛡️ Guard: si la integración es supervisor_ai y la conexión NO tiene
      // useAIOrchestrator, NO disparar la integración ni marcar el ticket.
      if (
        integrations?.type === "supervisor_ai" &&
        useAIOrchestrator !== true
      ) {
        logger.info(
          `[verifyQueue] supervisor_ai bloqueado por useAIOrchestrator=false en whatsappId=${wbot.id}`,
        );
      } else {
        await handleMessageIntegration(
          msg,
          wbot,
          companyId,
          integrations,
          ticket,
          null,
          null,
          null,
          null,
        );

        if (msg.key.fromMe) {
          await ticket.update({
            typebotSessionTime: moment().toDate(),
            useIntegration: true,
            integrationId: integrations.id,
          });
        } else {
          await ticket.update({
            useIntegration: true,
            integrationId: integrations.id,
          });
        }
      }

      // return;
    }

    if (greetingMessage.length > 1 && sendGreetingMessageOneQueues) {
      const body = formatBody(`${greetingMessage}`, ticket);

      if (ticket.whatsapp.greetingMediaAttachment !== null) {
        const filePath = path.resolve(
          "public",
          `company${companyId}`,
          ticket.whatsapp.greetingMediaAttachment,
        );

        const fileExists = fs.existsSync(filePath);

        if (fileExists) {
          const messagePath = ticket.whatsapp.greetingMediaAttachment;
          const optionsMsg = await getMessageOptions(
            messagePath,
            filePath,
            String(companyId),
            body,
          );
          const debouncedSentgreetingMediaAttachment = debounce(
            async () => {
              const sentMessage = await wbot.sendMessage(
                `${ticket.contact.number}@${
                  ticket.isGroup ? "g.us" : "s.whatsapp.net"
                }`,
                { ...optionsMsg },
              );

              await verifyMediaMessage(
                sentMessage,
                ticket,
                contact,
                ticketTraking,
                false,
                false,
                wbot,
              );
            },
            1000,
            ticket.id,
          );
          debouncedSentgreetingMediaAttachment();
        } else {
          await wbot.sendMessage(
            `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
            {
              text: body,
            },
          );
        }
      } else {
        await wbot.sendMessage(
          `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
          {
            text: body,
          },
        );
      }
    }

    if (!isNil(queues[0].fileListId)) {
      try {
        const publicFolder = path.resolve(currentDir, "..", "..", "public");

        const files = await ShowFileService(
          queues[0].fileListId,
          ticket.companyId,
        );

        const folder = path.resolve(
          publicFolder,
          `company${ticket.companyId}`,
          "fileList",
          String(files.id),
        );

        for (const [_index, file] of files.options.entries()) {
          const mediaSrc = {
            fieldname: "medias",
            originalname: file.path,
            encoding: "7bit",
            mimetype: file.mediaType,
            filename: file.path,
            path: path.resolve(folder, file.path),
          } as Express.Multer.File;

          await SendWhatsAppMedia({
            media: mediaSrc,
            ticket,
            body: file.name,
            isPrivate: false,
            isForwarded: false,
          });
        }
      } catch (error) {
        logInfo(error);
      }
    }

    if (queues[0].closeTicket) {
      await UpdateTicketService({
        ticketData: {
          status: "closed",
          queueId: queues[0].id,
          // sendFarewellMessage: false
        },
        ticketId: ticket.id,
        companyId,
      });

      return;
    } else {
      await UpdateTicketService({
        ticketData: {
          queueId: queues[0].id,
          status: ticket.status === "lgpd" ? "pending" : ticket.status,
        },
        ticketId: ticket.id,
        companyId,
      });
    }

    const count = await Ticket.findAndCountAll({
      where: {
        userId: null,
        status: "pending",
        companyId,
        queueId: queues[0].id,
        isGroup: false,
      },
    });

    if (enableQueuePosition) {
      // Lógica para enviar posição da fila de atendimento
      const qtd = count.count === 0 ? 1 : count.count;
      const msgFila = `${settings.sendQueuePositionMessage} *${qtd}*`;
      // const msgFila = `*Assistente Virtual:*\n{{ms}} *{{name}}*, sua posição na fila de atendimento é: *${qtd}*`;
      const bodyFila = formatBody(`${msgFila}`, ticket);
      const debouncedSentMessagePosicao = debounce(
        async () => {
          await wbot.sendMessage(
            `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
            {
              text: bodyFila,
            },
          );
        },
        3000,
        ticket.id,
      );
      debouncedSentMessagePosicao();
    }

    return;
  }

  // REGRA PARA DESABILITAR O BOT PARA ALGUM CONTATO
  if (contact.disableBot) {
    return;
  }

  let selectedOption = "";

  if (ticket.status !== "lgpd") {
    selectedOption =
      msg?.message?.buttonsResponseMessage?.selectedButtonId ||
      msg?.message?.listResponseMessage?.singleSelectReply.selectedRowId ||
      getBodyMessage(msg);
  } else {
    if (!isNil(ticket.lgpdAcceptedAt))
      await ticket.update({
        status: "pending",
      });

    await ticket.reload();
  }

  if (String(selectedOption).toLocaleLowerCase() == "sair") {
    // Encerra atendimento

    const ticketData = {
      isBot: false,
      status: "closed",
      sendFarewellMessage: true,
      maxUseBotQueues: 0,
    };

    await UpdateTicketService({ ticketData, ticketId: ticket.id, companyId });
    // await ticket.update({ queueOptionId: null, chatbot: false, queueId: null, userId: null, status: "closed"});
    //await verifyQueue(wbot, msg, ticket, ticket.contact);

    // const complationMessage = ticket.whatsapp?.complationMessage;

    // // console.log(complationMessage)
    // const textMessage = {
    //   text: formatBody(`\u200e${complationMessage}`, ticket),
    // };

    // if (!isNil(complationMessage)) {
    //   const sendMsg = await wbot.sendMessage(
    //     `${ticket?.contact?.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
    //     textMessage
    //   );

    //   await verifyMessage(sendMsg, ticket, ticket.contact);
    // }

    return;
  }

  const choosenQueue =
    chatbot && queues.length === 1
      ? queues[+selectedOption]
      : queues[+selectedOption - 1];

  const typeBot = settings?.chatBotType || "text";

  // Serviço p/ escolher consultor aleatório para o ticket, ao selecionar fila.
  let randomUserId;

  if (choosenQueue) {
    try {
      const userQueue = await ListUserQueueServices(choosenQueue.id);

      if (userQueue.userId > -1) {
        randomUserId = userQueue.userId;
      }
    } catch (error) {
      console.error(error);
    }
  }

  // Ativar ou desativar opção de escolher consultor aleatório.
  /*   let settings = await CompaniesSettings.findOne({
      where: {
        companyId: companyId
      }
    }); */

  // [Refactor Ola 4] botText movido a función módulo-nivel (ver arriba de verifyQueue).

  // [Refactor Ola 4] botList movido a función módulo-nivel (arriba de verifyQueue).

  // [Refactor Ola 4] botButton movido a función módulo-nivel (arriba de verifyQueue).

  const verifyQueueCtx: VerifyQueueCtx = {
    chatbot,
    choosenQueue,
    companyId,
    contact,
    enableQueuePosition,
    greetingMessage,
    maxUseBotQueues,
    queues,
    randomUserId,
    settings,
    ticket,
    ticketTraking,
    timeUseBotQueues,
    wbot,
  };

  // [Refactor Ola 4] Observabilidad del dispatch (verifyQueue no logueaba nada).
  // Confirma qué rama extraída corre por mensaje real (sonda de cierre de Ola 4).
  logger.info(
    `[verifyQueue] dispatch typeBot=${typeBot} queues=${queues.length} company=${companyId} ticket=${ticket.id}`,
  );

  if (typeBot === "text") {
    return botText(verifyQueueCtx);
  }

  if (typeBot === "list") {
    return botList(verifyQueueCtx);
  }

  if (typeBot === "button") {
    return botButton(verifyQueueCtx);
  }

  if (typeBot === "button" && queues.length > 3) {
    return botText(verifyQueueCtx);
  }
};

// verifyQueue es el único símbolo público: lo llama handleMessageInner.
export { verifyQueue };
