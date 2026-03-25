import { proto, WASocket } from "@whiskeysockets/baileys";
import AppError from "../../errors/AppError";
import GetWbotMessage from "../../helpers/GetWbotMessage";
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

  // ─── Baileys: try delete real ───
  if (!message.isPrivate) {
    try {
      const messageToDelete = await GetWbotMessage(ticket, messageId);
      const menssageDelete = messageToDelete as Message;
      const jsonStringToParse = JSON.parse(menssageDelete.dataJson);

      // ALTERAÇÃO PARA BAILEYS 5.0
      // El delete real esta comentado, se marca en BD
      // await (wbot as WASocket).sendMessage(menssageDelete.remoteJid, {
      //   delete: jsonStringToParse.key
      // })

    } catch (err) {
      console.log(err);
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
