import { WASocket, proto } from "baileys";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import { Store } from "../../libs/store";
import ShowDialogChatBotsServices from "../DialogChatBotsServices/ShowDialogChatBotsServices";
import ShowQueueService from "../QueueService/ShowQueueService";
import ShowChatBotServices from "../ChatBotServices/ShowChatBotServices";
import DeleteDialogChatBotsServices from "../DialogChatBotsServices/DeleteDialogChatBotsServices";
import { resetDialogStage } from "../DialogChatBotsServices/ResetDialogStageService";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import formatBody from "../../helpers/Mustache";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import Chatbot from "../../models/Chatbot";
import User from "../../models/User";
import { sendText } from "../FacebookServices/graphAPI";

type Session = WASocket & {
  id?: number;
  store?: Store;
};

const isNumeric = (value: string) => /^-?\d+$/.test(value);

// [Ola 3] El cuerpo era IDÉNTICO al del otro ChatbotListener —comprobado
// carácter a carácter— y no dependía del canal: sus tres llamadas son a
// servicios de dominio. Vive en
// ../DialogChatBotsServices/ResetDialogStageService. Aquí queda el alias con
// el nombre de siempre, que es como lo llaman el resto de puntos del fichero.
export const deleteAndCreateDialogStage = resetDialogStage;

const sendMessage = async (
  wbot: Session,
  contact: Contact,
  ticket: Ticket,
  body: string
) => {
  const sentMessage = await sendText(
    contact.number,
    formatBody(body, ticket),
    ticket.whatsapp.facebookUserToken
  );
};

const sendDialog = async (
  choosenQueue: Chatbot,
  contact: Contact,
  ticket: Ticket
) => {
  const showChatBots = await ShowChatBotServices(choosenQueue.id);
  if (showChatBots.options) {
    let options = "";

    showChatBots.options.forEach((option, index) => {
      options += `*${index + 1}* - ${option.name}\n`;
    });

    const optionsBack =
      options.length > 0
        ? `${options}\n*#* Voltar para o menu principal`
        : options;

    if (options.length > 0) {
      const body = `\u200e${choosenQueue.greetingMessage}\n\n${optionsBack}`;
      // const sendOption = await sendMessage(wbot, contact, ticket, body);

      const sendOption = await sendText(
        contact.number,
        formatBody(body, ticket),
        ticket.whatsapp.facebookUserToken
      );

      return sendOption;
    }

    const body = `\u200e${choosenQueue.greetingMessage}`;
    const send = await sendText(
      contact.number,
      formatBody(body, ticket),
      ticket.whatsapp.facebookUserToken
    );
    return send;
  }

  let options = "";

  showChatBots.options.forEach((option, index) => {
    options += `*${index + 1}* - ${option.name}\n`;
  });

  const optionsBack =
    options.length > 0
      ? `${options}\n*#* Voltar para o menu principal`
      : options;

  if (options.length > 0) {
    const body = `\u200e${choosenQueue.greetingMessage}\n\n${optionsBack}`;
    const sendOption = await sendText(
      contact.number,
      formatBody(body, ticket),
      ticket.whatsapp.facebookUserToken
    );
    return sendOption;
  }

  const body = `\u200e${choosenQueue.greetingMessage}`;
  const send = await sendText(
    contact.number,
    formatBody(body, ticket),
    ticket.whatsapp.facebookUserToken
  );
  return send;
};

const backToMainMenu = async (
  wbot: Session,
  contact: Contact,
  ticket: Ticket
) => {
  await UpdateTicketService({
    ticketData: { queueId: null },
    ticketId: ticket.id,
    companyId: ticket.companyId
  });
  const { queues, greetingMessage } = await ShowWhatsAppService(wbot.id!, ticket.companyId);


  let options = "";

    queues.forEach((option, index) => {
      options += `*${index + 1}* - ${option.name}\n`;
    });

    const body = formatBody(`\u200e${greetingMessage}\n\n${options}`, ticket);
    await sendMessage(wbot, contact, ticket, body);

    const deleteDialog = await DeleteDialogChatBotsServices(contact.id);
    return deleteDialog;
};

export const sayChatbot = async (
  queueId: number,
  wbot: any,
  ticket: Ticket,
  contact: Contact,
  msg: any
): Promise<any> => {
  const selectedOption = msg.text;
  if (!queueId && selectedOption && msg.is_echo) return;

  const getStageBot = await ShowDialogChatBotsServices(contact.id, contact.companyId);

  if (selectedOption === "#") {
    const backTo = await backToMainMenu(wbot, contact, ticket);
    return backTo;
  }

  if (!getStageBot) {
    const queue = await ShowQueueService(queueId, ticket.companyId);
    const selectedOption =  msg.text

    const choosenQueue = queue.chatbots[+selectedOption - 1];
    if (!choosenQueue?.greetingMessage) {
      await DeleteDialogChatBotsServices(contact.id);
      return;
    } // nao tem mensagem de boas vindas
    if (choosenQueue) {
      if (choosenQueue.isAgent) {
        const getUserByName = await User.findOne({
          where: {
            name: choosenQueue.name
          }
        });
        const ticketUpdateAgent = {
          ticketData: {
            userId: getUserByName.id,
            status: "open",
          },
          ticketId: ticket.id,
          companyId: ticket.companyId
        };
        await UpdateTicketService(ticketUpdateAgent);
      }
      await deleteAndCreateDialogStage(contact, choosenQueue.id, ticket);
      const send = await sendDialog(choosenQueue, contact, ticket);
      return send;
    }
  }

  if (getStageBot) {
    const selected = isNumeric(selectedOption) ? selectedOption : 1;
    const bots = await ShowChatBotServices(getStageBot.chatbotId);
    const choosenQueue = bots.options[+selected - 1]
      ? bots.options[+selected - 1]
      : bots.options[0];
    if (!choosenQueue.greetingMessage) {
      await DeleteDialogChatBotsServices(contact.id);
      return;
    } // nao tem mensagem de boas vindas
    if (choosenQueue) {
      if (choosenQueue.isAgent) {
        const getUserByName = await User.findOne({
          where: {
            name: choosenQueue.name
          }
        });
        const ticketUpdateAgent = {
          ticketData: {
            userId: getUserByName.id,
            status: "open"
          },
          ticketId: ticket.id,
          companyId: ticket.companyId
        };
        await UpdateTicketService(ticketUpdateAgent);
      }
      await deleteAndCreateDialogStage(contact, choosenQueue.id, ticket);
      const send = await sendDialog(choosenQueue,  contact, ticket);
      return send;
    }
  }
};
