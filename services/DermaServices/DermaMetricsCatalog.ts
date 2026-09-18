/**
 * Catálogo de métricas del análisis facial Derma.
 *
 * Es la única fuente de verdad de qué se puede pedir al modelo de visión y
 * cuánto cuesta. El frontend lo consume vía GET /derma/catalog, el servicio de
 * análisis lo usa para validar la selección y construir el prompt.
 *
 * Coste (créditos del tipo `derma_analysis`):
 *   - análisis básico (cualquier subconjunto de métricas): BASE_ANALYSIS_CREDITS
 *   - con "detalle clínico": CLINICAL_DETAIL_CREDITS en total
 */

export type DermaMetricKind = "score" | "classification";

export interface DermaMetricDefinition {
  key: string;
  label: string;
  kind: DermaMetricKind;
  /** Qué debe observar el modelo para esta métrica. */
  guidance: string;
}

export const BASE_ANALYSIS_CREDITS = 1;
export const CLINICAL_DETAIL_CREDITS = 15;

export const DERMA_METRICS: DermaMetricDefinition[] = [
  {
    key: "parpado_inferior_caido",
    label: "Párpado inferior caído",
    kind: "score",
    guidance:
      "Laxitud y descolgamiento del párpado inferior, festones malares.",
  },
  {
    key: "firmeza",
    label: "Firmeza",
    kind: "score",
    guidance:
      "Tono y elasticidad aparente, pérdida de definición del óvalo facial, flacidez.",
  },
  {
    key: "acne",
    label: "Acné",
    kind: "score",
    guidance:
      "Lesiones activas (comedones, pápulas, pústulas) y marcas post-acné.",
  },
  {
    key: "hidratacion",
    label: "Hidratación",
    kind: "score",
    guidance:
      "Signos de deshidratación: descamación, líneas de deshidratación, aspecto apagado.",
  },
  {
    key: "bolsas_ojos",
    label: "Bolsas de ojos",
    kind: "score",
    guidance: "Volumen y edema en la zona infraorbitaria.",
  },
  {
    key: "ojeras",
    label: "Ojeras",
    kind: "score",
    guidance:
      "Pigmentación o sombra infraorbitaria (vascular, pigmentaria o estructural).",
  },
  {
    key: "manchas",
    label: "Manchas",
    kind: "score",
    guidance:
      "Hiperpigmentación: léntigos, melasma, marcas post-inflamatorias; distribución por zonas.",
  },
  {
    key: "luminosidad",
    label: "Luminosidad",
    kind: "score",
    guidance:
      "Uniformidad y brillo saludable del tono, aspecto apagado o grisáceo.",
  },
  {
    key: "rojeces",
    label: "Rojeces",
    kind: "score",
    guidance:
      "Eritema difuso, capilares visibles, tendencia a rosácea o sensibilidad.",
  },
  {
    key: "oleosidad",
    label: "Oleosidad",
    kind: "score",
    guidance: "Brillo sebáceo, especialmente en zona T.",
  },
  {
    key: "poros",
    label: "Poros",
    kind: "score",
    guidance:
      "Tamaño y visibilidad de poros, sobre todo en nariz, mejillas y frente.",
  },
  {
    key: "textura",
    label: "Textura",
    kind: "score",
    guidance:
      "Uniformidad de la superficie: rugosidad, irregularidades, granitos.",
  },
  {
    key: "surcos_expresion",
    label: "Surcos de expresión",
    kind: "score",
    guidance:
      "Líneas y surcos: frente, entrecejo, patas de gallo, nasogenianos, marioneta.",
  },
  {
    key: "tipo_piel",
    label: "Tipo de piel",
    kind: "classification",
    guidance:
      "Clasificar como normal, seca, grasa, mixta, sensible o combinaciones (p.ej. mixta y sensible).",
  },
  {
    key: "edad_piel",
    label: "Edad de piel",
    kind: "classification",
    guidance:
      "Edad aparente de la piel en años, estimada por signos visibles; comparar con la edad real si se conoce.",
  },
];

export const DERMA_METRIC_KEYS: string[] = DERMA_METRICS.map((m) => m.key);

const byKey = new Map(DERMA_METRICS.map((m) => [m.key, m]));

export const getMetricDefinition = (
  key: string,
): DermaMetricDefinition | undefined => byKey.get(key);

/**
 * Normaliza y valida una selección de métricas. Acepta array o string separado
 * por comas (el multipart llega como string). Devuelve las claves válidas en el
 * orden del catálogo, sin duplicados. Lanza si queda vacía o hay claves desconocidas.
 */
export const normalizeSelectedMetrics = (input: unknown): string[] => {
  let raw: string[] = [];
  if (Array.isArray(input)) {
    raw = input.map((v) => String(v));
  } else if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        raw = Array.isArray(parsed)
          ? parsed.map((v: unknown) => String(v))
          : [];
      } catch {
        raw = [];
      }
    } else {
      raw = trimmed.split(",");
    }
  }

  const cleaned = raw.map((v) => v.trim()).filter(Boolean);
  const unknown = cleaned.filter((k) => !byKey.has(k));
  if (unknown.length > 0) {
    throw new Error(`Métricas desconocidas: ${unknown.join(", ")}`);
  }
  const selected = new Set(cleaned);
  const ordered = DERMA_METRIC_KEYS.filter((k) => selected.has(k));
  if (ordered.length === 0) {
    throw new Error("Selecciona al menos una métrica para analizar");
  }
  return ordered;
};

/** Créditos que cuesta un análisis según si incluye detalle clínico. */
export const calculateAnalysisCredits = (clinicalDetail: boolean): number =>
  clinicalDetail ? CLINICAL_DETAIL_CREDITS : BASE_ANALYSIS_CREDITS;

export const parseBooleanFlag = (input: unknown): boolean => {
  if (typeof input === "boolean") return input;
  if (typeof input === "number") return input === 1;
  if (typeof input === "string") {
    return ["1", "true", "yes", "si", "sí", "on"].includes(
      input.trim().toLowerCase(),
    );
  }
  return false;
};

export default {
  DERMA_METRICS,
  DERMA_METRIC_KEYS,
  BASE_ANALYSIS_CREDITS,
  CLINICAL_DETAIL_CREDITS,
  getMetricDefinition,
  normalizeSelectedMetrics,
  calculateAnalysisCredits,
  parseBooleanFlag,
};
