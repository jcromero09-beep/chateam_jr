import { Op } from "sequelize";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import Message from "../../models/Message";
import logger from "../../utils/logger";
import TicketFlowEngine from "./TicketFlowEngine";

/**
 * TicketFollowupService — Seguimientos automáticos de tickets
 *
 * PRIMERA OLA — Feature 2: Seguimientos automáticos
 *
 * Lógica:
 *   1. Busca tickets con nextFollowupAt <= NOW(), followupEnabled=true, status IN ('pending','open')
 *   2. Para cada ticket: genera mensaje contextual + lo envía por el canal correcto
 *      (delega al OmnichannelDispatcher — Feature 7)
 *   3. Incrementa followup_count, registra lastFollowupAt
 *   4. Si followup_count >= maxFollowups: cierra el ticket o lo escala
 *
 * Multi-tenant: el query principal NO filtra por companyId — itera todos los tenants.
 *               Cada acción individual respeta el companyId del ticket.
 *
 * BD SAGRADA: solo UPDATE — nunca DELETE.
 */

// ─── Configuración ────────────────────────────────────────────────────────
const DEFAULT_MAX_FOLLOWUPS = 3;
const FOLLOWUP_DELAYS_MIN = [120, 360, 1440]; // 2h, 6h, 24h escalando
const BATCH_SIZE = 50;

// ─── Tipos ─────────────────────────────────────────────────────────────────
export interface FollowupResult {
  ticketId: number;
  companyId: number;
  contactName: string;
  channel: string;
  attempt: number;
  message: string;
  status: "sent" | "skipped" | "closed" | "escalated" | "error";
  reason?: string;
}

// ─── Builder de mensaje contextual ────────────────────────────────────────
const buildFollowupMessage = (
  contactName: string,
  attempt: number,
  flowMetadata: Record<string, any>
): string => {
  const firstName = (contactName || "").split(" ")[0] || "hola";
  const lastIntent = flowMetadata?.lastIntent;

  // Plantillas escalonadas por intento
  const templates: Record<number, string[]> = {
    1: [
      `Hola ${firstName}, ¿pudiste revisar lo que te enviamos? 😊 Quedamos atentos.`,
      `${firstName}, quería retomar nuestra conversación. ¿En qué te puedo ayudar?`,
      `Hola ${firstName}, te escribo para saber si necesitas algo más por aquí.`
    ],
    2: [
      `${firstName}, no te he olvidado 🙌 ¿Sigues interesado/a? Cuéntame.`,
      `Hola ${firstName}, te dejo este recordatorio. ¿Te puedo apoyar en algo?`
    ],
    3: [
      `${firstName}, este será mi último mensaje. Si necesitas algo más, escríbeme cuando gustes. ¡Que tengas un excelente día!`
    ]
  };

  // Mensajes específicos según la última intención
  if (lastIntent === "sales_inquiry" || lastIntent === "lead_qualification") {
    if (attempt === 1)
      return `Hola ${firstName}, ¿tuviste oportunidad de revisar la información comercial? Si tienes dudas, con gusto te ayudo. 💼`;
    if (attempt === 2)
      return `${firstName}, sigo a tu disposición para resolver cualquier consulta sobre nuestra oferta. ¿Te llamo o continuamos por aquí?`;
  }

  if (lastIntent === "appointment_request") {
    if (attempt === 1)
      return `Hola ${firstName}, ¿confirmamos tu cita? Si quieres cambiar fecha u horario, dímelo. 📅`;
  }

  if (lastIntent === "support_request" || lastIntent === "complaint") {
    if (attempt === 1)
      return `Hola ${firstName}, ¿pudimos resolver tu inconveniente? Si sigue pendiente, escalamos al equipo. 🛠️`;
  }

  // Default: rotar entre plantillas genéricas
  const pool = templates[attempt] || templates[1];
  return pool[Math.floor(Math.random() * pool.length)];
};

// ─── Calcular el próximo seguimiento o nulo ───────────────────────────────
const computeNextFollowupAt = (currentAttempt: number): Date | null => {
  if (currentAttempt >= DEFAULT_MAX_FOLLOWUPS) return null;
  const delayMin = FOLLOWUP_DELAYS_MIN[currentAttempt] || 1440;
  return new Date(Date.now() + delayMin * 60 * 1000);
};

