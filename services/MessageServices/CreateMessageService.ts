import { getIO } from "../../libs/socket";
import { Op } from "sequelize";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import Tag from "../../models/Tag";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
import AIAgentLog from "../../models/AIAgentLog";
import { add as addJob } from "../../queues";
import logger from "../../utils/logger";
import {
  logDedupe as coexLogDedupe,
  logCoexError
} from "../../utils/coexistenceLogger";
import { updateTraceContext } from "../../utils/traceContext";

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
  sourceChannel?: string;
  dataJson?: string;
  /**
   * FASE 1 Coexistencia — proveedor físico real del mensaje.
   * Si no se provee, se infiere desde Ticket.whatsapp.channel/provider.
   * Valores: 'meta' | 'baileys' | 'telegram' | 'facebook' | 'instagram' | 'tiktok' | 'webchat'
   */
  provider?: string;
  /**
   * FASE 1 Coexistencia — id del mensaje en el proveedor externo.
   * Para Meta: wamid. Para Baileys: msg.key.id. Para Telegram: msg.message_id.
   * Usado para reconciliación de acks y dedupe cross-provider.
   */
  externalId?: string;
}

/**
 * FASE 1 Coexistencia — Infiere provider y sourceChannel desde el Whatsapp
 * asociado al Ticket cuando el caller no los especifica. Esto rellena
 * columnas que hasta ahora quedaban 100% NULL en producción (6063/6217
 * filas sin sourceChannel; 6217/6217 sin provider según auditoría psql).
 */
const inferProviderMetadata = async (
  messageData: MessageData
): Promise<{ provider?: string; sourceChannel?: string }> => {
  if (messageData.provider && messageData.sourceChannel) {
    return {
      provider: messageData.provider,
      sourceChannel: messageData.sourceChannel
    };
  }
  try {
    const ticket = await Ticket.findByPk(messageData.ticketId, {
      attributes: ["id", "whatsappId", "channel"],
      include: [
        {
          model: Whatsapp,
          attributes: ["id", "channel", "provider"]
        }
      ]
    });
    if (!ticket) return {};

    const waChannel = (ticket as any)?.whatsapp?.channel;
    const waProvider = (ticket as any)?.whatsapp?.provider;
    let provider = messageData.provider;
    let sourceChannel = messageData.sourceChannel;

    if (!provider) {
      // Heurística: Meta cuando canal="meta"; Baileys cuando canal="whatsapp"
      if (waChannel === "meta") provider = "meta";
      else if (waChannel === "whatsapp") provider = "baileys";
      else if (waChannel === "telegram") provider = "telegram";
      else if (waChannel === "facebook") provider = "facebook";
      else if (waChannel === "instagram") provider = "instagram";
      else if (waChannel === "tiktok") provider = "tiktok";
      else if (waChannel === "webchat") provider = "webchat";
    }

    if (!sourceChannel) {
      // Para canales WhatsApp: distinguir cloud_api (Meta) vs baileys
      if (provider === "meta") sourceChannel = "cloud_api";
      else if (provider === "baileys") sourceChannel = "baileys";
      // Otros canales: no se usa sourceChannel (columna específica de WA coex)
    }

    return { provider, sourceChannel };
  } catch (err: any) {
    logger.warn(
      `[CreateMessage] Error infiriendo provider/sourceChannel para ticket=${messageData.ticketId}: ${err?.message}`
    );
    return {};
  }
};
interface Request {
  messageData: MessageData;
  companyId: number;
}

