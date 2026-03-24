/**
 * Servicio de Embedded Signup para Meta Coexistencia
 *
 * Flujo OAuth:
 * 1. Frontend envia authorization code obtenido del Facebook JS SDK
 * 2. Backend intercambia code → short-lived token (1 hora)
 * 3. Backend intercambia short-lived → long-lived token (60 dias)
 * 4. Backend consulta Phone Number ID y WABA ID
 * 5. Crea/actualiza registro Whatsapp con coexistencia habilitada
 *
 * IMPORTANTE: Usa credenciales per-company de CompaniesSettings,
 * NO las globales de .env. Cada company puede tener su propia App de Meta.
 */
import axios from "axios";
import Whatsapp from "../../models/Whatsapp";
import { getIO } from "../../libs/socket";
import {
  subscribeWhatsAppBusinessAccount,
  registerWhatsAppPhoneNumber,
} from "../FacebookServices/graphAPI";
import { getCompanyFacebookCredentials } from "../FacebookServices/getCompanyFBConfig";
import logger from "../../utils/logger";

const GRAPH_API_VERSION = process.env.FB_GRAPH_VERSION || "v24.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

interface EmbeddedSignupResult {
  whatsapp: Whatsapp;
  wabaId: string | null;
  phoneNumberId: string;
  displayPhoneNumber: string;
  tokenExpiresAt: Date;
}

/**
 * Obtiene las credenciales de la company o fallback a las globales de .env
 */
async function getCredentials(companyId: number): Promise<{
  appId: string;
  appSecret: string;
}> {
  try {
    const creds = await getCompanyFacebookCredentials(companyId);
    logger.info(`[EmbeddedSignup] Usando credenciales de company ${companyId} (App ID: ${creds.facebookAppId})`);
    return {
      appId: creds.facebookAppId,
      appSecret: creds.facebookAppSecret,
    };
  } catch {
    // Fallback a credenciales globales si la company no tiene configuradas
    const globalAppId = process.env.FACEBOOK_APP_ID || "";
    const globalAppSecret = process.env.FACEBOOK_APP_SECRET || "";

    if (!globalAppId || !globalAppSecret) {
      throw new Error(
        "No se encontraron credenciales de Facebook para la company ni en variables globales. " +
        "Configura facebookAppId y facebookAppSecret en Configuracion Avanzada → Facebook Ads."
      );
    }

    logger.warn(`[EmbeddedSignup] Company ${companyId} sin credenciales propias, usando globales`);
    return { appId: globalAppId, appSecret: globalAppSecret };
  }
}

/**
 * Intercambia authorization code por short-lived access token.
 *
 * NOTA IMPORTANTE sobre redirect_uri:
 * El flujo Embedded Signup con FB JS SDK (sessioninfoversion: 2) retorna el code
 * vía postMessage — Facebook usa un redirect_uri dinámico interno (xd_arbiter) que
 * cambia en cada sesión y no se puede reproducir. Por eso NO se envía redirect_uri
 * en este intercambio. Meta acepta esto para códigos obtenidos via JS SDK.
 */
