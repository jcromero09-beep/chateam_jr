import axios from "axios";
import { QueryTypes } from "sequelize";
import CompaniesSettings from "../../models/CompaniesSettings";
import Company from "../../models/Company";
import FacebookDataset from "../../models/FacebookDataset";
import Whatsapp from "../../models/Whatsapp";
import sequelize from "../../database";
import logger from "../../utils/logger";
import { getApiVersion } from "./SendWebsiteEvent";
import { getWABAId } from "./FacebookAuthHelper";

const PREFIX = "[MetaSignalMonitor]";
const GRAPH = "https://graph.facebook.com";
const TIMEOUT = 8000;

export type CheckStatus = "ok" | "warn" | "error" | "unknown";

export type SignalCheck = {
  key: "token" | "webhook" | "dataset" | "phone_quality";
  label: string;
  status: CheckStatus;
  detail: string;
  hint?: string;
};

export type DailyPoint = {
  date: string;
  sent: number;
  accepted: number;
  rejected: number;
  pending: number;
};

export type EmqEvent = {
  eventName: string;
  score: number | null;
  weakKeys: string[];
};

export type SignalMonitor = {
  overall: CheckStatus;
  checks: SignalCheck[];
  daily: DailyPoint[];
  totals: { sent: number; accepted: number; rejected: number; pending: number; acceptRate: number | null };
  byEvent: Array<{ eventName: string; sent: number; accepted: number; rejected: number }>;
  emq: { available: boolean; reason?: string; events: EmqEvent[] };
  generatedAt: string;
};

const graphError = (err: any): string => {
  const fb = err?.response?.data?.error;
  if (fb?.message) return `${fb.message}${fb.code ? ` (code ${fb.code})` : ""}`;
  return err?.message || String(err);
};

/**
 * Mismo orden de precedencia que SendConversionEvent: si el monitor mirara otro
 * token del que se usa para enviar, el semaforo mentiria.
 */
const resolveToken = async (
  companyId: number
): Promise<{ token?: string; source?: string; connection?: Whatsapp }> => {
  const settings = await CompaniesSettings.findOne({ where: { companyId } });
  const connection = await Whatsapp.findOne({
    where: { companyId },
    order: [["isDefault", "DESC"], ["id", "ASC"]]
  });

  if (settings?.facebookSystemUserToken) {
    return { token: settings.facebookSystemUserToken, source: "facebookSystemUserToken", connection: connection || undefined };
  }
  if (connection?.tokenMeta) {
    return { token: connection.tokenMeta, source: "conexion.tokenMeta", connection };
  }
  return { connection: connection || undefined };
};

