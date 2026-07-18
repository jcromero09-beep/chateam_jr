/**
 * KanbanCustomConversionDispatchService
 *
 * Dispatcher GENÉRICO de conversiones personalizadas Meta cuando un ticket cae
 * en una etapa Kanban. Reemplaza el envío fijo de "Lead" desde Kanban por una
 * conversión dinámica configurada por etiqueta.
 *
 * Solo envía si TODAS estas condiciones se cumplen:
 *   - el tag es Kanban (kanban === 1)
 *   - tag.sendMetaConversion === true   (check "Enviar conversión a Meta")
 *   - hay tag.metaEventName
 *   - hay tag.metaRule o tag.metaLeadStatus
 *
 * Si el check está apagado o falta config → NO envía nada (ni audita).
 *
 * Payload CAPI:
 *   event_name        = tag.metaEventName
 *   event_id          = estable por (company, contact, kanbanKey, evento)
 *   action_source     = "business_messaging" con ctwa_clid, "physical_store" sin ctwa_clid
 *   messaging_channel = "whatsapp" solo cuando action_source es business_messaging
 *   custom_data       = { conversion_name, lead_status, kanban_key,
 *                         kanban_tag_id, kanban_tag_name, contact_name,
 *                         contact_number, whatsapp_name, whatsapp_number }
 *
 * Auditoría: reusa la tabla KanbanLeadConversionEvents (eventName deja de ser
 * fijo "Lead"). Cada intento queda con status, payload, destino, error y
 * fbtraceId. NO toca Purchase, Login, QR/StartTrial ni el Lead de campañas.
 */

import axios from "axios";
import { Op } from "sequelize";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Tag from "../../models/Tag";
import Whatsapp from "../../models/Whatsapp";
import CampaignMessage from "../../models/CampaignMessage";
import KanbanLeadConversionEvent from "../../models/KanbanLeadConversionEvent";
import logger from "../../utils/logger";
import {
  resolveConversionDestination,
  buildUserData,
  getApiVersion,
  ConversionDestination,
  WebsiteEventUser
} from "./SendWebsiteEvent";
import { shouldSendMetaConversion } from "./MetaConversionPolicyService";

const PREFIX = "[KANBAN-CC]";

interface DispatchParams {
  companyId: number;
  ticketId: number;
  tagId: number;
  source?: string;
  userId?: number;
}

const maskId = (value?: string | number | null): string => {
  if (value === undefined || value === null || value === "") return "N/A";
  const raw = String(value);
  if (raw.length <= 8) return raw;
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
};

