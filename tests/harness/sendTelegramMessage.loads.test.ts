/**
 * Harness — recipe B (require lazy relativo / rompe-ciclos).
 *
 * A diferencia de AIVisionService (require externo → import), aquí el require
 * `require("../../models/Telegram").default` está DENTRO de una función async para
 * diferir la carga del modelo (rompe dependencia circular). No se puede convertir a
 * import top-level sin arriesgar el ciclo. Como el call site es async, el recipe es
 * `require("x").default` → `(await import("x")).default`: import dinámico nativo (lazy
 * en ESM, transpila a require en CJS). Sin createRequire, sin import.meta.
 *
 * Se mockea el grafo pesado (modelos Sequelize, socket, TelegramBotAPI) para probar
 * solo que el módulo IMPORTA en verde bajo ts-jest tras el fix.
 */
jest.mock("../../models/Whatsapp", () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock("../../services/TelegramService/TelegramBotAPI", () => ({
  __esModule: true,
  default: class TelegramBotAPI {},
}));
jest.mock("../../utils/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../services/MessageServices/CreateMessageService", () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock("../../libs/socket", () => ({ getIO: jest.fn() }));

import SendTelegramMessage from "../../services/TelegramService/SendTelegramMessage";

describe("Harness createRequire recipe B — SendTelegramMessage carga bajo jest", () => {
  it("importa en verde tras convertir el require lazy a await import()", () => {
    expect(typeof SendTelegramMessage).toBe("function");
  });
});
