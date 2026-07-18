import {
  calculateTokenCostUsd,
  normalizePricingModel
} from "../../services/TokenTrackingService/AITokenPricingService";

describe("AITokenPricingService", () => {
  test("normaliza modelos versionados de OpenAI", () => {
    expect(normalizePricingModel("gpt-4o-2024-08-06")).toBe("gpt-4o");
    expect(normalizePricingModel("gpt-4.1-2025-04-14")).toBe("gpt-4.1");
    expect(normalizePricingModel("gpt-4.1-nano-2025-04-14")).toBe("gpt-4.1-nano");
    expect(normalizePricingModel("gpt-5.5-2026-04-23")).toBe("gpt-5.5");
  });

  test("calcula el costo historico de las peticiones observadas", () => {
    expect(calculateTokenCostUsd("gpt-4o-2024-08-06", 1285, 309))
      .toBeCloseTo(0.0063025, 8);
    expect(calculateTokenCostUsd("gpt-4.1-2025-04-14", 4068, 508))
      .toBeCloseTo(0.0122, 8);
    expect(calculateTokenCostUsd("gpt-4.1-nano-2025-04-14", 1367, 90))
      .toBeCloseTo(0.0001727, 8);
    expect(calculateTokenCostUsd("gpt-5.5-2026-04-23", 213596, 16803))
      .toBeCloseTo(1.57207, 5);
  });

  test("calcula embeddings solo con tokens de entrada", () => {
    expect(calculateTokenCostUsd("text-embedding-3-small", 2121, 0))
      .toBeCloseTo(0.00004242, 10);
  });

  test("un modelo desconocido no inventa costo", () => {
    expect(calculateTokenCostUsd("modelo-desconocido", 1000, 1000)).toBe(0);
  });
});
