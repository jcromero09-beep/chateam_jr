/**
 * Red para `controllers/ApiController` — la superficie pública de la plataforma.
 *
 * ## Por qué existe
 *
 * ApiController son 2.201 líneas y hasta hoy tenía CERO tests. Es el fichero más
 * grande del backend y el más expuesto: `/api/send` y familia son lo que llaman las
 * integraciones de los clientes. Descomponerlo sin red sería mover a ciegas la
 * superficie por la que entra el tráfico ajeno.
 *
 * Esto NO pretende cubrir los 11 handlers. Fija lo que hay que poder mover con
 * seguridad y lo que más caro sale equivocarse:
 *
 *   1. La AUTENTICACIÓN de la superficie `api` (middleware/tokenAuth): sin cabecera,
 *      con token inválido, con token válido.
 *   2. El AISLAMIENTO entre empresas en un endpoint de lectura real. Este es el que
 *      vigila el `TENANT_SCOPE_GUARD_API=enforce` que se activó el 2026-08-01: si
 *      alguien lo devuelve a `observe`, o si un handler deja de filtrar por
 *      companyId, aquí salta.
 *
 * Se monta un Express de test con las rutas reales y el mismo manejador de errores
 * que app.ts, en vez de llamar a los handlers a pelo: lo que se quiere comprobar
 * incluye el middleware, y llamando a la función directamente el middleware no corre.
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

// OJO: sin esto la petición se CUELGA en vez de dar 401. En Express 4 un `throw`
// dentro de un middleware async no llega al manejador de errores, y tokenAuth lanza
// AppError de forma asíncrona. app.ts lo importa en su línea 6 por el mismo motivo;
// el test tiene que replicarlo o no está montando la misma app.
import "express-async-errors";
import express, { NextFunction, Request, Response } from "express";
import request from "supertest";
import { sign } from "jsonwebtoken";

import sequelize from "../../database";
import AppError from "../../errors/AppError";
import ApiRoutes from "../../routes/apiRoutes";
import traceIdMiddleware from "../../middleware/traceIdMiddleware";
import Whatsapp from "../../models/Whatsapp";
import ApiFailedMessage from "../../models/ApiFailedMessage";
import Session from "../../models/Session";
import User from "../../models/User";
import { truncateAll, seedTenant } from "./dbHelpers";

/**
 * App mínima con las rutas reales. El manejador de errores replica el de app.ts:
 * un AppError sale con su statusCode; cualquier otra cosa, 500. Sin él, un throw
 * dentro de un handler se vería como un cuelgue en vez de como un 401.
 */
