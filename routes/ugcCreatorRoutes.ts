/**
 * Routes: UGC Creators (UGC Campaign System — Phase 3)
 * Define las rutas para la red de creadores de contenido UGC.
 *
 * Endpoints:
 * POST   /api/ugc/creators                         - Crear creador
 * GET    /api/ugc/creators                          - Listar creadores
 * GET    /api/ugc/creators/:id                      - Detalle de creador
 * PUT    /api/ugc/creators/:id                      - Actualizar creador
 * POST   /api/ugc/creators/:id/assign/:campaignId   - Asignar a campana
 * GET    /api/ugc/creators/:id/assignments           - Listar asignaciones
 * POST   /api/ugc/creators/:id/pay                  - Procesar pago
 * GET    /api/ugc/creators/:id/payments              - Listar pagos
 * DELETE /api/ugc/creators/:id                      - Archivar creador
 */

import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as UGCCreatorController from "../controllers/UGCCreatorController";

const ugcCreatorRoutes = Router();

// --- Rutas CRUD ---

// Crear nuevo creador
ugcCreatorRoutes.post(
  "/ugc/creators",
  isAuth,
  UGCCreatorController.create
);

// Listar creadores con paginacion
ugcCreatorRoutes.get(
  "/ugc/creators",
  isAuth,
  UGCCreatorController.list
);

// Detalle de un creador
ugcCreatorRoutes.get(
  "/ugc/creators/:id",
  isAuth,
  UGCCreatorController.show
);

// Actualizar creador
ugcCreatorRoutes.put(
  "/ugc/creators/:id",
  isAuth,
  UGCCreatorController.update
);

// --- Rutas de acciones ---

// Asignar creador a campana
ugcCreatorRoutes.post(
  "/ugc/creators/:id/assign/:campaignId",
  isAuth,
  UGCCreatorController.assignToCampaign
);

// Listar asignaciones del creador
ugcCreatorRoutes.get(
  "/ugc/creators/:id/assignments",
  isAuth,
  UGCCreatorController.listAssignments
);

// Procesar pago al creador
ugcCreatorRoutes.post(
  "/ugc/creators/:id/pay",
  isAuth,
  UGCCreatorController.processPayment
);

// Listar pagos del creador
ugcCreatorRoutes.get(
  "/ugc/creators/:id/payments",
  isAuth,
  UGCCreatorController.listPayments
);

// Archivar creador (soft delete)
ugcCreatorRoutes.delete(
  "/ugc/creators/:id",
  isAuth,
  UGCCreatorController.remove
);

export default ugcCreatorRoutes;
