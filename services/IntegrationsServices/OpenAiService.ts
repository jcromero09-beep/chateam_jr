import { MessageUpsertType, proto, WASocket } from "@whiskeysockets/baileys";
import {
  convertTextToSpeechAndSaveToFile,
  getBodyMessage,
  keepOnlySpecifiedChars,
  transferQueue,
  verifyMediaMessage,
  verifyMessage
} from "../WbotServices/wbotMessageListener.js";
import chroma from "../../libs/chromadb.js";
import _ from "lodash";
const {  isNil, isNull  } = _;
//import { clasificarEtapaCliente } from "./clasificarEtapaCliente.js";
import fs from "fs";
import fsc from 'fs/promises';
import path, { join } from "path";

import OpenAI from "openai";
import Ticket from "../../models/Ticket.js";
import Contact from "../../models/Contact.js";
import Message from "../../models/Message.js";
import TicketTraking from "../../models/TicketTraking.js";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService.js";
import Whatsapp from "../../models/Whatsapp.js";
import Tag from "../../models/Tag.js";
import UpdateTicketService from "../TicketServices/UpdateTicketService.js";
import { isCapabilityAllowed, AICapability } from "../../helpers/AICapabilitiesValidator.js";

// 🆕 SERVICIO CENTRALIZADO DE IA
import {
  chatCompletion,
  createEmbedding,
  transcribeAudio
} from "../AIClientService";

// 🚀 CACHÉ: Importar servicio de caché para optimización
import {
  getCachedQueuePromptAI,
  getCachedPromptQueues,
  getCachedPromptIdByApiKey
} from "./PromptCacheService.js";

// 🆕 MEJORAS: Importar nuevos servicios
import { ConversationAnalyzer, ImprovedChunkSearch } from "./ImprovedContextRetrieval.js";
import ConversationMemoryService from "./ConversationMemoryService.js";

// 🆕 Importar funciones de clasificación y seguimiento
import {
  enqueueStageClassifierJob,
  removeFollowupJobByTicketId
} from "../../workers/stageClassifier.worker.js";

// 📊 Tracking de tokens ahora integrado en AIClientService

// __dirname is already available in CommonJS


type Session = WASocket & {
  id?: number;
};

interface ImessageUpsert {
  messages: proto.IWebMessageInfo[];
  type: MessageUpsertType;
}

interface IMe {
  name: string;
  id: string;
}

interface SessionOpenAi extends OpenAI {
  id?: number;
  lastUsed?: number;
}
const sessionsOpenAi: SessionOpenAi[] = [];
// 🧹 Limpieza automática de sesiones OpenAI cada 10 minutos
setInterval(() => {
  const unaHora = 1000 * 60 * 60;
  const ahora = Date.now();
  const antes = sessionsOpenAi.length;

  for (let i = sessionsOpenAi.length - 1; i >= 0; i--) {
    const sesion = sessionsOpenAi[i];
    if (!sesion.lastUsed || ahora - sesion.lastUsed > unaHora) {
      sessionsOpenAi.splice(i, 1);
    }
  }

  const despues = sessionsOpenAi.length;
  if (antes !== despues) {
    // // console.log(`🧹 Limpieza OpenAI: eliminadas ${antes - despues} sesiones inactivas`);
  }
}, 1000 * 60 * 10); // cada 10 minutos

interface IOpenAi {
  id?: number;
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
  fileNameIA?: string;
  queues?: Array<{ id: number; name: string; promptAI?: string }>;
}

// 🎯 Interface para la respuesta de clasificación de queue
interface QueueClassificationResult {
  shouldAssignQueue: boolean;
  queueId: number | null;
  queueName: string | null;
  confidence: number;
  reason: string;
}

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

    // Extraer JSON de la respuesta
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

const estimateTokens = (text: string): number => {
  if (!text) return 0;
  return Math.ceil(text.trim().split(/\s+/).length * 1.3); // estimación básica: 1.3 tokens por palabra
}

