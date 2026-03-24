/**
 * Service: ListOptimizationHistoryService
 * Lista historial de optimizaciones y learnings con paginacion y filtros.
 */

import { Op, WhereOptions } from "sequelize";
import UGCCreativeLearning, { LearningType, LearningImpact } from "../../models/UGCCreativeLearning";
import UGCCampaign from "../../models/UGCCampaign";
import logger from "../../utils/logger";

interface ListOptimizationHistoryRequest {
  companyId: number;
  campaignId?: number;
  page?: number;
  limit?: number;
  learningType?: LearningType;
  impact?: LearningImpact;
}

interface ListOptimizationHistoryResponse {
  learnings: UGCCreativeLearning[];
  total: number;
  page: number;
  limit: number;
}

const ListOptimizationHistoryService = async (
  params: ListOptimizationHistoryRequest
): Promise<ListOptimizationHistoryResponse> => {
  const {
    companyId,
    campaignId,
    page = 1,
    limit = 20,
    learningType,
    impact
  } = params;

  const offset = (page - 1) * limit;

  const whereClause: WhereOptions = { companyId };

  if (campaignId) {
    (whereClause as Record<string, unknown>).campaignId = campaignId;
  }

  if (learningType) {
    (whereClause as Record<string, unknown>).learningType = learningType;
  }

  if (impact) {
    (whereClause as Record<string, unknown>).impact = impact;
  }

  const { rows: learnings, count: total } = await UGCCreativeLearning.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: UGCCampaign,
        as: "ugcCampaign",
        required: false,
        attributes: ["id", "name", "status"]
      }
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true
  });

  logger.info(
    `[ListOptimizationHistoryService] Listados ${learnings.length}/${total} learnings, ` +
    `company=${companyId}, page=${page}`
  );

  return {
    learnings,
    total,
    page,
    limit
  };
};

export default ListOptimizationHistoryService;
