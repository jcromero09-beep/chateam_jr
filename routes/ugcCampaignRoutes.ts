/**
 * Routes: UGC Campaigns (FASE 4 — UGC Pipeline)
 * Define todas las rutas para el sistema de campanas UGC.
 *
 * Endpoints:
 * POST   /api/ugc/campaigns                  - Crear campana
 * GET    /api/ugc/campaigns                  - Listar campanas (paginado)
 * GET    /api/ugc/campaigns/:id              - Detalle de campana
 * PUT    /api/ugc/campaigns/:id              - Actualizar campana
 * POST   /api/ugc/campaigns/:id/launch       - Lanzar campana
 * POST   /api/ugc/campaigns/:id/pause        - Pausar campana
 * GET    /api/ugc/campaigns/:id/videos       - Videos de la campana
 */

import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as UGCCampaignController from "../controllers/UGCCampaignController";

const ugcCampaignRoutes = Router();

// --- CRUD Campanas ---

// Crear campana UGC
ugcCampaignRoutes.post(
  "/ugc/campaigns",
  isAuth,
  UGCCampaignController.create
);

// Listar campanas con paginacion y filtros
ugcCampaignRoutes.get(
  "/ugc/campaigns",
  isAuth,
  UGCCampaignController.list
);

// Detalle de una campana
ugcCampaignRoutes.get(
  "/ugc/campaigns/:id",
  isAuth,
  UGCCampaignController.show
);

// Actualizar campos editables
ugcCampaignRoutes.put(
  "/ugc/campaigns/:id",
  isAuth,
  UGCCampaignController.update
);

// --- Acciones de campana ---

// Lanzar campana (draft/paused -> producing)
ugcCampaignRoutes.post(
  "/ugc/campaigns/:id/launch",
  isAuth,
  UGCCampaignController.launch
);

// Pausar campana activa
ugcCampaignRoutes.post(
  "/ugc/campaigns/:id/pause",
  isAuth,
  UGCCampaignController.pause
);

// Listar videos de una campana
ugcCampaignRoutes.get(
  "/ugc/campaigns/:id/videos",
  isAuth,
  UGCCampaignController.listVideos
);

export default ugcCampaignRoutes;
