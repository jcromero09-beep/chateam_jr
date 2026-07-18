import AICreditBalance from "../../models/AICreditBalance";
import AICreditType from "../../models/AICreditType";

interface Request {
  companyId: number;
  dateFrom?: string; // ISO date (reservado para futuro filtrado por fechas)
  dateTo?: string;   // ISO date
}

interface UsageSummary {
  creditTypeId: number;
  creditTypeName: string;
  creditTypeKey: string;
  unit: string;
  totalCredits: number;
  usedCredits: number;
  remainingCredits: number;
  usagePercentage: number;
}

interface Response {
  companyId: number;
  summary: UsageSummary[];
  totals: {
    totalCredits: number;
    totalUsed: number;
    totalRemaining: number;
    overallUsagePercentage: number;
  };
}

const GetUsageHistoryService = async ({
  companyId
}: Request): Promise<Response> => {
  const balances = await AICreditBalance.findAll({
    where: { companyId },
    include: [
      {
        model: AICreditType,
        as: "creditType",
        attributes: ["id", "key", "name", "description", "unit"]
      }
    ]
  });

  const summary: UsageSummary[] = balances.map(balance => {
    const remaining = Number(balance.totalCredits) - Number(balance.usedCredits);
    const total = Number(balance.totalCredits);
    const used = Number(balance.usedCredits);
    const usagePercentage = total > 0
      ? Math.round((used / total) * 100)
      : 0;

    return {
      creditTypeId: balance.creditTypeId,
      creditTypeName: (balance as any).creditType?.name || "Desconocido",
      creditTypeKey: (balance as any).creditType?.key || "unknown",
      unit: (balance as any).creditType?.unit || "credits",
      totalCredits: total,
      usedCredits: used,
      remainingCredits: remaining,
      usagePercentage
    };
  });

  // Calcular totales globales
  const totals = summary.reduce(
    (acc, item) => ({
      totalCredits: acc.totalCredits + item.totalCredits,
      totalUsed: acc.totalUsed + item.usedCredits,
      totalRemaining: acc.totalRemaining + item.remainingCredits,
      overallUsagePercentage: 0
    }),
    { totalCredits: 0, totalUsed: 0, totalRemaining: 0, overallUsagePercentage: 0 }
  );

  totals.overallUsagePercentage = totals.totalCredits > 0
    ? Math.round((totals.totalUsed / totals.totalCredits) * 100)
    : 0;

  return {
    companyId,
    summary,
    totals
  };
};

export default GetUsageHistoryService;
