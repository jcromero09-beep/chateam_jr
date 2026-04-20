import Campaign from "../../models/Campaign";
import AppError from "../../errors/AppError";
import { getIO } from "../../libs/socket";
import CleanupCampaignJobsService from "./CleanupCampaignJobsService";
import logger from "../../utils/logger";

/**
 * CancelService
 * -----------------------------------------------------------------
 * Cancela una campaña y limpia jobs + shippings pendientes.
 *
 * Pasos:
 *   1. Marcar campaña como CANCELADA
 *   2. Delegar limpieza a CleanupCampaignJobsService (jobs padres +
 *      hijos + shippings pendientes + media)
 *   3. Emitir socket 'update' para refrescar UI
 *
 * BD SAGRADA: nunca se borran filas existentes — solo se actualizan.
 */
export async function CancelService(id: number): Promise<Campaign> {
  const campaign = await Campaign.findByPk(id);
  if (!campaign) {
    throw new AppError("Campaña no encontrada", 404);
  }

  await campaign.update({ status: "CANCELADA" });

  const result = await CleanupCampaignJobsService(campaign.id);

  logger.info(
    {
      campaignId: campaign.id,
      companyId: campaign.companyId,
      removedFromQueue: result.removedFromQueue,
      shippingCancelled: result.shippingCancelled,
      mediaRemoved: result.mediaRemoved
    },
    "[CAMPAIGN-CANCEL] Campaña cancelada y cleanup ejecutado"
  );

  try {
    const io = getIO();
    io.of(String(campaign.companyId)).emit(`company-${campaign.companyId}-campaign`, {
      action: "update",
      record: campaign
    });
  } catch (err) {
    logger.warn({ err, campaignId: campaign.id }, "[CAMPAIGN-CANCEL] No se pudo emitir socket");
  }

  return campaign;
}

export default CancelService;
