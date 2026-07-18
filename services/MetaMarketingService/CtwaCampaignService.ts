/**
 * [Fase2·D1.1] Crear campana Click-to-WhatsApp end-to-end.
 *
 * Los primitivos genericos (createCampaign/createAdSet/createAd) no bastan: una
 * campana CTWA exige piezas concretas que Meta valida y que, si faltan, producen
 * una campana de trafico normal (dinero gastado en clics que no abren WhatsApp):
 *   - campana : objective OUTCOME_ENGAGEMENT + CBO (presupuesto a nivel campana)
 *   - adset   : destination_type=WHATSAPP + optimization_goal=CONVERSATIONS
 *               + promoted_object.page_id (la pagina con el numero vinculado)
 *   - creativo: object_story_spec.link_data.call_to_action WHATSAPP_MESSAGE
 * Ref: developers.facebook.com/docs/marketing-api/ad-creative/messaging-ads/click-to-whatsapp/
 */
import MetaMarketing from "../../meta-marketing/src";
import AppError from "../../errors/AppError";
import Whatsapp from "../../models/Whatsapp";
import logger from "../../utils/logger";
import { getCompanyMetaConfig } from "./index";

const PREFIX = "[CTWA]";

// El preset del plan (USD 10-15/dia). Fuera de este rango se avisa, no se bloquea:
// el operador manda, pero un dedazo de 1500 no puede pasar en silencio.
export const CTWA_BUDGET_PRESET_USD = { min: 10, max: 15, default: 12 };

export type CtwaCreative = {
  message: string;
  headline?: string;
  description?: string;
  imageHash?: string;
  videoId?: string;
};

export type CtwaCampaignParams = {
  companyId: number;
  name: string;
  dailyBudgetUsd?: number;
  pageId?: string;
  whatsappPhoneNumber?: string;
  countries?: string[];
  ageMin?: number;
  ageMax?: number;
  locales?: number[];
  startTime?: string;
  creative?: CtwaCreative;
  whatsappId?: number;
  /** Arma y devuelve los payloads sin escribir nada en Meta. */
  dryRun?: boolean;
  /** [F3.1] Saltar el gating de aprobación mensual (por defecto se exige). */
  skipApprovalGate?: boolean;
};

export type CtwaCampaignResult = {
  dryRun: boolean;
  campaignId?: string;
  adSetId?: string;
  adId?: string;
  accountId: string;
  accountCurrency?: string;
  budget: { dailyUsd: number; minorUnits: number; withinPreset: boolean };
  warnings: string[];
  payloads: { campaign: any; adSet: any; ad?: any };
};

/** La pagina es obligatoria: sin ella Meta no sabe a que WhatsApp mandar al usuario. */
const resolvePageId = async (companyId: number, provided?: string): Promise<string> => {
  if (provided?.trim()) return provided.trim();

  const pageConn = await Whatsapp.findOne({
    where: { companyId, channel: "facebook" } as any,
    order: [["isDefault", "DESC"], ["id", "ASC"]]
  });
  const pageId = (pageConn as any)?.facebookPageUserId;
  if (!pageId) {
    throw new AppError(
      "ERR_CTWA_NO_PAGE: no hay una pagina de Facebook vinculada. Conecta la pagina " +
      "con el numero de WhatsApp asociado, o indica pageId explicitamente.",
      400
    );
  }
  return String(pageId);
};

const buildBroadTargeting = (params: CtwaCampaignParams) => ({
  geo_locations: { countries: params.countries?.length ? params.countries : ["EC"] },
  age_min: params.ageMin ?? 18,
  age_max: params.ageMax ?? 65,
  ...(params.locales?.length ? { locales: params.locales } : {}),
  // Broad a proposito: 1 adset sin intereses. El algoritmo de Meta rinde mejor con
  // senal de conversion (CAPI) que con segmentacion manual estrecha.
  targeting_automation: { advantage_audience: 1 }
});

