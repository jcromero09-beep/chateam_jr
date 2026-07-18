/**
 * 🚀 HYBRID WHATSAPP SERVICE - JR CHATEAM v6.0.0
 *
 * Servicio principal que orquesta el sistema híbrido completo:
 * - Dual Adapter (Baileys + Cloud API)
 * - Intelligent Load Balancer
 * - Automatic Fallback & Retry
 * - Health Monitoring
 *
 * @version 1.0.0 - Fase 3
 * @date 14 de octubre de 2025
 * @author JR Chateam Development Team
 */

import { WASocket } from "baileys";
import {
  DualWhatsAppAdapter,
  DualAdapterFactory,
  WhatsAppProvider,
  UnifiedMessageOptions,
  UnifiedSendResult
} from "./DualAdapter";
import {
  IntelligentLoadBalancer,
  intelligentLoadBalancer,
  RoutingDecision
} from "./IntelligentLoadBalancer";
import { WhatsAppCloudAPIService, CloudAPIFactory } from "../WhatsAppCloudAPI/CloudAPIService";
import logger, { logError, logInfo, logWarn, logDebug } from "../../utils/logger";
import { EventEmitter } from "events";

/**
 * Configuración del servicio híbrido
 */
export interface HybridServiceConfig {
  // Modo de operación
  mode: "auto" | "baileys_only" | "cloud_only" | "baileys_first" | "cloud_first";

  // Habilitar load balancer inteligente
  enableIntelligentRouting: boolean;

  // Número máximo de reintentos globales
  maxGlobalRetries: number;

  // Tiempo entre reintentos (ms)
  retryDelayMs: number;

  // Habilitar circuit breaker
  enableCircuitBreaker: boolean;

  // Umbral de fallos para abrir circuito
  circuitBreakerThreshold: number;

  // Tiempo para resetear circuit breaker (ms)
  circuitBreakerResetMs: number;

  // Emitir eventos de telemetría
  enableTelemetry: boolean;
}

/**
 * Estado del circuit breaker
 */
enum CircuitState {
  CLOSED = "closed",   // Funcionando normalmente
  OPEN = "open",       // Circuito abierto (demasiados fallos)
  HALF_OPEN = "half_open"  // Probando recuperación
}

/**
 * Evento de telemetría
 */
interface TelemetryEvent {
  timestamp: Date;
  event: string;
  provider?: WhatsAppProvider;
  success?: boolean;
  latency?: number;
  metadata?: any;
}

/**
 * 🚀 CLASE PRINCIPAL: HYBRID WHATSAPP SERVICE
 */
export class HybridWhatsAppService extends EventEmitter {
  private config: HybridServiceConfig;
  private adapter: DualWhatsAppAdapter;
  private loadBalancer: IntelligentLoadBalancer;

  // Circuit breaker state
  private circuitState: Map<WhatsAppProvider, CircuitState>;
  private failureCount: Map<WhatsAppProvider, number>;
  private lastCircuitOpen: Map<WhatsAppProvider, Date>;

  // Telemetría
  private telemetryEvents: TelemetryEvent[];

  // Estadísticas globales
  private globalStats: {
    totalMessages: number;
    successfulMessages: number;
    failedMessages: number;
    fallbacksUsed: number;
    averageLatency: number;
  };

