import { Op } from "sequelize";
import Ticket from "../models/Ticket";
import Tag from "../models/Tag";
import TicketTag from "../models/TicketTag";
import Company from "../models/Company";
import Queue from "bull";
import Message from "../models/Message";
import Contact from "../models/Contact";
import { asegurarTagsPorDefecto } from "../services/IntegrationsServices/clasificarEtapaCliente";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import Whatsapp from "../models/Whatsapp";
import { isCapabilityAllowed, AICapability } from "../helpers/AICapabilitiesValidator";
import KanbanMovementLog from "../models/KanbanMovementLog";
import { REDIS_URI_CONNECTION } from "../config/redis";
import logger from "../utils/logger";
import { sendKanbanLeadConversionFromTagAssignmentAsync } from "../services/FacebookConversionService/KanbanLeadConversionService";

// 🆕 Importar servicio centralizado de IA
import { chatCompletion } from "../services/AIClientService";
// 🆕 Cobro UNIFICADO de IA — todas las acciones cobrables pasan por aqui
import {
  chargeMessage
} from "../services/AICreditServices/AIUsagePricingService";
import AppError from "../errors/AppError";

import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(isBetween);
dayjs.extend(customParseFormat);

const QUEUE_REDIS_URL = REDIS_URI_CONNECTION || process.env.REDIS_URI || process.env.REDIS_URL || "redis://127.0.0.1:6379";
const FOLLOWUP_JOB_PREFIX = "followup";
const FOLLOWUP_JOB_STATES: Array<"waiting" | "delayed" | "paused" | "failed"> = ["waiting", "delayed", "paused", "failed"];
export const followupQueue = new Queue("FollowupQueue", QUEUE_REDIS_URL);

function clampFollowupCount(value: unknown, followupType?: string): number {
  if (followupType === "single") return 1;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(3, Math.round(parsed)));
}

function followupDelayToMs(value: unknown, fallbackHours: number): number {
  const parsed = Number(value);
  const hours = Number.isFinite(parsed) && parsed >= 0 ? parsed : fallbackHours;
  return hours * 60 * 60 * 1000;
}

function getFollowupJobId(ticketId: number, currentFollowup: number): string {
  return `${FOLLOWUP_JOB_PREFIX}-${ticketId}-${currentFollowup}-${Date.now()}`;
}

function isFollowupJobForTicket(job: any, ticketId: number): boolean {
  const dataTicketId = Number(job?.data?.ticketId);
  const id = String(job?.id || "");
  return dataTicketId === Number(ticketId) || id.startsWith(`${FOLLOWUP_JOB_PREFIX}-${ticketId}-`);
}

async function removePendingFollowupJobsByTicketId(ticketId: number): Promise<number> {
  const jobs = await followupQueue.getJobs(FOLLOWUP_JOB_STATES);
  let removed = 0;

  for (const job of jobs) {
    if (!isFollowupJobForTicket(job, ticketId)) continue;
    try {
      await job.remove();
      removed += 1;
    } catch (error: any) {
      logger.warn(
        `[Followup] No se pudo remover job pendiente para ticket ${ticketId}: ${error?.message || error}`
      );
    }
  }

  return removed;
}

function selectFollowupText(data: FollowupJobData, currentTag: Tag | null): string {
  const source: any = currentTag || data;
  switch (data.currentFollowup) {
    case 1:
      return source.followupMessage1 || data.followupMessage1 || "";
    case 2:
      return source.followupMessage2 || data.followupMessage2 || source.followupMessage1 || data.followupMessage1 || "";
    case 3:
      return source.followupMessage3 || data.followupMessage3 || source.followupMessage2 || data.followupMessage2 || source.followupMessage1 || data.followupMessage1 || "";
    default:
      return source.followupMessage1 || data.followupMessage1 || "";
  }
}

function selectAIGuidance(data: FollowupJobData, currentTag: Tag | null): string {
  const source: any = currentTag || data;
  switch (data.currentFollowup) {
    case 1:
      return source.aiGuidance1 || data.aiGuidance1 || "";
    case 2:
      return source.aiGuidance2 || data.aiGuidance2 || "";
    case 3:
      return source.aiGuidance3 || data.aiGuidance3 || "";
    default:
      return "";
  }
}

