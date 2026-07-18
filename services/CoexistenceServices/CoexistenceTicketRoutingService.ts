/**
 * CoexistenceTicketRoutingService — Fuente ÚNICA de verdad de coexistencia Meta + Baileys.
 *
 * Trata Meta Cloud API y Baileys como DOS TRANSPORTES del MISMO WhatsApp cuando
 * están en coexistencia (conexiones hermanas). Decide:
 *   - quién es la conexión hermana (resolveCoexistencePair / isCoexistenceSibling),
 *   - dónde debe vivir el ticket canónico (resolveTicketOwner),
 *   - si un evento de un proveedor debe procesarse o ignorarse (shouldDropProviderEvent),
 *   - cómo resolver/crear el ticket canónico único (resolveOrCreateCanonicalTicket),
 *   - cómo cambiar el proveedor dueño del ticket (switchTicketOwner).
 *
 * DISEÑO: facade fino. NO reimplementa lógica probada — reutiliza
 * ConversationResolverService, OutboundRoutingService y FindOrCreateTicketService.
 * Es ADITIVO: no rompe los call-sites legacy existentes.
 *
 * BD SAGRADA: sólo INSERT / UPDATE. Nunca DELETE/DROP/TRUNCATE.
 */
import { Op } from "sequelize";

import Whatsapp from "../../models/Whatsapp";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import Contact from "../../models/Contact";
import UnifiedConversation from "../../models/UnifiedConversation";
import logger from "../../utils/logger";
import { getIO } from "../../libs/socket";

import ShowTicketService from "../TicketServices/ShowTicketService";
import FindOrCreateTicketService, {
  FindOrCreateTicketCoexInput
} from "../TicketServices/FindOrCreateTicketService";
import * as ConversationResolverService from "./ConversationResolverService";
import { resolveProviderTarget } from "./OutboundRoutingService";

export type CoexProvider = "meta" | "baileys";

export interface CoexistencePair {
  /** Conexión Meta hermana (channel='meta'), o null si no aplica. */
  metaWhatsapp: Whatsapp | null;
  /** Conexión Baileys hermana (channel='whatsapp'), o null si no aplica. */
  baileysWhatsapp: Whatsapp | null;
  /** ¿Hay un par de coexistencia real (ambas conexiones + coexistenceEnabled)? */
  isCoexistence: boolean;
  /** Conexión que actúa como semilla del cálculo. */
  seed: Whatsapp;
}

const providerOf = (wa: Whatsapp | null | undefined): CoexProvider =>
  (wa as any)?.channel === "meta" ? "meta" : "baileys";

/**
 * Resuelve el PAR de coexistencia (Meta + Baileys) a partir de una conexión
 * semilla, en AMBOS sentidos del vínculo:
 *   - Meta.linkedWhatsappId = Baileys.id  (vínculo directo)
 *   - Baileys ← Meta (vínculo inverso: busca la Meta que apunta a este Baileys)
 *   - mismo número dentro de la empresa (último recurso)
 */
export const resolveCoexistencePair = async (
  seedWhatsapp: Whatsapp
): Promise<CoexistencePair> => {
  const seed = seedWhatsapp;
  const seedProvider = providerOf(seed);

  let metaWhatsapp: Whatsapp | null = seedProvider === "meta" ? seed : null;
  let baileysWhatsapp: Whatsapp | null = seedProvider === "baileys" ? seed : null;

  try {
    if (seedProvider === "baileys") {
      // Buscar la Meta hermana que apunta a este Baileys (vínculo inverso).
      metaWhatsapp = await Whatsapp.findOne({
        where: {
          companyId: (seed as any).companyId,
          linkedWhatsappId: (seed as any).id,
          channel: "meta",
          coexistenceEnabled: true
        } as any,
        order: [["updatedAt", "DESC"]]
      });
    } else {
      // Semilla Meta → su Baileys hermano por linkedWhatsappId (vínculo directo).
      const linkedId = (seed as any).linkedWhatsappId;
      if (linkedId) {
        baileysWhatsapp = await Whatsapp.findOne({
          where: { id: linkedId, companyId: (seed as Whatsapp).companyId } as any
        });
      }
    }

    // Último recurso: buscar hermana por mismo número en la empresa.
    if (seedProvider === "meta" && !baileysWhatsapp) {
      baileysWhatsapp = await resolveProviderTarget(seed, "baileys");
    }
    if (seedProvider === "baileys" && !metaWhatsapp) {
      const byNumber = await resolveProviderTarget(seed, "meta");
      if (byNumber && (byNumber as any).coexistenceEnabled) metaWhatsapp = byNumber;
    }
  } catch (err: any) {
    logger.warn(
      { err: err?.message, seedWhatsappId: (seed as any)?.id },
      "[CoexTicketRouting] resolveCoexistencePair fallo parcial"
    );
  }

  const isCoexistence =
    !!metaWhatsapp &&
    !!baileysWhatsapp &&
    (!!(metaWhatsapp as any).coexistenceEnabled ||
      !!(baileysWhatsapp as any).coexistenceEnabled);

  return { metaWhatsapp, baileysWhatsapp, isCoexistence, seed };
};

