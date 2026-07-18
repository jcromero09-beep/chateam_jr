/**
 * ⚖️ INTELLIGENT LOAD BALANCER - JR CHATEAM v6.0.0
 *
 * Sistema inteligente para balancear carga entre Baileys y WhatsApp Cloud API
 * basado en volumen, salud, costos, hora del día y patrones de uso.
 *
 * @version 1.0.0 - Fase 3
 * @date 14 de octubre de 2025
 * @author JR Chateam Development Team
 */

import { WhatsAppProvider } from "./DualAdapter";
import logger, { logError, logInfo, logWarn, logDebug } from "../../utils/logger";
import NodeCache from "node-cache";

/**
 * Configuración del load balancer
 */
export interface LoadBalancerConfig {
  // Umbral de mensajes/hora para cambiar a Cloud API
  highVolumeThreshold: number;

  // Umbral de mensajes/hora para volver a Baileys
  lowVolumeThreshold: number;

  // Horas pico donde preferir Cloud API (24h format)
  peakHours: number[];

  // Preferir Cloud API en días específicos (0=Dom, 6=Sab)
  peakDays: number[];

  // Peso de cada factor en la decisión (0-1)
  weights: {
    volume: number;      // Volumen de mensajes
    health: number;      // Salud del proveedor
    cost: number;        // Optimización de costos
    timeOfDay: number;   // Hora del día
    successRate: number; // Tasa de éxito histórica
  };

  // Minutos para calcular volumen actual
  volumeWindowMinutes: number;

  // Umbral de salud mínima (0-100%)
  minHealthThreshold: number;

  // Preferencia de costo (baileys=más barato, cloud=más confiable)
  costPreference: "baileys" | "cloud" | "balanced";
}

/**
 * Métricas de un proveedor
 */
interface ProviderMetrics {
  provider: WhatsAppProvider;
  messagesLast1h: number;
  messagesLast24h: number;
  successRate: number;      // 0-100%
  averageResponseTime: number; // ms
  healthScore: number;       // 0-100%
  lastFailure?: Date;
  consecutiveFailures: number;
  isAvailable: boolean;
}

/**
 * Decisión de enrutamiento
 */
export interface RoutingDecision {
  provider: WhatsAppProvider;
  confidence: number;      // 0-100% confianza en la decisión
  reasons: string[];       // Razones de la decisión
  metrics: {
    volumeScore: number;
    healthScore: number;
    costScore: number;
    timeScore: number;
    successScore: number;
    finalScore: number;
  };
}

/**
 * ⚖️ CLASE PRINCIPAL: INTELLIGENT LOAD BALANCER
 */
export class IntelligentLoadBalancer {
  private config: LoadBalancerConfig;
  private cache: NodeCache;

  // Métricas de proveedores
  private baileysMetrics: ProviderMetrics;
  private cloudAPIMetrics: ProviderMetrics;

  // Histórico de decisiones
  private decisionHistory: Array<{
    timestamp: Date;
    provider: WhatsAppProvider;
    success: boolean;
  }>;

  constructor(config: Partial<LoadBalancerConfig> = {}) {
    this.config = {
      highVolumeThreshold: 100,      // >100 msg/hora → Cloud API
      lowVolumeThreshold: 30,        // <30 msg/hora → Baileys
      peakHours: [9, 10, 11, 12, 14, 15, 16, 17, 18], // 9am-6pm
      peakDays: [1, 2, 3, 4, 5],     // Lunes a Viernes
      weights: {
        volume: 0.30,
        health: 0.25,
        cost: 0.15,
        timeOfDay: 0.15,
        successRate: 0.15
      },
      volumeWindowMinutes: 60,
      minHealthThreshold: 70,
      costPreference: "balanced",
      ...config
    };

    this.cache = new NodeCache({
      stdTTL: 300, // 5 minutos
      checkperiod: 60
    });

    this.baileysMetrics = this.initializeMetrics(WhatsAppProvider.BAILEYS);
    this.cloudAPIMetrics = this.initializeMetrics(WhatsAppProvider.CLOUD_API);
    this.decisionHistory = [];

    logInfo("⚖️ Intelligent Load Balancer initialized", {
      highVolumeThreshold: this.config.highVolumeThreshold,
      costPreference: this.config.costPreference
    });
  }

