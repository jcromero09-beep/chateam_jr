/**
 * DermaVisionService — llama al modelo multimodal (visión) y devuelve el
 * resultado estructurado del análisis facial.
 *
 * Proveedor: Anthropic (Claude) como primera opción; OpenAI como respaldo.
 * Las claves salen de AIProviderConfig (empresa → global) y, si no hay fila,
 * de las variables de entorno ANTHROPIC_API_KEY / OPENAI_API_KEY.
 *
 *   DERMA_VISION_PROVIDER  = anthropic | openai   (fuerza un proveedor)
 *   DERMA_ANTHROPIC_MODEL  (default claude-sonnet-5)
 *   DERMA_OPENAI_MODEL     (default gpt-5.5)
 *
 * El parseo/normalización del JSON (`normalizeVisionResult`) es puro y está
 * cubierto por tests unitarios; la llamada de red está aislada en `callProvider`.
 */
import axios from "axios";
import AIProviderConfig from "../../models/AIProviderConfig";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import {
  DERMA_METRICS,
  getMetricDefinition,
  type DermaMetricDefinition,
} from "./DermaMetricsCatalog";
import type {
  DermaAnalysisResult,
  DermaMetricResult,
  DermaRecommendation,
  DermaClinicalDetail,
} from "../../models/DermaAnalysis";

export type DermaVisionProvider = "anthropic" | "openai";

export interface DermaVisionRequest {
  companyId: number;
  imageBase64: string;
  mimeType: string;
  selectedMetrics: string[];
  clinicalDetail: boolean;
  patient: {
    name?: string;
    age?: number | null;
    gender?: string | null;
    notes?: string | null;
  };
}

export interface DermaVisionResponse {
  result: DermaAnalysisResult;
  provider: DermaVisionProvider;
  model: string;
  tokensUsed: number;
  latencyMs: number;
  rawText: string;
}

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";
const DEFAULT_OPENAI_MODEL = "gpt-5.5";
const REQUEST_TIMEOUT_MS = 90_000;

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export const buildSystemPrompt = (): string =>
  [
    "Eres un asistente de valoración estética facial para profesionales de la estética",
    "(esteticistas, cosmetólogas y cosmiatras). Analizas fotografías del rostro y describes",
    "de forma objetiva el estado visible de la piel para apoyar la valoración del profesional.",
    "No emites diagnósticos médicos ni sustituyes a un dermatólogo: si observas algo que",
    "requiera valoración médica, indícalo en 'cautions' como recomendación de derivación.",
    "Respondes SIEMPRE con un único objeto JSON válido, sin texto antes ni después, sin",
    "bloques de código. Idioma: español neutro, tono profesional y claro para el paciente.",
  ].join(" ");

const metricSchemaLine = (m: DermaMetricDefinition): string =>
  m.kind === "score"
    ? `    {"key":"${m.key}","label":"${m.label}","score":<0-100, 100 = estado óptimo>,"severity":"ninguna|leve|moderada|alta","findings":"<qué se observa>","zones":["<zona>"],"recommendation":"<consejo concreto>"}`
    : `    {"key":"${m.key}","label":"${m.label}","score":null,"severity":null,"value":"<valor>","findings":"<justificación>","zones":[],"recommendation":"<consejo>"}`;

