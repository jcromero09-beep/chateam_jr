/**
 * Validación de la firma `x-signature` de los webhooks de MercadoPago.
 *
 * MercadoPago manda:  x-signature: ts=<epoch>,v1=<hmac_sha256_hex>
 * El manifiesto firmado es:  id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 * omitiendo los campos que no vengan en la notificación, con HMAC-SHA256 y la
 * clave secreta del webhook (panel → Tus integraciones → Webhooks). El id
 * alfanumérico va en minúsculas.
 *
 * Vive en su propio módulo (sin createRequire/import.meta) para poder testearse
 * bajo ts-jest sin arrastrar el cliente HTTP del servicio.
 */
import { createHmac, timingSafeEqual } from "crypto";

import logger from "../../utils/logger";

const getWebhookSecret = (): string | null => {
  const s = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  return s && s.length > 0 ? s : null;
};

const safeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
};

/** Parsea 'ts=123,v1=abc' → { ts: '123', v1: 'abc' } */
const parseSignatureHeader = (header: string): Record<string, string> =>
  header.split(",").reduce<Record<string, string>>((acc, part) => {
    const idx = part.indexOf("=");
    if (idx > 0) {
      acc[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
    }
    return acc;
  }, {});

export interface SignatureVerdict {
  ok: boolean;
  status: number;
  reason:
    | "ok"
    | "not_configured"
    | "no_signature_header"
    | "malformed_header"
    | "mismatch"
    | "expired";
}

/**
 * Ventana de tolerancia para el timestamp, en segundos (0 = desactivada).
 * Evita el replay de una notificación válida capturada.
 */
const getToleranceSeconds = (): number => {
  const raw = process.env.MERCADOPAGO_WEBHOOK_TOLERANCE_SEC;
  if (raw === undefined) return 600;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 600;
};

const first = (v?: string | string[] | null): string | null =>
  typeof v === "string" ? v : Array.isArray(v) ? v[0] : null;

/**
 * Construye el manifiesto que MercadoPago firma. Expuesto para los tests: si
 * este formato se desvía del de MercadoPago, el webhook rechaza todo.
 */
export const buildManifest = (params: {
  dataId?: string | null;
  requestId?: string | null;
  ts: string;
}): string => {
  let manifest = "";
  if (params.dataId) manifest += `id:${String(params.dataId).toLowerCase()};`;
  if (params.requestId) manifest += `request-id:${params.requestId};`;
  manifest += `ts:${params.ts};`;
  return manifest;
};

export const verifyWebhookSignature = (params: {
  dataId?: string | null;
  xSignature?: string | string[] | null;
  xRequestId?: string | string[] | null;
  now?: number;
}): SignatureVerdict => {
  const secret = getWebhookSecret();
  if (!secret) {
    logger.error(
      "[MercadoPago] MERCADOPAGO_WEBHOOK_SECRET no configurado — se rechazan los webhooks. " +
        "Copialo desde el panel de MercadoPago (Tus integraciones → Webhooks) antes de operar."
    );
    return { ok: false, status: 503, reason: "not_configured" };
  }

  const sigHeader = first(params.xSignature);
  if (!sigHeader) return { ok: false, status: 403, reason: "no_signature_header" };

  const parts = parseSignatureHeader(sigHeader);
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return { ok: false, status: 403, reason: "malformed_header" };

  const tolerance = getToleranceSeconds();
  if (tolerance > 0) {
    const raw = Number(ts);
    if (!Number.isFinite(raw)) {
      return { ok: false, status: 403, reason: "malformed_header" };
    }
    // MercadoPago ha usado tanto segundos como milisegundos: normalizamos.
    const tsSeconds = raw > 1e12 ? raw / 1000 : raw;
    const nowSeconds = (params.now ?? Date.now()) / 1000;
    const skew = Math.abs(nowSeconds - tsSeconds);
    if (skew > tolerance) {
      logger.warn(
        `[MercadoPago] Webhook fuera de la ventana de tolerancia (${Math.round(skew)}s > ${tolerance}s) — rechazado`
      );
      return { ok: false, status: 403, reason: "expired" };
    }
  }

  const manifest = buildManifest({
    dataId: params.dataId,
    requestId: first(params.xRequestId),
    ts
  });

  const expected = createHmac("sha256", secret).update(manifest).digest("hex");

  return safeEqual(v1, expected)
    ? { ok: true, status: 200, reason: "ok" }
    : { ok: false, status: 403, reason: "mismatch" };
};

export default { verifyWebhookSignature, buildManifest };
