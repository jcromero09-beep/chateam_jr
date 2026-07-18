import { Request, Response } from "express";
import EmailDashboardService, {
  Period,
  Granularity
} from "../services/EmailMarketing/EmailDashboardService";
import logger from "../utils/logger";
import AppError from "../errors/AppError";

const VALID_PERIODS: Period[] = ["today", "week", "month", "year", "all"];
const VALID_GRANULARITIES: Granularity[] = ["hour", "day", "week", "month"];

function parsePeriod(raw: unknown, fallback: Period = "month"): Period {
  if (typeof raw !== "string") return fallback;
  return VALID_PERIODS.includes(raw as Period) ? (raw as Period) : fallback;
}
function parseGranularity(raw: unknown, fallback: Granularity = "day"): Granularity {
  if (typeof raw !== "string") return fallback;
  return VALID_GRANULARITIES.includes(raw as Granularity) ? (raw as Granularity) : fallback;
}

/**
 * GET /email-marketing/dashboard/kpis?period=month
 */
export const kpis = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const period = parsePeriod(req.query.period);
    const data = await EmailDashboardService.getKpis(Number(companyId), period);
    return res.json({ success: true, period, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error en kpis";
    const statusCode = err instanceof AppError ? err.statusCode : 500;
    logger.error(`[EmailDashboard] kpis: ${msg}`);
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

/**
 * GET /email-marketing/dashboard/trend?period=month&granularity=day
 */
export const trend = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const period = parsePeriod(req.query.period);
    const granularity = parseGranularity(req.query.granularity);
    const data = await EmailDashboardService.getTrend(
      Number(companyId),
      period,
      granularity
    );
    return res.json({ success: true, period, granularity, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error en trend";
    const statusCode = err instanceof AppError ? err.statusCode : 500;
    logger.error(`[EmailDashboard] trend: ${msg}`);
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

/**
 * GET /email-marketing/dashboard/campaigns?period=month&status=&pageNumber=1&pageSize=20
 */
export const campaigns = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const period = parsePeriod(req.query.period, "all");
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const pageNumber = parseInt(String(req.query.pageNumber || "1"), 10);
    const pageSize = parseInt(String(req.query.pageSize || "20"), 10);

    const data = await EmailDashboardService.listCampaigns(
      Number(companyId),
      { period, status, pageNumber, pageSize }
    );
    return res.json({ success: true, ...data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error en campaigns";
    const statusCode = err instanceof AppError ? err.statusCode : 500;
    logger.error(`[EmailDashboard] campaigns: ${msg}`);
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

/**
 * GET /email-marketing/dashboard/failures?period=month&limit=50
 */
export const failures = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const period = parsePeriod(req.query.period);
    const limit = parseInt(String(req.query.limit || "50"), 10);

    const data = await EmailDashboardService.listFailures(Number(companyId), {
      period,
      limit
    });
    return res.json({ success: true, period, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error en failures";
    const statusCode = err instanceof AppError ? err.statusCode : 500;
    logger.error(`[EmailDashboard] failures: ${msg}`);
    return res.status(statusCode).json({ success: false, message: msg });
  }
};

/**
 * POST /email-marketing/dashboard/sync
 * Fuerza sync inmediato con Listmonk para refrescar contadores.
 */
export const sync = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const result = await EmailDashboardService.syncFromProvider(Number(companyId));
    return res.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error en sync";
    const statusCode = err instanceof AppError ? err.statusCode : 500;
    logger.error(`[EmailDashboard] sync: ${msg}`);
    return res.status(statusCode).json({ success: false, message: msg });
  }
};
