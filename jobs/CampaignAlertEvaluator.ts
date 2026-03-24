/**
 * CampaignAlertEvaluator
 *
 * Job que evalúa métricas de campañas activas en Meta Ads
 * y genera alertas automáticas cuando se detectan problemas.
 *
 * Frecuencia recomendada: cada 30 minutos (via cron en backendCronJobs.ts)
 *
 * Alertas evaluadas:
 * - ctr_low: CTR < 0.5% después de 1000 impressions
 * - cpa_high: CPA > 2x el promedio de los últimos 7 días
 * - budget_depleted: Gasto >= 90% del presupuesto diario
 * - frequency_high: Frecuencia > 3.0
 * - no_conversions: Gasto > $50 sin conversiones
 * - no_impressions: 0 impresiones con status ACTIVE
 * - spend_anomaly: Gasto con desviación > 2 std del promedio
 */

import MetaMarketingService from "../services/MetaMarketingService";
import CampaignAlertService from "../services/CampaignAlertService";
import CompaniesSettings from "../models/CompaniesSettings";
import Whatsapp from "../models/Whatsapp";
import logger from "../utils/logger";

interface CampaignMetrics {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  daily_budget?: number;
  lifetime_budget?: number;
  insights?: {
    impressions: number;
    clicks: number;
    spend: number;
    reach: number;
    frequency: number;
    ctr: number;
    cpc: number;
    cpm: number;
    conversions: number;
    cost_per_conversion: number;
  };
}

// Umbrales por defecto para alertas
const ALERT_THRESHOLDS = {
  ctr_low: { minImpressions: 1000, ctrThreshold: 0.5 },
  cpa_high: { multiplier: 2.0 },
  budget_depleted: { percentThreshold: 90 },
  frequency_high: { frequencyThreshold: 3.0 },
  no_conversions: { minSpend: 50 },
  no_impressions: { minHoursActive: 2 },
  spend_anomaly: { stdDevMultiplier: 2.0 }
};

/**
 * Evalúa una sola empresa y genera alertas
 */
