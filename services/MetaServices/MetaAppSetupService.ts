/**
 * MetaAppSetupService — Configuración automática de la App de Meta
 *
 * Automatiza:
 * 1. Suscripción de webhooks a nivel de App (whatsapp_business_account)
 * 2. Verificación de configuración actual
 * 3. Detección de WABAs y sus estados de suscripción
 *
 * Nota: El config_id del Embedded Signup se configura en Meta Business Manager UI
 * y no puede crearse vía API. Este servicio documenta cómo obtenerlo.
 */
import axios from "axios";
import logger from "../../utils/logger";
import Whatsapp from "../../models/Whatsapp";
import { getWhatsAppSubscribedApps } from "../FacebookServices/graphAPI";
import CompaniesSettings from "../../models/CompaniesSettings";
import { getCompanyFacebookCredentials } from "../FacebookServices/getCompanyFBConfig";
import { getMetaVerifyToken } from "../../helpers/metaVerifyToken";

const GRAPH_API_VERSION = process.env.FB_GRAPH_VERSION || "v24.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
// Sin default: "whaticket" es el literal público del proyecto upstream, así que
// no autentica nada. Si falta, la suscripción falla con un mensaje claro en vez
// de registrarse en Meta con un token que conoce cualquiera.
const VERIFY_TOKEN = getMetaVerifyToken();

// Webhook callback URL para nuestro servidor
const WEBHOOK_CALLBACK_URL =
  process.env.META_WEBHOOK_URL ||
  `${process.env.BACKEND_URL || "https://appro.chateam.ws"}/webhook/metaws`;

// App Token = "{app_id}|{app_secret}"
const getAppToken = (appId: string, appSecret: string) => `${appId}|${appSecret}`;

async function getCompanyMetaAppConfig(companyId: number): Promise<{
  appId: string;
  appSecret: string;
  configId: string | null;
}> {
  const [{ facebookAppId, facebookAppSecret }, settings] = await Promise.all([
    getCompanyFacebookCredentials(companyId),
    CompaniesSettings.findOne({ where: { companyId } })
  ]);

  return {
    appId: facebookAppId,
    appSecret: facebookAppSecret,
    configId: settings?.metaEmbeddedSignupConfigId || null
  };
}

interface SetupResult {
  success: boolean;
  webhookSubscription: {
    configured: boolean;
    callbackUrl: string;
    fields: string[];
    error?: string;
  };
  existingWabas: Array<{
    whatsappId: number;
    name: string;
    wabaId: string | null;
    phoneNumberId: string | null;
    subscribed: boolean;
    subscriptionError?: string;
  }>;
  configId: {
    detected: boolean;
    value: string | null;
    instructions: string;
  };
  envStatus: {
    FACEBOOK_APP_ID: boolean;
    FACEBOOK_APP_SECRET: boolean;
    FB_GRAPH_VERSION: string;
    VERIFY_TOKEN: boolean;
    META_WEBHOOK_URL: string;
  };
}

/**
 * Suscribe la App a webhooks de tipo whatsapp_business_account
 * Endpoint: POST /{app-id}/subscriptions
 * Requiere App Token (no user token)
 */
