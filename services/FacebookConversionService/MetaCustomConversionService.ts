/**
 * MetaCustomConversionService
 *
 * Crea / reusa / sincroniza una "custom conversion" de Meta para una etiqueta
 * Kanban. Una custom conversion es una DEFINICIÓN en la cuenta publicitaria que
 * mapea (event_source_id + custom_event_type + rule) → conversión optimizable.
 * NO es el evento CAPI: el evento se envía al caer el ticket en la etapa
 * (ver KanbanCustomConversionDispatchService) y Meta lo cuenta si hace match
 * con la `rule` de esta custom conversion.
 *
 * Reglas:
 *  - adAccountId y token se resuelven por company (MetaMarketingService).
 *  - event_source_id se resuelve automáticamente desde el dataset/pixel
 *    configurado de la company. NUNCA se pide manual al frontend.
 *  - Se busca una custom conversion existente por (event_source_id + rule).
 *    Si existe → se reusa su ID. Si no → se crea.
 *  - Errores de Meta NUNCA rompen el guardado del tag: se persiste
 *    metaConversionStatus="failed" + metaLastError.
 *  - No expone tokens al frontend ni los loguea.
 */

import axios from "axios";
import Tag from "../../models/Tag";
import FacebookDataset from "../../models/FacebookDataset";
import { getCompanyMetaConfig } from "../MetaMarketingService";
import { getApiVersion } from "./SendWebsiteEvent";
import logger from "../../utils/logger";

const PREFIX = "[META-CUSTOMCONV]";

export type CustomEventType =
  | "ADD_PAYMENT_INFO"
  | "ADD_TO_CART"
  | "ADD_TO_WISHLIST"
  | "COMPLETE_REGISTRATION"
  | "CONTACT"
  | "CUSTOMIZE_PRODUCT"
  | "DONATE"
  | "FIND_LOCATION"
  | "INITIATE_CHECKOUT"
  | "LEAD"
  | "PURCHASE"
  | "SCHEDULE"
  | "SEARCH"
  | "START_TRIAL"
  | "SUBMIT_APPLICATION"
  | "SUBSCRIBE"
  | "VIEW_CONTENT"
  | "OTHER";

const VALID_CUSTOM_EVENT_TYPES = new Set<string>([
  "ADD_PAYMENT_INFO", "ADD_TO_CART", "ADD_TO_WISHLIST", "COMPLETE_REGISTRATION",
  "CONTACT", "CUSTOMIZE_PRODUCT", "DONATE", "FIND_LOCATION", "INITIATE_CHECKOUT",
  "LEAD", "PURCHASE", "SCHEDULE", "SEARCH", "START_TRIAL", "SUBMIT_APPLICATION",
  "SUBSCRIBE", "VIEW_CONTENT", "OTHER"
]);

export interface SyncResult {
  ok: boolean;
  status: "synced" | "failed" | "disabled" | "skipped";
  customConversionId?: string | null;
  reused?: boolean;
  error?: string;
}

const maskId = (value?: string | number | null): string => {
  if (value === undefined || value === null || value === "") return "N/A";
  const raw = String(value);
  if (raw.length <= 8) return raw;
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
};

/** Normaliza un valor de regla (objeto o string JSON) a string canónico para comparar. */
export const normalizeRule = (rule: unknown): string => {
  let obj: any = rule;
  if (typeof rule === "string") {
    try {
      obj = JSON.parse(rule);
    } catch {
      return (rule || "").replace(/\s+/g, "");
    }
  }
  const sortKeys = (value: any): any => {
    if (Array.isArray(value)) {
      return value
        .map(sortKeys)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }
    if (value && typeof value === "object") {
      return Object.keys(value)
        .sort()
        .reduce((acc: any, k) => {
          acc[k] = sortKeys(value[k]);
          return acc;
        }, {});
    }
    return value;
  };
  try {
    return JSON.stringify(sortKeys(obj));
  } catch {
    return "";
  }
};

