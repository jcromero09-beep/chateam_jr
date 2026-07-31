import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

import path, { join } from "path";
import { writeFile } from "fs/promises";
import { readFile } from "fs";
import fs from "fs";
import * as Sentry from "@sentry/node";
import lodash from "lodash";
const { isNil, isNull } = lodash;
import { REDIS_URI_MSG_CONN } from "../../config/redis";
import axios from "axios";
import { sendText as metaSendText  } from "../MetaServices/metaSendService";
import {
  downloadMediaMessage,
  GroupMetadata,
  jidNormalizedUser,
  isJidGroup,
  delay,
  MediaType,
  MessageUpsertType,
  aesDecryptGCM,
  hkdf,
  proto,
  WAMessage,
  WAMessageStubType,
  WAMessageUpdate,
  WASocket,
  downloadContentFromMessage,
  AnyMessageContent,
  generateWAMessageContent,
  generateWAMessageFromContent
} from "baileys";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import { Mutex } from "async-mutex";
import { getIO } from "../../libs/socket";
import CreateMessageService from "../MessageServices/CreateMessageService";
import logger, { logError, logInfo, logWarn, logDebug } from "../../utils/logger";
import { normalizeSupervisorAIText } from "../AIAgentServices/AIInputGuardService";
// FASE 1 Coexistencia — trazabilidad estructurada
import {
  runWithTrace,
  generateTraceId,
  updateTraceContext
} from "../../utils/traceContext";
import {
  logInbound as coexLogInbound,
  logCoexError as coexLogError
} from "../../utils/coexistenceLogger";
// FASE 2 Coexistencia — dedupe vía InboundEventLedger
import InboundEventLedgerService from "../CoexistenceServices/InboundEventLedgerService";
// FASE 3 Coexistencia — identidad unificada de conversación
import ConversationResolverService from "../CoexistenceServices/ConversationResolverService";
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import { debounce } from "../../helpers/Debounce";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import formatBody from "../../helpers/Mustache";
import TicketTraking from "../../models/TicketTraking";
import UserRating from "../../models/UserRating";
import SendWhatsAppMessage from "./SendWhatsAppMessage";
import sendFaceMessage from "../FacebookServices/sendFacebookMessage";
import moment from "moment";
import Queue from "../../models/Queue";
import FindOrCreateATicketTrakingService from "../TicketServices/FindOrCreateATicketTrakingService";
import VerifyCurrentSchedule from "../CompanyService/VerifyCurrentSchedule";
import Campaign from "../../models/Campaign";
import CampaignShipping from "../../models/CampaignShipping";
import CampaignMessage from "../../models/CampaignMessage";
import { Op } from "sequelize";
import { campaignQueue, parseToMilliseconds, randomValue } from "../../queues";
import User from "../../models/User";
import { sayChatbot } from "./ChatBotListener";
import MarkDeleteWhatsAppMessage from "./MarkDeleteWhatsAppMessage";
import ListUserQueueServices from "../UserQueueServices/ListUserQueueServices";
import cacheLayer from "../../libs/cache";
import { addLogs } from "../../helpers/addLogs";
import SendWhatsAppMedia, { getMessageOptions } from "./SendWhatsAppMedia";
// Tier 0 (2026-07-17): parsers puros extraídos a ./wbotMessageParsers. El monolito los usa
// internamente (import) y los re-exporta como fachada (Regla #0) para no migrar consumidores.
import { getQuotedMessage, getQuotedMessageId, getTypeMessage, getBodyMessage, getTimestampMessage, findCaption } from "./wbotMessageParsers";
import { getEditProtocolMessage, unpackEditedMessage, extractEditedBody, extractEditedOriginalWid, extractEditedRemoteJids, extractEditedTimestamp } from "./wbotMessageParsers";
import { resolveUnreadCount, messageHasMedia, resolveMetaCoexistence, persistIncomingMessage, createOrFindTicket, resolveCompanySettings, recordCampaignAttribution, handleFlowBuilderQuestion, mergeMessageDataJson, findMessageEditFallback, applyMessageEdit, sendCollectiveVacationReply, rejectAudioIfNotAccepted, verifyContact, resolveTicketContext, dispatchIntegration } from "./wbotMessageIngest";
import { getContactMessage } from "./wbotContactResolver";
import { verifyRating } from "./wbotRating";
import { verifyQueue } from "./wbotChatbot";
import { normalizeBaileysAck, verifyQuotedMessage, verifyMediaMessage, verifyMessage } from "./wbotMessagePersistence";
import { handleMessageIntegration, sendMessageWithAntiBan } from "./wbotIntegrations";
import {
  isMessageEditPayload,
  isSecretEncryptedEditPayload,
  hasPossibleEditShape,
  logMessageEditProbe,
  logMessageEditFailure,
  handleSecretEncryptedMessageEdit,
  handleMessageEditUpdate
} from "./wbotMessageEdit";
export { getQuotedMessage, getQuotedMessageId, getBodyMessage };
// getTypeMessage se importa SOLO para uso interno (NO se re-exporta) para PRESERVAR el
// comportamiento actual: hoy no está exportado y libs/wbot lo recibe como undefined (bug
// latente anotado en docs/REFACTOR_MONOLITO_WBOT.md, a arreglar por separado si JC confirma).

import ShowQueueIntegrationService from "../QueueIntegrationServices/ShowQueueIntegrationService";
import { createDialogflowSessionWithModel } from "../QueueIntegrationServices/CreateSessionDialogflow";
import { queryDialogFlow } from "../QueueIntegrationServices/QueryDialogflow";
import CompaniesSettings from "../../models/CompaniesSettings";
import CreateLogTicketService from "../TicketServices/CreateLogTicketService";
import Whatsapp from "../../models/Whatsapp";
import QueueIntegrations from "../../models/QueueIntegrations";
import ShowFileService from "../FileServices/ShowService";

import OpenAI from "openai";
import ffmpeg from "fluent-ffmpeg";
import typebotListener from "../TypebotServices/typebotListener";
import Tag from "../../models/Tag";
import TicketTag from "../../models/TicketTag";
import {
  validateAICapability,
  isCapabilityAllowed,
  AICapability
} from "../../helpers/AICapabilitiesValidator";
import pino from "pino";
import BullQueues from "../../libs/queue";
import { Transform } from "stream";
import { msgDB } from "../../libs/wbot";
import {CheckSettings1, CheckCompanySetting} from "../../helpers/CheckSettings";
import { title } from "process";
import { FlowBuilderModel } from "../../models/FlowBuilder";
import { IConnections, INodes } from "../WebhookService/DispatchWebHookService";
import { FlowDefaultModel } from "../../models/FlowDefault";
import { ActionsWebhookService } from "../WebhookService/ActionsWebhookService";
import { WebhookModel } from "../../models/Webhook";
import { add, differenceInMilliseconds } from "date-fns";
import { FlowCampaignModel } from "../../models/FlowCampaign";
import ShowTicketService from "../TicketServices/ShowTicketService";
import { handleOpenAi } from "../IntegrationsServices/OpenAiService";
import { IOpenAi } from "../../@types/openai";
import CreateCampaignMessageService from "../CampaignMessageServices/CreateCampaignMessageService";
import logCampaignMessageFlow from "../CampaignMessageServices/CampaignMessageFlowLogger";
import { serializeConversionData } from "../CampaignMessageServices/CtwaClidResolver";
import { agregarAColaDeClasificacion } from "../IntegrationsServices/clasificarEtapaCliente";
import { antiBanManager } from "../../utils/antiBan"; // 🛡️ Anti-Ban System
const os = require("os");

