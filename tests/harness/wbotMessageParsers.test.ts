/**
 * Characterization tests de los parsers extraídos en Tier 0 (getQuotedMessage / getQuotedMessageId
 * / getTypeMessage / getBodyMessage). Fijan el comportamiento OBSERVABLE de las funciones (movidas
 * verbatim del monolito) para detectar cualquier cambio futuro. extractMessageContent y
 * getContentType vienen del stub fiel de baileys; Sentry se mockea (solo se usa en el error path).
 */
jest.mock("@sentry/node", () => ({ setExtra: jest.fn(), captureException: jest.fn() }));

import {
  getQuotedMessage,
  getQuotedMessageId,
  getTypeMessage,
  getBodyMessage,
  getEditProtocolMessage,
  unpackEditedMessage,
  extractEditedBody,
  extractEditedOriginalWid,
  extractEditedRemoteJids,
  extractEditedTimestamp,
} from "../../services/WbotServices/wbotMessageParsers";

describe("getQuotedMessageId (characterization)", () => {
  it("devuelve el id de la reacción cuando el mensaje es reactionMessage", () => {
    const msg: any = { message: { reactionMessage: { key: { id: "RID9" }, text: "👍" } } };
    expect(getQuotedMessageId(msg)).toBe("RID9");
  });

  it("devuelve el stanzaId citado cuando hay contextInfo", () => {
    const msg: any = {
      message: { extendedTextMessage: { text: "hola", contextInfo: { stanzaId: "ABC123" } } },
    };
    expect(getQuotedMessageId(msg)).toBe("ABC123");
  });

  it("devuelve undefined cuando no hay reacción ni cita", () => {
    const msg: any = { message: { conversation: "hola" } };
    expect(getQuotedMessageId(msg)).toBeUndefined();
  });
});

describe("getQuotedMessage (characterization)", () => {
  it("devuelve el contenido citado desde contextInfo.quotedMessage", () => {
    const msg: any = {
      message: {
        extendedTextMessage: {
          contextInfo: { quotedMessage: { conversation: "texto citado" } },
        },
      },
    };
    expect(getQuotedMessage(msg)).toBe("texto citado");
  });

  it("devuelve undefined cuando no hay quotedMessage", () => {
    const msg: any = { message: { conversation: "hi" } };
    expect(getQuotedMessage(msg)).toBeUndefined();
  });
});

describe("getTypeMessage (characterization)", () => {
  it("devuelve 'conversation' para texto simple", () => {
    const msg: any = { message: { conversation: "hola" } };
    expect(getTypeMessage(msg)).toBe("conversation");
  });

  it("devuelve el tipo del contenido (extendedTextMessage) vía getContentType", () => {
    const msg: any = { message: { extendedTextMessage: { text: "hola" } } };
    expect(getTypeMessage(msg)).toBe("extendedTextMessage");
  });

  it("devuelve 'adMetaPreview' cuando hay externalAdReply", () => {
    const msg: any = {
      message: { extendedTextMessage: { contextInfo: { externalAdReply: { title: "ad" } } } },
    };
    expect(getTypeMessage(msg)).toBe("adMetaPreview");
  });

  it("devuelve 'viewOnceMessageV2' para mensajes de una sola vista", () => {
    const msg: any = { message: { viewOnceMessageV2: { message: { imageMessage: {} } } } };
    expect(getTypeMessage(msg)).toBe("viewOnceMessageV2");
  });
});

describe("getBodyMessage (characterization)", () => {
  // Los mensajes reales de Baileys SIEMPRE traen `key` (getAd accede a msg.key.fromMe).
  const K = { fromMe: false } as any;
  it("texto simple (conversation)", () => {
    expect(getBodyMessage({ key: K, message: { conversation: "hola" } } as any)).toBe("hola");
  });
  it("texto extendido (extendedTextMessage)", () => {
    expect(
      getBodyMessage({ key: K, message: { extendedTextMessage: { text: "texto" } } } as any)
    ).toBe("texto");
  });
  it("caption de imagen (imageMessage)", () => {
    expect(
      getBodyMessage({ key: K, message: { imageMessage: { caption: "foto" } } } as any)
    ).toBe("foto");
  });
  it("sticker se mapea a 'sticker'", () => {
    expect(getBodyMessage({ key: K, message: { stickerMessage: {} } } as any)).toBe("sticker");
  });
  it("audio se mapea a 'Áudio'", () => {
    expect(getBodyMessage({ key: K, message: { audioMessage: {} } } as any)).toBe("Áudio");
  });
});


describe("edit parsers (characterization)", () => {
  const editMsg: any = {
    protocolMessage: {
      type: 14,
      key: { id: "ORIG123", remoteJid: "123@s.whatsapp.net" },
      editedMessage: { conversation: "texto editado" },
      timestampMs: 1700000000000,
    },
  };
  it("getEditProtocolMessage encuentra el protocolMessage de edicion (type 14)", () => {
    const pm = getEditProtocolMessage(editMsg);
    expect(pm?.type).toBe(14);
    expect(pm?.editedMessage?.conversation).toBe("texto editado");
  });
  it("unpackEditedMessage devuelve el contenido editado", () => {
    expect(unpackEditedMessage(editMsg)?.conversation).toBe("texto editado");
  });
  it("extractEditedBody devuelve el texto editado", () => {
    expect(extractEditedBody(editMsg)).toBe("texto editado");
  });
  it("extractEditedBody devuelve null si no hay cuerpo editado", () => {
    expect(extractEditedBody({} as any)).toBeNull();
  });
  it("extractEditedOriginalWid devuelve el id original", () => {
    expect(extractEditedOriginalWid(undefined, editMsg)).toBe("ORIG123");
  });
  it("extractEditedRemoteJids devuelve los JIDs con @", () => {
    expect(extractEditedRemoteJids(undefined, editMsg)).toEqual(["123@s.whatsapp.net"]);
  });
  it("extractEditedTimestamp parsea timestampMs a Date", () => {
    expect(extractEditedTimestamp(editMsg).getTime()).toBe(1700000000000);
  });
});
