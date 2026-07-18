/**
 * processMetaMessageEdit
 *
 * Procesa mensajes editados de Meta WhatsApp Cloud API.
 * Estructura del webhook de edicion:
 * {
 *   "from": "...",
 *   "to": "...",
 *   "id": "wamid.NEW",        // ID nuevo (descartado, no creamos mensaje nuevo)
 *   "type": "edit",
 *   "edit": {
 *     "original_message_id": "wamid.ORIGINAL",
 *     "message": {
 *       "type": "text",
 *       "text": { "body": "nuevo texto" }
 *     }
 *   }
 * }
 *
 * Soporta:
 * - Mensajes entrantes editados por el cliente (channel: messages)
 * - Echoes editados desde WA Business App (channel: smb_message_echoes)
 *
 * Comportamiento:
 * 1. Detecta si el mensaje es de tipo "edit"
 * 2. Busca el mensaje original por wid = edit.original_message_id
 * 3. Actualiza body + isEdited = true (NO crea mensaje nuevo)
 * 4. Actualiza ticket.lastMessage si era el ultimo
 * 5. Emite Socket.IO para refrescar UI en tiempo real
 *
 * Retorna:
 * - true si era un edit y fue procesado (se debe SKIP el flujo normal)
 * - false si no era un edit (continuar con el flujo normal)
 */
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import { getIO } from "../../libs/socket";
import { logInfo, logError, logWarn } from "../../config/logger";

interface EditMessagePayload {
  type?: string;
  edit?: {
    original_message_id?: string;
    message?: {
      type?: string;
      text?: { body?: string };
      image?: { caption?: string };
      video?: { caption?: string };
      document?: { caption?: string; filename?: string };
    };
  };
  id?: string;
  from?: string;
  to?: string;
  timestamp?: string;
}

/**
 * Extrae el nuevo body del payload de edicion segun el tipo de contenido editado
 */
const extractEditedBody = (editMessage: any): string => {
  if (!editMessage) return "";
  const t = editMessage?.type;
  switch (t) {
    case "text":
      return editMessage?.text?.body || "";
    case "image":
      return editMessage?.image?.caption || "[Imagen]";
    case "video":
      return editMessage?.video?.caption || "[Video]";
    case "document":
      return editMessage?.document?.caption || editMessage?.document?.filename || "[Documento]";
    default:
      return editMessage?.text?.body || "";
  }
};

/**
 * Procesa un posible mensaje editado de Meta
 * @param metaMsg - El objeto message del webhook
 * @param companyId - ID de la empresa
 * @returns true si fue procesado como edit, false si no era un edit
 */
export const processMetaMessageEdit = async (
  metaMsg: EditMessagePayload,
  companyId: number
): Promise<boolean> => {
  // Detectar si es un mensaje editado
  if (metaMsg?.type !== "edit" || !metaMsg?.edit) {
    return false;
  }

  const originalMessageId = metaMsg.edit.original_message_id;
  if (!originalMessageId) {
    logWarn(`[META-EDIT] ⚠️ Webhook tipo edit sin original_message_id. Payload: ${JSON.stringify(metaMsg).substring(0, 300)}`);
    return false;
  }

  const newBody = extractEditedBody(metaMsg.edit.message);
  if (!newBody) {
    logWarn(`[META-EDIT] ⚠️ No se pudo extraer body editado del payload`);
    return false;
  }

  logInfo(`[META-EDIT] ✏️ Procesando edicion de mensaje wid=${originalMessageId} | nuevo body: "${newBody.substring(0, 80)}"`);

  try {
    // Buscar el mensaje original por wid
    const originalMessage = await Message.findOne({
      where: { wid: originalMessageId, companyId },
      include: [
        {
          model: Ticket,
          as: "ticket",
          required: false,
        },
      ],
    });

    if (!originalMessage) {
      logWarn(`[META-EDIT] ⚠️ Mensaje original no encontrado: wid=${originalMessageId}, companyId=${companyId}`);
      // No es un error fatal - el mensaje pudo haber llegado antes que se registrara el original
      // Devolvemos true para que NO se cree un nuevo mensaje con body "[edit]"
      return true;
    }

    const previousBody = originalMessage.body;

    // Actualizar el mensaje con el nuevo body y marcar como editado
    await originalMessage.update({
      body: newBody,
      isEdited: true,
      // Preservar el dataJson original pero agregar info de edicion
      dataJson: JSON.stringify({
        ...JSON.parse(originalMessage.dataJson || "{}"),
        edits: [
          ...((JSON.parse(originalMessage.dataJson || "{}")?.edits) || []),
          {
            previousBody,
            editedAt: new Date().toISOString(),
            editId: metaMsg.id,
            timestamp: metaMsg.timestamp,
          },
        ],
      }),
    });

    logInfo(`[META-EDIT] ✅ Mensaje ${originalMessage.id} actualizado: "${previousBody?.substring(0, 40)}" → "${newBody.substring(0, 40)}"`);

    // Si el mensaje editado era el ultimo del ticket, actualizar lastMessage
    if (originalMessage.ticketId) {
      const ticket = (originalMessage as any).ticket || await Ticket.findByPk(originalMessage.ticketId);
      if (ticket) {
        const lastMessage = await Message.findOne({
          where: { ticketId: ticket.id, companyId },
          order: [["createdAt", "DESC"]],
        });
        if (lastMessage && lastMessage.id === originalMessage.id) {
          await ticket.update({ lastMessage: newBody });
        }

        // Emitir Socket.IO para refrescar UI
        try {
          const io = getIO();
          io.of(String(companyId))
            .emit(`company-${companyId}-appMessage`, {
              action: "update",
              message: originalMessage,
              ticket,
              contact: ticket.contact,
            });
          logInfo(`[META-EDIT] 📡 Socket emitido para mensaje ${originalMessage.id}`);
        } catch (socketErr: any) {
          logWarn(`[META-EDIT] ⚠️ No se pudo emitir socket: ${socketErr.message}`);
        }
      }
    }

    return true;
  } catch (err: any) {
    logError(`[META-EDIT] ❌ Error procesando edicion: ${err.message}`);
    // Devolvemos true para que NO se cree un mensaje basura con body "[edit]"
    return true;
  }
};

export default processMetaMessageEdit;
