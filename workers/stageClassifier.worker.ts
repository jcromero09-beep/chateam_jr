import { Op } from "sequelize";
import Ticket from "../models/Ticket";
import Tag from "../models/Tag";
import TicketTag from "../models/TicketTag";
import Company from "../models/Company";
import Queue from "bull";
import Message from "../models/Message";
import { asegurarTagsPorDefecto } from "../services/IntegrationsServices/clasificarEtapaCliente";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import Whatsapp from "../models/Whatsapp";
import { isCapabilityAllowed, AICapability } from "../helpers/AICapabilitiesValidator";
import KanbanMovementLog from "../models/KanbanMovementLog";
import { timeLaneToMs } from "../helpers/timeLane";

// 🆕 Importar servicio centralizado de IA
import { chatCompletion } from "../services/AIClientService";

import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(isBetween);
dayjs.extend(customParseFormat);

// Interface para datos del job de followup
export interface FollowupJobData {
  ticketId: number;
  tagId?: number;
  tagKey: string;
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
  console.log(`[Followup] Followups cancelados para ticket ${ticketId}`);
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
    order: [['createdAt', 'ASC']],
    limit
  });

  return messages
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
  console.log(`[Followup] handleTagAssignment llamado para ticket ${ticketId}, tag ${tagId}`);

  // 1. Cancelar followups anteriores
  await cancelTicketFollowups(ticketId);

  // 2. Obtener tag
  const tag = await Tag.findByPk(tagId);
  if (!tag || tag.kanban !== 1) {
    console.log(`[Followup] Tag ${tagId} no es kanban, ignorando`);
    return;
  }

  // 3. Obtener ticket para verificar followupEnabled a nivel de ticket
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) {
    console.log(`[Followup] Ticket ${ticketId} no encontrado`);
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
    console.log(`[Followup] Followup deshabilitado para ticket ${ticketId}. Tag: ${tagFollowupEnabled}, Ticket: ${ticketFollowupEnabled}`);
    return;
  }

  // 6. Obtener mensajes del ticket para contexto
  const conversationContext = await getConversationContext(ticketId);
  if (!conversationContext) {
    console.log(`[Followup] No hay mensajes en el ticket ${ticketId}`);
    return;
  }

  const contactName = ticket?.contact?.name || '';

  // 7. Calcular delay del primer followup (followupDelay1)
  const followupDelayHours = (tag as any).followupDelay1 || (tag as any).timeLane || 1;
  const delayMs = followupDelayHours * 60 * 60 * 1000;

  // 8. Encolar primer followup
  await enqueueFollowupJob({
    ticketId,
    tagId: tag.id,
    tagKey: tag.key,
    companyId,
    contactName,
    conversationContext,
    currentFollowup: 1,
    followupMessage1: effectiveFollowupMessage1,
    followupDelay1: (tag as any).followupDelay1 || 1,
    followupMessage2: (tag as any).followupMessage2 || '',
    followupDelay2: (tag as any).followupDelay2 || 3,
    followupMessage3: (tag as any).followupMessage3 || '',
    followupDelay3: (tag as any).followupDelay3 || 4,
    followupCount: (tag as any).followupCount || 1,
    ticketFollowupEnabled // Incluir estado del ticket en el job
  });

  console.log(`[Followup] Primer followup programado para ticket ${ticketId} en ${followupDelayHours} horas`);
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

