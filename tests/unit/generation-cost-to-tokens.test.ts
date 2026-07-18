import { describe, expect, test } from "@jest/globals";
import {
  generationCostUsdToCompanyTokens,
  getCreditTypeKeyForMediaType,
  GENERATION_USD_TO_COMPANY_TOKENS,
  buildGenerationBillingMetadata
} from "../../services/Billing/generationCostToCompanyTokens";
import type { GenerationRequest } from "../../services/Generation/types";

describe("generationCostToCompanyTokens", () => {
  test("tasa de conversión es 100 (1 USD = 100 créditos)", () => {
    expect(GENERATION_USD_TO_COMPANY_TOKENS).toBe(100);
  });

  test("convierte USD a créditos con Math.ceil", () => {
    expect(generationCostUsdToCompanyTokens(0.12)).toBe(12);
    expect(generationCostUsdToCompanyTokens(0.601)).toBe(61); // ceil(60.1)
    expect(generationCostUsdToCompanyTokens(0.001)).toBe(1); // micro → 1
  });

  test("costo 0 → 0 créditos", () => {
    expect(generationCostUsdToCompanyTokens(0)).toBe(0);
  });

  test("inputs inválidos lanzan error (no descontar en silencio)", () => {
    expect(() => generationCostUsdToCompanyTokens(null)).toThrow();
    expect(() => generationCostUsdToCompanyTokens(undefined)).toThrow();
    expect(() => generationCostUsdToCompanyTokens(NaN)).toThrow();
    expect(() => generationCostUsdToCompanyTokens(Infinity)).toThrow();
    expect(() => generationCostUsdToCompanyTokens(-1)).toThrow();
  });

  test("mapping mediaType → creditTypeKey coincide con fal", () => {
    expect(getCreditTypeKeyForMediaType("image")).toBe("image");
    expect(getCreditTypeKeyForMediaType("video")).toBe("ugc_video");
  });

  test("buildGenerationBillingMetadata arma el bloque de auditoría", () => {
    const req: GenerationRequest = {
      tenantId: 7,
      mediaType: "video",
      modelId: "higgsfield-dop-cinema-video",
      prompt: "una escena épica",
      styleId: "drama",
      idempotencyKey: "gen_abc123"
    };
    const meta = buildGenerationBillingMetadata({
      provider: "higgsfield",
      req,
      providerCostUsd: 0.6,
      markup: 1,
      creditsCharged: 60,
      creditTypeKey: "ugc_video",
      requestId: "job_1"
    });

    expect(meta).toMatchObject({
      provider: "higgsfield",
      modelId: "higgsfield-dop-cinema-video",
      styleId: "drama",
      providerCostUsd: 0.6,
      costUsdWithMarkup: 0.6,
      tokenConversionRate: 100,
      creditsCharged: 60,
      creditTypeKey: "ugc_video",
      companyId: 7,
      idempotencyKey: "gen_abc123",
      requestId: "job_1"
    });
    expect(typeof meta.chargedAt).toBe("string");
  });
});
