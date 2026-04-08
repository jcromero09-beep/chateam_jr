/**
 * Staged Connection Manager - Inicia sesiones en batches controlados
 * Evita saturar CPU y rate-limiting de WhatsApp al arrancar muchas sesiones
 */
import logger from "../utils/logger";

const BATCH_SIZE = 20;        // Sesiones simultáneas por batch
const BATCH_DELAY_MS = 3000; // 3 segundos entre batches

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function stagedStart(
  items: any[],
  startFn: (item: any) => Promise<void>
): Promise<void> {
  const total = items.length;
  let started = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(items.length / BATCH_SIZE);

    logger.info(`[StagedConnection] Starting batch ${batchNum}/${totalBatches} (${batch.length} sessions)`);

    await Promise.allSettled(
      batch.map(async (item) => {
        try {
          await startFn(item);
          started++;
        } catch (error: any) {
          logger.error(`[StagedConnection] Failed to start session: ${error.message}`);
        }
      })
    );

    logger.info(`[StagedConnection] Batch ${batchNum} complete. Progress: ${started}/${total}`);

    // Delay entre batches (excepto el último)
    if (i + BATCH_SIZE < items.length) {
      await delay(BATCH_DELAY_MS);
    }
  }

  logger.info(`[StagedConnection] All sessions started: ${started}/${total} successful`);
}