  /**
   * 🎯 DECISIÓN PRINCIPAL: Determinar qué proveedor usar
   */
  async decide(): Promise<RoutingDecision> {
    const now = new Date();

    // Calcular scores para cada factor
    const volumeScore = this.calculateVolumeScore();
    const healthScore = this.calculateHealthScore();
    const costScore = this.calculateCostScore();
    const timeScore = this.calculateTimeScore(now);
    const successScore = this.calculateSuccessScore();

    // Score final ponderado
    const baileysScore = this.calculateFinalScore({
      volumeScore: volumeScore.baileys,
      healthScore: healthScore.baileys,
      costScore: costScore.baileys,
      timeScore: timeScore.baileys,
      successScore: successScore.baileys
    });

    const cloudAPIScore = this.calculateFinalScore({
      volumeScore: volumeScore.cloudAPI,
      healthScore: healthScore.cloudAPI,
      costScore: costScore.cloudAPI,
      timeScore: timeScore.cloudAPI,
      successScore: successScore.cloudAPI
    });

    // Determinar ganador
    const provider = baileysScore > cloudAPIScore
      ? WhatsAppProvider.BAILEYS
      : WhatsAppProvider.CLOUD_API;

    const winnerScore = Math.max(baileysScore, cloudAPIScore);
    const confidence = Math.min(100, winnerScore);

    // Generar razones de la decisión
    const reasons = this.generateReasons(
      provider,
      { volumeScore, healthScore, costScore, timeScore, successScore }
    );

    const decision: RoutingDecision = {
      provider,
      confidence,
      reasons,
      metrics: {
        volumeScore: provider === WhatsAppProvider.BAILEYS ? volumeScore.baileys : volumeScore.cloudAPI,
        healthScore: provider === WhatsAppProvider.BAILEYS ? healthScore.baileys : healthScore.cloudAPI,
        costScore: provider === WhatsAppProvider.BAILEYS ? costScore.baileys : costScore.cloudAPI,
        timeScore: provider === WhatsAppProvider.BAILEYS ? timeScore.baileys : timeScore.cloudAPI,
        successScore: provider === WhatsAppProvider.BAILEYS ? successScore.baileys : successScore.cloudAPI,
        finalScore: winnerScore
      }
    };

    logDebug("⚖️ Routing decision made", {
      provider,
      confidence,
      baileysScore,
      cloudAPIScore
    });

    return decision;
  }

  /**
   * 📊 Calcular score de volumen
   */
  private calculateVolumeScore(): { baileys: number; cloudAPI: number } {
    const currentVolume = this.getCurrentVolume();

    // Baileys mejor para volumen bajo-medio
    // Cloud API mejor para volumen alto
    if (currentVolume < this.config.lowVolumeThreshold) {
      return { baileys: 100, cloudAPI: 40 };
    } else if (currentVolume > this.config.highVolumeThreshold) {
      return { baileys: 30, cloudAPI: 100 };
    } else {
      // Volumen medio: transición gradual
      const ratio = (currentVolume - this.config.lowVolumeThreshold) /
                    (this.config.highVolumeThreshold - this.config.lowVolumeThreshold);
      return {
        baileys: 100 - (ratio * 70),
        cloudAPI: 40 + (ratio * 60)
      };
    }
  }

  /**
   * 🏥 Calcular score de salud
   */
  private calculateHealthScore(): { baileys: number; cloudAPI: number } {
    // Si un proveedor está muy bajo de salud, penalizarlo severamente
    const baileysHealth = this.baileysMetrics.healthScore;
    const cloudAPIHealth = this.cloudAPIMetrics.healthScore;

    const baileysScore = baileysHealth < this.config.minHealthThreshold
      ? baileysHealth * 0.5  // Penalizar 50%
      : baileysHealth;

    const cloudAPIScore = cloudAPIHealth < this.config.minHealthThreshold
      ? cloudAPIHealth * 0.5
      : cloudAPIHealth;

    return {
      baileys: baileysScore,
      cloudAPI: cloudAPIScore
    };
  }

