import { Request, Response } from "express";
import ContactTemperatureService from "../services/ContactTemperatureService";
import logger from "../utils/logger";

/**
 * GET /contact-temperature/distribution
 * Obtener distribución de temperaturas (hot/warm/cold) para la empresa
 */
const getDistribution = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const distribution = await ContactTemperatureService.getDistribution(companyId);

    return res.json({
      success: true,
      message: "Distribución de temperaturas obtenida",
      data: distribution
    });
  } catch (error: any) {
    logger.error(`[ContactTemperatureController] getDistribution error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Error obteniendo distribución de temperaturas",
      errors: [error.message]
    });
  }
};

/**
 * GET /contact-temperature/contacts/:category
 * Listar contactos por categoría (hot/warm/cold)
 */
const getContactsByCategory = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { category } = req.params;
    const { limit, offset, search } = req.query;

    if (!["hot", "warm", "cold"].includes(category)) {
      return res.status(400).json({
        success: false,
        message: "Categoría inválida. Usa: hot, warm, cold",
        errors: ["invalid_category"]
      });
    }

    const result = await ContactTemperatureService.getContactsByCategory(
      companyId,
      category as "hot" | "warm" | "cold",
      {
        limit: limit ? parseInt(String(limit)) : 50,
        offset: offset ? parseInt(String(offset)) : 0,
        search: search ? String(search) : undefined
      }
    );

    return res.json({
      success: true,
      message: `Contactos ${category} obtenidos`,
      data: result
    });
  } catch (error: any) {
    logger.error(`[ContactTemperatureController] getContactsByCategory error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Error obteniendo contactos por categoría",
      errors: [error.message]
    });
  }
};

/**
 * GET /contact-temperature/:contactId
 * Obtener temperatura de un contacto específico
 */
const getContactTemperature = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { contactId } = req.params;

    const temperature = await ContactTemperatureService.getContactTemperature(
      parseInt(contactId),
      companyId
    );

    if (!temperature) {
      return res.status(404).json({
        success: false,
        message: "Temperatura no encontrada para este contacto. Ejecuta un recálculo primero.",
        errors: ["not_found"]
      });
    }

    return res.json({
      success: true,
      message: "Temperatura del contacto obtenida",
      data: temperature
    });
  } catch (error: any) {
    logger.error(`[ContactTemperatureController] getContactTemperature error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Error obteniendo temperatura del contacto",
      errors: [error.message]
    });
  }
};

/**
 * POST /contact-temperature/recalculate
 * Trigger manual de recálculo para la empresa actual
 */
const triggerRecalculate = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;

    // Ejecutar recálculo asíncrono (no bloquear la respuesta)
    const result = await ContactTemperatureService.recalculateForCompany(companyId);

    return res.json({
      success: true,
      message: `Recálculo completado: ${result.processed} contactos procesados`,
      data: result
    });
  } catch (error: any) {
    logger.error(`[ContactTemperatureController] triggerRecalculate error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Error ejecutando recálculo de temperaturas",
      errors: [error.message]
    });
  }
};

export default {
  getDistribution,
  getContactsByCategory,
  getContactTemperature,
  triggerRecalculate
};