const checkToken = async (companyId: number): Promise<{ check: SignalCheck; token?: string; scopes: string[] }> => {
  const { token, source } = await resolveToken(companyId);

  if (!token) {
    return {
      check: {
        key: "token",
        label: "Token de Meta",
        status: "error",
        detail: "No hay token configurado.",
        hint: "Pega un System User Token en Ajustes > Meta, o conecta un canal."
      },
      scopes: []
    };
  }

  const company = await Company.findByPk(companyId);
  const settings = await CompaniesSettings.findOne({ where: { companyId } });
  const appId = company?.facebookAppId || settings?.facebookAppId;
  const appSecret = company?.facebookAppSecret || settings?.facebookAppSecret;

  // debug_token da scopes y caducidad; sin credenciales de app solo podemos
  // comprobar que el token responde.
  if (appId && appSecret) {
    try {
      const { data } = await axios.get(`${GRAPH}/${getApiVersion()}/debug_token`, {
        params: { input_token: token, access_token: `${appId}|${appSecret}` },
        timeout: TIMEOUT
      });
      const info = data?.data || {};
      const scopes: string[] = info.scopes || [];
      const expiresAt = info.expires_at ? new Date(info.expires_at * 1000) : null;
      const daysLeft = expiresAt ? Math.floor((expiresAt.getTime() - Date.now()) / 86400000) : null;

      if (!info.is_valid) {
        return {
          check: {
            key: "token",
            label: "Token de Meta",
            status: "error",
            detail: `Token invalido (${source}). ${info.error?.message || ""}`.trim(),
            hint: "Regenera el token en Meta Business y vuelve a guardarlo."
          },
          scopes
        };
      }

      // expires_at = 0 significa token permanente (System User).
      const nearExpiry = daysLeft !== null && expiresAt!.getTime() > 0 && daysLeft <= 7;
      return {
        check: {
          key: "token",
          label: "Token de Meta",
          status: nearExpiry ? "warn" : "ok",
          detail: nearExpiry
            ? `Valido (${source}) pero caduca en ${daysLeft} dia(s).`
            : `Valido (${source})${expiresAt && expiresAt.getTime() > 0 ? `, caduca ${expiresAt.toISOString().slice(0, 10)}` : ", sin caducidad"}.`,
          hint: nearExpiry ? "Renuevalo antes de que caduque o se cortaran las conversiones." : undefined
        },
        token,
        scopes
      };
    } catch (err: any) {
      logger.warn(`${PREFIX} debug_token fallo company=${companyId}: ${graphError(err)}`);
    }
  }

  // Sin credenciales de app, un System User Token puede inspeccionarse a si mismo.
  try {
    const { data } = await axios.get(`${GRAPH}/${getApiVersion()}/debug_token`, {
      params: { input_token: token, access_token: token },
      timeout: TIMEOUT
    });
    const info = data?.data || {};
    if (info.is_valid) {
      const scopes: string[] = info.scopes || [];
      const expiresAt = info.expires_at ? new Date(info.expires_at * 1000) : null;
      const daysLeft = expiresAt && expiresAt.getTime() > 0
        ? Math.floor((expiresAt.getTime() - Date.now()) / 86400000)
        : null;
      const nearExpiry = daysLeft !== null && daysLeft <= 7;
      return {
        check: {
          key: "token",
          label: "Token de Meta",
          status: nearExpiry ? "warn" : "ok",
          detail: nearExpiry
            ? `Valido (${source}) pero caduca en ${daysLeft} dia(s).`
            : `Valido (${source})${daysLeft !== null ? `, caduca en ${daysLeft} dia(s)` : ", sin caducidad"}` +
              `${scopes.length ? `. Permisos: ${scopes.length}` : ""}.`,
          hint: nearExpiry ? "Renuevalo antes de que caduque o se cortaran las conversiones." : undefined
        },
        token,
        scopes
      };
    }
  } catch (err: any) {
    logger.warn(`${PREFIX} debug_token self fallo company=${companyId}: ${graphError(err)}`);
  }

  try {
    await axios.get(`${GRAPH}/${getApiVersion()}/me`, { params: { access_token: token }, timeout: TIMEOUT });
    return {
      check: {
        key: "token",
        label: "Token de Meta",
        status: "warn",
        detail: `Responde (${source}), pero no se pudo verificar scopes ni caducidad.`,
        hint: "Configura facebookAppId/AppSecret para el diagnostico completo."
      },
      token,
      scopes: []
    };
  } catch (err: any) {
    return {
      check: {
        key: "token",
        label: "Token de Meta",
        status: "error",
        detail: `Token rechazado por Meta (${source}): ${graphError(err)}`,
        hint: "Regenera el token en Meta Business."
      },
      scopes: []
    };
  }
};

const checkDataset = async (
  companyId: number,
  token?: string
): Promise<{ check: SignalCheck; datasetId?: string }> => {
  const datasets = await FacebookDataset.findAll({ where: { companyId } });

  if (!datasets.length) {
    return {
      check: {
        key: "dataset",
        label: "Dataset / Pixel",
        status: "error",
        detail: "Sin dataset vinculado: las conversiones no salen a Meta.",
        hint: "Usa Sincronizar datasets tras conectar el canal."
      }
    };
  }

  const usable = datasets.filter(d => (d as any).datasetId);
  const primary = usable[0];
  if (!primary) {
    return {
      check: {
        key: "dataset",
        label: "Dataset / Pixel",
        status: "error",
        detail: `${datasets.length} dataset(s) registrados pero ninguno con datasetId.`,
        hint: "Vuelve a sincronizar datasets."
      }
    };
  }

  // Un dataset puede estar guardado y aun asi no ser accesible con este token:
  // eso es indistinguible de "todo bien" sin preguntarle a Meta.
  if (token) {
    try {
      const { data } = await axios.get(`${GRAPH}/${getApiVersion()}/${(primary as any).datasetId}`, {
        params: { access_token: token, fields: "id,name" },
        timeout: TIMEOUT
      });
      return {
        check: {
          key: "dataset",
          label: "Dataset / Pixel",
          status: "ok",
          detail: `${usable.length} dataset(s). Principal: ${data?.name || (primary as any).datasetName || data?.id} (${data?.id}).`
        },
        datasetId: (primary as any).datasetId
      };
    } catch (err: any) {
      return {
        check: {
          key: "dataset",
          label: "Dataset / Pixel",
          status: "error",
          detail: `Dataset ${(primary as any).datasetId} no accesible con el token actual: ${graphError(err)}`,
          hint: "El token no tiene acceso a ese dataset o el dataset se elimino."
        },
        datasetId: (primary as any).datasetId
      };
    }
  }

  return {
    check: {
      key: "dataset",
      label: "Dataset / Pixel",
      status: "warn",
      detail: `${usable.length} dataset(s) registrados, sin token para verificarlos contra Meta.`
    },
    datasetId: (primary as any).datasetId
  };
};