/**
 * ¿Son waA y waB transportes del mismo WhatsApp (conexiones hermanas)?
 */
export const isCoexistenceSibling = async (
  waA: Whatsapp,
  waB: Whatsapp
): Promise<boolean> => {
  if (!waA || !waB) return false;
  if (waA.id === waB.id) return false;
  if (waA.companyId !== waB.companyId) return false;
  const pair = await resolveCoexistencePair(waA);
  const ids = [pair.metaWhatsapp, pair.baileysWhatsapp]
    .filter(Boolean)
    .map(w => Number((w as any).id));
  return ids.includes(Number((waB as any).id));
};

/**
 * Decide qué conexión debe ser DUEÑA del ticket canónico (su transporte activo).
 *
 * Política (alineada con "Meta principal cuando coexistencia activa"):
 *   - force_meta / sendChannel=meta  → owner = Meta
 *   - force_baileys / sendChannel=baileys → owner = Baileys
 *   - auto: respeta sendChannel de la conexión coexistente; si Meta está
 *     configurada como principal, el owner por defecto es Meta.
 *
 * Devuelve la conexión dueña y el canal del ticket ('meta' | 'whatsapp').
 * Si no es coexistencia, devuelve la semilla tal cual (sin cambios).
 */
export const resolveTicketOwner = async (input: {
  seedWhatsapp: Whatsapp;
  requested?: CoexProvider | "auto";
}): Promise<{ owner: Whatsapp; channel: "meta" | "whatsapp"; provider: CoexProvider; isCoexistence: boolean }> => {
  const { seedWhatsapp } = input;
  const pair = await resolveCoexistencePair(seedWhatsapp);

  if (!pair.isCoexistence || !pair.metaWhatsapp || !pair.baileysWhatsapp) {
    const provider = providerOf(seedWhatsapp);
    return {
      owner: seedWhatsapp,
      channel: provider === "meta" ? "meta" : "whatsapp",
      provider,
      isCoexistence: false
    };
  }

  // Determinar provider preferido.
  let preferred: CoexProvider;
  if (input.requested === "meta" || input.requested === "baileys") {
    preferred = input.requested;
  } else {
    // sendChannel vive en la conexión Meta (config de coexistencia).
    const send = (pair.metaWhatsapp as any).sendChannel as string;
    preferred = send === "baileys" ? "baileys" : "meta"; // Meta principal por defecto
  }

  const owner = preferred === "meta" ? pair.metaWhatsapp : pair.baileysWhatsapp;
  return {
    owner,
    channel: preferred === "meta" ? "meta" : "whatsapp",
    provider: preferred,
    isCoexistence: true
  };
};

/**
 * Decide si un evento de un proveedor debe IGNORARSE para no duplicar
 * ticket/mensaje cuando el otro transporte es el canal activo.
 *
 * Reglas (idénticas a las que ya aplica el listener Baileys, centralizadas):
 *   - inbound (fromMe=false): se ignora el proveedor que NO es el receiveChannel.
 *   - outbound/echo (fromMe=true): se ignora el proveedor que NO es el sendChannel.
 *
 * @returns { drop, reason }
 */
