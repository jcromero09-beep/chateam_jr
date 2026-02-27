import { Request, Response } from "express";
import AppError from "../errors/AppError";
import { getIO } from "../libs/socket";
import { v4 as uuid } from "uuid";
import auth from "../config/auth";
import * as jwt from "jsonwebtoken";
import AuthUserService from "../services/UserServices/AuthUserService";
import { SendRefreshToken } from "../helpers/SendRefreshToken";
import RefreshTokenService from "../services/AuthServices/RefreshTokenService";
import FindUserFromToken from "../services/AuthServices/FindUserFromToken";
import User from "../models/User";
import Session from "../models/Session"
import { createAccessToken, createRefreshToken, createRefreshTokenMovil, createAccessTokenMovil } from "../helpers/CreateTokens";
import { hashToken } from "../helpers/hashToken";
import { SerializeUser } from "../helpers/SerializeUser";
import ShowUserService from "../services/UserServices/ShowUserService";

// export const store = async (req: Request, res: Response): Promise<Response> => {
//   const { email, password } = req.body;

//   const { token, serializedUser, refreshToken } = await AuthUserService({
//     email,
//     password
//   });

//   SendRefreshToken(res, refreshToken);

//   const io = getIO();

//   io.of(serializedUser.companyId.toString())
//   .emit(`company-${serializedUser.companyId}-auth`, {
//     action: "update",
//     user: {
//       id: serializedUser.id,
//       email: serializedUser.email,
//       companyId: serializedUser.companyId,
//       token: serializedUser.token
//     }
//   });


//   return res.status(200).json({
//     token,
//     user: serializedUser
//   });
// };


const REFRESH_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 días (ajusta a tu config)

// Helper para leer el refresh token desde la request
type ReqWithCookies = Request & { cookies?: Record<string, string> };

const pickRefreshFromRequest = (req: ReqWithCookies): string | undefined => {
    const cookieToken = req.cookies?.jrt;
    const headerToken = req.header("x-refresh-token") || req.header("X-Refresh-Token") || undefined;
    const bodyToken = typeof req.body === "object" ? (req.body as any).refreshToken : undefined;
    return cookieToken ?? headerToken ?? bodyToken ?? undefined;
};
/**
 * POST /auth/login
 * - Política: una sola sesión WEB activa por usuario; APP ilimitado
 * - Si clientType=web => cookie HTTPOnly 'jrt'
 * - Si clientType=app => refresh en el body (frontend APP lo guarda en SecureStorage)
 */
export const store = async (req: Request, res: Response): Promise<Response> => {
    const { email, password, force } = req.body;
    const clientTypeRaw = (req.body.clientType || req.get("x-client-type") || "web").toString().toLowerCase();
    const clientType = clientTypeRaw === "app" ? "app" : "web";
    const deviceId = req.body.deviceId || req.get("x-device-id") || null;

    // Validación de credenciales
    const user = await User.findOne({ where: { email } });
    if (!user || !(await user.checkPassword(password))) {
        return res.status(401).json({ error: "invalid_credentials" });
    }

    // Política: Solo 1 sesión WEB activa por usuario
    if (clientType === "web") {
        const existingWeb = await Session.findOne({
            where: { userId: user.id, clientType: "web", revokedAt: null },
            order: [["createdAt", "DESC"]]
        });

        const stillActive = !!existingWeb && existingWeb.expiresAt > new Date();

        if (stillActive && !force) {
            return res.status(409).json({
                error: "web_session_already_active",
                message: "Ya existe una sesión web activa. Use force=true para tomar el control."
            });
        }

        if (stillActive && force) {
            existingWeb!.revokedAt = new Date();
            await existingWeb!.save();
        }
    }

    // Crea la sesión (sid) y firma tokens con ese sid
    const sid = uuid();

    // ⬇️ tokens según tipo
    const accessToken = clientType === "app" ? createAccessTokenMovil(user, sid)
        : createAccessToken(user, sid);
    const refreshToken = clientType === "app" ? createRefreshTokenMovil(user, sid)
        : createRefreshToken(user, sid);

    const now = new Date();
    await Session.create({
        id: sid,
        userId: user.id,
        refreshTokenHash: hashToken(refreshToken),
        userAgent: req.get("user-agent") || null,
        ip: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || null,
        clientType,
        deviceId,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + REFRESH_TTL_MS)
    });

    // WEB -> cookie HTTPOnly; APP -> refresh en body
    if (clientType === "web") {
        SendRefreshToken(res, refreshToken);
    }


    const userc = await ShowUserService(user.id, user.companyId);
    if (clientType === "app") {
        console.log('online', userc.online)
        await userc.update({ online: false });
        console.log('online', userc.online)
    }

    const serializedUser = await SerializeUser(userc);
    //console.log('serializedUser', serializedUser)

    // Emisión socket: usa un solo namespace consistente
    const io = getIO();
    const ns = io.of(`/${serializedUser.companyId}`);
    ns.emit(`company-${serializedUser.companyId}-user`, {
        action: "update",
        user: {
            id: serializedUser.id,
            email: serializedUser.email,
            companyId: serializedUser.companyId,
            token: serializedUser.token
        }
    });

    // Construir respuesta base
    const responseData: any = {
        token: accessToken,
        user: serializedUser,
        sid,
        clientType
    };

    // Si es app, incluir refreshToken en el body
    if (clientType === "app") {
        responseData.refreshToken = refreshToken;
    }

    return res.status(200).json(responseData);
};


export const update = async (req: Request, res: Response): Promise<Response> => {
    const token = pickRefreshFromRequest(req);

    if (!token) {
        throw new AppError("ERR_SESSION_EXPIRED error update", 401);
    }

    // ✅ firma correcta, ya no dará el error de TS

    return RefreshTokenService(req, res);

};
export const me = async (req: Request, res: Response): Promise<Response> => {
    // El middleware isAuth ya validó el access token y populó req.user
    const tokenUser = (req as any).user;

    if (!tokenUser) {
        return res.status(401).json({ error: "user_not_authenticated" });
    }

    // Obtener datos completos del usuario desde la DB (incluye company y plan)
    const user = await ShowUserService(tokenUser.id, tokenUser.companyId);

    return res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        profile: user.profile,
        companyId: user.companyId,
        super: user.super,
        profileImage: user.profileImage,
        company: user.company
    });
};


export const remove = async (req: Request, res: Response): Promise<Response> => {
    try {
        // Revoca la sesión en DB si tenemos el refresh
        const rt = pickRefreshFromRequest(req);
        if (rt) {
            try {
                const payload: any = jwt.verify(rt, auth.refreshSecret);
                if (payload?.sid) {
                    const s = await Session.findByPk(payload.sid);
                    if (s && !s.revokedAt) {
                        s.revokedAt = new Date();
                        await s.save();
                    }
                }
            } catch {
                // refresh inválido/expirado — seguimos limpiando cookie
            }
        }

        // Marca usuario offline si viene en req.user (opcional)
        const userId = (req as any).user?.id;
        if (userId) {
            const u = await User.findByPk(userId);
            if (u) await u.update({ online: false });
        }
    } finally {
        // BORRAR cookie (mismo path, sin domain)
        SendRefreshToken(res); // <-- llamar sin token lo borra
    }

    return res.status(204).end();
};

// ============================================================================
// Validate Token - Verificar si el token actual es válido
// ============================================================================
export const validate = async (req: Request, res: Response): Promise<Response> => {
    // El middleware isAuth ya verificó el token
    // Si llegamos aquí, el token es válido
    return res.status(200).json({ valid: true });
};