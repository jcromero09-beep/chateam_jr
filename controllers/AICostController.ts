import { Request, Response } from "express";
import CoingateService from "../services/AICoingateServices/CoingateService";
import CostOptimizerService from "../services/AICostOptimizationServices/CostOptimizerService";
import AppError from "../errors/AppError";

// POST /ai/coingate/orders
export const createCoingatOrder = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { amount, currency, title, description } = req.body;
  if (!amount || !title) throw new AppError("ERR_AMOUNT_AND_TITLE_REQUIRED", 400);
  if (!CoingateService.isConfigured()) throw new AppError("ERR_COINGATE_NOT_CONFIGURED", 503);
  const order = await CoingateService.createOrder(companyId, { amount: parseFloat(amount), currency, title, description });
  return res.status(201).json({ success: true, data: order });
};

// GET /ai/coingate/orders/:orderId
export const getCoingatOrder = async (req: Request, res: Response): Promise<Response> => {
  const { orderId } = req.params;
  const order = await CoingateService.getOrder(orderId);
  return res.json({ success: true, data: order });
};

// POST /ai/coingate/webhook — sin isAuth (lo llama CoinGate), autenticado por
// el token secreto de la callback_url. CoinGate no firma sus callbacks.
export const coingateWebhook = async (req: Request, res: Response): Promise<Response> => {
  const provided =
    (req.query.token as string) || (req.headers["x-coingate-token"] as string);

  const verdict = CoingateService.verifyCallbackToken(provided);
  if (!verdict.ok) {
    return res.status(verdict.status).json({ error: verdict.reason });
  }

  const result = await CoingateService.processWebhook(req.body);

  // 200 SIEMPRE, incluso en duplicado: CoinGate reintenta ante cualquier no-2xx,
  // y reintentar un evento que acabamos de descartar a propósito es un bucle.
  return res.status(200).json({
    received: true,
    processed: !!result,
    creditable: result?.creditable ?? false,
    ...(result?.reason ? { reason: result.reason } : {})
  });
};

// GET /ai/coingate/currencies
export const coingateCurrencies = async (req: Request, res: Response): Promise<Response> => {
  const currencies = await CoingateService.getSupportedCurrencies();
  return res.json({ success: true, data: currencies });
};

// GET /ai/coingate/status
export const coingateStatus = async (req: Request, res: Response): Promise<Response> => {
  return res.json({ success: true, data: { configured: CoingateService.isConfigured() } });
};

// GET /ai/costs/report
export const getCostReport = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { dateFrom, dateTo } = req.query as any;
  const now = new Date();
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30);
  const report = await CostOptimizerService.generateCostReport(
    companyId,
    dateFrom || thirtyDaysAgo.toISOString().split('T')[0],
    dateTo || now.toISOString().split('T')[0]
  );
  return res.json({ success: true, data: report });
};

// GET /ai/costs/cache-stats
export const getCacheStats = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const stats = await CostOptimizerService.getPromptCachingStats(companyId);
  return res.json({ success: true, data: stats });
};

// ============================================================================
// DASHBOARD DE COSTOS IA - Superadmin y Company
// ============================================================================

import { Op } from "sequelize";
import AICreditBalance from "../models/AICreditBalance";
import AICreditTransaction from "../models/AICreditTransaction";
import AICreditType from "../models/AICreditType";
import Company from "../models/Company";

// Pricing de OpenAI (USD por 1M tokens)
const OPENAI_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-5.5": { input: 5, output: 30 },
  "gpt-4": { input: 30, output: 60 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "gpt-4o": { input: 5, output: 15 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  "default": { input: 10, output: 30 }
};

function calculateOpenAICost(tokensUsed: number, model: string = "default"): number {
  const pricing = OPENAI_PRICING[model] || OPENAI_PRICING.default;
  const inputTokens = Math.floor(tokensUsed * 0.5);
  const outputTokens = Math.floor(tokensUsed * 0.5);
  return ((inputTokens / 1_000_000) * pricing.input) + ((outputTokens / 1_000_000) * pricing.output);
}

function getDateRange(period: string): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date();

  switch (period) {
    case "daily":
      start.setHours(0, 0, 0, 0);
      break;
    case "weekly":
      start.setDate(now.getDate() - 7);
      break;
    case "monthly":
      start.setMonth(now.getMonth() - 1);
      break;
    case "yearly":
      start.setFullYear(now.getFullYear() - 1);
      break;
    default:
      start.setMonth(now.getMonth() - 1);
  }

  return { start, end: now };
}

