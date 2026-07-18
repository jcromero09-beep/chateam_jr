/**
 * coexistenceDispatchRoutes — FASE 4 Coexistencia WhatsApp.
 *
 * Endpoints del nuevo pipeline unificado:
 *   GET  /coexistence/routing-preview/:ticketId?mode=auto|force_meta|force_baileys|sticky_inbound
 *   POST /coexistence/dispatch/:ticketId  { body, mode? }
 */
import express from "express";
import isAuth from "../middleware/isAuth";
import * as CoexistenceDispatchController from "../controllers/CoexistenceDispatchController";
// FASE 5 Coexistencia — policy por conversación
import * as CoexistencePolicyController from "../controllers/CoexistencePolicyController";

const coexistenceDispatchRoutes = express.Router();

coexistenceDispatchRoutes.get(
  "/coexistence/routing-preview/:ticketId",
  isAuth,
  CoexistenceDispatchController.routingPreview
);

coexistenceDispatchRoutes.post(
  "/coexistence/dispatch/:ticketId",
  isAuth,
  CoexistenceDispatchController.dispatchOne
);

// FASE 5 — política dinámica por ticket/conversación
coexistenceDispatchRoutes.get(
  "/coexistence/tickets/:ticketId/routing-policy",
  isAuth,
  CoexistencePolicyController.getRoutingPolicy
);

coexistenceDispatchRoutes.put(
  "/coexistence/tickets/:ticketId/routing-policy",
  isAuth,
  CoexistencePolicyController.setRoutingPolicy
);

// Cambiar el transporte DUEÑO del ticket (canal activo real: Meta | Baileys)
coexistenceDispatchRoutes.post(
  "/coexistence/tickets/:ticketId/switch-owner",
  isAuth,
  CoexistencePolicyController.switchOwner
);

// FASE 6 — listado de dispatches del ticket (timeline UI)
coexistenceDispatchRoutes.get(
  "/coexistence/tickets/:ticketId/dispatches",
  isAuth,
  CoexistenceDispatchController.listDispatches
);

export default coexistenceDispatchRoutes;
