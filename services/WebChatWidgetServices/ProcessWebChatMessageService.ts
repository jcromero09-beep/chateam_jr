import WebChatWidget from "../../models/WebChatWidget";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import Whatsapp from "../../models/Whatsapp";
import CompaniesSettings from "../../models/CompaniesSettings";
import AppError from "../../errors/AppError";
import { getIO } from "../../libs/socket";
import { Op } from "sequelize";
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import CreateMessageService from "../MessageServices/CreateMessageService";

interface Request {
  widgetApiKey: string;
  sessionId: string;
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
  message: string;
}

interface Response {
  ticket: Ticket;
  message: Message;
  contact: Contact;
}

const ProcessWebChatMessageService = async ({
  widgetApiKey,
  sessionId,
  contactName,
  contactEmail,
  contactPhone,
  message
}: Request): Promise<Response> => {
  console.log("\n🌐 [ProcessWebChatMessageService] INICIO");
  console.log("📋 Datos:", { widgetApiKey, sessionId, contactName, message: message.substring(0, 50) });

  // 1. Validar widget y obtener configuración
  const widget = await WebChatWidget.findOne({
    where: { apiKey: widgetApiKey, status: true },
    include: [
      {
        model: Whatsapp,
        as: "whatsapp",
        attributes: ["id", "name", "status"]
      }
    ]
  });

  if (!widget) {
    throw new AppError("Widget no encontrado o inactivo", 404);
  }

  console.log("✅ Widget encontrado:", { id: widget.id, name: widget.name, companyId: widget.companyId });

  // 2. Crear o buscar contacto
  // Usar sessionId como número único para webchat
  const contactNumber = contactPhone || `webchat_${sessionId}`;

  const contact = await CreateOrUpdateContactService({
    name: contactName,
    number: contactNumber,
    email: contactEmail || "",
    isGroup: false,
    companyId: widget.companyId,
    channel: "webchat",
    whatsappId: widget.whatsappId
  });

  console.log("✅ Contacto:", { id: contact.id, name: contact.name, number: contact.number });

  // 3. Buscar ticket abierto existente o crear uno nuevo
  let ticket = await Ticket.findOne({
    where: {
      contactId: contact.id,
      companyId: widget.companyId,
      whatsappId: widget.whatsappId,
      channel: "webchat",
      status: {
        [Op.or]: ["open", "pending"]
      }
    },
    order: [["updatedAt", "DESC"]]
  });

  const io = getIO();

  if (!ticket) {
    // Crear nuevo ticket
    console.log("📝 Creando nuevo ticket...");

    ticket = await Ticket.create({
      contactId: contact.id,
      companyId: widget.companyId,
      whatsappId: widget.whatsappId,
      queueId: widget.queueId || null,
      userId: null,
      status: "pending",
      channel: "webchat",
      unreadMessages: 1,
      isBot: false,
      isGroup: false,
      lastMessage: message
    });

    // Emitir evento de nuevo ticket
    io.of(String(widget.companyId))
      .emit(`company-${widget.companyId}-ticket`, {
        action: "create",
        ticket: await Ticket.findByPk(ticket.id, {
          include: [
            {
              model: Contact,
              as: "contact",
              attributes: ["id", "name", "number", "email", "profilePicUrl"]
            }
          ]
        })
      });

    console.log("✅ Ticket creado:", { id: ticket.id, status: ticket.status });
  } else {
    // Actualizar ticket existente
    await ticket.update({
      unreadMessages: ticket.unreadMessages + 1,
      lastMessage: message
    });

    console.log("✅ Ticket existente actualizado:", { id: ticket.id });
  }

  // 4. Crear mensaje
  const messageWid = `webchat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const newMessage = await CreateMessageService({
    messageData: {
      wid: messageWid,
      ticketId: ticket.id,
      body: message,
      contactId: contact.id,
      fromMe: false,
      read: false,
      channel: "webchat",
      ack: 2 // Mensaje recibido
    },
    companyId: widget.companyId
  });

  console.log("✅ Mensaje creado:", { id: newMessage.id, wid: messageWid });

  // 5. Emitir evento de actualización de ticket
  io.of(String(widget.companyId))
    .emit(`company-${widget.companyId}-ticket`, {
      action: "update",
      ticket: await Ticket.findByPk(ticket.id, {
        include: [
          {
            model: Contact,
            as: "contact",
            attributes: ["id", "name", "number", "email", "profilePicUrl"]
          }
        ]
      })
    });

  console.log("🌐 [ProcessWebChatMessageService] FIN\n");

  return {
    ticket,
    message: newMessage,
    contact
  };
};

export default ProcessWebChatMessageService;
