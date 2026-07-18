import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

import AppError from "../../errors/AppError.js";
import { WebhookModel } from "../../models/Webhook.js";
import { sendMessageFlow } from "../../controllers/MessageController.js";
import { IConnections, INodes } from "./DispatchWebHookService.js";
import { Request, Response } from "express";
import { ParamsDictionary } from "express-serve-static-core";
import { ParsedQs } from "qs";
import CreateContactService from "../ContactServices/CreateContactService.js";
import Contact from "../../models/Contact.js";
import CreateTicketService from "../TicketServices/CreateTicketService.js";
import CreateTicketServiceWebhook from "../TicketServices/CreateTicketServiceWebhook.js";
import { SendMessage } from "../../helpers/SendMessage.js";
import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp.js";
import Ticket from "../../models/Ticket.js";
import fs from "fs";
import GetWhatsappWbot from "../../helpers/GetWhatsappWbot.js";
import path from "path";
import SendWhatsAppMedia from "../WbotServices/SendWhatsAppMedia.js";
import SendWhatsAppMediaFlow, {
  typeSimulation
} from "../WbotServices/SendWhatsAppMediaFlow.js";
import { randomizarCaminho } from "../../utils/randomizador.js";
import { SendMessageFlow } from "../../helpers/SendMessageFlow.js";
import formatBody from "../../helpers/Mustache.js";
import formatBodyFlow from "../../helpers/FlowVariables.js";
import SetTicketMessagesAsRead from "../../helpers/SetTicketMessagesAsRead.js";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage.js";
import ShowTicketService from "../TicketServices/ShowTicketService.js";
import CreateMessageService, {
  MessageData
} from "../MessageServices/CreateMessageService.js";
import { randomString } from "../../utils/randomCode.js";
import ShowQueueService from "../QueueService/ShowQueueService.js";
import { getIO } from "../../libs/socket.js";
import UpdateTicketService from "../TicketServices/UpdateTicketService.js";
import FindOrCreateATicketTrakingService from "../TicketServices/FindOrCreateATicketTrakingService.js";
import ShowTicketUUIDService from "../TicketServices/ShowTicketFromUUIDService.js";
import logger from "../../utils/logger.js";
import CreateLogTicketService from "../TicketServices/CreateLogTicketService.js";
import Tag from "../../models/Tag.js";
import TicketTag from "../../models/TicketTag.js";
import CompaniesSettings from "../../models/CompaniesSettings.js";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService.js";
import Bluebird from "bluebird";
const { delay } = Bluebird;
import typebotListener from "../TypebotServices/typebotListener.js";
import { getWbot } from "../../libs/wbot.js";
import { proto } from "baileys";
import { handleOpenAi } from "../IntegrationsServices/OpenAiService.js";
import { IOpenAi } from "../../@types/openai.js";
import { chargeFlowExecution } from "../AICreditServices/AIUsagePricingService.js";
import handleFlowAppointmentNode from "./FlowAppointmentNode.js";

// currentDir is already available in CommonJS


interface IAddContact {
  companyId: number;
  name: string;
  phoneNumber: string;
  email?: string;
  dataMore?: any;
}

