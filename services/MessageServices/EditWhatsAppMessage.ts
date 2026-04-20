import { WASocket, WAMessage } from "@whiskeysockets/baileys";
import * as Sentry from "@sentry/node";
import axios from "axios";
import AppError from "../../errors/AppError";
import { getWbot } from "../../libs/wbot";
import { sessionRegistry } from "../../libs/sessionRegistry";
import logger from "../../utils/logger";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import MetaMessageEditService from "../MetaServices/MetaMessageEditService";

interface Request {
  messageId: string;
  body: string;
  companyId: number;
}

const EditWhatsAppMessage = async ({
  messageId,
  body,
  companyId
}: Request): Promise<{ ticket: Ticket; message: Message }> => {

  const message = await Message.findOne({
    where: {
      id: messageId,
      companyId
    },
    include: [
      {
        model: Ticket,
        as: "ticket",
        include: ["contact"]
      },
      {
        model: Contact,
        as: "contact"
      },
      {
        model: Whatsapp,
        as: "whatsapp",
        attributes: ["id", "provider", "channel", "name"]
      }
    ]
  });

  if (!message) {
    throw new AppError("No message found with this ID.");
  }

  // Validar que el mensaje no este eliminado
  if (message.isDeleted) {
    throw new AppError("No se puede editar un mensaje eliminado.", 400);
  }

  // Validar que el mensaje no sea un reenvio
  if (message.isForwarded) {
    throw new AppError("No se pueden editar mensajes reenviados.", 400);
  }

  // Validar que el mensaje sea propio (fromMe)
  if (!message.fromMe) {
    throw new AppError("Solo se pueden editar mensajes propios.", 403);
  }

  const { ticket, whatsapp } = message;

  // ─── Routing por provider ───
  if (whatsapp && whatsapp.provider === "meta" && whatsapp.channel === "meta") {
    // Meta Cloud API: NO soporta edicion real de mensajes.
    // Marcar en BD via el servicio placeholder.
    console.log(`[EditWhatsAppMessage] Provider Meta detectado — marcando mensaje ${messageId} como editado en BD`);
    await MetaMessageEditService({
      messageId: Number(messageId),
      companyId: Number(companyId),
      newBody: body
    });
    await message.update({ body, isEdited: true });
    await ticket.update({ lastMessage: body });
    await ticket.reload();
    await message.reload();
    return { ticket, message };
  }

  // ─── Baileys: edit real con soporte multi-nodo ───
  try {
    const msg = JSON.parse(message.dataJson);
    const messageKey = msg.key;
    const remoteJid = message.remoteJid;
    const whatsappId = ticket.whatsappId;

    // Determinar si la sesión está en este nodo o en otro
    const nodeInfo = await sessionRegistry.lookup(whatsappId);
    const isLocal = !nodeInfo || nodeInfo.nodeId === sessionRegistry.getNodeId();

    if (isLocal) {
      // Sesión local: ejecutar directamente
      const wbot = getWbot(whatsappId);
      await (wbot as WASocket).sendMessage(remoteJid, {
        text: body,
        edit: messageKey,
      }, {});
      logger.info(`[EditWhatsAppMessage] Edit local exitoso para mensaje ${messageId}`);
    } else {
      // Sesión remota: HTTP directo al endpoint dedicado del nodo correcto
      await axios.post(
        `http://127.0.0.1:${nodeInfo.port}/internal/edit-message`,
        { whatsappId, remoteJid, messageKey, newBody: body },
        { timeout: 15000, headers: { "Content-Type": "application/json" } }
      );
      logger.info(`[EditWhatsAppMessage] Edit remoto exitoso via ${nodeInfo.nodeId}:${nodeInfo.port} para mensaje ${messageId}`);
    }

    await message.update({ body, isEdited: true });
    await ticket.update({ lastMessage: body });
    await ticket.reload();
    await message.reload();

    return { ticket, message };
  } catch (err) {
    Sentry.captureException(err);
    logger.error(`[EditWhatsAppMessage] Error editando mensaje ${messageId}: ${err}`);
    throw new AppError("ERR_EDITING_WAPP_MSG");
  }
};

export default EditWhatsAppMessage;
