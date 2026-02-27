// services/IntegrationsServices/OpenAiMetaService.ts
// 🚀 VERSIÓN MEJORADA: Con memoria, queues, seguimiento y todas las mejoras de OpenAiService
// 🆕 MIGRADO: Ahora usa AIClientService para selección automática de proveedor

import OpenAI from "openai";
import path from "path";
import fs from "fs";
import fsc from "fs/promises";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import TicketTraking from "../../models/TicketTraking";
import Whatsapp from "../../models/Whatsapp";

import { sendTextDynamic } from "../MetaServices/metaSendService";
import { transferQueue } from "../WbotServices/wbotMessageListener";
import UpdateTicketService from "../TicketServices/UpdateTicketService";

// 🆕 SERVICIO CENTRALIZADO DE IA
import { chatCompletion, createEmbedding } from "../AIClientService";

// 🚀 CACHÉ: Importar servicio de caché para optimización
import {
  getCachedQueuePromptAI,
  getCachedPromptQueues,
  getCachedPromptIdByApiKey
} from "./PromptCacheService";

// 🆕 MEJORAS: Importar nuevos servicios
import { ConversationAnalyzer, ImprovedChunkSearch } from "./ImprovedContextRetrieval";
import ConversationMemoryService from "./ConversationMemoryService";

// 🆕 Importar funciones de clasificación y seguimiento
import {
  enqueueStageClassifierJob,
  removeFollowupJobByTicketId
} from "../../workers/stageClassifier.worker";

// 📊 Tracking de tokens
import { trackEmbeddings } from "../TokenTrackingService/TokenTrackingService";

// Interface para configuración de OpenAI
export interface IOpenAi {
  name: string;
  prompt: string;
  voice: string;
  voiceKey: string;
  voiceRegion: string;
  maxTokens: number;
  temperature: number;
  apiKey: string;
  queueId: number;
  maxMessages: number;
  companyId?: number;
  fileNameIA?: string;
  queues?: Array<{ id: number; name: string; promptAI?: string }>;
  // Compatibilidad con versión anterior
  useEmbeddings?: boolean;
  embeddingsFilePath?: string;
}

// 🎯 Interface para la respuesta de clasificación de queue
interface QueueClassificationResult {
  shouldAssignQueue: boolean;
  queueId: number | null;
  queueName: string | null;
  confidence: number;
  reason: string;
}

// ---- Pool de sesiones OpenAI ----
interface SessionOpenAi extends OpenAI {
  id?: number;
  lastUsed?: number;
}
const sessionsOpenAi: SessionOpenAi[] = [];

// 🧹 Limpieza automática de sesiones OpenAI cada 10 minutos
setInterval(() => {
  const unaHora = 1000 * 60 * 60;
  const ahora = Date.now();
  for (let i = sessionsOpenAi.length - 1; i >= 0; i--) {
    const sesion = sessionsOpenAi[i];
    if (!sesion.lastUsed || ahora - sesion.lastUsed > unaHora) {
      sessionsOpenAi.splice(i, 1);
    }
  }
}, 1000 * 60 * 10);

// ---- Helpers ----
const estimateTokens = (text: string): number => {
  if (!text) return 0;
  return Math.ceil(text.trim().split(/\s+/).length * 1.3);
};

const sanitizeName = (name: string): string => {
  let sanitized = name.split(" ")[0];
  sanitized = sanitized.replace(/[^a-zA-Z0-9]/g, "");
  return sanitized.substring(0, 60);
};