// [Tier 2] dead code removido: setInterval_i

type Session = WASocket & {
  id?: number;
};

interface ImessageUpsert {
  messages: proto.IWebMessageInfo[];
  type: MessageUpsertType;
}

interface IMe {
  name: string;
  id: string;
}

interface SessionOpenAi extends OpenAI {
  id?: number;
}
const sessionsOpenAi: SessionOpenAi[] = [];

const buildCiphertextDiagnostic = (message: proto.IWebMessageInfo) => {
  const key = message.key as typeof message.key & {
    remoteJidAlt?: string;
    participantAlt?: string;
    addressingMode?: string;
  };
  const remoteJid = key.remoteJid || null;
  const participant = key.participant || null;
  const isGroup = Boolean(remoteJid && isJidGroup(remoteJid));

  return {
    messageId: key.id || null,
    remoteJid,
    remoteJidAlt: key.remoteJidAlt || null,
    participant,
    participantAlt: key.participantAlt || null,
    addressingMode: key.addressingMode || null,
    fromMe: Boolean(key.fromMe),
    isGroup,
    recoveryPolicy: isGroup ? "native-retry-skdm" : "native-retry-pairwise",
    socketInstanceId: (message as any)?.instanceId || null,
    processId: process.pid
  };
};

// [Refactor Ola 5] normalizeBaileysAck movida a ./wbotMessagePersistence (se importa arriba).

// [Tier 2] dead code removido: removeFile

/**
 * 🛡️ SEND MESSAGE WITH ANTI-BAN PROTECTION
 * Wrapper para wbot.sendMessage que aplica automáticamente protección anti-ban
 *
 * @param wbot - Socket de WhatsApp
 * @param jid - JID del destinatario (número@s.whatsapp.net)
 * @param content - Contenido del mensaje
 * @param messageType - Tipo de mensaje (text, media, audio)
 * @returns Promise con el mensaje enviado
 */
// [Refactor Ola 7] sendMessageWithAntiBan movida a ./wbotIntegrations, donde están
// sus 5 llamadas. Se importa arriba y se mantiene en el export de abajo.

// multVecardGet + contactsArrayMessageGet (parsers vCard) -> ./wbotMessageParsers (Tier 0)

// getTypeMessage → extraído a ./wbotMessageParsers (Tier 0). Importado arriba (sin re-export).
// getBodyMessage + helpers -> ./wbotMessageParsers (Tier 0). Importado/re-exportado arriba.

// getQuotedMessage / getQuotedMessageId → extraídos a ./wbotMessageParsers (Tier 0).
// Importados + re-exportados en el bloque de imports (Regla #0 fachada).

// [Refactor Ola 1] getMeSocket/getSenderMessage/getContactMessage (resolución de
// contacto/sender + LID) movidos a ./wbotContactResolver. getContactMessage se
// importa arriba; los otros dos son internos al módulo.


// unpackEditedMessage + getEditProtocolMessage -> ./wbotMessageParsers (Tier 1)

// [Refactor Ola 6] El subsistema de edición de mensajes (12 funciones, 423 L:
// detección del payload, descifrado messageSecret y aplicación de la edición)
// vive ahora en ./wbotMessageEdit. Se importan arriba las 7 que usa el listener.

// const downloadMedia = async (msg: proto.IWebMessageInfo, companyId: number, whatsappId: number) => {
//   const mineType =
//     msg.message?.imageMessage ||
//     msg.message?.audioMessage ||
//     msg.message?.videoMessage ||
//     msg.message?.stickerMessage ||
//     msg.message?.documentMessage ||
//     msg.message?.documentWithCaptionMessage?.message?.documentMessage ||
//     // msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage ||
//     // msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage ||
//     // msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage ||
//     msg.message?.ephemeralMessage?.message?.audioMessage ||
//     msg.message?.ephemeralMessage?.message?.documentMessage ||
//     msg.message?.ephemeralMessage?.message?.videoMessage ||
//     msg.message?.ephemeralMessage?.message?.stickerMessage ||
//     msg.message?.ephemeralMessage?.message?.imageMessage ||
//     msg.message?.viewOnceMessage?.message?.imageMessage ||
//     msg.message?.viewOnceMessage?.message?.videoMessage ||
//     msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message?.imageMessage ||
//     msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message?.videoMessage ||
//     msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message?.audioMessage ||
//     msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message?.documentMessage ||
//     msg.message?.templateMessage?.hydratedTemplate?.imageMessage ||
//     msg.message?.templateMessage?.hydratedTemplate?.documentMessage ||
//     msg.message?.templateMessage?.hydratedTemplate?.videoMessage ||
//     msg.message?.templateMessage?.hydratedFourRowTemplate?.imageMessage ||
//     msg.message?.templateMessage?.hydratedFourRowTemplate?.documentMessage ||
//     msg.message?.templateMessage?.hydratedFourRowTemplate?.videoMessage ||
//     msg.message?.templateMessage?.fourRowTemplate?.imageMessage ||
//     msg.message?.templateMessage?.fourRowTemplate?.documentMessage ||
//     msg.message?.templateMessage?.fourRowTemplate?.videoMessage ||
//     msg.message?.interactiveMessage?.header?.imageMessage ||
//     msg.message?.interactiveMessage?.header?.documentMessage ||
//     msg.message?.interactiveMessage?.header?.videoMessage;

//   // eslint-disable-next-line no-nested-ternary
//   const messageType = msg.message?.documentMessage
//     ? "document"
//     : mineType.mimetype.split("/")[0].replace("application", "document")
//       ? (mineType.mimetype
//         .split("/")[0]
//         .replace("application", "document") as MediaType)
//       : (mineType.mimetype.split("/")[0] as MediaType);

//   let stream: Transform;
//   let contDownload = 0;

//   while (contDownload < 10 && !stream) {
//     try {
//       const { mediaKey, directPath, url } =
//         msg.message?.imageMessage ||
//         msg.message?.audioMessage ||
//         msg.message?.videoMessage ||
//         msg.message?.stickerMessage ||
//         msg.message?.documentMessage ||
//         msg.message?.documentWithCaptionMessage?.message?.documentMessage ||
//         msg.message?.ephemeralMessage?.message?.audioMessage ||
//         msg.message?.ephemeralMessage?.message?.documentMessage ||
//         msg.message?.ephemeralMessage?.message?.videoMessage ||
//         msg.message?.ephemeralMessage?.message?.stickerMessage ||
//         msg.message?.ephemeralMessage?.message?.imageMessage ||
//         msg.message?.viewOnceMessage?.message?.imageMessage ||
//         msg.message?.viewOnceMessage?.message?.videoMessage ||
//         msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message?.imageMessage ||
//         msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message?.videoMessage ||
//         msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message?.audioMessage ||
//         msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message?.documentMessage ||
//         msg.message?.templateMessage?.hydratedTemplate?.imageMessage ||
//         msg.message?.templateMessage?.hydratedTemplate?.documentMessage ||
//         msg.message?.templateMessage?.hydratedTemplate?.videoMessage ||
//         msg.message?.templateMessage?.hydratedFourRowTemplate?.imageMessage ||
//         msg.message?.templateMessage?.hydratedFourRowTemplate?.documentMessage ||
//         msg.message?.templateMessage?.hydratedFourRowTemplate?.videoMessage ||
//         msg.message?.templateMessage?.fourRowTemplate?.imageMessage ||
//         msg.message?.templateMessage?.fourRowTemplate?.documentMessage ||
//         msg.message?.templateMessage?.fourRowTemplate?.videoMessage ||
//         msg.message?.interactiveMessage?.header?.imageMessage ||
//         msg.message?.interactiveMessage?.header?.documentMessage ||
//         msg.message?.interactiveMessage?.header?.videoMessage ||
//         { mediakey: undefined, directPath: undefined, url: undefined };
//       // eslint-disable-next-line no-await-in-loop
//       stream = await downloadContentFromMessage(
//         { mediaKey, directPath, url: directPath ? "" : url },
//         messageType
//       );

