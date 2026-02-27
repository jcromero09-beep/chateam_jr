import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import auth from "../../config/auth";
import User from "../../models/User";
import Session from "../../models/Session";
import { hashToken } from "../../helpers/hashToken";
import { SendRefreshToken } from "../../helpers/SendRefreshToken";
import { createAccessToken, createRefreshToken, createRefreshTokenMovil, createAccessTokenMovil }from "../../helpers/CreateTokens";
import ShowUserService from "../UserServices/ShowUserService";
interface RefreshTokenPayload {
  id: string;
  tokenVersion: number;
  companyId: number;
}


// export const RefreshTokenService = async (
//   res: Res,
//   token: string
// ): Promise<Response> => {
//   try {
//     const decoded = verify(token, authConfig.refreshSecret);
//     const { id, tokenVersion, companyId } = decoded as RefreshTokenPayload;

//     const user = await ShowUserService(id, companyId);

//     if (user.tokenVersion !== tokenVersion) {
//       res.clearCookie("jrt");
//       throw new AppError("ERR_SESSION_EXPIRED", 401);
//     }

//     const newToken = createAccessToken(user);
//     const refreshToken = createRefreshToken(user);

//     return { user, newToken, refreshToken };
//   } catch (err) {
//     res.clearCookie("jrt");
//     throw new AppError("ERR_SESSION_EXPIRED", 401);
//   }
// };



const pickRefreshFromRequest = (req: Request): string | undefined => {
  return (
    req.cookies?.jrt ||
    (req.headers["x-refresh-token"] as string) ||
    (req.body && req.body.refreshToken) ||
    undefined
  );
};

export default async function RefreshTokenService(req: Request, res: Response) {

  const token = pickRefreshFromRequest(req);

  if (!token) return res.status(401).json({ error: "missing_refresh_token" }
    
  );

  let payload: any = null;
  try {
    payload = jwt.verify(token, auth.refreshSecret);
  } catch {
    return res.status(401).json({ error: "invalid_refresh_token" });
  }

  const userId = Number(payload.id);
  const sid: string = payload.sid;
  const tVersion = payload.tokenVersion;
  const companyId = payload.companyId

    const user = await ShowUserService(userId, companyId);
  if (!user) return res.status(401).json({ error: "user_not_found" });
  if (user.tokenVersion !== tVersion) {
    return res.status(401).json({ error: "token_version_mismatch" });
  }

  const session = await Session.findByPk(sid);
  if (!session) return res.status(401).json({ error: "session_not_found" });
  if (session.userId !== user.id) return res.status(401).json({ error: "session_user_mismatch" });
  if (session.revokedAt) return res.status(401).json({ error: "session_revoked" });
  if (session.expiresAt <= new Date()) return res.status(401).json({ error: "session_expired" });

  // Coincidencia por hash
  if (hashToken(token) !== session.refreshTokenHash) {
    return res.status(401).json({ error: "refresh_hash_mismatch" });
  }

  // ROTACIÓN (mismo sid)
  const isApp = session.clientType === "app";
  const newAccess  = isApp ? createAccessTokenMovil(user, sid) : createAccessToken(user, sid);
  const newRefresh = isApp ? createRefreshTokenMovil(user, sid) : createRefreshToken(user, sid);


  session.refreshTokenHash = hashToken(newRefresh);
  session.lastSeenAt = new Date();
  session.expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // ajusta a tu TTL
  await session.save();

  // Si la sesión es web → cookie; si es app → devolver en body
  if (session.clientType === "web") {


    SendRefreshToken(res, newRefresh);

  }


  return res.status(200).json({
    token: newAccess,
    user: user,
    refreshToken: session.clientType === "app" ? newRefresh : undefined
    
  });
}
