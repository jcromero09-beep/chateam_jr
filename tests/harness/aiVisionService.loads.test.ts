/**
 * Harness — "prueba de 1 archivo" (bloqueador #0 del split del monolito).
 *
 * Los 90 archivos con `const require = createRequire(import.meta.url)` no se pueden
 * importar bajo ts-jest (CJS): `require` ya existe → "Identifier 'require' has already
 * been declared", y `import.meta` es inválido con module=commonjs. Eso impide meter
 * wbotMessageListener.ts (y su grafo) en jest.
 *
 * Esta prueba aísla el fix en UN archivo (AIVisionService) mockeando sus dependencias
 * internas, y verifica que el módulo se importa en verde tras aplicar el recipe.
 */
jest.mock("../../utils/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../services/AIProviderService", () => ({
  getApiKeyWithFallback: jest.fn(async () => "test-key"),
}));
jest.mock("../../services/AICreditServices/DeductCreditsService", () => ({
  __esModule: true,
  default: jest.fn(async () => undefined),
}));
jest.mock("../../services/AICreditServices/CalculateCreditCostService", () => ({
  __esModule: true,
  default: jest.fn(async () => ({ creditTypeKey: "x", amount: 0 })),
}));

import AIVisionService from "../../services/AIMultimodalServices/AIVisionService";

describe("Harness createRequire — AIVisionService carga bajo jest", () => {
  it("expone analyzeImage tras el fix del preámbulo createRequire", () => {
    expect(AIVisionService).toBeDefined();
    expect(typeof (AIVisionService as any).analyzeImage).toBe("function");
  });
});
