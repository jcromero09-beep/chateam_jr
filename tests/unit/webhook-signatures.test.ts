/**
 * Tests unitarios — autenticación de webhooks entrantes.
 *
 * Cubre las tres superficies que antes aceptaban tráfico sin verificar:
 *  - MercadoPago: firma HMAC x-signature (manifiesto id/request-id/ts)
 *  - CoinGate:    token secreto en la callback_url (CoinGate no firma)
 *  - Meta:        X-Hub-Signature-256, y que el modo por defecto sea 'enforce'
 *
 * El test del manifiesto es el importante: si su formato se desvía del que
 * firma MercadoPago, el webhook pasa a rechazar el 100% del tráfico legítimo.
 */
import { createHmac } from "crypto";

import { describe, test, expect, beforeEach, afterEach, jest } from "@jest/globals";

jest.mock("../../utils/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import {
  verifyWebhookSignature,
  buildManifest
} from "../../services/AIMercadoPagoServices/mercadoPagoSignature";
import { verifyCallbackToken } from "../../services/AICoingateServices/coingateCallbackToken";
import {
  validateMetaSignature,
  shouldAcceptWebhook,
  getSignatureMode
} from "../../services/CoexistenceServices/MetaSignatureValidator";

const ENV_KEYS = [
  "MERCADOPAGO_WEBHOOK_SECRET",
  "MERCADOPAGO_WEBHOOK_TOLERANCE_SEC",
  "COINGATE_CALLBACK_TOKEN",
  "META_SIGNATURE_MODE",
  "FACEBOOK_APP_SECRET"
] as const;

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  ENV_KEYS.forEach(k => {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  });
});

