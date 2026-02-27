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

// 🆕 Importar servicio centralizado de IA
import { chatCompletion } from "../services/AIClientService";

import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(isBetween);
dayjs.extend(customParseFormat);

const availableTagKeys = [
  "attraction",
  "interest",
  "consideration",
  "hot-lead",
  "post-sale",
  "referrer"
];

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

  // --------- ENCOLA EL SEGUIMIENTO CORRECTO ----------
  await enqueueFollowupJob({ ticketId, tag, companyId, apiKey, contactName });

  //console.log(`🏷️ Ticket ${ticketId} clasificado como: ${key}`);
  done();
} catch (err) {
  console.error("❌ Error al clasificar etapa:", err);
  done(err);
}
});

export const followupQueue = new Queue("FollowupQueue", process.env.REDIS_URI);

followupQueue.process("SendFollowup", async (job, done) => {
  const { ticketId, tagKey, companyId, apiKey, contactName } = job.data;

  try {
    // 1. Consulta el contador de seguimientos actual
    const ticket = await Ticket.findByPk(ticketId);
    const whatsapp = await Whatsapp.findByPk(ticket.whatsappId)
    const config = whatsapp.schedules
    let count = ticket?.followup_count ?? 0;

     // 👉 Lógica de horario antes de cualquier envío
     const now = dayjs();
     if (!isInSchedule(now, config)) {
       // Calcula la próxima franja y reagenda
       const next = getNextAvailableDate(now, config);
       const delay = next.diff(now, "millisecond");
       await followupQueue.add("SendFollowup", job.data, {
         delay,
         removeOnComplete: true,
         removeOnFail: true,
         jobId: `followup-${ticketId}`
       });
      // console.log(`⏸️ Fuera de horario. Reagendado seguimiento para ticket ${ticketId} a las ${next.format("YYYY-MM-DD HH:mm")}`);
       return done();
     }

    // 2. Si ya está en dormant o sobrepasó el límite, no hacer nada
    if (count >= 3) return done();

    // 3. Si toca enviar el mensaje "dormant"
    if (count === 2) {
      // Busca la etiqueta dormant
      const dormantTag = await Tag.findOne({ where: { key: "dormant", companyId } });
      if (dormantTag) {
        // Actualiza la etiqueta
        await TicketTag.destroy({ where: { ticketId } });
        await TicketTag.create({ ticketId, tagId: dormantTag.id });
        await Ticket.update({ followup_count: 3 }, { where: { id: ticketId } });

        // Crea y envía el mensaje dormant personalizado usando AIClientService
        const dormantPrompt = `
          Saluda cordialmente al cliente al inicio del mensaje, sin usar ningún nombre propio.
          Luego, responde usando exactamente la instrucción siguiente, adaptando el texto en un mensaje de WhatsApp listo para copiar y enviar:

          [INSTRUCCIÓN]: ${dormantTag.greetingMessageLane}

          Importante: No incluyas explicaciones ni texto extra; solo el mensaje listo para enviar.
        `;

        const dormantCompletion = await chatCompletion({
          messages: [{ role: "user", content: dormantPrompt }],
          maxTokens: 200,
          temperature: 0.7,
          companyId,
          module: 'followup'
        });

        const text = dormantCompletion.content?.trim();
        if (text) {
          const ticketDetails = await ShowTicketService(ticketId, companyId);
          await SendWhatsAppMessage({ body: text, ticket: ticketDetails, quotedMsg: null });
       //   console.log(`📨 Mensaje dormant enviado al ticket ${ticketId}`);
        }
      }
      return done();
    }

    // 4. Si toca enviar un seguimiento normal (count 0 o 1)
    const ticketTag = await TicketTag.findOne({ where: { ticketId } });
    const tag = await Tag.findOne({ where: { id: ticketTag?.tagId, companyId } });
    if (!tag || tag.key !== tagKey || !tag.greetingMessageLane || !tag.timeLane || Number(tag.timeLane) === 0) return done();

    const messages = await Message.findAll({ where: { ticketId }, order: [["updatedAt", "ASC"]], limit: 2 });
    const textoIA = messages.map(m => `${m.fromMe ? "IA" : "Cliente"}: ${m.body}`).join("\n");

    const saludo = contactName && contactName.trim().length > 0
      ? `Saluda cordialmente usando el nombre del cliente (${contactName}) al inicio del mensaje.`
      : "Saluda cordialmente al cliente al inicio del mensaje, sin usar ningún nombre propio.";

    const followupPrompt = `
Estos son los últimos mensajes de la conversación:
${textoIA}

${saludo}

Tu tarea es redactar un mensaje de WhatsApp de seguimiento basándote en la siguiente idea (NO la copies literal, solo toma el sentido y adáptalo a la conversación):

[IDEA]: ${tag.greetingMessageLane}

Instrucciones importantes:
- Usa un tono natural, cálido y conversacional, como si fuera un chat real.
- Ajusta el mensaje al contexto de lo conversado previamente.
- Sé breve y claro; evita textos largos, explicaciones o aclaraciones.
- Devuelve únicamente el mensaje final listo para enviar por WhatsApp (sin introducciones ni notas adicionales).
`;

    const followupCompletion = await chatCompletion({
      messages: [{ role: "user", content: followupPrompt }],
      maxTokens: 200,
      temperature: 0.7,
      companyId,
      module: 'followup'
    });

    const text = followupCompletion.content?.trim();
    if (text) {
      const ticketDetails = await ShowTicketService(ticketId, companyId);
      await SendWhatsAppMessage({ body: text, ticket: ticketDetails, quotedMsg: null });
   //   console.log(`📨 Seguimiento enviado al ticket ${ticketId} con tag ${tag.key}`);
      await enqueueStageClassifierJob({
        texto: text,
        ticketId,
        companyId,
        apiKey,
        contactName
      });
      // Actualiza el contador de seguimientos
      await Ticket.update({ followup_count: count + 1 }, { where: { id: ticketId } });
    }

    done();
  } catch (err) {
    console.error("❌ Error en seguimiento:", err);
    done(err);
  }
});


export const enqueueFollowupJob = async ({ ticketId, tag, companyId, apiKey, contactName }) => {
  // No seguir si el ticket ya está en dormant
    // Si el tag está mal definido o no requiere seguimiento, no hacer nada
    if (
      !tag ||
      !tag.greetingMessageLane ||
      !tag.timeLane ||
      Number(tag.timeLane) === 0
    ) {
    //  console.log("⏩ Etiqueta sin seguimiento, no se agenda job de followup.");
      return;
    }
  
  const dormantTag = await Tag.findOne({ where: { key: "dormant", companyId } });
  const dormantTicket = dormantTag && await TicketTag.findOne({ where: { ticketId, tagId: dormantTag.id } });
  if (dormantTicket) {
  //  console.log("⏸️ El ticket ya está en dormant, no se agenda más seguimiento.");
    return;
  }
  

  const jobId = `followup-${ticketId}`;
  const existing = await followupQueue.getJob(jobId);
  if (existing) {
    await existing.remove();
  //  console.log(`♻️ Seguimiento anterior eliminado para ticket ${ticketId}`);
  }
  await followupQueue.add("SendFollowup", {
    ticketId,
    tagKey: tag.key,
    companyId,
    apiKey,
    contactName
  }, {
    delay: tag.timeLane * 60 * 60 * 1000,
    removeOnComplete: true,
    removeOnFail: true,
    jobId
  });
//  console.log(`📆 Seguimiento encolado para ticket ${ticketId} con etiqueta ${tag.key} (${tag.timeLane} min)`);
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