const stageClassifierQueue = new Queue("StageClassifierQueue", process.env.REDIS_URI);
stageClassifierQueue.process("ClasificarEtapa", async (job, done) => {
  const { texto, ticketId, companyId, apiKey, contactName, promptId } = job.data;
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
      console.warn(
        `[StageClassifier] promptId no proporcionado para ticket ${ticketId}. ` +
        `Asumiendo permisos (legacy).`
      );
      // Continuar sin validación (compatibilidad con jobs antiguos)
    }

    // ✅ Proceder con clasificación
    await asegurarTagsPorDefecto(companyId);

    const messages = await Message.findAll({ where: { ticketId }, order: [["updatedAt", "ASC"]], limit: 10 });

    const textoIA = messages.map(m => `${m.fromMe ? "IA" : "Cliente"}: ${m.body}`).join("\n") + "\nCliente: " + texto;
    const promptText = `Actúa como un asistente comercial experto en identificar en qué etapa del funnel se encuentra un cliente dentro del proceso de venta, basándote en el historial de conversación entre el cliente y un asesor:
    ${textoIA}

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
    console.log(`💬 Historial de conversación construido para IA (${messages.length} mensajes)`);

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

  // --------- ACTUALIZA LA ETIQUETA DEL TICKET ----------
  const tag = await Tag.findOne({ where: { key, companyId } });
  if (!tag) return done(new Error(`Tag ${key} no encontrada`));
  await TicketTag.destroy({ where: { ticketId } });
  await TicketTag.create({ ticketId, tagId: tag.id });

  // Log del movimiento Kanban por IA
  try {
    const previousTagId = lastTicketTag?.tagId || null;
    await KanbanMovementLog.create({
      ticketId,
      companyId,
      fromTagId: previousTagId,
      toTagId: tag.id,
      movedBy: 'ai',
      aiConfidence: 0.8,
      aiModelUsed: completion.model || 'gpt-4o-mini',
      reason: `Clasificación IA: ${key}`
    });
  } catch (logErr) {
    // No fallar por error de log
  }

  // --------- ENCOLA EL SEGUIMIENTO CORRECTO (si es tag kanban) ----------
  if (tag.kanban === 1) {
    await handleTagAssignment(ticketId, tag.id, companyId);
  } else {
    // Sistema legacy para tags no-kanban
    await enqueueFollowupJob({
      ticketId,
      tagId: tag.id,
      tagKey: tag.key,
      companyId,
      apiKey,
      contactName,
      conversationContext: '',
      currentFollowup: 1,
      followupMessage1: tag.greetingMessageLane || '',
      followupDelay1: tag.timeLane || 1,
      followupCount: 1
    });
  }

  //console.log(`🏷️ Ticket ${ticketId} clasificado como: ${key}`);
  done();
} catch (err) {
  console.error("❌ Error al clasificar etapa:", err);
  done(err);
}
});

export const followupQueue = new Queue("FollowupQueue", process.env.REDIS_URI);

/**
 * Procesa el envío de un followup
 * Versión 2.0: soporta múltiples seguimientos con verificación de respuesta del cliente
 */
followupQueue.process("SendFollowup", async (job, done) => {
  const data = job.data as FollowupJobData;
  const {
    ticketId,
    tagKey,
    companyId,
    contactName,
    conversationContext,
    currentFollowup,
    followupMessage1,
    followupMessage2,
    followupMessage3,
    followupDelay1,
    followupDelay2,
    followupDelay3,
    followupCount,
    assignedAt
  } = data;

  console.log(`[Followup] Procesando followup #${currentFollowup} para ticket ${ticketId}`);

  try {
    // 1. Obtener ticket y configuración
    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      console.log(`[Followup] Ticket ${ticketId} no encontrado`);
      return done();
    }

    // 1B. Verificar followupEnabled del ticket (doble validación)
    // Puede venir del job o del ticket directamente
    const ticketFollowupEnabled = data.ticketFollowupEnabled ?? ticket.followupEnabled;
    if (ticketFollowupEnabled === false) {
      console.log(`[Followup] Followup deshabilitado para ticket ${ticketId} (a nivel de ticket)`);
      return done();
    }

    const whatsapp = await Whatsapp.findByPk(ticket.whatsappId);
    const config = whatsapp?.schedules || [];
    const now = dayjs();

    // 2. Verificar si el cliente ya respondió (cancelar si respondió)
    if (assignedAt) {
      const hasResponded = await hasClientResponded(ticketId, new Date(assignedAt));
      if (hasResponded) {
        console.log(`[Followup] Cliente ya respondió para ticket ${ticketId}, cancelando followup #${currentFollowup}`);
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
        jobId: `followup-${ticketId}`
      });
      console.log(`[Followup] Fuera de horario. Reagendado para ${next.format("YYYY-MM-DD HH:mm")}`);
      return done();
    }

    // 4. Verificar límite de seguimientos
    const currentCount = ticket.followup_count || 0;
    if (currentFollowup > followupCount) {
      console.log(`[Followup] Límite alcanzado para ticket ${ticketId}`);
      return done();
    }

    // 5. Obtener el mensaje según el followup actual
    let followupMessage = '';
    switch (currentFollowup) {
      case 1:
        followupMessage = followupMessage1;
        break;
      case 2:
        followupMessage = followupMessage2 || followupMessage1; // fallback
        break;
      case 3:
        followupMessage = followupMessage3 || followupMessage2 || followupMessage1; // fallback
        break;
      default:
        followupMessage = followupMessage1;
    }

    if (!followupMessage || followupMessage.trim().length === 0) {
      console.log(`[Followup] No hay mensaje configurado para followup #${currentFollowup}`);
      return done();
    }

    // 6. Obtener mensajes recientes del ticket para contexto
    const recentMessages = await Message.findAll({
      where: { ticketId },
      order: [["createdAt", "ASC"]],
      limit: 20
    });
    const recentContext = recentMessages
      .map(m => `${m.fromMe ? 'Staff' : 'Cliente'}: ${m.body || ''}`)
      .join('\n');

    // 7. Construir prompt para IA
    const saludo = contactName && contactName.trim().length > 0
      ? `Saluda cordialmente usando el nombre del cliente (${contactName}) al inicio del mensaje.`
      : "Saluda cordialmente al cliente al inicio del mensaje, sin usar ningún nombre propio.";

    const followupPrompt = `
Estos son los mensajes más recientes de la conversación:
${recentContext}

${saludo}

Tu tarea es redactar un mensaje de WhatsApp de seguimiento basándote en la siguiente idea (NO la copies literal, solo toma el sentido y adáptalo a la conversación):

[IDEA]: ${followupMessage}

Instrucciones importantes:
- Usa un tono natural, cálido y conversacional, como si fuera un chat real.
- Ajusta el mensaje al contexto de lo conversado previamente.
- Sé breve y claro; evita textos largos, explicaciones o aclaraciones.
- Devuelve únicamente el mensaje final listo para enviar por WhatsApp (sin introducciones ni notas adicionales).
`;

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
      console.log(`[Followup] IA no generó contenido para ticket ${ticketId}`);
      return done();
    }

    // 9. Enviar mensaje
    const ticketDetails = await ShowTicketService(ticketId, companyId);
    await SendWhatsAppMessage({ body: text, ticket: ticketDetails, quotedMsg: null });
    console.log(`[Followup] Mensaje #${currentFollowup} enviado al ticket ${ticketId}`);

    // 10. Actualizar ticket: incrementar followup_count y marcar como reciente
    await Ticket.update(
      { followup_count: currentFollowup },
      { where: { id: ticketId } }
    );

    // 11. Programar siguiente followup si hay más
    const nextFollowup = currentFollowup + 1;
    if (nextFollowup <= followupCount) {
      let nextDelay = 0;
      switch (nextFollowup) {
        case 2:
          nextDelay = (followupDelay2 || 3) * 60 * 60 * 1000;
          break;
        case 3:
          nextDelay = (followupDelay3 || 4) * 60 * 60 * 1000;
          break;
        default:
          nextDelay = followupDelay1 * 60 * 60 * 1000;
      }

      await followupQueue.add("SendFollowup", {
        ...data,
        currentFollowup: nextFollowup,
        assignedAt: new Date().toISOString()
      }, {
        delay: nextDelay,
        removeOnComplete: true,
        removeOnFail: true,
        jobId: `followup-${ticketId}`
      });
      console.log(`[Followup] Followup #${nextFollowup} programado para ticket ${ticketId}`);
    } else {
      console.log(`[Followup] Todos los followups completados para ticket ${ticketId}`);
    }

    done();
  } catch (err) {
    console.error("❌ Error en seguimiento:", err);
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
  assignedAt?: string;
  ticketFollowupEnabled?: boolean;
}) => {
  const {
    ticketId,
    tagId,
    tagKey,
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
    ticketFollowupEnabled
  } = params;

  // Si ya se alcanzaron los límites, no encolar más
  if (currentFollowup > followupCount) {
    console.log(`[Followup] Límite de followups alcanzado para ticket ${ticketId}`);
    return;
  }

  // Determinar el delay según el followup actual
  let delayMs = 0;
  switch (currentFollowup) {
    case 1:
      delayMs = followupDelay1 * 60 * 60 * 1000; // horas a ms
      break;
    case 2:
      delayMs = (followupDelay2 || 3) * 60 * 60 * 1000;
      break;
    case 3:
      delayMs = (followupDelay3 || 4) * 60 * 60 * 1000;
      break;
    default:
      delayMs = followupDelay1 * 60 * 60 * 1000;
  }

  // Eliminar job anterior si existe
  const jobId = `followup-${ticketId}`;
  const existing = await followupQueue.getJob(jobId);
  if (existing) {
    await existing.remove();
  }

  // Encolar el job
  await followupQueue.add("SendFollowup", {
    ticketId,
    tagId,
    tagKey,
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
    assignedAt: new Date().toISOString()
  }, {
    delay: delayMs,
    removeOnComplete: true,
    removeOnFail: true,
    jobId
  });

  console.log(`[Followup] Followup #${currentFollowup} programado para ticket ${ticketId} en ${delayMs / (60 * 60 * 1000)} horas`);
};

export const removeFollowupJobByTicketId = async (ticketId) => {
  const jobId = `followup-${ticketId}`;
  const job = await followupQueue.getJob(jobId);
  if (job) {
    await job.remove();
   // console.log(`🗑️ Seguimiento eliminado para ticket ${ticketId}`);
    return true;
  } else {
   // console.log(`🔎 No hay seguimiento pendiente para ticket ${ticketId}`);
    return false;
  }
};

export const enqueueStageClassifierJob = async ({ texto, ticketId, companyId, apiKey, contactName }) => {
  await stageClassifierQueue.add("ClasificarEtapa", {
    texto,
    ticketId,
    companyId,
    apiKey,
    contactName
  });
 // console.log(`🔄 Trabajo de clasificación encolado tras seguimiento para ticket ${ticketId}`);
};

