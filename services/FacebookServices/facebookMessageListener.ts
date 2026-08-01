import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

import { writeFileSync } from "fs";
import fs from "fs";
import axios from "axios";
import moment from "moment";
import { join } from "path";
import logger from "../../utils/logger";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import CreateMessageService from "../MessageServices/CreateMessageService";
import { findQuotedByWid } from "../MessageServices/FindQuotedMessageService";
import { resolveStoppedFlow } from "../WebhookService/ResolveStoppedFlowService";
import { resolveFlowTrigger } from "../WebhookService/ResolveFlowTriggerService";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import { getProfile, profilePsid, sendText } from "./graphAPI";
import Whatsapp from "../../models/Whatsapp";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import { debounce } from "../../helpers/Debounce";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import formatBody from "../../helpers/Mustache";
import Queue from "../../models/Queue";
import Chatbot from "../../models/Chatbot";
import Message from "../../models/Message";
import { sayChatbot } from "../WbotServices/ChatbotListenerFacebook";
import ListSettingsService from "../SettingServices/ListSettingsService";
import lodash from "lodash";
const { isNil, isNull, head } = lodash;
import FindOrCreateATicketTrakingService from "../TicketServices/FindOrCreateATicketTrakingService";
import { handleMessageIntegration, handleRating, verifyRating } from "../WbotServices/wbotMessageListener";
import CompaniesSettings from "../../models/CompaniesSettings";
import sendFacebookMessage from "./sendFacebookMessage";
import { Mutex } from "async-mutex";
import TicketTag from "../../models/TicketTag";
import Tag from "../../models/Tag";
import ShowQueueIntegrationService from "../QueueIntegrationServices/ShowQueueIntegrationService";
import { ActionsWebhookService } from "../WebhookService/ActionsWebhookService";
import { FlowBuilderModel } from "../../models/FlowBuilder";
import { FlowDefaultModel } from "../../models/FlowDefault";
import { IConnections, INodes } from "../WebhookService/DispatchWebHookService";
import { differenceInMilliseconds } from "date-fns";
import { ActionsWebhookFacebookService } from "./WebhookFacebookServices/ActionsWebhookFacebookService";
import { get } from "http";
import { WebhookModel } from "../../models/Webhook";
import { is } from "bluebird";
import ShowTicketService from "../TicketServices/ShowTicketService";
import { getInstagramUserProfile } from "./graphAPI";
import handleOpenAiSocial from "../IntegrationsServices/OpenaiServicesF&G";
import { agregarAColaDeClasificacion } from "../IntegrationsServices/clasificarEtapaCliente";
import Prompt from "../../models/Prompt";
import { number } from "yup";
import CreateCampaignMessageService from "../CampaignMessageServices/CreateCampaignMessageService";
interface IMe {
  name: string;
  // eslint-disable-next-line camelcase
  first_name: string;
  // eslint-disable-next-line camelcase
  last_name: string;
  // eslint-disable-next-line camelcase
  profile_pic: string;
  id: string;
}

export interface Root {
  object: string;
  entry: Entry[];
}

export interface Entry {
  id: string;
  time: number;
  messaging: Messaging[];
}

export interface Messaging {
  sender: Sender;
  recipient: Recipient;
  timestamp: number;
  message: MessageX;
}

export interface Sender {
  id: string;
}

export interface Recipient {
  id: string;
}

export interface MessageX {
  mid: string;
  text: string;
  reply_to: ReplyTo;
}

export interface ReplyTo {
  mid: string;
}

const verifyContact = async (msgContact: any, token: any, companyId: any) => {
 // //console.log('verifyContact',msgContact)

  const contactData = {
    name: msgContact.name || "Sin Nombre",
    number: msgContact.id || "000000",
    profilePicUrl: msgContact.profile_pic,
    isGroup: false,
    companyId: companyId,
    channel: token.channel,
    whatsappId: token.id,
  };
  // //console.log('contacto creado',contactData)
  const contact = await CreateOrUpdateContactService(contactData);
  return contact;
};

export const  verifyMessageFace = async (
  msg: any,
  body: any,
  ticket: Ticket,
  contact: Contact,
  fromMe: boolean = false
) => {
  const quotedMsg = await verifyQuotedMessage(msg);
  const messageData = {
    wid: msg.mid || msg.message_id,
    ticketId: ticket.id,
    contactId: fromMe ? undefined : msg.is_echo ? undefined : contact.id,
    body: msg.text || body,
    fromMe: fromMe ? fromMe : msg.is_echo ? true : false,
    read: fromMe ? fromMe : msg.is_echo,
    quotedMsgId: quotedMsg?.id,
    ack: 3,
    dataJson: JSON.stringify(msg),
    channel: ticket.channel
  };
  await CreateMessageService({ messageData, companyId: ticket.companyId });
  await ticket.update({
    lastMessage: msg.text
  });
};

