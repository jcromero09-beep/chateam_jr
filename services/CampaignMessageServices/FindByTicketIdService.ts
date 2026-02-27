import CampaignMessage from "../../models/CampaignMessage";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";

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

  return campaignMessages;
};

export default FindByTicketIdService;
