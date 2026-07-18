/**
 * Routes: PRIMERA OLA (2026-05-07)
 *   F1: TicketFlowEngine
 *   F2: Seguimientos automáticos
 *   F7: OmnichannelDispatcher
 *
 * Todas las rutas requieren isAuth (multi-tenant nativo).
 * Solo /admin/followups/run requiere superadmin.
 */

import { Router } from "express";
import isAuth from "../middleware/isAuth";
import isSuper from "../middleware/isSuper";
import * as TicketFlowController from "../controllers/TicketFlowController";

const ticketFlowRoutes = Router();

// ─── F1: Flujo IA por ticket ──────────────────────────────────────────────
ticketFlowRoutes.get(
  "/tickets/:ticketId/flow",
  isAuth,
  TicketFlowController.getFlowState
);

ticketFlowRoutes.post(
  "/tickets/:ticketId/flow/transition",
  isAuth,
  TicketFlowController.transitionFlow
);

ticketFlowRoutes.post(
  "/tickets/:ticketId/flow/escalate",
  isAuth,
  TicketFlowController.escalateFlow
);

ticketFlowRoutes.post(
  "/tickets/:ticketId/flow/close",
  isAuth,
  TicketFlowController.closeFlow
);

// ─── F2: Seguimientos automáticos ──────────────────────────────────────────
ticketFlowRoutes.post(
  "/tickets/:ticketId/followup/schedule",
  isAuth,
  TicketFlowController.scheduleFollowup
);

ticketFlowRoutes.post(
  "/tickets/:ticketId/followup/disable",
  isAuth,
  TicketFlowController.disableFollowup
);

ticketFlowRoutes.post(
  "/admin/followups/run",
  isAuth,
  isSuper,
  TicketFlowController.runFollowupsNow
);

// ─── F7: OmnichannelDispatcher ─────────────────────────────────────────────
ticketFlowRoutes.post(
  "/omnichannel/dispatch",
  isAuth,
  TicketFlowController.dispatchMessage
);

ticketFlowRoutes.get(
  "/omnichannel/contact/:contactId/channels",
  isAuth,
  TicketFlowController.listAvailableChannels
);

export default ticketFlowRoutes;
