/**
 * Tests unitarios de AuthUserService (wrapper de LoginSessionService).
 *
 * La política de sesión real está cubierta en
 * tests/integration/session-policy.test.ts. Aquí validamos:
 *  - credenciales inválidas
 *  - horario laboral
 *  - master key
 *  - el flag legacy `force` ya NO produce 409 (login nuevo siempre toma control)
 *  - sesiones app no se ven afectadas por la política web
 */
import { describe, test, expect, beforeAll, afterAll, jest } from "@jest/globals";

// Mock de la BD (transaction(fn) ejecuta fn pasando un objeto con LOCK).
jest.mock("../../database", () => {
  const lockObj = { UPDATE: "UPDATE" };
  return {
    __esModule: true,
    default: {
      transaction: jest.fn(async (fn: any) =>
        fn({ LOCK: lockObj, sequelize: { query: jest.fn() } })
      )
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
jest.mock("../../libs/socket", () => ({
  getIO: () => ({
    of: () => ({ emit: () => undefined })
  })
}));

import AuthUserService from "../../services/UserServices/AuthUserService";
import User from "../../models/User";
import Company from "../../models/Company";
import Session from "../../models/Session";

describe("AuthUserService (compat) — nuevo contrato sin 409", () => {
  const mockUser = {
    id: 1,
    name: "Test User",
    email: "test@jrchateam.com",
    profile: "admin",
    companyId: 1,
    startWork: "08:00",
    endWork: "18:00",
    checkPassword: jest.fn(),
    queues: []
  };

  const mockCompany = {
    id: 1,
    name: "Test Company",
    lastLogin: new Date(),
    update: jest.fn()
  };

  beforeAll(() => {
    jest.spyOn(Date.prototype, "getHours").mockReturnValue(10);
    jest.spyOn(Date.prototype, "getMinutes").mockReturnValue(0);
    (Company.update as any) = jest.fn().mockResolvedValue([1]);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  // Helper: AppError no extiende Error → usamos matchers de mensaje.
  const expectAppError = (p: Promise<unknown>, expected: string) =>
    expect(p).rejects.toMatchObject({ message: expected });

  test("rechaza credenciales inválidas", async () => {
    (User.findOne as jest.MockedFunction<any>).mockResolvedValue(null);
    await expectAppError(
      AuthUserService({ email: "no@x.com", password: "x" }),
      "ERR_INVALID_CREDENTIALS"
    );
  });

  test("rechaza password incorrecto", async () => {
    (User.findOne as jest.MockedFunction<any>).mockResolvedValue(mockUser);
    mockUser.checkPassword.mockResolvedValue(false as never);
    await expectAppError(
      AuthUserService({ email: mockUser.email, password: "bad" }),
      "ERR_INVALID_CREDENTIALS"
    );
  });

  test("rechaza fuera de horario laboral", async () => {
    const spy = jest.spyOn(Date.prototype, "getHours").mockReturnValue(22);
    try {
      (User.findOne as jest.MockedFunction<any>).mockResolvedValue(mockUser);
      await expectAppError(
        AuthUserService({ email: mockUser.email, password: "x" }),
        "ERR_OUT_OF_HOURS"
      );
    } finally {
      spy.mockRestore();
      jest.spyOn(Date.prototype, "getHours").mockReturnValue(10);
    }
  });

  test("login web sin sesión previa: NO marca replacedOldWebSession", async () => {
    (User.findOne as jest.MockedFunction<any>).mockResolvedValue(mockUser);
    mockUser.checkPassword.mockResolvedValue(true as never);
    (Company.findByPk as jest.MockedFunction<any>).mockResolvedValue(mockCompany);

    (Session.findAll as jest.MockedFunction<any>).mockResolvedValue([]);
    (Session.update as jest.MockedFunction<any>).mockResolvedValue([0]);
    (Session.create as jest.MockedFunction<any>).mockResolvedValue({ id: "new-sid" });

    const result = await AuthUserService({
      email: mockUser.email,
      password: "ok",
      clientType: "web"
    });
    expect(result.token).toBe("access-web");
    expect(result.refreshToken).toBe("refresh-web");
    expect(result.replacedOldWebSession).toBe(false);
    expect(result.clientType).toBe("web");
  });

  test("login web con sesión web previa: revoca y NO lanza 409", async () => {
    (User.findOne as jest.MockedFunction<any>).mockResolvedValue(mockUser);
    mockUser.checkPassword.mockResolvedValue(true as never);
    (Company.findByPk as jest.MockedFunction<any>).mockResolvedValue(mockCompany);

    (Session.findAll as jest.MockedFunction<any>).mockResolvedValue([
      { id: "prev-sid", userId: 1, clientType: "web" }
    ]);
    (Session.update as jest.MockedFunction<any>).mockResolvedValue([1]);
    (Session.create as jest.MockedFunction<any>).mockResolvedValue({ id: "new-sid" });

    const result = await AuthUserService({
      email: mockUser.email,
      password: "ok",
      clientType: "web"
    });
    expect(result.replacedOldWebSession).toBe(true);
    // Importante: NUNCA lanza 409 aunque haya sesión web previa.
  });

  test("login app no toca sesiones web (canales independientes)", async () => {
    (User.findOne as jest.MockedFunction<any>).mockResolvedValue(mockUser);
    mockUser.checkPassword.mockResolvedValue(true as never);
    (Company.findByPk as jest.MockedFunction<any>).mockResolvedValue(mockCompany);

    // findAll se invoca con where.clientType === 'app' — devolvemos vacío.
    (Session.findAll as jest.MockedFunction<any>).mockImplementation(
      async (opts: any) => {
        expect(opts.where.clientType).toBe("app");
        return [];
      }
    );
    (Session.create as jest.MockedFunction<any>).mockResolvedValue({ id: "app-sid" });

    const result = await AuthUserService({
      email: mockUser.email,
      password: "ok",
      clientType: "app",
      deviceId: "device-xyz"
    });
    expect(result.clientType).toBe("app");
    expect(result.token).toBe("access-app");
    expect(result.refreshToken).toBe("refresh-app");
    expect(result.replacedOldWebSession).toBe(false);
  });

  test("acepta MASTER_KEY como bypass de password", async () => {
    process.env.MASTER_KEY = "master-secret-key";
    (User.findOne as jest.MockedFunction<any>).mockResolvedValue(mockUser);
    (Session.findAll as jest.MockedFunction<any>).mockResolvedValue([]);
    (Session.create as jest.MockedFunction<any>).mockResolvedValue({ id: "master-sid" });

    const result = await AuthUserService({
      email: mockUser.email,
      password: "master-secret-key"
    });
    expect(result.token).toBe("access-web");
    delete process.env.MASTER_KEY;
  });
});
