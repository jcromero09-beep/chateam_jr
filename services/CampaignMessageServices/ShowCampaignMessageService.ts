import AppError from "../../errors/AppError";
import CampaignMessage from "../../models/CampaignMessage";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";

interface Request {
  id: number;
}

const ShowCampaignMessageService = async ({
  id
}: Request): Promise<CampaignMessage> => {
  const campaignMessage = await CampaignMessage.findByPk(id, {
    include: [
      { model: Contact, as: "contact", attributes: ["id", "name", "number", "profilePicUrl"] },
      { model: Message, as: "message", attributes: ["id", "body", "createdAt"] },
      { model: Ticket, as: "ticket", attributes: ["id", "status"] },
      { model: Whatsapp, as: "whatsapp", attributes: ["id", "name"] }
    ]
  });

  if (!campaignMessage) {
    throw new AppError("ERR_CAMPAIGN_MESSAGE_NOT_FOUND", 404);
  }

  return campaignMessage;
};

export default ShowCampaignMessageService;