//     } catch (error) {
//       contDownload += 1;
//       // eslint-disable-next-line no-await-in-loop, no-loop-func
//       await new Promise(resolve => { setTimeout(resolve, 1000 * contDownload * 2) }
//       );

//       logWarn(
//         `>>>> erro ${contDownload} de baixar o arquivo ${msg?.key.id} companie ${companyId} conexão ${whatsappId}`
//       );

//       if (contDownload === 10) {
//         logWarn(
//           `>>>> erro ao baixar o arquivo ${JSON.stringify(msg)}`
//         );
//       }
//     }
//   }

//   let buffer = Buffer.from([]);
//   try {
//     // eslint-disable-next-line no-restricted-syntax
//     for await (const chunk of stream) {
//       buffer = Buffer.concat([buffer, chunk]);
//     }
//   } catch (error) {
//     return { data: "error", mimetype: "", filename: "" };
//   }

//   if (!buffer) {
//     Sentry.setExtra("ERR_WAPP_DOWNLOAD_MEDIA", { msg });
//     Sentry.captureException(new Error("ERR_WAPP_DOWNLOAD_MEDIA"));
//     throw new Error("ERR_WAPP_DOWNLOAD_MEDIA");
//   }
//   let filename = msg.message?.documentMessage?.fileName || "";

//   if (!filename) {
//     const ext = mineType.mimetype.split("/")[1].split(";")[0];
//     filename = `${new Date().getTime()}.${ext}`;
//   }
//   const media = {
//     data: buffer,
//     mimetype: mineType.mimetype,
//     filename
//   };
//   return media;
// };

// [Refactor Ola 5] La pila de persistencia de mensajes (getUnpackedMessage,
// getMessageMedia, downloadMedia, verifyQuotedMessage, verifyMediaMessage,
// verifyMessage — 508 L) vive ahora en ./wbotMessagePersistence. Se importa
// arriba; las dos públicas se re-exportan aquí porque las consumen por nombre
// ApiController, MessageController y IntegrationsServices/OpenAi/*.
export { verifyMediaMessage, verifyMessage };

const isValidMsg = (msg: proto.IWebMessageInfo): boolean => {
  if (msg.key.remoteJid === "status@broadcast") return false;
  try {
    const msgType = getTypeMessage(msg);
    if (!msgType) {
      return;
    }

    const ifType =
      msgType === "conversation" ||
      msgType === "extendedTextMessage" ||
      msgType === "audioMessage" ||
      msgType === "videoMessage" ||
      msgType === "ptvMessage" ||
      msgType === "imageMessage" ||
      msgType === "documentMessage" ||
      msgType === "stickerMessage" ||
      msgType === "buttonsResponseMessage" ||
      msgType === "buttonsMessage" ||
      msgType === "messageContextInfo" ||
      msgType === "locationMessage" ||
      msgType === "liveLocationMessage" ||
      msgType === "contactMessage" ||
      msgType === "voiceMessage" ||
      msgType === "mediaMessage" ||
      msgType === "contactsArrayMessage" ||
      msgType === "reactionMessage" ||
      msgType === "ephemeralMessage" ||
      msgType === "protocolMessage" ||
      msgType === "listResponseMessage" ||
      msgType === "listMessage" ||
      msgType === "interactiveMessage" ||
      msgType === "pollCreationMessageV3" ||
      msgType === "viewOnceMessage" ||
      msgType === "documentWithCaptionMessage" ||
      msgType === "viewOnceMessageV2" ||
      msgType === "editedMessage" ||
      msgType === "advertisingMessage" ||
      msgType === "highlyStructuredMessage" ||
      msgType === "eventMessage" ||
      msgType === "adMetaPreview"; // Adicionado para tratar mensagens de anúncios

    if (!ifType) {
      logWarn(`#### Nao achou o type em isValidMsg: ${msgType}
${JSON.stringify(msg?.message)}`);
      Sentry.setExtra("Mensagem", { BodyMsg: msg.message, msg, msgType });
      Sentry.captureException(new Error("Nuevo tipo de mensaje en isValidMsg"));
    }

    return !!ifType;
  } catch (error) {
    Sentry.setExtra("Error isValidMsg", { msg });
    Sentry.captureException(error);
  }
};

// [Refactor Ola 7] sendDialogflowAwswer y sendDelayedMessages movidas a
// ./wbotIntegrations: sus únicos usos estaban en handleMessageIntegration.

// [Refactor Ola 5] El chatbot de selección de cola (VerifyQueueCtx + botText +
// botList + botButton + verifyQueue — 1.846 L) vive ahora en ./wbotChatbot. Se
// importa arriba. handleMessageInner lo sigue llamando igual; nadie más lo usa.

// [Refactor Ola 1] verifyRating (predicado puro) movido a ./wbotRating; se importa
// arriba y se re-exporta para los consumidores externos (facebookMessageListener).
export { verifyRating };

export const handleRating = async (
  rate: number,
  ticket: Ticket,
  ticketTraking: TicketTraking
) => {
  const io = getIO();
  const companyId = ticket.companyId;


  // // console.log("GETTING WHATSAPP HANDLE RATING", ticket.whatsappId, ticket.id)
  const { complationMessage } = await ShowWhatsAppService(
    ticket.whatsappId,

    companyId
  );

  let finalRate = rate;

  if (rate < 0) {
    finalRate = 0;
  }
  if (rate > 10) {
    finalRate = 10;
  }

  await UserRating.create({
    ticketId: ticketTraking.ticketId,
    companyId: ticketTraking.companyId,
    userId: ticketTraking.userId,
    rate: finalRate
  });

  if (
    !isNil(complationMessage) &&
    complationMessage !== "" &&
    !ticket.isGroup
  ) {
    const body = formatBody(`\u200e${complationMessage}`, ticket);
    if (ticket.channel === "whatsapp") {
      const msg = await SendWhatsAppMessage({ body, ticket });

      await verifyMessage(msg, ticket, ticket.contact, ticketTraking);
    }

    if (ticket.channel === "meta") {

  const to = ticket.contact.number.replace("+", "");
  await metaSendText(to, formatBody(body, ticket));
    }

    if (["facebook", "instagram"].includes(ticket.channel)) {
      await sendFaceMessage({ body, ticket });
    }
  }

  await ticket.update({
    isBot: false,
    status: "closed",
    amountUsedBotQueuesNPS: 0
  });

  //loga fim de atendimento
  await CreateLogTicketService({
    userId: ticket.userId,
    queueId: ticket.queueId,
    ticketId: ticket.id,
    type: "closed"
  });

  io.of(String(companyId))
    // .to("open")
    .emit(`company-${companyId}-ticket`, {
      action: "delete",
      ticket,
      ticketId: ticket.id
    });

  io.of(String(companyId))
    // .to(ticket.status)
    // .to(ticket.id.toString())
    .emit(`company-${companyId}-ticket`, {
      action: "update",
      ticket,
      ticketId: ticket.id
    });
};

