/**
 * metaManualConnectService — Conexion Manual via Token de Sistema
 *
 * Para empresas que NO son BSP/TP de Meta y no pueden usar Embedded Signup.
 * El usuario genera un Permanent System User Token desde Meta Business Manager
 * y lo pega directamente en el formulario.
 *
 * Flujo:
 * 1. Usuario ingresa: accessToken + phoneNumberId + wabaId (opcional) + nombre
 * 2. Backend valida el token contra Graph API
 * 3. Backend obtiene info del numero de telefono y WABA
 * 4. Crea/actualiza la conexion Whatsapp con coexistencia habilitada
 */
import axios from "axios";
import Whatsapp from "../../models/Whatsapp";
import { getIO } from "../../libs/socket";
import logger from "../../utils/logger";

const GRAPH_API_VERSION = process.env.FB_GRAPH_VERSION || "v24.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

interface ManualConnectParams {
  accessToken: string;         // Permanent System User Token de Meta Business Manager
  phoneNumberId: string;       // ID del numero (ej: 123456789012345) — se encuentra en WABA settings
  wabaId?: string;             // WABA ID (opcional, se intenta obtener automaticamente)
  connectionName?: string;     // Nombre para identificar la conexion en ChatEAM
  companyId: number;
}

interface ManualConnectResult {
  whatsapp: Whatsapp;
  phoneNumberId: string;
  displayPhoneNumber: string;
  wabaId: string | null;
  verifiedName: string;
}

/**
 * Valida el token y obtiene informacion del numero de telefono
 */
async function validateTokenAndGetPhoneInfo(
  accessToken: string,
  phoneNumberId: string
): Promise<{
  displayPhoneNumber: string;
  verifiedName: string;
  qualityRating: string;
  wabaId: string | null;
}> {
  // 1. Obtener info del numero de telefono
  const { data: phoneData } = await axios.get(
    `${GRAPH_BASE}/${phoneNumberId}`,
    {
      params: {
        access_token: accessToken,
        fields: "display_phone_number,verified_name,quality_rating,name_status",
      },
    }
  );

  if (!phoneData?.display_phone_number) {
    throw new Error(
      "Token invalido o Phone Number ID incorrecto. " +
      "Verifica que el token tenga permisos 'whatsapp_business_messaging' y que el Phone Number ID sea correcto."
    );
  }

  // 2. Intentar obtener el WABA ID via el endpoint /phone_number → /whatsapp_business_account
  let wabaId: string | null = null;
  try {
    const { data: wabaData } = await axios.get(
      `${GRAPH_BASE}/${phoneNumberId}/whatsapp_business_account`,
      {
        params: { access_token: accessToken },
      }
    );
    wabaId = wabaData?.id || null;
  } catch (err: any) {
    logger.warn(`[ManualConnect] No se pudo obtener WABA ID automaticamente: ${err.message}`);
  }

  return {
    displayPhoneNumber: phoneData.display_phone_number,
    verifiedName: phoneData.verified_name || "",
    qualityRating: phoneData.quality_rating || "UNKNOWN",
    wabaId,
  };
}

/**
 * Suscribe el WABA a webhooks de la App global
 */
async function subscribeWabaToWebhooks(
  wabaId: string,
  accessToken: string
): Promise<void> {
  try {
    await axios.post(
      `${GRAPH_BASE}/${wabaId}/subscribed_apps`,
      {},
      { params: { access_token: accessToken } }
    );
    logger.info(`[ManualConnect] WABA ${wabaId} suscrito a webhooks`);
  } catch (err: any) {
    logger.warn(`[ManualConnect] Error suscribiendo WABA a webhooks (no critico): ${err.message}`);
  }
}

/**
 * Conecta una cuenta de WhatsApp Business via token de sistema manual
 */
/**
 * Solicita el código de verificación SMS/VOZ al número de teléfono
 * Necesario cuando platform_type=ON_PREMISE o code_verification_status=NOT_VERIFIED
 */