const checkWebhook = async (companyId: number, token?: string): Promise<SignalCheck> => {
  const connections = await Whatsapp.findAll({ where: { companyId } });
  const metaConns = connections.filter(c =>
    ["whatsapp", "meta", "facebook", "instagram"].includes((c as any).channel)
  );

  if (!metaConns.length) {
    return {
      key: "webhook",
      label: "Webhook suscrito",
      status: "warn",
      detail: "No hay canales de Meta conectados.",
      hint: "Sin canal Meta no hay ctwa_clid ni atribucion de anuncios."
    };
  }
  if (!token) {
    return {
      key: "webhook",
      label: "Webhook suscrito",
      status: "unknown",
      detail: "Sin token no se puede consultar la suscripcion."
    };
  }

  const waConn = metaConns.find(c => (c as any).phoneNumberId);
  if (!waConn) {
    return {
      key: "webhook",
      label: "Webhook suscrito",
      status: "warn",
      detail: `${metaConns.length} canal(es) Meta, ninguno con phoneNumberId para verificar la suscripcion.`
    };
  }

  try {
    // Cloud API: la suscripcion vive en el WABA. getWABAId resuelve por varias
    // vias (campo del numero y granular_scopes del debug_token).
    const wabaId = await getWABAId(token, (waConn as any).phoneNumberId);

    if (wabaId) {
      const { data } = await axios.get(`${GRAPH}/${getApiVersion()}/${wabaId}/subscribed_apps`, {
        params: { access_token: token },
        timeout: TIMEOUT
      });
      const apps = data?.data || [];
      return {
        key: "webhook",
        label: "Webhook suscrito",
        status: apps.length ? "ok" : "error",
        detail: apps.length
          ? `${apps.length} app(s) suscrita(s) al WABA ${wabaId}.`
          : `El WABA ${wabaId} no tiene ninguna app suscrita: no llegaran mensajes entrantes.`,
        hint: apps.length ? undefined : "Vuelve a conectar el canal para re-suscribir el webhook."
      };
    }

    // Sin WABA: puede ser un numero ON_PREMISE (no Cloud API) o un token sin
    // whatsapp_business_management. Decirlo, en vez de dar un rojo enganoso.
    let platform: string | undefined;
    try {
      const { data: phone } = await axios.get(`${GRAPH}/${getApiVersion()}/${(waConn as any).phoneNumberId}`, {
        params: { access_token: token, fields: "platform_type" },
        timeout: TIMEOUT
      });
      platform = phone?.platform_type;
    } catch {
      /* el motivo exacto es opcional */
    }

    // Fallback: canales de Pagina (Messenger/Instagram) si suscriben por page.
    const pageConn = metaConns.find(c => (c as any).facebookPageUserId);
    if (pageConn) {
      try {
        const { data } = await axios.get(
          `${GRAPH}/${getApiVersion()}/${(pageConn as any).facebookPageUserId}/subscribed_apps`,
          { params: { access_token: token }, timeout: TIMEOUT }
        );
        const apps = data?.data || [];
        return {
          key: "webhook",
          label: "Webhook suscrito",
          status: apps.length ? "ok" : "error",
          detail: apps.length
            ? `${apps.length} app(s) suscrita(s) a la pagina ${(pageConn as any).facebookPageUserId}.`
            : `La pagina ${(pageConn as any).facebookPageUserId} no tiene apps suscritas.`,
          hint: apps.length ? undefined : "Vuelve a conectar la pagina para re-suscribir el webhook."
        };
      } catch (err: any) {
        logger.warn(`${PREFIX} subscribed_apps de pagina fallo company=${companyId}: ${graphError(err)}`);
      }
    }

    return {
      key: "webhook",
      label: "Webhook suscrito",
      status: "unknown",
      detail:
        platform === "ON_PREMISE"
          ? `El numero es ON_PREMISE (API On-Premise, no Cloud API): Meta no expone la suscripcion por esta via.`
          : "No se pudo resolver el WABA del numero, asi que no se puede verificar la suscripcion.",
      hint:
        platform === "ON_PREMISE"
          ? "No implica fallo: las conversiones CAPI no dependen de esta suscripcion."
          : "Si usas Cloud API, el token necesita el permiso whatsapp_business_management."
    };
  } catch (err: any) {
    return {
      key: "webhook",
      label: "Webhook suscrito",
      status: "warn",
      detail: `No se pudo verificar: ${graphError(err)}`
    };
  }
};

