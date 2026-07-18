import { Request, Response } from "express";
import jwt from "jsonwebtoken";

import auth from "../../config/auth";
import Session from "../../models/Session";

import { hashToken } from "../../helpers/hashToken";
import { SendRefreshToken } from "../../helpers/SendRefreshToken";
import {
  createAccessToken,
  createAccessTokenMovil,
  createRefreshToken,
  createRefreshTokenMovil
} from "../../helpers/CreateTokens";
import ShowUserService from "../UserServices/ShowUserService";

const pickRefreshFromRequest = (req: Request): string | undefined => {
  const anyReq = req as Request & { cookies?: Record<string, string> };
  return (
    anyReq.cookies?.jrt ||
    (req.headers["x-refresh-token"] as string) ||
    (req.body && (req.body as any).refreshToken) ||
    undefined
  );
};

const toMs = (v: string | number | undefined, fallbackDays = 7): number => {
  if (typeof v === "number") return v;
  const s = String(v || `${fallbackDays}d`);
  const m = s.match(/^\s*(\d+)\s*([smhd])\s*$/i);
  if (!m) return fallbackDays * 24 * 60 * 60 * 1000;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const mult =
    unit === "s" ? 1_000 :
    unit === "m" ? 60_000 :
    unit === "h" ? 3_600_000 :
    86_400_000;
  return n * mult;
};

const WEB_REFRESH_TTL_MS = toMs(auth.refreshExpiresIn, 7);
const APP_REFRESH_TTL_MS = toMs("24h", 1);

/**
 * Rota el refresh token. Valida sid + hash + estado de la sesión.
 * Si la sesión fue revocada/reemplazada por un login nuevo en el mismo canal,
 * responde 401 con error="session_revoked" para que el cliente cierre sesión.
 */
export default async function RefreshTokenService(req: Request, res: Response) {
  const token = pickRefreshFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: "missing_refresh_token" });
  }

  let payload: any = null;
  try {
    payload = jwt.verify(token, auth.refreshSecret);
  } catch {
    SendRefreshToken(res); // limpia cookie
    return res.status(401).json({ error: "invalid_refresh_token" });
  }

  const userId = Number(payload?.id);
  const sid: string | undefined = payload?.sid;
  const tVersion = payload?.tokenVersion;
  const companyId = payload?.companyId;

  if (!sid) {
    SendRefreshToken(res);
    return res.status(401).json({ error: "session_revoked" });
  }

  const session = await Session.findByPk(sid);
  if (!session) {
    SendRefreshToken(res);
    return res.status(401).json({ error: "session_revoked" });
  }
  if (session.userId !== userId) {
    SendRefreshToken(res);
    return res.status(401).json({ error: "session_revoked" });
  }
  if (session.revokedAt) {
    SendRefreshToken(res);
    return res.status(401).json({ error: "session_revoked" });
  }
  if (session.expiresAt && session.expiresAt <= new Date()) {
    SendRefreshToken(res);
    return res.status(401).json({ error: "session_revoked" });
  }

  // El refresh token presentado debe coincidir con el hash almacenado.
  // Si no coincide, asumimos token comprometido y revocamos la sesión.
  if (hashToken(token) !== session.refreshTokenHash) {
    session.revokedAt = new Date();
    await session.save();
    SendRefreshToken(res);
    return res.status(401).json({ error: "session_revoked" });
  }

  // [F4.3] Multi-empresa: si la sesión tiene una empresa activa (fijada por
  // /switch-company), el refresh re-emite en ESA empresa, no en la del refresh
  // token (que apunta a la empresa home). Así el switch sobrevive al refresh.
  const effectiveCompanyId = session.activeCompanyId ?? companyId;
  const user = await ShowUserService(userId, effectiveCompanyId);
  if (!user) {
    SendRefreshToken(res);
    return res.status(401).json({ error: "user_not_found" });
  }
  if (user.tokenVersion !== tVersion) {
    session.revokedAt = new Date();
    await session.save();
    SendRefreshToken(res);
    return res.status(401).json({ error: "session_revoked" });
  }

  // ROTACIÓN (mismo sid, nuevo refresh token).
  const isApp = session.clientType === "app";
  const newAccess = isApp
    ? createAccessTokenMovil(user, sid)
    : createAccessToken(user, sid);
  const newRefresh = isApp
    ? createRefreshTokenMovil(user, sid)
    : createRefreshToken(user, sid);

  session.refreshTokenHash = hashToken(newRefresh);
  session.lastSeenAt = new Date();
  session.expiresAt = new Date(
    Date.now() + (isApp ? APP_REFRESH_TTL_MS : WEB_REFRESH_TTL_MS)
  );
  await session.save();

  if (session.clientType === "web") {
    SendRefreshToken(res, newRefresh);
  }

  return res.status(200).json({
    token: newAccess,
    user,
    refreshToken: session.clientType === "app" ? newRefresh : undefined
  });
}
