import { Op, literal } from "sequelize";
import SendConversionEvent from "./SendConversionEvent";
import FacebookConversionEvent from "../../models/FacebookConversionEvent";
import FacebookDataset from "../../models/FacebookDataset";
import CampaignMessage from "../../models/CampaignMessage";
import Contact from "../../models/Contact";
import AppError from "../../errors/AppError";

/**
 * Eventos soportados por la capa de tracking de alto nivel.
 * SendConversionEvent.ts sigue aceptando cualquier string para no romper
 * usos legacy (ej. "Contact", "Lead").
 */
export type TrackableEventName =
    | "CompleteRegistration"
    | "StartTrial"
    | "Purchase"
    | "Login";

const TRACKABLE_EVENTS: TrackableEventName[] = [
    "CompleteRegistration",
    "StartTrial",
    "Purchase",
    "Login"
];

interface TrackEventRequest {
    companyId: number;
    eventName: TrackableEventName | string;
    campaignMessageId?: number;
    contactId?: number;
    whatsappId?: number;
    messageId?: number;
    ctwaClid?: string;
    customData?: Record<string, any>;
    /** event_id manual; si no se envía se calcula uno estable. */
    eventId?: string;
    testEventCode?: string;
}

interface ResolvedContext {
    companyId: number;
    contactId: number;
    whatsappId: number;
    messageId?: number;
    ctwaClid?: string;
    campaignMessageId?: number;
}

/**
 * Resuelve contactId/whatsappId/messageId/ctwaClid desde un CampaignMessage,
 * o desde los parámetros directos. Valida multi-tenant (companyId).
 */
const resolveContext = async (
    req: TrackEventRequest
): Promise<ResolvedContext> => {
    const { companyId, campaignMessageId } = req;

    let contactId = req.contactId;
    let whatsappId = req.whatsappId;
    let messageId = req.messageId;
    let ctwaClid = req.ctwaClid;

    if (campaignMessageId) {
        const cm = await CampaignMessage.findOne({
            where: { id: campaignMessageId, companyId }
        });

        if (!cm) {
            throw new AppError(
                `CampaignMessage ${campaignMessageId} no encontrado para esta company`,
                404
            );
        }

        contactId = contactId || cm.contactId;
        whatsappId = whatsappId || cm.whatsappId;
        messageId = messageId || cm.messageId;
        ctwaClid = ctwaClid || cm.ctwaClid;
    }

    if (!contactId) {
        throw new AppError("contactId es requerido (directo o vía campaignMessageId)", 400);
    }
    if (!whatsappId) {
        throw new AppError("whatsappId es requerido (directo o vía campaignMessageId)", 400);
    }

    // Multi-tenant: confirmar que el contacto pertenece a la company
    const contact = await Contact.findOne({
        where: { id: contactId, companyId }
    });
    if (!contact) {
        throw new AppError(
            `Contact ${contactId} no encontrado para esta company`,
            404
        );
    }

    return {
        companyId,
        contactId,
        whatsappId,
        messageId: messageId || undefined,
        ctwaClid: ctwaClid || undefined,
        campaignMessageId: campaignMessageId || undefined
    };
};

/**
 * Verifica que exista un FacebookDataset activo antes de enviar.
 */
const ensureActiveDataset = async (
    companyId: number,
    whatsappId: number
): Promise<void> => {
    const dataset = await FacebookDataset.findOne({
        where: { companyId, whatsappId, status: "active" }
    });
    if (!dataset) {
        throw new AppError(
            `No hay FacebookDataset activo para companyId ${companyId} / whatsappId ${whatsappId}. ` +
                `Sincroniza datasets primero.`,
            409
        );
    }
};

/**
 * Construye un event_id estable e idempotente según el tipo de evento.
 * Reglas:
 *  - Purchase: purchase_<orderId> | purchase_cm_<campaignMessageId> | purchase_c_<contactId>_<ts>
 *  - CompleteRegistration: registration_<contactId> | registration_cm_<campaignMessageId>
 *  - StartTrial: trial_<contactId> | trial_cm_<campaignMessageId>
 *  - Login: login_<contactId>_<ts>  (siempre único)
 */
const buildStableEventId = (
    eventName: string,
    ctx: ResolvedContext,
    customData: Record<string, any>
): string => {
    const orderId =
        customData?.order_id ||
        customData?.orderId ||
        customData?.invoice_number;

    switch (eventName) {
        case "Purchase":
            if (orderId) return `purchase_${orderId}`;
            if (ctx.campaignMessageId)
                return `purchase_cm_${ctx.campaignMessageId}`;
            return `purchase_c_${ctx.contactId}_${Math.floor(Date.now() / 1000)}`;

        case "CompleteRegistration":
            if (ctx.campaignMessageId)
                return `registration_cm_${ctx.campaignMessageId}`;
            return `registration_${ctx.contactId}`;

        case "StartTrial":
            if (ctx.campaignMessageId)
                return `trial_cm_${ctx.campaignMessageId}`;
            return `trial_${ctx.contactId}`;

        case "Login":
        default:
            return `login_${ctx.contactId}_${Date.now()}`;
    }
};

/**
 * Valida customData según el evento y aplica defaults seguros.
 * - Purchase: exige value + currency
 * - StartTrial: setea defaults (value=0, currency, content_name)
 * - CompleteRegistration: setea defaults (status='completed', value=0, currency, content_name)
 * - Login: exige method
 */
