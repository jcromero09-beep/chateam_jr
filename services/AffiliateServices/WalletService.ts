/**
 * WalletService — Resumen del afiliador en tokens IA / días extra.
 *
 * Modelo nuevo (cobro manual):
 *  - "Pendiente por cobrar": referral con rewardStatus="claimable" (referido en plan pagado pero aún no cobrado).
 *  - "Cobrado": referral con rewardStatus="claimed".
 *  - Se computan tokens/días esperados (según el programa) para los pendientes
 *    y tokens/días entregados (rewardTokens/rewardDays del propio referral) para los cobrados.
 */

import AIAffiliateReferral from "../../models/AIAffiliateReferral";
import AIAffiliateProgram from "../../models/AIAffiliateProgram";
import Company from "../../models/Company";
import { Op, fn, col, literal } from "sequelize";

export interface WalletSummary {
  companyId: number;
  totalReferrals: number;
  registeredReferrals: number;
  activeReferrals: number;
  pendingClaim: number;
  claimedCount: number;
  pendingTokens: number;
  pendingDays: number;
  tokensEarned: number;
  daysEarned: number;
  currentTokenBalance: number;
  currency: string;
}

export const getBalance = async (companyId: number): Promise<WalletSummary> => {
  const baseWhere = { affiliateCompanyId: companyId };

  const [totalReferrals, registeredReferrals, activeReferrals, pendingClaim, claimedCount] =
    await Promise.all([
      AIAffiliateReferral.count({ where: baseWhere }),
      AIAffiliateReferral.count({ where: { ...baseWhere, rewardStatus: "pending" } }),
      AIAffiliateReferral.count({ where: { ...baseWhere, rewardStatus: { [Op.ne]: "pending" } } }),
      AIAffiliateReferral.count({ where: { ...baseWhere, rewardStatus: "claimable" } }),
      AIAffiliateReferral.count({ where: { ...baseWhere, rewardStatus: "claimed" } })
    ]);

  // Tokens/días YA cobrados (suma directa de los reward* de los referrals claimed)
  const claimedTotals = (await AIAffiliateReferral.findOne({
    where: { ...baseWhere, rewardStatus: "claimed" },
    attributes: [
      [fn("SUM", col("rewardTokens")), "tokensEarned"],
      [fn("SUM", col("rewardDays")), "daysEarned"]
    ],
    raw: true
  })) as unknown as { tokensEarned: string | null; daysEarned: string | null };

  // Tokens/días PENDIENTES (cobrables): se proyectan desde el programa asociado
  const pendingRefs = await AIAffiliateReferral.findAll({
    where: { ...baseWhere, rewardStatus: "claimable" },
    include: [
      {
        model: AIAffiliateProgram,
        as: "affiliate",
        attributes: ["id", "rewardType", "rewardTokens", "rewardDays"]
      }
    ]
  });

  let pendingTokens = 0;
  let pendingDays = 0;
  for (const ref of pendingRefs) {
    const program: any = (ref as any).affiliate;
    if (!program) continue;
    if (program.rewardType === "tokens") pendingTokens += Number(program.rewardTokens || 0);
    if (program.rewardType === "days") pendingDays += Number(program.rewardDays || 0);
  }

  const company = await Company.findByPk(companyId);

  return {
    companyId,
    totalReferrals,
    registeredReferrals,
    activeReferrals,
    pendingClaim,
    claimedCount,
    pendingTokens,
    pendingDays,
    tokensEarned: Number(claimedTotals?.tokensEarned || 0),
    daysEarned: Number(claimedTotals?.daysEarned || 0),
    currentTokenBalance: Number(company?.aiTokenBalance || 0),
    currency: "USD"
  };
};

interface TransactionListParams {
  companyId: number;
  page?: number;
  limit?: number;
  /** "tokens" | "days" | "claimable" | "claimed" | undefined */
  type?: string;
}

/**
 * Lista referidos con su recompensa (claimable o claimed) para el wallet.
 */
export const listTransactions = async ({
  companyId,
  page = 1,
  limit = 20,
  type
}: TransactionListParams): Promise<{ rows: any[]; count: number; hasMore: boolean }> => {
  const where: Record<string, unknown> = {
    affiliateCompanyId: companyId,
    rewardStatus: { [Op.in]: ["claimable", "claimed"] }
  };

  if (type === "claimable") where.rewardStatus = "claimable";
  if (type === "claimed") where.rewardStatus = "claimed";
  if (type === "tokens") where.rewardType = "tokens";
  if (type === "days") where.rewardType = "days";

  const offset = (page - 1) * limit;

  const { rows, count } = await AIAffiliateReferral.findAndCountAll({
    where,
    include: [
      {
        model: AIAffiliateProgram,
        as: "affiliate",
        attributes: ["id", "name", "rewardType", "rewardTokens", "rewardDays"]
      },
      {
        model: Company,
        as: "referredCompany",
        attributes: ["id", "name", "email", "planId"],
        required: false
      }
    ],
    order: [
      [literal(`CASE WHEN "AIAffiliateReferral"."rewardStatus" = 'claimable' THEN 0 ELSE 1 END`), "ASC"],
      ["createdAt", "DESC"]
    ],
    limit,
    offset,
    distinct: true
  });

  return { rows, count, hasMore: offset + rows.length < count };
};