// 🎯 Función para clasificar y asignar queue basado en la conversación
// 🆕 MIGRADO: Ya no recibe openai como parámetro, usa AIClientService
const classifyAndAssignQueue = async (
  conversationHistory: string,
  availableQueues: Array<{ id: number; name: string; promptAI: string | null }>,
  companyId: number
): Promise<QueueClassificationResult> => {
  if (!availableQueues || availableQueues.length === 0) {
    return {
      shouldAssignQueue: false,
      queueId: null,
      queueName: null,
      confidence: 0,
      reason: "No hay queues disponibles"
    };
  }

  const queuesDescription = availableQueues
    .map(q => `- ID: ${q.id}, Nombre: "${q.name}"${q.promptAI ? `, Descripción: ${q.promptAI.substring(0, 100)}...` : ""}`)
    .join("\n");

  const classificationPrompt = `Analiza la siguiente conversación y determina si el cliente necesita ser asignado a un departamento específico.

DEPARTAMENTOS DISPONIBLES:
${queuesDescription}

CONVERSACIÓN:
${conversationHistory}

INSTRUCCIONES:
1. Analiza el contexto de la conversación
2. Identifica si el cliente ha expresado necesidad de un departamento específico (soporte técnico, ventas, facturación, etc.)
3. Solo asigna un departamento si el cliente lo ha solicitado explícitamente o si el contexto lo indica claramente

Responde ÚNICAMENTE en formato JSON:
{
  "shouldAssign": true/false,
  "queueId": número o null,
  "queueName": "nombre" o null,
  "confidence": 0.0 a 1.0,
  "reason": "explicación breve"
}`;

  try {
    // 🆕 MIGRADO: Usar chatCompletion de AIClientService
    const response = await chatCompletion({
      messages: [{ role: "system", content: classificationPrompt }],
      maxTokens: 200,
      temperature: 0.3,
      companyId,
      module: 'classification'
    });

    const content = response.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        shouldAssignQueue: parsed.shouldAssign === true,
        queueId: parsed.queueId || null,
        queueName: parsed.queueName || null,
        confidence: parsed.confidence || 0,
        reason: parsed.reason || ""
      };
    }
  } catch (error) {
    console.error("Error en clasificación de queue:", error);
  }

  return {
    shouldAssignQueue: false,
    queueId: null,
    queueName: null,
    confidence: 0,
    reason: "Error en clasificación"
  };
};

// 🆕 MIGRADO: Wrapper sobre chatCompletion de AIClientService
// Mantiene formato compatible con código existente (choices[0].message.content)
async function getSafeCompletion(
  basePayload: any,
  companyId?: number,
  module: 'chat' | 'followup' | 'classification' | 'embedding' | 'whisper' | 'transfer' | 'file_processing' = 'chat'
): Promise<any> {
  try {
    const response = await chatCompletion({
      messages: basePayload.messages,
      maxTokens: basePayload.max_tokens,
      temperature: basePayload.temperature,
      companyId,
      module
    });

    // Devolver formato compatible con OpenAI SDK
    return {
      choices: [{
        message: {
          content: response.content,
          role: 'assistant'
        }
      }],
      usage: response.usage,
      model: response.model
    };
  } catch (err: any) {
    console.error(`❌ [META-IA] Error en getSafeCompletion:`, err);
    throw err;
  }
}

// ---- Helpers de vectores ----
function toF32Normalized(vec: number[]): Float32Array {
  const f = new Float32Array(vec.length);
  let norm2 = 0;
  for (let i = 0; i < vec.length; i++) {
    const v = vec[i] ?? 0;
    f[i] = v;
    norm2 += v * v;
  }
  const norm = Math.sqrt(norm2) || 1;
  for (let i = 0; i < f.length; i++) f[i] /= norm;
  return f;
}