export const createCtwaCampaign = async (
  params: CtwaCampaignParams
): Promise<CtwaCampaignResult> => {
  const { companyId, name } = params;
  const warnings: string[] = [];

  if (!name?.trim()) throw new AppError("ERR_CTWA_NAME_REQUIRED", 400);

  // [Fase2·Ola F · F3.1] Gating de aprobación PRIMERO: "no aprobado" es más claro
  // que "sin token". El dry-run y un opt-out explícito lo saltan.
  if (!params.dryRun && !params.skipApprovalGate) {
    const { canLaunch } = await import("../CampaignApprovalService");
    const gate = await canLaunch(companyId);
    if (!gate.allowed) {
      throw new AppError(`ERR_CTWA_NOT_APPROVED: ${gate.reason}`, 409);
    }
  }

  const config = await getCompanyMetaConfig(companyId, params.whatsappId);
  const client = new MetaMarketing({
    accessToken: config.token,
    apiVersion: process.env.FB_GRAPH_VERSION || "v24.0"
  });
  const accountId = config.accountId;

  const pageId = await resolvePageId(companyId, params.pageId);

  const dailyUsd = Number(params.dailyBudgetUsd ?? CTWA_BUDGET_PRESET_USD.default);
  if (!Number.isFinite(dailyUsd) || dailyUsd <= 0) {
    throw new AppError("ERR_CTWA_BUDGET_INVALID: el presupuesto diario debe ser > 0", 400);
  }
  const withinPreset =
    dailyUsd >= CTWA_BUDGET_PRESET_USD.min && dailyUsd <= CTWA_BUDGET_PRESET_USD.max;
  if (!withinPreset) {
    warnings.push(
      `Presupuesto ${dailyUsd}/dia fuera del preset recomendado ` +
      `(${CTWA_BUDGET_PRESET_USD.min}-${CTWA_BUDGET_PRESET_USD.max}).`
    );
  }

  // Meta cobra en unidades menores de la moneda DE LA CUENTA, no en USD. Si la
  // cuenta no es USD, "10" no son 10 dolares: hay que decirlo.
  let accountCurrency: string | undefined;
  try {
    const info = await client.getAccountInfo(accountId);
    accountCurrency = info?.currency;
    if (accountCurrency && accountCurrency !== "USD") {
      warnings.push(
        `La cuenta factura en ${accountCurrency}: el presupuesto se enviara como ` +
        `${dailyUsd} ${accountCurrency}/dia, no ${dailyUsd} USD.`
      );
    }
  } catch (err: any) {
    warnings.push("No se pudo leer la moneda de la cuenta publicitaria.");
  }
  const minorUnits = Math.round(dailyUsd * 100);

  const campaignPayload = {
    name: name.trim(),
    objective: "OUTCOME_ENGAGEMENT",
    status: "PAUSED" as const,
    special_ad_categories: [],
    // CBO: el presupuesto vive en la campana, no en el adset.
    daily_budget: minorUnits,
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    ...(params.startTime ? { start_time: params.startTime } : {})
  };

  const adSetPayload = {
    name: `${name.trim()} · Broad`,
    optimization_goal: "CONVERSATIONS",
    billing_event: "IMPRESSIONS",
    destination_type: "WHATSAPP",
    promoted_object: {
      page_id: pageId,
      ...(params.whatsappPhoneNumber ? { whatsapp_phone_number: params.whatsappPhoneNumber } : {})
    },
    targeting: buildBroadTargeting(params),
    status: "PAUSED" as const,
    ...(params.startTime ? { start_time: params.startTime } : {})
  };

  const adPayload = params.creative
    ? {
        name: `${name.trim()} · Anuncio 1`,
        status: "PAUSED" as const,
        creative: {
          object_story_spec: {
            page_id: pageId,
            link_data: {
              message: params.creative.message,
              ...(params.creative.headline ? { name: params.creative.headline } : {}),
              ...(params.creative.description ? { description: params.creative.description } : {}),
              ...(params.creative.imageHash ? { image_hash: params.creative.imageHash } : {}),
              link: "https://api.whatsapp.com/send",
              call_to_action: {
                type: "WHATSAPP_MESSAGE",
                value: { app_destination: "WHATSAPP" }
              }
            }
          }
        }
      }
    : undefined;

  const base: CtwaCampaignResult = {
    dryRun: !!params.dryRun,
    accountId,
    accountCurrency,
    budget: { dailyUsd, minorUnits, withinPreset },
    warnings,
    payloads: { campaign: campaignPayload, adSet: adSetPayload, ad: adPayload }
  };

  if (params.dryRun) {
    logger.info(`${PREFIX} dry-run company=${companyId} account=${accountId} page=${pageId}`);
    return base;
  }

  // Escritura real. Si falla a mitad, se limpia lo ya creado: media campana en la
  // cuenta del cliente es peor que un error.
  let campaignId: string | undefined;
  let adSetId: string | undefined;
  let adId: string | undefined;

  try {
    const campaign = await client.campaigns.createCampaign(accountId, campaignPayload as any);
    campaignId = String((campaign as any).id);
    logger.info(`${PREFIX} campana creada ${campaignId} (PAUSED) company=${companyId}`);

    const adSet = await client.campaigns.createAdSet(campaignId, adSetPayload as any);
    adSetId = String((adSet as any).id);
    logger.info(`${PREFIX} adset creado ${adSetId} destination_type=WHATSAPP`);

    if (adPayload) {
      const ad = await client.campaigns.createAd(adSetId, adPayload as any);
      adId = String((ad as any).id);
      logger.info(`${PREFIX} anuncio creado ${adId}`);
    }
  } catch (err: any) {
    const metaMsg = err?.response?.data?.error?.message || err?.message || String(err);
    logger.error(`${PREFIX} fallo creando company=${companyId}: ${metaMsg}`);

    // Si el cliente revienta DESPUES del POST (p.ej. parseando la respuesta), el id
    // nunca vuelve y el rollback se quedaria ciego => campana huerfana cobrando en la
    // cuenta del cliente. Por eso, si no hay id, se busca por el nombre exacto.
    let toDelete = campaignId;
    if (!toDelete) {
      try {
        const existing = await client.campaigns.getCampaigns(accountId, { limit: 50 } as any);
        const orphan = (existing || []).find((c: any) => c?.name === campaignPayload.name);
        if (orphan?.id) {
          toDelete = String(orphan.id);
          logger.warn(`${PREFIX} huerfana detectada por nombre: ${toDelete}`);
        }
      } catch (lookupErr: any) {
        logger.error(`${PREFIX} no se pudo buscar huerfanas: ${lookupErr?.message || lookupErr}`);
      }
    }

    if (toDelete) {
      try {
        await client.campaigns.deleteCampaign(toDelete);
        logger.info(`${PREFIX} rollback: campana ${toDelete} eliminada`);
      } catch (rollbackErr: any) {
        logger.error(
          `${PREFIX} rollback FALLIDO de la campana ${toDelete}: ` +
          `${rollbackErr?.message || rollbackErr}. Revisala a mano en Ads Manager.`
        );
      }
    }
    throw new AppError(`ERR_CTWA_CREATE: ${metaMsg}`, 400);
  }

  return { ...base, campaignId, adSetId, adId };
};

export default { createCtwaCampaign, CTWA_BUDGET_PRESET_USD };