async function exchangeCodeForToken(
  code: string,
  appId: string,
  appSecret: string
): Promise<{ accessToken: string; tokenType: string }> {
  const url = `${GRAPH_BASE}/oauth/access_token`;
  logger.info(`[EmbeddedSignup:Token] ── Params enviados a Meta ──`);
  logger.info(`[EmbeddedSignup:Token]   URL: ${url}`);
  logger.info(`[EmbeddedSignup:Token]   client_id: ${appId}`);
  logger.info(`[EmbeddedSignup:Token]   client_secret: ${appSecret ? appSecret.substring(0, 6) + "..." : "VACÍO"}`);
  logger.info(`[EmbeddedSignup:Token]   redirect_uri: (omitido — flujo JS SDK Embedded Signup)`);
  logger.info(`[EmbeddedSignup:Token]   code (50 chars): ${code.substring(0, 50)}...`);

  try {
    const { data } = await axios.get(url, {
      params: {
        client_id: appId,
        client_secret: appSecret,
        // ⚠️ NO enviamos redirect_uri: el código viene del FB JS SDK vía postMessage,
        // no de un redirect clásico. El redirect_uri interno del SDK (xd_arbiter)
        // es dinámico e irrepetible — Meta lo acepta sin redirect_uri para este flujo.
        code,
      },
    });

    if (!data.access_token) {
      throw new Error("No se obtuvo access_token del intercambio OAuth");
    }

    logger.info(`[EmbeddedSignup:Token] ✅ Token obtenido correctamente (tipo: ${data.token_type})`);
    return {
      accessToken: data.access_token,
      tokenType: data.token_type || "bearer",
    };
  } catch (err: any) {
    // ── Loguear el error COMPLETO de Meta para diagnóstico ──
    const metaBody = err.response?.data;
    const metaErrObj = metaBody?.error || metaBody;
    const metaMsg = metaErrObj?.message || metaBody?.error_description || err.message;
    const metaCode = metaErrObj?.code;
    const metaType = metaErrObj?.type;
    const metaSubcode = metaErrObj?.error_subcode;
    const metaFbTraceId = metaErrObj?.fbtrace_id;

    logger.error(`[EmbeddedSignup:Token] ❌ ERROR al intercambiar code con Meta:`);
    logger.error(`[EmbeddedSignup:Token]   HTTP Status: ${err.response?.status}`);
    logger.error(`[EmbeddedSignup:Token]   error.message: ${metaMsg}`);
    logger.error(`[EmbeddedSignup:Token]   error.code: ${metaCode}`);
    logger.error(`[EmbeddedSignup:Token]   error.type: ${metaType}`);
    logger.error(`[EmbeddedSignup:Token]   error.error_subcode: ${metaSubcode}`);
    logger.error(`[EmbeddedSignup:Token]   fbtrace_id: ${metaFbTraceId}`);
    logger.error(`[EmbeddedSignup:Token]   Body completo: ${JSON.stringify(metaBody)}`);

    // Re-lanzar con mensaje útil para el frontend
    throw new Error(`Meta OAuth Error (${err.response?.status || "?"}) — ${metaMsg || err.message}`);
  }
}

/**
 * Intercambia short-lived token por long-lived token (60 dias)
 */
async function exchangeForLongLivedToken(
  shortLivedToken: string,
  appId: string,
  appSecret: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const { data } = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
    params: {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLivedToken,
    },
  });

  if (!data.access_token) {
    throw new Error("No se obtuvo long-lived token");
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in || 5184000, // default 60 dias
  };
}

/**
 * Obtiene la lista de WABAs y Phone Numbers del usuario
 */
async function getWhatsAppBusinessInfo(
  accessToken: string,
  appId: string,
  appSecret: string
): Promise<{
  wabaId: string | null;
  phoneNumbers: Array<{
    id: string;
    display_phone_number: string;
    verified_name: string;
    quality_rating: string;
  }>;
}> {
  // 1. Obtener WABAs del usuario via debug_token
  const { data: debugData } = await axios.get(`${GRAPH_BASE}/debug_token`, {
    params: {
      input_token: accessToken,
      access_token: `${appId}|${appSecret}`,
    },
  });

  // 2. Buscar WABA en los permisos granulares del token
  const granularScopes = debugData?.data?.granular_scopes || [];
  let wabaId: string | null = null;

  for (const scope of granularScopes) {
    if (scope.scope === "whatsapp_business_management" && scope.target_ids?.length > 0) {
      wabaId = scope.target_ids[0];
      break;
    }
  }

  // 3. Si encontramos WABA, obtener phone numbers
  const phoneNumbers: Array<{
    id: string;
    display_phone_number: string;
    verified_name: string;
    quality_rating: string;
  }> = [];

  if (wabaId) {
    try {
      const { data: phonesData } = await axios.get(
        `${GRAPH_BASE}/${wabaId}/phone_numbers`,
        { params: { access_token: accessToken } }
      );

      if (phonesData?.data) {
        for (const phone of phonesData.data) {
          phoneNumbers.push({
            id: phone.id,
            display_phone_number: phone.display_phone_number || "",
            verified_name: phone.verified_name || "",
            quality_rating: phone.quality_rating || "",
          });
        }
      }
    } catch (err: any) {
      logger.warn(`[EmbeddedSignup] Error obteniendo phone numbers: ${err.message}`);
    }
  }

  return { wabaId, phoneNumbers };
}