const checkPhoneQuality = async (companyId: number, token?: string): Promise<SignalCheck> => {
  const conn = await Whatsapp.findOne({
    where: { companyId },
    order: [["isDefault", "DESC"], ["id", "ASC"]]
  });
  const phoneNumberId = (conn as any)?.phoneNumberId;

  if (!phoneNumberId) {
    return {
      key: "phone_quality",
      label: "Calidad del numero",
      status: "unknown",
      detail: "Sin numero de WhatsApp Cloud API vinculado."
    };
  }
  if (!token) {
    return { key: "phone_quality", label: "Calidad del numero", status: "unknown", detail: "Sin token para consultar." };
  }

  try {
    const { data } = await axios.get(`${GRAPH}/${getApiVersion()}/${phoneNumberId}`, {
      params: { access_token: token, fields: "quality_rating,display_phone_number,name_status" },
      timeout: TIMEOUT
    });
    const rating = String(data?.quality_rating || "UNKNOWN").toUpperCase();
    const status: CheckStatus = rating === "GREEN" ? "ok" : rating === "YELLOW" ? "warn" : rating === "RED" ? "error" : "unknown";
    return {
      key: "phone_quality",
      label: "Calidad del numero",
      status,
      detail: `${data?.display_phone_number || phoneNumberId}: calidad ${rating}${data?.name_status ? `, nombre ${data.name_status}` : ""}.`,
      hint: status === "error" || status === "warn"
        ? "Calidad baja limita el volumen de mensajes; revisa bloqueos y reportes de usuarios."
        : undefined
    };
  } catch (err: any) {
    return {
      key: "phone_quality",
      label: "Calidad del numero",
      status: "unknown",
      detail: `No se pudo consultar: ${graphError(err)}`
    };
  }
};

const getDailyStats = async (
  companyId: number,
  days: number
): Promise<{ daily: DailyPoint[]; totals: SignalMonitor["totals"]; byEvent: SignalMonitor["byEvent"] }> => {
  const rows: any[] = await sequelize.query(
    `SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS date,
            "eventName",
            "responseStatus",
            COUNT(*)::int AS count
       FROM "FacebookConversionEvents"
      WHERE "companyId" = :companyId
        AND "createdAt" >= NOW() - (:days || ' days')::interval
      GROUP BY 1, 2, 3
      ORDER BY 1 ASC`,
    { replacements: { companyId, days }, type: QueryTypes.SELECT }
  );

  const byDate = new Map<string, DailyPoint>();
  const byEvent = new Map<string, { eventName: string; sent: number; accepted: number; rejected: number }>();
  const totals = { sent: 0, accepted: 0, rejected: 0, pending: 0, acceptRate: null as number | null };

  for (const r of rows) {
    const n = Number(r.count) || 0;
    const st = String(r.responseStatus || "").toLowerCase();
    const accepted = st === "success" || st === "sent" ? n : 0;
    const rejected = st === "failed" ? n : 0;
    const pending = st === "pending" ? n : 0;

    const d = byDate.get(r.date) || { date: r.date, sent: 0, accepted: 0, rejected: 0, pending: 0 };
    d.sent += n;
    d.accepted += accepted;
    d.rejected += rejected;
    d.pending += pending;
    byDate.set(r.date, d);

    const e = byEvent.get(r.eventName) || { eventName: r.eventName || "(sin nombre)", sent: 0, accepted: 0, rejected: 0 };
    e.sent += n;
    e.accepted += accepted;
    e.rejected += rejected;
    byEvent.set(r.eventName, e);

    totals.sent += n;
    totals.accepted += accepted;
    totals.rejected += rejected;
    totals.pending += pending;
  }

  const decided = totals.accepted + totals.rejected;
  totals.acceptRate = decided > 0 ? Math.round((totals.accepted / decided) * 1000) / 10 : null;

  return {
    daily: Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date)),
    totals,
    byEvent: Array.from(byEvent.values()).sort((a, b) => b.sent - a.sent)
  };
};

