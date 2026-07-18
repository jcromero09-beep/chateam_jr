/**
 * [Fase2·D3.1] Graduar ganadores a una campaña de escalado.
 *
 * Cuando un anuncio funciona, subirle el presupuesto en su propia campaña reinicia
 * el aprendizaje (ver D4.1) y suele romper lo que iba bien. La practica correcta es
 * CLONAR al ganador en una campaña nueva de escalado con mas presupuesto, dejando
 * la original intacta. Aqui se clona la config real del ganador (targeting,
 * promoted_object, optimization, destination_type) y se REFERENCIA el mismo creativo
 * por id, en vez de reconstruirlo.
 *
 * La campaña de escalado nace SIEMPRE en PAUSED: lanzar es decision del operador.
 */
import MetaMarketing from "../../meta-marketing/src";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import { getCompanyMetaConfig } from "./index";

const PREFIX = "[Graduate]";

// Un ganador necesita señal suficiente: sin un minimo de conversaciones, un CPA
// bajo puede ser suerte de dos dias.
export const MIN_CONVERSIONS_TO_GRADUATE = 15;
export const DEFAULT_SCALE_MULTIPLIER = 2; // duplicar presupuesto al escalar

export type WinnerCandidate = {
  campaignId: string;
  campaignName: string;
  conversations: number;
  spend: number;
  cpa: number;
  ctr: number;
  eligible: boolean;
};

const buildClient = async (companyId: number, whatsappId?: number) => {
  const config = await getCompanyMetaConfig(companyId, whatsappId);
  const client = new MetaMarketing({
    accessToken: config.token,
    apiVersion: process.env.FB_GRAPH_VERSION || "v24.0"
  });
  return { client, accountId: config.accountId };
};

/**
 * Ranking de candidatos a escalar por CPA (gasto/conversaciones) sobre los ultimos
 * 14 dias. Solo son elegibles los que superan el minimo de conversaciones.
 */
export const identifyWinners = async (companyId: number): Promise<WinnerCandidate[]> => {
  const rows: any[] = await sequelize.query(
    `SELECT "campaignId",
            MAX(name) AS name,
            SUM("conversationsStarted")::float AS conversations,
            SUM(spend)::float AS spend,
            SUM(clicks)::float AS clicks,
            SUM(impressions)::float AS impressions
       FROM "InsightsDaily"
      WHERE "companyId" = :companyId
        AND level = 'campaign'
        AND date >= CURRENT_DATE - INTERVAL '14 days'
      GROUP BY "campaignId"
      HAVING SUM("conversationsStarted") > 0
      ORDER BY (SUM(spend) / NULLIF(SUM("conversationsStarted"), 0)) ASC`,
    { replacements: { companyId }, type: QueryTypes.SELECT }
  );

  return rows.map(r => {
    const conversations = Number(r.conversations) || 0;
    const spend = Number(r.spend) || 0;
    const impressions = Number(r.impressions) || 0;
    const clicks = Number(r.clicks) || 0;
    return {
      campaignId: String(r.campaignId),
      campaignName: r.name || String(r.campaignId),
      conversations,
      spend,
      cpa: conversations > 0 ? Math.round((spend / conversations) * 100) / 100 : 0,
      ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
      eligible: conversations >= MIN_CONVERSIONS_TO_GRADUATE
    };
  });
};

export type GraduateResult = {
  dryRun: boolean;
  sourceCampaignId: string;
  scaledCampaignId?: string;
  scaledAdSetIds: string[];
  scaledAdIds: string[];
  scaleBudgetUsd: number;
  accountId: string;
  warnings: string[];
};

const minorUnits = (usd: number) => Math.round(usd * 100);

/**
 * Clona una campaña ganadora a una de escalado. No se toca el ganador original.
 */
