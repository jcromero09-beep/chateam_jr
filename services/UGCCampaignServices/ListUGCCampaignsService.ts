/**
 * Service: ListUGCCampaignsService
 * Lista campanas UGC con paginacion, filtros de status y busqueda.
 * Incluye conteo de videoJobs y socialPosts.
 */

import { Op, literal } from "sequelize";
import UGCCampaign, { UGCCampaignStatus } from "../../models/UGCCampaign";
import UGCVideoJob from "../../models/UGCVideoJob";
import UGCSocialPost from "../../models/UGCSocialPost";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface ListUGCCampaignsRequest {
  companyId: number;
  page: number;
  limit: number;
  status?: UGCCampaignStatus;
  searchParam?: string;
}

interface ListUGCCampaignsResponse {
  campaigns: UGCCampaign[];
  total: number;
  page: number;
  limit: number;
}

const ListUGCCampaignsService = async (
  params: ListUGCCampaignsRequest
): Promise<ListUGCCampaignsResponse> => {
  const { companyId, page = 1, limit = 20, status, searchParam } = params;

  const offset = (page - 1) * limit;

  // Construir condiciones de filtro
  const whereClause: Record<string, unknown> = { companyId };

  if (status) {
    whereClause.status = status;
  }

  if (searchParam && searchParam.trim()) {
    const term = searchParam.trim();
    // Escapar comillas simples para la consulta literal sobre el JSONB productBrief
    const safeTerm = term.replace(/'/g, "''");
    whereClause[Op.or as unknown as string] = [
      { name: { [Op.iLike]: `%${term}%` } },
      literal(`"productBrief"->>'productName' ILIKE '%${safeTerm}%'`)
    ];
  }

  const { rows: campaigns, count: total } = await UGCCampaign.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: UGCVideoJob,
        as: "videoJobs",
        attributes: ["id", "stage", "status"],
        required: false
      }
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true
  });

  logger.info(
    `[ListUGCCampaignsService] Listado: company=${companyId}, ` +
    `total=${total}, page=${page}, limit=${limit}, status=${status || "all"}`
  );

  return {
    campaigns,
    total,
    page,
    limit
  };
};

export default ListUGCCampaignsService;