export const verifyMessageMedia = async (
  msg: any,
  ticket: Ticket,
  contact: Contact,
  fromMe: boolean = false
): Promise<void> => {
 // //console.log('msg', msg)
  const { data } = await axios.get(msg.attachments[0].payload.url, {
    responseType: "arraybuffer"
  });
 // //console.log('msg2', msg)
  // eslint-disable-next-line no-eval
  const fileTypeMod = await (eval('import("file-type")') as Promise<any>);
  const fileTypeFromBuffer = fileTypeMod.fileTypeFromBuffer;

  const type = await fileTypeFromBuffer(data);

  const fileName = `${new Date().getTime()}.${type.ext}`;

  const folder = `public/company${ticket.companyId}`;
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder);
    fs.chmodSync(folder, 0o777)
  }

  writeFileSync(
    join(currentDir, "..", "..", "..", folder, fileName),
    data,
    "base64"
  );

  const messageData = {
    wid: msg.mid,
    ticketId: ticket.id,
    contactId: fromMe ? undefined : msg.is_echo ? undefined : contact.id,
    body: msg.text || fileName,
    fromMe: fromMe ? fromMe : msg.is_echo ? true : false,
    mediaType: msg.attachments[0].type,
    mediaUrl: fileName,
    read: fromMe ? fromMe : msg.is_echo,
    quotedMsgId: null,
    ack: 3,
    dataJson: JSON.stringify(msg),
    channel: ticket.channel
  };
  await CreateMessageService({ messageData, companyId: ticket.companyId });

  await ticket.update({
    lastMessage: msg.text
  });
};

// [Ola 3] La resolución por wid es común a los tres canales y vive en
// ../MessageServices/FindQuotedMessageService. Aquí queda solo lo propio de
// Messenger/Instagram: de dónde se saca el id del citado.
export const verifyQuotedMessage = async (msg: any): Promise<Message | null> => {
  if (!msg) return null;
  return findQuotedByWid(msg?.reply_to?.mid);
};


const flowBuilderQueue = async (
  ticket: Ticket,
  message: any,
  getSession: Whatsapp,
  companyId: number,
  contact: Contact,
  isFirstMsg: Ticket,
) => {

  // [Ola 3 · conducta alineada 2026-07-31, decisión de JC] Este canal era el único
  // que NO filtraba por `active` (reanudaba flows desactivados) y el único sin la
  // guarda por estado del ticket. Ahora se comporta como wbot y meta.
  if (["closed", "interrupted", "open"].includes(ticket.status)) {
    return;
  }

  // `onMissing: "null"` en vez de "throw": si el flow no existe o está inactivo se
  // sale en silencio, como hacía meta. Antes reventaba con TypeError al leer
  // `flow.flow["nodes"]`. Ver ../WebhookService/ResolveStoppedFlowService.
  const ctx = await resolveStoppedFlow(ticket, contact, {
    requireActive: true,
    onMissing: "null"
  });
  if (!ctx) {
    return;
  }
  const { nodes, connections, contactData: mountDataContact } = ctx;

  if (!ticket.lastFlowId) {
    return
  }


  if (ticket.flowWebhook) {
    await ActionsWebhookFacebookService(
      getSession,
      parseInt(ticket.flowStopped),
      ticket.companyId,
      nodes,
      connections,
      String(ticket.lastFlowId),
      null,
      "",
      "",
      message.text,
      ticket.id,
      mountDataContact
    );
  }

  //const integrations = await ShowQueueIntegrationService(whatsapp.integrationId, companyId);
  //await handleMessageIntegration(msg, wbot, companyId, integrations, ticket, contact, isFirstMsg)



}



const flowbuilderIntegration = async (
  ticket: Ticket,
  companyId: any,
  isFirstMsg: Ticket,
  getSession: Whatsapp,
  contact: Contact,
  message: any,
) => {
  await ticket.update({ lastMessage: message.text });

  // [Ola 3] Las cuatro prioridades del FlowBuilder son comunes a este canal y a
  // Meta — eran copia literal la una de la otra. La decisión de QUÉ flow disparar
  // vive en ../WebhookService/ResolveFlowTriggerService; aquí solo queda la
  // ejecución, que sí es del canal.
  const trigger = await resolveFlowTrigger(ticket, getSession, contact, message.text, isFirstMsg);
  if (!trigger) return;

  console.log(`[FlowBuilder-FB] Prioridad ${trigger.prioridad}: ${trigger.motivo}`);
  await ActionsWebhookFacebookService(
    getSession,
    trigger.flowId,
    ticket.companyId,
    trigger.nodes,
    trigger.connections,
    trigger.startNodeId,
    null,
    "",
    "",
    trigger.bodyArg,
    ticket.id,
    trigger.contactData
  );
}

