import fs from "fs/promises";
import fsc from "fs";
import path from "path";
// pdf-parse: Usamos import dinámico para evitar hang al importar
// (pdf-parse ejecuta código de prueba al importarse estáticamente)
let pdfParse: any = null;
async function getPdfParser() {
  if (!pdfParse) {
    const pdfParseModule = await import("pdf-parse");
    pdfParse = (pdfParseModule as any).default || pdfParseModule;
  }
  return pdfParse;
}
import xlsx from "xlsx";

// 🆕 SERVICIO CENTRALIZADO DE IA
import { getClientForCapability } from "../AIClientService";

// 📊 Importar servicio de tracking de tokens
import { trackEmbeddings } from "../TokenTrackingService/TokenTrackingService.js";

// ===================== Utilidades y helpers =====================

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

const STOPWORDS = new Set([
  "el","la","los","las","de","del","y","o","u","en","con","para","por",
  "un","una","unos","unas","al","lo","a","que","se","su","sus","es","son",
  "me","mi","mis","tu","tus","le","les","nos","ya","no","si","sí","como",
  "sobre","esto","esa","ese","aqui","aquí","alli","allí","más","mas","menos",
  "puede","puedo","pueden","puedes","ser","estar","hay","haber","muy"
]);

function normalizeToken(s: string): string {
  return s.toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function extractKeywords(text: string, max = 10): string[] {
  const clean = normalizeToken(text);
  if (!clean) return [];
  const tokens = clean.split(/\s+/).filter(t => t && !STOPWORDS.has(t) && t.length > 2);
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  return [...freq.entries()].sort((a,b) => b[1]-a[1]).slice(0, max).map(([t]) => t);
}

// ===================== Chunking (reutiliza tus funciones) =====================

function dividirTextoEnChunks(texto: string, maxPalabras = 400): string[] {
  const palabras = texto.split(/\s+/);
  const chunks: string[] = [];
  for (let i = 0; i < palabras.length; i += maxPalabras) {
    chunks.push(palabras.slice(i, i + maxPalabras).join(" "));
  }
  return chunks;
}

function dividirPorDelimitadores(texto: string, delimitadores: Array<[string,string]>): string[] {
  const chunks: string[] = [];
  for (const [ini, fin] of delimitadores) {
    const regex = new RegExp(`${ini}[\\s\\S]*?${fin}`, "g");
    let match;
    while ((match = regex.exec(texto)) !== null) {
      const chunk = match[0].replace(ini, "").replace(fin, "").trim();
      if (chunk) chunks.push(chunk);
    }
  }
  return chunks;
}

function chunkFlexible(texto: string, delimitadores: Array<[string,string]>, maxPalabras = 400): string[] {
  const chunksPorDelimitador = dividirPorDelimitadores(texto, delimitadores);
  if (chunksPorDelimitador.length > 0) return chunksPorDelimitador;
  return dividirTextoEnChunks(texto, maxPalabras);
}

// ===================== Extracción de texto (reutiliza tu lógica) =====================

async function extraerTextoDesdeArchivo(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".txt") return await fs.readFile(filePath, "utf-8");

  if (ext === ".pdf") {
    const parser = await getPdfParser();
    const buffer = await fs.readFile(filePath);
    const data = await parser(buffer);
    return data.text;
  }

  if (ext === ".xls" || ext === ".xlsx") {
    const workbook = xlsx.readFile(filePath);
    let texto = "";
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
      (data as any[]).forEach((row: any[]) => {
        texto += row.join(" ") + "\n";
      });
    });
    return texto;
  }

  throw new Error(`❌ Tipo de archivo no soportado para embeddings: ${ext}`);
}

// ===================== Detección de topic/keywords por chunk =====================

type TopicKeywordMap = Record<string, string[]>; // p.ej. { "planes": ["planes","precio","ayuda","informacion"] }

function detectTopic(chunk: string): string | undefined {
  // 1) Línea "TEMA:" / "Tema:" / "TOPIC:"
  const lines = chunk.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const l = lines[i];
    const m1 = /^tema\s*:\s*(.+)$/i.exec(l);
    if (m1?.[1]) return m1[1].trim();
    const m2 = /^topic\s*:\s*(.+)$/i.exec(l);
    if (m2?.[1]) return m2[1].trim();
  }
  // 2) Encabezado Markdown "# Título"
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const l = lines[i];
    const m = /^#{1,3}\s+(.+)$/.exec(l);
    if (m?.[1]) return m[1].trim();
  }
  // 3) Si no hay patrón, intenta primera oración corta como topic
  const firstSentence = chunk.split(/[.!?]\s/)[0]?.trim();
  if (firstSentence && firstSentence.length <= 80) return firstSentence;
  return undefined;
}

