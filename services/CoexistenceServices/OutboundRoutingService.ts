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
import UnifiedConversation from "../../models/UnifiedConversation";
import logger from "../../utils/logger";
import { logRoute } from "../../utils/coexistenceLogger";

export type OutboundProvider = "meta" | "baileys";
export type RequestedMode =
  | "auto"
  | "force_meta"
  | "force_baileys"
  | "sticky_inbound";

export interface RoutingDecision {
  provider: OutboundProvider;
  whatsappId: number;
  whatsapp: Whatsapp;
  reason: string;
  fallbackApplied: boolean;
  requestedMode: RequestedMode;
  requestedProvider?: OutboundProvider;
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
  requestedBy?:
    | "agent"
    | "cron"
    | "ai"
    | "campaign"
    | "followup"
    | "automation";
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

/**
 * Encuentra la conexión Baileys/Meta hermana usando linkedWhatsappId.
 * Si no hay link, devuelve null.
 */
const findLinkedWhatsapp = async (
  wa: Whatsapp | null
): Promise<Whatsapp | null> => {
  if (!wa) return null;
  const linkedId = (wa as any).linkedWhatsappId;
  if (!linkedId) return null;
  return Whatsapp.findByPk(linkedId);
};

/**
 * Dada una conexión origen y un proveedor objetivo, encuentra la
 * conexión correcta que habla ese proveedor. Puede ser la misma
 * (si ya coincide) o la linked.
 */
const resolveProviderTarget = async (
  seedWa: Whatsapp,
  target: OutboundProvider
): Promise<Whatsapp | null> => {
  const seedProvider: OutboundProvider =
    (seedWa as any).channel === "meta" ? "meta" : "baileys";
  if (seedProvider === target) return seedWa;
  const linked = await findLinkedWhatsapp(seedWa);
  if (!linked) return null;
  const linkedProvider: OutboundProvider =
    (linked as any).channel === "meta" ? "meta" : "baileys";
  return linkedProvider === target ? linked : null;
};

/**
 * Resuelve la política efectiva (mezclando ticket, conversación y conexión).
 */
const resolveEffectiveMode = async (
  ticket: Ticket,
  requestedMode?: RequestedMode
): Promise<{ mode: RequestedMode; source: string }> => {
  // Prioridad 1: override del agente en UI
  if (
    requestedMode &&
    ["force_meta", "force_baileys", "auto", "sticky_inbound"].includes(
      requestedMode
    )
  ) {
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
      if (p && p !== "auto") {
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
    case "auto":
    default:
      // En modo auto: respetar sendChannel de la conexión si está
      // coexistenceEnabled; de lo contrario usar el canal de la conexión.
      if ((seedWa as any).coexistenceEnabled) {
        const send = (seedWa as any).sendChannel;
        if (send === "meta" || send === "baileys") {
          targetProvider = send;
          reasonBase = `coexistence.sendChannel=${send}`;
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
  let targetWa = await resolveProviderTarget(seedWa, targetProvider as OutboundProvider);

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

  const decision: RoutingDecision = {
    provider: finalProvider,
    whatsappId: (finalWa as any).id,
    whatsapp: finalWa as Whatsapp,
    reason,
    fallbackApplied,
    requestedMode: mode,
    requestedProvider: targetProvider as OutboundProvider
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
