import axios from "axios";
import MetaMarketing from "../../meta-marketing/src";
import CompaniesSettings from "../../models/CompaniesSettings";
import Company from "../../models/Company";
import Whatsapp from "../../models/Whatsapp";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import { TokenManager } from "./TokenManager";
import { MarketingCache } from "./MarketingCache";
import { AuditLogger } from "./AuditLogger";
import cache from "../../libs/cache";

interface TimeRange {
  since: string;
  until: string;
}

interface GetCampaignsOptions {
  status?: string[];
  includeInsights?: boolean;
  timeRange?: TimeRange;
  skipCache?: boolean;
}

interface GetAdsOptions {
  campaignId?: string;
  status?: string[];
  timeRange?: TimeRange;
  skipCache?: boolean;
}

interface CompanyMetaConfig {
  token: string;
  accountId: string;
  mode: "sandbox" | "production";
  appId?: string;
  appSecret?: string;
}

// ============================================================
// ERROR CODES DE META
// ============================================================
const META_ERROR_CODES = {
  RATE_LIMIT: 80004,
  INVALID_TOKEN: 190,
  PERMISSION_ERROR: 10,
  UNKNOWN_ERROR: 1,
  TEMPORARY_ERROR: 2,
  // [Fase2] 368 = bloqueo temporal por infraccion de politicas. NO es un error
  // reintentable: insistir se interpreta como evasion y agrava el bloqueo.
  POLICY_BLOCK: 368,
  // 200 = "Permissions error". Meta lo usa cuando el dueno de la cuenta
  // publicitaria no concedio ads_management/ads_read al token. Antes caia en el
  // `default` y se devolvia un 500 generico por cada llamada.
  PERMISSION_DENIED: 200
};

// Codigos de limitacion. Meta es explicita: al llegar al limite hay que PARAR;
// si sigues llamando el contador no baja y alargas el bloqueo.
const META_THROTTLE_CODES = new Set([4, 17, 32, 613, 80000, 80003, 80004, 80014]);

// ============================================================
// CORTOCIRCUITO DE CUENTA NO UTILIZABLE
// ============================================================
// Token invalido o cuenta sin permisos de ads NO se arreglan reintentando: cada
// llamada devuelve exactamente el mismo error, gasta cuota y llena el log. En
// cuanto Meta responde 190/10/200 apagamos las llamadas de esa empresa durante
// META_DISABLED_TTL y respondemos desde Redis sin tocar la red.
//
// La llave es por companyId (no por conexion): handleMetaError no conoce el
// whatsappId y en la practica la cuenta publicitaria es de la empresa. Si una
// empresa tuviera dos conexiones con ad accounts distintos y solo una rota, el
// peor caso es devolver lista vacia durante el TTL — mejor que el 500 actual.
// testConnection limpia la marca en cuanto la cuenta vuelve a responder.
const META_DISABLED_TTL = 60 * 60; // 1 h

const META_FATAL_CONFIG_CODES = new Set<number>([
  META_ERROR_CODES.INVALID_TOKEN,
  META_ERROR_CODES.PERMISSION_ERROR,
  META_ERROR_CODES.PERMISSION_DENIED
]);

const metaDisabledKey = (companyId: number): string =>
  `meta_marketing:disabled:company_${companyId}`;

const disableMetaCalls = async (
  companyId: number,
  message: string,
  statusCode: number
): Promise<void> => {
  try {
    await cache.set(
      metaDisabledKey(companyId),
      JSON.stringify({ message, statusCode }),
      "EX",
      META_DISABLED_TTL
    );
    logger.warn(
      `[MetaMarketing] 🔇 Llamadas a Meta Ads apagadas ${META_DISABLED_TTL / 60} min ` +
      `para company ${companyId}: ${message}`
    );
  } catch (err: unknown) {
    logger.error(`[MetaMarketing] No se pudo marcar la cuenta como no utilizable: ${String(err)}`);
  }
};

