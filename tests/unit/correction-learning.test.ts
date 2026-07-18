/**
 * Tests unitarios — Sprint 1: Loop de Aprendizaje desde Correcciones Humanas.
 *
 * Foco:
 *   1. AILearningFeatureFlag: niveles, override por companyId, tipos críticos.
 *   2. CorrectionScopeMatcher: matches/specificityScore/sortByRelevance/normalizeScope.
 *
 * Estos tests son puros (sin BD, sin red, sin LLM). Los servicios con LLM
 * o BD (Classifier, LearningService, RepeatBlocker) requieren mocks pesados
 * y se cubren en tests de integración en sprints posteriores.
 */
import { describe, test, expect, beforeEach, afterEach } from "@jest/globals";

import AILearningFeatureFlag, {
  CRITICAL_CORRECTION_TYPES
} from "../../services/AILearningServices/AILearningFeatureFlag";
import CorrectionScopeMatcher from "../../services/AILearningServices/CorrectionScopeMatcher";

// ════════════════════════════════════════════════════════════════════
// AILearningFeatureFlag
// ════════════════════════════════════════════════════════════════════
describe("AILearningFeatureFlag", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.AI_LEARNING_LEVEL;
    delete process.env.AI_LEARNING_COMPANIES_LEVEL_1;
    delete process.env.AI_LEARNING_COMPANIES_LEVEL_2;
    delete process.env.AI_LEARNING_COMPANIES_LEVEL_3;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("default level es 0 cuando no hay env vars", () => {
    expect(AILearningFeatureFlag.getLevel(42)).toBe(0);
    expect(AILearningFeatureFlag.isEnabled(42)).toBe(false);
    expect(AILearningFeatureFlag.canAutoLearn(42)).toBe(false);
  });

  test("AI_LEARNING_LEVEL=2 aplica globalmente", () => {
    process.env.AI_LEARNING_LEVEL = "2";
    expect(AILearningFeatureFlag.getLevel(1)).toBe(2);
    expect(AILearningFeatureFlag.getLevel(999)).toBe(2);
    expect(AILearningFeatureFlag.canAutoLearn(1)).toBe(true);
    expect(AILearningFeatureFlag.canSupersedeHistoricalQA(1)).toBe(false);
  });

  test("AI_LEARNING_COMPANIES_LEVEL_3 sobreescribe el global", () => {
    process.env.AI_LEARNING_LEVEL = "1";
    process.env.AI_LEARNING_COMPANIES_LEVEL_3 = "12,17";
    expect(AILearningFeatureFlag.getLevel(12)).toBe(3);
    expect(AILearningFeatureFlag.getLevel(17)).toBe(3);
    expect(AILearningFeatureFlag.getLevel(99)).toBe(1);
    expect(AILearningFeatureFlag.canSupersedeHistoricalQA(12)).toBe(true);
  });

  test("override más alto gana si una company aparece en varios niveles", () => {
    process.env.AI_LEARNING_COMPANIES_LEVEL_1 = "5";
    process.env.AI_LEARNING_COMPANIES_LEVEL_2 = "5";
    process.env.AI_LEARNING_COMPANIES_LEVEL_3 = "5";
    expect(AILearningFeatureFlag.getLevel(5)).toBe(3);
  });

  test("valores fuera de rango caen al default", () => {
    process.env.AI_LEARNING_LEVEL = "999";
    expect(AILearningFeatureFlag.getLevel(1)).toBe(0);
    process.env.AI_LEARNING_LEVEL = "abc";
    expect(AILearningFeatureFlag.getLevel(1)).toBe(0);
  });

  test("companyId inválido retorna 0", () => {
    process.env.AI_LEARNING_LEVEL = "3";
    expect(AILearningFeatureFlag.getLevel(0)).toBe(0);
    expect(AILearningFeatureFlag.getLevel(-1)).toBe(0);
  });

  test("requiresHumanReview: tipos críticos siempre, sin importar confidence", () => {
    for (const type of CRITICAL_CORRECTION_TYPES) {
      expect(AILearningFeatureFlag.requiresHumanReview(type, 0.99)).toBe(true);
      expect(AILearningFeatureFlag.requiresHumanReview(type, 0.5)).toBe(true);
    }
  });

  test("requiresHumanReview: tipo NO crítico con baja confidence va a review", () => {
    expect(AILearningFeatureFlag.requiresHumanReview("policy_correction", 0.5)).toBe(true);
    expect(AILearningFeatureFlag.requiresHumanReview("factual_contradiction", 0.84)).toBe(true);
  });

  test("requiresHumanReview: tipo NO crítico con alta confidence se auto-aprende", () => {
    expect(AILearningFeatureFlag.requiresHumanReview("policy_correction", 0.92)).toBe(false);
    expect(AILearningFeatureFlag.requiresHumanReview("human_clarification", 0.88)).toBe(false);
  });

  test("CRITICAL_CORRECTION_TYPES contiene los 6 tipos acordados", () => {
    expect(CRITICAL_CORRECTION_TYPES).toEqual(expect.arrayContaining([
      "price_correction",
      "payment_override",
      "appointment_override",
      "status_override",
      "contract_override",
      "availability_override"
    ]));
    expect(CRITICAL_CORRECTION_TYPES.length).toBe(6);
  });

  test("getClassifierModel devuelve gpt-5.5 por default", () => {
    delete process.env.AI_LEARNING_CLASSIFIER_MODEL;
    expect(AILearningFeatureFlag.getClassifierModel()).toBe("gpt-5.5");
    process.env.AI_LEARNING_CLASSIFIER_MODEL = "gpt-4o-mini";
    expect(AILearningFeatureFlag.getClassifierModel()).toBe("gpt-4o-mini");
  });
});