const deleteFileSync = (path: string): void => {
  try {
    fs.unlinkSync(path);
  } catch (error) {
    console.error("Erro ao deletar o arquivo:", error);
  }
};

const sanitizeName = (name: string): string => {
  let sanitized = name.split(" ")[0];
  sanitized = sanitized.replace(/[^a-zA-Z0-9]/g, "");
  return sanitized.substring(0, 60);
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
    console.error(`❌ Error en getSafeCompletion:`, err);
    throw err;
  }
}

export const handleOpenAi = async (
  openAiSettings: IOpenAi,
  msg: proto.IWebMessageInfo,
  wbot: Session,
  ticket: Ticket,
  contact: Contact,
  mediaSent: Message | undefined,
  ticketTraking: TicketTraking
): Promise<void> => {
  console.log("🚀 [IA] Inicio handleOpenAi:", {
    ticketId: ticket.id,
    contactName: contact.name,
    queueId: ticket.queueId || "sin asignar",
    promptName: openAiSettings?.name
  });

  // REGRA PARA DESABILITAR O BOT PARA ALGUM CONTATO
  if (contact.disableBot) {
    // console.log("⛔ [IA-DEBUG] Bot deshabilitado para contacto:", contact.id);
    return;
  }

  const bodyMessage = getBodyMessage(msg);
  if (!bodyMessage) {
    // console.log("⛔ [IA-DEBUG] No hay bodyMessage, saliendo");
    return;
  }

  if (!openAiSettings) {
    // console.log("⛔ [IA-DEBUG] No hay openAiSettings, saliendo");
    return;
  }

  // console.log("✅ [IA-DEBUG] Validaciones pasadas, continuando con IA:", {
  //   bodyMessage: bodyMessage.substring(0, 100),
  //   hasApiKey: !!openAiSettings.apiKey
  // });

  if (msg.messageStubType) return;

  const publicFolder: string = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "public",
    `company${ticket.companyId}`
  );

  let openai: OpenAI | any;
  const openAiIndex = sessionsOpenAi.findIndex(s => s.id === ticket.id);


  // if (openAiIndex === -1) {
  //   openai = new OpenAI({
  //     apiKey: openAiSettings.apiKey

  //   });
  //   openai.id = ticket.id;
  //   sessionsOpenAi.push(openai);
  // } else {
  //   openai = sessionsOpenAi[openAiIndex];
  // }

  const now = Date.now();

  if (openAiIndex === -1) {
    openai = new OpenAI({ apiKey: openAiSettings.apiKey });
    openai.id = ticket.id;
    openai.lastUsed = now;
    sessionsOpenAi.push(openai);
  } else {
    openai = sessionsOpenAi[openAiIndex];
    openai.lastUsed = now;
  }

  // Validar que fileNameIA existe antes de usarlo
  const fileNameIA = openAiSettings.fileNameIA || "";
  const nombreBaseArchivo = fileNameIA
    ? path.basename(fileNameIA, path.extname(fileNameIA))
    : "default"; // sin extensión

  const embeddingPath = path.resolve(
    __dirname,
    `../../../public/company${ticket.companyId}/ia/Embeddings/${nombreBaseArchivo}.json`
  );
  
  // ==================== Helpers de vectores ====================
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
    return s; // como están normalizados, dot == coseno
  }
  
  // ==================== Keywords simples para la consulta ====================
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
  
  // 🔍 Función principal para buscar contexto
  const buscarContextoDesdeTxt = async (
    consulta: string,
    opciones?: {
      maxChunks?: number;
      minSimilitud?: number; // umbral de coseno (-1..1) para el fallback semántico
      maxTotalChars?: number;
    }
  ): Promise<string> => {
    const {
      maxChunks = 3,
      minSimilitud = 0.55, // umbral semántico razonable
      maxTotalChars = 1500
    } = opciones || {};
  
    // 1) Cargar embeddings desde disco
    const contenidoEmbeddings = await fsc.readFile(embeddingPath, "utf-8");

    type Stored = {
      chunk: string;
      embedding?: number[];        // v1
      embedding_unit?: number[];   // v2 (normalizado)
      topic?: string;
      keywords?: string[];
    };
    const embeddingsCargados: Stored[] = JSON.parse(contenidoEmbeddings);
  
    // 2) Preparar entradas normalizadas (preferir embedding_unit)
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
          // keywords guardadas por el generador (si existen), ya normalizadas:
          keywords: Array.isArray(it.keywords)
            ? it.keywords.map(k =>
                k
                  .toLowerCase()
                  .normalize("NFD")
                  .replace(/\p{Diacritic}/gu, "")
              )
            : []
        };
      })
      .filter(Boolean) as { chunk: string; vec: Float32Array; keywords: string[] }[];
  
    if (entries.length === 0) return "";
  
    // 3) Embedding de la consulta con el MISMO modelo
    // 🆕 MIGRADO: Usar createEmbedding de AIClientService (tracking automático)
    const embResp = await createEmbedding({
      text: consulta || " ",
      companyId: ticket.companyId
    });

    const qVec = toF32Normalized(embResp.embedding as unknown as number[]);
  
    // 4) Keywords de la consulta
    const qKeywords = extractQueryKeywords(consulta);
  
    // 5) Rank híbrido: prioriza keyword hits y combina con semántica
    const alpha = 0.4; // 40% keywords, 60% semántica
    const ranked = entries
      .map(e => {
        const k = keywordScore(e.keywords, qKeywords); // 0..N
        const s = dotUnit(qVec, e.vec);               // -1..1
        const s01 = (s + 1) / 2;                      // 0..1
        // Si hay match de keywords, damos 1 como señal (simple) para la parte de keywords
        const h = alpha * (k > 0 ? 1 : 0) + (1 - alpha) * s01;
        return { chunk: e.chunk, k, s, h };
      })
      // prioriza más hits de keywords; a igualdad, mayor híbrido
      .sort((a, b) => (b.k - a.k) || (b.h - a.h));
  
    // 6) Filtrado y recorte (si no hay keywords, exige semántica >= minSimilitud)
    const top = ranked
      .filter(r => r.k > 0 || r.s >= minSimilitud)
      .slice(0, maxChunks);
  
    // 7) Armar contexto limitado por caracteres
    const contexto = top.map(c => c.chunk).join("\n").slice(0, maxTotalChars);
    return contexto;
  };
  
  // 🗂 Historial de mensajes (para ambos flujos: texto y audio)
  const messages = await Message.findAll({
    where: { ticketId: ticket.id },
    order: [["createdAt", "ASC"]],
    limit: openAiSettings.maxMessages
  });

  // 🆕 MEJORA 1: Analizar conversación para extraer contexto estructurado
 // console.log("📊 Analizando conversación...");
  const conversationContext = ConversationAnalyzer.analyzeConversation(messages);
 // console.log(`  ✓ Consulta principal: "${conversationContext.mainQuery.substring(0, 60)}..."`);
  // // console.log(`  ✓ Preguntas del usuario: ${conversationContext.userQuestions.length}`);
  // // console.log(`  ✓ Respuestas del bot: ${conversationContext.botResponses.length}`);

  // 🆕 MEJORA 2: Búsqueda mejorada con consulta sintetizada (NO todo el historial)
  let contexto = "";

  // Solo buscar embeddings si hay un archivo configurado
  if (fileNameIA && fileNameIA.trim() !== "") {
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

      // // console.log(`🔍 Chunks encontrados: ${searchResults.length}`);
      searchResults.forEach((r, i) => {
        // // console.log(`  ${i + 1}. [${r.matchType}] Score: ${r.score.toFixed(3)} ${r.topic ? `- ${r.topic}` : ''}`);
      });

      contexto = ImprovedChunkSearch.formatContextForPrompt(searchResults);
    } catch (error: any) {
      console.warn("⚠️ Error en búsqueda mejorada, usando fallback:", error.message);
      // Fallback al método antiguo si hay error
      const consultaEmbeddings = messages.map(m => m.body || "").join("\n");
      contexto = await buscarContextoDesdeTxt(consultaEmbeddings, {
        maxChunks: 3,
        minSimilitud: 0.55,
        maxTotalChars: 1500
      });
    }
  } else {
    // console.log("ℹ️ No hay archivo de embeddings configurado, continuando sin contexto adicional");
  }
  


  //// // console.log("🧠 CONTEXTO ENVIADO A LA IA:\n", contexto);

  // 🆕 MEJORA 3: Generar prompt con memoria de conversación
  console.log("💾 [MEMORY] Generando prompt contextual con memoria...");
  const previousResponsesSummary = ConversationAnalyzer.getPreviousResponsesSummary(messages);
  const enhancedPrompt = await ConversationMemoryService.generateContextualPrompt(
    ticket.id,
    openAiSettings.prompt
  );
  console.log("💾 [MEMORY] Prompt contextual generado. Incluye memoria:", enhancedPrompt.includes("PREGUNTAS YA REALIZADAS"));

  // 🎯 NUEVO: Obtener queues disponibles para este prompt (departamentos)
  // 🚀 OPTIMIZADO: Usando caché Redis para evitar queries repetitivas
  let availableQueues: Array<{ id: number; name: string; promptAI: string | null }> = [];
  let queueContextPrompt = "";
  let currentQueuePromptAI = "";

  try {
    // 🚀 CACHÉ: Obtener el promptId desde caché (evita query a DB)
    console.log("🔍 [CACHE] Buscando promptId por apiKey...");
    const promptId = await getCachedPromptIdByApiKey(openAiSettings.apiKey, ticket.companyId);
    console.log("🔍 [CACHE] PromptId encontrado:", promptId || "ninguno");

    if (promptId) {
      // 🚀 CACHÉ: Obtener queues desde caché (evita query a DB)
      console.log("🔍 [CACHE] Buscando queues para promptId:", promptId);
      availableQueues = await getCachedPromptQueues(promptId, ticket.companyId);
      console.log("🔍 [CACHE] Queues encontradas:", availableQueues.length, availableQueues.map(q => q.name));

      // Si hay queues disponibles, agregar información al prompt
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

    // 🔄 NUEVO: Si el ticket ya tiene una queue asignada, obtener su promptAI específico
    // 🚀 CACHÉ: Usando caché Redis para evitar query a DB
    if (ticket.queueId) {
      console.log("🔍 [CACHE] Ticket tiene queueId:", ticket.queueId, "- Buscando promptAI...");
      const queuePrompt = await getCachedQueuePromptAI(ticket.queueId, ticket.companyId);
      console.log("🔍 [CACHE] PromptAI de queue encontrado:", queuePrompt ? `${queuePrompt.substring(0, 50)}...` : "ninguno");
      if (queuePrompt) {
        currentQueuePromptAI = `\n\n🎯 CONTEXTO DEL DEPARTAMENTO ACTUAL:
${queuePrompt}

Usa esta información específica del departamento para responder de manera más precisa.
`;
      }
    } else {
      console.log("🔍 [CACHE] Ticket sin queueId asignada");
    }
  } catch (queueError) {
    console.warn("⚠️ Error obteniendo información de queues:", queueError);
  }

  const promptSystem = `En las respuestas utiliza siempre el nombre ${sanitizeName(
    contact.name || "Amigo(a)"
  )} para identificar al cliente.
Usa ${openAiSettings.maxTokens} tokens máximo en tu respuesta.
Cuando la respuesta requiera transferir al área de atención al cliente, inicia tu respuesta con 'Permíteme transferirte con uno de nuestros asesores para ayudarte mejor'.

${enhancedPrompt}
${currentQueuePromptAI}
${queueContextPrompt}
${previousResponsesSummary}
`;

  let messagesOpenAi = [];

  if (msg.message?.conversation || msg.message?.extendedTextMessage?.text) {
    // // // console.log(135, "OpenAiService");
  

    const maxTotalTokens = 8000;
    let tokenCount = estimateTokens(promptSystem);
    messagesOpenAi = [];

    // 🆕 MEJORA 4: System prompt va PRIMERO
    messagesOpenAi.push({ role: "system", content: promptSystem });

    // 🆕 MEJORA 5: Contexto de embeddings va SEGUNDO (no al final)
    const contextoTokens = estimateTokens(contexto);
    if (contexto && tokenCount + contextoTokens <= maxTotalTokens) {
      messagesOpenAi.push({ role: "system", content: contexto });
      tokenCount += contextoTokens;
      // // console.log("✅ Contexto de embeddings agregado");
    }

    let mensajesAgregados = 0;

    // Recorremos desde el final (más recientes hacia atrás)
    for (let i = messages.length - 1; i >= 0; i--) {
      if (mensajesAgregados >= openAiSettings.maxMessages) break;

      const message = messages[i];
      if (
        message.mediaType !== "conversation" &&
        message.mediaType !== "extendedTextMessage"
      ) continue;

      const content = message.body;
      const tokens = estimateTokens(content);
      if (tokenCount + tokens > maxTotalTokens) break;

      const role = message.fromMe ? "assistant" : "user";
      messagesOpenAi.unshift({ role, content });
      tokenCount += tokens;
      mensajesAgregados++;
    }

const bodyTokens = estimateTokens(bodyMessage);
if (tokenCount + bodyTokens <= maxTotalTokens) {
  messagesOpenAi.push({ role: "user", content: bodyMessage });
} else {
  console.warn("⚠️ El mensaje actual excede el límite de tokens, se omitirá.");
}
//// // console.log('messagesOpenAi',messagesOpenAi)
    //// // console.log(156, "OpenAiService");

    // const chat = await openai.chat.completions.create({
    //   //  model: "gpt-3.5-turbo-1106",
    //   model: "gpt-4-turbo",
    //   messages: messagesOpenAi,
    //   max_tokens: openAiSettings.maxTokens,
    //   temperature: openAiSettings.temperature
    // });

    // console.log("🤖 [IA-DEBUG] Llamando a OpenAI API...", {
    //   ticketId: ticket.id,
    //   messagesCount: messagesOpenAi.length,
    //   maxTokens: openAiSettings.maxTokens,
    //   temperature: openAiSettings.temperature
    // });

    // 🆕 MIGRADO: Ya no pasa openai como parámetro
    const chat = await getSafeCompletion({
      messages: messagesOpenAi,
      max_tokens: Number(openAiSettings.maxTokens) || 500,
      temperature: parseFloat(String(openAiSettings.temperature)) || 0.7
    }, ticket.companyId, 'chat');


    let response = chat.choices[0].message?.content;

    // console.log("✅ [IA] Respuesta de OpenAI recibida:", {
    //   ticketId: ticket.id,
    //   responseLength: response?.length || 0,
    //   preview: response?.substring(0, 100) + "..."
    // });

    // 🆕 MEJORA 6: Actualizar memoria de conversación
    console.log("💾 [MEMORY] Actualizando memoria de conversación...");
    try {
      const currentState = await ConversationMemoryService.getConversationState(ticket.id);
      console.log("💾 [MEMORY] Estado actual:", {
        questionsAsked: currentState?.questionsAsked?.length || 0,
        answersReceived: currentState?.answersReceived?.length || 0,
        hasLastResponse: !!currentState?.lastResponse
      });

      // Preparar actualización de questionsAsked (solo si hay pregunta)
      const updateData: any = {
        lastResponse: response || ""
      };

      // Solo actualizar questionsAsked si la respuesta tiene pregunta
      if (response?.includes("?")) {
        const currentQuestions = Array.isArray(currentState?.questionsAsked) ? currentState.questionsAsked : [];
        updateData.questionsAsked = [...currentQuestions, response];
        console.log("💾 [MEMORY] Pregunta detectada, agregando a memoria. Total preguntas:", updateData.questionsAsked.length);
      }
      // Si NO tiene pregunta, NO enviamos questionsAsked (para no sobrescribir con undefined)

      await ConversationMemoryService.updateState(ticket.id, updateData);
      console.log("✅ [MEMORY] Memoria actualizada exitosamente");
    } catch (memoryError: any) {
      console.error("❌ [MEMORY] Error al actualizar memoria:", memoryError?.message);
      // No lanzar error, continuar con el flujo
    }

    // 🎯 NUEVO: Clasificación y asignación automática de queue (departamento)
    // Solo si el ticket NO tiene queue asignada y hay queues disponibles
    if (!ticket.queueId && availableQueues.length > 0) {
      try {
        // Preparar historial de conversación para clasificación
        const conversationForClassification = messages
          .slice(-6) // Últimos 6 mensajes
          .map(m => `${m.fromMe ? "Bot" : "Cliente"}: ${m.body}`)
          .join("\n") + `\nCliente: ${bodyMessage}`;

        // 🆕 MIGRADO: Ya no pasa openai como parámetro
        const queueClassification = await classifyAndAssignQueue(
          conversationForClassification,
          availableQueues,
          ticket.companyId
        );

        // Solo asignar si la confianza es alta (> 0.7)
        if (queueClassification.shouldAssignQueue &&
            queueClassification.queueId &&
            queueClassification.confidence > 0.7) {

          console.log(`🎯 [QUEUE-AI] Asignando ticket ${ticket.id} a queue ${queueClassification.queueName} (ID: ${queueClassification.queueId}) - Confianza: ${queueClassification.confidence}`);

          // Actualizar el ticket con la nueva queue
          await UpdateTicketService({
            ticketData: {
              queueId: queueClassification.queueId
            },
            ticketId: ticket.id,
            companyId: ticket.companyId
          });

          // Recargar el ticket para tener los datos actualizados
          await ticket.reload();

          console.log(`✅ [QUEUE-AI] Ticket ${ticket.id} asignado exitosamente a ${queueClassification.queueName}. Razón: ${queueClassification.reason}`);
        }
      } catch (queueAssignError) {
        console.error("❌ Error en clasificación/asignación de queue:", queueAssignError);
        // No interrumpir el flujo si falla la asignación
      }
    }

    if (response?.includes("Permíteme transferirte con uno de nuestros asesores para ayudarte mejor")) {
      // // // console.log(166, "OpenAiService");
      await transferQueue(openAiSettings.queueId, ticket, contact);
      // response = response
      //   .replace("Permíteme transferirte con uno de nuestros asesores para ayudarte mejor", "")
      //   .trim();
    }

    if (openAiSettings.voice === "texto") {
      console.log("📤 [IA] Enviando respuesta como texto. Longitud:", response?.length || 0);
      const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
        text: `\u200e ${response!}`
      });
      await verifyMessage(sentMessage!, ticket, contact);
      console.log("✅ [IA] Mensaje enviado exitosamente");

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
        // console.log("🔄 [IA-DEBUG] Clasificación encolada después de respuesta de IA");
      } catch (classifyError) {
        console.error("❌ Error al encolar clasificación:", classifyError);
      }
    } else {
      // console.log("🎤 [IA-DEBUG] Convirtiendo respuesta a audio:", {
      //   ticketId: ticket.id,
      //   voice: openAiSettings.voice
      // });
      const fileNameWithOutExtension = `${ticket.id}_${Date.now()}`;

      // Verificar si hay claves de Azure Speech antes de intentar convertir
      if (!openAiSettings.voiceKey || !openAiSettings.voiceRegion) {
        // Fallback a texto si no hay Azure Speech configurado
        console.log("ℹ️ Azure Speech no configurado, enviando respuesta como texto");
        const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
          text: `\u200e ${response!}`
        });
        await verifyMessage(sentMessage!, ticket, contact);

        // Clasificación y seguimiento
        try {
          await removeFollowupJobByTicketId(ticket.id);
          await enqueueStageClassifierJob({
            texto: response || "",
            ticketId: ticket.id,
            companyId: ticket.companyId,
            apiKey: openAiSettings.apiKey,
            contactName: contact.name || ""
          });
        } catch (classifyError) {
          console.error("❌ Error al encolar clasificación:", classifyError);
        }
      } else {
        convertTextToSpeechAndSaveToFile(
          keepOnlySpecifiedChars(response!),
          `${publicFolder}/${fileNameWithOutExtension}`,
          openAiSettings.voiceKey,
          openAiSettings.voiceRegion,
          openAiSettings.voice,
          "mp3"
        ).then(async () => {
          try {
            //   // // console.log(194, "OpenAiService");
            const sendMessage = await wbot.sendMessage(msg.key.remoteJid!, {
              audio: { url: `${publicFolder}/${fileNameWithOutExtension}.mp3` },
              mimetype: "audio/mpeg",
              ptt: true
            });
            await verifyMediaMessage(
              sendMessage!,
              ticket,
              contact,
              ticketTraking,
              false,
              false,
              wbot
            );
            // console.log("✅ [IA-DEBUG] Mensaje de audio enviado exitosamente");
            deleteFileSync(`${publicFolder}/${fileNameWithOutExtension}.mp3`);
            deleteFileSync(`${publicFolder}/${fileNameWithOutExtension}.wav`);

            // 🆕 CLASIFICACIÓN Y SEGUIMIENTO: Cuando la IA responde con audio, clasificar y encolar seguimiento
            try {
              await removeFollowupJobByTicketId(ticket.id);
              await enqueueStageClassifierJob({
                texto: response || "",
                ticketId: ticket.id,
                companyId: ticket.companyId,
                apiKey: openAiSettings.apiKey,
                contactName: contact.name || ""
              });
            } catch (classifyError) {
              console.error("❌ Error al encolar clasificación (audio):", classifyError);
            }
          } catch (error) {
            // console.error("❌ [IA-DEBUG] Error al enviar audio:", error);
          }
        });
      }
    }
  } else if (msg.message?.audioMessage) {
    // 🔒 VALIDAR CAPACIDAD DE SPEECH-TO-TEXT
    const canTranscribe = await isCapabilityAllowed(
      openAiSettings.id,
      AICapability.SPEECH_TO_TEXT
    );

    if (!canTranscribe) {
      console.info(
        `[OpenAI] Speech-to-text deshabilitado para prompt ${openAiSettings.id}. ` +
        `Ignorando audio.`
      );
      return; // Ignorar silenciosamente
    }

    // ✅ Proceder con transcripción
    // 🆕 MIGRADO: Usar transcribeAudio de AIClientService
    const mediaUrl = mediaSent!.mediaUrl!.split("/").pop();
    const audioBuffer = fs.readFileSync(`${publicFolder}/${mediaUrl}`);

    const transcription = await transcribeAudio({
      audioBuffer,
      language: 'es',
      companyId: ticket.companyId
    });


    messagesOpenAi = [];
    messagesOpenAi.push({ role: "system", content: promptSystem });
    for (
      let i = 0;
      i < Math.min(openAiSettings.maxMessages, messages.length);
      i++
    ) {
      const message = messages[i];
      if (
        message.mediaType === "conversation" ||
        message.mediaType === "extendedTextMessage"
      ) {
        //// // console.log(238, "OpenAiService");

        if (message.fromMe) {
          messagesOpenAi.push({ role: "assistant", content: message.body });
        } else {
          messagesOpenAi.push({ role: "user", content: message.body });
        }
      }
    }
    messagesOpenAi.push({ role: "user", content: transcription.text });
    // const chat = await openai.chat.completions.create({
    //   // model: "gpt-3.5-turbo-1106",
    //   model: "gpt-4-turbo",
    //   messages: messagesOpenAi,
    //   max_tokens: openAiSettings.maxTokens,
    //   temperature: openAiSettings.temperature
    // });
    // 🆕 MIGRADO: Ya no pasa openai como parámetro
    const chat = await getSafeCompletion({
      messages: messagesOpenAi,
      max_tokens: Number(openAiSettings.maxTokens) || 500,
      temperature: parseFloat(String(openAiSettings.temperature)) || 0.7
    }, ticket.companyId, 'chat');

    let response = chat.choices[0].message?.content;

    if (response?.includes("Permíteme transferirte con uno de nuestros asesores para ayudarte mejor")) {
      await transferQueue(openAiSettings.queueId, ticket, contact);
      response = response
        .replace("Permíteme transferirte con uno de nuestros asesores para ayudarte mejor", "")
        .trim();
    }
    if (openAiSettings.voice === "texto") {
      const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
        text: `\u200e ${response!}`
      });
      await verifyMessage(sentMessage!, ticket, contact);

      // 🆕 CLASIFICACIÓN Y SEGUIMIENTO: Cuando la IA responde con texto (audio transcrito)
      try {
        await removeFollowupJobByTicketId(ticket.id);
        await enqueueStageClassifierJob({
          texto: response || "",
          ticketId: ticket.id,
          companyId: ticket.companyId,
          apiKey: openAiSettings.apiKey,
          contactName: contact.name || ""
        });
      } catch (classifyError) {
        console.error("❌ Error al encolar clasificación (audio transcrito - texto):", classifyError);
      }
    } else {
      const fileNameWithOutExtension = `${ticket.id}_${Date.now()}`;
      convertTextToSpeechAndSaveToFile(
        keepOnlySpecifiedChars(response!),
        `${publicFolder}/${fileNameWithOutExtension}`,
        openAiSettings.voiceKey,
        openAiSettings.voiceRegion,
        openAiSettings.voice,
        "mp3"
      ).then(async () => {
        try {
          const sendMessage = await wbot.sendMessage(msg.key.remoteJid!, {
            audio: { url: `${publicFolder}/${fileNameWithOutExtension}.mp3` },
            mimetype: "audio/mpeg",
            ptt: true
          });
          await verifyMediaMessage(
            sendMessage!,
            ticket,
            contact,
            ticketTraking,
            false,
            false,
            wbot
          );
          deleteFileSync(`${publicFolder}/${fileNameWithOutExtension}.mp3`);
          deleteFileSync(`${publicFolder}/${fileNameWithOutExtension}.wav`);

          // 🆕 CLASIFICACIÓN Y SEGUIMIENTO: Cuando la IA responde con audio (audio transcrito)
          try {
            await removeFollowupJobByTicketId(ticket.id);
            await enqueueStageClassifierJob({
              texto: response || "",
              ticketId: ticket.id,
              companyId: ticket.companyId,
              apiKey: openAiSettings.apiKey,
              contactName: contact.name || ""
            });
          } catch (classifyError) {
            console.error("❌ Error al encolar clasificación (audio transcrito - audio):", classifyError);
          }
        } catch (error) {
          // // console.log(`Erro para responder com audio: ${error}`);
        }
      });
    }
  }
  messagesOpenAi = [];
};
