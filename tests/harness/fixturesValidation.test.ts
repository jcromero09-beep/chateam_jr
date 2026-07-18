/**
 * Valida que los fixtures Baileys son realistas: los parsers ya extraídos producen los
 * valores esperados. Doble propósito: prueba de los fixtures + cobertura extra de parsers.
 */
jest.mock("@sentry/node", () => ({ setExtra: jest.fn(), captureException: jest.fn() }));

import { fixtures } from "./baileysFixtures";
import {
  getBodyMessage,
  getTypeMessage,
  getQuotedMessageId,
  extractEditedBody,
} from "../../services/WbotServices/wbotMessageParsers";

describe("fixtures Baileys × parsers", () => {
  it("text → body 'Hola, necesito ayuda'", () => {
    expect(getBodyMessage(fixtures.text())).toBe("Hola, necesito ayuda");
  });
  it("imageWithCaption → caption", () => {
    expect(getBodyMessage(fixtures.imageWithCaption())).toBe("Aquí la foto del producto");
  });
  it("audio → 'Áudio' y tipo audioMessage", () => {
    expect(getTypeMessage(fixtures.audio())).toBe("audioMessage");
    expect(getBodyMessage(fixtures.audio())).toBe("Áudio");
  });
  it("extendedTextQuoted → stanzaId citado", () => {
    expect(getQuotedMessageId(fixtures.extendedTextQuoted())).toBe("QUOTED123");
  });
  it("edited → cuerpo editado", () => {
    expect(extractEditedBody(fixtures.edited().message)).toBe("texto corregido");
  });
  it("group → mensaje del grupo", () => {
    expect(getBodyMessage(fixtures.group())).toBe("mensaje en el grupo");
  });
});