// [Refactor Ola 1] Utilidades de audio/TTS movidas a ./wbotAudioUtils (funciones
// autocontenidas: ffmpeg + Speech SDK). Se re-exportan para no romper a los
// importadores externos (services/IntegrationsServices/OpenAi/send*Response).
export {
  convertTextToSpeechAndSaveToFile,
  keepOnlySpecifiedChars
} from "./wbotAudioUtils";

export const transferQueue = async (
  queueId: number,
  ticket: Ticket,
  contact: Contact
): Promise<void> => {
  await UpdateTicketService({
    ticketData: { queueId: queueId },
    ticketId: ticket.id,
    companyId: ticket.companyId
  });
};

// [Refactor Ola 7] El subsistema de integraciones (flowbuilderIntegration,
// handleMessageIntegration y flowBuilderQueue — 875 L) vive ahora en
// ./wbotIntegrations. handleMessageIntegration se importa arriba y se re-exporta
// abajo porque la consume facebookMessageListener por nombre.







// [Refactor Ola 4] Cuerpo de handleMessage (dentro del callback de runWithTrace)
// extraído a función módulo-nivel. Movimiento VERBATIM: los return; ya estaban
// scopeados al callback, así que su semántica se preserva. handleMessage queda
// como guards + wrapper de trace. Free-vars: msg, wbot, companyId, isImported.










