import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import logger from "../../utils/logger";

/**
 * OmnichannelDispatcher — Capa unificadora de envío multi-canal
 *
 * PRIMERA OLA — Feature 7: Conmutación de canal
 *
 * Abstrae el envío de mensajes salientes sobre los 5 canales:
 *   - whatsapp (Baileys + Cloud API; el ruteo interno lo hace SendWhatsAppMessage)
 *   - meta (WhatsApp Cloud API directo, channel="meta")
 *   - facebook (Messenger)
 *   - instagram
 *   - telegram
 *
 * Detecta el canal automáticamente desde ticket.channel, o lo permite forzar
 * vía DispatchOptions.channel (útil para campañas multi-canal).
 *
 * Multi-tenant: el ticket lleva companyId; el dispatcher no toca otros tenants.
 *
 * Uso:
 *   await OmnichannelDispatcher.dispatch({
 *     ticketId: 123,
 *     contactId: 45,
 *     companyId: 1,
 *     message: "Hola Juan, tu pedido está listo 🎉",
 *     origin: "ai_followup"   // 'manual' | 'ai_followup' | 'campaign' | 'flow'
 *   });
 */

// ─── Tipos públicos ────────────────────────────────────────────────────────
export type SupportedChannel =
  | "whatsapp"
  | "meta"
  | "facebook"
  | "instagram"
  | "telegram";

export type DispatchOrigin =
  | "manual"
  | "ai_followup"
  | "ai_response"
  | "campaign"
  | "flow"
  | "automation";

export interface DispatchInput {
  ticketId: number;
  contactId: number;
  companyId: number;
  message: string;
  origin: DispatchOrigin;
  /** Forzar canal — si se omite, se infiere del ticket */
  channel?: SupportedChannel;
  /** Quien dispara el envío (para auditoría) */
  triggeredBy?: string;
}

export interface DispatchResult {
  success: boolean;
  ticketId: number;
  channel: SupportedChannel | "unknown";
  provider?: string; // Para WhatsApp: 'baileys' | 'meta'
  externalId?: string; // ID de mensaje devuelto por el proveedor
  latencyMs: number;
  origin: DispatchOrigin;
  error?: string;
}

// ─── Resolver canal ────────────────────────────────────────────────────────
const resolveChannel = (
  ticket: Ticket,
  forced?: SupportedChannel
): SupportedChannel | "unknown" => {
  if (forced) return forced;

  const ticketChannel = (ticket as any).channel as string | undefined;
  if (!ticketChannel) return "unknown";

  // Normalización defensiva
  const normalized = ticketChannel.toLowerCase().trim();

  if (normalized === "whatsapp") return "whatsapp";
  if (normalized === "meta") return "meta";
  if (normalized === "facebook" || normalized === "messenger") return "facebook";
  if (normalized === "instagram") return "instagram";
  if (normalized === "telegram") return "telegram";

  logger.warn(`[OmnichannelDispatcher] Canal desconocido: "${ticketChannel}"`);
  return "unknown";
};

// ─── Adapters por canal ────────────────────────────────────────────────────

/** Mapea el origin del dispatcher a requestedBy del router de coexistencia. */
const originToRequestedBy = (origin: DispatchOrigin): string => {
  switch (origin) {
    case "manual": return "agent";
    case "ai_followup": return "followup";
    case "ai_response": return "ai";
    case "campaign": return "campaign";
    case "flow":
    case "automation":
    default:
      return "automation";
  }
};

/**
 * WhatsApp (Baileys + Cloud API). En COEXISTENCIA pasa por el router central
 * (un solo intento lógico + fallback Meta↔Baileys); si no, legacy
 * SendWhatsAppMessage. La decisión vive en CoexistenceAwareTextSender.
 */
const sendWhatsApp = async (
  ticket: Ticket,
  message: string,
  origin: DispatchOrigin
): Promise<{ externalId?: string; provider: string }> => {
  const whatsapp = ticket.whatsappId
    ? await Whatsapp.findByPk(ticket.whatsappId)
    : null;

  if (!whatsapp) {
    throw new Error("WhatsApp connection no asignada al ticket");
  }

  const { sendTicketText } = await import(
    "../CoexistenceServices/CoexistenceAwareTextSender"
  );

  const res = await sendTicketText({
    ticket,
    body: message,
    companyId: (ticket as any).companyId,
    requestedBy: originToRequestedBy(origin) as any
  });

  return {
    externalId: res.providerMessageId || undefined,
    provider: res.provider
  };
};

/** Facebook Messenger */
const sendFacebook = async (
  ticket: Ticket,
  message: string
): Promise<{ externalId?: string; provider: string }> => {
  const sendFacebookMessage = (
    await import("../FacebookServices/sendFacebookMessage")
  ).default;

  const result = await sendFacebookMessage({
    body: message,
    ticket
  } as any);

  return {
    externalId: result?.message_id,
    provider: "facebook_graph"
  };
};

/** Instagram */
const sendInstagram = async (
  ticket: Ticket,
  message: string
): Promise<{ externalId?: string; provider: string }> => {
  const sendIGMessage = (
    await import("../FacebookServices/igMessageListener")
  ).default;

  const result = await sendIGMessage({
    body: message,
    ticket
  } as any);

  return {
    externalId: result?.message_id,
    provider: "instagram_graph"
  };
};

