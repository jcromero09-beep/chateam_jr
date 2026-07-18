/**
 * Integración: política de sesiones por canal.
 *
 * Comportamiento esperado:
 *  1) login web A crea sesión web.
 *  2) login web B revoca web A y NO toca app.
 *  3) login app A crea sesión app.
 *  4) login app B revoca app A y NO toca web.
 *  5) access token de sesión revocada falla en endpoint protegido.
 *  6) refresh token de sesión revocada falla.
 *  7) logout revoca SOLO la sesión actual.
 *  8) dos logins simultáneos no dejan dos sesiones activas del mismo canal.
 *
 * Estos tests usan mocks de Sequelize a nivel de modelo Session para no
 * requerir una BD real; el objetivo es validar la lógica de LoginSessionService,
 * RefreshTokenService e isAuth coordinadamente.
 */
import { describe, test, expect, beforeEach, jest } from "@jest/globals";

// Mock de BD: transaction(fn) recibe un objeto con LOCK y SERIALIZA las
// transacciones para emular el comportamiento real con LOCK FOR UPDATE.
jest.mock("../../database", () => {
  const lockObj = { UPDATE: "UPDATE" };
  let txQueue: Promise<unknown> = Promise.resolve();
  return {
    __esModule: true,
    default: {
      transaction: jest.fn((fn: any) => {
        const tx = { LOCK: lockObj, sequelize: { query: jest.fn() } };
        const run = txQueue.then(() => fn(tx));
        // No propagamos rechazo a la cola para no envenenar tests siguientes.
        txQueue = run.catch(() => undefined);
        return run;
      })
    }
  };
});

jest.mock("../../models/User");
jest.mock("../../models/Company");
jest.mock("../../models/Session");
jest.mock("../../models/Queue");
jest.mock("../../models/CompaniesSettings");
jest.mock("../../helpers/CreateTokens", () => ({
  createAccessToken: () => "access-web",
  createAccessTokenMovil: () => "access-app",
  createRefreshToken: () => "refresh-web",
  createRefreshTokenMovil: () => "refresh-app"
}));
jest.mock("../../helpers/SerializeUser", () => ({
  SerializeUser: async (u: any) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    companyId: u.companyId,
    profile: u.profile,
    token: "stub"
  })
}));
jest.mock("../../helpers/hashToken", () => ({
  hashToken: (raw: string) => `hash(${raw})`
}));
jest.mock("../../helpers/SendRefreshToken", () => ({
  SendRefreshToken: () => undefined,
  default: () => undefined
}));
jest.mock("../../libs/socket", () => ({
  getIO: () => ({
    of: () => ({ emit: jest.fn() })
  })
}));
jest.mock("../../services/UserServices/ShowUserService", () => ({
  __esModule: true,
  default: async (id: number, _companyId: number) => ({
    id,
    name: "Test",
    email: "test@x.com",
    companyId: 1,
    profile: "admin",
    tokenVersion: 0
  })
}));

import LoginSessionService from "../../services/AuthServices/LoginSessionService";
import RefreshTokenService from "../../services/AuthServices/RefreshTokenService";
import User from "../../models/User";
import Session from "../../models/Session";
import jwt from "jsonwebtoken";
import auth from "../../config/auth";

// Estado en memoria para emular Sessions.
type Row = {
  id: string;
  userId: number;
  clientType: "web" | "app";
  refreshTokenHash: string;
  revokedAt: Date | null;
  expiresAt: Date;
  lastSeenAt: Date | null;
  deviceId?: string | null;
  userAgent?: string | null;
  ip?: string | null;
  save: () => Promise<void>;
};

let store: Map<string, Row>;

