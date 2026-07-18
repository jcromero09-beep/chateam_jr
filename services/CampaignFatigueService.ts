/**
 * [Fase2·E5.1] Señales reales de deterioro de campaña.
 *
 * Antes la "fatiga" se deducía de la FRECUENCIA (frequency < 3 = bien). Eso es un
 * proxy pobre: una campaña puede tener frecuencia 1.5 y estar quemada (el público
 * la ignora), o frecuencia 6 y seguir rindiendo. La señal honesta es el
 * comportamiento: **el CTR cae y el coste por conversación sube al mismo tiempo**.
 *
 * También detecta la fase de aprendizaje atascada: Meta necesita ~50 conversiones
 * por semana para salir de aprendizaje; por debajo, la entrega nunca se estabiliza
 * y el coste se dispara sin que el operador sepa por qué.
 */
import { QueryTypes } from "sequelize";
import sequelize from "../database";
import CampaignAlertService from "./CampaignAlertService";
import logger from "../utils/logger";

const PREFIX = "[CampaignFatigue]";

// Umbrales: el aprendizaje de Meta pide ~50 conversiones/semana por conjunto.
export const LEARNING_CONVERSIONS_TARGET = 50;
export const LEARNING_MIN_DAYS = 7;
// Deterioro: -20% CTR y +20% CPA a la vez. Exigir AMBOS evita falsos positivos
// (el CTR solo baja por mil motivos; lo que duele es que ademas suba el coste).
export const CTR_DROP_RATIO = 0.8;
export const CPA_RISE_RATIO = 1.2;
// Sin volumen minimo, dos dias flojos disparan alertas absurdas.
export const MIN_IMPRESSIONS = 1000;

export type CampaignSignal = {
  campaignId: string;
  campaignName: string;
  fatigue: {
    detected: boolean;
    ctrRecent: number;
    ctrBaseline: number;
    ctrDeltaPct: number;
    cpaRecent: number;
    cpaBaseline: number;
    cpaDeltaPct: number;
  };
  learning: {
    stuck: boolean;
    conversions7d: number;
    daysRunning: number;
  };
};

type Row = {
  campaignId: string;
  name: string;
  ctr_recent: number | null;
  ctr_base: number | null;
  cpa_recent: number | null;
  cpa_base: number | null;
  impressions_recent: number | null;
  conv_7d: number | null;
  days_running: number | null;
};

const pct = (from: number, to: number): number =>
  from > 0 ? Math.round(((to - from) / from) * 1000) / 10 : 0;

/**
 * Ventanas: reciente = ultimos 3 dias; base = los 7 anteriores (dias 4-10).
 * Se comparan medias ponderadas por volumen, no medias de medias: un dia con 10
 * impresiones no puede pesar lo mismo que uno con 10.000.
 */
