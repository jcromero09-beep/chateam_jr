/**
 * Tests unitarios — idempotencia de los webhooks de pago.
 *
 * Ni CoinGate ni MercadoPago desduplicaban. Hoy no acredita saldo nadie, así
 * que un reenvío no cuesta dinero; el día que se conecte a créditos, sí. Estos
 * tests fijan las tres decisiones que hacen que eso funcione:
 *
 *  1. La unidad idempotente es la TRANSICIÓN `(pago, estado)`, no el pago.
 *     Desduplicar por pago descartaría la notificación de `approved` por haber
 *     visto antes la de `pending` — justo la que acredita.
 *  2. Sin empresa derivable de la referencia, el evento NO es acreditable.
 *     Atribuir mal acreditaría a otra empresa.
 *  3. Si el ledger falla, tampoco es acreditable: sin garantía de unicidad,
 *     mejor no acreditar que acreditar dos veces.
 */
import { describe, test, expect, beforeEach, jest } from "@jest/globals";

jest.mock("../../utils/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

const registerOrDrop = jest.fn<any>();
jest.mock("../../services/CoexistenceServices/InboundEventLedgerService", () => ({
  __esModule: true,
  registerOrDrop
}));

import {
  parseCompanyRef,
  paymentEventKey,
  registerPaymentEvent
} from "../../helpers/paymentWebhookIdempotency";

beforeEach(() => {
  registerOrDrop.mockReset();
  registerOrDrop.mockResolvedValue({ accepted: true, id: 1, reason: "new" });
});

describe("parseCompanyRef", () => {
  test("acepta los dos formatos que emite este backend", () => {
    expect(parseCompanyRef("chateam_42_1730000000000")).toBe(42);
    expect(parseCompanyRef("company_7_1730000000000")).toBe(7);
  });

  test("rechaza lo que no encaja en vez de adivinar", () => {
    // Atribuir mal es peor que no atribuir: acreditaría a otra empresa.
    expect(parseCompanyRef(undefined)).toBeNull();
    expect(parseCompanyRef(null)).toBeNull();
    expect(parseCompanyRef("")).toBeNull();
    expect(parseCompanyRef("pedido-manual-123")).toBeNull();
    expect(parseCompanyRef("chateam_abc_1730000000000")).toBeNull();
    expect(parseCompanyRef("chateam_0_1730000000000")).toBeNull();
    // Sin el separador final no es el formato: `chateam_42` a secas podría ser
    // cualquier cosa.
    expect(parseCompanyRef("chateam_42")).toBeNull();
  });
});

describe("paymentEventKey", () => {
  test("la clave incluye el estado (la transición es la unidad, no el pago)", () => {
    expect(paymentEventKey("123", "pending")).not.toBe(
      paymentEventKey("123", "approved")
    );
  });

  test("el estado se normaliza a minúsculas", () => {
    expect(paymentEventKey("123", "APPROVED")).toBe("123:approved");
  });

  test("sin estado no revienta", () => {
    expect(paymentEventKey("123", "")).toBe("123:unknown");
  });
});

describe("registerPaymentEvent", () => {
  const base = {
    provider: "mercadopago" as const,
    reference: "company_42_1730000000000",
    externalId: "9999",
    status: "approved"
  };

  test("primera vez → acreditable, y registra bajo la empresa derivada", async () => {
    const verdict = await registerPaymentEvent(base);

    expect(verdict).toMatchObject({
      creditable: true,
      companyId: 42,
      eventKey: "9999:approved",
      ledgerEntryId: 1
    });
    expect(registerOrDrop).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 42,
        provider: "mercadopago",
        eventKey: "9999:approved",
        providerMessageId: "9999"
      })
    );
  });

  test("duplicado → NO acreditable", async () => {
    registerOrDrop.mockResolvedValue({
      accepted: false,
      id: 5,
      reason: "duplicate"
    });

    const verdict = await registerPaymentEvent(base);

    expect(verdict.creditable).toBe(false);
    expect(verdict.reason).toBe("duplicate");
  });

  test("pending y approved del MISMO pago son eventos distintos", async () => {
    await registerPaymentEvent({ ...base, status: "pending" });
    await registerPaymentEvent({ ...base, status: "approved" });

    const keys = registerOrDrop.mock.calls.map((c: any[]) => c[0].eventKey);
    expect(keys).toEqual(["9999:pending", "9999:approved"]);
  });

  test("sin empresa derivable → NO acreditable y NO toca el ledger", async () => {
    const verdict = await registerPaymentEvent({
      ...base,
      reference: "pedido-manual-123"
    });

    expect(verdict.creditable).toBe(false);
    expect(verdict.reason).toBe("no-company-ref");
    expect(verdict.companyId).toBeNull();
    // companyId es NOT NULL en el ledger: no hay nada que insertar.
    expect(registerOrDrop).not.toHaveBeenCalled();
  });

  test("fallo del ledger → NO acreditable (conservador)", async () => {
    registerOrDrop.mockResolvedValue({ accepted: false, id: null, reason: "error" });

    const verdict = await registerPaymentEvent(base);

    expect(verdict.creditable).toBe(false);
    expect(verdict.reason).toBe("ledger-error");
  });

  test("coingate usa la misma ruta con su propio provider", async () => {
    const verdict = await registerPaymentEvent({
      provider: "coingate",
      reference: "chateam_7_1730000000000",
      externalId: "ord-1",
      status: "paid"
    });

    expect(verdict).toMatchObject({ creditable: true, companyId: 7 });
    expect(registerOrDrop).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "coingate", eventKey: "ord-1:paid" })
    );
  });
});