// Interface para datos del job de followup
export interface FollowupJobData {
  ticketId: number;
  tagId?: number;
  tagKey: string;
  tagName?: string;
  tagDescription?: string;
  companyId: number;
  contactName?: string;
  conversationContext?: string;
  currentFollowup: number;
  followupMessage1: string;
  followupDelay1: number;
  followupMessage2?: string;
  followupDelay2?: number;
  followupMessage3?: string;
  followupDelay3?: number;
  followupCount: number;
  followupType?: string;
  aiGuidance1?: string;
  aiGuidance2?: string;
  aiGuidance3?: string;
  assignedAt?: string;
  ticketFollowupEnabled?: boolean; // Validación a nivel de ticket
}

// Constantes para clasificación de etapas
const availableTagKeys = [
  "attraction",
  "interest",
  "consideration",
  "hot-lead",
  "post-sale",
  "referrer"
];

// ============================================================
// SISTEMA DE MENSAJES DE SEGUIMIENTO v2.0
// Trigger: Cuando se asigna una etiqueta Kanban a un ticket
// ============================================================

/**
 * Cancela todos los followups pendientes de un ticket y resetea el contador
 */
export const cancelTicketFollowups = async (ticketId: number) => {
  // 1. Eliminar jobs de la cola
  await removeFollowupJobByTicketId(ticketId);

  // 2. Resetear followup_count en ticket
  const ticket = await Ticket.findByPk(ticketId);
  if (ticket) {
    await ticket.update({ followup_count: 0 });
  }
  logger.info(`[Followup] Followups cancelados para ticket ${ticketId}`);
};

/**
 * Verifica si el cliente ha respondido después de una fecha específica
 */
export const hasClientResponded = async (ticketId: number, afterDate: Date): Promise<boolean> => {
  const lastClientMessage = await Message.findOne({
    where: {
      ticketId,
      fromMe: false, // del cliente
      createdAt: { [Op.gt]: afterDate }
    },
    order: [['createdAt', 'DESC']]
  });
  return !!lastClientMessage;
};

/**
 * Obtiene los últimos mensajes del ticket para contexto de IA
 */
const getConversationContext = async (ticketId: number, limit: number = 20): Promise<string> => {
  const messages = await Message.findAll({
    where: { ticketId },
    order: [['createdAt', 'DESC']],
    limit
  });

  return messages
    .reverse()
    .map(m => `${m.fromMe ? 'Staff' : 'Cliente'}: ${m.body || ''}`)
    .join('\n');
};

/**
 * Maneja la asignación de una etiqueta Kanban a un ticket
 * Este es el trigger principal del sistema de followup
 */
