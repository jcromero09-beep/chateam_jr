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

import crypto from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";
import { Router } from "express";
import isAuth from "../middleware/isAuth";
import uploadConfig from "../config/upload";
import * as UGCCampaignController from "../controllers/UGCCampaignController";

const ugcCampaignRoutes = Router();

const ugcReferenceUpload = multer({
  storage: multer.diskStorage({
    destination(req, _file, cb) {
      const companyId = req.user?.companyId;
      if (!companyId) return cb(new Error("Company ID not found"), "");

      const folder = path.resolve(
        uploadConfig.directory,
        `company${companyId}`,
        "ugc",
        "references"
      );
      fs.mkdirSync(folder, { recursive: true });
      return cb(null, folder);
    },
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname) || ".png";
      const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, "").slice(0, 12) || ".png";
      cb(null, `${Date.now()}_${crypto.randomUUID()}${safeExt}`);
    }
  }),
  fileFilter(_req, file, cb) {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("ERR_UGC_REFERENCE_IMAGE_REQUIRED"));
    }
    return cb(null, true);
  },
  limits: {
    fileSize: Number(process.env.UGC_REFERENCE_MAX_FILE_SIZE || 15 * 1024 * 1024)
  }
});

// --- CRUD Campanas ---

ugcCampaignRoutes.post(
  "/ugc/assets/reference",
  isAuth,
  ugcReferenceUpload.single("file"),
  UGCCampaignController.uploadReference
);

// Crear campana UGC
ugcCampaignRoutes.post(
  "/ugc/campaigns",
  isAuth,
  UGCCampaignController.create
);

// Listar campanas con paginacion y filtros
ugcCampaignRoutes.get(
  "/ugc/dashboard",
  isAuth,
  UGCCampaignController.dashboard
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

// Selección de modelo fal.ai para la campaña (video + image edit)
// Body: { videoModelKey?, videoModelDefaults?, videoModelMotionReferenceUrl?,
//         imageModelKey?, imageModelDefaults? }
ugcCampaignRoutes.patch(
  "/ugc/campaigns/:id/model-selection",
  isAuth,
  UGCCampaignController.updateModelSelection
);

export default ugcCampaignRoutes;