/**
 * EMQ real reportado por Meta (Dataset Quality API).
 *
 * Ojo: Meta solo calcula EMQ para eventos `web`. Chateam envia la mayoria con
 * action_source=business_messaging, asi que una respuesta vacia NO es un fallo:
 * significa que Meta no puntua ese trafico. Se distingue explicitamente para no
 * mostrar "0/10" donde en realidad no hay dato.
 */
const getEmq = async (
  datasetId?: string,
  token?: string,
  scopes: string[] = []
): Promise<SignalMonitor["emq"]> => {
  if (!datasetId) return { available: false, reason: "Sin dataset vinculado.", events: [] };
  if (!token) return { available: false, reason: "Sin token de Meta.", events: [] };
  if (scopes.length && !scopes.includes("ads_read")) {
    return {
      available: false,
      reason: "El token no tiene el permiso ads_read, requerido por la Dataset Quality API.",
      events: []
    };
  }

  try {
    const { data } = await axios.get(`${GRAPH}/${getApiVersion()}/dataset_quality`, {
      params: {
        dataset_id: datasetId,
        access_token: token,
        fields: "web{event_match_quality{composite_score,match_key_feedback{identifier,coverage{percentage}}},event_name}"
      },
      timeout: TIMEOUT
    });

    const web = data?.web || [];
    if (!Array.isArray(web) || !web.length) {
      return {
        available: false,
        reason:
          "Meta no reporta EMQ para este dataset. Solo puntua eventos web; " +
          "las conversiones de mensajeria (business_messaging) no entran en el calculo.",
        events: []
      };
    }

    const events: EmqEvent[] = web.map((row: any) => {
      const emq = row?.event_match_quality || {};
      const feedback = emq.match_key_feedback || [];
      const weakKeys = feedback
        .filter((f: any) => Number(f?.coverage?.percentage ?? 100) < 50)
        .map((f: any) => String(f.identifier));
      return {
        eventName: row?.event_name || "(sin nombre)",
        score: emq.composite_score !== undefined ? Number(emq.composite_score) : null,
        weakKeys
      };
    });

    return { available: true, events };
  } catch (err: any) {
    return { available: false, reason: `Meta rechazo la consulta: ${graphError(err)}`, events: [] };
  }
};

/**
 * Un "unknown" no degrada el global: hay checks que no aplican al canal (p.ej.
 * la suscripcion de webhook en numeros ON_PREMISE) y pintar todo el semaforo de
 * gris por eso esconderia que lo demas esta bien. Solo es unknown si no se pudo
 * comprobar nada.
 */
const worstStatus = (checks: SignalCheck[]): CheckStatus => {
  if (checks.some(c => c.status === "error")) return "error";
  if (checks.some(c => c.status === "warn")) return "warn";
  if (checks.some(c => c.status === "ok")) return "ok";
  return "unknown";
};

export const getSignalMonitor = async (companyId: number, days = 14): Promise<SignalMonitor> => {
  const safeDays = Number.isFinite(days) && days > 0 && days <= 90 ? Math.floor(days) : 14;

  const { check: tokenCheck, token, scopes } = await checkToken(companyId);
  const [{ check: datasetCheck, datasetId }, webhookCheck, phoneCheck, stats] = await Promise.all([
    checkDataset(companyId, token),
    checkWebhook(companyId, token),
    checkPhoneQuality(companyId, token),
    getDailyStats(companyId, safeDays)
  ]);

  const emq = await getEmq(datasetId, token, scopes);
  const checks = [tokenCheck, datasetCheck, webhookCheck, phoneCheck];

  return {
    overall: worstStatus(checks),
    checks,
    daily: stats.daily,
    totals: stats.totals,
    byEvent: stats.byEvent,
    emq,
    generatedAt: new Date().toISOString()
  };
};

export default { getSignalMonitor };
