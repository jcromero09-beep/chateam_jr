import AppError from "../../errors/AppError";
import RunTicketAutomationRules from "../AutomationServices/RunTicketAutomationRules"; // [Fase E]

import { Op } from "sequelize";
import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import GetDefaultWhatsAppByUser from "../../helpers/GetDefaultWhatsAppByUser";
import Ticket from "../../models/Ticket";
import ShowContactService from "../ContactServices/ShowContactService";
import { getIO } from "../../libs/socket";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import Queue from "../../models/Queue";
import User from "../../models/User";

import CreateLogTicketService from "./CreateLogTicketService";
import ShowTicketService from "./ShowTicketService";
import NotifyTicketEventService from "../NotificationServices/NotifyTicketEventService";

interface Request {
  contactId: number;
  status: string;
  userId: number;
  companyId: number;
  queueId?: number;
  whatsappId: string;
}

const CreateTicketService = async ({
  contactId,
  status,
  userId,
  queueId,
  companyId,
  whatsappId = ""
}: Request): Promise<Ticket> => {

  const io = getIO();

  let whatsapp;
  let defaultWhatsapp

  if (whatsappId !== "undefined" && whatsappId !== null && whatsappId !== "") {
    whatsapp = await ShowWhatsAppService(whatsappId, companyId)
  }


  defaultWhatsapp = await GetDefaultWhatsAppByUser(userId);

  if (whatsapp) {
    defaultWhatsapp = whatsapp;
  }
  if (!defaultWhatsapp) {
    const fallbackId = whatsapp?.id || 0;
    defaultWhatsapp = await GetDefaultWhatsApp(fallbackId, companyId);
  }

  // Si el contacto ya tiene un ticket activo en esta conexión, no bloqueamos
  // el flujo manual: devolvemos ese ticket para que el frontend abra el chat.
  const existingTicket = await Ticket.findOne({
    where: {
      contactId,
      companyId,
      whatsappId: defaultWhatsapp.id,
      status: {
        [Op.or]: ["open", "pending", "group", "nps", "lgpd"]
      }
    },
    order: [["updatedAt", "DESC"]]
  });

  if (existingTicket) {
    const ticket = await ShowTicketService(existingTicket.id, companyId);
    ticket.setDataValue("alreadyOpen", true);
    return ticket;
  }

  const { isGroup } = await ShowContactService(contactId, companyId);

  let ticket = await Ticket.create({
    contactId,
    companyId,
    whatsappId: defaultWhatsapp.id,
    channel: defaultWhatsapp.channel,
    isGroup,
    userId,
    isBot: true,
    queueId,
    status: isGroup ? "group" : "open",
    isActiveDemand: true
  });

  // await Ticket.update(
  //   { companyId, queueId, userId, status: isGroup? "group": "open", isBot: true },
  //   { where: { id } }
  // );

  ticket = await ShowTicketService(ticket.id, companyId);

  if (!ticket) {
    throw new AppError("ERR_CREATING_TICKET");
  }

  // [Fase E] Motor de reglas: evento ticket_created (aislado — nunca rompe la creación del ticket)
  await RunTicketAutomationRules({ event: "ticket_created", ticket, companyId });
  await ticket.reload();

  io.of(String(companyId))
    // .to(ticket.status)
    // .to("notification")
    // .to(ticket.id.toString())
    .emit(`company-${companyId}-ticket`, {
      action: "create",
      ticket
    });

  await NotifyTicketEventService(ticket, "created");

  await CreateLogTicketService({
    userId,
    queueId,
    ticketId: ticket.id,
    type: "create"
  });

  return ticket;
};

export default CreateTicketService;
