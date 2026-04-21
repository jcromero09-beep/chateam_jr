/**
 * CoexistencePolicyController — FASE 5 Coexistencia WhatsApp.
 *
 * Gestiona la política de routing saliente a nivel de conversación
 * (persistida en UnifiedConversation.routingPolicy). Esto permite
 * al agente "forzar Meta" o "forzar Baileys" en caliente sin
 * crear ticket/contacto nuevo.
 *
 * Endpoints:
 *   GET    /coexistence/tickets/:ticketId/routing-policy
 *     Devuelve política actual + canal efectivo + bindings disponibles.
 *
 *   PUT    /coexistence/tickets/:ticketId/routing-policy
 *     Body: { mode: 'auto' | 'force_meta' | 'force_baileys' | 'sticky_inbound' }
 *     Persiste en la conversación del ticket. Si el ticket no tiene
 *     conversación unificada (tickets legacy), la crea on-the-fly
 *     con canonicalNumber derivado del contact.
 */
import { Request, Response } from "express";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import Contact from "../models/Contact";
import Whatsapp from "../models/Whatsapp";
import UnifiedConversation from "../models/UnifiedConversation";
import ContactBinding from "../models/ContactBinding";
import ConversationResolverService from "../services/CoexistenceServices/ConversationResolverService";
import OutboundRoutingService from "../services/CoexistenceServices/OutboundRoutingService";
import AppError from "../errors/AppError";

const VALID_MODES = ["auto", "force_meta", "force_baileys", "sticky_inbound"];

const findOrCreateConversationForTicket = async (
  ticket: any
): Promise<UnifiedConversation | null> => {
  if (ticket.conversationId) {
    return UnifiedConversation.findByPk(ticket.conversationId);
  }

  const contact = await Contact.findByPk(ticket.contactId, {
    attributes: ["id", "number", "remoteJid"]
  });
  if (!contact) return null;

  const canonical = ConversationResolverService.normalizeNumber(
    (contact as any).number || (contact as any).remoteJid
  );
  if (!canonical) return null;

  const res = await ConversationResolverService.resolveOrCreate({
    companyId: ticket.companyId,
    canonicalNumber: canonical,
    contact
  });
  if (!res) return null;

  // Enlazar ticket con la conversación
  try {
    await ticket.update({ conversationId: res.conversation.id });
  } catch (_e) { /* silencioso */ }

  return res.conversation;
};

export const getRoutingPolicy = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { ticketId } = req.params;
    const { companyId } = (req as any).user;
    const ticket = await ShowTicketService(ticketId, companyId);

    const conversation = await findOrCreateConversationForTicket(ticket);

    // Listar bindings disponibles (útil para UI: saber qué proveedores puede forzar)
    const bindings = conversation
      ? await ContactBinding.findAll({
          where: { conversationId: (conversation as any).id, isActive: true },
          attributes: [
            "id",
            "provider",
            "providerIdentifier",
            "whatsappId",
            "lastSeenAt"
          ]
        })
      : [];

    // Preview de decisión actual (sin enviar)
    let preview = null as any;
    try {
      const decision = await OutboundRoutingService.resolveOutbound({
        ticket: ticket as any
      });
      preview = {
        provider: decision.provider,
        whatsappId: decision.whatsappId,
        whatsappName: (decision.whatsapp as any)?.name,
        reason: decision.reason,
        fallbackApplied: decision.fallbackApplied
      };
    } catch (_e) {
      preview = null;
    }

    // Disponibilidad de cada canal físico
    const seedWa = ticket.whatsappId
      ? await Whatsapp.findByPk(ticket.whatsappId)
      : null;
    const linkedWa = seedWa && (seedWa as any).linkedWhatsappId
      ? await Whatsapp.findByPk((seedWa as any).linkedWhatsappId)
      : null;

    const availability = {
      meta: {
        available:
          (seedWa && (seedWa as any).channel === "meta" &&
            !!(seedWa as any).phoneNumberId && !!(seedWa as any).tokenMeta) ||
          (!!linkedWa && (linkedWa as any).channel === "meta" &&
            !!(linkedWa as any).phoneNumberId && !!(linkedWa as any).tokenMeta),
        whatsappName:
          seedWa && (seedWa as any).channel === "meta"
            ? (seedWa as any).name
            : linkedWa && (linkedWa as any).channel === "meta"
            ? (linkedWa as any).name
            : null
      },
      baileys: {
        available:
          (seedWa && (seedWa as any).channel === "whatsapp" &&
            (seedWa as any).status === "CONNECTED") ||
          (!!linkedWa && (linkedWa as any).channel === "whatsapp" &&
            (linkedWa as any).status === "CONNECTED"),
        whatsappName:
          seedWa && (seedWa as any).channel === "whatsapp"
            ? (seedWa as any).name
            : linkedWa && (linkedWa as any).channel === "whatsapp"
            ? (linkedWa as any).name
            : null
      }
    };

    return res.status(200).json({
      ticketId: ticket.id,
      conversationId: conversation ? (conversation as any).id : null,
      canonicalNumber: conversation
        ? (conversation as any).canonicalNumber
        : null,
      routingPolicy: conversation
        ? (conversation as any).routingPolicy
        : "auto",
      lastInboundChannel: conversation
        ? (conversation as any).lastInboundChannel
        : null,
      lastOutboundChannel: conversation
        ? (conversation as any).lastOutboundChannel
        : null,
      currentChannel: conversation
        ? (conversation as any).currentChannel
        : null,
      bindings,
      availability,
      preview
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(500).json({
      error: "routing_policy_get_failed",
      detail: err?.message
    });
  }
};

export const setRoutingPolicy = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { ticketId } = req.params;
    const { companyId } = (req as any).user;
    const mode = (req.body?.mode as string) || "";

    if (!VALID_MODES.includes(mode)) {
      return res.status(400).json({
        error: "invalid_mode",
        validModes: VALID_MODES
      });
    }

    const ticket = await ShowTicketService(ticketId, companyId);
    const conversation = await findOrCreateConversationForTicket(ticket);
    if (!conversation) {
      return res.status(400).json({
        error: "cannot_resolve_conversation",
        hint: "contact missing number or remoteJid"
      });
    }

    await (conversation as any).update({ routingPolicy: mode });

    // Preview tras el cambio
    let preview = null as any;
    try {
      const decision = await OutboundRoutingService.resolveOutbound({
        ticket: ticket as any
      });
      preview = {
        provider: decision.provider,
        whatsappId: decision.whatsappId,
        whatsappName: (decision.whatsapp as any)?.name,
        reason: decision.reason,
        fallbackApplied: decision.fallbackApplied
      };
    } catch (_e) {
      preview = null;
    }

    return res.status(200).json({
      ticketId: ticket.id,
      conversationId: (conversation as any).id,
      routingPolicy: mode,
      preview
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(500).json({
      error: "routing_policy_set_failed",
      detail: err?.message
    });
  }
};

export default { getRoutingPolicy, setRoutingPolicy };
