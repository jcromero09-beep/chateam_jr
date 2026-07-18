/**
 * Fixtures de payloads Baileys realistas para characterization de handleMessage/handleMsgAck
 * (Tiers 8/10/11, cuando exista la DB de test). Formas basadas en proto.IWebMessageInfo.
 * NO dependen de baileys en runtime — son objetos planos con la estructura que el hot-path lee.
 *
 * El "pre-requisito innegociable" del plan: estos fixtures + DB de test + regression-sondas.
 */

type AnyMsg = any;

const baseKey = (over: Partial<{ id: string; fromMe: boolean; remoteJid: string; participant: string }> = {}) => ({
  remoteJid: over.remoteJid ?? "593999999999@s.whatsapp.net",
  fromMe: over.fromMe ?? false,
  id: over.id ?? "3EB0" + "ABCDEF0123456789",
  participant: over.participant,
});

const wrap = (message: AnyMsg, keyOver = {}, tsOver?: number): AnyMsg => ({
  key: baseKey(keyOver),
  message,
  messageTimestamp: tsOver ?? 1700000000,
  pushName: "Cliente Prueba",
  status: 2,
});

export const fixtures = {
  // Texto simple
  text: () => wrap({ conversation: "Hola, necesito ayuda" }),

  // Texto extendido (con cita a otro mensaje)
  extendedTextQuoted: () =>
    wrap({
      extendedTextMessage: {
        text: "Respondo a tu mensaje",
        contextInfo: {
          stanzaId: "QUOTED123",
          participant: "593999999999@s.whatsapp.net",
          quotedMessage: { conversation: "mensaje citado" },
        },
      },
    }),

  // Imagen con caption
  imageWithCaption: () =>
    wrap({
      imageMessage: {
        caption: "Aquí la foto del producto",
        mimetype: "image/jpeg",
        url: "https://mmg.whatsapp.net/…",
        mediaKey: "AAAA",
        fileLength: 12345,
      },
    }),

  // Audio (nota de voz)
  audio: () =>
    wrap({ audioMessage: { mimetype: "audio/ogg; codecs=opus", seconds: 5, ptt: true, mediaKey: "BBBB" } }),

  sticker: () => wrap({ stickerMessage: { mimetype: "image/webp", mediaKey: "CCCC" } }),

  location: () =>
    wrap({
      locationMessage: { degreesLatitude: -2.9, degreesLongitude: -79.0, jpegThumbnail: Buffer.from([1, 2, 3]) },
    }),

  reaction: () =>
    wrap({ reactionMessage: { key: { id: "TARGET123", remoteJid: "593999999999@s.whatsapp.net" }, text: "👍" } }),

  // Mensaje editado (protocolMessage type 14 = MESSAGE_EDIT)
  edited: () =>
    wrap({
      protocolMessage: {
        type: 14,
        key: { id: "ORIG123", remoteJid: "593999999999@s.whatsapp.net" },
        editedMessage: { conversation: "texto corregido" },
        timestampMs: 1700000005000,
      },
    }),

  // Mensaje de grupo (remoteJid @g.us + participant)
  group: () =>
    wrap(
      { conversation: "mensaje en el grupo" },
      { remoteJid: "593000000000-123456@g.us", participant: "593999999999@s.whatsapp.net" }
    ),

  // Ciphertext / no desencriptable (llega sin message util → el hot-path debe ignorarlo o reintentar)
  ciphertext: () => wrap({ senderKeyDistributionMessage: { groupId: "593000000000-123456@g.us" } }),

  fromMe: () => wrap({ conversation: "respuesta del agente" }, { fromMe: true }),
};

export type FixtureName = keyof typeof fixtures;