  /**
   * 💰 Calcular score de costo
   */
  private calculateCostScore(): { baileys: number; cloudAPI: number } {
    // Baileys es gratis, Cloud API tiene costo por mensaje
    switch (this.config.costPreference) {
      case "baileys":
        return { baileys: 100, cloudAPI: 50 };

      case "cloud":
        return { baileys: 50, cloudAPI: 100 };

      case "balanced":
      default:
        return { baileys: 75, cloudAPI: 75 };
    }
  }

  /**
   * ⏰ Calcular score basado en hora del día
   */
  private calculateTimeScore(now: Date): { baileys: number; cloudAPI: number } {
    const hour = now.getHours();
    const day = now.getDay();

    const isPeakHour = this.config.peakHours.includes(hour);
    const isPeakDay = this.config.peakDays.includes(day);

    // En horas/días pico, preferir Cloud API por su mayor confiabilidad
    if (isPeakHour && isPeakDay) {
      return { baileys: 60, cloudAPI: 100 };
    } else if (isPeakHour || isPeakDay) {
      return { baileys: 75, cloudAPI: 90 };
    } else {
      // Fuera de horas pico, Baileys es suficiente
      return { baileys: 100, cloudAPI: 70 };
    }
  }

  /**
   * ✅ Calcular score basado en tasa de éxito
   */
  private calculateSuccessScore(): { baileys: number; cloudAPI: number } {
    return {
      baileys: this.baileysMetrics.successRate,
      cloudAPI: this.cloudAPIMetrics.successRate
    };
  }

  /**
   * 🎲 Calcular score final ponderado
   */
  private calculateFinalScore(scores: {
    volumeScore: number;
    healthScore: number;
    costScore: number;
    timeScore: number;
    successScore: number;
  }): number {
    const weights = this.config.weights;

    return (
      scores.volumeScore * weights.volume +
      scores.healthScore * weights.health +
      scores.costScore * weights.cost +
      scores.timeScore * weights.timeOfDay +
      scores.successScore * weights.successRate
    );
  }

  /**
   * 📝 Generar razones de la decisión
   */
  private generateReasons(
    provider: WhatsAppProvider,
    scores: any
  ): string[] {
    const reasons: string[] = [];

    // Volumen
    const volume = this.getCurrentVolume();
    if (volume > this.config.highVolumeThreshold && provider === WhatsAppProvider.CLOUD_API) {
      reasons.push(`High volume (${volume} msg/h) - Cloud API recommended`);
    } else if (volume < this.config.lowVolumeThreshold && provider === WhatsAppProvider.BAILEYS) {
      reasons.push(`Low volume (${volume} msg/h) - Baileys sufficient`);
    }

    // Salud
    const opponentHealth = provider === WhatsAppProvider.BAILEYS
      ? this.cloudAPIMetrics.healthScore
      : this.baileysMetrics.healthScore;

    if (opponentHealth < this.config.minHealthThreshold) {
      reasons.push(`Alternative provider unhealthy (${opponentHealth.toFixed(0)}%)`);
    }

    // Hora del día
    const now = new Date();
    const isPeakTime = this.config.peakHours.includes(now.getHours());
    if (isPeakTime && provider === WhatsAppProvider.CLOUD_API) {
      reasons.push("Peak hours - Cloud API for reliability");
    }

    // Costo
    if (this.config.costPreference === "baileys" && provider === WhatsAppProvider.BAILEYS) {
      reasons.push("Cost optimization enabled");
    }

    // Tasa de éxito
    const successRate = provider === WhatsAppProvider.BAILEYS
      ? this.baileysMetrics.successRate
      : this.cloudAPIMetrics.successRate;

    if (successRate > 95) {
      reasons.push(`High success rate (${successRate.toFixed(1)}%)`);
    }

    return reasons;
  }

  /**
   * 📈 Actualizar métricas de un proveedor
   */
  updateMetrics(provider: WhatsAppProvider, data: Partial<ProviderMetrics>) {
    if (provider === WhatsAppProvider.BAILEYS) {
      this.baileysMetrics = { ...this.baileysMetrics, ...data };
    } else {
      this.cloudAPIMetrics = { ...this.cloudAPIMetrics, ...data };
    }

    logDebug(`📈 Metrics updated for ${provider}`, data);
  }

