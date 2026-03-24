/**
 * Routes: Agent Identity (UGC Campaign System)
 * Define todas las rutas para el sistema de identidades de agentes virtuales.
 *
 * Endpoints:
 * POST   /api/ugc/identities/generate          - Genera identidad completa
 * GET    /api/ugc/identities                    - Lista identidades (paginado)
 * GET    /api/ugc/identities/:id                - Detalle de identidad
 * POST   /api/ugc/identities/:id/regenerate-photo - Regenera foto de perfil
 * PUT    /api/ugc/identities/:id                - Actualiza campos basicos
 * DELETE /api/ugc/identities/:id                - Archiva (soft delete)
 */

import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as AgentIdentityController from "../controllers/AgentIdentityController";

const agentIdentityRoutes = Router();

// --- Rutas especificas ANTES de rutas con parametros ---

// Generar identidad completa (personalidad + foto + contenido semilla)
agentIdentityRoutes.post(
  "/ugc/identities/generate",
  isAuth,
  AgentIdentityController.generate
);

// Generar pool de identidades en batch (via cola Bull)
agentIdentityRoutes.post(
  "/ugc/identities/generate-pool",
  isAuth,
  AgentIdentityController.generatePool
);

// --- Rutas CRUD ---

// Listar identidades con paginacion y filtros
agentIdentityRoutes.get(
  "/ugc/identities",
  isAuth,
  AgentIdentityController.list
);

// Obtener detalle de una identidad
agentIdentityRoutes.get(
  "/ugc/identities/:id",
  isAuth,
  AgentIdentityController.show
);

// Regenerar foto de perfil
agentIdentityRoutes.post(
  "/ugc/identities/:id/regenerate-photo",
  isAuth,
  AgentIdentityController.regeneratePhoto
);

// Actualizar campos basicos
agentIdentityRoutes.put(
  "/ugc/identities/:id",
  isAuth,
  AgentIdentityController.update
);

// Archivar (soft delete)
agentIdentityRoutes.delete(
  "/ugc/identities/:id",
  isAuth,
  AgentIdentityController.remove
);

export default agentIdentityRoutes;