export async function requestVerificationCode(
  phoneNumberId: string,
  accessToken: string,
  method: "SMS" | "VOICE" = "SMS",
  language: string = "es"
): Promise<{ success: boolean; error?: string }> {
  logger.info(`[RequestCode] ===== INICIO request_code =====`);
  logger.info(`[RequestCode] phoneNumberId: ${phoneNumberId}`);
  logger.info(`[RequestCode] method: ${method} | language: ${language}`);
  logger.info(`[RequestCode] tokenMeta (20 chars): ${accessToken?.substring(0, 20)}...`);
  logger.info(`[RequestCode] URL: ${GRAPH_BASE}/${phoneNumberId}/request_code`);

  try {
    const response = await axios.post(
      `${GRAPH_BASE}/${phoneNumberId}/request_code`,
      { code_method: method, language },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    logger.info(`[RequestCode] ✅ Código ${method} solicitado exitosamente para ${phoneNumberId}`);
    logger.info(`[RequestCode] Respuesta Meta: ${JSON.stringify(response.data)}`);
    return { success: true };
  } catch (err: any) {
    const apiError = err.response?.data?.error;
    const httpStatus = err.response?.status;
    const msg =
      apiError?.error_user_msg ||
      apiError?.message ||
      err.message;

    logger.error(`[RequestCode] ❌ ===== ERROR request_code =====`);
    logger.error(`[RequestCode] phoneNumberId: ${phoneNumberId}`);
    logger.error(`[RequestCode] HTTP Status: ${httpStatus}`);
    logger.error(`[RequestCode] Meta error.code: ${apiError?.code}`);
    logger.error(`[RequestCode] Meta error.error_subcode: ${apiError?.error_subcode}`);
    logger.error(`[RequestCode] Meta error.type: ${apiError?.type}`);
    logger.error(`[RequestCode] Meta error.message: ${apiError?.message}`);
    logger.error(`[RequestCode] Meta error.error_user_msg: ${apiError?.error_user_msg}`);
    logger.error(`[RequestCode] Meta error.fbtrace_id: ${apiError?.fbtrace_id}`);
    logger.error(`[RequestCode] Payload completo: ${JSON.stringify(err.response?.data)}`);

    // Detectar rate limit específico
    if (apiError?.error_subcode === 2388091) {
      logger.error(`[RequestCode] ⏳ RATE LIMIT: error_subcode 2388091 → esperar ~1 hora`);
    } else if (apiError?.error_subcode === 2388367) {
      logger.error(`[RequestCode] ⏳ RATE LIMIT EXTENDIDO: error_subcode 2388367 → esperar varias horas`);
    }

    return { success: false, error: msg };
  }
}

/**
 * Verifica el código OTP recibido por SMS/VOZ
 */
export async function verifyPhoneCode(
  phoneNumberId: string,
  accessToken: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  logger.info(`[VerifyCode] ===== INICIO verify_code =====`);
  logger.info(`[VerifyCode] phoneNumberId: ${phoneNumberId}`);
  logger.info(`[VerifyCode] code recibido: ${code} (${code?.length} chars)`);

  try {
    const response = await axios.post(
      `${GRAPH_BASE}/${phoneNumberId}/verify_code`,
      { code },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    logger.info(`[VerifyCode] ✅ Número ${phoneNumberId} verificado exitosamente`);
    logger.info(`[VerifyCode] Respuesta Meta: ${JSON.stringify(response.data)}`);
    return { success: true };
  } catch (err: any) {
    const apiError = err.response?.data?.error;
    const httpStatus = err.response?.status;
    const msg =
      apiError?.error_user_msg ||
      apiError?.message ||
      err.message;

    logger.error(`[VerifyCode] ❌ ===== ERROR verify_code =====`);
    logger.error(`[VerifyCode] phoneNumberId: ${phoneNumberId}`);
    logger.error(`[VerifyCode] HTTP Status: ${httpStatus}`);
    logger.error(`[VerifyCode] Meta error.code: ${apiError?.code}`);
    logger.error(`[VerifyCode] Meta error.error_subcode: ${apiError?.error_subcode}`);
    logger.error(`[VerifyCode] Meta error.message: ${apiError?.message}`);
    logger.error(`[VerifyCode] Meta error.error_user_msg: ${apiError?.error_user_msg}`);
    logger.error(`[VerifyCode] Payload completo: ${JSON.stringify(err.response?.data)}`);

    return { success: false, error: msg };
  }
}

/**
 * Registra el número para Cloud API (requiere estar verificado primero)
 * Solo disponible para BSPs/TPs — para SMBs puede fallar con code 100
 */
export async function registerForCloudAPI(
  phoneNumberId: string,
  accessToken: string,
  pin: string = "000000"
): Promise<{ success: boolean; alreadyCloud?: boolean; error?: string }> {
  try {
    await axios.post(
      `${GRAPH_BASE}/${phoneNumberId}/register`,
      { messaging_product: "whatsapp", pin },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    logger.info(`[ManualConnect] Número ${phoneNumberId} registrado para Cloud API`);
    return { success: true };
  } catch (err: any) {
    const apiErr = err.response?.data?.error;
    const msg = apiErr?.error_user_msg || apiErr?.message || err.message;

    // code 100 con "not available for SMB" = restricción, no error fatal
    if (apiErr?.code === 100 && msg?.includes("SMB")) {
      logger.warn(`[ManualConnect] Registro Cloud API no disponible para SMB en ${phoneNumberId}`);
      return { success: false, error: "SMB_RESTRICTION", alreadyCloud: false };
    }

    // Si ya está en Cloud API
    if (msg?.includes("already registered") || msg?.includes("CLOUD_API")) {
      return { success: true, alreadyCloud: true };
    }

    logger.warn(`[ManualConnect] Error registrando ${phoneNumberId} para Cloud API: ${msg}`);
    return { success: false, error: msg };
  }
}

export async function connectViaManualToken(
  params: ManualConnectParams
): Promise<ManualConnectResult> {
  const { accessToken, phoneNumberId, wabaId: providedWabaId, connectionName, companyId } = params;

  logger.info(`[ManualConnect] Iniciando conexion manual para company ${companyId}, phone: ${phoneNumberId}`);

  // 1. Validar token y obtener info del numero
  const { displayPhoneNumber, verifiedName, wabaId: detectedWabaId } =
    await validateTokenAndGetPhoneInfo(accessToken, phoneNumberId);

  const resolvedWabaId = providedWabaId || detectedWabaId || null;
  const cleanPhoneNumber = displayPhoneNumber.replace(/[\s\+\-\(\)]/g, "");
  const resolvedName = connectionName || verifiedName || `Meta ${displayPhoneNumber}`;

  logger.info(`[ManualConnect] Token valido. Numero: ${displayPhoneNumber}, WABA: ${resolvedWabaId || "no detectado"}`);

  // 2. Upsert conexion
  const generateToken = (length: number) => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
  };

  const payload: Partial<Whatsapp> = {
    name: resolvedName,
    status: "CONNECTED",
    companyId,
    provider: "meta",
    channel: "meta",
    tokenMeta: accessToken,
    token: generateToken(30),
    number: cleanPhoneNumber || phoneNumberId,
    facebookPageUserId: phoneNumberId,       // phoneNumberId
    facebookUserId: resolvedWabaId || undefined,  // wabaId
    displayPhoneNumber,
    phoneNumberId,
    coexistenceEnabled: true,
    coexistenceStatus: "active",
    coexistenceOnboardedAt: new Date(),
    lastAppOpenedAt: new Date(),
  };

  let record = await Whatsapp.findOne({
    where: { companyId, facebookPageUserId: phoneNumberId, provider: "meta", channel: "meta" },
  });

  if (record) {
    if (record.token) delete (payload as any).token;
    await record.update(payload);
    logger.info(`[ManualConnect] Conexion ACTUALIZADA - ID: ${record.id}`);
  } else {
    record = await Whatsapp.create(payload as any);
    logger.info(`[ManualConnect] Conexion CREADA - ID: ${record.id}`);
  }

  // 3. Suscribir WABA a webhooks (no critico)
  if (resolvedWabaId) {
    await subscribeWabaToWebhooks(resolvedWabaId, accessToken);
  }

  // 4. Notificar frontend via socket
  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-whatsapp`, {
    action: "update",
    whatsapp: record,
  });

  logger.info(`[ManualConnect] Completado para company ${companyId}, conexion ID: ${record.id}`);

  return {
    whatsapp: record,
    phoneNumberId,
    displayPhoneNumber,
    wabaId: resolvedWabaId,
    verifiedName,
  };
}
