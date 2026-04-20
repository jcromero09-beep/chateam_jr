import { proto, WASocket } from "@whiskeysockets/baileys";
import axios from "axios";
import AppError from "../../errors/AppError";
import GetWbotMessage from "../../helpers/GetWbotMessage";
import { getWbot } from "../../libs/wbot";
import { sessionRegistry } from "../../libs/sessionRegistry";
import logger from "../../utils/logger";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import MetaMessageDeleteService from "../MetaServices/MetaMessageDeleteService";

interface DeleteWhatsAppMessageResult {
  id: number;
  isPrivate?: boolean;
}

const DeleteWhatsAppMessage = async (
  messageId: string,
  companyId?: string | number
): Promise<DeleteWhatsAppMessageResult> => {
  const message = await Message.findOne({
    where: {
      id: messageId,
      ...(companyId !== undefined && { companyId })
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

  // Validar que el mensaje no este ya eliminado
  if (message.isDeleted) {
    throw new AppError("Este mensaje ya fue eliminado.");
  }

  // Validar que el mensaje sea propio (fromMe)
  if (!message.fromMe) {
    throw new AppError("Solo se pueden eliminar mensajes propios.", 403);
  }

  const { ticket, whatsapp } = message;

  // ─── Routing por provider ───
  if (whatsapp && whatsapp.provider === "meta" && whatsapp.channel === "meta") {
    // Meta Cloud API: NO soporta delete real de mensajes.
    // Marcar en BD via el servicio placeholder.
    console.log(`[DeleteWhatsAppMessage] Provider Meta detectado — marcando mensaje ${messageId} como eliminado en BD`);
    await MetaMessageDeleteService({
      messageId: Number(messageId),
      companyId: Number(message.companyId)
    });
    await message.update({ isDeleted: true, messageStatus: "deleted" });
    await message.reload();
    return message as DeleteWhatsAppMessageResult;
  }

  // ─── Baileys: delete real con soporte multi-nodo ───
  if (!message.isPrivate) {
    try {
      const jsonStringToParse = JSON.parse(message.dataJson);
      const messageKey = jsonStringToParse.key;
      const remoteJid = message.remoteJid;
      const whatsappId = ticket.whatsappId;

      // Determinar si la sesión está en este nodo o en otro
      const nodeInfo = await sessionRegistry.lookup(whatsappId);
      const isLocal = !nodeInfo || nodeInfo.nodeId === sessionRegistry.getNodeId();

      if (isLocal) {
        // Sesión local: ejecutar directamente
        try {
          const wbot = getWbot(whatsappId);
          await (wbot as WASocket).sendMessage(remoteJid, { delete: messageKey });
          logger.info(`[DeleteWhatsAppMessage] Delete local exitoso para mensaje ${messageId}`);
        } catch (localErr: any) {
          logger.warn(`[DeleteWhatsAppMessage] Delete local falló: ${localErr.message}`);
        }
      } else {
        // Sesión remota: HTTP directo al endpoint dedicado del nodo correcto
        try {
          await axios.post(
            `http://127.0.0.1:${nodeInfo.port}/internal/delete-message`,
            { whatsappId, remoteJid, messageKey },
            { timeout: 15000, headers: { "Content-Type": "application/json" } }
          );
          logger.info(`[DeleteWhatsAppMessage] Delete remoto exitoso via ${nodeInfo.nodeId}:${nodeInfo.port} para mensaje ${messageId}`);
        } catch (remoteErr: any) {
          logger.warn(`[DeleteWhatsAppMessage] Delete remoto falló: ${remoteErr.message}`);
        }
      }
    } catch (err) {
      logger.warn(`[DeleteWhatsAppMessage] Error parseando dataJson o registry: ${err}`);
      // No lanzar error si falla el delete real — marcar en BD de todas formas
    }

    await message.update({ isDeleted: true, messageStatus: "deleted" });
  } else {
    // Para mensajes privados, marcar como deleted para evitar reenvios
    await message.update({ messageStatus: "deleted" });
  }

  await message.reload();

  // Indicar al controller si es mensaje privado para destruir el registro
  const result = message as DeleteWhatsAppMessageResult;
  result.isPrivate = message.isPrivate;

  return result;
};

export default DeleteWhatsAppMessage;