export const handleMessage = async (
  token: Whatsapp,
  webhookEvent: any,
  channel: string,
  companyId: any
): Promise<any> => {
  try {
    if (webhookEvent.message) {
      let msgContact: any;

      const senderPsid = webhookEvent.sender.id;
      const recipientPsid = webhookEvent.recipient.id;
      const { message } = webhookEvent;
      const fromMe = message.is_echo;

      const bodyMessage = message.text;
  if (channel === "facebook") {
    try {
      if (fromMe) {
        if (/\u200e/.test(bodyMessage)) return;
        msgContact = await profilePsid(senderPsid, token.facebookUserToken, 'inbox');
      } else {
        msgContact = await profilePsid(recipientPsid, token.facebookUserToken, 'inbox');
      }
    } catch (err) {
      const fallbackId = fromMe ? senderPsid : recipientPsid;
      msgContact = {
        id: fallbackId,
        name: fallbackId,
        profile_pic: null
      };
      console.warn(`⚠️ Error obteniendo perfil FB (token expirado?), usando ID como nombre: ${fallbackId}`);
    }
    }

    if (channel === "instagram") {
      const entryId = token.facebookPageUserId;
    //  //console.log('entryId', entryId, 'senderPsid', senderPsid);
    
      try {
        // Intenta obtener perfil IG (solo funcionará para tu canal o si tienes permisos avanzados)
        msgContact = await getInstagramUserProfile(senderPsid, token.facebookUserToken);
      } catch (err) {
        // Si falla, crea el contacto con lo mínimo posible
        msgContact = {
          id: recipientPsid,
          name: recipientPsid,
          profile_pic: null,
         
        };
      }
    }
   // //console.log('contacto creado', msgContact);
      // 3. Verificación/creación del contacto en tu BD
      const contact = await verifyContact(msgContact, token, companyId);
   //   //console.log('contacto creado', contact);

      const unreadCount = fromMe ? 0 : 1;

      const getSession = await Whatsapp.findOne({
        where: {
          facebookPageUserId: token.facebookPageUserId
        },
        include: [
          {
            model: Queue,
            as: "queues",
            attributes: ["id", "name", "color", "greetingMessage"],
            include: [
              {
                model: Chatbot,
                as: "chatbots",
                attributes: ["id", "name", "greetingMessage"]
              }
            ]
          }
        ],
        order: [
          ["queues", "id", "ASC"],
          ["queues", "chatbots", "id", "ASC"]
        ]
      });

      const settings = await CompaniesSettings.findOne({
        where: { companyId }
      }
      )

      const isFirstMsg = await Ticket.findOne({
        where: {
          contactId: contact.id,
          companyId,
          whatsappId: getSession.id
        },
        order: [["id", "DESC"]]
      });

      const mutex = new Mutex();
      const ticket = await mutex.runExclusive(async () => {
        const createTicket = await FindOrCreateTicketService(
          contact,
          getSession,
          unreadCount,
          companyId,
          0,
          0,
          null,
          channel,
          null,
          false,
          settings
        )
        return createTicket;
      });
    //  //console.log('ticket creado:',ticket, 'canal:',ticket.channel)

      let bodyRollbackTag = "";
      let bodyNextTag = "";
      let rollbackTag;
      let nextTag;
      let ticketTag = undefined;
      // //console.log(ticket.id)
      if (ticket?.company?.plan?.useKanban) {
        ticketTag = await TicketTag.findOne({
          where: {
            ticketId: ticket.id
          }
        })

        if (ticketTag) {
          const tag = await Tag.findByPk(ticketTag.tagId)

          if (tag.nextLaneId) {
            nextTag = await Tag.findByPk(tag.nextLaneId);

            bodyNextTag = nextTag.greetingMessageLane;
          }
          if (tag.rollbackLaneId) {
            rollbackTag = await Tag.findByPk(tag.rollbackLaneId);

            bodyRollbackTag = rollbackTag.greetingMessageLane;
          }
        }
      }

      const ticketTraking = await FindOrCreateATicketTrakingService({
        ticketId: ticket.id,
        companyId,
        whatsappId: getSession?.id,
        userId: ticket.userId
      });

      if (
        (getSession.farewellMessage &&
          formatBody(getSession.farewellMessage, ticket) === message.text) ||
        (getSession.ratingMessage &&
          formatBody(getSession.ratingMessage, ticket) === message.text)
      )
        return;

      if (rollbackTag && formatBody(bodyNextTag, ticket) !== bodyMessage && formatBody(bodyRollbackTag, ticket) !== bodyMessage) {
        await TicketTag.destroy({ where: { ticketId: ticket.id, tagId: ticketTag.tagId } });
        await TicketTag.create({ ticketId: ticket.id, tagId: rollbackTag.id });
      }

      await ticket.update({
        lastMessage: message.text
      });

      try {
        if (!fromMe) {
          /**
           * Tratamento para avaliação do atendente
           */
          if (ticket.status === "nps" && ticketTraking !== null && verifyRating(ticketTraking)) {

            if (!isNaN(parseFloat(bodyMessage))) {

              handleRating(parseFloat(bodyMessage), ticket, ticketTraking);

              await ticketTraking.update({
                ratingAt: moment().toDate(),
                finishedAt: moment().toDate(),
                rated: true
              });

              return;
            } else {

              if (ticket.amountUsedBotQueuesNPS < getSession.maxUseBotQueuesNPS) {
                const bodyErrorRating = `\u200eOpção inválida, tente novamente.\n`;
                const sentMessage = await sendText(
                  contact.number,
                  bodyErrorRating,
                  getSession.facebookUserToken
                );
                await verifyMessageFace(sentMessage, bodyErrorRating, ticket, contact);


                // await delay(1000);

                const bodyRatingMessage = `\u200e${getSession.ratingMessage}\n`;

                const msg = await sendText(contact.number, bodyRatingMessage, getSession.facebookUserToken);
                await verifyMessageFace(sentMessage, bodyRatingMessage, ticket, contact);

                await ticket.update({
                  amountUsedBotQueuesNPS: ticket.amountUsedBotQueuesNPS + 1
                })
              }
              return;
            }

          }

          const enableLGPD = settings.enableLGPD === "enabled";

          //TRATAMENTO LGPD
          if (enableLGPD && ticket.status === "lgpd") {
            if (isNil(ticket.lgpdAcceptedAt) && !isNil(ticket.lgpdSendMessageAt)) {
              let choosenOption: number | null = null;

              if (!isNaN(parseFloat(bodyMessage))) {
                choosenOption = parseFloat(bodyMessage);
              }

              //Se digitou opção numérica
              if (!Number.isNaN(choosenOption) && Number.isInteger(choosenOption) && !isNull(choosenOption) && choosenOption > 0) {
                //Se digitou 1, aceitou o termo e vai pro bot
                if (choosenOption === 1) {
                  await contact.update({
                    lgpdAcceptedAt: moment().toDate(),
                  });
                  await ticket.update({
                    lgpdAcceptedAt: moment().toDate(),
                    amountUsedBotQueues: 0
                  });
                  //Se digitou 2, recusou o bot e encerra chamado
                } else if (choosenOption === 2) {

                  if (getSession.complationMessage !== "" && getSession.complationMessage !== undefined) {

                    const sentMessage = await sendText(
                      contact.number,
                      `\u200e${getSession.complationMessage}`,
                      getSession.facebookUserToken
                    );
                    await verifyMessageFace(sentMessage, `\u200e${getSession.complationMessage}`, ticket, contact);
                  }

                  await ticket.update({
                    status: "closed",
                    amountUsedBotQueues: 0
                  })

                  await ticketTraking.destroy;

                  return
                  //se digitou qualquer opção que não seja 1 ou 2 limpa o lgpdSendMessageAt para 
                  //enviar de novo o bot respeitando o numero máximo de vezes que o bot é pra ser enviado
                } else {
                  if (ticket.amountUsedBotQueues < getSession.maxUseBotQueues) {
                    await ticket.update(
                      {
                        amountUsedBotQueues: ticket.amountUsedBotQueues + 1
                        , lgpdSendMessageAt: null
                      });
                  }
                }
                //se digitou qualquer opção que não número o lgpdSendMessageAt para 
                //enviar de novo o bot respeitando o numero máximo de vezes que o bot é pra ser enviado
              } else {
                if (ticket.amountUsedBotQueues < getSession.maxUseBotQueues) {
                  await ticket.update(
                    {
                      amountUsedBotQueues: ticket.amountUsedBotQueues + 1
                      , lgpdSendMessageAt: null
                    });
                }
              }
            }

            if ((contact.lgpdAcceptedAt === null || settings?.lgpdConsent === "enabled") &&
              !contact.isGroup && isNil(ticket.lgpdSendMessageAt) &&
              ticket.amountUsedBotQueues <= getSession.maxUseBotQueues && !isNil(settings?.lgpdMessage)
            ) {
              if (message.attachments) {
                await verifyMessageMedia(message, ticket, contact);
              } else {
                await verifyMessageFace(message, message.text, ticket, contact);
              }

              if (!isNil(settings?.lgpdMessage) && settings.lgpdMessage !== "") {
                const bodyMessageLGPD = formatBody(`\u200e${settings.lgpdMessage}`, ticket);

                const sentMessage = await sendText(
                  contact.number,
                  bodyMessageLGPD,
                  getSession.facebookUserToken
                );
                await verifyMessageFace(sentMessage, bodyMessageLGPD, ticket, contact);

              }
              // await delay(1000);

              if (!isNil(settings?.lgpdLink) && settings?.lgpdLink !== "") {
                const bodyLink = formatBody(`\u200e${settings.lgpdLink}`, ticket);
                const sentMessage = await sendText(
                  contact.number,
                  bodyLink,
                  getSession.facebookUserToken
                );
                await verifyMessageFace(sentMessage, bodyLink, ticket, contact);
              }

              // await delay(1000);

              const bodyBot = formatBody(
                `\u200eEstou ciente sobre o tratamento dos meus dados pessoais. \n\n[1] Sim\n[2] Não`,
                ticket
              );

              const sentMessageBot = await sendText(
                contact.number,
                bodyBot,
                getSession.facebookUserToken
              );
              await verifyMessageFace(sentMessageBot, bodyBot, ticket, contact);

              await ticket.update({
                lgpdSendMessageAt: moment().toDate(),
                amountUsedBotQueues: ticket.amountUsedBotQueues + 1
              });

              await ticket.reload();

              return;

            }

            if (!isNil(ticket.lgpdSendMessageAt) && isNil(ticket.lgpdAcceptedAt))
              return
          }
        }
      } catch (e) {
        throw new Error(e);
      }
     // //console.log('verifyMessageFace11', message)
      if (message.attachments) {
        await verifyMessageMedia(message, ticket, contact);
      } else {
        await verifyMessageFace(message, message.text, ticket, contact);
      }

      // ================= Detectar mensaje de campaña publicitaria =================
      const referral = webhookEvent.referral || message.referral;
      if (referral && !fromMe) {
        console.log(`[CampaignMessage] Detectado mensaje de campaña en ${channel}`);
        console.log(`[CampaignMessage] Referral data:`, JSON.stringify(referral, null, 2));

        // Buscar el mensaje recién creado para obtener su ID
        const lastMessage = await Message.findOne({
          where: {
            wid: message.mid || message.message_id,
            companyId
          },
          order: [["createdAt", "DESC"]]
        });

        await CreateCampaignMessageService({
          data: {
            companyId,
            contactId: contact.id,
            messageId: lastMessage?.id,
            ticketId: ticket.id,
            whatsappId: token.id,
            sourceId: referral.ad_id || referral.ref || referral.source_id,
            sourceType: referral.source || referral.type || "AD",
            sourceUrl: referral.source_url,
            headline: referral.headline,
            body: referral.body,
            ctwaClid: referral.ctwa_clid,
            channel: channel,
            rawData: referral
          }
        });
      }
      // ================= Fin detección de campaña =================

      const flow = await FlowBuilderModel.findOne({
        where: { id: ticket.flowStopped, active: true }
      });

      let isMenu = false;
      if (flow) {
        isMenu = flow.flow["nodes"].find((node: any) => node.id === ticket.lastFlowId)?.type === "menu";
      }
    // ================= IA Social (FB/IG) =================
const isEcho = Boolean(
  message?.is_echo // Graph marca eco en los mensajes enviados por la página/cuenta
);


const isSocial = channel.includes("facebook") || channel.includes("instagram") || channel.includes("telegram");

// Texto normalizado (solo texto; si hay adjuntos, no disparamos IA)
const textBody =
  typeof message?.text === "string"
    ? message.text
    : (message?.message ?? message?.body ?? "");

// ¿Hay adjuntos?
const hasMedia =
  Array.isArray(message?.attachments) && message.attachments.length > 0;

// Nombre del contacto para clasificador
const contactName = contact?.name || "Cliente";

  /* COMENTADO: IA Legacy (OpenAI Social) - Reemplazado por SupervisorAI
  // Dispara IA únicamente cuando aplica
  if (
    !ticket.queue &&            // no está en una cola específica
    !ticket.userId &&           // no está asignado a un agente
    !contact?.disableBot &&     // el contacto no bloquea bot
    !isEcho &&                  // evitamos eco
    isSocial &&                 // solo FB/IG
    !hasMedia &&                // sin adjuntos (solo texto)
    textBody.trim()             // hay texto
  ) {
    // Config activa de OpenAI

      const promptId = getSession?.promptId;


        const openAiSettings = await Prompt.findOne({ where: { id: promptId } });


      // Fallback: si no hay promptId o no encontró, busca por empresa/cola


      if (!openAiSettings?.apiKey || !openAiSettings?.prompt) {
      } else {
        // //console.log("OpenAI listo:", {
        //   companyId: ticket.companyId,
        //   queueId: ticket.queueId,
        //   key: openAiSettings.apiKey
        // });
      }

    if (openAiSettings?.apiKey && openAiSettings?.prompt) {
      const ticketTraking = await FindOrCreateATicketTrakingService({
        ticketId: ticket.id,
        companyId,
        whatsappId: getSession?.id,
        userId: ticket.userId
      });

      // Respuesta IA (texto → texto) sin wbot
      await handleOpenAiSocial(
        openAiSettings,   // IOpenAi
        ticket,
        contact,
        textBody.trim(),  // texto entrante
        undefined,        // mediaSent
        ticketTraking
      );

      // Clasificar etapa del cliente (corrige variables)
      try {
        await agregarAColaDeClasificacion({
          texto: textBody.trim(),
          ticketId: ticket.id,
          contactName,
          companyId: ticket.companyId,
          apiKey: openAiSettings.apiKey
        });
      } catch (err) {
        console.warn("Clasificación falló:", err);
      }


            await agregarAColaDeClasificacion({
              texto: textBody.trim(),
              ticketId: ticket.id,
              contactName,
              companyId,
              apiKey: openAiSettings?.apiKey
            });

            // //console.log("AI Social OK", {
            //   companyId: ticket.companyId,
            //   queueId: ticket.queueId
            // });
          } else {
          }
        }



        // //console.log({ ticket })
  */

        // FlowBuilder o SupervisorAI

      if (
        !ticket.fromMe &&
        isMenu &&
        !isNaN(message.text)
      ) {

        await ticket.update({
          queueId: ticket.queueId ? ticket.queueId : null,
        });

        await flowBuilderQueue(ticket, message, getSession, companyId, contact, isFirstMsg)
      }



      if (
        !ticket.imported &&
        !fromMe &&
        !ticket.isGroup &&
        !ticket.queue &&
        !ticket.user &&
        !isMenu &&
        (!ticket.dataWebhook || ticket.dataWebhook["status"] === "stopped") &&
        // ticket.isBot &&
        !isNil(getSession.integrationId) &&
        !ticket.useIntegration
      ) {

        // ═══════════════════════════════════════════════════════════════
        // NUEVA LÓGICA: Solo SupervisorAI (promptId=999) o FlowBuilder (integrationId)
        // ═══════════════════════════════════════════════════════════════

        // 1. SUPERVISOR AI: Si promptId === 999 → ejecutar orquestador
        const hasSupervisorAI = getSession.useAIOrchestrator === true;

        if (hasSupervisorAI) {
          console.log(`[DEBUG-SUPERVISOR-FB] Ejecutando SupervisorAI - promptId: ${getSession.promptId}`);

          // ✅ CONDICIONES PARA NO RESPONDER
          // Lógica: isBot=true es "override" - si está en true, el bot siempre responde

          // 1. Si está desactivado manualmente (isBot = false)
          if (ticket.isBot === false) {
            logger.info(`[SupervisorAI-FB] Ticket ${ticket.id} tiene isBot=false (desactivado manualmente) - no responde`);
            return;
          }

          const isBotActivo = ticket.isBot === true;

          // 2. Si tiene usuario asignado Y el bot NO está activo manualmente
          if (ticket.userId && !isBotActivo) {
            logger.info(`[SupervisorAI-FB] Ticket ${ticket.id} tiene usuario asignado - no responde`);
            return;
          }
          // 3. Si está abierto Y el bot NO está activo manualmente
          if (ticket.status === 'open' && !isBotActivo) {
            logger.info(`[SupervisorAI-FB] Ticket ${ticket.id} está en estado open - no responde`);
            return;
          }
          // 4. Si está cerrado
          if (ticket.status === 'closed') {
            logger.info(`[SupervisorAI-FB] Ticket ${ticket.id} está cerrado - no responde`);
            return;
          }

          // ═══════════════════════════════════════════════════════════════
          // 🤖 ORQUESTADOR IA MULTI-AGENTE — SupervisorService (Facebook)
          // ═══════════════════════════════════════════════════════════════
          try {
            const body = message.message?.text || "";
            if (!body || body.trim().length === 0) return;

            const SupervisorService = (await import("../AIAgentServices/SupervisorService")).default; // fix 2026-07-10: await import (ESM) evita whatsapp-rust-bridge
            const SupervisorActionsService = (await import("../AIAgentServices/SupervisorActionsService")).default; // fix 2026-07-10: idem

            // Cargar historial del ticket
            const Message = require("../../models/Message").default;
            const recentMessages = await Message.findAll({
              where: { ticketId: ticket.id },
              order: [["createdAt", "DESC"]],
              limit: 20
            });
            const ticketHistory = recentMessages.reverse().map((m: any) => ({
              role: m.fromMe ? "assistant" : "user",
              content: m.body || ""
            }));

            logger.info(
              `[SupervisorAI-FB] Procesando msg empresa=${companyId} ticket=${ticket.id}: "${body.substring(0, 60)}..."`
            );

            const aiResponse = await SupervisorService.processMessage({
              message: body,
              companyId,
              ticketId: ticket.id,
              contactId: contact?.id,
              whatsappId: getSession?.id,
              ticketHistory
            });

            if (aiResponse.shouldEscalate) {
              await SupervisorActionsService.saveAgentMessage({
                ticketId: ticket.id,
                companyId,
                content: aiResponse.message,
                agentUsed: aiResponse.agentUsed,
                intent: aiResponse.intent,
                confidence: aiResponse.confidence
              });

              await SupervisorActionsService.escalateToHuman(
                ticket.id,
                companyId,
                getSession?.id,
                aiResponse.escalationReason
              );

              // Enviar mensaje de escalación
              await sendText(contact.number, "Te comunicamos con un asesor humano. En breve te atenderán. 🙋‍♂️", getSession.facebookUserToken);
            } else {
              await SupervisorActionsService.saveAgentMessage({
                ticketId: ticket.id,
                companyId,
                contactId: contact?.id,
                content: aiResponse.message,
                agentUsed: aiResponse.agentUsed,
                intent: aiResponse.intent,
                confidence: aiResponse.confidence,
                tokensUsed: aiResponse.totalTokens,
                latencyMs: aiResponse.totalLatencyMs,
                shouldCreateAIAgentLog: true
              });

              logger.info(`[SupervisorAI-FB] Enviando respuesta: "${aiResponse.message.substring(0, 50)}..."`);

              await sendText(contact.number, aiResponse.message, getSession.facebookUserToken);
              try {
                await SupervisorActionsService.classifyTicketStageAfterReplySent(
                  ticket.id,
                  companyId,
                  aiResponse.intent,
                  aiResponse.agentUsed,
                  { conversionSource: "orchestrator_reply_sent_facebook" }
                );
              } catch (stageError: any) {
                logger.warn(`[SupervisorAI-FB] Error clasificando Kanban post-envio: ${stageError.message}`);
              }
              try {
                const ZepMemoryService = require("../AIAgentServices/ZepMemoryService").default;
                ZepMemoryService.addConversationTurnAsync({
                  companyId,
                  ticketId: ticket.id,
                  contactId: contact?.id,
                  contactName: contact?.name,
                  contactEmail: contact?.email,
                  channel: "facebook",
                  userMessage: body,
                  assistantMessage: aiResponse.message,
                  agentUsed: aiResponse.agentUsed,
                  intent: aiResponse.intent
                });
              } catch (zepError: any) {
                logger.warn(`[SupervisorAI-FB] Zep post-envio omitido: ${zepError.message}`);
              }
            }

            if (ticket.aiStatus !== 'active') {
              await ticket.update({ aiStatus: 'active' });
            }

            logger.info(`[SupervisorAI-FB] ✅ Completado: agente=${aiResponse.agentUsed}, intent=${aiResponse.intent}`);
            return;
          } catch (err: any) {
            logger.error(`[SupervisorAI-FB] ❌ Error: ${err.message}`);
            await sendText(contact.number, "Disculpa, estoy teniendo dificultades técnicas. Un asesor te atenderá pronto. 🙏", getSession.facebookUserToken);
            await ticket.update({ aiStatus: 'handoff', status: "pending" });
          }
        }

        // 2. FLOWBUILDER: Si tiene integrationId → ejecutar flujo
        const integrations = await ShowQueueIntegrationService(getSession.integrationId, companyId);

        if (integrations?.type === "flowbuilder") {

          // 1. Si está desactivado manualmente (isBot = false)
          if (ticket.isBot === false) {
            logger.info(`[SupervisorAI-FB] Ticket ${ticket.id} tiene isBot=false (desactivado manualmente) - no responde`);
            return;
          }

          const isBotActivo = ticket.isBot === true;

          // 2. Si tiene usuario asignado Y el bot NO está activo manualmente
          if (ticket.userId && !isBotActivo) {
            logger.info(`[SupervisorAI-FB] Ticket ${ticket.id} tiene usuario asignado - no responde`);
            return;
          }
          // 3. Si está abierto Y el bot NO está activo manualmente
          if (ticket.status === 'open' && !isBotActivo) {
            logger.info(`[SupervisorAI-FB] Ticket ${ticket.id} está en estado open - no responde`);
            return;
          }
          // 4. Si está cerrado
          if (ticket.status === 'closed') {
            logger.info(`[SupervisorAI-FB] Ticket ${ticket.id} está cerrado - no responde`);
            return;
          }

          // ═══════════════════════════════════════════════════════════════
          // 🤖 ORQUESTADOR IA MULTI-AGENTE — SupervisorService (Facebook)
          // ═══════════════════════════════════════════════════════════════
          try {
            const body = message.message?.text || "";
            if (!body || body.trim().length === 0) return;

            const SupervisorService = (await import("../AIAgentServices/SupervisorService")).default; // fix 2026-07-10: await import (ESM) evita whatsapp-rust-bridge
            const SupervisorActionsService = (await import("../AIAgentServices/SupervisorActionsService")).default; // fix 2026-07-10: idem

            // Cargar historial del ticket
            const Message = require("../../models/Message").default;
            const recentMessages = await Message.findAll({
              where: { ticketId: ticket.id },
              order: [["createdAt", "DESC"]],
              limit: 20
            });
            const ticketHistory = recentMessages.reverse().map((m: any) => ({
              role: m.fromMe ? "assistant" : "user",
              content: m.body || ""
            }));

            logger.info(
              `[SupervisorAI-FB] Procesando msg empresa=${companyId} ticket=${ticket.id}: "${body.substring(0, 60)}..."`
            );

            const aiResponse = await SupervisorService.processMessage({
              message: body,
              companyId,
              ticketId: ticket.id,
              contactId: contact?.id,
              whatsappId: undefined, // Facebook no tiene whatsappId
              ticketHistory
            });

            if (aiResponse.shouldEscalate) {
              await SupervisorActionsService.saveAgentMessage({
                ticketId: ticket.id,
                companyId,
                content: aiResponse.message,
                agentUsed: aiResponse.agentUsed,
                intent: aiResponse.intent,
                confidence: aiResponse.confidence
              });

              await SupervisorActionsService.escalateToHuman(
                ticket.id,
                companyId,
                undefined,
                aiResponse.escalationReason
              );

              // Enviar mensaje de escalada
              await sendText(message.sender.id, "Te comunicamos con un asesor humano. En breve te atenderán. 🙋‍♂️", getSession.facebookUserToken);
            } else {
              await SupervisorActionsService.saveAgentMessage({
                ticketId: ticket.id,
                companyId,
                contactId: contact?.id,
                content: aiResponse.message,
                agentUsed: aiResponse.agentUsed,
                intent: aiResponse.intent,
                confidence: aiResponse.confidence,
                tokensUsed: aiResponse.totalTokens,
                latencyMs: aiResponse.totalLatencyMs,
                shouldCreateAIAgentLog: true
              });

              await sendText(message.sender.id, aiResponse.message, getSession.facebookUserToken);
              try {
                await SupervisorActionsService.classifyTicketStageAfterReplySent(
                  ticket.id,
                  companyId,
                  aiResponse.intent,
                  aiResponse.agentUsed,
                  { conversionSource: "orchestrator_reply_sent_facebook" }
                );
              } catch (stageError: any) {
                logger.warn(`[SupervisorAI-FB] Error clasificando Kanban post-envio: ${stageError.message}`);
              }
              try {
                const ZepMemoryService = require("../AIAgentServices/ZepMemoryService").default;
                ZepMemoryService.addConversationTurnAsync({
                  companyId,
                  ticketId: ticket.id,
                  contactId: contact?.id,
                  contactName: contact?.name,
                  contactEmail: contact?.email,
                  channel: "facebook",
                  userMessage: body,
                  assistantMessage: aiResponse.message,
                  agentUsed: aiResponse.agentUsed,
                  intent: aiResponse.intent
                });
              } catch (zepError: any) {
                logger.warn(`[SupervisorAI-FB] Zep post-envio omitido: ${zepError.message}`);
              }
            }

            if (!ticket.useIntegration) {
              await ticket.update({ useIntegration: true, integrationId: integrations.id });
            }

            logger.info(`[SupervisorAI-FB] Completado: ticket=${ticket.id}, agente=${aiResponse.agentUsed}`);
          } catch (err: any) {
            logger.error(`[SupervisorAI-FB] Error: ${err.message}`);
            await sendText(message.sender.id, "Disculpa, estoy teniendo dificultades técnicas. Un asesor te atenderá pronto. 🙏", getSession.facebookUserToken);
            await ticket.update({ useIntegration: false, status: "pending" });
          }
          return;
        }

      }




      if (
        !ticket.queue &&
        !fromMe &&
        !ticket.userId &&
        getSession.queues.length >= 1
      ) {
        await verifyQueue(getSession, message, ticket, contact);
      }

      if (ticket.queue && ticket.queueId) {
        if (!ticket.user) {
          await sayChatbot(
            ticket.queueId,
            getSession,
            ticket,
            contact,
            message
          );
        }
      }

    }

    return;
  } catch (error) {
    throw new Error(error);
  }
};