function buildKeywords(chunk: string, topic?: string, topicMap?: TopicKeywordMap, maxAuto = 10): string[] {
  const auto = extractKeywords(chunk, maxAuto);
  const fromTopicMap = topic ? (topicMap?.[normalizeToken(topic)] ?? []) : [];
  const merged = new Set<string>([...auto, ...fromTopicMap.map(normalizeToken)]);
  return [...merged].filter(Boolean);
}

// ===================== Generador de embeddings mejorado =====================

type GenOptions = {
  delimitadores?: Array<[string,string]>;
  maxPalabras?: number;
  topicKeywordMap?: TopicKeywordMap; // opcional
  batchSize?: number;                // por defecto 64
  companyId?: number;                // para tracking de tokens
};

// 🆕 MIGRADO: Ya no recibe openai como parámetro, usa AIClientService
export async function procesarArchivoYEmbeddings(
  filePath: string,
  genOpts?: GenOptions
) {
  const companyId = genOpts?.companyId;
  // Validación de existencia
  try {
    await fs.access(filePath);
  } catch {
    console.error("❌ El archivo no existe:", filePath);
    return;
  }

  // Directorio de destino
  const companyDir = path.dirname(path.dirname(filePath)); // /.../ia/
  const embeddingDir = path.join(companyDir, "Embeddings");
  if (!fsc.existsSync(embeddingDir)) {
    fsc.mkdirSync(embeddingDir, { recursive: true });
    try { fsc.chmodSync(embeddingDir, 0o777); } catch {}
  }

  const nombreArchivo = path.basename(filePath, path.extname(filePath));
  const embeddingPath = path.join(embeddingDir, `${nombreArchivo}.json`);

  // Cargar contenido
  let contenido: string;
  try {
    contenido = await extraerTextoDesdeArchivo(filePath);
  } catch (err: any) {
    console.error("❌ Error al extraer texto:", err?.message ?? err);
    return;
  }

  const delimitadores = genOpts?.delimitadores ?? [
    ["--START--", "--END--"]
  ];
  const maxPalabras = genOpts?.maxPalabras ?? 400;
  const topicKeywordMap = genOpts?.topicKeywordMap;
  const batchSize = genOpts?.batchSize ?? 64;

  // Chunks
  const segmentos = chunkFlexible(contenido, delimitadores, maxPalabras);
  if (segmentos.length === 0) {
    console.warn("⚠️ No se detectaron segmentos; no se generarán embeddings.");
    return;
  }

  // Enriquecer con topic/keywords
  const meta = segmentos.map(chunk => {
    const topic = detectTopic(chunk);
    const keywords = buildKeywords(chunk, topic, topicKeywordMap);
    return { chunk, topic, keywords };
  });

  // 🆕 MIGRADO: Obtener cliente de IA usando AIClientService
  const { client } = await getClientForCapability('text');

  // Generar embeddings en batch
  const results: Array<{
    chunk: string;
    embedding: number[];
    embedding_unit: number[]; // normalizado
    topic?: string;
    keywords?: string[];
  }> = [];

  for (let i = 0; i < meta.length; i += batchSize) {
    const batch = meta.slice(i, i + batchSize);

    // 🆕 MIGRADO: Usar cliente de AIClientService
    const resp = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: batch.map(b => b.chunk || " ")
    });

    // 📊 REGISTRAR TOKENS DE EMBEDDING
    if (companyId && resp.usage) {
      await trackEmbeddings(companyId, "text-embedding-3-small", resp.usage);
    }

    // Por cada item del batch, guarda raw y normalizado
    for (let j = 0; j < batch.length; j++) {
      const emb = (resp.data[j].embedding as unknown as number[]) ?? [];
      const unit = toF32Normalized(emb);
      results.push({
        chunk: batch[j].chunk,
        embedding: emb,
        embedding_unit: Array.from(unit),  // guardamos como array normal para JSON
        topic: batch[j].topic,
        keywords: batch[j].keywords
      });
    }

    console.log(`🔹 Embeddings ${Math.min(i+batch.length, meta.length)}/${meta.length} procesados`);
  }

  // Guardar JSON (compat hacia atrás + campos nuevos)
  await fs.writeFile(embeddingPath, JSON.stringify(results, null, 2), "utf-8");
  console.log(`✅ Embeddings (con topic/keywords) guardados en: ${embeddingPath}`);
}
