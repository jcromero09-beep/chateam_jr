import axios from "axios";
import crypto from "crypto";
import { Request } from "express";
import { parsePhoneNumberFromString, CountryCode } from "libphonenumber-js"; // [Fase2·B3.1] E.164 para EMQ
import { GRAPH_API_VERSION } from "../../config/metaGraph"; // [Fase2·A2.1] fuente única versión
import Company from "../../models/Company";
import CompaniesSettings from "../../models/CompaniesSettings";
import FacebookDataset from "../../models/FacebookDataset";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
import logger from "../../utils/logger";
import {
  getEventKeyFromMetaEventName,
  shouldSendMetaConversion
} from "./MetaConversionPolicyService";

type WebsiteEventName =
  | "CompleteRegistration"
  | "StartTrial"
  | "Purchase"
  | "Login"
  | "Lead";

export type { WebsiteEventName };

interface WebsiteEventContext {
  req?: Request;
  eventSourceUrl?: string;
  actionSource?: "website" | "system_generated";
  conversionCompanyId?: number;
  whatsappId?: number;
  datasetId?: string;
  accessToken?: string;
  fbc?: string;
  fbp?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
}

interface WebsiteEventUser {
  userId?: number | string;
  companyId?: number;
  email?: string;
  phone?: string;
  name?: string;
}

interface SendWebsiteEventData {
  eventName: WebsiteEventName;
  eventId: string;
  user: WebsiteEventUser;
  customData?: Record<string, any>;
  context?: WebsiteEventContext;
}

const getPixelId = (): string | undefined =>
  process.env.FACEBOOK_PIXEL_ID ||
  process.env.META_PIXEL_ID ||
  process.env.FACEBOOK_CONVERSIONS_PIXEL_ID;

const getAccessToken = (): string | undefined =>
  process.env.FACEBOOK_CONVERSIONS_ACCESS_TOKEN ||
  process.env.META_CONVERSIONS_ACCESS_TOKEN ||
  process.env.FACEBOOK_ACCESS_TOKEN;

export const getApiVersion = (): string =>
  process.env.FACEBOOK_CONVERSIONS_API_VERSION || GRAPH_API_VERSION;

export type ConversionDestination = {
  destinationId: string;
  accessToken: string;
  source: string;
};

export type { WebsiteEventUser, WebsiteEventContext };

const pixelCache = new Map<string, { pixelId: string; expiresAt: number }>();

const parsePositiveInt = (value?: string): number | undefined => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const normalizeAdAccountId = (value?: string): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.startsWith("act_") ? trimmed : `act_${trimmed}`;
};

const maskId = (value?: string | number): string => {
  if (value === undefined || value === null || value === "") return "N/A";
  const raw = String(value);
  if (raw.length <= 8) return raw;
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
};

const summarizeObjectKeys = (value?: Record<string, any>): string => {
  if (!value || typeof value !== "object") return "none";
  const keys = Object.keys(value);
  return keys.length ? keys.join(",") : "none";
};

const getDefaultConversionName = (eventName: WebsiteEventName): string => {
  switch (eventName) {
    case "Purchase":
      return "Venta";
    case "CompleteRegistration":
      return "Registro de cliente";
    case "StartTrial":
      return "Inicio de prueba";
    case "Login":
      return "Login";
    case "Lead":
      return "Lead";
    default:
      return eventName;
  }
};

const buildReadableWebsiteCustomData = (
  eventName: WebsiteEventName,
  customData: Record<string, any>,
  user: WebsiteEventUser,
  policyConversionName?: string
): Record<string, any> => {
  const data = { ...(customData || {}) };

  delete data.ticket_id;
  delete data.company_id;
  delete data.contact_id;
  delete data.whatsapp_id;
  delete data.user_id;

  return {
    ...data,
    conversion_name: data.conversion_name || data.content_name || policyConversionName || getDefaultConversionName(eventName),
    contact_name: data.contact_name || user.name || null,
    contact_number: data.contact_number || user.phone || null
  };
};

const getCandidateCompanyIds = async (
  userCompanyId?: number,
  contextCompanyId?: number
): Promise<number[]> => {
  const chateamCompany = await Company.findOne({ where: { name: "chateam" } });
  const ids = [
    contextCompanyId,
    parsePositiveInt(process.env.CHATEAM_CONVERSIONS_COMPANY_ID),
    chateamCompany?.id,
    parsePositiveInt(process.env.FACEBOOK_CONVERSIONS_COMPANY_ID),
    parsePositiveInt(process.env.META_CONVERSIONS_COMPANY_ID),
    userCompanyId
  ].filter((id): id is number => Boolean(id));

  return Array.from(new Set(ids));
};

