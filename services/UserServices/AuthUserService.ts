import LoginSessionService, {
  ClientType
} from "../AuthServices/LoginSessionService";

/**
 * Compatibilidad hacia atrás. La lógica real vive en LoginSessionService.
 * Mantenemos el contrato anterior (response shape) para no romper imports
 * históricos / tests existentes.
 */
interface Request {
  email: string;
  password: string;
  clientType?: ClientType;
  deviceId?: string | null;
  userAgent?: string | null;
  ip?: string | null;
  /**
   * @deprecated `force` ya no se usa: el login nuevo siempre revoca la
   * sesión anterior del mismo canal automáticamente. Se acepta por
   * compatibilidad pero se ignora.
   */
  force?: boolean;
}

interface Response {
  serializedUser: any;
  token: string;
  refreshToken: string;
  sid: string;
  clientType: ClientType;
  /**
   * `true` cuando este login revocó al menos una sesión previa activa
   * del mismo (userId, clientType).
   */
  replacedOldWebSession: boolean;
}

const AuthUserService = async ({
  email,
  password,
  clientType = "web",
  deviceId = null,
  userAgent = null,
  ip = null
}: Request): Promise<Response> => {
  const r = await LoginSessionService({
    email,
    password,
    clientType,
    deviceId,
    userAgent,
    ip
  });

  return {
    serializedUser: r.serializedUser,
    token: r.token,
    refreshToken: r.refreshToken,
    sid: r.sid,
    clientType: r.clientType,
    replacedOldWebSession: r.replacedSessionIds.length > 0
  };
};

export default AuthUserService;
