/**
 * CoexistenceAwareTextSender — Fase C Coexistencia.
 *
 * Guard de envío de TEXTO consciente de coexistencia para flujos automáticos
 * (recordatorios, seguimientos, automatizaciones). Decide UNA sola vía:
 *
 *   - Ticket EN coexistencia (Meta+Baileys hermanas) → enruta por el router
 *     central (CoexistenceOutboundRouterService.routeAndSendOutbound): respeta
 *     el canal activo/owner, aplica ventana Meta 24h + fallback Baileys como
 *     UN solo intento lógico, persiste el Message y emite socket.
 *
 *   - Ticket SIN coexistencia → comportamiento LEGACY intacto
 *     (SendWhatsAppMessage). No persiste Message (lo hace el echo de Baileys),
 *     idéntico a hoy.
 *
 * Devuelve `viaRouter` para que el caller sepa si el Message YA fue persistido
 * (y evite un CreateMessageService duplicado).
 *
 * Sólo aplica a transportes WhatsApp/Meta. Facebook/Instagram/Telegram NO se
 * tocan (se rutean fuera de este helper).
 */
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import Contact from "../../models/Contact";
import logger from "../../utils/logger";
import * as CoexistenceTicketRoutingService from "./CoexistenceTicketRoutingService";
import { RequestedBy } from "./OutboundRoutingService";

export interface SendTicketTextInput {
  ticket: Ticket;
  body: string;
  companyId: number;
  /** Auditoría del caller. Default 'automation'. */
  requestedBy?: RequestedBy;
  quotedMsg?: any;
}

export interface SendTicketTextResult {
  ok: boolean;
  /** 'meta' | 'baileys' | 'whatsapp' (legacy). */
  provider: string;
  fallbackApplied: boolean;
  /** true si se envió por el router central (Message YA persistido). */
  viaRouter: boolean;
  providerMessageId: string | null;
}

const isWhatsappFamily = (channel?: string | null): boolean => {
  const c = (channel || "").toLowerCase().trim();
  return c === "" || c === "whatsapp" || c === "meta" || c === "baileys";
};

export const sendTicketText = async (
  input: SendTicketTextInput
): Promise<SendTicketTextResult> => {
  const { ticket, body, companyId } = input;
  const requestedBy: RequestedBy = input.requestedBy || "automation";

  // 1) ¿El ticket vive en coexistencia (par Meta+Baileys)?
  let isCoex = false;
  if ((ticket as any).whatsappId && isWhatsappFamily((ticket as any).channel)) {
    try {
      const seedWa = await Whatsapp.findByPk((ticket as any).whatsappId);
      if (seedWa) {
        const pair = await CoexistenceTicketRoutingService.resolveCoexistencePair(seedWa);
        isCoex = pair.isCoexistence;
      }
    } catch (err: any) {
      logger.warn(
        { err: err?.message, ticketId: (ticket as any).id },
        "[CoexAwareSender] no se pudo resolver coexistencia (cae a legacy)"
      );
      isCoex = false;
    }
  }

  // 2) Coexistencia → router central (un solo intento lógico + fallback).
  if (isCoex) {
    // Asegurar contact cargado (routeAndSendOutbound lo usa para remoteJid).
    if (!(ticket as any).contact && (ticket as any).contactId) {
      try {
        (ticket as any).contact = await Contact.findByPk((ticket as any).contactId);
      } catch (_e) {
        /* best-effort */
      }
    }

    const { routeAndSendOutbound } = await import(
      "./CoexistenceOutboundRouterService"
    );

    const res = await routeAndSendOutbound({
      ticket,
      body,
      companyId,
      requestedBy,
      quotedMsg: input.quotedMsg
    });

    if (!res.ok) {
      // Falla real (p.ej. ventana Meta cerrada y sin Baileys) → propagar como
      // error para que el caller marque el envío como fallido (no reintenta
      // por otro canal: ya se evaluó el fallback dentro del dispatcher).
      throw new Error(
        `[CoexAwareSender] router_send_failed: ${res.error?.code || ""} ${res.error?.message || ""}`.trim()
      );
    }

    return {
      ok: true,
      provider: res.provider,
      fallbackApplied: res.fallbackApplied,
      viaRouter: true,
      providerMessageId: res.providerMessageId
    };
  }

  // 3) Legacy (sin coexistencia) — comportamiento idéntico a hoy.
  const { default: SendWhatsAppMessage } = await import(
    "../WbotServices/SendWhatsAppMessage"
  );
  const sent = await SendWhatsAppMessage({
    body,
    ticket,
    quotedMsg: input.quotedMsg || null
  } as any);

  const providerMessageId =
    (sent as any)?.key?.id ||
    (sent as any)?.messages?.[0]?.id ||
    (sent as any)?.id?.id ||
    null;

  return {
    ok: true,
    provider: "baileys",
    fallbackApplied: false,
    viaRouter: false,
    providerMessageId
  };
};

export default { sendTicketText };