async function handleMessageInner(
  msg: proto.IWebMessageInfo,
  wbot: Session,
  companyId: number,
  isImported: boolean = false
) {

  try {
    const resolved = await resolveTicketContext(msg, wbot, companyId, isImported);
    if (!resolved) return;
    const {
      queueId, userId, bodyMessage, msgType, hasMedia, isGroup,
      whatsapp, contact, unreadMessages, settings, isFirstMsg, ticket
    } = resolved;

    //   id: ticket.id,
    //   status: ticket.status,
    //   contactId: ticket.contactId,
    //   userId: ticket.userId,
    //   queueId: ticket.queueId,
    //   isGroup: ticket.isGroup,
    //   isBot: ticket.isBot
    // });

    const bodyRollbackTag = "";
    const bodyNextTag = "";
    let rollbackTag;
    let nextTag;
    let ticketTag = undefined;
    // // console.log(ticket.id)
    if (ticket?.company?.plan?.useKanban) {
      ticketTag = await TicketTag.findOne({
        where: {
          ticketId: ticket.id
        }
      });

      // if (ticketTag) {
      //   const tag = await Tag.findByPk(ticketTag.tagId);
      //   // console.log("log... 3033");
      //   if (tag.nextLaneId) {
      //     nextTag = await Tag.findByPk(tag.nextLaneId);
      //     // console.log("log... 3036");
      //     bodyNextTag = nextTag.greetingMessageLane;
      //   }
      //   if (tag.rollbackLaneId) {
      //     rollbackTag = await Tag.findByPk(tag.rollbackLaneId);
      //     // console.log("log... 3041");
      //     bodyRollbackTag = rollbackTag.greetingMessageLane;
      //   }
      // }
    }

    if (
      ticket.status === "closed" ||
      (unreadMessages === 0 &&
        whatsapp.complationMessage &&
        formatBody(whatsapp.complationMessage, ticket) === bodyMessage)
    ) {
      return;
    }

    // if (
    //   rollbackTag &&
    //   formatBody(bodyNextTag, ticket) !== bodyMessage &&
    //   formatBody(bodyRollbackTag, ticket) !== bodyMessage
    // ) {
    //   await TicketTag.destroy({
    //     where: { ticketId: ticket.id, tagId: ticketTag.tagId }
    //   });
    //   await TicketTag.create({ ticketId: ticket.id, tagId: rollbackTag.id });
    // }

    if (isImported) {
      await ticket.update({
        queueId: whatsapp.queueIdImportMessages
      });
    }

    // // console.log(msg.message?.editedMessage)
    // // console.log(ticket)
    if (await applyMessageEdit(msg, companyId, ticket, msgType)) {
      return;
    }

    const ticketTraking = await FindOrCreateATicketTrakingService({
      ticketId: ticket.id,
      companyId,
      userId,
      whatsappId: whatsapp?.id
    });

    const useLGPD = false;

    if (await sendCollectiveVacationReply(msg, wbot, ticket, contact, whatsapp, ticketTraking, hasMedia, isGroup)) {
      return;
    }

    let mediaSent = await persistIncomingMessage(msg, ticket, contact, ticketTraking, hasMedia, useLGPD, wbot);

    await recordCampaignAttribution(msg, wbot, companyId, ticket, contact, bodyMessage);

    try {
      if (!msg.key.fromMe) {
       // // console.log("log... 3226");
     //   // console.log("log... 3227", { ticketTraking});
        if (ticketTraking !== null && verifyRating(ticketTraking)) {
          handleRating(parseFloat(bodyMessage), ticket, ticketTraking);
          return;
        }
      }
    } catch (e) {
      Sentry.captureException(e);
    }
    
    // Atualiza o ticket se a ultima mensagem foi enviada por mim, para que possa ser finalizado.
    try {
      await ticket.update({
        fromMe: msg.key.fromMe
      });
    } catch (e) {
      Sentry.captureException(e);
    }

    let currentSchedule;

    if (settings.scheduleType === "company") {
      currentSchedule = await VerifyCurrentSchedule(companyId, 0, 0);
    } else if (settings.scheduleType === "connection") {
      currentSchedule = await VerifyCurrentSchedule(companyId, 0, whatsapp.id);
    }

    try {
      if (
        !msg.key.fromMe &&
        settings.scheduleType &&
        (!ticket.isGroup || whatsapp.groupAsTicket === "enabled") &&
        !["open", "group"].includes(ticket.status)
      ) {
        /**
         * Tratamento para envio de mensagem quando a empresa está fora do expediente
         */
        if (
          (settings.scheduleType === "company" ||
            settings.scheduleType === "connection") &&
          !isNil(currentSchedule) &&
          (!currentSchedule || currentSchedule.inActivity === false)
        ) {
          if (
            whatsapp.maxUseBotQueues &&
            whatsapp.maxUseBotQueues !== 0 &&
            ticket.amountUsedBotQueues >= whatsapp.maxUseBotQueues
          ) {
            // await UpdateTicketService({
            //   ticketData: { queueId: queues[0].id },
            //   ticketId: ticket.id
            // });

            return;
          }

          if (whatsapp.timeUseBotQueues !== "0") {
            if (
              ticket.isOutOfHour === false &&
              ticketTraking.chatbotAt !== null
            ) {
              await ticketTraking.update({
                chatbotAt: null
              });
              await ticket.update({
                amountUsedBotQueues: 0
              });
            }

            //Regra para desabilitar o chatbot por x minutos/horas após o primeiro envio
            const dataLimite = new Date();
            const Agora = new Date();

            if (ticketTraking.chatbotAt !== null) {
              dataLimite.setMinutes(
                ticketTraking.chatbotAt.getMinutes() +
                  Number(whatsapp.timeUseBotQueues)
              );
              if (
                ticketTraking.chatbotAt !== null &&
                Agora < dataLimite &&
                whatsapp.timeUseBotQueues !== "0" &&
                ticket.amountUsedBotQueues !== 0
              ) {
                return;
              }
            }

            await ticketTraking.update({
              chatbotAt: null
            });
          }

          //atualiza o contador de vezes que enviou o bot e que foi enviado fora de hora
          await ticket.update({
            isOutOfHour: true,
            amountUsedBotQueues: ticket.amountUsedBotQueues + 1
          });

          return;
        }
      }
    } catch (e) {
      Sentry.captureException(e);
    }

   

    const { handled: flowQuestionHandled, isMenu } =
      await handleFlowBuilderQuestion(msg, ticket, contact, whatsapp);
    if (flowQuestionHandled) return;

    /* COMENTADO: IA Legacy con Typebot - Reemplazado por SupervisorAI
    if (isOpenai && !isNil(flow) && !ticket.queue) {
      const nodeSelected = flow.flow["nodes"].find(
        (node: any) => node.id === ticket.lastFlowId
      );
      let {
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

      let openAiSettings = {
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

      await handleOpenAi(
        openAiSettings,
        msg,
        wbot,
        ticket,
        contact,
        mediaSent,
        ticketTraking
      );
      const body = getBodyMessage(msg);
      const contactName = contact.name
      await agregarAColaDeClasificacion({
        texto: body,
        ticketId: ticket.id,
        contactName,
        companyId,
        apiKey
      });



      return;
    }
    */

    /* COMENTADO: IA Legacy (OpenAI) - Reemplazado por SupervisorAI
    //openai na conexao
    if (
      !ticket.queue &&
      !isGroup &&
      !msg.key.fromMe &&
      !ticket.userId &&
      !isNil(whatsapp.promptId)
    ) {
      const { prompt } = whatsapp;

      // 🔒 VALIDAR CAPACIDADES ANTES DE PROCESAR
      const msgType = getTypeMessage(msg);
      let requiredCapability: AICapability;

      // Determinar capacidad requerida según tipo de mensaje
      if (msgType === 'audioMessage') {
        requiredCapability = AICapability.SPEECH_TO_TEXT;
      } else if (msgType === 'imageMessage') {
        requiredCapability = AICapability.IMAGE_ANALYSIS;
      } else {
        // Texto, botones, listas, etc.
        requiredCapability = AICapability.TEXT_GENERATION;
      }

      // Validar capacidad
      const isAllowed = await isCapabilityAllowed(
        prompt.id,
        requiredCapability
      );

      if (!isAllowed) {
        // Ignorar silenciosamente (según requisito)
        logInfo(
          `[IA] Capacidad ${requiredCapability} no habilitada para prompt ${prompt.id}. ` +
          `Ignorando mensaje tipo ${getTypeMessage(msg)}.`
        );

        // NO llamar a handleOpenAi, salir del flujo de IA
        // El mensaje seguirá su flujo normal (integraciones, etc.)
        return;
      }

      // ✅ Capacidad validada, proceder con IA
      await handleOpenAi(
        prompt,
        msg,
        wbot,
        ticket,
        contact,
        mediaSent,
        ticketTraking
      );
      const contactName = contact.name
      const body = getBodyMessage(msg);
      await agregarAColaDeClasificacion({
        texto: body,
        ticketId: ticket.id,
        contactName,
        companyId,
        apiKey: prompt.apiKey,
        promptId: prompt.id  // 👈 AGREGAR promptId para stageClassifier
      });
    }
    */



    if (
      await dispatchIntegration(
        msg, wbot, companyId, ticket, contact, whatsapp, isMenu, isFirstMsg
      )
    ) {
      return;
    }

    if (
      !ticket.imported &&
      !ticket.queue &&
      (!ticket.isGroup || whatsapp.groupAsTicket === "enabled") &&
      !msg.key.fromMe &&
      !ticket.userId &&
      whatsapp.queues.length >= 1 &&
      !ticket.useIntegration
    ) {
      // // console.log("antes do verifyqueue")
      await verifyQueue(wbot, msg, ticket, contact, settings, ticketTraking);

      if (ticketTraking.chatbotAt === null) {
        await ticketTraking.update({
          chatbotAt: moment().toDate()
        });
      }
    }

    if (ticket.queueId > 0) {
      await ticketTraking.update({
        queueId: ticket.queueId
      });
    }

    await rejectAudioIfNotAccepted(msg, wbot, ticket, contact, whatsapp, settings, ticketTraking);

    try {
      if (
        !msg.key.fromMe &&
        settings?.scheduleType &&
        ticket.queueId !== null &&
        (!ticket.isGroup || whatsapp.groupAsTicket === "enabled") &&
        ticket.status !== "open"
      ) {
        /**
         * Tratamento para envio de mensagem quando a empresa/fila está fora do expediente
         */
        const queue = await Queue.findByPk(ticket.queueId);

        if (settings?.scheduleType === "queue") {
          currentSchedule = await VerifyCurrentSchedule(companyId, queue.id, 0);
        }

        if (
          settings?.scheduleType === "queue" &&
          !isNil(currentSchedule) &&
          ticket.amountUsedBotQueues < whatsapp.maxUseBotQueues &&
          (!currentSchedule || currentSchedule.inActivity === false) &&
          !ticket.imported
        ) {
          if (Number(whatsapp.timeUseBotQueues) > 0) {
            if (
              ticket.isOutOfHour === false &&
              ticketTraking.chatbotAt !== null
            ) {
              await ticketTraking.update({
                chatbotAt: null
              });
              await ticket.update({
                amountUsedBotQueues: 0
              });
            }

            //Regra para desabilitar o chatbot por x minutos/horas após o primeiro envio
            const dataLimite = new Date();
            const Agora = new Date();

            if (ticketTraking.chatbotAt !== null) {
              dataLimite.setMinutes(
                ticketTraking.chatbotAt.getMinutes() +
                  Number(whatsapp.timeUseBotQueues)
              );

              if (
                ticketTraking.chatbotAt !== null &&
                Agora < dataLimite &&
                whatsapp.timeUseBotQueues !== "0" &&
                ticket.amountUsedBotQueues !== 0
              ) {
                return;
              }
            }

            await ticketTraking.update({
              chatbotAt: null
            });
          }

          const outOfHoursMessage = queue.outOfHoursMessage;

          if (outOfHoursMessage !== "") {
            // // console.log("entrei2");
            const body = formatBody(`${outOfHoursMessage}`, ticket);

            const debouncedSentMessage = debounce(
              async () => {
                await wbot.sendMessage(
                  `${ticket.contact.number}@${
                    ticket.isGroup ? "g.us" : "s.whatsapp.net"
                  }`,
                  {
                    text: body
                  }
                );
              },
              1000,
              ticket.id
            );
            debouncedSentMessage();
          }
          //atualiza o contador de vezes que enviou o bot e que foi enviado fora de hora
          await ticket.update({
            isOutOfHour: true,
            amountUsedBotQueues: ticket.amountUsedBotQueues + 1
          });
          return;
        }
      }
    } catch (e) {
      Sentry.captureException(e);
    }

    if (ticket.queue && ticket.queueId && !msg.key.fromMe) {
      if (!ticket.user || ticket.queue?.chatbots?.length > 0) {
        await sayChatbot(
          ticket.queueId,
          wbot,
          ticket,
          contact,
          msg,
          ticketTraking
        );
      }

      //atualiza mensagem para indicar que houve atividade e aí contar o tempo novamente para enviar mensagem de inatividade
      await ticket.update({
        sendInactiveMessage: false
      });
    }

    await ticket.reload();
  } catch (err) {
    Sentry.captureException(err);
    logError(`Error handling whatsapp message: Err: ${err}`);
    coexLogError({
      provider: "baileys",
      companyId,
      stage: "handleMessage",
      err: { message: (err as any)?.message, name: (err as any)?.name }
    });
  }
    
}

