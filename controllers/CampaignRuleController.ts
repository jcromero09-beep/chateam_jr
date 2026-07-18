/**
 * CampaignRuleController
 *
 * Endpoints REST para gestión del Motor de Reglas Automatizadas de Meta Ads.
 * Todas las rutas requieren isAuth. Multi-tenant por companyId del token.
 *
 * GET    /meta-marketing/rules                → getRules
 * POST   /meta-marketing/rules                → createRule
 * GET    /meta-marketing/rules/templates       → getTemplates  ← ANTES de /:id
 * GET    /meta-marketing/rules/:id             → getRuleById
 * PUT    /meta-marketing/rules/:id             → updateRule
 * DELETE /meta-marketing/rules/:id             → deleteRule
 * PUT    /meta-marketing/rules/:id/pause       → pauseRule
 * PUT    /meta-marketing/rules/:id/activate    → activateRule
 * GET    /meta-marketing/rules/:id/logs        → getRuleLogs
 * POST   /meta-marketing/rules/:id/test        → dryRun
 */

import { Request, Response } from "express";
import CampaignRuleService from "../services/CampaignRuleService";
import logger from "../utils/logger";

const LOG_PREFIX = "[CampaignRuleController]";

// ============================================================
// GET /meta-marketing/rules
// Lista paginada de reglas de la empresa
// ============================================================
export const getRules = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { limit = 50, offset = 0, status } = req.query;

    const result = await CampaignRuleService.getRules(companyId, {
      limit: Number(limit),
      offset: Number(offset),
      status: status as string | undefined
    });

    return res.status(200).json({
      success: true,
      message: "Reglas obtenidas correctamente",
      data: result
    });
  } catch (error: any) {
    logger.error(`${LOG_PREFIX} ❌ getRules: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// POST /meta-marketing/rules
// Crear nueva regla automatizada
// ============================================================
export const createRule = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId, id: userId } = req.user;
    const {
      name,
      description,
      scope,
      scopeIds,
      conditions,
      actions,
      notificationPhones,
      frequency,
      cooldownMinutes
    } = req.body;

    if (!name || !conditions || !actions) {
      return res.status(400).json({
        success: false,
        message: "Se requieren: name, conditions y actions"
      });
    }

    const rule = await CampaignRuleService.createRule(companyId, userId, {
      name,
      description,
      scope,
      scopeIds,
      conditions,
      actions,
      notificationPhones,
      frequency,
      cooldownMinutes
    });

    logger.info(`${LOG_PREFIX} ✅ Regla creada: ${rule.id} para empresa ${companyId}`);

    return res.status(201).json({
      success: true,
      message: `Regla "${name}" creada correctamente`,
      data: { rule }
    });
  } catch (error: any) {
    logger.error(`${LOG_PREFIX} ❌ createRule: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// GET /meta-marketing/rules/templates
// Obtener templates pre-configurados + metadata de métricas
// IMPORTANTE: Esta ruta debe registrarse ANTES de /:id
// ============================================================
export const getTemplates = async (req: Request, res: Response): Promise<Response> => {
  try {
    const data = CampaignRuleService.getTemplates();

    return res.status(200).json({
      success: true,
      message: "Templates obtenidos",
      data
    });
  } catch (error: any) {
    logger.error(`${LOG_PREFIX} ❌ getTemplates: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// GET /meta-marketing/rules/:id
// Detalle de una regla con sus últimos 10 logs
// ============================================================
export const getRuleById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const ruleId = Number(req.params.id);

    const rule = await CampaignRuleService.getRuleById(ruleId, companyId);

    return res.status(200).json({
      success: true,
      message: "Regla obtenida",
      data: { rule }
    });
  } catch (error: any) {
    logger.error(`${LOG_PREFIX} ❌ getRuleById: ${error.message}`);
    const status = error.message === "Regla no encontrada" ? 404 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

// ============================================================
// PUT /meta-marketing/rules/:id
// Actualizar regla (nombre, condiciones, acciones, etc.)
// ============================================================
export const updateRule = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const ruleId = Number(req.params.id);
    const {
      name,
      description,
      scope,
      scopeIds,
      conditions,
      actions,
      notificationPhones,
      frequency,
      cooldownMinutes
    } = req.body;

    const rule = await CampaignRuleService.updateRule(ruleId, companyId, {
      name,
      description,
      scope,
      scopeIds,
      conditions,
      actions,
      notificationPhones,
      frequency,
      cooldownMinutes
    });

    return res.status(200).json({
      success: true,
      message: "Regla actualizada correctamente",
      data: { rule }
    });
  } catch (error: any) {
    logger.error(`${LOG_PREFIX} ❌ updateRule: ${error.message}`);
    const status = error.message === "Regla no encontrada" ? 404 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

// ============================================================
// DELETE /meta-marketing/rules/:id
// Eliminar regla y todos sus logs
// ============================================================
export const deleteRule = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const ruleId = Number(req.params.id);

    await CampaignRuleService.deleteRule(ruleId, companyId);

    return res.status(200).json({
      success: true,
      message: "Regla eliminada correctamente",
      data: null
    });
  } catch (error: any) {
    logger.error(`${LOG_PREFIX} ❌ deleteRule: ${error.message}`);
    const status = error.message === "Regla no encontrada" ? 404 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

// ============================================================
// PUT /meta-marketing/rules/:id/pause
// Pausar regla manualmente
// ============================================================
export const pauseRule = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const ruleId = Number(req.params.id);

    const rule = await CampaignRuleService.pauseRule(ruleId, companyId);

    return res.status(200).json({
      success: true,
      message: "Regla pausada",
      data: { rule }
    });
  } catch (error: any) {
    logger.error(`${LOG_PREFIX} ❌ pauseRule: ${error.message}`);
    const status = error.message === "Regla no encontrada" ? 404 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

// ============================================================
// PUT /meta-marketing/rules/:id/activate
// Activar regla (y resetear errores consecutivos)
// ============================================================
export const activateRule = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const ruleId = Number(req.params.id);

    const rule = await CampaignRuleService.activateRule(ruleId, companyId);

    return res.status(200).json({
      success: true,
      message: "Regla activada",
      data: { rule }
    });
  } catch (error: any) {
    logger.error(`${LOG_PREFIX} ❌ activateRule: ${error.message}`);
    const status = error.message === "Regla no encontrada" ? 404 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

// ============================================================
// GET /meta-marketing/rules/:id/logs
// Historial de ejecuciones de la regla (paginado)
// ============================================================
export const getRuleLogs = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const ruleId = Number(req.params.id);
    const { limit = 50, offset = 0 } = req.query;

    const result = await CampaignRuleService.getRuleLogs(ruleId, companyId, {
      limit: Number(limit),
      offset: Number(offset)
    });

    return res.status(200).json({
      success: true,
      message: "Logs obtenidos",
      data: result
    });
  } catch (error: any) {
    logger.error(`${LOG_PREFIX} ❌ getRuleLogs: ${error.message}`);
    const status = error.message === "Regla no encontrada" ? 404 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

// ============================================================
// POST /meta-marketing/rules/:id/test
// Dry run: evalúa condiciones sin ejecutar acciones reales
// ============================================================
export const dryRun = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const ruleId = Number(req.params.id);
    const { whatsappId } = req.query;

    const result = await CampaignRuleService.dryRun(
      ruleId,
      companyId,
      whatsappId ? Number(whatsappId) : undefined
    );

    const triggered = result.results.filter(r => r.conditionsMet).length;

    return res.status(200).json({
      success: true,
      message: `Simulación completada: ${triggered}/${result.results.length} campañas dispararían la regla`,
      data: result
    });
  } catch (error: any) {
    logger.error(`${LOG_PREFIX} ❌ dryRun: ${error.message}`);
    const status = error.message === "Regla no encontrada" ? 404 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};
