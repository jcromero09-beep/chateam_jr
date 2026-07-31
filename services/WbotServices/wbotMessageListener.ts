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
import { resolveUnreadCount, messageHasMedia, resolveMetaCoexistence, persistIncomingMessage, createOrFindTicket, resolveCompanySettings, recordCampaignAttribution, handleFlowBuilderQuestion } from "./wbotMessageIngest";
import { getContactMessage } from "./wbotContactResolver";
import { verifyRating } from "./wbotRating";
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

const normalizeBaileysAck = (
  status: string | number | null | undefined,
  fallback: number | undefined = 1
): number | undefined => {
  if (status === null || status === undefined) return fallback;

  if (typeof status === "string") {
    switch (status.toUpperCase()) {
      case "PENDING":
      case "SERVER_ACK":
        return 1;
      case "DELIVERY_ACK":
        return 2;
      case "READ":
        return 3;
      case "PLAYED":
        return 4;
      case "ERROR":
        return 0;
      default:
        return fallback;
    }
  }

  if (!Number.isFinite(status)) return fallback;

  // Baileys proto.WebMessageInfo.Status:
  // 1=PENDING, 2=SERVER_ACK, 3=DELIVERY_ACK, 4=READ, 5=PLAYED.
  // UI/app ack: 1=sent/server accepted, 2=delivered, 3=read, 4=played.
  switch (status) {
    case 0:
      return 0;
    case 1:
    case 2:
      return 1;
    case 3:
      return 2;
    case 4:
      return 3;
    case 5:
      return 4;
    default:
      return fallback;
  }
};

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

const isMessageEditPayload = (message: any): boolean =>
  Boolean(getEditProtocolMessage(message) || message?.editedMessage);

const isSecretEncryptedEditPayload = (message: any): boolean => {
  const secretEncryptedMessage = message?.secretEncryptedMessage;
  const secretEncType = secretEncryptedMessage?.secretEncType;

  return secretEncType === 2 || secretEncType === "MESSAGE_EDIT";
};

const hasPossibleEditShape = (message: any): boolean =>
  Boolean(
    isSecretEncryptedEditPayload(message) ||
    isMessageEditPayload(message)
  );

const summarizeForMessageEditLog = (value: any, depth = 0): any => {
  if (value === null || value === undefined) return value;
  if (depth > 5) return "[max-depth]";

  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return `[buffer:${value.length}]`;
  if (value instanceof Uint8Array) return `[uint8array:${value.length}]`;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map(item => summarizeForMessageEditLog(item, depth + 1));
  }
  if (typeof value !== "object") return value;

  return Object.entries(value).reduce((acc, [key, nested]) => {
    acc[key] = summarizeForMessageEditLog(nested, depth + 1);
    return acc;
  }, {} as Record<string, any>);
};

const logMessageEditProbe = (
  source: "messages.update" | "messages.upsert",
  companyId: number,
  payload: any
): void => {
  try {
    const raw = JSON.stringify(summarizeForMessageEditLog(payload));
    logWarn(
      `[MessageEditProbe] source=${source} companyId=${companyId} payload=${raw.slice(0, 6000)}`
    );
  } catch (err: any) {
    logWarn(
      `[MessageEditProbe] source=${source} companyId=${companyId} stringify_error=${err?.message || err}`
    );
  }
};

const logMessageEditFailure = (
  reason: string,
  companyId: number,
  payload: Record<string, any>
): void => {
  try {
    const raw = JSON.stringify(summarizeForMessageEditLog(payload));
    logWarn(
      `[MessageEditFailure] reason=${reason} companyId=${companyId} payload=${raw.slice(0, 6000)}`
    );
  } catch (err: any) {
    logWarn(
      `[MessageEditFailure] reason=${reason} companyId=${companyId} stringify_error=${err?.message || err}`
    );
  }
};

const parseMessageDataJson = (dataJson: string | null): any => {
  if (!dataJson) return null;

  try {
    return JSON.parse(dataJson);
  } catch (_err) {
    return null;
  }
};

const toBuffer = (value: any): Buffer | null => {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value, "base64");
  if (Array.isArray(value)) return Buffer.from(value);
  if (typeof value === "object" && Array.isArray(value.data)) {
    return Buffer.from(value.data);
  }

  return null;
};

const buildMessageSecretKey = (
  modificationType: string,
  originalWid: string,
  originalSender: string,
  modificationSender: string,
  originalMessageSecret: Buffer
): Buffer => {
  const useCaseSecret = Buffer.concat([
    Buffer.from(originalWid, "utf8"),
    Buffer.from(originalSender, "utf8"),
    Buffer.from(modificationSender, "utf8"),
    Buffer.from(modificationType, "utf8")
  ]);

  return Buffer.from(
    hkdf(originalMessageSecret, 32, { info: useCaseSecret.toString("latin1") })
  );
};

const decryptSecretEncryptedEdit = (
  secretEncryptedMessage: any,
  originalMessage: Message,
  incomingKey: any
): proto.IMessage | null => {
  const originalData = parseMessageDataJson(originalMessage.dataJson);
  const originalWid = secretEncryptedMessage?.targetMessageKey?.id;
  const originalMessageSecret = toBuffer(
    originalData?.message?.messageContextInfo?.messageSecret
  );
  const encPayload = toBuffer(secretEncryptedMessage?.encPayload);
  const encIv = toBuffer(secretEncryptedMessage?.encIv);

  if (!originalWid || !originalMessageSecret || !encPayload || !encIv) {
    return null;
  }

  const originalKey = originalData?.key || {};
  const originalJidCandidates = Array.from(
    new Set(
      [
        originalKey.remoteJid,
        originalKey.remoteJidAlt,
        originalKey.participant,
        originalMessage.remoteJid,
        secretEncryptedMessage?.targetMessageKey?.remoteJid,
        incomingKey?.remoteJid,
        incomingKey?.remoteJidAlt
      ].filter((value): value is string => typeof value === "string" && value.includes("@"))
    )
  );

  for (const originalSender of originalJidCandidates) {
    for (const modificationSender of originalJidCandidates) {
      try {
        const key = buildMessageSecretKey(
          "Message Edit",
          originalWid,
          originalSender,
          modificationSender,
          originalMessageSecret
        );
        const decrypted = aesDecryptGCM(encPayload, key, encIv, Buffer.alloc(0));
        const decoded = proto.Message.decode(decrypted);
        const protocolMessage = decoded?.protocolMessage;

        if (
          protocolMessage?.type === proto.Message.ProtocolMessage.Type.MESSAGE_EDIT &&
          protocolMessage?.key?.id === originalWid &&
          protocolMessage?.editedMessage
        ) {
          logInfo(
            `[MessageEdit] secret_encrypted_decrypted messageId=${originalMessage.id} wid=${originalWid} originalSender=${originalSender} modificationSender=${modificationSender}`
          );
          return decoded;
        }
      } catch (_err) {
        // Try next JID combination. AES-GCM auth failure is expected for wrong candidates.
      }
    }
  }

  return null;
};

const handleSecretEncryptedMessageEdit = async (
  message: proto.IWebMessageInfo | WAMessageUpdate,
  companyId: number
): Promise<boolean> => {
  const editMessage =
    (message as WAMessageUpdate).update?.message ||
    (message as proto.IWebMessageInfo).message;
  const secretEncryptedMessage = editMessage?.secretEncryptedMessage;
  const originalWid = secretEncryptedMessage?.targetMessageKey?.id;

  if (!isSecretEncryptedEditPayload(editMessage)) return false;

  if (!originalWid) {
    logMessageEditFailure("secret_encrypted_missing_original_wid", companyId, {
      key: message.key,
      secretEncryptedMessage
    });
    return true;
  }

  const originalMessage = await Message.findOne({
    where: {
      wid: originalWid,
      companyId
    }
  });

  if (!originalMessage) {
    logMessageEditFailure("secret_encrypted_original_not_found", companyId, {
      key: message.key,
      originalWid,
      secretEncryptedMessage
    });
    return true;
  }

  const decodedMessage = decryptSecretEncryptedEdit(
    secretEncryptedMessage,
    originalMessage,
    message.key
  );

  if (!decodedMessage) {
    logMessageEditFailure("secret_encrypted_decrypt_failed", companyId, {
      key: message.key,
      originalWid,
      originalMessageId: originalMessage.id,
      hasOriginalDataJson: Boolean(originalMessage.dataJson),
      secretEncryptedMessage
    });
    return true;
  }

  return handleMessageEditUpdate(
    {
      key: {
        ...message.key,
        id: originalWid
      },
      update: {
        message: decodedMessage
      }
    } as WAMessageUpdate,
    companyId
  );
};

// extractEditedBody/OriginalWid/RemoteJids/Timestamp -> ./wbotMessageParsers (Tier 1)

const mergeMessageDataJson = (dataJson: string | null, patch: Record<string, any>): string => {
  let current: Record<string, any> = {};

  if (dataJson) {
    try {
      current = JSON.parse(dataJson);
    } catch (_err) {
      current = { rawDataJson: dataJson };
    }
  }

  return JSON.stringify({
    ...current,
    ...patch
  });
};

const findMessageEditFallback = async ({
  companyId,
  ticketId,
  remoteJids,
  editedAt,
  fromMe,
  include = undefined
}: {
  companyId: number;
  ticketId?: number;
  remoteJids: string[];
  editedAt: Date;
  fromMe?: boolean;
  include?: any;
}): Promise<Message | null> => {
  if (remoteJids.length === 0) return null;

  const windowStart = new Date(editedAt.getTime() - 30 * 60 * 1000);
  const windowEnd = new Date(editedAt.getTime() + 60 * 1000);
  const baseWhere: any = {
    companyId,
    remoteJid: { [Op.in]: remoteJids },
    createdAt: { [Op.between]: [windowStart, windowEnd] },
    messageStatus: { [Op.ne]: "deleted" }
  };

  if (ticketId) baseWhere.ticketId = ticketId;

  const fromMeCandidates = Array.from(
    new Set([fromMe, false, true].filter(value => typeof value === "boolean"))
  );

  for (const fromMeCandidate of fromMeCandidates) {
    const message = await Message.findOne({
      where: {
        ...baseWhere,
        fromMe: fromMeCandidate
      },
      include,
      order: [["createdAt", "DESC"]]
    });

    if (message) return message;
  }

  return null;
};

