import { Request, Response } from "express";
import crypto from "crypto";
import axios from "axios";
import SendConversionEvent from "../services/FacebookConversionService/SendConversionEvent";
import RegisterSaleService from "../services/FacebookConversionService/RegisterSaleService"; // [Fase2·B5.1]
import SendAllPendingConversionsService from "../services/FacebookConversionService/SendAllPendingConversionsService";
import TrackEventService, { TRACKABLE_EVENTS } from "../services/FacebookConversionService/TrackEventService";
import SyncDatasets, { SyncDatasetForConnection } from "../services/FacebookConversionService/SyncDatasets";
import { getSignalMonitor } from "../services/FacebookConversionService/MetaSignalMonitorService"; // [Fase2·A4.1/B6.1]
import FacebookConversionEvent from "../models/FacebookConversionEvent";
import FacebookDataset from "../models/FacebookDataset";
import CampaignMessage from "../models/CampaignMessage";
import AppError from "../errors/AppError";
import { Op } from "sequelize";
import {
    getCompanyMetaConversionPolicies,
    isMetaConversionEventKey,
    META_CONVERSION_POLICY_ADMIN_COMPANY_IDS,
    MetaConversionEventKey,
    upsertCompanyMetaConversionPolicy
} from "../services/FacebookConversionService/MetaConversionPolicyService";

const CHATEAM_INTERNAL_POLICY_KEYS = new Set<MetaConversionEventKey>([
    "complete_registration",
    "start_trial",
    "login"
]);

const extractError = (
    err: unknown
): { message: string; statusCode: number } => {
    if (err instanceof AppError) {
        return { message: err.message, statusCode: err.statusCode };
    }
    if (err && typeof err === "object" && "message" in (err as any)) {
        return {
            message: String((err as any).message) || "Error interno",
            statusCode: 500
        };
    }
    return { message: "Error interno", statusCode: 500 };
};

const resolveAllowedPolicyCompanyId = (
    req: Request,
    requestedCompanyId?: number
): number => {
    const requestUser = req.user as { companyId: number; profile?: string; super?: boolean };
    const userCompanyId = Number(requestUser.companyId);
    const targetCompanyId = Number(requestedCompanyId || userCompanyId);
    const isSuperUser = requestUser.super === true || requestUser.profile === "superadmin";

    if (!targetCompanyId) {
        throw new AppError("companyId requerido", 400);
    }

    if (!isSuperUser && targetCompanyId !== userCompanyId) {
        throw new AppError("No puedes modificar políticas de otra empresa", 403);
    }

    return targetCompanyId;
};

const assertCanManagePolicyEvent = (
    companyId: number,
    eventKey: MetaConversionEventKey
): void => {
    if (
        CHATEAM_INTERNAL_POLICY_KEYS.has(eventKey) &&
        !META_CONVERSION_POLICY_ADMIN_COMPANY_IDS.includes(companyId)
    ) {
        throw new AppError(
            "Esta conversion es interna de Chateam y solo puede administrarse en empresas autorizadas",
            403
        );
    }
};

// [Fase2·B5.1] Registrar manualmente el monto de venta de un ticket → AttributionConversion.
export const registerSale = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { companyId } = req.user;
        const { ticketId, amount, currency, orderId } = req.body;
        const conv = await RegisterSaleService({
            companyId,
            ticketId: Number(ticketId),
            amount: Number(amount),
            currency,
            orderId
        });
        return res.status(200).json({ ok: true, conversionId: conv.id, totalRevenue: conv.totalRevenue });
    } catch (e: any) {
        return res.status(e.statusCode || 500).json({ error: e.message });
    }
};

export const getConversionPolicies = async (req: Request, res: Response): Promise<Response> => {
    try {
        const requestedCompanyId = resolveAllowedPolicyCompanyId(
            req,
            req.query.companyId ? Number(req.query.companyId) : undefined
        );

        const policies = await getCompanyMetaConversionPolicies(requestedCompanyId);

        return res.json({
            companyId: requestedCompanyId,
            policies
        });
    } catch (error: any) {
        const { message, statusCode } = extractError(error);
        return res.status(statusCode).json({ error: message });
    }
};

