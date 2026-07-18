import fs from "fs/promises";
import path from "path";
import { Op } from "sequelize";
import Campaign from "../../models/Campaign";
import CampaignShipping from "../../models/CampaignShipping";
import logger from "../../utils/logger";
import { campaignQueue, sendMessageQueue } from "../../queues";

interface CleanupResult {
  removedFromQueue: number;
  shippingCancelled: number;
  mediaRemoved: boolean;
}

/**
 * CleanupCampaignJobsService
 * ------------------------------------------------------------------
 * Limpieza completa de jobs, shippings pendientes y media asociada
 * a una campaña. Se invoca desde CancelService y opcionalmente desde
 * DeleteService (Agente 2).
 *
 * NO borra filas de CampaignShipping (BD SAGRADA) — solo marca como
 * fallidas (failedAt + errorMessage) las que aún no fueron entregadas.
 */
export const CleanupCampaignJobsService = async (
  campaignId: number
): Promise<CleanupResult> => {
  let removedFromQueue = 0;
  let shippingCancelled = 0;
  let mediaRemoved = false;

  // ──────────────────────────────────────────────────────────────
  // 1. Jobs hijos persistidos en CampaignShipping.jobId (SendMessage)
  // ──────────────────────────────────────────────────────────────
  const pendingShippings = await CampaignShipping.findAll({
    where: {
      campaignId,
      jobId: { [Op.not]: null },
      deliveredAt: null,
      failedAt: null
    }
  });

  for (const s of pendingShippings) {
    // Los jobs hijos viven en MessageQueue (backend), no en CampaignQueue.
    try {
      if (sendMessageQueue && s.jobId) {
        const childJob = await sendMessageQueue.getJob(s.jobId);
        if (childJob) {
          await childJob.remove();
          removedFromQueue++;
        }
      }
    } catch (err) {
      logger.warn(
        { err, jobId: s.jobId },
        "[CAMPAIGN-CLEANUP] No se pudo remover job hijo de MessageQueue"
      );
    }

    // Best-effort: también intentar en CampaignQueue por si el worker
    // guardó ahí el id (fallback histórico).
    try {
      if (campaignQueue && s.jobId) {
        const cJob = await campaignQueue.getJob(s.jobId);
        if (cJob) {
          await cJob.remove();
          removedFromQueue++;
        }
      }
    } catch (err) {
      // silencioso — jobId puede no existir en CampaignQueue
    }

    // Marcar shipping como cancelado (sin delete — BD SAGRADA)
    try {
      await s.update({
        failedAt: new Date(),
        errorMessage: "Campaña cancelada/eliminada — job cancelado"
      });
      shippingCancelled++;
    } catch (err) {
      logger.warn(
        { err, shippingId: s.id },
        "[CAMPAIGN-CLEANUP] No se pudo marcar shipping como cancelado"
      );
    }
  }

  // ──────────────────────────────────────────────────────────────
  // 2. Jobs padres (ProcessCampaign) en CampaignQueue
  // ──────────────────────────────────────────────────────────────
  try {
    if (campaignQueue) {
      const jobs = await campaignQueue.getJobs(["waiting", "delayed", "active"]);
      for (const j of jobs) {
        if (
          j &&
          j.data &&
          (j.data.id === campaignId || j.data.campaignId === campaignId)
        ) {
          try {
            const state = await j.getState();
            if (state === "active") {
              logger.warn(
                { jobId: j.id, campaignId },
                "[CAMPAIGN-CLEANUP] Job activo no removible; worker lo ignorará por estado persistido"
              );
            } else {
              await j.remove();
              removedFromQueue++;
            }
          } catch (err) {
            logger.warn(
              { err, jobId: j.id },
              "[CAMPAIGN-CLEANUP] Error removiendo job de CampaignQueue"
            );
          }
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, "[CAMPAIGN-CLEANUP] No se pudo iterar CampaignQueue");
  }

  // ──────────────────────────────────────────────────────────────
  // 3. Jobs repetibles asociados a la campaña
  // ──────────────────────────────────────────────────────────────
  try {
    if (campaignQueue) {
      const repeatables = await campaignQueue.getRepeatableJobs();
      for (const r of repeatables) {
        if (r.id && String(r.id).includes(`campaign-${campaignId}`)) {
          await campaignQueue.removeRepeatableByKey(r.key);
          removedFromQueue++;
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, "[CAMPAIGN-CLEANUP] No se pudo iterar repeatables");
  }

  // ──────────────────────────────────────────────────────────────
  // 4. Media asociada (solo se borra archivo físico; la BD se conserva)
  // ──────────────────────────────────────────────────────────────
  try {
    const c = await Campaign.findByPk(campaignId);
    if (c?.mediaPath) {
      const mediaPath = path.isAbsolute(c.mediaPath)
        ? c.mediaPath
        : path.resolve(process.cwd(), "public", c.mediaPath);
      await fs.unlink(mediaPath).catch(() => {
        // silencioso — el archivo puede ya no existir
      });
      mediaRemoved = true;
    }
  } catch (err) {
    logger.warn({ err, campaignId }, "[CAMPAIGN-CLEANUP] Media path no removido");
  }

  logger.info(
    { campaignId, removedFromQueue, shippingCancelled, mediaRemoved },
    "[CAMPAIGN-CLEANUP] Cleanup campaña completado"
  );

  return { removedFromQueue, shippingCancelled, mediaRemoved };
};

export default CleanupCampaignJobsService;