async function subscribeAppToWhatsAppWebhooks(
  appId: string,
  appSecret: string
): Promise<{
  configured: boolean;
  callbackUrl: string;
  fields: string[];
  error?: string;
}> {
  // Solo campos validos para object=whatsapp_business_account
  // NOTA: messaging_handovers y messaging_postbacks son de "page", NO de WBA
  const fields = [
    "messages",
    "message_template_status_update",
    "message_template_quality_update",
    "account_update",
    "security",
    // Campos de coexistencia Meta
    "history",
    "smb_app_state_sync",
    "smb_message_echoes",
  ];

  if (!VERIFY_TOKEN) {
    const msg =
      "VERIFY_TOKEN no está configurado: no se puede suscribir el webhook en Meta. " +
      "Generá un valor aleatorio y configuralo en el entorno del backend.";
    logger.error(`[MetaAppSetup] ${msg}`);
    return {
      configured: false,
      callbackUrl: WEBHOOK_CALLBACK_URL,
      fields,
      error: msg
    };
  }

  try {
    const { data } = await axios.post(
      `${GRAPH_BASE}/${appId}/subscriptions`,
      {
        object: "whatsapp_business_account",
        callback_url: WEBHOOK_CALLBACK_URL,
        verify_token: VERIFY_TOKEN,
        fields: fields.join(","),
      },
      {
        params: { access_token: getAppToken(appId, appSecret) },
      }
    );

    logger.info(
      `[MetaAppSetup] App suscrita a webhooks WBA: ${JSON.stringify(data)}`
    );

    return {
      configured: true,
      callbackUrl: WEBHOOK_CALLBACK_URL,
      fields,
    };
  } catch (error: any) {
    const metaError = error.response?.data?.error;
    const errMsg = metaError?.message || error.message || "Error desconocido";
    const errCode = metaError?.code || "";
    const errSubcode = metaError?.error_subcode || "";

    let diagnostics = errMsg;
    if (errMsg.includes("unknown error")) {
      diagnostics += ` | Posible causa: Meta no pudo verificar el webhook URL (${WEBHOOK_CALLBACK_URL}). ` +
        `Asegurate de que GET ${WEBHOOK_CALLBACK_URL}?hub.mode=subscribe&hub.verify_token=<VERIFY_TOKEN>&hub.challenge=test ` +
        `retorne 200 con el challenge.`;
    }
    if (errCode) diagnostics += ` | code=${errCode}`;
    if (errSubcode) diagnostics += ` | subcode=${errSubcode}`;

    logger.error(`[MetaAppSetup] Error suscribiendo App a webhooks: ${diagnostics}`);
    return {
      configured: false,
      callbackUrl: WEBHOOK_CALLBACK_URL,
      fields,
      error: diagnostics,
    };
  }
}

/**
 * Obtiene las suscripciones actuales de la App
 */
async function getAppSubscriptions(appId: string, appSecret: string): Promise<any[]> {
  try {
    const { data } = await axios.get(
      `${GRAPH_BASE}/${appId}/subscriptions`,
      {
        params: { access_token: getAppToken(appId, appSecret) },
      }
    );
    return data?.data || [];
  } catch (error: any) {
    logger.warn(
      `[MetaAppSetup] Error obteniendo suscripciones: ${error.response?.data?.error?.message || error.message}`
    );
    return [];
  }
}

/**
 * Verifica la suscripción de cada WABA existente
 */
async function verifyWabaSubscriptions(
  companyId: number
): Promise<SetupResult["existingWabas"]> {
  const results: SetupResult["existingWabas"] = [];

  const connections = await Whatsapp.findAll({
    where: {
      companyId,
      provider: "meta",
      channel: "meta",
    },
  });

  for (const conn of connections) {
    const wabaId = conn.facebookUserId;
    const phoneNumberId = conn.facebookPageUserId;

    if (!wabaId || !conn.tokenMeta) {
      results.push({
        whatsappId: conn.id,
        name: conn.name,
        wabaId,
        phoneNumberId,
        subscribed: false,
        subscriptionError: "Sin WABA ID o token Meta",
      });
      continue;
    }

    try {
      const subData = await getWhatsAppSubscribedApps(wabaId, conn.tokenMeta);
      const isSubscribed =
        subData?.data?.length > 0 ||
        subData?.success === true;

      results.push({
        whatsappId: conn.id,
        name: conn.name,
        wabaId,
        phoneNumberId,
        subscribed: isSubscribed,
      });
    } catch (err: any) {
      results.push({
        whatsappId: conn.id,
        name: conn.name,
        wabaId,
        phoneNumberId,
        subscribed: false,
        subscriptionError: err.message,
      });
    }
  }

  return results;
}

/**
 * Intenta detectar el config_id de Embedded Signup desde las propiedades de la App
 * El config_id se genera en Meta Business Manager > WhatsApp > Embedded Signup Configuration
 */
