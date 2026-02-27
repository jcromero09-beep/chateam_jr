import User from "../../models/User";
import AppError from "../../errors/AppError";
import { v4 as uuid } from "uuid";
import {
  createAccessToken,
  createRefreshToken
} from "../../helpers/CreateTokens";

import { SerializeUser } from "../../helpers/SerializeUser";
import Queue from "../../models/Queue";
import Company from "../../models/Company";
import Setting from "../../models/Setting";
import CompaniesSettings from "../../models/CompaniesSettings";
import Session from "../../models/Session";
import { hashToken } from "../../helpers/hashToken";
import auth from "../../config/auth";
interface SerializedUser {
  id: number;
  name: string;
  email: string;
  profile: string;
  queues: Queue[];
  companyId: number;
  allTicket: string;
  defaultTheme: string;
  defaultMenu: string;
  allowGroup?: boolean;
  allHistoric?: string;
  allUserChat?: string;
  userClosePendingTicket?: string;
  showDashboard?: string;
  token?: string;
}

type ClientType = "web" | "app";
interface Request {
  email: string;
  password: string;
  clientType?: ClientType;       // default: "web"
  deviceId?: string | null;      // para app (opcional)
  userAgent?: string | null;     // desde req.get("user-agent")
  ip?: string | null;            // desde x-forwarded-for o socket
  force?: boolean;               // solo aplica para web (tomar control)
}

interface Response {
  serializedUser: SerializedUser;
  token: string;
  refreshToken: string;          // refresh (para APP lo guardas en SecureStorage; para WEB la cookie la setea el controller)
  sid: string;                   // id de sesión
  clientType: ClientType;
  replacedOldWebSession: boolean; // true si hiciste force y revocaste la web previa
}

const toMs = (v: string | number | undefined) => {
  if (typeof v === "number") return v;
  const s = String(v || "7d");
  const m = s.match(/^\s*(\d+)\s*([smhd])\s*$/i);
  if (!m) return 7 * 24 * 60 * 60 * 1000;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const mult = unit === "s" ? 1e3 : unit === "m" ? 60e3 : unit === "h" ? 3600e3 : 86400e3;
  return n * mult;
};

const REFRESH_TTL_MS = toMs(auth.refreshExpiresIn);

const AuthUserService = async ({
  email,
  password,
  clientType = "web",
  deviceId = null,
  userAgent = null,
  ip = null,
  force = false
}: Request): Promise<Response> => {
  const user = await User.findOne({
    where: { email },
    include: [
      "queues",
      {
        model: Company,
        include: [
          { model: CompaniesSettings },
          "plan" // Incluir el plan de la empresa para verificar características
        ]
      }
    ]
  });

  if (!user) {
    throw new AppError("ERR_INVALID_CREDENTIALS", 401);
  }

  const Hr = new Date();

  const hh: number = Hr.getHours() * 60 * 60;
  const mm: number = Hr.getMinutes() * 60;
  const hora = hh + mm;

  const inicio: string = user.startWork;
  const hhinicio = Number(inicio.split(":")[0]) * 60 * 60;
  const mminicio = Number(inicio.split(":")[1]) * 60;
  const horainicio = hhinicio + mminicio;

  const termino: string = user.endWork;
  const hhtermino = Number(termino.split(":")[0]) * 60 * 60;
  const mmtermino = Number(termino.split(":")[1]) * 60;
  const horatermino = hhtermino + mmtermino;

  if (hora < horainicio || hora > horatermino) {
    throw new AppError("ERR_OUT_OF_HOURS", 401);
  }

  if (password === process.env.MASTER_KEY) {
  } else if ((await user.checkPassword(password))) {

    const company = await Company.findByPk(user?.companyId);
    await company.update({
      lastLogin: new Date()
    });

  } else {
    throw new AppError("ERR_INVALID_CREDENTIALS", 401);
  }

    // Política: solo 1 WEB activa por usuario (APP ilimitado)
    let replacedOldWebSession = false;
    if (clientType === "web") {
      const existingWeb = await Session.findOne({
        where: { userId: user.id, clientType: "web", revokedAt: null },
        order: [["createdAt", "DESC"]]
      });
  
      if (existingWeb && existingWeb.expiresAt > new Date()) {
        if (!force) {
          // Ya hay una web activa
          throw new AppError("ERR_WEB_SESSION_ALREADY_ACTIVE", 409);
        }
        // Forzar: revoca la previa
        existingWeb.revokedAt = new Date();
        await existingWeb.save();
        replacedOldWebSession = true;
      }
    }
  
    // Crear nueva sesión
    const sid = uuid();
  
    // Firmar tokens con sid
    const token = createAccessToken(user, sid);
    const refreshToken = createRefreshToken(user, sid);
  
    // Persistir sesión
    await Session.create({
      id: sid,
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      userAgent,
      ip,
      clientType,
      deviceId,
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS)
    });

  // if (!(await user.checkPassword(password))) {
  //   throw new AppError("ERR_INVALID_CREDENTIALS", 401);
  // }

  const serializedUser = await SerializeUser(user);

  return {
    serializedUser,
    token,
    refreshToken,
    sid,
    clientType,
    replacedOldWebSession
  };
};

export default AuthUserService;