const resolvePixelFromSettings = async (
  settings: CompaniesSettings
): Promise<string | undefined> => {
  const accessToken = settings.facebookSystemUserToken;
  const adAccountId = normalizeAdAccountId(settings.facebookAdAccountId);

  if (!accessToken || !adAccountId) return undefined;

  const cacheKey = `${settings.companyId}:${adAccountId}`;
  const cached = pixelCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.pixelId;

  try {
    const response = await axios.get(
      `https://graph.facebook.com/${getApiVersion()}/${adAccountId}/adspixels`,
      {
        params: {
          fields: "id,name",
          limit: 1,
          access_token: accessToken
        },
        timeout: 10000
      }
    );

    const pixelId = response.data?.data?.[0]?.id;
    if (pixelId) {
      pixelCache.set(cacheKey, {
        pixelId,
        expiresAt: Date.now() + 30 * 60 * 1000
      });
      return pixelId;
    }
  } catch (error: any) {
    logger.warn(
      `[FB-WEB-CAPI] No se pudo resolver Pixel desde Ad Account company=${settings.companyId}: ${error.message}`
    );
  }

  return undefined;
};

const resolveDbDestinationForCompany = async (
  companyId: number,
  whatsappId?: number
): Promise<ConversionDestination | undefined> => {
  const settings = await CompaniesSettings.findOne({ where: { companyId } });

  const datasetWhere: any = { companyId, status: "active" };
  if (whatsappId) datasetWhere.whatsappId = whatsappId;

  const dataset = await FacebookDataset.findOne({
    where: datasetWhere,
    include: [{ model: Whatsapp, as: "whatsapp" }],
    order: [["updatedAt", "DESC"]]
  });

  const companySystemToken = settings?.facebookSystemUserToken;
  const whatsappDatasetToken = dataset?.whatsapp?.tokenMeta;
  const datasetToken = companySystemToken || whatsappDatasetToken;
  const datasetTokenSource = companySystemToken
    ? "companySystemToken"
    : whatsappDatasetToken
      ? "whatsappTokenMeta"
      : "none";

  logger.info(
    `[FB-WEB-CAPI] Revisando destino BD company=${companyId} | whatsappId=${whatsappId || "any"} | dataset=${dataset?.id || "none"} | datasetId=${maskId(dataset?.datasetId)} | tokenSource=${datasetTokenSource} | hasWhatsappToken=${!!whatsappDatasetToken} | hasSystemToken=${!!companySystemToken} | hasAdAccount=${!!settings?.facebookAdAccountId}`
  );

  if (dataset?.datasetId && datasetToken) {
    return {
      destinationId: dataset.datasetId,
      accessToken: datasetToken,
      source: `FacebookDatasets:${dataset.id}:${datasetTokenSource}`
    };
  }

  if (settings?.facebookSystemUserToken) {
    const pixelId = await resolvePixelFromSettings(settings);
    if (pixelId) {
      return {
        destinationId: pixelId,
        accessToken: settings.facebookSystemUserToken,
        source: `CompaniesSettings:${companyId}:adspixels`
      };
    }
  }

  return undefined;
};

export const resolveConversionDestination = async (
  user: WebsiteEventUser,
  context?: WebsiteEventContext
): Promise<ConversionDestination | undefined> => {
  const envPixelId = getPixelId();
  const envAccessToken = getAccessToken();

  if (context?.datasetId && context?.accessToken) {
    return {
      destinationId: context.datasetId,
      accessToken: context.accessToken,
      source: "context"
    };
  }

  const companyIds = await getCandidateCompanyIds(
    user.companyId,
    context?.conversionCompanyId
  );

  logger.info(
    `[FB-WEB-CAPI] Resolviendo destino para event userCompany=${user.companyId || "N/A"} | candidates=${companyIds.join(",") || "none"} | whatsappId=${context?.whatsappId || "any"} | hasEnvPixel=${!!envPixelId} | hasEnvToken=${!!envAccessToken}`
  );

  for (const companyId of companyIds) {
    const destination = await resolveDbDestinationForCompany(companyId, context?.whatsappId);
    if (destination) return destination;
  }

  if (context?.whatsappId) {
    for (const companyId of companyIds) {
      const destination = await resolveDbDestinationForCompany(companyId);
      if (destination) return destination;
    }
  }

  if (envPixelId && envAccessToken) {
    return {
      destinationId: envPixelId,
      accessToken: envAccessToken,
      source: "env"
    };
  }

  return undefined;
};

