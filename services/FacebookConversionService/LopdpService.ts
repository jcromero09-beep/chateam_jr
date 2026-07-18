/**
 * [Fase2·N3 LOPDP] Consentimiento de marketing por contacto + derecho de supresión.
 *
 * Ecuador LOPDP: el titular puede (a) retirar el consentimiento y (b) ejercer el
 * derecho al olvido. Al suprimir, se PURGA la cola de eventos pendientes del titular
 * (no se puede seguir enviando sus datos a Meta) y se marca el contacto como borrado.
 * El hashing SHA-256 de PII ya lo hace SendWebsiteEvent.
 */
import { Op } from "sequelize";
import Contact from "../../models/Contact";
import FacebookConversionEvent from "../../models/FacebookConversionEvent";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

const PREFIX = "[LOPDP]";

export type Consent = "granted" | "denied" | "unknown";

/** ¿Se le puede enviar eventos de marketing a este contacto? */
export const hasMarketingConsent = async (contactId: number): Promise<boolean> => {
  const c = await Contact.findByPk(contactId);
  if (!c) return false;
  if ((c as any).erasedAt) return false; // suprimido = nunca
  // 'denied' bloquea; 'unknown'/'granted' permiten (compat: el opt-in de mensajería
  // ya es consentimiento implícito para la conversación; 'denied' es explícito).
  return (c as any).marketingConsent !== "denied";
};

export const setConsent = async (companyId: number, contactId: number, consent: Consent): Promise<Contact> => {
  const c = await Contact.findOne({ where: { id: contactId, companyId } as any });
  if (!c) throw new AppError("ERR_CONTACT_NOT_FOUND", 404);
  (c as any).marketingConsent = consent;
  (c as any).consentUpdatedAt = new Date();
  await c.save();
  logger.info(`${PREFIX} consentimiento contacto=${contactId} → ${consent}`);
  return c;
};

/**
 * Derecho de supresión: purga los eventos CAPI PENDIENTES del titular y marca el
 * contacto como borrado. Los ya enviados a Meta no se pueden "des-enviar" (se
 * documenta), pero se corta cualquier envío futuro.
 */
export const eraseContact = async (companyId: number, contactId: number): Promise<{ purgedPending: number; alreadySent: number }> => {
  const c = await Contact.findOne({ where: { id: contactId, companyId } as any });
  if (!c) throw new AppError("ERR_CONTACT_NOT_FOUND", 404);

  // Purga de la cola de eventos pendientes (no enviados) del titular.
  const purgedPending = await FacebookConversionEvent.destroy({
    where: { companyId, contactId, responseStatus: { [Op.in]: ["pending", "failed"] } } as any
  }).catch(() => 0);

  const alreadySent = await FacebookConversionEvent.count({
    where: { companyId, contactId, responseStatus: { [Op.in]: ["sent", "success"] } } as any
  }).catch(() => 0);

  (c as any).marketingConsent = "denied";
  (c as any).erasedAt = new Date();
  await c.save();

  logger.warn(`${PREFIX} SUPRESIÓN contacto=${contactId}: ${purgedPending} eventos pendientes purgados, ${alreadySent} ya enviados (irreversibles)`);
  return { purgedPending, alreadySent };
};

export default { hasMarketingConsent, setConsent, eraseContact };