export const upsertConversionPolicy = async (req: Request, res: Response): Promise<Response> => {
    try {
        const {
            companyId,
            eventKey,
            enabled,
            conversionName,
            notes,
            metadata
        } = req.body;

        const targetCompanyId = resolveAllowedPolicyCompanyId(
            req,
            companyId ? Number(companyId) : undefined
        );

        if (!eventKey || !isMetaConversionEventKey(String(eventKey))) {
            return res.status(400).json({
                error: "eventKey inválido",
                allowed: [
                    "purchase",
                    "complete_registration",
                    "start_trial",
                    "login",
                    "website_lead",
                    "campaign_message_lead",
                    "kanban_legacy_lead",
                    "kanban_custom_conversion"
                ]
            });
        }

        if (typeof enabled !== "boolean") {
            return res.status(400).json({ error: "enabled debe ser boolean" });
        }

        assertCanManagePolicyEvent(targetCompanyId, eventKey);

        const setting = await upsertCompanyMetaConversionPolicy({
            companyId: targetCompanyId,
            eventKey,
            enabled,
            conversionName,
            notes,
            metadata
        });

        return res.json({
            success: true,
            setting
        });
    } catch (error: any) {
        const { message, statusCode } = extractError(error);
        return res.status(statusCode).json({ error: message });
    }
};

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

