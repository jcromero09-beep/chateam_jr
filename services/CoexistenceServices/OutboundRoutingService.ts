/**
 * OutboundRoutingService — FASE 4 Coexistencia WhatsApp.
 *
 * Decide qué proveedor físico (Meta Cloud API vs Baileys) usar para
 * enviar un mensaje saliente, según:
 *
 *   1. Política del ticket/conversación (más específica):
 *      - 'force_meta' | 'force_baileys' → respeta SIEMPRE si el canal
 *        está disponible; si no, aplica fallback.
 *      - 'sticky_inbound' → usa el mismo canal del último inbound.
 *      - 'auto' (default) → usa la política de la conexión.
 *
 *   2. Política global de la conexión Whatsapp (nivel Whatsapps):
 *      - sendChannel + linkedWhatsappId + coexistenceEnabled.
 *
 *   3. Fallback si el canal elegido no está activo:
 *      - Si se intenta Baileys con sesión no CONNECTED → fallback Meta.
 *      - Si se intenta Meta sin phoneNumberId/tokenMeta → fallback Baileys.
 *
 * NO ejecuta el envío — sólo decide. El caller usa OutboundDispatchService.
 */
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import Message from "../../models/Message";
import UnifiedConversation from "../../models/UnifiedConversation";
import logger from "../../utils/logger";
import { logRoute } from "../../utils/coexistenceLogger";

export type OutboundProvider = "meta" | "baileys";
export type RequestedMode =
  | "auto"
  | "force_meta"
  | "force_baileys"
  | "sticky_inbound"
  | "meta_first_baileys_after_23h";
export type RequestedBy =
  | "agent"
  | "cron"
  | "ai"
  | "campaign"
  | "followup"
  | "automation"
  | "webhook";

export interface RoutingDecision {
  provider: OutboundProvider;
  whatsappId: number;
  whatsapp: Whatsapp;
  reason: string;
  fallbackApplied: boolean;
  requestedMode: RequestedMode;
  requestedProvider?: OutboundProvider;
  /** FASE 7 — Info de ventana 24h Meta (cuando aplica). */
  metaWindow?: MetaWindowInfo;
  /** FASE 7 — Provider alternativo disponible para fallback de runtime. */
  fallbackProvider?: OutboundProvider | null;
}

export interface ResolveOutboundInput {
  ticket: Ticket;
  /**
   * Override explícito del agente (UI → "forzar Meta" / "forzar Baileys").
   * Si se pasa, prevalece sobre la política persistida en la conversación.
   */
  requestedMode?: RequestedMode;
  /**
   * Caller opcional para logs estructurados.
   */
  requestedBy?: RequestedBy;
}

const isBaileysAlive = (wa: Whatsapp | null | undefined): boolean => {
  if (!wa) return false;
  return (wa as any).status === "CONNECTED" &&
    ((wa as any).channel === "whatsapp" || (wa as any).provider !== "meta");
};

const isMetaReady = (wa: Whatsapp | null | undefined): boolean => {
  if (!wa) return false;
  return (
    (wa as any).channel === "meta" &&
    !!(wa as any).phoneNumberId &&
    !!(wa as any).tokenMeta
  );
};

const resolveCoexistencePolicyWhatsapp = async (
  seedWa: Whatsapp
): Promise<Whatsapp | null> => {
  if ((seedWa as any).coexistenceEnabled) return seedWa;

  if ((seedWa as any).channel === "meta") return null;

  return Whatsapp.findOne({
    where: {
      companyId: (seedWa as any).companyId,
      linkedWhatsappId: (seedWa as any).id,
      channel: "meta",
      coexistenceEnabled: true
    } as any,
    order: [["updatedAt", "DESC"]]
  });
};

// ───────────────────────────────────────────────────────────────────
// FASE 7 — Ventana de 24h Meta Cloud API
// ───────────────────────────────────────────────────────────────────
// Meta sólo permite mensajes libres (texto/media/interactive) dentro de
// las 24 horas posteriores al ÚLTIMO mensaje del cliente. Pasada esa
// ventana se debe enviar template aprobado o usar otro canal (Baileys).
//
// Política propia: damos 1 hora de margen — a partir de las 23h
// preferimos Baileys porque Meta puede empezar a rechazar el mensaje
// con error 131047 / 470 al estar cerca del límite oficial.
export const META_WINDOW_HOURS = 24;
export const META_WINDOW_BAILEYS_THRESHOLD_HOURS = 23;

