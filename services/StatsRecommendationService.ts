/**
 * [Fase2·Ola D] Orquestador del motor estadístico.
 *
 * Corre los análisis de forma cerrada (StatisticsService) sobre datos reales y
 * PERSISTE cada resultado en recommendation_runs con: método + métricas
 * (prob/IC/p-valor) + supuesto (explicabilidad NFR) + si había datos suficientes.
 * Lo invoca el job nocturno y el endpoint manual.
 *
 * Criterio de la ola: ninguna recomendación sin n mínimo; por debajo se registra
 * igualmente pero con sufficientData=false y el n que falta (para que el panel
 * muestre "datos insuficientes" en vez de un número inventado).
 */
import { QueryTypes } from "sequelize";
import sequelize from "../database";
import RecommendationRun from "../models/RecommendationRun";
import Stats from "./StatisticsService";
import { getRoasByCampaign } from "./MetaMarketingService/RoasService";
import logger from "../utils/logger";

const PREFIX = "[StatsEngine]";

type Draft = {
  kind: string;
  method: string;
  targetType?: string;
  targetId?: string;
  recommendation: string;
  metrics?: any;
  assumption?: string;
  sufficientData: boolean;
};

/** [G4] IC 95% del CPA por campaña → recomendación EMV (escalar / vigilar / insuficiente). */
const analyzeCpaConfidence = async (companyId: number): Promise<Draft[]> => {
  const { rows } = await getRoasByCampaign({ companyId });
  const drafts: Draft[] = [];
  for (const r of rows) {
    if (r.dataStatus !== "ok" || !r.cpa) continue;
    const ci = r.cpaConfidence;
    if (!ci) continue;
    if (!ci.sufficient) {
      drafts.push({
        kind: "cpa_confidence", method: "IC 95% ratio (delta)", targetType: "campaign", targetId: r.campaignId,
        recommendation: `CPA de ${r.campaignName || r.campaignId}: datos insuficientes para decidir (faltan ${ci.nNeed! - r.conversions} conversiones).`,
        metrics: { cpa: r.cpa, conversions: r.conversions, nNeed: ci.nNeed },
        assumption: "Se necesitan ≥30 conversiones para un IC 95% fiable del CPA.",
        sufficientData: false
      });
      continue;
    }
    // EMV simple: si el techo del IC sigue siendo rentable, escalar; si el suelo ya es caro, vigilar.
    const wide = ci.margin > r.cpa * 0.5;
    drafts.push({
      kind: "cpa_confidence", method: "IC 95% ratio (delta)", targetType: "campaign", targetId: r.campaignId,
      recommendation: wide
        ? `CPA de ${r.campaignName || r.campaignId} = $${r.cpa} pero con IC ancho [$${ci.low}, $${ci.high}]: aún volátil, no subir presupuesto todavía.`
        : `CPA de ${r.campaignName || r.campaignId} = $${r.cpa} estable (IC 95% [$${ci.low}, $${ci.high}]): candidato a escalar.`,
      metrics: { cpa: r.cpa, ciLow: ci.low, ciHigh: ci.high, margin: ci.margin, conversions: r.conversions },
      assumption: "CPA = gasto/conversiones; IC por método delta sobre la media.",
      sufficientData: true
    });
  }
  return drafts;
};

/** [G3] Demanda de chat Poisson (λ/hora) + prob. de superar capacidad de agentes. */
const analyzeChatDemand = async (companyId: number): Promise<Draft[]> => {
  const rows = await sequelize.query<any>(
    `SELECT COUNT(*)::int AS events,
            COUNT(DISTINCT date_trunc('hour', "createdAt"))::int AS hours
       FROM "Tickets"
      WHERE "companyId" = :companyId
        AND "createdAt" >= now() - interval '14 days'`,
    { replacements: { companyId }, type: QueryTypes.SELECT }
  );
  const events = Number(rows[0]?.events) || 0;
  const hours = Number(rows[0]?.hours) || 0;

  // Agentes online como proxy de capacidad concurrente por hora.
  const agents = await sequelize.query<any>(
    `SELECT COUNT(*)::int AS n FROM "Users" WHERE "companyId" = :companyId`,
    { replacements: { companyId }, type: QueryTypes.SELECT }
  );
  const capacity = Math.max(1, Number(agents[0]?.n) || 1);

  const p = Stats.poissonForecast(events, hours, capacity);
  if (!("sufficient" in p) || !p.sufficient) {
    const r = p as any;
    return [{
      kind: "chat_demand", method: "Poisson λ/hora", targetType: "global",
      recommendation: `Demanda de chat: datos insuficientes (${r.nHave}h de histórico, se necesitan ${r.nNeed}h).`,
      metrics: { hours, events, nNeed: r.nNeed }, assumption: "λ estable requiere ≥24h de histórico.", sufficientData: false
    }];
  }
  const prob = (p as any).probExceedCapacity;
  return [{
    kind: "chat_demand", method: "Poisson λ/hora", targetType: "global",
    recommendation: prob > 0.2
      ? `Riesgo de saturación: λ≈${(p as any).lambda.toFixed(1)} chats/h con ${capacity} agentes ⇒ ${(prob * 100).toFixed(0)}% de superar capacidad. Refuerza turnos en horas pico.`
      : `Capacidad holgada: λ≈${(p as any).lambda.toFixed(1)} chats/h, solo ${(prob * 100).toFixed(0)}% de superar ${capacity} agentes.`,
    metrics: { lambda: (p as any).lambda, capacity, probExceedCapacity: prob, ciLow: p.low, ciHigh: p.high },
    assumption: "Llegadas de chat ~ Poisson; capacidad = nº de agentes de la empresa.",
    sufficientData: true
  }];
};