export const shouldDropProviderEvent = async (input: {
  whatsapp: Whatsapp;
  eventProvider: CoexProvider;
  fromMe: boolean;
}): Promise<{ drop: boolean; reason: string }> => {
  const { whatsapp, eventProvider, fromMe } = input;
  const pair = await resolveCoexistencePair(whatsapp);

  if (!pair.isCoexistence || !pair.metaWhatsapp) {
    return { drop: false, reason: "no_coexistence" };
  }

  // La config de canales vive en la conexión Meta.
  const meta = pair.metaWhatsapp as any;
  const receiveChannel: string = meta.receiveChannel || "both";
  const sendChannel: string = meta.sendChannel || "meta";

  if (!fromMe) {
    // Inbound: si receiveChannel está fijado a un transporte y el evento
    // llegó por el otro → drop.
    if (receiveChannel === "meta" && eventProvider === "baileys") {
      return { drop: true, reason: "receive_channel_meta" };
    }
    if (receiveChannel === "baileys" && eventProvider === "meta") {
      return { drop: true, reason: "receive_channel_baileys" };
    }
    return { drop: false, reason: `receive_channel_${receiveChannel}` };
  }

  // Outbound / echo del staff.
  const sendProvider: CoexProvider =
    sendChannel === "baileys" ? "baileys" : "meta";
  if (eventProvider !== sendProvider) {
    return { drop: true, reason: `send_channel_${sendProvider}` };
  }
  return { drop: false, reason: `send_channel_${sendProvider}` };
};

/**
 * Resuelve la UnifiedConversation y crea/reutiliza el TICKET CANÓNICO ÚNICO,
 * delegando a ConversationResolverService + FindOrCreateTicketService.
 *
 * Es el atajo que deben usar los listeners (Meta inbound, smb_echoes, Baileys)
 * para garantizar un solo ticket por (cliente + número) en coexistencia.
 */
export const resolveOrCreateCanonicalTicket = async (input: {
  contact: Contact;
  whatsapp: Whatsapp;
  companyId: number;
  unreadMessages: number;
  inboundChannel: CoexProvider;
  channel: string; // 'meta' | 'whatsapp'
  settings: any;
  queueId?: number;
  userId?: number;
  groupContact?: Contact | null;
}): Promise<{ ticket: Ticket; conversationId: string | null }> => {
  const {
    contact,
    whatsapp,
    companyId,
    unreadMessages,
    inboundChannel,
    channel,
    settings
  } = input;

  // 1) Resolver UnifiedConversation por número canónico.
  let conversationId: string | null = null;
  try {
    const canonical = ConversationResolverService.normalizeNumber(
      (contact as any).number || (contact as any).remoteJid
    );
    if (canonical) {
      const conv = await ConversationResolverService.resolveOrCreate({
        companyId,
        canonicalNumber: canonical,
        contact
      });
      conversationId = conv?.conversation?.id ?? null;
    }
  } catch (err: any) {
    logger.warn(
      { err: err?.message, companyId, contactId: (contact as any)?.id },
      "[CoexTicketRouting] resolveOrCreate conversación fallo (continúa sin conversationId)"
    );
  }

  // 2) Ticket canónico (reutiliza por conversationId si existe).
  const coex: FindOrCreateTicketCoexInput = {
    conversationId,
    inboundChannelHint: inboundChannel
  };

  const ticket = await FindOrCreateTicketService(
    contact,
    whatsapp,
    unreadMessages,
    companyId,
    input.queueId ?? 0,
    input.userId ?? 0,
    input.groupContact ?? null,
    channel,
    null,
    false,
    settings,
    false,
    false,
    coex
  );

  // 3) Binding del proveedor + registrar inbound (best-effort).
  if (conversationId) {
    try {
      await ConversationResolverService.upsertBinding({
        conversationId,
        companyId,
        contactId: (contact as any).id,
        whatsappId: (whatsapp as any).id ?? null,
        provider: inboundChannel,
        providerIdentifier:
          (contact as any).remoteJid ||
          ConversationResolverService.normalizeNumber((contact as any).number) ||
          ""
      });
      await ConversationResolverService.recordInbound(conversationId, inboundChannel);
      if (!(ticket as any).conversationId) {
        await ticket.update({
          conversationId,
          inboundChannelHint: inboundChannel
        } as any);
      }
    } catch (err: any) {
      logger.warn(
        { err: err?.message, conversationId },
        "[CoexTicketRouting] binding/recordInbound fallo (no crítico)"
      );
    }
  }

  return { ticket, conversationId };
};

/**
 * Busca un mensaje SALIENTE equivalente reciente del OTRO transporte para el
 * mismo ticket canónico — usado para deduplicar el echo de Meta (business_app)
 * contra el fromMe que Baileys ya guardó (o viceversa).
 *
 * Coincide por: mismo ticketId, fromMe=true, body normalizado igual, ventana
 * temporal corta y sourceChannel del OTRO proveedor. NO usa el wid (los wid
 * difieren entre transportes).
 */
