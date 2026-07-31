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
async function sendMessageWithAntiBan(
  wbot: any,
  jid: string,
  content: any,
  messageType: "text" | "media" | "audio" = "text"
) {
  try {
    // 1. Aplicar protección anti-ban (delays + typing simulation)
    const antiBanResult = await antiBanManager.applyAntiBan(wbot, jid, messageType);

    if (!antiBanResult.success) {
      logWarn("⚠️ Anti-ban blocked message", {
        jid,
        reason: antiBanResult.reason,
        messageType
      });

      // Si está bloqueado por rate limit, esperar y reintentar UNA vez
      if (antiBanResult.reason?.includes("Rate limit")) {
        await delay(5000); // Esperar 5s adicionales
        const retryResult = await antiBanManager.applyAntiBan(wbot, jid, messageType);

        if (!retryResult.success) {
          throw new Error(`Message blocked: ${antiBanResult.reason}`);
        }
      } else {
        throw new Error(`Message blocked: ${antiBanResult.reason}`);
      }
    }

    // 2. Enviar mensaje real
    logInfo("📤 Sending message with anti-ban", { jid, messageType });
    const sentMessage = await wbot.sendMessage(jid, content);

    // 3. Log success
    logInfo("✅ Message sent successfully with anti-ban", {
      jid,
      messageType,
      messageId: sentMessage?.key?.id
    });

    return sentMessage;

  } catch (error) {
    logError("❌ Error sending message with anti-ban", {
      jid,
      messageType,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

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

const sendDialogflowAwswer = async (
  wbot: Session,
  ticket: Ticket,
  msg: WAMessage,
  contact: Contact,
  inputAudio: string | undefined,
  companyId: number,
  queueIntegration: QueueIntegrations
) => {
  const session = await createDialogflowSessionWithModel(queueIntegration);

  if (session === undefined) {
    return;
  }

  wbot.presenceSubscribe(contact.remoteJid);
  await delay(500);

  const dialogFlowReply = await queryDialogFlow(
    session,
    queueIntegration.projectName,
    contact.remoteJid,
    getBodyMessage(msg),
    queueIntegration.language,
    inputAudio
  );

  if (!dialogFlowReply) {
    wbot.sendPresenceUpdate("composing", contact.remoteJid);

    const bodyDuvida = formatBody(
      `\u200e *${queueIntegration?.name}:*No pude entender tu pregunta.`
    );

    await delay(1000);

    await wbot.sendPresenceUpdate("paused", contact.remoteJid);

    const sentMessage = await wbot.sendMessage(`${contact.number}@c.us`, {
      text: bodyDuvida
    });

    await verifyMessage(sentMessage, ticket, contact);
    return;
  }

  if (dialogFlowReply.endConversation) {
    await ticket.update({
      contactId: ticket.contact.id,
      useIntegration: false
    });
  }

  const image = dialogFlowReply.parameters.image?.stringValue ?? undefined;

  const react = dialogFlowReply.parameters.react?.stringValue ?? undefined;

  const audio = dialogFlowReply.encodedAudio.toString("base64") ?? undefined;

  wbot.sendPresenceUpdate("composing", contact.remoteJid);
  await delay(500);

  let lastMessage;

  for (const message of dialogFlowReply.responses) {
    lastMessage = message.text.text[0] ? message.text.text[0] : lastMessage;
  }
  for (const message of dialogFlowReply.responses) {
    if (message.text) {
      await sendDelayedMessages(
        wbot,
        ticket,
        contact,
        message.text.text[0],
        lastMessage,
        audio,
        queueIntegration
      );
    }
  }
};

async function sendDelayedMessages(
  wbot: Session,
  ticket: Ticket,
  contact: Contact,
  message: string,
  lastMessage: string,
  audio: string | undefined,
  queueIntegration: QueueIntegrations
) {
  const companyId = ticket.companyId;
  // // console.log("GETTING WHATSAPP SEND DELAYED MESSAGES", ticket.whatsappId, wbot.id)
  const whatsapp = await ShowWhatsAppService(wbot.id!, companyId);
  const farewellMessage = whatsapp.farewellMessage.replace(/[_*]/g, "");

  // if (react) {
  //   const test =
  //     /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g.test(
  //       react
  //     );
  //   if (test) {
  //     msg.react(react);
  //     await delay(1000);
  //   }
  // }
  const sentMessage = await wbot.sendMessage(`${contact.number}@c.us`, {
    text: `\u200e *${queueIntegration?.name}:* ` + message
  });

  await verifyMessage(sentMessage, ticket, contact);
  if (message != lastMessage) {
    await delay(500);
    wbot.sendPresenceUpdate("composing", contact.remoteJid);
  } else if (audio) {
    wbot.sendPresenceUpdate("recording", contact.remoteJid);
    await delay(500);

    // if (audio && message === lastMessage) {
    //   const newMedia = new MessageMedia("audio/ogg", audio);

    //   const sentMessage = await wbot.sendMessage(
    //     `${contact.number}@c.us`,
    //     newMedia,
    //     {
    //       sendAudioAsVoice: true
    //     }
    //   );

    //   await verifyMessage(sentMessage, ticket, contact);
    // }

    // if (sendImage && message === lastMessage) {
    //   const newMedia = await MessageMedia.fromUrl(sendImage, {
    //     unsafeMime: true
    //   });
    //   const sentMessage = await wbot.sendMessage(
    //     `${contact.number}@c.us`,
    //     newMedia,
    //     {
    //       sendAudioAsVoice: true
    //     }
    //   );

    //   await verifyMessage(sentMessage, ticket, contact);
    //   await ticket.update({ lastMessage: "📷 Foto" });
    // }

    if (farewellMessage && message.includes(farewellMessage)) {
      await delay(1000);
      setTimeout(async () => {
        await ticket.update({
          contactId: ticket.contact.id,
          useIntegration: true
        });
        await UpdateTicketService({
          ticketId: ticket.id,
          ticketData: { status: "closed" },
          companyId: companyId
        });
      }, 3000);
    }
  }
}

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

const flowbuilderIntegration = async (
  msg: proto.IWebMessageInfo,
  wbot: Session,
  companyId: number,
  queueIntegration: QueueIntegrations,
  ticket: Ticket,
  contact: Contact,
  isFirstMsg?: Ticket,
  isTranfered?: boolean
) => {
  const io = getIO();
  const quotedMsg = await verifyQuotedMessage(msg);
  const body = getBodyMessage(msg);

 
  if (!msg.key.fromMe && ticket.status === "closed") {
    await ticket.update({ status: "pending" });
    await ticket.reload({
      include: [
        { model: Queue, as: "queue" },
        { model: User, as: "user" },
        { model: Contact, as: "contact" }
      ]
    });
    await UpdateTicketService({
      ticketData: { status: "pending", integrationId: ticket.integrationId },
      ticketId: ticket.id,
      companyId
    });
  }

  if (msg.key.fromMe) {
    return;
  }

  const whatsapp = await ShowWhatsAppService(wbot.id!, companyId);

  const listPhrase = await FlowCampaignModel.findAll({
    where: { whatsappId: whatsapp.id }
  });

  const normalizeText = (text: string): string => {
    return text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  };

  const bodyNormalized = normalizeText(body);
  const isInFlow = !!ticket?.flowWebhook;

  const mountDataContact = {
    number: contact.number,
    name: contact.name,
    email: contact.email
  };

  // ─── PRIORIDAD 1: PALABRA CLAVE (FlowCampaign) ───
  // Siempre tiene prioridad máxima — usa normalización para coincidencia robusta
  const flowDispar = listPhrase.find(item =>
    bodyNormalized.includes(normalizeText(item.phrase))
  );

  if (flowDispar) {
    const flow = await FlowBuilderModel.findOne({
      where: { id: flowDispar.flowId, active: true }
    });
    if (flow) {
      const nodes: INodes[] = flow.flow["nodes"];
      const connections: IConnections[] = flow.flow["connections"];
      console.log("[FlowBuilder] Prioridad 1: Palabra clave detectada →", flowDispar.phrase);
      await ActionsWebhookService(
        whatsapp.id,
        flowDispar.flowId,
        ticket.companyId,
        nodes,
        connections,
        flow.flow["nodes"][0].id,
        null, "", "", null,
        ticket.id,
        mountDataContact
      );
    }
    return; // ← SALIR — solo 1 flujo por mensaje
  }

  // ─── PRIORIDAD 2: CONTINUACIÓN DE FLUJO ACTIVO ───
  // Si el usuario ya está dentro de un flujo (respondiendo menú/pregunta), continuar
  if (isInFlow) {
    const webhook = await WebhookModel.findOne({
      where: {
        company_id: ticket.companyId,
        hash_id: ticket.hashFlowId
      }
    });

    if (webhook && webhook.config["details"]) {
      const flow = await FlowBuilderModel.findOne({
        where: { id: webhook.config["details"].idFlow, active: true }
      });
      if (flow) {
        const nodes: INodes[] = flow.flow["nodes"];
        const connections: IConnections[] = flow.flow["connections"];
        console.log("[FlowBuilder] Prioridad 2: Continuación flujo activo (webhook)");
        await ActionsWebhookService(
          whatsapp.id,
          webhook.config["details"].idFlow,
          ticket.companyId,
          nodes,
          connections,
          String(ticket.lastFlowId),
          ticket.dataWebhook,
          webhook.config["details"],
          String(ticket.hashFlowId),
          body,
          ticket.id
        );
      }
    } else if (ticket.flowStopped && ticket.lastFlowId) {
      const flow = await FlowBuilderModel.findOne({
        where: { id: ticket.flowStopped, active: true }
      });
      if (flow) {
        const nodes: INodes[] = flow.flow["nodes"];
        const connections: IConnections[] = flow.flow["connections"];
        console.log("[FlowBuilder] Prioridad 2: Continuación flujo activo (flowStopped)");
        await ActionsWebhookService(
          whatsapp.id,
          parseInt(ticket.flowStopped),
          ticket.companyId,
          nodes,
          connections,
          String(ticket.lastFlowId),
          null, "", "",
          body,
          ticket.id,
          mountDataContact,
          msg
        );
      }
    }
    return; // ← SALIR — solo 1 flujo por mensaje
  }

  // ─── PRIORIDAD 3: CONTACTO NUEVO → flowIdWelcome ───
  // isFirstMsg = null significa que NO existe ticket previo = contacto nuevo
  if (!isFirstMsg && whatsapp.flowIdWelcome) {
    const flow = await FlowBuilderModel.findOne({
      where: { id: whatsapp.flowIdWelcome, active: true }
    });
    if (flow) {
      const nodes: INodes[] = flow.flow["nodes"];
      const connections: IConnections[] = flow.flow["connections"];
      console.log("[FlowBuilder] Prioridad 3: Contacto NUEVO → flowIdWelcome");
      await ActionsWebhookService(
        whatsapp.id,
        whatsapp.flowIdWelcome,
        ticket.companyId,
        nodes,
        connections,
        flow.flow["nodes"][0].id,
        null, "", "", null,
        ticket.id,
        mountDataContact,
        msg
      );
    }
    return; // ← SALIR — solo 1 flujo por mensaje
  }

  // ─── PRIORIDAD 4: CONTACTO EXISTENTE → flowIdNotPhrase ───
  // isFirstMsg = Ticket object significa que SÍ existe ticket previo = contacto conocido
  if (isFirstMsg && whatsapp.flowIdNotPhrase) {
    const flow = await FlowBuilderModel.findOne({
      where: { id: whatsapp.flowIdNotPhrase, active: true }
    });
    if (flow) {
      const nodes: INodes[] = flow.flow["nodes"];
      const connections: IConnections[] = flow.flow["connections"];
      console.log("[FlowBuilder] Prioridad 4: Contacto EXISTENTE → flowIdNotPhrase");
      await ActionsWebhookService(
        whatsapp.id,
        whatsapp.flowIdNotPhrase,
        ticket.companyId,
        nodes,
        connections,
        flow.flow["nodes"][0].id,
        null, "", "", null,
        ticket.id,
        mountDataContact,
        msg
      );
    }
    return; // ← SALIR — solo 1 flujo por mensaje
  }
};
export const handleMessageIntegration = async (
  msg: proto.IWebMessageInfo,
  wbot: Session,
  companyId: number,
  queueIntegration: QueueIntegrations,
  ticket: Ticket,
  isMenu: boolean,
  whatsapp: Whatsapp,
  contact: Contact,
  isFirstMsg: Ticket | null
): Promise<void> => {
  const msgType = getTypeMessage(msg);

  if (queueIntegration?.urlN8N) {
    // (1) Prepara el payload que n8n espera
    const payload = {
    //  tenantId: String(ticket.tenantId || contact?.tenantId || "0993186252001"),
      msg: msg?.message?.conversation
        || msg?.message?.extendedTextMessage?.text
        || msg?.message?.imageMessage?.caption
        || msgType // fallback
    };
  
    // (2) Llama a n8n y espera la respuesta
    // Migrado de `request` (deprecado: SSRF + form-data unsafe-random) a axios.
    // axios auto-serializa/parsea JSON, auto-descomprime gzip y rechaza status
    // >=400 por defecto (mismo contrato que el callback anterior).
    const n8nAxios = await axios.post(queueIntegration.urlN8N, payload, {
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      timeout: 60000
    });
    const n8nResp = n8nAxios.data; // JSON parseado si n8n respondió JSON
  
    // (3) Log completo de lo que devolvió n8n
    console.log("Respuesta completa de n8n:", n8nResp);
  
    // (4) Armar el reply como string para WhatsApp
    let reply: string;
  
    if (typeof n8nResp === "string") {
      reply = n8nResp; // si n8n devuelve texto plano
    } else if (typeof n8nResp === "object") {
      // convertir el objeto a string (para WhatsApp)
      reply = JSON.stringify(n8nResp, null, 2);
    } else {
      reply = String(n8nResp);
    }
    // (4) Responder por WhatsApp (ajusta a tu lib/SDK)
    await wbot.sendMessage(msg.key.remoteJid!, { text: reply });
  
    // (5) (Opcional) actualizar ticket/metadata
    await ticket.update({ useIntegration: true, integrationId: queueIntegration.id });
  } else if (queueIntegration.type === "dialogflow") {
    let inputAudio: string | undefined;

    if (msgType === "audioMessage") {
      const filename = `${msg.messageTimestamp}.ogg`;
      readFile(
        join(
          currentDir,
          "..",
          "..",
          "..",
          "public",
          `company${companyId}`,
          filename
        ),
        "base64",
        (err, data) => {
          inputAudio = data;
          if (err) {
            logError("Error reading audio file", { error: err?.message });
          }
        }
      );
    } else {
      inputAudio = undefined;
    }

    const debouncedSentMessage = debounce(
      async () => {
        await sendDialogflowAwswer(
          wbot,
          ticket,
          msg as WAMessage,
          ticket.contact,
          inputAudio,
          companyId,
          queueIntegration
        );
      },
      500,
      ticket.id
    );
    debouncedSentMessage();
  /* COMENTADO: Typebot - Ya no funcional con IA
  } else if (queueIntegration.type === "typebot") {
    // await typebots(ticket, msg, wbot, queueIntegration);
    await typebotListener({ ticket, msg, wbot, typebot: queueIntegration });
  */
  } else if (queueIntegration.type === "supervisor_ai") {
    // ═══════════════════════════════════════════════════════════════
    // 🤖 ORQUESTADOR IA MULTI-AGENTE — SupervisorService
    // Clasifica intención → despacha al agente correcto → responde
    // ═══════════════════════════════════════════════════════════════

    const AITurnLedgerService = require("../AIAgentServices/AITurnLedgerService").default;
    const aiTurnId = AITurnLedgerService.createTurnId();
    const logAITurn = (event: Record<string, any>) => {
      void AITurnLedgerService.logEvent({
        turnId: aiTurnId,
        companyId,
        ticketId: ticket.id,
        contactId: contact?.id,
        whatsappId: whatsapp?.id ?? ticket.whatsappId,
        channel: "whatsapp",
        ...event
      });
    };
    logAITurn({
      eventType: "turn_started",
      metadata: {
        source: "supervisor_ai_wbot",
        providerMessageId: msg?.key?.id || null,
        ticketStatus: ticket.status,
        aiStatus: ticket.aiStatus,
        isBot: ticket.isBot
      }
    });

    // 🛡️ Guard central: respetar permiso de la conexión.
    // Si useAIOrchestrator=false, NO marcar aiStatus, NO procesar, NO responder.
    const orchestratorEnabled =
      whatsapp?.useAIOrchestrator === true ||
      ticket?.whatsapp?.useAIOrchestrator === true;
    if (!orchestratorEnabled) {
      logger.info(
        `[SupervisorAI] Bloqueado: useAIOrchestrator=false en whatsappId=${
          whatsapp?.id ?? ticket?.whatsappId
        } (ticket=${ticket.id})`
      );
      logAITurn({
        eventType: "eligibility_checked",
        eventStatus: "blocked",
        reason: "orchestrator_disabled",
        metadata: { whatsappId: whatsapp?.id ?? ticket?.whatsappId }
      });
      return;
    }

    const AIExecutionGuardService = require("../AIAgentServices/AIExecutionGuardService").default;
    const aiGuard = await AIExecutionGuardService.canRunSupervisorAI({
      companyId,
      ticketId: ticket.id,
      whatsapp: whatsapp || ticket.whatsapp,
      whatsappId: whatsapp?.id ?? ticket.whatsappId,
      source: "supervisor_ai_wbot"
    });

    if (!aiGuard.allowed) {
      logger.info(
        `[SupervisorAI] Bloqueado por guard: ticket=${ticket.id}, reason=${aiGuard.reason}`
      );
      logAITurn({
        eventType: "eligibility_checked",
        eventStatus: "blocked",
        reason: aiGuard.reason,
        metadata: { source: "AIExecutionGuardService" }
      });
      return;
    }

    logAITurn({
      eventType: "eligibility_checked",
      eventStatus: "ok",
      reason: "guard_allowed",
      metadata: { source: "AIExecutionGuardService" }
    });

    // ✅ CONDICIONES PARA NO RESPONDER
    // Lógica: isBot=true es "override" - si está en true, el bot siempre responde

    // 1. Si está desactivado manualmente (isBot = false)
    if (ticket.isBot === false) {
      logger.info(`[SupervisorAI] Ticket ${ticket.id} tiene isBot=false (desactivado manualmente) - no responde`);
      logAITurn({ eventType: "eligibility_checked", eventStatus: "blocked", reason: "ticket_isbot_false" });
      return;
    }

    const isBotActivo = ticket.isBot === true;

    // 2. Si tiene usuario asignado Y el bot NO está activo manualmente
    if (ticket.userId && !isBotActivo) {
      logger.info(`[SupervisorAI] Ticket ${ticket.id} tiene usuario asignado - no responde`);
      logAITurn({ eventType: "eligibility_checked", eventStatus: "blocked", reason: "human_assigned", metadata: { userId: ticket.userId } });
      return;
    }
    // 3. Si está abierto Y el bot NO está activo manualmente
    if (ticket.status === 'open' && !isBotActivo) {
      logger.info(`[SupervisorAI] Ticket ${ticket.id} está en estado open - no responde`);
      logAITurn({ eventType: "eligibility_checked", eventStatus: "blocked", reason: "ticket_open_without_bot_override" });
      return;
    }
    // 4. Si está cerrado (nunca responde)
    if (ticket.status === 'closed') {
      logger.info(`[SupervisorAI] Ticket ${ticket.id} está cerrado - no responde`);
      logAITurn({ eventType: "eligibility_checked", eventStatus: "blocked", reason: "ticket_closed" });
      return;
    }

    // Responde si: isBot !== false (incluye true y null)
    // - Si isBot = true → SIEMPRE responde (override)
    // - Si isBot = null o true → responde si no tiene userId o status open
    // Flag para evitar doble respuesta: si ya se envió un mensaje IA, NO enviar fallback genérico
    let responseSent = false;
    try {
      const rawBody = getBodyMessage(msg);
      const aiInput = normalizeSupervisorAIText(rawBody);
      if (!aiInput.text) {
        logger.info(`[SupervisorAI] Entrada no textual omitida: ticket=${ticket.id}, reason=${aiInput.reason}, chars=${aiInput.originalChars}`);
        logAITurn({
          eventType: "prefilter_checked",
          eventStatus: "skipped",
          reason: aiInput.reason || "non_text_input",
          metadata: { originalBodyChars: aiInput.originalChars, sanitized: aiInput.wasSanitized }
        });
        return;
      }

      const body = aiInput.text;
      logAITurn({
        eventType: "prefilter_checked",
        eventStatus: "ok",
        reason: aiInput.wasSanitized ? (aiInput.reason || "body_sanitized") : "body_present",
        metadata: { bodyChars: body.length, originalBodyChars: aiInput.originalChars, sanitized: aiInput.wasSanitized }
      });

      // ═══════════════════════════════════════════════════════════════
      // PRIMERO: Marcar aiStatus='active' ANTES de procesar para evitar
      // race conditions (otro mensaje entrante procesándose en paralelo)
      // NO tocamos integrationId ni useIntegration — esos son para FlowBuilder
      // ═══════════════════════════════════════════════════════════════
      if (ticket.aiStatus !== 'active') {
        await ticket.update({ aiStatus: 'active' });
        logger.info(`[SupervisorAI] aiStatus=active marcado ANTES de procesar: ticket=${ticket.id}`);
      }

      // Fix (2026-07-09): await import en vez de require() CommonJS. Baileys (vía
      // ../../queues que importa SupervisorService) arrastra whatsapp-rust-bridge (ESM-only,
      // sin condición "require") y el require() CJS reventaba con "No exports main defined"
      // ANTES de entrar a processMessage → fallback "dificultades técnicas". await import
      // usa el loader ESM y resuelve la condición "import" del paquete. Función async.
      const SupervisorService = (await import("../AIAgentServices/SupervisorService")).default;

      // Cargar historial del ticket (últimos 20 mensajes para contexto)
      const recentMessages = await Message.findAll({
        where: { ticketId: ticket.id },
        order: [["createdAt", "DESC"]],
        limit: 20
      });
      const ticketHistory = recentMessages.reverse().map((m: any) => ({
        role: m.fromMe ? "assistant" : "user",
        content: normalizeSupervisorAIText(m.body || "").text || ""
      }));

      logger.info(
        `[SupervisorAI] Procesando msg empresa=${companyId} ticket=${ticket.id}: "${body.substring(0, 60)}..."`
      );

      const aiResponse = await SupervisorService.processMessage({
        message: body,
        companyId,
        ticketId: ticket.id,
        contactId: contact?.id,
        whatsappId: whatsapp?.id,
        ticketHistory,
        contactInfo: {
          name: contact?.name || undefined,
          number: contact?.number || undefined,
          email: contact?.email || undefined
        },
        channel: "whatsapp",
        turnId: aiTurnId
      });

      logger.info(`[SupervisorAI] Respuesta - agente: ${aiResponse.agentUsed}, confianza: ${aiResponse.confidence}`);

      // 🆕 Gatekeeper decidió no enviar respuesta (ej: cliente solo dijo "gracias")
      // Respetamos la decisión y NO enviamos nada al cliente; solo devolvemos aiStatus a 'passive'.
      if (aiResponse.skipSend) {
        logger.info(
          `[SupervisorAI] skipSend=true (gatekeeper decidió ignorar). ` +
          `Motivo: ${aiResponse.metadata?.gatekeeperReasoning || 'sin motivo'}`
        );
        try {
          await ticket.update({ aiStatus: 'passive' });
        } catch { /* silenciar */ }
        responseSent = true; // marcamos como "respondido" para que no intente más abajo
        logAITurn({
          eventType: "send_result",
          eventStatus: "skipped",
          reason: "gatekeeper_skip_send",
          metadata: { gatekeeperDecision: aiResponse.gatekeeperDecision || null }
        });
      } else if (aiResponse.shouldEscalate) {
        // ═══════════════════════════════════════════════════════════════
        // Derivar a humano - buscar cola por defecto del WhatsApp
        // ═══════════════════════════════════════════════════════════════
        await new Promise(resolve => setTimeout(resolve, 1500));

        try {
          const SupervisorActionsService = (await import("../AIAgentServices/SupervisorActionsService")).default; // fix 2026-07-10: await import (ESM) evita whatsapp-rust-bridge al arrastrar queues

          // Guardar el mensaje de escalada
          await SupervisorActionsService.saveAgentMessage({
            ticketId: ticket.id,
            companyId,
            content: aiResponse.message,
            agentUsed: aiResponse.agentUsed,
            intent: aiResponse.intent,
            confidence: aiResponse.confidence
          });

          // Derivar a cola humana
          await SupervisorActionsService.escalateToHuman(
            ticket.id,
            companyId,
            whatsapp?.id,
            aiResponse.escalationReason
          );

          // Mensaje de escalada
          const escalationMsg =
            "Te comunicamos con un asesor humano. En breve te atenderán. 🙋‍♂️";
          await sendMessageWithAntiBan(wbot, msg.key.remoteJid!, { text: escalationMsg }, "text");
          responseSent = true;

          logger.info(
            `[SupervisorAI] Escalado a humano: ticket=${ticket.id}, razón=${aiResponse.escalationReason}`
          );
          logAITurn({
            eventType: "send_result",
            eventStatus: "ok",
            reason: "escalated_to_human",
            metadata: { agentUsed: aiResponse.agentUsed, escalationReason: aiResponse.escalationReason }
          });
        } catch (escalationError: any) {
          logger.error(`[SupervisorAI] Error en escalada: ${escalationError.message}`);
          if (!responseSent) {
            await sendMessageWithAntiBan(
              wbot,
              msg.key.remoteJid!,
              { text: "Te comunicamos con un asesor humano. En breve te atenderán. 🙋‍♂️" },
              "text"
            );
            responseSent = true;
          }
        }
      } else {
        // ═══════════════════════════════════════════════════════════════
        // Guardar respuesta del agente IA en la BD + clasificar etapa
        // ═══════════════════════════════════════════════════════════════
        try {
          const SupervisorActionsService = (await import("../AIAgentServices/SupervisorActionsService")).default; // fix 2026-07-10: await import (ESM) evita whatsapp-rust-bridge al arrastrar queues

          // Guardar mensaje del agente + crear AIAgentLog + encolar FeedbackInferenceJob
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

        } catch (actionError: any) {
          logger.warn(`[SupervisorActions] Error guardando mensaje: ${actionError.message}`);
        }

        // Enviar respuesta del agente IA (delay 1.5s para evitar anti-ban)
        await new Promise(resolve => setTimeout(resolve, 1500));
        await sendMessageWithAntiBan(wbot, msg.key.remoteJid!, { text: aiResponse.message }, "text");
        responseSent = true;
        logger.info(
          `[SupervisorAI] Respuesta enviada: ticket=${ticket.id}, agente=${aiResponse.agentUsed}, ` +
          `confianza=${aiResponse.confidence}, latencia=${aiResponse.totalLatencyMs}ms`
        );
        logAITurn({
          eventType: "send_result",
          eventStatus: "ok",
          reason: "ai_response_sent",
          inputTokens: aiResponse.totalTokens?.input || 0,
          outputTokens: aiResponse.totalTokens?.output || 0,
          metadata: { agentUsed: aiResponse.agentUsed, intent: aiResponse.intent }
        });

        let kanbanStageResult: any = null;
        try {
          const SupervisorActionsService = (await import("../AIAgentServices/SupervisorActionsService")).default; // fix 2026-07-10: await import (ESM) evita whatsapp-rust-bridge al arrastrar queues
          kanbanStageResult = await SupervisorActionsService.classifyTicketStageAfterReplySent(
            ticket.id,
            companyId,
            aiResponse.intent,
            aiResponse.agentUsed,
            { conversionSource: "orchestrator_reply_sent_whatsapp" }
          );
          logger.info(
            `[SupervisorAI] Kanban post-envio resultado: ticket=${ticket.id} ` +
            `stage=${kanbanStageResult?.stage || "none"} moved=${kanbanStageResult?.moved || false} ` +
            `alreadyInStage=${kanbanStageResult?.alreadyInStage || false} ` +
            `fallback=${kanbanStageResult?.fallbackRecommended || false} ` +
            `reason=${kanbanStageResult?.skippedReason || "none"}`
          );
        } catch (stageError: any) {
          kanbanStageResult = { fallbackRecommended: true, skippedReason: "cheap_classifier_error" };
          logger.warn(`[SupervisorAI] Error clasificando Kanban post-envio: ${stageError.message}`);
        }

        try {
          const ZepMemoryService = require("../AIAgentServices/ZepMemoryService").default;
          ZepMemoryService.addConversationTurnAsync({
            companyId,
            ticketId: ticket.id,
            contactId: contact?.id,
            contactName: contact?.name,
            contactEmail: contact?.email,
            channel: "whatsapp",
            userMessage: body,
            assistantMessage: aiResponse.message,
            agentUsed: aiResponse.agentUsed,
            intent: aiResponse.intent
          });
        } catch (zepError: any) {
          logger.warn(`[SupervisorAI] Zep post-envio omitido: ${zepError.message}`);
        }

        if (kanbanStageResult?.fallbackRecommended) {
          try {
            const { enqueueStageClassifierJob } = await import("../../workers/stageClassifier.worker");
            const { getApiKeyWithFallback } = await import("../AIProviderService");
            const openAiApiKey = await getApiKeyWithFallback("openai", "OPENAI_API_KEY", companyId);

            if (openAiApiKey) {
              await enqueueStageClassifierJob({
                texto: body || aiResponse.message || "",
                ticketId: ticket.id,
                companyId,
                apiKey: openAiApiKey,
                contactName: contact?.name || "",
                lastClientMessage: body || "",
                assistantMessage: aiResponse.message || "",
                source: "orchestrator_reply_sent_whatsapp_fallback",
                fallbackReason: kanbanStageResult?.skippedReason || "unknown"
              });
              logger.info(
                `[SupervisorAI] StageClassifier fallback encolado: ticket=${ticket.id} ` +
                `reason=${kanbanStageResult?.skippedReason || "unknown"}`
              );
            } else {
              logger.warn(`[SupervisorAI] StageClassifier fallback omitido sin API key: ticket=${ticket.id}`);
            }
          } catch (classifierError: any) {
            logger.warn(`[SupervisorAI] Error encolando StageClassifier fallback: ${classifierError.message}`);
          }
        } else {
          logger.info(`[SupervisorAI] StageClassifier fallback omitido: ticket=${ticket.id}`);
        }

        // Enviar imágenes de QuickReplies matcheados (si tienen media)
        // NO repetir imágenes ya enviadas en este ticket
        const quickRepliesWithMedia = (aiResponse.metadata?.quickReplies || []) as Array<{
          shortcode: string; message: string; mediaPath?: string; mediaName?: string;
        }>;

        // Gate: NO enviar imágenes de QuickReply cuando:
        // 1. La respuesta del LLM es un fallback por error de red (metadata.isFallback)
        // 2. Se va a escalar (shouldEscalate) — no enviar catálogo si estamos cerrando con handoff
        // (El bloqueo por "primer mensaje" se hace aguas arriba en SupervisorService,
        // omitiendo la búsqueda de QuickReplies; así no se contamina el historial de envíos.)
        const isFallbackResponse = (aiResponse.metadata as any)?.isFallback === true;
        const willEscalate = aiResponse.shouldEscalate === true;
        const skipQuickReplyMedia = isFallbackResponse || willEscalate;

        if (quickRepliesWithMedia.length > 0 && skipQuickReplyMedia) {
          logger.info(
            `[SupervisorAI] QuickReply media omitido: ticket=${ticket.id}, ` +
            `fallback=${isFallbackResponse}, escalate=${willEscalate}`
          );
        }

        if (quickRepliesWithMedia.length > 0 && !skipQuickReplyMedia) {
          const path = require("path");
          const fs = require("fs");
          const publicDir = path.resolve(currentDir, "..", "..", "public");

          // Buscar qué imágenes ya se enviaron en este ticket para no repetir
          // Deduplicar por mediaPath (único por QuickReply) — más robusto que comparar caption
          const alreadySent = await Message.findAll({
            where: { ticketId: ticket.id, fromMe: true, mediaType: "image" },
            attributes: ["body", "mediaUrl"],
            raw: true
          });
          // Comparar por mediaPath (nombre del archivo) Y por shortcode en el body
          const sentMediaPaths = new Set(
            alreadySent.map((m: any) => m.mediaUrl || "").filter(Boolean)
          );
          const sentShortcodes = new Set(
            alreadySent
              .map((m: any) => {
                // Extraer shortcode del body: "Plan Gold ⭐" → buscar match con shortcode
                const body = (m.body || "").toLowerCase();
                return body;
              })
              .filter(Boolean)
          );

          for (const qr of quickRepliesWithMedia) {
            if (!qr.mediaPath) continue;

            // Verificar si ya se envió por mediaPath O por contenido similar
            const alreadySentByPath = sentMediaPaths.has(qr.mediaPath);
            const alreadySentByContent = Array.from(sentShortcodes).some(
              sent => sent.includes(qr.shortcode.toLowerCase()) ||
                      (qr.message && sent.includes(qr.message.substring(0, 30).toLowerCase()))
            );

            if (alreadySentByPath || alreadySentByContent) {
              logger.info(`[SupervisorAI] QuickReply /${qr.shortcode} ya enviado en este ticket (path=${alreadySentByPath}, content=${alreadySentByContent}), omitiendo`);
              continue;
            }

            const filePath = path.join(publicDir, `company${companyId}`, "quickMessage", qr.mediaPath);

            if (fs.existsSync(filePath)) {
              await new Promise(resolve => setTimeout(resolve, 1500));
              try {
                await sendMessageWithAntiBan(
                  wbot,
                  msg.key.remoteJid!,
                  { image: { url: filePath }, caption: qr.message || "" },
                  "media"
                );
                logger.info(`[SupervisorAI] QuickReply media enviado: /${qr.shortcode} → ${qr.mediaName}`);
              } catch (mediaErr: any) {
                logger.warn(`[SupervisorAI] Error enviando media /${qr.shortcode}: ${mediaErr.message}`);
              }
            } else {
              logger.warn(`[SupervisorAI] Archivo no encontrado: ${filePath}`);
            }
          }
        }
      }
    } catch (err) {
      logger.error(`[SupervisorAI] Error procesando msg ticket=${ticket.id}: ${err.message}`);
      logAITurn({ eventType: "turn_failed", eventStatus: "error", reason: err?.message || "unknown_error" });
      const AIExecutionGuardService = require("../AIAgentServices/AIExecutionGuardService").default;
      if (AIExecutionGuardService.isAIExecutionBillingError(err)) {
        logger.warn(
          `[SupervisorAI] Error de saldo/créditos, no se envía fallback al cliente: ticket=${ticket.id}, error=${err.message}`
        );
        try {
          await ticket.update({ aiStatus: 'handoff', status: "pending" });
        } catch (updateErr: any) {
          logger.error(`[SupervisorAI] Error actualizando ticket a pending: ${updateErr.message}`);
        }
        return;
      }
      // Solo enviar fallback genérico si NO se envió una respuesta IA previamente
      if (!responseSent) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        await sendMessageWithAntiBan(
          wbot,
          msg.key.remoteJid!,
          { text: "Disculpa, estoy teniendo dificultades técnicas. Un asesor te atenderá pronto. 🙏" },
          "text"
        );
      } else {
        logger.warn(`[SupervisorAI] Respuesta ya fue enviada, NO se envía fallback duplicado: ticket=${ticket.id}`);
      }
      try {
        await ticket.update({ aiStatus: 'handoff', status: "pending" });
      } catch (updateErr: any) {
        logger.error(`[SupervisorAI] Error actualizando ticket a pending: ${updateErr.message}`);
      }
    }
    return;
  } else if (queueIntegration.type === "flowbuilder") {
    if (!isMenu) {
      const integrations = await ShowQueueIntegrationService(
        ticket.whatsapp?.integrationId,
        companyId
      );
      await flowbuilderIntegration(
        msg,
        wbot,
        companyId,
        integrations,
        ticket,
        contact,
        isFirstMsg
      );
    } else {
      if (
        !isNaN(parseInt(ticket.lastMessage)) &&
        ticket.status !== "open" &&
        ticket.status !== "closed"
      ) {
        await flowBuilderQueue(
          ticket,
          msg,
          wbot,
          whatsapp,
          companyId,
          contact,
          isFirstMsg
        );
      }
    }
  }
};

const flowBuilderQueue = async (
  ticket: Ticket,
  msg: proto.IWebMessageInfo,
  wbot: Session,
  whatsapp: Whatsapp,
  companyId: number,
  contact: Contact,
  isFirstMsg: Ticket
) => {
  const body = getBodyMessage(msg);

  const flow = await FlowBuilderModel.findOne({
    where: { id: ticket.flowStopped, active: true }
  });

  const mountDataContact = {
    number: contact.number,
    name: contact.name,
    email: contact.email
  };

  const nodes: INodes[] = flow.flow["nodes"];
  const connections: IConnections[] = flow.flow["connections"];

  if (!ticket.lastFlowId) {
    return;
  }

  if (
    ticket.status === "closed" ||
    ticket.status === "interrupted" ||
    ticket.status === "open"
  ) {
    return;
  }
  await ActionsWebhookService(
    whatsapp.id,
    parseInt(ticket.flowStopped),
    ticket.companyId,
    nodes,
    connections,
    String(ticket.lastFlowId),
    null,
    "",
    "",
    body,
    ticket.id,
    mountDataContact,
    msg
  );

  //const integrations = await ShowQueueIntegrationService(ticket.whatsapp?.integrationId, companyId);
  //await handleMessageIntegration(msg, wbot, companyId, integrations, ticket, contact, isFirstMsg)
};







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
  sendMessageWithAntiBan // 🛡️ Exportar función anti-ban
};