/** [G1] Scoring bayesiano de conversión por origen (Beta-Binomial). Insuficiente si no hay conversiones. */
const analyzeLeadScoring = async (companyId: number): Promise<Draft[]> => {
  const rows = await sequelize.query<any>(
    `SELECT COALESCE(cm."campaignName", 'sin origen') AS source,
            COUNT(DISTINCT cm.id)::int AS trials,
            COUNT(DISTINCT ac.id)::int AS successes
       FROM "CampaignMessages" cm
       LEFT JOIN "AttributionConversions" ac
              ON ac."ticketId" = cm."ticketId" AND ac."companyId" = cm."companyId"
      WHERE cm."companyId" = :companyId
      GROUP BY 1
      HAVING COUNT(DISTINCT cm.id) > 0`,
    { replacements: { companyId }, type: QueryTypes.SELECT }
  );
  if (!rows.length) {
    return [{
      kind: "lead_scoring", method: "Beta-Binomial", targetType: "global",
      recommendation: "Scoring de leads: aún no hay leads con origen para modelar.",
      metrics: {}, assumption: "Se necesita histórico de leads con conversión atribuida.", sufficientData: false
    }];
  }
  const drafts: Draft[] = [];
  for (const r of rows) {
    const trials = Number(r.trials) || 0, successes = Number(r.successes) || 0;
    const bb = Stats.betaBinomialScore(successes, trials);
    const enough = trials >= 30;
    drafts.push({
      kind: "lead_scoring", method: "Beta-Binomial", targetType: "segment", targetId: r.source,
      recommendation: enough
        ? `Origen "${r.source}": P(compra)≈${bb.score}% [${bb.low}-${bb.high}] sobre ${trials} leads. ${bb.score >= 50 ? "Prioriza estos leads." : "Baja prioridad."}`
        : `Origen "${r.source}": ${successes}/${trials} conversiones — muestra pequeña, score ${bb.score}% aún poco fiable.`,
      metrics: { score: bb.score, low: bb.low, high: bb.high, trials, successes },
      assumption: "P(compra) posterior Beta-Binomial con prior uniforme (1,1).",
      sufficientData: enough
    });
  }
  return drafts;
};

/** [G8] Pronóstico mensual del gasto por suavización exponencial (escenarios). */
const analyzeSpendForecast = async (companyId: number): Promise<Draft[]> => {
  const rows = await sequelize.query<any>(
    `SELECT to_char(date, 'YYYY-MM-DD') AS d, SUM(spend)::float AS spend
       FROM "InsightsDaily"
      WHERE "companyId" = :companyId AND level = 'campaign'
      GROUP BY 1 ORDER BY 1 ASC`,
    { replacements: { companyId }, type: QueryTypes.SELECT }
  );
  const series = rows.map(r => Number(r.spend) || 0);
  const fc = Stats.forecastExponential(series, 1);
  if (!fc.sufficient) {
    return [{ kind: "spend_forecast", method: "Suavización exponencial (Holt)", targetType: "global",
      recommendation: `Pronóstico de gasto: datos insuficientes (${series.length} días, se necesitan 3).`,
      metrics: { days: series.length }, assumption: "Holt nivel+tendencia sobre gasto diario.", sufficientData: false }];
  }
  return [{ kind: "spend_forecast", method: "Suavización exponencial (Holt)", targetType: "global",
    recommendation: `Gasto próximo período ≈ $${fc.base} (pesimista $${fc.pessimistic} / optimista $${fc.optimistic}). Tendencia ${fc.trend >= 0 ? "al alza" : "a la baja"}.`,
    metrics: { base: fc.base, pessimistic: fc.pessimistic, optimistic: fc.optimistic, trend: fc.trend },
    assumption: "Holt (nivel+tendencia); banda ±1.28σ del error (~80%).", sufficientData: true }];
};

