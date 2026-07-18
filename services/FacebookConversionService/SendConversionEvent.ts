import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import FacebookDataset from "../../models/FacebookDataset";
import { GRAPH_API_VERSION } from "../../config/metaGraph"; // [Fase2·A2.1] fuente única versión
import FacebookConversionEvent from "../../models/FacebookConversionEvent";
import CompaniesSettings from "../../models/CompaniesSettings";
import CampaignMessage from "../../models/CampaignMessage";
import { Op } from "sequelize";
import { MetaMarketing } from "../../meta-marketing/src";
import AppError from "../../errors/AppError";
import {
    getCompanyAccessToken,
    getMessagingChannel,
    getActionSource
} from "./FacebookAuthHelper";
import { resolveConversionDestination } from "./SendWebsiteEvent";
import {
    getEventKeyFromMetaEventName,
    shouldSendMetaConversion
} from "./MetaConversionPolicyService";

interface SendConversionEventData {
    companyId: number;
    whatsappId: number; // Connection ID (can be Facebook, Instagram, or WhatsApp)
    eventName: string;
    contactId: number;
    messageId?: number;
    campaignId?: number;
    ctwaClid?: string;
    customData?: any;
    testEventCode?: string;
    /**
     * Opcional. Si se provee, se utiliza como facebookEventId/event_id estable
     * para deduplicación en Meta Conversions API. Si no se provee, se genera
     * uno aleatorio (comportamiento legacy).
     */
    eventId?: string;
    /** Alias semántico de eventId — facebookEventId estable. */
    facebookEventId?: string;
}

const isLikelyMetaId = (value?: string | number | null): value is string | number => {
    if (value === undefined || value === null) return false;
    return /^\d{8,30}$/.test(String(value).trim());
};

const resolveWhatsappBusinessAccountId = (
    dataset: FacebookDataset,
    connection: Whatsapp
): { id?: string; source?: string } => {
    const candidates: Array<{ value?: string | number | null; source: string }> = [
        { value: dataset.channelIdentifier, source: "FacebookDatasets.channelIdentifier" },
        { value: dataset.channelSpecificId, source: "FacebookDatasets.channelSpecificId" },
        { value: connection.facebookUserId, source: "Whatsapps.facebookUserId" },
        { value: (dataset as any).whatsapp?.facebookUserId, source: "FacebookDatasets.whatsapp.facebookUserId" }
    ];

    const match = candidates.find(candidate => isLikelyMetaId(candidate.value));
    if (!match) return {};

    return { id: String(match.value).trim(), source: match.source };
};

const resolveBusinessMessagingPageId = async (companyId: number): Promise<string | undefined> => {
    const pageConnection = await Whatsapp.findOne({
        where: {
            companyId,
            channel: "facebook",
            status: "CONNECTED",
            facebookPageUserId: { [Op.ne]: null } as any
        },
        order: [["isDefault", "DESC"], ["id", "ASC"]]
    });

    return pageConnection?.facebookPageUserId || undefined;
};

const resolveCampaignMessage = async (params: {
    companyId: number;
    campaignId?: number;
    messageId?: number;
    contactId: number;
    ctwaClid?: string;
}): Promise<CampaignMessage | null> => {
    const { companyId, campaignId, messageId, contactId, ctwaClid } = params;

    if (campaignId) {
        const byId = await CampaignMessage.findOne({
            where: { id: campaignId, companyId }
        });
        if (byId) return byId;
    }

    const orConditions: any[] = [];
    if (messageId) orConditions.push({ messageId });
    if (ctwaClid) orConditions.push({ ctwaClid });
    if (contactId) orConditions.push({ contactId });

    if (!orConditions.length) return null;

    return CampaignMessage.findOne({
        where: {
            companyId,
            [Op.or]: orConditions,
            ...(ctwaClid ? { ctwaClid } : {})
        },
        order: [["createdAt", "DESC"]]
    });
};

const getCampaignSourceApp = (campaignMessage?: CampaignMessage | null): string | undefined => {
    const rawData = campaignMessage?.rawData as any;
    return rawData?.sourceApp ? String(rawData.sourceApp).toLowerCase() : undefined;
};

const getDefaultConversionName = (eventName: string): string => {
    switch (eventName) {
        case "Purchase":
            return "Venta";
        case "CompleteRegistration":
            return "Registro de cliente";
        case "StartTrial":
            return "Inicio de prueba";
        case "Login":
            return "Login";
        default:
            return eventName;
    }
};