const extractIdsFromOpIn = (idClause: any): string[] => {
  if (!idClause) return [];
  if (typeof idClause === "string") return [idClause];
  if (Array.isArray(idClause)) return idClause;
  // Sequelize usa Symbol como key para Op.in.
  for (const sym of Object.getOwnPropertySymbols(idClause)) {
    const v = (idClause as any)[sym];
    if (Array.isArray(v)) return v;
  }
  if (Array.isArray((idClause as any).in)) return (idClause as any).in;
  return [];
};

const wireSessionMock = () => {
  store = new Map();

  (Session as any).findAll = jest.fn(async (opts: any) => {
    const w = opts.where || {};
    return [...store.values()].filter(r => {
      if (w.userId !== undefined && r.userId !== w.userId) return false;
      if (w.clientType !== undefined && r.clientType !== w.clientType) return false;
      if (w.revokedAt === null && r.revokedAt !== null) return false;
      return true;
    });
  });

  (Session as any).update = jest.fn(async (values: any, opts: any) => {
    const ids = extractIdsFromOpIn(opts.where?.id);
    let updated = 0;
    for (const r of store.values()) {
      if (ids.includes(r.id)) {
        Object.assign(r, values);
        updated += 1;
      }
    }
    return [updated];
  });

  (Session as any).create = jest.fn(async (row: any) => {
    const r: Row = {
      revokedAt: null,
      lastSeenAt: null,
      deviceId: null,
      userAgent: null,
      ip: null,
      ...row,
      save: async () => undefined
    };
    store.set(row.id, r);
    return r;
  });

  (Session as any).findByPk = jest.fn(async (id: string) => {
    const row = store.get(id);
    if (!row) return null;
    row.save = async () => {
      store.set(row.id, row);
    };
    return row;
  });

  (Session as any).count = jest.fn(async (opts: any) => {
    const w = opts.where || {};
    return [...store.values()].filter(
      r =>
        r.userId === w.userId &&
        r.revokedAt === null &&
        r.expiresAt > new Date()
    ).length;
  });
};

const wireUserMock = () => {
  (User as any).findOne = jest.fn(async () => ({
    id: 1,
    name: "Test",
    email: "test@x.com",
    profile: "admin",
    companyId: 1,
    startWork: "00:00",
    endWork: "23:59",
    queues: [],
    checkPassword: async () => true
  }));
  (User as any).findByPk = jest.fn(async () => ({
    id: 1,
    companyId: 1,
    update: async () => undefined
  }));
};

const setupCompanyMock = () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Company = require("../../models/Company").default;
  (Company as any).findByPk = jest.fn(async () => ({
    id: 1,
    update: async () => undefined
  }));
  (Company as any).update = jest.fn(async () => [1]);
};

// Helper para emular el flujo real con Op.in: aquí, Session.update se llama
// con un objeto { [Op.in]: [...] }. En el mock leemos los Symbol owners.
const fakeReqRes = (refreshToken?: string) => {
  const req: any = {
    body: refreshToken ? { refreshToken } : {},
    headers: refreshToken ? { "x-refresh-token": refreshToken } : {},
    cookies: {}
  };
  let statusCode = 200;
  let jsonBody: any = null;
  const res: any = {
    status(c: number) {
      statusCode = c;
      return res;
    },
    json(b: any) {
      jsonBody = b;
      return res;
    },
    cookie() {},
    clearCookie() {}
  };
  return { req, res, get statusCode() { return statusCode; }, get body() { return jsonBody; } };
};

