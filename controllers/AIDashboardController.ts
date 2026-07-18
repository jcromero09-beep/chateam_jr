import { Request, Response } from "express";
import DashboardWidgetsService from "../services/AIDashboardServices/DashboardWidgetsService";
import MetricsAggregatorService from "../services/AIDashboardServices/MetricsAggregatorService";
import AppError from "../errors/AppError";

// Helper: default date range (last 30 days)
function getDateRange(req: Request): { dateFrom: string; dateTo: string } {
  const { dateFrom, dateTo } = req.query as any;
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return {
    dateFrom: dateFrom || thirtyDaysAgo.toISOString().split('T')[0],
    dateTo: dateTo || now.toISOString().split('T')[0]
  };
}

// GET /ai/dashboard/widgets — All widgets for company
export const getAllWidgets = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { dateFrom, dateTo } = getDateRange(req);

  const widgets = await DashboardWidgetsService.getAllWidgets(companyId, dateFrom, dateTo);

  return res.json({ success: true, data: widgets });
};

// GET /ai/dashboard/widgets/:widgetId — Single widget
export const getWidget = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { widgetId } = req.params;
  const { dateFrom, dateTo } = getDateRange(req);

  const widgetMap: Record<string, Function> = {
    'usage_overview': () => DashboardWidgetsService.getUsageOverview(companyId, dateFrom, dateTo),
    'agent_distribution': () => DashboardWidgetsService.getAgentDistribution(companyId, dateFrom, dateTo),
    'cost_breakdown': () => DashboardWidgetsService.getCostBreakdown(companyId, dateFrom, dateTo),
    'resolution_rate': () => DashboardWidgetsService.getResolutionRate(companyId, dateFrom, dateTo),
    'performance_trends': () => DashboardWidgetsService.getPerformanceTrends(companyId, dateFrom, dateTo),
    'cache_efficiency': () => DashboardWidgetsService.getCacheEfficiency(companyId, dateFrom, dateTo),
    'system_status': () => DashboardWidgetsService.getSystemStatus(),
    'recent_activity': () => DashboardWidgetsService.getRecentActivity(companyId)
  };

  const widgetFn = widgetMap[widgetId];
  if (!widgetFn) {
    throw new AppError("ERR_WIDGET_NOT_FOUND", 404);
  }

  const widget = await widgetFn();
  return res.json({ success: true, data: widget });
};

// GET /ai/dashboard/admin — Admin-only global metrics
export const getAdminDashboard = async (req: Request, res: Response): Promise<Response> => {
  const { profile } = req.user;
  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const { dateFrom, dateTo } = getDateRange(req);

  const [topCompanies, systemStatus] = await Promise.all([
    DashboardWidgetsService.getTopCompanies(dateFrom, dateTo),
    DashboardWidgetsService.getSystemStatus()
  ]);

  return res.json({ success: true, data: { topCompanies, systemStatus } });
};

// POST /ai/dashboard/aggregate — Trigger metrics aggregation (admin only)
export const triggerAggregation = async (req: Request, res: Response): Promise<Response> => {
  const { profile } = req.user;
  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const { date } = req.body;
  const targetDate = date || new Date().toISOString().split('T')[0];

  await MetricsAggregatorService.aggregateDaily(targetDate);

  return res.json({ success: true, message: `Metricas agregadas para ${targetDate}` });
};
