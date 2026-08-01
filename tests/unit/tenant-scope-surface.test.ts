/**
 * Tests unitarios — tenantScope: modo por superficie.
 *
 * La API pública (middleware/tokenAuth) no propagaba companyId al contexto, así
 * que applyScope salía en su primera guarda y el guard quedaba inerte ahí. Al
 * empezar a propagarlo se activaría de golpe sobre endpoints que hoy filtran a
 * mano, por eso esa superficie arranca en 'observe'.
 *
 * Estos tests fijan las dos mitades del contrato:
 *  - scopeWhere no pierde condiciones al inyectar companyId
 *  - la superficie 'api' respeta TENANT_SCOPE_GUARD_API, no TENANT_SCOPE_GUARD
 */
import { Op } from "sequelize";

import { describe, test, expect, beforeEach, afterEach, jest } from "@jest/globals";

jest.mock("../../utils/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

const traceCtx: { current: Record<string, unknown> | undefined } = {
  current: undefined
};
jest.mock("../../utils/traceContext", () => ({
  __esModule: true,
  getTraceContext: () => traceCtx.current
}));

const ENV_KEYS = ["TENANT_SCOPE_GUARD", "TENANT_SCOPE_GUARD_API"] as const;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  ENV_KEYS.forEach(k => {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  });
  traceCtx.current = undefined;
});

afterEach(() => {
  ENV_KEYS.forEach(k => {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  });
});

/**
 * El modo se lee UNA vez al importar el módulo (const MODE/API_MODE), así que
 * cada caso necesita una carga fresca con el env ya puesto. De ahí el
 * resetModules aquí y no en beforeEach: el env se fija dentro del test.
 */
const loadGuard = () => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  return require("../../helpers/tenantScope");
};

/** Instala los hooks sobre un modelo falso y los devuelve por evento. */
const installHooks = (guard: any) => {
  const hooks: Record<string, (o: unknown) => void> = {};
  const fakeModel = {
    rawAttributes: { companyId: {} },
    name: "FakeTenantModel",
    addHook: (event: string, _name: string, fn: (o: unknown) => void) => {
      hooks[event] = fn;
    }
  };
  guard.installTenantScopeHooks([fakeModel]);
  return { hooks, fakeModel };
};

/** Simula el hook beforeFind sobre unas options de Sequelize. */
const runHook = (
  options: Record<string, unknown>
): Record<string, unknown> => {
  const { hooks } = installHooks(loadGuard());
  hooks.beforeFind?.(options);
  return options;
};

describe("scopeWhere — no pierde condiciones", () => {
  test("where vacío → { companyId }", () => {
    const { scopeWhere } = loadGuard();
    expect(scopeWhere(undefined, 7)).toEqual({ companyId: 7 });
    expect(scopeWhere(null, 7)).toEqual({ companyId: 7 });
  });

  test("objeto plano → conserva las claves originales", () => {
    const { scopeWhere } = loadGuard();
    expect(scopeWhere({ status: "open" }, 7)).toEqual({
      status: "open",
      companyId: 7
    });
  });

  test("si ya trae el MISMO companyId lo respeta (misma referencia)", () => {
    const { scopeWhere } = loadGuard();
    const where = { companyId: 7, status: "open" };
    expect(scopeWhere(where, 7)).toBe(where);
  });

  test("si trae OTRO companyId lo SOBRESCRIBE con el del contexto", () => {
    // Antes se respetaba el del where sin mirar su valor, y eso dejaba fuera del
    // guard la forma más común del IDOR: un endpoint que toma companyId del
    // request y lo pasa al where. Lo cazó crossTenant.dbtest en su 1ª corrida.
    const { scopeWhere } = loadGuard();
    const where = { companyId: 3, status: "open" };
    const out = scopeWhere(where, 7);
    expect(out).not.toBe(where);
    expect(out).toEqual({ companyId: 7, status: "open" });
  });

  test("Op.or se preserva y companyId entra como AND de nivel superior", () => {
    const { scopeWhere } = loadGuard();
    // Un literal con solo claves Symbol SIGUE siendo objeto plano: el spread
    // conserva Op.or y añade companyId, que es la semántica correcta
    // (companyId AND (a OR b)), no un OR con el tenant.
    const out = scopeWhere({ [Op.or]: [{ a: 1 }, { b: 2 }] }, 7);
    expect(out.companyId).toBe(7);
    expect(out[Op.or]).toEqual([{ a: 1 }, { b: 2 }]);
  });

  test("where NO plano (instancia de clase) → AND explícito", () => {
    const { scopeWhere } = loadGuard();
    class SequelizeWhereLike {
      constructor(public val: string) {}
    }
    const notPlain = new SequelizeWhereLike("raw");
    const out = scopeWhere(notPlain, 7);
    expect(out[Op.and]).toEqual([notPlain, { companyId: 7 }]);
  });
});