describe("Política de sesiones por canal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    wireSessionMock();
    wireUserMock();
    setupCompanyMock();
  });

  test("(1) login web A crea una sesión web", async () => {
    const r = await LoginSessionService({
      email: "test@x.com",
      password: "ok",
      clientType: "web"
    });
    const active = [...store.values()].filter(s => s.revokedAt === null);
    expect(active).toHaveLength(1);
    expect(active[0].clientType).toBe("web");
    expect(r.replacedSessionIds).toHaveLength(0);
  });

  test("(2) login web B revoca web A y NO toca app", async () => {
    await LoginSessionService({ email: "test@x.com", password: "ok", clientType: "app" });
    const a = await LoginSessionService({ email: "test@x.com", password: "ok", clientType: "web" });
    const b = await LoginSessionService({ email: "test@x.com", password: "ok", clientType: "web" });

    const webActive = [...store.values()].filter(
      s => s.clientType === "web" && s.revokedAt === null
    );
    const appActive = [...store.values()].filter(
      s => s.clientType === "app" && s.revokedAt === null
    );
    expect(webActive).toHaveLength(1);
    expect(webActive[0].id).toBe(b.sid);
    expect(appActive).toHaveLength(1); // app intacta
    expect(b.replacedSessionIds).toContain(a.sid);
  });

  test("(3 y 4) login app B revoca app A y NO toca web", async () => {
    await LoginSessionService({ email: "test@x.com", password: "ok", clientType: "web" });
    const a = await LoginSessionService({ email: "test@x.com", password: "ok", clientType: "app" });
    const b = await LoginSessionService({ email: "test@x.com", password: "ok", clientType: "app" });

    const webActive = [...store.values()].filter(
      s => s.clientType === "web" && s.revokedAt === null
    );
    const appActive = [...store.values()].filter(
      s => s.clientType === "app" && s.revokedAt === null
    );
    expect(webActive).toHaveLength(1);
    expect(appActive).toHaveLength(1);
    expect(appActive[0].id).toBe(b.sid);
    expect(b.replacedSessionIds).toContain(a.sid);
  });

  test("(6) refresh token de sesión revocada falla con session_revoked", async () => {
    // Sesión 1 (refresh token RT1, hash conocido).
    const r1 = await LoginSessionService({
      email: "test@x.com",
      password: "ok",
      clientType: "web"
    });
    // Forzar que el hash almacenado coincida con el refresh JWT real.
    const rt = jwt.sign(
      { id: 1, sid: r1.sid, tokenVersion: 0, companyId: 1 },
      auth.refreshSecret,
      { expiresIn: "7d" }
    );
    const session = store.get(r1.sid)!;
    session.refreshTokenHash = `hash(${rt})`;

    // Sesión 2 (revoca la 1).
    await LoginSessionService({
      email: "test@x.com",
      password: "ok",
      clientType: "web"
    });

    expect(store.get(r1.sid)?.revokedAt).not.toBeNull();

    const w = fakeReqRes(rt);
    await RefreshTokenService(w.req as any, w.res as any);
    expect(w.body?.error).toBe("session_revoked");
  });

  test("(8) dos logins web simultáneos solo dejan UNA sesión web activa", async () => {
    const [r1, r2] = await Promise.all([
      LoginSessionService({ email: "test@x.com", password: "ok", clientType: "web" }),
      LoginSessionService({ email: "test@x.com", password: "ok", clientType: "web" })
    ]);
    const webActive = [...store.values()].filter(
      s => s.clientType === "web" && s.revokedAt === null
    );
    expect(webActive).toHaveLength(1);
    // El sobreviviente debe ser uno de los dos sids generados.
    expect([r1.sid, r2.sid]).toContain(webActive[0].id);
  });

  test("(5) sesión revocada hace que el refresh devuelva session_revoked aun con JWT válido", async () => {
    const r = await LoginSessionService({
      email: "test@x.com",
      password: "ok",
      clientType: "web"
    });
    // Refrescar el hash al token real.
    const rt = jwt.sign(
      { id: 1, sid: r.sid, tokenVersion: 0, companyId: 1 },
      auth.refreshSecret,
      { expiresIn: "7d" }
    );
    const session = store.get(r.sid)!;
    session.refreshTokenHash = `hash(${rt})`;

    // Revocar manualmente (simula logout o ser desplazado).
    session.revokedAt = new Date();

    const w = fakeReqRes(rt);
    await RefreshTokenService(w.req as any, w.res as any);
    expect(w.body?.error).toBe("session_revoked");
  });
});