export const buildUserPrompt = (req: DermaVisionRequest): string => {
  const metrics = req.selectedMetrics
    .map((k) => getMetricDefinition(k))
    .filter((m): m is DermaMetricDefinition => Boolean(m));

  const guidance = metrics
    .map((m) => `- ${m.label} (${m.key}): ${m.guidance}`)
    .join("\n");
  const schemaLines = metrics.map(metricSchemaLine).join(",\n");

  const patientBits: string[] = [];
  if (req.patient.age != null)
    patientBits.push(`edad real ${req.patient.age} años`);
  if (req.patient.gender) patientBits.push(`género ${req.patient.gender}`);
  if (req.patient.notes)
    patientBits.push(`notas del profesional: ${req.patient.notes}`);
  const patientLine = patientBits.length
    ? `Datos del paciente: ${patientBits.join("; ")}.`
    : "Sin datos adicionales del paciente.";

  const clinicalBlock = req.clinicalDetail
    ? `,
  "clinicalDetail": {
    "observations": "<valoración ampliada por zonas del rostro (frente, zona periocular, mejillas, nariz, zona perioral, mentón)>",
    "suggestedTreatments": [{"name":"<tratamiento de cabina>","rationale":"<por qué>","sessions":"<nº sesiones / frecuencia>"}],
    "homeCare": {"morning":["<paso>"],"night":["<paso>"]},
    "cautions": ["<precaución, contraindicación o motivo de derivación>"],
    "followUpWeeks": <semanas hasta la revisión, número o null>
  }`
    : `,
  "clinicalDetail": null`;

  return `Analiza la fotografía del rostro del paciente. ${patientLine}

Evalúa ÚNICAMENTE estas métricas:
${guidance}

Criterios: score 0-100 donde 100 es el estado óptimo (sin hallazgos) y 0 es muy afectado.
Severidad: "ninguna" (score ≥ 85), "leve" (70-84), "moderada" (45-69), "alta" (< 45).
El globalScore es la media ponderada de las métricas con score, redondeada.
skinType siempre se rellena aunque no esté en la lista (normal, seca, grasa, mixta, sensible o combinación).
skinAge es la edad aparente de la piel en años (entero) o null si no es estimable.
Si la foto no permite valorar (borrosa, muy oscura, sin rostro, rostro parcial), pon imageQuality.ok=false y explica por qué en notes, manteniendo el resto del JSON con tu mejor estimación.

Devuelve exactamente esta estructura:
{
  "globalScore": <0-100>,
  "skinType": "<tipo>",
  "skinAge": <número|null>,
  "summary": "<3-4 frases para el paciente: qué se ve y prioridades>",
  "imageQuality": {"ok": true, "notes": "<calidad de la foto>"},
  "metrics": [
${schemaLines}
  ],
  "recommendations": [{"title":"<acción>","detail":"<cómo/por qué>","priority":"alta|media|baja"}]${clinicalBlock}
}`;
};

// ---------------------------------------------------------------------------
// Normalización del JSON devuelto por el modelo
// ---------------------------------------------------------------------------

const clampScore = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
};

const severityFromScore = (
  score: number | null,
): DermaMetricResult["severity"] => {
  if (score === null) return null;
  if (score >= 85) return "ninguna";
  if (score >= 70) return "leve";
  if (score >= 45) return "moderada";
  return "alta";
};

const normalizeSeverity = (
  v: unknown,
  score: number | null,
): DermaMetricResult["severity"] => {
  const s = String(v ?? "")
    .toLowerCase()
    .trim();
  if (["ninguna", "leve", "moderada", "alta"].includes(s))
    return s as DermaMetricResult["severity"];
  if (s === "moderado") return "moderada";
  if (s === "alto" || s === "severa" || s === "severo") return "alta";
  if (s === "none" || s === "sin hallazgos") return "ninguna";
  return severityFromScore(score);
};

const toStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : [];

const str = (v: unknown, fallback = ""): string =>
  v === null || v === undefined ? fallback : String(v).trim();

/** Extrae el primer objeto JSON de un texto que puede traer fences o prosa. */
export const extractJsonObject = (text: string): any => {
  const trimmed = String(text ?? "").trim();
  const candidates: string[] = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) candidates.unshift(fence[1].trim());
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first)
    candidates.push(trimmed.slice(first, last + 1));

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // probar siguiente candidato
    }
  }
  throw new Error("La respuesta del modelo no contiene un JSON válido");
};

/**
 * Convierte el JSON libre del modelo en un DermaAnalysisResult consistente:
 * garantiza que cada métrica pedida aparece (aunque el modelo la omitiera),
 * acota scores, deriva severidades y recalcula el score global si falta.
 */
