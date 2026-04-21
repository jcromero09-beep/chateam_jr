/**
 * ConversationResolverService — FASE 3 Coexistencia WhatsApp.
 *
 * Resuelve la UnifiedConversation lógica de un cliente a partir de:
 *   1. Un Contact existente (buscar por contactId).
 *   2. Un número canónico (buscar/crear por companyId + canonicalNumber).
 *   3. Un binding provider:identifier.
 *
 * Garantías:
 *   - UNIQUE(companyId, canonicalNumber) evita duplicación concurrente.
 *   - findOrCreate con captura de SequelizeUniqueConstraintError para
 *     reintentar lookup si dos workers compiten.
 *
 * NO rompe la lógica legacy: todo Contact/Ticket sigue funcionando
 * sin conversationId durante la transición.
 */
import { Op } from "sequelize";
import UnifiedConversation from "../../models/UnifiedConversation";
import ContactBinding from "../../models/ContactBinding";
import Contact from "../../models/Contact";
import logger from "../../utils/logger";

/**
 * Normaliza un número a su forma canónica: sólo dígitos.
 * Remueve '+', espacios, guiones, paréntesis.
 * Maneja formato Baileys: '593987009472@s.whatsapp.net' → '593987009472'.
 */
export const normalizeNumber = (raw: string | null | undefined): string => {
  if (!raw) return "";
  const s = String(raw);
  // Quitar sufijo JID si existe
  const atIdx = s.indexOf("@");
  const base = atIdx >= 0 ? s.substring(0, atIdx) : s;
  // Dejar solo dígitos
  return base.replace(/\D/g, "");
};

export interface ResolveInput {
  companyId: number;
  canonicalNumber?: string;
  /** Si se pasa un contact, se intenta inferir canonicalNumber de él */
  contact?: Contact | { id: number; number?: string; remoteJid?: string } | null;
}

export interface ResolveResult {
  conversation: UnifiedConversation;
  created: boolean;
}

/**
 * Resuelve (o crea) la UnifiedConversation para un par
 * (companyId, canonicalNumber).
 */
export const resolveOrCreate = async (
  input: ResolveInput
): Promise<ResolveResult | null> => {
  const companyId = input.companyId;
  let canonical =
    input.canonicalNumber ||
    normalizeNumber(
      (input.contact as any)?.number || (input.contact as any)?.remoteJid
    );

  if (!canonical || !companyId) {
    return null;
  }

  // 1) Buscar existente
  let conv = await UnifiedConversation.findOne({
    where: { companyId, canonicalNumber: canonical }
  });

  if (conv) {
    return { conversation: conv, created: false };
  }

  // 2) Intentar crear
  try {
    conv = await UnifiedConversation.create({
      companyId,
      canonicalNumber: canonical,
      primaryContactId: (input.contact as any)?.id ?? null,
      status: "active",
      routingPolicy: "auto"
    } as any);
    return { conversation: conv, created: true };
  } catch (err: any) {
    // Si otro worker creó la misma conversación concurrentemente,
    // UNIQUE(companyId, canonicalNumber) fallará → re-buscar.
    if (
      err?.name === "SequelizeUniqueConstraintError" ||
      err?.parent?.code === "23505"
    ) {
      const found = await UnifiedConversation.findOne({
        where: { companyId, canonicalNumber: canonical }
      });
      if (found) return { conversation: found, created: false };
    }
    logger.error(
      { err: err?.message, companyId, canonical },
      "[ConversationResolver] failed to resolveOrCreate"
    );
    throw err;
  }
};

/**
 * Agrega o actualiza un binding entre Contact (físico) y UnifiedConversation
 * (lógica) para un proveedor específico.
 *
 * UNIQUE(conversationId, provider, providerIdentifier) garantiza
 * atomicidad.
 */
export interface UpsertBindingInput {
  conversationId: string;
  companyId: number;
  contactId: number;
  whatsappId?: number | null;
  provider: string;
  providerIdentifier: string;
}

export const upsertBinding = async (
  input: UpsertBindingInput
): Promise<ContactBinding> => {
  const where = {
    conversationId: input.conversationId,
    provider: input.provider,
    providerIdentifier: input.providerIdentifier
  };

  const existing = await ContactBinding.findOne({ where });
  if (existing) {
    const patch: any = { lastSeenAt: new Date() };
    if (existing.contactId !== input.contactId) patch.contactId = input.contactId;
    if (
      input.whatsappId != null &&
      existing.whatsappId !== input.whatsappId
    ) {
      patch.whatsappId = input.whatsappId;
    }
    if (!existing.isActive) patch.isActive = true;
    await existing.update(patch);
    return existing;
  }

  try {
    const created = await ContactBinding.create({
      conversationId: input.conversationId,
      companyId: input.companyId,
      contactId: input.contactId,
      whatsappId: input.whatsappId ?? null,
      provider: input.provider,
      providerIdentifier: input.providerIdentifier,
      isActive: true,
      firstSeenAt: new Date(),
      lastSeenAt: new Date()
    } as any);
    return created;
  } catch (err: any) {
    if (
      err?.name === "SequelizeUniqueConstraintError" ||
      err?.parent?.code === "23505"
    ) {
      const found = await ContactBinding.findOne({ where });
      if (found) return found;
    }
    throw err;
  }
};

/**
 * Actualiza los metadatos "live" de la conversación:
 *   - lastInboundAt / lastInboundChannel
 *   - lastOutboundAt / lastOutboundChannel
 *   - currentChannel
 */
export const recordInbound = async (
  conversationId: string,
  channel: "meta" | "baileys" | string
): Promise<void> => {
  try {
    await UnifiedConversation.update(
      {
        currentChannel: channel,
        lastInboundChannel: channel,
        lastInboundAt: new Date()
      } as any,
      { where: { id: conversationId } }
    );
  } catch (err: any) {
    logger.warn(
      { err: err?.message, conversationId },
      "[ConversationResolver] recordInbound failed"
    );
  }
};

export const recordOutbound = async (
  conversationId: string,
  channel: "meta" | "baileys" | string
): Promise<void> => {
  try {
    await UnifiedConversation.update(
      {
        currentChannel: channel,
        lastOutboundChannel: channel,
        lastOutboundAt: new Date()
      } as any,
      { where: { id: conversationId } }
    );
  } catch (err: any) {
    logger.warn(
      { err: err?.message, conversationId },
      "[ConversationResolver] recordOutbound failed"
    );
  }
};

/**
 * Busca la conversación a partir de un Contact.
 * Si el Contact no tiene binding aún, devuelve null.
 */
export const getConversationByContact = async (
  companyId: number,
  contactId: number
): Promise<UnifiedConversation | null> => {
  const binding = await ContactBinding.findOne({
    where: { companyId, contactId, isActive: true },
    order: [["lastSeenAt", "DESC"]]
  });
  if (!binding) return null;
  return UnifiedConversation.findByPk(binding.conversationId);
};

export default {
  normalizeNumber,
  resolveOrCreate,
  upsertBinding,
  recordInbound,
  recordOutbound,
  getConversationByContact
};
