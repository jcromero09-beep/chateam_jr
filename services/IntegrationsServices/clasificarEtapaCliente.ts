import OpenAI from "openai";
import { Op } from "sequelize";
import fs from "fs";
import fsc from 'fs/promises';
import path, { join } from "path";
import Ticket from "../../models/Ticket";
import Tag from "../../models/Tag";
import TicketTag from "../../models/TicketTag";
import cron from "node-cron";
import Company from "../../models/Company";
import Queue from "bull";
import Message from "../../models/Message";
import { enqueueFollowupJob } from "../../workers/stageClassifier.worker";
import Whatsapp from "../../models/Whatsapp";
import Prompt from "../../models/Prompt";

export const stageClassifierQueue = new Queue("StageClassifierQueue", process.env.REDIS_URI);


const availableTagKeys = [
  "attraction",       // Primer contacto
  "interest",         // Curiosidad activa
  "consideration",    // Evalúa opciones
  "hot-lead",         // Quiere comprar
  "post-sale",        // Ya compró
  "referrer"          // Recomienda
];


cron.schedule("0 1 * * *", async () => {
  //cron.schedule( '*/30 * * * * *', async () => {
  console.log("⏰ Ejecutando tarea de revisión de tickets dormidos...");
  await marcarTicketsDormant();
});




// 🔁 Encolar mensaje para clasificación
export const agregarAColaDeClasificacion = async ({
  texto,
  ticketId,
  companyId,
  apiKey,
  contactName,
  promptId
}: {
  texto: string;
  ticketId: number;
  companyId: number;
  apiKey: string;
  contactName: string;
  promptId?: number;
}) => {
  console.log("🚀 Worker de Clasificación cargado")
  await stageClassifierQueue.add("ClasificarEtapa", {
    texto,
    ticketId,
    companyId,
    apiKey,
    contactName
  });
};


// const stageClassifierQueue = new Queue("StageClassifierQueue", process.env.REDIS_URI);
// stageClassifierQueue.on("error", (err) => {
//   console.error("❌ Error en StageClassifierQueue:", err);
// });

// stageClassifierQueue.on("waiting", (jobId) => {
//   console.log("⏳ Job esperando ejecución:", jobId);
// });

// stageClassifierQueue.on("active", (job) => {
//   console.log("🏃 Procesando job:", job.id);
// });

// // export const clasificarEtapaCliente = async (
// //   apiKey: string,
// //   textoParaAnalisisTags: string,
// //   ticketId: number,
// //   companyId: number
// // ): Promise<void> => {

// stageClassifierQueue.process("ClasificarEtapa", async (job, done) => {
//   const { texto, ticketId, companyId, apiKey } = job.data;
//   try {
//     await asegurarTagsPorDefecto(companyId);
//     const openai = new OpenAI({ apiKey });

//     const messages = await Message.findAll({
//       where: { ticketId: ticketId },
//       order: [["createdAt", "ASC"]],
//       limit: 15
//     });

    
//     const textoIA = messages.map(m => `${m.fromMe ? "IA" : "Cliente"}: ${m.body}`).join("\n") + "\nCliente: " + texto;
  
//     console.log('conversacion', textoIA)

//     const prompt = `Actúa como un asistente comercial experto en identificar en qué etapa del funnel se encuentra un cliente dentro del proceso de venta, basándote únicamente en el historial de conversación entre el cliente y un asesor:
// ${textoIA}

// Evalúa tanto los mensajes de avance (interés, preguntas, intención de compra) como los de retroceso (rechazo, dudas, desinterés).

// Estas son las etapas posibles:

// attraction → Primer contacto o cliente que mostró interés antes pero ahora rechaza, desiste o necesita ser reenganchado.
// Palabras clave: “Hola”, “Buenos días”, “Estoy interesado”, “Una consulta”, “No gracias”, “Tal vez después”, “Ahorita no”

// interest → Muestra curiosidad o responde al primer contacto, sin intención clara de compra.
// Palabras clave: “Cuéntame más”, “¿Qué incluye?”, “¿Cómo funciona?”, “¿Me explicas?”, “Voy a pensarlo”

