/**
 * Service: AssignCreatorService
 * Asigna un creador humano a una campana UGC.
 * Valida que el creador este 'active' o 'verified'.
 * Valida que la campana exista y pertenezca a la company.
 * Crea UGCCreatorAssignment con status 'invited' e invitedAt.
 */

import UGCCreator from "../../models/UGCCreator";
import UGCCampaign from "../../models/UGCCampaign";
import UGCCreatorAssignment from "../../models/UGCCreatorAssignment";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface AssignCreatorRequest {
  companyId: number;
  creatorId: number;
  campaignId: number;
  brief: string;
  requirements?: Record<string, unknown>;
  deadline: Date;
  agreedRate: number;
}

interface AssignCreatorResponse {
  assignment: UGCCreatorAssignment;
}

const AssignCreatorService = async (
  params: AssignCreatorRequest
): Promise<AssignCreatorResponse> => {
  const {
    companyId,
    creatorId,
    campaignId,
    brief,
    requirements = {},
    deadline,
    agreedRate
  } = params;

  if (!brief || !deadline || !agreedRate) {
    throw new AppError("ERR_UGC_ASSIGNMENT_MISSING_REQUIRED_FIELDS", 400);
  }

  // Validar que el creador exista y este activo o verificado
  const creator = await UGCCreator.findOne({
    where: { id: creatorId, companyId }
  });

  if (!creator) {
    throw new AppError("ERR_UGC_CREATOR_NOT_FOUND", 404);
  }

  if (!creator.isActive() && !creator.isVerified()) {
    throw new AppError("ERR_UGC_CREATOR_NOT_ACTIVE_OR_VERIFIED", 400);
  }

  // Validar que la campana exista y pertenezca a la company
  const campaign = await UGCCampaign.findOne({
    where: { id: campaignId, companyId }
  });

  if (!campaign) {
    throw new AppError("ERR_UGC_CAMPAIGN_NOT_FOUND", 404);
  }

  // Crear la asignacion
  const assignment = await UGCCreatorAssignment.create({
    companyId,
    creatorId,
    campaignId,
    brief,
    requirements,
    deadline,
    agreedRate,
    currency: creator.currency || "USD",
    status: "invited",
    invitedAt: new Date()
  } as Partial<UGCCreatorAssignment> as UGCCreatorAssignment);

  logger.info(
    `[AssignCreatorService] Creador asignado: assignmentId=${assignment.id}, ` +
    `creator=${creatorId} (${creator.name}), campaign=${campaignId} (${campaign.name}), ` +
    `rate=${agreedRate}, company=${companyId}`
  );

  return { assignment };
};

export default AssignCreatorService;