function buildApp() {
  const app = express();
  app.use(express.json());

  // IMPRESCINDIBLE, y costó verlo: isAuth propaga el tenant con
  // `updateTraceContext(...)`, que ESCRIBE EN UN CONTEXTO YA ABIERTO. Quien lo abre
  // es traceIdMiddleware con `runWithTrace`. Sin él, isAuth escribe en el vacío, el
  // guard estructural sale por `ctx.companyId == null` y queda INERTE — o sea, el
  // test mediría solo el filtro manual del handler y daría por protegido lo que no
  // lo está. Montándolo, el test verifica de verdad las DOS capas.
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

/** Empresa + conexión con un token de API conocido. */
async function seedEmpresaConToken(label: string, token: string) {
  const { company } = await seedTenant(label);
  const companyId = (company as any).id;
  const conexion = await Whatsapp.create({
    name: `wa-api${label}`,
    companyId,
    token
  } as any);
  return { companyId, conexion };
}

/**
 * JWT + sesión viva. isAuth no se conforma con un token bien firmado: exige un `sid`
 * y que exista una `Session` en BD, sin revocar y sin expirar, cuyo userId coincida.
 * Un token "legacy" sin sid se rechaza con session_revoked. Sembrar la sesión es
 * parte de autenticarse, no un detalle del test.
 */
async function tokenDeUsuario(companyId: number, userId: number) {
  const sid = `sid-test-${userId}-${companyId}`;
  await Session.create({
    id: sid,
    userId,
    refreshTokenHash: "hash-de-test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000)
  } as any);

  return sign(
    { id: String(userId), profile: "admin", companyId, sid },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" }
  );
}

beforeAll(async () => {
  await sequelize.authenticate();
});
afterAll(async () => {
  await sequelize.close();
});
beforeEach(async () => {
  await truncateAll();
});

describe("API pública — autenticación por token (tokenAuth)", () => {
  it("sin cabecera Authorization responde 401", async () => {
    await seedEmpresaConToken("-a", "token-empresa-a");

    const res = await request(buildApp()).post("/api/checkNumber").send({ number: "593999999999" });

    expect(res.status).toBe(401);
  });

  it("con un token que no existe responde 403 (no 401, y es a propósito dejarlo fijado)", async () => {
    await seedEmpresaConToken("-a", "token-empresa-a");

    const res = await request(buildApp())
      .post("/api/checkNumber")
      .set("Authorization", "Bearer token-que-no-existe")
      .send({ number: "593999999999" });

    // Characterization, no especificación. tokenAuth lanza AppError(…, 401) cuando
    // no encuentra la conexión, pero ese throw está DENTRO de su propio try y su
    // catch lo captura y lo relanza como 403 con otro mensaje. O sea: el 401 que el
    // código pretende devolver no sale nunca por esta vía.
    //
    // No se corrige aquí: cambiar el código de estado de la API pública es un cambio
    // de contrato con las integraciones de los clientes, y algunas pueden estar
    // ramificando por él. Queda fijado para que la decisión sea consciente.
    expect(res.status).toBe(403);
  });

  it("con un token válido YA NO es 401 (pasa el middleware)", async () => {
    await seedEmpresaConToken("-a", "token-empresa-a");

    const res = await request(buildApp())
      .post("/api/checkNumber")
      .set("Authorization", "Bearer token-empresa-a")
      .send({ number: "593999999999" });

    // Qué devuelve después depende de WhatsApp, que aquí no existe. Lo que se fija
    // es que la autenticación deja pasar: cualquier cosa menos 401.
    expect(res.status).not.toBe(401);
  });
});

describe("API pública — aislamiento entre empresas", () => {
  /**
   * Este es el test que vigila TENANT_SCOPE_GUARD_API=enforce. Si alguien lo
   * devuelve a `observe`, o si listFailedMessages deja de filtrar por companyId,
   * la empresa A empezaría a ver los fallos de la B y esto salta.
   */
  it("los mensajes fallidos de otra empresa NO se ven", async () => {
    const a = await seedEmpresaConToken("-a", "token-a");
    const b = await seedEmpresaConToken("-b", "token-b");

    // Los campos son `error` y `metadata` (no errorMessage/payload): un create con
    // claves que el modelo no declara NO falla — Sequelize las ignora en silencio y
    // la columna queda null.
    await ApiFailedMessage.create({
      companyId: a.companyId,
      whatsappId: (a.conexion as any).id,
      endpoint: "/api/send",
      status: "failed",
      error: "fallo de A"
    } as any);
    await ApiFailedMessage.create({
      companyId: b.companyId,
      whatsappId: (b.conexion as any).id,
      endpoint: "/api/send",
      status: "failed",
      error: "fallo de B"
    } as any);

    const usuarioA = await User.findOne({ where: { companyId: a.companyId } });
    const jwt = await tokenDeUsuario(a.companyId, (usuarioA as any).id);

    const res = await request(buildApp())
      .get("/api/failed-messages")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);

    // Se comprueba por companyId además de por el texto: si mañana alguien cambia el
    // nombre del campo `error`, el assert de texto pasaría en vacío y este no.
    const mensajes = res.body.messages as Array<{ companyId: number; error: string }>;
    expect(mensajes).toHaveLength(1);
    expect(mensajes[0].companyId).toBe(a.companyId);
    expect(mensajes[0].error).toBe("fallo de A");
    expect(JSON.stringify(res.body)).not.toContain("fallo de B");
  });
});
