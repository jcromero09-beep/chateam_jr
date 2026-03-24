/**
 * Job: UGCMetricsSync
 * Sincroniza metricas de un post social (placeholder).
 * La integracion real con APIs de plataformas se implementa en fase posterior.
 *
 * Flujo:
 * 1. Cargar UGCSocialPost
 * 2. Placeholder: consultar metricas de la plataforma
 * 3. Actualizar metricas en UGCSocialPost
 */

import { Job } from "bull";
import UGCSocialPost from "../models/UGCSocialPost";
import logger from "../utils/logger";

interface UGCMetricsSyncJobData {
  companyId: number;
  socialPostId: number;
}

const handle = async (
  job: Job<UGCMetricsSyncJobData>
): Promise<{ socialPostId: number; synced: boolean }> => {
  const { companyId, socialPostId } = job.data;

  logger.info(
    `[UGCMetricsSync] Sincronizando metricas: postId=${socialPostId}, ` +
    `company=${companyId}`
  );

  // 1. Cargar el post
  const post = await UGCSocialPost.findOne({
    where: { id: socialPostId, companyId }
  });

  if (!post) {
    logger.error(`[UGCMetricsSync] Post no encontrado: ${socialPostId}`);
    throw new Error(`UGCSocialPost ${socialPostId} no encontrado`);
  }

  if (post.status !== "published") {
    logger.warn(
      `[UGCMetricsSync] Post ${socialPostId} no esta publicado (status=${post.status}), omitiendo`
    );
    return { socialPostId, synced: false };
  }

  try {
    // 2. Placeholder: Consultar metricas de la plataforma
    // En produccion esto consultaria las APIs de cada plataforma
    // para obtener likes, comments, shares, views, etc.
    logger.info(
      `[UGCMetricsSync] Simulando sincronizacion de metricas para ` +
      `post ${socialPostId} en ${post.platform}`
    );

    // 3. Actualizar timestamp de sincronizacion
    await post.update({
      lastMetricsSyncAt: new Date(),
      metadata: {
        ...post.metadata,
        lastMetricsSyncSource: "placeholder",
        lastMetricsSyncTimestamp: new Date().toISOString()
      }
    });

    logger.info(
      `[UGCMetricsSync] Metricas sincronizadas (placeholder): postId=${socialPostId}`
    );

    return { socialPostId, synced: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `[UGCMetricsSync] Error sincronizando metricas para post ${socialPostId}: ${errorMessage}`
    );
    throw error;
  }
};

export default handle;