/** eventId estable: misma (company, contact, etapa, evento) → mismo id → Meta deduplica. */
const buildEventId = (
  companyId: number,
  contactId: number | null,
  kanbanKey: string,
  eventName: string
): string => {
  const safe = (s: string) => (s || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  return `kanban_cc_${companyId}_${contactId ?? "anon"}_${safe(kanbanKey)}_${safe(eventName)}`;
};

const resolveBusinessMessagingPageId = async (companyId: number): Promise<string | undefined> => {
  const pageConnection = await Whatsapp.findOne({
    where: {
      companyId,
      channel: "facebook",
      status: "CONNECTED",
      facebookPageUserId: { [Op.ne]: null } as any
    },
    order: [["isDefault", "DESC"], ["id", "ASC"]]
  });

  return pageConnection?.facebookPageUserId || undefined;
};

const resolveCtwaClid = async (
  ticketId: number,
  contactId: number | null
): Promise<string | undefined> => {
  const campaignMessage = await CampaignMessage.findOne({
    where: {
      [Op.or]: [
        { ticketId },
        ...(contactId ? [{ contactId }] : [])
      ],
      ctwaClid: { [Op.ne]: null } as any
    },
    order: [["createdAt", "DESC"]]
  });

  return campaignMessage?.ctwaClid || undefined;
};

export const dispatchKanbanCustomConversion = async (
  params: DispatchParams
): Promise<{ ok: boolean; reason?: string; eventId?: number; status?: string }> => {
  const _t0 = Date.now(); // [N1] inicio para medir latencia cambio-etapa→aceptado-Meta
  const { companyId, ticketId, tagId, userId } = params;
  const source = params.source || "kanban_custom_conversion";

  const policy = await shouldSendMetaConversion({
    companyId,
    eventKey: "kanban_custom_conversion"
  });
  if (!policy.enabled) {
    logger.info(
      `${PREFIX} skip policy_disabled company=${companyId} ticket=${ticketId} ` +
      `tag=${tagId} eventKey=kanban_custom_conversion`
    );
    return { ok: true, reason: "policy_disabled" };
  }

  // ─── 1. Cargar Tag y validar gate de configuración ──────────────
  let tag: Tag | null;
  try {
    tag = await Tag.findOne({ where: { id: tagId, companyId } });
  } catch (err: any) {
    logger.error(`${PREFIX} error consultando Tag ${tagId}: ${err?.message || err}`);
    return { ok: false, reason: "tag_query_error" };
  }

  if (!tag) return { ok: false, reason: "tag_not_found" };
  if (Number(tag.kanban) !== 1) return { ok: false, reason: "tag_not_kanban" };
  if (!tag.sendMetaConversion) return { ok: false, reason: "meta_conversion_disabled" };

  const eventName = (tag.metaEventName || "").trim();
  const leadStatus = (tag.metaLeadStatus || "").trim();
  const hasRule = !!(tag.metaRule && tag.metaRule.trim());

  if (!eventName) return { ok: false, reason: "missing_event_name" };
  if (!hasRule && !leadStatus) return { ok: false, reason: "missing_rule_and_lead_status" };

  const kanbanKey = (tag.key || tag.name || "").trim();
  const kanbanTagName = tag.name || "";
  if (!kanbanKey) return { ok: false, reason: "tag_without_key" };

  // ─── 2. Cargar Ticket + Contact ─────────────────────────────────
  let ticket: Ticket | null;
  try {
    ticket = await Ticket.findOne({
      where: { id: ticketId, companyId },
      include: [{ model: Contact, as: "contact", attributes: ["id", "name", "number", "email"] }]
    });
  } catch (err: any) {
    logger.error(`${PREFIX} error consultando Ticket ${ticketId}: ${err?.message || err}`);
    return { ok: false, reason: "ticket_query_error" };
  }
  if (!ticket) return { ok: false, reason: "ticket_not_found" };

  const contact = ticket.contact;
  const contactId = contact?.id || null;

  // [Fase2·N3 LOPDP] No enviar eventos si el contacto retiró consentimiento o fue suprimido.
  if (contactId) {
    try {
      const { hasMarketingConsent } = await import("./LopdpService");
      if (!(await hasMarketingConsent(contactId))) {
        logger.info(`${PREFIX} skip LOPDP: contacto ${contactId} sin consentimiento de marketing`);
        return { ok: true, reason: "no_consent" };
      }
    } catch { /* si el check falla, no bloquear el flujo principal */ }
  }
  const whatsapp = ticket.whatsappId
    ? await Whatsapp.findOne({ where: { id: ticket.whatsappId, companyId } })
    : null;

  // ─── 3. Dedupe por (company, contact, kanbanKey, eventName) ──────
  // El índice único usa estos mismos campos. Si el intento anterior falló,
  // reusamos esa fila para permitir retry sin romper la deduplicación.
  let retryRecord: KanbanLeadConversionEvent | null = null;
  if (contactId) {
    try {
      const existing = await KanbanLeadConversionEvent.findOne({
        where: {
          companyId,
          contactId,
          kanbanKey,
          eventName
        },
        order: [["createdAt", "DESC"]]
      });
      if (existing) {
        if (["pending", "sent", "success"].includes(existing.responseStatus)) {
          logger.info(
            `${PREFIX} duplicado company=${companyId} contact=${contactId} key=${kanbanKey} event=${eventName} — skip (id=${existing.id})`
          );
          return { ok: true, reason: "duplicate_skipped", eventId: existing.id, status: existing.responseStatus };
        }
        retryRecord = existing;
      }
    } catch (err: any) {
      logger.warn(`${PREFIX} error verificando duplicados (continuamos): ${err?.message || err}`);
    }
  }

  // ─── 4. Construir payloads ──────────────────────────────────────
  const eventIdString = buildEventId(companyId, contactId, kanbanKey, eventName);

  const eventUser: WebsiteEventUser = {
    userId: contactId || ticketId,
    companyId,
    email: contact?.email,
    phone: contact?.number,
    name: contact?.name
  };

  const ctwaClid = await resolveCtwaClid(ticketId, contactId);
  const pageId = ctwaClid ? await resolveBusinessMessagingPageId(companyId) : undefined;
  const actionSource = ctwaClid ? "business_messaging" : "physical_store";
  const messagingChannel = ctwaClid ? "whatsapp" : undefined;
  const userData = buildUserData(eventUser);
  if (ctwaClid && pageId) userData.page_id = pageId;
  if (ctwaClid) userData.ctwa_clid = ctwaClid;

  const customData: Record<string, any> = {
    conversion_name: kanbanTagName || kanbanKey,
    lead_status: leadStatus || undefined,
    kanban_key: kanbanKey,
    kanban_tag_id: tag.id,
    // [Fase2·B5.1] Valor fijo por etapa (si la etiqueta lo define) para eventos con valor.
    ...((tag as any).metaValue != null
      ? { value: Number((tag as any).metaValue), currency: (tag as any).metaCurrency || "USD" }
      : {}),
    kanban_tag_name: kanbanTagName,
    contact_name: contact?.name || null,
    contact_number: contact?.number || null,
    whatsapp_name: whatsapp?.name || null,
    whatsapp_number: whatsapp?.number || null,
    channel: whatsapp?.channel || ticket.channel || null,
    attribution_mode: ctwaClid ? "ctwa_clid" : "phone_physical_store",
    source
  };

  // ─── 5. Sin contacto → registrar skipped ────────────────────────
  if (!contactId) {
    try {
      const skipped = await KanbanLeadConversionEvent.create({
        companyId, ticketId, contactId: null,
        kanbanTagId: tag.id, kanbanKey, kanbanTagName,
        eventName, eventId: eventIdString, source,
        responseStatus: "skipped",
        errorMessage: "Ticket sin contacto asociado",
        userData: {}, customData, userId: userId || null
      } as any);
      return { ok: true, reason: "no_contact", eventId: skipped.id, status: "skipped" };
    } catch (err: any) {
      logger.error(`${PREFIX} error creando skipped: ${err?.message || err}`);
      return { ok: false, reason: "skipped_log_error" };
    }
  }

  // ─── 6. Resolver destino Meta (pixel/dataset + token) ───────────
  let destination: ConversionDestination | undefined;
  try {
    destination = await resolveConversionDestination(eventUser, {
      actionSource: "system_generated",
      conversionCompanyId: companyId,
      whatsappId: ticket.whatsappId || undefined
    });
  } catch (err: any) {
    logger.error(`${PREFIX} error resolviendo destino: ${err?.message || err}`);
  }

  // ─── 7. Registro pending (siempre) ──────────────────────────────
  let record: KanbanLeadConversionEvent;
  try {
    const auditPayload = {
      companyId, ticketId, contactId,
      kanbanTagId: tag.id, kanbanKey, kanbanTagName,
      eventName, eventId: eventIdString, source,
      destinationId: destination?.destinationId || null,
      destinationSource: destination?.source || null,
      responseStatus: destination ? "pending" : "skipped",
      userData,
      customData,
      userId: userId || null,
      errorMessage: destination ? null : "Sin destino Meta CAPI resuelto",
      fbtraceId: null,
      fbResponse: null,
      sentAt: null
    } as any;

    if (retryRecord) {
      await retryRecord.update(auditPayload);
      record = retryRecord;
    } else {
      record = await KanbanLeadConversionEvent.create(auditPayload);
    }
  } catch (err: any) {
    logger.error(`${PREFIX} error creando/actualizando registro pending: ${err?.message || err}`);
    return { ok: false, reason: "log_create_error" };
  }

  if (!destination) {
    logger.warn(`${PREFIX} sin destino Meta para company=${companyId} (id=${record.id})`);
    return { ok: true, reason: "no_destination", eventId: record.id, status: "skipped" };
  }

  // ─── 8. Enviar a Meta CAPI ──────────────────────────────────────
  const url = `https://graph.facebook.com/${getApiVersion()}/${destination.destinationId}/events`;
  const event = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventIdString,
    action_source: actionSource,
    user_data: userData,
    custom_data: customData
  } as Record<string, any>;

  if (messagingChannel) {
    event.messaging_channel = messagingChannel;
  }

  try {
    const response = await axios.post(
      url,
      { data: [event], partner_agent: "jrchateam-kanban-customconv-capi/1.0" },
      { params: { access_token: destination.accessToken }, timeout: 10000 }
    );

    const eventsReceived = Number(response.data?.events_received || 0);
    const fbtraceId = response.data?.fbtrace_id || null;
    const isSuccess = response.status >= 200 && response.status < 300 && eventsReceived > 0;

    await record.update({
      responseStatus: isSuccess ? "success" : "sent",
      fbtraceId,
      fbResponse: response.data,
      sentAt: new Date()
    });

    // [Fase2·N1] SLO de latencia de señal: cambio-de-etapa → aceptado por Meta.
    // Objetivo <60s (p95<10s). Por encima de 60s se alerta: la señal llegó tarde y
    // Meta la atribuye peor.
    const latencyMs = Date.now() - _t0;
    if (isSuccess && latencyMs > 60000) {
      logger.warn(`${PREFIX} [N1] latencia ALTA ${Math.round(latencyMs / 1000)}s (SLO 60s) company=${companyId} event=${eventName}`);
      try {
        const CampaignAlertService = (await import("../CampaignAlertService")).default;
        await CampaignAlertService.createAlert({
          companyId, campaignId: String(tag.id), campaignName: `Señal ${eventName}`,
          alertType: "spend_anomaly", severity: "warning",
          title: "Latencia de señal alta",
          message: `El evento ${eventName} tardó ${Math.round(latencyMs / 1000)}s en ser aceptado por Meta (SLO 60s). Revisa la cola de eventos.`,
          metric: "latency_ms", currentValue: latencyMs, thresholdValue: 60000
        });
      } catch { /* la alerta no debe romper el dispatch */ }
    } else if (isSuccess) {
      logger.info(`${PREFIX} [N1] latencia ${latencyMs}ms company=${companyId} event=${eventName}`);
    }

    logger.info(
      `${PREFIX} enviado | id=${record.id} | event=${eventName} | dest=${maskId(destination.destinationId)} | recv=${eventsReceived} | fbtrace=${fbtraceId || "N/A"}`
    );
    return { ok: true, eventId: record.id, status: isSuccess ? "success" : "sent" };
  } catch (error: any) {
    const responseData = error?.response?.data || null;
    const metaError = responseData?.error || null;
    const fbtraceId = responseData?.fbtrace_id || metaError?.fbtrace_id || null;
    const errMessage = metaError?.message || error?.message || "Error desconocido enviando a Meta CAPI";

    try {
      await record.update({
        responseStatus: "failed",
        fbtraceId,
        fbResponse: responseData,
        errorMessage: errMessage,
        sentAt: new Date()
      });
    } catch (updateErr: any) {
      logger.error(`${PREFIX} error actualizando failed id=${record.id}: ${updateErr?.message || updateErr}`);
    }

    logger.error(
      `${PREFIX} error Meta | id=${record.id} | event=${eventName} | code=${metaError?.code || "N/A"} | message=${errMessage} | fbtrace=${fbtraceId || "N/A"}`
    );
    return { ok: false, reason: "meta_error", eventId: record.id, status: "failed" };
  }
};

/** Wrapper async non-blocking — para no frenar el cambio de etapa. */
export const dispatchKanbanCustomConversionAsync = (params: DispatchParams): void => {
  setImmediate(() => {
    dispatchKanbanCustomConversion(params).catch((err: any) => {
      logger.error(
        `${PREFIX} error inesperado (async) company=${params.companyId} ticket=${params.ticketId} tag=${params.tagId}: ${err?.message || err}`
      );
    });
  });
};

export default { dispatchKanbanCustomConversion, dispatchKanbanCustomConversionAsync };
