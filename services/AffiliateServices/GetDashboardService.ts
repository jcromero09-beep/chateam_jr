/**
 * GetDashboardService — Dashboard de afiliados (modo superadmin global).
 *
 * Devuelve:
 *  - KPIs: totalReferrals, registered, active, tokensDelivered, daysDelivered,
 *    affiliatorsCount, programs (total/activos), totalClicks, conversionRate
 *  - Tabla paginada de referidos con: company referida, afiliador, programa,
 *    estado, recompensa entregada, fechas registro/activación
 *
 * Uso:
 *  - Si companyId === null → vista global (superadmin)
 *  - Si companyId !== null → restringe a programas de esa company (legado)
 */

import { Op, fn, col } from "sequelize";
import AIAffiliateProgram from "../../models/AIAffiliateProgram";
import AIAffiliateReferral from "../../models/AIAffiliateReferral";
import AffiliateLink from "../../models/AffiliateLink";
import Company from "../../models/Company";
import Plan from "../../models/Plan";

interface DashboardParams {
  companyId?: number | null;
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}

interface DashboardResult {
  kpis: {
    totalPrograms: number;
    activePrograms: number;
    totalReferrals: number;
    registeredReferrals: number;
    activeReferrals: number;
    tokensDelivered: number;
    daysDelivered: number;
    uniqueAffiliators: number;
    totalClicks: number;
    conversionRate: number;
  };
  referralsTable: {
    rows: any[];
    count: number;
    hasMore: boolean;
    page: number;
    limit: number;
  };
  programs: any[];
}

const GetDashboardService = async (
  arg: number | DashboardParams = {}
): Promise<DashboardResult> => {
  // Compatibilidad: aceptamos un número (legacy) o un objeto
  const params: DashboardParams =
    typeof arg === "number" ? { companyId: arg } : arg;

  const {
    companyId = null,
    page = 1,
    limit = 20,
    search,
    status
  } = params;

  // ── Programas ──────────────────────────────────────────────────────────
  const programWhere: Record<string, unknown> = {};
  if (companyId) programWhere.companyId = companyId;

  const programs = await AIAffiliateProgram.findAll({
    where: programWhere,
    attributes: [
      "id",
      "companyId",
      "name",
      "rewardType",
      "rewardTokens",
      "rewardDays",
      "status"
    ]
  });

  const totalPrograms = programs.length;
  const activePrograms = programs.filter(p => p.status === "active").length;

  // ── KPI: clicks ────────────────────────────────────────────────────────
  const clicksWhere: Record<string, unknown> = {};
  if (companyId) clicksWhere.companyId = companyId;
  const totalClicks = (await AffiliateLink.sum("clicks", { where: clicksWhere })) || 0;

  // ── Referrals (KPIs y tabla) ───────────────────────────────────────────
  const referralWhere: Record<string, unknown> = {};
  if (companyId) {
    const programIds = programs.map(p => p.id);
    if (programIds.length === 0) {
      // Sin programas, tabla vacía
      return {
        kpis: {
          totalPrograms,
          activePrograms,
          totalReferrals: 0,
          registeredReferrals: 0,
          activeReferrals: 0,
          tokensDelivered: 0,
          daysDelivered: 0,
          uniqueAffiliators: 0,
          totalClicks,
          conversionRate: 0
        },
        referralsTable: { rows: [], count: 0, hasMore: false, page, limit },
        programs: []
      };
    }
    referralWhere.affiliateId = { [Op.in]: programIds };
  }

  if (status) referralWhere.status = status;

  // KPIs agregados
  const totals = (await AIAffiliateReferral.findOne({
    where: referralWhere,
    attributes: [
      [fn("COUNT", col("id")), "totalReferrals"],
      [fn("SUM", col("rewardTokens")), "tokensDelivered"],
      [fn("SUM", col("rewardDays")), "daysDelivered"]
    ],
    raw: true
  })) as unknown as {
    totalReferrals: string;
    tokensDelivered: string | null;
    daysDelivered: string | null;
  };

  const totalReferrals = Number(totals?.totalReferrals || 0);
  const tokensDelivered = Number(totals?.tokensDelivered || 0);
  const daysDelivered = Number(totals?.daysDelivered || 0);

  const registeredReferrals = await AIAffiliateReferral.count({
    where: { ...referralWhere, status: "registered" }
  });
  const activeReferrals = await AIAffiliateReferral.count({
    where: { ...referralWhere, status: "active" }
  });

  // Afiliadores únicos
  const affiliators = await AIAffiliateReferral.findAll({
    where: referralWhere,
    attributes: [[fn("DISTINCT", col("affiliateCompanyId")), "affiliateCompanyId"]],
    raw: true
  });
  const uniqueAffiliators = affiliators.filter(
    (a: any) => a.affiliateCompanyId !== null && a.affiliateCompanyId !== undefined
  ).length;

  const conversionRate = totalClicks > 0 ? totalReferrals / totalClicks : 0;

  // ── Tabla paginada ─────────────────────────────────────────────────────
  const tableWhere: Record<string, unknown> = { ...referralWhere };
  const offset = (page - 1) * limit;

  // Búsqueda básica por nombre de company referida o afiliadora
  let referredCompanyFilter: any = undefined;
  let affiliateCompanyFilter: any = undefined;
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    referredCompanyFilter = { name: { [Op.iLike]: term } };
    affiliateCompanyFilter = { name: { [Op.iLike]: term } };
  }

  const { rows, count } = await AIAffiliateReferral.findAndCountAll({
    where: tableWhere,
    include: [
      {
        model: AIAffiliateProgram,
        as: "affiliate",
        attributes: ["id", "name", "rewardType", "rewardTokens", "rewardDays", "companyId"]
      },
      {
        model: Company,
        as: "referredCompany",
        attributes: ["id", "name", "email", "planId", "dueDate"],
        required: !!search,
        where: referredCompanyFilter,
        include: [{ model: Plan, as: "plan", attributes: ["id", "name"] }]
      },
      {
        model: Company,
        as: "affiliateCompany",
        attributes: ["id", "name", "email"],
        required: false,
        where: affiliateCompanyFilter
      }
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true
  });

  return {
    kpis: {
      totalPrograms,
      activePrograms,
      totalReferrals,
      registeredReferrals,
      activeReferrals,
      tokensDelivered,
      daysDelivered,
      uniqueAffiliators,
      totalClicks,
      conversionRate
    },
    referralsTable: {
      rows,
      count,
      hasMore: offset + rows.length < count,
      page,
      limit
    },
    programs
  };
};

export default GetDashboardService;