async function detectConfigId(
  companyId: number,
  appId: string,
  appSecret: string,
  configuredConfigId: string | null
): Promise<{
  detected: boolean;
  value: string | null;
  instructions: string;
}> {
  if (configuredConfigId) {
    return {
      detected: true,
      value: configuredConfigId,
      instructions:
        "Config ID detectado en CompaniesSettings. El Embedded Signup usara la configuracion de esta company.",
    };
  }

  // Intentar obtener info de la App para guiar al usuario
  try {
    // Solo pedir campos basicos de la App (whatsapp_business_accounts requiere user token, no app token)
    const { data } = await axios.get(`${GRAPH_BASE}/${appId}`, {
      params: {
        access_token: getAppToken(appId, appSecret),
        fields: "name,category,link",
      },
    });

    const appName = data?.name || "Tu App";
    // Contar WABAs desde nuestras conexiones locales de esta company.
    const localMetaConnections = await Whatsapp.count({
      where: { companyId, provider: "meta", channel: "meta" },
    });
    const wabaCount = localMetaConnections;

    return {
      detected: false,
      value: null,
      instructions: [
        `App "${appName}" detectada (${wabaCount} WABAs vinculados).`,
        "",
        "Para obtener el config_id del Embedded Signup:",
        "1. Ve a https://business.facebook.com/settings/whatsapp-business-accounts",
        "2. Selecciona tu WABA > Configuración > Embedded Signup",
        "3. Crea una nueva configuración o copia el ID existente",
        "4. El config_id se mostrará como 'Configuration ID'",
        "",
        "Luego configúralo en Chateam: Configuracion > Facebook/Instagram > Embedded Signup Configuration ID.",
        "",
        "NOTA: El Embedded Signup funciona SIN config_id (flujo genérico).",
        "El config_id solo personaliza el flujo con tu branding y configuración.",
      ].join("\n"),
    };
  } catch (err: any) {
    return {
      detected: false,
      value: null,
      instructions: [
        "No se pudo consultar info de la App de Meta.",
        `Error: ${err.response?.data?.error?.message || err.message}`,
        "",
        "Para obtener el config_id manualmente:",
        "1. Ve a https://developers.facebook.com/apps/" + appId,
        "2. Navega a WhatsApp > Embedded Signup",
        "3. Crea una configuración y copia el Configuration ID",
        "4. Configúralo en Chateam: Configuracion > Facebook/Instagram > Embedded Signup Configuration ID.",
      ].join("\n"),
    };
  }
}

/**
 * Setup completo: configura todo lo necesario para Meta Coexistencia
 */
export async function runMetaAppSetup(companyId: number): Promise<SetupResult> {
  logger.info(
    `[MetaAppSetup] Iniciando setup automático para company ${companyId}`
  );

  const { appId, appSecret, configId: configuredConfigId } = await getCompanyMetaAppConfig(companyId);

  // 1. Suscribir App a webhooks de whatsapp_business_account
  const webhookSubscription = await subscribeAppToWhatsAppWebhooks(
    appId,
    appSecret
  );

  // 2. Verificar WABAs existentes
  const existingWabas = await verifyWabaSubscriptions(companyId);

  // 3. Detectar config_id
  const configId = await detectConfigId(companyId, appId, appSecret, configuredConfigId);

  // 4. Estado del entorno
  const envStatus = {
    FACEBOOK_APP_ID: !!appId,
    FACEBOOK_APP_SECRET: !!appSecret,
    FB_GRAPH_VERSION: GRAPH_API_VERSION,
    VERIFY_TOKEN: !!VERIFY_TOKEN,
    META_WEBHOOK_URL: WEBHOOK_CALLBACK_URL,
  };

  const result: SetupResult = {
    success: webhookSubscription.configured,
    webhookSubscription,
    existingWabas,
    configId,
    envStatus,
  };

  logger.info(
    `[MetaAppSetup] Setup completado: webhook=${webhookSubscription.configured}, ` +
      `wabas=${existingWabas.length}, configId=${configId.detected}`
  );

  return result;
}

/**
 * Obtiene un resumen rápido del estado de la configuración
 */
export async function getMetaAppStatus(companyId: number): Promise<{
  appConfigured: boolean;
  subscriptions: any[];
  webhookUrl: string;
}> {
  const { appId, appSecret } = await getCompanyMetaAppConfig(companyId);
  const subscriptions = await getAppSubscriptions(appId, appSecret);
  const whatsappSub = subscriptions.find(
    (s: any) => s.object === "whatsapp_business_account"
  );

  return {
    appConfigured: !!whatsappSub?.active,
    subscriptions,
    webhookUrl: WEBHOOK_CALLBACK_URL,
  };
}
