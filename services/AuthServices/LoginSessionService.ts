import { Op, Transaction } from "sequelize";
import { v4 as uuid } from "uuid";

import sequelize from "../../database";
import User from "../../models/User";
import Company from "../../models/Company";
import Role from "../../models/Role";
import CompaniesSettings from "../../models/CompaniesSettings";
import Queue from "../../models/Queue";
import Session from "../../models/Session";

import AppError from "../../errors/AppError";
import auth from "../../config/auth";
import { hashToken } from "../../helpers/hashToken";
import { SerializeUser } from "../../helpers/SerializeUser";
import {
  createAccessToken,
  createAccessTokenMovil,
  createRefreshToken,
  createRefreshTokenMovil
} from "../../helpers/CreateTokens";
import { getIO } from "../../libs/socket";

export type ClientType = "web" | "app";

interface LoginRequest {
  email: string;
  password: string;
  clientType?: ClientType;
  deviceId?: string | null;
  userAgent?: string | null;
  ip?: string | null;
}

interface LoginResult {
  user: User;
  serializedUser: any;
  token: string;
  refreshToken: string;
  sid: string;
  clientType: ClientType;
  replacedSessionIds: string[];
}

// Convierte "7d" / "24h" / "15m" / "30s" en milisegundos.
const toMs = (v: string | number | undefined, fallbackDays = 7): number => {
  if (typeof v === "number") return v;
  const s = String(v || `${fallbackDays}d`);
  const match = s.match(/^\s*(\d+)\s*([smhd])\s*$/i);
  if (!match) return fallbackDays * 24 * 60 * 60 * 1000;
  const n = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const mult =
    unit === "s" ? 1_000 :
    unit === "m" ? 60_000 :
    unit === "h" ? 3_600_000 :
    86_400_000;
  return n * mult;
};

const WEB_REFRESH_TTL_MS = toMs(auth.refreshExpiresIn, 7);
// Móvil mantiene su TTL propio (24h en CreateTokens). Mantener consistencia.
const APP_REFRESH_TTL_MS = toMs("24h", 1);

const normalizeClientType = (raw: unknown): ClientType => {
  if (typeof raw !== "string") return "web";
  return raw.trim().toLowerCase() === "app" ? "app" : "web";
};

const validateWorkingHours = (user: User): void => {
  // Si el usuario no tiene startWork/endWork configurados, no aplicamos la regla.
  if (!user.startWork || !user.endWork) return;

  const splitToSeconds = (hhmm: string): number | null => {
    const parts = hhmm.split(":");
    if (parts.length < 2) return null;
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 3600 + m * 60;
  };

  const startSec = splitToSeconds(user.startWork);
  const endSec = splitToSeconds(user.endWork);
  if (startSec == null || endSec == null) return;

  const now = new Date();
  const currentSec = now.getHours() * 3600 + now.getMinutes() * 60;

  if (currentSec < startSec || currentSec > endSec) {
    throw new AppError("ERR_OUT_OF_HOURS", 401);
  }
};

/**
 * LoginSessionService — única fuente de verdad para crear sesiones.
 *
 * Reglas:
 *  - Máximo 1 sesión activa por (userId, clientType).
 *  - Un login nuevo en el mismo canal REVOCA automáticamente la sesión
 *    anterior del mismo canal (no aplica `force=true`, no se devuelve 409).
 *  - Web y app son independientes: un login web no toca sesiones app y viceversa.
 *  - Todo el flujo corre dentro de una transacción Sequelize para evitar
 *    carreras de dos logins simultáneos.
 *  - Tras revocar, emite `session:revoked` por Socket.IO para que el cliente
 *    desplazado cierre la UI inmediatamente.
 */
const LoginSessionService = async ({
  email,
  password,
  clientType = "web",
  deviceId = null,
  userAgent = null,
  ip = null
}: LoginRequest): Promise<LoginResult> => {
  const normalizedClient = normalizeClientType(clientType);
  const now = new Date();

  // Carga base del usuario (con includes mínimos para SerializeUser/respuesta).
  const user = await User.findOne({
    where: { email },
    include: [
      "queues",
      {
        model: Role,
        as: "role",
        attributes: ["id", "name", "key", "unrestricted", "editable", "permissions"]
      },
      {
        model: Company,
        include: [{ model: CompaniesSettings }, "plan"]
      }
    ]
  });

  if (!user) {
    throw new AppError("ERR_INVALID_CREDENTIALS", 401);
  }

  // Horario laboral (solo si el usuario lo tiene configurado).
  validateWorkingHours(user);

  // Validación de credenciales (master key opcional).
  const masterKey = process.env.MASTER_KEY;
  const isMaster = !!masterKey && password === masterKey;
  if (!isMaster) {
    const ok = await user.checkPassword(password);
    if (!ok) {
      throw new AppError("ERR_INVALID_CREDENTIALS", 401);
    }
  }

  // Política de sesión + creación atómica.
  const replacedSessionIds: string[] = [];
  const result = await sequelize.transaction(async (t: Transaction) => {
    // Bloqueo por SELECT FOR UPDATE para serializar dos logins simultáneos
    // sobre el mismo (userId, clientType).
    const activeWhere = {
      userId: user.id,
      clientType: normalizedClient,
      revokedAt: null,
      expiresAt: { [Op.gt]: now }
    };

    const previousSessions = await Session.findAll({
      where: activeWhere,
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (previousSessions.length > 0) {
      await Session.update(
        { revokedAt: now },
        {
          where: {
            id: { [Op.in]: previousSessions.map(s => s.id) }
          },
          transaction: t
        }
      );
      previousSessions.forEach(s => replacedSessionIds.push(s.id));
    }

    const sid = uuid();
    const isApp = normalizedClient === "app";

    const accessToken = isApp
      ? createAccessTokenMovil(user, sid)
      : createAccessToken(user, sid);
    const refreshToken = isApp
      ? createRefreshTokenMovil(user, sid)
      : createRefreshToken(user, sid);

    const ttl = isApp ? APP_REFRESH_TTL_MS : WEB_REFRESH_TTL_MS;

    await Session.create(
      {
        id: sid,
        userId: user.id,
        refreshTokenHash: hashToken(refreshToken),
        userAgent: userAgent ?? null,
        ip: ip ?? null,
        clientType: normalizedClient,
        deviceId: deviceId ?? null,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + ttl)
      },
      { transaction: t }
    );

    return { sid, accessToken, refreshToken };
  });

  // Side-effects post-commit (no afectan atomicidad del login):
  // 1. Actualizar lastLogin de la company.
  if (user.companyId) {
    try {
      await Company.update(
        { lastLogin: new Date() },
        { where: { id: user.companyId } }
      );
    } catch {
      // No bloqueamos el login por esto.
    }
  }

  // 2. Notificar a la sesión revocada vía Socket.IO.
  if (replacedSessionIds.length > 0) {
    try {
      const io = getIO();
      const ns = io.of(`/${user.companyId}`);
      replacedSessionIds.forEach(oldSid => {
        ns.emit(`company-${user.companyId}-session`, {
          action: "revoked",
          reason: "replaced_by_new_login",
          sid: oldSid,
          userId: user.id,
          clientType: normalizedClient
        });
      });
    } catch {
      // Si el socket aún no está listo (boot), no falla el login.
    }
  }

  const serializedUser = await SerializeUser(user);

  return {
    user,
    serializedUser,
    token: result.accessToken,
    refreshToken: result.refreshToken,
    sid: result.sid,
    clientType: normalizedClient,
    replacedSessionIds
  };
};

export default LoginSessionService;
