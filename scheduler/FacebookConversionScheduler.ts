import Bull from "bull";
import { REDIS_URI_CONNECTION } from "../config/redis";
import logger from "../utils/logger";

/**
 * Scheduler to process pending Facebook conversion events
 * Runs every minute to check for pending events and add them to the queue
 */
let isConversionSchedulerRunning = false;

async function facebookConversionScheduler() {
    if (isConversionSchedulerRunning) {
        return;
    }

    isConversionSchedulerRunning = true;

    try {
        const FacebookConversionEvent = require("../models/FacebookConversionEvent").default;

        // Check if there are pending events
        const pendingCount = await FacebookConversionEvent.count({
            where: {
                responseStatus: "pending"
            }
        });

        if (pendingCount > 0) {
            logger.info(`📤 [FB-CONVERSION-SCHEDULER] ${pendingCount} eventos pendientes encontrados, añadiendo a cola...`);

            // Add job to queue to process pending events
            const facebookConversionQueue = new Bull("FacebookConversionQueue", REDIS_URI_CONNECTION);

            await facebookConversionQueue.add(
                {
                    batchSize: 100 // Process up to 100 events at a time
                },
                {
                    priority: 3,
                    removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
                    removeOnFail: { age: 7 * 24 * 60 * 60, count: 100 }
                }
            );

            logger.info(`✅ [FB-CONVERSION-SCHEDULER] Job añadido a la cola`);
        }
    } catch (error: any) {
        logger.error(`❌ [FB-CONVERSION-SCHEDULER] Error: ${error.message}`);
    } finally {
        isConversionSchedulerRunning = false;
    }
}

/**
 * Start the Facebook Conversion scheduler
 * This should be called from worker.ts
 */
export function startFacebookConversionScheduler(): void {
    logger.info("🕐 [FB-CONVERSION-SCHEDULER] Iniciando scheduler de conversiones de Facebook...");

    // Run immediately on start
    facebookConversionScheduler();

    // Run every minute
    const schedulerInterval = setInterval(() => {
        facebookConversionScheduler();
    }, 1 * 60 * 1000); // 1 minute

    logger.info("✅ [FB-CONVERSION-SCHEDULER] Scheduler configurado para ejecutar cada 1 minuto");

    // Cleanup on shutdown
    process.on("SIGTERM", () => {
        logger.info("🔄 [FB-CONVERSION-SCHEDULER] Cerrando scheduler...");
        clearInterval(schedulerInterval);
    });

    process.on("SIGINT", () => {
        logger.info("🔄 [FB-CONVERSION-SCHEDULER] Cerrando scheduler...");
        clearInterval(schedulerInterval);
    });
}