// consideration → Hace varias preguntas o compara opciones antes de decidir.
// Palabras clave: “¿Cuál es mejor?”, “¿Qué me conviene?”, “Estoy entre este y otro”, “¿Cuál recomiendas?”

// hot-lead → Expresa intención directa de compra, pide precio, pago o envío.
// Palabras clave: “¿Cómo pago?”, “¿Dónde transfiero?”, “¿Tienen link?”, “Listo para comprar”, “Quiero ordenar”

// retention → Ya compró, habla de seguimiento o postventa.
// Palabras clave: “Ya compré”, “Me llegó”, “Todo bien”, “Gracias”, “Funcionó perfecto”

// referrer → Recomienda el servicio a otros o manifiesta intención de hacerlo.
// Palabras clave: “Ya los recomendé”, “Le dije a un amigo”, “Va a escribirles alguien”, “Les pasé su contacto”

// Importante: Responde exclusivamente con una de estas keys:
// attraction, interest, consideration, hot-lead, retention, referrer.
//                         `;


//     // const completion = await openai.chat.completions.create({
//     //     model: "gpt-3.5-turbo",
//     //     messages: [{ role: "user", content: prompt }],
//     //     max_tokens: 50,
//     //     temperature: 0
//     // });

//     const completion = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "user", content: prompt }],
//       max_tokens: 1000,
//       temperature: 0
//     });

//     const key = completion.choices[0].message?.content?.trim().toLowerCase();

//     if (!key || !availableTagKeys.includes(key)) return;

//     const tag = await Tag.findOne({ where: { key, companyId } });
//     if (!tag) return;

//     // Reemplazar la tag actual
//     await TicketTag.destroy({ where: { ticketId } });
//     await TicketTag.create({
//       ticketId,
//       tagId: tag.id,

//     });

//     //     console.log(`🏷️ Ticket ${ticketId} clasificado como: ${key}`);
//     //   } catch (error) {
//     //     console.error("❌ Error al clasificar la etapa del cliente:", error);
//     //   }
//     // };
//     console.log(`🏷️ Ticket ${ticketId} clasificado como: ${key}`);
//     return done();
//   } catch (error) {
//     console.error("❌ Error al clasificar etapa:", error);
//     return done(error);
//   }
// });







export const obtenerApiKeyPorTicketId = async (ticketId: number): Promise<string | null> => {
  try {
    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) return null;
    const whatsapp = await Whatsapp.findByPk(ticket.whatsappId);
    if (!whatsapp) return null;
    const prompt = await Prompt.findByPk(whatsapp.promptId);
    if (!prompt || !prompt.apiKey) return null;
    return prompt.apiKey;
  } catch (error) {
    return null;
  }
};

const MILISEGUNDOS_INACTIVIDAD = 120 * 60 * 60 * 1000; //48  horas
//const MILISEGUNDOS_INACTIVIDAD = 5 * 60 * 1000; // 5 minutos

export const marcarTicketsDormant = async () => {
  try {
    const now = new Date();
    // const limiteInactividad = new Date(now.getTime() - HORAS_SIN_RESPUESTA * 60 * 60 * 1000);
    const limiteInactividad = new Date(now.getTime() - MILISEGUNDOS_INACTIVIDAD);
    // Filtrar solo empresas activas por fecha
    const { rows: companies } = await Company.findAndCountAll({
      where: {
        dueDate: {
          [Op.or]: [null, { [Op.gt]: now }]
        }
      }
    });

    for (const company of companies) {
      const tickets = await Ticket.findAll({
        where: {
          companyId: company.id,
          status: "open",
          fromMe: true,
          updatedAt: { [Op.lte]: limiteInactividad }
        }
      });

      for (const ticket of tickets) {
        const tag = await Tag.findOne({ where: { key: "dormant", companyId: company.id } });
        if (!tag) continue;

        await TicketTag.destroy({ where: { ticketId: ticket.id } });
        await TicketTag.create({
          ticketId: ticket.id,
          tagId: tag.id,
        });

        
        const apiKey = await obtenerApiKeyPorTicketId(ticket.id);
        await enqueueFollowupJob({
          ticketId: ticket.id,
          tagId: tag.id,
          tagKey: tag.key,
          companyId: company.id,
          apiKey: apiKey,
          contactName: "",
          currentFollowup: 0,
          followupMessage1: "",
          followupDelay1: 0,
          followupCount: 0
        });

      //  console.log(`📌 Ticket ${ticket.id} marcado como 'dormant' para la empresa ${company.name}`);
      }
    }
  } catch (error) {
    console.error("❌ Error al marcar tickets dormidos:", error);
  }
};


