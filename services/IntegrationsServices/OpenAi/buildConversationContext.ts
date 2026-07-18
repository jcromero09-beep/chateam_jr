import fsc from "fs/promises";
import OpenAI from "openai";
import Message from "../../../models/Message";
import { createEmbedding } from "../../AIClientService";
import { ConversationAnalyzer, ImprovedChunkSearch } from "../ImprovedContextRetrieval";

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
  return s; // como estan normalizados, dot == coseno
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

// Funcion principal para buscar contexto desde archivo TXT/JSON de embeddings
export const buscarContextoDesdeTxt = async (
  consulta: string,
  embeddingPath: string,
  companyId: number,
  opciones?: {
    maxChunks?: number;
    minSimilitud?: number; // umbral de coseno (-1..1) para el fallback semantico
    maxTotalChars?: number;
  }
): Promise<string> => {
  const {
    maxChunks = 3,
    minSimilitud = 0.55, // umbral semantico razonable
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
  // MIGRADO: Usar createEmbedding de AIClientService (tracking automatico)
  const embResp = await createEmbedding({
    text: consulta || " ",
    companyId
  });

  const qVec = toF32Normalized(embResp.embedding as unknown as number[]);

  // 4) Keywords de la consulta
  const qKeywords = extractQueryKeywords(consulta);

  // 5) Rank hibrido: prioriza keyword hits y combina con semantica
  const alpha = 0.4; // 40% keywords, 60% semantica
  const ranked = entries
    .map(e => {
      const k = keywordScore(e.keywords, qKeywords); // 0..N
      const s = dotUnit(qVec, e.vec);               // -1..1
      const s01 = (s + 1) / 2;                      // 0..1
      // Si hay match de keywords, damos 1 como senal (simple) para la parte de keywords
      const h = alpha * (k > 0 ? 1 : 0) + (1 - alpha) * s01;
      return { chunk: e.chunk, k, s, h };
    })
    // prioriza mas hits de keywords; a igualdad, mayor hibrido
    .sort((a, b) => (b.k - a.k) || (b.h - a.h));

  // 6) Filtrado y recorte (si no hay keywords, exige semantica >= minSimilitud)
  const top = ranked
    .filter(r => r.k > 0 || r.s >= minSimilitud)
    .slice(0, maxChunks);

  // 7) Armar contexto limitado por caracteres
  const contexto = top.map(c => c.chunk).join("\n").slice(0, maxTotalChars);
  return contexto;
};

// Construir el contexto de conversacion usando embeddings y analisis mejorado
export const buildConversationContext = async (
  messages: Message[],
  embeddingPath: string,
  fileNameIA: string,
  openai: OpenAI | any,
  companyId: number
): Promise<{ contexto: string; conversationContext: ReturnType<typeof ConversationAnalyzer.analyzeConversation> }> => {
  // MEJORA 1: Analizar conversacion para extraer contexto estructurado
  const conversationContext = ConversationAnalyzer.analyzeConversation(messages);

  // MEJORA 2: Busqueda mejorada con consulta sintetizada (NO todo el historial)
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

      searchResults.forEach((r, i) => {
        // debug logging removed
      });

      contexto = ImprovedChunkSearch.formatContextForPrompt(searchResults);
    } catch (error: any) {
      console.warn("Error en busqueda mejorada, usando fallback:", error.message);
      // Fallback al metodo antiguo si hay error
      const consultaEmbeddings = messages.map(m => m.body || "").join("\n");
      contexto = await buscarContextoDesdeTxt(consultaEmbeddings, embeddingPath, companyId, {
        maxChunks: 3,
        minSimilitud: 0.55,
        maxTotalChars: 1500
      });
    }
  } else {
  }

  return { contexto, conversationContext };
};
