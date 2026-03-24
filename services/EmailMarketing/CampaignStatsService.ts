import { Op, fn, col, literal } from "sequelize";
import EmailCampaign from "../../models/EmailMarketing/EmailCampaign";
import EmailCampaignRecipient from "../../models/EmailMarketing/EmailCampaignRecipient";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

// ============================================================================
// Interfaces
// ============================================================================

interface CampaignStatsResponse {
  campaignId: number;
  campaignName: string;
  status: string;
  totalRecipients: number;
  totalSent: number;
  totalDelivered: number;
  totalOpened: number;
  totalClicked: number;
  totalBounced: number;
  totalUnsubscribed: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
}

// ============================================================================
// CampaignStatsService
// ============================================================================

/**
 * Calcula estadisticas de una campana de email a partir de
 * los registros de EmailCampaignRecipient.
 *
 * Consulta los recipients agrupados por status y calcula
 * las tasas de apertura, clics y rebotes.
 */
const CampaignStatsService = async (
  companyId: number,
  campaignId: number
): Promise<CampaignStatsResponse> => {

  // 1. Verificar que la campana existe y pertenece a la company
  const campaign = await EmailCampaign.findOne({
    where: { id: campaignId, companyId }
  });

  if (!campaign) {
    throw new AppError("ERR_EMAIL_CAMPAIGN_NOT_FOUND", 404);
  }

  // 2. Contar recipients por status
  const recipients = await EmailCampaignRecipient.findAll({
    where: { campaignId, companyId },
    attributes: [
      "status",
      [fn("COUNT", col("id")), "count"]
    ],
    group: ["status"],
    raw: true
  }) as unknown as Array<{ status: string; count: string }>;

  // 3. Mapear conteos por status
  const statusCounts: Record<string, number> = {};
  for (const row of recipients) {
    statusCounts[row.status] = Number(row.count) || 0;
  }

  const totalRecipients = Object.values(statusCounts).reduce(
    (sum, count) => sum + count,
    0
  );

  const totalSent = (statusCounts["sent"] || 0) +
    (statusCounts["delivered"] || 0) +
    (statusCounts["opened"] || 0) +
    (statusCounts["clicked"] || 0) +
    (statusCounts["bounced"] || 0) +
    (statusCounts["unsubscribed"] || 0);

  const totalDelivered = (statusCounts["delivered"] || 0) +
    (statusCounts["opened"] || 0) +
    (statusCounts["clicked"] || 0);

  const totalOpened = statusCounts["opened"] || 0;
  const totalClicked = statusCounts["clicked"] || 0;
  const totalBounced = statusCounts["bounced"] || 0;
  const totalUnsubscribed = statusCounts["unsubscribed"] || 0;

  // 4. Tambien contar por campos de fecha para mayor precision
  const openedByDate = await EmailCampaignRecipient.count({
    where: {
      campaignId,
      companyId,
      openedAt: { [Op.ne]: null }
    }
  });

  const clickedByDate = await EmailCampaignRecipient.count({
    where: {
      campaignId,
      companyId,
      clickedAt: { [Op.ne]: null }
    }
  });

  const bouncedByDate = await EmailCampaignRecipient.count({
    where: {
      campaignId,
      companyId,
      bouncedAt: { [Op.ne]: null }
    }
  });

  const unsubscribedByDate = await EmailCampaignRecipient.count({
    where: {
      campaignId,
      companyId,
      unsubscribedAt: { [Op.ne]: null }
    }
  });

  // Usar el mayor entre conteo por status y conteo por fecha
  const finalOpened = Math.max(totalOpened, openedByDate);
  const finalClicked = Math.max(totalClicked, clickedByDate);
  const finalBounced = Math.max(totalBounced, bouncedByDate);
  const finalUnsubscribed = Math.max(totalUnsubscribed, unsubscribedByDate);

  // 5. Calcular tasas
  const effectiveDelivered = totalSent > 0 ? totalSent - finalBounced : 0;
  const openRate = effectiveDelivered > 0
    ? Number(((finalOpened / effectiveDelivered) * 100).toFixed(2))
    : 0;
  const clickRate = finalOpened > 0
    ? Number(((finalClicked / finalOpened) * 100).toFixed(2))
    : 0;
  const bounceRate = totalSent > 0
    ? Number(((finalBounced / totalSent) * 100).toFixed(2))
    : 0;

  // 6. Actualizar contadores en la campana para cache rapido
  await campaign.update({
    totalRecipients: totalRecipients || campaign.totalRecipients,
    totalSent,
    totalDelivered: effectiveDelivered,
    totalOpened: finalOpened,
    totalClicked: finalClicked,
    totalBounced: finalBounced,
    totalUnsubscribed: finalUnsubscribed
  });

  logger.info(
    `[CampaignStatsService] Stats calculadas: campaignId=${campaignId}, ` +
    `companyId=${companyId}, sent=${totalSent}, opened=${finalOpened}, ` +
    `openRate=${openRate}%`
  );

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    status: campaign.status,
    totalRecipients: totalRecipients || campaign.totalRecipients,
    totalSent,
    totalDelivered: effectiveDelivered,
    totalOpened: finalOpened,
    totalClicked: finalClicked,
    totalBounced: finalBounced,
    totalUnsubscribed: finalUnsubscribed,
    openRate,
    clickRate,
    bounceRate
  };
};

export default CampaignStatsService;
