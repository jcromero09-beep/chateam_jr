/**
 * ListReferralsService — Listar referidos para vista de COMPANY (afiliadora).
 *
 * Filtra por affiliateCompanyId = companyId (la company que invitó).
 * Devuelve referidos con: company referida (nombre, email, plan), programa,
 * recompensa entregada, fechas.
 */

import { Op, literal } from "sequelize";
import AIAffiliateReferral from "../../models/AIAffiliateReferral";
import AIAffiliateProgram from "../../models/AIAffiliateProgram";
import Company from "../../models/Company";
import Plan from "../../models/Plan";

interface ListParams {
  companyId: number;
  programId?: number;
  page?: number;
  limit?: number;
  status?: string;
}

const ListReferralsService = async ({
  companyId,
  programId,
  page = 1,
  limit = 20,
  status
}: ListParams): Promise<{ rows: AIAffiliateReferral[]; count: number; hasMore: boolean }> => {
  const where: Record<string, unknown> = {
    affiliateCompanyId: companyId
  };

  if (status) {
    where.status = status;
  }
  if (programId) {
    where.affiliateId = programId;
  }

  const offset = (page - 1) * limit;

  const { rows, count } = await AIAffiliateReferral.findAndCountAll({
    where,
    include: [
      {
        model: AIAffiliateProgram,
        as: "affiliate",
        attributes: ["id", "name", "referralCode", "rewardType", "rewardTokens", "rewardDays"],
        required: false
      },
      {
        model: Company,
        as: "referredCompany",
        attributes: ["id", "name", "email", "planId", "dueDate"],
        required: false,
        include: [{ model: Plan, as: "plan", attributes: ["id", "name"] }]
      }
    ],
    order: [
      // Claimable arriba, luego claimed, luego pending
      [
        literal(
          `CASE "AIAffiliateReferral"."rewardStatus" WHEN 'claimable' THEN 0 WHEN 'claimed' THEN 1 ELSE 2 END`
        ),
        "ASC"
      ],
      ["createdAt", "DESC"]
    ],
    limit,
    offset,
    distinct: true
  });

  return { rows, count, hasMore: offset + rows.length < count };
};

export default ListReferralsService;