const readMetaDisabled = async (
  companyId: number
): Promise<{ message: string; statusCode: number } | null> => {
  try {
    const raw = await cache.get(metaDisabledKey(companyId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/**
 * Reactiva las llamadas a Meta Ads de una empresa (tras reconectar la cuenta).
 */
export const clearMetaDisabled = async (companyId: number): Promise<void> => {
  try {
    await cache.del(metaDisabledKey(companyId));
  } catch (err: unknown) {
    logger.error(`[MetaMarketing] No se pudo limpiar el cortocircuito: ${String(err)}`);
  }
};

// ============================================================
// HELPERS
// ============================================================

const getTimeRangeFromPeriod = (period: string): TimeRange => {
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  // Custom date range format: "YYYY-MM-DD_YYYY-MM-DD"
  if (period && period.match(/^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/)) {
    const [since, until] = period.split("_");
    return { since, until };
  }

  let since: string;
  let until: string = today;

  switch (period) {
    case "today":
      since = today;
      break;
    case "yesterday": {
      const yesterday = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      since = yesterday;
      until = yesterday;
      break;
    }
    case "last_7_days":
    case "7days":
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      break;
    case "last_14_days":
      since = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      break;
    case "last_28_days":
      since = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      break;
    case "last_30_days":
    case "30days":
      since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      break;
    case "this_week": {
      const dayOfWeek = now.getDay();
      const monday = new Date(now.getTime() - ((dayOfWeek === 0 ? 6 : dayOfWeek - 1)) * 24 * 60 * 60 * 1000);
      since = monday.toISOString().split("T")[0];
      break;
    }
    case "last_week": {
      const dayOfWeek = now.getDay();
      const thisMonday = new Date(now.getTime() - ((dayOfWeek === 0 ? 6 : dayOfWeek - 1)) * 24 * 60 * 60 * 1000);
      const lastMonday = new Date(thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000);
      const lastSunday = new Date(thisMonday.getTime() - 1 * 24 * 60 * 60 * 1000);
      since = lastMonday.toISOString().split("T")[0];
      until = lastSunday.toISOString().split("T")[0];
      break;
    }
    case "this_month": {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      since = firstOfMonth.toISOString().split("T")[0];
      break;
    }
    case "last_month": {
      const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      since = firstOfLastMonth.toISOString().split("T")[0];
      until = lastOfLastMonth.toISOString().split("T")[0];
      break;
    }
    case "maximum":
    case "90days":
      since = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      break;
    default:
      since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  }

  return { since, until };
};


/**
 * Obtiene la configuración de Meta para una empresa
 * Soporta modo sandbox y producción
 * Si se proporciona whatsappId, intenta obtener credenciales de la tabla Whatsapp primero
 */
export const getCompanyMetaConfig = async (companyId: number, whatsappId?: number): Promise<CompanyMetaConfig> => {
  logger.info(`[MetaMarketing] 🔍 Getting config for companyId: ${companyId}, whatsappId: ${whatsappId || "NOT PROVIDED"}`);

  // Si se proporciona whatsappId, intentar obtener credenciales de la conexión
  if (whatsappId) {
    const whatsapp = await Whatsapp.findOne({
      where: { id: whatsappId, companyId }
    });

    if (whatsapp?.tokenMeta && whatsapp?.facebookAdAccountId) {
      logger.info(`[MetaMarketing] ✅ Using credentials from Whatsapp connection ${whatsappId}`);
      logger.info(`[MetaMarketing] 📋 facebookAdAccountId: ${whatsapp.facebookAdAccountId}`);
      logger.info(`[MetaMarketing] 📋 facebookBusinessId: ${whatsapp.facebookBusinessId || "NOT SET"}`);

      let accountId = whatsapp.facebookAdAccountId;
      if (accountId.startsWith("act_")) {
        accountId = accountId.replace("act_", "");
      }

      const mode: "sandbox" | "production" = accountId.toLowerCase().includes("sandbox")
        ? "sandbox"
        : "production";

      // Obtener appId y appSecret de CompaniesSettings para refresh de token
      const settings = await CompaniesSettings.findOne({ where: { companyId } });

      return {
        token: whatsapp.tokenMeta,
        accountId,
        mode,
        appId: settings?.facebookAppId || undefined,
        appSecret: settings?.facebookAppSecret || undefined
      };
    } else {
      logger.warn(`[MetaMarketing] ⚠️ Whatsapp ${whatsappId} does not have Ad Account configured, falling back to company settings`);
    }
  }

  // Fallback: obtener de CompaniesSettings
  const settings = await CompaniesSettings.findOne({
    where: { companyId }
  });

  if (!settings) {
    logger.error(`[MetaMarketing] ❌ No settings found for companyId: ${companyId}`);
    throw new AppError("ERR_NO_COMPANY_SETTINGS", 404);
  }

  logger.info(`[MetaMarketing] ✅ Settings found for companyId: ${companyId}`);
  logger.info(`[MetaMarketing] 📋 facebookAdAccountId: ${settings.facebookAdAccountId || "NOT SET"}`);
  logger.info(`[MetaMarketing] 📋 facebookBusinessId: ${settings.facebookBusinessId || "NOT SET"}`);
  logger.info(`[MetaMarketing] 📋 facebookAppId: ${settings.facebookAppId || "NOT SET"}`);
  logger.info(`[MetaMarketing] 📋 facebookSystemUserToken: ${settings.facebookSystemUserToken ? `SET (${settings.facebookSystemUserToken.substring(0, 20)}...${settings.facebookSystemUserToken.slice(-10)})` : "NOT SET"}`);

  if (!settings.facebookSystemUserToken) {
    logger.error(`[MetaMarketing] ❌ No Facebook token configured`);
    throw new AppError("ERR_NO_FACEBOOK_TOKEN", 400);
  }

  if (!settings.facebookAdAccountId) {
    logger.error(`[MetaMarketing] ❌ No Facebook Ad Account ID configured`);
    throw new AppError("ERR_NO_FACEBOOK_AD_ACCOUNT", 400);
  }

  // Validar y renovar token si es necesario
  logger.info(`[MetaMarketing] 🔑 Validating token...`);
  const validToken = await TokenManager.getValidToken(companyId);
  if (!validToken) {
    logger.error(`[MetaMarketing] ❌ Token validation failed - token is invalid or expired`);
    throw new AppError("ERR_INVALID_FACEBOOK_TOKEN", 401);
  }
  logger.info(`[MetaMarketing] ✅ Token validated successfully`);

  // El accountId viene como "act_123456789" o solo "123456789"
  let accountId = settings.facebookAdAccountId;
  if (accountId.startsWith("act_")) {
    accountId = accountId.replace("act_", "");
  }
  logger.info(`[MetaMarketing] 📋 Using accountId: ${accountId}`);

  // Determinar modo: si el accountId tiene "sandbox" o si hay flag específico
  const mode: "sandbox" | "production" = accountId.toLowerCase().includes("sandbox")
    ? "sandbox"
    : "production";
  logger.info(`[MetaMarketing] 📋 Mode: ${mode}`);

  return {
    token: validToken,
    accountId,
    mode,
    appId: settings.facebookAppId || undefined,
    appSecret: settings.facebookAppSecret || undefined
  };
};

/**
 * Crea cliente Meta con la configuración de la empresa
 * @param companyId - ID de la empresa
 * @param whatsappId - ID opcional de la conexión Whatsapp para usar sus credenciales
 */
/**
 * [Fase2] Devuelve el appSecret SOLO si pertenece a la misma app que emitio el
 * token. Firmar con el secret de otra app hace que Meta rechace TODAS las
 * llamadas (error 190) — y en produccion ya hay empresas con el appId guardado
 * de una app distinta a la del token (medido: company 8, appId 3943...15 vs
 * token emitido por 3433...56). Por eso se verifica, no se asume.
 *
 * El app_id del token se saca de debug_token inspeccionandose a si mismo, asi
 * que no hacen falta credenciales de app para comprobarlo. Se cachea en proceso
 * para no pagar una llamada extra por request.
 */
const appSecretCache = new Map<string, { secret?: string; at: number }>();
const APP_SECRET_TTL = 30 * 60 * 1000;

const resolveVerifiedAppSecret = async (
  companyId: number,
  token: string
): Promise<string | undefined> => {
  const key = `${companyId}:${token.slice(-12)}`;
  const cached = appSecretCache.get(key);
  if (cached && Date.now() - cached.at < APP_SECRET_TTL) return cached.secret;

  let secret: string | undefined;
  try {
    const company = await Company.findByPk(companyId);
    const settings = await CompaniesSettings.findOne({ where: { companyId } });
    const appId = (company as any)?.facebookAppId || settings?.facebookAppId;
    const appSecret = (company as any)?.facebookAppSecret || settings?.facebookAppSecret;

    if (appId && appSecret) {
      const { data } = await axios.get(
        `https://graph.facebook.com/${process.env.FB_GRAPH_VERSION || "v24.0"}/debug_token`,
        { params: { input_token: token, access_token: token }, timeout: 8000 }
      );
      const tokenAppId = data?.data?.app_id;
      if (tokenAppId && String(tokenAppId) === String(appId)) {
        secret = appSecret;
      } else {
        logger.warn(
          `[MetaMarketing] appsecret_proof desactivado para company ${companyId}: ` +
          `el token lo emitio la app ${tokenAppId}, pero hay configurada la ${appId}.`
        );
      }
    }
  } catch (err: any) {
    logger.warn(`[MetaMarketing] no se pudo verificar la app del token: ${err?.message || err}`);
  }

  appSecretCache.set(key, { secret, at: Date.now() });
  return secret;
};

const getMetaClient = async (
  companyId: number,
  whatsappId?: number,
  opts: { ignoreCircuitBreaker?: boolean } = {}
): Promise<{
  client: MetaMarketing;
  accountId: string;
  mode: "sandbox" | "production";
}> => {
  // Si la cuenta ya se declaro no utilizable, se responde desde Redis: ni una
  // llamada mas a Meta hasta que expire el TTL o el usuario reconecte.
  if (!opts.ignoreCircuitBreaker) {
    const disabled = await readMetaDisabled(companyId);
    if (disabled) {
      logger.debug(
        `[MetaMarketing] ⏭️ Llamada omitida (cuenta no utilizable) company ${companyId}: ${disabled.message}`
      );
      throw new AppError(disabled.message, disabled.statusCode);
    }
  }

  const config = await getCompanyMetaConfig(companyId, whatsappId);
  const appSecret = await resolveVerifiedAppSecret(companyId, config.token);

  const client = new MetaMarketing({
    accessToken: config.token,
    apiVersion: process.env.FB_GRAPH_VERSION || "v24.0",
    ...(appSecret ? { appSecret } : {})
  });

  return {
    client,
    accountId: config.accountId,
    mode: config.mode
  };
};

/**
 * Maneja errores de Meta API con logs detallados
 */
const handleMetaError = (error: any, companyId: number, endpoint: string): never => {
  // El error llega de dos formas: crudo de axios (response.data.error) cuando
  // nadie lo toco, o ya normalizado por MetaClient.handleApiError, que lo
  // sustituye por un Error plano y conserva el codigo en `metaCode`. Sin esta
  // segunda rama todo lo que pasa por el cliente caia en "error generico" y ni
  // se clasificaba ni activaba el cortocircuito.
  const metaError =
    error.response?.data?.error ||
    (error?.metaCode
      ? {
          code: error.metaCode,
          error_subcode: error.metaSubcode,
          fbtrace_id: error.metaFbtraceId,
          message: error.message,
          type: "OAuthException"
        }
      : undefined);

  // Una cuenta mal configurada (token caducado, sin permisos de ads) NO es un
  // fallo de la plataforma: es algo que solo el dueno de la cuenta puede
  // arreglar. Se registra como warn — con error se disparaban alertas y se
  // llenaba el log con el mismo mensaje en cada llamada.
  const isClientConfig = metaError && META_FATAL_CONFIG_CODES.has(metaError.code);
  const log = (msg: string) => (isClientConfig ? logger.warn(msg) : logger.error(msg));

  log(`[MetaMarketing] ❌ ERROR en endpoint: ${endpoint}`);
  log(`[MetaMarketing] ❌ CompanyId: ${companyId}`);

  if (metaError) {
    log(`[MetaMarketing] ❌ Meta Error Code: ${metaError.code}`);
    log(`[MetaMarketing] ❌ Meta Error Subcode: ${metaError.error_subcode || "N/A"}`);
    log(`[MetaMarketing] ❌ Meta Error Type: ${metaError.type}`);
    log(`[MetaMarketing] ❌ Meta Error Message: ${metaError.message}`);
    log(`[MetaMarketing] ❌ Meta FBTrace ID: ${metaError.fbtrace_id || "N/A"}`);

    AuditLogger.logMetaError(companyId, endpoint, {
      code: metaError.code,
      subcode: metaError.error_subcode,
      message: metaError.message,
      type: metaError.type
    });

    // 368 primero: es lo unico que nunca se debe reintentar ni "probar otra vez".
    if (metaError.code === META_ERROR_CODES.POLICY_BLOCK) {
      logger.error(`[MetaMarketing] 🛑 BLOQUEO POR POLITICAS (368) — DETENER, no reintentar`);
      throw new AppError(
        "ERR_META_POLICY_BLOCK: Meta bloqueo temporalmente esta cuenta por politicas. " +
        "No reintentes ni regeneres el token: revisa los avisos en Business Manager.",
        403
      );
    }

    if (META_THROTTLE_CODES.has(metaError.code)) {
      const wait = metaError.error_data?.estimated_time_to_regain_access;
      logger.error(`[MetaMarketing] ⏳ LIMITE DE LLAMADAS (${metaError.code}) — parar y esperar`);
      throw new AppError(
        `ERR_META_RATE_LIMIT: Meta pide esperar${wait ? ` ~${wait} min` : ""} antes de seguir. ` +
        "Insistir ahora alarga el bloqueo.",
        429
      );
    }

    // Errores que no se arreglan reintentando: se apagan las llamadas de esta
    // empresa durante META_DISABLED_TTL (fire-and-forget: handleMetaError es
    // sincrono porque los 18 call sites dependen de que lance al instante).
    const fatal = (message: string, statusCode: number): never => {
      disableMetaCalls(companyId, message, statusCode).catch(() => undefined);
      throw new AppError(message, statusCode);
    };

    switch (metaError.code) {
      case META_ERROR_CODES.RATE_LIMIT:
        logger.error(`[MetaMarketing] ⚠️ RATE LIMIT alcanzado - Espera antes de reintentar`);
        throw new AppError("ERR_META_RATE_LIMIT: Has alcanzado el limite de solicitudes. Espera unos minutos.", 429);
      case META_ERROR_CODES.INVALID_TOKEN:
        logger.warn(`[MetaMarketing] ⚠️ TOKEN INVALIDO - El token ha expirado o es incorrecto`);
        return fatal("ERR_META_INVALID_TOKEN: El token de acceso es invalido o ha expirado. Reconecta tu cuenta de Facebook.", 401);
      case META_ERROR_CODES.PERMISSION_ERROR:
        logger.warn(`[MetaMarketing] ⚠️ PERMISOS DENEGADOS - Faltan permisos necesarios`);
        return fatal("ERR_META_PERMISSION_DENIED: No tienes permisos para acceder a esta cuenta publicitaria. Verifica que el Ad Account ID sea correcto.", 403);
      case META_ERROR_CODES.PERMISSION_DENIED:
        // (#200) El dueno de la cuenta no concedio ads_management / ads_read.
        logger.warn(`[MetaMarketing] ⚠️ PERMISOS DE ADS NO CONCEDIDOS (200) - ${metaError.message}`);
        return fatal(
          "ERR_META_PERMISSION_DENIED: El dueno de la cuenta publicitaria no concedio los permisos " +
          "ads_management / ads_read a esta app. Autoriza la cuenta en Business Manager y reconecta.",
          403
        );
      default:
        logger.error(`[MetaMarketing] ⚠️ ERROR DESCONOCIDO de Meta API`);
        throw new AppError(`ERR_META_API: ${metaError.message}`, 500);
    }
  }

  // Error no es de Meta API
  logger.error(`[MetaMarketing] ❌ Error generico (no Meta): ${error.message}`);
  logger.error(`[MetaMarketing] ❌ Stack: ${error.stack}`);
  throw error;
};

// ============================================================
// SERVICIOS PÚBLICOS
// ============================================================

export const testConnection = async (
  companyId: number,
  whatsappId?: number
): Promise<{ success: boolean; message: string; accountInfo?: any; mode?: string; tokenStatus?: any }> => {
  logger.info(`[testConnection] 🚀 Starting connection test for companyId: ${companyId}, whatsappId: ${whatsappId || "NOT PROVIDED"}`);
  const timer = AuditLogger.startTimer();

  try {
    logger.info(`[testConnection] 📡 Getting Meta client...`);
    // Probar la conexion es justo lo que hace el usuario tras arreglar la
    // cuenta: aqui el cortocircuito se ignora a proposito.
    const { client, accountId, mode } = await getMetaClient(companyId, whatsappId, {
      ignoreCircuitBreaker: true
    });
    logger.info(`[testConnection] ✅ Meta client created. AccountId: ${accountId}, Mode: ${mode}`);

    // 1. Validar conexión básica
    logger.info(`[testConnection] 🔍 Validating connection with /me endpoint...`);
    const isValid = await client.validateConnection();
    logger.info(`[testConnection] 📋 Validation result: ${isValid}`);

    if (!isValid) {
      logger.error(`[testConnection] ❌ Token validation failed`);
      AuditLogger.logRequest({
        companyId,
        action: "test_connection",
        endpoint: "/me",
        method: "GET",
        responseStatus: "error",
        responseTime: timer(),
        errorMessage: "Token inválido"
      });

      return { success: false, message: "Token inválido o expirado" };
    }

    // 2. Obtener info de cuenta (opcional, no falla si no tiene permisos)
    logger.info(`[testConnection] 📡 Getting account info for: act_${accountId}...`);
    let accountInfo = null;
    try {
      const response = await client.getAccountInfo(accountId);
      accountInfo = response.data?.[0] || response;
      logger.info(`[testConnection] ✅ Account info received: ${JSON.stringify(accountInfo, null, 2)}`);
    } catch (accError: any) {
      logger.warn(`[testConnection] ⚠️ Could not get account info: ${accError.message}`);
      accountInfo = { id: `act_${accountId}`, note: "Could not fetch account details" };
    }

    // 3. Obtener estado del token (opcional)
    logger.info(`[testConnection] 🔍 Getting token status...`);
    let tokenStatus = null;
    try {
      tokenStatus = await TokenManager.getTokenStatus(companyId);
      logger.info(`[testConnection] ✅ Token status: ${JSON.stringify(tokenStatus, null, 2)}`);
    } catch (tokenError: any) {
      logger.warn(`[testConnection] ⚠️ Could not get token status: ${tokenError.message}`);
      tokenStatus = { hasToken: true, note: "Could not verify token details" };
    }

    AuditLogger.logRequest({
      companyId,
      action: "test_connection",
      endpoint: "/me",
      method: "GET",
      responseStatus: "success",
      responseTime: timer()
    });

    // La cuenta responde: se reactivan las llamadas si estaban apagadas.
    await clearMetaDisabled(companyId);

    logger.info(`[testConnection] ✅ Connection test successful!`);
    return {
      success: true,
      message: "Conexión exitosa",
      accountInfo,
      mode,
      tokenStatus
    };
  } catch (error: any) {
    logger.error(`[testConnection] ❌ Error testing Meta connection: ${error.message}`);
    logger.error(`[testConnection] ❌ Full error: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`);

    AuditLogger.logRequest({
      companyId,
      action: "test_connection",
      endpoint: "/me",
      method: "GET",
      responseStatus: "error",
      responseTime: timer(),
      errorMessage: error.message
    });

    return {
      success: false,
      message: error.message || "Error de conexión"
    };
  }
};

export const getAdAccounts = async (companyId: number): Promise<any[]> => {
  const timer = AuditLogger.startTimer();

  // Verificar cache
  const cached = await MarketingCache.getAdAccounts(companyId);
  if (cached) {
    AuditLogger.logRequest({
      companyId,
      action: "get_ad_accounts",
      endpoint: "/me/adaccounts",
      method: "GET",
      responseStatus: "success",
      responseTime: timer(),
      cacheHit: true
    });
    return cached;
  }

  try {
    const { client } = await getMetaClient(companyId);
    const accounts = await client.getAccounts();

    // Guardar en cache
    await MarketingCache.setAdAccounts(companyId, accounts);

    AuditLogger.logRequest({
      companyId,
      action: "get_ad_accounts",
      endpoint: "/me/adaccounts",
      method: "GET",
      responseStatus: "success",
      responseTime: timer(),
      cacheHit: false
    });

    return accounts;
  } catch (error: any) {
    handleMetaError(error, companyId, "/me/adaccounts");
  }
};

// Helper para extraer valor de un array de acciones de Facebook
// actions = [{action_type: "purchase", value: "10"}, ...]
const extractActionValue = (actions: any[], actionType: string): number => {
  if (!actions || !Array.isArray(actions)) return 0;
  const action = actions.find((a: any) => a.action_type === actionType);
  return action ? parseFloat(action.value) || 0 : 0;
};

export const getCampaigns = async (
  companyId: number,
  options: GetCampaignsOptions = {},
  whatsappId?: number
): Promise<any[]> => {
  logger.info(`[getCampaigns] 🚀 Iniciando obtención de campañas`);
  logger.info(`[getCampaigns] 📋 companyId: ${companyId}, whatsappId: ${whatsappId || "N/A"}`);
  logger.info(`[getCampaigns] 📋 Opciones: ${JSON.stringify(options)}`);

  const timer = AuditLogger.startTimer();
  const period = options.timeRange ? `${options.timeRange.since}_${options.timeRange.until}` : "30days";
  const cacheKey = whatsappId ? `${companyId}_${whatsappId}` : companyId;

  // Verificar cache (si no se pide skipCache)
  if (!options.skipCache) {
    const cached = await MarketingCache.getCampaigns(cacheKey as any, period);
    if (cached) {
      logger.info(`[getCampaigns] ✅ Datos obtenidos desde CACHE (${cached.length} campañas)`);
      AuditLogger.logRequest({
        companyId,
        action: "get_campaigns",
        endpoint: "/campaigns",
        method: "GET",
        responseStatus: "success",
        responseTime: timer(),
        cacheHit: true
      });
      return cached;
    }
  }

  try {
    logger.info(`[getCampaigns] 📡 Conectando con Meta API...`);
    const { client, accountId } = await getMetaClient(companyId, whatsappId);
    logger.info(`[getCampaigns] ✅ Cliente Meta creado. AccountId: act_${accountId}`);

    logger.info(`[getCampaigns] 📡 Obteniendo lista de campañas...`);
    const campaigns = await client.campaigns.getCampaigns(accountId, {
      status: options.status,
      includeAdSets: false,
      includeAds: false
    });
    logger.info(`[getCampaigns] ✅ Campañas obtenidas: ${campaigns.length}`);

    if (options.includeInsights !== false) {
      const timeRange = options.timeRange || getTimeRangeFromPeriod("30days");
      logger.info(`[getCampaigns] 📡 Obteniendo insights para período: ${timeRange.since} a ${timeRange.until}`);

      // Obtener insights para todas las campañas
      const insightsData = await client.insights.getAccountInsights(accountId, {
        level: "campaign",
        fields: [
          "campaign_id", "campaign_name", "impressions", "clicks", "spend",
          "reach", "frequency", "ctr", "cpc", "cpm",
          "actions", "action_values", "cost_per_action_type",
          "website_purchase_roas",
          "video_thruplay_watched_actions", "video_p50_watched_actions",
          "video_p95_watched_actions", "video_play_actions"
        ],
        time_range: timeRange
      });
      logger.info(`[getCampaigns] ✅ Insights obtenidos: ${insightsData.length} registros`);

      // ============================================================
      // DEBUG DETALLADO: Ver estructura exacta de datos
      // ============================================================
      logger.info(`[getCampaigns] ╔══════════════════════════════════════════════════════════════╗`);
      logger.info(`[getCampaigns] ║                    DEBUG MAPEO INSIGHTS                      ║`);
      logger.info(`[getCampaigns] ╚══════════════════════════════════════════════════════════════╝`);

      // Mostrar estructura de un insight
      if (insightsData.length > 0) {
        logger.info(`[getCampaigns] 📋 EJEMPLO INSIGHT[0]: ${JSON.stringify(insightsData[0], null, 2)}`);
      }

      // Mostrar estructura de una campaña
      if (campaigns.length > 0) {
        logger.info(`[getCampaigns] 📋 EJEMPLO CAMPAIGN[0]: ${JSON.stringify(campaigns[0], null, 2)}`);
      }

      // ============================================================
      // FIX: Usar campaign_name para el match en lugar de campaign_id
      // Los IDs de Facebook son números muy grandes (>15 dígitos) que
      // pierden precisión cuando JSON.parse los convierte a number.
      // El nombre es string y no tiene este problema.
      // ============================================================
      const insightsMap = new Map<string, any>();
      insightsData.forEach((insight: any) => {
        // Usar campaign_name como key (string, sin problemas de precisión)
        const campaignName = insight.campaign_name;
        if (campaignName) {
          insightsMap.set(campaignName, insight);
          logger.info(`[getCampaigns] 📊 MAP.set("${campaignName.substring(0, 40)}...") -> $${insight.spend}`);
        }
      });

      // Debug: mostrar qué campañas activas no tienen insights
      const activeCampaigns = campaigns.filter((c: any) => c.status === 'ACTIVE');
      logger.info(`[getCampaigns] 🔍 RESUMEN: ${activeCampaigns.length} campañas ACTIVAS, ${insightsMap.size} insights en Map`);

      // ============================================================
      // OBTENER CONTEO DE ADS ACTIVOS POR CAMPAÑA
      // Esto determina si una campaña tiene anuncios activos o no
      // ============================================================
      logger.info(`[getCampaigns] 📡 Obteniendo todos los ads para contar activos por campaña...`);
      const activeAdsMap = new Map<string, number>();

      try {
        // IMPORTANTE: Inicializar TODAS las campañas con 0 ads primero
        // Esto asegura que campañas sin ningún anuncio también tengan activeAds=0
        campaigns.forEach((campaign: any) => {
          activeAdsMap.set(String(campaign.id), 0);
        });
        logger.info(`[getCampaigns] 📊 Inicializadas ${campaigns.length} campañas con activeAds=0`);

        const allAds = await client.client.getAllPages<any>(`/act_${accountId}/ads`, {
          fields: 'id,name,campaign_id,effective_status,status',
          limit: 500
        });
        logger.info(`[getCampaigns] ✅ Total ads obtenidos: ${allAds.length}`);

        // Debug: mostrar primeros 3 ads para ver estructura
        if (allAds.length > 0) {
          logger.info(`[getCampaigns] 🔍 Estructura de ads (primeros 3):`);
          allAds.slice(0, 3).forEach((ad: any, idx: number) => {
            logger.info(`[getCampaigns]   Ad ${idx + 1}: id=${ad.id}, campaign_id=${ad.campaign_id}, effective_status=${ad.effective_status}, status=${ad.status}`);
          });
        }

        // Contar ads activos por campaign_id
        allAds.forEach((ad: any) => {
          const campaignId = String(ad.campaign_id); // Asegurar que sea string
          // Solo contar ads con effective_status ACTIVE
          if (ad.effective_status === 'ACTIVE') {
            const currentCount = activeAdsMap.get(campaignId) || 0;
            activeAdsMap.set(campaignId, currentCount + 1);
          }
        });

        // Log campañas con 0 ads activos (candidatas a NO_HAY_ANUNCIOS)
        logger.info(`[getCampaigns] 📊 Campañas con 0 ads activos (mostrarán como "Sin Anuncios"):`);
        let countWithZeroAds = 0;
        activeAdsMap.forEach((count, campaignId) => {
          if (count === 0) {
            const campaign: any = campaigns.find((c: any) => String(c.id) === campaignId);
            if (campaign && (campaign.status === 'ACTIVE' || campaign.effective_status === 'ACTIVE')) {
              logger.info(`[getCampaigns]   🚫 "${campaign?.name?.substring(0, 50) || campaignId}": ${count} ads activos`);
              countWithZeroAds++;
            }
          }
        });
        logger.info(`[getCampaigns] 📊 Total campañas ACTIVAS con 0 ads activos: ${countWithZeroAds}`);

      } catch (adsError: any) {
        logger.warn(`[getCampaigns] ⚠️ No se pudieron obtener ads: ${adsError.message}. Continuando sin conteo de ads.`);
        // Limpiar el Map si falló - no queremos datos parciales
        activeAdsMap.clear();
      }
      // ============================================================

      const campaignsWithInsights = campaigns.map((campaign: any) => {
        // Usar campaign.name para buscar en el Map (en lugar de campaign.id)
        const insight = insightsMap.get(campaign.name);

        if (!insight && campaign.status === 'ACTIVE') {
          logger.info(`[getCampaigns] ⚠️ SIN MATCH: "${campaign.name}" no encontrada en insights`);
        }

        // Parsear valores numéricos (la API devuelve strings)
        // Extraer video fields primero para poder computar costPerThruPlay
        const vPlays = insight ? (Array.isArray(insight.video_play_actions) ? parseFloat(insight.video_play_actions[0]?.value) || 0 : 0) : 0;
        const vThruPlays = insight ? (Array.isArray(insight.video_thruplay_watched_actions) ? parseFloat(insight.video_thruplay_watched_actions[0]?.value) || 0 : 0) : 0;
        const vP50 = insight ? (Array.isArray(insight.video_p50_watched_actions) ? parseFloat(insight.video_p50_watched_actions[0]?.value) || 0 : 0) : 0;
        const vP95 = insight ? (Array.isArray(insight.video_p95_watched_actions) ? parseFloat(insight.video_p95_watched_actions[0]?.value) || 0 : 0) : 0;
        const spendVal = insight ? parseFloat(insight.spend) || 0 : 0;

        const parsedInsight = insight ? {
          // === BLOQUE BASE ===
          impressions: parseFloat(insight.impressions) || 0,
          clicks: parseFloat(insight.clicks) || 0,
          spend: spendVal,
          reach: parseFloat(insight.reach) || 0,
          frequency: parseFloat(insight.frequency) || 0,
          ctr: parseFloat(insight.ctr) || 0,
          cpc: parseFloat(insight.cpc) || 0,
          cpm: parseFloat(insight.cpm) || 0,
          // === BLOQUE VENTAS (E-commerce) ===
          landingPageViews: extractActionValue(insight.actions, 'landing_page_view'),
          costPerLPV: extractActionValue(insight.cost_per_action_type, 'landing_page_view'),
          addToCart: extractActionValue(insight.actions, 'offsite_conversion.fb_pixel_add_to_cart'),
          initiateCheckout: extractActionValue(insight.actions, 'offsite_conversion.fb_pixel_initiate_checkout'),
          purchases: extractActionValue(insight.actions, 'offsite_conversion.fb_pixel_purchase'),
          costPerPurchase: extractActionValue(insight.cost_per_action_type, 'offsite_conversion.fb_pixel_purchase'),
          conversionValue: extractActionValue(insight.action_values, 'offsite_conversion.fb_pixel_purchase'),
          roas: Array.isArray(insight.website_purchase_roas) ? parseFloat(insight.website_purchase_roas[0]?.value) || 0 : 0,
          // === BLOQUE MENSAJES ===
          conversationsStarted: extractActionValue(insight.actions, 'onsite_conversion.messaging_conversation_started_7d'),
          costPerConversation: extractActionValue(insight.cost_per_action_type, 'onsite_conversion.messaging_conversation_started_7d'),
          messagingContacts: extractActionValue(insight.actions, 'onsite_conversion.messaging_first_reply'),
          costPerMessagingContact: extractActionValue(insight.cost_per_action_type, 'onsite_conversion.messaging_first_reply'),
          newMessagingConnections: extractActionValue(insight.actions, 'onsite_conversion.total_messaging_connection'),
          // DEBUG: Log ALL action types for messaging campaigns to find correct names
          ...(extractActionValue(insight.actions, 'onsite_conversion.messaging_conversation_started_7d') > 0 && (() => {
            const allActionTypes = (insight.actions || []).map((a: any) => `${a.action_type}=${a.value}`);
            logger.info(`[getCampaigns] 🔍 MESSAGING CAMPAIGN "${campaign.name?.substring(0, 40)}": ALL ACTION TYPES: [${allActionTypes.join(', ')}]`);
            const allCostTypes = (insight.cost_per_action_type || []).map((a: any) => `${a.action_type}=${a.value}`);
            logger.info(`[getCampaigns] 🔍 MESSAGING CAMPAIGN "${campaign.name?.substring(0, 40)}": ALL COST TYPES: [${allCostTypes.join(', ')}]`);
            return {};
          })()),
          // === BLOQUE LEADS ===
          leads: extractActionValue(insight.actions, 'lead'),
          costPerLead: extractActionValue(insight.cost_per_action_type, 'lead'),
          // === BLOQUE VIDEO ===
          videoPlays: vPlays,
          thruPlays: vThruPlays,
          costPerThruPlay: vThruPlays > 0 ? spendVal / vThruPlays : 0,
          videoP50: vP50,
          videoP95: vP95,
        } : {
          impressions: 0, clicks: 0, spend: 0, reach: 0, frequency: 0,
          ctr: 0, cpc: 0, cpm: 0,
          landingPageViews: 0, costPerLPV: 0, addToCart: 0, initiateCheckout: 0,
          purchases: 0, costPerPurchase: 0, conversionValue: 0, roas: 0,
          conversationsStarted: 0, costPerConversation: 0, messagingContacts: 0, costPerMessagingContact: 0, newMessagingConnections: 0,
          leads: 0, costPerLead: 0,
          videoPlays: 0, thruPlays: 0, costPerThruPlay: 0, videoP50: 0, videoP95: 0,
        };

        // Obtener conteo de ads activos para esta campaña (usar String para consistencia)
        const activeAdsCount = activeAdsMap.get(String(campaign.id));

        // Debug para campañas específicas
        if (campaign.name && campaign.name.toLowerCase().includes('retrovisores')) {
          logger.info(`[getCampaigns] 🔍 DEBUG "${campaign.name}": activeAdsCount=${activeAdsCount}, status=${campaign.status}, effective_status=${campaign.effective_status}`);
        }

        return {
          ...campaign,
          insights: parsedInsight,
          // Incluir activeAds: si tenemos dato del Map lo usamos, si el Map está vacío (error) será undefined
          ...(activeAdsCount !== undefined && { activeAds: activeAdsCount })
        };
      });

      // Guardar en cache
      await MarketingCache.setCampaigns(cacheKey as any, period, campaignsWithInsights);
      logger.info(`[getCampaigns] ✅ COMPLETADO - ${campaignsWithInsights.length} campañas con insights guardadas en cache`);

      AuditLogger.logRequest({
        companyId,
        action: "get_campaigns",
        endpoint: "/campaigns",
        method: "GET",
        responseStatus: "success",
        responseTime: timer(),
        cacheHit: false
      });

      return campaignsWithInsights;
    }

    await MarketingCache.setCampaigns(cacheKey as any, period, campaigns);
    logger.info(`[getCampaigns] ✅ COMPLETADO - ${campaigns.length} campañas guardadas en cache`);

    AuditLogger.logRequest({
      companyId,
      action: "get_campaigns",
      endpoint: "/campaigns",
      method: "GET",
      responseStatus: "success",
      responseTime: timer(),
      cacheHit: false
    });

    return campaigns;
  } catch (error: any) {
    logger.error(`[getCampaigns] ❌ Error obteniendo campañas: ${error.message}`);
    handleMetaError(error, companyId, "/campaigns");
  }
};

export const getAdSetById = async (
  companyId: number,
  adSetId: string,
  whatsappId?: number
): Promise<any> => {
  try {
    const { client } = await getMetaClient(companyId, whatsappId);
    return await client.campaigns.getAdSet(adSetId);
  } catch (error: any) {
    handleMetaError(error, companyId, `/${adSetId}`);
  }
};

export const getCampaignById = async (
  companyId: number,
  campaignId: string,
  timeRange?: TimeRange,
  whatsappId?: number
): Promise<any> => {
  const timer = AuditLogger.startTimer();

  try {
    const { client } = await getMetaClient(companyId, whatsappId);

    const campaign = await client.campaigns.getCampaign(campaignId);

    const insights = await client.insights.getCampaignInsights(campaignId, {
      time_range: timeRange || getTimeRangeFromPeriod("30days"),
      fields: [
        "impressions", "clicks", "spend", "reach", "frequency",
        "ctr", "cpc", "cpm", "actions", "conversions", "cost_per_conversion"
      ]
    });

    AuditLogger.logRequest({
      companyId,
      action: "get_campaign",
      endpoint: `/${campaignId}`,
      method: "GET",
      responseStatus: "success",
      responseTime: timer()
    });

    return {
      ...campaign,
      insights: insights[0] || {}
    };
  } catch (error: any) {
    handleMetaError(error, companyId, `/${campaignId}`);
  }
};

export const getAds = async (
  companyId: number,
  options: GetAdsOptions = {},
  whatsappId?: number
): Promise<any[]> => {
  logger.info(`[getAds] 🚀 Iniciando obtención de anuncios`);
  logger.info(`[getAds] 📋 companyId: ${companyId}, whatsappId: ${whatsappId || "N/A"}`);
  logger.info(`[getAds] 📋 Opciones: ${JSON.stringify(options)}`);

  const timer = AuditLogger.startTimer();
  const period = options.timeRange ? `${options.timeRange.since}_${options.timeRange.until}` : "30days";
  const cacheKey = whatsappId ? `${companyId}_${whatsappId}` : companyId;

  // Verificar cache
  if (!options.skipCache) {
    const cached = await MarketingCache.getAds(cacheKey as any, period, options.campaignId);
    if (cached) {
      logger.info(`[getAds] ✅ Datos obtenidos desde CACHE (${cached.length} anuncios)`);
      AuditLogger.logRequest({
        companyId,
        action: "get_ads",
        endpoint: "/insights?level=ad",
        method: "GET",
        responseStatus: "success",
        responseTime: timer(),
        cacheHit: true
      });
      return cached;
    }
  }

  try {
    logger.info(`[getAds] 📡 Conectando con Meta API...`);
    const { client, accountId } = await getMetaClient(companyId, whatsappId);
    logger.info(`[getAds] ✅ Cliente Meta creado. AccountId: act_${accountId}`);

    const timeRange = options.timeRange || getTimeRangeFromPeriod("30days");
    logger.info(`[getAds] 📡 Obteniendo insights de anuncios para período: ${timeRange.since} a ${timeRange.until}`);

    // Obtener insights a nivel de anuncio
    const adsInsights = await client.insights.getAccountInsights(accountId, {
      level: "ad",
      fields: [
        "ad_id", "ad_name", "adset_id", "adset_name", "campaign_id", "campaign_name",
        "impressions", "clicks", "spend", "reach", "ctr", "cpc", "cpm"
      ],
      time_range: timeRange,
      ...(options.campaignId && {
        filtering: [{
          field: "campaign.id",
          operator: "EQUAL",
          value: options.campaignId
        }]
      })
    });

    logger.info(`[getAds] ✅ Insights de anuncios obtenidos: ${adsInsights.length} registros`);

    const ads = adsInsights.map((insight: any) => ({
      id: String(insight.ad_id),
      name: insight.ad_name,
      adset_id: String(insight.adset_id),
      adset_name: insight.adset_name,
      campaign_id: String(insight.campaign_id),
      campaign_name: insight.campaign_name,
      status: "ACTIVE",
      impressions: insight.impressions || 0,
      clicks: insight.clicks || 0,
      spend: insight.spend || 0,
      reach: insight.reach || 0,
      ctr: insight.ctr || 0,
      cpc: insight.cpc || 0,
      cpm: insight.cpm || 0
    }));

    // Guardar en cache
    await MarketingCache.setAds(cacheKey as any, period, ads, options.campaignId);
    logger.info(`[getAds] ✅ COMPLETADO - ${ads.length} anuncios guardados en cache`);

    AuditLogger.logRequest({
      companyId,
      action: "get_ads",
      endpoint: "/insights?level=ad",
      method: "GET",
      responseStatus: "success",
      responseTime: timer(),
      cacheHit: false
    });

    return ads;
  } catch (error: any) {
    logger.error(`[getAds] ❌ Error obteniendo anuncios: ${error.message}`);
    handleMetaError(error, companyId, "/insights?level=ad");
  }
};

export const getAdSets = async (
  companyId: number,
  options: GetAdsOptions = {},
  whatsappId?: number
): Promise<any[]> => {
  logger.info(`[getAdSets] 🚀 Iniciando obtención de conjuntos de anuncios`);
  logger.info(`[getAdSets] 📋 companyId: ${companyId}, whatsappId: ${whatsappId || "N/A"}`);
  logger.info(`[getAdSets] 📋 Opciones: ${JSON.stringify(options)}`);

  const timer = AuditLogger.startTimer();
  const period = options.timeRange ? `${options.timeRange.since}_${options.timeRange.until}` : "30days";
  const cacheKey = whatsappId ? `${companyId}_${whatsappId}` : companyId;

  if (!options.skipCache) {
    const cached = await MarketingCache.getAdSets(cacheKey as any, period, options.campaignId);
    if (cached) {
      logger.info(`[getAdSets] ✅ Datos obtenidos desde CACHE (${cached.length} conjuntos)`);
      AuditLogger.logRequest({
        companyId,
        action: "get_adsets",
        endpoint: "/insights?level=adset",
        method: "GET",
        responseStatus: "success",
        responseTime: timer(),
        cacheHit: true
      });
      return cached;
    }
  }

  try {
    logger.info(`[getAdSets] 📡 Conectando con Meta API...`);
    const { client, accountId } = await getMetaClient(companyId, whatsappId);
    logger.info(`[getAdSets] ✅ Cliente Meta creado. AccountId: act_${accountId}`);

    const timeRange = options.timeRange || getTimeRangeFromPeriod("30days");
    logger.info(`[getAdSets] 📡 Obteniendo insights de conjuntos para período: ${timeRange.since} a ${timeRange.until}`);

    const adSetInsights = await client.insights.getAccountInsights(accountId, {
      level: "adset",
      fields: [
        "adset_id", "adset_name", "campaign_id", "campaign_name",
        "impressions", "clicks", "spend", "reach", "frequency", "ctr", "cpc", "cpm"
      ],
      time_range: timeRange,
      ...(options.campaignId && {
        filtering: [{
          field: "campaign.id",
          operator: "EQUAL",
          value: options.campaignId
        }]
      })
    });

    logger.info(`[getAdSets] ✅ Insights de conjuntos obtenidos: ${adSetInsights.length} registros`);

    const adSets = adSetInsights.map((insight: any) => ({
      id: String(insight.adset_id),
      name: insight.adset_name,
      campaign_id: String(insight.campaign_id),
      campaign_name: insight.campaign_name,
      status: "ACTIVE",
      impressions: Number(insight.impressions || 0),
      clicks: Number(insight.clicks || 0),
      spend: Number(insight.spend || 0),
      reach: Number(insight.reach || 0),
      frequency: Number(insight.frequency || 0),
      ctr: Number(insight.ctr || 0),
      cpc: Number(insight.cpc || 0),
      cpm: Number(insight.cpm || 0)
    }));

    await MarketingCache.setAdSets(cacheKey as any, period, adSets, options.campaignId);
    logger.info(`[getAdSets] ✅ COMPLETADO - ${adSets.length} conjuntos guardados en cache`);

    AuditLogger.logRequest({
      companyId,
      action: "get_adsets",
      endpoint: "/insights?level=adset",
      method: "GET",
      responseStatus: "success",
      responseTime: timer(),
      cacheHit: false
    });

    return adSets;
  } catch (error: any) {
    logger.error(`[getAdSets] ❌ Error obteniendo conjuntos de anuncios: ${error.message}`);
    handleMetaError(error, companyId, "/insights?level=adset");
  }
};

export const resolveAdAttributionById = async (
  companyId: number,
  adId: string,
  whatsappId?: number
): Promise<{
  adId: string;
  adName?: string;
  adSetId?: string;
  adSetName?: string;
  campaignId?: string;
  campaignName?: string;
} | null> => {
  if (!adId) return null;

  try {
    logger.info(`[resolveAdAttributionById] Resolviendo adId=${adId}, companyId=${companyId}, whatsappId=${whatsappId || "N/A"}`);
    const { client } = await getMetaClient(companyId, whatsappId);

    const ad = (await client.client.get<any>(`/${adId}`, {
      fields: "id,name,adset_id,campaign_id"
    })) as any;

    const [campaign, adSet] = await Promise.all([
      ad?.campaign_id
        ? client.client.get<any>(`/${String(ad.campaign_id)}`, { fields: "id,name" }) as Promise<any>
        : Promise.resolve(null),
      ad?.adset_id
        ? client.client.get<any>(`/${String(ad.adset_id)}`, { fields: "id,name,campaign_id" }) as Promise<any>
        : Promise.resolve(null)
    ]);

    const attribution = {
      adId: String(ad?.id || adId),
      adName: ad?.name || undefined,
      adSetId: ad?.adset_id ? String(ad.adset_id) : undefined,
      adSetName: adSet?.name || undefined,
      campaignId: ad?.campaign_id ? String(ad.campaign_id) : undefined,
      campaignName: campaign?.name || undefined
    };

    logger.info(`[resolveAdAttributionById] ✅ Resuelto: ${JSON.stringify(attribution)}`);
    return attribution;
  } catch (error: any) {
    logger.warn(`[resolveAdAttributionById] No se pudo resolver adId=${adId}: ${error.message}`);
    return null;
  }
};

export const getInsightsTrend = async (
  companyId: number,
  period: string = "30days",
  whatsappId?: number
): Promise<any[]> => {
  logger.info(`[getInsightsTrend] 🚀 Iniciando obtención de tendencias`);
  logger.info(`[getInsightsTrend] 📋 companyId: ${companyId}, whatsappId: ${whatsappId || "N/A"}, period: ${period}`);

  const timer = AuditLogger.startTimer();
  const cacheKey = whatsappId ? `${companyId}_${whatsappId}` : companyId;

  // Verificar cache
  const cached = await MarketingCache.getTrends(cacheKey as any, period);
  if (cached) {
    logger.info(`[getInsightsTrend] ✅ Datos obtenidos desde CACHE (${cached.length} días)`);
    AuditLogger.logRequest({
      companyId,
      action: "get_trends",
      endpoint: "/insights?breakdown=day",
      method: "GET",
      responseStatus: "success",
      responseTime: timer(),
      cacheHit: true
    });
    return cached;
  }

  try {
    logger.info(`[getInsightsTrend] 📡 Conectando con Meta API...`);
    const { client, accountId } = await getMetaClient(companyId, whatsappId);
    logger.info(`[getInsightsTrend] ✅ Cliente Meta creado. AccountId: act_${accountId}`);

    const timeRange = getTimeRangeFromPeriod(period);
    logger.info(`[getInsightsTrend] 📡 Obteniendo tendencias para período: ${timeRange.since} a ${timeRange.until}`);

    // Obtener insights con breakdown por día
    const insights = await client.insights.getInsightsWithBreakdowns(
      `act_${accountId}`,
      "campaign",
      [],
      {
        fields: ["impressions", "clicks", "spend", "reach", "conversions"],
        time_range: timeRange,
        time_increment: 1
      }
    );

    logger.info(`[getInsightsTrend] ✅ Insights obtenidos: ${insights.length} registros`);

    // Agrupar por fecha
    const trendMap = new Map<string, any>();

    insights.forEach((insight: any) => {
      const date = insight.date_start;
      if (!trendMap.has(date)) {
        trendMap.set(date, {
          date,
          spend: 0,
          impressions: 0,
          clicks: 0,
          reach: 0,
          conversions: 0
        });
      }

      const current = trendMap.get(date)!;
      current.spend += parseFloat(insight.spend) || 0;
      current.impressions += parseInt(insight.impressions) || 0;
      current.clicks += parseInt(insight.clicks) || 0;
      current.reach += parseInt(insight.reach) || 0;
      current.conversions += parseInt(insight.conversions) || 0;
    });

    const trends = Array.from(trendMap.values())
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Guardar en cache
    await MarketingCache.setTrends(cacheKey as any, period, trends);
    logger.info(`[getInsightsTrend] ✅ COMPLETADO - ${trends.length} días de tendencias guardados en cache`);

    AuditLogger.logRequest({
      companyId,
      action: "get_trends",
      endpoint: "/insights?breakdown=day",
      method: "GET",
      responseStatus: "success",
      responseTime: timer(),
      cacheHit: false
    });

    return trends;
  } catch (error: any) {
    logger.error(`[getInsightsTrend] ❌ Error obteniendo tendencias: ${error.message}`);
    handleMetaError(error, companyId, "/insights?breakdown=day");
  }
};

export const getAggregatedInsights = async (
  companyId: number,
  period: string = "30days",
  whatsappId?: number
): Promise<any> => {
  logger.info(`[getAggregatedInsights] 🚀 Iniciando obtención de métricas agregadas`);
  logger.info(`[getAggregatedInsights] 📋 companyId: ${companyId}, whatsappId: ${whatsappId || "N/A"}, period: ${period}`);

  const timer = AuditLogger.startTimer();
  const cacheKey = whatsappId ? `${companyId}_${whatsappId}` : companyId;

  // Verificar cache
  const cached = await MarketingCache.getAggregated(cacheKey as any, period);
  if (cached) {
    logger.info(`[getAggregatedInsights] ✅ Datos obtenidos desde CACHE`);
    AuditLogger.logRequest({
      companyId,
      action: "get_aggregated",
      endpoint: "/insights?level=account",
      method: "GET",
      responseStatus: "success",
      responseTime: timer(),
      cacheHit: true
    });
    return cached;
  }

  try {
    logger.info(`[getAggregatedInsights] 📡 Conectando con Meta API...`);
    const { client, accountId } = await getMetaClient(companyId, whatsappId);
    logger.info(`[getAggregatedInsights] ✅ Cliente Meta creado. AccountId: act_${accountId}`);

    const timeRange = getTimeRangeFromPeriod(period);
    logger.info(`[getAggregatedInsights] 📡 Obteniendo métricas agregadas para período: ${timeRange.since} a ${timeRange.until}`);

    const insights = await client.insights.getAccountInsights(accountId, {
      level: "account",
      fields: [
        "impressions", "clicks", "spend", "reach", "frequency",
        "ctr", "cpc", "cpm", "actions", "conversions", "cost_per_conversion"
      ],
      time_range: timeRange
    });

    logger.info(`[getAggregatedInsights] ✅ Respuesta recibida de Meta API`);
    const data: any = insights[0] || {};

    const aggregated = {
      spend: parseFloat(data.spend) || 0,
      impressions: parseInt(data.impressions) || 0,
      clicks: parseInt(data.clicks) || 0,
      reach: parseInt(data.reach) || 0,
      frequency: parseFloat(data.frequency) || 0,
      ctr: parseFloat(data.ctr) || 0,
      cpc: parseFloat(data.cpc) || 0,
      cpm: parseFloat(data.cpm) || 0,
      conversions: parseInt(data.conversions) || 0,
      costPerConversion: parseFloat(data.cost_per_conversion) || 0,
      dateStart: data.date_start,
      dateStop: data.date_stop
    };

    // Log de métricas
    logger.info(`[getAggregatedInsights] 📊 Métricas: Gasto=$${aggregated.spend}, Impresiones=${aggregated.impressions}, Clics=${aggregated.clicks}, CTR=${aggregated.ctr}%`);

    // Guardar en cache
    await MarketingCache.setAggregated(cacheKey as any, period, aggregated);
    logger.info(`[getAggregatedInsights] ✅ COMPLETADO - Métricas guardadas en cache`);

    AuditLogger.logRequest({
      companyId,
      action: "get_aggregated",
      endpoint: "/insights?level=account",
      method: "GET",
      responseStatus: "success",
      responseTime: timer(),
      cacheHit: false
    });

    return aggregated;
  } catch (error: any) {
    logger.error(`[getAggregatedInsights] ❌ Error obteniendo métricas agregadas: ${error.message}`);
    handleMetaError(error, companyId, "/insights?level=account");
  }
};

/**
 * Invalida el cache para forzar recarga de datos
 */
export const invalidateCache = async (companyId: number): Promise<void> => {
  await MarketingCache.invalidateCompany(companyId);
  logger.info(`[MetaMarketing] Cache invalidated for company ${companyId}`);
};

/**
 * Obtiene estadísticas de uso de la API
 */
export const getUsageStats = (companyId: number, hours: number = 24) => {
  return AuditLogger.getUsageStats(companyId, hours);
};

/**
 * Obtiene el estado del token
 */
export const getTokenStatus = async (companyId: number) => {
  return TokenManager.getTokenStatus(companyId);
};

// ============================================================
// CRUD — CAMPAIGNS
// ============================================================

export const createCampaign = async (
  companyId: number,
  campaignData: {
    name: string;
    objective: string;
    status?: "ACTIVE" | "PAUSED";
    special_ad_categories?: string[];
    daily_budget?: number;
    lifetime_budget?: number;
    start_time?: string;
    stop_time?: string;
    bid_strategy?: string;
  },
  whatsappId?: number
): Promise<any> => {
  logger.info(`[createCampaign] 🚀 Creando campaña "${campaignData.name}" - companyId: ${companyId}`);
  const timer = AuditLogger.startTimer();

  try {
    const { client, accountId } = await getMetaClient(companyId, whatsappId);
    const campaign = await client.campaigns.createCampaign(accountId, campaignData);

    await MarketingCache.invalidateCompany(companyId);

    AuditLogger.logRequest({
      companyId,
      action: "create_campaign",
      endpoint: `/act_${accountId}/campaigns`,
      method: "POST",
      responseStatus: "success",
      responseTime: timer()
    });

    logger.info(`[createCampaign] ✅ Campaña creada: ${campaign.id}`);
    return campaign;
  } catch (error: any) {
    logger.error(`[createCampaign] ❌ Error: ${error.message}`);
    handleMetaError(error, companyId, `/act_/campaigns`);
  }
};

export const updateCampaign = async (
  companyId: number,
  campaignId: string,
  updates: {
    name?: string;
    status?: "ACTIVE" | "PAUSED";
    daily_budget?: number;
    lifetime_budget?: number;
    start_time?: string;
    stop_time?: string;
  },
  whatsappId?: number
): Promise<any> => {
  logger.info(`[updateCampaign] 🚀 Actualizando campaña ${campaignId} - companyId: ${companyId}`);
  const timer = AuditLogger.startTimer();

  try {
    const { client } = await getMetaClient(companyId, whatsappId);
    const campaign = await client.campaigns.updateCampaign(campaignId, updates);

    await MarketingCache.invalidateCompany(companyId);

    AuditLogger.logRequest({
      companyId,
      action: "update_campaign",
      endpoint: `/${campaignId}`,
      method: "POST",
      responseStatus: "success",
      responseTime: timer()
    });

    logger.info(`[updateCampaign] ✅ Campaña actualizada: ${campaignId}`);
    return campaign;
  } catch (error: any) {
    logger.error(`[updateCampaign] ❌ Error: ${error.message}`);
    handleMetaError(error, companyId, `/${campaignId}`);
  }
};

export const deleteCampaign = async (
  companyId: number,
  campaignId: string,
  whatsappId?: number
): Promise<boolean> => {
  logger.info(`[deleteCampaign] 🚀 Eliminando campaña ${campaignId} - companyId: ${companyId}`);
  const timer = AuditLogger.startTimer();

  try {
    const { client } = await getMetaClient(companyId, whatsappId);
    const result = await client.campaigns.deleteCampaign(campaignId);

    await MarketingCache.invalidateCompany(companyId);

    AuditLogger.logRequest({
      companyId,
      action: "delete_campaign",
      endpoint: `/${campaignId}`,
      method: "DELETE",
      responseStatus: "success",
      responseTime: timer()
    });

    logger.info(`[deleteCampaign] ✅ Campaña eliminada: ${campaignId}`);
    return result;
  } catch (error: any) {
    logger.error(`[deleteCampaign] ❌ Error: ${error.message}`);
    handleMetaError(error, companyId, `/${campaignId}`);
  }
};

export const duplicateCampaign = async (
  companyId: number,
  campaignId: string,
  newName: string,
  whatsappId?: number
): Promise<any> => {
  logger.info(`[duplicateCampaign] 🚀 Duplicando campaña ${campaignId} como "${newName}" - companyId: ${companyId}`);
  const timer = AuditLogger.startTimer();

  try {
    const { client } = await getMetaClient(companyId, whatsappId);
    const campaign = await client.campaigns.duplicateCampaign(campaignId, newName);

    await MarketingCache.invalidateCompany(companyId);

    AuditLogger.logRequest({
      companyId,
      action: "duplicate_campaign",
      endpoint: `/${campaignId}/duplicate`,
      method: "POST",
      responseStatus: "success",
      responseTime: timer()
    });

    logger.info(`[duplicateCampaign] ✅ Campaña duplicada: ${campaign.id}`);
    return campaign;
  } catch (error: any) {
    logger.error(`[duplicateCampaign] ❌ Error: ${error.message}`);
    handleMetaError(error, companyId, `/${campaignId}/duplicate`);
  }
};

export const pauseAllInCampaign = async (
  companyId: number,
  campaignId: string,
  whatsappId?: number
): Promise<void> => {
  logger.info(`[pauseAllInCampaign] 🚀 Pausando campaña + ads ${campaignId} - companyId: ${companyId}`);
  const timer = AuditLogger.startTimer();

  try {
    const { client } = await getMetaClient(companyId, whatsappId);
    await client.campaigns.pauseAllInCampaign(campaignId);

    await MarketingCache.invalidateCompany(companyId);

    AuditLogger.logRequest({
      companyId,
      action: "pause_all_campaign",
      endpoint: `/${campaignId}/pause-all`,
      method: "POST",
      responseStatus: "success",
      responseTime: timer()
    });

    logger.info(`[pauseAllInCampaign] ✅ Campaña y ads pausados: ${campaignId}`);
  } catch (error: any) {
    logger.error(`[pauseAllInCampaign] ❌ Error: ${error.message}`);
    handleMetaError(error, companyId, `/${campaignId}/pause-all`);
  }
};

export const activateAllInCampaign = async (
  companyId: number,
  campaignId: string,
  whatsappId?: number
): Promise<void> => {
  logger.info(`[activateAllInCampaign] 🚀 Activando campaña + ads ${campaignId} - companyId: ${companyId}`);
  const timer = AuditLogger.startTimer();

  try {
    const { client } = await getMetaClient(companyId, whatsappId);
    await client.campaigns.activateAllInCampaign(campaignId);

    await MarketingCache.invalidateCompany(companyId);

    AuditLogger.logRequest({
      companyId,
      action: "activate_all_campaign",
      endpoint: `/${campaignId}/activate-all`,
      method: "POST",
      responseStatus: "success",
      responseTime: timer()
    });

    logger.info(`[activateAllInCampaign] ✅ Campaña y ads activados: ${campaignId}`);
  } catch (error: any) {
    logger.error(`[activateAllInCampaign] ❌ Error: ${error.message}`);
    handleMetaError(error, companyId, `/${campaignId}/activate-all`);
  }
};

// ============================================================
// CRUD — AD SETS
// ============================================================

export const createAdSet = async (
  companyId: number,
  campaignId: string,
  adsetData: {
    name: string;
    optimization_goal: string;
    billing_event: string;
    bid_amount?: number;
    daily_budget?: number;
    lifetime_budget?: number;
    start_time?: string;
    end_time?: string;
    targeting: any;
    status?: "ACTIVE" | "PAUSED";
  },
  whatsappId?: number
): Promise<any> => {
  logger.info(`[createAdSet] 🚀 Creando ad set "${adsetData.name}" en campaña ${campaignId} - companyId: ${companyId}`);
  const timer = AuditLogger.startTimer();

  try {
    const { client } = await getMetaClient(companyId, whatsappId);
    const adset = await client.campaigns.createAdSet(campaignId, adsetData);

    await MarketingCache.invalidateCompany(companyId);

    AuditLogger.logRequest({
      companyId,
      action: "create_adset",
      endpoint: `/campaigns/${campaignId}/adsets`,
      method: "POST",
      responseStatus: "success",
      responseTime: timer()
    });

    logger.info(`[createAdSet] ✅ Ad set creado: ${adset.id}`);
    return adset;
  } catch (error: any) {
    logger.error(`[createAdSet] ❌ Error: ${error.message}`);
    handleMetaError(error, companyId, `/campaigns/${campaignId}/adsets`);
  }
};

export const updateAdSet = async (
  companyId: number,
  adsetId: string,
  updates: {
    name?: string;
    status?: "ACTIVE" | "PAUSED";
    daily_budget?: number;
    lifetime_budget?: number;
    targeting?: any;
    bid_amount?: number;
  },
  whatsappId?: number
): Promise<any> => {
  logger.info(`[updateAdSet] 🚀 Actualizando ad set ${adsetId} - companyId: ${companyId}`);
  const timer = AuditLogger.startTimer();

  try {
    const { client } = await getMetaClient(companyId, whatsappId);
    const adset = await client.campaigns.updateAdSet(adsetId, updates);

    await MarketingCache.invalidateCompany(companyId);

    AuditLogger.logRequest({
      companyId,
      action: "update_adset",
      endpoint: `/${adsetId}`,
      method: "POST",
      responseStatus: "success",
      responseTime: timer()
    });

    logger.info(`[updateAdSet] ✅ Ad set actualizado: ${adsetId}`);
    return adset;
  } catch (error: any) {
    logger.error(`[updateAdSet] ❌ Error: ${error.message}`);
    handleMetaError(error, companyId, `/${adsetId}`);
  }
};

// ============================================================
// CRUD — ADS
// ============================================================

export const createAd = async (
  companyId: number,
  adsetId: string,
  adData: {
    name: string;
    creative: {
      title?: string;
      body?: string;
      image_hash?: string;
      video_id?: string;
      call_to_action?: any;
      object_story_spec?: any;
    };
    status?: "ACTIVE" | "PAUSED";
  },
  whatsappId?: number
): Promise<any> => {
  logger.info(`[createAd] 🚀 Creando ad "${adData.name}" en ad set ${adsetId} - companyId: ${companyId}`);
  const timer = AuditLogger.startTimer();

  try {
    const { client } = await getMetaClient(companyId, whatsappId);
    const ad = await client.campaigns.createAd(adsetId, adData);

    await MarketingCache.invalidateCompany(companyId);

    AuditLogger.logRequest({
      companyId,
      action: "create_ad",
      endpoint: `/adsets/${adsetId}/ads`,
      method: "POST",
      responseStatus: "success",
      responseTime: timer()
    });

    logger.info(`[createAd] ✅ Ad creado: ${ad.id}`);
    return ad;
  } catch (error: any) {
    logger.error(`[createAd] ❌ Error: ${error.message}`);
    handleMetaError(error, companyId, `/adsets/${adsetId}/ads`);
  }
};

export const updateAd = async (
  companyId: number,
  adId: string,
  updates: {
    name?: string;
    status?: "ACTIVE" | "PAUSED";
    creative?: any;
  },
  whatsappId?: number
): Promise<any> => {
  logger.info(`[updateAd] 🚀 Actualizando ad ${adId} - companyId: ${companyId}`);
  const timer = AuditLogger.startTimer();

  try {
    const { client } = await getMetaClient(companyId, whatsappId);
    const ad = await client.campaigns.updateAd(adId, updates);

    await MarketingCache.invalidateCompany(companyId);

    AuditLogger.logRequest({
      companyId,
      action: "update_ad",
      endpoint: `/${adId}`,
      method: "POST",
      responseStatus: "success",
      responseTime: timer()
    });

    logger.info(`[updateAd] ✅ Ad actualizado: ${adId}`);
    return ad;
  } catch (error: any) {
    logger.error(`[updateAd] ❌ Error: ${error.message}`);
    handleMetaError(error, companyId, `/${adId}`);
  }
};

export default {
  testConnection,
  getAdAccounts,
  getCampaigns,
  getCampaignById,
  getAdSetById,
  getAds,
  getAdSets,
  resolveAdAttributionById,
  getInsightsTrend,
  getAggregatedInsights,
  invalidateCache,
  getUsageStats,
  getTokenStatus,
  // CRUD Campaigns
  createCampaign,
  updateCampaign,
  deleteCampaign,
  duplicateCampaign,
  pauseAllInCampaign,
  activateAllInCampaign,
  // CRUD AdSets
  createAdSet,
  updateAdSet,
  // CRUD Ads
  createAd,
  updateAd
};