function dotUnit(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return -Infinity;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function normalizeKw(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function extractQueryKeywords(text: string, max = 8): string[] {
  const clean = normalizeKw(text);
  if (!clean) return [];
  const tokens = clean.split(/\s+/).filter(t => t.length > 2);
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([t]) => t);
}

function keywordScore(entryKeywords: string[], qKw: string[]): number {
  if (!entryKeywords?.length || !qKw.length) return 0;
  const set = new Set(entryKeywords);
  let hits = 0;
  for (const k of qKw) if (set.has(k)) hits++;
  return hits;
}

// 🔹 API principal para Meta (envía respuestas por WhatsApp Cloud)
export const handleOpenAiMeta = async (
  openAiSettings: IOpenAi,
  ticket: Ticket,
  contact: Contact,
  incomingText: string,
  mediaSent: Message | undefined,
  ticketTraking: TicketTraking,
  toE164NoPlus: string,
  whatsapp?: Whatsapp
): Promise<void> => {
  console.log("🚀 [META-IA] Inicio handleOpenAiMeta:", {
    ticketId: ticket.id,
    contactName: contact.name,
    queueId: ticket.queueId || "sin asignar",
    promptName: openAiSettings?.name
  });

  try {
    if (contact.disableBot) {
      console.log("⛔ [META-IA] Bot deshabilitado para contacto:", contact.id);
      return;
    }

    if (!incomingText?.trim()) {
      console.log("⛔ [META-IA] No hay texto entrante");
      return;
    }

    // Obtener o crear sesión OpenAI
    const now = Date.now();
    let openai: SessionOpenAi;
    const openAiIndex = sessionsOpenAi.findIndex(s => s.id === ticket.id);

    if (openAiIndex === -1) {
      openai = new OpenAI({ apiKey: openAiSettings.apiKey }) as SessionOpenAi;
      openai.id = ticket.id;
      openai.lastUsed = now;
      sessionsOpenAi.push(openai);
    } else {
      openai = sessionsOpenAi[openAiIndex];
      openai.lastUsed = now;
    }

    // Configuración de embeddings
    const fileNameIA = openAiSettings.fileNameIA || "";
    const nombreBaseArchivo = fileNameIA
      ? path.basename(fileNameIA, path.extname(fileNameIA))
      : "default";

    const embeddingPath = path.resolve(
      process.cwd(),
      `public/company${ticket.companyId}/ia/Embeddings/${nombreBaseArchivo}.json`
    );

    // 🔍 Función para buscar contexto desde embeddings
    const buscarContextoDesdeTxt = async (
      consulta: string,
      opciones?: {
        maxChunks?: number;
        minSimilitud?: number;
        maxTotalChars?: number;
      }
    ): Promise<string> => {
      const {
        maxChunks = 3,
        minSimilitud = 0.55,
        maxTotalChars = 1500
      } = opciones || {};

      try {
        const contenidoEmbeddings = await fsc.readFile(embeddingPath, "utf-8");

        type Stored = {
          chunk: string;
          embedding?: number[];
          embedding_unit?: number[];
          topic?: string;
          keywords?: string[];
        };
        const embeddingsCargados: Stored[] = JSON.parse(contenidoEmbeddings);

        const entries = embeddingsCargados
          .map(it => {
            let vec: Float32Array | null = null;
            if (Array.isArray(it.embedding_unit)) {
              vec = toF32Normalized(it.embedding_unit);
            } else if (Array.isArray(it.embedding)) {
              vec = toF32Normalized(it.embedding);
            }
            if (!vec) return null;
            return {
              chunk: it.chunk ?? "",
              vec,
              keywords: Array.isArray(it.keywords)
                ? it.keywords.map(k =>
                    k.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
                  )
                : []
            };
          })
          .filter(Boolean) as { chunk: string; vec: Float32Array; keywords: string[] }[];

        if (entries.length === 0) return "";

        const embResp = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: consulta || " "
        });

        // 📊 REGISTRAR TOKENS DE EMBEDDING
        await trackEmbeddings(ticket.companyId, "text-embedding-3-small", embResp.usage);

        const qVec = toF32Normalized(embResp.data[0].embedding as unknown as number[]);
        const qKeywords = extractQueryKeywords(consulta);

        const alpha = 0.4;
        const ranked = entries
          .map(e => {
            const k = keywordScore(e.keywords, qKeywords);
            const s = dotUnit(qVec, e.vec);
            const s01 = (s + 1) / 2;
            const h = alpha * (k > 0 ? 1 : 0) + (1 - alpha) * s01;
            return { chunk: e.chunk, k, s, h };
          })
          .sort((a, b) => (b.k - a.k) || (b.h - a.h));

        const top = ranked
          .filter(r => r.k > 0 || r.s >= minSimilitud)
          .slice(0, maxChunks);

        return top.map(c => c.chunk).join("\n").slice(0, maxTotalChars);
      } catch (error) {
        return "";
      }
    };

    // 🗂 Historial de mensajes
    const messages = await Message.findAll({
      where: { ticketId: ticket.id },
      order: [["createdAt", "ASC"]],
      limit: openAiSettings.maxMessages
    });

    // 🆕 MEJORA 1: Analizar conversación para extraer contexto estructurado
    console.log("📊 [META-IA] Analizando conversación...");
    const conversationContext = ConversationAnalyzer.analyzeConversation(messages);
    console.log(`  ✓ Consulta principal: "${conversationContext.mainQuery.substring(0, 60)}..."`);

    // 🆕 MEJORA 2: Búsqueda mejorada con consulta sintetizada
    let contexto = "";

    if (fileNameIA && fileNameIA.trim() !== "" && fs.existsSync(embeddingPath)) {
      try {
        const searchResults = await ImprovedChunkSearch.searchRelevantChunks(
          embeddingPath,
          conversationContext,
          openai,
          {
            maxChunks: 3,
            minSimilarity: 0.55,
            diversityThreshold: 0.8
          }
        );

        contexto = ImprovedChunkSearch.formatContextForPrompt(searchResults);
        console.log(`🔍 [META-IA] Chunks encontrados: ${searchResults.length}`);
      } catch (error: any) {
        console.warn("⚠️ [META-IA] Error en búsqueda mejorada, usando fallback:", error.message);
        const consultaEmbeddings = messages.map(m => m.body || "").join("\n");
        contexto = await buscarContextoDesdeTxt(consultaEmbeddings, {
          maxChunks: 3,
          minSimilitud: 0.55,
          maxTotalChars: 1500
        });
      }
    } else {
      console.log("ℹ️ [META-IA] No hay archivo de embeddings configurado");
    }

    // 🆕 MEJORA 3: Generar prompt con memoria de conversación
    console.log("💾 [META-IA-MEMORY] Generando prompt contextual con memoria...");
    const previousResponsesSummary = ConversationAnalyzer.getPreviousResponsesSummary(messages);
    const enhancedPrompt = await ConversationMemoryService.generateContextualPrompt(
      ticket.id,
      openAiSettings.prompt
    );
    console.log("💾 [META-IA-MEMORY] Prompt contextual generado. Incluye memoria:", enhancedPrompt.includes("PREGUNTAS YA REALIZADAS"));

    // 🎯 NUEVO: Obtener queues disponibles para este prompt
    let availableQueues: Array<{ id: number; name: string; promptAI: string | null }> = [];
    let queueContextPrompt = "";
    let currentQueuePromptAI = "";

    try {
      console.log("🔍 [META-IA-CACHE] Buscando promptId por apiKey...");
      const promptId = await getCachedPromptIdByApiKey(openAiSettings.apiKey, ticket.companyId);
      console.log("🔍 [META-IA-CACHE] PromptId encontrado:", promptId || "ninguno");

      if (promptId) {
        console.log("🔍 [META-IA-CACHE] Buscando queues para promptId:", promptId);
        availableQueues = await getCachedPromptQueues(promptId, ticket.companyId);
        console.log("🔍 [META-IA-CACHE] Queues encontradas:", availableQueues.length, availableQueues.map(q => q.name));

        if (availableQueues.length > 0) {
          const queuesInfo = availableQueues
            .map(q => `• ${q.name} (ID: ${q.id})`)
            .join("\n");

          queueContextPrompt = `\n\n📋 DEPARTAMENTOS DISPONIBLES:
${queuesInfo}

INSTRUCCIONES DE ASIGNACIÓN:
- Si el cliente solicita ayuda específica de un departamento, responde normalmente y la asignación se hará automáticamente.
- No menciones los IDs de departamento al cliente.
- Si detectas que el cliente necesita un departamento específico, atiéndelo con la información disponible.
`;
        }
      }

      // Si el ticket ya tiene una queue asignada, obtener su promptAI específico
      if (ticket.queueId) {
        console.log("🔍 [META-IA-CACHE] Ticket tiene queueId:", ticket.queueId, "- Buscando promptAI...");
        const queuePrompt = await getCachedQueuePromptAI(ticket.queueId, ticket.companyId);
        console.log("🔍 [META-IA-CACHE] PromptAI de queue encontrado:", queuePrompt ? `${queuePrompt.substring(0, 50)}...` : "ninguno");
        if (queuePrompt) {
          currentQueuePromptAI = `\n\n🎯 CONTEXTO DEL DEPARTAMENTO ACTUAL:
${queuePrompt}

Usa esta información específica del departamento para responder de manera más precisa.
`;
        }
      }
    } catch (queueError) {
      console.warn("⚠️ [META-IA] Error obteniendo información de queues:", queueError);
    }

    // Construir prompt del sistema
    const promptSystem = `En las respuestas utiliza siempre el nombre ${sanitizeName(
      contact.name || "Amigo(a)"
    )} para identificar al cliente.
Usa ${openAiSettings.maxTokens} tokens máximo en tu respuesta.
Cuando la respuesta requiera transferir al área de atención al cliente, inicia tu respuesta con 'Permíteme transferirte con uno de nuestros asesores para ayudarte mejor'.

${enhancedPrompt}
${currentQueuePromptAI}
${queueContextPrompt}
${previousResponsesSummary || ""}
`;

    // Construir array de mensajes para OpenAI
    const maxTotalTokens = 8000;
    let tokenCount = estimateTokens(promptSystem);
    let messagesOpenAi: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

    // System prompt va PRIMERO
    messagesOpenAi.push({ role: "system", content: promptSystem });

    // Contexto de embeddings va SEGUNDO
    const contextoTokens = estimateTokens(contexto);
    if (contexto && tokenCount + contextoTokens <= maxTotalTokens) {
      messagesOpenAi.push({ role: "system", content: contexto });
      tokenCount += contextoTokens;
    }

    let mensajesAgregados = 0;

    // Historial de conversación (más recientes hacia atrás)
    for (let i = messages.length - 1; i >= 0; i--) {
      if (mensajesAgregados >= openAiSettings.maxMessages) break;

      const message = messages[i];
      if (
        message.mediaType !== "conversation" &&
        message.mediaType !== "extendedTextMessage" &&
        message.mediaType !== "text"
      ) continue;

      const content = message.body;
      const tokens = estimateTokens(content);
      if (tokenCount + tokens > maxTotalTokens) break;

      const role = message.fromMe ? "assistant" : "user";
      messagesOpenAi.splice(2, 0, { role, content }); // Insertar después del sistema y contexto
      tokenCount += tokens;
      mensajesAgregados++;
    }

    // Agregar mensaje actual
    const bodyTokens = estimateTokens(incomingText);
    if (tokenCount + bodyTokens <= maxTotalTokens) {
      messagesOpenAi.push({ role: "user", content: incomingText });
    } else {
      console.warn("⚠️ [META-IA] El mensaje actual excede el límite de tokens");
    }

    // Llamar a OpenAI
    console.log("🤖 [META-IA] Llamando a OpenAI API...", {
      ticketId: ticket.id,
      messagesCount: messagesOpenAi.length
    });

    // 🆕 MIGRADO: Ya no pasa openai como parámetro
    const chat = await getSafeCompletion({
      messages: messagesOpenAi,
      max_tokens: Number(openAiSettings.maxTokens) || 500,
      temperature: parseFloat(String(openAiSettings.temperature)) || 0.7
    }, ticket.companyId, 'chat');

    let response = chat.choices[0].message?.content;

    console.log("✅ [META-IA] Respuesta de OpenAI recibida:", {
      ticketId: ticket.id,
      responseLength: response?.length || 0,
      preview: response?.substring(0, 100) + "..."
    });

    // 🆕 MEJORA 6: Actualizar memoria de conversación
    console.log("💾 [META-IA-MEMORY] Actualizando memoria de conversación...");
    try {
      const currentState = await ConversationMemoryService.getConversationState(ticket.id);
      console.log("💾 [META-IA-MEMORY] Estado actual:", {
        questionsAsked: currentState?.questionsAsked?.length || 0,
        answersReceived: currentState?.answersReceived?.length || 0
      });

      const updateData: any = {
        lastResponse: response || ""
      };

      if (response?.includes("?")) {
        const currentQuestions = Array.isArray(currentState?.questionsAsked) ? currentState.questionsAsked : [];
        updateData.questionsAsked = [...currentQuestions, response];
        console.log("💾 [META-IA-MEMORY] Pregunta detectada, agregando a memoria. Total preguntas:", updateData.questionsAsked.length);
      }

      await ConversationMemoryService.updateState(ticket.id, updateData);
      console.log("✅ [META-IA-MEMORY] Memoria actualizada exitosamente");
    } catch (memoryError: any) {
      console.error("❌ [META-IA-MEMORY] Error al actualizar memoria:", memoryError?.message);
    }

    // 🎯 Clasificación y asignación automática de queue
    if (!ticket.queueId && availableQueues.length > 0) {
      try {
        const conversationForClassification = messages
          .slice(-6)
          .map(m => `${m.fromMe ? "Bot" : "Cliente"}: ${m.body}`)
          .join("\n") + `\nCliente: ${incomingText}`;

        // 🆕 MIGRADO: Ya no pasa openai como parámetro
        const queueClassification = await classifyAndAssignQueue(
          conversationForClassification,
          availableQueues,
          ticket.companyId
        );

        if (queueClassification.shouldAssignQueue &&
            queueClassification.queueId &&
            queueClassification.confidence > 0.7) {

          console.log(`🎯 [META-IA-QUEUE] Asignando ticket ${ticket.id} a queue ${queueClassification.queueName} (ID: ${queueClassification.queueId}) - Confianza: ${queueClassification.confidence}`);

          await UpdateTicketService({
            ticketData: {
              queueId: queueClassification.queueId
            },
            ticketId: ticket.id,
            companyId: ticket.companyId
          });

          await ticket.reload();

          console.log(`✅ [META-IA-QUEUE] Ticket ${ticket.id} asignado exitosamente a ${queueClassification.queueName}. Razón: ${queueClassification.reason}`);
        }
      } catch (queueAssignError) {
        console.error("❌ [META-IA] Error en clasificación/asignación de queue:", queueAssignError);
      }
    }

    // Transferencia si es necesario
    if (response?.includes("Permíteme transferirte con uno de nuestros asesores para ayudarte mejor")) {
      await transferQueue(openAiSettings.queueId, ticket, contact);
    }

    response = (response || "").trim();
    if (!response) return;

    // Obtener datos de WhatsApp para enviar
    // facebookPageUserId contiene el Phone Number ID de Meta, number contiene el teléfono real
    let phoneNumberId = "";
    let accessToken = "";

    if (whatsapp) {
      phoneNumberId = whatsapp.facebookPageUserId || whatsapp.number;
      accessToken = whatsapp.tokenMeta;
    } else {
      // Buscar whatsapp del ticket
      const ticketWhatsapp = await Whatsapp.findOne({
        where: { id: ticket.whatsappId }
      });
      if (ticketWhatsapp) {
        phoneNumberId = ticketWhatsapp.facebookPageUserId || ticketWhatsapp.number;
        accessToken = ticketWhatsapp.tokenMeta;
      }
    }

    if (!phoneNumberId || !accessToken) {
      console.error("❌ [META-IA] No se encontró configuración de WhatsApp Meta");
      return;
    }

    // 📤 Enviar respuesta por WhatsApp Cloud (Meta)
    console.log("📤 [META-IA] Enviando respuesta por Meta. Longitud:", response.length);
    await sendTextDynamic(toE164NoPlus, response, phoneNumberId, accessToken);
    console.log("✅ [META-IA] Mensaje enviado exitosamente por Meta");

    // 🆕 CLASIFICACIÓN Y SEGUIMIENTO: Cuando la IA responde, clasificar y encolar seguimiento
    try {
      // Primero eliminar cualquier seguimiento pendiente
      await removeFollowupJobByTicketId(ticket.id);

      // Encolar clasificación (esto automáticamente encolará el seguimiento después de clasificar)
      await enqueueStageClassifierJob({
        texto: response || "",
        ticketId: ticket.id,
        companyId: ticket.companyId,
        apiKey: openAiSettings.apiKey,
        contactName: contact.name || ""
      });
      console.log("🔄 [META-IA] Clasificación encolada después de respuesta de IA");
    } catch (classifyError) {
      console.error("❌ [META-IA] Error al encolar clasificación:", classifyError);
    }

  } catch (error) {
    console.error("❌ [META-IA] Error en handleOpenAiMeta:", error);
  }
};

export default handleOpenAiMeta;
