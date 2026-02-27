// services/IntegrationsServices/OpenAiSocialService.ts
// 🆕 MIGRADO: Ahora usa AIClientService para selección automática de proveedor
import { isNil, isNull } from "lodash";
import path from "path";
import fsc from "fs/promises";
import fs from "fs";

import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import TicketTraking from "../../models/TicketTraking";
import { default as sendFacebookMessage } from "../FacebookServices/sendFacebookMessage";
import sendIGMessage from "../FacebookServices/igMessageListener"; // default export
import { transferQueue } from "../WbotServices/wbotMessageListener"; // ya existe y mueve ticket/queue
import chroma from "../../libs/chromadb";

// 🆕 SERVICIO CENTRALIZADO DE IA
import { chatCompletion } from "../AIClientService";

// Si en tu proyecto IOpenAi ya está en OpenAiService.ts, puedes moverla a un archivo .d.ts compartido.
// La dejo aquí por independencia.
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
  // campos opcionales que uses (ej.: embeddings enable/paths)
  useEmbeddings?: boolean;
  embeddingsFilePath?: string; // ej.: "public/embeddings/mi_empresa.json"
}

// Helpers mínimos (los mismos nombres que usas en OpenAiService, sin wbot)
const sanitizeFileName = (input: string): string => {
  const sanitized = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "");
  return sanitized.substring(0, 60);
};

// Carga embeddings de un JSON (igual a tu patrón en OpenAiService)
const buscarEnEmbeddings = async (
  embeddingPath: string,
  consulta: string,
  opciones?: {
    maxChunks?: number;
    minSimilitud?: number;
    maxTotalChars?: number;
  }
): Promise<string> => {
  const { maxChunks = 2, minSimilitud = 0.6, maxTotalChars = 1500 } = opciones || {};
  const contenidoEmbeddings = await fsc.readFile(embeddingPath, "utf-8");
  const embeddingsCargados: { chunk: string; embedding: number[] }[] = JSON.parse(contenidoEmbeddings);

  // (Placeholder) Similaridad coseno simple si no tienes lib en este archivo
  const embedConsulta = (txt: string): number[] => {
    // Si tienes un generador de embeddings en otro lado, llámalo.
    // Aquí dejamos un vector dummy para no romper. Idealmente, reemplaza por tu pipeline real.
    return Array(embeddingsCargados[0]?.embedding?.length || 1536).fill(0);
  };
  const cosSim = (a: number[], b: number[]) => {
    const dot = a.reduce((acc, v, i) => acc + v * (b[i] || 0), 0);
    const magA = Math.sqrt(a.reduce((acc, v) => acc + v * v, 0));
    const magB = Math.sqrt(b.reduce((acc, v) => acc + v * v, 0));
    return magA && magB ? dot / (magA * magB) : 0;
    };
  const vq = embedConsulta(consulta);

  const rank = embeddingsCargados
    .map((e) => ({ chunk: e.chunk, score: cosSim(vq, e.embedding) }))
    .filter((e) => e.score >= minSimilitud)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxChunks);

  let contexto = "";
  for (const r of rank) {
    if ((contexto + "\n" + r.chunk).length > maxTotalChars) break;
    contexto += "\n" + r.chunk;
  }
  return contexto.trim();
};

// Envía el texto por Facebook o Instagram según el canal del ticket
const replyByChannel = async (body: string, ticket: Ticket) => {
  const ch = (ticket.channel || "").toLowerCase();
  if (ch.includes("instagram")) {
    await sendIGMessage({ body, ticket });
  } else {
    // por defecto facebook
    await sendFacebookMessage({ body, ticket });
  }
};

// 🔹 API principal (similar a handleOpenAi, sin wbot ni msg Baileys)
// 🆕 MIGRADO: Ahora usa AIClientService para selección automática de proveedor
export const handleOpenAiSocial = async (
  openAiSettings: IOpenAi,
  ticket: Ticket,
  contact: Contact,
  incomingText: string,
  mediaSent: Message | undefined,
  ticketTraking: TicketTraking
): Promise<void> => {
  try {
    // Regla para deshabilitar bot por contacto
    if (contact.disableBot) return;

    // Construcción de mensajes (histórico)
    const systemPrompt = openAiSettings.prompt || "Eres un asistente útil y conciso.";
    const messagesOpenAi: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
      { role: "user", content: incomingText }
    ];

    // Contexto vía embeddings (si está habilitado)
    if (openAiSettings.useEmbeddings && openAiSettings.embeddingsFilePath) {
      try {
        const embeddingPath = path.resolve(openAiSettings.embeddingsFilePath);
        if (fs.existsSync(embeddingPath)) {
          const contexto = await buscarEnEmbeddings(embeddingPath, incomingText, {
            maxChunks: 3,
            minSimilitud: 0.55,
            maxTotalChars: 1500
          });
          if (contexto) {
            messagesOpenAi.unshift({
              role: "system",
              content:
                "Contexto interno (no lo menciones explícitamente al cliente). Úsalo para mejorar la respuesta:\n" +
                contexto
            });
          }
        }
      } catch (e) {
        console.warn("Embeddings no disponibles o error cargando:", e);
      }
    }

    // 🆕 MIGRADO: Usar chatCompletion de AIClientService
    console.log(`🤖 [SOCIAL-IA] Llamando a IA con AIClientService...`);
    const chatResponse = await chatCompletion({
      messages: messagesOpenAi,
      maxTokens: openAiSettings.maxTokens,
      temperature: openAiSettings.temperature,
      companyId: ticket.companyId,
      module: 'chat'
    });

    let response = chatResponse.content || "";

    // Si tu prompt usa esta regla de transferencia (idéntica a OpenAiService.ts)
    if (response?.includes("Permíteme transferirte con uno de nuestros asesores para ayudarte mejor")) {
      await transferQueue(openAiSettings.queueId, ticket, contact);
    }

    // Limpieza mínima
    response = (response || "").trim();
    if (!response) return;

    // Enviar por canal
    await replyByChannel(response, ticket);

  } catch (error) {
    console.error("Error en handleOpenAiSocial:", error);
  }
};

export default handleOpenAiSocial;
