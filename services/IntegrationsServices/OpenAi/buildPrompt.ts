import Message from "../../../models/Message";
import Ticket from "../../../models/Ticket";
import Contact from "../../../models/Contact";
import { IOpenAi } from "./types";
import { estimateTokens, sanitizeName } from "./helpers";
import { ConversationAnalyzer } from "../ImprovedContextRetrieval";
import ConversationMemoryService from "../ConversationMemoryService";
import {
  getCachedQueuePromptAI,
  getCachedPromptQueues,
  getCachedPromptIdByApiKey
} from "../PromptCacheService";

// Resultado de la construccion del prompt
export interface BuildPromptResult {
  promptSystem: string;
  messagesOpenAi: Array<{ role: string; content: string }>;
  availableQueues: Array<{ id: number; name: string; promptAI: string | null }>;
}

// Construir el prompt del sistema con toda la informacion de contexto
export const buildPrompt = async (
  openAiSettings: IOpenAi,
  ticket: Ticket,
  contact: Contact,
  messages: Message[],
  contexto: string,
  bodyMessage: string
): Promise<BuildPromptResult> => {
  // MEJORA 3: Generar prompt con memoria de conversacion
  console.log("💾 [MEMORY] Generando prompt contextual con memoria...");
  const previousResponsesSummary = ConversationAnalyzer.getPreviousResponsesSummary(messages);
  const enhancedPrompt = await ConversationMemoryService.generateContextualPrompt(
    ticket.id,
    openAiSettings.prompt
  );
  console.log("💾 [MEMORY] Prompt contextual generado. Incluye memoria:", enhancedPrompt.includes("PREGUNTAS YA REALIZADAS"));

  // NUEVO: Obtener queues disponibles para este prompt (departamentos)
  // OPTIMIZADO: Usando cache Redis para evitar queries repetitivas
  let availableQueues: Array<{ id: number; name: string; promptAI: string | null }> = [];
  let queueContextPrompt = "";
  let currentQueuePromptAI = "";

  try {
    // CACHE: Obtener el promptId desde cache (evita query a DB)
    console.log("🔍 [CACHE] Buscando promptId por apiKey...");
    const promptId = await getCachedPromptIdByApiKey(openAiSettings.apiKey, ticket.companyId);
    console.log("🔍 [CACHE] PromptId encontrado:", promptId || "ninguno");

    if (promptId) {
      // CACHE: Obtener queues desde cache (evita query a DB)
      console.log("🔍 [CACHE] Buscando queues para promptId:", promptId);
      availableQueues = await getCachedPromptQueues(promptId, ticket.companyId);
      console.log("🔍 [CACHE] Queues encontradas:", availableQueues.length, availableQueues.map(q => q.name));

      // Si hay queues disponibles, agregar informacion al prompt
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

    // NUEVO: Si el ticket ya tiene una queue asignada, obtener su promptAI especifico
    // CACHE: Usando cache Redis para evitar query a DB
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
    console.warn("Error obteniendo información de queues:", queueError);
  }

  const promptSystem = `Eres un agente de atencion al cliente via WhatsApp de la empresa.
Respondes como un humano real: breve, directo, amigable.
Usa el nombre ${sanitizeName(contact.name || "Amigo(a)")} naturalmente — nunca digas "Estimado usuario".
Usa ${openAiSettings.maxTokens} tokens maximo en tu respuesta.

## REGLA CRITICA — SOLO DATOS DE LA BASE DE CONOCIMIENTOS
Antes de incluir CUALQUIER dato en tu respuesta (precio, horario, caracteristica, plan, politica), verifica mentalmente:
- ¿Este dato aparece TEXTUALMENTE en el CONTEXTO o la BASE DE CONOCIMIENTOS de abajo?
- Si SI → usalo exactamente como aparece
- Si NO → NO lo digas. Responde: "Esa informacion la maneja nuestro equipo. Te conecto con un asesor?"

VIOLACIONES PROHIBIDAS (ejemplos de lo que NUNCA debes hacer):
- Inventar un precio: decir "$89.99" si ese precio NO aparece en el contexto
- Inventar un horario: decir "9 a 5" si el contexto dice "8:30 a 17:00"
- Inventar un plan o producto: decir "Plan Premium" si no existe en el contexto
- Inventar una politica: decir "no aceptamos pago unico" si el contexto no lo menciona

Es MEJOR decir "no tengo esa info, te conecto con un asesor" que inventar un dato incorrecto.

## REGLAS DE RESPUESTA
1. Maximo 3-4 oraciones — WhatsApp no es email
2. Una pregunta a la vez — nunca multiples preguntas en un mensaje
3. NO repitas informacion que ya dijiste en mensajes anteriores
4. Refleja el tono del cliente — informal si es informal, formal si es formal
5. Cierra con accion concreta, no con "Quedo a sus ordenes"

## IMAGENES Y ARCHIVOS
- Tu SOLO generas texto. Las imagenes/fichas las envia el sistema automaticamente.
- NUNCA digas "te envio", "aqui tienes la ficha", "te mando la info". Solo responde con texto.

## CUANDO ESCALAR A UN HUMANO
Cuando la respuesta requiera transferir al area de atencion al cliente, inicia tu respuesta con 'Permiteme transferirte con uno de nuestros asesores para ayudarte mejor'.
Sugiere escalar cuando:
- No encuentras la informacion en el contexto proporcionado
- El cliente pide agendar cita, visita o instalacion y no tienes disponibilidad
- El cliente esta frustrado o repite la misma pregunta

## CAMBIO DE TEMA
Si el cliente cambia de tema (ej: de mascotas a motos):
- Responde sobre el NUEVO tema, no el anterior
- No mezcles informacion de temas diferentes

## INSTRUCCIONES ESPECIFICAS DE LA EMPRESA:
${enhancedPrompt}
${currentQueuePromptAI}
${queueContextPrompt}
${previousResponsesSummary}
`;

  // Construir array de mensajes para OpenAI
  let messagesOpenAi: Array<{ role: string; content: string }> = [];

  const maxTotalTokens = 8000;
  let tokenCount = estimateTokens(promptSystem);
  messagesOpenAi = [];

  // MEJORA 4: System prompt va PRIMERO
  messagesOpenAi.push({ role: "system", content: promptSystem });

  // MEJORA 5: Contexto de embeddings va SEGUNDO (no al final)
  const contextoTokens = estimateTokens(contexto);
  if (contexto && tokenCount + contextoTokens <= maxTotalTokens) {
    messagesOpenAi.push({ role: "system", content: contexto });
    tokenCount += contextoTokens;
  }

  let mensajesAgregados = 0;

  // Recorremos desde el final (mas recientes hacia atras)
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
    console.warn("El mensaje actual excede el limite de tokens, se omitira.");
  }

  return { promptSystem, messagesOpenAi, availableQueues };
};

// Construir prompt simplificado para flujo de audio
export const buildAudioPrompt = (
  openAiSettings: IOpenAi,
  messages: Message[],
  promptSystem: string,
  transcriptionText: string
): Array<{ role: string; content: string }> => {
  const messagesOpenAi: Array<{ role: string; content: string }> = [];
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
      if (message.fromMe) {
        messagesOpenAi.push({ role: "assistant", content: message.body });
      } else {
        messagesOpenAi.push({ role: "user", content: message.body });
      }
    }
  }
  messagesOpenAi.push({ role: "user", content: transcriptionText });

  return messagesOpenAi;
};
