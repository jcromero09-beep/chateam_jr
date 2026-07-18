/**
 * Tests unitarios — Conversión personalizada Meta por etiqueta Kanban.
 *
 * Cubre:
 *  - slugify / buildUniqueTagKey (generación de `key` única por empresa)
 *  - TagMetaConversionAIService: JSON válido, fallback sin créditos,
 *    fallback determinístico por keywords
 *
 * No toca BD ni Meta reales. Mockea modelos y servicios de IA/créditos.
 */
import { describe, test, expect, beforeEach, jest } from "@jest/globals";
import AppError from "../../errors/AppError";

// ── Mock modelo Tag (para buildUniqueTagKey) ──────────────────
const TagMock: any = { findAll: jest.fn() };
jest.mock("../../models/Tag", () => ({ __esModule: true, default: TagMock }));

// ── Mock IA + créditos (para TagMetaConversionAIService) ──────
const chatCompletionMock = jest.fn();
const chargeClassificationMock = jest.fn();
jest.mock("../../services/AIClientService", () => ({
  __esModule: true,
  chatCompletion: chatCompletionMock
}));
jest.mock("../../services/AICreditServices/AIUsagePricingService", () => ({
  __esModule: true,
  chargeClassification: chargeClassificationMock
}));

import { slugify, buildUniqueTagKey } from "../../services/TagServices/buildTagKey";
import {
  TagMetaConversionAIService,
  getFallbackMetaRecommendation
} from "../../services/TagServices/TagMetaConversionAIService";

beforeEach(() => {
  TagMock.findAll.mockReset();
  chatCompletionMock.mockReset();
  chargeClassificationMock.mockReset();
  TagMock.findAll.mockResolvedValue([]);
  chargeClassificationMock.mockResolvedValue({ ok: true });
});

describe("slugify", () => {
  test("normaliza acentos, espacios y símbolos", () => {
    expect(slugify("Venta / Lead Caliente")).toBe("venta-lead-caliente");
    expect(slugify("Atracción")).toBe("atraccion");
    expect(slugify("  Interés  ")).toBe("interes");
  });
});

describe("buildUniqueTagKey", () => {
  test("usa el slug base si no existe colisión", async () => {
    TagMock.findAll.mockResolvedValueOnce([]);
    const key = await buildUniqueTagKey("Nueva Etapa", 1);
    expect(key).toBe("nueva-etapa");
  });

  test("agrega sufijo numérico si el slug ya existe", async () => {
    TagMock.findAll.mockResolvedValueOnce([
      { key: "interes" },
      { key: "interes-2" }
    ]);
    const key = await buildUniqueTagKey("Interés", 1);
    expect(key).toBe("interes-3");
  });
});

describe("getFallbackMetaRecommendation (determinístico)", () => {
  test("etapa de venta → Purchase/won", () => {
    const rec = getFallbackMetaRecommendation("Venta cerrada");
    expect(rec.metaEventName).toBe("Purchase");
    expect(rec.metaLeadStatus).toBe("won");
    expect(rec.metaCustomEventType).toBe("PURCHASE");
    // la rule referencia evento y lead_status coherentes
    const rule = JSON.parse(rec.metaRule);
    expect(rule.and[0].event.eq).toBe("Purchase");
    expect(rule.and[1].lead_status.eq).toBe("won");
  });

  test("etapa de interés → Contact/interest", () => {
    const rec = getFallbackMetaRecommendation("Interés");
    expect(rec.metaEventName).toBe("Contact");
    expect(rec.metaLeadStatus).toBe("interest");
  });
});

describe("TagMetaConversionAIService", () => {
  test("JSON válido de la IA → recomendación normalizada", async () => {
    chatCompletionMock.mockResolvedValueOnce({
      content: JSON.stringify({
        metaConversionName: "Kanban Interés",
        metaEventName: "Contact",
        metaLeadStatus: "interest",
        metaCustomEventType: "CONTACT",
        metaRule: '{"and":[{"event":{"eq":"Contact"}},{"lead_status":{"eq":"interest"}}]}',
        reasoning: "Etapa temprana"
      })
    });

    const rec = await TagMetaConversionAIService({ name: "Interés", companyId: 1 });
    expect(rec.metaEventName).toBe("Contact");
    expect(rec.metaLeadStatus).toBe("interest");
    expect(rec.metaCustomEventType).toBe("CONTACT");
    expect(() => JSON.parse(rec.metaRule)).not.toThrow();
    expect(chargeClassificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ source: "tag_meta_conversion_ai", companyId: 1 })
    );
  });

  test("custom_event_type inválido → se normaliza a OTHER", async () => {
    chatCompletionMock.mockResolvedValueOnce({
      content: JSON.stringify({
        metaConversionName: "X",
        metaEventName: "FooBar",
        metaLeadStatus: "Some Status!",
        metaCustomEventType: "INVENTADO",
        metaRule: "no-es-json",
        reasoning: "x"
      })
    });

    const rec = await TagMetaConversionAIService({ name: "Etapa rara", companyId: 1 });
    expect(rec.metaCustomEventType).toBe("OTHER");
    expect(rec.metaLeadStatus).toBe("some_status"); // snake_case sanitizado
    // rule inválida → se reconstruye coherente y parseable
    expect(() => JSON.parse(rec.metaRule)).not.toThrow();
  });

  test("sin créditos (ERR_AI_NO_CREDIT_BALANCE) → fallback sin llamar a la IA", async () => {
    chargeClassificationMock.mockRejectedValueOnce(new AppError("ERR_AI_NO_CREDIT_BALANCE", 402));

    const rec = await TagMetaConversionAIService({ name: "Venta", companyId: 1 });
    expect(chatCompletionMock).not.toHaveBeenCalled();
    expect(rec.metaEventName).toBe("Purchase"); // viene del fallback
  });

  test("IA falla → fallback determinístico", async () => {
    chatCompletionMock.mockRejectedValueOnce(new Error("timeout"));
    const rec = await TagMetaConversionAIService({ name: "Cita agendada", companyId: 1 });
    expect(rec.metaEventName).toBe("Schedule");
  });
});
