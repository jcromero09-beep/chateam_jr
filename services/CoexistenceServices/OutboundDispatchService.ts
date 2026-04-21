/**
 * OutboundDispatchService — FASE 4 Coexistencia WhatsApp.
 *
 * Único punto de entrada para enviar mensajes de texto salientes desde
 * lógica nueva. Orquesta:
 *
 *   1. OutboundRoutingService.resolveOutbound(ticket, requestedMode)
 *      → decide provider + whatsappId + fallback.
 *   2. Adapter.send() correspondiente (meta|baileys).
 *   3. Log estructurado [coex.outbound] con providerMessageId.
 *   4. Actualizar UnifiedConversation.lastOutbound* (FASE 3).
 *
 * NO reemplaza aún la lógica legacy de MessageController.store().
 * Se activa por feature flag COEX_UNIFIED_DISPATCH=enabled.
 *
 * Si hay error: el caller debe caer al path legacy (fail-open).
 */
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import OutboundDispatch from "../../models/OutboundDispatch";
import logger from "../../utils/logger";
import { getTraceId } from "../../utils/traceContext";
import {
  logOutbound,
  logFallback,
  logCoexError
} from "../../utils/coexistenceLogger";
import OutboundRoutingService, {
  RoutingDecision,
  RequestedMode
} from "./OutboundRoutingService";
import { getAdapter, DispatchResult } from "./OutboundAdapters";
import ConversationResolverService from "./ConversationResolverService";

export type RequestedBy =
  | "agent"
  | "cron"
  | "ai"
  | "campaign"
  | "followup"
  | "automation"
  | "webhook";

export interface DispatchInput {
  ticket: Ticket;
  contact?: Contact | null;
  body: string;
  quotedMsg?: any;
  requestedMode?: RequestedMode;
  requestedBy?: RequestedBy;
}

export interface DispatchOutput {
  ok: boolean;
  decision: RoutingDecision;
  result: DispatchResult;
  /** id de OutboundDispatch persistido (FASE 6) — útil para reconciliación de ack */
  dispatchId?: string | null;
}

/**
 * Verifica si el dispatch unificado está habilitado para esta company.
 * Control vía:
 *   - env COEX_UNIFIED_DISPATCH=enabled (global)
 *   - env COEX_UNIFIED_DISPATCH_COMPANY_IDS=1,3,7 (whitelist por company)
 *
 * Default: 'disabled' para rollout gradual.
 */
export const isUnifiedDispatchEnabled = (companyId?: number): boolean => {
  const mode = (process.env.COEX_UNIFIED_DISPATCH || "disabled").toLowerCase();
  if (mode === "enabled") return true;
  if (mode === "whitelist") {
    const wl = (process.env.COEX_UNIFIED_DISPATCH_COMPANY_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n));
    return companyId != null && wl.includes(companyId);
  }
  return false;
};

/**
 * Ejecuta el envío saliente unificado.
 */
export const dispatch = async (
  input: DispatchInput
): Promise<DispatchOutput> => {
  const { ticket } = input;
  const companyId = (ticket as any).companyId;
  const requestedBy = input.requestedBy || "agent";

  // 1) Routing
  let decision: RoutingDecision;
  try {
    decision = await OutboundRoutingService.resolveOutbound({
      ticket,
      requestedMode: input.requestedMode,
      requestedBy
    });
  } catch (err: any) {
    logCoexError({
      provider: "unknown",
      companyId,
      ticketId: (ticket as any).id,
      stage: "dispatch.routing",
      err: { message: err?.message, name: err?.name }
    });
    throw err;
  }

  // Log de inicio (queued) ANTES del envío
  logOutbound({
    provider: decision.provider,
    companyId,
    ticketId: (ticket as any).id,
    conversationId: (ticket as any).conversationId,
    requestedBy,
    requestedMode: decision.requestedMode,
    chosenProvider: decision.provider,
    outcome: "queued",
    reason: decision.reason
  });

  // Si hubo fallback, log separado para métrica
  if (decision.fallbackApplied && decision.requestedProvider) {
    logFallback({
      provider: "mixed",
      companyId,
      ticketId: (ticket as any).id,
      conversationId: (ticket as any).conversationId,
      fromProvider: decision.requestedProvider,
      toProvider: decision.provider,
      reason: decision.reason
    });
  }

  // 2) Persistir dispatch ANTES del envío (FASE 6)
  // Esto nos permite reconciliar incluso si el proceso crashea antes
  // de registrar el resultado final.
  const traceId = getTraceId() || null;
  const bodyPreview = input.body ? input.body.substring(0, 200) : null;
  let dispatchRow: OutboundDispatch | null = null;
  try {
    dispatchRow = await OutboundDispatch.create({
      companyId,
      conversationId: (ticket as any).conversationId || null,
      ticketId: (ticket as any).id,
      whatsappId: decision.whatsappId,
      provider: decision.provider,
      requestedMode: decision.requestedMode,
      requestedBy,
      fallbackApplied: decision.fallbackApplied,
      fallbackFromProvider: decision.fallbackApplied
        ? decision.requestedProvider ?? null
        : null,
      bodyPreview,
      status: "queued",
      attemptCount: 1,
      traceId,
      requestedAt: new Date()
    } as any);
  } catch (err: any) {
    logger.warn(
      { err: err?.message, ticketId: (ticket as any).id },
      "[OutboundDispatchService] could not persist dispatch row (continuing)"
    );
  }

  // 3) Adapter.send
  const adapter = getAdapter(decision.provider);
  const startedAt = Date.now();
  const result = await adapter.send({
    ticket,
    whatsapp: decision.whatsapp,
    contact: input.contact,
    body: input.body,
    quotedMsg: input.quotedMsg
  });
  const durationMs = Date.now() - startedAt;

  // 4) Actualizar dispatch row con resultado
  if (dispatchRow) {
    try {
      await dispatchRow.update({
        providerMessageId: result.providerMessageId,
        status: result.ok
          ? decision.fallbackApplied
            ? "fallback"
            : "dispatched"
          : "failed",
        lastError: result.error?.message || null,
        durationMs,
        dispatchedAt: result.ok ? new Date() : null
      } as any);
    } catch (err: any) {
      logger.warn(
        { err: err?.message, dispatchId: (dispatchRow as any).id },
        "[OutboundDispatchService] could not update dispatch row"
      );
    }
  }

  // 5) Log de resultado
  logOutbound({
    provider: decision.provider,
    companyId,
    ticketId: (ticket as any).id,
    conversationId: (ticket as any).conversationId,
    requestedBy,
    requestedMode: decision.requestedMode,
    chosenProvider: decision.provider,
    providerMessageId: result.providerMessageId,
    outcome: result.ok
      ? decision.fallbackApplied
        ? "fallback_used"
        : "dispatched"
      : "failed",
    durationMs,
    reason: result.ok ? decision.reason : `dispatch_error:${result.error?.message}`
  });

  // 6) Actualizar conversación (si aplica)
  const conversationId = (ticket as any).conversationId;
  if (conversationId && result.ok) {
    await ConversationResolverService.recordOutbound(
      conversationId,
      decision.provider
    );
  }

  return {
    ok: result.ok,
    decision,
    result,
    dispatchId: dispatchRow ? (dispatchRow as any).id : null
  } as DispatchOutput;
};

export default { dispatch, isUnifiedDispatchEnabled };
