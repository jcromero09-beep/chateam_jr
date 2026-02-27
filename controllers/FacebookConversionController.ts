import { Request, Response } from "express";
import SendConversionEvent from "../services/FacebookConversionService/SendConversionEvent";
import SyncDatasets, { SyncDatasetForConnection } from "../services/FacebookConversionService/SyncDatasets";
import FacebookConversionEvent from "../models/FacebookConversionEvent";
import FacebookDataset from "../models/FacebookDataset";
import { Op } from "sequelize";

// Send a test or manual conversion event
export const sendConversion = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { companyId } = req.user;
        const {
            whatsappId,
            eventName,
            contactId,
            messageId,
            campaignId,
            ctwaClid,
            customData
        } = req.body;

        // Validate required fields
        if (!companyId || !whatsappId || !eventName || !contactId) {
            return res.status(400).json({
                error: "Missing required fields: whatsappId, eventName, contactId"
            });
        }

        // Build customData: use nested object from frontend, apply defaults
        const resolvedCustomData = customData || {};

        // For Purchase events, ensure currency is set
        if (eventName === "Purchase" && resolvedCustomData.value && !resolvedCustomData.currency) {
            resolvedCustomData.currency = "USD";
        }

        const event = await SendConversionEvent({
            companyId,
            whatsappId,
            eventName,
            contactId,
            messageId,
            campaignId,
            ctwaClid,
            customData: resolvedCustomData
        });

        return res.status(200).json({
            success: true,
            event
        });
    } catch (error: any) {
        console.error("Error in sendConversion:", error);
        return res.status(500).json({
            error: error.message || "Failed to send conversion event"
        });
    }
};

// Send a test conversion event with test_event_code
export const sendTestConversion = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { companyId } = req.user;
        const {
            whatsappId,
            eventName,
            contactId,
            testEventCode
        } = req.body;

        if (!companyId || !whatsappId || !eventName || !contactId || !testEventCode) {
            return res.status(400).json({
                error: "Missing required fields: whatsappId, eventName, contactId, testEventCode"
            });
        }

        // For testing, we'll use the SendConversionEvent but could extend to use test_event_code
        const event = await SendConversionEvent({
            companyId,
            whatsappId,
            eventName,
            contactId
        });

        return res.status(200).json({
            success: true,
            event,
            message: "Test event sent. Check Facebook Events Manager Test Events tab"
        });
    } catch (error: any) {
        console.error("Error in sendTestConversion:", error);
        return res.status(500).json({
            error: error.message || "Failed to send test conversion event"
        });
    }
};

// Get conversion events for a company
export const getConversionEvents = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { companyId } = req.user;
        const {
            status,
            whatsappId,
            eventName,
            limit = 50,
            offset = 0
        } = req.query;

        const where: any = { companyId };

        if (status) where.responseStatus = status;
        if (whatsappId) where.whatsappId = parseInt(whatsappId as string);
        if (eventName) where.eventName = eventName;

        const events = await FacebookConversionEvent.findAndCountAll({
            where,
            limit: parseInt(limit as string),
            offset: parseInt(offset as string),
            order: [["createdAt", "DESC"]],
            include: ["contact", "whatsapp", "campaign"]
        });

        return res.status(200).json({
            events: events.rows,
            total: events.count,
            limit: parseInt(limit as string),
            offset: parseInt(offset as string)
        });
    } catch (error: any) {
        console.error("Error in getConversionEvents:", error);
        return res.status(500).json({
            error: error.message || "Failed to get conversion events"
        });
    }
};

