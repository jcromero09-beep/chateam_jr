import Ticket from "../../models/Ticket";
import AppError from "../../errors/AppError";
import Contact from "../../models/Contact";
import User from "../../models/User";
import Queue from "../../models/Queue";
import Plan from "../../models/Plan";
import Tag from "../../models/Tag";
import Whatsapp from "../../models/Whatsapp";
import Telegram from "../../models/Telegram";
import Company from "../../models/Company";
import QueueIntegrations from "../../models/QueueIntegrations";
import CustomerOrigin from "../../models/CustomerOrigin";

const ShowTicketService = async (
  id: string | number,
  companyId: number | string
): Promise<Ticket> => {
  console.log("  🔸 [ShowTicketService] Buscando ticket:", { id, idType: typeof id, companyId, companyIdType: typeof companyId });

  // Asegurar que id sea número
  const ticketId = typeof id === 'string' ? parseInt(id, 10) : id;
  // Asegurar que companyId sea número
  const numericCompanyId = typeof companyId === 'string' ? parseInt(companyId, 10) : companyId;
  console.log("  📝 IDs convertidos a número:", { ticketId, numericCompanyId });

  try {
    const ticket = await Ticket.findOne({
      where: {
        id: ticketId,
        companyId: numericCompanyId
      },
      attributes: [
        "id",
        "uuid",
        "queueId",
        "lastFlowId",
        "flowStopped",
        "dataWebhook",
        "flowWebhook",
        "isGroup",
        "channel",
        "status",
        "contactId",
        "useIntegration",
        "lastMessage",
        "updatedAt",
        "unreadMessages",
        "companyId",
        "whatsappId",
        "telegramId",
        "imported",
        "lgpdAcceptedAt",
        "amountUsedBotQueues",
        "useIntegration",
        "integrationId",
        "userId",
        "amountUsedBotQueuesNPS",
        "lgpdSendMessageAt",
        "isBot",
        "typebotSessionId",
        "typebotStatus",
        "sendInactiveMessage",
        "queueId",
        "fromMe",
        "isOutOfHour",
        "isActiveDemand",
        "typebotSessionTime",
        "customerOriginId"
      ],
      include: [
        {
          model: Contact,
          as: "contact",
          attributes: ["id", "companyId", "name", "number", "email", "profilePicUrl", "acceptAudioMessage", "active", "disableBot", "remoteJid", "urlPicture", "lgpdAcceptedAt", "telegramUserId"],
          include: ["extraInfo", "tags",
            {
              association: "wallets",
              attributes: ["id", "name"]
            }]
        },
        {
          model: Queue,
          as: "queue",
          attributes: ["id", "name", "color"],
          include: ["chatbots"]
        },
        {
          model: User,
          as: "user",
          attributes: ["id", "name"],
        },
        {
          model: Tag,
          as: "tags",
          attributes: ["id", "name", "color", "kanban"]
        },
        {
          model: Whatsapp,
          as: "whatsapp",
          attributes: ["id", "name", "groupAsTicket", "greetingMediaAttachment", "facebookUserToken", "facebookUserId", "status"]

        },
        {
          model: Telegram,
          as: "telegram",
          attributes: ["id", "name", "status", "botToken"]
        },
        {
          model: Company,
          as: "company",
          attributes: ["id", "name"],
          include: [{
            model: Plan,
            as: "plan",
            attributes: ["id", "name", "useKanban"]
          }]
        },
        {
          model: QueueIntegrations,
          as: "queueIntegration",
          attributes: ["id", "name"]
        },
        {
          model: CustomerOrigin,
          as: "customerOrigin",
          attributes: ["id", "name", "color"]
        }
      ]
    });

    if (ticket?.companyId !== numericCompanyId) {
      console.log("  ❌ [ShowTicketService] Ticket de otra empresa", { ticketCompanyId: ticket?.companyId, numericCompanyId });
      throw new AppError("Não é possível consultar registros de outra empresa");
    }

    if (!ticket) {
      console.log("  ❌ [ShowTicketService] Ticket no encontrado");
      throw new AppError("ERR_NO_TICKET_FOUND", 404);
    }

    console.log("  ✅ [ShowTicketService] Ticket encontrado:", {
      id: ticket.id,
      status: ticket.status,
      contactId: ticket.contactId
    });

    return ticket;
  } catch (error) {
    console.log("  ❌ [ShowTicketService] ERROR en la consulta:");
    console.log("  📄 Error completo:", error);
    if (error.sql) {
      console.log("  📝 SQL que falló:", error.sql);
    }
    throw error;
  }
};

export default ShowTicketService;