import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import FacebookDataset from "../../models/FacebookDataset";
import FacebookConversionEvent from "../../models/FacebookConversionEvent";
import { MetaMarketing } from "../../meta-marketing/src";
import {
    getCompanyAccessToken,
    getMessagingChannel,
    getActionSource
} from "./FacebookAuthHelper";

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
}

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
        testEventCode
    } = data;

    // 1. Get connection (can be Facebook, Instagram, or WhatsApp)
    const connection = await Whatsapp.findByPk(whatsappId);
    if (!connection) {
        throw new Error(`Connection ${whatsappId} not found`);
    }

    // 2. Get dataset for this connection
    const dataset = await FacebookDataset.findOne({
        where: {
            companyId,
            whatsappId,
            status: "active"
        }
    });

    if (!dataset) {
        throw new Error(
            `No active dataset found for ${connection.channel} connection ${whatsappId}. ` +
            `Please sync datasets first.`
        );
    }

    // 3. Get contact information
    const contact = await Contact.findByPk(contactId);
    if (!contact) {
        throw new Error(`Contact ${contactId} not found`);
    }

    // 4. Get access token - usar tokenMeta (System User Token) para WhatsApp/Meta
    let accessToken: string;

    if ((connection.channel === "whatsapp" || connection.channel === "meta") && connection.tokenMeta) {
        // Para WhatsApp/Meta, usar el System User Token de la conexión
        accessToken = connection.tokenMeta;
        console.log(`🔑 [SendConversionEvent] Usando tokenMeta (System User Token) para ${connection.channel}`);
    } else {
        // Para Facebook/Instagram, usar el App Access Token de la company
        accessToken = await getCompanyAccessToken(companyId);
        console.log(`🔑 [SendConversionEvent] Usando App Access Token para ${connection.channel}`);
    }

    // 5. Initialize Meta Marketing client
    const metaClient = new MetaMarketing({
        accessToken,
        apiVersion: process.env.FACEBOOK_CONVERSIONS_API_VERSION || "v20.0"
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

    // Add whatsapp_business_account_id (required by Facebook for CTWA attribution)
    if (dataset.channelIdentifier && (connection.channel === "whatsapp" || connection.channel === "meta")) {
        userData.whatsapp_business_account_id = dataset.channelIdentifier;
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
    const facebookEventId = metaClient.conversions.generateEventId();

    const conversionEvent: any = {
        event_name: eventName,
        event_time: eventTime,
        event_id: facebookEventId,
        user_data: userData,
        custom_data: customData || {},
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
    console.log(`  Dataset ID: ${dataset.datasetId}`);
    console.log(`  Connection: ${connection.name} (${connection.channel}) [ID: ${whatsappId}]`);
    console.log(`  Contact: ${contact.name} | ${contact.number} | email: ${contact.email || 'N/A'}`);
    console.log(`  Event: ${eventName} | Time: ${eventTime} | ID: ${facebookEventId}`);
    console.log(`  Action Source: ${actionSource} | Messaging Channel: ${messagingChannel}`);
    console.log(`  ctwaClid: ${ctwaClid || 'N/A (approximate attribution)'}`);
    console.log(`  Custom Data:`, JSON.stringify(customData, null, 2));
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
        customData: customData || {},
        datasetId: dataset.datasetId,
        facebookEventId,
        actionSource,
        messagingChannel,
        ctwaClid,
        responseStatus: "pending"
    });

    // 10. Send to Facebook Conversions API
    try {
        const response = await metaClient.conversions.sendEvent(
            dataset.datasetId,
            conversionEvent,
            testEventCode
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
