/**
 * Service: CreateUGCCampaignService
 * Crea una nueva campana UGC en estado 'draft'.
 * Valida que la company tenga la feature 'useUgc' habilitada en su plan.
 */

import UGCCampaign, {
  UGCProductBrief,
  UGCGenerationConfig,
  UGCPublishConfig,
  UGCOptimizationConfig
} from "../../models/UGCCampaign";
import Company from "../../models/Company";
import Plan from "../../models/Plan";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface CreateUGCCampaignRequest {
  companyId: number;
  userId: number;
  name: string;
  productBrief: UGCProductBrief;
  generationConfig?: UGCGenerationConfig;
  publishConfig?: UGCPublishConfig;
  optimizationConfig?: UGCOptimizationConfig;
  budget?: number;
}

const CreateUGCCampaignService = async (
  params: CreateUGCCampaignRequest
): Promise<UGCCampaign> => {
  const {
    companyId,
    userId,
    name,
    productBrief,
    generationConfig,
    publishConfig,
    optimizationConfig,
    budget
  } = params;

  // Validar campos obligatorios
  if (!name || !name.trim()) {
    throw new AppError("ERR_UGC_CAMPAIGN_NAME_REQUIRED", 400);
  }

  // Validar que la company tenga la feature useUgc
  const company = await Company.findOne({
    where: { id: companyId },
    include: [{ model: Plan, as: "plan" }]
  });

  if (!company) {
    throw new AppError("ERR_COMPANY_NOT_FOUND", 404);
  }

  const plan = company.plan;
  if (!plan || !plan.useUgc) {
    throw new AppError("ERR_UGC_FEATURE_NOT_AVAILABLE", 403);
  }

  // Crear campana en estado draft
  const campaign = await UGCCampaign.create({
    companyId,
    createdBy: userId,
    name: name.trim(),
    status: "draft",
    productBrief: productBrief || {},
    generationConfig: generationConfig || { videoCount: 3, videoDuration: 30, aspectRatio: "9:16" },
    publishConfig: publishConfig || {},
    optimizationConfig: optimizationConfig || {},
    budget: budget || 0,
    budgetSpent: 0,
    totalVideosGenerated: 0,
    totalPostsPublished: 0,
    metadata: {}
  } as Partial<UGCCampaign> as UGCCampaign);

  logger.info(
    `[CreateUGCCampaignService] Campana creada: id=${campaign.id}, ` +
    `name="${campaign.name}", company=${companyId}, user=${userId}`
  );

  return campaign;
};

export default CreateUGCCampaignService;