export const normalizeVisionResult = (
  raw: any,
  selectedMetrics: string[],
  clinicalDetail: boolean,
): DermaAnalysisResult => {
  const rawMetrics: any[] = Array.isArray(raw?.metrics) ? raw.metrics : [];
  const byKey = new Map<string, any>();
  for (const m of rawMetrics) {
    if (m && typeof m === "object" && m.key) byKey.set(String(m.key), m);
  }

  const metrics: DermaMetricResult[] = selectedMetrics.map((key) => {
    const def = getMetricDefinition(key);
    const m = byKey.get(key) || {};
    const isScore = def?.kind !== "classification";
    const score = isScore ? clampScore(m.score) : null;
    const value = str(m.value) || undefined;
    return {
      key,
      label: def?.label || str(m.label, key),
      score,
      severity: isScore ? normalizeSeverity(m.severity, score) : null,
      findings: str(
        m.findings,
        isScore ? "Sin observaciones registradas." : value || "",
      ),
      zones: toStringArray(m.zones),
      recommendation: str(m.recommendation),
      ...(value ? { value } : {}),
    };
  });

  const scored = metrics.filter((m) => m.score !== null);
  const computedGlobal = scored.length
    ? Math.round(
        scored.reduce((acc, m) => acc + (m.score as number), 0) / scored.length,
      )
    : null;
  const globalScore = clampScore(raw?.globalScore) ?? computedGlobal ?? 0;

  const skinTypeMetric = metrics.find((m) => m.key === "tipo_piel");
  const skinType =
    str(raw?.skinType) || skinTypeMetric?.value || "no determinado";

  const skinAgeMetric = metrics.find((m) => m.key === "edad_piel");
  const skinAgeRaw = raw?.skinAge ?? skinAgeMetric?.value;
  const skinAgeNum = Number(String(skinAgeRaw ?? "").replace(/[^\d.]/g, ""));
  const skinAge =
    Number.isFinite(skinAgeNum) && skinAgeNum > 0 && skinAgeNum < 120
      ? Math.round(skinAgeNum)
      : null;

  const recommendations: DermaRecommendation[] = (
    Array.isArray(raw?.recommendations) ? raw.recommendations : []
  )
    .filter((r: any) => r && typeof r === "object")
    .map((r: any) => {
      const p = String(r.priority ?? "media").toLowerCase();
      return {
        title: str(r.title, "Recomendación"),
        detail: str(r.detail),
        priority: (p === "alta" || p === "baja"
          ? p
          : "media") as DermaRecommendation["priority"],
      };
    });

  let clinical: DermaClinicalDetail | null = null;
  if (clinicalDetail) {
    const c =
      raw?.clinicalDetail && typeof raw.clinicalDetail === "object"
        ? raw.clinicalDetail
        : {};
    const fu = Number(c.followUpWeeks);
    clinical = {
      observations: str(c.observations),
      suggestedTreatments: (Array.isArray(c.suggestedTreatments)
        ? c.suggestedTreatments
        : []
      )
        .filter((t: any) => t && typeof t === "object")
        .map((t: any) => ({
          name: str(t.name, "Tratamiento"),
          rationale: str(t.rationale),
          ...(t.sessions ? { sessions: str(t.sessions) } : {}),
        })),
      homeCare: {
        morning: toStringArray(c.homeCare?.morning),
        night: toStringArray(c.homeCare?.night),
      },
      cautions: toStringArray(c.cautions),
      followUpWeeks: Number.isFinite(fu) && fu > 0 ? Math.round(fu) : null,
    };
  }

  const q =
    raw?.imageQuality && typeof raw.imageQuality === "object"
      ? raw.imageQuality
      : {};
  const imageQuality = {
    ok: q.ok === undefined ? true : Boolean(q.ok),
    notes: str(q.notes),
  };

  return {
    globalScore,
    skinType,
    skinAge,
    summary: str(raw?.summary),
    metrics,
    recommendations,
    clinicalDetail: clinical,
    imageQuality,
  };
};

// ---------------------------------------------------------------------------
// Resolución de proveedor y llamada
// ---------------------------------------------------------------------------

interface ResolvedProvider {
  provider: DermaVisionProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
}

const findProviderRow = async (
  provider: string,
  companyId: number,
): Promise<AIProviderConfig | null> => {
  try {
    const own = await AIProviderConfig.findOne({
      where: { provider, isActive: true, companyId },
    });
    if (own?.apiKey) return own;
    const global = await AIProviderConfig.findOne({
      where: { provider, isActive: true, companyId: null },
      tenantBypass: true,
    } as any);
    if (global?.apiKey) return global;
  } catch (err: any) {
    logger.warn(
      `[DermaVision] Error consultando AIProviderConfig (${provider}): ${err.message}`,
    );
  }
  return null;
};

export const resolveProvider = async (
  companyId: number,
): Promise<ResolvedProvider> => {
  const forced = (process.env.DERMA_VISION_PROVIDER || "").toLowerCase() as
    DermaVisionProvider | "";
  const order: DermaVisionProvider[] =
    forced === "openai" ? ["openai", "anthropic"] : ["anthropic", "openai"];

  for (const provider of order) {
    const row = await findProviderRow(provider, companyId);
    const envKey =
      provider === "anthropic"
        ? process.env.ANTHROPIC_API_KEY
        : process.env.OPENAI_API_KEY;
    const apiKey = row?.apiKey || envKey;
    if (!apiKey) continue;
    const model =
      provider === "anthropic"
        ? process.env.DERMA_ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL
        : process.env.DERMA_OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
    return { provider, apiKey, baseUrl: row?.baseUrl || undefined, model };
  }

  throw new AppError(
    "No hay proveedor de visión configurado para Derma. Configure Anthropic u OpenAI en Configuración → IA " +
      "o defina ANTHROPIC_API_KEY / OPENAI_API_KEY.",
    400,
  );
};

