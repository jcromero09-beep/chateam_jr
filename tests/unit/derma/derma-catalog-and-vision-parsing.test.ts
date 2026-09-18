import { describe, expect, test } from "@jest/globals";
import {
  DERMA_METRICS,
  DERMA_METRIC_KEYS,
  BASE_ANALYSIS_CREDITS,
  CLINICAL_DETAIL_CREDITS,
  normalizeSelectedMetrics,
  calculateAnalysisCredits,
  parseBooleanFlag
} from "../../../services/DermaServices/DermaMetricsCatalog";

// DermaVisionService importa modelos Sequelize (AIProviderConfig) y el logger:
// se mockean para probar sólo la parte pura (prompt + normalización del JSON).
jest.mock("../../../models/AIProviderConfig", () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock("../../../utils/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import {
  extractJsonObject,
  normalizeVisionResult,
  buildUserPrompt
} from "../../../services/DermaServices/DermaVisionService";

describe("DermaMetricsCatalog", () => {
  test("el catálogo tiene 15 métricas con claves únicas (13 con score + tipo y edad de piel)", () => {
    expect(DERMA_METRICS).toHaveLength(15);
    expect(new Set(DERMA_METRIC_KEYS).size).toBe(15);
    expect(DERMA_METRICS.filter(m => m.kind === "score")).toHaveLength(13);
    expect(DERMA_METRICS.filter(m => m.kind === "classification").map(m => m.key)).toEqual(["tipo_piel", "edad_piel"]);
  });

  test("coste: 1 crédito básico, 15 con detalle clínico", () => {
    expect(BASE_ANALYSIS_CREDITS).toBe(1);
    expect(CLINICAL_DETAIL_CREDITS).toBe(15);
    expect(calculateAnalysisCredits(false)).toBe(1);
    expect(calculateAnalysisCredits(true)).toBe(15);
  });

  test("normalizeSelectedMetrics acepta array, CSV y JSON; ordena por catálogo y quita duplicados", () => {
    expect(normalizeSelectedMetrics(["poros", "acne", "poros"])).toEqual(["acne", "poros"]);
    expect(normalizeSelectedMetrics("textura, manchas ,textura")).toEqual(["manchas", "textura"]);
    expect(normalizeSelectedMetrics('["ojeras","firmeza"]')).toEqual(["firmeza", "ojeras"]);
  });

  test("normalizeSelectedMetrics rechaza vacío y claves desconocidas", () => {
    expect(() => normalizeSelectedMetrics([])).toThrow(/al menos una/);
    expect(() => normalizeSelectedMetrics("")).toThrow(/al menos una/);
    expect(() => normalizeSelectedMetrics(["poros", "arrugas_xyz"])).toThrow(/desconocidas: arrugas_xyz/);
  });

  test("parseBooleanFlag interpreta strings del multipart", () => {
    expect(parseBooleanFlag("true")).toBe(true);
    expect(parseBooleanFlag("1")).toBe(true);
    expect(parseBooleanFlag("sí")).toBe(true);
    expect(parseBooleanFlag("false")).toBe(false);
    expect(parseBooleanFlag(undefined)).toBe(false);
    expect(parseBooleanFlag(true)).toBe(true);
  });
});

describe("DermaVisionService · extractJsonObject", () => {
  test("parsea JSON limpio, con fences y con prosa alrededor", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(extractJsonObject('Claro:\n```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJsonObject('Aquí tienes el resultado {"a":3} espero que sirva')).toEqual({ a: 3 });
  });

  test("lanza si no hay JSON", () => {
    expect(() => extractJsonObject("no hay nada")).toThrow(/JSON válido/);
  });
});

describe("DermaVisionService · normalizeVisionResult", () => {
  const selected = ["acne", "poros", "tipo_piel", "edad_piel"];

  test("garantiza todas las métricas pedidas, acota scores y deriva severidad", () => {
    const raw = {
      globalScore: 250,
      skinType: "Mixta y sensible",
      skinAge: "32 años",
      summary: "Resumen",
      metrics: [
        { key: "acne", score: 91.6, findings: "Pocas lesiones", zones: ["mentón"], recommendation: "Limpieza" },
        { key: "poros", score: -5, severity: "severo", findings: "Poros dilatados" },
        { key: "tipo_piel", value: "mixta y sensible", findings: "Brillo en zona T" }
        // edad_piel omitida a propósito
      ],
      recommendations: [{ title: "Protector solar", detail: "SPF 50 diario", priority: "ALTA" }, { title: "X" }],
      imageQuality: { ok: false, notes: "Luz lateral" }
    };

    const r = normalizeVisionResult(raw, selected, false);

    expect(r.globalScore).toBe(100); // acotado
    expect(r.skinType).toBe("Mixta y sensible");
    expect(r.skinAge).toBe(32);
    expect(r.metrics.map(m => m.key)).toEqual(selected);

    const acne = r.metrics[0];
    expect(acne.score).toBe(92);
    expect(acne.severity).toBe("ninguna");
    expect(acne.zones).toEqual(["mentón"]);

    const poros = r.metrics[1];
    expect(poros.score).toBe(0);
    expect(poros.severity).toBe("alta"); // "severo" → alta

    const tipo = r.metrics[2];
    expect(tipo.score).toBeNull();
    expect(tipo.severity).toBeNull();
    expect(tipo.value).toBe("mixta y sensible");

    const edad = r.metrics[3];
    expect(edad.key).toBe("edad_piel");
    expect(edad.label).toBe("Edad de piel");

    expect(r.recommendations).toEqual([
      { title: "Protector solar", detail: "SPF 50 diario", priority: "alta" },
      { title: "X", detail: "", priority: "media" }
    ]);
    expect(r.clinicalDetail).toBeNull();
    expect(r.imageQuality).toEqual({ ok: false, notes: "Luz lateral" });
  });

  test("recalcula el score global cuando falta y construye el detalle clínico", () => {
    const raw = {
      metrics: [
        { key: "acne", score: 80 },
        { key: "poros", score: 60 }
      ],
      clinicalDetail: {
        observations: "Obs",
        suggestedTreatments: [{ name: "Peeling", rationale: "Textura", sessions: "4" }],
        homeCare: { morning: ["Limpiar"], night: ["Retinol"] },
        cautions: ["Evitar sol"],
        followUpWeeks: "6"
      }
    };
    const r = normalizeVisionResult(raw, ["acne", "poros"], true);
    expect(r.globalScore).toBe(70);
    expect(r.skinType).toBe("no determinado");
    expect(r.metrics[0].severity).toBe("leve");
    expect(r.metrics[1].severity).toBe("moderada");
    expect(r.clinicalDetail).toEqual({
      observations: "Obs",
      suggestedTreatments: [{ name: "Peeling", rationale: "Textura", sessions: "4" }],
      homeCare: { morning: ["Limpiar"], night: ["Retinol"] },
      cautions: ["Evitar sol"],
      followUpWeeks: 6
    });
    expect(r.imageQuality.ok).toBe(true);
  });

  test("buildUserPrompt sólo incluye las métricas seleccionadas y el bloque clínico si procede", () => {
    const base = {
      companyId: 1,
      imageBase64: "",
      mimeType: "image/jpeg",
      selectedMetrics: ["manchas", "tipo_piel"],
      clinicalDetail: false,
      patient: { age: 29, gender: "femenino" }
    };
    const p1 = buildUserPrompt(base);
    expect(p1).toContain('"key":"manchas"');
    expect(p1).toContain('"key":"tipo_piel"');
    expect(p1).not.toContain('"key":"poros"');
    expect(p1).toContain("edad real 29 años");
    expect(p1).toContain('"clinicalDetail": null');

    const p2 = buildUserPrompt({ ...base, clinicalDetail: true });
    expect(p2).toContain("suggestedTreatments");
  });
});
