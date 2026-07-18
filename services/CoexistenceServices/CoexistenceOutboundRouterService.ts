/**
 * CoexistenceOutboundRouterService — FASE 7 Coexistencia WhatsApp.
 *
 * Punto de entrada de alto nivel para enviar mensajes salientes desde
 * tickets de coexistencia. Orquesta:
 *
 *   1. OutboundRoutingService.resolveOutbound()  → decide proveedor
 *   2. OutboundDispatchService.dispatch()        → envía + audita en
 *      OutboundDispatch + aplica fallback runtime si Meta cierra ventana
 *   3. Persiste el Message en BD SOLO después de confirmación del
 *      proveedor (no se guarda nada como `sent` antes del ack).
 *   4. Aplica deduplicación por (companyId, wid) — si ya existe un
 *      Message con el mismo wamid (caso webhook de status que llegó
 *      antes), reutiliza la fila existente.
 *
 * Firma exacta:
 *
 *   routeAndSendOutbound({
 *     ticket,
 *     body,
 *     quotedMsg,
 *     requestedMode,
 *     userId,
 *     companyId
 *   })
 *
 * Modos soportados:
 *   - "auto"
 *   - "force_meta"
 *   - "force_baileys"
 *   - "meta_first_baileys_after_23h"
 *   - "sticky_inbound"  (legacy, soportado por OutboundRoutingService)
 *
 * Reglas:
 *   - Si force_meta y Meta no tiene phoneNumberId/tokenMeta → error claro.
 *   - Si force_baileys y Baileys no está CONNECTED → error claro.
 *   - Si auto / meta_first_baileys_after_23h:
 *       edad < 23h ⇒ Meta
 *       edad ≥ 23h ⇒ Baileys (si linkedWhatsappId conectado)
 *       sin Baileys ⇒ error pidiendo template Meta.
 *   - Si Meta falla por error de ventana cerrada ⇒ fallback automático
 *     a Baileys (manejado por OutboundDispatchService).
 *
 * Multi-tenant: TODA query incluye companyId (defensa en profundidad).
 */
import { getIO } from "../../libs/socket";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import Whatsapp from "../../models/Whatsapp";
import Contact from "../../models/Contact";
import logger from "../../utils/logger";
import {
  logDedupe as coexLogDedupe,
  logCoexError
} from "../../utils/coexistenceLogger";
import OutboundDispatchService from "./OutboundDispatchService";
import { RequestedMode, RequestedBy } from "./OutboundRoutingService";

export interface RouteAndSendOutboundInput {
  ticket: Ticket;
  body: string;
  quotedMsg?: any;
  requestedMode?: RequestedMode;
  /** ID del usuario agente (auditoría). */
  userId?: number;
  /** ID de la empresa — usado para defensa en profundidad. */
  companyId: number;
  /** Caller (default: 'agent'). */
  requestedBy?: RequestedBy;
}

export interface RouteAndSendOutboundResult {
  ok: boolean;
  /** Provider físico realmente usado (meta | baileys). */
  provider: "meta" | "baileys";
  /** Si hubo fallback runtime (meta→baileys) o de routing. */
  fallbackApplied: boolean;
  /** Mensaje persistido (si ok=true). */
  message: Message | null;
  /** ID del Message en BD. */
  messageId?: number | null;
  /** wamid (Meta) o key.id (Baileys). */
  providerMessageId: string | null;
  /** Whatsapp usado para el envío. */
  whatsappId: number;
  /** ID del registro OutboundDispatch (auditoría). */
  dispatchId: string | null;
  /** Razón humana de la decisión. */
  reason: string;
  /** Si se intentó Meta primero y falló por ventana cerrada. */
  metaClosedWindow?: boolean;
  /** Error estructurado si !ok. */
  error?: {
    code: string;
    message: string;
    metaErrorCode?: number | string;
    metaErrorSubcode?: number | string;
    needsTemplate?: boolean;
  };
}

/**
 * Si ya existe un Message con (companyId, wid) devuelve el existente
 * para evitar duplicados (webhook de status que llegó antes que el
 * caller que envía).
 */
