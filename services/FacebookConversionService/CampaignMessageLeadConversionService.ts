import axios from "axios";
import FacebookConversionEvent from "../../models/FacebookConversionEvent";
import CampaignMessage from "../../models/CampaignMessage";
import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import {
  resolveConversionDestination,
  buildUserData,
  getApiVersion,
  WebsiteEventUser
} from "./SendWebsiteEvent";
import { graphUrl } from "../../config/metaGraph"; // [AC2] URL /events vía helper único
import { shouldSendMetaConversion } from "./MetaConversionPolicyService";
import logger from "../../utils/logger";

const PREFIX = "[CAMPAIGN-LEAD-CAPI]";
const EVENT_NAME = "Lead";

const SKIPPED_SOURCE_TYPES = new Set([
  "MANUAL_ASSIGNMENT",
  "SALES_IMPORT",
  "FB_ADS_REPLY_CONTEXT"
]);

const maskId = (value?: string | number | null): string => {
  if (value === undefined || value === null || value === "") return "N/A";
  const raw = String(value);
  if (raw.length <= 8) return raw;
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
};

const buildEventId = (campaignMessageId: number): string =>
  `lead_cm_${campaignMessageId}`;

export const shouldSendLeadForCampaignMessage = (
  campaignMessage: CampaignMessage
): boolean => {
  if (!campaignMessage?.id) return false;
  if (!campaignMessage.companyId || !campaignMessage.contactId) return false;
  if (!campaignMessage.whatsappId || !campaignMessage.messageId) return false;

  const sourceType = String(campaignMessage.sourceType || "").toUpperCase();
  if (SKIPPED_SOURCE_TYPES.has(sourceType)) return false;

  return true;
};