const verifyQueue = async (
  getSession: Whatsapp,
  msg: any,
  ticket: Ticket,
  contact: Contact
) => {
  // //console.log("VERIFYING QUEUE", ticket.whatsappId, getSession.id)
  const { queues, greetingMessage } = await ShowWhatsAppService(getSession.id!, ticket.companyId);



  if (queues.length === 1) {
    const firstQueue = head(queues);
    let chatbot = false;
    if (firstQueue?.chatbots) {
      chatbot = firstQueue?.chatbots?.length > 0;
    }
    await UpdateTicketService({
      ticketData: { queueId: queues[0].id, isBot: chatbot },
      ticketId: ticket.id,
      companyId: ticket.companyId
    });

    return;
  }

  let selectedOption = "";

  if (ticket.status !== "lgpd") {
    selectedOption = msg.text;
  } else {
    if (!isNil(ticket.lgpdAcceptedAt))
      await ticket.update({
        status: "pending"
      });

    await ticket.reload();
  }

  const choosenQueue = queues[+selectedOption - 1];

  if (choosenQueue) {

    await UpdateTicketService({
      ticketData: { queueId: choosenQueue.id },
      ticketId: ticket.id,
      companyId: ticket.companyId
    });


    if (choosenQueue.chatbots.length > 0) {
      let options = "";
      choosenQueue.chatbots.forEach((chatbot, index) => {
        options += `[${index + 1}] - ${chatbot.name}\n`;
      });

      const body =
        `${choosenQueue.greetingMessage}\n\n${options}\n[#] Voltar para o menu principal`;

      const sentMessage = await sendFacebookMessage({
        ticket,
        body: body
      })

      // const debouncedSentChatbot = debounce(
      //   async () => {
      //     await sendText(
      //   contact.number,
      //   formatBody(body, ticket),
      //   ticket.whatsapp.facebookUserToken
      // );
      //   },
      //   3000,
      //   ticket.id
      // );
      // debouncedSentChatbot();

      // return await verifyMessage(msg, body, ticket, contact);
    }

    if (!choosenQueue.chatbots.length) {
      const body = `${choosenQueue.greetingMessage}`;

      const sentMessage = await sendFacebookMessage({
        ticket,
        body: body
      })
      // const debouncedSentChatbot = debounce(
      //   async () => { await sendText(
      //   contact.number,
      //   formatBody(body, ticket),
      //   ticket.whatsapp.facebookUserToken
      // );

      //   },
      //   3000,
      //   ticket.id
      // );
      // debouncedSentChatbot();
      // return await verifyMessage(msg, body, ticket, contact);
    }
  } else {
    let options = "";

    queues.forEach((queue, index) => {
      options += `[${index + 1}] - ${queue.name}\n`;
    });

    const body = `${greetingMessage}\n\n${options}`;

    const sentMessage = await sendFacebookMessage({
      ticket,
      body: body
    })
    // const debouncedSentChatbot = debounce(
    //   async () => { await 
    //     sendText(
    //       contact.number,
    //       formatBody(body, ticket),
    //       ticket.whatsapp.facebookUserToken
    //     );
    //   },
    //   3000,
    //   ticket.id
    // );
    // debouncedSentChatbot();

    // return verifyMessage(msg, body, ticket, contact);



  }
};