const handleMessageEditUpdate = async (
  messageUpdate: WAMessageUpdate,
  companyId: number
): Promise<boolean> => {
  const editMessage = (messageUpdate.update as any)?.message;
  if (isSecretEncryptedEditPayload(editMessage)) {
    return handleSecretEncryptedMessageEdit(messageUpdate, companyId);
  }

  if (!isMessageEditPayload(editMessage)) return false;

  const editedBody = extractEditedBody(editMessage);
  if (editedBody === null) {
    logMessageEditFailure("missing_body", companyId, {
      key: messageUpdate.key,
      updateKeys: Object.keys(messageUpdate.update || {}),
      protocolMessage: getEditProtocolMessage(editMessage),
      message: editMessage
    });
    return true;
  }

  const originalWid = extractEditedOriginalWid(
    messageUpdate.key,
    editMessage
  );
  if (!originalWid) {
    logMessageEditFailure("missing_original_wid", companyId, {
      key: messageUpdate.key,
      editedBodyPreview: editedBody.slice(0, 120),
      updateKeys: Object.keys(messageUpdate.update || {}),
      protocolMessage: getEditProtocolMessage(editMessage),
      message: editMessage
    });
    return true;
  }

  try {
    let messageToUpdate = await Message.findOne({
      where: {
        wid: originalWid,
        companyId
      },
      include: [
        {
          model: Ticket,
          as: "ticket",
          include: ["contact", "queue", "whatsapp"]
        },
        {
          model: Message,
          as: "quotedMsg",
          include: ["contact"]
        }
      ]
    });

    if (!messageToUpdate) {
      const remoteJids = extractEditedRemoteJids(messageUpdate.key, editMessage);
      const editedAt = extractEditedTimestamp(editMessage);
      logMessageEditFailure("direct_match_miss_trying_fallback", companyId, {
        originalWid,
        key: messageUpdate.key,
        remoteJids,
        editedAt: editedAt.toISOString(),
        editedBodyPreview: editedBody.slice(0, 120)
      });
      messageToUpdate = await findMessageEditFallback({
        companyId,
        remoteJids,
        editedAt,
        fromMe: Boolean(messageUpdate.key?.fromMe),
        include: [
          {
            model: Ticket,
            as: "ticket",
            include: ["contact", "queue", "whatsapp"]
          },
          {
            model: Message,
            as: "quotedMsg",
            include: ["contact"]
          }
        ]
      });

      if (messageToUpdate) {
        logWarn(
          `[MessageEdit] fallback_match originalWid=${originalWid} messageId=${messageToUpdate.id} fromMe=${messageToUpdate.fromMe} remoteJids=${remoteJids.join(",")}`
        );
      }
    }

    if (!messageToUpdate) {
      logMessageEditFailure("orphan", companyId, {
        originalWid,
        key: messageUpdate.key,
        remoteJids: extractEditedRemoteJids(messageUpdate.key, editMessage),
        editedAt: extractEditedTimestamp(editMessage).toISOString(),
        editedBodyPreview: editedBody.slice(0, 120),
        protocolMessage: getEditProtocolMessage(editMessage)
      });
      return true;
    }

    const editedAt = new Date().toISOString();
    await messageToUpdate.update({
      body: editedBody,
      isEdited: true,
      dataJson: mergeMessageDataJson(messageToUpdate.dataJson, {
        lastEdit: {
          source: "baileys.messages.update",
          editedAt,
          key: messageUpdate.key,
          update: (messageUpdate.update as any)?.message
        }
      })
    });

    const ticket = messageToUpdate.ticket;
    if (ticket) {
      await ticket.update({ lastMessage: editedBody });
      await ticket.reload();
    }

    await messageToUpdate.reload({
      include: [
        "contact",
        {
          model: Ticket,
          as: "ticket",
          include: ["contact", "queue", "whatsapp"]
        },
        {
          model: Message,
          as: "quotedMsg",
          include: ["contact"]
        }
      ]
    });

    const io = getIO();
    io.of(String(companyId)).emit(`company-${companyId}-appMessage`, {
      action: "update",
      message: {
        ...(messageToUpdate.get ? messageToUpdate.get({ plain: true }) : messageToUpdate),
        ticketId: messageToUpdate.ticketId
      },
      ticket: messageToUpdate.ticket,
      contact: messageToUpdate.ticket?.contact
    });

    if (messageToUpdate.ticket) {
      io.of(String(companyId)).emit(`company-${companyId}-ticket`, {
        action: "update",
        ticket: messageToUpdate.ticket
      });
    }

    logInfo(
      `[MessageEdit] updated messageId=${messageToUpdate.id} ticketId=${messageToUpdate.ticketId} wid=${originalWid}`
    );
    return true;
  } catch (err) {
    Sentry.captureException(err);
    logMessageEditFailure("handler_error", companyId, {
      key: messageUpdate.key,
      error: {
        name: (err as any)?.name,
        message: (err as any)?.message || String(err),
        stack: (err as any)?.stack
      }
    });
    logError(`Error handling message edit. Err: ${(err as any)?.message || err}`);
    return true;
  }
};

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

const getUnpackedMessage = (msg: proto.IWebMessageInfo) => {
  return (
    msg.message?.documentWithCaptionMessage?.message ||
    msg.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
    msg.message?.ephemeralMessage?.message ||
    msg.message?.viewOnceMessage?.message ||
    msg.message?.viewOnceMessageV2?.message ||
    msg.message?.ephemeralMessage?.message ||
    msg.message?.templateMessage?.hydratedTemplate ||
    msg.message?.templateMessage?.hydratedFourRowTemplate ||
    msg.message?.templateMessage?.fourRowTemplate ||
    msg.message?.interactiveMessage?.header ||
    msg.message?.highlyStructuredMessage?.hydratedHsm?.hydratedTemplate ||
    msg.message
  )
}
const getMessageMedia = (message: proto.IMessage) => {
  return (
    message?.imageMessage ||
    message?.audioMessage ||
    message?.videoMessage ||
    message?.stickerMessage ||
    message?.documentMessage || null
  );
}
const downloadMedia = async (msg: proto.IWebMessageInfo, isImported: Date = null, wbot: Session, ticket: Ticket) => {
  const unpackedMessage = getUnpackedMessage(msg);
  const message = getMessageMedia(unpackedMessage);
  if (!message) {
    return null;
  }
  //const fileLimit = parseInt(await CheckSettings1("downloadLimit", "15"), 10);
  // if (wbot && message?.fileLength && +message.fileLength > fileLimit * 1024 * 1024) {
  //   const fileLimitMessage = {
  //     text: `\u200e*Mensagem Automática*:\nNosso sistema aceita apenas arquivos com no máximo ${fileLimit} MiB`
  //   };
  //   const sendMsg = await wbot.sendMessage(
  //     `${ticket.contact.number}@${"s.whatsapp.net"}`,
  //     fileLimitMessage
  //   );
  //   sendMsg.message.extendedTextMessage.text = "\u200e*Mensagem do sistema*:\nArquivo recebido além do limite de tamanho do sistema, se for necessário ele pode ser obtido no aplicativo do whatsapp.";
  //   // eslint-disable-next-line no-use-before-define
  //   await verifyMessage(sendMsg, ticket, ticket.contact);
  //   throw new Error("ERR_FILESIZE_OVER_LIMIT");
  // }

  if (msg.message?.stickerMessage) {
    const urlAnt = "https://web.whatsapp.net";
    const directPath = msg.message?.stickerMessage?.directPath;
    const newUrl = "https://mmg.whatsapp.net";
    const final = newUrl + directPath;
    if (msg.message?.stickerMessage?.url?.includes(urlAnt)) {
      msg.message.stickerMessage.url = msg.message?.stickerMessage.url.replace(
        urlAnt,
        final
      );
    }
  }

  let buffer;
  try {
    buffer = await downloadMediaMessage(
      msg as WAMessage,
      "buffer",
      {},
      {
        logger,
        reuploadRequest: wbot.updateMediaMessage
      }
    );
  } catch (err) {
    if (isImported) {
       console.log(
        "Falha ao fazer o download de uma mensagem importada, provavelmente a mensagem já não esta mais disponível"
      );
    } else {
       console.error("Erro ao baixar mídia:", err);
    }
  }

  if (!buffer) {
    return null;
  }

  let filename = msg.message?.documentMessage?.fileName || "";

  const mineType =
    msg.message?.imageMessage ||
    msg.message?.audioMessage ||
    msg.message?.videoMessage ||
    msg.message?.stickerMessage ||
    msg.message?.ephemeralMessage?.message?.stickerMessage ||
    msg.message?.documentMessage ||
    msg.message?.documentWithCaptionMessage?.message?.documentMessage ||
    msg.message?.ephemeralMessage?.message?.audioMessage ||
    msg.message?.ephemeralMessage?.message?.documentMessage ||
    msg.message?.ephemeralMessage?.message?.videoMessage ||
    msg.message?.ephemeralMessage?.message?.imageMessage ||
    msg.message?.viewOnceMessage?.message?.imageMessage ||
    msg.message?.viewOnceMessage?.message?.videoMessage ||
    msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message
      ?.imageMessage ||
    msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message
      ?.videoMessage ||
    msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message
      ?.audioMessage ||
    msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message
      ?.documentMessage ||
    msg.message?.templateMessage?.hydratedTemplate?.imageMessage ||
    msg.message?.templateMessage?.hydratedTemplate?.documentMessage ||
    msg.message?.templateMessage?.hydratedTemplate?.videoMessage ||
    msg.message?.templateMessage?.hydratedFourRowTemplate?.imageMessage ||
    msg.message?.templateMessage?.hydratedFourRowTemplate?.documentMessage ||
    msg.message?.templateMessage?.hydratedFourRowTemplate?.videoMessage ||
    msg.message?.templateMessage?.fourRowTemplate?.imageMessage ||
    msg.message?.templateMessage?.fourRowTemplate?.documentMessage ||
    msg.message?.templateMessage?.fourRowTemplate?.videoMessage ||
    msg.message?.interactiveMessage?.header?.imageMessage ||
    msg.message?.interactiveMessage?.header?.documentMessage ||
    msg.message?.interactiveMessage?.header?.videoMessage;

  if (!filename) {
    const ext = mineType.mimetype.split("/")[1].split(";")[0];
    filename = `${new Date().getTime()}.${ext}`;
  } else {
    filename = `${new Date().getTime()}_${filename}`;
  }

  const media = {
    data: buffer,
    mimetype: mineType.mimetype,
    filename
  };

  return media;
};

const verifyContact = async (
  msgContact: IMe,
  wbot: Session,
  companyId: number
): Promise<Contact> => {
  const profilePicUrl: string = "";
  // try {
  //   profilePicUrl = await wbot.profilePictureUrl(msgContact.id, "image");
  // } catch (e) {
  //   Sentry.captureException(e);
  //   profilePicUrl = `${process.env.FRONTEND_URL}/nopicture.png`;
  // }

  // 📝 LOG: Ver datos crudos del contacto

  // Extract number from JID
  const rawNumber = msgContact.id.replace(/\D/g, "");

  // Validate if it's a LID (Meta internal ID) vs real phone number
  const isLID = msgContact.id?.includes("@lid");
  const isSWA = msgContact.id?.includes("@s.whatsapp.net");
  const isGroup = msgContact.id?.includes("@g.us");

  // Use number as name if name has no letters (only emojis, numbers, etc.)
  const rawName = msgContact.name || rawNumber;
  // Check if name has letters
  const hasLettersInName = /[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]/.test(rawName);
  const name = hasLettersInName ? rawName : rawNumber;

  // Determine channel based on JID format
  let channel = "whatsapp";
  if (isLID) {
    channel = "meta";
  }

  // ========== NUEVO: Extraer phoneNumberId cuando viene con @lid ==========
  // El número del LID (68616598909016) es el phoneNumberId del cliente
  let phoneNumberId = undefined;
  if (isLID && msgContact.id) {
    phoneNumberId = msgContact.id.replace("@lid", "");
  }

  const contactData = {
    name: name,
    number: rawNumber,
    profilePicUrl,
    isGroup,
    companyId,
    remoteJid: msgContact.id,
    whatsappId: wbot.id,
    wbot,
    channel, // Changed from hardcoded "whatsapp" to dynamic
    phoneNumberId // Extraído del LID
  };

  // 📝 LOG: Ver datos procesados

  if (contactData.isGroup) {
    contactData.number = msgContact.id.replace("@g.us", "");
  }

  const contact = await CreateOrUpdateContactService(contactData);

  return contact;
};

const verifyQuotedMessage = async (
  msg: proto.IWebMessageInfo
): Promise<Message | null> => {
  if (!msg) return null;
  const quoted = getQuotedMessageId(msg);

  if (!quoted) return null;

  const quotedMsg = await Message.findOne({
    where: { wid: quoted }
  });

  if (!quotedMsg) return null;

  return quotedMsg;
};