type AnthropicMediaType =
  "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const toAnthropicMediaType = (mime: string): AnthropicMediaType => {
  const m = String(mime || "").toLowerCase();
  if (m === "image/png" || m === "image/gif" || m === "image/webp") return m;
  return "image/jpeg";
};

const callAnthropic = async (
  p: ResolvedProvider,
  req: DermaVisionRequest,
): Promise<{ text: string; tokens: number; model: string }> => {
  // Import dinámico: el SDK sólo se carga cuando se usa Anthropic (y así el
  // módulo sigue siendo importable desde jest/CJS para probar la parte pura).
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({
    apiKey: p.apiKey,
    baseURL: p.baseUrl,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 1,
  });
  const response = await client.messages.create({
    model: p.model,
    max_tokens: req.clinicalDetail ? 4096 : 2500,
    temperature: 0.2,
    system: buildSystemPrompt(),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            // prepareImage siempre entrega JPEG; el tipo literal lo exige el SDK.
            source: {
              type: "base64",
              media_type: toAnthropicMediaType(req.mimeType),
              data: req.imageBase64,
            },
          },
          { type: "text", text: buildUserPrompt(req) },
        ],
      },
    ],
  });
  const text = (response.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");
  const tokens =
    (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);
  return { text, tokens, model: response.model || p.model };
};

const callOpenAI = async (
  p: ResolvedProvider,
  req: DermaVisionRequest,
): Promise<{ text: string; tokens: number; model: string }> => {
  const base = (p.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const response = await axios.post(
    `${base}/chat/completions`,
    {
      model: p.model,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: [
            { type: "text", text: buildUserPrompt(req) },
            {
              type: "image_url",
              image_url: {
                url: `data:${req.mimeType};base64,${req.imageBase64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      max_completion_tokens: req.clinicalDetail ? 4096 : 2500,
      response_format: { type: "json_object" },
    },
    {
      headers: {
        Authorization: `Bearer ${p.apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: REQUEST_TIMEOUT_MS,
    },
  );
  const text = response.data?.choices?.[0]?.message?.content || "";
  const usage = response.data?.usage || {};
  const tokens = (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);
  return { text, tokens, model: response.data?.model || p.model };
};

/**
 * Ejecuta el análisis de visión. Lanza AppError(502) si el proveedor falla o
 * devuelve algo no parseable; el llamador decide el reembolso de créditos.
 */
export const analyzeFaceImage = async (
  req: DermaVisionRequest,
): Promise<DermaVisionResponse> => {
  const started = Date.now();
  const p = await resolveProvider(req.companyId);
  logger.info(
    `[DermaVision] company=${req.companyId} provider=${p.provider} model=${p.model} ` +
      `metrics=${req.selectedMetrics.length} clinical=${req.clinicalDetail}`,
  );

  let call: { text: string; tokens: number; model: string };
  try {
    call =
      p.provider === "anthropic"
        ? await callAnthropic(p, req)
        : await callOpenAI(p, req);
  } catch (err: any) {
    const detail =
      err?.response?.data?.error?.message ||
      err?.error?.message ||
      err?.message ||
      "error desconocido";
    logger.error(`[DermaVision] Fallo del proveedor ${p.provider}: ${detail}`);
    throw new AppError(
      `El proveedor de visión (${p.provider}) falló: ${detail}`,
      502,
    );
  }

  let result: DermaAnalysisResult;
  try {
    result = normalizeVisionResult(
      extractJsonObject(call.text),
      req.selectedMetrics,
      req.clinicalDetail,
    );
  } catch (err: any) {
    logger.error(
      `[DermaVision] Respuesta no parseable (${p.provider}): ${err.message} :: ${call.text.slice(0, 300)}`,
    );
    throw new AppError(
      "El modelo devolvió una respuesta no interpretable. Inténtalo de nuevo.",
      502,
    );
  }

  return {
    result,
    provider: p.provider,
    model: call.model,
    tokensUsed: call.tokens,
    latencyMs: Date.now() - started,
    rawText: call.text,
  };
};

export default {
  analyzeFaceImage,
  resolveProvider,
  normalizeVisionResult,
  extractJsonObject,
  buildUserPrompt,
  buildSystemPrompt,
  DERMA_METRICS,
};