export const ActionsWebhookService = async (
  whatsappId: number,
  idFlowDb: number,
  companyId: number,
  nodes: INodes[],
  connects: IConnections[],
  nextStage: string,
  dataWebhook: any,
  details: any,
  hashWebhookId: string,
  pressKey?: string,
  idTicket?: number,
  numberPhrase: "" | { number: string; name: string; email: string } = "",
  msg?: proto.IWebMessageInfo
): Promise<string> => {
  try {
    // Validación crítica al inicio
    if (!nodes || nodes.length === 0) {
      console.error('❌ ERROR: nodes is undefined or empty in ActionsWebhookService');
      return "error";
    }

    if (!connects) {
      console.error('❌ ERROR: connects is undefined in ActionsWebhookService');
      return "error";
    }

    const io = getIO();
    let next = nextStage;
    //   "ActionWebhookService | 53",
    //   idFlowDb,
    //   companyId,
    //   nodes,
    //   connects,
    //   nextStage,
    //   dataWebhook,
    //   details,
    //   hashWebhookId,
    //   pressKey,
    //   idTicket,
    //   numberPhrase
    // );
    let createFieldJsonName = "";

    const connectStatic = connects;
    if (numberPhrase === "") {
      try {
        const nameInput = details?.inputs?.find(item => item.keyValue === "nome");
        if (nameInput && nameInput.data) {
          nameInput.data.split(",").map(dataN => {
            const lineToData = details.keysFull.find(item => item === dataN);
            let sumRes = "";
            if (!lineToData) {
              sumRes = dataN;
            } else {
              sumRes = constructJsonLine(lineToData, dataWebhook);
            }
            createFieldJsonName = createFieldJsonName + sumRes;
          });
        } else {
          logger.error(`⚠️ nameInput not found or invalid, usando valor vacío`);
          createFieldJsonName = "Cliente"; // Valor por defecto
        }
      } catch (error) {
        logger.error(`❌ Error procesando nameInput: ${error.message}`);
        createFieldJsonName = "Cliente"; // Valor por defecto en caso de error
      }
    } else {
      createFieldJsonName = numberPhrase.name;
    }

    let numberClient = "";

    if (numberPhrase === "") {
      try {
        const numberInput = details?.inputs?.find(
          item => item.keyValue === "celular"
        );

        if (numberInput && numberInput.data) {
          numberInput.data.split(",").map(dataN => {
            const lineToDataNumber = details.keysFull.find(item => item === dataN);
            let createFieldJsonNumber = "";
            if (!lineToDataNumber) {
              createFieldJsonNumber = dataN;
            } else {
              createFieldJsonNumber = constructJsonLine(
                lineToDataNumber,
                dataWebhook
              );
            }

            numberClient = numberClient + createFieldJsonNumber;
          });
        } else {
          logger.error(`⚠️ numberInput not found or invalid`);
          numberClient = ""; // Continuará con valor vacío
        }
      } catch (error) {
        logger.error(`❌ Error procesando numberInput: ${error.message}`);
        numberClient = ""; // Continuará con valor vacío
      }
    } else {
      numberClient = numberPhrase.number;
    }

    numberClient = removerNaoLetrasNumeros(numberClient);

    if (numberClient.substring(0, 2) === "55") {
      if (parseInt(numberClient.substring(2, 4)) >= 31) {
        if (numberClient.length === 13) {
          numberClient =
            numberClient.substring(0, 4) + numberClient.substring(5, 13);
        }
      }
    }

    let createFieldJsonEmail = "";

    if (numberPhrase === "") {
      const emailInput = details.inputs.find(item => item.keyValue === "email");
      emailInput.data.split(",").map(dataN => {
        const lineToDataEmail = details.keysFull.find(item =>
          item.endsWith("email")
        );

        let sumRes = "";
        if (!lineToDataEmail) {
          sumRes = dataN;
        } else {
          sumRes = constructJsonLine(lineToDataEmail, dataWebhook);
        }

        createFieldJsonEmail = createFieldJsonEmail + sumRes;
      });
    } else {
      createFieldJsonEmail = numberPhrase.email;
    }

    const lengthLoop = nodes.length;
    const whatsapp = await GetDefaultWhatsApp(whatsappId, companyId);

    if (whatsapp.status !== "CONNECTED") {
      return;
    }

    let execCount = 0;

    let execFn = "";

    let ticket = null;

    let noAlterNext = false;

    for (let i = 0; i < lengthLoop; i++) {
      let nodeSelected: any;
      let ticketInit: Ticket;

      try {
        if (pressKey) {
          if (pressKey === "parar") {
            if (idTicket) {
              ticketInit = await Ticket.findOne({
                where: { id: idTicket, whatsappId }
              });
              await ticket.update({
                status: "closed"
              });
            }
            break;
          }

          if (execFn === "") {
            // Nodo "citas": en la reanudación NO forzar comportamiento de menú;
            // devolver el control al nodo real para que su sub-máquina lea pressKey.
            const pausedCitasNode = nodes.find(
              (n: any) => n.id === next && (n.data?.type === "citas" || n.type === "citas")
            );
            if (pausedCitasNode) {
              nodeSelected = pausedCitasNode;
            } else {
              nodeSelected = {
                type: "menu"
              };
            }
          } else {
            const nodeArray = nodes.filter(node => node.id === execFn);
            nodeSelected = nodeArray && nodeArray.length > 0 ? nodeArray[0] : null;
            if (!nodeSelected) {
              logger.error(`⚠️ Node not found for execFn: ${execFn}`);
              continue; // Salta este nodo
            }
          }
        } else {
          const otherNodeArray = nodes.filter(node => node.id === next);
          const otherNode = otherNodeArray && otherNodeArray.length > 0 ? otherNodeArray[0] : null;
          if (otherNode) {
            nodeSelected = otherNode;
          } else {
            logger.error(`⚠️ Node not found for next: ${next}`);
            continue; // Salta este nodo
          }
        }

        if (!nodeSelected) {
          logger.error(`⚠️ nodeSelected is null, skipping iteration ${i}`);
          continue;
        }

        // Resolver tipo real: data.type tiene prioridad sobre node.type
        // (nodos de cola, tag, multimedia se guardan como type:"message" con data.type real)
        const resolvedType = nodeSelected.data?.type || nodeSelected.type;

        if (resolvedType === "message") {

          let msg;

          const webhook = ticket?.dataWebhook;

          if (webhook && webhook.hasOwnProperty && webhook.hasOwnProperty("variables")) {
            msg = {
              body: replaceMessages(webhook, nodeSelected?.data?.label || "")
            };
          } else {
            msg = {
              body: nodeSelected?.data?.label || ""
            };
          }

        console.log(`[FlowBuilder] Nodo MENSAJE: enviando "${msg.body?.substring(0, 50)}" a ticket=${ticket?.id || idTicket}`);

        if (!msg.body) {
          console.warn(`[FlowBuilder] Nodo MENSAJE: body vacío, saltando envío`);
        } else {
          const ticketDetails = await ShowTicketService(ticket?.id || idTicket, companyId);
          await typeSimulation(ticket, "composing");
          await SendWhatsAppMessage({
            body: formatBodyFlow(msg.body, ticketDetails as any, numberPhrase),
            ticket: ticketDetails,
            quotedMsg: null
          });
          SetTicketMessagesAsRead(ticketDetails);
        }

        await intervalWhats("1");
      }
      if (resolvedType === "typebot") {
        const wbot = getWbot(whatsapp.id);
        await typebotListener({
          wbot: wbot,
          msg,
          ticket,
          typebot: nodeSelected.data.typebotIntegration
        });
      }

      if (resolvedType === "openai") {
        const {
          name,
          prompt,
          voice,
          voiceKey,
          voiceRegion,
          maxTokens,
          temperature,
          apiKey,
          queueId,
          maxMessages
        } = nodeSelected.data.typebotIntegration as IOpenAi;

        const openAiSettings = {
          name,
          prompt,
          voice,
          voiceKey,
          voiceRegion,
          maxTokens: parseInt(maxTokens),
          temperature: parseInt(temperature),
          apiKey,
          queueId: parseInt(queueId),
          maxMessages: parseInt(maxMessages)
        };

        const contact = await Contact.findOne({
          where: { number: numberClient, companyId }
        });

        const wbot = getWbot(whatsapp.id);

        const ticketTraking = await FindOrCreateATicketTrakingService({
          ticketId: ticket.id,
          companyId,
          userId: Number(null) || undefined,
          whatsappId: whatsapp?.id
        });

        // 💳 COBRO UNIFICADO: ejecucion de nodo OpenAI en FlowBuilder = flow_execution
        // Si la company no tiene saldo, NO se invoca el nodo IA pero el flujo
        // continua para no romper nodos posteriores.
        // Nota: handleOpenAi internamente cobra "message" por la respuesta IA.
        let canRunFlowAI = true;
        try {
          await chargeFlowExecution({
            companyId,
            units: 1,
            source: "flowbuilder_openai_node",
            sourceId: ticket.id,
            description: `Nodo OpenAI FlowBuilder ticket=${ticket.id}`,
            metadata: { promptName: name, queueId }
          });
        } catch (creditErr: any) {
          const isInsufficient =
            creditErr instanceof AppError &&
            (creditErr.message === "ERR_AI_INSUFFICIENT_CREDITS" ||
              creditErr.message === "ERR_AI_NO_CREDIT_BALANCE");
          if (isInsufficient) {
            logger.warn(
              `[FlowBuilder OpenAI] Sin creditos para flow_execution (company=${companyId} ticket=${ticket.id}); skip nodo IA`
            );
            canRunFlowAI = false;
          } else {
            logger.warn(
              `[FlowBuilder OpenAI] Error cobrando flow_execution: ${creditErr?.message || creditErr}; skip nodo IA por seguridad`
            );
            canRunFlowAI = false;
          }
        }

        if (canRunFlowAI) {
          await handleOpenAi(
            openAiSettings,
            msg,
            wbot,
            ticket,
            contact,
            null,
            ticketTraking
          );
        }
      }

      if (resolvedType === "question") {
        const webhook = ticket?.dataWebhook;
        const variables = ticket?.dataWebhook?.variables;

        if (!variables || variables === undefined || variables === null) {
          const { message } = nodeSelected.data.typebotIntegration;
          const ticketDetails = await ShowTicketService(ticket.id, companyId);

          const bodyFila = formatBody(`${message}`, ticket.contact);

          await delay(3000);
          await typeSimulation(ticket, "composing");

          await SendWhatsAppMessage({
            body: bodyFila,
            ticket: ticketDetails,
            quotedMsg: null
          });

          SetTicketMessagesAsRead(ticketDetails);

          await ticketDetails.update({
            lastMessage: bodyFila
          });

          await ticket.update({
            userId: Number(null) || undefined,
            companyId: Number(companyId) || undefined,
            lastFlowId: nodeSelected.id,
            hashFlowId: hashWebhookId,
            flowStopped: idFlowDb.toString()
          });
        }
        break;
      }

      if (resolvedType === "ticket") {
        const queueId = nodeSelected.data?.data?.id || nodeSelected.data?.id;
        try {
          const queue = await ShowQueueService(queueId, companyId);
          console.log(`[FlowBuilder] Nodo COLA: asignando ticket ${ticket?.id || idTicket} a cola "${queue.name}" (id=${queue.id})`);

          // Asignar cola al ticket SIN cambiar status a pending (para que el flujo continúe)
          await UpdateTicketService({
            ticketData: {
              queueId: queue.id
            },
            ticketId: ticket?.id || idTicket,
            companyId
          });

          // Recargar ticket con la cola asignada
          ticket = await Ticket.findOne({
            where: { id: ticket?.id || idTicket, companyId }
          });

          await CreateLogTicketService({
            ticketId: ticket.id,
            type: "queue",
            queueId: queue.id
          });
        } catch (queueError) {
          console.error(`[FlowBuilder] Error asignando cola ${queueId}:`, queueError.message);
        }
        // NO hace break — el flujo continúa al siguiente nodo
      }

      // ─── NODO TAG: Asigna etiqueta al ticket ───
      if (resolvedType === "tag") {
        const tagId = nodeSelected.data?.data?.id || nodeSelected.data?.id;
        if (tagId && ticket) {
          try {
            const tag = await Tag.findOne({ where: { id: tagId, companyId } });
            if (tag) {
              const [, created] = await TicketTag.findOrCreate({
                where: { ticketId: ticket.id, tagId: tag.id },
                defaults: { ticketId: ticket.id, tagId: tag.id } as any
              });
              console.log(`[FlowBuilder] Tag "${tag.name}" ${created ? 'asignada' : 'ya existia'} al ticket ${ticket.id}`);
            }
          } catch (tagError) {
            console.error(`[FlowBuilder] Error asignando tag ${tagId}:`, tagError.message);
          }
        }
      }

      if (resolvedType === "singleBlock" || resolvedType === "content") {

          for (let iLoc = 0; iLoc < nodeSelected.data.seq.length; iLoc++) {
            const elementNowSelected = nodeSelected.data.seq[iLoc];
        
            // Asegura que 'ticket' esté cargado (evita NPE con ticket.dataWebhook)
            if (!ticket && idTicket) {
              ticket = await Ticket.findOne({ where: { id: idTicket, companyId } });
            }
        
            // === BLOQUE NUEVO (copiado del que sí funciona) ===
            const ticketUpdate = await Ticket.findOne({
              where: { id: idTicket, companyId }
            });
        
            if (ticketUpdate.status === "open") {
              // fuerza corte del flujo
              pressKey = "999";
              execFn = undefined;
        
              await ticket.update({
                lastFlowId: null,
                dataWebhook: null,
                queueId: Number(null) || undefined,
                hashFlowId: null,
                flowWebhook: false,
                flowStopped: null
              });

        
              // asegúrate de cortar también el for exterior:
              next = "";    // ← clave para que el loop de arriba haga break
              break;        // ← rompe este for interno
            }
        
            if (ticketUpdate.status === "closed") {
              pressKey = "999";
              execFn = undefined;
        
              await ticket.reload();
              io.of(String(companyId)).emit(`company-${ticket.companyId}-ticket`, {
                action: "delete",
                ticketId: ticket.id
              });
        
              next = "";    // ← corta el loop exterior
              break;
            }

          if (elementNowSelected.includes("message")) {
            const bodyFor = nodeSelected.data.elements.filter(
              item => item.number === elementNowSelected
            )[0].value;

            const ticketDetails = await ShowTicketService(idTicket, companyId);

            let msg;

            const webhook = ticket.dataWebhook;

            if (webhook && webhook.hasOwnProperty("variables")) {
              msg = replaceMessages(webhook.variables, bodyFor);
            } else {
              msg = bodyFor;
            }

            // Aplicar variables dinamicas del FlowBuilder ({name}, {email}, {empresa}, custom fields, etc.)
            msg = formatBodyFlow(msg, ticketDetails as any, numberPhrase);

            await delay(3000);
            await typeSimulation(ticket, "composing");

            await SendWhatsAppMessage({
              body: msg,
              ticket: ticketDetails,
              quotedMsg: null
            });

            SetTicketMessagesAsRead(ticketDetails);

            await ticketDetails.update({
              lastMessage: msg
            });

            await intervalWhats("1");
          }
          if (elementNowSelected.includes("interval")) {
            await intervalWhats(
              nodeSelected.data.elements.filter(
                item => item.number === elementNowSelected
              )[0].value
            );
          }

          if (elementNowSelected.includes("img")) {
            const filename = nodeSelected.data.elements.filter(
              item => item.number === elementNowSelected
            )[0].value;

            const mediaPath = path.join(process.cwd(), "public", `company${companyId}`, "flowbuilder", filename);
            console.log(`[FlowBuilder] singleBlock IMG: ${filename}, existe: ${fs.existsSync(mediaPath)}`);

            if (fs.existsSync(mediaPath)) {
              const ticketInt = await Ticket.findOne({ where: { id: ticket.id } });
              await typeSimulation(ticket, "composing");
              await SendWhatsAppMediaFlow({
                media: mediaPath,
                ticket: ticketInt
              });
            }
            await intervalWhats("1");
          }

          if (elementNowSelected.includes("pdf")) {
            const filename = nodeSelected.data.elements.find(
              item => item.number === elementNowSelected
            )?.value;

            const mediaPath = path.join(process.cwd(), "public", `company${companyId}`, "flowbuilder", filename);
            console.log(`[FlowBuilder] singleBlock PDF: ${filename}, existe: ${fs.existsSync(mediaPath)}`);

            if (fs.existsSync(mediaPath)) {
              const ticketInt = await Ticket.findOne({ where: { id: ticket.id } });
              await typeSimulation(ticket, "composing");
              await SendWhatsAppMediaFlow({
                media: mediaPath,
                ticket: ticketInt
              });
            }
            await intervalWhats("1");
          }

          if (elementNowSelected.includes("audio")) {
            const filename = nodeSelected.data.elements.filter(
              item => item.number === elementNowSelected
            )[0].value;

            // Usar process.cwd() para construir la ruta correcta
            const mediaDirectory = path.join(process.cwd(), "public", `company${companyId}`, "flowbuilder", filename);


            const ticketInt = await Ticket.findOne({
              where: { id: ticket.id }
            });

            await typeSimulation(ticket, "recording");

            await SendWhatsAppMediaFlow({
              media: mediaDirectory,
              ticket: ticketInt,
              isRecord: nodeSelected.data.elements.filter(
                item => item.number === elementNowSelected
              )[0].record
            });
            //fs.unlinkSync(mediaDirectory.split('.')[0] + 'A.mp3');
            await intervalWhats("1");
          }
          if (elementNowSelected.includes("video")) {
            const filename = nodeSelected.data.elements.filter(
              item => item.number === elementNowSelected
            )[0].value;

            // Usar process.cwd() para construir la ruta correcta
            const mediaDirectory = path.join(process.cwd(), "public", `company${companyId}`, "flowbuilder", filename);


            const ticketInt = await Ticket.findOne({
              where: { id: ticket.id }
            });

            await typeSimulation(ticket, "recording");

            await SendWhatsAppMediaFlow({
              media: mediaDirectory,
              ticket: ticketInt
            });
            //fs.unlinkSync(mediaDirectory.split('.')[0] + 'A.mp3');
            await intervalWhats("1");
          }
        }
      }

      // ─── NODOS MULTIMEDIA INDIVIDUALES (image, audio, video, pdf) ───
      if (resolvedType === "image" || resolvedType === "pdf") {
        const mediaUrl = nodeSelected.data?.url;
        if (mediaUrl) {
          console.log(`[FlowBuilder] Nodo ${resolvedType.toUpperCase()}: enviando ${mediaUrl} (ticket=${ticket?.id || idTicket})`);
          const mediaPath = path.join(process.cwd(), "public", `company${companyId}`, "flowbuilder", mediaUrl);
          if (fs.existsSync(mediaPath)) {
            const ticketDetails = await ShowTicketService(ticket?.id || idTicket, companyId);
            await typeSimulation(ticket, "composing");
            await SendWhatsAppMediaFlow({
              media: mediaPath,
              ticket: ticketDetails
            });
          } else {
            console.warn(`[FlowBuilder] Archivo no encontrado: ${mediaPath}`);
          }
          await intervalWhats("1");
        }
      }

      if (resolvedType === "audio") {
        const mediaUrl = nodeSelected.data?.url;
        if (mediaUrl) {
          console.log(`[FlowBuilder] Nodo AUDIO: enviando ${mediaUrl} (ticket=${ticket?.id || idTicket})`);
          const mediaPath = path.join(process.cwd(), "public", `company${companyId}`, "flowbuilder", mediaUrl);
          if (fs.existsSync(mediaPath)) {
            const ticketInt = await Ticket.findOne({ where: { id: ticket?.id || idTicket } });
            await typeSimulation(ticket, "recording");
            await SendWhatsAppMediaFlow({
              media: mediaPath,
              ticket: ticketInt,
              isRecord: true
            });
          } else {
            console.warn(`[FlowBuilder] Archivo no encontrado: ${mediaPath}`);
          }
          await intervalWhats("1");
        }
      }

      if (resolvedType === "video") {
        const mediaUrl = nodeSelected.data?.url;
        if (mediaUrl) {
          console.log(`[FlowBuilder] Nodo VIDEO: enviando ${mediaUrl} (ticket=${ticket?.id || idTicket})`);
          const mediaPath = path.join(process.cwd(), "public", `company${companyId}`, "flowbuilder", mediaUrl);
          if (fs.existsSync(mediaPath)) {
            const ticketInt = await Ticket.findOne({ where: { id: ticket?.id || idTicket } });
            await typeSimulation(ticket, "recording");
            await SendWhatsAppMediaFlow({
              media: mediaPath,
              ticket: ticketInt
            });
          } else {
            console.warn(`[FlowBuilder] Archivo no encontrado: ${mediaPath}`);
          }
          await intervalWhats("1");
        }
      }

      // ─── NODO INTERVALO (espera N segundos) ───
      if (resolvedType === "interval") {
        const sec = nodeSelected.data?.sec || nodeSelected.data?.value || "3";
        console.log(`[FlowBuilder] Nodo INTERVALO: esperando ${sec}s`);
        await intervalWhats(String(sec));
      }

      // ─── NODO URL (envía enlace como mensaje) ───
      if (resolvedType === "url") {
        const url = nodeSelected.data?.url;
        if (url) {
          console.log(`[FlowBuilder] Nodo URL: enviando ${url} (ticket=${ticket?.id || idTicket})`);
          const ticketDetails = await ShowTicketService(ticket?.id || idTicket, companyId);
          await typeSimulation(ticket, "composing");
          await SendWhatsAppMessage({
            body: formatBodyFlow(url, ticketDetails as any, numberPhrase),
            ticket: ticketDetails,
            quotedMsg: null
          });
          SetTicketMessagesAsRead(ticketDetails);
        }
        await intervalWhats("1");
      }

      // ─── NODO LIST (envía lista como mensaje) ───
      if (resolvedType === "list") {
        const listData = nodeSelected.data;
        if (listData?.message) {
          console.log(`[FlowBuilder] Nodo LISTA: enviando lista (ticket=${ticket?.id || idTicket})`);
          const ticketDetails = await ShowTicketService(ticket?.id || idTicket, companyId);
          await typeSimulation(ticket, "composing");
          await SendWhatsAppMessage({
            body: formatBodyFlow(listData.message, ticketDetails as any, numberPhrase),
            ticket: ticketDetails,
            quotedMsg: null
          });
          SetTicketMessagesAsRead(ticketDetails);
        }
        await intervalWhats("1");
      }

      let isRandomizer: boolean;
      if (resolvedType === "randomizer") {
        const selectedRandom = randomizarCaminho(
          nodeSelected.data.percent / 100
        );

        const resultConnect = connects.filter(
          connect => connect.source === nodeSelected.id
        );
        if (selectedRandom === "A") {
          next = resultConnect.filter(item => item.sourceHandle === "a")[0]
            .target;
          noAlterNext = true;
        } else {
          next = resultConnect.filter(item => item.sourceHandle === "b")[0]
            .target;
          noAlterNext = true;
        }
        isRandomizer = true;
      }

      let isMenu: boolean;

      // Nodo "citas": sub-máquina conversacional de agendamiento (módulo aparte).
      // Siempre pausa (esperando respuesta) o termina; nunca ramifica a otro nodo.
      if (resolvedType === "citas") {
        await handleFlowAppointmentNode({
          ticket,
          companyId,
          whatsappId,
          nodeSelected,
          pressKey,
          dataWebhook,
          numberPhrase,
          idFlowDb,
          hashWebhookId
        });
        break;
      }

      if (resolvedType === "menu") {
        if (pressKey) {
          const filterOne = connectStatic.filter(
            confil => confil.source === next
          );
          const filterTwo = filterOne.filter(
            filt2 => filt2.sourceHandle === "a" + pressKey
          );
          if (filterTwo.length > 0) {
            execFn = filterTwo[0].target;
          } else {
            execFn = undefined;
          }
          // execFn =
          //   connectStatic
          //     .filter(confil => confil.source === next)
          //     .filter(filt2 => filt2.sourceHandle === "a" + pressKey)[0]?.target ??
          //   undefined;
          if (execFn === undefined) {
            break;
          }
          pressKey = "999";

          const isNodeExist = nodes.filter(item => item.id === execFn);
          if (isNodeExist.length > 0) {
            isMenu = isNodeExist[0].type === "menu" ? true : false;
          } else {
            isMenu = false;
          }
        } else {
          let optionsMenu = "";
          const opts = nodeSelected.data.arrayOption || [];
          opts.forEach((item: any, idx: number) => {
            // Negritas en el número (WhatsApp formatea *texto* como bold) + doble salto entre opciones
            optionsMenu += `*[${item.number}]* ${item.value}`;
            if (idx < opts.length - 1) optionsMenu += "\n\n";
          });

          const menuCreate = `${nodeSelected.data.message}\n\n${optionsMenu}`;

          const webhook = ticket.dataWebhook;

          let msg;
          if (webhook && webhook.hasOwnProperty("variables")) {
            msg = {
              body: replaceMessages(webhook, menuCreate),
              number: numberClient,
              companyId: companyId
            };
          } else {
            msg = {
              body: menuCreate,
              number: numberClient,
              companyId: companyId
            };
          }

          const ticketDetails = await ShowTicketService(ticket.id, companyId);

          const messageData: MessageData = {
            wid: randomString(50),
            ticketId: ticket.id,
            body: msg.body,
            fromMe: true,
            read: true
          };

          //await CreateMessageService({ messageData: messageData, companyId });

          //await SendWhatsAppMessage({ body: bodyFor, ticket: ticketDetails, quotedMsg: null })

          // await SendMessage(whatsapp, {
          //   number: numberClient,
          //   body: msg.body
          // });

          await typeSimulation(ticket, "composing");

          // Aplicar variables dinamicas del FlowBuilder al menu ({name}, {empresa}, etc.)
          const renderedMenuBody = formatBodyFlow(msg.body, ticketDetails as any, numberPhrase);

          await SendWhatsAppMessage({
            body: renderedMenuBody,
            ticket: ticketDetails,
            quotedMsg: null
          });

          SetTicketMessagesAsRead(ticketDetails);

          await ticketDetails.update({
            lastMessage: renderedMenuBody
          });
          await intervalWhats("1");

          if (ticket) {
            ticket = await Ticket.findOne({
              where: {
                id: ticket.id,
                whatsappId: Number(whatsappId) || undefined,
                companyId: companyId
              }
            });
          } else {
            ticket = await Ticket.findOne({
              where: {
                id: idTicket,
                whatsappId: Number(whatsappId) || undefined,
                companyId: companyId
              }
            });
          }

          if (ticket) {
            await ticket.update({
              queueId: ticket.queueId ? ticket.queueId : null,
              userId: Number(null) || undefined,
              companyId: Number(companyId) || undefined,
              flowWebhook: true,
              lastFlowId: nodeSelected.id,
              dataWebhook: dataWebhook,
              hashFlowId: hashWebhookId,
              flowStopped: idFlowDb.toString()
            });
          }

          break;
        }
      }

      let isContinue = false;

      if (pressKey === "999" && execCount > 0) {

        pressKey = undefined;
        const result = connects.filter(connect => connect.source === execFn)[0];
        if (typeof result === "undefined") {
          next = "";
        } else {
          if (!noAlterNext) {
            next = result.target;
          }
        }
      } else {
        let result;

        if (isMenu) {
          result = { target: execFn };
          isContinue = true;
          pressKey = undefined;
        } else if (isRandomizer) {
          isRandomizer = false;
          result = next;
        } else {
          result = connects.filter(connect => connect.source === next)[0];
        }

        if (typeof result === "undefined") {
          next = "";
        } else {
          if (!noAlterNext) {
            next = result.target;
          }
        }
      }

      if (!pressKey && !isContinue) {
        const nextNode = connects.filter(
          connect => connect.source === nodeSelected.id
        ).length;


        if (nextNode === 0) {

          await Ticket.findOne({
            where: { id: idTicket, whatsappId, companyId: companyId }
          });
          await ticket.update({
            lastFlowId: null,
            hashFlowId: null,
            flowWebhook: true,
            flowStopped: idFlowDb.toString()
          });
          break;
        }
      }

      isContinue = false;

      if (next === "") {
        break;
      }


      ticket = await Ticket.findOne({
        where: { id: idTicket, whatsappId, companyId: companyId }
      });

      if (ticket.status === "closed") {
        io.of(String(companyId))
          // .to(oldStatus)
          // .to(ticketId.toString())
          .emit(`company-${ticket.companyId}-ticket`, {
            action: "delete",
            ticketId: ticket.id
          });
      }

      await ticket.update({
        whatsappId: Number(whatsappId) || undefined,
        queueId: ticket?.queueId,
        userId: Number(null) || undefined,
        companyId: Number(companyId) || undefined,
        flowWebhook: true,
        lastFlowId: nodeSelected.id,
        hashFlowId: hashWebhookId,
        flowStopped: idFlowDb.toString()
      });

      noAlterNext = false;
      execCount++;

      } catch (nodeError) {
        // Catch individual por nodo - NO crashea el flujo completo
        logger.error(`❌ Error en nodo ${nodeSelected?.id || 'unknown'}: ${nodeError?.message}`);
        logger.error(`Stack: ${nodeError?.stack}`);
        // Continúa con el siguiente nodo en lugar de crashear
        if (next === "") {
          break; // Si no hay siguiente nodo, termina el flujo
        }
        continue; // Salta al siguiente nodo
      }
    }

    return "ds";
  } catch (error) {
    logger.error(error);
  }
};