export const verifyMediaMessage = async (
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact,
  ticketTraking: TicketTraking,
  isForwarded: boolean = false,
  isPrivate: boolean = false,
  wbot: Session
): Promise<Message> => {
  const io = getIO();
  const quotedMsg = await verifyQuotedMessage(msg);
  const companyId = ticket.companyId;

  try {
    const media = await downloadMedia(msg, ticket?.imported, wbot, ticket);

    if (!media && ticket.imported) {
      const body =
        "*Sistema:*\nError en la descarga de medios, verificar dispositivo";
      const messageData = {
        //mensagem de texto
        wid: msg.key.id,
        ticketId: ticket.id,
        contactId: msg.key.fromMe ? undefined : ticket.contactId,
        body,
        reactionMessage: msg.message?.reactionMessage,
        fromMe: msg.key.fromMe,
        mediaType: getTypeMessage(msg),
        read: msg.key.fromMe,
        quotedMsgId: quotedMsg?.id || msg.message?.reactionMessage?.key?.id,
        ack: msg.status,
        companyId: companyId,
        remoteJid: msg.key.remoteJid,
        participant: msg.key.participant,
        timestamp: getTimestampMessage(msg.messageTimestamp),
        createdAt: new Date(
          Math.floor(getTimestampMessage(msg.messageTimestamp) * 1000)
        ).toISOString(),
        dataJson: JSON.stringify(msg),
        ticketImported: ticket.imported,
        isForwarded,
        isPrivate
      };

      await ticket.update({
        lastMessage: body
      });
      logError("ERR_WAPP_DOWNLOAD_MEDIA");
      return CreateMessageService({ messageData, companyId: companyId });
    }

    if (!media) {
      throw new Error("ERR_WAPP_DOWNLOAD_MEDIA");
    }

    if (!media.data) {
      throw new Error("ERR_WAPP_DOWNLOAD_MEDIA");
    }

    // if (!media.filename || media.mimetype === "audio/mp4") {
    //   const ext = media.mimetype === "audio/mp4" ? "m4a" : media.mimetype.split("/")[1].split(";")[0];
    //   media.filename = `${new Date().getTime()}.${ext}`;
    // } else {
    //   // ext = tudo depois do ultimo .
    //   const ext = media.filename.split(".").pop();
    //   // name = tudo antes do ultimo .
    //   const name = media.filename.split(".").slice(0, -1).join(".").replace(/\s/g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    //   media.filename = `${name.trim()}_${new Date().getTime()}.${ext}`;
    // }
    if (!media.filename) {
      const ext = media.mimetype.split("/")[1].split(";")[0];
      media.filename = `${new Date().getTime()}.${ext}`;
    } else {
      // ext = tudo depois do ultimo .
      const ext = media.filename.split(".").pop();
      // name = tudo antes do ultimo .
      const name = media.filename
        .split(".")
        .slice(0, -1)
        .join(".")
        .replace(/\s/g, "_")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      media.filename = `${name.trim()}_${new Date().getTime()}.${ext}`;
    }

    try {
      const folder = path.resolve(
        currentDir,
        "..",
        "..",
        "public",
        `company${companyId}`
      );

      // const folder = `public/company${companyId}`; // Correção adicionada por Altemir 16-08-2023
      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true }); // Correção adicionada por Altemir 16-08-2023
        fs.chmodSync(folder, 0o777);
      }

      await writeFile(
        join(folder, media.filename),
        media.data.toString("base64"),
        "base64"
      ) // Correção adicionada por Altemir 16-08-2023
        .then(() => {
          // // console.log("Arquivo salvo com sucesso!");
          if (media.mimetype.includes("audio")) {
            const inputFile = path.join(folder, media.filename);
            let outputFile: string;

            if (inputFile.endsWith(".mpeg")) {
              outputFile = inputFile.replace(".mpeg", ".ogg");
            } else if (inputFile.endsWith(".mp3")) {
              outputFile = inputFile.replace(".mp3", ".ogg");
            } else if (inputFile.endsWith(".ogg")) {
              // Ya es .ogg, no necesita conversión
              return;
            } else {
              // Intentar convertir otros formatos de audio a .ogg
              outputFile = inputFile.substring(0, inputFile.lastIndexOf('.')) + '.ogg';
            }

            return new Promise<void>((resolve, reject) => {
              ffmpeg(inputFile)
                .toFormat("ogg")
                .audioCodec("libopus") // Codec requerido por WhatsApp
                .save(outputFile)
                .on("end", () => {
                  // Actualizar media.filename para usar el archivo convertido
                  media.filename = path.basename(outputFile);
                  console.log(`✅ Audio convertido: ${inputFile} → ${outputFile}`);

                  // Opcional: eliminar archivo original
                  try {
                    fs.unlinkSync(inputFile);
                    console.log(`🗑️ Archivo original eliminado: ${inputFile}`);
                  } catch (err) {
                    console.warn(`⚠️ No se pudo eliminar archivo original: ${err.message}`);
                  }

                  resolve();
                })
                .on("error", (err: any) => {
                  console.error(`❌ Error convirtiendo audio ${inputFile} a ${outputFile}:`, err);
                  reject(err);
                });
            });
          }
        });
      // .then(() => {
      //   //// console.log("Conversão concluída!");
      //   // Aqui você pode fazer o que desejar com o arquivo MP3 convertido.
      // })
    } catch (err) {
      Sentry.setExtra("Erro media", {
        companyId: companyId,
        ticket,
        contact,
        media,
        quotedMsg
      });
      Sentry.captureException(err);
      logError(err);
    }

    const body = getBodyMessage(msg);

    const messageData = {
      wid: msg.key.id,
      ticketId: ticket.id,
      contactId: msg.key.fromMe ? undefined : contact.id,
      body: body || media.filename,
      fromMe: msg.key.fromMe,
      read: msg.key.fromMe,
      mediaUrl: media.filename,
      mediaType: media.mimetype.split("/")[0],
      quotedMsgId: quotedMsg?.id,
      ack:
        normalizeBaileysAck(msg.status) ?? 1,
      remoteJid: msg.key.remoteJid,
      participant: msg.key.participant,
      dataJson: JSON.stringify(msg),
      ticketTrakingId: ticketTraking?.id,
      createdAt: new Date(
        Math.floor(getTimestampMessage(msg.messageTimestamp) * 1000)
      ).toISOString(),
      ticketImported: ticket.imported,
      isForwarded,
      isPrivate
    };

    await ticket.update({
      lastMessage: body || media.filename
    });

    const newMessage = await CreateMessageService({
      messageData,
      companyId: companyId
    });

    if (!msg.key.fromMe && ticket.status === "closed") {
      await ticket.update({ status: "pending" });
      await ticket.reload({
        attributes: [
          "id",
          "uuid",
          "queueId",
          "isGroup",
          "channel",
          "status",
          "contactId",
          "useIntegration",
          "lastMessage",
          "updatedAt",
          "unreadMessages",
          "companyId",
          "whatsappId",
          "imported",
          "lgpdAcceptedAt",
          "amountUsedBotQueues",
          "useIntegration",
          "integrationId",
          "userId",
          "amountUsedBotQueuesNPS",
          "lgpdSendMessageAt",
          "isBot",
          "aiStatus"
        ],
        include: [
          { model: Queue, as: "queue" },
          { model: User, as: "user" },
          { model: Contact, as: "contact" },
          { model: Whatsapp, as: "whatsapp" }
        ]
      });

      io.of(String(companyId))
        // .to(ticket.status)
        //   .to(ticket.id.toString())
        .emit(`company-${companyId}-ticket`, {
          action: "update",
          ticket,
          ticketId: ticket.id
        });
    }

    return newMessage;
  } catch (error) {
    logWarn("Erro ao baixar media", { msg: JSON.stringify(msg) });
  }
};