export interface MetaWindowInfo {
  /** Fecha del último inbound del cliente (fromMe=false) en este ticket. */
  lastCustomerMessageAt: Date | null;
  /** Horas transcurridas desde lastCustomerMessageAt. null si no hay inbound. */
  hoursSinceLastCustomerMessage: number | null;
  /** Estado de la ventana 24h Meta. */
  isOpen: boolean;
  /** Cuándo expira la ventana (lastCustomerMessageAt + 24h). null si no hay inbound. */
  expiresAt: Date | null;
  /** Minutos que faltan para que expire. 0 si ya expiró, null si no hay inbound. */
  minutesRemaining: number | null;
}

/**
 * Calcula la ventana 24h Meta para un ticket dado.
 * Busca el último inbound (fromMe=false) en Messages.
 * Si no hay inbound: la ventana se considera CERRADA (preferir baileys/template).
 */
export const computeMetaWindow = async (
  ticketId: number,
  companyId: number
): Promise<MetaWindowInfo> => {
  if (!ticketId || !companyId) {
    return {
      lastCustomerMessageAt: null,
      hoursSinceLastCustomerMessage: null,
      isOpen: false,
      expiresAt: null,
      minutesRemaining: null
    };
  }

  const lastInbound = await Message.findOne({
    where: { ticketId, companyId, fromMe: false } as any,
    order: [["createdAt", "DESC"]],
    attributes: ["id", "createdAt"]
  });

  const lastAt =
    lastInbound && (lastInbound as any).createdAt
      ? new Date((lastInbound as any).createdAt)
      : null;

  if (!lastAt) {
    return {
      lastCustomerMessageAt: null,
      hoursSinceLastCustomerMessage: null,
      isOpen: false,
      expiresAt: null,
      minutesRemaining: null
    };
  }

  const now = Date.now();
  const elapsedMs = now - lastAt.getTime();
  const hours = elapsedMs / (1000 * 60 * 60);
  const expiresAt = new Date(
    lastAt.getTime() + META_WINDOW_HOURS * 60 * 60 * 1000
  );
  const minutesRemaining = Math.max(
    0,
    Math.floor((expiresAt.getTime() - now) / (1000 * 60))
  );
  const isOpen = elapsedMs < META_WINDOW_HOURS * 60 * 60 * 1000;

  return {
    lastCustomerMessageAt: lastAt,
    hoursSinceLastCustomerMessage: Math.round(hours * 100) / 100,
    isOpen,
    expiresAt,
    minutesRemaining
  };
};

/**
 * Dada una conexión origen y un proveedor objetivo, encuentra la
 * conexión correcta que habla ese proveedor. Puede ser la misma,
 * la vinculada por linkedWhatsappId, la vinculada en sentido inverso
 * o una conexión hermana con el mismo número dentro de la misma empresa.
 */
export const resolveProviderTarget = async (
  seedWa: Whatsapp,
  target: OutboundProvider
): Promise<Whatsapp | null> => {
  const seedProvider: OutboundProvider =
    (seedWa as any).channel === "meta" ? "meta" : "baileys";
  if (seedProvider === target) return seedWa;

  const companyId = (seedWa as any).companyId;
  const targetChannel = target === "meta" ? "meta" : "whatsapp";
  const linkedId = (seedWa as any).linkedWhatsappId;

  if (linkedId) {
    const linked = await Whatsapp.findOne({
      where: { id: linkedId, companyId } as any
    });
    const linkedProvider: OutboundProvider =
      (linked as any)?.channel === "meta" ? "meta" : "baileys";
    if (linked && linkedProvider === target) return linked;
  }

  const reverseLinked = await Whatsapp.findOne({
    where: {
      companyId,
      linkedWhatsappId: (seedWa as any).id,
      channel: targetChannel
    } as any
  });
  if (reverseLinked) return reverseLinked;

  const number = ((seedWa as any).number || "").trim();
  if (number) {
    return Whatsapp.findOne({
      where: {
        companyId,
        number,
        channel: targetChannel
      } as any,
      order: [
        ["status", "ASC"],
        ["updatedAt", "DESC"]
      ]
    });
  }

  return null;
};

