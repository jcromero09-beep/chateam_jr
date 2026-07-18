/**
 * Routes: Agent Interactions (UGC Campaign System — Phase 2)
 * Define las rutas para el sistema de engagement e interacciones de agentes.
 *
 * Endpoints:
 * GET    /api/ugc/interactions/inbox             - Bandeja de comentarios
 * GET    /api/ugc/interactions/analytics         - Estadisticas agregadas
 * POST   /api/ugc/interactions/:commentId/reply  - Responder a comentario
 * POST   /api/ugc/interactions/:commentId/classify - Clasificar comentario
 * GET    /api/ugc/interactions/:identityId/history - Historial de interacciones
 */

import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as AgentInteractionController from "../controllers/AgentInteractionController";

const agentInteractionRoutes = Router();

// --- Rutas especificas ANTES de rutas con parametros ---

// Bandeja de comentarios
agentInteractionRoutes.get(
  "/ugc/interactions/inbox",
  isAuth,
  AgentInteractionController.inbox
);

// Estadisticas agregadas de interacciones
agentInteractionRoutes.get(
  "/ugc/interactions/analytics",
  isAuth,
  AgentInteractionController.analytics
);

// --- Rutas con parametros ---

// Responder a un comentario (orquesta flujo completo)
agentInteractionRoutes.post(
  "/ugc/interactions/:commentId/reply",
  isAuth,
  AgentInteractionController.replyToComment
);

// Clasificar un comentario con IA
agentInteractionRoutes.post(
  "/ugc/interactions/:commentId/classify",
  isAuth,
  AgentInteractionController.classifyComment
);

// Historial de interacciones de un agente
agentInteractionRoutes.get(
  "/ugc/interactions/:identityId/history",
  isAuth,
  AgentInteractionController.interactionHistory
);

export default agentInteractionRoutes;