// GET /ai-costs/summary - Resumen para superadmin
export const getAISummary = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { period = "monthly" } = req.query;
    const { start, end } = getDateRange(period as string);

    const transactions = await AICreditTransaction.findAll({
      where: {
        direction: "debit",
        createdAt: { [Op.between]: [start, end] }
      },
      attributes: ["companyId", "creditTypeId", "amount", "tokensUsed", "realCostUsd"]
    });

    let totalTokensBilled = 0;
    let totalTokensCost = 0;
    let totalCreditsUsed = 0;

    for (const tx of transactions) {
      totalCreditsUsed += Number(tx.amount) || 0;
      totalTokensBilled += Number(tx.tokensUsed) || 0;
      totalTokensCost += Number(tx.realCostUsd) || 0;
    }

    const CREDIT_PRICE = 0.01;
    const totalRevenue = totalCreditsUsed * CREDIT_PRICE;
    const margin = totalRevenue - totalTokensCost;
    const marginPercent = totalTokensCost > 0 ? ((margin / totalTokensCost) * 100) : 0;

    return res.json({
      success: true,
      data: {
        period,
        dateRange: { start: start.toISOString(), end: end.toISOString() },
        totalTokensBilled,
        totalTokensCost: Math.round(totalTokensCost * 100) / 100,
        totalCreditsUsed,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        margin: Math.round(margin * 100) / 100,
        marginPercent: Math.round(marginPercent * 100) / 100,
        transactionCount: transactions.length
      }
    });
  } catch (error) {
    console.error("Error en getAISummary:", error);
    throw new AppError("Error calculando resumen de costos", 500);
  }
};

// GET /ai-costs/by-company - Costos por company para superadmin
export const getAIByCompany = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { period = "monthly", companyId } = req.query;
    const { start, end } = getDateRange(period as string);

    const where: any = {
      direction: "debit",
      createdAt: { [Op.between]: [start, end] }
    };

    if (companyId) {
      where.companyId = Number(companyId);
    }

    const transactions = await AICreditTransaction.findAll({
      where,
      include: [
        { model: Company, as: "company", attributes: ["id", "name"] }
      ],
      order: [["createdAt", "DESC"]]
    });

    const byCompany: Record<number, any> = {};
    for (const tx of transactions) {
      const cid = tx.companyId;
      if (!byCompany[cid]) {
        byCompany[cid] = {
          companyId: cid,
          companyName: (tx as any).company?.name || "Company " + cid,
          totalTokensBilled: 0,
          totalTokensCost: 0,
          totalCreditsUsed: 0,
          transactions: 0
        };
      }
      byCompany[cid].totalTokensBilled += Number(tx.tokensUsed) || 0;
      byCompany[cid].totalTokensCost += Number(tx.realCostUsd) || 0;
      byCompany[cid].totalCreditsUsed += Number(tx.amount) || 0;
      byCompany[cid].transactions += 1;
    }

    const CREDIT_PRICE = 0.01;
    const result = Object.values(byCompany).map((c: any) => ({
      ...c,
      totalRevenue: Math.round(c.totalCreditsUsed * CREDIT_PRICE * 100) / 100,
      totalTokensCost: Math.round(c.totalTokensCost * 100) / 100,
      margin: Math.round((c.totalCreditsUsed * CREDIT_PRICE - c.totalTokensCost) * 100) / 100,
      marginPercent: c.totalTokensCost > 0
        ? Math.round(((c.totalCreditsUsed * CREDIT_PRICE - c.totalTokensCost) / c.totalTokensCost) * 10000) / 100
        : 0
    }));

    result.sort((a, b) => b.totalTokensCost - a.totalTokensCost);

    return res.json({
      success: true,
      data: result,
      period,
      dateRange: { start: start.toISOString(), end: end.toISOString() }
    });
  } catch (error) {
    console.error("Error en getAIByCompany:", error);
    throw new AppError("Error calculando costos por company", 500);
  }
};