// Enviar TODAS las conversiones Purchase pendientes (con valor) de la empresa en un solo lote.
// ?dryRun=true → NO envía, solo devuelve el conteo (para el modal de confirmación del frontend).
export const sendAllPending = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { companyId } = req.user;
        const dryRun = String(req.query.dryRun ?? (req.body && req.body.dryRun) ?? "") === "true";
        const result = await SendAllPendingConversionsService({ companyId, dryRun });
        return res.status(200).json({ success: true, ...result });
    } catch (error: any) {
        console.error("Error in sendAllPending:", error);
        return res.status(500).json({
            error: error.message || "Error enviando conversiones pendientes"
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
        const companyId = req.user?.companyId;

        console.log(`🔄 [syncDatasets Controller] Usuario autenticado:`, JSON.stringify(req.user, null, 2));
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

        // Mejorar respuesta: indicar si realmente se creó algo
        const response: any = {
            success: true,
            companyId,
            ...result
        };

        // Warning si no se creó ni sincronizó nada
        if (result.created === 0 && result.synced === 0) {
            response.success = true; // Mantener true pero agregar warning
            response.warning = "No se encontró ninguna conexión social activa para sincronizar. Verifica que tengas conexiones Facebook, Instagram, WhatsApp o Meta activas.";
            response.details = {
                message: "El dataset no se creó porque no hay conexiones con los canales soportados",
                supportedChannels: ["facebook", "instagram", "whatsapp", "meta"],
                errors: result.errors
            };
            console.log(`⚠️ [syncDatasets Controller] Company ${companyId}: No se encontraron conexiones sociales para crear datasets`);
        }

        return res.status(200).json(response);
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
        const { datasetName } = req.body || {};

        const dataset = await SyncDatasetForConnection(
            companyId,
            parseInt(whatsappId),
            {
                mode: "auto",
                datasetName
            }
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

/**
 * Endpoint unificado de tracking — usado por la UI nueva.
 * Body:
 *   {
 *     campaignMessageId?: number,
 *     contactId?: number,
 *     whatsappId?: number,
 *     messageId?: number,
 *     ctwaClid?: string,
 *     eventName: "CompleteRegistration" | "StartTrial" | "Purchase" | "Login",
 *     customData?: object,
 *     eventId?: string,
 *     testEventCode?: string
 *   }
 */
export const trackEvent = async (
    req: Request,
    res: Response
): Promise<Response> => {
    try {
        const { companyId } = req.user;
        const {
            campaignMessageId,
            contactId,
            whatsappId,
            messageId,
            ctwaClid,
            eventName,
            customData,
            eventId,
            testEventCode
        } = req.body || {};

        if (!companyId) {
            return res.status(400).json({ error: "companyId no disponible en token" });
        }

        const result = await TrackEventService({
            companyId,
            campaignMessageId,
            contactId,
            whatsappId,
            messageId,
            ctwaClid,
            eventName,
            customData,
            eventId,
            testEventCode
        });

        return res.status(200).json({
            success: true,
            deduped: result.deduped,
            event: result.event,
            message: result.deduped
                ? `Evento ${eventName} ya fue enviado previamente (idempotencia)`
                : `Evento ${eventName} enviado correctamente`
        });
    } catch (err) {
        const { message, statusCode } = extractError(err);
        console.error(`Error en trackEvent: ${message}`);
        return res.status(statusCode).json({ error: message });
    }
};

/**
 * Devuelve el estado de envío de eventos trackeables para un set de
 * campaignMessageId o contactId.
 * Query: ?campaignMessageIds=1,2,3  |  ?contactIds=10,20,30
 * Response: { tracked: { [contactId]: { CompleteRegistration: 'success', ... } } }
 */
export const getTrackedEvents = async (
    req: Request,
    res: Response
): Promise<Response> => {
    try {
        const { companyId } = req.user;
        const { campaignMessageIds, contactIds } = req.query as any;

        const parseIds = (v: any): number[] => {
            if (!v) return [];
            if (Array.isArray(v)) return v.map(Number).filter(Boolean);
            return String(v)
                .split(",")
                .map(s => Number(s.trim()))
                .filter(Boolean);
        };

        const cmIds = parseIds(campaignMessageIds);
        let cIds = parseIds(contactIds);

        // Resolver contactIds desde campaignMessages si vinieron
        if (cmIds.length) {
            const cms = await CampaignMessage.findAll({
                where: { id: { [Op.in]: cmIds }, companyId },
                attributes: ["id", "contactId"]
            });
            cIds = [...new Set([...cIds, ...cms.map(c => c.contactId)])];
        }

        if (!cIds.length) {
            return res.status(200).json({ tracked: {} });
        }

        const events = await FacebookConversionEvent.findAll({
            where: {
                companyId,
                contactId: { [Op.in]: cIds },
                eventName: { [Op.in]: TRACKABLE_EVENTS as any },
                responseStatus: { [Op.in]: ["success", "sent", "pending"] }
            },
            attributes: [
                "id",
                "contactId",
                "eventName",
                "responseStatus",
                "ctwaClid",
                "sentAt",
                "createdAt"
            ],
            order: [["createdAt", "DESC"]]
        });

        const tracked: Record<
            number,
            Record<string, { status: string; sentAt: Date | null; eventId: number }>
        > = {};

        for (const ev of events) {
            const cId = ev.contactId;
            if (!tracked[cId]) tracked[cId] = {};
            // Conservar solo el más reciente por (contactId, eventName)
            if (!tracked[cId][ev.eventName]) {
                tracked[cId][ev.eventName] = {
                    status: ev.responseStatus,
                    sentAt: ev.sentAt || null,
                    eventId: ev.id
                };
            }
        }

        return res.status(200).json({ tracked });
    } catch (err) {
        const { message, statusCode } = extractError(err);
        console.error(`Error en getTrackedEvents: ${message}`);
        return res.status(statusCode).json({ error: message });
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

/**
 * [Fase2·A4.1/B6.1] Monitor de senales: semaforo de salud (token/dataset/webhook/
 * calidad del numero) + eventos enviados/aceptados/rechazados por dia + EMQ de Meta.
 *
 * companyId SIEMPRE del token. El override por query solo para super, que es el
 * unico caso legitimo de mirar otra empresa (mismo patron que SettingController).
 */
export const signalMonitor = async (req: Request, res: Response): Promise<Response> => {
    try {
        if (!req.user?.companyId) {
            return res.status(401).json({ error: "No autenticado" });
        }

        let companyId = req.user.companyId;
        const isSuper = req.user?.super === true;
        const requested = req.query.companyId ? Number(req.query.companyId) : undefined;
        if (isSuper && requested && Number.isFinite(requested)) {
            companyId = requested;
        }

        const days = req.query.days ? Number(req.query.days) : 14;
        const monitor = await getSignalMonitor(companyId, days);

        return res.status(200).json(monitor);
    } catch (error: any) {
        console.error("Error in signalMonitor:", error);
        return res.status(500).json({ error: error.message || "Failed to build signal monitor" });
    }
};

/**
 * [Diagnóstico appsecret_proof] Verifica, SIN exponer el secret, si el appSecret
 * guardado corresponde a la app que emitió el token — condición para activar
 * appsecret_proof. Hace UNA llamada /me con la firma calculada; si Meta la acepta,
 * el secret es de la app del token. Solo super.
 */
export const appSecretDiagnostic = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (req.user?.super !== true) {
      return res.status(403).json({ success: false, message: "Solo super" });
    }
    const companyId = req.query.companyId ? Number(req.query.companyId) : req.user.companyId;

    const Company = (await import("../models/Company")).default;
    const CompaniesSettings = (await import("../models/CompaniesSettings")).default;
    const Whatsapp = (await import("../models/Whatsapp")).default;

    const company = await Company.findByPk(companyId);
    const settings = await CompaniesSettings.findOne({ where: { companyId } as any });
    const storedAppId = (company as any)?.facebookAppId || settings?.facebookAppId || null;
    const storedSecret = (company as any)?.facebookAppSecret || settings?.facebookAppSecret || null;

    // Token: system user o el de una conexión.
    let token = settings?.facebookSystemUserToken || null;
    if (!token) {
      const conn = await Whatsapp.findOne({ where: { companyId } as any, order: [["isDefault", "DESC"], ["id", "ASC"]] });
      token = (conn as any)?.tokenMeta || null;
    }
    if (!token) return res.status(400).json({ success: false, message: "Sin token de Meta para diagnosticar" });
    if (!storedSecret) return res.status(400).json({ success: false, message: "Sin appSecret guardado" });

    const v = process.env.FB_GRAPH_VERSION || "v24.0";

    // App real que emitió el token.
    let tokenApp: string | null = null;
    try {
      const { data } = await axios.get(`https://graph.facebook.com/${v}/debug_token`, {
        params: { input_token: token, access_token: token }, timeout: 8000
      });
      tokenApp = data?.data?.app_id ? String(data.data.app_id) : null;
    } catch { /* seguimos */ }

    // Probar la firma con el secret guardado (prueba real contra Meta, no destructiva).
    const proof = crypto.createHmac("sha256", storedSecret).update(token).digest("hex");
    let proofValid = false, metaError: string | null = null;
    try {
      await axios.get(`https://graph.facebook.com/${v}/me`, {
        params: { access_token: token, appsecret_proof: proof }, timeout: 8000
      });
      proofValid = true;
    } catch (err: any) {
      metaError = err?.response?.data?.error?.message || err?.message || "error";
    }

    const appIdMatchesToken = tokenApp && storedAppId && String(tokenApp) === String(storedAppId);
    let recommendation: string;
    if (proofValid && appIdMatchesToken) {
      recommendation = "Todo alineado: appId y secret son de la app del token. appsecret_proof se puede activar (o ya funciona).";
    } else if (proofValid && !appIdMatchesToken) {
      recommendation = `El SECRET guardado SÍ es de la app del token (${tokenApp}), pero el appId guardado (${storedAppId}) NO. Fix barato: corrige SOLO el appId a ${tokenApp} — el secret ya está bien.`;
    } else {
      recommendation = `El secret guardado NO es de la app del token (${tokenApp}). Fix: pon appId=${tokenApp} y su appSecret real, O regenera el token desde la app ${storedAppId} (cuyo secret está guardado).`;
    }

    return res.status(200).json({
      success: true, storedAppId, tokenApp,
      secretMatchesTokenApp: proofValid, appIdMatchesTokenApp: !!appIdMatchesToken,
      metaError, recommendation
      // NB: el secret nunca se devuelve.
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
