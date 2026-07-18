/**
 * OutboundAdapters — FASE 4 Coexistencia WhatsApp.
 *
 * Interfaz común para enviar texto por cualquier proveedor (Meta / Baileys).
 * Delega a las implementaciones existentes (SendWhatsAppMessage / metaSendService)
 * SIN reescribirlas — la abstracción sólo unifica el contrato.
 *
 * Contrato:
 *   send(ticket, body, options) → Promise<DispatchResult>
 *
 * DispatchResult incluye providerMessageId para reconciliación posterior
 * de acks/statuses (FASE 6).
 */
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import Contact from "../../models/Contact";
import logger from "../../utils/logger";

import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import { sendTextDynamic } from "../MetaServices/metaSendService";

export type AdapterProvider = "meta" | "baileys";

export interface AdapterSendInput {
  ticket: Ticket;
  whatsapp: Whatsapp;
  contact?: Contact | null;
  body: string;
  quotedMsg?: any;
}

export interface DispatchError {
  message: string;
  name?: string;
  /** Código numérico de Meta Graph API (cuando aplica). */
  code?: number | string;
  /** Subcódigo Meta. */
  subcode?: number | string;
  /** Indica si el error es por ventana 24h cerrada (re-engagement). */
  closedWindow?: boolean;
  /** Indica si el error es transitorio y vale la pena reintentar. */
  retriable?: boolean;
  /** fbtrace_id para soporte Meta. */
  fbtrace_id?: string;
}

export interface DispatchResult {
  provider: AdapterProvider;
  providerMessageId: string | null;
  ok: boolean;
  rawResult?: any;
  error?: DispatchError;
}

// ───────────────────────────────────────────────────────────────────
// FASE 7 — Detección de errores Meta de ventana 24h cerrada
// ───────────────────────────────────────────────────────────────────
// Códigos oficiales de Meta WhatsApp Cloud API que indican que el
// mensaje libre fue rechazado por estar fuera de la ventana de 24h.
// Cuando aparece uno de estos: el dispatcher debe intentar fallback
// por Baileys (si está disponible) o pedir template Meta.
//
// Ref: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
//   131047 — Re-engagement message  (ventana cerrada)
//   131051 — Unsupported message type (a veces relacionado)
//   131026 — Message Undeliverable
//   131048 — Spam restrictions
//   131056 — Pair rate limit
//   470    — Re-engagement (legacy code)
//   368    — Temporarily blocked / re-engagement requirement
const META_CLOSED_WINDOW_CODES = new Set<number | string>([
  131047,
  470,
  368,
  131048,
  131026
]);

const META_RETRIABLE_CODES = new Set<number | string>([
  131056, // pair rate limit
  131000, // generic
  130472, // user marked as experiment
  4 // application request limit reached
]);

const classifyMetaError = (err: any): DispatchError => {
  const data = err?.response?.data?.error || err?.error || {};
  const code = data?.code;
  const subcode = data?.error_subcode;
  const fbtrace_id = data?.fbtrace_id;
  const messageRaw =
    data?.error_user_msg ||
    data?.message ||
    err?.message ||
    "meta_send_failed";

  const closedWindow =
    META_CLOSED_WINDOW_CODES.has(code) ||
    META_CLOSED_WINDOW_CODES.has(subcode) ||
    /re-?engagement|24[\s-]?hour|outside.*window|message.*template/i.test(
      String(messageRaw)
    );

  const retriable =
    META_RETRIABLE_CODES.has(code) || (err?.response?.status >= 500);

  return {
    message: String(messageRaw).substring(0, 500),
    name: err?.name,
    code,
    subcode,
    fbtrace_id,
    closedWindow,
    retriable
  };
};

// ═══════════════════════════════════════════════════════════════
// BAILEYS ADAPTER
// ═══════════════════════════════════════════════════════════════

export const baileysAdapter = {
  provider: "baileys" as const,
  async send(input: AdapterSendInput): Promise<DispatchResult> {
    try {
      const result = await SendWhatsAppMessage({
        body: input.body,
        ticket: input.ticket,
        quotedMsg: input.quotedMsg
      } as any);
      // SendWhatsAppMessage retorna el objeto WAMessage de Baileys
      // con key.id = providerMessageId.
      const providerMessageId =
        (result as any)?.key?.id ||
        (result as any)?.messageId ||
        null;
      return {
        provider: "baileys",
        providerMessageId,
        ok: true,
        rawResult: result
      };
    } catch (err: any) {
      logger.error(
        { err: err?.message, ticketId: (input.ticket as any).id },
        "[OutboundAdapter:baileys] send failed"
      );
      return {
        provider: "baileys",
        providerMessageId: null,
        ok: false,
        error: { message: err?.message, name: err?.name }
      };
    }
  }
};

// ═══════════════════════════════════════════════════════════════
// META CLOUD API ADAPTER
// ═══════════════════════════════════════════════════════════════

export const metaAdapter = {
  provider: "meta" as const,
  async send(input: AdapterSendInput): Promise<DispatchResult> {
    const { whatsapp, ticket, body } = input;
    const phoneNumberId = (whatsapp as any).phoneNumberId;
    const tokenMeta = (whatsapp as any).tokenMeta;
    const contactNumber =
      ((ticket as any)?.contact?.number as string) ||
      ((input.contact as any)?.number as string) ||
      "";

    if (!phoneNumberId || !tokenMeta) {
      return {
        provider: "meta",
        providerMessageId: null,
        ok: false,
        error: {
          message: "meta connection missing phoneNumberId or tokenMeta"
        }
      };
    }
    if (!contactNumber) {
      return {
        provider: "meta",
        providerMessageId: null,
        ok: false,
        error: { message: "meta send requires contact.number" }
      };
    }

    // Meta espera sólo dígitos (sin '+'). Normalizar.
    const to = contactNumber.replace(/\D/g, "");

    try {
      const response = await sendTextDynamic(to, body, phoneNumberId, tokenMeta);
      // respuesta Meta: { messages: [{ id: 'wamid.xxx' }], ... }
      const wamid =
        (response as any)?.data?.messages?.[0]?.id ||
        (response as any)?.messages?.[0]?.id ||
        null;
      return {
        provider: "meta",
        providerMessageId: wamid,
        ok: true,
        rawResult: (response as any)?.data || response
      };
    } catch (err: any) {
      const classified = classifyMetaError(err);
      logger.error(
        {
          err: classified.message,
          code: classified.code,
          subcode: classified.subcode,
          closedWindow: classified.closedWindow,
          ticketId: (ticket as any).id
        },
        "[OutboundAdapter:meta] send failed"
      );
      return {
        provider: "meta",
        providerMessageId: null,
        ok: false,
        error: classified
      };
    }
  }
};

export const getAdapter = (provider: AdapterProvider) =>
  provider === "meta" ? metaAdapter : baileysAdapter;

export default { baileysAdapter, metaAdapter, getAdapter };