// GET /ai-costs/trends - Tendencias diarias
export const getAITrends = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { days = "30" } = req.query;
    const numDays = parseInt(days as string, 10);
    const start = new Date();
    start.setDate(start.getDate() - numDays);

    const transactions = await AICreditTransaction.findAll({
      where: {
        direction: "debit",
        createdAt: { [Op.between]: [start, new Date()] }
      },
      attributes: ["companyId", "amount", "tokensUsed", "realCostUsd", "createdAt"]
    });

    const byDay: Record<string, any> = {};
    for (const tx of transactions) {
      const dateKey = (tx.createdAt as Date).toISOString().split("T")[0];
      if (!byDay[dateKey]) {
        byDay[dateKey] = {
          date: dateKey,
          tokensBilled: 0,
          tokensCost: 0,
          creditsUsed: 0
        };
      }
      byDay[dateKey].tokensBilled += Number(tx.tokensUsed) || 0;
      byDay[dateKey].tokensCost += Number(tx.realCostUsd) || 0;
      byDay[dateKey].creditsUsed += Number(tx.amount) || 0;
    }

    const CREDIT_PRICE = 0.01;
    const result = Object.values(byDay).map((d: any) => ({
      ...d,
      tokensCost: Math.round(d.tokensCost * 100) / 100,
      revenue: Math.round(d.creditsUsed * CREDIT_PRICE * 100) / 100,
      margin: Math.round((d.creditsUsed * CREDIT_PRICE - d.tokensCost) * 100) / 100
    }));

    result.sort((a, b) => a.date.localeCompare(b.date));

    return res.json({
      success: true,
      data: result,
      days: numDays
    });
  } catch (error) {
    console.error("Error en getAITrends:", error);
    throw new AppError("Error calculando tendencias", 500);
  }
};

// GET /ai-costs/company/summary - Resumen para admin de company
export const getAICompanySummary = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as { companyId: number };
    const { period = "monthly" } = req.query;
    const { start, end } = getDateRange(period as string);

    const transactions = await AICreditTransaction.findAll({
      where: {
        companyId,
        direction: "debit",
        createdAt: { [Op.between]: [start, end] }
      },
      order: [["createdAt", "DESC"]]
    });

    let totalTokensUsed = 0;
    let totalCost = 0;
    let creditsUsed = 0;
    const byAgent: Record<string, any> = {};

    for (const tx of transactions) {
      totalTokensUsed += Number(tx.tokensUsed) || 0;
      totalCost += Number(tx.realCostUsd) || 0;
      creditsUsed += Number(tx.amount) || 0;

      const source = tx.source || "unknown";
      if (!byAgent[source]) {
        byAgent[source] = { source, tokens: 0, credits: 0, cost: 0 };
      }
      byAgent[source].tokens += Number(tx.tokensUsed) || 0;
      byAgent[source].credits += Number(tx.amount) || 0;
      byAgent[source].cost += Number(tx.realCostUsd) || 0;
    }

    const currentBalances = await AICreditBalance.findAll({
      where: { companyId },
      attributes: ["creditTypeId", "totalCredits", "usedCredits"]
    });

    let totalCreditsRemaining = 0;
    for (const b of currentBalances) {
      totalCreditsRemaining += Number((b as any).totalCredits) - Number((b as any).usedCredits);
    }

    return res.json({
      success: true,
      data: {
        period,
        dateRange: { start: start.toISOString(), end: end.toISOString() },
        tokensConsumed: totalTokensUsed,
        creditsUsed,
        costThisMonth: Math.round(totalCost * 100) / 100,
        creditsRemaining: totalCreditsRemaining,
        usageByAgent: Object.values(byAgent).map((a: any) => ({
          ...a,
          cost: Math.round(a.cost * 100) / 100
        })),
        transactionCount: transactions.length
      }
    });
  } catch (error) {
    console.error("Error en getAICompanySummary:", error);
    throw new AppError("Error calculando resumen de company", 500);
  }
};
