import { Request, Response } from "express";
import TracingService from "../services/AIObservabilityServices/TracingService";
import PerformanceService from "../services/AIObservabilityServices/PerformanceService";
import AppError from "../errors/AppError";
import { ok } from "../helpers/apiResponse";

// GET /ai/observability/traces
export const listTraces = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const {
    status,
    name,
    sessionId,
    startDate,
    endDate,
    tags,
    limit,
    offset
  } = req.query;

  const parsedTags = typeof tags === "string" ? tags.split(",").map(t => t.trim()) : undefined;

  const result = await TracingService.listTraces(companyId, {
    status: status as string | undefined,
    name: name as string | undefined,
    sessionId: sessionId as string | undefined,
    startDate: startDate as string | undefined,
    endDate: endDate as string | undefined,
    tags: parsedTags,
    limit: limit ? parseInt(limit as string, 10) : undefined,
    offset: offset ? parseInt(offset as string, 10) : undefined
  });

  return ok(res, result);
};

// GET /ai/observability/traces/:traceId
export const getTrace = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { traceId } = req.params;

  if (!traceId) {
    throw new AppError("ERR_TRACE_ID_REQUIRED", 400);
  }

  const trace = await TracingService.getTrace(traceId, companyId);

  if (!trace) {
    throw new AppError("ERR_TRACE_NOT_FOUND", 404);
  }

  return ok(res, trace);
};

// GET /ai/observability/dashboard
export const getDashboard = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  const summary = await PerformanceService.getDashboardSummary(companyId);

  return ok(res, summary);
};

// GET /ai/observability/stats/latency
export const getLatencyStats = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { days } = req.query;

  const parsedDays = days ? parseInt(days as string, 10) : undefined;

  const stats = await PerformanceService.getLatencyStats(companyId, parsedDays);

  return ok(res, stats);
};

// GET /ai/observability/stats/models
export const getModelUsage = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { days } = req.query;

  const parsedDays = days ? parseInt(days as string, 10) : undefined;

  const usage = await PerformanceService.getModelUsage(companyId, parsedDays);

  return ok(res, usage);
};

// GET /ai/observability/stats/agents
export const getAgentPerformance = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { days } = req.query;

  const parsedDays = days ? parseInt(days as string, 10) : undefined;

  const performance = await PerformanceService.getAgentPerformance(companyId, parsedDays);

  return ok(res, performance);
};

// GET /ai/observability/stats/errors
export const getErrorAnalysis = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { days } = req.query;

  const parsedDays = days ? parseInt(days as string, 10) : undefined;

  const errors = await PerformanceService.getErrorAnalysis(companyId, parsedDays);

  return ok(res, errors);
};
