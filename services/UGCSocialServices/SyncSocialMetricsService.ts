/**
 * Service: SyncSocialMetricsService
 * Placeholder para sincronizar metricas de una cuenta social.
 * Actualiza followerCount, postCount, engagementRate, lastSyncAt.
 * La integracion real con APIs de plataformas se implementa en fase posterior.
 */

import UGCSocialAccount from "../../models/UGCSocialAccount";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface SyncSocialMetricsRequest {
  companyId: number;
  socialAccountId: number;
}

interface SyncSocialMetricsResponse {
  account: UGCSocialAccount;
  synced: boolean;
  metricsUpdated: string[];
}

const SyncSocialMetricsService = async (
  params: SyncSocialMetricsRequest
): Promise<SyncSocialMetricsResponse> => {
  const { companyId, socialAccountId } = params;

  const account = await UGCSocialAccount.findOne({
    where: { id: socialAccountId, companyId }
  });

  if (!account) {
    throw new AppError("ERR_UGC_SOCIAL_ACCOUNT_NOT_FOUND", 404);
  }

  if (account.status === "revoked") {
    throw new AppError("ERR_UGC_SOCIAL_ACCOUNT_REVOKED", 400);
  }

  // Placeholder: En produccion esto consultaria las APIs de cada plataforma
  // (Instagram Graph API, TikTok Business API, etc.)
  // Por ahora, solo actualizamos lastSyncAt
  const metricsUpdated: string[] = [];

  // Simular sincronizacion basica
  await account.update({
    lastSyncAt: new Date(),
    metadata: {
      ...account.metadata,
      lastSyncSource: "placeholder",
      lastSyncTimestamp: new Date().toISOString()
    }
  });

  metricsUpdated.push("lastSyncAt");

  await account.reload();

  logger.info(
    `[SyncSocialMetricsService] Metricas sincronizadas (placeholder): ` +
    `account=${socialAccountId}, platform=${account.platform}, ` +
    `company=${companyId}`
  );

  return {
    account,
    synced: true,
    metricsUpdated
  };
};

export default SyncSocialMetricsService;
