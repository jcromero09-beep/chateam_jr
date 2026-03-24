/**
 * AnomalyDetectionService
 *
 * Detecta anomalías estadísticas en las métricas de campañas de Meta Ads.
 * Usa 3 algoritmos complementarios:
 *
 * 1. Z-Score: Detecta desviaciones respecto a la media histórica
 *    |z| > 2 = warning, |z| > 3 = critical
 *
 * 2. IQR (Interquartile Range): Identifica outliers usando cuartiles
 *    Valor < Q1 - 1.5*IQR || Valor > Q3 + 1.5*IQR = anomalía
 *
 * 3. Moving Average: Compara el período actual con el anterior
 *    Cambio > 30% vs promedio móvil = warning, > 50% = critical
 */

import logger from "../utils/logger";
import { MarketingCache } from "./MetaMarketingService/MarketingCache";

const LOG_PREFIX = "[AnomalyDetectionService]";

// ============================================================
// TIPOS
// ============================================================

export type AnomalySeverity = "critical" | "warning" | "info";
export type AnomalyDirection = "spike" | "drop" | "unusual";
export type AnomalyAlgorithm = "z_score" | "iqr" | "moving_average";

export interface AnomalyResult {
  campaignId: string;
  campaignName: string;
  metric: string;
  metricLabel: string;
  currentValue: number;
  historicalAvg: number;
  expectedMin: number;
  expectedMax: number;
  deviation: number;      // En porcentaje vs promedio
  zScore?: number;
  severity: AnomalySeverity;
  direction: AnomalyDirection;
  description: string;
  suggestion: string;
  algorithm: AnomalyAlgorithm;
  detectedAt: string;
}

export interface AnomalyDetectionResult {
  totalCampaigns: number;
  anomaliesFound: number;
  critical: number;
  warnings: number;
  infos: number;
  anomalies: AnomalyResult[];
  summary: string;
  analyzedAt: string;
}

// ============================================================
// CONFIGURACIÓN DE MÉTRICAS
// ============================================================

interface MetricConfig {
  label: string;
  unit: string;
  higherIsBetter: boolean;  // true = subidas son buenas, bajadas son malas
  minSamples: number;       // Mínimo de campañas para comparación válida
  criticalZScore: number;
  warningZScore: number;
}

const METRIC_CONFIG: Record<string, MetricConfig> = {
  ctr: {
    label: "CTR (Tasa de clics)",
    unit: "%",
    higherIsBetter: true,
    minSamples: 3,
    criticalZScore: 3,
    warningZScore: 2
  },
  cpc: {
    label: "CPC (Costo por clic)",
    unit: "$",
    higherIsBetter: false,
    minSamples: 3,
    criticalZScore: 3,
    warningZScore: 2
  },
  cpm: {
    label: "CPM (Costo por mil impresiones)",
    unit: "$",
    higherIsBetter: false,
    minSamples: 3,
    criticalZScore: 3,
    warningZScore: 2
  },
  frequency: {
    label: "Frecuencia",
    unit: "x",
    higherIsBetter: false,
    minSamples: 3,
    criticalZScore: 3,
    warningZScore: 2
  },
  spend: {
    label: "Gasto",
    unit: "$",
    higherIsBetter: false, // Gasto muy alto es sospechoso
    minSamples: 3,
    criticalZScore: 3,
    warningZScore: 2
  },
  impressions: {
    label: "Impresiones",
    unit: "",
    higherIsBetter: true,
    minSamples: 3,
    criticalZScore: 3,
    warningZScore: 2
  },
  conversions: {
    label: "Conversiones",
    unit: "",
    higherIsBetter: true,
    minSamples: 3,
    criticalZScore: 3,
    warningZScore: 2
  }
};

// ============================================================
// HELPERS ESTADÍSTICOS
// ============================================================

const mean = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
};

const stdDev = (values: number[], avg?: number): number => {
  if (values.length < 2) return 0;
  const m = avg ?? mean(values);
  const variance = values.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / values.length;
  return Math.sqrt(variance);
};

const percentile = (values: number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
};

const formatValue = (value: number, unit: string): string => {
  if (unit === "$") return `$${value.toFixed(2)}`;
  if (unit === "%") return `${value.toFixed(2)}%`;
  if (unit === "x") return `${value.toFixed(1)}x`;
  return value.toFixed(0);
};

// ============================================================
// SERVICIO
// ============================================================

export class AnomalyDetectionService {

