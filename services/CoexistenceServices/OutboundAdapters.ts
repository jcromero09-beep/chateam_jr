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

export interface DispatchResult {
  provider: AdapterProvider;
  providerMessageId: string | null;
  ok: boolean;
  rawResult?: any;
  error?: { message: string; name?: string };
}

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
      logger.error(
        { err: err?.message, ticketId: (ticket as any).id },
        "[OutboundAdapter:meta] send failed"
      );
      return {
        provider: "meta",
        providerMessageId: null,
        ok: false,
        error: { message: err?.message, name: err?.name }
      };
    }
  }
};

export const getAdapter = (provider: AdapterProvider) =>
  provider === "meta" ? metaAdapter : baileysAdapter;

export default { baileysAdapter, metaAdapter, getAdapter };
