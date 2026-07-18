import Campaign from "../../models/Campaign";
import Whatsapp from "../../models/Whatsapp";
import WhatsAppTemplate from "../../models/WhatsAppTemplate";
import AppError from "../../errors/AppError";
import { campaignQueue } from "../../queues";
import logger from "../../utils/logger";

/**
 * RestartService
 * -----------------------------------------------------------------
 * Reanuda una campaña previamente cancelada/finalizada.
 *
 * Validaciones previas (solo si la campaña usa plantilla Meta):
 *   - La plantilla debe estar en estado APPROVED
 *   - La conexión WhatsApp debe ser Meta y tener phoneNumberId + tokenMeta
 *
 * Luego marca la campaña EM_ANDAMENTO y re-encola un ProcessCampaign.
 */
export async function RestartService(id: number): Promise<Campaign> {
  const campaign = await Campaign.findByPk(id);
  if (!campaign) {
    throw new AppError("Campaña no encontrada", 404);
  }

  // Validar plantilla + conexión Meta (si aplica)
  if (campaign.useTemplate && campaign.whastsAppTemplateId) {
    const tpl = await WhatsAppTemplate.findByPk(campaign.whastsAppTemplateId);
    if (!tpl || tpl.status !== "APPROVED") {
      throw new AppError(
        "La plantilla Meta no está APPROVED — no se puede reiniciar",
        400
      );
    }

    const wpp = await Whatsapp.findByPk(campaign.whatsappId);
    if (!wpp || wpp.channel !== "meta" || !wpp.phoneNumberId || !wpp.tokenMeta) {
      throw new AppError(
        "La conexión Meta es inválida — no se puede reiniciar",
        400
      );
    }
  }

  await campaign.update({ status: "EM_ANDAMENTO", completedAt: null });

  if (!campaignQueue) {
    throw new AppError("CampaignQueue no disponible (Redis deshabilitado)", 503);
  }

  await campaignQueue.add(
    "ProcessCampaign",
    {
      id: campaign.id,
      companyId: campaign.companyId,
      type: "restart"
    },
    {
      delay: 3000,
      removeOnComplete: { age: 60 * 60, count: 10 },
      removeOnFail: { age: 24 * 60 * 60, count: 50 }
    }
  );

  logger.info(
    { campaignId: campaign.id, companyId: campaign.companyId },
    "[CAMPAIGN-RESTART] Campaña reencolada para reinicio"
  );

  return campaign;
}

export default RestartService;