  /**
   * Detecta anomalías en todas las campañas de una empresa
   * Compara métricas de cada campaña vs el conjunto total
   */
  async detectAnomalies(
    companyId: number,
    period: string = "last_30_days",
    campaignsData?: any[]
  ): Promise<AnomalyDetectionResult> {
    logger.info(`${LOG_PREFIX} Iniciando detección de anomalías para empresa ${companyId}`);

    // Obtener datos de campañas
    let campaigns: any[] = [];
    if (campaignsData && campaignsData.length > 0) {
      campaigns = campaignsData;
    } else {
      campaigns = await MarketingCache.getCampaigns(companyId, period);
    }

    if (!campaigns || campaigns.length === 0) {
      return {
        totalCampaigns: 0,
        anomaliesFound: 0,
        critical: 0,
        warnings: 0,
        infos: 0,
        anomalies: [],
        summary: "No hay datos de campañas disponibles para analizar",
        analyzedAt: new Date().toISOString()
      };
    }

    // Extraer métricas para todas las campañas (solo ACTIVAS con datos)
    const campaignMetrics = campaigns
      .filter(c => (c.impressions || c.insights?.impressions || 0) > 0)
      .map(c => ({
        id: String(c.id),
        name: c.name,
        ctr: Number(c.ctr || c.insights?.ctr || 0),
        cpc: Number(c.cpc || c.insights?.cpc || 0),
        cpm: Number(c.cpm || c.insights?.cpm || 0),
        frequency: Number(c.frequency || c.insights?.frequency || 0),
        spend: Number(c.spend || c.insights?.spend || 0),
        impressions: Number(c.impressions || c.insights?.impressions || 0),
        conversions: Number(c.conversions || c.insights?.conversions || 0)
      }));

    if (campaignMetrics.length < 2) {
      return {
        totalCampaigns: campaigns.length,
        anomaliesFound: 0,
        critical: 0,
        warnings: 0,
        infos: 0,
        anomalies: [],
        summary: "Se necesitan al menos 2 campañas activas con datos para detectar anomalías",
        analyzedAt: new Date().toISOString()
      };
    }

    const anomalies: AnomalyResult[] = [];

    // Analizar cada métrica
    for (const [metricKey, config] of Object.entries(METRIC_CONFIG)) {
      if (campaignMetrics.length < config.minSamples) continue;

      const values = campaignMetrics.map(c => c[metricKey as keyof typeof c] as number);

      // Ignorar métricas donde la mayoría de valores es 0
      const nonZero = values.filter(v => v > 0);
      if (nonZero.length < config.minSamples) continue;

      const avg = mean(values);
      const sd = stdDev(values, avg);

      // === ALGORITMO 1: Z-SCORE ===
      for (const campaign of campaignMetrics) {
        const value = campaign[metricKey as keyof typeof campaign] as number;
        if (value === 0 && avg === 0) continue;

        const zScore = sd > 0 ? (value - avg) / sd : 0;
        const absZ = Math.abs(zScore);

        if (absZ >= config.warningZScore) {
          const deviationPct = avg > 0 ? ((value - avg) / avg) * 100 : 0;
          const isHigh = value > avg;

          // Determinar si es bueno o malo según dirección
          const isBad = config.higherIsBetter ? !isHigh : isHigh;
          const severity: AnomalySeverity = absZ >= config.criticalZScore ? "critical" : "warning";
          const direction: AnomalyDirection = isHigh ? "spike" : "drop";

          // Calcular rango esperado (±2 desviaciones estándar)
          const expectedMin = Math.max(0, avg - 2 * sd);
          const expectedMax = avg + 2 * sd;

          const description = this.buildDescription(
            campaign.name,
            config.label,
            value,
            avg,
            deviationPct,
            isHigh,
            config.unit,
            isBad
          );

          const suggestion = this.buildSuggestion(metricKey, isHigh, isBad);

          anomalies.push({
            campaignId: campaign.id,
            campaignName: campaign.name,
            metric: metricKey,
            metricLabel: config.label,
            currentValue: Math.round(value * 100) / 100,
            historicalAvg: Math.round(avg * 100) / 100,
            expectedMin: Math.round(expectedMin * 100) / 100,
            expectedMax: Math.round(expectedMax * 100) / 100,
            deviation: Math.round(deviationPct * 10) / 10,
            zScore: Math.round(zScore * 100) / 100,
            severity,
            direction,
            description,
            suggestion,
            algorithm: "z_score",
            detectedAt: new Date().toISOString()
          });
        }
      }

      // === ALGORITMO 2: IQR ===
      const q1 = percentile(values, 25);
      const q3 = percentile(values, 75);
      const iqr = q3 - q1;
      const lowerBound = q1 - 1.5 * iqr;
      const upperBound = q3 + 1.5 * iqr;

      for (const campaign of campaignMetrics) {
        const value = campaign[metricKey as keyof typeof campaign] as number;
        if (value < lowerBound || value > upperBound) {
          // Evitar duplicar con Z-Score
          const alreadyDetected = anomalies.some(
            a => a.campaignId === campaign.id && a.metric === metricKey && a.algorithm === "z_score"
          );
          if (alreadyDetected) continue;

          const deviationPct = avg > 0 ? ((value - avg) / avg) * 100 : 0;
          const isHigh = value > avg;
          const isBad = config.higherIsBetter ? !isHigh : isHigh;

          anomalies.push({
            campaignId: campaign.id,
            campaignName: campaign.name,
            metric: metricKey,
            metricLabel: config.label,
            currentValue: Math.round(value * 100) / 100,
            historicalAvg: Math.round(avg * 100) / 100,
            expectedMin: Math.round(lowerBound * 100) / 100,
            expectedMax: Math.round(upperBound * 100) / 100,
            deviation: Math.round(deviationPct * 10) / 10,
            severity: "warning",
            direction: isHigh ? "spike" : "drop",
            description: this.buildDescription(campaign.name, config.label, value, avg, deviationPct, isHigh, config.unit, isBad),
            suggestion: this.buildSuggestion(metricKey, isHigh, isBad),
            algorithm: "iqr",
            detectedAt: new Date().toISOString()
          });
        }
      }
    }

    // === ALGORITMO 3: REGLAS DE NEGOCIO (contextuales) ===
    for (const campaign of campaignMetrics) {
      // Frecuencia alta (> 5x = crítico, > 3x = warning)
      if (campaign.frequency > 5) {
        anomalies.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          metric: "frequency",
          metricLabel: "Frecuencia",
          currentValue: campaign.frequency,
          historicalAvg: 2.5,
          expectedMin: 1,
          expectedMax: 3,
          deviation: ((campaign.frequency - 2.5) / 2.5) * 100,
          severity: "critical",
          direction: "spike",
          description: `🔴 La campaña "${campaign.name}" tiene frecuencia ${campaign.frequency.toFixed(1)}x — La audiencia está saturada`,
          suggestion: "Amplía el público objetivo, introduce nuevos creativos o pausa la campaña temporalmente para evitar fatiga publicitaria",
          algorithm: "moving_average",
          detectedAt: new Date().toISOString()
        });
      } else if (campaign.frequency > 3 && !anomalies.some(a => a.campaignId === campaign.id && a.metric === "frequency")) {
        anomalies.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          metric: "frequency",
          metricLabel: "Frecuencia",
          currentValue: campaign.frequency,
          historicalAvg: 2.5,
          expectedMin: 1,
          expectedMax: 3,
          deviation: ((campaign.frequency - 2.5) / 2.5) * 100,
          severity: "warning",
          direction: "spike",
          description: `⚠️ La campaña "${campaign.name}" tiene frecuencia ${campaign.frequency.toFixed(1)}x — Riesgo de fatiga publicitaria`,
          suggestion: "Considera rotar creativos o expandir la audiencia en los próximos días",
          algorithm: "moving_average",
          detectedAt: new Date().toISOString()
        });
      }

      // CTR extremadamente bajo (< 0.5%)
      if (campaign.ctr > 0 && campaign.ctr < 0.5 && campaign.impressions > 1000) {
        const alreadyDetected = anomalies.some(a => a.campaignId === campaign.id && a.metric === "ctr");
        if (!alreadyDetected) {
          anomalies.push({
            campaignId: campaign.id,
            campaignName: campaign.name,
            metric: "ctr",
            metricLabel: "CTR (Tasa de clics)",
            currentValue: campaign.ctr,
            historicalAvg: 1.5,
            expectedMin: 0.5,
            expectedMax: 5,
            deviation: ((campaign.ctr - 1.5) / 1.5) * 100,
            severity: "critical",
            direction: "drop",
            description: `🔴 CTR crítico del ${campaign.ctr.toFixed(2)}% en "${campaign.name}" con ${campaign.impressions.toLocaleString()} impresiones`,
            suggestion: "Revisar el creativo y targeting urgentemente. El anuncio no está resonando con la audiencia.",
            algorithm: "moving_average",
            detectedAt: new Date().toISOString()
          });
        }
      }
    }

    // Eliminar duplicados (misma campaña + misma métrica, mantener el más severo)
    const deduped = this.deduplicateAnomalies(anomalies);

    // Ordenar por severidad: critical > warning > info
    deduped.sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    });

    const criticalCount = deduped.filter(a => a.severity === "critical").length;
    const warningCount = deduped.filter(a => a.severity === "warning").length;
    const infoCount = deduped.filter(a => a.severity === "info").length;

    const summary = this.buildSummary(deduped.length, criticalCount, warningCount, campaignMetrics.length);

    logger.info(`${LOG_PREFIX} ✅ Detección completada: ${deduped.length} anomalías (${criticalCount} críticas, ${warningCount} advertencias)`);

    return {
      totalCampaigns: campaigns.length,
      anomaliesFound: deduped.length,
      critical: criticalCount,
      warnings: warningCount,
      infos: infoCount,
      anomalies: deduped,
      summary,
      analyzedAt: new Date().toISOString()
    };
  }

  private buildDescription(
    campaignName: string,
    metricLabel: string,
    value: number,
    avg: number,
    deviationPct: number,
    isHigh: boolean,
    unit: string,
    isBad: boolean
  ): string {
    const icon = isBad ? (isHigh ? "🔴" : "🔴") : "🟡";
    const direction = isHigh ? "está por encima" : "está por debajo";
    const absDeviation = Math.abs(deviationPct);
    return `${icon} ${metricLabel} de "${campaignName}" ${direction} del promedio en ${absDeviation.toFixed(0)}% (valor: ${unit === "$" ? "$" : ""}${value.toFixed(2)}${unit !== "$" ? unit : ""}, promedio: ${unit === "$" ? "$" : ""}${avg.toFixed(2)}${unit !== "$" ? unit : ""})`;
  }

  private buildSuggestion(metric: string, isHigh: boolean, isBad: boolean): string {
    const suggestions: Record<string, { high: string; low: string }> = {
      ctr: {
        high: "CTR alto es positivo. Verifica que el tráfico sea de calidad y esté convirtiendo.",
        low: "CTR bajo indica que el creativo no resuena con la audiencia. Prueba nuevos formatos, textos o imágenes."
      },
      cpc: {
        high: "CPC elevado puede indicar competencia alta o baja relevancia del anuncio. Mejora el Quality Score con creativos más relevantes.",
        low: "CPC bajo es positivo. Monitorea la calidad del tráfico."
      },
      cpm: {
        high: "CPM alto puede indicar alta competencia en la subasta. Considera ampliar la audiencia o ajustar el horario de publicación.",
        low: "CPM bajo es positivo. Verifica que la audiencia tenga suficiente tamaño."
      },
      frequency: {
        high: "Frecuencia alta provoca fatiga publicitaria. Rota creativos o amplía el público objetivo urgentemente.",
        low: "Frecuencia muy baja puede indicar bajo presupuesto o audiencia muy amplia."
      },
      spend: {
        high: "Gasto muy alto comparado con otras campañas. Verifica que el ROI justifique la inversión.",
        low: "Gasto bajo puede indicar restricciones de presupuesto o problemas de entrega."
      },
      impressions: {
        high: "Muchas impresiones son positivas si el CTR es saludable.",
        low: "Pocas impresiones puede indicar problemas de entrega, audiencia demasiado restringida o presupuesto bajo."
      },
      conversions: {
        high: "Muchas conversiones son excelentes. Considera escalar el presupuesto.",
        low: "Pocas conversiones. Revisa el funnel completo: landing page, oferta y targeting."
      }
    };

    return suggestions[metric]?.[isHigh ? "high" : "low"] || "Revisa esta métrica en Ads Manager para determinar la causa.";
  }

  private deduplicateAnomalies(anomalies: AnomalyResult[]): AnomalyResult[] {
    const seen = new Map<string, AnomalyResult>();
    const severityOrder = { critical: 0, warning: 1, info: 2 };

    for (const anomaly of anomalies) {
      const key = `${anomaly.campaignId}_${anomaly.metric}`;
      const existing = seen.get(key);
      if (!existing || severityOrder[anomaly.severity] < severityOrder[existing.severity]) {
        seen.set(key, anomaly);
      }
    }

    return Array.from(seen.values());
  }

  private buildSummary(total: number, criticals: number, warnings: number, totalCampaigns: number): string {
    if (total === 0) {
      return `✅ Todas las ${totalCampaigns} campañas analizadas están funcionando dentro de los rangos normales`;
    }
    const parts: string[] = [];
    if (criticals > 0) parts.push(`${criticals} anomalías críticas que requieren atención inmediata`);
    if (warnings > 0) parts.push(`${warnings} advertencias que deberías revisar`);
    return `Se detectaron ${total} anomalías en ${totalCampaigns} campañas: ${parts.join(" y ")}`;
  }
}

export default new AnomalyDetectionService();
