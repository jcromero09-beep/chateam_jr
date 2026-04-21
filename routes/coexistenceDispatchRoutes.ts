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

export default coexistenceDispatchRoutes;
