import axios from "axios";
import { Op } from "sequelize";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Tag from "../../models/Tag";
import Whatsapp from "../../models/Whatsapp";
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

interface SendKanbanLeadParams {
  companyId: number;
  ticketId: number;
  tagId: number;
  source?: string; // default: "kanban_label"
  userId?: number; // si fue manual: id del staff que asignó
}

const EVENT_NAME = "Lead" as const;
const DEFAULT_SOURCE = "kanban_label";
const DEFAULT_CURRENCY = "USD";

const maskId = (value?: string | number | null): string => {
  if (value === undefined || value === null || value === "") return "N/A";
  const raw = String(value);
  if (raw.length <= 8) return raw;
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
};

/**
 * Construye un eventId estable para deduplicar a nivel CAPI.
 * Mismo (company, contact, etapa) → mismo eventId. Meta deduplica.
 */
const buildEventId = (
  companyId: number,
  contactId: number | null,
  kanbanKey: string
): string => {
  const safeKey = (kanbanKey || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  return `kanban_lead_${companyId}_${contactId ?? "anon"}_${safeKey}`;
};

/**
 * Envía un evento `Lead` a Meta CAPI cuando se asigna una etiqueta
 * Kanban a un ticket (manual o por IA).
 *
 * Reglas:
 *  - SIEMPRE `eventName = "Lead"`.
 *  - NO toca ni replica el flujo de Purchase.
 *  - Resolución de destino (Pixel/Dataset + token) usa el mismo
 *    mecanismo de `SendWebsiteEvent.ts` (env → context → BD por
 *    candidate companyIds).
 *  - Si no hay Contact → registra `skipped`.
 *  - Si ya existe un envío `pending`, `sent` o `success` con la
 *    misma (companyId, contactId, kanbanKey, Lead) → no reenvía.
 *  - Errores nunca rompen el flujo de cambio de etiqueta.
 */
export const sendKanbanLeadConversionFromTagAssignment = async (
  params: SendKanbanLeadParams
): Promise<{
  ok: boolean;
  reason?: string;
  eventId?: number;
  status?: string;
}> => {
  const { companyId, ticketId, tagId, userId } = params;
  const source = params.source || DEFAULT_SOURCE;

  logger.info(
    `[KANBAN-CAPI] Preparando conversión Kanban Lead | company=${companyId} | ticket=${ticketId} | tag=${tagId} | source=${source}`
  );

  const policy = await shouldSendMetaConversion({
    companyId,
    eventKey: "kanban_legacy_lead"
  });
  if (!policy.enabled) {
    logger.info(
      `[KANBAN-CAPI] skip policy_disabled company=${companyId} ticket=${ticketId} ` +
      `tag=${tagId} eventKey=kanban_legacy_lead`
    );
    return { ok: true, reason: "policy_disabled" };
  }

  // ─── 1. Cargar Tag ──────────────────────────────────────────────
  let tag: Tag | null;
  try {
    tag = await Tag.findOne({ where: { id: tagId, companyId } });
  } catch (err: any) {
    logger.error(
      `[KANBAN-CAPI] Error consultando Tag ${tagId} (company=${companyId}): ${err?.message || err}`
    );
    return { ok: false, reason: "tag_query_error" };
  }

  if (!tag) {
    logger.warn(
      `[KANBAN-CAPI] Tag ${tagId} no existe para company=${companyId} — skip`
    );
    return { ok: false, reason: "tag_not_found" };
  }

  if (Number(tag.kanban) !== 1) {
    logger.info(
      `[KANBAN-CAPI] Tag ${tagId} (${tag.name}) no es Kanban — skip`
    );
    return { ok: false, reason: "tag_not_kanban" };
  }

  const kanbanKey = (tag.key || tag.name || "").trim();
  const kanbanTagName = tag.name || "";

  if (!kanbanKey) {
    logger.warn(
      `[KANBAN-CAPI] Tag ${tagId} sin key/name utilizable — skip`
    );
    return { ok: false, reason: "tag_without_key" };
  }

  // ─── 2. Cargar Ticket + Contact ────────────────────────────────
  let ticket: Ticket | null;
  try {
    ticket = await Ticket.findOne({
      where: { id: ticketId, companyId },
      include: [
        {
          model: Contact,
          as: "contact",
          attributes: ["id", "name", "number", "email"]
        }
      ]
    });
  } catch (err: any) {
    logger.error(
      `[KANBAN-CAPI] Error consultando Ticket ${ticketId}: ${err?.message || err}`
    );
    return { ok: false, reason: "ticket_query_error" };
  }

  if (!ticket) {
    logger.warn(
      `[KANBAN-CAPI] Ticket ${ticketId} no existe en company=${companyId} — skip`
    );
    return { ok: false, reason: "ticket_not_found" };
  }

  const contact = ticket.contact;
  const contactId = contact?.id || null;
  const whatsapp = ticket.whatsappId
    ? await Whatsapp.findOne({ where: { id: ticket.whatsappId, companyId } })
    : null;

  // ─── 3. Dedupe — buscar envío previo con misma key única ───────
  if (contactId) {
    try {
      const existing = await KanbanLeadConversionEvent.findOne({
        where: {
          companyId,
          contactId,
          kanbanKey,
          eventName: EVENT_NAME,
          responseStatus: { [Op.in]: ["pending", "sent", "success"] }
        },
        order: [["createdAt", "DESC"]]
      });

      if (existing) {
        logger.info(
          `[KANBAN-CAPI] Evento Lead duplicado para company=${companyId} contact=${contactId} key=${kanbanKey} — skip (existing id=${existing.id} status=${existing.responseStatus})`
        );
        return {
          ok: true,
          reason: "duplicate_skipped",
          eventId: existing.id,
          status: existing.responseStatus
        };
      }
    } catch (err: any) {
      logger.warn(
        `[KANBAN-CAPI] Error verificando duplicados (continuamos): ${err?.message || err}`
      );
    }
  }

  // ─── 4. Construir payloads ─────────────────────────────────────
  const eventIdString = buildEventId(companyId, contactId, kanbanKey);

  const eventUser: WebsiteEventUser = {
    userId: contactId || ticketId,
    companyId,
    email: contact?.email,
    phone: contact?.number,
    name: contact?.name
  };

  const customData = {
    conversion_name: kanbanTagName || kanbanKey,
    kanban_key: kanbanKey,
    kanban_tag_id: tag.id,
    kanban_tag_name: kanbanTagName,
    contact_name: contact?.name || null,
    contact_number: contact?.number || null,
    whatsapp_name: whatsapp?.name || null,
    whatsapp_number: whatsapp?.number || null,
    channel: whatsapp?.channel || ticket.channel || null,
    source,
    currency: DEFAULT_CURRENCY
  };

  // ─── 5. Sin contacto → guardar como skipped ────────────────────
  if (!contactId) {
    try {
      const skipped = await KanbanLeadConversionEvent.create({
        companyId,
        ticketId,
        contactId: null,
        kanbanTagId: tag.id,
        kanbanKey,
        kanbanTagName,
        eventName: EVENT_NAME,
        eventId: eventIdString,
        source,
        responseStatus: "skipped",
        errorMessage: "Ticket sin contacto asociado",
        userData: {},
        customData,
        userId: userId || null
      } as any);
      logger.info(
        `[KANBAN-CAPI] Sin contacto → skipped registrado id=${skipped.id}`
      );
      return {
        ok: true,
        reason: "no_contact",
        eventId: skipped.id,
        status: "skipped"
      };
    } catch (err: any) {
      logger.error(
        `[KANBAN-CAPI] Error creando registro skipped: ${err?.message || err}`
      );
      return { ok: false, reason: "skipped_log_error" };
    }
  }

  // ─── 6. Resolver destino Meta (Pixel/Dataset + token) ──────────
  let destination: ConversionDestination | undefined;
  try {
    destination = await resolveConversionDestination(eventUser, {
      actionSource: "system_generated",
      conversionCompanyId: companyId,
      whatsappId: ticket.whatsappId || undefined
    });
  } catch (err: any) {
    logger.error(
      `[KANBAN-CAPI] Error resolviendo destino: ${err?.message || err}`
    );
  }

  // ─── 7. Crear registro `pending` (siempre, sea cual sea destino)
  let record: KanbanLeadConversionEvent;
  try {
    record = await KanbanLeadConversionEvent.create({
      companyId,
      ticketId,
      contactId,
      kanbanTagId: tag.id,
      kanbanKey,
      kanbanTagName,
      eventName: EVENT_NAME,
      eventId: eventIdString,
      source,
      destinationId: destination?.destinationId || null,
      destinationSource: destination?.source || null,
      responseStatus: destination ? "pending" : "skipped",
      userData: buildUserData(eventUser),
      customData,
      userId: userId || null,
      errorMessage: destination ? null : "Sin destino Meta CAPI resuelto"
    } as any);
  } catch (err: any) {
    logger.error(
      `[KANBAN-CAPI] Error creando registro pending: ${err?.message || err}`
    );
    return { ok: false, reason: "log_create_error" };
  }

  if (!destination) {
    logger.warn(
      `[KANBAN-CAPI] Evento Lead omitido — sin destino Meta CAPI para company=${companyId} (id=${record.id})`
    );
    return {
      ok: true,
      reason: "no_destination",
      eventId: record.id,
      status: "skipped"
    };
  }

  logger.info(
    `[KANBAN-CAPI] Destino resuelto company=${companyId} | dest=${maskId(destination.destinationId)} | source=${destination.source}`
  );

  // ─── 8. Enviar a Meta CAPI ─────────────────────────────────────
  const url = `https://graph.facebook.com/${getApiVersion()}/${destination.destinationId}/events`;
  const event = {
    event_name: EVENT_NAME,
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventIdString,
    action_source: "system_generated",
    user_data: buildUserData(eventUser),
    custom_data: customData
  };

  try {
    const response = await axios.post(
      url,
      {
        data: [event],
        partner_agent: "jrchateam-kanban-lead-capi/1.0"
      },
      {
        params: { access_token: destination.accessToken },
        timeout: 10000
      }
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

    logger.info(
      `[KANBAN-CAPI] Lead enviado correctamente | id=${record.id} | eventId=${eventIdString} | dest=${maskId(destination.destinationId)} | eventsReceived=${eventsReceived} | fbtraceId=${fbtraceId || "N/A"}`
    );

    return {
      ok: true,
      eventId: record.id,
      status: isSuccess ? "success" : "sent"
    };
  } catch (error: any) {
    const responseData = error?.response?.data || null;
    const metaError = responseData?.error || null;
    const status = error?.response?.status || null;
    const fbtraceId = responseData?.fbtrace_id || metaError?.fbtrace_id || null;
    const errMessage =
      metaError?.message || error?.message || "Error desconocido enviando a Meta CAPI";

    try {
      await record.update({
        responseStatus: "failed",
        fbtraceId,
        fbResponse: responseData,
        errorMessage: errMessage,
        sentAt: new Date()
      });
    } catch (updateErr: any) {
      logger.error(
        `[KANBAN-CAPI] Error actualizando registro failed id=${record.id}: ${updateErr?.message || updateErr}`
      );
    }

    logger.error(
      `[KANBAN-CAPI] Error de Meta enviando Lead | id=${record.id} | dest=${maskId(destination.destinationId)} | httpStatus=${status || "N/A"} | code=${metaError?.code || "N/A"} | subcode=${metaError?.error_subcode || metaError?.subcode || "N/A"} | type=${metaError?.type || "N/A"} | message=${errMessage} | fbtraceId=${fbtraceId || "N/A"}`
    );

    return {
      ok: false,
      reason: "meta_error",
      eventId: record.id,
      status: "failed"
    };
  }
};

/**
 * Wrapper async non-blocking — para usar desde controllers/workers
 * sin frenar el flujo de cambio de etiqueta.
 */
export const sendKanbanLeadConversionFromTagAssignmentAsync = (
  params: SendKanbanLeadParams
): void => {
  setImmediate(() => {
    sendKanbanLeadConversionFromTagAssignment(params).catch((err: any) => {
      logger.error(
        `[KANBAN-CAPI] Error inesperado (async) company=${params.companyId} ticket=${params.ticketId} tag=${params.tagId}: ${err?.message || err}`
      );
    });
  });
};

/**
 * Reintenta un envío `failed`. Usado por el endpoint POST /retry.
 * Si el evento no es failed, devuelve `ok=false` con `reason=not_failed`.
 */
export const retryKanbanLeadConversion = async (
  companyId: number,
  recordId: number
): Promise<{ ok: boolean; reason?: string; status?: string }> => {
  const record = await KanbanLeadConversionEvent.findOne({
    where: { id: recordId, companyId }
  });
  if (!record) return { ok: false, reason: "not_found" };
  if (record.responseStatus !== "failed")
    return { ok: false, reason: "not_failed", status: record.responseStatus };

  const eventKey = record.eventName === EVENT_NAME
    ? "kanban_legacy_lead"
    : "kanban_custom_conversion";
  const policy = await shouldSendMetaConversion({
    companyId,
    eventKey
  });
  if (!policy.enabled) {
    await record.update({
      errorMessage: `Retry omitido: política Meta desactivada (${eventKey})`
    });
    return { ok: false, reason: "policy_disabled", status: record.responseStatus };
  }

  // Re-disparar misma operación (reusa dedupe interno por ID único)
  // Marcamos el viejo como `failed` (queda así) y disparamos uno nuevo.
  // Para forzar reenvío saltando dedupe, usamos directamente la lógica
  // de envío contra Meta con los datos snapshot del registro.
  const retryTicket = record.ticketId
    ? await Ticket.findOne({
      where: { id: record.ticketId, companyId: record.companyId },
      attributes: ["id", "whatsappId"]
    })
    : null;

  const destination = await resolveConversionDestination(
    {
      userId: record.contactId || record.ticketId,
      companyId: record.companyId,
      email: undefined,
      phone: undefined,
      name: undefined
    },
    {
      actionSource: "system_generated",
      conversionCompanyId: record.companyId,
      whatsappId: retryTicket?.whatsappId || undefined
    }
  );

  if (!destination) {
    await record.update({
      responseStatus: "skipped",
      errorMessage: "Retry: sin destino Meta CAPI resuelto",
      sentAt: new Date()
    });
    return { ok: false, reason: "no_destination", status: "skipped" };
  }

  const event = {
    event_name: record.eventName || EVENT_NAME,
    event_time: Math.floor(Date.now() / 1000),
    event_id: record.eventId,
    action_source: "system_generated",
    user_data: record.userData || {},
    custom_data: record.customData || {}
  };

  try {
    const response = await axios.post(
      `https://graph.facebook.com/${getApiVersion()}/${destination.destinationId}/events`,
      {
        data: [event],
        partner_agent: "jrchateam-kanban-lead-capi/1.0"
      },
      {
        params: { access_token: destination.accessToken },
        timeout: 10000
      }
    );

    const eventsReceived = Number(response.data?.events_received || 0);
    const fbtraceId = response.data?.fbtrace_id || null;
    const isSuccess =
      response.status >= 200 && response.status < 300 && eventsReceived > 0;

    await record.update({
      responseStatus: isSuccess ? "success" : "sent",
      destinationId: destination.destinationId,
      destinationSource: destination.source,
      fbtraceId,
      fbResponse: response.data,
      errorMessage: null,
      sentAt: new Date()
    });

    logger.info(
      `[KANBAN-CAPI][retry] Reintento OK id=${record.id} | dest=${maskId(destination.destinationId)} | events=${eventsReceived}`
    );
    return { ok: true, status: isSuccess ? "success" : "sent" };
  } catch (error: any) {
    const responseData = error?.response?.data || null;
    const metaError = responseData?.error || null;
    const errMessage =
      metaError?.message || error?.message || "Error desconocido en retry";
    await record.update({
      responseStatus: "failed",
      destinationId: destination.destinationId,
      destinationSource: destination.source,
      fbResponse: responseData,
      errorMessage: errMessage,
      sentAt: new Date()
    });
    logger.error(
      `[KANBAN-CAPI][retry] Falló reintento id=${record.id}: ${errMessage}`
    );
    return { ok: false, reason: "meta_error", status: "failed" };
  }
};