/** [G7] Regresión: drivers del CPA (CTR, frecuencia → CPA por campaña-día). */
const analyzeRoasDrivers = async (companyId: number): Promise<Draft[]> => {
  const rows = await sequelize.query<any>(
    `SELECT ctr::float AS ctr, frequency::float AS frequency,
            CASE WHEN "conversationsStarted" > 0 THEN spend / "conversationsStarted" ELSE NULL END AS cpa
       FROM "InsightsDaily"
      WHERE "companyId" = :companyId AND level = 'campaign'
        AND spend > 0 AND "conversationsStarted" > 0`,
    { replacements: { companyId }, type: QueryTypes.SELECT }
  );
  const clean = rows.filter(r => r.cpa != null && Number.isFinite(Number(r.ctr)) && Number.isFinite(Number(r.frequency)));
  const X = clean.map(r => [Number(r.ctr), Number(r.frequency)]);
  const y = clean.map(r => Number(r.cpa));
  const reg = Stats.linearRegression(X, y);
  if (!reg.sufficient) {
    return [{ kind: "roas_drivers", method: "Regresión OLS", targetType: "global",
      recommendation: `Drivers del CPA: datos insuficientes (${y.length} obs, se necesitan 20).`,
      metrics: { n: y.length }, assumption: "OLS CPA ~ CTR + frecuencia.", sufficientData: false }];
  }
  const sig = reg.coefficients.filter(c => c.name !== "intercepto" && c.significant);
  const names: Record<string, string> = { x1: "CTR", x2: "frecuencia" };
  return [{ kind: "roas_drivers", method: "Regresión OLS", targetType: "global",
    recommendation: sig.length
      ? `Drivers del CPA (R²=${reg.r2}): ${sig.map(c => `${names[c.name] || c.name} (β=${c.beta}, p=${c.pValue})`).join(", ")} son significativos.`
      : `Ningún driver del CPA resultó significativo (R²=${reg.r2}) con los datos actuales.`,
    metrics: { r2: reg.r2, n: reg.n, coefficients: reg.coefficients }, assumption: "OLS CPA ~ CTR + frecuencia; p-valor por t≈normal.", sufficientData: true }];
};

/** [G2] Asignación de presupuesto Thompson entre campañas (explora/explota). */
const analyzeBudgetAllocation = async (companyId: number): Promise<Draft[]> => {
  const rows = await sequelize.query<any>(
    `SELECT cm."campaignId" AS id, MAX(cm."campaignName") AS name,
            COUNT(DISTINCT cm.id)::int AS trials, COUNT(DISTINCT ac.id)::int AS successes
       FROM "CampaignMessages" cm
       LEFT JOIN "AttributionConversions" ac ON ac."ticketId" = cm."ticketId" AND ac."companyId" = cm."companyId"
      WHERE cm."companyId" = :companyId AND cm."campaignId" IS NOT NULL
      GROUP BY cm."campaignId" HAVING COUNT(DISTINCT cm.id) >= 10`,
    { replacements: { companyId }, type: QueryTypes.SELECT }
  );
  if (rows.length < 2) {
    return [{ kind: "budget_allocation", method: "Muestreo Thompson", targetType: "global",
      recommendation: "Asignación de presupuesto: se necesitan ≥2 campañas con volumen para comparar.",
      metrics: { campaigns: rows.length }, assumption: "Thompson sobre P(conversión) Beta por campaña.", sufficientData: false }];
  }
  const arms = rows.map(r => ({ id: r.name || String(r.id), successes: Number(r.successes) || 0, trials: Number(r.trials) || 0 }));
  const alloc = Stats.thompsonAllocation(arms);
  const top = [...alloc].sort((a, b) => b.share - a.share)[0];
  return [{ kind: "budget_allocation", method: "Muestreo Thompson", targetType: "global",
    recommendation: `Reparto sugerido de presupuesto: ${alloc.map(a => `${a.id.slice(0, 20)} ${a.share}%`).join(" · ")}. Prioriza "${top.id.slice(0, 20)}".`,
    metrics: { allocation: alloc }, assumption: "Thompson: muestrea la posterior Beta de conversión y asigna por victorias.", sufficientData: true }];
};

/** Corre todos los análisis y los persiste en recommendation_runs. */
export const runStatsForCompany = async (
  companyId: number,
  runDate?: string
): Promise<{ recorded: number; drafts: Draft[] }> => {
  const date = runDate || new Date().toISOString().slice(0, 10);
  let drafts: Draft[] = [];
  for (const analyze of [analyzeCpaConfidence, analyzeChatDemand, analyzeLeadScoring, analyzeSpendForecast, analyzeRoasDrivers, analyzeBudgetAllocation]) {
    try {
      drafts = drafts.concat(await analyze(companyId));
    } catch (err: any) {
      logger.error(`${PREFIX} análisis falló company=${companyId}: ${err?.message || err}`);
    }
  }

  let recorded = 0;
  for (const d of drafts) {
    try {
      await RecommendationRun.create({
        companyId, runDate: date, kind: d.kind, method: d.method,
        targetType: d.targetType || null, targetId: d.targetId || null,
        recommendation: d.recommendation, metrics: d.metrics || null,
        assumption: d.assumption || null, sufficientData: d.sufficientData, status: "pending"
      } as any);
      recorded++;
    } catch (err: any) {
      logger.error(`${PREFIX} no se pudo registrar recomendación: ${err?.message || err}`);
    }
  }
  logger.info(`${PREFIX} company=${companyId} análisis=${drafts.length} registrados=${recorded}`);
  return { recorded, drafts };
};

export default { runStatsForCompany };