export const handleTagAssignment = async (
  ticketId: number,
  tagId: number,
  companyId: number
): Promise<void> => {
  logger.info(`[Followup] handleTagAssignment ticket=${ticketId}, tag=${tagId}`);

  // 1. Cancelar followups anteriores
  await cancelTicketFollowups(ticketId);

  // 2. Obtener tag
  const tag = await Tag.findOne({ where: { id: tagId, companyId } });
  if (!tag || tag.kanban !== 1) {
    logger.info(`[Followup] Tag ${tagId} no es kanban o no pertenece a company=${companyId}, ignorando`);
    return;
  }

  // 3. Obtener ticket para verificar followupEnabled a nivel de ticket
  const ticket = await Ticket.findOne({
    where: { id: ticketId, companyId },
    include: [{ model: Contact, as: "contact", attributes: ["id", "name", "number"] }]
  });
  if (!ticket) {
    logger.info(`[Followup] Ticket ${ticketId} no encontrado para company=${companyId}`);
    return;
  }

  // 4. Verificar followupEnabled del TAG (default true para backward compatibility)
  const tagFollowupEnabled = (tag as any).followupEnabled !== false;
  const hasMessages = (tag as any).followupMessage1 && (tag as any).followupMessage1.trim().length > 0;

  // 5. Verificar followupEnabled del TICKET (default true)
  // Doble validación: si el tag o el ticket tienen followup deshabilitado, no envía
  const ticketFollowupEnabled = ticket.followupEnabled !== false;

  // Backward: si no hay followupMessage pero hay greetingMessageLane, usarlo
  const effectiveFollowupMessage1 = hasMessages
    ? (tag as any).followupMessage1
    : (tag as any).greetingMessageLane;

  // Validación doble: tag Y ticket deben tener followup habilitado
  if (!tagFollowupEnabled || !ticketFollowupEnabled || !effectiveFollowupMessage1 || effectiveFollowupMessage1.trim().length === 0) {
    logger.info(`[Followup] Followup deshabilitado para ticket ${ticketId}. Tag=${tagFollowupEnabled}, Ticket=${ticketFollowupEnabled}`);
    return;
  }

  // 6. Obtener mensajes del ticket para contexto
  const conversationContext = await getConversationContext(ticketId);
  if (!conversationContext) {
    logger.info(`[Followup] No hay mensajes en el ticket ${ticketId}`);
    return;
  }

  const contactName = ticket?.contact?.name || '';

  const followupType = (tag as any).followupType || "multiple";
  const effectiveFollowupCount = clampFollowupCount((tag as any).followupCount || 1, followupType);
  const followupDelay1 = Number((tag as any).followupDelay1 || (tag as any).timeLane || 1);

  // 7. Encolar primer followup
  await enqueueFollowupJob({
    ticketId,
    tagId: tag.id,
    tagKey: tag.key,
    tagName: tag.name,
    tagDescription: (tag as any).description || "",
    companyId,
    contactName,
    conversationContext,
    currentFollowup: 1,
    followupMessage1: effectiveFollowupMessage1,
    followupDelay1,
    followupMessage2: (tag as any).followupMessage2 || '',
    followupDelay2: (tag as any).followupDelay2 || 3,
    followupMessage3: (tag as any).followupMessage3 || '',
    followupDelay3: (tag as any).followupDelay3 || 4,
    followupCount: effectiveFollowupCount,
    followupType,
    aiGuidance1: (tag as any).aiGuidance1 || '',
    aiGuidance2: (tag as any).aiGuidance2 || '',
    aiGuidance3: (tag as any).aiGuidance3 || '',
    ticketFollowupEnabled // Incluir estado del ticket en el job
  });

  logger.info(`[Followup] Primer followup programado para ticket ${ticketId} en ${followupDelay1} horas`);
};

// ¿Está la fecha/hora en el horario permitido?
function isInSchedule(date: dayjs.Dayjs, schedules: any[]) {
  const dayName = date.format("dddd").toLowerCase();
  const sch = schedules.find(h => h.weekdayEn === dayName);
  if (!sch) return false;
  const time = date.format("HH:mm");

  const inA = time >= sch.startTimeA && time < sch.endTimeA;
  const inB = time >= sch.startTimeB && time < sch.endTimeB;
  return inA || inB;
}

// Siguiente fecha/hora permitida para envío, desde "after"
function getNextAvailableDate(after: dayjs.Dayjs, schedules: any[]) {
  let date = after.add(1, "minute");
  for (let i = 0; i < 8; i++) {
    const dayName = date.format("dddd").toLowerCase();
    const sch = schedules.find(h => h.weekdayEn === dayName);
    if (sch) {
      if (date.format("HH:mm") < sch.startTimeA)
        return date.hour(Number(sch.startTimeA.split(":")[0])).minute(Number(sch.startTimeA.split(":")[1])).second(0);
      if (date.format("HH:mm") >= sch.startTimeA && date.format("HH:mm") < sch.endTimeA)
        return date;
      if (date.format("HH:mm") < sch.startTimeB)
        return date.hour(Number(sch.startTimeB.split(":")[0])).minute(Number(sch.startTimeB.split(":")[1])).second(0);
      if (date.format("HH:mm") >= sch.startTimeB && date.format("HH:mm") < sch.endTimeB)
        return date;
    }
    date = date.add(1, "day").hour(0).minute(0).second(0);
  }
  return after;
}