async function evaluateCompany(companyId: number, whatsappId?: number): Promise<number> {
  let alertsCreated = 0;

  try {
    // Obtener campañas con insights de los últimos 7 días
    const campaignsResult = await MetaMarketingService.getCampaigns(
      companyId,
      {
        status: ["ACTIVE"],
        includeInsights: true,
        timeRange: {
          since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          until: new Date().toISOString().split("T")[0]
        }
      },
      whatsappId
    );

    const campaigns: CampaignMetrics[] = (campaignsResult as any)?.campaigns || campaignsResult || [];

    if (!Array.isArray(campaigns) || campaigns.length === 0) {
      return 0;
    }

    // Calcular promedios globales para comparación
    const allInsights = campaigns
      .filter((c: any) => c.insights)
      .map((c: any) => c.insights);

    const avgCPA = allInsights.length > 0
      ? allInsights.reduce((sum: number, i: any) => sum + (parseFloat(i.cost_per_conversion) || 0), 0) / allInsights.length
      : 0;

    const avgSpend = allInsights.length > 0
      ? allInsights.reduce((sum: number, i: any) => sum + (parseFloat(i.spend) || 0), 0) / allInsights.length
      : 0;

    const spendStdDev = allInsights.length > 1
      ? Math.sqrt(
          allInsights.reduce((sum: number, i: any) => {
            const diff = (parseFloat(i.spend) || 0) - avgSpend;
            return sum + diff * diff;
          }, 0) / allInsights.length
        )
      : 0;

    for (const campaign of campaigns) {
      const insights = campaign.insights;
      if (!insights) continue;

      const spend = parseFloat(String(insights.spend)) || 0;
      const impressions = parseInt(String(insights.impressions)) || 0;
      const ctr = parseFloat(String(insights.ctr)) || 0;
      const frequency = parseFloat(String(insights.frequency)) || 0;
      const conversions = parseInt(String(insights.conversions)) || 0;
      const cpa = parseFloat(String(insights.cost_per_conversion)) || 0;
      const dailyBudget = campaign.daily_budget ? parseFloat(String(campaign.daily_budget)) / 100 : 0; // Meta devuelve en centavos

      const resolvedTypes: string[] = [];

      // --- Alerta: CTR Bajo ---
      if (impressions >= ALERT_THRESHOLDS.ctr_low.minImpressions && ctr < ALERT_THRESHOLDS.ctr_low.ctrThreshold) {
        await CampaignAlertService.createAlert({
          companyId,
          campaignId: campaign.id,
          campaignName: campaign.name,
          alertType: "ctr_low",
          severity: "warning",
          title: `CTR bajo en "${campaign.name}"`,
          message: `El CTR es ${ctr.toFixed(2)}% (umbral: ${ALERT_THRESHOLDS.ctr_low.ctrThreshold}%) con ${impressions} impresiones. Considera cambiar el creativo o la segmentación.`,
          metric: "ctr",
          currentValue: ctr,
          thresholdValue: ALERT_THRESHOLDS.ctr_low.ctrThreshold,
          metadata: { impressions, clicks: insights.clicks, spend }
        });
        alertsCreated++;
      } else if (ctr >= ALERT_THRESHOLDS.ctr_low.ctrThreshold) {
        resolvedTypes.push("ctr_low");
      }

      // --- Alerta: CPA Alto ---
      if (avgCPA > 0 && cpa > avgCPA * ALERT_THRESHOLDS.cpa_high.multiplier && conversions > 0) {
        await CampaignAlertService.createAlert({
          companyId,
          campaignId: campaign.id,
          campaignName: campaign.name,
          alertType: "cpa_high",
          severity: "critical",
          title: `CPA elevado en "${campaign.name}"`,
          message: `El CPA es $${cpa.toFixed(2)} (${(cpa / avgCPA).toFixed(1)}x el promedio de $${avgCPA.toFixed(2)}). Revisa la segmentación o pausa la campaña.`,
          metric: "cost_per_conversion",
          currentValue: cpa,
          thresholdValue: avgCPA * ALERT_THRESHOLDS.cpa_high.multiplier,
          metadata: { conversions, spend, avgCPA }
        });
        alertsCreated++;
      } else if (avgCPA > 0 && cpa <= avgCPA * ALERT_THRESHOLDS.cpa_high.multiplier) {
        resolvedTypes.push("cpa_high");
      }

      // --- Alerta: Budget a punto de agotarse ---
      if (dailyBudget > 0 && spend >= (dailyBudget * ALERT_THRESHOLDS.budget_depleted.percentThreshold / 100)) {
        const percentUsed = ((spend / dailyBudget) * 100).toFixed(1);
        await CampaignAlertService.createAlert({
          companyId,
          campaignId: campaign.id,
          campaignName: campaign.name,
          alertType: "budget_depleted",
          severity: "info",
          title: `Presupuesto agotándose en "${campaign.name}"`,
          message: `Se ha gastado el ${percentUsed}% del presupuesto diario ($${spend.toFixed(2)} de $${dailyBudget.toFixed(2)}).`,
          metric: "spend",
          currentValue: spend,
          thresholdValue: dailyBudget * ALERT_THRESHOLDS.budget_depleted.percentThreshold / 100,
          metadata: { dailyBudget, percentUsed }
        });
        alertsCreated++;
      }

      // --- Alerta: Frecuencia Alta ---
      if (frequency > ALERT_THRESHOLDS.frequency_high.frequencyThreshold) {
        await CampaignAlertService.createAlert({
          companyId,
          campaignId: campaign.id,
          campaignName: campaign.name,
          alertType: "frequency_high",
          severity: "warning",
          title: `Frecuencia alta en "${campaign.name}"`,
          message: `La frecuencia es ${frequency.toFixed(1)} (umbral: ${ALERT_THRESHOLDS.frequency_high.frequencyThreshold}). La audiencia está viendo los anuncios demasiadas veces. Considera cambiar la audiencia o los creativos.`,
          metric: "frequency",
          currentValue: frequency,
          thresholdValue: ALERT_THRESHOLDS.frequency_high.frequencyThreshold,
          metadata: { reach: insights.reach, impressions }
        });
        alertsCreated++;
      } else if (frequency <= ALERT_THRESHOLDS.frequency_high.frequencyThreshold) {
        resolvedTypes.push("frequency_high");
      }

      // --- Alerta: Sin Conversiones con gasto significativo ---
      if (spend > ALERT_THRESHOLDS.no_conversions.minSpend && conversions === 0) {
        await CampaignAlertService.createAlert({
          companyId,
          campaignId: campaign.id,
          campaignName: campaign.name,
          alertType: "no_conversions",
          severity: "critical",
          title: `Sin conversiones en "${campaign.name}"`,
          message: `Se han gastado $${spend.toFixed(2)} sin ninguna conversión. Revisa urgentemente la landing page, el targeting o el creativo.`,
          metric: "conversions",
          currentValue: 0,
          thresholdValue: 1,
          metadata: { spend, impressions, clicks: insights.clicks, ctr }
        });
        alertsCreated++;
      } else if (conversions > 0) {
        resolvedTypes.push("no_conversions");
      }

      // --- Alerta: Sin Impresiones ---
      if (impressions === 0 && campaign.effective_status === "ACTIVE") {
        await CampaignAlertService.createAlert({
          companyId,
          campaignId: campaign.id,
          campaignName: campaign.name,
          alertType: "no_impressions",
          severity: "critical",
          title: `Sin impresiones en "${campaign.name}"`,
          message: `La campaña está ACTIVA pero tiene 0 impresiones. Posibles causas: presupuesto insuficiente, audiencia demasiado pequeña, o problema con la cuenta publicitaria.`,
          metric: "impressions",
          currentValue: 0,
          thresholdValue: 1,
          metadata: { effectiveStatus: campaign.effective_status, dailyBudget }
        });
        alertsCreated++;
      } else if (impressions > 0) {
        resolvedTypes.push("no_impressions");
      }

      // --- Alerta: Gasto Anómalo ---
      if (spendStdDev > 0 && Math.abs(spend - avgSpend) > spendStdDev * ALERT_THRESHOLDS.spend_anomaly.stdDevMultiplier) {
        const direction = spend > avgSpend ? "por encima" : "por debajo";
        await CampaignAlertService.createAlert({
          companyId,
          campaignId: campaign.id,
          campaignName: campaign.name,
          alertType: "spend_anomaly",
          severity: "warning",
          title: `Gasto anómalo en "${campaign.name}"`,
          message: `El gasto de $${spend.toFixed(2)} está ${direction} del promedio ($${avgSpend.toFixed(2)} ± $${spendStdDev.toFixed(2)}). Verifica que no haya un problema de configuración.`,
          metric: "spend",
          currentValue: spend,
          thresholdValue: avgSpend + spendStdDev * ALERT_THRESHOLDS.spend_anomaly.stdDevMultiplier,
          metadata: { avgSpend, spendStdDev, direction }
        });
        alertsCreated++;
      }

      // Auto-resolver alertas que ya no aplican
      if (resolvedTypes.length > 0) {
        await CampaignAlertService.autoResolveAlerts(companyId, campaign.id, resolvedTypes);
      }
    }
  } catch (error: any) {
    logger.error(`[CampaignAlertEvaluator] ❌ Error evaluando empresa ${companyId}: ${error.message}`);
  }

  return alertsCreated;
}

