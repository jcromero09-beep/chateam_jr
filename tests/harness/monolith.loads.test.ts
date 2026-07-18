/**
 * Intento acotado: ¿importa wbotMessageListener.ts (el monolito) bajo el AST transform,
 * mockeando solo la INFRAESTRUCTURA con side-effects al cargar (colas Bull, socket, cache,
 * Sentry)? Objetivo: confirmar que el blocker de idiomas ESM está resuelto y CARACTERIZAR
 * el primer blocker restante (que ya no debería ser createRequire/import.meta).
 */
jest.mock("../../queues", () => ({
  campaignQueue: { add: jest.fn() },
  parseToMilliseconds: jest.fn(() => 0),
  randomValue: jest.fn(() => 0),
}));
jest.mock("../../libs/socket", () => ({
  getIO: jest.fn(() => ({ emit: jest.fn(), to: jest.fn(() => ({ emit: jest.fn() })), of: jest.fn(() => ({ emit: jest.fn() })) })),
}));
jest.mock("../../libs/cache", () => ({ __esModule: true, default: { get: jest.fn(), set: jest.fn(), del: jest.fn() } }));
jest.mock("@sentry/node", () => ({ captureException: jest.fn(), startTransaction: jest.fn() }));
// baileys (y subpaths) se mapea a un stub en jest.harness.config.cjs (moduleNameMapper).

describe("Monolito wbotMessageListener — importa bajo el AST transform", () => {
  it("carga el módulo (blocker ESM resuelto)", async () => {
    const mod = await import("../../services/WbotServices/wbotMessageListener");
    expect(mod).toBeDefined();
  });
});
