/**
 * Tests unitarios — avisos operativos.
 *
 * Las tres propiedades sin las cuales este helper sería peor que no tenerlo:
 * que no tumbe el flujo que lo llama, que no mande veinte correos por un solo
 * suceso, y que la falta de destinatario se note en vez de parecer que no pasa
 * nada.
 */
import { describe, test, expect, beforeEach, jest } from "@jest/globals";

jest.mock("../../utils/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

const store = new Map<string, string>();
jest.mock("../../libs/cache", () => ({
  __esModule: true,
  default: {
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string) => {
      store.set(k, v);
      return "OK";
    }
  }
}));

const sendMail = jest.fn<any>();
jest.mock("../../helpers/SendMail", () => ({
  __esModule: true,
  SendMail: (...args: any[]) => sendMail(...args)
}));

import { sendOpsAlert } from "../../helpers/opsAlert";

const ALERT = { key: "stripe-dispute:dp_1", subject: "CONTRACARGO", body: "cuerpo" };

beforeEach(() => {
  store.clear();
  sendMail.mockReset();
  sendMail.mockResolvedValue(undefined);
  process.env.OPS_ALERT_EMAIL = "ops@chateam.test";
});

describe("sendOpsAlert", () => {
  test("envía cuando hay destinatario", async () => {
    await expect(sendOpsAlert(ALERT)).resolves.toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0]).toMatchObject({ to: "ops@chateam.test" });
  });

  test("el MISMO suceso no vuelve a avisar — Stripe reintenta los webhooks", async () => {
    await sendOpsAlert(ALERT);
    await sendOpsAlert(ALERT);
    await sendOpsAlert(ALERT);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  test("sucesos distintos sí avisan por separado", async () => {
    await sendOpsAlert({ ...ALERT, key: "stripe-dispute:dp_1" });
    await sendOpsAlert({ ...ALERT, key: "stripe-dispute:dp_2" });
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  test("sin OPS_ALERT_EMAIL no manda, pero lo DICE", async () => {
    delete process.env.OPS_ALERT_EMAIL;
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const logger = require("../../utils/logger").default;
    logger.warn.mockClear();

    await expect(sendOpsAlert(ALERT)).resolves.toBe(false);
    expect(sendMail).not.toHaveBeenCalled();

    const warned = logger.warn.mock.calls.map((c: any[]) => String(c[0]));
    expect(warned.some((w: string) => w.includes("OPS_ALERT_EMAIL"))).toBe(true);
  });

  test("si el correo falla, NO lanza — no puede tumbar el webhook", async () => {
    sendMail.mockRejectedValue(new Error("SMTP caído"));
    await expect(sendOpsAlert(ALERT)).resolves.toBe(false);
  });

  test("un fallo de correo tampoco reabre la puerta al spam", async () => {
    // La marca se pone ANTES de enviar: es preferible perder un aviso a mandar
    // veinte porque el proveedor reintenta el webhook.
    sendMail.mockRejectedValue(new Error("SMTP caído"));
    await sendOpsAlert(ALERT);
    sendMail.mockResolvedValue(undefined);
    await sendOpsAlert(ALERT);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  test("escapa el cuerpo en el html — no inyecta marcado", async () => {
    await sendOpsAlert({ ...ALERT, body: "<script>alert(1)</script>" });
    const html = String(sendMail.mock.calls[0][0].html);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