// [Fase2·B3.1] Normalización E.164 antes del hash — mejora directa de EMQ.
// Antes: `phone.replace(/\D/g,"")` dejaba números locales sin código de país
// (p.ej. "0987654321" en vez de "593987654321") => Meta no podía hacer match => EMQ bajo.
// Ahora: se intenta E.164 real (con + o con país por defecto) y se entregan solo dígitos,
// que es lo que Meta espera (código de país + número, sin '+', sin ceros iniciales).
// Fallback: si no se puede parsear, se conserva el comportamiento anterior (nunca peor).
const DEFAULT_CAPI_COUNTRY = (process.env.META_CAPI_DEFAULT_COUNTRY || "EC") as CountryCode;

const normalizePhone = (phone?: string): string | undefined => {
  if (!phone) return undefined;

  const raw = String(phone).trim();
  try {
    // 1) Tal cual (funciona si trae '+' o código de país explícito).
    let parsed = parsePhoneNumberFromString(raw.startsWith("+") ? raw : `+${raw.replace(/\D/g, "")}`);
    // 2) Si no es válido, reintentar asumiendo el país por defecto (número local).
    if (!parsed?.isValid()) {
      parsed = parsePhoneNumberFromString(raw, DEFAULT_CAPI_COUNTRY);
    }
    if (parsed?.isValid()) {
      return parsed.number.replace(/\D/g, ""); // E.164 sin '+'
    }
  } catch {
    // cae al fallback
  }

  const digits = raw.replace(/\D/g, "");
  return digits || undefined;
};

const hashData = (value?: string | number): string | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  return crypto
    .createHash("sha256")
    .update(String(value).toLowerCase().trim())
    .digest("hex");
};

const parseCookieHeader = (cookieHeader?: string): Record<string, string> => {
  if (!cookieHeader) return {};

  return cookieHeader.split(";").reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rawValue.join("="));
    return acc;
  }, {});
};

const getCookie = (req: Request | undefined, name: string): string | undefined => {
  if (!req) return undefined;
  const reqWithCookies = req as Request & { cookies?: Record<string, string> };
  return reqWithCookies.cookies?.[name] || parseCookieHeader(req.headers.cookie)[name];
};

const getRequestIp = (req?: Request): string | undefined => {
  if (!req) return undefined;
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string") {
    return forwardedFor.split(",")[0]?.trim();
  }
  return req.ip || req.socket.remoteAddress || undefined;
};

const getEventSourceUrl = (context?: WebsiteEventContext): string | undefined => {
  if (context?.eventSourceUrl) return context.eventSourceUrl;

  const req = context?.req;
  const referer = req?.get("referer") || req?.get("referrer");
  if (referer) return referer;

  const origin = req?.get("origin") || process.env.FRONTEND_URL;
  return origin;
};

export const buildUserData = (
  user: WebsiteEventUser,
  context?: WebsiteEventContext
) => {
  const req = context?.req;
  const phone = normalizePhone(user.phone);
  const firstName = user.name?.split(" ")[0];
  const lastName = user.name?.split(" ").slice(1).join(" ");

  const userData: Record<string, any> = {};
  const emailHash = hashData(user.email);
  const phoneHash = hashData(phone);
  const firstNameHash = hashData(firstName);
  const lastNameHash = hashData(lastName);
  const externalIdHash = hashData(user.userId || user.companyId);

  if (emailHash) userData.em = [emailHash];
  if (phoneHash) userData.ph = [phoneHash];
  if (firstNameHash) userData.fn = [firstNameHash];
  if (lastNameHash) userData.ln = [lastNameHash];
  if (externalIdHash) userData.external_id = [externalIdHash];

  const fbc = context?.fbc || getCookie(req, "_fbc");
  const fbp = context?.fbp || getCookie(req, "_fbp");
  const clientIpAddress = context?.clientIpAddress || getRequestIp(req);
  const clientUserAgent = context?.clientUserAgent || req?.get("user-agent");

  if (fbc) userData.fbc = fbc;
  if (fbp) userData.fbp = fbp;
  if (clientIpAddress) userData.client_ip_address = clientIpAddress;
  if (clientUserAgent) userData.client_user_agent = clientUserAgent;

  return userData;
};

