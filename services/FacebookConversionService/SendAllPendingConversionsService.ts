import { Op } from "sequelize";
import CampaignMessage from "../../models/CampaignMessage";
import FacebookConversionEvent from "../../models/FacebookConversionEvent";
import SendConversionEvent from "./SendConversionEvent";
import logger from "../../utils/logger";

/**
 * SendAllPendingConversionsService — Envío MASIVO de conversiones Purchase pendientes.
 *
 * "Pendiente" = un contacto de la tabla CampaignMessage que NO tiene todavía una conversión
 * Purchase enviada (FacebookConversionEvent con responseStatus 'sent'/'success').
 *
 * Reglas (definidas con el usuario):
 *  - Solo se envían las que TIENEN un valor (monto) en la nota (`conversionNote`). Las que no
 *    tienen valor se OMITEN (skipped) y se reportan.
 *  - Una conversión por CONTACTO (dedupe): si un contacto tiene varias campaign messages
 *    pendientes, se envía UNA (la primera con valor), coherente con el estado por-contacto de la UI.
 *  - Incluye tanto exactas (con ctwaClid) como aproximadas (sin ctwaClid).
 *  - `dryRun`: no envía nada, solo devuelve el conteo (para el modal de confirmación).
 *
 * Multi-tenant: TODA query filtra por companyId.
 */

export interface SendAllPendingResult {
  /** Contactos pendientes únicos considerados. */
  totalPendingContacts: number;
  /** Conversiones enviadas con éxito (o enviables, en dryRun). */
  sent: number;
  /** Contactos omitidos por no tener valor / whatsappId. */
  skipped: number;
  /** Envíos que fallaron (0 en dryRun). */
  failed: number;
  dryRun: boolean;
}

const parseValueFromNote = (note?: string | null): number => {
  if (!note) return 0;
  const n = parseFloat(String(note).replace(/[^0-9.]/g, "") || "0");
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const SendAllPendingConversionsService = async ({
  companyId,
  dryRun = false
}: {
  companyId: number;
  dryRun?: boolean;
}): Promise<SendAllPendingResult> => {
  // 1) Contactos que YA tienen una conversión Purchase enviada.
  const sentEvents = await FacebookConversionEvent.findAll({
    where: {
      companyId,
      eventName: "Purchase",
      responseStatus: { [Op.in]: ["sent", "success"] }
    },
    attributes: ["contactId"],
    group: ["contactId"]
  });
  const sentContactIds = sentEvents
    .map((e: any) => Number(e.contactId))
    .filter((id: number) => Number.isFinite(id) && id > 0);

  // 2) CampaignMessages pendientes (contacto sin conversión enviada).
  const where: any = { companyId };
  if (sentContactIds.length) {
    where.contactId = { [Op.notIn]: sentContactIds };
  }
  const pending = await CampaignMessage.findAll({
    where,
    order: [["createdAt", "DESC"]]
  });

  // 3) Agrupar por contacto: una conversión por contacto, eligiendo la primera con valor.
  const pendingContactIds = new Set<number>();
  const byContact = new Map<number, { msg: any; value: number }>();
  for (const msg of pending as any[]) {
    const cid = Number(msg.contactId);
    if (!Number.isFinite(cid) || cid <= 0) continue;
    pendingContactIds.add(cid);
    if (byContact.has(cid)) continue;
    const value = parseValueFromNote(msg.conversionNote);
    const whatsappId = Number(msg.whatsappId);
    if (value > 0 && Number.isFinite(whatsappId) && whatsappId > 0) {
      byContact.set(cid, { msg, value });
    }
  }

  const totalPendingContacts = pendingContactIds.size;
  const enviables = byContact.size;
  const skipped = totalPendingContacts - enviables; // sin valor o sin whatsappId

  if (dryRun) {
    return {
      totalPendingContacts,
      sent: enviables,
      skipped,
      failed: 0,
      dryRun: true
    };
  }

  // 4) Enviar.
  let sent = 0;
  let failed = 0;
  for (const { msg, value } of byContact.values()) {
    try {
      await SendConversionEvent({
        companyId,
        whatsappId: Number(msg.whatsappId),
        eventName: "Purchase",
        contactId: Number(msg.contactId),
        messageId: msg.messageId ? Number(msg.messageId) : undefined,
        ctwaClid: msg.ctwaClid || undefined,
        customData: { value, currency: "USD" }
      });
      sent++;
    } catch (err: any) {
      failed++;
      logger.warn(
        `[SendAllPending] Falló envío de conversión (campaignMessageId=${msg.id}, contactId=${msg.contactId}): ${err?.message || err}`
      );
    }
  }

  logger.info(
    `[SendAllPending] company=${companyId} → enviadas=${sent}, omitidas=${skipped}, fallidas=${failed} (de ${totalPendingContacts} contactos pendientes)`
  );

  return {
    totalPendingContacts,
    sent,
    skipped,
    failed,
    dryRun: false
  };
};

export default SendAllPendingConversionsService;
