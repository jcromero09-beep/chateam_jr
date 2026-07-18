// [Auditoría · Ola 1] Enmascarado de secretos/PII para logs.
// - Helpers puntuales (maskToken/maskEmail/maskPhone) para usar en los sitios
//   que hoy vuelcan credenciales/PII.
// - sanitizeValue: usado por el hook del logger (utils/logger.ts) como defensa en
//   profundidad — nunca sustituye al arreglo puntual, pero atrapa fugas nuevas.

// Claves cuyo VALOR es un secreto → se enmascara siempre.
const SENSITIVE_KEY =
  /(pass(word)?|secret|token|access[_-]?token|refresh[_-]?token|authorization|api[_-]?key|app[_-]?secret|client[_-]?secret|private[_-]?key|credential|appsecret_proof)/i;
// Claves de email / teléfono.
const EMAIL_KEY = /^e?mail$/i;
const PHONE_KEY = /(phone|telefono|celular|msisdn|whatsappnumber)/i;

const EMAIL_RE = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
// Token-like: 40+ chars base64/hex/JWT (evita UUID de 36 y IDs cortos).
const TOKEN_RE = /\b[A-Za-z0-9_\-]{40,}\b/g;

/** Enmascara un token/secreto sin dejar prefijo/sufijo útil para robo. */
export function maskToken(t?: unknown): string {
  if (t == null || t === "") return "(none)";
  const s = String(t);
  if (s.length <= 8) return "***";
  return `${s.slice(0, 2)}…(len:${s.length})`;
}

/** a***@dominio.com */
export function maskEmail(e?: unknown): string {
  if (e == null || e === "") return "(none)";
  const s = String(e);
  const at = s.indexOf("@");
  if (at < 1) return "***";
  return `${s[0]}***${s.slice(at)}`;
}

/** ***1234 (últimos 4) */
export function maskPhone(p?: unknown): string {
  if (p == null || p === "") return "(none)";
  const s = String(p).replace(/[^\d+]/g, "");
  if (s.length <= 4) return "***";
  return `***${s.slice(-4)}`;
}

/** Enmascara emails y tokens embebidos en un string. */
export function sanitizeString(s: string): string {
  return s
    .replace(EMAIL_RE, (_m, a, dom) => `${a}***${dom}`)
    .replace(TOKEN_RE, (m) => `${m.slice(0, 2)}…(len:${m.length})`);
}

/**
 * Sanitiza recursivamente un valor para logs. Enmascara claves sensibles,
 * emails y teléfonos; recorta tokens embebidos en strings. Preserva Error/Buffer.
 */
export function sanitizeValue(v: any, depth = 0): any {
  if (v == null || depth > 4) return v;
  if (typeof v === "string") return sanitizeString(v);
  if (typeof v !== "object") return v;
  if (v instanceof Error || Buffer.isBuffer(v)) return v;
  if (Array.isArray(v)) return v.map((x) => sanitizeValue(x, depth + 1));
  const out: Record<string, any> = {};
  for (const k of Object.keys(v)) {
    const val = (v as any)[k];
    if (SENSITIVE_KEY.test(k)) out[k] = typeof val === "string" ? maskToken(val) : "***";
    else if (EMAIL_KEY.test(k)) out[k] = maskEmail(val);
    else if (PHONE_KEY.test(k)) out[k] = maskPhone(val);
    else if (/^number$/i.test(k) && typeof val === "string" && /^\+?\d{8,}$/.test(val))
      out[k] = maskPhone(val);
    else out[k] = sanitizeValue(val, depth + 1);
  }
  return out;
}
