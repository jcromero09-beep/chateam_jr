import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import User from "../../models/User";
import Queue from "../../models/Queue";
import Whatsapp from "../../models/Whatsapp";

const ShowMessageService = async (messageId: string, companyId?: number) => {
  const message = await Message.findOne({
    where: companyId ? { id: messageId, companyId } : { id: messageId },
    include: [
      {
        model: Ticket,
        as: "ticket",
        include: [
          { model: Contact, as: "contact" },
          { model: Whatsapp, as: "whatsapp" },
          { model: Queue, as: "queue" },
          { model: User, as: "user" }
        ]
      },
      {
        model: Message,
        as: "quotedMsg",
        include: [{ model: Contact, as: "contact" }]
      },
      { model: Contact, as: "contact" }
    ]
  });

  return message;
}

export const GetWhatsAppFromMessage = async (message: Message): Promise<number | null> => {
  const ticketId = message.ticketId;
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) {
    return null;
  }
  return ticket.whatsappId;
}


export default ShowMessageService;