export const analyzeCampaignSignals = async (
  companyId: number
): Promise<CampaignSignal[]> => {
  const rows: Row[] = await sequelize.query(
    `WITH base AS (
       SELECT "campaignId",
              MAX(name) AS name,
              -- CTR ponderado = clicks/impresiones de la ventana
              SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '3 days' THEN clicks ELSE 0 END)::float AS clicks_recent,
              SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '3 days' THEN impressions ELSE 0 END)::float AS imps_recent,
              SUM(CASE WHEN date <  CURRENT_DATE - INTERVAL '3 days'
                        AND date >= CURRENT_DATE - INTERVAL '10 days' THEN clicks ELSE 0 END)::float AS clicks_base,
              SUM(CASE WHEN date <  CURRENT_DATE - INTERVAL '3 days'
                        AND date >= CURRENT_DATE - INTERVAL '10 days' THEN impressions ELSE 0 END)::float AS imps_base,
              -- CPA real = gasto/conversaciones de la ventana
              SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '3 days' THEN spend ELSE 0 END)::float AS spend_recent,
              SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '3 days' THEN "conversationsStarted" ELSE 0 END)::float AS conv_recent,
              SUM(CASE WHEN date <  CURRENT_DATE - INTERVAL '3 days'
                        AND date >= CURRENT_DATE - INTERVAL '10 days' THEN spend ELSE 0 END)::float AS spend_base,
              SUM(CASE WHEN date <  CURRENT_DATE - INTERVAL '3 days'
                        AND date >= CURRENT_DATE - INTERVAL '10 days' THEN "conversationsStarted" ELSE 0 END)::float AS conv_base,
              SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '7 days' THEN "conversationsStarted" ELSE 0 END)::float AS conv_7d,
              COUNT(DISTINCT date) FILTER (WHERE spend > 0) AS days_running
         FROM "InsightsDaily"
        WHERE "companyId" = :companyId
          AND level = 'campaign'
          AND date >= CURRENT_DATE - INTERVAL '10 days'
        GROUP BY "campaignId"
     )
     SELECT "campaignId", name,
            CASE WHEN imps_recent > 0 THEN clicks_recent / imps_recent * 100 END AS ctr_recent,
            CASE WHEN imps_base   > 0 THEN clicks_base   / imps_base   * 100 END AS ctr_base,
            CASE WHEN conv_recent > 0 THEN spend_recent / conv_recent END AS cpa_recent,
            CASE WHEN conv_base   > 0 THEN spend_base   / conv_base   END AS cpa_base,
            imps_recent AS impressions_recent,
            conv_7d,
            days_running
       FROM base`,
    { replacements: { companyId }, type: QueryTypes.SELECT }
  );

  return rows.map(r => {
    const ctrRecent = Number(r.ctr_recent) || 0;
    const ctrBaseline = Number(r.ctr_base) || 0;
    const cpaRecent = Number(r.cpa_recent) || 0;
    const cpaBaseline = Number(r.cpa_base) || 0;
    const imps = Number(r.impressions_recent) || 0;
    const conv7d = Number(r.conv_7d) || 0;
    const daysRunning = Number(r.days_running) || 0;

    // Sin base con la que comparar no hay deterioro que declarar.
    const comparable = ctrBaseline > 0 && cpaBaseline > 0 && imps >= MIN_IMPRESSIONS;
    const fatigueDetected =
      comparable &&
      ctrRecent < ctrBaseline * CTR_DROP_RATIO &&
      cpaRecent > cpaBaseline * CPA_RISE_RATIO;

    const stuck =
      daysRunning >= LEARNING_MIN_DAYS && conv7d < LEARNING_CONVERSIONS_TARGET && conv7d >= 0;

    return {
      campaignId: String(r.campaignId),
      campaignName: r.name || String(r.campaignId),
      fatigue: {
        detected: fatigueDetected,
        ctrRecent, ctrBaseline, ctrDeltaPct: pct(ctrBaseline, ctrRecent),
        cpaRecent, cpaBaseline, cpaDeltaPct: pct(cpaBaseline, cpaRecent)
      },
      learning: { stuck, conversions7d: conv7d, daysRunning }
    };
  });
};

/** Convierte las señales en alertas (dedup lo hace CampaignAlertService). */
export const runFatigueScan = async (companyId: number): Promise<{ signals: CampaignSignal[]; alerts: number }> => {
  const signals = await analyzeCampaignSignals(companyId);
  let alerts = 0;

  for (const s of signals) {
    if (s.fatigue.detected) {
      const created = await CampaignAlertService.createAlert({
        companyId,
        campaignId: s.campaignId,
        campaignName: s.campaignName,
        // El enum de CampaignAlerts ya contempla esto: performance_drop ES una caida
        // de rendimiento. Reusar el valor existente evita una migracion de enum en
        // produccion; el titulo/mensaje aportan el matiz de "creatividad quemada".
        alertType: "performance_drop",
        severity: "warning",
        title: "Creatividad desgastada",
        message:
          `El CTR cayó ${Math.abs(s.fatigue.ctrDeltaPct)}% y el coste por conversación subió ` +
          `${s.fatigue.cpaDeltaPct}% en los últimos 3 días. Renueva el creativo antes de subir presupuesto.`,
        metric: "ctr_cpa",
        currentValue: s.fatigue.ctrRecent,
        thresholdValue: s.fatigue.ctrBaseline,
        metadata: s.fatigue
      });
      if (created) alerts++;
    }

    if (s.learning.stuck) {
      const created = await CampaignAlertService.createAlert({
        companyId,
        campaignId: s.campaignId,
        campaignName: s.campaignName,
        // Idem: el atasco de aprendizaje ES un problema de pocas conversiones.
        alertType: "no_conversions",
        severity: "warning",
        title: "Fase de aprendizaje atascada",
        message:
          `Lleva ${s.learning.daysRunning} días activa con ${s.learning.conversions7d} conversaciones en 7 días ` +
          `(Meta necesita ~${LEARNING_CONVERSIONS_TARGET}). La entrega no se estabiliza: agrupa conjuntos, ` +
          `amplía el público o sube el presupuesto en vez de esperar.`,
        metric: "conversions_7d",
        currentValue: s.learning.conversions7d,
        thresholdValue: LEARNING_CONVERSIONS_TARGET,
        metadata: s.learning
      });
      if (created) alerts++;
    }
  }

  logger.info(`${PREFIX} company=${companyId} campañas=${signals.length} alertas=${alerts}`);
  return { signals, alerts };
};

export default { analyzeCampaignSignals, runFatigueScan };
