import { Request, Response } from "express";
import * as jwt from "jsonwebtoken";

import AppError from "../errors/AppError";
import auth from "../config/auth";
import { getIO } from "../libs/socket";

import LoginSessionService from "../services/AuthServices/LoginSessionService";
import RefreshTokenService from "../services/AuthServices/RefreshTokenService";
import ShowUserService from "../services/UserServices/ShowUserService";
import { SendRefreshToken } from "../helpers/SendRefreshToken";
import { sendWebsiteConversionEventAsync } from "../services/FacebookConversionService/SendWebsiteEvent";

import User from "../models/User";
import Session from "../models/Session";
import CompanyUser from "../models/CompanyUser";
import Company from "../models/Company";
import { Op } from "sequelize";

/**
 * [Multi-empresa] Membresías del usuario (empresas donde puede operar), para el
 * selector de empresa del front. isCurrent marca la empresa activa del token.
 */
const getMemberships = async (userId: number, currentCompanyId: number) => {
  const rows = await CompanyUser.findAll({
    where: { userId, active: true },
    include: [{ model: Company, as: "company", attributes: ["id", "name", "status"] }],
    order: [["companyId", "ASC"]]
  });
  return rows.map((m: any) => ({
    companyId: m.companyId,
    companyName: m.company?.name || null,
    status: m.company?.status ?? null,
    profile: m.profile,
    isCurrent: m.companyId === currentCompanyId
  }));
};

type ReqWithCookies = Request & { cookies?: Record<string, string> };

const pickRefreshFromRequest = (req: ReqWithCookies): string | undefined => {
  const cookieToken = req.cookies?.jrt;
  const headerToken =
    req.header("x-refresh-token") || req.header("X-Refresh-Token") || undefined;
  const bodyToken =
    typeof req.body === "object" ? (req.body as any)?.refreshToken : undefined;
  return cookieToken ?? headerToken ?? bodyToken ?? undefined;
};

const pickClientType = (req: Request): "web" | "app" => {
  const raw = (
    (req.body && (req.body as any).clientType) ||
    req.get("x-client-type") ||
    "web"
  )
    .toString()
    .toLowerCase();
  return raw === "app" ? "app" : "web";
};

const pickRequestIp = (req: Request): string | null => {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0].trim();
  }
  if (Array.isArray(fwd) && fwd.length > 0) {
    return fwd[0];
  }
  return req.socket?.remoteAddress || null;
};

/**
 * POST /auth/login
 *
 * Política de sesión:
 *  - Máximo 1 sesión web y 1 sesión app activas por usuario.
 *  - Web y app son independientes.
 *  - Un login nuevo en el mismo canal revoca la sesión anterior del mismo canal
 *    inmediatamente (no devuelve 409).
 */
export const store = async (req: Request, res: Response): Promise<Response> => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res
      .status(400)
      .json({ error: "missing_credentials", message: "email y password son obligatorios" });
  }

  const clientType = pickClientType(req);
  const deviceId =
    (req.body && (req.body as any).deviceId) ||
    req.get("x-device-id") ||
    null;

  const userAgent = req.get("user-agent") || null;
  const ip = pickRequestIp(req);

  const {
    token: accessToken,
    refreshToken,
    sid,
    user,
    serializedUser
  } = await LoginSessionService({
    email,
    password,
    clientType,
    deviceId,
    userAgent,
    ip
  });

  if (clientType === "web") {
    SendRefreshToken(res, refreshToken);
  }

  // Notificación en vivo de actualización de usuario (compat con flujos previos).
  try {
    const io = getIO();
    io.of(`/${serializedUser.companyId}`).emit(
      `company-${serializedUser.companyId}-user`,
      {
        action: "update",
        user: {
          id: serializedUser.id,
          email: serializedUser.email,
          companyId: serializedUser.companyId,
          token: serializedUser.token
        }
      }
    );
  } catch {
    // Socket aún no listo: no falla el login.
  }

  // Conversión Meta (no bloqueante).
  try {
    sendWebsiteConversionEventAsync({
      eventName: "Login",
      eventId: `login_${user.id}_${Date.now()}`,
      user: {
        userId: user.id,
        companyId: user.companyId,
        email: user.email,
        name: user.name
      },
      context: {
        req,
        eventSourceUrl: `${
          process.env.FRONTEND_URL || req.get("origin") || "https://chateam.com"
        }/app`
      },
      customData: {
        method: "password",
        client_type: clientType,
        user_id: user.id,
        company_id: user.companyId,
        user_profile: user.profile || null,
        source: "login"
      }
    });
  } catch {
    // Best effort.
  }

  const body: Record<string, unknown> = {
    token: accessToken,
    user: serializedUser,
    sid,
    clientType
  };
  if (clientType === "app") {
    body.refreshToken = refreshToken;
  }
  // [Multi-empresa] Empresas del usuario (para mostrar selector si tiene >1).
  try {
    body.memberships = await getMemberships(user.id, user.companyId);
  } catch {
    body.memberships = [];
  }

  return res.status(200).json(body);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const token = pickRefreshFromRequest(req);
  if (!token) {
    throw new AppError("ERR_SESSION_EXPIRED error update", 401);
  }
  return RefreshTokenService(req, res);
};

