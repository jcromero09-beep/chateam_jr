/**
 * ListProgramsService — Módulo Afiliados Independiente
 * Lista programas con paginación, filtro status/search, include Tier + Wallet.
 */

import { Op } from "sequelize";
import AIAffiliateProgram from "../../models/AIAffiliateProgram";
import AffiliateTier from "../../models/AffiliateTier";
import AffiliateWallet from "../../models/AffiliateWallet";

interface ListParams {
  companyId: number;
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}

const ListProgramsService = async ({
  companyId,
  page = 1,
  limit = 20,
  status,
  search
}: ListParams): Promise<{ rows: AIAffiliateProgram[]; count: number; hasMore: boolean }> => {
  const where: Record<string, unknown> = { companyId };

  if (status) {
    where.status = status;
  }

  if (search) {
    where.name = { [Op.iLike]: `%${search}%` };
  }

  const offset = (page - 1) * limit;

  const { rows, count } = await AIAffiliateProgram.findAndCountAll({
    where,
    include: [
      { model: AffiliateTier, as: "tier", required: false },
      { model: AffiliateWallet, as: "wallet", required: false }
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset
  });

  return { rows, count, hasMore: offset + rows.length < count };
};

export default ListProgramsService;
