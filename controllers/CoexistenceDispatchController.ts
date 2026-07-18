/**
 * CoexistenceDispatchController — FASE 4 Coexistencia WhatsApp.
 *
 * Endpoints:
 *   GET  /coexistence/routing-preview/:ticketId
 *     Devuelve la decisión de routing sin ejecutar envío.
 *     Útil para UI (mostrar "Saliendo por Meta" antes de clic).
 *
 *   POST /coexistence/dispatch/:ticketId
 *     Envía un texto usando OutboundDispatchService.
 *     Body: { body: string, mode?: 'auto'|'force_meta'|'force_baileys'|'sticky_inbound' }
 *     Requiere feature flag COEX_UNIFIED_DISPATCH.
 *
 * No reemplaza MessageController.store legacy. Coexisten.
 */
import { Request, Response } from "express";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import OutboundRoutingService, {
  computeMetaWindow
} from "../services/CoexistenceServices/OutboundRoutingService";
import OutboundDispatchService from "../services/CoexistenceServices/OutboundDispatchService";
import OutboundDispatch from "../models/OutboundDispatch";
import Whatsapp from "../models/Whatsapp";
import AppError from "../errors/AppError";

export const routingPreview = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { ticketId } = req.params;
    const { companyId } = req.user;
    const ticket = await ShowTicketService(ticketId, companyId);

    const mode = (req.query.mode as any) || undefined;
    const decision = await OutboundRoutingService.resolveOutbound({
      ticket,
      requestedMode: mode
    });

    // FASE 7 — Calcular metadata de ventana 24h para el cliente UI.
    // (resolveOutbound ya la calcula; la incluimos en formato amigable.)
    const metaWindow =
      decision.metaWindow ||
      (await computeMetaWindow(ticket.id, companyId));

    // Resolver linkedWhatsappId y disponibilidad real de Baileys.
    // Multi-tenant: filtrar por companyId.
    const seedWa = (ticket as any).whatsappId
      ? await Whatsapp.findOne({
          where: { id: (ticket as any).whatsappId, companyId }
        })
      : null;
    const linkedId = (seedWa as any)?.linkedWhatsappId || null;
    const linkedWa = linkedId
      ? await Whatsapp.findOne({ where: { id: linkedId, companyId } })
      : null;

    const baileysCandidate =
      seedWa && (seedWa as any).channel === "whatsapp"
        ? seedWa
        : linkedWa && (linkedWa as any).channel === "whatsapp"
        ? linkedWa
        : null;
    const canUseBaileys =
      !!baileysCandidate && (baileysCandidate as any).status === "CONNECTED";

    return res.status(200).json({
      ticketId: ticket.id,
      conversationId: (ticket as any).conversationId || null,
      lastCustomerMessageAt: metaWindow.lastCustomerMessageAt,
      hoursSinceLastCustomerMessage: metaWindow.hoursSinceLastCustomerMessage,
      metaWindow: {
        isOpen: metaWindow.isOpen,
        expiresAt: metaWindow.expiresAt,
        minutesRemaining: metaWindow.minutesRemaining
      },
      chosenProvider: decision.provider,
      fallbackProvider: decision.fallbackProvider || null,
      linkedWhatsappId: linkedId,
      canUseBaileys,
      reason: decision.reason,
      decision: {
        provider: decision.provider,
        whatsappId: decision.whatsappId,
        whatsappName: (decision.whatsapp as any)?.name,
        reason: decision.reason,
        fallbackApplied: decision.fallbackApplied,
        requestedMode: decision.requestedMode,
        requestedProvider: decision.requestedProvider
      }
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res
      .status(500)
      .json({ error: "routing_preview_failed", detail: err?.message });
  }
};

export const dispatchOne = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { ticketId } = req.params;
    const { companyId } = req.user;
    const body = (req.body?.body as string) || "";
    const mode = (req.body?.mode as any) || undefined;

    if (!body || !body.trim()) {
      return res.status(400).json({ error: "body_required" });
    }

    // Feature flag
    if (!OutboundDispatchService.isUnifiedDispatchEnabled(companyId)) {
      return res.status(403).json({
        error: "coex_unified_dispatch_disabled",
        hint: "set COEX_UNIFIED_DISPATCH=enabled or whitelist this company"
      });
    }

    const ticket = await ShowTicketService(ticketId, companyId);

    const out = await OutboundDispatchService.dispatch({
      ticket,
      body,
      requestedMode: mode,
      requestedBy: "agent"
    });

    return res.status(out.ok ? 200 : 502).json({
      ok: out.ok,
      decision: {
        provider: out.decision.provider,
        whatsappId: out.decision.whatsappId,
        whatsappName: (out.decision.whatsapp as any)?.name,
        reason: out.decision.reason,
        fallbackApplied: out.decision.fallbackApplied
      },
      result: {
        ok: out.result.ok,
        providerMessageId: out.result.providerMessageId,
        error: out.result.error || null
      }
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res
      .status(500)
      .json({ error: "dispatch_failed", detail: err?.message });
  }
};

/**
 * FASE 6: listado de dispatches por ticket (timeline UI).
 */
export const listDispatches = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { ticketId } = req.params;
    const { companyId } = req.user;
    const limit = Math.min(parseInt((req.query.limit as string) || "50", 10), 200);

    const rows = await OutboundDispatch.findAll({
      where: { ticketId: parseInt(ticketId, 10), companyId },
      order: [["requestedAt", "DESC"]],
      limit
    });

    return res.status(200).json({
      ticketId: parseInt(ticketId, 10),
      count: rows.length,
      dispatches: rows.map((r: any) => ({
        id: r.id,
        provider: r.provider,
        requestedMode: r.requestedMode,
        requestedBy: r.requestedBy,
        fallbackApplied: r.fallbackApplied,
        fallbackFromProvider: r.fallbackFromProvider,
        providerMessageId: r.providerMessageId,
        bodyPreview: r.bodyPreview,
        status: r.status,
        attemptCount: r.attemptCount,
        lastError: r.lastError,
        traceId: r.traceId,
        durationMs: r.durationMs,
        requestedAt: r.requestedAt,
        dispatchedAt: r.dispatchedAt,
        ackedAt: r.ackedAt,
        ackLevel: r.ackLevel,
        whatsappId: r.whatsappId
      }))
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res
      .status(500)
      .json({ error: "list_dispatches_failed", detail: err?.message });
  }
};

export default { routingPreview, dispatchOne, listDispatches };