  constructor(config: Partial<HybridServiceConfig> = {}) {
    super();

    this.config = {
      mode: "auto",
      enableIntelligentRouting: true,
      maxGlobalRetries: 3,
      retryDelayMs: 2000,
      enableCircuitBreaker: true,
      circuitBreakerThreshold: 5,
      circuitBreakerResetMs: 60000,
      enableTelemetry: true,
      ...config
    };

    // Inicializar adapter según modo
    this.adapter = this.createAdapterForMode(this.config.mode);

    // Inicializar load balancer
    this.loadBalancer = intelligentLoadBalancer;

    // Inicializar circuit breakers
    this.circuitState = new Map();
    this.failureCount = new Map();
    this.lastCircuitOpen = new Map();

    this.circuitState.set(WhatsAppProvider.BAILEYS, CircuitState.CLOSED);
    this.circuitState.set(WhatsAppProvider.CLOUD_API, CircuitState.CLOSED);
    this.failureCount.set(WhatsAppProvider.BAILEYS, 0);
    this.failureCount.set(WhatsAppProvider.CLOUD_API, 0);

    // Inicializar telemetría
    this.telemetryEvents = [];

    // Inicializar estadísticas
    this.globalStats = {
      totalMessages: 0,
      successfulMessages: 0,
      failedMessages: 0,
      fallbacksUsed: 0,
      averageLatency: 0
    };

    logInfo("🚀 Hybrid WhatsApp Service initialized", {
      mode: this.config.mode,
      intelligentRouting: this.config.enableIntelligentRouting,
      circuitBreaker: this.config.enableCircuitBreaker
    });
  }

  /**
   * 🔌 Conectar socket Baileys
   */
  connectBaileys(socket: WASocket) {
    this.adapter.connectBaileys(socket);
    logInfo("🔌 Baileys connected to Hybrid Service");
  }

  /**
   * ☁️ Conectar Cloud API
   */
  connectCloudAPI(phoneNumberId: string, accessToken: string, apiVersion?: string) {
    const cloudService = CloudAPIFactory.getInstance(phoneNumberId, accessToken, apiVersion);
    this.adapter.connectCloudAPI(cloudService);
    logInfo("☁️ Cloud API connected to Hybrid Service");
  }

  /**
   * 📤 MÉTODO PRINCIPAL: Enviar mensaje con sistema híbrido completo
   */
  async sendMessage(options: UnifiedMessageOptions): Promise<UnifiedSendResult> {
    const startTime = Date.now();
    this.globalStats.totalMessages++;

    try {
      // 1. Determinar proveedor usando load balancer (si está habilitado)
      let targetProvider: WhatsAppProvider;

      if (this.config.enableIntelligentRouting && this.config.mode === "auto") {
        const decision = await this.loadBalancer.decide();
        targetProvider = decision.provider;

        logDebug("⚖️ Load balancer decision", {
          provider: targetProvider,
          confidence: decision.confidence,
          reasons: decision.reasons
        });

        this.emitTelemetry("routing_decision", {
          provider: targetProvider,
          confidence: decision.confidence
        });
      } else {
        // Modo manual
        targetProvider = this.getProviderForMode();
      }

      // 2. Verificar circuit breaker
      if (this.config.enableCircuitBreaker) {
        const circuitOk = await this.checkCircuitBreaker(targetProvider);
        if (!circuitOk) {
          logWarn(`⚠️ Circuit breaker OPEN for ${targetProvider}, using alternative`);

          // Cambiar a proveedor alternativo
          targetProvider = targetProvider === WhatsAppProvider.BAILEYS
            ? WhatsAppProvider.CLOUD_API
            : WhatsAppProvider.BAILEYS;

          this.globalStats.fallbacksUsed++;
          this.emitTelemetry("circuit_breaker_fallback", { originalProvider: targetProvider });
        }
      }

      // 3. Configurar adapter según proveedor decidido
      this.adapter.switchPrimaryProvider(targetProvider);

      // 4. Enviar mensaje con reintentos
      const result = await this.sendWithRetry(options);

      // 5. Actualizar métricas y circuit breaker
      const latency = Date.now() - startTime;
      this.updateMetricsAfterSend(result, latency);

      // 6. Registrar en load balancer
      this.loadBalancer.recordResult(result.provider, result.success);

      // 7. Emitir telemetría
      this.emitTelemetry("message_sent", {
        provider: result.provider,
        success: result.success,
        latency,
        usedFallback: result.usedFallback
      });

      return result;

    } catch (error) {
      logError("❌ Critical error in Hybrid Service", {
        error: error.message,
        to: options.to
      });

      this.globalStats.failedMessages++;
      this.emitTelemetry("critical_error", { error: error.message });

      return {
        success: false,
        provider: WhatsAppProvider.BAILEYS,
        usedFallback: false,
        error: error.message,
        timestamp: new Date(),
        retriesUsed: 0
      };
    }
  }