const handleMessage = async (
  msg: proto.IWebMessageInfo,
  wbot: Session,
  companyId: number,
  isImported: boolean = false
): Promise<void> => {
  if (!isValidMsg(msg)) {
    return;
  }

  // 📥 Registrar mensaje entrante del cliente en anti-ban para calcular tiempo correctamente
  if (!msg.key.fromMe && msg.messageTimestamp) {
    const messageTimestampMs = getTimestampMessage(msg.messageTimestamp) * 1000;
    const jid = msg.key.remoteJid;
    if (jid) {
      antiBanManager.registerIncomingMessage(jid, messageTimestampMs);
    }
  }

  // FASE 1 Coexistencia — envolver en trace context para correlacionar logs
  const traceId = generateTraceId("bai-in");
  return runWithTrace(
    {
      traceId,
      origin: "baileys",
      provider: "baileys",
      companyId
    },
    () => handleMessageInner(msg, wbot, companyId, isImported)
  ); // cierre runWithTrace — FASE 1 Coexistencia
};
const handleMsgAck = async (
  msg: WAMessage,
  chat: number | null | undefined
) => {
  if (chat === null || chat === undefined) return;

  await new Promise(r => setTimeout(r, 500));
  const io = getIO();

  try {
    const messageToUpdate = await Message.findOne({
      where: {
        wid: msg.key.id
      },
      include: [
        "contact",
        {
          model: Ticket,
          as: "ticket",
          include: [
            {
              model: Contact,
              attributes: [
                "id",
                "name",
                "number",
                "email",
                "profilePicUrl",
                "acceptAudioMessage",
                "active",
                "urlPicture",
                "companyId"
              ],
              include: ["extraInfo", "tags"]
            },
            {
              model: Queue,
              attributes: ["id", "name", "color"]
            },
            {
              model: Whatsapp,
              attributes: ["id", "name", "groupAsTicket"]
            },
            {
              model: User,
              attributes: ["id", "name"]
            },
            {
              model: Tag,
              as: "tags",
              attributes: ["id", "name", "color"]
            }
          ]
        },
        {
          model: Message,
          as: "quotedMsg",
          include: ["contact"]
        }
      ]
    });
    if (!messageToUpdate) {
      logWarn(
        `[OutboundDeliveryTrace] ack_orphan wid=${msg.key.id} remoteJid=${msg.key.remoteJid} ack=${chat}`
      );
      return;
    }

    if (!messageToUpdate.fromMe) {
      logDebug(
        `[OutboundDeliveryTrace] ack_inbound_ignored messageId=${messageToUpdate.id} ticketId=${messageToUpdate.ticketId} wid=${msg.key.id} remoteJid=${msg.key.remoteJid} ack=${chat}`
      );
      return;
    }

    const currentAck = messageToUpdate.ack ?? 0;
    if (currentAck > chat) return;

    const nextMessageStatus =
      messageToUpdate.messageStatus === "deleted"
        ? messageToUpdate.messageStatus
        : chat >= 1
          ? "sent"
          : chat < 0
            ? "failed"
            : messageToUpdate.messageStatus;
    const shouldSetSentAt =
      chat >= 1 &&
      messageToUpdate.messageStatus !== "deleted" &&
      !messageToUpdate.sentAt;

    if (
      messageToUpdate.ack === chat &&
      messageToUpdate.messageStatus === nextMessageStatus &&
      !shouldSetSentAt
    ) {
      return;
    }

    const updateData: any = {};
    if (messageToUpdate.ack !== chat) {
      updateData.ack = chat;
    }
    if (messageToUpdate.messageStatus !== nextMessageStatus) {
      updateData.messageStatus = nextMessageStatus;
    }
    if (shouldSetSentAt) {
      updateData.sentAt = new Date();
    }

    await messageToUpdate.update(updateData);
    logInfo(
      `[OutboundDeliveryTrace] ack messageId=${messageToUpdate.id} ticketId=${messageToUpdate.ticketId} whatsappId=${messageToUpdate.ticket?.whatsappId} wid=${msg.key.id} remoteJid=${msg.key.remoteJid} ack=${chat}`
    );
    io.of(messageToUpdate.companyId.toString())
      // .to(messageToUpdate.ticketId.toString())
      .emit(`company-${messageToUpdate.companyId}-appMessage`, {
        action: "update",
        message: messageToUpdate
      });
  } catch (err) {
    Sentry.captureException(err);
    logError(`Error handling message ack. Err: ${err}`);
  }
};

const verifyRecentCampaign = async (
  message: proto.IWebMessageInfo,
  companyId: number
) => {
  if (!isValidMsg(message)) {
    return;
  }
  if (!message.key.fromMe) {
    const number = message.key.remoteJid.replace(/\D/g, "");
    const campaigns = await Campaign.findAll({
      where: { companyId, status: "EM_ANDAMENTO", confirmation: true }
    });
    if (campaigns) {
      const ids = campaigns.map(c => c.id);
      const campaignShipping = await CampaignShipping.findOne({
        where: {
          campaignId: { [Op.in]: ids },
          number,
          confirmation: null,
          deliveredAt: { [Op.ne]: null }
        }
      });

      if (campaignShipping) {
        await campaignShipping.update({
          confirmedAt: moment(),
          confirmation: true
        });

        // Obtener la campaña para acceder a statusTicket y openTicket
        const campaign = await Campaign.findByPk(campaignShipping.campaignId);

        // ========================================================
        // USAR CONFIGURACIÓN DE ESTADO DEL TICKET DE LA CAMPAÑA
        // ========================================================
        const ticketStatus = campaign?.statusTicket || 'open';  // 'open' | 'closed'
        const openTicket = campaign?.openTicket || 'enabled';    // 'enabled' | 'disabled'

        logInfo(`[CAMPAIGN] Campaña ${campaign?.name}: ticketStatus=${ticketStatus}, openTicket=${openTicket}`);

        // Incluir configuración del ticket en el job
        await campaignQueue.add(
          "DispatchCampaign",
          {
            campaignShippingId: campaignShipping.id,
            campaignId: campaignShipping.campaignId,
            // Incluir configuración del ticket
            ticketStatus,
            openTicket
          },
          {
            delay: parseToMilliseconds(randomValue(0, 10))
          }
        );
      }
    }
  }
};

