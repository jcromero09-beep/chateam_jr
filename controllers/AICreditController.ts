import { Request, Response } from "express";
import { getIO } from "../libs/socket";

import ListCreditTypesService from "../services/AICreditServices/ListCreditTypesService";
import ListBalancesService from "../services/AICreditServices/ListBalancesService";
import GetBalanceService from "../services/AICreditServices/GetBalanceService";
import AddCreditsService from "../services/AICreditServices/AddCreditsService";
import DeductCreditsService from "../services/AICreditServices/DeductCreditsService";
import GetUsageHistoryService from "../services/AICreditServices/GetUsageHistoryService";
import InitializeCompanyCreditsService from "../services/AICreditServices/InitializeCompanyCreditsService";

import AppError from "../errors/AppError";

// GET /ai/credits/types — Lista todos los tipos de crédito
export const listTypes = async (req: Request, res: Response): Promise<Response> => {
  const { isActive } = req.query as any;

  const creditTypes = await ListCreditTypesService({
    isActive: isActive !== undefined ? isActive === "true" : true
  });

  return res.json(creditTypes);
};

// GET /ai/credits/balances — Lista balances de la company actual
export const listBalances = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  const balances = await ListBalancesService({ companyId });

  return res.json(balances);
};

// GET /ai/credits/balance/:key — Balance específico por tipo
export const getBalance = async (req: Request, res: Response): Promise<Response> => {
  const { key } = req.params;
  const { companyId } = req.user;

  const result = await GetBalanceService({
    companyId,
    creditTypeKey: key
  });

  return res.json(result);
};

// GET /ai/credits/usage — Resumen de uso de créditos
export const getUsage = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { dateFrom, dateTo } = req.query as any;

  const usage = await GetUsageHistoryService({
    companyId,
    dateFrom,
    dateTo
  });

  return res.json(usage);
};

// POST /ai/credits/add — Agregar créditos a una company (solo admin/super)
export const addCredits = async (req: Request, res: Response): Promise<Response> => {
  const { companyId: userCompanyId, profile } = req.user;

  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const { companyId, creditTypeKey, amount, reason } = req.body;

  const targetCompanyId = companyId || userCompanyId;

  const result = await AddCreditsService({
    companyId: targetCompanyId,
    creditTypeKey,
    amount,
    reason
  });

  const io = getIO();
  io.of(String(targetCompanyId))
    .emit(`company-${targetCompanyId}-ai-credits`, {
      action: "credits_added",
      creditTypeKey,
      amount,
      newTotal: result.newTotal
    });

  return res.status(200).json({
    success: true,
    message: `${amount} créditos agregados exitosamente`,
    data: result
  });
};

// POST /ai/credits/deduct — Deducir créditos (uso interno / admin)
export const deductCredits = async (req: Request, res: Response): Promise<Response> => {
  const { companyId: userCompanyId, profile } = req.user;
  const { companyId, creditTypeKey, amount, description } = req.body;

  const targetCompanyId = companyId || userCompanyId;

  if (profile !== "admin" && targetCompanyId !== userCompanyId) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const result = await DeductCreditsService({
    companyId: targetCompanyId,
    creditTypeKey,
    amount,
    description,
    userId: req.user?.id,
    source: "manual",
    sourceId: String(req.user?.id || "admin")
  });

  const io = getIO();
  io.of(String(targetCompanyId))
    .emit(`company-${targetCompanyId}-ai-credits`, {
      action: "credits_deducted",
      creditTypeKey,
      amount,
      remaining: result.remaining
    });

  return res.status(200).json({
    success: true,
    message: `${amount} créditos deducidos`,
    data: result
  });
};

// POST /ai/credits/initialize — Inicializar créditos para una company
export const initializeCredits = async (req: Request, res: Response): Promise<Response> => {
  const { profile } = req.user;

  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const { companyId, initialCredits } = req.body;

  if (!companyId) {
    throw new AppError("ERR_COMPANY_ID_REQUIRED", 400);
  }

  const result = await InitializeCompanyCreditsService({
    companyId,
    initialCredits
  });

  return res.status(200).json({
    success: true,
    message: `${result.balancesCreated} balances inicializados para company ${companyId}`,
    data: result
  });
};
