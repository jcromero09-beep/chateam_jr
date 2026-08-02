/**
 * La API pública no puede convertirse en un proxy hacia la red interna.
 *
 * ## El agujero
 *
 * [2026-08-02] Dos vías distintas, y la segunda es la peor:
 *
 *   1. `/api/send` — baileys genera la previsualización de los enlaces del texto
 *      PIDIENDO esa URL desde el servidor. La librería que usa (link-preview-js) no
 *      filtra loopback ni rangos privados: advisory de severidad alta, sin parche.
 *   2. `/api/send/linkImage` — la `url` del cuerpo va a `image: { url }` de baileys,
 *      que la descarga tal cual. Sin regex de por medio: una IP literal funciona.
 *
 * La primera exige controlar un dominio que resuelva a una IP interna (la regex de
 * baileys pide TLD alfabético, así que `https://127.0.0.1` ni cuenta como enlace). La
 * segunda no exige nada: basta con escribir la dirección. Y ambas rutas aceptan
 * entrada de cualquier cliente con token.
 *
 * ## Qué fija este test
 *
 * Que la petición se rechaza ANTES de llegar a baileys. Se comprueba por el código y
 * el mensaje, no mirando si hubo tráfico de red: lo que se está fijando es la decisión
 * del handler, no el comportamiento de la librería.
 *
 * El caso de `localtest.me` es el importante: es un dominio PÚBLICO y real que resuelve
 * a 127.0.0.1. Reproduce el ataque de verdad —DNS apuntando a la red interna— y no una
 * aproximación con una IP escrita a mano.
 */
jest.mock("../../libs/socket", () => ({
  getIO: jest.fn(() => ({
    emit: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() })),
    of: jest.fn(() => ({ emit: jest.fn() }))
  }))
}));
jest.mock("../../queues", () => ({
  campaignQueue: { add: jest.fn() },
  parseToMilliseconds: jest.fn(() => 0),
  randomValue: jest.fn(() => 0)
}));
jest.mock("@sentry/node", () => ({
  setExtra: jest.fn(),
  captureException: jest.fn(),
  startTransaction: jest.fn()
}));

// Si el guard fallara, la petición seguiría hasta aquí. Que estén mockeados permite
// distinguir "rechazado a tiempo" de "rechazado más tarde por otro motivo".
const enviarImagen = jest.fn(async () => undefined);
jest.mock("../../services/WbotServices/SendWhatsappMediaImage", () => ({
  __esModule: true,
  default: (...a: unknown[]) => enviarImagen(...(a as []))
}));

import "express-async-errors";
import express, { NextFunction, Request, Response } from "express";
import request from "supertest";

import sequelize from "../../database";
import AppError from "../../errors/AppError";
import ApiRoutes from "../../routes/apiRoutes";
import traceIdMiddleware from "../../middleware/traceIdMiddleware";
import Whatsapp from "../../models/Whatsapp";
import { truncateAll, seedTenant } from "./dbHelpers";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(traceIdMiddleware);
  app.use("/api", ApiRoutes);
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError || err?.name === "AppError") {
      const e = err as AppError;
      return res.status(e.statusCode || 400).json({ error: e.message });
    }
    return res.status(500).json({ error: err.message });
  });
  return app;
}

async function seedEmpresa(token: string) {
  const { company } = await seedTenant("-ssrf");
  const companyId = (company as any).id;
  await Whatsapp.create({ name: "wa-ssrf", companyId, token } as any);
  return companyId;
}

const enviar = (body: Record<string, unknown>) =>
  request(buildApp())
    .post("/api/send")
    .set("Authorization", "Bearer tok-ssrf")
    .send(body);

const enviarImagenApi = (body: Record<string, unknown>) =>
  request(buildApp())
    .post("/api/send/linkImage")
    .set("Authorization", "Bearer tok-ssrf")
    .send(body);

beforeAll(async () => {
  await sequelize.authenticate();
});
afterAll(async () => {
  await sequelize.close();
});
beforeEach(async () => {
  await truncateAll();
  await seedEmpresa("tok-ssrf");
  enviarImagen.mockClear();
});

describe("SSRF · /api/send (previsualización de enlaces)", () => {
  it("rechaza un enlace a un dominio que resuelve a la red interna", async () => {
    const res = await enviar({
      number: "593999999999",
      body: "mira esto https://localtest.me/panel"
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/red interna/i);
  });

  it("deja pasar un enlace público normal", async () => {
    const res = await enviar({
      number: "593999999999",
      body: "mira esto https://www.google.com/search"
    });

    // No se exige 200: sin sesión de WhatsApp el envío falla después. Lo que importa
    // es que NO lo pare el guard.
    expect(res.body.error || "").not.toMatch(/red interna/i);
  });

  it("deja pasar un mensaje sin enlaces", async () => {
    const res = await enviar({ number: "593999999999", body: "hola qué tal" });
    expect(res.body.error || "").not.toMatch(/red interna/i);
  });
});

describe("SSRF · /api/send/linkImage (descarga de la imagen)", () => {
  it("rechaza una IP literal — el vector directo", async () => {
    const res = await enviarImagenApi({
      number: "593999999999",
      url: "http://127.0.0.1:5434/x.png"
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/red interna/i);
    expect(enviarImagen).not.toHaveBeenCalled();
  });

  it("rechaza el endpoint de metadatos de nube", async () => {
    const res = await enviarImagenApi({
      number: "593999999999",
      url: "http://169.254.169.254/latest/meta-data/"
    });

    expect(res.status).toBe(400);
    expect(enviarImagen).not.toHaveBeenCalled();
  });

  it("rechaza un esquema que no sea http/https", async () => {
    const res = await enviarImagenApi({
      number: "593999999999",
      url: "file:///etc/passwd"
    });

    expect(res.status).toBe(400);
    expect(enviarImagen).not.toHaveBeenCalled();
  });

  it("rechaza también por el pie de foto, no solo por la url", async () => {
    const res = await enviarImagenApi({
      number: "593999999999",
      url: "https://www.google.com/favicon.ico",
      caption: "más info en https://localtest.me/x"
    });

    expect(res.status).toBe(400);
    expect(enviarImagen).not.toHaveBeenCalled();
  });

  it("deja pasar una imagen pública", async () => {
    const res = await enviarImagenApi({
      number: "593999999999",
      url: "https://www.google.com/favicon.ico"
    });

    expect(res.body.error || "").not.toMatch(/red interna/i);
  });
});