export const verifyMessage = async (
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact,
  ticketTraking?: TicketTraking,
  isPrivate?: boolean,
  isForwarded: boolean = false
) => {
  // // console.log("Mensagem recebida:", JSON.stringify(msg, null, 2));
  const io = getIO();
  const quotedMsg = await verifyQuotedMessage(msg);
  const body = getBodyMessage(msg);
  const companyId = ticket.companyId;

  // DEDUPLICACIÓN: Si el mensaje viene de WhatsApp (fromMe), verificar si ya existe
  // un mensaje con wid "pending_xxx" para el mismo ticket y cuerpo. Esto evita duplicados
  // cuando MessageController crea el mensaje primero (pending_xxx) y luego llega el
  // mensaje real de WhatsApp con el ID verdadero.
  let existingPendingMessage = null;
  if (msg.key.fromMe && msg.key.id) {
    existingPendingMessage = await Message.findOne({
      where: {
        ticketId: ticket.id,
        body: body,
        fromMe: true,
        wid: { [Op.like]: 'pending_%' },
        companyId
      }
    });
    if (existingPendingMessage) {
      console.log(`[verifyMessage] Mensaje pending previo ID=${existingPendingMessage.id}, actualizando wid a ${msg.key.id}`);
      await existingPendingMessage.update({
        wid: msg.key.id,
        dataJson: JSON.stringify(msg),
        messageStatus: 'sent',
        sentAt: new Date()
      });
    }
  }

  const messageData = {
    wid: msg.key.id,
    ticketId: ticket.id,
    contactId: msg.key.fromMe ? undefined : contact.id,
    body,
    fromMe: msg.key.fromMe,
    mediaType: getTypeMessage(msg),
    read: msg.key.fromMe,
    quotedMsgId: quotedMsg?.id,
    ack:
      normalizeBaileysAck(msg.status) ?? 1,
    remoteJid: msg.key.remoteJid,
    participant: msg.key.participant,
    dataJson: JSON.stringify(msg),
    ticketTrakingId: ticketTraking?.id,
    isPrivate,
    createdAt: new Date(
      Math.floor(getTimestampMessage(msg.messageTimestamp) * 1000)
    ).toISOString(),
    ticketImported: ticket.imported,
    isForwarded
  };

  await ticket.update({
    lastMessage: body
  });

  await CreateMessageService({ messageData, companyId: companyId });

  if (!msg.key.fromMe && ticket.status === "closed") {
    await ticket.update({ status: "pending" });
    await ticket.reload({
      include: [
        { model: Queue, as: "queue" },
        { model: User, as: "user" },
        { model: Contact, as: "contact" },
        { model: Whatsapp, as: "whatsapp" }
      ]
    });

    // io.to("closed").emit(`company-${companyId}-ticket`, {
    //   action: "delete",
    //   ticket,
    //   ticketId: ticket.id
    // });

    if (!ticket.imported) {
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

interface VerifyQueueCtx {
  wbot: Session; ticket: Ticket; contact: Contact; settings: any; ticketTraking: TicketTraking;
  companyId: number; queues: any; greetingMessage: any; maxUseBotQueues: any; timeUseBotQueues: any;
  chatbot: boolean; enableQueuePosition: boolean; choosenQueue: any; randomUserId: any;
}

// [Refactor Ola 4] botText extraído de las closures de verifyQueue a función módulo-nivel.
// Recibe VerifyQueueCtx explícito (14 vars verificadas por tests/harness/wbotClosureFreeVars.cjs).
// Movimiento VERBATIM del cuerpo. verifyQueue construye el ctx y despacha.
async function botText(ctx: VerifyQueueCtx) {
  let { chatbot, choosenQueue, companyId, contact, enableQueuePosition, greetingMessage, maxUseBotQueues, queues, randomUserId, settings, ticket, ticketTraking, timeUseBotQueues, wbot } = ctx;


    if (choosenQueue || (queues.length === 1 && chatbot)) {
      // // console.log("entrou no choose", ticket.isOutOfHour, ticketTraking.chatbotAt)
      if (queues.length === 1) choosenQueue = queues[0];
      const queue = await Queue.findByPk(choosenQueue.id);


      if (ticket.isOutOfHour === false && ticketTraking.chatbotAt !== null) {
        await ticketTraking.update({
          chatbotAt: null
        });
        await ticket.update({
          amountUsedBotQueues: 0
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
        (ticket.amountUsedBotQueues < maxUseBotQueues ||
          maxUseBotQueues === 0) &&
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
              ticketTraking.chatbotAt.getMinutes() + Number(timeUseBotQueues)
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
            chatbotAt: null
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
                  text: body
                }
              );
            },
            1000,
            ticket.id
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
          amountUsedBotQueues: ticket.amountUsedBotQueues + 1
        });
        return;
      }

      await UpdateTicketService({
        ticketData: {
          // amountUsedBotQueues: 0,
          queueId: choosenQueue.id
        },
        // ticketData: { queueId: queues.length ===1 ? null : choosenQueue.id },
        ticketId: ticket.id,
        companyId
      });
      // }

      if (choosenQueue.chatbots.length > 0 && !ticket.isGroup) {
        let options = "";
        choosenQueue.chatbots.forEach((chatbot, index) => {
          options += `*[ ${index + 1} ]* - ${chatbot.name}\n`;
        });

        const body = formatBody(
          `\u200e ${choosenQueue.greetingMessage}\n\n${options}\n*[ # ]* Voltar para o menu principal\n*[ Sair ]* Encerrar atendimento`,
          ticket
        );

        const sentMessage = await wbot.sendMessage(
          `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,

          {
            text: body
          }
        );

        await verifyMessage(sentMessage, ticket, contact, ticketTraking);

        if (settings?.settingsUserRandom === "enabled") {
          await UpdateTicketService({
            ticketData: { userId: randomUserId },
            ticketId: ticket.id,
            companyId
          });
        }
      }

      if (
        !choosenQueue.chatbots.length &&
        choosenQueue.greetingMessage.length !== 0
      ) {
        const body = formatBody(
          `\u200e${choosenQueue.greetingMessage}`,
          ticket
        );
        const sentMessage = await wbot.sendMessage(
          `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
          {
            text: body
          }
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
            "public"
          );

          const files = await ShowFileService(
            choosenQueue.fileListId,
            ticket.companyId
          );

          const folder = path.resolve(
            publicFolder,
            `company${ticket.companyId}`,
            "fileList",
            String(files.id)
          );

          for (const [index, file] of files.options.entries()) {
            const mediaSrc = {
              fieldname: "medias",
              originalname: file.path,
              encoding: "7bit",
              mimetype: file.mediaType,
              filename: file.path,
              path: path.resolve(folder, file.path)
            } as Express.Multer.File;

            // const debouncedSentMessagePosicao = debounce(
            //   async () => {
            const sentMessage = await SendWhatsAppMedia({
              media: mediaSrc,
              ticket,
              body: `\u200e ${file.name}`,
              isPrivate: false,
              isForwarded: false
            });

            await verifyMediaMessage(
              sentMessage,
              ticket,
              ticket.contact,
              ticketTraking,
              false,
              false,
              wbot
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
              queueId: choosenQueue.id
              // sendFarewellMessage: false,
            },
            ticketId: ticket.id,
            companyId
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
          isGroup: false
        }
      });

      await CreateLogTicketService({
        ticketId: ticket.id,
        type: "queue",
        queueId: choosenQueue.id
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
                text: bodyFila
              }
            );
          },
          3000,
          ticket.id
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
            ticketTraking.chatbotAt.getMinutes() + Number(timeUseBotQueues)
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
          chatbotAt: null
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
        type: "chatBot"
      });

      await delay(1000);

      await wbot.sendPresenceUpdate("paused", contact.remoteJid);

      if (ticket.whatsapp.greetingMediaAttachment !== null) {

        const filePath = path.resolve(
          "public",
          `company${companyId}`,
          ticket.whatsapp.greetingMediaAttachment
        );

        const fileExists = fs.existsSync(filePath);
        // // console.log(fileExists);
        if (fileExists) {
          const messagePath = ticket.whatsapp.greetingMediaAttachment;
          const optionsMsg = await getMessageOptions(
            messagePath,
            filePath,
            String(companyId),
            body
          );


          const debouncedSentgreetingMediaAttachment = debounce(
            async () => {
              const sentMessage = await wbot.sendMessage(
                `${ticket.contact.number}@${
                  ticket.isGroup ? "g.us" : "s.whatsapp.net"
                }`,
                { ...optionsMsg }
              );

              await verifyMediaMessage(
                sentMessage,
                ticket,
                contact,
                ticketTraking,
                false,
                false,
                wbot
              );
            },
            1000,
            ticket.id
          );
          debouncedSentgreetingMediaAttachment();
        } else {
          const debouncedSentMessage = debounce(
            async () => {
              const sentMessage = await wbot.sendMessage(
                `${contact.number}@${
                  ticket.isGroup ? "g.us" : "s.whatsapp.net"
                }`,
                {
                  text: body
                }
              );

              await verifyMessage(sentMessage, ticket, contact, ticketTraking);
            },
            1000,
            ticket.id
          );
          debouncedSentMessage();
        }


        await UpdateTicketService({
          ticketData: {
            // amountUsedBotQueues: ticket.amountUsedBotQueues + 1
          },
          ticketId: ticket.id,
          companyId
        });

        return;
      } else {

        const debouncedSentMessage = debounce(
          async () => {
            const sentMessage = await wbot.sendMessage(
              `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
              {
                text: body
              }
            );

            await verifyMessage(sentMessage, ticket, contact, ticketTraking);
          },
          1000,
          ticket.id
        );

        await UpdateTicketService({
          ticketData: {},
          ticketId: ticket.id,
          companyId
        });

        debouncedSentMessage();
      }
    }
  
}

// [Refactor Ola 4] botList extraído a función módulo-nivel (VerifyQueueCtx). Movimiento VERBATIM.
async function botList(ctx: VerifyQueueCtx) {
  let { chatbot, choosenQueue, companyId, contact, enableQueuePosition, greetingMessage, maxUseBotQueues, queues, randomUserId, settings, ticket, ticketTraking, timeUseBotQueues, wbot } = ctx;



    if (choosenQueue || (queues.length === 1 && chatbot)) {
      // // console.log("entrou no choose", ticket.isOutOfHour, ticketTraking.chatbotAt)
      if (queues.length === 1) choosenQueue = queues[0]
      const queue = await Queue.findByPk(choosenQueue.id);


      if (ticket.isOutOfHour === false && ticketTraking.chatbotAt !== null) {
        await ticketTraking.update({
          chatbotAt: null
        });
        await ticket.update({
          amountUsedBotQueues: 0
        });
      }

      let currentSchedule;

      if (settings?.scheduleType === "queue") {
        currentSchedule = await VerifyCurrentSchedule(companyId, queue.id, 0);
      }

      if (
        settings?.scheduleType === "queue" && ticket.status !== "open" &&
        !isNil(currentSchedule) && (ticket.amountUsedBotQueues < maxUseBotQueues || maxUseBotQueues === 0)
        && (!currentSchedule || currentSchedule.inActivity === false)
        && (!ticket.isGroup || ticket.whatsapp?.groupAsTicket === "enabled")
      ) {
        if (timeUseBotQueues !== "0") {
          //Regra para desabilitar o chatbot por x minutos/horas após o primeiro envio
          //const ticketTraking = await FindOrCreateATicketTrakingService({ ticketId: ticket.id, companyId });
          const dataLimite = new Date();
          const Agora = new Date();


          if (ticketTraking.chatbotAt !== null) {
            dataLimite.setMinutes(ticketTraking.chatbotAt.getMinutes() + (Number(timeUseBotQueues)));

            if (ticketTraking.chatbotAt !== null && Agora < dataLimite && timeUseBotQueues !== "0" && ticket.amountUsedBotQueues !== 0) {
              return
            }
          }
          await ticketTraking.update({
            chatbotAt: null
          })
        }

        const outOfHoursMessage = queue.outOfHoursMessage;

        if (outOfHoursMessage !== "") {
          // // console.log("entrei3");
          const body = formatBody(`${outOfHoursMessage}`, ticket);


          const debouncedSentMessage = debounce(
            async () => {
              await wbot.sendMessage(
                `${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"
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
          amountUsedBotQueues: ticket.amountUsedBotQueues + 1
        });
        return;
      }

      await UpdateTicketService({
        ticketData: {
          // amountUsedBotQueues: 0, 
          queueId: choosenQueue.id
        },
        // ticketData: { queueId: queues.length ===1 ? null : choosenQueue.id },
        ticketId: ticket.id,
        companyId
      });
      // }

      if (choosenQueue.chatbots.length > 0 && !ticket.isGroup) {

        const sectionsRows = [];

        choosenQueue.chatbots.forEach((chatbot, index) => {
          sectionsRows.push({
            title: chatbot.name,
            rowId: `${index + 1}`
          });
        });
        sectionsRows.push({
          title: "Voltar Menu Inicial",
          rowId: "#"
        });
        const sections = [
          {
            title: 'Lista de Botões',
            rows: sectionsRows
          }
        ];

        const listMessage = {
          text: formatBody(`\u200e${queue.greetingMessage}\n`),
          title: "Lista\n",
          buttonText: "Clique aqui",
          //footer: ".",
          //listType: 2,
          sections
        };
        const sendMsg = await wbot.sendMessage(
          `${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
          listMessage
        );

        await verifyMessage(sendMsg, ticket, contact, ticketTraking);



        if (settings?.settingsUserRandom === "enabled") {
          await UpdateTicketService({
            ticketData: { userId: randomUserId },
            ticketId: ticket.id,
            companyId
          });
        }
      }

      if (!choosenQueue.chatbots.length && choosenQueue.greetingMessage.length !== 0) {
        const body = formatBody(
          `\u200e${choosenQueue.greetingMessage}`,
          ticket
        );
        const sentMessage = await wbot.sendMessage(
          `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
          {
            text: body
          }
        );

        await verifyMessage(sentMessage, ticket, contact, ticketTraking);

      }


      if (!isNil(choosenQueue.fileListId)) {
        try {

          const publicFolder = path.resolve(currentDir, "..", "..", "public");

          const files = await ShowFileService(choosenQueue.fileListId, ticket.companyId)

          const folder = path.resolve(publicFolder, `company${ticket.companyId}`, "fileList", String(files.id))

          for (const [index, file] of files.options.entries()) {
            const mediaSrc = {
              fieldname: 'medias',
              originalname: file.path,
              encoding: '7bit',
              mimetype: file.mediaType,
              filename: file.path,
              path: path.resolve(folder, file.path),
            } as Express.Multer.File

            // const debouncedSentMessagePosicao = debounce(
            //   async () => {
            const sentMessage = await SendWhatsAppMedia({ media: mediaSrc, ticket, body: `\u200e ${file.name}`, isPrivate: false, isForwarded: false });

            await verifyMediaMessage(sentMessage, ticket, ticket.contact, ticketTraking, false, false, wbot);
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

      await delay(4000)


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
          isGroup: false
        }
      });

      await CreateLogTicketService({
        ticketId: ticket.id,
        type: "queue",
        queueId: choosenQueue.id
      });

      if (enableQueuePosition && !choosenQueue.chatbots.length) {
        // Lógica para enviar posição da fila de atendimento
        const qtd = count.count === 0 ? 1 : count.count
        const msgFila = `${settings.sendQueuePositionMessage} *${qtd}*`;
        // const msgFila = `*Assistente Virtual:*\n{{ms}} *{{name}}*, sua posição na fila de atendimento é: *${qtd}*`;
        const bodyFila = formatBody(`${msgFila}`, ticket);
        const debouncedSentMessagePosicao = debounce(
          async () => {
            await wbot.sendMessage(
              `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"
              }`,
              {
                text: bodyFila
              }
            );
          },
          3000,
          ticket.id
        );
        debouncedSentMessagePosicao();
      }


    } else {

      if (ticket.isGroup) return;

      if (maxUseBotQueues && maxUseBotQueues !== 0 && ticket.amountUsedBotQueues >= maxUseBotQueues) {
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
          dataLimite.setMinutes(ticketTraking.chatbotAt.getMinutes() + (Number(timeUseBotQueues)));


          if (ticketTraking.chatbotAt !== null && Agora < dataLimite && timeUseBotQueues !== "0" && ticket.amountUsedBotQueues !== 0) {
            return
          }
        }
        await ticketTraking.update({
          chatbotAt: null
        })
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
          title: `${queue.name}`,//queue.name,
          description: `_`,
          rowId: `${index + 1}`
        });
      });

     sectionsRows.push({
          title: "Voltar Menu Inicial",
          rowId: "#"
        });
        
      await CreateLogTicketService({
        ticketId: ticket.id,
        type: "chatBot"
      });

      await delay(1000);
      const body = formatBody(
        `\u200e${greetingMessage}\n\n${options}`,
        ticket
      );

      await wbot.sendPresenceUpdate('paused', contact.remoteJid)

      if (ticket.whatsapp.greetingMediaAttachment !== null) {


        const filePath = path.resolve("public", `company${companyId}`, ticket.whatsapp.greetingMediaAttachment);

        const fileExists = fs.existsSync(filePath);
        // // console.log(fileExists);
        if (fileExists) {
          const messagePath = ticket.whatsapp.greetingMediaAttachment
          const optionsMsg = await getMessageOptions(messagePath, filePath, String(companyId), body);


          const debouncedSentgreetingMediaAttachment = debounce(
            async () => {

              const sentMessage = await wbot.sendMessage(`${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`, { ...optionsMsg });

              await verifyMediaMessage(sentMessage, ticket, contact, ticketTraking, false, false, wbot);

            },
            1000,
            ticket.id
          );
          debouncedSentgreetingMediaAttachment();
        } else {
          const debouncedSentMessage = debounce(
            async () => {
              const sections = [
                {
                  title: 'Lista de Botões',
                  rows: sectionsRows
                }
              ];

              const listMessage = {
                title: "Lista\n",
                text: formatBody(`\u200e${greetingMessage}\n`),
                buttonText: "Clique aqui",
                //footer: "_",
                sections
              };

              const sendMsg = await wbot.sendMessage(
                `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
                listMessage
              );

              await verifyMessage(sendMsg, ticket, contact, ticketTraking);

            },
            1000,
            ticket.id
          );
          debouncedSentMessage();
        }


        await UpdateTicketService({
          ticketData: {
            // amountUsedBotQueues: ticket.amountUsedBotQueues + 1 
          },
          ticketId: ticket.id,
          companyId
        });

        return
      } else {


        const debouncedSentMessage = debounce(
          async () => {
            const sections = [
              {
                title: 'Lista de Botões',
                rows: sectionsRows
              }
            ];

            const listMessage = {
              title: "Lista\n",
              text: formatBody(`\u200e${greetingMessage}\n`),
              buttonText: "Clique aqui",
              //footer: "_",
              sections
            };

            const sendMsg = await wbot.sendMessage(
              `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
              listMessage
            );

            await verifyMessage(sendMsg, ticket, contact, ticketTraking);
          },
          1000,
          ticket.id
        );

        await UpdateTicketService({
          ticketData: {

          },
          ticketId: ticket.id,
          companyId
        });

        debouncedSentMessage();
      }
    }
  
}

