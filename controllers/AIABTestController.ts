import { Request, Response } from "express";
import ABTestService from "../services/AIABTestingServices/ABTestService";
import AppError from "../errors/AppError";

// POST /ai/ab-tests — Crear un nuevo A/B test
export const createTest = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { name, description, testType, agentType, primaryMetric, minSampleSize, confidenceLevel, variants } = req.body;

  if (!name) throw new AppError("ERR_AB_TEST_NAME_REQUIRED", 400);
  if (!testType) throw new AppError("ERR_AB_TEST_TYPE_REQUIRED", 400);
  if (!variants || !Array.isArray(variants) || variants.length < 2) {
    throw new AppError("ERR_AB_TEST_MIN_VARIANTS", 400);
  }

  const test = await ABTestService.createTest(companyId, {
    name,
    description,
    testType,
    agentType,
    primaryMetric,
    minSampleSize,
    confidenceLevel,
    variants
  });

  return res.status(201).json({ success: true, data: test });
};

// GET /ai/ab-tests — Listar tests con filtros y paginacion
export const listTests = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { status, testType, limit, offset } = req.query as {
    status?: string;
    testType?: string;
    limit?: string;
    offset?: string;
  };

  const { rows, count } = await ABTestService.listTests(companyId, {
    status,
    testType,
    limit: limit ? parseInt(limit, 10) : undefined,
    offset: offset ? parseInt(offset, 10) : undefined
  });

  return res.json({
    success: true,
    data: {
      tests: rows,
      count,
      hasMore: (parseInt(offset || "0", 10) + (parseInt(limit || "20", 10))) < count
    }
  });
};

// GET /ai/ab-tests/:testId — Obtener un test con variantes
export const getTest = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { testId } = req.params;

  const test = await ABTestService.getTest(parseInt(testId, 10), companyId);

  return res.json({ success: true, data: test });
};

// POST /ai/ab-tests/:testId/start — Iniciar un test
export const startTest = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { testId } = req.params;

  const test = await ABTestService.startTest(parseInt(testId, 10), companyId);

  return res.json({ success: true, data: test });
};

// POST /ai/ab-tests/:testId/pause — Pausar un test
export const pauseTest = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { testId } = req.params;

  const test = await ABTestService.pauseTest(parseInt(testId, 10), companyId);

  return res.json({ success: true, data: test });
};

// POST /ai/ab-tests/:testId/evaluate — Evaluar significancia estadistica
export const evaluateTest = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { testId } = req.params;

  const result = await ABTestService.evaluateTest(parseInt(testId, 10), companyId);

  return res.json({ success: true, data: result });
};

// POST /ai/ab-tests/variants/:variantId/result — Registrar resultado de una variante
export const recordResult = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { variantId } = req.params;
  const { converted, latencyMs, costUsd, csat, escalated, resolved, tokensUsed } = req.body;

  const variant = await ABTestService.recordResult(
    parseInt(variantId, 10),
    companyId,
    { converted, latencyMs, costUsd, csat, escalated, resolved, tokensUsed }
  );

  return res.json({ success: true, data: variant });
};
