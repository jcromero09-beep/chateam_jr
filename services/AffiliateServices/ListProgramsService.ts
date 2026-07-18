/**
 * ListProgramsService — Lista programas con paginación, filtro status/search.
 *
 * - Si companyId === null → modo superadmin (lista todos los programas).
 * - Si companyId !== null → filtra a programas de esa company.
 */

import { Op } from "sequelize";
import AIAffiliateProgram from "../../models/AIAffiliateProgram";
import Company from "../../models/Company";

interface ListParams {
  companyId: number | null;
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
  const where: Record<string, unknown> = {};
  if (companyId) where.companyId = companyId;

  if (status) where.status = status;
  if (search) where.name = { [Op.iLike]: `%${search}%` };

  const offset = (page - 1) * limit;

  const { rows, count } = await AIAffiliateProgram.findAndCountAll({
    where,
    include: [
      {
        model: Company,
        as: "company",
        attributes: ["id", "name", "email"],
        required: false
      }
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset
  });

  return { rows, count, hasMore: offset + rows.length < count };
};

export default ListProgramsService;
