/**
 * TicketFlowController — Endpoints PRIMERA OLA (2026-05-07)
 *
 * Expone los servicios de:
 *   - F1: TicketFlowEngine (máquina de estados)
 *   - F2: TicketFollowupService (seguimientos automáticos)
 *   - F7: OmnichannelDispatcher (envío multi-canal)
 *
 * Convención de respuesta: { success, message, data, errors }
 *
 * Multi-tenant: cada handler valida que el ticket pertenezca al companyId
 * del usuario autenticado (excepto operaciones isSuper).
 */

import { Request, Response } from "express";
import logger from "../utils/logger";
import AppError from "../errors/AppError";

import Ticket from "../models/Ticket";
import TicketFlowEngine, {
  FlowState
} from "../services/AIAgentServices/TicketFlowEngine";
import TicketFollowupService from "../services/AIAgentServices/TicketFollowupService";
import OmnichannelDispatcher, {
  DispatchOrigin,
  SupportedChannel
} from "../services/OmnichannelServices/OmnichannelDispatcher";

// ─── Helpers ───────────────────────────────────────────────────────────────
const extractError = (
  error: unknown
): { msg: string; statusCode: number } => {
  if (error instanceof AppError) {
    return { msg: error.message, statusCode: error.statusCode };
  }
  if (error instanceof Error) {
    const msg = error.message;
    const statusCode = msg.includes("NOT_FOUND")
      ? 404
      : msg.includes("ERR_") || msg.includes("inválida")
      ? 400
      : 500;
    return { msg, statusCode };
  }
  return { msg: String(error), statusCode: 500 };
};

const ensureTicketBelongsToCompany = async (
  ticketId: number,
  companyId: number
): Promise<Ticket> => {
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) throw new AppError("TICKET_NOT_FOUND", 404);
  if ((ticket as any).companyId !== companyId) {
    throw new AppError("TICKET_TENANT_MISMATCH", 403);
  }
  return ticket;
};

// ============================================================================
// F1 — TicketFlowEngine
// ============================================================================

/** GET /tickets/:ticketId/flow */
export const getFlowState = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const ticketId = Number(req.params.ticketId);
    const { companyId } = req.user;

    await ensureTicketBelongsToCompany(ticketId, companyId);

    const state = await TicketFlowEngine.getState(ticketId);
    if (!state) {
      return res.status(404).json({
        success: false,
        message: "Estado de flujo no encontrado",
        errors: ["FLOW_STATE_NOT_FOUND"]
      });
    }

    return res.json({
      success: true,
      message: "Estado de flujo obtenido",
      data: state
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[TicketFlowController] getFlowState: ${msg}`);
    return res
      .status(statusCode)
      .json({ success: false, message: "Error al obtener flujo", errors: [msg] });
  }
};

/** POST /tickets/:ticketId/flow/transition  body: { toState, reason, metadata? } */
export const transitionFlow = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const ticketId = Number(req.params.ticketId);
    const { companyId } = req.user;
    const { toState, reason, metadata } = req.body as {
      toState: FlowState;
      reason: string;
      metadata?: Record<string, any>;
    };

    if (!toState || !reason) {
      return res.status(400).json({
        success: false,
        message: "toState y reason son requeridos",
        errors: ["MISSING_PARAMS"]
      });
    }

    await ensureTicketBelongsToCompany(ticketId, companyId);

    const result = await TicketFlowEngine.transition(
      ticketId,
      toState,
      reason,
      metadata
    );

    return res.json({
      success: true,
      message: "Transición aplicada",
      data: result
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[TicketFlowController] transitionFlow: ${msg}`);
    return res
      .status(statusCode)
      .json({
        success: false,
        message: "Error al transicionar flujo",
        errors: [msg]
      });
  }
};

/** POST /tickets/:ticketId/flow/escalate  body: { reason } */
export const escalateFlow = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const ticketId = Number(req.params.ticketId);
    const { companyId } = req.user;
    const { reason } = req.body as { reason?: string };

    await ensureTicketBelongsToCompany(ticketId, companyId);

    const result = await TicketFlowEngine.escalate(
      ticketId,
      reason || "manual_user_escalation"
    );

    return res.json({
      success: true,
      message: "Ticket escalado a humano",
      data: result
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[TicketFlowController] escalateFlow: ${msg}`);
    return res
      .status(statusCode)
      .json({ success: false, message: "Error al escalar", errors: [msg] });
  }
};

/** POST /tickets/:ticketId/flow/close  body: { reason? } */
export const closeFlow = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const ticketId = Number(req.params.ticketId);
    const { companyId } = req.user;
    const { reason } = req.body as { reason?: string };

    await ensureTicketBelongsToCompany(ticketId, companyId);

    const result = await TicketFlowEngine.closeTicket(
      ticketId,
      reason || "manual_close"
    );

    return res.json({
      success: true,
      message: "Ticket cerrado",
      data: result
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[TicketFlowController] closeFlow: ${msg}`);
    return res
      .status(statusCode)
      .json({ success: false, message: "Error al cerrar", errors: [msg] });
  }
};

