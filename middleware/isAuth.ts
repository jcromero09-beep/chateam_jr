import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

import AppError from "../errors/AppError";
import authConfig from "../config/auth";
import Session from "../models/Session";
import { updateUser } from "../helpers/updateUser";

const { verify } = jwt;

interface TokenPayload {
  id: string | number;
  username?: string;
  profile?: string;
  companyId: number;
  super?: boolean;
  impersonatedBy?: number;
  sid?: string;
  iat: number;
  exp: number;
}

// Throttle en memoria para no escribir lastSeenAt en cada request.
// Mapa sid → timestamp ms del último update propagado a BD.
const LAST_SEEN_THROTTLE_MS = 60_000; // 1 minuto
const lastSeenCache = new Map<string, number>();

const touchSessionLastSeen = (sid: string): void => {
  const now = Date.now();
  const prev = lastSeenCache.get(sid) || 0;
  if (now - prev < LAST_SEEN_THROTTLE_MS) return;
  lastSeenCache.set(sid, now);

  // Fire-and-forget: nunca bloquea la request.
  Session.update(
    { lastSeenAt: new Date(now) },
    { where: { id: sid } }
  ).catch(() => {
    // Si falla (BD ocupada), reintenta en la próxima ventana.
  });
};

const isAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    throw new AppError("ERR_SESSION_EXPIRED", 401);
  }

  const [, token] = authHeader.split(" ");
  if (!token) {
    throw new AppError("ERR_SESSION_EXPIRED", 401);
  }

  let decoded: TokenPayload;
  try {
    decoded = verify(token, authConfig.secret) as TokenPayload;
  } catch (err: any) {
    // Token inválido o expirado → 401 para que el cliente intente refresh.
    throw new AppError("ERR_SESSION_EXPIRED", 401);
  }

  const userId = Number(decoded.id);
  const { sid, profile, companyId, super: superAdmin } = decoded;
  const impersonatedBy = (decoded as any).impersonatedBy;

  if (!sid) {
    // Token legacy sin sid: ya no se admite, forzar re-login.
    throw new AppError("session_revoked", 401);
  }

  // Verificar que la sesión exista, no esté revocada ni expirada y coincida con el usuario.
  const session = await Session.findByPk(sid);
  if (!session) {
    throw new AppError("session_revoked", 401);
  }
  if (session.userId !== userId) {
    throw new AppError("session_revoked", 401);
  }
  if (session.revokedAt) {
    throw new AppError("session_revoked", 401);
  }
  if (session.expiresAt && session.expiresAt <= new Date()) {
    throw new AppError("session_revoked", 401);
  }

  // Marcar al usuario como online (throttleado dentro de updateUser) sin esperar.
  updateUser(userId, companyId);

  // Throttle eficiente para lastSeenAt sin bloquear la request.
  touchSessionLastSeen(sid);

  req.user = {
    id: userId,
    profile,
    companyId,
    super: superAdmin,
    impersonatedBy,
    sid,
    clientType: session.clientType
  };

  return next();
};

export default isAuth;