// [Refactor Ola 4] botButton extraído a función módulo-nivel (VerifyQueueCtx). Movimiento VERBATIM.
async function botButton(ctx: VerifyQueueCtx) {
  let { chatbot, choosenQueue, companyId, contact, enableQueuePosition, greetingMessage, maxUseBotQueues, queues, randomUserId, settings, ticket, ticketTraking, timeUseBotQueues, wbot } = ctx;



    if (choosenQueue || (queues.length === 1 && chatbot)) {
      // // console.log("entrou no choose", ticket.isOutOfHour, ticketTraking.chatbotAt)
      if (queues.length === 1) choosenQueue = queues[0]
      const queue = await Queue.findByPk(choosenQueue.id);


      if (ticket.isOutOfHour === false && ticketTraking.chatbotAt !== null) {
        await ticketTraking.update({
          chatbotAt: null
        });
        await ticket.update({
          amountUsedBotQueues: 0
        });
      }

      let currentSchedule;

      if (settings?.scheduleType === "queue") {
        currentSchedule = await VerifyCurrentSchedule(companyId, queue.id, 0);
      }

      if (
        settings?.scheduleType === "queue" && ticket.status !== "open" &&
        !isNil(currentSchedule) && (ticket.amountUsedBotQueues < maxUseBotQueues || maxUseBotQueues === 0)
        && (!currentSchedule || currentSchedule.inActivity === false)
        && (!ticket.isGroup || ticket.whatsapp?.groupAsTicket === "enabled")
      ) {
        if (timeUseBotQueues !== "0") {
          //Regra para desabilitar o chatbot por x minutos/horas após o primeiro envio
          //const ticketTraking = await FindOrCreateATicketTrakingService({ ticketId: ticket.id, companyId });
          const dataLimite = new Date();
          const Agora = new Date();


          if (ticketTraking.chatbotAt !== null) {
            dataLimite.setMinutes(ticketTraking.chatbotAt.getMinutes() + (Number(timeUseBotQueues)));

            if (ticketTraking.chatbotAt !== null && Agora < dataLimite && timeUseBotQueues !== "0" && ticket.amountUsedBotQueues !== 0) {
              return
            }
          }
          await ticketTraking.update({
            chatbotAt: null
          })
        }

        const outOfHoursMessage = queue.outOfHoursMessage;

        if (outOfHoursMessage !== "") {
          // // console.log("entrei3");
          const body = formatBody(`${outOfHoursMessage}`, ticket);


          const debouncedSentMessage = debounce(
            async () => {
              await wbot.sendMessage(
                `${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"
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

        await ticket.update({
          queueId: queue.id,
          isOutOfHour: true,
          amountUsedBotQueues: ticket.amountUsedBotQueues + 1
        });
        return;
      }

      await UpdateTicketService({
        ticketData: {
          queueId: choosenQueue.id
        },
        ticketId: ticket.id,
        companyId
      });
      // }

      if (choosenQueue.chatbots.length > 0 && !ticket.isGroup) {
        const debouncedSentMessage = debounce(
          async () => {
            try {
              // Busca o número do WhatsApp associado ao ticket
              const whatsapp = await Whatsapp.findOne({ where: { id: ticket.whatsappId } });
              if (!whatsapp || !whatsapp.number) {
                throw new Error('Número de WhatsApp não encontrado');
              }
              const botNumber = whatsapp.number;

              const buttons = [];

              // Adiciona os chatbots como botões
              choosenQueue.chatbots.forEach((chatbot, index) => {
                buttons.push({
                  name: 'quick_reply',  // Substitua por 'quick_reply' se necessário, dependendo do contexto
                  buttonParamsJson: JSON.stringify({
                    display_text: chatbot.name,
                    id: `${index + 1}`
                  })
                });
              });

              buttons.push({
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                  display_text: "Voltar Menu Inicial",
                  id: "#"
                })
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
                          from: 'apiv2',
                          templateId: '4194019344155670',
                        }),
                      },
                    },
                  },
                },
              };
              const jid = `${contact.number}@${ticket.isGroup ? 'g.us' : 's.whatsapp.net'}`;
              const newMsg = generateWAMessageFromContent(jid, interactiveMsg, { userJid: botNumber, });
              await wbot.relayMessage(jid, newMsg.message!, { messageId: newMsg.key.id }
              );
              if (newMsg) {
                await wbot.upsertMessage(newMsg, 'notify');
              }
            } catch (error) {
               console.error('Erro ao enviar ou fazer upsert da mensagem:', error);
            }
          },
          1000,
          ticket.id
        );
        debouncedSentMessage();


        if (settings?.settingsUserRandom === "enabled") {
          await UpdateTicketService({
            ticketData: { userId: randomUserId },
            ticketId: ticket.id,
            companyId
          });
        }
      }

      if (!choosenQueue.chatbots.length && choosenQueue.greetingMessage.length !== 0) {
        const body = formatBody(
          `\u200e${choosenQueue.greetingMessage}`,
          ticket
        );
        const sentMessage = await wbot.sendMessage(
          `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
          {
            text: body
          }
        );

        await verifyMessage(sentMessage, ticket, contact, ticketTraking);

      }


      if (!isNil(choosenQueue.fileListId)) {
        try {

          const publicFolder = path.resolve(currentDir, "..", "..", "public");

          const files = await ShowFileService(choosenQueue.fileListId, ticket.companyId)

          const folder = path.resolve(publicFolder, `company${ticket.companyId}`, "fileList", String(files.id))

          for (const [index, file] of files.options.entries()) {
            const mediaSrc = {
              fieldname: 'medias',
              originalname: file.path,
              encoding: '7bit',
              mimetype: file.mediaType,
              filename: file.path,
              path: path.resolve(folder, file.path),
            } as Express.Multer.File

            // const debouncedSentMessagePosicao = debounce(
            //   async () => {
            const sentMessage = await SendWhatsAppMedia({ media: mediaSrc, ticket, body: `\u200e ${file.name}`, isPrivate: false, isForwarded: false });

            await verifyMediaMessage(sentMessage, ticket, ticket.contact, ticketTraking, false, false, wbot);
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

      await delay(4000)


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
          isGroup: false
        }
      });

      await CreateLogTicketService({
        ticketId: ticket.id,
        type: "queue",
        queueId: choosenQueue.id
      });

      if (enableQueuePosition && !choosenQueue.chatbots.length) {
        // Lógica para enviar posição da fila de atendimento
        const qtd = count.count === 0 ? 1 : count.count
        const msgFila = `${settings.sendQueuePositionMessage} *${qtd}*`;
        // const msgFila = `*Assistente Virtual:*\n{{ms}} *{{name}}*, sua posição na fila de atendimento é: *${qtd}*`;
        const bodyFila = formatBody(`${msgFila}`, ticket);
        const debouncedSentMessagePosicao = debounce(
          async () => {
            await wbot.sendMessage(
              `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"
              }`,
              {
                text: bodyFila
              }
            );
          },
          3000,
          ticket.id
        );
        debouncedSentMessagePosicao();
      }


    } else {

      if (ticket.isGroup) return;

      if (maxUseBotQueues && maxUseBotQueues !== 0 && ticket.amountUsedBotQueues >= maxUseBotQueues) {
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
          dataLimite.setMinutes(ticketTraking.chatbotAt.getMinutes() + (Number(timeUseBotQueues)));


          if (ticketTraking.chatbotAt !== null && Agora < dataLimite && timeUseBotQueues !== "0" && ticket.amountUsedBotQueues !== 0) {
            return
          }
        }
        await ticketTraking.update({
          chatbotAt: null
        })
      }

      wbot.presenceSubscribe(contact.remoteJid);


      const options = "";

      wbot.sendPresenceUpdate("composing", contact.remoteJid);


      const body = formatBody(
        `\u200e${greetingMessage}\n\n${options}`,
        ticket
      );

      await CreateLogTicketService({
        ticketId: ticket.id,
        type: "chatBot"
      });

      await delay(1000);

      await wbot.sendPresenceUpdate('paused', contact.remoteJid)

      if (ticket.whatsapp.greetingMediaAttachment !== null) {


        const filePath = path.resolve("public", `company${companyId}`, ticket.whatsapp.greetingMediaAttachment);

        const fileExists = fs.existsSync(filePath);
        // // console.log(fileExists);
        if (fileExists) {
          const debouncedSentgreetingMediaAttachment = debounce(
            async () => {
              try {
                const whatsapp = await Whatsapp.findOne({ where: { id: ticket.whatsappId } });
                if (!whatsapp || !whatsapp.number) {
                  throw new Error('Número de WhatsApp não encontrado');
                }
                const botNumber = whatsapp.number;

                const buttons = [];

                queues.forEach((queue, index) => {
                  buttons.push({
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({
                      display_text: queue.name,
                      id: `${index + 1}`
                    }),
                  });
                });

                buttons.push({
                  name: 'quick_reply',
                  buttonParamsJson: JSON.stringify({
                    display_text: "Encerrar atendimento",
                    id: "Sair"
                  }),
                });

                // Verifica se há uma mídia para enviar
                if (ticket.whatsapp.greetingMediaAttachment) {
                  const filePath = path.resolve("public", `company${companyId}`, ticket.whatsapp.greetingMediaAttachment);
                  const fileExists = fs.existsSync(filePath);

                  if (fileExists) {
                    // Carrega a imagem local
                    const imageMessageContent = await generateWAMessageContent(
                      { image: { url: filePath } }, // Caminho da imagem local
                      { upload: wbot.waUploadToServer! }
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
                              imageMessage,  // Anexa a imagem
                              hasMediaAttachment: true
                            },
                            nativeFlowMessage: {
                              buttons: buttons,
                              messageParamsJson: JSON.stringify({
                                from: 'apiv2',
                                templateId: '4194019344155670',
                              }),
                            },
                          },
                        },
                      },
                    };

                    const jid = `${contact.number}@${ticket.isGroup ? 'g.us' : 's.whatsapp.net'}`;
                    const newMsg = generateWAMessageFromContent(jid, interactiveMsg, { userJid: botNumber });
                    await wbot.relayMessage(jid, newMsg.message!, { messageId: newMsg.key.id });

                    if (newMsg) {
                      await wbot.upsertMessage(newMsg, 'notify');
                    }
                  }
                }
              } catch (error) {
                console.error('Erro ao enviar ou fazer upsert da mensagem:', error);
              }
            },
            1000,
            ticket.id
          );
          debouncedSentgreetingMediaAttachment();
        } else {
          const debouncedSentButton = debounce(
            async () => {
              try {
                const whatsapp = await Whatsapp.findOne({ where: { id: ticket.whatsappId } });
                if (!whatsapp || !whatsapp.number) {
                  throw new Error('Número de WhatsApp não encontrado');
                }
                const botNumber = whatsapp.number;

                const buttons = [];

                queues.forEach((queue, index) => {
                  buttons.push({
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({
                      display_text: queue.name,
                      id: `${index + 1}`
                    }),
                  });
                });

                buttons.push({
                  name: 'quick_reply',
                  buttonParamsJson: JSON.stringify({
                    display_text: "Encerrar atendimento",
                    id: "Sair"
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
                            from: 'apiv2',
                            templateId: '4194019344155670',
                          }),
                        },
                      },
                    },
                  },
                };

                const jid = `${contact.number}@${ticket.isGroup ? 'g.us' : 's.whatsapp.net'}`;
                const newMsg = generateWAMessageFromContent(jid, interactiveMsg, { userJid: botNumber });
                await wbot.relayMessage(jid, newMsg.message!, { messageId: newMsg.key.id });

                if (newMsg) {
                  await wbot.upsertMessage(newMsg, 'notify');
                }
              } catch (error) {
              }
            },
            1000,
            ticket.id
          );

          debouncedSentButton();
        }


        await UpdateTicketService({
          ticketData: {
          },
          ticketId: ticket.id,
          companyId
        });

        return
      } else {


        const debouncedSentButton = debounce(
          async () => {
            try {
              const whatsapp = await Whatsapp.findOne({ where: { id: ticket.whatsappId } });
              if (!whatsapp || !whatsapp.number) {
                throw new Error('Número de WhatsApp não encontrado');
              }
              const botNumber = whatsapp.number;

              const buttons = [];

              queues.forEach((queue, index) => {
                buttons.push({
                  name: 'quick_reply',
                  buttonParamsJson: JSON.stringify({
                    display_text: queue.name,
                    id: `${index + 1}`
                  }),
                });
              });

              buttons.push({
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                  display_text: "Encerrar atendimento",
                  id: "Sair"
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
                          from: 'apiv2',
                          templateId: '4194019344155670',
                        }),
                      },
                    },
                  },
                },
              };

              const jid = `${contact.number}@${ticket.isGroup ? 'g.us' : 's.whatsapp.net'}`;
              const newMsg = generateWAMessageFromContent(jid, interactiveMsg, { userJid: botNumber });
              await wbot.relayMessage(jid, newMsg.message!, { messageId: newMsg.key.id });

              if (newMsg) {
                await wbot.upsertMessage(newMsg, 'notify');
              }
            } catch (error) {
            }
          },
          1000,
          ticket.id
        );



        await UpdateTicketService({
          ticketData: {

          },
          ticketId: ticket.id,
          companyId
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
  ticketTraking?: TicketTraking
) => {
  const companyId = ticket.companyId;

  // // console.log("GETTING WHATSAPP VERIFY QUEUE", ticket.whatsappId, wbot.id)
  const { queues, greetingMessage, maxUseBotQueues, timeUseBotQueues, useAIOrchestrator } =
    await ShowWhatsAppService(wbot.id!, companyId);

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
        companyId
      );

      // 🛡️ Guard: si la integración es supervisor_ai y la conexión NO tiene
      // useAIOrchestrator, NO disparar la integración ni marcar el ticket.
      if (
        integrations?.type === "supervisor_ai" &&
        useAIOrchestrator !== true
      ) {
        logger.info(
          `[verifyQueue] supervisor_ai bloqueado por useAIOrchestrator=false en whatsappId=${wbot.id}`
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
          null
        );

        if (msg.key.fromMe) {

          await ticket.update({
            typebotSessionTime: moment().toDate(),
            useIntegration: true,
            integrationId: integrations.id
          });
        } else {
          await ticket.update({
            useIntegration: true,
            integrationId: integrations.id
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
          ticket.whatsapp.greetingMediaAttachment
        );

        const fileExists = fs.existsSync(filePath);

        if (fileExists) {
          const messagePath = ticket.whatsapp.greetingMediaAttachment;
          const optionsMsg = await getMessageOptions(
            messagePath,
            filePath,
            String(companyId),
            body
          );
          const debouncedSentgreetingMediaAttachment = debounce(
            async () => {
              const sentMessage = await wbot.sendMessage(
                `${ticket.contact.number}@${
                  ticket.isGroup ? "g.us" : "s.whatsapp.net"
                }`,
                { ...optionsMsg }
              );

              await verifyMediaMessage(
                sentMessage,
                ticket,
                contact,
                ticketTraking,
                false,
                false,
                wbot
              );
            },
            1000,
            ticket.id
          );
          debouncedSentgreetingMediaAttachment();
        } else {
          await wbot.sendMessage(
            `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
            {
              text: body
            }
          );
        }
      } else {
        await wbot.sendMessage(
          `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
          {
            text: body
          }
        );
      }
    }

    if (!isNil(queues[0].fileListId)) {
      try {
        const publicFolder = path.resolve(currentDir, "..", "..", "public");

        const files = await ShowFileService(
          queues[0].fileListId,
          ticket.companyId
        );

        const folder = path.resolve(
          publicFolder,
          `company${ticket.companyId}`,
          "fileList",
          String(files.id)
        );

        for (const [index, file] of files.options.entries()) {
          const mediaSrc = {
            fieldname: "medias",
            originalname: file.path,
            encoding: "7bit",
            mimetype: file.mediaType,
            filename: file.path,
            path: path.resolve(folder, file.path)
          } as Express.Multer.File;

          await SendWhatsAppMedia({
            media: mediaSrc,
            ticket,
            body: file.name,
            isPrivate: false,
            isForwarded: false
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
          queueId: queues[0].id
          // sendFarewellMessage: false
        },
        ticketId: ticket.id,
        companyId
      });

      return;
    } else {
      await UpdateTicketService({
        ticketData: {
          queueId: queues[0].id,
          status: ticket.status === "lgpd" ? "pending" : ticket.status
        },
        ticketId: ticket.id,
        companyId
      });
    }

    const count = await Ticket.findAndCountAll({
      where: {
        userId: null,
        status: "pending",
        companyId,
        queueId: queues[0].id,
        isGroup: false
      }
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
              text: bodyFila
            }
          );
        },
        3000,
        ticket.id
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
        status: "pending"
      });

    await ticket.reload();
  }

  if (String(selectedOption).toLocaleLowerCase() == "sair") {
    // Encerra atendimento


    const ticketData = {
      isBot: false,
      status: "closed",
      sendFarewellMessage: true,
      maxUseBotQueues: 0
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

  let choosenQueue =
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

  const verifyQueueCtx: VerifyQueueCtx = { chatbot, choosenQueue, companyId, contact, enableQueuePosition, greetingMessage, maxUseBotQueues, queues, randomUserId, settings, ticket, ticketTraking, timeUseBotQueues, wbot };

  // [Refactor Ola 4] Observabilidad del dispatch (verifyQueue no logueaba nada).
  // Confirma qué rama extraída corre por mensaje real (sonda de cierre de Ola 4).
  logger.info(
    `[verifyQueue] dispatch typeBot=${typeBot} queues=${queues.length} company=${companyId} ticket=${ticket.id}`
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





const checkInboundDedupe = async (
  msg: proto.IWebMessageInfo,
  companyId: number
): Promise<{ drop: boolean; ledgerEntryId: number | null }> => {
  // [Tier 11] Slice in-situ: dedupe pre-procesamiento via InboundEventLedger (comportamiento preservado).
  if (!(msg.key.id && companyId)) return { drop: false, ledgerEntryId: null };
  const providerKey: "baileys" | "baileys_fromme" = msg.key.fromMe ? "baileys_fromme" : "baileys";
  const ledger = await InboundEventLedgerService.registerOrDrop({
    companyId,
    provider: providerKey,
    eventKey: msg.key.id,
    providerMessageId: msg.key.id,
    payload: { id: msg.key.id, remoteJid: msg.key.remoteJid, fromMe: msg.key.fromMe }
  });
  if (!ledger.accepted) {
    coexLogInbound({
      provider: "baileys",
      companyId,
      wid: msg.key.id,
      remoteJid: msg.key.remoteJid || null,
      fromMe: !!msg.key.fromMe,
      sourceChannel: "baileys",
      outcome: ledger.reason === "duplicate" ? "duplicate" : "dropped",
      reason: `ledger.${ledger.reason}`
    });
    return { drop: true, ledgerEntryId: null };
  }
  return { drop: false, ledgerEntryId: ledger.id };
};

const recordCoexistenceBinding = async (params: {
  coexConversationId: any; companyId: number; contact: any; whatsapp: any;
  msg: proto.IWebMessageInfo; coexCanonicalNumber: any; ticket: any;
}): Promise<void> => {
  // [Tier 11] Slice in-situ: binding de conversacion unificada (side-effects, defensa en profundidad).
  const { coexConversationId, companyId, contact, whatsapp, msg, coexCanonicalNumber, ticket } = params;
  try {
    if (coexConversationId) {
      await ConversationResolverService.upsertBinding({
        conversationId: coexConversationId,
        companyId,
        contactId: (contact as any).id,
        whatsappId: (whatsapp as any)?.id ?? null,
        provider: "baileys",
        providerIdentifier: msg.key.remoteJid || coexCanonicalNumber || ""
      });
      await ConversationResolverService.recordInbound(coexConversationId, "baileys");
      if (!(ticket as any).conversationId) {
        try {
          await (ticket as any).update({ conversationId: coexConversationId, inboundChannelHint: "baileys" });
        } catch (linkErr: any) {
          logError(`[Baileys] no se pudo enlazar ticket ${ticket.id} con conversacion: ${linkErr?.message}`);
        }
      }
    }
  } catch (convErr: any) {
    logError(`[Baileys] error en upsertBinding/recordInbound: ${convErr?.message}`);
  }
};

// [Refactor Ola 4] Cuerpo de handleMessage (dentro del callback de runWithTrace)
// extraído a función módulo-nivel. Movimiento VERBATIM: los return; ya estaban
// scopeados al callback, así que su semántica se preserva. handleMessage queda
// como guards + wrapper de trace. Free-vars: msg, wbot, companyId, isImported.
/**
 * Contrato de salida de la fase de resolución. Son los ÚNICOS locales de esa
 * fase que consume el resto de handleMessageInner (medido, no supuesto: el
 * resto —msgContact, groupContact, tagsId, enableLGPD, baileysLedgerEntryId,
 * coexConversationId, coexCanonicalNumber, mutex, linkedMeta— no se lee después).
 * Ninguno se reasigna aguas abajo, así que el destructure puede ser const.
 */
interface TicketContext {
  queueId: number;
  userId: number;
  bodyMessage: string;
  msgType: string;
  hasMedia: boolean;
  isGroup: boolean;
  whatsapp: any;
  contact: any;
  unreadMessages: number;
  settings: any;
  isFirstMsg: any;
  ticket: any;
}

/**
 * Fase de resolución de handleMessageInner: valida el mensaje, resuelve
 * contacto / conexión / conversación / ticket, y aplica los cinco descartes
 * (fromMe no procesable, tipo no soportado, grupo no permitido, coexistencia
 * Meta y dedupe del ledger).
 *
 * Devuelve `null` cuando el mensaje debe descartarse: cada `return;` del cuerpo
 * original es ahora una señal explícita. Es el único tramo que NO es movimiento
 * verbatim, y por eso está cubierto por el golden-master
 * (tests/harness/handleMessage.dbtest.ts) antes de tocarlo.
 *
 * Se llama DENTRO del try de handleMessageInner, así que el manejo de errores
 * no cambia: lo que lance sigue cayendo en el mismo catch.
 */
async function resolveTicketContext(
  msg: proto.IWebMessageInfo,
  wbot: Session,
  companyId: number,
  isImported: boolean
): Promise<TicketContext | null> {
    let msgContact: IMe;
    let groupContact: Contact | undefined;
    const queueId: number = null;
    const tagsId: number = null;
    const userId: number = null;

    const bodyMessage = getBodyMessage(msg);
    const msgType = getTypeMessage(msg);


    const hasMedia = messageHasMedia(msg);

    if (msg.key.fromMe) {
      if (/\u200e/.test(bodyMessage)) return null;


      if (
        !hasMedia &&
        msgType !== "conversation" &&
        msgType !== "extendedTextMessage" &&
        msgType !== "contactMessage" &&
        msgType !== "reactionMessage" &&
        msgType !== "ephemeralMessage" &&
        msgType !== "protocolMessage" &&
        msgType !== "viewOnceMessage" &&
        msgType !== "editedMessage" &&
        msgType !== "hydratedContentText"
      )
        return null;
      msgContact = await getContactMessage(msg, wbot);
    } else {
      msgContact = await getContactMessage(msg, wbot);
    }

    const isGroup = msg.key.remoteJid?.endsWith("@g.us");

    const whatsapp = await ShowWhatsAppService(wbot.id!, companyId);

    const { linkedMeta, shouldPreferMetaInbound, shouldPreferMetaOutbound } = await resolveMetaCoexistence(whatsapp);

    if (!whatsapp.allowGroup && isGroup) {
      return null;
    }

    if (isGroup) {
      const grupoMeta = await wbot.groupMetadata(msg.key.remoteJid);
      const msgGroupContact = {
        id: grupoMeta.id,
        name: grupoMeta.subject
      };
      groupContact = await verifyContact(msgGroupContact, wbot, companyId);
    }

    const contact = await verifyContact(msgContact, wbot, companyId);

    if (
      (shouldPreferMetaInbound && !msg.key.fromMe) ||
      (shouldPreferMetaOutbound && msg.key.fromMe)
    ) {
      const contactNumber = (contact as any)?.number || "unknown";
      const coexDropReason = msg.key.fromMe
        ? "send_channel_meta"
        : "receive_channel_meta";
      logWarn(
        `[BAILEYS-COEX] ⛔ ${coexDropReason}: ignorando mensaje Baileys para evitar ticket doble. Meta whatsappId=${(linkedMeta as any).id}, linkedWhatsappId=${whatsapp.id}, contact=${contactNumber}, fromMe=${msg.key.fromMe}`
      );
      coexLogInbound({
        provider: "baileys",
        companyId,
        wid: msg.key.id || null,
        remoteJid: msg.key.remoteJid || null,
        fromMe: !!msg.key.fromMe,
        sourceChannel: "baileys",
        outcome: "dropped",
        reason: coexDropReason
      });
      return null;
    }

    const unreadMessages = await resolveUnreadCount(msg, contact.id);

    const { settings, enableLGPD } = await resolveCompanySettings(companyId);

    const isFirstMsg = await Ticket.findOne({
      where: {
        contactId: groupContact ? groupContact.id : contact.id,
        companyId,
        whatsappId: whatsapp.id
      },
      order: [["id", "DESC"]]
    });

    //   contactId: contact.id,
    //   whatsappId: whatsapp.id,
    //   unreadMessages,
    //   queueId,
    //   userId,
    //   isGroup: !!groupContact
    // });

    // ═══ FASE 2 Coexistencia — DEDUPE PRE-PROCESAMIENTO ═══
    // Si llega el mismo msg.key.id dos veces (reconnect de Baileys,
    // history sync, concurrencia entre nodos PM2), el UNIQUE index
    // en InboundEventLedger garantiza procesarlo UNA sola vez.
    // Distinguimos inbound del cliente (baileys) vs eco del staff (baileys_fromme).
    const dedupe = await checkInboundDedupe(msg, companyId);
    if (dedupe.drop) return null;
    let baileysLedgerEntryId = dedupe.ledgerEntryId;
    // ════════════════════════════════════════════════════════

    // FASE 3 Coexistencia — resolver conversación unificada ANTES del ticket,
    // para que FindOrCreateTicketService pueda reutilizar el ticket abierto de
    // la misma UnifiedConversation aunque venga por otro whatsappId/canal (Meta).
    let coexConversationId: string | null = null;
    let coexCanonicalNumber: string | null = null;
    try {
      coexCanonicalNumber = ConversationResolverService.normalizeNumber(
        (contact as any).number || msg.key.remoteJid
      ) || null;
      if (coexCanonicalNumber) {
        const convRes = await ConversationResolverService.resolveOrCreate({
          companyId,
          canonicalNumber: coexCanonicalNumber,
          contact
        });
        if (convRes?.conversation) {
          coexConversationId = convRes.conversation.id;
          updateTraceContext({ conversationId: coexConversationId });
        }
      }
    } catch (convErr: any) {
      logError(`[Baileys] resolve conversationId falló: ${(convErr as Error)?.message}`);
      // Silencioso: no bloquear flujo legacy.
    }

    if (coexConversationId) {
      try {
        const reusableWhatsappIds = new Set<number>([Number((whatsapp as any).id)]);

        if ((whatsapp as any).linkedWhatsappId) {
          reusableWhatsappIds.add(Number((whatsapp as any).linkedWhatsappId));
        }

        const reverseLinkedWhatsapps = await Whatsapp.findAll({
          where: {
            companyId,
            linkedWhatsappId: (whatsapp as any).id,
            coexistenceEnabled: true
          } as any,
          attributes: ["id"]
        });

        reverseLinkedWhatsapps.forEach(linked => {
          reusableWhatsappIds.add(Number((linked as any).id));
        });

        const conflictingOpenTicket = await Ticket.findOne({
          where: {
            companyId,
            conversationId: coexConversationId,
            whatsappId: {
              [Op.notIn]: Array.from(reusableWhatsappIds)
            },
            status: {
              [Op.or]: ["open", "pending", "group", "nps", "lgpd"]
            }
          },
          order: [["id", "DESC"]]
        });

        if (conflictingOpenTicket) {
          logWarn(
            `[Baileys] conversationId=${coexConversationId} tiene ticket abierto no reutilizable=${conflictingOpenTicket.id} whatsappId=${conflictingOpenTicket.whatsappId}; se procesará sin conversationId para whatsappId=${(whatsapp as any).id}`
          );
          coexConversationId = null;
        }
      } catch (convScopeErr: any) {
        logWarn(
          `[Baileys] No se pudo validar scope de conversationId (${convScopeErr?.message}); continuando flujo legacy.`
        );
        coexConversationId = null;
      }
    }

    const mutex = new Mutex();
    const ticket = await createOrFindTicket(mutex, contact, whatsapp, unreadMessages, companyId, queueId, userId, groupContact, isImported, settings, coexConversationId);

    // FASE 3 Coexistencia — upsertBinding + recordInbound (defensa en profundidad).
    // El ticket ya quedó persistido con conversationId en Find/Create; aquí sólo
    // mantenemos los side effects que NO modifican el ticket (binding + last channel).
    await recordCoexistenceBinding({ coexConversationId, companyId, contact, whatsapp, msg, coexCanonicalNumber, ticket });

    // FASE 1 Coexistencia — log estructurado de inbound Baileys
    updateTraceContext({ ticketId: ticket.id });
    coexLogInbound({
      provider: "baileys",
      companyId,
      ticketId: ticket.id,
      conversationId: coexConversationId,
      wid: msg.key.id || null,
      remoteJid: msg.key.remoteJid || null,
      fromMe: !!msg.key.fromMe,
      sourceChannel: "baileys",
      outcome: "accepted"
    });
    // FASE 2 Coexistencia — enlazar ledger con ticket
    await InboundEventLedgerService.markProcessed(baileysLedgerEntryId, {
      ticketId: ticket.id
    });

  return {
    queueId, userId, bodyMessage, msgType, hasMedia, isGroup, whatsapp, contact, unreadMessages, settings, isFirstMsg, ticket
  };
}

/**
 * Fase de despacho de integraciones de handleMessageInner: FlowBuilder
 * (whatsapp.integrationId) y SupervisorAI (whatsapp.useAIOrchestrator), más
 * sus dos ramas de continuación (3a: aiStatus='active'; 3b: integrationId del
 * ticket + useIntegration, con el guard que impide reactivar supervisor_ai
 * cuando la conexión ya no lo tiene habilitado).
 *
 * Devuelve `true` cuando la fase resolvió el mensaje y handleMessageInner debe
 * terminar — los 3 `return;` del cuerpo original son ahora señal explícita —,
 * `false` cuando el flujo sigue hacia verifyQueue.
 *
 * Contrato medido con tests/harness/wbotRegionContract.cjs sobre el rango
 * original: 8 inputs, 0 outputs (nada de lo que declara se lee después), 0
 * reasignaciones de locales externos. Fuera de los `return`, movimiento verbatim.
 *
 * Se llama DENTRO del try de handleMessageInner: el manejo de errores no cambia.
 */
async function dispatchIntegration(
  msg: proto.IWebMessageInfo,
  wbot: Session,
  companyId: number,
  ticket: any,
  contact: any,
  whatsapp: any,
  isMenu: boolean,
  isFirstMsg: any
): Promise<boolean> {
    logger.info(`[Integration] Verificando - isBot: ${ticket.isBot}, whatsappId: ${ticket.whatsappId}, useAIOrchestrator: ${ticket.whatsapp?.useAIOrchestrator}, integrationId: ${ticket.whatsapp?.integrationId}, aiStatus: ${ticket.aiStatus}, useIntegration: ${ticket.useIntegration}`);

    // ============================================================
    // LÓGICA: SupervisorAI (useAIOrchestrator=true) o FlowBuilder (integrationId)
    // ============================================================

    // 1. FLOWBUILDER: Si tiene integrationId → ejecutar flujo
    const hasIntegration = !isNil(ticket.whatsapp?.integrationId);

    if (
      !ticket.imported &&
      !msg.key.fromMe &&
      !ticket.isGroup &&
      !ticket.user &&
      hasIntegration &&
      !ticket.useIntegration
    ) {
      console.log("🔍 [FlowBuilder] Ejecutando flujo - integrationId:", ticket.whatsapp?.integrationId);
      const integrations = await ShowQueueIntegrationService(
        ticket.whatsapp?.integrationId,
        companyId
      );

      await handleMessageIntegration(
        msg,
        wbot,
        companyId,
        integrations,
        ticket,
        isMenu,
        whatsapp,
        contact,
        isFirstMsg
      );
      return true;
    }

    // 2. SUPERVISOR AI: Si la conexión tiene useAIOrchestrator → ejecutar orquestador
    const hasSupervisorAI = ticket.whatsapp?.useAIOrchestrator === true;

    if (
      !ticket.imported &&
      !msg.key.fromMe &&
      !ticket.isGroup &&
      !ticket.user &&
      hasSupervisorAI &&
      ticket.aiStatus !== 'handoff'
    ) {
      logger.info(`[SupervisorAI] Ejecutando orquestador - useAIOrchestrator=true, aiStatus=${ticket.aiStatus}`);

      // Usar integración virtual para supervisor_ai (SIN id=999, no necesita FK)
      const supervisorIntegration = {
        id: 0,
        name: "Orquestador IA",
        type: "supervisor_ai",
        companyId
      } as QueueIntegrations;

      await handleMessageIntegration(
        msg,
        wbot,
        companyId,
        supervisorIntegration,
        ticket,
        isMenu,
        whatsapp,
        contact,
        isFirstMsg
      );
      return true;
    }

    // 3. Si no hay integración → verificar colas (fallback)

    /* COMENTADO: Typebot ya no funcional
    if (
      !isNil(ticket.typebotSessionId) &&
      ticket.typebotStatus &&
      !msg.key.fromMe &&
      !isNil(ticket.typebotSessionTime) &&
      ticket.useIntegration
    ) {
      const flow = await FlowBuilderModel.findOne({
        where: { id: ticket.flowStopped, active: true }
      });
      const nodes: INodes[] = flow.flow["nodes"];
      const lastFlow = nodes.find(f => f.id === String(ticket.lastFlowId));
      const typebot = lastFlow.data.typebotIntegration;

      await typebotListener({
        wbot: wbot,
        msg,
        ticket,
        typebot: lastFlow.data.typebotIntegration
      });
      return;
    }
    */

    // 3a. CONTINUACIÓN SUPERVISOR AI: si aiStatus='active', seguir procesando con orquestador
    if (
      !ticket.imported &&
      !msg.key.fromMe &&
      !ticket.isGroup &&
      !ticket.userId &&
      ticket.aiStatus === 'active' &&
      hasSupervisorAI
    ) {
      const supervisorIntegration = {
        id: 0,
        name: "Orquestador IA",
        type: "supervisor_ai",
        companyId
      } as QueueIntegrations;

      await handleMessageIntegration(
        msg,
        wbot,
        companyId,
        supervisorIntegration,
        ticket,
        null,
        whatsapp,
        contact,
        null
      );
    }

    // 3b. CONTINUACIÓN FLOWBUILDER: solo si tiene integrationId REAL (FK válida) + useIntegration
    if (
      !ticket.imported &&
      !msg.key.fromMe &&
      !ticket.isGroup &&
      !ticket.userId &&
      ticket.integrationId &&
      ticket.useIntegration
    ) {
      const integrations = await ShowQueueIntegrationService(
        ticket.integrationId,
        companyId
      );

      // 🛡️ Guard: si la integración del ticket es supervisor_ai y la conexión
      // NO tiene useAIOrchestrator, NO reactivar el orquestador.
      if (
        integrations?.type === "supervisor_ai" &&
        ticket.whatsapp?.useAIOrchestrator !== true
      ) {
        logger.info(
          `[Integration:continuación] supervisor_ai bloqueado por useAIOrchestrator=false en whatsappId=${ticket.whatsappId} (ticket=${ticket.id})`
        );
        return true;
      }

      await handleMessageIntegration(
        msg,
        wbot,
        companyId,
        integrations,
        ticket,
        null,
        null,
        contact,
        null
      );

      if (msg.key.fromMe) {
        await ticket.update({
          typebotSessionTime: moment().toDate()
        });
      }
    }

    return false;
}


/**
 * Fase de rechazo de audio de handleMessageInner: si el contacto o el canal no
 * aceptan notas de voz, responde con el texto de rechazo (el configurable de la
 * conexión, o el genérico) citando el mensaje original, y lo persiste.
 *
 * La condición combina tres cosas y por eso vive en un IIFE: el override por
 * conexión (`whatsapp.acceptAudio`, que puede ser null = sin override), el ajuste
 * de empresa (`settings.acceptAudioMessageContact`) y la preferencia del contacto.
 * Se movió tal cual: no se tocó esa precedencia.
 *
 * Contrato medido con tests/harness/wbotRegionContract.cjs: 7 inputs, 0 outputs,
 * 0 reasignaciones de locales externos y 0 `return` propios ⇒ movimiento VERBATIM.
 *
 * Se llama DENTRO del try de handleMessageInner: el manejo de errores no cambia.
 */
async function rejectAudioIfNotAccepted(
  msg: proto.IWebMessageInfo,
  wbot: Session,
  ticket: any,
  contact: any,
  whatsapp: any,
  settings: any,
  ticketTraking: any
): Promise<void> {
    // Verificação se aceita audio do contato
    if (
      getTypeMessage(msg) === "audioMessage" &&
      !msg.key.fromMe &&
      (!ticket.isGroup || whatsapp.groupAsTicket === "enabled") &&
      (() => {
        const ow = (whatsapp as any)?.acceptAudio;
        const channelOverride = ow === null || ow === undefined ? null : Boolean(ow);
        const channelAcceptsAudio =
          channelOverride !== null
            ? channelOverride
            : settings?.acceptAudioMessageContact !== "disabled";
        return !contact?.acceptAudioMessage || !channelAcceptsAudio;
      })()
    ) {
      const _customRejAudio = (((whatsapp as any)?.rejectAudioMessage) || "").trim();
      const _defaultRejAudio = `\u200e*Asistente Virtual*:\nLamentablemente no podemos escuchar ni enviar audio a través de este canal de soporte, envíe un mensaje de *texto*.`;
      const _rejAudioText = _customRejAudio ? `\u200e${_customRejAudio}` : _defaultRejAudio;
      const sentMessage = await wbot.sendMessage(
        `${contact.number}@c.us`,
        {
          text: _rejAudioText
        },
        {
          quoted: {
            key: msg.key,
            message: {
              extendedTextMessage: msg.message.extendedTextMessage
            }
          }
        }
      );
      await verifyMessage(sentMessage, ticket, contact, ticketTraking);
    }
}

/**
 * ¿Hay un mensaje de vacaciones REAL configurado?
 *
 * `isNil` no basta: solo cubre null/undefined, y la cadena vacía es el estado
 * normal de un campo de texto sin rellenar. Sin esto se enviaba un mensaje en
 * blanco al cliente.
 */
const hasVacationMessage = (message: unknown): boolean =>
  typeof message === "string" && message.trim().length > 0;

/**
 * Fase de vacaciones colectivas de handleMessageInner: si el entrante cae dentro
 * de la ventana configurada en la conexión, persiste el mensaje y responde con el
 * aviso de vacaciones, cortando el resto del flujo.
 *
 * ## Sobre el `!isGroup` que ya no está (decisión de JC, 2026-07-29)
 *
 * La condición era `!isNil(collectiveVacationMessage && !isGroup)`: el `&&` caía
 * DENTRO del `isNil`, así que se evaluaba `isNil(<booleano>)` —siempre false— y
 * **el guard de grupo nunca decidía nada**. El comportamiento real era "los grupos
 * también reciben el aviso".
 *
 * Decisión de negocio: los grupos SÍ deben recibirlo. Por tanto el `!isGroup`
 * sobraba, y la condición pasa a `!isNil(collectiveVacationMessage)`, que expresa
 * literalmente lo que el código ya hacía. **Cambio de conducta: ninguno** — es una
 * clarificación, no un arreglo. `isGroup` se conserva como parámetro porque la
 * firma la fija el contrato medido de la extracción.
 *
 * ## La cadena vacía cuenta como "sin configurar" (decisión de JC, 2026-07-30)
 *
 * La condición era `isNil(...)`, que solo es cierto para null/undefined. Con el
 * mensaje en **cadena vacía** —o en espacios— se entraba igual y se le mandaba al
 * cliente un texto EN BLANCO. Nadie configura un aviso de vacaciones vacío a
 * propósito: es el campo sin rellenar.
 *
 * Ahora se mira el contenido, no solo la nulidad. Cambio de conducta acotado y
 * deliberado: una conexión con la ventana activa y el mensaje vacío deja de
 * enviar nada (antes enviaba un mensaje en blanco).
 *
 * Contrato medido con tests/harness/wbotRegionContract.cjs: 8 inputs, 0 outputs,
 * 0 reasignaciones. El único retipeo fue el `return;` -> `return true;`.
 *
 * El try/catch que traga errores viaja con la región, así que el manejo de errores
 * tampoco cambia.
 */
async function sendCollectiveVacationReply(
  msg: proto.IWebMessageInfo,
  wbot: Session,
  ticket: any,
  contact: any,
  whatsapp: any,
  ticketTraking: any,
  hasMedia: boolean,
  isGroup: boolean
): Promise<boolean> {
    try {
      if (!msg.key.fromMe) {
        //MENSAGEM DE FÉRIAS COLETIVAS


        if (hasVacationMessage(whatsapp.collectiveVacationMessage)) {
          const currentDate = moment();


          if (
            currentDate.isBetween(
              moment(whatsapp.collectiveVacationStart),
              moment(whatsapp.collectiveVacationEnd)
            )
          ) {

            if (hasMedia) {

              await verifyMediaMessage(
                msg,
                ticket,
                contact,
                ticketTraking,
                false,
                false,
                wbot
              );
            } else {
              await verifyMessage(msg, ticket, contact, ticketTraking);
            }

            wbot.sendMessage(contact.remoteJid, {
              text: whatsapp.collectiveVacationMessage
            });

            return true;
          }
        }
      }
    } catch (e) {
      Sentry.captureException(e);
    }

    return false;
}

/**
 * Fase de edición de handleMessageInner: un `editedMessage` / `protocolMessage`
 * no es un mensaje nuevo, es un UPDATE sobre uno ya persistido. Localiza el
 * original (por wid, y si no aparece por el fallback de remoteJids + timestamp),
 * le pone el body nuevo, deja rastro en dataJson.lastEdit y emite los dos eventos
 * de socket.
 *
 * Devuelve `true` SIEMPRE que el mensaje era una edición —incluso cuando no se
 * encontró el original o no había body—, porque los tres `return;` originales
 * cortaban el flujo igual. Un mensaje de edición nunca continúa hacia ticket
 * tracking, colas ni chatbot.
 *
 * OJO: dos de esos tres `return;` son inline (`if (cond) return;`), no líneas
 * sueltas. Un extractor que solo mire líneas propias los deja sin convertir y la
 * función cae al `return false;` final ⇒ el mensaje editado seguiría hacia el
 * chatbot. El script lo asevera con un contador.
 *
 * Contrato medido con tests/harness/wbotRegionContract.cjs: 4 inputs, 0 outputs,
 * 0 reasignaciones de locales externos.
 *
 * El try/catch interno (que traga y reporta a Sentry) viaja con la región.
 */
async function applyMessageEdit(
  msg: proto.IWebMessageInfo,
  companyId: number,
  ticket: any,
  msgType: string
): Promise<boolean> {
    if (msgType === "editedMessage" || msgType === "protocolMessage") {
      const msgKeyIdEdited = extractEditedOriginalWid(msg.key, msg.message);
      const fallbackBodyEdited = findCaption(msg.message);
      const bodyEdited = extractEditedBody(msg.message) ??
        (typeof fallbackBodyEdited === "string" ? fallbackBodyEdited : null);


      // // console.log("bodyEdited", bodyEdited)
      const io = getIO();
      try {
        if (!msgKeyIdEdited || bodyEdited === null) return true;

        let messageToUpdate = await Message.findOne({
          where: {
            wid: msgKeyIdEdited,
            companyId,
            ticketId: ticket.id
          }
        });

        if (!messageToUpdate) {
          const remoteJids = extractEditedRemoteJids(msg.key, msg.message);
          const editedAt = extractEditedTimestamp(msg.message);

          messageToUpdate = await findMessageEditFallback({
            companyId,
            ticketId: ticket.id,
            remoteJids,
            editedAt,
            fromMe: Boolean(msg.key?.fromMe)
          });

          if (messageToUpdate) {
            logWarn(
              `[MessageEdit] upsert_fallback_match originalWid=${msgKeyIdEdited} messageId=${messageToUpdate.id} fromMe=${messageToUpdate.fromMe} remoteJids=${remoteJids.join(",")}`
            );
          }
        }

        if (!messageToUpdate) return true;

        await messageToUpdate.update({
          isEdited: true,
          body: bodyEdited,
          dataJson: mergeMessageDataJson(messageToUpdate.dataJson, {
            lastEdit: {
              source: "baileys.messages.upsert",
              editedAt: new Date().toISOString(),
              key: msg.key,
              message: msg.message
            }
          })
        });

        await ticket.update({ lastMessage: bodyEdited });


        io.of(String(companyId))
          // .to(String(ticket.id))
          .emit(`company-${companyId}-appMessage`, {
            action: "update",
            message: messageToUpdate
          });

        io.of(String(companyId))
          // .to(ticket.status)
          // .to("notification")
          // .to(String(ticket.id))
          .emit(`company-${companyId}-ticket`, {
            action: "update",
            ticket
          });
      } catch (err) {
        Sentry.captureException(err);
        logError(`Error handling message ack. Err: ${err}`);
      }
      return true;
    }

    return false;
}



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
