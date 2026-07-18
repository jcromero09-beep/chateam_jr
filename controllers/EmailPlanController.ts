/**
 * EmailPlanController — Módulo de Planes de Email
 * CRUD de planes de email + balance y uso de créditos
 */

import { Request, Response } from "express";
import logger from "../utils/logger";
import EmailPlanService from "../services/EmailPlanService";

/** Helper: extrae message y statusCode de errores */
const extractError = (error: unknown): { msg: string; statusCode: number } => {
  if (error instanceof AppError) {
    return { msg: error.message, statusCode: error.statusCode };
  }
  if (error instanceof Error) {
    const msg = error.message;
    const statusCode = msg.includes("NOT_FOUND") ? 404 : msg.includes("ERR_") ? 400 : 500;
    return { msg, statusCode };
  }
  return { msg: String(error), statusCode: 500 };
};

// Importar AppError para el helper
import AppError from "../errors/AppError";

// ============================================================================
// PLANES (PÚBLICO)
// ============================================================================

/**
 * Lista todos los planes de email disponibles
 * GET /email-plans
 */
export const listEmailPlans = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { includePrivate } = req.query;
    const plans = await EmailPlanService.listEmailPlans(includePrivate === "true");

    return res.json({
      success: true,
      message: "Planes de email obtenidos exitosamente",
      data: plans
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[EmailPlanController] Error listando planes: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: "Error al listar los planes",
      errors: [msg]
    });
  }
};

/**
 * Obtiene un plan de email por ID
 * GET /email-plans/:id
 */
export const getEmailPlan = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const parsedId = Number(id);

    if (isNaN(parsedId)) {
      return res.status(400).json({
        success: false,
        message: "ID de plan inválido",
        errors: ["El ID del plan debe ser un número válido"]
      });
    }

    const plan = await EmailPlanService.getEmailPlanById(parsedId);

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan de email no encontrado",
        errors: ["El plan no existe"]
      });
    }

    return res.json({
      success: true,
      message: "Plan de email obtenido exitosamente",
      data: plan
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[EmailPlanController] Error obteniendo plan: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: "Error al obtener el plan",
      errors: [msg]
    });
  }
};

// ============================================================================
// PLANES (COMPANY - AUTH)
// ============================================================================

/**
 * Obtiene el balance de créditos de email de la company actual
 * GET /email-plans/balance
 */
export const getEmailBalance = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const balance = await EmailPlanService.getEmailBalance(Number(companyId));

    return res.json({
      success: true,
      message: "Balance de email obtenido exitosamente",
      data: balance
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[EmailPlanController] Error obteniendo balance: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: "Error al obtener el balance",
      errors: [msg]
    });
  }
};

/**
 * Obtiene el uso de créditos de email de la company actual
 * GET /email-plans/usage
 */
export const getEmailUsage = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const usage = await EmailPlanService.getEmailUsage(Number(companyId));

    return res.json({
      success: true,
      message: "Uso de email obtenido exitosamente",
      data: usage
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[EmailPlanController] Error obteniendo uso: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: "Error al obtener el uso",
      errors: [msg]
    });
  }
};

// ============================================================================
// PLANES (SUPERADMIN)
// ============================================================================

/**
 * Crea un nuevo plan de email
 * POST /email-plans
 */
export const createEmailPlan = async (req: Request, res: Response): Promise<Response> => {
  try {
    const {
      name,
      description,
      emailCreditsPerCycle,
      maxEmailSendsPerDay,
      maxTemplates,
      price,
      recurrence,
      isPublic,
      isActive
    } = req.body;

    const plan = await EmailPlanService.createEmailPlan({
      name,
      description,
      emailCreditsPerCycle,
      maxEmailSendsPerDay,
      maxTemplates,
      price,
      recurrence,
      isPublic,
      isActive
    });

    return res.status(201).json({
      success: true,
      message: "Plan de email creado exitosamente",
      data: plan
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[EmailPlanController] Error creando plan: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: "Error al crear el plan",
      errors: [msg]
    });
  }
};

/**
 * Actualiza un plan de email
 * PUT /email-plans/:id
 */
export const updateEmailPlan = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const parsedId = Number(id);

    if (isNaN(parsedId)) {
      return res.status(400).json({
        success: false,
        message: "ID de plan inválido",
        errors: ["El ID del plan debe ser un número válido"]
      });
    }

    const updateData = req.body;

    const plan = await EmailPlanService.updateEmailPlan(parsedId, updateData);

    return res.json({
      success: true,
      message: "Plan de email actualizado exitosamente",
      data: plan
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[EmailPlanController] Error actualizando plan: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: "Error al actualizar el plan",
      errors: [msg]
    });
  }
};

/**
 * Elimina un plan de email
 * DELETE /email-plans/:id
 */
export const deleteEmailPlan = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const parsedId = Number(id);

    if (isNaN(parsedId)) {
      return res.status(400).json({
        success: false,
        message: "ID de plan inválido",
        errors: ["El ID del plan debe ser un número válido"]
      });
    }

    await EmailPlanService.deleteEmailPlan(parsedId);

    return res.json({
      success: true,
      message: "Plan de email eliminado exitosamente",
      data: null
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[EmailPlanController] Error eliminando plan: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: "Error al eliminar el plan",
      errors: [msg]
    });
  }
};

// ============================================================================
// COMPRA (COMPANY)
// ============================================================================

/**
 * Provisiona créditos de email (para uso interno después del pago)
 * POST /email-plans/provision
 */
export const provisionEmailCredits = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId, emailPlanId, mode } = req.body;

    const result = await EmailPlanService.provisionEmailCredits(
      Number(companyId),
      Number(emailPlanId),
      mode || "initialize"
    );

    return res.json({
      success: true,
      message: "Créditos de email provisionados exitosamente",
      data: result
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[EmailPlanController] Error provisionando créditos: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: "Error al provisionar los créditos",
      errors: [msg]
    });
  }
};