  /**
   * 🔄 Enviar con reintentos
   */
  private async sendWithRetry(
    options: UnifiedMessageOptions,
    retryCount: number = 0
  ): Promise<UnifiedSendResult> {

    try {
      const result = await this.adapter.sendMessage(options);

      if (result.success) {
        return result;
      }

      // Si falló y tenemos reintentos disponibles
      if (retryCount < this.config.maxGlobalRetries) {
        logInfo(`🔄 Retrying message send (${retryCount + 1}/${this.config.maxGlobalRetries})`);

        await this.delay(this.config.retryDelayMs * (retryCount + 1));
        return this.sendWithRetry(options, retryCount + 1);
      }

      return result;

    } catch (error) {
      if (retryCount < this.config.maxGlobalRetries) {
        await this.delay(this.config.retryDelayMs * (retryCount + 1));
        return this.sendWithRetry(options, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * ⚡ Verificar circuit breaker
   */
  private async checkCircuitBreaker(provider: WhatsAppProvider): Promise<boolean> {
    const state = this.circuitState.get(provider);

    if (state === CircuitState.CLOSED) {
      return true; // OK para usar
    }

    if (state === CircuitState.OPEN) {
      // Verificar si ya pasó el tiempo de reset
      const lastOpen = this.lastCircuitOpen.get(provider);
      if (lastOpen) {
        const elapsed = Date.now() - lastOpen.getTime();
        if (elapsed > this.config.circuitBreakerResetMs) {
          // Intentar medio abierto
          this.circuitState.set(provider, CircuitState.HALF_OPEN);
          logInfo(`🔄 Circuit breaker HALF_OPEN for ${provider}`);
          return true;
        }
      }
      return false; // Aún bloqueado
    }

    if (state === CircuitState.HALF_OPEN) {
      return true; // Probar envío
    }

    return true;
  }

  /**
   * 📊 Actualizar métricas después de envío
   */
  private updateMetricsAfterSend(result: UnifiedSendResult, latency: number) {
    if (result.success) {
      this.globalStats.successfulMessages++;

      // Reset circuit breaker si estaba medio abierto
      if (this.circuitState.get(result.provider) === CircuitState.HALF_OPEN) {
        this.circuitState.set(result.provider, CircuitState.CLOSED);
        this.failureCount.set(result.provider, 0);
        logInfo(`✅ Circuit breaker CLOSED for ${result.provider}`);
      }
    } else {
      this.globalStats.failedMessages++;

      // Incrementar contador de fallos
      const failures = (this.failureCount.get(result.provider) || 0) + 1;
      this.failureCount.set(result.provider, failures);

      // Abrir circuit breaker si se alcanza el umbral
      if (this.config.enableCircuitBreaker &&
          failures >= this.config.circuitBreakerThreshold) {

        this.circuitState.set(result.provider, CircuitState.OPEN);
        this.lastCircuitOpen.set(result.provider, new Date());

        logWarn(`⚠️ Circuit breaker OPEN for ${result.provider} (${failures} failures)`);
        this.emit("circuit-breaker-open", { provider: result.provider, failures });
      }
    }

    // Actualizar latencia promedio
    const currentAvg = this.globalStats.averageLatency;
    const total = this.globalStats.totalMessages;
    this.globalStats.averageLatency = (currentAvg * (total - 1) + latency) / total;

    // Actualizar fallbacks
    if (result.usedFallback) {
      this.globalStats.fallbacksUsed++;
    }
  }

  /**
   * 🎯 Obtener proveedor según modo configurado
   */
  private getProviderForMode(): WhatsAppProvider {
    switch (this.config.mode) {
      case "baileys_only":
      case "baileys_first":
        return WhatsAppProvider.BAILEYS;

      case "cloud_only":
      case "cloud_first":
        return WhatsAppProvider.CLOUD_API;

      case "auto":
      default:
        return WhatsAppProvider.BAILEYS; // Fallback default
    }
  }

  /**
   * 🏭 Crear adapter según modo
   */
  private createAdapterForMode(mode: string): DualWhatsAppAdapter {
    switch (mode) {
      case "baileys_only":
        return DualAdapterFactory.createBaileysOnly();

      case "cloud_only":
        return DualAdapterFactory.createCloudAPIOnly();

      case "cloud_first":
        return DualAdapterFactory.createCloudAPIFirst();

      case "baileys_first":
        return DualAdapterFactory.createBaileysFirst();

      case "auto":
      default:
        return DualAdapterFactory.createBaileysFirst();
    }
  }

  /**
   * 📡 Emitir evento de telemetría
   */
  private emitTelemetry(event: string, metadata?: any) {
    if (!this.config.enableTelemetry) return;

    const telemetryEvent: TelemetryEvent = {
      timestamp: new Date(),
      event,
      ...metadata
    };

    this.telemetryEvents.push(telemetryEvent);

    // Mantener solo últimos 1000 eventos
    if (this.telemetryEvents.length > 1000) {
      this.telemetryEvents.shift();
    }

    // Emitir evento para listeners externos
    this.emit("telemetry", telemetryEvent);
  }

  /**
   * 📊 Obtener estadísticas completas
   */
  getStatistics() {
    return {
      global: { ...this.globalStats },
      adapter: this.adapter.getStats(),
      loadBalancer: this.loadBalancer.getMetrics(),
      circuitBreaker: {
        baileys: {
          state: this.circuitState.get(WhatsAppProvider.BAILEYS),
          failures: this.failureCount.get(WhatsAppProvider.BAILEYS)
        },
        cloudAPI: {
          state: this.circuitState.get(WhatsAppProvider.CLOUD_API),
          failures: this.failureCount.get(WhatsAppProvider.CLOUD_API)
        }
      }
    };
  }

  /**
   * 🏥 Health check completo
   */
  async healthCheck() {
    const adapterHealth = await this.adapter.healthCheck();

    return {
      overall: adapterHealth.overall,
      baileys: {
        connected: adapterHealth.baileys,
        circuitState: this.circuitState.get(WhatsAppProvider.BAILEYS)
      },
      cloudAPI: {
        connected: adapterHealth.cloudAPI,
        circuitState: this.circuitState.get(WhatsAppProvider.CLOUD_API)
      },
      statistics: this.globalStats
    };
  }

  /**
   * ⚙️ Cambiar modo de operación en tiempo real
   */
  switchMode(mode: HybridServiceConfig["mode"]) {
    logInfo(`🔄 Switching hybrid service mode to: ${mode}`);
    this.config.mode = mode;
    this.adapter = this.createAdapterForMode(mode);
  }

  /**
   * 🧹 Resetear circuit breaker de un proveedor
   */
  resetCircuitBreaker(provider: WhatsAppProvider) {
    this.circuitState.set(provider, CircuitState.CLOSED);
    this.failureCount.set(provider, 0);
    logInfo(`🧹 Circuit breaker reset for ${provider}`);
  }

  /**
   * 📈 Obtener eventos de telemetría recientes
   */
  getTelemetry(limit: number = 100): TelemetryEvent[] {
    return this.telemetryEvents.slice(-limit);
  }

  /**
   * 🔧 Utilidades
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 🏭 Singleton global del servicio híbrido
 */
export const hybridWhatsAppService = new HybridWhatsAppService();

/**
 * 📤 Exports
 */
export default HybridWhatsAppService;