/**
 * Resuelve la política efectiva (mezclando ticket, conversación y conexión).
 */
const VALID_REQUESTED_MODES: RequestedMode[] = [
  "auto",
  "force_meta",
  "force_baileys",
  "sticky_inbound",
  "meta_first_baileys_after_23h"
];

const resolveEffectiveMode = async (
  ticket: Ticket,
  requestedMode?: RequestedMode
): Promise<{ mode: RequestedMode; source: string }> => {
  // Prioridad 1: override del agente en UI
  if (requestedMode && VALID_REQUESTED_MODES.includes(requestedMode)) {
    return { mode: requestedMode, source: "request" };
  }
  // Prioridad 2: política persistida en la conversación (FASE 3+5)
  const convId = (ticket as any).conversationId;
  if (convId) {
    const conv = await UnifiedConversation.findByPk(convId, {
      attributes: ["id", "routingPolicy", "lastInboundChannel"]
    });
    if (conv) {
      const p = (conv as any).routingPolicy as RequestedMode;
      if (p && p !== "auto" && VALID_REQUESTED_MODES.includes(p)) {
        return { mode: p, source: "conversation" };
      }
    }
  }
  return { mode: "auto", source: "default" };
};

/**
 * Decisión de routing.
 */
export const resolveOutbound = async (
  input: ResolveOutboundInput
): Promise<RoutingDecision> => {
  const { ticket } = input;
  const seedWa = (ticket as any).whatsappId
    ? await Whatsapp.findByPk((ticket as any).whatsappId)
    : null;

  if (!seedWa) {
    throw new Error(
      "[OutboundRouting] ticket sin whatsappId asociado — no se puede rutear"
    );
  }

  const { mode, source } = await resolveEffectiveMode(
    ticket,
    input.requestedMode
  );

  // Pre-calcular ventana 24h Meta — la usaremos en varios modos.
  const ticketCompanyId = (ticket as any).companyId;
  const ticketIdNum = (ticket as any).id;
  const metaWindow = await computeMetaWindow(ticketIdNum, ticketCompanyId);

  // Decisión inicial según mode
  let targetProvider: OutboundProvider | null = null;
  let reasonBase = "";
  switch (mode) {
    case "force_meta":
      targetProvider = "meta";
      reasonBase = `force_meta (${source})`;
      break;
    case "force_baileys":
      targetProvider = "baileys";
      reasonBase = `force_baileys (${source})`;
      break;
    case "sticky_inbound": {
      const convId = (ticket as any).conversationId;
      const conv = convId
        ? await UnifiedConversation.findByPk(convId, {
            attributes: ["id", "lastInboundChannel"]
          })
        : null;
      const lastInbound = (conv as any)?.lastInboundChannel;
      targetProvider =
        lastInbound === "meta"
          ? "meta"
          : lastInbound === "baileys"
          ? "baileys"
          : null;
      if (!targetProvider) {
        // sin historial → caer a 'auto'
        reasonBase = "sticky_inbound_no_history_fallback_auto";
      } else {
        reasonBase = `sticky_inbound=${lastInbound} (${source})`;
      }
      break;
    }
    case "meta_first_baileys_after_23h": {
      // Si hay inbound y la ventana sigue holgada (<23h) → Meta.
      // Si no hay inbound o ya pasaron 23h → Baileys.
      const hours = metaWindow.hoursSinceLastCustomerMessage;
      if (
        metaWindow.lastCustomerMessageAt &&
        hours !== null &&
        hours < META_WINDOW_BAILEYS_THRESHOLD_HOURS
      ) {
        targetProvider = "meta";
        reasonBase = `meta_window_open(${hours}h<23h) (${source})`;
      } else {
        targetProvider = "baileys";
        reasonBase = metaWindow.lastCustomerMessageAt
          ? `meta_window_near_or_closed(${hours}h>=23h) (${source})`
          : `meta_window_no_inbound (${source})`;
      }
      break;
    }
    case "auto":
    default:
      // En modo auto: respetar sendChannel de la conexión si está
      // coexistenceEnabled. Si el ticket vive en Baileys, la política puede
      // estar guardada en la Meta vinculada inversamente.
      const policyWa = await resolveCoexistencePolicyWhatsapp(seedWa);
      if (policyWa) {
        const send = (policyWa as any).sendChannel;
        if (send === "meta" || send === "baileys") {
          targetProvider = send;
          reasonBase = `coexistence.whatsappId=${(policyWa as any).id}.sendChannel=${send}`;
        } else if (send === "meta_first_baileys_after_23h") {
          // Aplicar misma regla que el modo dedicado
          const hours = metaWindow.hoursSinceLastCustomerMessage;
          if (
            metaWindow.lastCustomerMessageAt &&
            hours !== null &&
            hours < META_WINDOW_BAILEYS_THRESHOLD_HOURS
          ) {
            targetProvider = "meta";
            reasonBase = `coexistence.whatsappId=${(policyWa as any).id}.auto_window_open(${hours}h<23h)`;
          } else {
            targetProvider = "baileys";
            reasonBase = metaWindow.lastCustomerMessageAt
              ? `coexistence.whatsappId=${(policyWa as any).id}.auto_window_near_or_closed(${hours}h>=23h)`
              : `coexistence.whatsappId=${(policyWa as any).id}.auto_window_no_inbound`;
          }
        }
      }
      if (!targetProvider) {
        targetProvider =
          (seedWa as any).channel === "meta" ? "meta" : "baileys";
        reasonBase = `whatsapp.channel=${(seedWa as any).channel}`;
      }
      break;
  }

  // Resolver Whatsapp físico correspondiente al provider objetivo.
  const targetWa = await resolveProviderTarget(seedWa, targetProvider as OutboundProvider);

  // Evaluar si está disponible; si no, aplicar fallback.
  let fallbackApplied = false;
  let finalProvider: OutboundProvider = targetProvider as OutboundProvider;
  let finalWa = targetWa;
  let reason = reasonBase;

  const providerReady =
    finalProvider === "meta" ? isMetaReady(finalWa) : isBaileysAlive(finalWa);

  if (!providerReady) {
    // Intentar canal alternativo
    const altProvider: OutboundProvider =
      finalProvider === "meta" ? "baileys" : "meta";
    const altWa = await resolveProviderTarget(seedWa, altProvider);
    const altReady =
      altProvider === "meta" ? isMetaReady(altWa) : isBaileysAlive(altWa);
    if (altReady) {
      fallbackApplied = true;
      finalProvider = altProvider;
      finalWa = altWa;
      reason = `${reasonBase} → fallback ${altProvider}`;
    } else {
      // Ninguno disponible: devolver el mejor esfuerzo (seedWa) con warning
      reason = `${reasonBase} → no_alt_available_using_seed`;
      finalWa = seedWa;
      finalProvider = (seedWa as any).channel === "meta" ? "meta" : "baileys";
    }
  }

  // Calcular fallback disponible en runtime (para uso del dispatcher
  // si el envío principal falla por ventana cerrada u otro error).
  const altProviderRuntime: OutboundProvider =
    finalProvider === "meta" ? "baileys" : "meta";
  const altWaRuntime = await resolveProviderTarget(seedWa, altProviderRuntime);
  const altReadyRuntime =
    altProviderRuntime === "meta"
      ? isMetaReady(altWaRuntime)
      : isBaileysAlive(altWaRuntime);

  const decision: RoutingDecision = {
    provider: finalProvider,
    whatsappId: (finalWa as any).id,
    whatsapp: finalWa as Whatsapp,
    reason,
    fallbackApplied,
    requestedMode: mode,
    requestedProvider: targetProvider as OutboundProvider,
    metaWindow,
    fallbackProvider: altReadyRuntime ? altProviderRuntime : null
  };

  logRoute({
    provider: finalProvider,
    companyId: (finalWa as any)?.companyId,
    ticketId: (ticket as any).id,
    conversationId: (ticket as any).conversationId,
    requestedMode: mode,
    chosenProvider: finalProvider,
    reason,
    whatsappId: decision.whatsappId,
    linkedWhatsappId: (seedWa as any).linkedWhatsappId ?? null
  });

  return decision;
};

export default { resolveOutbound };