const verifyCampaignMessageAndCloseTicket = async (
  message: proto.IWebMessageInfo,
  companyId: number,
  wbot: Session
) => {
  if (!isValidMsg(message)) {
    return;
  }

  const io = getIO();
  const body = await getBodyMessage(message);
  const isCampaign = /\u200c/.test(body);

  if (message.key.fromMe && isCampaign) {
    let msgContact: IMe;
    msgContact = await getContactMessage(message, wbot);
    const contact = await verifyContact(msgContact, wbot, companyId);

    const messageRecord = await Message.findOne({
      where: {
        [Op.or]: [{ wid: message.key.id! }, { contactId: contact.id }],
        companyId
      }
    });

    if (
      !isNull(messageRecord) ||
      !isNil(messageRecord) ||
      messageRecord !== null
    ) {
      const ticket = await Ticket.findByPk(messageRecord.ticketId);
      await ticket.update({ status: "closed", amountUsedBotQueues: 0 });

      io.of(String(companyId))
        // .to("open")
        .emit(`company-${companyId}-ticket`, {
          action: "delete",
          ticket,
          ticketId: ticket.id
        });

      io.of(String(companyId))
        // .to(ticket.status)
        // .to(ticket.id.toString())
        .emit(`company-${companyId}-ticket`, {
          action: "update",
          ticket,
          ticketId: ticket.id
        });
    }
  }
};

const filterMessages = (msg: WAMessage): boolean => {
  // DEBUG: Log COMPLETO del mensaje entrante

  msgDB.save(msg);

  // DEBUG: Log detallado de cada mensaje
  // const msgType = msg.message?.protocolMessage ? 'protocolMessage' :
  //                 msg.messageStubType ? `stubType:${msg.messageStubType}` :
  //                 'regular';

  if (isMessageEditPayload(msg.message)) return true;
  if (msg.message?.protocolMessage) {
    return false;
  }

  if (
    [
      WAMessageStubType.REVOKE,
      WAMessageStubType.E2E_DEVICE_CHANGED,
      WAMessageStubType.E2E_IDENTITY_CHANGED
      // CIPHERTEXT ya NO se filtra — se guarda como placeholder en BD
    ].includes(msg.messageStubType!)
  ) {
    return false;
  }

  return true;
};

// Set para evitar procesamiento concurrente del mismo wid (race condition de Baileys)
const processingWids = new Set<string>();

