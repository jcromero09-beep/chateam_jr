/**
 * Stub universal para `baileys` y TODOS sus subpaths (ESM-only, jest no los transforma).
 * Un Proxy callable/construible que devuelve el mismo proxy para cualquier acceso, así
 * cubre default + named imports + accesos anidados (proto.Message, etc.) sin enumerar.
 * Solo para characterization tests del harness; producción usa el baileys real vía tsx.
 */
// Implementaciones FIELES (portadas de baileys) de las funciones puras que usan los parsers,
// para que los characterization tests locken comportamiento real y no el del stub.
function extractMessageContent(content) {
  const unwrap = (m) => {
    if (!m || typeof m !== "object") return m;
    if (m.ephemeralMessage) return extractMessageContent(m.ephemeralMessage.message);
    if (m.viewOnceMessage) return extractMessageContent(m.viewOnceMessage.message);
    if (m.viewOnceMessageV2) return extractMessageContent(m.viewOnceMessageV2.message);
    if (m.viewOnceMessageV2Extension) return extractMessageContent(m.viewOnceMessageV2Extension.message);
    if (m.documentWithCaptionMessage) return extractMessageContent(m.documentWithCaptionMessage.message);
    if (m.editedMessage) return extractMessageContent(m.editedMessage.message);
    return m;
  };
  return content ? unwrap(content) : undefined;
}
// getContentType: impl FIEL de baileys (devuelve la key del tipo de contenido del mensaje).
function getContentType(content) {
  if (content) {
    const keys = Object.keys(content);
    const key = keys.find(
      (k) => (k === "conversation" || k.endsWith("Message")) && k !== "senderKeyDistributionMessage"
    );
    return key;
  }
}
function jidNormalizedUser(jid) {
  if (!jid || typeof jid !== "string") return jid;
  const [user, server] = jid.split("@");
  const u = (user || "").split(":")[0].split("_")[0];
  return u + "@" + (server === "lid" ? "lid" : "s.whatsapp.net");
}
// delay: NO-OP real (baileys lo re-exporta). Sin esto, `await delay(ms)` = `await proxy` que colgaba.
const delay = () => Promise.resolve();
// downloadMediaMessage: devuelve un Buffer real minúsculo (cabecera JPEG) para que
// verifyMediaMessage haga `.toString("base64")` sobre datos reales sin red ni proxy.
async function downloadMediaMessage() {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
}
const realish = { extractMessageContent, getContentType, jidNormalizedUser, delay, downloadMediaMessage };

const handler = {
  get(_target, prop) {
    if (prop === "__esModule") return true;
    // El Proxy NO debe parecer un thenable: si `then` devolviera el proxy (callable),
    // `await <valor-proxy>` invocaría then(resolve) y nunca resolvería → cuelgue infinito.
    if (prop === "then" || prop === "catch" || prop === "finally") return undefined;
    if (Object.prototype.hasOwnProperty.call(realish, prop)) return realish[prop];
    return proxy; // cualquier otro named/default → el mismo proxy
  },
  apply() {
    return proxy;
  },
  construct() {
    return proxy;
  },
};
const proxy = new Proxy(function baileysStub() {}, handler);
module.exports = proxy;
