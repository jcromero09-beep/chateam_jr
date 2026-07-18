import { Request, Response } from "express";
import AudienceSegmentationService from "../services/AudienceSegmentationService";
import logger from "../utils/logger";

/**
 * GET /meta-marketing/interests/search?q=
 */
const searchInterests = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { q, whatsappId } = req.query;

    if (!q || String(q).trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "El parámetro 'q' debe tener al menos 2 caracteres",
        errors: ["invalid_query"]
      });
    }

    const interests = await AudienceSegmentationService.searchInterests(
      companyId,
      String(q),
      whatsappId ? parseInt(String(whatsappId)) : undefined
    );

    return res.json({
      success: true,
      message: `${interests.length} intereses encontrados para "${q}"`,
      data: interests
    });
  } catch (error: any) {
    logger.error(`[AudienceSegmentationController] searchInterests error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Error buscando intereses",
      errors: [error.message]
    });
  }
};

/**
 * GET /meta-marketing/interests/suggestions/:id
 */
const getInterestSuggestions = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    const { whatsappId } = req.query;

    const suggestions = await AudienceSegmentationService.getInterestSuggestions(
      companyId,
      [id],
      whatsappId ? parseInt(String(whatsappId)) : undefined
    );

    return res.json({
      success: true,
      message: `${suggestions.length} sugerencias encontradas`,
      data: suggestions
    });
  } catch (error: any) {
    logger.error(`[AudienceSegmentationController] getInterestSuggestions error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Error obteniendo sugerencias",
      errors: [error.message]
    });
  }
};

/**
 * GET /meta-marketing/audiences
 */
const listAudiences = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { whatsappId } = req.query;

    const audiences = await AudienceSegmentationService.listAudiences(
      companyId,
      whatsappId ? parseInt(String(whatsappId)) : undefined
    );

    return res.json({
      success: true,
      message: `${audiences.length} audiences encontradas`,
      data: audiences
    });
  } catch (error: any) {
    logger.error(`[AudienceSegmentationController] listAudiences error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Error listando audiences",
      errors: [error.message]
    });
  }
};

/**
 * POST /meta-marketing/audiences/custom
 * Body: { name, category?, whatsappId? }
 */
const createCustomAudience = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { name, category, whatsappId } = req.body;

    if (!name || !category) {
      return res.status(400).json({
        success: false,
        message: "Se requieren 'name' y 'category' (hot/warm/cold)",
        errors: ["missing_fields"]
      });
    }

    if (!["hot", "warm", "cold"].includes(category)) {
      return res.status(400).json({
        success: false,
        message: "Categoría inválida. Usa: hot, warm, cold",
        errors: ["invalid_category"]
      });
    }

    const result = await AudienceSegmentationService.createAudienceFromTemperature(
      companyId,
      category,
      name,
      whatsappId ? parseInt(String(whatsappId)) : undefined
    );

    return res.json({
      success: true,
      message: `Audience "${name}" creada con ${result.usersAdded} usuarios`,
      data: result
    });
  } catch (error: any) {
    logger.error(`[AudienceSegmentationController] createCustomAudience error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Error creando Custom Audience",
      errors: [error.message]
    });
  }
};

/**
 * POST /meta-marketing/audiences/lookalike
 * Body: { name, originAudienceId, country, ratio, whatsappId? }
 */
const createLookalikeAudience = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { name, originAudienceId, country, ratio, whatsappId } = req.body;

    if (!name || !originAudienceId || !country || !ratio) {
      return res.status(400).json({
        success: false,
        message: "Se requieren: name, originAudienceId, country, ratio",
        errors: ["missing_fields"]
      });
    }

    const result = await AudienceSegmentationService.createLookalikeFromAudience(
      companyId,
      originAudienceId,
      name,
      country,
      parseFloat(String(ratio)),
      whatsappId ? parseInt(String(whatsappId)) : undefined
    );

    return res.json({
      success: true,
      message: `Lookalike Audience "${name}" creada`,
      data: result
    });
  } catch (error: any) {
    logger.error(`[AudienceSegmentationController] createLookalikeAudience error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Error creando Lookalike Audience",
      errors: [error.message]
    });
  }
};

/**
 * DELETE /meta-marketing/audiences/:id
 */
const deleteAudience = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    const { whatsappId } = req.query;

    await AudienceSegmentationService.deleteAudience(
      companyId,
      id,
      whatsappId ? parseInt(String(whatsappId)) : undefined
    );

    return res.json({
      success: true,
      message: `Audience ${id} eliminada correctamente`,
      data: { deleted: true }
    });
  } catch (error: any) {
    logger.error(`[AudienceSegmentationController] deleteAudience error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Error eliminando audience",
      errors: [error.message]
    });
  }
};

/**
 * POST /meta-marketing/audiences/:id/sync
 * Body: { category, whatsappId? }
 */
const syncAudienceWithTemperature = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    const { category, whatsappId } = req.body;

    if (!category || !["hot", "warm", "cold"].includes(category)) {
      return res.status(400).json({
        success: false,
        message: "Se requiere 'category' (hot/warm/cold)",
        errors: ["invalid_category"]
      });
    }

    const result = await AudienceSegmentationService.syncAudienceWithTemperature(
      companyId,
      id,
      category,
      whatsappId ? parseInt(String(whatsappId)) : undefined
    );

    return res.json({
      success: true,
      message: `Audience sincronizada: ${result.added} usuarios agregados de ${result.total} totales`,
      data: result
    });
  } catch (error: any) {
    logger.error(`[AudienceSegmentationController] syncAudience error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Error sincronizando audience",
      errors: [error.message]
    });
  }
};

/**
 * GET /meta-marketing/audiences/reach-estimate
 * Query: targetingSpec (JSON string)
 */
const estimateReach = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { targetingSpec, whatsappId } = req.query;

    if (!targetingSpec) {
      return res.status(400).json({
        success: false,
        message: "Se requiere 'targetingSpec' como JSON string",
        errors: ["missing_targeting_spec"]
      });
    }

    let parsedSpec: Record<string, unknown>;
    try {
      parsedSpec = JSON.parse(String(targetingSpec));
    } catch {
      return res.status(400).json({
        success: false,
        message: "targetingSpec no es un JSON válido",
        errors: ["invalid_json"]
      });
    }

    const estimate = await AudienceSegmentationService.estimateReach(
      companyId,
      parsedSpec,
      whatsappId ? parseInt(String(whatsappId)) : undefined
    );

    return res.json({
      success: true,
      message: `Estimación: ${estimate.users.toLocaleString()} usuarios`,
      data: estimate
    });
  } catch (error: any) {
    logger.error(`[AudienceSegmentationController] estimateReach error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Error estimando alcance",
      errors: [error.message]
    });
  }
};

export default {
  searchInterests,
  getInterestSuggestions,
  listAudiences,
  createCustomAudience,
  createLookalikeAudience,
  deleteAudience,
  syncAudienceWithTemperature,
  estimateReach
};