const stageClassifierQueue = new Queue("StageClassifierQueue", QUEUE_REDIS_URL);
stageClassifierQueue.process("ClasificarEtapa", async (job, done) => {
  const {
    texto,
    ticketId,
    companyId,
    apiKey,
    contactName,
    promptId,
    lastClientMessage,
    assistantMessage,
    source,
    fallbackReason
  } = job.data;
  try {
   // console.log(`📥 Clasificando ticket: ${ticketId}`);

    if (!texto?.trim() || !ticketId || !companyId || !apiKey) {
      return done(new Error("Datos de entrada incompletos"));
    }

    // 🔒 VALIDAR CAPACIDAD DE GENERACIÓN DE TEXTO
    if (promptId) {
      const canClassify = await isCapabilityAllowed(
        promptId,
        AICapability.TEXT_GENERATION
      );

      if (!canClassify) {
        console.info(
          `[StageClassifier] Generación de texto deshabilitada para prompt ${promptId}. ` +
          `Ignorando clasificación de ticket ${ticketId}.`
        );
        return done(); // Completar job sin error pero sin procesar
      }
    } else {
      logger.warn(
        `[StageClassifier] promptId no proporcionado para ticket ${ticketId}. ` +
        `Asumiendo permisos (legacy).`
      );
      // Continuar sin validación (compatibilidad con jobs antiguos)
    }

    // ✅ Proceder con clasificación. El cobro real queda centralizado en
    // AIClientService/TokenTrackingService contra Companies.aiTokenBalance.
    // No cobramos AICreditBalances aqui para evitar doble bloqueo y jobs
    // "completed" sin movimiento Kanban por saldos granulares fraccionales.
    await asegurarTagsPorDefecto(companyId);

    const messages = await Message.findAll({ where: { ticketId }, order: [["updatedAt", "ASC"]], limit: 10 });

    const historyText = messages
      .map(m => `${m.fromMe ? "Asesor/IA" : "Cliente"}: ${m.body || ""}`)
      .join("\n");
    const explicitClientMessage = String(lastClientMessage || "").trim();
    const explicitAssistantMessage = String(assistantMessage || texto || "").trim();
    const latestTurn = [
      explicitClientMessage ? `Ultimo mensaje del cliente: ${explicitClientMessage}` : "",
      explicitAssistantMessage ? `Ultima respuesta IA/asesor: ${explicitAssistantMessage}` : ""
    ].filter(Boolean).join("\n");
    const classifierContext = [historyText, latestTurn].filter(Boolean).join("\n");

    logger.info(
      `[StageClassifier] classification_attempt ticket=${ticketId} company=${companyId} ` +
      `source=${source || "legacy"} fallbackReason=${fallbackReason || "n/a"}`
    );

    const promptText = `Actúa como un asistente comercial experto en identificar en qué etapa del funnel se encuentra un cliente dentro del proceso de venta, basándote en el historial de conversación entre el cliente y un asesor:
    ${classifierContext}

    Evalúa tanto los mensajes de avance (interés, preguntas, intención de compra) como los de retroceso (rechazo, dudas, desinterés).
    las palabras claves te ayudaran a identificar que key debes responder, pueden ser sinonimos de esas palabras tambien

    Estas son las etapas posibles:

    attraction →  saludo inicial
 Cliente que RETROCEDE: rechaza, pospone, dice "no gracias", "después", "ahorita no". Cliente que NECESITA RE-ENGANCHE después de mostrar interés previo. Ejemplos: "Hola", "Buenos días", "Una consulta", "No gracias", "Tal vez después", "Ahorita no", "No me interesa", "Mejor otro día"

    interest → Muestra curiosidad o responde al primer contacto, sin intención clara de compra.
    Palabras clave: "Cuéntame más", "¿Qué incluye?", "¿Cómo funciona?", "¿Me explicas?", "Voy a pensarlo", "mas informacion"

    consideration → Hace varias preguntas o compara opciones antes de decidir.
    Palabras clave: "¿Cuál es mejor?", "¿Qué me conviene?", "Estoy entre este y otro", "¿Cuál recomiendas?"

    hot-lead → Expresa intención directa de compra, pide precio, pago o envío.
    Palabras clave: "¿Cómo pago?", "¿Dónde transfiero?", "¿Tienen link?", "Listo para comprar", "Quiero ordenar"

    post-sale → Confirma que ya pagó, ordenó o recibió el producto
    Habla de seguimiento, satisfacción, facturación post-compra
    Ejemplos: "Ya pagué", "Ya transferí", "Ya compré", "Me llegó", "Lo recibí", "Todo perfecto", "Necesito factura", "Ya está listo", "Confirmado el pedido"

    referrer → Recomienda el servicio a otros o manifiesta intención de hacerlo.
    Palabras clave: "Ya los recomendé", "Le dije a un amigo", "Va a escribirles alguien", "Les pasé su contacto"

    Importante: Responde exclusivamente con una de estas keys:
    attraction, interest, consideration, hot-lead, post-sale, referrer.
    `;
    logger.info(`[StageClassifier] Historial de conversación construido para IA (${messages.length} mensajes)`);

    // --------- LLAMADA PRINCIPAL USANDO AIClientService ----------
    const completion = await chatCompletion({
      messages: [{ role: "user", content: promptText }],
      maxTokens: 20,
      temperature: 0.7,
      companyId,
      module: 'classification'
    });

    let key = completion.content?.trim().toLowerCase();

    // --------- PREVIENE ERRORES Y REPETICIONES ----------
    const lastTicketTag = await TicketTag.findOne({ where: { ticketId } });
    let lastTagKey: string | null = null;
    if (lastTicketTag) {
      const lastTag = await Tag.findOne({ where: { id: lastTicketTag.tagId, companyId } });
      lastTagKey = lastTag?.key || null;
    }

    // Si key no es válida o es igual a la última etiqueta, reintenta pero excluyendo la última key
    if (!key || !availableTagKeys.includes(key) || key === lastTagKey) {
      let retryPrompt = promptText;
      if (lastTagKey && availableTagKeys.includes(lastTagKey)) {
        retryPrompt += `\nNo respondas con la opción "${lastTagKey}", ya que es la etapa actual. Elige la siguiente que mejor se ajuste al contexto.`;
      }

      const retry = await chatCompletion({
        messages: [{ role: "user", content: retryPrompt }],
        maxTokens: 20,
        temperature: 0.7,
        companyId,
        module: 'classification'
      });

      let retryKey = retry.content?.trim().toLowerCase();
      if (!retryKey || !availableTagKeys.includes(retryKey) || retryKey === lastTagKey) {
        retryKey = "attraction";
      }
      key = retryKey;
    }

  // ─── Sprint Kanban (2026-05-20): delegar al helper único ───
  // El worker antes hacía: TicketTag.destroy + TicketTag.create + log +
  // handleTagAssignment + CAPI. El helper centraliza TODO con scope multi-tenant.
  // Si el tag NO es kanban, el helper devuelve `tag_not_kanban` y caemos al
  // path legacy (followup simple por timeLane/greetingMessageLane).
  const KanbanStageTransitionService = require(
    "../services/KanbanServices/KanbanStageTransitionService"
  ).default;

  const transitionResult = await KanbanStageTransitionService.move({
    companyId,
    ticketId,
    toTagKey: key,
    movedBy: 'ai',
    source: 'stage_classifier_worker',
    reason: `Clasificación IA: ${key}`,
    triggerFollowups: true,
    triggerLeadConversion: false,
    conversionSource: 'kanban_ai_classifier',
    aiConfidence: 0.8,
    aiModelUsed: completion.model || 'gpt-4o-mini'
  });

  // Si el tag no fue Kanban, intentar ruta legacy de followup simple.
  if (transitionResult.skippedReason === 'tag_not_kanban') {
    const tagNonKanban = await Tag.findOne({ where: { key, companyId } });
    if (tagNonKanban) {
      await enqueueFollowupJob({
        ticketId,
        tagId: tagNonKanban.id,
        tagKey: tagNonKanban.key,
        companyId,
        apiKey,
        contactName,
        conversationContext: '',
        currentFollowup: 1,
        followupMessage1: tagNonKanban.greetingMessageLane || '',
        followupDelay1: tagNonKanban.timeLane || 1,
        followupCount: 1
      });
    }
  } else if (transitionResult.skippedReason === 'tag_not_found') {
    return done(new Error(`Tag ${key} no encontrada para company=${companyId}`));
  }

  logger.info(
    `[StageClassifier] classification_result ticket=${ticketId} company=${companyId} ` +
    `key=${key} moved=${!transitionResult.skippedReason && !transitionResult.alreadyInStage} ` +
    `alreadyInStage=${transitionResult.alreadyInStage || false} ` +
    `skippedReason=${transitionResult.skippedReason || "none"}`
  );
  done();
} catch (err: any) {
  logger.error(
    `[StageClassifier] classification_failed ticket=${ticketId} company=${companyId} ` +
    `error=${err?.message || err}`
  );
  done(err);
}
});

