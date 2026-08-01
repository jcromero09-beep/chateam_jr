/**
 * MetaSignatureValidator — FASE 2 Coexistencia WhatsApp.
 *
 * Valida X-Hub-Signature-256 de webhooks Meta.
 * Previene replay/forgery en el endpoint /webhooks/meta.
 *
 * Modo de operación (controlado por env META_SIGNATURE_MODE):
 *   'enforce' — rechaza requests sin firma válida (HTTP 403)  ← POR DEFECTO
 *   'warn'    — logea warning pero permite (escotilla de rollout)
 *   'off'     — desactivado (no validar)
 *
 * El default es 'enforce': un webhook que acepta firmas inválidas es un canal
 * de inyección abierto (cualquiera puede POSTear mensajes/comentarios falsos al
 * inbox de un tenant). 'warn' sigue disponible para un rollout gradual, pero es
 * una decisión explícita que hay que escribir en el env.
 *
 * Requiere process.env.FACEBOOK_APP_SECRET. Si falta, en modo 'enforce' se
 * rechaza TODO el tráfico entrante de Meta — por eso se avisa al arranque.
 */
import { createHmac, timingSafeEqual } from "crypto";
import logger from "../../utils/logger";

export type SignatureMode = "enforce" | "warn" | "off";

export const getSignatureMode = (): SignatureMode => {
  const raw = (process.env.META_SIGNATURE_MODE || "enforce").toLowerCase();
  if (raw === "warn" || raw === "off") return raw;
  return "enforce";
};

const getAppSecret = (): string | null => {
  const s = process.env.FACEBOOK_APP_SECRET;
  return s && s.length > 0 ? s : null;
};

/**
 * Compara dos strings en tiempo constante para prevenir timing attacks.
 */
const safeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
};

export interface ValidationResult {
  valid: boolean;
  reason?:
    | "no_secret_configured"
    | "no_signature_header"
    | "no_raw_body"
    | "mismatch"
    | "ok"
    | "mode_off";
}

/**
 * Valida la firma X-Hub-Signature-256 contra APP_SECRET.
 *
 * @param rawBody buffer del body original (sin parse). Viene de
 *   bodyParser.json({verify:(req,res,buf) => req.rawBody = buf}).
 * @param signatureHeader valor del header 'x-hub-signature-256'
 *   (e.g. 'sha256=abc123...').
 */
export const validateMetaSignature = (
  rawBody: Buffer | string | undefined,
  signatureHeader: string | string[] | undefined
): ValidationResult => {
  const mode = getSignatureMode();
  if (mode === "off") return { valid: true, reason: "mode_off" };

  const secret = getAppSecret();
  if (!secret) return { valid: false, reason: "no_secret_configured" };

  const sig =
    typeof signatureHeader === "string"
      ? signatureHeader
      : Array.isArray(signatureHeader)
      ? signatureHeader[0]
      : null;
  if (!sig) return { valid: false, reason: "no_signature_header" };

  if (!rawBody) return { valid: false, reason: "no_raw_body" };

  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);

  // Meta envía: 'sha256=HEXDIGEST'
  const expected =
    "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

  return safeEqual(sig, expected)
    ? { valid: true, reason: "ok" }
    : { valid: false, reason: "mismatch" };
};

/**
 * Devuelve true si el caller debe continuar procesando el webhook,
 * false si debe rechazar (403).
 *
 * Maneja internamente el modo 'warn' (loguea, pero retorna true).
 */
export const shouldAcceptWebhook = (
  rawBody: Buffer | string | undefined,
  signatureHeader: string | string[] | undefined,
  traceId?: string | null
): { accept: boolean; result: ValidationResult } => {
  const mode = getSignatureMode();
  const result = validateMetaSignature(rawBody, signatureHeader);

  if (result.valid) {
    return { accept: true, result };
  }

  const logPayload = {
    traceId,
    mode,
    reason: result.reason,
    hasSecret: !!getAppSecret(),
    hasHeader: !!signatureHeader,
    hasRawBody: !!rawBody
  };

  if (mode === "enforce") {
    logger.error(logPayload, "[coex.security] Meta webhook signature INVALID — rejecting (enforce mode)");
    return { accept: false, result };
  }

  // modo 'warn' — loguea pero acepta
  logger.warn(logPayload, "[coex.security] Meta webhook signature INVALID — ACCEPTING (warn mode, rollout gradual)");
  return { accept: true, result };
};

/**
 * Aviso al arranque. En 'enforce' sin FACEBOOK_APP_SECRET todos los webhooks de
 * Meta devuelven 403 y la ingesta se corta en silencio: el fallo se manifiesta
 * como "dejaron de entrar mensajes", que es carísimo de diagnosticar a posteriori.
 * Preferimos gritarlo en el boot.
 */
export const assertMetaSignatureConfig = (): void => {
  const mode = getSignatureMode();
  if (mode === "enforce" && !getAppSecret()) {
    logger.error(
      "[coex.security] META_SIGNATURE_MODE=enforce pero FACEBOOK_APP_SECRET no está configurado: " +
        "TODOS los webhooks de Meta (WhatsApp Cloud, páginas FB/IG) serán rechazados con 403. " +
        "Configurá FACEBOOK_APP_SECRET, o poné META_SIGNATURE_MODE=warn de forma explícita mientras tanto."
    );
    return;
  }
  if (mode !== "enforce") {
    logger.warn(
      `[coex.security] META_SIGNATURE_MODE=${mode}: los webhooks de Meta aceptan firmas inválidas. ` +
        "Es un canal de inyección abierto — volvé a 'enforce' en cuanto puedas."
    );
  }
};

export default {
  validateMetaSignature,
  shouldAcceptWebhook,
  getSignatureMode,
  assertMetaSignatureConfig
};