describe("modo por superficie", () => {
  const httpCtx = { origin: "http", companyId: 42, traceId: "t1" };
  const apiCtx = { ...httpCtx, tenantSurface: "api" };

  test("superficie http por defecto: inyecta (enforce)", () => {
    traceCtx.current = httpCtx;
    const out = runHook({ where: { status: "open" } });
    expect(out.where).toEqual({ status: "open", companyId: 42 });
  });

  test("superficie api por defecto: NO inyecta (observe)", () => {
    traceCtx.current = apiCtx;
    const out = runHook({ where: { status: "open" } });
    expect(out.where).toEqual({ status: "open" });
  });

  test("TENANT_SCOPE_GUARD_API=enforce activa la superficie api", () => {
    process.env.TENANT_SCOPE_GUARD_API = "enforce";
    traceCtx.current = apiCtx;
    const out = runHook({ where: { status: "open" } });
    expect(out.where).toEqual({ status: "open", companyId: 42 });
  });

  test("el modo de api es independiente del global", () => {
    // Global apagado, api en enforce → la api sigue scopeando.
    process.env.TENANT_SCOPE_GUARD = "off";
    process.env.TENANT_SCOPE_GUARD_API = "enforce";
    traceCtx.current = apiCtx;
    expect((runHook({ where: {} })).where).toEqual({ companyId: 42 });

    // Y la superficie http, apagada.
    traceCtx.current = httpCtx;
    expect((runHook({ where: {} })).where).toEqual({});
  });

  test("super-admin nunca se scopea, en ninguna superficie", () => {
    process.env.TENANT_SCOPE_GUARD_API = "enforce";
    traceCtx.current = { ...apiCtx, super: true };
    expect((runHook({ where: {} })).where).toEqual({});
  });

  test("sin companyId en contexto no se toca la query", () => {
    process.env.TENANT_SCOPE_GUARD_API = "enforce";
    traceCtx.current = { origin: "http", traceId: "t1" };
    expect((runHook({ where: {} })).where).toEqual({});
  });

  test("origen no-http (jobs/cron/webhooks) queda exento", () => {
    traceCtx.current = { origin: "queue", companyId: 42 };
    expect((runHook({ where: {} })).where).toEqual({});
  });
});

/**
 * El inventario es lo que se lee para decidir el paso a enforce. Si loguease
 * una línea por query, /api/send lo convertiría en ruido y la decisión seguiría
 * sin poder tomarse; estos tests fijan que agrupa y que distingue lo que hay
 * que distinguir (ruta y operación).
 */
describe("companyId ajeno en el where", () => {
  const apiCtx = { origin: "http", companyId: 42, traceId: "t1" };

  test("el hook lo sobrescribe con el del contexto", () => {
    traceCtx.current = apiCtx;
    const out = runHook({ where: { companyId: 99, status: "open" } });
    expect(out.where).toEqual({ companyId: 42, status: "open" });
  });

  test("se avisa por log — no puede pasar en silencio", () => {
    traceCtx.current = apiCtx;
    // OJO: hay que cargar el guard PRIMERO y coger el logger del MISMO registro
    // de módulos. `runHook` llama a loadGuard (que hace resetModules) por dentro,
    // así que capturar el logger antes deja mirando a otra instancia del mock.
    const guard = loadGuard();
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const logger = require("../../utils/logger").default;
    logger.warn.mockClear();

    const { hooks, fakeModel } = installHooks(guard);
    hooks.beforeFind?.({ where: { companyId: 99 }, model: fakeModel });

    const msgs = logger.warn.mock.calls.map((c: any[]) => String(c[1]));
    expect(msgs.some((m: string) => m.includes("pedía OTRA empresa"))).toBe(true);
  });

  test("el super-admin sigue pudiendo pedir otra empresa", () => {
    traceCtx.current = { ...apiCtx, super: true };
    const out = runHook({ where: { companyId: 99 } });
    expect(out.where).toEqual({ companyId: 99 });
  });
});

describe("modo observe — inventario", () => {
  const apiCtx = {
    origin: "http",
    companyId: 42,
    traceId: "t1",
    tenantSurface: "api",
    tenantRoute: "POST /api/messages/send"
  };

  test("N queries iguales = 1 entrada con count=N y UN solo warn", () => {
    traceCtx.current = apiCtx;
    const guard = loadGuard();
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const logger = require("../../utils/logger").default;
    logger.warn.mockClear();

    const { hooks, fakeModel } = installHooks(guard);
    for (let i = 0; i < 5; i++) hooks.beforeFind?.({ where: {}, model: fakeModel });

    const inv = guard.getTenantScopeObservations();
    expect(inv).toHaveLength(1);
    expect(inv[0]).toMatchObject({
      surface: "api",
      route: "POST /api/messages/send",
      model: "FakeTenantModel",
      op: "find",
      count: 5
    });
    // El hallazgo se loguea al verlo por primera vez, no 5 veces.
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  test("distingue por ruta y por operación", () => {
    traceCtx.current = apiCtx;
    const guard = loadGuard();
    const { hooks, fakeModel } = installHooks(guard);

    hooks.beforeFind?.({ where: {}, model: fakeModel });
    hooks.beforeBulkUpdate?.({ where: {}, model: fakeModel });
    traceCtx.current = { ...apiCtx, tenantRoute: "GET /api/messages/:id" };
    hooks.beforeFind?.({ where: {}, model: fakeModel });

    const inv = guard.getTenantScopeObservations();
    expect(inv).toHaveLength(3);
    expect(inv.map((o: any) => o.op).sort()).toEqual(["find", "find", "update"]);
    expect(new Set(inv.map((o: any) => o.route)).size).toBe(2);
  });

  test("en enforce no acumula inventario (inyecta y ya)", () => {
    process.env.TENANT_SCOPE_GUARD_API = "enforce";
    traceCtx.current = apiCtx;
    const guard = loadGuard();
    const { hooks, fakeModel } = installHooks(guard);

    const options: any = { where: {}, model: fakeModel };
    hooks.beforeFind?.(options);

    expect(options.where).toEqual({ companyId: 42 });
    expect(guard.getTenantScopeObservations()).toHaveLength(0);
  });

  test("una query YA scopeada no entra al inventario", () => {
    traceCtx.current = apiCtx;
    const guard = loadGuard();
    const { hooks, fakeModel } = installHooks(guard);

    hooks.beforeFind?.({ where: { companyId: 42 }, model: fakeModel });

    expect(guard.getTenantScopeObservations()).toHaveLength(0);
  });
});
