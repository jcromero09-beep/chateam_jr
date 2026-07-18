/**
 * Routes: UGC Social (UGC Campaign System — Phase 2)
 * Define las rutas para cuentas sociales y publicaciones del sistema UGC.
 *
 * Endpoints:
 * POST   /api/ugc/social/connect                - Conecta cuenta social
 * GET    /api/ugc/social/accounts               - Lista cuentas sociales
 * GET    /api/ugc/social/posts                  - Lista publicaciones
 * POST   /api/ugc/social/:id/sync               - Sincroniza metricas
 * DELETE /api/ugc/social/:id                    - Revoca cuenta social
 */

import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as UGCSocialController from "../controllers/UGCSocialController";

const ugcSocialRoutes = Router();

// --- Rutas especificas ANTES de rutas con parametros ---

// Conectar cuenta social
ugcSocialRoutes.post(
  "/ugc/social/connect",
  isAuth,
  UGCSocialController.connectAccount
);

// Listar cuentas sociales
ugcSocialRoutes.get(
  "/ugc/social/accounts",
  isAuth,
  UGCSocialController.listAccounts
);

// Listar publicaciones sociales
ugcSocialRoutes.get(
  "/ugc/social/posts",
  isAuth,
  UGCSocialController.listPosts
);

// --- Rutas con parametros ---

// Sincronizar metricas de una cuenta
ugcSocialRoutes.post(
  "/ugc/social/:id/sync",
  isAuth,
  UGCSocialController.syncMetrics
);

// Revocar cuenta social (soft delete)
ugcSocialRoutes.delete(
  "/ugc/social/:id",
  isAuth,
  UGCSocialController.removeAccount
);

export default ugcSocialRoutes;
