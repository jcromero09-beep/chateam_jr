/**
 * EmailTemplateGalleryController
 *
 * Controller para:
 * - Galeria de templates predefinidos de email
 * - Herramientas de optimizacion con IA (subject lines, spam score, generacion de contenido)
 *
 * Endpoints:
 * - GET  /email-templates/gallery           — Lista templates predefinidos
 * - POST /email-templates/gallery/install    — Instalar preset en la company
 * - POST /email-templates/ai/subject-lines   — Generar subject lines con IA
 * - POST /email-templates/ai/spam-score      — Analizar spam score
 * - POST /email-templates/ai/generate        — Generar contenido con IA
 */

import { Request, Response } from "express";
import logger from "../utils/logger";

import {
  getPresetTemplates,
  getPresetTemplateByIndex,
  installPreset as installPresetService,
  getCategories
} from "../services/EmailMarketing/TemplateGalleryService";

import {
  generateSubjectLines as aiGenerateSubjectLines,
  analyzeSpamScore as aiAnalyzeSpamScore,
  generateEmailContent as aiGenerateEmailContent
} from "../services/EmailMarketing/AIEmailOptimizationService";

// ============================================================================
// GALERIA DE TEMPLATES
// ============================================================================

/**
 * GET /email-templates/gallery
 * Lista los templates predefinidos de la galeria.
 * Query params: category (filtrar por categoria)
 */
export const gallery = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { category } = req.query as { category?: string };

    const presets = getPresetTemplates();
    const categories = getCategories();

    let filtered = presets;
    if (category && category !== "all") {
      filtered = presets.filter(t => t.category === category);
    }

    return res.status(200).json({
      success: true,
      message: "Galeria de templates obtenida exitosamente",
      data: {
        templates: filtered,
        categories,
        total: filtered.length
      }
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[EmailTemplateGallery] Error obteniendo galeria: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error al obtener la galeria de templates",
      errors: [errorMessage]
    });
  }
};

/**
 * POST /email-templates/gallery/install
 * Instala un template preset de la galeria en la company del usuario.
 * Body: { presetIndex: number }
 */
export const installPreset = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId, id: userId } = req.user;
    const { presetIndex } = req.body;

    if (presetIndex === undefined || presetIndex === null) {
      return res.status(400).json({
        success: false,
        message: "El campo presetIndex es requerido",
        errors: ["presetIndex es requerido"]
      });
    }

    const index = Number(presetIndex);
    if (isNaN(index) || index < 0) {
      return res.status(400).json({
        success: false,
        message: "presetIndex debe ser un numero valido mayor o igual a 0",
        errors: ["presetIndex invalido"]
      });
    }

    // Verificar que el preset existe
    const preset = getPresetTemplateByIndex(index);
    if (!preset) {
      return res.status(404).json({
        success: false,
        message: `Template preset con indice ${index} no encontrado`,
        errors: ["Preset no encontrado"]
      });
    }

    const template = await installPresetService(Number(companyId), index, Number(userId));

    logger.info(
      `[EmailTemplateGallery] Preset "${preset.name}" instalado por usuario ${userId} en company ${companyId}`
    );

    return res.status(200).json({
      success: true,
      message: `Template "${preset.name}" instalado exitosamente`,
      data: template
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[EmailTemplateGallery] Error instalando preset: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error al instalar el template",
      errors: [errorMessage]
    });
  }
};

// ============================================================================
// HERRAMIENTAS DE IA
// ============================================================================

/**
 * POST /email-templates/ai/subject-lines
 * Genera subject lines optimizados con IA.
 * Body: { content, targetAudience?, tone?, count? }
 */
export const generateSubjectLines = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { content, targetAudience, tone, count } = req.body;

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "El campo content es requerido (HTML o texto del email)",
        errors: ["content es requerido"]
      });
    }

    const result = await aiGenerateSubjectLines({
      companyId: Number(companyId),
      content,
      targetAudience,
      tone,
      count: count ? Number(count) : 5
    });

    return res.status(200).json({
      success: true,
      message: `${result.subjects.length} subject lines generados exitosamente`,
      data: result
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[EmailTemplateGallery] Error generando subject lines: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error al generar subject lines",
      errors: [errorMessage]
    });
  }
};

/**
 * POST /email-templates/ai/spam-score
 * Analiza el spam score de un email.
 * Body: { subject, htmlContent, fromEmail }
 */
export const analyzeSpamScore = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { subject, htmlContent, fromEmail } = req.body;

    if (!subject || typeof subject !== "string") {
      return res.status(400).json({
        success: false,
        message: "El campo subject es requerido",
        errors: ["subject es requerido"]
      });
    }

    if (!htmlContent || typeof htmlContent !== "string") {
      return res.status(400).json({
        success: false,
        message: "El campo htmlContent es requerido",
        errors: ["htmlContent es requerido"]
      });
    }

    if (!fromEmail || typeof fromEmail !== "string") {
      return res.status(400).json({
        success: false,
        message: "El campo fromEmail es requerido",
        errors: ["fromEmail es requerido"]
      });
    }

    const result = await aiAnalyzeSpamScore({
      subject,
      htmlContent,
      fromEmail
    });

    return res.status(200).json({
      success: true,
      message: `Analisis de spam completado: ${result.overall} (score: ${result.score}/100)`,
      data: result
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[EmailTemplateGallery] Error analizando spam score: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error al analizar el spam score",
      errors: [errorMessage]
    });
  }
};

/**
 * POST /email-templates/ai/generate
 * Genera contenido de email completo con IA.
 * Body: { prompt, type?, tone?, brandName? }
 */
export const generateContent = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { prompt, type, tone, brandName } = req.body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "El campo prompt es requerido (descripcion del email a generar)",
        errors: ["prompt es requerido"]
      });
    }

    const result = await aiGenerateEmailContent({
      companyId: Number(companyId),
      prompt,
      type,
      tone,
      brandName
    });

    return res.status(200).json({
      success: true,
      message: "Contenido de email generado exitosamente",
      data: result
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[EmailTemplateGallery] Error generando contenido: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error al generar el contenido del email",
      errors: [errorMessage]
    });
  }
};