// ============================================================================
// F2 — Seguimientos automáticos
// ============================================================================

/** POST /tickets/:ticketId/followup/schedule  body: { delayMinutes? } */
export const scheduleFollowup = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const ticketId = Number(req.params.ticketId);
    const { companyId } = req.user;
    const { delayMinutes } = req.body as { delayMinutes?: number };

    await ensureTicketBelongsToCompany(ticketId, companyId);

    const result = await TicketFlowEngine.markAwaitingResponse(
      ticketId,
      delayMinutes || 120,
      "manually_scheduled"
    );

    return res.json({
      success: true,
      message: "Seguimiento programado",
      data: result
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[TicketFlowController] scheduleFollowup: ${msg}`);
    return res
      .status(statusCode)
      .json({
        success: false,
        message: "Error al programar seguimiento",
        errors: [msg]
      });
  }
};

/** POST /tickets/:ticketId/followup/disable */
export const disableFollowup = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const ticketId = Number(req.params.ticketId);
    const { companyId } = req.user;

    const ticket = await ensureTicketBelongsToCompany(ticketId, companyId);
    await ticket.update({
      followupEnabled: false,
      nextFollowupAt: null,
      followupReason: null
    });

    return res.json({
      success: true,
      message: "Seguimientos automáticos deshabilitados para este ticket",
      data: { ticketId }
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[TicketFlowController] disableFollowup: ${msg}`);
    return res
      .status(statusCode)
      .json({
        success: false,
        message: "Error al deshabilitar seguimientos",
        errors: [msg]
      });
  }
};

/** POST /admin/followups/run  (solo super) — corre lote ahora */
export const runFollowupsNow = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const isSuper = Boolean(req.user?.super);
    if (!isSuper) {
      return res.status(403).json({
        success: false,
        message: "Solo superadmin puede ejecutar lote manual",
        errors: ["FORBIDDEN"]
      });
    }

    const result = await TicketFollowupService.runDueFollowups();

    return res.json({
      success: true,
      message: "Lote de seguimientos ejecutado",
      data: result
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[TicketFlowController] runFollowupsNow: ${msg}`);
    return res
      .status(statusCode)
      .json({
        success: false,
        message: "Error al ejecutar lote",
        errors: [msg]
      });
  }
};

// ============================================================================
// F7 — OmnichannelDispatcher
// ============================================================================

/** POST /omnichannel/dispatch  body: { ticketId, message, channel?, origin? } */
export const dispatchMessage = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { ticketId, message, channel, origin } = req.body as {
      ticketId: number;
      message: string;
      channel?: SupportedChannel;
      origin?: DispatchOrigin;
    };

    if (!ticketId || !message) {
      return res.status(400).json({
        success: false,
        message: "ticketId y message son requeridos",
        errors: ["MISSING_PARAMS"]
      });
    }

    const ticket = await ensureTicketBelongsToCompany(
      Number(ticketId),
      companyId
    );

    const result = await OmnichannelDispatcher.dispatch({
      ticketId: ticket.id,
      contactId: ticket.contactId,
      companyId,
      message,
      channel,
      origin: origin || "manual",
      triggeredBy: String(req.user?.id || "")
    });

    if (!result.success) {
      return res.status(502).json({
        success: false,
        message: "Falló envío por el canal",
        data: result,
        errors: [result.error || "DISPATCH_FAILED"]
      });
    }

    return res.json({
      success: true,
      message: "Mensaje despachado",
      data: result
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[TicketFlowController] dispatchMessage: ${msg}`);
    return res
      .status(statusCode)
      .json({
        success: false,
        message: "Error al despachar mensaje",
        errors: [msg]
      });
  }
};

/** GET /omnichannel/contact/:contactId/channels */
export const listAvailableChannels = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const contactId = Number(req.params.contactId);
    const { companyId } = req.user;

    const channels = await OmnichannelDispatcher.getAvailableChannels(
      contactId,
      companyId
    );

    return res.json({
      success: true,
      message: "Canales disponibles obtenidos",
      data: {
        contactId,
        channels,
        capabilities: OmnichannelDispatcher.CHANNEL_CAPABILITIES
      }
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[TicketFlowController] listAvailableChannels: ${msg}`);
    return res
      .status(statusCode)
      .json({
        success: false,
        message: "Error al listar canales",
        errors: [msg]
      });
  }
};
