/**
 * wbotMessageEdit.ts — [Refactor Ola 6] subsistema de EDICIÓN de mensajes de
 * WhatsApp, extraído VERBATIM de wbotMessageListener (-423 L del monolito).
 *
 * Qué vive aquí: reconocer un payload de edición en sus varias formas
 * (protocolMessage type=14, editedMessage, y la variante cifrada con
 * messageSecret), descifrarla cuando hace falta (HKDF + AES-GCM), y aplicar la
 * edición sobre el Message ya persistido.
 *
 * Este bloque no tenía NINGUNA dependencia hacia el resto del monolito — 0 deps
 * locales medidas con tests/harness/wbotTopLevelDeps.cjs. Sale sin ciclos: importa
 * de ./wbotMessageParsers y ./wbotMessageIngest, y ninguno de los dos importa de
 * aquí.
 *
 * De las 12 funciones, 7 las usa el listener del monolito (filterMessages y los
 * handlers de messages.upsert / messages.update) y se exportan; las 5 restantes
 * eran y siguen siendo privadas del subsistema.
 */
import * as Sentry from "@sentry/node";
import {
  aesDecryptGCM,
  hkdf,
  proto,
  WAMessageUpdate
} from "baileys";

import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import { getIO } from "../../libs/socket";
import { logError, logInfo, logWarn } from "../../utils/logger";

import {
  extractEditedBody,
  extractEditedOriginalWid,
  extractEditedRemoteJids,
  extractEditedTimestamp,
  getEditProtocolMessage
} from "./wbotMessageParsers";
import {
  findMessageEditFallback,
  mergeMessageDataJson
} from "./wbotMessageIngest";

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

// Lo que consume el listener del monolito. Las otras 5 (summarizeForMessageEditLog,
// parseMessageDataJson, toBuffer, buildMessageSecretKey, decryptSecretEncryptedEdit)
// son internas del subsistema y se quedan privadas.
export {
  isMessageEditPayload,
  isSecretEncryptedEditPayload,
  hasPossibleEditShape,
  logMessageEditProbe,
  logMessageEditFailure,
  handleSecretEncryptedMessageEdit,
  handleMessageEditUpdate
};