const sanitizeCustomEventType = (value?: string | null): CustomEventType => {
  const upper = (value || "").toUpperCase().trim();
  return (VALID_CUSTOM_EVENT_TYPES.has(upper) ? upper : "OTHER") as CustomEventType;
};

const getCustomConversionRuleEventName = (eventName: string): string =>
  eventName === "LeadSubmitted" ? "Lead" : eventName;

const normalizeRuleForCustomConversion = (ruleObj: any, eventName: string): any => {
  const ruleEventName = getCustomConversionRuleEventName(eventName);
  if (ruleEventName === eventName) return ruleObj;

  const clone = JSON.parse(JSON.stringify(ruleObj));
  const visit = (node: any): void => {
    if (!node || typeof node !== "object") return;
    if (node.event && typeof node.event === "object" && node.event.eq === eventName) {
      node.event.eq = ruleEventName;
    }
    Object.values(node).forEach(visit);
  };
  visit(clone);
  return clone;
};

/**
 * Resuelve el event_source_id (dataset/pixel) de la company SIN pedirlo al
 * frontend. Prioriza FacebookDataset activo; cae a primer adspixel de la cuenta.
 */
const resolveEventSourceId = async (
  companyId: number,
  adAccountId: string,
  token: string,
  apiVersion: string
): Promise<string | undefined> => {
  const dataset = await FacebookDataset.findOne({
    where: { companyId, status: "active" },
    order: [["updatedAt", "DESC"]]
  });
  if (dataset?.datasetId) return dataset.datasetId;

  // Fallback: primer pixel de la cuenta publicitaria.
  try {
    const acct = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
    const resp = await axios.get(
      `https://graph.facebook.com/${apiVersion}/${acct}/adspixels`,
      { params: { fields: "id", limit: 1, access_token: token }, timeout: 10000 }
    );
    return resp.data?.data?.[0]?.id;
  } catch (err: any) {
    logger.warn(`${PREFIX} no se pudo resolver pixel de la cuenta company=${companyId}: ${err?.message || err}`);
    return undefined;
  }
};

/**
 * Sincroniza la custom conversion para una etiqueta. Mutará el Tag con el
 * resultado (metaCustomConversionId / metaConversionStatus / metaLastSyncAt /
 * metaLastError). Nunca lanza: devuelve SyncResult.
 */