const buildReadableCustomData = (params: {
    eventName: string;
    customData?: Record<string, any>;
    contact: Contact;
    connection: Whatsapp;
    campaignMessage?: CampaignMessage | null;
    policyConversionName?: string;
}): Record<string, any> => {
    const { eventName, customData, contact, connection, campaignMessage, policyConversionName } = params;
    const data: Record<string, any> = { ...(customData || {}) };

    delete data.ticket_id;
    delete data.company_id;
    delete data.contact_id;
    delete data.whatsapp_id;

    const conversionName =
        data.conversion_name ||
        data.kanban_tag_name ||
        campaignMessage?.headline ||
        policyConversionName ||
        getDefaultConversionName(eventName);

    return {
        ...data,
        conversion_name: conversionName,
        contact_name: contact.name || null,
        contact_number: contact.number || null,
        whatsapp_name: connection.name || null,
        whatsapp_number: connection.number || null,
        channel: data.channel || connection.channel || null
    };
};

/**
 * Send a conversion event to Facebook Conversions API
 * Supports WhatsApp, Facebook Messenger, and Instagram DM
 */
const SendConversionEvent = async (data: SendConversionEventData): Promise<FacebookConversionEvent> => {
    const {
        companyId,
        whatsappId,
        eventName,
        contactId,
        messageId,
        campaignId,
        ctwaClid,
        customData,
        testEventCode,
        eventId,
        facebookEventId: facebookEventIdInput
    } = data;

    const eventKey = getEventKeyFromMetaEventName(eventName);
    const policy = await shouldSendMetaConversion({ companyId, eventKey });
    if (!policy.enabled) {
        throw new AppError(
            `Conversión Meta desactivada para esta empresa: ${eventKey}`,
            400
        );
    }

    // 1. Get connection (can be Facebook, Instagram, or WhatsApp)
    const connection = await Whatsapp.findByPk(whatsappId);
    if (!connection) {
        throw new Error(`Connection ${whatsappId} not found`);
    }

    // 2. Get dataset for this connection. If there is no per-connection row,
    // fall back to the active company-level dataset. This lets one dataset/pixel
    // serve the whole company without duplicating rows (datasetId is unique).
    let dataset = await FacebookDataset.findOne({
        where: {
            companyId,
            whatsappId,
            status: "active"
        },
        include: [{ model: Whatsapp, as: "whatsapp" }]
    });

    if (!dataset) {
        dataset = await FacebookDataset.findOne({
            where: {
                companyId,
                status: "active"
            },
            include: [{ model: Whatsapp, as: "whatsapp" }],
            order: [["updatedAt", "DESC"]]
        });
    }

    // 3. Get contact information
    const contact = await Contact.findByPk(contactId);
    if (!contact) {
        throw new Error(`Contact ${contactId} not found`);
    }

    const fallbackDestination = !dataset
        ? await resolveConversionDestination(
            {
                userId: contactId,
                companyId,
                email: contact.email,
                phone: contact.number,
                name: contact.name
            },
            { conversionCompanyId: companyId }
        )
        : undefined;

    if (!dataset && !fallbackDestination) {
        throw new Error(
            `No active dataset found for companyId ${companyId}. ` +
            `Please sync datasets first.`
        );
    }

    const destinationId = dataset?.datasetId || fallbackDestination!.destinationId;
    const destinationSource = dataset
        ? `FacebookDatasets:${dataset.id}`
        : fallbackDestination!.source;

    if (!dataset && fallbackDestination) {
        console.log(
            `🔁 [SendConversionEvent] Sin FacebookDatasets activo; usando fallback ${destinationSource} (${destinationId})`
        );
    }

    const isWhatsAppBusinessMessaging =
        Boolean(ctwaClid) && (connection.channel === "whatsapp" || connection.channel === "meta");

    const resolvedWaba = isWhatsAppBusinessMessaging && dataset
        ? resolveWhatsappBusinessAccountId(dataset, connection)
        : {};
    const campaignMessage = isWhatsAppBusinessMessaging
        ? await resolveCampaignMessage({ companyId, campaignId, messageId, contactId, ctwaClid })
        : null;
    const campaignSourceApp = getCampaignSourceApp(campaignMessage);
    const shouldUsePageIdForCtwa = isWhatsAppBusinessMessaging && campaignSourceApp === "facebook";
    const resolvedPageId = shouldUsePageIdForCtwa
        ? await resolveBusinessMessagingPageId(companyId)
        : undefined;

    // 4. Get access token - usar tokenMeta/System User Token para WhatsApp/Meta
    let accessToken: string;
    const settings = await CompaniesSettings.findOne({ where: { companyId } });
    const datasetWhatsappToken = dataset ? (dataset as any).whatsapp?.tokenMeta : undefined;

    if (!dataset && fallbackDestination?.accessToken) {
        accessToken = fallbackDestination.accessToken;
        console.log(`🔑 [SendConversionEvent] Usando accessToken del fallback ${destinationSource}`);
    } else if (settings?.facebookSystemUserToken) {
        accessToken = settings.facebookSystemUserToken;
        console.log("🔑 [SendConversionEvent] Usando facebookSystemUserToken de CompaniesSettings");
    } else if ((connection.channel === "whatsapp" || connection.channel === "meta") && connection.tokenMeta) {
        // Respaldo legacy: usar tokenMeta solo si no hay token de sistema en la company.
        accessToken = connection.tokenMeta;
        console.log(`🔑 [SendConversionEvent] Usando tokenMeta (fallback) para ${connection.channel}`);
    } else if (datasetWhatsappToken) {
        accessToken = datasetWhatsappToken;
        console.log("🔑 [SendConversionEvent] Usando tokenMeta del dataset company-level (fallback)");
    } else {
        // Para Facebook/Instagram, usar el App Access Token de la company
        accessToken = await getCompanyAccessToken(companyId);
        console.log(`🔑 [SendConversionEvent] Usando App Access Token para ${connection.channel}`);
    }

    // 5. Initialize Meta Marketing client
    const metaClient = new MetaMarketing({
        accessToken,
        apiVersion: process.env.FACEBOOK_CONVERSIONS_API_VERSION || GRAPH_API_VERSION
    });

    // 6. Prepare user data (will be hashed)
    const userData = metaClient.conversions.prepareUserData({
        email: contact.email,
        phone: contact.number,
        firstName: contact.name?.split(" ")[0],
        lastName: contact.name?.split(" ").slice(1).join(" "),
        city: contact.city,
        state: contact.state,
        country: contact.country,
        zipCode: contact.zipcode
    });

    // Add external_id (contact ID hashed) for better match quality
    userData.external_id = [metaClient.conversions.hashData(String(contactId))];

    // Add ctwa_clid to user_data (required by Facebook for Click-to-WhatsApp attribution)
    if (ctwaClid) {
        userData.ctwa_clid = ctwaClid;
    }
    // CTWA clicks that originate from Facebook ads are accepted by Meta with
    // page_id. This matches the Kanban CTWA flow that is already successful.
    if (resolvedPageId) {
        userData.page_id = resolvedPageId;
    } else if (resolvedWaba.id) {
        userData.whatsapp_business_account_id = resolvedWaba.id;
    }

    // 7. Determine action_source and messaging_channel
    // Con ctwaClid: usar business_messaging + messaging_channel (atribucion exacta)
    // Sin ctwaClid: usar physical_store sin messaging_channel (atribucion por PII/telefono)
    let actionSource: string;
    let messagingChannel: string | undefined;

    if (ctwaClid) {
        // Tiene click ID: atribucion exacta via business messaging
        actionSource = getActionSource(connection.channel);
        messagingChannel = getMessagingChannel(connection.channel);
    } else {
        // Sin click ID (ej: venta importada): atribucion offline por telefono
        actionSource = "physical_store";
        messagingChannel = undefined;
    }

    // 8. Create conversion event
    const eventTime = Math.floor(Date.now() / 1000);
    // Usar eventId estable si se proveyó, de lo contrario generar uno aleatorio (legacy)
    const facebookEventId =
        (eventId && String(eventId).trim()) ||
        (facebookEventIdInput && String(facebookEventIdInput).trim()) ||
        metaClient.conversions.generateEventId();

    const readableCustomData = buildReadableCustomData({
        eventName,
        customData,
        contact,
        connection,
        campaignMessage,
        policyConversionName: policy.conversionName
    });

    if (isWhatsAppBusinessMessaging && !resolvedPageId && !resolvedWaba.id) {
        const errorMessage =
            `Falta identificador Meta para enviar CTWA por WhatsApp. ` +
            `Para clicks de Facebook configura una pagina conectada; para WhatsApp directo configura ` +
            `FacebookDatasets.channelIdentifier o Whatsapps.facebookUserId con el WABA ID correcto ` +
            `para companyId ${companyId}, whatsappId ${whatsappId}.`;

        const failedEvent = await FacebookConversionEvent.create({
            companyId,
            whatsappId,
            contactId,
            messageId,
            campaignId,
            eventName,
            eventTime,
            userData,
            customData: readableCustomData,
            datasetId: destinationId,
            facebookEventId,
            actionSource,
            messagingChannel,
            ctwaClid,
            responseStatus: "failed",
            errorMessage,
            sentAt: new Date()
        });

        console.error(
            `❌ [SendConversionEvent] ${errorMessage} ` +
            `event=${failedEvent.id} dataset=${destinationId} ` +
            `channelIdentifier=${dataset?.channelIdentifier || "NULL"} ` +
            `connectionFacebookUserId=${connection.facebookUserId || "NULL"} ` +
            `campaignSourceApp=${campaignSourceApp || "NULL"}`
        );

        throw new Error(errorMessage);
    }

    const conversionEvent: any = {
        event_name: eventName,
        event_time: eventTime,
        event_id: facebookEventId,
        user_data: userData,
        custom_data: readableCustomData,
        action_source: actionSource,
    };

    // Solo incluir messaging_channel si es business_messaging
    if (messagingChannel) {
        conversionEvent.messaging_channel = messagingChannel;
    }

    // DEBUG: Log completo del evento que se va a enviar
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 [SendConversionEvent] DETALLE COMPLETO DEL EVENTO`);
    console.log(`${'='.repeat(80)}`);
    console.log(`  Dataset ID: ${destinationId}`);
    console.log(`  Destination Source: ${destinationSource}`);
    console.log(`  Connection: ${connection.name} (${connection.channel}) [ID: ${whatsappId}]`);
    console.log(`  Contact: ${contact.name} | ${contact.number} | email: ${contact.email || 'N/A'}`);
    console.log(`  Event: ${eventName} | Time: ${eventTime} | ID: ${facebookEventId}`);
    console.log(`  Action Source: ${actionSource} | Messaging Channel: ${messagingChannel}`);
    console.log(`  WABA ID: ${resolvedWaba.id || "N/A"} | Source: ${resolvedWaba.source || "N/A"}`);
    console.log(`  Page ID: ${resolvedPageId || "N/A"} | Campaign Source App: ${campaignSourceApp || "N/A"}`);
    console.log(`  ctwaClid: ${ctwaClid || 'N/A (approximate attribution)'}`);
    console.log(`  Custom Data:`, JSON.stringify(readableCustomData, null, 2));
    console.log(`  User Data (hashed):`, JSON.stringify(userData, null, 2));
    console.log(`  Full Event Payload:`, JSON.stringify(conversionEvent, null, 2));
    console.log(`${'='.repeat(80)}\n`);

    // 9. Save event to database first (pending status)
    const savedEvent = await FacebookConversionEvent.create({
        companyId,
        whatsappId,
        contactId,
        messageId,
        campaignId,
        eventName,
        eventTime,
        userData,
        customData: readableCustomData,
        datasetId: destinationId,
        facebookEventId,
        actionSource,
        messagingChannel,
        ctwaClid,
        responseStatus: "pending"
    });

    // [I7/AC9] test_event_code JAMÁS en producción: los eventos de prueba van a "Test Events" y
    // NO cuentan para campañas (verde en logs, ficticio en Meta). Gate por entorno en el punto único de envío.
    const effectiveTestEventCode =
        process.env.NODE_ENV === "production" ? undefined : testEventCode;
    if (process.env.NODE_ENV === "production" && testEventCode) {
        console.warn(
            `[CAPI][I7] test_event_code descartado en producción (company=${companyId}, event=${eventName})`
        );
    }

    // 10. Send to Facebook Conversions API
    try {
        const response = await metaClient.conversions.sendEvent(
            destinationId,
            conversionEvent,
            effectiveTestEventCode
        );

        // Update event as successful
        await savedEvent.update({
            responseStatus: "success",
            fbResponse: response,
            sentAt: new Date()
        });

        console.log(
            `✅ Conversion event sent successfully: ${eventName} for ${connection.channel} connection ${connection.name}`
        );

        return savedEvent;
    } catch (error: any) {
        // Update event as failed
        await savedEvent.update({
            responseStatus: "failed",
            errorMessage: error.message,
            fbResponse: error.response?.data || null,
            sentAt: new Date()
        });

        console.error(
            `❌ Failed to send conversion event: ${eventName} for ${connection.channel} connection ${connection.name}:`,
            error.message
        );

        throw error;
    }
};

export default SendConversionEvent;