// ════════════════════════════════════════════════════════════════════
// CorrectionScopeMatcher
// ════════════════════════════════════════════════════════════════════
describe("CorrectionScopeMatcher.matches", () => {
  test("companyId distinto: nunca matchea", () => {
    expect(CorrectionScopeMatcher.matches(
      { companyId: 1 },
      { companyId: 2 }
    )).toBe(false);
  });

  test("scope solo con companyId: wildcard para todo lo demás", () => {
    expect(CorrectionScopeMatcher.matches(
      { companyId: 1 },
      { companyId: 1, queueId: 5, productKey: "gps", intent: "sales" }
    )).toBe(true);
  });

  test("queueId definido en scope: debe coincidir", () => {
    expect(CorrectionScopeMatcher.matches(
      { companyId: 1, queueId: 5 },
      { companyId: 1, queueId: 5 }
    )).toBe(true);
    expect(CorrectionScopeMatcher.matches(
      { companyId: 1, queueId: 5 },
      { companyId: 1, queueId: 7 }
    )).toBe(false);
  });

  test("productKey case-insensitive y con trim", () => {
    expect(CorrectionScopeMatcher.matches(
      { companyId: 1, productKey: "GPS" },
      { companyId: 1, productKey: "  gps  " }
    )).toBe(true);
  });

  test("productKey definido en scope: turno sin producto → NO matchea", () => {
    expect(CorrectionScopeMatcher.matches(
      { companyId: 1, productKey: "gps" },
      { companyId: 1 }
    )).toBe(false);
  });

  test("intent definido en scope: debe coincidir case-insensitive", () => {
    expect(CorrectionScopeMatcher.matches(
      { companyId: 1, intent: "sales_inquiry" },
      { companyId: 1, intent: "SALES_INQUIRY" }
    )).toBe(true);
    expect(CorrectionScopeMatcher.matches(
      { companyId: 1, intent: "sales_inquiry" },
      { companyId: 1, intent: "support_request" }
    )).toBe(false);
  });
});

describe("CorrectionScopeMatcher.specificityScore", () => {
  test("solo companyId = 1", () => {
    expect(CorrectionScopeMatcher.specificityScore({ companyId: 1 })).toBe(1);
  });

  test("+ queueId = 3", () => {
    expect(CorrectionScopeMatcher.specificityScore({
      companyId: 1, queueId: 5
    })).toBe(3);
  });

  test("+ productKey = 3 (sin queue) o 5 (con queue)", () => {
    expect(CorrectionScopeMatcher.specificityScore({
      companyId: 1, productKey: "gps"
    })).toBe(3);
    expect(CorrectionScopeMatcher.specificityScore({
      companyId: 1, queueId: 5, productKey: "gps"
    })).toBe(5);
  });

  test("máximo posible = 6 (todos los campos)", () => {
    expect(CorrectionScopeMatcher.specificityScore({
      companyId: 1, queueId: 5, productKey: "gps", intent: "sales"
    })).toBe(6);
  });
});

describe("CorrectionScopeMatcher.sortByRelevance", () => {
  test("más específica primero, empate desempata por priority", () => {
    const c1 = { scopeJson: { companyId: 1 }, priority: 100 };
    const c2 = { scopeJson: { companyId: 1, queueId: 5 }, priority: 100 };
    const c3 = { scopeJson: { companyId: 1, queueId: 5, productKey: "gps" }, priority: 100 };
    const c4 = { scopeJson: { companyId: 1, queueId: 5 }, priority: 10 };

    const sorted = CorrectionScopeMatcher.sortByRelevance([c1, c2, c3, c4]);
    expect(sorted[0]).toBe(c3); // 5
    expect(sorted[1]).toBe(c4); // 3, priority 10
    expect(sorted[2]).toBe(c2); // 3, priority 100
    expect(sorted[3]).toBe(c1); // 1
  });
});

describe("CorrectionScopeMatcher.normalizeScope", () => {
  test("companyId siempre se preserva", () => {
    expect(CorrectionScopeMatcher.normalizeScope({}, 42).companyId).toBe(42);
  });

  test("queueId string convertido a number", () => {
    expect(CorrectionScopeMatcher.normalizeScope({ queueId: "5" }, 1).queueId).toBe(5);
  });

  test("queueId 0 o negativo se descarta", () => {
    expect(CorrectionScopeMatcher.normalizeScope({ queueId: 0 }, 1).queueId).toBeUndefined();
    expect(CorrectionScopeMatcher.normalizeScope({ queueId: -3 }, 1).queueId).toBeUndefined();
  });

  test("productKey con espacios se hace trim", () => {
    expect(CorrectionScopeMatcher.normalizeScope({ productKey: "  GPS  " }, 1).productKey).toBe("GPS");
  });

  test("productKey vacío se descarta", () => {
    expect(CorrectionScopeMatcher.normalizeScope({ productKey: "" }, 1).productKey).toBeUndefined();
    expect(CorrectionScopeMatcher.normalizeScope({ productKey: "   " }, 1).productKey).toBeUndefined();
  });

  test("entrada no-objeto produce scope con solo companyId", () => {
    expect(CorrectionScopeMatcher.normalizeScope(null, 1)).toEqual({ companyId: 1 });
    expect(CorrectionScopeMatcher.normalizeScope("foo", 1)).toEqual({ companyId: 1 });
    expect(CorrectionScopeMatcher.normalizeScope(undefined, 1)).toEqual({ companyId: 1 });
  });
});