export const graduateWinner = async (params: {
  companyId: number;
  sourceCampaignId: string;
  scaleBudgetUsd?: number;
  scaleMultiplier?: number;
  whatsappId?: number;
  dryRun?: boolean;
}): Promise<GraduateResult> => {
  const { companyId, sourceCampaignId } = params;
  const warnings: string[] = [];
  const { client, accountId } = await buildClient(companyId, params.whatsappId);

  const source = await client.campaigns.getCampaign(sourceCampaignId);
  if (!source?.id) throw new AppError("ERR_GRADUATE_SOURCE_NOT_FOUND", 404);

  const sourceAdSets = await client.campaigns.getAdSetsByCampaign(sourceCampaignId);
  if (!sourceAdSets?.length) {
    throw new AppError("ERR_GRADUATE_NO_ADSETS: la campaña origen no tiene conjuntos", 400);
  }

  // Presupuesto de escalado: explicito, o multiplo del de la campaña origen.
  const sourceBudgetUsd = Number(source.daily_budget) ? Number(source.daily_budget) / 100 : undefined;
  const mult = params.scaleMultiplier || DEFAULT_SCALE_MULTIPLIER;
  const scaleBudgetUsd =
    params.scaleBudgetUsd ??
    (sourceBudgetUsd ? Math.round(sourceBudgetUsd * mult) : 25);

  const scaledName = `⬆️ Escalado · ${source.name}`.slice(0, 200);

  const campaignPayload = {
    name: scaledName,
    objective: source.objective,
    status: "PAUSED" as const,
    special_ad_categories: [],
    daily_budget: minorUnits(scaleBudgetUsd),
    bid_strategy: (source as any).bid_strategy || "LOWEST_COST_WITHOUT_CAP"
  };

  const result: GraduateResult = {
    dryRun: !!params.dryRun,
    sourceCampaignId,
    scaledAdSetIds: [],
    scaledAdIds: [],
    scaleBudgetUsd,
    accountId,
    warnings
  };

  if (params.dryRun) {
    logger.info(`${PREFIX} dry-run company=${companyId} source=${sourceCampaignId} budget=${scaleBudgetUsd}`);
    return result;
  }

  let scaledCampaignId: string | undefined;
  try {
    const campaign = await client.campaigns.createCampaign(accountId, campaignPayload as any);
    scaledCampaignId = String((campaign as any).id);
    result.scaledCampaignId = scaledCampaignId;
    logger.info(`${PREFIX} campaña escalado creada ${scaledCampaignId} (PAUSED)`);

    for (const src of sourceAdSets) {
      // Clonar el conjunto tal cual (mismo publico, mismo destino WhatsApp).
      const adSetPayload: any = {
        name: `${(src as any).name} · escalado`.slice(0, 200),
        optimization_goal: (src as any).optimization_goal,
        billing_event: (src as any).billing_event,
        targeting: (src as any).targeting,
        status: "PAUSED" as const,
        ...((src as any).destination_type ? { destination_type: (src as any).destination_type } : {}),
        ...((src as any).promoted_object ? { promoted_object: (src as any).promoted_object } : {})
      };
      const newAdSet = await client.campaigns.createAdSet(scaledCampaignId, adSetPayload);
      const newAdSetId = String((newAdSet as any).id);
      result.scaledAdSetIds.push(newAdSetId);

      // Reusar los creativos del conjunto ganador por id (no reconstruir).
      const ads = await client.campaigns.getAdsByAdSet((src as any).id);
      for (const ad of ads || []) {
        const creativeId = (ad as any).creative?.id;
        if (!creativeId) {
          warnings.push(`El anuncio ${(ad as any).id} no expone creative_id; se omitió.`);
          continue;
        }
        const newAd = await client.campaigns.createAd(newAdSetId, {
          name: `${(ad as any).name || "Anuncio"} · escalado`.slice(0, 200),
          status: "PAUSED",
          creative: { creative_id: creativeId } as any
        });
        result.scaledAdIds.push(String((newAd as any).id));
      }
    }
  } catch (err: any) {
    const metaMsg = err?.response?.data?.error?.message || err?.message || String(err);
    logger.error(`${PREFIX} fallo graduando company=${companyId}: ${metaMsg}`);
    // Rollback: media campaña de escalado es peor que ninguna.
    if (scaledCampaignId) {
      try {
        await client.campaigns.deleteCampaign(scaledCampaignId);
        logger.info(`${PREFIX} rollback: campaña ${scaledCampaignId} eliminada`);
      } catch (rb: any) {
        logger.error(`${PREFIX} rollback FALLIDO ${scaledCampaignId}: ${rb?.message || rb}. Revisar a mano.`);
      }
    }
    throw new AppError(`ERR_GRADUATE: ${metaMsg}`, 400);
  }

  logger.info(
    `${PREFIX} graduado company=${companyId} source=${sourceCampaignId} -> ${scaledCampaignId} ` +
    `adsets=${result.scaledAdSetIds.length} ads=${result.scaledAdIds.length}`
  );
  return result;
};

export default { identifyWinners, graduateWinner };
