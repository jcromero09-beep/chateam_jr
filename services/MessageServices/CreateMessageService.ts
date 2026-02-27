import { getIO } from "../../libs/socket";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import Tag from "../../models/Tag";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";

export interface MessageData {
  wid: string;
  ticketId: number;
  body: string;
  contactId?: number;
  fromMe?: boolean;
  read?: boolean;
  mediaType?: string;
  mediaUrl?: string;
  ack?: number;
  queueId?: number;
  channel?: string;
  ticketTrakingId?: number;
  isPrivate?: boolean;
  ticketImported?: any;
  isForwarded?: boolean;
}
interface Request {
  messageData: MessageData;
  companyId: number;
}

const CreateMessageService = async ({
  messageData,
  companyId
}: Request): Promise<Message> => {
  console.log("\n  🔸 [CreateMessageService] INICIO");
  console.log("  📋 Datos del mensaje:", {
    wid: messageData.wid,
    ticketId: messageData.ticketId,
    body: messageData.body?.substring(0, 50) + (messageData.body?.length > 50 ? "..." : ""),
    fromMe: messageData.fromMe,
    mediaType: messageData.mediaType,
    mediaUrl: messageData.mediaUrl
  });

  const messageIncludes = [
    "contact",
    {
      model: Ticket,
      as: "ticket",
      include: [
        {
          model: Contact,
          attributes: ["id", "name", "number", "email", "profilePicUrl", "acceptAudioMessage", "active", "urlPicture", "companyId"],
          include: ["extraInfo", "tags"]
        },
        {
          model: Queue,
          attributes: ["id", "name", "color"]
        },
        {
          model: Whatsapp,
          attributes: ["id", "name", "groupAsTicket"]
        },
        {
          model: User,
          attributes: ["id", "name"]
        },
        {
          model: Tag,
          as: "tags",
          attributes: ["id", "name", "color"]
        }
      ]
    },
    {
      model: Message,
      as: "quotedMsg",
      include: ["contact"]
    }
  ];

  // Buscar mensaje existente por wid+companyId para evitar duplicados
  const existingMessage = await Message.findOne({
    where: { wid: messageData.wid, companyId }
  });

  if (existingMessage) {
    console.log("  🔄 Mensaje ya existe (id:", existingMessage.id, ") - actualizando ack/read...");
    // Solo actualizar campos que pueden cambiar (ack, read)
    const updateFields: any = {};
    if (messageData.ack !== undefined && messageData.ack > existingMessage.ack) {
      updateFields.ack = messageData.ack;
    }
    if (messageData.read !== undefined && messageData.read !== existingMessage.read) {
      updateFields.read = messageData.read;
    }
    if (Object.keys(updateFields).length > 0) {
      await existingMessage.update(updateFields);
    }
  } else {
    console.log("  💾 Creando mensaje nuevo en BD...");
    await Message.create({ ...messageData, companyId } as any);
  }

  console.log("  🔍 Obteniendo mensaje completo con relaciones...");
  const message = await Message.findOne({
    where: {
      wid: messageData.wid,
      companyId
    },
    include: messageIncludes
  });

  if (message.ticket.queueId !== null && message.queueId === null) {
    console.log("  🎯 Asignando queueId del ticket al mensaje:", message.ticket.queueId);
    await message.update({ queueId: message.ticket.queueId });
  }

  if (message.isPrivate) {
    console.log("  🔒 Mensaje privado - generando wid especial");
    await message.update({ wid: `PVT${message.id}` });
  }

  if (!message) {
    console.log("  ❌ [CreateMessageService] ERROR: No se pudo crear el mensaje");
    throw new Error("ERR_CREATING_MESSAGE");
  }

  console.log("  ✅ Mensaje creado con ID:", message.id);

  const io = getIO();

  if (!messageData?.ticketImported) {
    const socketAction = existingMessage ? "update" : "create";
    console.log("  📡 Emitiendo evento Socket.io (" + socketAction + "): company-" + companyId + "-appMessage");

    io.of(String(companyId))
      .emit(`company-${companyId}-appMessage`, {
        action: socketAction,
        message,
        ticket: message.ticket,
        contact: message.ticket.contact
      });

    console.log("  ✅ Evento Socket.io emitido correctamente");
  } else {
    console.log("  ℹ️ Mensaje importado - no se emite evento Socket.io");
  }

  console.log("  ✅ [CreateMessageService] FIN\n");

  return message;
};

export default CreateMessageService;