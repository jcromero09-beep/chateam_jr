import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

import AppError from "../errors/AppError";
import authConfig from "../config/auth";
import Session from "../models/Session";
import { updateUser } from "../helpers/updateUser";
import { buildMediaCookie, MEDIA_COOKIE } from "../helpers/mediaAuthCookie";
import { updateTraceContext } from "../utils/traceContext";
import logger from "../utils/logger";

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
  //
  // Fire-and-forget está bien aquí —no debe bloquear la request—, pero SIN CATCH
  // no: una promesa que se rechaza y nadie escucha es un `unhandledRejection`.
  // Eran los 38 del log de producción (32 × ERR_NO_USER_FOUND, 5 × timeout, 1 ×
  // conexión cerrada). `ShowUserService` filtra por `{ id, companyId }`, así que
  // durante una impersonación —donde el userId puede no pertenecer a esa
  // empresa— lanza ERR_NO_USER_FOUND; y bajo carga puede expirar.
  //
  // Los tapaba la red de `process.on("unhandledRejection")` de
  // server-distributed.ts, que existe justamente para que esto no reinicie el
  // backend. Pero una red de seguridad no es el sitio donde manejar un error
  // conocido: se maneja aquí, y la red vuelve a ser lo que debe ser — la última
  // línea, no la primera.
  //
  // Marcar "online" es best-effort: si falla, la request sigue igual.
  updateUser(userId, companyId).catch(err => {
    logger.debug(
      { err: { name: err?.name, message: err?.message }, userId, companyId },
      "[isAuth] no se pudo marcar el usuario como online (best-effort)"
    );
  });

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

  // [W1-SEC-IDOR] Propaga companyId/super al AsyncLocalStorage de la request
  // para que el guard estructural de tenant (helpers/tenantScope) acote toda
  // query ORM al tenant del usuario autenticado. El super-admin queda exento.
  updateTraceContext({ companyId, super: !!superAdmin });

  // [P0-E · W1-SEC-02] Cookie de acceso a media (mismo origen). La `<img>` no
  // envía Bearer; esta cookie httpOnly+Secure permite servir /public con scope
  // de tenant. Se (re)setea si falta o difiere → las sesiones activas la reciben
  // en su siguiente request autenticado (los pollers disparan constantemente),
  // sin ventana de corte.
  try {
    const expectedMediaCookie = buildMediaCookie(companyId, !!superAdmin);
    if (req.cookies?.[MEDIA_COOKIE] !== expectedMediaCookie) {
      res.cookie(MEDIA_COOKIE, expectedMediaCookie, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000
      });
    }
  } catch {
    // No bloquear la request por un fallo al setear la cookie de media.
  }

  return next();
};

export default isAuth;
