/**
 * Token de verificación de los webhooks de Meta (el `hub.verify_token` del
 * handshake de suscripción).
 *
 * Antes cada callsite caía a un literal por defecto — "whaticket" (el default
 * público del proyecto upstream) o "chateam_fb_verify". Un default público no
 * es un secreto: cualquiera que conozca la URL del webhook puede apuntar su
 * propia app de Meta contra ella, superar el handshake y quedar suscrito.
 *
 * Ahora se falla cerrado: si no está configurado, el handshake se rechaza.
 */
export const getMetaVerifyToken = (): string | null => {
  const raw = process.env.VERIFY_TOKEN;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Variante para los webhooks de páginas de Facebook, que admiten un token
 * propio (FACEBOOK_VERIFY_TOKEN) y si no reutilizan el global.
 */
export const getFacebookVerifyToken = (): string | null => {
  const raw = process.env.FACEBOOK_VERIFY_TOKEN;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed.length > 0 ? trimmed : getMetaVerifyToken();
};

export default { getMetaVerifyToken, getFacebookVerifyToken };
