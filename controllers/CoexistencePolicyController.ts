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
import OutboundRoutingService, {
  resolveProviderTarget
} from "../services/CoexistenceServices/OutboundRoutingService";
import CoexistenceTicketRoutingService from "../services/CoexistenceServices/CoexistenceTicketRoutingService";
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

  // Enlazar ticket con la conversación.
  // FECHA SAGRADA: silent:true → enlazar la conversación es administrativo y NO
  // debe mover updatedAt ni reordenar la lista. Este endpoint es un GET que la UI
  // dispara al ABRIR el ticket; sin silent, abrir un ticket sin conversationId lo
  // saltaba al tope de la lista. (regresión click/abrir 2026-06-16)
  try {
    await ticket.update({ conversationId: res.conversation.id }, { silent: true });
  } catch (_e) { /* silencioso */ }

  return res.conversation;
};

export const getRoutingPolicy = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { ticketId } = req.params;
    const { companyId } = req.user;
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

    // Disponibilidad de cada canal físico — Multi-tenant: filtrar por companyId
    const seedWa = ticket.whatsappId
      ? await Whatsapp.findOne({ where: { id: ticket.whatsappId, companyId } })
      : null;
    const metaWa = seedWa ? await resolveProviderTarget(seedWa, "meta") : null;
    const baileysWa = seedWa
      ? await resolveProviderTarget(seedWa, "baileys")
      : null;

    const availability = {
      meta: {
        available:
          !!metaWa &&
          (metaWa as any).channel === "meta" &&
          !!(metaWa as any).phoneNumberId &&
          !!(metaWa as any).tokenMeta,
        whatsappName: metaWa ? (metaWa as any).name : null,
        whatsappId: metaWa ? (metaWa as any).id : null
      },
      baileys: {
        available:
          !!baileysWa &&
          (baileysWa as any).channel === "whatsapp" &&
          (baileysWa as any).status === "CONNECTED",
        whatsappName: baileysWa ? (baileysWa as any).name : null,
        whatsappId: baileysWa ? (baileysWa as any).id : null
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
    const { companyId } = req.user;
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

/**
 * POST /coexistence/tickets/:ticketId/switch-owner
 * Body: { provider: 'meta' | 'baileys' }
 *
 * Cambia el TRANSPORTE DUEÑO del ticket canónico (canal activo real):
 *  - Ticket.whatsappId → conexión hermana del proveedor elegido
 *  - Ticket.channel → 'meta' | 'whatsapp'
 *  - UnifiedConversation.routingPolicy → force_meta | force_baileys
 *  - emite socket company-{id}-ticket
 *
 * NO crea un segundo ticket (un solo ticket canónico, varios transportes).
 */
export const switchOwner = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { ticketId } = req.params;
    const { companyId } = req.user;
    const provider = (req.body?.provider as string) || "";

    if (provider !== "meta" && provider !== "baileys") {
      return res.status(400).json({
        error: "invalid_provider",
        validProviders: ["meta", "baileys"]
      });
    }

    const ticket = await CoexistenceTicketRoutingService.switchTicketOwner(
      Number(ticketId),
      provider,
      companyId
    );

    return res.status(200).json({
      ticketId: ticket.id,
      whatsappId: (ticket as any).whatsappId,
      channel: (ticket as any).channel,
      provider,
      conversationId: (ticket as any).conversationId ?? null
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(500).json({
      error: "switch_owner_failed",
      detail: err?.message
    });
  }
};

export default { getRoutingPolicy, setRoutingPolicy, switchOwner };