afterEach(() => {
  ENV_KEYS.forEach(k => {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MercadoPago
// ─────────────────────────────────────────────────────────────────────────────
describe("MercadoPago — firma x-signature", () => {
  const SECRET = "clave-secreta-de-webhook";
  const DATA_ID = "123456";
  const REQUEST_ID = "bb56a2f1-6aae-46ac-982e-9dcd3581d08e";

  const signedHeader = (opts: {
    dataId?: string | null;
    requestId?: string | null;
    ts?: string;
    secret?: string;
  } = {}) => {
    const ts = opts.ts ?? String(Math.floor(Date.now() / 1000));
    const manifest = buildManifest({
      dataId: opts.dataId === undefined ? DATA_ID : opts.dataId,
      requestId: opts.requestId === undefined ? REQUEST_ID : opts.requestId,
      ts
    });
    const v1 = createHmac("sha256", opts.secret ?? SECRET)
      .update(manifest)
      .digest("hex");
    return `ts=${ts},v1=${v1}`;
  };

  test("el manifiesto sigue el formato id:...;request-id:...;ts:...;", () => {
    expect(buildManifest({ dataId: "123456", requestId: "abc", ts: "1704908010" }))
      .toBe("id:123456;request-id:abc;ts:1704908010;");
  });

  test("el manifiesto omite los campos ausentes", () => {
    expect(buildManifest({ dataId: null, requestId: null, ts: "1704908010" }))
      .toBe("ts:1704908010;");
    expect(buildManifest({ dataId: "123", requestId: null, ts: "1704908010" }))
      .toBe("id:123;ts:1704908010;");
  });

  test("el id alfanumérico se normaliza a minúsculas", () => {
    expect(buildManifest({ dataId: "AbC123", requestId: null, ts: "1" }))
      .toBe("id:abc123;ts:1;");
  });

  test("sin secreto configurado rechaza con 503 (falla cerrado)", () => {
    const verdict = verifyWebhookSignature({
      dataId: DATA_ID,
      xSignature: signedHeader(),
      xRequestId: REQUEST_ID
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.status).toBe(503);
    expect(verdict.reason).toBe("not_configured");
  });

  test("acepta una firma válida", () => {
    process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;
    const verdict = verifyWebhookSignature({
      dataId: DATA_ID,
      xSignature: signedHeader(),
      xRequestId: REQUEST_ID
    });
    expect(verdict).toEqual({ ok: true, status: 200, reason: "ok" });
  });

  test("rechaza si el body declara otro data.id que el firmado", () => {
    process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;
    const verdict = verifyWebhookSignature({
      dataId: "999999", // el atacante cambia el id
      xSignature: signedHeader({ dataId: DATA_ID }),
      xRequestId: REQUEST_ID
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe("mismatch");
  });

  test("rechaza una firma calculada con otro secreto", () => {
    process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;
    const verdict = verifyWebhookSignature({
      dataId: DATA_ID,
      xSignature: signedHeader({ secret: "secreto-del-atacante" }),
      xRequestId: REQUEST_ID
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe("mismatch");
  });

  test("rechaza sin header y con header malformado", () => {
    process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;
    expect(verifyWebhookSignature({ dataId: DATA_ID }).reason).toBe(
      "no_signature_header"
    );
    expect(
      verifyWebhookSignature({ dataId: DATA_ID, xSignature: "basura" }).reason
    ).toBe("malformed_header");
    expect(
      verifyWebhookSignature({ dataId: DATA_ID, xSignature: "ts=123" }).reason
    ).toBe("malformed_header");
  });

  test("rechaza por replay fuera de la ventana de tolerancia", () => {
    process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;
    process.env.MERCADOPAGO_WEBHOOK_TOLERANCE_SEC = "300";
    const viejo = String(Math.floor(Date.now() / 1000) - 3600);
    const verdict = verifyWebhookSignature({
      dataId: DATA_ID,
      xSignature: signedHeader({ ts: viejo }),
      xRequestId: REQUEST_ID
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe("expired");
  });

  test("con tolerancia 0 acepta un timestamp viejo pero bien firmado", () => {
    process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;
    process.env.MERCADOPAGO_WEBHOOK_TOLERANCE_SEC = "0";
    const viejo = String(Math.floor(Date.now() / 1000) - 3600);
    const verdict = verifyWebhookSignature({
      dataId: DATA_ID,
      xSignature: signedHeader({ ts: viejo }),
      xRequestId: REQUEST_ID
    });
    expect(verdict.ok).toBe(true);
  });

  test("acepta timestamps en milisegundos (MercadoPago usa ambos)", () => {
    process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;
    const tsMs = String(Date.now());
    const verdict = verifyWebhookSignature({
      dataId: DATA_ID,
      xSignature: signedHeader({ ts: tsMs }),
      xRequestId: REQUEST_ID
    });
    expect(verdict.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CoinGate
// ─────────────────────────────────────────────────────────────────────────────
describe("CoinGate — token de callback", () => {
  test("sin token configurado rechaza con 503 (falla cerrado)", () => {
    const verdict = verifyCallbackToken("lo-que-sea");
    expect(verdict.ok).toBe(false);
    expect(verdict.status).toBe(503);
    expect(verdict.reason).toBe("not_configured");
  });

  test("rechaza token ausente o incorrecto", () => {
    process.env.COINGATE_CALLBACK_TOKEN = "token-secreto";
    expect(verifyCallbackToken(undefined).reason).toBe("invalid_token");
    expect(verifyCallbackToken("").reason).toBe("invalid_token");
    expect(verifyCallbackToken("token-equivocado").reason).toBe("invalid_token");
    // Distinta longitud: no debe explotar timingSafeEqual
    expect(verifyCallbackToken("x").reason).toBe("invalid_token");
  });

  test("acepta el token correcto", () => {
    process.env.COINGATE_CALLBACK_TOKEN = "token-secreto";
    expect(verifyCallbackToken("token-secreto")).toEqual({
      ok: true,
      status: 200,
      reason: "ok"
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────────────────────────
describe("Meta — X-Hub-Signature-256", () => {
  const APP_SECRET = "app-secret-de-meta";
  const body = Buffer.from(JSON.stringify({ object: "page", entry: [] }));
  const sign = (b: Buffer, secret = APP_SECRET) =>
    "sha256=" + createHmac("sha256", secret).update(b).digest("hex");

  test("el modo por defecto es 'enforce'", () => {
    expect(getSignatureMode()).toBe("enforce");
  });

  test("un valor desconocido de META_SIGNATURE_MODE cae a 'enforce'", () => {
    process.env.META_SIGNATURE_MODE = "cualquier-cosa";
    expect(getSignatureMode()).toBe("enforce");
  });

  test("acepta firma válida y rechaza firma alterada", () => {
    process.env.FACEBOOK_APP_SECRET = APP_SECRET;
    expect(validateMetaSignature(body, sign(body)).valid).toBe(true);
    expect(validateMetaSignature(body, sign(body, "otro")).reason).toBe("mismatch");
  });

  test("en 'enforce' rechaza cuando falta el rawBody", () => {
    process.env.FACEBOOK_APP_SECRET = APP_SECRET;
    const { accept, result } = shouldAcceptWebhook(undefined, sign(body));
    expect(accept).toBe(false);
    expect(result.reason).toBe("no_raw_body");
  });

  test("en 'enforce' rechaza si no hay APP_SECRET configurado", () => {
    const { accept, result } = shouldAcceptWebhook(body, sign(body));
    expect(accept).toBe(false);
    expect(result.reason).toBe("no_secret_configured");
  });

  test("'warn' sigue disponible como escotilla de rollout", () => {
    process.env.META_SIGNATURE_MODE = "warn";
    process.env.FACEBOOK_APP_SECRET = APP_SECRET;
    const { accept, result } = shouldAcceptWebhook(body, sign(body, "otro"));
    expect(accept).toBe(true);
    expect(result.valid).toBe(false);
  });
});