// Get conversion statistics
export const getConversionStats = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { companyId } = req.user;
        const { startDate, endDate } = req.query;

        const where: any = { companyId };

        if (startDate && endDate) {
            where.createdAt = {
                [Op.between]: [new Date(startDate as string), new Date(endDate as string)]
            };
        }

        // Get stats by event name
        const eventStats = await FacebookConversionEvent.findAll({
            where,
            attributes: [
                "eventName",
                "responseStatus",
                [FacebookConversionEvent.sequelize!.fn("COUNT", "*"), "count"]
            ],
            group: ["eventName", "responseStatus"]
        });

        // Get total counts
        const totalSent = await FacebookConversionEvent.count({
            where: {
                ...where,
                responseStatus: { [Op.in]: ["sent", "success"] }
            }
        });

        const totalFailed = await FacebookConversionEvent.count({
            where: {
                ...where,
                responseStatus: "failed"
            }
        });

        const totalPending = await FacebookConversionEvent.count({
            where: {
                ...where,
                responseStatus: "pending"
            }
        });

        return res.status(200).json({
            stats: eventStats,
            summary: {
                totalSent,
                totalFailed,
                totalPending,
                total: totalSent + totalFailed + totalPending
            }
        });
    } catch (error: any) {
        console.error("Error in getConversionStats:", error);
        return res.status(500).json({
            error: error.message || "Failed to get conversion stats"
        });
    }
};

// Sync datasets for the current user's company
export const syncDatasets = async (req: Request, res: Response): Promise<Response> => {
    try {
        // Get companyId from authenticated user
        const companyId = (req as any).user?.companyId;

        console.log(`🔄 [syncDatasets Controller] Usuario autenticado:`, JSON.stringify((req as any).user, null, 2));
        console.log(`🔄 [syncDatasets Controller] companyId extraído: ${companyId}`);

        if (!companyId) {
            console.error(`❌ [syncDatasets Controller] No se encontró companyId en req.user`);
            return res.status(400).json({
                error: "No company ID found for authenticated user"
            });
        }

        console.log(`🔄 [syncDatasets Controller] Llamando a SyncDatasets(${companyId})...`);

        // Only sync datasets for the user's company
        const result = await SyncDatasets(companyId);

        return res.status(200).json({
            success: true,
            companyId,
            ...result
        });
    } catch (error: any) {
        console.error("Error in syncDatasets:", error);
        return res.status(500).json({
            error: error.message || "Failed to sync datasets"
        });
    }
};

// Sync dataset for specific connection (Facebook/Instagram/WhatsApp)
export const syncDatasetForConnection = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { companyId } = req.user;
        const { whatsappId } = req.params;

        const dataset = await SyncDatasetForConnection(
            companyId,
            parseInt(whatsappId)
        );

        return res.status(200).json({
            success: true,
            dataset,
            message: `Dataset synced successfully for connection ${whatsappId}`
        });
    } catch (error: any) {
        console.error("Error in syncDatasetForConnection:", error);
        return res.status(500).json({
            error: error.message || "Failed to sync dataset for connection"
        });
    }
};

// Retry failed events
export const retryFailedEvents = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { companyId } = req.user;
        const { eventIds } = req.body; // Array of event IDs to retry

        if (!eventIds || !Array.isArray(eventIds)) {
            return res.status(400).json({
                error: "eventIds array is required"
            });
        }

        const events = await FacebookConversionEvent.findAll({
            where: {
                id: { [Op.in]: eventIds },
                companyId,
                responseStatus: "failed"
            }
        });

        const results = [];

        for (const event of events) {
            try {
                // Re-send the event
                await SendConversionEvent({
                    companyId: event.companyId,
                    whatsappId: event.whatsappId!,
                    eventName: event.eventName as any,
                    contactId: event.contactId!,
                    messageId: event.messageId || undefined,
                    campaignId: event.campaignId || undefined,
                    ctwaClid: event.ctwaClid || undefined,
                    customData: event.customData as any
                });

                results.push({ eventId: event.id, success: true });
            } catch (error: any) {
                results.push({
                    eventId: event.id,
                    success: false,
                    error: error.message
                });
            }
        }

        return res.status(200).json({
            results,
            totalRetried: eventIds.length,
            successCount: results.filter(r => r.success).length,
            failedCount: results.filter(r => !r.success).length
        });
    } catch (error: any) {
        console.error("Error in retryFailedEvents:", error);
        return res.status(500).json({
            error: error.message || "Failed to retry events"
        });
    }
};

// Get datasets for a company
export const getDatasets = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { companyId } = req.user;

        const datasets = await FacebookDataset.findAll({
            where: { companyId },
            include: ["whatsapp", "company"]
        });

        return res.status(200).json({
            datasets
        });
    } catch (error: any) {
        console.error("Error in getDatasets:", error);
        return res.status(500).json({
            error: error.message || "Failed to get datasets"
        });
    }
};
