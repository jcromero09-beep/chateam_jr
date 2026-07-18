/**
 * Routes: catálogo de modelos fal.ai disponibles para UGC.
 *
 * GET /ugc/fal-models  — Lista los 6 modelos del catálogo estático.
 *
 * Catálogo es source-of-truth en backend; no se hacen requests a fal.ai.
 * Las URLs de preview son assets públicos de fal-public-storage.
 */

import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as UGCCampaignController from "../controllers/UGCCampaignController";

const falModelsRoutes = Router();

falModelsRoutes.get(
  "/ugc/fal-models",
  isAuth,
  UGCCampaignController.listFalModels
);

export default falModelsRoutes;