export const findEquivalentOutboundMessage = async (input: {
  companyId: number;
  ticketId: number;
  body: string;
  windowMs?: number;
  excludeSourceChannels?: string[];
}): Promise<Message | null> => {
  const { companyId, ticketId } = input;
  const windowMs = input.windowMs ?? 120_000; // 120s por defecto
  const normalize = (s: string) =>
    String(s || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  const target = normalize(input.body);
  // No deduplicar placeholders vacíos / de media sin texto útil.
  if (!target || /^\[.*\]$/.test(target) || target.startsWith("📍")) {
    return null;
  }

  const since = new Date(Date.now() - windowMs);
  const exclude = input.excludeSourceChannels ?? ["business_app"];

  const candidates = await Message.findAll({
    where: {
      companyId,
      ticketId,
      fromMe: true,
      createdAt: { [Op.gte]: since }
    } as any,
    order: [["createdAt", "DESC"]],
    limit: 25,
    attributes: ["id", "body", "sourceChannel", "wid", "createdAt"]
  });

  for (const m of candidates) {
    const sc = (m as any).sourceChannel as string | null;
    if (sc && exclude.includes(sc)) continue; // no comparar contra el mismo origen
    if (normalize((m as any).body) === target) {
      return m;
    }
  }
  return null;
};

/**
 * Cambia el proveedor DUEÑO del ticket (canal activo real):
 *   - actualiza Ticket.whatsappId (al transporte destino),
 *   - actualiza Ticket.channel ('meta' | 'whatsapp'),
 *   - fija la política de la conversación (force_meta | force_baileys),
 *   - emite socket para refrescar UI.
 *
 * NO crea un segundo ticket. NO borra nada.
 */
export const switchTicketOwner = async (
  ticketId: number,
  provider: CoexProvider,
  companyId: number
): Promise<Ticket> => {
  const ticket = await Ticket.findOne({ where: { id: ticketId, companyId } as any });
  if (!ticket) {
    throw new Error(`[CoexTicketRouting] ticket ${ticketId} no encontrado`);
  }

  const seed = (ticket as any).whatsappId
    ? await Whatsapp.findByPk((ticket as any).whatsappId)
    : null;
  if (!seed) {
    throw new Error(
      `[CoexTicketRouting] ticket ${ticketId} sin whatsappId — no se puede cambiar owner`
    );
  }

  const pair = await resolveCoexistencePair(seed);
  const targetWa =
    provider === "meta" ? pair.metaWhatsapp : pair.baileysWhatsapp;

  if (!targetWa) {
    throw new Error(
      `[CoexTicketRouting] no existe transporte ${provider} hermano para ticket ${ticketId}`
    );
  }

  const targetChannel = provider === "meta" ? "meta" : "whatsapp";

  await ticket.update({
    whatsappId: (targetWa as any).id,
    channel: targetChannel
  } as any);

  // Fijar política de la conversación para que el outbound respete el owner.
  const convId = (ticket as any).conversationId;
  if (convId) {
    try {
      await UnifiedConversation.update(
        {
          routingPolicy: provider === "meta" ? "force_meta" : "force_baileys",
          currentChannel: provider
        } as any,
        { where: { id: convId } }
      );
    } catch (err: any) {
      logger.warn(
        { err: err?.message, convId },
        "[CoexTicketRouting] no se pudo fijar routingPolicy de la conversación"
      );
    }
  }

  const fullTicket = await ShowTicketService(ticket.id, companyId);

  try {
    const io = getIO();
    io.of(String(companyId)).emit(`company-${companyId}-ticket`, {
      action: "update",
      ticket: fullTicket
    });
  } catch (err: any) {
    logger.warn(
      { err: err?.message, ticketId },
      "[CoexTicketRouting] socket emit falló tras switchTicketOwner"
    );
  }

  logger.info(
    `[CoexTicketRouting] switchTicketOwner ticket=${ticketId} → ${provider} whatsappId=${(targetWa as any).id} channel=${targetChannel}`
  );

  return fullTicket;
};

export default {
  resolveCoexistencePair,
  isCoexistenceSibling,
  resolveTicketOwner,
  shouldDropProviderEvent,
  resolveOrCreateCanonicalTicket,
  findEquivalentOutboundMessage,
  switchTicketOwner
};
