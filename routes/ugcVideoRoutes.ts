/**
 * Routes: UGC Videos (FASE 4 — UGC Pipeline)
 * Define todas las rutas para video jobs UGC.
 *
 * Endpoints:
 * GET    /api/ugc/videos                      - Listar video jobs (paginado)
 * GET    /api/ugc/videos/:id                  - Detalle de video job
 * POST   /api/ugc/videos/:id/retry            - Re-encolar video job fallido
 * GET    /api/ugc/videos/:id/download         - URL de descarga del asset final
 */

import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as UGCVideoController from "../controllers/UGCVideoController";

const ugcVideoRoutes = Router();

// Listar video jobs con paginacion y filtros
ugcVideoRoutes.get(
  "/ugc/videos",
  isAuth,
  UGCVideoController.list
);

// Detalle de un video job con assets
ugcVideoRoutes.get(
  "/ugc/videos/:id",
  isAuth,
  UGCVideoController.show
);

// Re-encolar video job fallido
ugcVideoRoutes.post(
  "/ugc/videos/:id/retry",
  isAuth,
  UGCVideoController.retry
);

// Obtener URL de descarga del asset final
ugcVideoRoutes.get(
  "/ugc/videos/:id/download",
  isAuth,
  UGCVideoController.download
);

export default ugcVideoRoutes;