/** Telegram */
const sendTelegram = async (
  ticket: Ticket,
  message: string
): Promise<{ externalId?: string; provider: string }> => {
  const SendTelegramMessage = (
    await import("../TelegramService/SendTelegramMessage")
  ).default;

  const result = await SendTelegramMessage({
    body: message,
    ticket
  } as any);

  return {
    externalId: (result as any)?.messageId || (result as any)?.message_id,
    provider: "telegram_bot"
  };
};

// ─── Punto de entrada principal ────────────────────────────────────────────
const dispatch = async (input: DispatchInput): Promise<DispatchResult> => {
  const startTime = Date.now();
  const { ticketId, message, origin, channel: forcedChannel } = input;

  // Cargar ticket con relaciones necesarias
  const ticket = await Ticket.findByPk(ticketId, {
    include: [
      { model: Contact, as: "contact" },
      { model: Whatsapp, as: "whatsapp" }
    ]
  });

  if (!ticket) {
    return {
      success: false,
      ticketId,
      channel: "unknown",
      latencyMs: Date.now() - startTime,
      origin,
      error: "ticket_not_found"
    };
  }

  // Validar tenant: el ticket debe pertenecer al companyId solicitado
  if ((ticket as any).companyId !== input.companyId) {
    logger.error(
      `[OmnichannelDispatcher] ⛔ Tenant mismatch: ticket=${ticketId} ` +
        `belongs to company ${(ticket as any).companyId}, ` +
        `requested by company ${input.companyId}`
    );
    return {
      success: false,
      ticketId,
      channel: "unknown",
      latencyMs: Date.now() - startTime,
      origin,
      error: "tenant_mismatch"
    };
  }

  const channel = resolveChannel(ticket, forcedChannel);

  if (channel === "unknown") {
    return {
      success: false,
      ticketId,
      channel,
      latencyMs: Date.now() - startTime,
      origin,
      error: "channel_unresolved"
    };
  }

  try {
    let sendResult: { externalId?: string; provider: string };

    switch (channel) {
      case "whatsapp":
      case "meta":
        sendResult = await sendWhatsApp(ticket, message, origin);
        break;
      case "facebook":
        sendResult = await sendFacebook(ticket, message);
        break;
      case "instagram":
        sendResult = await sendInstagram(ticket, message);
        break;
      case "telegram":
        sendResult = await sendTelegram(ticket, message);
        break;
      default:
        throw new Error(`Canal no soportado: ${channel}`);
    }

    // Actualizar lastMessage en el ticket (no rompe nada existente)
    try {
      await ticket.update({ lastMessage: message });
    } catch (updateErr: any) {
      logger.warn(
        `[OmnichannelDispatcher] No pude actualizar lastMessage ` +
          `ticket=${ticketId}: ${updateErr.message}`
      );
    }

    const latencyMs = Date.now() - startTime;
    logger.info(
      `[OmnichannelDispatcher] ✅ ${channel}/${sendResult.provider} ` +
        `ticket=${ticketId} origin=${origin} latency=${latencyMs}ms`
    );

    return {
      success: true,
      ticketId,
      channel,
      provider: sendResult.provider,
      externalId: sendResult.externalId,
      latencyMs,
      origin
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    logger.error(
      `[OmnichannelDispatcher] ❌ ${channel} ticket=${ticketId} ` +
        `origin=${origin}: ${err.message}`
    );
    return {
      success: false,
      ticketId,
      channel,
      latencyMs,
      origin,
      error: err.message
    };
  }
};

// ─── Helper: capacidades del canal ─────────────────────────────────────────
export const CHANNEL_CAPABILITIES: Record<
  SupportedChannel,
  { text: boolean; media: boolean; templates: boolean; reactions: boolean }
> = {
  whatsapp: { text: true, media: true, templates: true, reactions: true },
  meta: { text: true, media: true, templates: true, reactions: true },
  facebook: { text: true, media: true, templates: false, reactions: false },
  instagram: { text: true, media: true, templates: false, reactions: false },
  telegram: { text: true, media: true, templates: false, reactions: true }
};

// ─── Helper: lista canales disponibles para un contacto ────────────────────
const getAvailableChannels = async (
  contactId: number,
  companyId: number
): Promise<SupportedChannel[]> => {
  // Busca tickets activos del contacto en distintos canales
  const tickets = await Ticket.findAll({
    where: { contactId, companyId } as any,
    attributes: ["channel"]
  });

  const channels = new Set<SupportedChannel>();
  for (const t of tickets) {
    const c = ((t as any).channel || "").toLowerCase();
    if (c === "whatsapp") channels.add("whatsapp");
    if (c === "meta") channels.add("meta");
    if (c === "facebook") channels.add("facebook");
    if (c === "instagram") channels.add("instagram");
    if (c === "telegram") channels.add("telegram");
  }

  return Array.from(channels);
};

export default {
  dispatch,
  resolveChannel,
  getAvailableChannels,
  CHANNEL_CAPABILITIES
};
