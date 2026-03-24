import { Request, Response } from "express";
import KanbanMetricsService from "../services/KanbanMetricsService";

interface MetricsQuery {
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Parsea y valida el rango de fechas de los query params.
 * Si no se proporcionan, usa los últimos 30 días por defecto.
 */
const parseDateRange = (query: MetricsQuery): { from: Date; to: Date } => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  return {
    from: query.dateFrom ? new Date(query.dateFrom) : thirtyDaysAgo,
    to: query.dateTo ? new Date(query.dateTo) : now,
  };
};

/**
 * GET /tag/kanban/metrics
 * Retorna: overview (4 KPIs) + precision IA + distribución por etapa
 */
const getMetrics = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const dateRange = parseDateRange(req.query as MetricsQuery);

    const [overview, precision, distribution] = await Promise.all([
      KanbanMetricsService.getOverviewMetrics(companyId, dateRange),
      KanbanMetricsService.getClassificationPrecision(companyId, dateRange),
      KanbanMetricsService.getStageDistribution(companyId),
    ]);

    return res.json({
      success: true,
      message: "Métricas del Kanban obtenidas correctamente",
      data: {
        overview,
        precision,
        distribution,
        dateRange: {
          from: dateRange.from.toISOString(),
          to: dateRange.to.toISOString(),
        },
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    console.error("[KanbanMetricsController.getMetrics] Error:", message);
    return res.status(500).json({
      success: false,
      message: "Error al obtener métricas del Kanban",
      data: null,
      errors: [message],
    });
  }
};

/**
 * GET /tag/kanban/funnel
 * Retorna: datos del funnel + tasas de conversión + tiempo promedio por etapa
 */
const getFunnel = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const dateRange = parseDateRange(req.query as MetricsQuery);

    const [funnel, conversionRates, avgTimeInStage] = await Promise.all([
      KanbanMetricsService.getFunnelData(companyId, dateRange),
      KanbanMetricsService.getConversionRates(companyId, dateRange),
      KanbanMetricsService.getAvgTimeInStage(companyId, dateRange),
    ]);

    return res.json({
      success: true,
      message: "Datos del funnel Kanban obtenidos correctamente",
      data: {
        funnel,
        conversionRates,
        avgTimeInStage,
        dateRange: {
          from: dateRange.from.toISOString(),
          to: dateRange.to.toISOString(),
        },
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    console.error("[KanbanMetricsController.getFunnel] Error:", message);
    return res.status(500).json({
      success: false,
      message: "Error al obtener datos del funnel Kanban",
      data: null,
      errors: [message],
    });
  }
};

export default { getMetrics, getFunnel };
