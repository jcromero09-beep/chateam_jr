/**
 * La API pública no debe dejar consultas sin filtro de empresa.
 *
 * ## Qué vigila y por qué importa
 *
 * `helpers/tenantScope` engancha los modelos con `companyId` y, en modo `observe`,
 * ANOTA cada consulta que llega sin ese filtro en vez de corregirla. Esa lista es
 * literalmente la que decide si se puede pasar a `enforce`: en `enforce` esas mismas
 * consultas se interceptan, y si alguna dependía de no estar filtrada, el endpoint
 * empieza a devolver vacío sin que nadie se entere.
 *
 * Hasta ahora esa lista solo se podía mirar en los logs de producción, con tráfico
 * real y sin saber qué consulta era (el aviso dice `model: "?"`). Este test la
 * produce en frío, de forma reproducible y antes de desplegar.
 *
 * ## El caso que lo motivó
 *
 * `POST /checkNumber` generaba un aviso. No era un fallo de aislamiento: era la
 * búsqueda del token que el handler repetía después de que `tokenAuth` ya la hubiera
 * hecho. Corre con el contexto de tenant abierto y busca por `tokenHash` —sin
 * `companyId`, y con razón, porque `tokenHash` ya identifica una sola conexión—, así
 * que el guard la contaba como consulta sin filtrar.
 *
 * El arreglo fue quitar la duplicación: `tokenAuth` deja la conexión en
 * `req.apiWhatsapp` y los handlers la usan. Esa misma duplicación fue la que hizo
 * que middleware y handlers respondieran códigos distintos al mismo cliente cuando
 * el token pasó a guardarse cifrado.
 *
 * ## Cómo leerlo si falla
 *
 * Una observación nueva NO es necesariamente un bug: puede ser una consulta que
 * legítimamente no lleva `companyId`. Lo que el test impide es que aparezca sin que
 * nadie la mire. Hay que decidir, caso por caso, si se filtra o si se documenta como
 * excepción — y solo entonces añadirla a `ESPERADAS`.
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

import "express-async-errors";
import express, { NextFunction, Request, Response } from "express";
import request from "supertest";

import sequelize from "../../database";
import AppError from "../../errors/AppError";
import ApiRoutes from "../../routes/apiRoutes";
import traceIdMiddleware from "../../middleware/traceIdMiddleware";
import Whatsapp from "../../models/Whatsapp";
import {
  getTenantScopeObservations,
  resetTenantScopeObservations
} from "../../helpers/tenantScope";
import { truncateAll, seedTenant } from "./dbHelpers";

/**
 * Consultas sin `companyId` que se aceptan, con su motivo.
 *
 * Vacío a propósito. Cada entrada que se añada aquí es una consulta que en `enforce`
 * se va a interceptar, así que tiene que venir con el porqué: sin eso, la lista se
 * convierte en el sitio donde se esconden los avisos incómodos.
 */
const ESPERADAS: Record<string, string> = {};

function buildApp() {
  const app = express();
  app.use(express.json());
  // Imprescindible: `tokenAuth` propaga el tenant con `updateTraceContext`, que
  // escribe en un contexto ya abierto. Quien lo abre es este middleware. Sin él, el
  // guard sale por `ctx.companyId == null` y NO observa nada — el test pasaría
  // siempre, midiendo exactamente cero.
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

async function seedEmpresa(label: string, token: string) {
  const { company } = await seedTenant(label);
  const companyId = (company as any).id;
  const conexion = await Whatsapp.create({
    name: `wa${label}`,
    companyId,
    token
  } as any);
  return { companyId, conexion };
}

/** `surface|route|model|op`, la misma clave con la que el guard agrupa. */
function observacionesInesperadas(): string[] {
  return getTenantScopeObservations()
    .map(o => `${o.surface}|${o.route}|${o.model}|${o.op}`)
    .filter(k => !(k in ESPERADAS));
}

beforeAll(async () => {
  await sequelize.authenticate();
});
afterAll(async () => {
  await sequelize.close();
});
beforeEach(async () => {
  await truncateAll();
  resetTenantScopeObservations();
});

describe("API pública — el guard de aislamiento no encuentra nada que corregir", () => {
  it("POST /checkNumber no deja consultas sin filtro de empresa", async () => {
    await seedEmpresa("-a", "tok-a");

    await request(buildApp())
      .post("/api/checkNumber")
      .set("Authorization", "Bearer tok-a")
      .send({ number: "593999999999" });

    // El código de respuesta da igual: sin sesión de WhatsApp el handler falla, pero
    // para entonces ya ha hecho sus consultas, que es lo que se está midiendo.
    expect(observacionesInesperadas()).toEqual([]);
  });

  it("POST /send-template no deja consultas sin filtro de empresa", async () => {
    await seedEmpresa("-a", "tok-a");

    await request(buildApp())
      .post("/api/send-template")
      .set("Authorization", "Bearer tok-a")
      .send({ number: "593999999999", template_id: 999999 });

    expect(observacionesInesperadas()).toEqual([]);
  });

  it("POST /checkNumbers no deja consultas sin filtro de empresa", async () => {
    await seedEmpresa("-a", "tok-a");

    await request(buildApp())
      .post("/api/checkNumbers")
      .set("Authorization", "Bearer tok-a")
      .send({ numbers: ["593999999999"] });

    expect(observacionesInesperadas()).toEqual([]);
  });

  /**
   * Comprobación de que el test MIDE algo.
   *
   * Si el guard estuviera desactivado, o el contexto de tenant no llegara, los tres
   * casos de arriba pasarían en vacío y nadie lo notaría. Aquí se provoca a mano una
   * consulta sin filtro con el contexto abierto y se exige que el guard la vea.
   */
  it("el guard SÍ observa cuando hay una consulta sin filtro (control)", async () => {
    const a = await seedEmpresa("-a", "tok-a");
    await seedEmpresa("-b", "tok-b");

    const app = express();
    app.use(express.json());
    app.use(traceIdMiddleware);
    app.use("/api", ApiRoutes);
    // Ruta añadida solo para este test: consulta a un modelo con companyId sin
    // filtrar, después de que tokenAuth haya abierto el contexto.
    app.post("/cebo", async (req: Request, res: Response) => {
      const { updateTraceContext } = await import("../../utils/traceContext");
      updateTraceContext({
        companyId: a.companyId,
        tenantSurface: "api",
        tenantRoute: "POST /cebo"
      });
      await Whatsapp.findAll({ where: { name: "wa-b" } });
      return res.json({ ok: true });
    });

    await request(app).post("/cebo").send({});

    expect(observacionesInesperadas().length).toBeGreaterThan(0);
  });
});