const wbotMessageListener = (wbot: Session, companyId: number): void => {

  // Log fuera del try para capturar cualquier error
  wbot.ev.on("messages.upsert", async (messageUpsert: ImessageUpsert) => {

    try {

    messageUpsert.messages
      .filter(message => hasPossibleEditShape(message.message))
      .forEach(message => {
        logMessageEditProbe("messages.upsert", companyId, {
          key: message.key,
          messageStubType: message.messageStubType,
          messageTimestamp: message.messageTimestamp,
          status: message.status,
          message: message.message
        });
      });

    const messages = messageUpsert.messages
      .filter(filterMessages)
      .map(msg => msg);

    if (!messages) {
      return;
    }


    for (const message of messages) {

      // Guard: evitar procesamiento concurrente del mismo wid
      const widKey = `${companyId}:${message.key.id}`;
      if (processingWids.has(widKey)) {
        continue;
      }
      processingWids.add(widKey);
      // Auto-limpiar después de 10s para evitar memory leak
      setTimeout(() => processingWids.delete(widKey), 10000);

      if (isSecretEncryptedEditPayload(message.message)) {
        await handleSecretEncryptedMessageEdit(message, companyId);
        continue;
      }

      if (isMessageEditPayload(message.message)) {
        await handleMessageEditUpdate(
          {
            key: message.key,
            update: { message: message.message }
          } as WAMessageUpdate,
          companyId
        );
        continue;
      }


      if (
        message?.messageStubParameters?.length &&
        message.messageStubParameters[0].includes("absent")
      ) {
        const lostMsg = {
          companyId: companyId,
          whatsappId: wbot.id,
          message: message
        };
        logWarn("MENSAGEM PERDIDA", lostMsg);
      }
      // ── CIPHERTEXT: mensaje aún no descifrado ──
      const isCiphertext = message.messageStubType === WAMessageStubType.CIPHERTEXT && !message.message;

      const existingMsg = await Message.findOne({
        where: { wid: message.key.id!, companyId },
        attributes: ['id', 'mediaType', 'body']
      });

      const messageExists = !!existingMsg;

      console.log("🔍 Message exists:", messageExists, isCiphertext ? "(CIPHERTEXT)" : "");

      // Si ya existe como ciphertext Y ahora llega con contenido real → ACTUALIZAR
      if (messageExists && existingMsg?.mediaType === 'ciphertext' && message.message) {
        console.log("🔓 Mensaje CIPHERTEXT descifrado, actualizando ID:", existingMsg.id);
        const decryptedBody = getBodyMessage(message) || '';
        const decryptedType = getTypeMessage(message) || 'conversation';
        const io = getIO();

        await existingMsg.update({
          body: decryptedBody,
          mediaType: decryptedType,
          dataJson: JSON.stringify(message),
          ack: normalizeBaileysAck(message.status) ?? 1
        });

        // Notificar al frontend via socket para que actualice en tiempo real
        io.of(String(companyId))
          .emit(`company-${companyId}-appMessage`, {
            action: "update",
            message: existingMsg
          });

        // Ahora procesar como mensaje normal (media, ticket updates, etc.)
        if (REDIS_URI_MSG_CONN !== "") {
          try {
            await BullQueues.add(
              `${process.env.DB_NAME}-handleMessage`,
              { message, wbot: wbot.id, companyId },
              {
                priority: 1,
                jobId: `${wbot.id}-handleMessage-decrypted-${message.key.id}`
              }
            );
          } catch (e) {
            Sentry.captureException(e);
          }
        } else {
          await handleMessage(message, wbot, companyId);
        }
      }

      if (!messageExists) {
        // ── Guardar CIPHERTEXT como placeholder ──
        if (isCiphertext) {
          console.log("🔒 Guardando mensaje CIPHERTEXT como placeholder, wid:", message.key.id);
          try {
            const io = getIO();
            const ciphertextDiagnostic = buildCiphertextDiagnostic(message);
            logWarn(
              `[CIPHERTEXT] placeholder wid=${ciphertextDiagnostic.messageId} remoteJid=${ciphertextDiagnostic.remoteJid} remoteJidAlt=${ciphertextDiagnostic.remoteJidAlt || "-"} participant=${ciphertextDiagnostic.participant || "-"} participantAlt=${ciphertextDiagnostic.participantAlt || "-"} addressingMode=${ciphertextDiagnostic.addressingMode || "-"} isGroup=${ciphertextDiagnostic.isGroup} policy=${ciphertextDiagnostic.recoveryPolicy} wbot=${wbot.id} pid=${ciphertextDiagnostic.processId}`
            );
            // Buscar o crear contacto y ticket mínimos para asociar
            const jid = message.key.remoteJid;
            if (jid && jid !== "status@broadcast") {
              // Crear registro placeholder en BD
              const ciphertextData = {
                wid: message.key.id,
                body: "⏳ Esperando mensaje. Esto puede tardar un momento.",
                fromMe: message.key.fromMe || false,
                mediaType: "ciphertext",
                read: false,
                ack: 0,
                remoteJid: jid,
                participant: message.key.participant,
                dataJson: JSON.stringify({
                  ...message,
                  chateamCiphertextDiagnostic: ciphertextDiagnostic
                }),
                companyId: companyId
              };

              // Buscar ticket activo para este jid
              const contactNumber = jid.replace(/\D/g, "");
              const existingContact = await Contact.findOne({
                where: { number: contactNumber, companyId }
              });

              if (existingContact) {
                const activeTicket = await Ticket.findOne({
                  where: {
                    contactId: existingContact.id,
                    companyId,
                    whatsappId: wbot.id,
                    status: { [Op.in]: ["open", "pending"] }
                  }
                });

                if (activeTicket) {
                  const msgRecord = await Message.create({
                    ...ciphertextData,
                    ticketId: activeTicket.id,
                    contactId: message.key.fromMe ? undefined : existingContact.id
                  });

                  io.of(String(companyId))
                    .emit(`company-${companyId}-appMessage`, {
                      action: "create",
                      message: msgRecord,
                      ticket: activeTicket,
                      contact: existingContact
                    });

                  console.log("✅ CIPHERTEXT placeholder guardado, msgId:", msgRecord.id);
                } else {
                  console.log("⚠️ CIPHERTEXT: no hay ticket activo para", contactNumber);
                }
              } else {
                console.log("⚠️ CIPHERTEXT: contacto no encontrado para", contactNumber);
              }
            }
          } catch (cipherErr) {
            console.error("❌ Error guardando CIPHERTEXT:", cipherErr);
            Sentry.captureException(cipherErr);
          }
        } else {
          // ── Flujo normal de mensaje nuevo ──
          console.log("🔄 Mensaje NO existe, creando...");
          let isCampaign = false;
          let body = await getBodyMessage(message);
          console.log("📝 Body:", body?.substring(0, 100));
          const fromMe = message?.key?.fromMe;
          if (fromMe) {
            isCampaign = /\u200c/.test(body);
          } else {
            if (/\u200c/.test(body)) body = body.replace(/\u200c/, "");
            logDebug(
              "Validação de mensagem de campanha enviada por terceiros: " + body
            );
          }

          if (!isCampaign) {
            if (REDIS_URI_MSG_CONN !== "") {
              try {
                await BullQueues.add(
                  `${process.env.DB_NAME}-handleMessage`,
                  { message, wbot: wbot.id, companyId },
                  {
                    priority: 1,
                    jobId: `${wbot.id}-handleMessage-${message.key.id}`
                  }
                );
              } catch (e) {
                Sentry.captureException(e);
              }
            } else {
              await handleMessage(message, wbot, companyId);
            }
          }

          await verifyRecentCampaign(message, companyId);
          await verifyCampaignMessageAndCloseTicket(message, companyId, wbot);
        }
      }

      if (message.key.remoteJid?.endsWith("@g.us")) {
        if (REDIS_URI_MSG_CONN !== "") {
          BullQueues.add(
            `${process.env.DB_NAME}-handleMessageAck`,
            { msg: message, chat: 2 },
            {
              priority: 1,
              jobId: `${wbot.id}-handleMessageAck-${message.key.id}`
            }
          );
        } else {
          handleMsgAck(message as WAMessage, 2);
        }
      }
    }

    // messages.forEach(async (message: proto.IWebMessageInfo) => {
    //   const messageExists = await Message.count({
    //     where: { id: message.key.id!, companyId }
    //   });

    //   if (!messageExists) {
    //     await handleMessage(message, wbot, companyId);
    //     await verifyRecentCampaign(message, companyId);
    //     await verifyCampaignMessageAndCloseTicket(message, companyId);
    //   }
    // });
    } catch (err) {
      console.error("❌ Error en messages.upsert:", err);
    }
  });

  wbot.ev.on("messages.update", async (messageUpdate: WAMessageUpdate[]) => {
    if (messageUpdate.length === 0) return;
    for (const message of messageUpdate) {
      try {
        if (
          message.update?.message ||
          message.update?.messageStubType ||
          message.update?.status === undefined
        ) {
          logMessageEditProbe("messages.update", companyId, message);
        }

        (wbot as WASocket)!.readMessages([message.key]);

        const handledEdit = await handleMessageEditUpdate(message, companyId);
        if (handledEdit) continue;

        const msgUp = { ...messageUpdate };

        if (
          msgUp["0"]?.update.messageStubType === 1 &&
          msgUp["0"]?.key.remoteJid !== "status@broadcast"
        ) {
          MarkDeleteWhatsAppMessage(
            msgUp["0"]?.key.remoteJid,
            null,
            msgUp["0"]?.key.id,
            companyId
          );
        }

        const ack = normalizeBaileysAck(message.update.status, undefined);
        if (ack === undefined) continue;

        if (REDIS_URI_MSG_CONN !== "") {
          BullQueues.add(
            `${process.env.DB_NAME}-handleMessageAck`,
            { msg: message, chat: ack },
            {
              priority: 1,
              jobId: `${wbot.id}-handleMessageAck-${message.key.id}`
            }
          );
        } else {
          handleMsgAck(message, ack);
        }
      } catch (err: any) {
        logMessageEditFailure("messages_update_listener_error", companyId, {
          key: message.key,
          updateKeys: Object.keys(message.update || {}),
          error: {
            name: err?.name,
            message: err?.message || String(err),
            stack: err?.stack
          }
        });
        Sentry.captureException(err);
      }
    }
  });

  // wbot.ev.on('message-receipt.update', (events: any) => {
  //   events.forEach(async (msg: any) => {
  //     const ack = msg?.receipt?.receiptTimestamp ? 3 : msg?.receipt?.readTimestamp ? 4 : 0;
  //     if (!ack) return;
  //     await handleMsgAck(msg, ack);
        //   });
  // })

  wbot.ev.on("presence.update", (events: any) => {
    console.log("👁️ [wbotMessageListener] Presence update:", JSON.stringify(events));
  })

  wbot.ev.on("contacts.update", async (contacts: any) => {
    for (const contact of contacts) {
     try {
      if (!contact?.id) continue;

      if (typeof contact.imgUrl !== "undefined") {
        const newUrl =
          contact.imgUrl === ""
            ? ""
            : await wbot!.profilePictureUrl(contact.id!).catch(() => null);
        const contactData = {
          name: contact.id.replace(/\D/g, ""),
          number: contact.id.replace(/\D/g, ""),
          isGroup: contact.id.includes("@g.us") ? true : false,
          companyId: companyId,
          remoteJid: contact.id,
          profilePicUrl: newUrl,
          whatsappId: wbot.id,
          wbot: wbot
        };

        await CreateOrUpdateContactService(contactData);
      }
     } catch (e: any) {
      logger.error(`[contacts.update] ${e?.message || e}`);
     }
    }
  });
  wbot.ev.on("groups.update", async (groupUpdate: GroupMetadata[]) => {
    if (!groupUpdate[0]?.id) return;
    if (groupUpdate.length === 0) return;
    for (const group of groupUpdate) {
     try {
      const number = group.id.replace(/\D/g, "");
      const nameGroup = group.subject || number;

      let profilePicUrl: string = "";
       try {
         profilePicUrl = await wbot.profilePictureUrl(group.id, "image");
       } catch (e) {
         Sentry.captureException(e);
         profilePicUrl = `${process.env.FRONTEND_URL}/nopicture.png`;
       }
      const contactData = {
        name: nameGroup,
        number: number,
        isGroup: true,
        companyId: companyId,
        remoteJid: group.id,
        profilePicUrl,
        whatsappId: wbot.id,
        wbot: wbot
      };

      const contact = await CreateOrUpdateContactService(contactData);

     } catch (e: any) {
      logger.error(`[groups.update] ${e?.message || e}`);
     }
    }
  });
};

export {
  wbotMessageListener,
  handleMessage,
  isValidMsg,
  getTypeMessage,
  handleMsgAck,
  sendMessageWithAntiBan, // 🛡️ Exportar función anti-ban
  // [Refactor Ola 7] re-export: facebookMessageListener importa
  // handleMessageIntegration de este fichero por nombre.
  handleMessageIntegration
};
