import * as Yup from "yup";
import { ValidationError } from "yup";
import { Request, Response } from "express";
import { Op } from "sequelize";

import EmailAbTest from "../models/EmailMarketing/EmailAbTest";
import EmailCampaign from "../models/EmailMarketing/EmailCampaign";

import AppError from "../errors/AppError";
import logger from "../utils/logger";

import * as AbTestService from "../services/EmailMarketing/AbTestService";

// ============================================================================
// Types
// ============================================================================

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
  campaignId: string;
};

// ============================================================================
// index — Listar A/B tests de la company
// ============================================================================

export const index = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { searchParam = "", pageNumber = "1", campaignId = "" } = req.query as IndexQuery;
    const { companyId } = req.user;

    const limit = 20;
    const offset = limit * (+pageNumber - 1);

    const where: Record<string, unknown> = { companyId, isActive: true };

    if (searchParam) {
      where.name = { [Op.iLike]: `%${searchParam}%` };
    }

    if (campaignId) {
      where.campaignId = Number(campaignId);
    }

    const { count, rows: records } = await EmailAbTest.findAndCountAll({
      where,
      limit,
      offset,
      order: [["createdAt", "DESC"]],
      include: [
        { model: EmailCampaign, as: "campaign", attributes: ["id", "name", "subject", "status"] }
      ]
    });

    const hasMore = count > offset + records.length;

    return res.json({ success: true, data: { records, count, hasMore } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailAbTest] Error en index: ${msg}`);
    return res.status(statusCode).json({ success: false, message: msg, errors: [msg] });
  }
};

// ============================================================================
// store — Crear A/B test
// ============================================================================

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const { campaignId, name, testType, variants, winnerCriteria, testPercentage, testDurationHours } = req.body;

  const schema = Yup.object().shape({
    campaignId: Yup.number().required("El ID de campana es obligatorio"),
    name: Yup.string().required("El nombre es obligatorio"),
    variants: Yup.array()
      .min(2, "Se requieren al menos 2 variantes")
      .required("Las variantes son obligatorias")
  });

  try {
    await schema.validate({ campaignId, name, variants }, { abortEarly: false });
  } catch (err: unknown) {
    if (err instanceof ValidationError) {
      const yupError = err.inner.map((e) => e.message);
      return res.status(400).json({ error: yupError.join(", ") });
    }
    const msg = err instanceof Error ? err.message : "Error de validación";
    return res.status(400).json({ error: msg });
  }

  try {
    const abTest = await AbTestService.createAbTest(
      Number(campaignId),
      Number(companyId),
      {
        name,
        testType: testType || "subject",
        variants,
        winnerCriteria: winnerCriteria || "open_rate",
        testPercentage: testPercentage || 20,
        testDurationHours: testDurationHours || 4
      }
    );

    // Actualizar createdBy
    await abTest.update({ createdBy: userId });

    logger.info(
      `[EmailAbTestController] A/B test creado: id=${abTest.id}, ` +
      `campaignId=${campaignId}, company=${companyId}`
    );

    return res.status(200).json({ success: true, data: abTest });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailAbTest] Error: ${msg}`);
    return res.status(statusCode).json({ success: false, message: msg, errors: [msg] });
  }
};

// ============================================================================
// show — Detalle con resultados
// ============================================================================

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;

  try {
    const results = await AbTestService.getAbTestResults(Number(id), Number(companyId));

    if (!results) {
      throw new AppError("A/B test no encontrado", 404);
    }

    // Cargar el registro completo tambien
    const abTest = await EmailAbTest.findOne({
      where: { id, companyId, isActive: true },
      include: [
        { model: EmailCampaign, as: "campaign", attributes: ["id", "name", "subject", "status"] }
      ]
    });

    return res.status(200).json({
      success: true,
      data: {
        ...abTest?.toJSON(),
        liveResults: results.variants
      }
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailAbTest] Error: ${msg}`);
    return res.status(statusCode).json({ success: false, message: msg, errors: [msg] });
  }
};

// ============================================================================
// start — Iniciar test
// ============================================================================

export const start = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;

  try {
    const result = await AbTestService.startAbTest(Number(id), Number(companyId));

    logger.info(
      `[EmailAbTestController] A/B test iniciado: id=${id}, company=${companyId}`
    );

    return res.status(200).json({ success: true, data: result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailAbTest] Error: ${msg}`);
    return res.status(statusCode).json({ success: false, message: msg, errors: [msg] });
  }
};

// ============================================================================
// declareWinner — Forzar o evaluar ganador
// ============================================================================

export const declareWinner = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;
  const { sendToRemaining = false } = req.body;

  try {
    // Verificar que pertenece a la company
    const abTest = await EmailAbTest.findOne({
      where: { id, companyId, isActive: true }
    });

    if (!abTest) {
      throw new AppError("A/B test no encontrado", 404);
    }

    const result = await AbTestService.checkAndDeclareWinner(Number(id));

    let remainingResult = null;
    if (sendToRemaining) {
      remainingResult = await AbTestService.sendToRemainingAudience(Number(id));
    }

    logger.info(
      `[EmailAbTestController] Ganador declarado: abTestId=${id}, ` +
      `winnerId=${result.winnerId}, company=${companyId}`
    );

    return res.status(200).json({
      success: true,
      data: {
        winnerId: result.winnerId,
        results: result.results,
        remainingSent: remainingResult?.totalSent || 0
      }
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailAbTest] Error: ${msg}`);
    return res.status(statusCode).json({ success: false, message: msg, errors: [msg] });
  }
};

// ============================================================================
// remove — Soft delete
// ============================================================================

export const remove = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const { companyId } = req.user;

    const abTest = await EmailAbTest.findOne({
      where: { id, companyId, isActive: true }
    });

    if (!abTest) {
      throw new AppError("A/B test no encontrado", 404);
    }

    // BD SAGRADA: soft delete
    await abTest.update({ isActive: false, status: "cancelled" });

    logger.info(
      `[EmailAbTestController] A/B test eliminado (soft): id=${id}, company=${companyId}`
    );

    return res.status(200).json({ success: true, message: "A/B test eliminado" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailAbTest] Error en remove: ${msg}`);
    return res.status(statusCode).json({ success: false, message: msg, errors: [msg] });
  }
};