export const me = async (req: Request, res: Response): Promise<Response> => {
  const tokenUser = req.user;
  if (!tokenUser) {
    return res.status(401).json({ error: "user_not_authenticated" });
  }

  // [Super/Impersonación] Si el token es de un super que "entró" a una empresa, el
  // super NO pertenece a esa empresa: cargarlo por id y devolver el companyId destino
  // + la empresa destino, marcando la impersonación para que el front muestre el banner.
  if (tokenUser.impersonatedBy) {
    const UserModel = (await import("../models/User")).default;
    const CompanyModel = (await import("../models/Company")).default;
    const superUser = await UserModel.findByPk(tokenUser.id);
    const targetCompany = await CompanyModel.findByPk(tokenUser.companyId);
    return res.json({
      id: superUser?.id,
      name: superUser?.name,
      email: (superUser as any)?.email,
      profile: "admin",
      companyId: tokenUser.companyId,
      roleId: null,
      role: null,
      super: true,
      impersonating: true,
      impersonatedCompanyName: (targetCompany as any)?.name || null,
      profileImage: (superUser as any)?.profileImage,
      company: targetCompany
    });
  }

  const user = await ShowUserService(tokenUser.id, tokenUser.companyId);

  return res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    profile: user.profile,
    companyId: user.companyId,
    roleId: (user as any).roleId ?? null,
    role: (user as any).role ?? null,
    super: user.super,
    profileImage: user.profileImage,
    company: user.company,
    // [Multi-empresa] empresas del usuario (para el selector de empresa activa)
    memberships: await getMemberships(tokenUser.id, tokenUser.companyId)
  });
};

/**
 * DELETE /auth/logout
 *
 * Revoca SOLO la sesión actual (identificada por sid del access token o
 * del refresh token), no todas las sesiones del usuario.
 */
export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const tokenUser = req.user as
    | { id: number; companyId: number; sid?: string }
    | undefined;

  let sidToRevoke: string | undefined = tokenUser?.sid;
  let revokedUserId: number | undefined = tokenUser?.id;
  let revokedCompanyId: number | undefined = tokenUser?.companyId;
  let revokedClientType: "web" | "app" | undefined;

  try {
    const rt = pickRefreshFromRequest(req);
    if (rt) {
      try {
        const payload: any = jwt.verify(rt, auth.refreshSecret);
        if (payload?.id) revokedUserId = Number(payload.id);
        if (payload?.companyId) revokedCompanyId = Number(payload.companyId);
        if (payload?.sid && !sidToRevoke) sidToRevoke = payload.sid;
      } catch {
        // refresh inválido/expirado: seguimos con el sid del access token.
      }
    }

    if (sidToRevoke) {
      const session = await Session.findByPk(sidToRevoke);
      if (session && !session.revokedAt) {
        revokedClientType = session.clientType;
        revokedUserId = session.userId;
        session.revokedAt = new Date();
        await session.save();
      }
    }

    // Notificar revocación a clientes (por si hay sockets abiertos).
    if (sidToRevoke && revokedUserId && revokedCompanyId) {
      try {
        const io = getIO();
        io.of(`/${revokedCompanyId}`).emit(
          `company-${revokedCompanyId}-session`,
          {
            action: "revoked",
            reason: "logout",
            sid: sidToRevoke,
            userId: revokedUserId,
            clientType: revokedClientType ?? null
          }
        );
      } catch {
        /* socket no disponible */
      }
    }

    if (revokedUserId) {
      const activeSessions = await Session.count({
        where: {
          userId: revokedUserId,
          revokedAt: null,
          expiresAt: { [Op.gt]: new Date() }
        }
      });
      if (activeSessions === 0) {
        const u = await User.findByPk(revokedUserId);
        if (u) await u.update({ online: false });
      }
    }
  } finally {
    SendRefreshToken(res); // borra cookie 'jrt'
  }

  return res.status(204).end();
};

// ============================================================================
// Validate Token — verifica que el access token + la sesión sigan vigentes.
// ============================================================================
export const validate = async (
  req: Request,
  res: Response
): Promise<Response> => {
  return res.status(200).json({ valid: true });
};
