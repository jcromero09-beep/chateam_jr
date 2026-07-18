/**
 * Job: UGCSocialPublish
 * Publica contenido en una red social (placeholder).
 * La integracion real con APIs de plataformas se implementa en fase posterior.
 *
 * Flujo:
 * 1. Cargar UGCSocialPost
 * 2. Marcar como 'publishing'
 * 3. Placeholder: simular publicacion
 * 4. Actualizar status a 'published' y publishedAt
 */

import { Job } from "bull";
import UGCSocialPost from "../models/UGCSocialPost";
import logger from "../utils/logger";

interface UGCSocialPublishJobData {
  companyId: number;
  socialPostId: number;
  platform: string;
}

const handle = async (
  job: Job<UGCSocialPublishJobData>
): Promise<{ socialPostId: number; status: string }> => {
  const { companyId, socialPostId, platform } = job.data;

  logger.info(
    `[UGCSocialPublish] Publicando post: id=${socialPostId}, ` +
    `platform=${platform}, company=${companyId}`
  );

  // 1. Cargar el post
  const post = await UGCSocialPost.findOne({
    where: { id: socialPostId, companyId }
  });

  if (!post) {
    logger.error(`[UGCSocialPublish] Post no encontrado: ${socialPostId}`);
    throw new Error(`UGCSocialPost ${socialPostId} no encontrado`);
  }

  if (post.status === "published") {
    logger.warn(`[UGCSocialPublish] Post ${socialPostId} ya publicado, omitiendo`);
    return { socialPostId, status: "already_published" };
  }

  try {
    // 2. Marcar como publicando
    await post.update({ status: "publishing" });

    // 3. Placeholder: Simular publicacion
    // En produccion esto usaria las APIs de cada plataforma:
    // - Instagram Graph API
    // - TikTok Creator API
    // - Facebook Pages API
    // - YouTube Data API v3
    logger.info(
      `[UGCSocialPublish] Simulando publicacion en ${platform}: ` +
      `caption="${(post.caption || "").substring(0, 80)}..."`
    );

    // Simular tiempo de publicacion
    await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 2000));

    // Generar ID ficticio de plataforma
    const fakePlatformPostId = `${platform}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // 4. Marcar como publicado
    await post.publish(fakePlatformPostId);

    logger.info(
      `[UGCSocialPublish] Post publicado: id=${socialPostId}, ` +
      `platformPostId=${fakePlatformPostId}, platform=${platform}`
    );

    return { socialPostId, status: "published" };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Marcar como fallido
    try {
      await post.markAsFailed();
    } catch (updateErr: unknown) {
      const updateMsg = updateErr instanceof Error ? updateErr.message : String(updateErr);
      logger.error(`[UGCSocialPublish] Error actualizando estado: ${updateMsg}`);
    }

    logger.error(
      `[UGCSocialPublish] Error publicando post ${socialPostId}: ${errorMessage}`
    );
    throw error;
  }
};

export default handle;
