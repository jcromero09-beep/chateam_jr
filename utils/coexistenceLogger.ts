/**
 * coexistenceLogger.ts — FASE 1 Coexistencia WhatsApp
 *
 * Helper de logs estructurados específico para eventos de coexistencia
 * Baileys + Meta Cloud API. Emite siempre bajo los mismos nombres de
 * evento para que sean filtrables en logs/Prometheus:
 *
 *   [coex.inbound]      — mensaje recibido por un proveedor
 *   [coex.outbound]     — mensaje enviado por un proveedor
 *   [coex.dedupe]       — evento descartado por dedupe
 *   [coex.route]        — decisión de routing (qué canal elegir)
 *   [coex.fallback]     — envío con fallback a canal alternativo
 *   [coex.retry]        — reintento de dispatch
 *   [coex.loop-prevent] — eco descartado / loop prevenido
 *   [coex.ack]          — status/ack correlacionado
 *   [coex.error]        — error crítico de coexistencia
 *
 * NO cambia comportamiento. Sólo agrega logs estructurados.
 */
import logger from "./logger";
import { getTraceId, getTraceContext } from "./traceContext";

type Provider = "meta" | "baileys" | "mixed" | "unknown";
type InboundOutcome =
  | "accepted"
  | "duplicate"
  | "dropped"
  | "error"
  | "echo_detected"
  | "history_import";
type OutboundOutcome =
  | "queued"
  | "dispatched"
  | "failed"
  | "fallback_used"
  | "retried";

interface BaseEvent {
  traceId?: string;
  companyId?: number | null;
  ticketId?: number | null;
  conversationId?: string | null;
  provider: Provider;
  [k: string]: any;
}

interface InboundEvent extends BaseEvent {
  event: "coex.inbound";
  wid?: string | null;
  remoteJid?: string | null;
  phoneNumberId?: string | null;
  fromMe?: boolean;
  sourceChannel?: string | null;
  outcome: InboundOutcome;
  durationMs?: number;
  reason?: string;
}

interface OutboundEvent extends BaseEvent {
  event: "coex.outbound";
  requestedBy?:
    | "agent"
    | "cron"
    | "ai"
    | "campaign"
    | "followup"
    | "automation"
    | "webhook"
    | "unknown";
  requestedMode?: "auto" | "force_meta" | "force_baileys" | "legacy";
  chosenProvider?: Provider;
  providerMessageId?: string | null;
  outcome: OutboundOutcome;
  durationMs?: number;
  reason?: string;
}

interface DedupeEvent extends BaseEvent {
  event: "coex.dedupe";
  wid?: string | null;
  eventKey?: string | null;
  reason: string;
  dropped: boolean;
}

interface RouteEvent extends BaseEvent {
  event: "coex.route";
  requestedMode?: string;
  chosenProvider: Provider;
  reason: string;
  whatsappId?: number | null;
  linkedWhatsappId?: number | null;
}

interface FallbackEvent extends BaseEvent {
  event: "coex.fallback";
  fromProvider: Provider;
  toProvider: Provider;
  reason: string;
}

interface LoopPreventEvent extends BaseEvent {
  event: "coex.loop-prevent";
  reason: string;
  wid?: string | null;
}

interface AckEvent extends BaseEvent {
  event: "coex.ack";
  wid?: string | null;
  providerMessageId?: string | null;
  ack?: number;
  status?: string;
}

interface RetryEvent extends BaseEvent {
  event: "coex.retry";
  attempt: number;
  maxAttempts?: number;
  reason: string;
}

interface ErrorEvent extends BaseEvent {
  event: "coex.error";
  stage: string;
  err: any;
}

const enrich = <T extends BaseEvent>(ev: T): T => {
  const ctx = getTraceContext();
  if (!ev.traceId) ev.traceId = ctx?.traceId || getTraceId() || null;
  if (ev.companyId === undefined) ev.companyId = ctx?.companyId ?? null;
  if (ev.ticketId === undefined) ev.ticketId = ctx?.ticketId ?? null;
  if (ev.conversationId === undefined)
    ev.conversationId = ctx?.conversationId ?? null;
  return ev;
};

export const logInbound = (
  ev: Omit<InboundEvent, "event">
): void => {
  const enriched = enrich({ ...ev, event: "coex.inbound" } as InboundEvent);
  const level =
    enriched.outcome === "error"
      ? "error"
      : enriched.outcome === "duplicate" ||
        enriched.outcome === "echo_detected"
      ? "warn"
      : "info";
  (logger as any)[level](enriched, "[coex.inbound]");
};

export const logOutbound = (
  ev: Omit<OutboundEvent, "event">
): void => {
  const enriched = enrich({ ...ev, event: "coex.outbound" } as OutboundEvent);
  const level =
    enriched.outcome === "failed"
      ? "error"
      : enriched.outcome === "fallback_used" ||
        enriched.outcome === "retried"
      ? "warn"
      : "info";
  (logger as any)[level](enriched, "[coex.outbound]");
};

export const logDedupe = (ev: Omit<DedupeEvent, "event">): void => {
  const enriched = enrich({ ...ev, event: "coex.dedupe" } as DedupeEvent);
  logger.warn(enriched, "[coex.dedupe]");
};

export const logRoute = (ev: Omit<RouteEvent, "event">): void => {
  const enriched = enrich({ ...ev, event: "coex.route" } as RouteEvent);
  logger.info(enriched, "[coex.route]");
};

export const logFallback = (ev: Omit<FallbackEvent, "event">): void => {
  const enriched = enrich({ ...ev, event: "coex.fallback" } as FallbackEvent);
  logger.warn(enriched, "[coex.fallback]");
};

export const logLoopPrevent = (
  ev: Omit<LoopPreventEvent, "event">
): void => {
  const enriched = enrich({
    ...ev,
    event: "coex.loop-prevent"
  } as LoopPreventEvent);
  logger.warn(enriched, "[coex.loop-prevent]");
};

export const logAck = (ev: Omit<AckEvent, "event">): void => {
  const enriched = enrich({ ...ev, event: "coex.ack" } as AckEvent);
  logger.info(enriched, "[coex.ack]");
};

export const logRetry = (ev: Omit<RetryEvent, "event">): void => {
  const enriched = enrich({ ...ev, event: "coex.retry" } as RetryEvent);
  logger.warn(enriched, "[coex.retry]");
};

export const logCoexError = (ev: Omit<ErrorEvent, "event">): void => {
  const enriched = enrich({ ...ev, event: "coex.error" } as ErrorEvent);
  logger.error(enriched, "[coex.error]");
};

export default {
  logInbound,
  logOutbound,
  logDedupe,
  logRoute,
  logFallback,
  logLoopPrevent,
  logAck,
  logRetry,
  logCoexError
};
