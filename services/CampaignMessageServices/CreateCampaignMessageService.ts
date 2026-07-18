import CampaignMessage from "../../models/CampaignMessage";
import logger from "../../utils/logger";
import logCampaignMessageFlow from "./CampaignMessageFlowLogger";
import { resolveCampaignCtwaClid } from "./CtwaClidResolver";
import { sendLeadConversionFromCampaignMessageAsync } from "../FacebookConversionService/CampaignMessageLeadConversionService";
import Ticket from "../../models/Ticket"; // [Fase2·C3.1]

export interface CampaignMessageData {
  companyId: number;
  contactId: number;
  messageId?: number;
  ticketId?: number;
  whatsappId?: number;
  sourceId?: string;
  sourceType?: string;
  sourceUrl?: string;
  headline?: string;
  body?: string;
  ctwaClid?: string;
  thumbnail?: string;
  channel?: string;
  rawData?: object;
  conversionNote?: string;
}

interface Request {
  data: CampaignMessageData;
}

/**
 * Crea un registro de mensaje de campaña publicitaria
 * Se usa cuando se detecta que un mensaje viene de un anuncio de Facebook/Instagram/WhatsApp
 */
const CreateCampaignMessageService = async ({
  data
}: Request): Promise<CampaignMessage | null> => {
  try {
    const resolvedCtwaClid = resolveCampaignCtwaClid({
      explicitCtwaClid: data.ctwaClid,
      rawData: data.rawData
    });
    const rawData =
      data.rawData && typeof data.rawData === "object"
        ? {
          ...data.rawData,
          ...(resolvedCtwaClid && !data.ctwaClid
            ? { ctwaClid: resolvedCtwaClid, ctwaClidSource: "conversionData_fallback" }
            : {})
        }
        : data.rawData;

    await logCampaignMessageFlow("campaign_create_attempt", {
      data: {
        ...data,
        ctwaClid: resolvedCtwaClid || data.ctwaClid,
        ctwaClidResolvedFromFallback: Boolean(resolvedCtwaClid && !data.ctwaClid)
      }
    });

    logger.info(`[CreateCampaignMessageService] Creando registro de campaña`);
    logger.info(`[CreateCampaignMessageService] Datos: ${JSON.stringify({
      companyId: data.companyId,
      contactId: data.contactId,
      messageId: data.messageId,
      sourceId: data.sourceId,
      sourceType: data.sourceType,
      ctwaClid: resolvedCtwaClid || data.ctwaClid,
      channel: data.channel
    })}`);

    const campaignMessage = await CampaignMessage.create({
      companyId: data.companyId,
      contactId: data.contactId,
      messageId: data.messageId,
      ticketId: data.ticketId,
      whatsappId: data.whatsappId,
      sourceId: data.sourceId,
      sourceType: data.sourceType,
      // [Fase2·C2.1] Persistir la cadena de atribución normalizada (viene resuelta en rawData).
      adName: (rawData as any)?.adName ?? null,
      adSetId: (rawData as any)?.adSetId ?? null,
      adSetName: (rawData as any)?.adSetName ?? null,
      campaignId: (rawData as any)?.campaignId ?? null,
      campaignName: (rawData as any)?.campaignName ?? null,
      sourceUrl: data.sourceUrl,
      headline: data.headline,
      body: data.body,
      ctwaClid: resolvedCtwaClid || data.ctwaClid,
      thumbnail: data.thumbnail,
      channel: data.channel,
      rawData,
      conversionNote: data.conversionNote
    });

    logger.info(`[CreateCampaignMessageService] Registro creado con ID: ${campaignMessage.id}`);

    // [Fase2·C3.1] El ticket vino de un anuncio CTWA → marcarlo como 'paid'
    // (separa embudo pauta vs orgánico en métricas). Best-effort, no bloquea.
    if (data.ticketId && (resolvedCtwaClid || data.ctwaClid)) {
      try {
        await Ticket.update({ sourceKind: "paid" }, { where: { id: data.ticketId } });
      } catch { /* no-op */ }
    }

    sendLeadConversionFromCampaignMessageAsync(campaignMessage);
    await logCampaignMessageFlow("campaign_lead_conversion_enqueue_requested", {
      campaignMessageId: campaignMessage.id,
      companyId: campaignMessage.companyId,
      contactId: campaignMessage.contactId,
      messageId: campaignMessage.messageId,
      ticketId: campaignMessage.ticketId,
      whatsappId: campaignMessage.whatsappId,
      sourceType: campaignMessage.sourceType,
      channel: campaignMessage.channel,
      ctwaClid: campaignMessage.ctwaClid || null
    });
    await logCampaignMessageFlow("campaign_create_success", {
      campaignMessageId: campaignMessage.id,
      companyId: campaignMessage.companyId,
      contactId: campaignMessage.contactId,
      messageId: campaignMessage.messageId,
      ticketId: campaignMessage.ticketId,
      whatsappId: campaignMessage.whatsappId,
      sourceId: campaignMessage.sourceId,
      sourceType: campaignMessage.sourceType,
      channel: campaignMessage.channel,
      createdAt: campaignMessage.createdAt
    });

    return campaignMessage;
  } catch (error: any) {
    logger.error(`[CreateCampaignMessageService] Error: ${error.message}`);
    logger.error(`[CreateCampaignMessageService] Stack: ${error.stack}`);
    await logCampaignMessageFlow("campaign_create_error", {
      data,
      error: {
        name: error?.name,
        message: error?.message,
        stack: error?.stack
      }
    });
    return null;
  }
};

export default CreateCampaignMessageService;
