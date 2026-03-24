import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as CampaignRuleController from "../controllers/CampaignRuleController";

const campaignRuleRoutes = Router();

// GET /meta-marketing/rules/templates — ANTES de /:id para evitar conflicto
campaignRuleRoutes.get(
  "/meta-marketing/rules/templates",
  isAuth,
  CampaignRuleController.getTemplates
);

// GET /meta-marketing/rules — Lista paginada
campaignRuleRoutes.get(
  "/meta-marketing/rules",
  isAuth,
  CampaignRuleController.getRules
);

// POST /meta-marketing/rules — Crear regla
campaignRuleRoutes.post(
  "/meta-marketing/rules",
  isAuth,
  CampaignRuleController.createRule
);

// GET /meta-marketing/rules/:id — Detalle de regla
campaignRuleRoutes.get(
  "/meta-marketing/rules/:id",
  isAuth,
  CampaignRuleController.getRuleById
);

// PUT /meta-marketing/rules/:id — Actualizar regla
campaignRuleRoutes.put(
  "/meta-marketing/rules/:id",
  isAuth,
  CampaignRuleController.updateRule
);

// DELETE /meta-marketing/rules/:id — Eliminar regla
campaignRuleRoutes.delete(
  "/meta-marketing/rules/:id",
  isAuth,
  CampaignRuleController.deleteRule
);

// PUT /meta-marketing/rules/:id/pause — Pausar regla
campaignRuleRoutes.put(
  "/meta-marketing/rules/:id/pause",
  isAuth,
  CampaignRuleController.pauseRule
);

// PUT /meta-marketing/rules/:id/activate — Activar regla
campaignRuleRoutes.put(
  "/meta-marketing/rules/:id/activate",
  isAuth,
  CampaignRuleController.activateRule
);

// GET /meta-marketing/rules/:id/logs — Historial de ejecución
campaignRuleRoutes.get(
  "/meta-marketing/rules/:id/logs",
  isAuth,
  CampaignRuleController.getRuleLogs
);

// POST /meta-marketing/rules/:id/test — Dry run / test
campaignRuleRoutes.post(
  "/meta-marketing/rules/:id/test",
  isAuth,
  CampaignRuleController.dryRun
);

export default campaignRuleRoutes;
