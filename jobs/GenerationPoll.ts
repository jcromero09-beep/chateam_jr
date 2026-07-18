/**
 * Job: GenerationPoll — seguimiento por polling de un job de generación
 * (Higgsfield u otro proveedor) cuando NO llega webhook.
 *
 * Llama a ResolveGenerationJobService; si el job sigue en proceso, se
 * re-encola a sí mismo con backoff incremental hasta agotar MAX_ATTEMPTS.
 * El webhook puede cerrar el job antes — ResolveGenerationJobService es
 * idempotente, así que no hay doble cierre.
 */

import Bull from "bull";
import logger from "../utils/logger";
import ResolveGenerationJobService from "../services/Generation/orchestrator/ResolveGenerationJobService";
import { add } from "../queues";

const MAX_ATTEMPTS = 40; // ~ varios minutos con backoff
const BASE_DELAY_MS = 8000;
const MAX_DELAY_MS = 30000;

interface GenerationPollData {
  videoJobId: number;
  companyId: number;
  attempt?: number;
}

export default async function GenerationPoll(job: Bull.Job): Promise<void> {
  const { videoJobId, companyId, attempt = 0 } = job.data as GenerationPollData;

  try {
    const result = await ResolveGenerationJobService({ videoJobId });

    if (result.settled) {
      logger.info(
        `[GenerationPoll] job=${videoJobId} settled status=${result.status}`
      );
      return;
    }

    if (attempt + 1 >= MAX_ATTEMPTS) {
      logger.warn(
        `[GenerationPoll] job=${videoJobId} agotó MAX_ATTEMPTS — marcando timeout`
      );
      // Forzar resolución final: el proveedor sigue sin terminar.
      await ResolveGenerationJobService({
        videoJobId,
        providerJob: {
          providerJobId: String(videoJobId),
          status: "failed",
          error: "Timeout de polling — el proveedor no completó a tiempo"
        }
      });
      return;
    }

    // Backoff incremental, re-encolar.
    const delay = Math.min(BASE_DELAY_MS + attempt * 1000, MAX_DELAY_MS);
    await add(
      "GenerationPollQueue",
      { videoJobId, companyId, attempt: attempt + 1 },
      { delay, removeOnComplete: true, removeOnFail: true }
    );
  } catch (err) {
    logger.error(
      `[GenerationPoll] error job=${videoJobId} attempt=${attempt}: ${String(err)}`
    );
    // Re-encolar pese al error transitorio (red), respetando MAX_ATTEMPTS.
    if (attempt + 1 < MAX_ATTEMPTS) {
      await add(
        "GenerationPollQueue",
        { videoJobId, companyId, attempt: attempt + 1 },
        { delay: MAX_DELAY_MS, removeOnComplete: true, removeOnFail: true }
      );
    }
  }
}
