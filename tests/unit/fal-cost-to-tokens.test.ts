import { describe, expect, test } from "@jest/globals";
import {
  FAL_USD_TO_COMPANY_TOKENS,
  falCostUsdToCompanyTokens,
  getCreditTypeKeyForAdapter,
  buildFalBillingMetadata
} from "../../services/Billing/falCostToCompanyTokens";

// ---------------------------------------------------------------------------
// Conversión USD → tokens
// ---------------------------------------------------------------------------
describe("falCostUsdToCompanyTokens", () => {
  test("constante de conversión = 100 (1 USD → 100 tokens)", () => {
    expect(FAL_USD_TO_COMPANY_TOKENS).toBe(100);
  });

  test("0 USD → 0 tokens (no descontar)", () => {
    expect(falCostUsdToCompanyTokens(0)).toBe(0);
  });

  test("0.04 USD (Nano Banana 1 img) → 4 tokens", () => {
    expect(falCostUsdToCompanyTokens(0.04)).toBe(4);
  });

  test("0.30 USD (Kling 2.6 5s) → 30 tokens", () => {
    expect(falCostUsdToCompanyTokens(0.3)).toBe(30);
  });

  test("3.20 USD (Veo 8s) → 320 tokens", () => {
    expect(falCostUsdToCompanyTokens(3.2)).toBe(320);
  });

  test("0.001 USD (micro) → 1 token (ceil garantiza ≥ 1)", () => {
    expect(falCostUsdToCompanyTokens(0.001)).toBe(1);
  });

  test("0.099 USD → 10 tokens (ceil de 9.9)", () => {
    expect(falCostUsdToCompanyTokens(0.099)).toBe(10);
  });

  test("0.10 USD → 10 tokens (exacto, no overshoot)", () => {
    expect(falCostUsdToCompanyTokens(0.1)).toBe(10);
  });

  test("0.11 USD → 11 tokens", () => {
    expect(falCostUsdToCompanyTokens(0.11)).toBe(11);
  });

  // --- Inputs inválidos ---
  test("null → throw", () => {
    expect(() => falCostUsdToCompanyTokens(null)).toThrow(/null\/undefined/);
  });

  test("undefined → throw", () => {
    expect(() => falCostUsdToCompanyTokens(undefined)).toThrow(/null\/undefined/);
  });

  test("NaN → throw", () => {
    expect(() => falCostUsdToCompanyTokens(NaN)).toThrow(/inválido/);
  });

  test("Infinity → throw", () => {
    expect(() => falCostUsdToCompanyTokens(Infinity)).toThrow(/inválido/);
  });

  test("negativo → throw", () => {
    expect(() => falCostUsdToCompanyTokens(-0.05)).toThrow(/negativo/);
  });

  test("string-like (TS coerced) → throw por no ser número", () => {
    // El tipo es number pero JS puede pasar otra cosa por la frontera
    expect(() =>
      falCostUsdToCompanyTokens("0.5" as unknown as number)
    ).toThrow(/inválido/);
  });
});

// ---------------------------------------------------------------------------
// Mapping categoría → creditTypeKey
// ---------------------------------------------------------------------------
describe("getCreditTypeKeyForAdapter", () => {
  test("text-to-image → image", () => {
    expect(
      getCreditTypeKeyForAdapter({
        category: "text-to-image",
        key: "nano-banana-2"
      })
    ).toBe("image");
  });

  test("image-to-image → image", () => {
    expect(
      getCreditTypeKeyForAdapter({
        category: "image-to-image",
        key: "nano-banana-2-edit"
      })
    ).toBe("image");
  });

  test("text-to-video → ugc_video", () => {
    expect(
      getCreditTypeKeyForAdapter({
        category: "text-to-video",
        key: "veo3.1-t2v"
      })
    ).toBe("ugc_video");
  });

  test("image-to-video → ugc_video", () => {
    expect(
      getCreditTypeKeyForAdapter({
        category: "image-to-video",
        key: "seedance-v1-pro-i2v"
      })
    ).toBe("ugc_video");
  });

  test("video-to-video → ugc_video", () => {
    expect(
      getCreditTypeKeyForAdapter({
        category: "video-to-video",
        key: "kling-v3-pro-motion-control"
      })
    ).toBe("ugc_video");
  });

  test("text-to-speech → tts_character", () => {
    expect(
      getCreditTypeKeyForAdapter({
        category: "text-to-speech",
        key: "elevenlabs-tts-v3"
      })
    ).toBe("tts_character");
  });

  test("lipsync → ugc_video", () => {
    expect(
      getCreditTypeKeyForAdapter({
        category: "lipsync",
        key: "sync-lipsync"
      })
    ).toBe("ugc_video");
  });

  test("categoría desconocida → throw", () => {
    expect(() =>
      getCreditTypeKeyForAdapter({
        category: "fake-category" as never,
        key: "fake"
      })
    ).toThrow(/sin mapping/);
  });
});

// ---------------------------------------------------------------------------
// buildFalBillingMetadata
// ---------------------------------------------------------------------------
describe("buildFalBillingMetadata", () => {
  test("incluye todos los campos requeridos para auditoría", () => {
    const billing = buildFalBillingMetadata({
      adapter: {
        key: "kling-v2.6-pro-i2v",
        modelId: "fal-ai/kling-video/v2.6/pro/image-to-video",
        category: "image-to-video"
      },
      estimatedCostUsd: 0.3,
      tokensCharged: 30,
      creditTypeKey: "ugc_video",
      companyId: 10,
      campaignId: 4,
      videoJobId: 100,
      step: "video"
    });

    expect(billing).toMatchObject({
      provider: "fal",
      modelKey: "kling-v2.6-pro-i2v",
      modelId: "fal-ai/kling-video/v2.6/pro/image-to-video",
      estimatedCostUsd: 0.3,
      tokenConversionRate: 100,
      tokensCharged: 30,
      creditTypeKey: "ugc_video",
      companyId: 10,
      campaignId: 4,
      videoJobId: 100,
      step: "video"
    });
    expect(billing.chargedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO
  });

  test("refundedAt/refundReason no se setean al construir (solo on-error)", () => {
    const billing = buildFalBillingMetadata({
      adapter: {
        key: "x",
        modelId: "y",
        category: "image-to-video"
      },
      estimatedCostUsd: 0.5,
      tokensCharged: 50,
      creditTypeKey: "ugc_video",
      companyId: 1,
      campaignId: 1,
      videoJobId: 1
    });
    expect(billing.refundedAt).toBeUndefined();
    expect(billing.refundReason).toBeUndefined();
  });
});