const constructJsonLine = (line: string, json: any) => {
  let valor = json;
  const chaves = line.split(".");

  if (chaves.length === 1) {
    return valor[chaves[0]];
  }

  for (const chave of chaves) {
    valor = valor[chave];
  }
  return valor;
};

function removerNaoLetrasNumeros(texto: string) {
  // Substitui todos os caracteres que não são letras ou números por vazio
  return texto.replace(/[^a-zA-Z0-9]/g, "");
}

const sendMessageWhats = async (
  whatsId: number,
  msg: any,
  req: Request<ParamsDictionary, any, any, ParsedQs, Record<string, any>>
) => {
  sendMessageFlow(whatsId, msg, req);
  return Promise.resolve();
};

const intervalWhats = (time: string) => {
  const seconds = parseInt(time) * 1000;
  return new Promise(resolve => setTimeout(resolve, seconds));
};

const replaceMessages = (variables, message) => {
  return message.replace(
    /{{\s*([^{}\s]+)\s*}}/g,
    (match, key) => variables[key] || ""
  );
};

const replaceMessagesOld = (
  message: string,
  details: any,
  dataWebhook: any,
  dataNoWebhook?: any
) => {
  const matches = message.match(/\{([^}]+)\}/g);

  if (dataWebhook) {
    let newTxt = message.replace(/{+nome}+/, dataNoWebhook.nome);
    newTxt = newTxt.replace(/{+numero}+/, dataNoWebhook.numero);
    newTxt = newTxt.replace(/{+email}+/, dataNoWebhook.email);
    return newTxt;
  }

  if (matches && matches.includes("inputs")) {
    const placeholders = matches.map(match => match.replace(/\{|\}/g, ""));
    let newText = message;
    placeholders.map(item => {
      const value = details["inputs"].find(
        itemLocal => itemLocal.keyValue === item
      );
      const lineToData = details["keysFull"].find(itemLocal =>
        itemLocal.endsWith(`.${value.data}`)
      );
      const createFieldJson = constructJsonLine(lineToData, dataWebhook);
      newText = newText.replace(`{${item}}`, createFieldJson);
    });
    return newText;
  } else {
    return message;
  }
};
