import CampaignMessage from "../../models/CampaignMessage";
import logger from "../../utils/logger";

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
    logger.info(`[CreateCampaignMessageService] Creando registro de campaña`);
    logger.info(`[CreateCampaignMessageService] Datos: ${JSON.stringify({
      companyId: data.companyId,
      contactId: data.contactId,
      messageId: data.messageId,
      sourceId: data.sourceId,
      sourceType: data.sourceType,
      ctwaClid: data.ctwaClid,
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
      sourceUrl: data.sourceUrl,
      headline: data.headline,
      body: data.body,
      ctwaClid: data.ctwaClid,
      thumbnail: data.thumbnail,
      channel: data.channel,
      rawData: data.rawData,
      conversionNote: data.conversionNote
    });

    logger.info(`[CreateCampaignMessageService] Registro creado con ID: ${campaignMessage.id}`);

    return campaignMessage;
  } catch (error: any) {
    logger.error(`[CreateCampaignMessageService] Error: ${error.message}`);
    logger.error(`[CreateCampaignMessageService] Stack: ${error.stack}`);
    return null;
  }
};

export default CreateCampaignMessageService;