/**
 * Procesa el envío de un followup
 * Versión 2.0: soporta múltiples seguimientos con verificación de respuesta del cliente
 */
followupQueue.process("SendFollowup", async (job, done) => {
  const data = job.data as FollowupJobData;
  const {
    ticketId,
    tagId,
    tagKey,
    tagName,
    tagDescription,
    companyId,
    contactName,
    currentFollowup,
    followupMessage1,
    followupMessage2,
    followupMessage3,
    followupDelay1,
    followupDelay2,
    followupDelay3,
    followupCount,
    followupType,
    assignedAt
  } = data;

  logger.info(`[Followup] Procesando followup #${currentFollowup} para ticket ${ticketId}`);

  try {
    // 1. Obtener ticket y configuración
    const ticket = await Ticket.findOne({
      where: { id: ticketId, companyId },
      include: [{ model: Contact, as: "contact", attributes: ["id", "name", "number"] }]
    });
    if (!ticket) {
      logger.info(`[Followup] Ticket ${ticketId} no encontrado para company=${companyId}`);
      return done();
    }

    let currentTag: Tag | null = null;
    if (tagId) {
      currentTag = await Tag.findOne({ where: { id: tagId, companyId } });
      const stillInStage = await TicketTag.findOne({ where: { ticketId, tagId } });
      if (!currentTag || !stillInStage) {
        logger.info(
          `[Followup] Ticket ${ticketId} ya no está en la etapa tag=${tagId}; cancelando followup #${currentFollowup}`
        );
        return done();
      }

      if ((currentTag as any).followupEnabled === false) {
        logger.info(`[Followup] Followup deshabilitado en tag=${tagId}; cancelando ticket=${ticketId}`);
        return done();
      }
    }

    // 1B. Verificar followupEnabled del ticket (doble validación)
    // Puede venir del job o del ticket directamente
    const ticketFollowupEnabled = data.ticketFollowupEnabled ?? ticket.followupEnabled;
    if (ticketFollowupEnabled === false) {
      logger.info(`[Followup] Followup deshabilitado para ticket ${ticketId} (a nivel de ticket)`);
      return done();
    }

    const whatsapp = await Whatsapp.findByPk(ticket.whatsappId);
    const config = whatsapp?.schedules || [];
    const now = dayjs();

    // 2. Verificar si el cliente ya respondió (cancelar si respondió)
    if (assignedAt) {
      const hasResponded = await hasClientResponded(ticketId, new Date(assignedAt));
      if (hasResponded) {
        logger.info(`[Followup] Cliente ya respondió para ticket ${ticketId}, cancelando followup #${currentFollowup}`);
        return done();
      }
    }

    // 3. Verificar horario de atención
    if (!isInSchedule(now, config)) {
      const next = getNextAvailableDate(now, config);
      const delay = next.diff(now, "millisecond");
      await followupQueue.add("SendFollowup", data, {
        delay,
        removeOnComplete: true,
        removeOnFail: true,
        jobId: getFollowupJobId(ticketId, currentFollowup)
      });
      logger.info(`[Followup] Fuera de horario. Reagendado para ${next.format("YYYY-MM-DD HH:mm")}`);
      return done();
    }

    // 4. Verificar límite de seguimientos
    const effectiveFollowupCount = currentTag
      ? clampFollowupCount((currentTag as any).followupCount || followupCount, (currentTag as any).followupType || followupType)
      : clampFollowupCount(followupCount, followupType);
    if (currentFollowup > effectiveFollowupCount) {
      logger.info(`[Followup] Límite alcanzado para ticket ${ticketId}`);
      return done();
    }

    // 5. Obtener el mensaje según el followup actual
    const followupMessage = selectFollowupText(data, currentTag);
    const aiGuidance = selectAIGuidance(data, currentTag);
    const effectiveTagName = currentTag?.name || tagName || tagKey;
    const effectiveTagDescription = ((currentTag as any)?.description || tagDescription || "").trim();
    const effectiveContactName = contactName || ticket.contact?.name || "";

    if (!followupMessage || followupMessage.trim().length === 0) {
      logger.info(`[Followup] No hay mensaje configurado para followup #${currentFollowup}`);
      return done();
    }

    // 6. Obtener mensajes recientes del ticket para contexto
    const recentMessages = await Message.findAll({
      where: { ticketId },
      order: [["createdAt", "DESC"]],
      limit: 16
    });
    const recentContext = recentMessages
      .reverse()
      .map(m => `${m.fromMe ? 'Staff' : 'Cliente'}: ${m.body || ''}`)
      .join('\n');

    // 7. Construir prompt para IA
    const saludo = effectiveContactName && effectiveContactName.trim().length > 0
      ? `Saluda cordialmente usando el nombre del cliente (${effectiveContactName}) al inicio del mensaje.`
      : "Saluda cordialmente al cliente al inicio del mensaje, sin usar ningún nombre propio.";

    const followupPrompt = `
Eres un agente de seguimiento comercial por WhatsApp.

## Etapa Kanban actual
- Key: ${tagKey}
- Nombre: ${effectiveTagName}
- Descripción de la etapa: ${effectiveTagDescription || "(sin descripción configurada)"}
- Seguimiento número: ${currentFollowup} de ${effectiveFollowupCount}

## Historial reciente del ticket
${recentContext}

## Instrucción configurada para este seguimiento
${followupMessage}

## Guía IA adicional
${aiGuidance || "(sin guía adicional)"}

${saludo}

Instrucciones importantes:
- Redacta un mensaje de seguimiento natural, útil y breve.
- Usa la descripción de la etapa para entender el objetivo del mensaje.
- Usa el historial para no repetir literalmente lo ya dicho ni contradecirlo.
- Si el cliente dejó una duda pendiente, retómala con una pregunta concreta o ayuda útil.
- No inventes precios, promociones, disponibilidad ni promesas que no estén en el historial o en la instrucción configurada.
- No menciones que eres IA, no menciones "etapa Kanban", no menciones "seguimiento #".
- Máximo 450 caracteres salvo que el mensaje configurado exija más detalle.
- Devuelve únicamente el mensaje final listo para enviar por WhatsApp (sin introducciones ni notas adicionales).
`;

    // 💳 COBRO UNIFICADO: followup IA cobra como 'message' (configurable) ANTES de generar.
    // Si la company se queda sin credito, NO se genera ni se envia el followup.
    try {
      await chargeMessage({
        companyId,
        units: 1,
        source: "kanban_followup_ai",
        sourceId: ticketId,
        description: `Followup IA #${currentFollowup} ticket=${ticketId}`,
        metadata: { tagKey, currentFollowup }
      });
    } catch (creditErr: any) {
      const isInsufficient =
        creditErr instanceof AppError &&
        (creditErr.message === "ERR_AI_INSUFFICIENT_CREDITS" ||
          creditErr.message === "ERR_AI_NO_CREDIT_BALANCE");
      if (isInsufficient) {
        logger.warn(
          `[Followup] Sin creditos para message (company=${companyId} ticket=${ticketId}); cancela followup`
        );
        return done();
      }
      logger.warn(
        `[Followup] Error cobrando message: ${creditErr?.message || creditErr}; cancela followup por seguridad`
      );
      return done();
    }

    // 8. Generar mensaje con IA
    const completion = await chatCompletion({
      messages: [{ role: "user", content: followupPrompt }],
      maxTokens: 200,
      temperature: 0.7,
      companyId,
      module: 'followup'
    });

    const text = completion.content?.trim();
    if (!text) {
      logger.info(`[Followup] IA no generó contenido para ticket ${ticketId}`);
      return done();
    }

    // 9. Enviar mensaje
    const ticketDetails = await ShowTicketService(ticketId, companyId);
    await SendWhatsAppMessage({ body: text, ticket: ticketDetails, quotedMsg: null });
    logger.info(`[Followup] Mensaje #${currentFollowup} enviado al ticket ${ticketId}`);

    // 10. Actualizar ticket: incrementar followup_count y marcar como reciente
    await Ticket.update(
      { followup_count: currentFollowup },
      { where: { id: ticketId } }
    );

    // 11. Programar siguiente followup si hay más
    const nextFollowup = currentFollowup + 1;
    if (nextFollowup <= effectiveFollowupCount) {
      let nextDelay = 0;
      switch (nextFollowup) {
        case 2:
          nextDelay = followupDelayToMs((currentTag as any)?.followupDelay2 || followupDelay2, 3);
          break;
        case 3:
          nextDelay = followupDelayToMs((currentTag as any)?.followupDelay3 || followupDelay3, 4);
          break;
        default:
          nextDelay = followupDelayToMs((currentTag as any)?.followupDelay1 || followupDelay1, 1);
      }

      await followupQueue.add("SendFollowup", {
        ...data,
        currentFollowup: nextFollowup,
        assignedAt: new Date().toISOString()
      }, {
        delay: nextDelay,
        removeOnComplete: true,
        removeOnFail: true,
        jobId: getFollowupJobId(ticketId, nextFollowup)
      });
      logger.info(`[Followup] Followup #${nextFollowup} programado para ticket ${ticketId}`);
    } else {
      logger.info(`[Followup] Todos los followups completados para ticket ${ticketId}`);
    }

    done();
  } catch (err) {
    logger.error(`Error en seguimiento: ${err}`);
    done(err);
  }
});


