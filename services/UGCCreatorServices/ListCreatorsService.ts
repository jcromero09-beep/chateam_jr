/**
 * Service: ListCreatorsService
 * Lista creadores de contenido UGC con paginacion, filtros y busqueda.
 * Incluye conteo de assignments completados.
 */

import { Op, WhereOptions, fn, col, literal } from "sequelize";
import UGCCreator, { CreatorStatus } from "../../models/UGCCreator";
import UGCCreatorAssignment from "../../models/UGCCreatorAssignment";
import logger from "../../utils/logger";

interface ListCreatorsRequest {
  companyId: number;
  page?: number;
  limit?: number;
  status?: CreatorStatus;
  niche?: string;
  searchParam?: string;
}

interface ListCreatorsResponse {
  creators: UGCCreator[];
  total: number;
  page: number;
  limit: number;
}

const ListCreatorsService = async (
  params: ListCreatorsRequest
): Promise<ListCreatorsResponse> => {
  const {
    companyId,
    page = 1,
    limit = 20,
    status,
    niche,
    searchParam
  } = params;

  const offset = (page - 1) * limit;

  const whereClause: WhereOptions = { companyId };

  if (status) {
    (whereClause as Record<string, unknown>).status = status;
  }

  if (niche) {
    (whereClause as Record<string, unknown>).niche = niche;
  }

  if (searchParam) {
    (whereClause as Record<string, unknown>)[Op.or as unknown as string] = [
      { name: { [Op.iLike]: `%${searchParam}%` } },
      { email: { [Op.iLike]: `%${searchParam}%` } },
      { niche: { [Op.iLike]: `%${searchParam}%` } }
    ];
  }

  const { rows: creators, count: total } = await UGCCreator.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: UGCCreatorAssignment,
        as: "assignments",
        required: false,
        attributes: ["id", "status"],
        where: { status: "approved" },
        separate: true
      }
    ],
    order: [
      ["rating", "DESC"],
      ["completedCampaigns", "DESC"]
    ],
    limit,
    offset,
    distinct: true
  });

  logger.info(
    `[ListCreatorsService] Listados ${creators.length}/${total} creadores, ` +
    `company=${companyId}, page=${page}`
  );

  return {
    creators,
    total,
    page,
    limit
  };
};

export default ListCreatorsService;
