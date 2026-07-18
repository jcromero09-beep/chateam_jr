import { Op } from "sequelize";
import type { WAMessage, WAMessageKey } from "baileys";
import AppError from "../../errors/AppError";
import cacheLayer from "../../libs/cache";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import GetTicketWbot from "../../helpers/GetTicketWbot";
import logger from "../../utils/logger";

const MAX_RECOVERY_LIMIT = 20;
const PLACEHOLDER_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;
const HISTORY_RECOVERY_TTL_SECONDS = 10 * 60;
const HISTORY_RECOVERY_KEY_PREFIX = "messageRecovery:history:";

type RecoverStatus = "requested" | "already-resolved" | "already-requested" | "skipped" | "failed";

interface RecoverTicketMessagesRequest {
  ticketId: number;
  companyId: number;
  userId: number;
  limit?: number;
}

const clampLimit = (limit?: number): number => {
  if (!Number.isFinite(limit)) return MAX_RECOVERY_LIMIT;
  return Math.max(1, Math.min(MAX_RECOVERY_LIMIT, Number(limit)));
};

const parseJson = (value?: string | null): any => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (_err) {
    return null;
  }
};

const timestampToSeconds = (timestamp: any, fallback?: Date): number | null => {
  if (timestamp && typeof timestamp === "object" && typeof timestamp.low === "number") {
    return timestamp.low;
  }

  const value = Number(timestamp);
  if (Number.isFinite(value) && value > 0) {
    return value > 10_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
  }

  return fallback ? Math.floor(fallback.getTime() / 1000) : null;
};

const timestampToMilliseconds = (timestamp: any, fallback?: Date): number | null => {
  const seconds = timestampToSeconds(timestamp, fallback);
  return seconds ? seconds * 1000 : null;
};

const buildMessageKey = (message: Message, rawMessage: any): WAMessageKey | null => {
  const rawKey = rawMessage?.key || {};
  const id = rawKey.id || message.wid;
  const remoteJid = rawKey.remoteJid || message.remoteJid;

  if (!id || !remoteJid) return null;

  const key = {
    ...rawKey,
    id,
    remoteJid,
    fromMe: rawKey.fromMe ?? message.fromMe ?? false,
    participant: rawKey.participant || message.participant || undefined
  };

  return key as WAMessageKey;
};

const buildPlaceholderMetadata = (message: Message, rawMessage: any, key: WAMessageKey): Partial<WAMessage> => ({
  ...(rawMessage || {}),
  key: {
    ...(rawMessage?.key || {}),
    ...key
  },
  messageTimestamp:
    rawMessage?.messageTimestamp ||
    timestampToSeconds(rawMessage?.messageTimestamp, message.createdAt) ||
    Math.floor(message.createdAt.getTime() / 1000),
  pushName: rawMessage?.pushName,
  participant: rawMessage?.participant,
  verifiedBizName: rawMessage?.verifiedBizName
});

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function next(): Promise<void> {
    const currentIndex = index;
    index += 1;
    if (currentIndex >= items.length) return;

    results[currentIndex] = await worker(items[currentIndex]);
    await next();
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => next())
  );

  return results;
}

const updateRecoveryMetadata = async (
  message: Message,
  patch: Record<string, any>
): Promise<void> => {
  const current = parseJson(message.dataJson) || {};
  await message.update({
    dataJson: JSON.stringify({
      ...current,
      chateamRecovery: {
        ...(current.chateamRecovery || {}),
        ...patch
      }
    })
  });
};

