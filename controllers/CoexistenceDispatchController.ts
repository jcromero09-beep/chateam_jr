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
import OutboundRoutingService from "../services/CoexistenceServices/OutboundRoutingService";
import OutboundDispatchService from "../services/CoexistenceServices/OutboundDispatchService";
import AppError from "../errors/AppError";

export const routingPreview = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { ticketId } = req.params;
    const { companyId } = (req as any).user;
    const ticket = await ShowTicketService(ticketId, companyId);

    const mode = (req.query.mode as any) || undefined;
    const decision = await OutboundRoutingService.resolveOutbound({
      ticket,
      requestedMode: mode
    });

    return res.status(200).json({
      ticketId: ticket.id,
      conversationId: (ticket as any).conversationId || null,
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
    const { companyId } = (req as any).user;
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

export default { routingPreview, dispatchOne };
