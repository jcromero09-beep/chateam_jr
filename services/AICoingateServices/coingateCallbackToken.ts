/**
 * Autenticación de los callbacks de CoinGate.
 *
 * CoinGate NO firma sus callbacks (la API v2 no manda ningún header HMAC). Su
 * recomendación oficial es (a) un token secreto en la callback_url y (b) lista
 * blanca de IPs. Aquí se implementa (a); la defensa que de verdad cierra el
 * agujero — releer el estado y el importe desde la API en vez de creerle al
 * body — vive en CoingateService.processWebhook.
 *
 * Módulo aparte (sin createRequire/import.meta) para poder testearlo bajo ts-jest.
 */
import { timingSafeEqual } from "crypto";

import logger from "../../utils/logger";

export const getCallbackToken = (): string | null => {
  const t = process.env.COINGATE_CALLBACK_TOKEN;
  return t && t.length > 0 ? t : null;
};

const safeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
};

export interface CallbackVerdict {
  ok: boolean;
  status: number;
  reason: "ok" | "not_configured" | "invalid_token";
}

/**
 * Verifica el token secreto que viaja en la callback_url.
 * Falla cerrado: sin COINGATE_CALLBACK_TOKEN configurado no se acepta ningún
 * callback (503), porque no habría forma de distinguirlo de uno falsificado.
 */
export const verifyCallbackToken = (
  provided?: string | null
): CallbackVerdict => {
  const expected = getCallbackToken();
  if (!expected) {
    logger.error(
      "[Coingate] COINGATE_CALLBACK_TOKEN no configurado — se rechazan los callbacks. " +
        "Generá un token aleatorio y configuralo antes de operar con CoinGate."
    );
    return { ok: false, status: 503, reason: "not_configured" };
  }
  if (!provided || !safeEqual(provided, expected)) {
    logger.warn("[Coingate] Callback con token ausente o inválido — rechazado");
    return { ok: false, status: 403, reason: "invalid_token" };
  }
  return { ok: true, status: 200, reason: "ok" };
};

/**
 * Añade ?token=<secreto> a la callback_url que se le pasa a CoinGate, para que
 * el callback llegue autenticado. Si no hay token configurado se deja la URL
 * intacta: el callback será rechazado luego por verifyCallbackToken, que es el
 * comportamiento correcto (mejor no acreditar que acreditar algo falsificado).
 */
export const withCallbackToken = (url: string): string => {
  const token = getCallbackToken();
  if (!token) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}token=${encodeURIComponent(token)}`;
};

export default { verifyCallbackToken, withCallbackToken, getCallbackToken };