const RecoverTicketMessagesService = async ({
  ticketId,
  companyId,
  userId,
  limit
}: RecoverTicketMessagesRequest) => {
  const recoveryLimit = clampLimit(limit);

  const ticket = await Ticket.findOne({
    where: { id: ticketId, companyId }
  });

  if (!ticket) {
    throw new AppError("Ticket no encontrado", 404);
  }

  const wbot: any = await GetTicketWbot(ticket);

  if (typeof wbot.requestPlaceholderResend !== "function") {
    throw new AppError("La sesión WhatsApp no soporta recuperación de placeholders", 400);
  }

  const stubs = await Message.findAll({
    where: {
      ticketId,
      companyId,
      mediaType: "ciphertext",
      wid: { [Op.ne]: null }
    },
    order: [["createdAt", "ASC"]],
    limit: recoveryLimit
  });

  const nowSeconds = Math.floor(Date.now() / 1000);

  const placeholderRequests = await runWithConcurrency(stubs, 2, async message => {
    const rawMessage = parseJson(message.dataJson);
    const key = buildMessageKey(message, rawMessage);
    const messageId = message.wid || rawMessage?.key?.id || String(message.id);

    if (!key) {
      return {
        messageId,
        status: "failed" as RecoverStatus,
        error: "Mensaje sin key de WhatsApp suficiente para solicitar recuperación"
      };
    }

    const messageSeconds = timestampToSeconds(rawMessage?.messageTimestamp, message.createdAt);
    if (messageSeconds && nowSeconds - messageSeconds > PLACEHOLDER_MAX_AGE_SECONDS) {
      return {
        messageId,
        status: "skipped" as RecoverStatus,
        error: "Mensaje fuera de la ventana de recuperación de 14 días"
      };
    }

    try {
      const metadata = buildPlaceholderMetadata(message, rawMessage, key);
      const requestId = await wbot.requestPlaceholderResend(key, metadata);
      const status: RecoverStatus =
        requestId === "RESOLVED"
          ? "already-resolved"
          : requestId
            ? "requested"
            : "already-requested";

      await updateRecoveryMetadata(message, {
        placeholderRequestedAt: new Date().toISOString(),
        placeholderRequestId: requestId || null,
        placeholderStatus: status,
        requestedBy: userId
      });

      return {
        messageId,
        status,
        requestId: requestId || undefined
      };
    } catch (error: any) {
      logger.warn(
        `[RecoverTicketMessages] placeholder failed ticket=${ticketId} message=${messageId}: ${error?.message || error}`
      );
      return {
        messageId,
        status: "failed" as RecoverStatus,
        error: error?.message || "Error solicitando recuperación"
      };
    }
  });

  const remainingHistoryLimit = Math.max(0, recoveryLimit - stubs.length);
  let historyRequest: { requested: boolean; requestId?: string; anchorMessageId?: string; count?: number; error?: string } = {
    requested: false
  };

  if (remainingHistoryLimit > 0 && typeof wbot.fetchMessageHistory === "function") {
    const anchor = await Message.findOne({
      where: {
        ticketId,
        companyId,
        wid: { [Op.ne]: null },
        remoteJid: { [Op.ne]: null }
      },
      order: [["createdAt", "ASC"]]
    });

    if (anchor) {
      const rawAnchor = parseJson(anchor.dataJson);
      const anchorKey = buildMessageKey(anchor, rawAnchor);
      const anchorTimestampMs = timestampToMilliseconds(rawAnchor?.messageTimestamp, anchor.createdAt);

      if (anchorKey && anchorTimestampMs) {
        try {
          const requestId = await wbot.fetchMessageHistory(
            remainingHistoryLimit,
            anchorKey,
            anchorTimestampMs
          );

          await cacheLayer.set(
            `${HISTORY_RECOVERY_KEY_PREFIX}${requestId}`,
            JSON.stringify({
              requestId,
              ticketId,
              companyId,
              whatsappId: ticket.whatsappId,
              userId,
              remoteJid: anchorKey.remoteJid,
              limit: remainingHistoryLimit,
              requestedAt: new Date().toISOString()
            }),
            "EX",
            HISTORY_RECOVERY_TTL_SECONDS
          );

          historyRequest = {
            requested: true,
            requestId,
            anchorMessageId: anchor.wid || anchorKey.id || undefined,
            count: remainingHistoryLimit
          };
        } catch (error: any) {
          historyRequest = {
            requested: false,
            error: error?.message || "No se pudo solicitar historial"
          };
        }
      }
    }
  }

  return {
    success: true,
    ticketId,
    limit: recoveryLimit,
    ciphertextFound: stubs.length,
    placeholder: {
      requested: placeholderRequests.filter(item => item.status === "requested").length,
      alreadyResolved: placeholderRequests.filter(item => item.status === "already-resolved").length,
      alreadyRequested: placeholderRequests.filter(item => item.status === "already-requested").length,
      failed: placeholderRequests.filter(item => item.status === "failed").length,
      skipped: placeholderRequests.filter(item => item.status === "skipped").length,
      requests: placeholderRequests
    },
    history: historyRequest,
    message:
      stubs.length > 0
        ? `Se solicitaron ${placeholderRequests.filter(item => item.status === "requested").length} mensajes cifrados.`
        : historyRequest.requested
          ? "No había placeholders; se solicitó historial anterior al primer mensaje visible."
          : "No se encontraron placeholders recuperables en este ticket."
  };
};

export default RecoverTicketMessagesService;
export { HISTORY_RECOVERY_KEY_PREFIX };