const CreateMessageService = async ({
  messageData,
  companyId
}: Request): Promise<Message> => {
  //   wid: messageData.wid,
  //   ticketId: messageData.ticketId,
  //   body: messageData.body?.substring(0, 50) + (messageData.body?.length > 50 ? "..." : ""),
  //   fromMe: messageData.fromMe,
  //   mediaType: messageData.mediaType,
  //   mediaUrl: messageData.mediaUrl
  // });

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

  // FASE 1 Coexistencia — Inferir provider/sourceChannel si no vinieron
  const inferred = await inferProviderMetadata(messageData);
  const enrichedData: any = {
    ...messageData,
    companyId,
    ...(messageData.provider === undefined && inferred.provider
      ? { provider: inferred.provider }
      : {}),
    ...(messageData.sourceChannel === undefined && inferred.sourceChannel
      ? { sourceChannel: inferred.sourceChannel }
      : {}),
    // externalId coincide con wid para Meta/Baileys (mismo identificador del proveedor)
    ...(messageData.externalId === undefined && messageData.wid &&
    !messageData.wid.startsWith("PENDING_") &&
    !messageData.wid.startsWith("PVT")
      ? { externalId: messageData.wid }
      : {})
  };

  // Propagar al trace context ticketId para correlacionar subsiguientes logs
  if (messageData.ticketId) {
    updateTraceContext({ ticketId: messageData.ticketId });
  }

  // Buscar mensaje existente por wid+companyId para evitar duplicados
  const existingMessage = await Message.findOne({
    where: { wid: messageData.wid, companyId }
  });

  if (existingMessage) {
    // Dedupe por wid — log estructurado para observabilidad FASE 1
    coexLogDedupe({
      provider: (enrichedData.provider as any) || "unknown",
      companyId,
      ticketId: messageData.ticketId,
      wid: messageData.wid,
      reason: "message_wid_already_exists",
      dropped: false // no se descarta, se actualiza ack/read si corresponde
    });
    // Solo actualizar campos que pueden cambiar (ack, read, messageStatus)
    const updateFields: any = {};
    if (messageData.ack !== undefined && messageData.ack > existingMessage.ack) {
      updateFields.ack = messageData.ack;
    }
    if (messageData.read !== undefined && messageData.read !== existingMessage.read) {
      updateFields.read = messageData.read;
    }
    // Si es un mensaje saliente y estaba como pending, actualizar a sent
    if (messageData.fromMe && existingMessage.messageStatus === 'pending') {
      updateFields.messageStatus = 'sent';
      updateFields.sentAt = new Date();
    }
    // Backfill: si el mensaje existente no tiene provider/sourceChannel y ahora los inferimos, los escribimos
    if (!existingMessage.get("provider") && enrichedData.provider) {
      updateFields.provider = enrichedData.provider;
    }
    if (!existingMessage.get("sourceChannel") && enrichedData.sourceChannel) {
      updateFields.sourceChannel = enrichedData.sourceChannel;
    }
    if (!existingMessage.get("externalId") && enrichedData.externalId) {
      updateFields.externalId = enrichedData.externalId;
    }
    if (Object.keys(updateFields).length > 0) {
      await existingMessage.update(updateFields);
    }
  } else {
    try {
      await Message.create(enrichedData);
    } catch (err: any) {
      // Si otra transacción creó el mensaje concurrentemente (UNIQUE constraint
      // en idx_messages_wid_companyid_unique) → tratamos como duplicado.
      if (err?.name === "SequelizeUniqueConstraintError") {
        coexLogDedupe({
          provider: (enrichedData.provider as any) || "unknown",
          companyId,
          ticketId: messageData.ticketId,
          wid: messageData.wid,
          reason: "unique_constraint_race",
          dropped: true
        });
      } else {
        logCoexError({
          provider: (enrichedData.provider as any) || "unknown",
          companyId,
          ticketId: messageData.ticketId,
          stage: "CreateMessageService.create",
          err: { message: err?.message, name: err?.name }
        });
        throw err;
      }
    }
  }

  // ✅ Hook: Detectar si un agente humano envía mensaje tras respuesta IA
  // Se detecta cuando: fromMe=true (agente), isPrivate=true (panel de chat, no webhook WhatsApp)
  if (messageData.fromMe && messageData.isPrivate) {
    try {
      const ticket = await Ticket.findByPk(messageData.ticketId, {
        attributes: ["id", "contactId", "companyId"]
      });
      if (ticket?.contactId) {
        // Verificar si hay un AIAgentLog reciente (últimos 3 min) sin corrección
        const recentAILog = await AIAgentLog.findOne({
          where: {
            ticketId: messageData.ticketId,
            humanCorrection: null,
            createdAt: {
              [Op.gte]: new Date(Date.now() - 3 * 60 * 1000) // 3 min de ventana
            }
          },
          order: [["createdAt", "DESC"]],
          limit: 1
        });

        if (recentAILog) {
          await addJob("HumanCorrectionExtractor", {
            humanMessageId: 0, // se ignora, el job busca por ticketId
            ticketId: messageData.ticketId,
            companyId,
            humanMessageContent: messageData.body || "",
            humanMessageTimestamp: new Date()
          });
          logger.info(
            `[CreateMessage] HumanCorrectionExtractorJob encolado: ticket=${messageData.ticketId}, ` +
            `company=${companyId}, iaLog=${recentAILog.id}`
          );
        }
      }
    } catch (hookErr: any) {
      logger.warn(`[CreateMessage] Error en hook HumanCorrection: ${hookErr.message}`);
    }
  }

  const message = await Message.findOne({
    where: {
      wid: messageData.wid,
      companyId
    },
    include: messageIncludes
  });

  if (message.ticket.queueId !== null && message.queueId === null) {
    await message.update({ queueId: message.ticket.queueId });
  }

  if (message.isPrivate) {
    await message.update({ wid: `PVT${message.id}` });
    await message.ticket.update({ updatedAt: new Date() });
    await message.ticket.reload();
  }

  if (!message) {
    throw new Error("ERR_CREATING_MESSAGE");
  }


  const io = getIO();

  if (!messageData?.ticketImported) {
    const socketAction = existingMessage ? "update" : "create";

    // Convertir Sequelize a objeto plano para asegurar que ticketId esté incluido
    const plainMessage = message.get ? message.get({ plain: true }) : message;

    io.of(String(companyId))
      .emit(`company-${companyId}-appMessage`, {
        action: socketAction,
        message: {
          ...plainMessage,
          ticketId: message.ticketId // Asegurar que ticketId esté incluido
        },
        ticket: message.ticket,
        contact: message.ticket.contact
      });
  }


  return message;
};

export default CreateMessageService;