const findExistingMessageByWid = async (
  companyId: number,
  wid: string
): Promise<Message | null> => {
  if (!wid) return null;
  return Message.findOne({
    where: { companyId, wid } as any,
    include: [{ model: Whatsapp, as: "whatsapp" }]
  });
};

/**
 * Determina mediaType apropiado según body. Mantiene compatibilidad
 * con el resto del código (extendedTextMessage para texto plano).
 */
const detectMediaType = (body: string): string => {
  if (!body) return "extendedTextMessage";
  return "extendedTextMessage";
};

const emitMessageSocket = (companyId: number, message: Message, ticket: Ticket) => {
  try {
    const io = getIO();
    io.of(String(companyId)).emit(
      `company-${companyId}-appMessage`,
      {
        action: "create",
        message: { ...message.toJSON(), ticketId: (ticket as any).id },
        ticket: ticket.toJSON ? ticket.toJSON() : ticket,
        contact: (ticket as any).contact || null
      }
    );
  } catch (err: any) {
    logger.warn(
      { err: err?.message, ticketId: (ticket as any).id },
      "[CoexOutboundRouter] socket emit failed (non-fatal)"
    );
  }
};

export const routeAndSendOutbound = async (
  input: RouteAndSendOutboundInput
): Promise<RouteAndSendOutboundResult> => {
  const { ticket, body, quotedMsg, requestedMode, userId, companyId } = input;
  const requestedBy: RequestedBy = input.requestedBy || "agent";

  // Defensa en profundidad: validar que el ticket pertenece al companyId.
  if (Number((ticket as any).companyId) !== Number(companyId)) {
    throw new Error(
      `[CoexOutboundRouter] ticket.companyId mismatch (ticket=${(ticket as any).companyId} vs req=${companyId})`
    );
  }
  if (!body || !body.trim()) {
    throw new Error("[CoexOutboundRouter] body requerido");
  }

  // 1+2) Routing + envío + auditoría + fallback runtime via OutboundDispatchService.
  let dispatch;
  try {
    dispatch = await OutboundDispatchService.dispatch({
      ticket,
      body,
      quotedMsg,
      requestedMode,
      requestedBy,
      contact: (ticket as any).contact || null
    });
  } catch (err: any) {
    logCoexError({
      provider: "unknown",
      companyId,
      ticketId: (ticket as any).id,
      stage: "router.dispatch",
      err: { message: err?.message, name: err?.name }
    });
    return {
      ok: false,
      provider: "meta",
      fallbackApplied: false,
      message: null,
      providerMessageId: null,
      whatsappId: (ticket as any).whatsappId,
      dispatchId: null,
      reason: "router_dispatch_threw",
      error: {
        code: "ROUTER_INTERNAL_ERROR",
        message: err?.message || "router_internal_error"
      }
    };
  }

  // 3) Si el envío falló: NO persistimos Message como sent.
  if (!dispatch.ok) {
    const e = dispatch.result.error || ({} as any);
    const closedWindow = !!e.closedWindow;
    const noBaileys =
      closedWindow && dispatch.decision.fallbackProvider !== "baileys";
    return {
      ok: false,
      provider: dispatch.decision.provider,
      fallbackApplied: dispatch.decision.fallbackApplied,
      message: null,
      providerMessageId: null,
      whatsappId: dispatch.decision.whatsappId,
      dispatchId: dispatch.dispatchId,
      reason: dispatch.decision.reason,
      metaClosedWindow: closedWindow,
      error: {
        code: closedWindow
          ? noBaileys
            ? "META_WINDOW_CLOSED_NO_BAILEYS"
            : "META_WINDOW_CLOSED"
          : e.retriable
          ? "PROVIDER_RETRIABLE_ERROR"
          : "PROVIDER_ERROR",
        message: e.message || "send_failed",
        metaErrorCode: e.code,
        metaErrorSubcode: e.subcode,
        needsTemplate: closedWindow && noBaileys
      }
    };
  }

  // 4) Confirmado por el proveedor — persistimos Message con dedupe.
  const provider = dispatch.decision.provider;
  const providerMessageId = dispatch.result.providerMessageId;
  const fallbackApplied = dispatch.decision.fallbackApplied;
  const widFallback = `${provider}_${Date.now()}_${Math.random()
    .toString(36)
    .substring(7)}`;
  const wid = providerMessageId || widFallback;

  // Dedupe: si ya existe Message con este wid en la company, reutilizar.
  let existing: Message | null = null;
  if (providerMessageId) {
    existing = await findExistingMessageByWid(companyId, providerMessageId);
  }
  if (existing) {
    coexLogDedupe({
      provider,
      companyId,
      ticketId: (ticket as any).id,
      reason: "outbound_message_already_persisted",
      providerMessageId
    } as any);
    return {
      ok: true,
      provider,
      fallbackApplied,
      message: existing,
      messageId: (existing as any).id,
      providerMessageId,
      whatsappId: dispatch.decision.whatsappId,
      dispatchId: dispatch.dispatchId,
      reason: dispatch.decision.reason
    };
  }

  // sourceChannel del Message — refleja el canal real usado.
  const sourceChannel = provider === "meta" ? "cloud_api" : "baileys";

  const remoteJid =
    (ticket as any)?.contact?.remoteJid ||
    `${((ticket as any)?.contact?.number || "").replace(/\D/g, "")}@s.whatsapp.net`;

  const messageData: any = {
    wid,
    ticketId: (ticket as any).id,
    contactId: (ticket as any).contactId,
    body,
    fromMe: true,
    mediaType: detectMediaType(body),
    read: true,
    quotedMsgId: quotedMsg?.id || null,
    ack: 1, // server received
    remoteJid,
    participant: null,
    dataJson: dispatch.result.rawResult
      ? JSON.stringify(dispatch.result.rawResult).substring(0, 8000)
      : null,
    ticketTrakingId: null,
    isPrivate: false,
    provider,
    sourceChannel,
    externalId: providerMessageId || undefined,
    messageStatus: "sent",
    sentAt: new Date(),
    whatsappId: dispatch.decision.whatsappId,
    companyId
  };

  let createdMessage: Message;
  try {
    createdMessage = await Message.create(messageData);
  } catch (err: any) {
    // Si por race condition otro proceso insertó el mismo wid antes que
    // nosotros, capturamos UniqueConstraintError y devolvemos el existente.
    if (
      err?.name === "SequelizeUniqueConstraintError" ||
      /duplicate key|unique/i.test(err?.message || "")
    ) {
      const racedExisting = await findExistingMessageByWid(companyId, wid);
      if (racedExisting) {
        coexLogDedupe({
          provider,
          companyId,
          ticketId: (ticket as any).id,
          reason: "outbound_unique_constraint_race",
          providerMessageId
        } as any);
        return {
          ok: true,
          provider,
          fallbackApplied,
          message: racedExisting,
          messageId: (racedExisting as any).id,
          providerMessageId,
          whatsappId: dispatch.decision.whatsappId,
          dispatchId: dispatch.dispatchId,
          reason: dispatch.decision.reason
        };
      }
    }
    logCoexError({
      provider,
      companyId,
      ticketId: (ticket as any).id,
      stage: "router.persist_message",
      err: { message: err?.message, name: err?.name }
    });
    throw err;
  }

  // Actualizar lastMessage del ticket (best-effort).
  try {
    await (ticket as any).update({ lastMessage: body });
  } catch (_e) {
    /* silencioso */
  }

  // Emitir socket para tiempo real.
  emitMessageSocket(companyId, createdMessage, ticket);

  logger.info(
    {
      ticketId: (ticket as any).id,
      provider,
      providerMessageId,
      messageId: (createdMessage as any).id,
      fallbackApplied,
      userId
    },
    "[CoexOutboundRouter] message dispatched and persisted"
  );

  return {
    ok: true,
    provider,
    fallbackApplied,
    message: createdMessage,
    messageId: (createdMessage as any).id,
    providerMessageId,
    whatsappId: dispatch.decision.whatsappId,
    dispatchId: dispatch.dispatchId,
    reason: dispatch.decision.reason
  };
};

export default { routeAndSendOutbound };
