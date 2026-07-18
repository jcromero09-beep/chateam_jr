import CampaignMessage from "../../models/CampaignMessage";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import MetaMarketingService from "../MetaMarketingService";

interface Request {
  ticketId: number;
}

const FindByTicketIdService = async ({
  ticketId
}: Request): Promise<CampaignMessage[]> => {
  const campaignMessages = await CampaignMessage.findAll({
    where: { ticketId },
    include: [
      { model: Contact, as: "contact", attributes: ["id", "name", "number", "profilePicUrl"] },
      { model: Message, as: "message", attributes: ["id", "body", "createdAt"] },
      { model: Ticket, as: "ticket", attributes: ["id", "status"] },
      { model: Whatsapp, as: "whatsapp", attributes: ["id", "name"] }
    ],
    order: [["createdAt", "DESC"]]
  });

  await Promise.all(
    campaignMessages.map(async campaignMessage => {
      const rawData = (campaignMessage.rawData || {}) as any;
      const hasCampaignName = Boolean(
        rawData.campaignName ||
        rawData.campaign_name ||
        rawData.campaign?.name ||
        rawData.campaign?.campaign_name ||
        rawData.ad?.campaign_name
      );

      if (hasCampaignName || !campaignMessage.sourceId || !campaignMessage.whatsappId) {
        return;
      }

      const attribution = await MetaMarketingService.resolveAdAttributionById(
        campaignMessage.companyId,
        String(campaignMessage.sourceId),
        campaignMessage.whatsappId
      );

      if (!attribution?.campaignName) {
        return;
      }

      await campaignMessage.update({
        rawData: {
          ...rawData,
          adId: attribution.adId || campaignMessage.sourceId,
          adName: attribution.adName || campaignMessage.headline,
          adSetId: attribution.adSetId,
          adSetName: attribution.adSetName,
          campaignId: attribution.campaignId,
          campaignName: attribution.campaignName,
          campaign_id: attribution.campaignId,
          campaign_name: attribution.campaignName,
          attributionResolvedAt: new Date().toISOString()
        }
      });
    })
  );

  return campaignMessages;
};

export default FindByTicketIdService;
