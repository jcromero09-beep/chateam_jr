/**
 * Red para `sendTemplate` — envío de plantillas de WhatsApp por la API pública.
 *
 * ## Por qué existe
 *
 * Son 607 líneas, el handler más grande de ApiController, y va a moverse a su propio
 * fichero. El movimiento es verbatim y el contrato está medido (0 dependencias del
 * resto del controller), pero sin tests que lo ejerciten "verbatim" es una promesa:
 * nada comprobaría que las rutas siguen resolviendo ni que las validaciones siguen
 * respondiendo lo mismo.
 *
 * Se cubren los caminos de salida que un cliente puede provocar desde fuera —que son
 * los que forman el contrato de la API— y, sobre todo, el AISLAMIENTO: la plantilla
 * se busca con `where: { id, companyId }`, así que pedir la de otra empresa tiene que
 * dar 404. Ese test es el que impide que una refactorización se lleve por delante el
 * filtro por empresa sin que nadie se entere.
 *
 * El envío real a Meta está mockeado: lo que se fija es qué decide el handler, no que
 * la Cloud API funcione.
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

// La Cloud API de Meta. `enviado` es lo observable: si el handler llegó a mandar.
const enviado = jest.fn(async () => ({ messages: [{ id: "wamid.TEMPLATE.OUT" }] }));
jest.mock("../../services/MetaServices/metaSendService", () => ({
  __esModule: true,
  sendTemplateDynamic: (...args: unknown[]) => enviado(...(args as [])),
  sendTextDynamic: jest.fn(async () => ({ messages: [{ id: "wamid.TEXT.OUT" }] })),
  renderTemplateBody: jest.fn((body: string) => body),
  sendText: jest.fn(async () => ({}))
}));

import "express-async-errors";
import express, { NextFunction, Request, Response } from "express";
import request from "supertest";

import sequelize from "../../database";
import AppError from "../../errors/AppError";
import ApiRoutes from "../../routes/apiRoutes";
import traceIdMiddleware from "../../middleware/traceIdMiddleware";
import Whatsapp from "../../models/Whatsapp";
import WhatsAppTemplate from "../../models/WhatsAppTemplate";
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

/** Empresa con una conexión META lista para enviar plantillas. */
async function seedEmpresaMeta(label: string, token: string) {
  const { company } = await seedTenant(label);
  const companyId = (company as any).id;
  const conexion = await Whatsapp.create({
    name: `wa-meta${label}`,
    companyId,
    token,
    channel: "meta",
    phoneNumberId: `phone-${label}`,
    tokenMeta: `token-meta-${label}`
  } as any);
  return { companyId, conexion };
}

async function seedPlantilla(
  companyId: number,
  whatsappId: number,
  status = "APPROVED",
  name = "plantilla_test"
) {
  return WhatsAppTemplate.create({
    name,
    companyId,
    whatsappId,
    category: "MARKETING",
    language: "es",
    // En minúsculas: el enum de Postgres es `named|positional`, mientras que los de
    // al lado (category, status, headerType) van en mayúsculas. Un valor fuera del
    // enum revienta el INSERT con un error que jest muestra VACÍO, así que el fallo
    // aparenta ser del handler y no del seed. Se comprueba con:
    //   SELECT enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid
    //   WHERE t.typname='enum_WhatsAppTemplates_parameterFormat';
    parameterFormat: "positional",
    status,
    headerType: "NONE",
    bodyContent: "Hola, esto es una plantilla de prueba",
    variablesCount: 0,
    isActive: true
  } as any);
}

beforeAll(async () => {
  await sequelize.authenticate();
});
afterAll(async () => {
  await sequelize.close();
});
beforeEach(async () => {
  await truncateAll();
  enviado.mockClear();
});

const enviarPlantilla = (token: string, body: Record<string, unknown>) =>
  request(buildApp())
    .post("/api/send-template")
    .set("Authorization", `Bearer ${token}`)
    .send(body);

describe("sendTemplate — validaciones de entrada", () => {
  it("sin número responde 400", async () => {
    const a = await seedEmpresaMeta("-a", "tok-a");
    const t = await seedPlantilla(a.companyId, (a.conexion as any).id);

    const res = await enviarPlantilla("tok-a", { template_id: (t as any).id });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/número es requerido/i);
  });

  it("sin template_id responde 400", async () => {
    await seedEmpresaMeta("-a", "tok-a");

    const res = await enviarPlantilla("tok-a", { number: "593999999999" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/template_id/i);
  });

  it("con una plantilla que no existe responde 404", async () => {
    await seedEmpresaMeta("-a", "tok-a");

    const res = await enviarPlantilla("tok-a", { number: "593999999999", template_id: 999999 });

    expect(res.status).toBe(404);
  });
});

describe("sendTemplate — aislamiento entre empresas", () => {
  /**
   * El handler busca con `where: { id, companyId }`. Si alguien quita ese companyId
   * al refactorizar, la empresa A podría enviar con las plantillas de la B — y con
   * las credenciales META de la B. Esto lo impide.
   */
  it("la plantilla de OTRA empresa da 404 y no se envía nada", async () => {
    const a = await seedEmpresaMeta("-a", "tok-a");
    const b = await seedEmpresaMeta("-b", "tok-b");
    const plantillaDeB = await seedPlantilla(
      b.companyId,
      (b.conexion as any).id,
      "APPROVED",
      "plantilla_de_b"
    );

    const res = await enviarPlantilla("tok-a", {
      number: "593999999999",
      template_id: (plantillaDeB as any).id
    });

    expect(res.status).toBe(404);
    expect(enviado).not.toHaveBeenCalled();
  });
});

describe("sendTemplate — estado de la plantilla", () => {
  it("una plantilla no aprobada no se envía", async () => {
    const a = await seedEmpresaMeta("-a", "tok-a");
    const t = await seedPlantilla(a.companyId, (a.conexion as any).id, "PENDING");

    const res = await enviarPlantilla("tok-a", {
      number: "593999999999",
      template_id: (t as any).id
    });

    expect(res.status).toBe(400);
    expect(enviado).not.toHaveBeenCalled();
  });
});
