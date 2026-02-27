// services/MetaServices/saveInboundMessage.ts
import * as Sentry from "@sentry/node";
import CreateMessageService from "../MessageServices/CreateMessageService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import { getIO } from "../../libs/socket";
import MessageModel from "../../models/Message";

export async function saveInboundAndEmit({
  ticket,
  contact,
  companyId,
  externalId,
  body,
  kind,
  mediaUrl = null,
  quotedMsgId = null,
  timestamp = new Date()
}: {
  ticket: any;
  contact: any;
  companyId: number;
  externalId: string;
  body: string;
  kind: string;
  mediaUrl?: string | null;
  quotedMsgId?: number | null;
  timestamp?: Date;
}) {
  try {
    // 1) dedupe por provider+externalId
    const exists = await MessageModel.findOne({
      where: { provider: "meta", externalId }
    });
    if (exists) return exists; // ya estaba

    // 2) crear message
    const msg = await CreateMessageService({
        companyId,
        messageData: {
          wid: externalId,           // <- usa el id de Meta para dedupe
          ticketId: ticket.id,
          body,
          contactId: contact.id,
          fromMe: false,
          read: false,
          mediaType: kind,           // "text" | "image" | ...
          mediaUrl,                  // opcional si lo tienes
          ack: 0,                    // opcional: 0/1/2 según tu convención
          channel: "meta",           // <- muy importante para diferenciar del baileys
          // queueId, ticketTrakingId, isPrivate... si aplican
        }
      });
      

    // 3) actualizar ticket últimos datos

    await ticket.update({
        lastMessage: body,
        unreadMessages: 1
      });

    // 4) emitir a front (ajusta canal a tu convención)
    const io = getIO();
    io.to(`company-${companyId}`).emit("appMessage", {
      action: "create",
      message: {
        id: msg.id,
        ticketId: ticket.id,
        companyId,
        contactId: contact.id,
        body: msg.body,
        mediaType: msg.mediaType,
        mediaUrl: msg.mediaUrl,
        fromMe: msg.fromMe,
        read: msg.read,
        createdAt: msg.createdAt,
        provider: "meta",
        externalId
      }
    });

    return msg;
  } catch (e) {
    Sentry.captureException(e);
    throw e;
  }
}