/**
 * Función principal del evaluador
 * Itera por todas las empresas con Meta configurado y evalúa alertas
 */
async function runCampaignAlertEvaluator(): Promise<void> {
  logger.info("[CampaignAlertEvaluator] 🚀 Iniciando evaluación de alertas de campañas...");
  const startTime = Date.now();

  try {
    // Obtener empresas con Meta Ads configurado (tienen token y ad account)
    const settings = await CompaniesSettings.findAll({
      where: {
        facebookSystemUserToken: { [require("sequelize").Op.ne]: null },
        facebookAdAccountId: { [require("sequelize").Op.ne]: null }
      },
      attributes: ["companyId"]
    });

    // También buscar conexiones WhatsApp con Meta configurado
    const whatsappConnections = await Whatsapp.findAll({
      where: {
        tokenMeta: { [require("sequelize").Op.ne]: null },
        facebookAdAccountId: { [require("sequelize").Op.ne]: null }
      },
      attributes: ["id", "companyId"]
    });

    // Combinar empresas únicas
    const companyMap = new Map<number, number | undefined>();

    for (const s of settings) {
      if (!companyMap.has(s.companyId)) {
        companyMap.set(s.companyId, undefined);
      }
    }

    for (const w of whatsappConnections) {
      if (!companyMap.has(w.companyId)) {
        companyMap.set(w.companyId, w.id);
      }
    }

    logger.info(`[CampaignAlertEvaluator] 📊 Evaluando ${companyMap.size} empresas con Meta Ads configurado`);

    let totalAlerts = 0;
    let companiesProcessed = 0;

    for (const [companyId, whatsappId] of companyMap) {
      try {
        const alerts = await evaluateCompany(companyId, whatsappId);
        totalAlerts += alerts;
        companiesProcessed++;

        if (alerts > 0) {
          logger.info(`[CampaignAlertEvaluator] 📋 Empresa ${companyId}: ${alerts} alertas generadas`);
        }
      } catch (error: any) {
        logger.error(`[CampaignAlertEvaluator] ❌ Error en empresa ${companyId}: ${error.message}`);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`[CampaignAlertEvaluator] ✅ Evaluación completada en ${duration}s — ${companiesProcessed} empresas, ${totalAlerts} alertas generadas`);
  } catch (error: any) {
    logger.error(`[CampaignAlertEvaluator] ❌ Error fatal en evaluador: ${error.message}`);
  }
}

export default runCampaignAlertEvaluator;
export { evaluateCompany, ALERT_THRESHOLDS };