/**
 * Encola un job de followup con los datos necesarios
 * Versión 2.0: soporta múltiples seguimientos con delays personalizados
 */
export const enqueueFollowupJob = async (params: {
  ticketId: number;
  tagId?: number;
  tagKey: string;
  tagName?: string;
  tagDescription?: string;
  companyId: number;
  apiKey?: string;
  contactName?: string;
  conversationContext?: string;
  currentFollowup: number;
  followupMessage1: string;
  followupDelay1: number;
  followupMessage2?: string;
  followupDelay2?: number;
  followupMessage3?: string;
  followupDelay3?: number;
  followupCount: number;
  followupType?: string;
  aiGuidance1?: string;
  aiGuidance2?: string;
  aiGuidance3?: string;
  assignedAt?: string;
  ticketFollowupEnabled?: boolean;
}) => {
  const {
    ticketId,
    tagId,
    tagKey,
    tagName,
    tagDescription,
    companyId,
    contactName,
    conversationContext,
    currentFollowup,
    followupMessage1,
    followupDelay1,
    followupMessage2,
    followupDelay2,
    followupMessage3,
    followupDelay3,
    followupCount,
    followupType,
    aiGuidance1,
    aiGuidance2,
    aiGuidance3,
    assignedAt,
    ticketFollowupEnabled
  } = params;

  const effectiveFollowupCount = clampFollowupCount(followupCount, followupType);

  // Si ya se alcanzaron los límites, no encolar más
  if (currentFollowup > effectiveFollowupCount) {
    logger.info(`[Followup] Límite de followups alcanzado para ticket ${ticketId}`);
    return;
  }

  // Determinar el delay según el followup actual
  let delayMs = 0;
  switch (currentFollowup) {
    case 1:
      delayMs = followupDelayToMs(followupDelay1, 1);
      break;
    case 2:
      delayMs = followupDelayToMs(followupDelay2, 3);
      break;
    case 3:
      delayMs = followupDelayToMs(followupDelay3, 4);
      break;
    default:
      delayMs = followupDelayToMs(followupDelay1, 1);
  }

  if (currentFollowup === 1) {
    await removePendingFollowupJobsByTicketId(ticketId);
  }

  // Encolar el job
  await followupQueue.add("SendFollowup", {
    ticketId,
    tagId,
    tagKey,
    tagName,
    tagDescription,
    companyId,
    contactName,
    conversationContext,
    currentFollowup,
    followupMessage1,
    followupDelay1,
    followupMessage2,
    followupDelay2,
    followupMessage3,
    followupDelay3,
    followupCount: effectiveFollowupCount,
    followupType,
    aiGuidance1,
    aiGuidance2,
    aiGuidance3,
    assignedAt: assignedAt || new Date().toISOString(),
    ticketFollowupEnabled
  }, {
    delay: delayMs,
    removeOnComplete: true,
    removeOnFail: true,
    jobId: getFollowupJobId(ticketId, currentFollowup)
  });

  logger.info(`[Followup] Followup #${currentFollowup} programado para ticket ${ticketId} en ${delayMs / (60 * 60 * 1000)} horas`);
};

export const removeFollowupJobByTicketId = async (ticketId) => {
  const removed = await removePendingFollowupJobsByTicketId(Number(ticketId));
  return removed > 0;
};

export const enqueueStageClassifierJob = async ({
  texto,
  ticketId,
  companyId,
  apiKey,
  contactName,
  promptId,
  lastClientMessage,
  assistantMessage,
  source,
  fallbackReason
}: {
  texto: string;
  ticketId: number;
  companyId: number;
  apiKey: string;
  contactName: string;
  promptId?: number;
  lastClientMessage?: string;
  assistantMessage?: string;
  source?: string;
  fallbackReason?: string;
}) => {
  await stageClassifierQueue.add("ClasificarEtapa", {
    texto,
    ticketId,
    companyId,
    apiKey,
    contactName,
    promptId,
    lastClientMessage,
    assistantMessage,
    source,
    fallbackReason
  });
 // console.log(`🔄 Trabajo de clasificación encolado tras seguimiento para ticket ${ticketId}`);
};
