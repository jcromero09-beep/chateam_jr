import { Op } from "sequelize";
import CompanyTokenUsage from "../../models/CompanyTokenUsage";

interface DashboardStatsRequest {
  companyId: number | string;
  timeRange?: string; // "24h", "7d", "30d", "90d"
}

interface ModelUsage {
  name: string;
  value: number;
  tokens: number;
  cost: number;
  color: string;
}

interface DashboardStatsResponse {
  stats: {
    totalTokensMonth: number;
    totalTokensAll: number;
    totalCostMonth: number;
    totalCostAll: number;
    activeModels: number;
    avgCostPerRequest: number;
    popularModel: string;
  };
  modelUsage: ModelUsage[];
  tokenTrends: Array<{
    month: string;
    tokens: number;
    cost: number;
  }>;
  recentActivity: Array<{
    id: number;
    month: string;
    model: string;
    tokens_month: number;
    cost_usd_month: number;
    updated_at: Date;
  }>;
}

// Colores para los modelos
const MODEL_COLORS: Record<string, string> = {
  "gpt-5.5": "#8b5cf6",
  "gpt-4o": "#10b981",
  "gpt-4o-mini": "#3b82f6",
  "gpt-3.5-turbo-0125": "#f59e0b",
  "gpt-3.5-turbo": "#f59e0b",
  "text-embedding-3-small": "#8b5cf6",
  "text-embedding-3-large": "#ec4899",
  "whisper-1": "#06b6d4",
  "default": "#64748b"
};

/**
 * Formatea una fecha a string YYYY-MM
 */
const formatMonth = (date: Date): string => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Obtiene el primer dia del mes actual
 */
const getFirstDayOfCurrentMonth = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

const DashboardStatsService = async ({
  companyId,
  timeRange = "30d"
}: DashboardStatsRequest): Promise<DashboardStatsResponse> => {
  const currentMonthDate = getFirstDayOfCurrentMonth();
  const currentMonthStr = formatMonth(currentMonthDate);

  // 1. Obtener todos los registros de la compania
  const allRecords = await CompanyTokenUsage.findAll({
    where: { companyId: companyId },
    order: [["month", "DESC"], ["model", "ASC"]]
  });

  // 2. Calcular KPIs
  let totalTokensMonth = 0;
  let totalTokensAll = 0;
  let totalCostMonth = 0;
  let totalCostAll = 0;
  const modelMap = new Map<string, { tokens: number; cost: number }>();

  for (const record of allRecords) {
    const tokensMonth = Number(record.tokensMonth) || 0;
    const tokensTotal = Number(record.tokensTotal) || 0;
    const costMonth = Number(record.costUsdMonth) || 0;
    const costTotal = Number(record.costUsdTotal) || 0;
    const recordMonth = formatMonth(record.month);

    // Totales del mes actual
    if (recordMonth === currentMonthStr) {
      totalTokensMonth += tokensMonth;
      totalCostMonth += costMonth;
    }

    // Totales globales
    totalTokensAll += tokensTotal;
    totalCostAll += costTotal;

    // Agregar al mapa de modelos
    if (record.model) {
      const existing = modelMap.get(record.model) || { tokens: 0, cost: 0 };
      modelMap.set(record.model, {
        tokens: existing.tokens + tokensTotal,
        cost: existing.cost + costTotal
      });
    }
  }

  // 3. Distribucion por modelo
  const totalTokensForPercentage = totalTokensAll || 1;
  const modelUsage: ModelUsage[] = Array.from(modelMap.entries()).map(([model, data]) => ({
    name: model,
    value: Math.round((data.tokens / totalTokensForPercentage) * 100),
    tokens: data.tokens,
    cost: data.cost,
    color: MODEL_COLORS[model] || MODEL_COLORS["default"]
  })).sort((a, b) => b.tokens - a.tokens);

  // 4. Modelo mas popular
  const popularModel = modelUsage.length > 0 ? modelUsage[0].name : "N/A";

  // 5. Tendencia de tokens por mes (ultimos 6 meses)
  const monthMap = new Map<string, { tokens: number; cost: number }>();

  for (const record of allRecords) {
    const monthStr = formatMonth(record.month);
    const existing = monthMap.get(monthStr) || { tokens: 0, cost: 0 };
    monthMap.set(monthStr, {
      tokens: existing.tokens + (Number(record.tokensMonth) || 0),
      cost: existing.cost + (Number(record.costUsdMonth) || 0)
    });
  }

  // Ordenar por mes y tomar los ultimos 6
  const tokenTrends = Array.from(monthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([month, data]) => ({
      month,
      tokens: data.tokens,
      cost: data.cost
    }));

  // 6. Actividad reciente (ultimos 10 registros actualizados)
  const recentRecords = await CompanyTokenUsage.findAll({
    where: { companyId: companyId },
    order: [["updatedAt", "DESC"]],
    limit: 10
  });

  const recentActivity = recentRecords.map(r => ({
    id: r.id,
    month: formatMonth(r.month),
    model: r.model || "unknown",
    tokens_month: Number(r.tokensMonth) || 0,
    cost_usd_month: Number(r.costUsdMonth) || 0,
    updated_at: r.updatedAt
  }));

  // 7. Numero de modelos activos
  const activeModels = modelMap.size;

  // 8. Costo promedio por request (estimacion basada en tokens)
  const estimatedRequests = Math.ceil(totalTokensAll / 500);
  const avgCostPerRequest = estimatedRequests > 0 ? totalCostAll / estimatedRequests : 0;

  return {
    stats: {
      totalTokensMonth,
      totalTokensAll,
      totalCostMonth,
      totalCostAll,
      activeModels,
      avgCostPerRequest,
      popularModel
    },
    modelUsage,
    tokenTrends,
    recentActivity
  };
};

export default DashboardStatsService;