export const syncCustomConversionForTag = async (
  tag: Tag,
  whatsappId?: number
): Promise<SyncResult> => {
  const companyId = tag.companyId;

  // Check apagado → no se sincroniza nada.
  if (!tag.sendMetaConversion) {
    await tag
      .update({ metaConversionStatus: "disabled", metaLastError: null } as any)
      .catch(() => undefined);
    return { ok: true, status: "disabled" };
  }

  // Validaciones mínimas de config.
  const eventName = (tag.metaEventName || "").trim();
  const rule = (tag.metaRule || "").trim();
  if (!eventName || !rule) {
    const error = "Config incompleta: faltan metaEventName y/o metaRule";
    await tag
      .update({ metaConversionStatus: "failed", metaLastError: error } as any)
      .catch(() => undefined);
    return { ok: false, status: "failed", error };
  }

  let ruleObj: any;
  try {
    ruleObj = JSON.parse(rule);
  } catch {
    const error = "metaRule no es JSON válido";
    await tag
      .update({ metaConversionStatus: "failed", metaLastError: error } as any)
      .catch(() => undefined);
    return { ok: false, status: "failed", error };
  }

  const apiVersion = getApiVersion();

  try {
    // 1) Resolver credenciales de la company.
    const config = await getCompanyMetaConfig(companyId, whatsappId);
    const acct = config.accountId.startsWith("act_")
      ? config.accountId
      : `act_${config.accountId}`;
    const token = config.token;

    // 2) Resolver event_source_id automáticamente.
    const eventSourceId = await resolveEventSourceId(
      companyId,
      config.accountId,
      token,
      apiVersion
    );
    if (!eventSourceId) {
      const error = "No se encontró dataset/pixel (event_source_id) para la company";
      await tag
        .update({ metaConversionStatus: "failed", metaLastError: error } as any)
        .catch(() => undefined);
      return { ok: false, status: "failed", error };
    }

    const customEventType = sanitizeCustomEventType(tag.metaCustomEventType);
    const name =
      (tag.metaConversionName || "").trim() ||
      `Kanban ${tag.name || tag.key || eventName}`;
    const metaRuleObj = normalizeRuleForCustomConversion(ruleObj, eventName);
    const metaRuleString = JSON.stringify(metaRuleObj);
    const targetRule = normalizeRule(metaRuleObj);

    // 3) Buscar custom conversion existente por (event_source_id + rule).
    let existingId: string | null = null;
    try {
      const listResp = await axios.get(
        `https://graph.facebook.com/${apiVersion}/${acct}/customconversions`,
        {
          params: {
            fields: "id,name,rule,custom_event_type,event_source_id",
            limit: 200,
            access_token: token
          },
          timeout: 15000
        }
      );
      const list: any[] = listResp.data?.data || [];
      const match = list.find(cc => {
        const ccSource =
          cc.event_source_id ||
          cc.pixel?.id ||
          (Array.isArray(cc.event_sources) ? cc.event_sources[0]?.id : undefined);
        const sameSource = !ccSource || String(ccSource) === String(eventSourceId);
        return sameSource && normalizeRule(cc.rule) === targetRule;
      });
      if (match?.id) existingId = String(match.id);
    } catch (err: any) {
      // Si el listado falla seguimos a crear; el create dará el error real.
      logger.warn(`${PREFIX} listado de customconversions falló company=${companyId}: ${err?.response?.data?.error?.message || err?.message}`);
    }

    let customConversionId = existingId;
    let reused = !!existingId;

    // 4) Crear si no existe.
    if (!customConversionId) {
      const createResp = await axios.post(
        `https://graph.facebook.com/${apiVersion}/${acct}/customconversions`,
        {
          name,
          event_source_id: eventSourceId,
          custom_event_type: customEventType,
          rule: metaRuleString
        },
        { params: { access_token: token }, timeout: 15000 }
      );
      customConversionId = createResp.data?.id ? String(createResp.data.id) : null;
      reused = false;
      if (!customConversionId) {
        throw new Error("Meta no devolvió id de custom conversion");
      }
    }

    await tag.update({
      metaCustomConversionId: customConversionId,
      metaConversionName: name,
      metaCustomEventType: customEventType,
      metaRule: metaRuleString,
      metaConversionStatus: "synced",
      metaLastSyncAt: new Date(),
      metaLastError: null
    } as any);

    logger.info(
      `${PREFIX} ${reused ? "reusada" : "creada"} custom conversion company=${companyId} tag=${tag.id} ` +
      `id=${maskId(customConversionId)} eventSource=${maskId(eventSourceId)} type=${customEventType}`
    );

    return { ok: true, status: "synced", customConversionId, reused };
  } catch (err: any) {
    const metaError = err?.response?.data?.error;
    const errMessage =
      metaError?.error_user_msg ||
      metaError?.message ||
      err?.message ||
      "Error desconocido sincronizando custom conversion";

    await tag
      .update({
        metaConversionStatus: "failed",
        metaLastError: String(errMessage).slice(0, 1000),
        metaLastSyncAt: new Date()
      } as any)
      .catch(() => undefined);

    logger.error(
      `${PREFIX} error company=${companyId} tag=${tag.id}: ${errMessage} ` +
      `(code=${metaError?.code || "N/A"} subcode=${metaError?.error_subcode || "N/A"})`
    );

    return { ok: false, status: "failed", error: String(errMessage) };
  }
};

export default { syncCustomConversionForTag, normalizeRule };
