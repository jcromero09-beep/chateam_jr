import crypto from "crypto";
import AITurnEvent from "../../models/AITurnEvent";
import logger from "../../utils/logger";

type AITurnEventStatus = "ok" | "blocked" | "skipped" | "error";

interface LogTurnEventInput {
  turnId?: string;
  companyId: number;
  ticketId?: number | null;
  contactId?: number | null;
  whatsappId?: number | null;
  messageId?: number | null;
  channel?: string | null;
  eventType: string;
  eventStatus?: AITurnEventStatus | string;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  inputTokens?: number;
  outputTokens?: number;
}

const MAX_METADATA_CHARS = 8000;
const SECRET_KEY_RE = /(token|secret|password|authorization|apikey|api_key|access_token)/i;
let unavailableUntil = 0;

const isEnabled = (): boolean => process.env.AI_TURN_LEDGER_ENABLED !== "false";

const safeNumber = (value?: number | null): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const redactAndTrim = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.slice(0, 20).map(item => redactAndTrim(item));
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_RE.test(key)) {
        output[key] = "[redacted]";
        continue;
      }
      output[key] = redactAndTrim(nested);
    }
    return output;
  }

  if (typeof value === "string") {
    return value.length > 1000 ? `${value.slice(0, 1000)}...` : value;
  }

  return value;
};

const sanitizeMetadata = (metadata?: Record<string, unknown>): Record<string, unknown> => {
  if (!metadata) return {};

  const redacted = redactAndTrim(metadata) as Record<string, unknown>;
  const serialized = JSON.stringify(redacted);

  if (serialized.length <= MAX_METADATA_CHARS) {
    return redacted;
  }

  return {
    truncated: true,
    originalChars: serialized.length,
    preview: serialized.slice(0, MAX_METADATA_CHARS)
  };
};

const createTurnId = (): string => crypto.randomUUID();

const logEvent = async (input: LogTurnEventInput): Promise<void> => {
  if (!isEnabled()) return;

  const now = Date.now();
  if (unavailableUntil > now) return;

  try {
    const inputTokens = Math.max(0, Number(input.inputTokens || 0));
    const outputTokens = Math.max(0, Number(input.outputTokens || 0));

    await AITurnEvent.create({
      turnId: input.turnId || createTurnId(),
      companyId: input.companyId,
      ticketId: safeNumber(input.ticketId),
      contactId: safeNumber(input.contactId),
      whatsappId: safeNumber(input.whatsappId),
      messageId: safeNumber(input.messageId),
      channel: input.channel || null,
      eventType: input.eventType,
      eventStatus: input.eventStatus || "ok",
      reason: input.reason || null,
      metadata: sanitizeMetadata(input.metadata),
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens
    });
  } catch (err: any) {
    unavailableUntil = Date.now() + 60000;
    if (process.env.AI_TURN_LEDGER_DEBUG === "true") {
      logger.warn(`[AITurnLedger] Evento omitido: ${err?.message || err}`);
    }
  }
};

export default {
  createTurnId,
  logEvent
};