const validateAndEnrichCustomData = (
    eventName: string,
    customData: Record<string, any> = {}
): Record<string, any> => {
    const data = { ...customData };

    switch (eventName) {
        case "Purchase": {
            if (data.value === undefined || data.value === null || data.value === "") {
                throw new AppError("Purchase requiere customData.value", 400);
            }
            const numericValue = Number(data.value);
            if (Number.isNaN(numericValue) || numericValue < 0) {
                throw new AppError("customData.value debe ser un número >= 0", 400);
            }
            data.value = numericValue;
            if (!data.currency) {
                throw new AppError("Purchase requiere customData.currency", 400);
            }
            data.currency = String(data.currency).toUpperCase();
            break;
        }

        case "StartTrial": {
            data.currency = data.currency ? String(data.currency).toUpperCase() : "USD";
            if (data.value === undefined || data.value === null) data.value = 0;
            data.value = Number(data.value);
            if (data.predicted_ltv !== undefined && data.predicted_ltv !== null) {
                data.predicted_ltv = Number(data.predicted_ltv);
            }
            if (!data.content_name) data.content_name = "Trial";
            break;
        }

        case "CompleteRegistration": {
            data.currency = data.currency ? String(data.currency).toUpperCase() : "USD";
            if (data.value === undefined || data.value === null) data.value = 0;
            data.value = Number(data.value);
            if (!data.status) data.status = "completed";
            if (!data.content_name) data.content_name = "Registration";
            break;
        }

        case "Login": {
            if (!data.method) {
                throw new AppError("Login requiere customData.method", 400);
            }
            data.method = String(data.method);
            break;
        }
    }

    return data;
};

/**
 * Verifica si ya existe un evento "success" equivalente para evitar duplicados.
 * Login NO se deduplica (puede enviarse N veces). Devuelve el evento existente
 * cuando aplica, null si se debe enviar.
 */
const findExistingSuccessEvent = async (
    eventName: string,
    ctx: ResolvedContext,
    customData: Record<string, any>
): Promise<FacebookConversionEvent | null> => {
    if (eventName === "Login") return null;

    const baseWhere: any = {
        companyId: ctx.companyId,
        contactId: ctx.contactId,
        eventName,
        responseStatus: { [Op.in]: ["success", "sent", "pending"] }
    };

    if (eventName === "Purchase") {
        const orderId =
            customData?.order_id ||
            customData?.orderId ||
            customData?.invoice_number;
        if (orderId) {
            // Postgres JSON query: customData->>'order_id' = orderId
            return await FacebookConversionEvent.findOne({
                where: {
                    ...baseWhere,
                    [Op.and]: literal(
                        `("customData"->>'order_id' = ${FacebookConversionEvent.sequelize!.escape(
                            String(orderId)
                        )})`
                    )
                }
            });
        }
        // Sin order_id: deduplicar por ctwaClid si existe, sino por contact+event reciente (24h)
        if (ctx.ctwaClid) {
            return await FacebookConversionEvent.findOne({
                where: { ...baseWhere, ctwaClid: ctx.ctwaClid }
            });
        }
        return null;
    }

    // CompleteRegistration / StartTrial: una vez por contacto (+ ctwaClid si existe)
    if (ctx.ctwaClid) {
        return await FacebookConversionEvent.findOne({
            where: { ...baseWhere, ctwaClid: ctx.ctwaClid }
        });
    }
    return await FacebookConversionEvent.findOne({ where: baseWhere });
};

/**
 * Servicio principal: orquesta el envío de un evento Meta Conversions API.
 * Maneja resolución de contexto, validación, idempotencia y persistencia.
 */
const TrackEventService = async (
    req: TrackEventRequest
): Promise<{
    event: FacebookConversionEvent;
    deduped: boolean;
}> => {
    if (!req.companyId) {
        throw new AppError("companyId es requerido", 400);
    }
    if (!req.eventName) {
        throw new AppError("eventName es requerido", 400);
    }

    if (!TRACKABLE_EVENTS.includes(req.eventName as TrackableEventName)) {
        throw new AppError(
            `eventName "${req.eventName}" no soportado. Valores permitidos: ${TRACKABLE_EVENTS.join(", ")}`,
            400
        );
    }

    // 1. Resolver contexto (contactId, whatsappId, ctwaClid, messageId)
    const ctx = await resolveContext(req);

    // 2. Validar dataset activo
    await ensureActiveDataset(ctx.companyId, ctx.whatsappId);

    // 3. Validar y enriquecer customData
    const customData = validateAndEnrichCustomData(req.eventName, req.customData);

    // 4. Idempotencia: chequear duplicado
    const existing = await findExistingSuccessEvent(req.eventName, ctx, customData);
    if (existing) {
        return { event: existing, deduped: true };
    }

    // 5. Calcular event_id estable
    const stableEventId =
        req.eventId || buildStableEventId(req.eventName, ctx, customData);

    // 6. Delegar al servicio existente
    const event = await SendConversionEvent({
        companyId: ctx.companyId,
        whatsappId: ctx.whatsappId,
        eventName: req.eventName,
        contactId: ctx.contactId,
        messageId: ctx.messageId,
        ctwaClid: ctx.ctwaClid,
        customData,
        testEventCode: req.testEventCode,
        eventId: stableEventId
    });

    return { event, deduped: false };
};

export default TrackEventService;
export { TRACKABLE_EVENTS };