  /**
   * 📊 Registrar resultado de envío
   */
  recordResult(provider: WhatsAppProvider, success: boolean) {
    const metrics = provider === WhatsAppProvider.BAILEYS
      ? this.baileysMetrics
      : this.cloudAPIMetrics;

    // Actualizar contadores
    if (success) {
      metrics.consecutiveFailures = 0;
    } else {
      metrics.consecutiveFailures++;
      metrics.lastFailure = new Date();
    }

    // Actualizar tasa de éxito (ventana deslizante de últimos 100 mensajes)
    this.decisionHistory.push({
      timestamp: new Date(),
      provider,
      success
    });

    // Mantener solo últimos 100 registros
    if (this.decisionHistory.length > 100) {
      this.decisionHistory.shift();
    }

    // Recalcular tasas de éxito
    this.recalculateSuccessRates();

    // Incrementar contador de mensajes
    metrics.messagesLast1h++;
    metrics.messagesLast24h++;
  }

  /**
   * 🔄 Recalcular tasas de éxito
   */
  private recalculateSuccessRates() {
    const baileysHistory = this.decisionHistory.filter(
      d => d.provider === WhatsAppProvider.BAILEYS
    );
    const cloudAPIHistory = this.decisionHistory.filter(
      d => d.provider === WhatsAppProvider.CLOUD_API
    );

    if (baileysHistory.length > 0) {
      const successes = baileysHistory.filter(d => d.success).length;
      this.baileysMetrics.successRate = (successes / baileysHistory.length) * 100;
    }

    if (cloudAPIHistory.length > 0) {
      const successes = cloudAPIHistory.filter(d => d.success).length;
      this.cloudAPIMetrics.successRate = (successes / cloudAPIHistory.length) * 100;
    }
  }

  /**
   * 📊 Obtener volumen actual de mensajes
   */
  private getCurrentVolume(): number {
    const cached = this.cache.get<number>("current_volume");
    if (cached !== undefined) {
      return cached;
    }

    // Calcular volumen basado en historial reciente
    const now = new Date();
    const windowStart = new Date(now.getTime() - this.config.volumeWindowMinutes * 60 * 1000);

    const recentMessages = this.decisionHistory.filter(
      d => d.timestamp >= windowStart
    );

    // Extrapolar a mensajes por hora
    const volume = (recentMessages.length / this.config.volumeWindowMinutes) * 60;

    this.cache.set("current_volume", volume, 60); // Cache 1 minuto
    return volume;
  }

  /**
   * 🔧 Inicializar métricas de un proveedor
   */
  private initializeMetrics(provider: WhatsAppProvider): ProviderMetrics {
    return {
      provider,
      messagesLast1h: 0,
      messagesLast24h: 0,
      successRate: 100,
      averageResponseTime: 0,
      healthScore: 100,
      consecutiveFailures: 0,
      isAvailable: true
    };
  }

  /**
   * 📊 Obtener métricas actuales
   */
  getMetrics() {
    return {
      baileys: { ...this.baileysMetrics },
      cloudAPI: { ...this.cloudAPIMetrics },
      currentVolume: this.getCurrentVolume(),
      decisionHistorySize: this.decisionHistory.length
    };
  }

  /**
   * ⚙️ Actualizar configuración en tiempo real
   */
  updateConfig(config: Partial<LoadBalancerConfig>) {
    this.config = { ...this.config, ...config };
    logInfo("⚙️ Load balancer config updated", config);
  }

  /**
   * 🧹 Limpiar historial antiguo
   */
  cleanup() {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    this.decisionHistory = this.decisionHistory.filter(
      d => d.timestamp >= oneDayAgo
    );

    // Reset contadores de 24h
    this.baileysMetrics.messagesLast24h = this.decisionHistory.filter(
      d => d.provider === WhatsAppProvider.BAILEYS
    ).length;

    this.cloudAPIMetrics.messagesLast24h = this.decisionHistory.filter(
      d => d.provider === WhatsAppProvider.CLOUD_API
    ).length;

    logDebug("🧹 Load balancer history cleaned up");
  }
}

/**
 * 🏭 Singleton para load balancer global
 */
export const intelligentLoadBalancer = new IntelligentLoadBalancer();

/**
 * 📤 Exports
 */
export default IntelligentLoadBalancer;

