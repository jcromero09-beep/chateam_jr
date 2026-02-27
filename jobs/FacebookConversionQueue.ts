import { Job } from "bull";
import FacebookConversionEvent from "../models/FacebookConversionEvent";
import FacebookDataset from "../models/FacebookDataset";
import { MetaMarketing } from "../meta-marketing/src";
import { ConversionEvent } from "../meta-marketing/src/types";
import Whatsapp from "../models/Whatsapp";
import logger, { logError, logInfo, logWarn, logDebug } from "../utils/logger";
import { Op } from "sequelize";

/**
 * Background job to process pending Facebook conversion events in batches
 * This job runs periodically to send events that are in "pending" status
 */
export default async function FacebookConversionQueue(job: Job): Promise<void> {
    const { batchSize = 100 } = job.data;

    logInfo(`📤 [FB-CONVERSIONS] Iniciando procesamiento de eventos pendientes (batch size: ${batchSize})`);

    try {
        // 1. Get pending events (limit by batchSize, max 1000 due to Facebook API limits)
        const limit = Math.min(batchSize, 1000);

        const pendingEvents = await FacebookConversionEvent.findAll({
            where: {
                responseStatus: "pending"
            },
            limit,
            order: [["createdAt", "ASC"]],
            include: ["contact", "whatsapp"]
        });

        if (pendingEvents.length === 0) {
            logInfo("😴 [FB-CONVERSIONS] No hay eventos pendientes para procesar");
            return;
        }

        logInfo(`📊 [FB-CONVERSIONS] Encontrados ${pendingEvents.length} eventos pendientes`);

        // 2. Group events by dataset ID (Facebook requires same dataset per request)
        const eventsByDataset: Map<string, FacebookConversionEvent[]> = new Map();

        for (const event of pendingEvents) {
            const datasetId = event.datasetId;
            if (!eventsByDataset.has(datasetId)) {
                eventsByDataset.set(datasetId, []);
            }
            eventsByDataset.get(datasetId)!.push(event);
        }

        logInfo(`📦 [FB-CONVERSIONS] Eventos agrupados en ${eventsByDataset.size} datasets diferentes`);

        // 3. Process each dataset's events
        let totalSent = 0;
        let totalFailed = 0;

        for (const [datasetId, events] of eventsByDataset.entries()) {
            logInfo(`🎯 [FB-CONVERSIONS] Procesando ${events.length} eventos para dataset ${datasetId}`);

            // Get dataset to find the connection and its token
            const dataset = await FacebookDataset.findOne({
                where: { datasetId },
                include: [{ model: Whatsapp, as: "whatsapp" }]
            });

            let accessToken: string;
            if (dataset?.whatsapp?.tokenMeta &&
                (dataset.whatsapp.channel === "whatsapp" || dataset.whatsapp.channel === "meta")) {
                accessToken = dataset.whatsapp.tokenMeta;
            } else {
                accessToken = process.env.FACEBOOK_ACCESS_TOKEN || "";
            }

            if (!accessToken) {
                logError(`❌ [FB-CONVERSIONS] No access token for dataset ${datasetId}`);
                // mark events as failed and continue
                const eventIds = events.map(e => e.id);
                await FacebookConversionEvent.update(
                    { responseStatus: "failed", errorMessage: "No access token configured", sentAt: new Date() },
                    { where: { id: { [Op.in]: eventIds } } }
                );
                totalFailed += events.length;
                continue;
            }

            const metaClient = new MetaMarketing({
                accessToken,
                apiVersion: process.env.FACEBOOK_CONVERSIONS_API_VERSION || "v24.0"
            });

            // Convert database events to Facebook Conversions API format
            const conversionEvents: ConversionEvent[] = events.map(event => ({
                event_name: event.eventName,
                event_time: event.eventTime,
                event_id: event.facebookEventId,
                event_source_url: event.eventSourceUrl || undefined,
                user_data: event.userData as any,
                custom_data: event.customData as any,
                action_source: event.actionSource as any,
                messaging_channel: event.messagingChannel as any,
                ctwa_clid: event.ctwaClid || undefined
            }));

            try {
                // Send batch to Facebook
                const response = await metaClient.conversions.sendBatchEvents(
                    datasetId,
                    conversionEvents
                );

                logInfo(`✅ [FB-CONVERSIONS] Batch enviado exitosamente: ${response.events_received} eventos recibidos por Facebook`);
                logInfo(`🔍 [FB-CONVERSIONS] FB Trace ID: ${response.fbtrace_id}`);

                // Update all events in this batch as successful
                const eventIds = events.map(e => e.id);
                await FacebookConversionEvent.update(
                    {
                        responseStatus: "success",
                        fbResponse: response as any,
                        sentAt: new Date()
                    },
                    {
                        where: {
                            id: { [Op.in]: eventIds }
                        }
                    }
                );

                totalSent += events.length;
                logInfo(`📈 [FB-CONVERSIONS] ${events.length} eventos marcados como exitosos`);

            } catch (error: any) {
                logError(`❌ [FB-CONVERSIONS] Error enviando batch para dataset ${datasetId}: ${error.message}`);

                // Update all events in this batch as failed
                const eventIds = events.map(e => e.id);
                await FacebookConversionEvent.update(
                    {
                        responseStatus: "failed",
                        errorMessage: error.message,
                        fbResponse: error.response?.data || null,
                        sentAt: new Date()
                    },
                    {
                        where: {
                            id: { [Op.in]: eventIds }
                        }
                    }
                );

                totalFailed += events.length;
                logError(`📉 [FB-CONVERSIONS] ${events.length} eventos marcados como fallidos`);
            }
        }

        logInfo(`🎉 [FB-CONVERSIONS] Procesamiento completado: ${totalSent} exitosos, ${totalFailed} fallidos`);

    } catch (error: any) {
        logError(`❌ [FB-CONVERSIONS] Error en FacebookConversionQueue: ${error.message}`);
        throw error;
    }
}

/**
 * Helper function to add conversion event job to the queue
 * This can be called from anywhere in the application
 */
export async function enqueueConversionEvent(eventId: number): Promise<void> {
    const { add } = require("../queues");

    await add("FacebookConversionQueue", {
        eventId
    }, {
        priority: 3,
        removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 100 }
    });
}