/**
 * Procesa el callback completo del Embedded Signup
 */
export async function processEmbeddedSignupCallback(params: {
  code: string;
  companyId: number;
  connectionName?: string;
  phoneNumberId?: string;
  sessionId?: string;
  /** true cuando Facebook devolvió directamente un accessToken (no un code) */
  isAccessToken?: boolean;
}): Promise<EmbeddedSignupResult> {
  const { code, companyId, connectionName, phoneNumberId: selectedPhoneId, sessionId, isAccessToken } = params;

  logger.info(`[EmbeddedSignup] Iniciando para company ${companyId} (isAccessToken: ${isAccessToken ?? false})`);

  // 0. Obtener credenciales de la company (o fallback a globales)
  const { appId, appSecret } = await getCredentials(companyId);

  let longLivedToken: string;
  let expiresIn: number;

  if (isAccessToken) {
    // FB devolvió directamente un accessToken (ej: usuario ya autorizado anteriormente)
    // Saltamos el intercambio code → short-lived y vamos directo a long-lived
    logger.info("[EmbeddedSignup] Paso 1 omitido — Se recibió accessToken directamente del SDK");
    logger.info("[EmbeddedSignup] Paso 2: Intercambiando accessToken por long-lived token...");
    const result = await exchangeForLongLivedToken(code, appId, appSecret);
    longLivedToken = result.accessToken;
    expiresIn = result.expiresIn;
  } else {
    // Flujo normal: code → short-lived → long-lived
    logger.info("[EmbeddedSignup] Paso 1: Intercambiando code por token (sin redirect_uri)...");
    const { accessToken: shortToken } = await exchangeCodeForToken(code, appId, appSecret);

    // 2. Intercambiar short → long-lived token
    logger.info("[EmbeddedSignup] Paso 2: Intercambiando por long-lived token...");
    const result = await exchangeForLongLivedToken(shortToken, appId, appSecret);
    longLivedToken = result.accessToken;
    expiresIn = result.expiresIn;
  }

  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
  logger.info(`[EmbeddedSignup] Token valido hasta: ${tokenExpiresAt.toISOString()}`);

  // 3. Obtener info de WABA y phone numbers
  logger.info("[EmbeddedSignup] Paso 3: Obteniendo info de WhatsApp Business...");
  const { wabaId, phoneNumbers } = await getWhatsAppBusinessInfo(longLivedToken, appId, appSecret);

  if (phoneNumbers.length === 0) {
    throw new Error("No se encontraron numeros de telefono asociados a la cuenta WhatsApp Business");
  }

  // Seleccionar el numero (el proporcionado o el primero disponible)
  const selectedPhone = selectedPhoneId
    ? phoneNumbers.find((p) => p.id === selectedPhoneId) || phoneNumbers[0]
    : phoneNumbers[0];

  const phoneNumberId = selectedPhone.id;
  const displayPhoneNumber = selectedPhone.display_phone_number;
  const cleanPhoneNumber = displayPhoneNumber.replace(/[\s\+\-\(\)]/g, "");

  const resolvedName =
    connectionName ||
    selectedPhone.verified_name ||
    `Meta ${displayPhoneNumber}`;

  logger.info(`[EmbeddedSignup] Numero seleccionado: ${displayPhoneNumber} (${phoneNumberId})`);

  // 4. Generar token aleatorio para API externa
  const generateToken = (length: number) => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // 5. Upsert conexion con coexistencia habilitada
  const payload: Partial<Whatsapp> = {
    name: resolvedName,
    status: "CONNECTED",
    companyId,
    provider: "meta",
    channel: "meta",
    tokenMeta: longLivedToken,
    token: generateToken(30),
    number: cleanPhoneNumber || phoneNumberId,
    facebookPageUserId: phoneNumberId,
    facebookUserId: wabaId || undefined,
    displayPhoneNumber,
    phoneNumberId,
    // Campos de coexistencia
    coexistenceEnabled: true,
    coexistenceStatus: "pending_sync",
    coexistenceOnboardedAt: new Date(),
    lastAppOpenedAt: new Date(),
    embeddedSignupSessionId: sessionId || undefined,
  };

  let record = await Whatsapp.findOne({
    where: { companyId, facebookPageUserId: phoneNumberId, provider: "meta", channel: "meta" },
  });

  if (record) {
    // Preservar token API existente
    if (record.token) {
      delete (payload as any).token;
    }
    await record.update(payload);
    logger.info(`[EmbeddedSignup] Conexion ACTUALIZADA - ID: ${record.id}`);
  } else {
    record = await Whatsapp.create(payload as any);
    logger.info(`[EmbeddedSignup] Conexion CREADA - ID: ${record.id}`);
  }

  // 6. Suscribir App al WABA y registrar numero
  if (wabaId) {
    try {
      await subscribeWhatsAppBusinessAccount(wabaId, longLivedToken);
      logger.info(`[EmbeddedSignup] App suscrita al WABA: ${wabaId}`);
    } catch (subErr: any) {
      logger.warn(`[EmbeddedSignup] Error suscribiendo App a WABA (no critico): ${subErr.message}`);
    }

    // Registrar el numero de telefono (requerido para enviar/recibir mensajes)
    try {
      await registerWhatsAppPhoneNumber(phoneNumberId, longLivedToken);
      logger.info(`[EmbeddedSignup] Numero registrado: ${phoneNumberId}`);
    } catch (regErr: any) {
      logger.warn(`[EmbeddedSignup] Error registrando numero (no critico): ${regErr.message}`);
    }
  }

  // 7. Notificar al frontend por socket
  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-whatsapp`, {
    action: "update",
    whatsapp: record,
  });

  logger.info(`[EmbeddedSignup] Completado para company ${companyId}, conexion ID: ${record.id}`);

  return {
    whatsapp: record,
    wabaId,
    phoneNumberId,
    displayPhoneNumber,
    tokenExpiresAt,
  };
}

/**
 * Renueva un token de larga duracion que esta por vencer
 * Debe llamarse ANTES de que expire (tokens de 60 dias)
 */
export async function refreshLongLivedToken(whatsappId: number): Promise<{
  success: boolean;
  newExpiresAt?: Date;
  error?: string;
}> {
  try {
    const whatsapp = await Whatsapp.findByPk(whatsappId);
    if (!whatsapp || !whatsapp.tokenMeta) {
      return { success: false, error: "Conexion no encontrada o sin token" };
    }

    // Obtener credenciales de la company de esta conexion
    const { appId, appSecret } = await getCredentials(whatsapp.companyId);

    const { accessToken: newToken, expiresIn } = await exchangeForLongLivedToken(
      whatsapp.tokenMeta,
      appId,
      appSecret
    );
    const newExpiresAt = new Date(Date.now() + expiresIn * 1000);

    await whatsapp.update({ tokenMeta: newToken });

    logger.info(`[TokenRefresh] Token renovado para Whatsapp ID ${whatsappId}, expira: ${newExpiresAt.toISOString()}`);

    return { success: true, newExpiresAt };
  } catch (err: any) {
    logger.error(`[TokenRefresh] Error renovando token para Whatsapp ID ${whatsappId}: ${err.message}`);
    return { success: false, error: err.message };
  }
}