export const actualizarRetargetingSiEsDormant = async (
  ticketId: number,
  companyId: number
): Promise<void> => {
  try {
    const dormantTag = await Tag.findOne({ where: { key: "dormant", companyId } });
    const retargetingTag = await Tag.findOne({ where: { key: "retargeting", companyId } });

    if (!dormantTag || !retargetingTag) return;

    const ticketTags = await TicketTag.findAll({ where: { ticketId } });
    const tieneDormant = ticketTags.some(t => t.tagId === dormantTag.id);

    if (tieneDormant) {
      await TicketTag.destroy({ where: { ticketId } });
      await TicketTag.create({
        ticketId,
        tagId: retargetingTag.id,
      });
      // Reset followup_count al re-activar desde dormant
      await Ticket.update({ followup_count: 0 }, { where: { id: ticketId } });
      const apiKey = await obtenerApiKeyPorTicketId(ticketId);
      if (!apiKey) {
        console.log(`⚠️ No se encontró apiKey para el ticket ${ticketId}. No se programará seguimiento retargeting.`);
        return; // Sale, pero no lanza error ni corta todo el try
      }
      await enqueueFollowupJob({
        ticketId: ticketId,
        tagId: retargetingTag.id,
        tagKey: retargetingTag.key,
        companyId,
        apiKey,
        contactName: "",
        currentFollowup: 0,
        followupMessage1: "",
        followupDelay1: 0,
        followupCount: 0
      });
     // console.log(`🔁 Ticket ${ticketId} movido a 'retargeting' automáticamente`);
    }
  } catch (error) {
    console.error("❌ Error al actualizar retargeting:", error);
  }
};



export const asegurarTagsPorDefecto = async (companyId: number) => {
  const tagsPorDefecto = [
    { name: "Atracción", key: "attraction", color: "#1471E3" },
    { name: "Interés", key: "interest", color: "#FFD700" },
    { name: "Consideración / Conversión", key: "consideration", color: "#F57C00" },
    { name: "Venta / Lead Caliente", key: "hot-lead", color: "#E53935" },
    { name: "Postventa / Fidelización", key: "post-sale", color: "#43A047" },
    { name: "Congelado / Dormido", key: "dormant", color: "#757575" },
    { name: "Referido / Promotor", key: "referrer", color: "#8E24AA" },
    { name: "Reactivación", key: "retargeting", color: "#26C6DA" }
  ];

  // Buscar tags existentes de esta empresa
  const existingTags = await Tag.findAll({
    where: {
      companyId,
      key: { [Op.in]: tagsPorDefecto.map(tag => tag.key) }
    }
  });

  const existingKeys = existingTags.map(tag => tag.key);
  const tagsFaltantes = tagsPorDefecto.filter(tag => !existingKeys.includes(tag.key));

  if (tagsFaltantes.length === 0) return;




  const tagsAInsertar = tagsFaltantes.map(tag => ({
    ...tag,
    companyId,
    kanban: 1,
    timeLane: 0,
    nextLaneId: null,
    greetingMessageLane: "",
    rollbackLaneId: null
  }));

  await Tag.bulkCreate(tagsAInsertar);
  console.log(`✅ Se crearon ${tagsFaltantes.length} tags por defecto para companyId: ${companyId}`);
};
