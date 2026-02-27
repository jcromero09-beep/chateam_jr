import Message from "../../models/Message";
import Contact from "../../models/Contact";
import FacebookConversionEvent from "../../models/FacebookConversionEvent";
import SendConversionEvent from "./SendConversionEvent";

interface ProcessWhatsAppConversionData {
    companyId: number;
    whatsappId: number;
    contactId: number;
    messageId: number;
    ctwaClid: string;
    eventType: "Contact" | "ViewContent" | "LeadSubmitted" | "Purchase";
    value?: number;
    currency?: string;
    orderId?: string;
}

/**
 * Process WhatsApp conversion from click-to-WhatsApp ads
 * This service is specifically for handling conversions from Facebook ads
 */
const ProcessWhatsAppConversion = async (
    data: ProcessWhatsAppConversionData
): Promise<FacebookConversionEvent> => {
    const {
        companyId,
        whatsappId,
        contactId,
        messageId,
        ctwaClid,
        eventType,
        value,
        currency,
        orderId
    } = data;

    // Validate ctwa_clid is present (required for WhatsApp ad conversions)
    if (!ctwaClid) {
        throw new Error("ctwa_clid is required for WhatsApp conversion tracking");
    }

    // Send conversion event
    return await SendConversionEvent({
        companyId,
        whatsappId,
        eventName: eventType,
        contactId,
        messageId,
        ctwaClid,
        customData: {
            value,
            currency: currency || "USD",
            orderId
        }
    });
};

/**
 * Extract ctwa_clid from WhatsApp message metadata
 * The ctwa_clid is passed when a user clicks on a click-to-WhatsApp ad
 */
export const extractCtwaClid = (message: Message): string | null => {
    // Check if message has metadata with ctwa_clid
    // This depends on how WhatsApp Business API passes the click ID
    // It may be in different places depending on the provider (Cloud API vs On-Premises)

    // For WhatsApp Cloud API it might be in:
    // 1. Message context
    // 2. Referral information
    // 3. Custom metadata

    try {
        // Parse message body or metadata to find ctwa_clid
        // This is a placeholder - actual implementation depends on your WhatsApp setup

        if (message.body && message.body.includes("ctwa_clid")) {
            const match = message.body.match(/ctwa_clid[=:]([a-zA-Z0-9_-]+)/);
            if (match && match[1]) {
                return match[1];
            }
        }

        // Check if it's in a JSON metadata field
        // (adjust based on your actual message structure)
        return null;
    } catch (error) {
        console.error("Error extracting ctwa_clid:", error);
        return null;
    }
};

/**
 * Check if a contact came from a click-to-WhatsApp ad
 * by checking if their first message has ctwa_clid
 */
export const isFromWhatsAppAd = async (contactId: number): Promise<boolean> => {
    const firstMessage = await Message.findOne({
        where: {
            contactId,
            fromMe: false
        },
        order: [["createdAt", "ASC"]]
    });

    if (!firstMessage) return false;

    const ctwaClid = extractCtwaClid(firstMessage);
    return !!ctwaClid;
};

export default ProcessWhatsAppConversion;
