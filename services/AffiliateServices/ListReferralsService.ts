/**
 * ListReferralsService — Módulo Afiliados Independiente
 * Listar referidos por company o por programa, paginación, filtro status.
 */

import { Op } from "sequelize";
import AIAffiliateReferral from "../../models/AIAffiliateReferral";
import AIAffiliateProgram from "../../models/AIAffiliateProgram";

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
  // Obtener IDs de programas de esta company
  let affiliateIds: number[] = [];

  if (programId) {
    // Verificar que el programa pertenece a la company
    const program = await AIAffiliateProgram.findOne({
      where: { id: programId, companyId },
      attributes: ["id"]
    });
    if (program) {
      affiliateIds = [program.id];
    }
  } else {
    const programs = await AIAffiliateProgram.findAll({
      where: { companyId },
      attributes: ["id"]
    });
    affiliateIds = programs.map(p => p.id);
  }

  if (affiliateIds.length === 0) {
    return { rows: [], count: 0, hasMore: false };
  }

  const where: Record<string, unknown> = {
    affiliateId: { [Op.in]: affiliateIds }
  };

  if (status) {
    where.status = status;
  }

  const offset = (page - 1) * limit;

  const { rows, count } = await AIAffiliateReferral.findAndCountAll({
    where,
    include: [
      {
        model: AIAffiliateProgram,
        as: "affiliate",
        attributes: ["id", "name", "referralCode"],
        required: false
      }
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset
  });

  return { rows, count, hasMore: offset + rows.length < count };
};

export default ListReferralsService;