export const sendWebsiteConversionEvent = async ({
  eventName,
  eventId,
  user,
  customData = {},
  context
}: SendWebsiteEventData): Promise<void> => {
  logger.info(
    `[FB-WEB-CAPI] Preparando ${eventName} | eventId=${eventId} | userCompany=${user.companyId || "N/A"} | userId=${user.userId || "N/A"} | customKeys=${summarizeObjectKeys(customData)}`
  );

  const policyCompanyId = context?.conversionCompanyId || user.companyId;
  const eventKey = getEventKeyFromMetaEventName(eventName);
  const policy = policyCompanyId
    ? await shouldSendMetaConversion({ companyId: policyCompanyId, eventKey })
    : null;

  if (policy && !policy.enabled) {
    logger.info(
      `[FB-WEB-CAPI] skip policy_disabled event=${eventName} eventKey=${eventKey} ` +
      `company=${policyCompanyId} eventId=${eventId} reason=${policy.reason || "disabled"}`
    );
    return;
  }

  const destination = await resolveConversionDestination(user, context);

  if (!destination) {
    logger.warn(
      `[FB-WEB-CAPI] Evento ${eventName} omitido: no hay Pixel/token env ni destino activo en BD`
    );
    return;
  }

  const readableCustomData = buildReadableWebsiteCustomData(
    eventName,
    customData,
    user,
    policy?.conversionName
  );

  const event = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    action_source: context?.actionSource || (context?.req ? "website" : "system_generated"),
    event_source_url: getEventSourceUrl(context),
    user_data: buildUserData(user, context),
    custom_data: readableCustomData
  };

  try {
    const url = `https://graph.facebook.com/${getApiVersion()}/${destination.destinationId}/events`;

    logger.info(
      `[FB-WEB-CAPI] Enviando ${eventName} | eventId=${eventId} | destination=${maskId(destination.destinationId)} | source=${destination.source} | actionSource=${event.action_source} | sourceUrl=${event.event_source_url || "N/A"} | userDataKeys=${summarizeObjectKeys(event.user_data)} | customKeys=${summarizeObjectKeys(readableCustomData)}`
    );

    const response = await axios.post(
      url,
      {
        data: [event],
        partner_agent: "jrchateam-website-capi/1.0"
      },
      {
        params: { access_token: destination.accessToken },
        timeout: 10000
      }
    );

    logger.info(
      `[FB-WEB-CAPI] Evento ${eventName} enviado | eventId=${eventId} | destination=${maskId(destination.destinationId)} | source=${destination.source} | eventsReceived=${response.data?.events_received || "N/A"} | fbtraceId=${response.data?.fbtrace_id || "N/A"}`
    );
  } catch (error: any) {
    const responseData = error.response?.data || null;
    const metaError = responseData?.error || null;

    logger.error(
      `[FB-WEB-CAPI] Error enviando ${eventName} | eventId=${eventId} | destination=${maskId(destination.destinationId)} | source=${destination.source} | httpStatus=${error.response?.status || "N/A"} | code=${metaError?.code || "N/A"} | subcode=${metaError?.error_subcode || metaError?.subcode || "N/A"} | type=${metaError?.type || "N/A"} | message=${metaError?.message || error.message} | response=${JSON.stringify(responseData)}`
    );
  }
};

export const sendWebsiteConversionEventAsync = (data: SendWebsiteEventData): void => {
  sendWebsiteConversionEvent(data).catch((error: any) => {
    logger.error(`[FB-WEB-CAPI] Error inesperado enviando ${data.eventName}: ${error.message}`);
  });
};

export const buildWebsiteEventUserFromCompany = async (
  company: Company,
  userId?: number | string
): Promise<WebsiteEventUser> => {
  const admin = await User.findOne({
    where: { companyId: company.id, profile: "admin" },
    order: [["createdAt", "ASC"]]
  });

  return {
    userId: userId || admin?.id || company.id,
    companyId: company.id,
    email: admin?.email || company.email,
    phone: company.phone,
    name: admin?.name || company.name
  };
};