// ─── Procesar UN ticket ────────────────────────────────────────────────────
const processOne = async (ticket: Ticket): Promise<FollowupResult> => {
  const contact = await Contact.findByPk(ticket.contactId);
  const baseResult: FollowupResult = {
    ticketId: ticket.id,
    companyId: (ticket as any).companyId,
    contactName: contact?.name || "Cliente",
    channel: ticket.whatsappId ? "whatsapp" : "unknown",
    attempt: (ticket.followup_count || 0) + 1,
    message: "",
    status: "skipped"
  };

  // Validaciones de seguridad
  if (!contact) {
    return { ...baseResult, status: "skipped", reason: "contact_not_found" };
  }
  if (ticket.status === "closed") {
    return { ...baseResult, status: "skipped", reason: "ticket_closed" };
  }

  const attempt = baseResult.attempt;

  // ¿Excedió el máximo? → cerrar el ticket
  if (attempt > DEFAULT_MAX_FOLLOWUPS) {
    try {
      await TicketFlowEngine.closeTicket(
        ticket.id,
        "max_followups_reached"
      );
    } catch (err: any) {
      logger.warn(`[Followup] Error cerrando ticket ${ticket.id}: ${err.message}`);
    }
    return { ...baseResult, status: "closed", reason: "max_followups_reached" };
  }

  // Construir mensaje
  const message = buildFollowupMessage(
    contact.name,
    attempt,
    (ticket.flowMetadata || {}) as Record<string, any>
  );
  baseResult.message = message;

  // Enviar mensaje vía OmnichannelDispatcher (Feature 7)
  try {
    const { default: OmnichannelDispatcher } = await import(
      "../OmnichannelServices/OmnichannelDispatcher"
    );

    const dispatchResult = await OmnichannelDispatcher.dispatch({
      ticketId: ticket.id,
      contactId: ticket.contactId,
      companyId: (ticket as any).companyId,
      message,
      origin: "ai_followup"
    });

    baseResult.channel = dispatchResult.channel;

    if (!dispatchResult.success) {
      logger.warn(
        `[Followup] Dispatch falló ticket=${ticket.id}: ${dispatchResult.error}`
      );
      return { ...baseResult, status: "error", reason: dispatchResult.error };
    }
  } catch (err: any) {
    logger.error(`[Followup] Error envío ticket=${ticket.id}: ${err.message}`);
    return { ...baseResult, status: "error", reason: err.message };
  }

  // Actualizar contadores y próximo schedule
  const nextFollowupAt = computeNextFollowupAt(attempt);
  await ticket.update({
    followup_count: attempt,
    lastFollowupAt: new Date(),
    nextFollowupAt,
    followupReason: nextFollowupAt ? "pending_response" : null
  });

  // Si era el último intento y no hay siguiente → cerrar
  if (!nextFollowupAt) {
    try {
      await TicketFlowEngine.transition(
        ticket.id,
        "followup",
        "last_followup_sent",
        { lastFollowupAt: new Date().toISOString() }
      );
    } catch (err: any) {
      logger.warn(`[Followup] Transition warn ticket ${ticket.id}: ${err.message}`);
    }
  }

  logger.info(
    `[Followup] ✅ Enviado ticket=${ticket.id} attempt=${attempt} ` +
      `next=${nextFollowupAt?.toISOString() || "none"}`
  );
  return { ...baseResult, status: "sent" };
};

// ─── Punto de entrada del CronJob ──────────────────────────────────────────
const runDueFollowups = async (): Promise<{
  processed: number;
  sent: number;
  closed: number;
  errors: number;
  results: FollowupResult[];
}> => {
  const dueTickets = await Ticket.findAll({
    where: {
      nextFollowupAt: { [Op.lte]: new Date() },
      followupEnabled: true,
      status: { [Op.in]: ["pending", "open"] } as any
    },
    limit: BATCH_SIZE,
    order: [["nextFollowupAt", "ASC"]]
  });

  if (dueTickets.length === 0) {
    return { processed: 0, sent: 0, closed: 0, errors: 0, results: [] };
  }

  logger.info(`[Followup] 🔄 Procesando ${dueTickets.length} tickets vencidos`);

  const results: FollowupResult[] = [];
  let sent = 0;
  let closed = 0;
  let errors = 0;

  for (const ticket of dueTickets) {
    try {
      const r = await processOne(ticket);
      results.push(r);
      if (r.status === "sent") sent++;
      if (r.status === "closed") closed++;
      if (r.status === "error") errors++;
    } catch (err: any) {
      logger.error(`[Followup] Excepción ticket ${ticket.id}: ${err.message}`);
      errors++;
    }
  }

  logger.info(
    `[Followup] ✅ Lote terminado: ${sent} enviados, ${closed} cerrados, ${errors} errores`
  );

  return {
    processed: dueTickets.length,
    sent,
    closed,
    errors,
    results
  };
};

export default {
  runDueFollowups,
  processOne,
  buildFollowupMessage,
  computeNextFollowupAt,
  DEFAULT_MAX_FOLLOWUPS,
  FOLLOWUP_DELAYS_MIN
};
