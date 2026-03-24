/**
 * GetDashboardService — Módulo Afiliados Independiente
 * KPIs del dashboard, gráfico comisiones/mes (6 meses), top 5 referidos.
 */

import { Op, fn, col, literal } from "sequelize";
import AIAffiliateProgram from "../../models/AIAffiliateProgram";
import AIAffiliateReferral from "../../models/AIAffiliateReferral";
import AffiliateWallet from "../../models/AffiliateWallet";
import AffiliateWithdrawal from "../../models/AffiliateWithdrawal";
import AffiliateLink from "../../models/AffiliateLink";
import logger from "../../utils/logger";

interface DashboardResult {
  kpis: {
    totalPrograms: number;
    activePrograms: number;
    totalReferrals: number;
    totalEarnings: number;
    pendingEarnings: number;
    withdrawnEarnings: number;
    totalClicks: number;
    pendingWithdrawals: number;
  };
  commissionsPerMonth: Array<{ month: string; total: number }>;
  topReferrals: Array<Record<string, unknown>>;
}

const GetDashboardService = async (companyId: number): Promise<DashboardResult> => {
  // KPIs - programs
  const programs = await AIAffiliateProgram.findAll({
    where: { companyId },
    attributes: ["id", "status", "totalEarnings", "pendingEarnings", "withdrawnEarnings", "referralsCount"]
  });

  const totalPrograms = programs.length;
  const activePrograms = programs.filter(p => p.status === "active").length;
  const totalEarnings = programs.reduce((sum, p) => sum + Number(p.totalEarnings || 0), 0);
  const pendingEarnings = programs.reduce((sum, p) => sum + Number(p.pendingEarnings || 0), 0);
  const withdrawnEarnings = programs.reduce((sum, p) => sum + Number(p.withdrawnEarnings || 0), 0);
  const totalReferrals = programs.reduce((sum, p) => sum + Number(p.referralsCount || 0), 0);

  // Total clicks from links
  const clicksResult = await AffiliateLink.sum("clicks", {
    where: { companyId }
  });
  const totalClicks = clicksResult || 0;

  // Pending withdrawals count
  const pendingWithdrawals = await AffiliateWithdrawal.count({
    where: { companyId, status: "requested" }
  });

  // Commissions per month (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const programIds = programs.map(p => p.id);

  let commissionsPerMonth: Array<{ month: string; total: number }> = [];
  if (programIds.length > 0) {
    const rawCommissions = await AIAffiliateReferral.findAll({
      where: {
        affiliateId: { [Op.in]: programIds },
        createdAt: { [Op.gte]: sixMonthsAgo }
      },
      attributes: [
        [fn("TO_CHAR", col("createdAt"), "YYYY-MM"), "month"],
        [fn("SUM", col("commissionAmount")), "total"]
      ],
      group: [fn("TO_CHAR", col("createdAt"), "YYYY-MM")],
      order: [[fn("TO_CHAR", col("createdAt"), "YYYY-MM"), "ASC"]],
      raw: true
    }) as unknown as Array<{ month: string; total: number }>;
    commissionsPerMonth = rawCommissions.map(r => ({ month: r.month, total: Number(r.total) }));
  }

  // Top 5 referrals by commission
  let topReferrals: Array<Record<string, unknown>> = [];
  if (programIds.length > 0) {
    topReferrals = await AIAffiliateReferral.findAll({
      where: { affiliateId: { [Op.in]: programIds } },
      order: [["commissionAmount", "DESC"]],
      limit: 5,
      raw: true
    }) as unknown as Array<Record<string, unknown>>;
  }

  return {
    kpis: {
      totalPrograms,
      activePrograms,
      totalReferrals,
      totalEarnings,
      pendingEarnings,
      withdrawnEarnings,
      totalClicks,
      pendingWithdrawals
    },
    commissionsPerMonth,
    topReferrals
  };
};

export default GetDashboardService;