export const sendLeadConversionFromCampaignMessage = async (
  campaignMessage: CampaignMessage
): Promise<{ ok: boolean; reason?: string; eventId?: number; status?: string }> => {
  if (!shouldSendLeadForCampaignMessage(campaignMessage)) {
    logger.info(
      `${PREFIX} skip campaignMessage=${campaignMessage?.id || "N/A"} ` +
      `sourceType=${campaignMessage?.sourceType || "N/A"} reason=not_inbound_campaign_message`
    );
    return { ok: true, reason: "not_inbound_campaign_message" };
  }

  const facebookEventId = buildEventId(campaignMessage.id);

  const policy = await shouldSendMetaConversion({
    companyId: campaignMessage.companyId,
    eventKey: "campaign_message_lead"
  });

  if (!policy.enabled) {
    logger.info(
      `${PREFIX} skip campaignMessage=${campaignMessage.id} reason=policy_disabled ` +
      `company=${campaignMessage.companyId} eventKey=campaign_message_lead`
    );
    return { ok: true, reason: "policy_disabled" };
  }

  const existing = await FacebookConversionEvent.findOne({
    where: {
      companyId: campaignMessage.companyId,
      eventName: EVENT_NAME,
      facebookEventId
    },
    order: [["createdAt", "DESC"]]
  });

  if (existing) {
    logger.info(
      `${PREFIX} duplicate_skipped campaignMessage=${campaignMessage.id} ` +
      `event=${existing.id} status=${existing.responseStatus}`
    );
    return {
      ok: true,
      reason: "duplicate_skipped",
      eventId: existing.id,
      status: existing.responseStatus
    };
  }

  const contact = await Contact.findOne({
    where: { id: campaignMessage.contactId, companyId: campaignMessage.companyId }
  });

  if (!contact) {
    logger.warn(
      `${PREFIX} skip campaignMessage=${campaignMessage.id} reason=contact_not_found`
    );
    return { ok: false, reason: "contact_not_found" };
  }

  const whatsapp = campaignMessage.whatsappId
    ? await Whatsapp.findOne({
      where: { id: campaignMessage.whatsappId, companyId: campaignMessage.companyId }
    })
    : null;

  const eventUser: WebsiteEventUser = {
    userId: contact.id,
    companyId: campaignMessage.companyId,
    email: contact.email,
    phone: contact.number,
    name: contact.name
  };

  const customData = {
    source: "campaign_message",
    conversion_name: campaignMessage.headline || policy.conversionName || "Lead de campaña",
    campaign_message_id: campaignMessage.id,
    contact_name: contact.name || null,
    contact_number: contact.number || null,
    whatsapp_name: whatsapp?.name || null,
    whatsapp_number: whatsapp?.number || null,
    channel: campaignMessage.channel || null,
    source_id: campaignMessage.sourceId || null,
    source_type: campaignMessage.sourceType || null,
    source_url: campaignMessage.sourceUrl || null,
    headline: campaignMessage.headline || null,
    ctwa_clid: campaignMessage.ctwaClid || null,
    currency: "USD"
  };

  const destination = await resolveConversionDestination(eventUser, {
    actionSource: "system_generated",
    conversionCompanyId: campaignMessage.companyId,
    whatsappId: campaignMessage.whatsappId || undefined
  });

  const record = await FacebookConversionEvent.create({
    companyId: campaignMessage.companyId,
    whatsappId: campaignMessage.whatsappId,
    contactId: campaignMessage.contactId,
    messageId: campaignMessage.messageId,
    eventName: EVENT_NAME,
    eventTime: Math.floor(Date.now() / 1000),
    userData: buildUserData(eventUser),
    customData,
    datasetId: destination?.destinationId || null,
    facebookEventId,
    actionSource: "system_generated",
    messagingChannel: null,
    ctwaClid: campaignMessage.ctwaClid || null,
    responseStatus: destination ? "pending" : "failed",
    errorMessage: destination ? null : "Sin destino Meta CAPI resuelto"
  } as any);

  if (!destination) {
    logger.warn(
      `${PREFIX} no_destination campaignMessage=${campaignMessage.id} event=${record.id}`
    );
    return { ok: false, reason: "no_destination", eventId: record.id, status: "failed" };
  }

  const userData = buildUserData(eventUser);
  if (campaignMessage.ctwaClid) {
    userData.ctwa_clid = campaignMessage.ctwaClid;
  }

  const event = {
    event_name: EVENT_NAME,
    event_time: Math.floor(Date.now() / 1000),
    event_id: facebookEventId,
    action_source: "system_generated",
    user_data: userData,
    custom_data: customData
  };

  logger.info(
    `${PREFIX} sending Lead campaignMessage=${campaignMessage.id} ` +
    `event=${record.id} dest=${maskId(destination.destinationId)} ` +
    `source=${destination.source}`
  );

  try {
    const response = await axios.post(
      graphUrl(`${destination.destinationId}/events`, getApiVersion()), // [AC2] vía helper único
      {
        data: [event],
        partner_agent: "jrchateam-campaign-message-lead-capi/1.0"
      },
      {
        params: { access_token: destination.accessToken },
        timeout: 10000
      }
    );

    const eventsReceived = Number(response.data?.events_received || 0);
    const isSuccess = response.status >= 200 && response.status < 300 && eventsReceived > 0;

    await record.update({
      responseStatus: isSuccess ? "success" : "sent",
      fbResponse: response.data,
      sentAt: new Date(),
      errorMessage: null
    });

    logger.info(
      `${PREFIX} sent Lead campaignMessage=${campaignMessage.id} ` +
      `event=${record.id} status=${isSuccess ? "success" : "sent"} ` +
      `eventsReceived=${eventsReceived} fbtraceId=${response.data?.fbtrace_id || "N/A"}`
    );

    return {
      ok: true,
      eventId: record.id,
      status: isSuccess ? "success" : "sent"
    };
  } catch (error: any) {
    const responseData = error?.response?.data || null;
    const metaError = responseData?.error || null;
    const errMessage = metaError?.message || error?.message || "Error enviando Lead de campaña";

    await record.update({
      responseStatus: "failed",
      fbResponse: responseData,
      errorMessage: errMessage,
      sentAt: new Date()
    });

    logger.error(
      `${PREFIX} failed campaignMessage=${campaignMessage.id} event=${record.id} ` +
      `httpStatus=${error?.response?.status || "N/A"} ` +
      `code=${metaError?.code || "N/A"} subcode=${metaError?.error_subcode || metaError?.subcode || "N/A"} ` +
      `message=${errMessage}`
    );

    return { ok: false, reason: "meta_error", eventId: record.id, status: "failed" };
  }
};

export const sendLeadConversionFromCampaignMessageAsync = (
  campaignMessage: CampaignMessage
): void => {
  setImmediate(() => {
    sendLeadConversionFromCampaignMessage(campaignMessage).catch((err: any) => {
      logger.error(
        `${PREFIX} unexpected campaignMessage=${campaignMessage?.id || "N/A"}: ` +
        `${err?.message || err}`
      );
    });
  });
};

export default {
  sendLeadConversionFromCampaignMessage,
  sendLeadConversionFromCampaignMessageAsync,
  shouldSendLeadForCampaignMessage
};
