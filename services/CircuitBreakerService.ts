/**
 * CircuitBreakerService — Patrón Circuit Breaker genérico para servicios IA
 *
 * Basado en el patrón de HybridWhatsAppService.ts pero generalizado para
 * cualquier servicio externo (OpenAI, Anthropic, Google, etc.)
 *
 * Estados: CLOSED → OPEN (tras N fallos) → HALF_OPEN (tras timeout) → CLOSED (tras éxitos)
 * Almacenamiento: Redis para funcionar en multi-instancia (PM2 cluster)
 * Fail-open: Si Redis no disponible, NO bloquear (permite el request)
 */

import logger from "../utils/logger";

// Importar Redis del cache layer existente (import dinámico para ESM)
let cacheLayer: any = null;

import("../libs/cache").then((cacheModule) => {
  cacheLayer = cacheModule.default || cacheModule;
  logger.info("[CircuitBreaker] cacheLayer cargado correctamente");
}).catch(() => {
  logger.warn("[CircuitBreaker] No se pudo cargar cacheLayer, usando fail-open");
});

export enum CircuitState {
  CLOSED = "closed",      // Funcionando normalmente — requests pasan
  OPEN = "open",          // Circuito abierto — requests bloqueados (demasiados fallos)
  HALF_OPEN = "half_open" // Probando recuperación — permite 1 request de prueba
}

export interface CircuitBreakerConfig {
  /** Nombre del proveedor/servicio (ej: 'openai', 'anthropic') */
  name: string;

  /** Cantidad de fallos consecutivos para abrir el circuito (default: 5) */
  failureThreshold: number;

  /** Tiempo en ms para pasar de OPEN → HALF_OPEN (default: 60000 = 1 min) */
  resetTimeoutMs: number;

  /** Cantidad de éxitos consecutivos en HALF_OPEN para cerrar (default: 2) */
  successThreshold: number;

  /** Errores HTTP que cuentan como fallo del circuito */
  failureStatusCodes: number[];
}

const DEFAULT_CONFIG: Omit<CircuitBreakerConfig, "name"> = {
  failureThreshold: 5,
  resetTimeoutMs: 60_000,
  successThreshold: 2,
  failureStatusCodes: [429, 500, 502, 503, 504],
};

/**
 * CircuitBreaker — Instancia por proveedor
 *
 * Usa Redis para estado compartido entre procesos PM2.
 * Si Redis falla, opera en modo fail-open (no bloquea).
 */
export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private redisKeyPrefix: string;

  // Fallback local cuando Redis no está disponible
  private localState: CircuitState = CircuitState.CLOSED;
  private localFailureCount: number = 0;
  private localSuccessCount: number = 0;
  private localLastOpenTime: number = 0;

  constructor(config: Partial<CircuitBreakerConfig> & { name: string }) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.redisKeyPrefix = `circuit:${this.config.name}`;
  }

  /**
   * Verifica si el circuito permite pasar un request
   * @returns true si el request puede proceder, false si está bloqueado
   */
  async canExecute(): Promise<boolean> {
    const state = await this.getState();

    switch (state) {
      case CircuitState.CLOSED:
        return true;

      case CircuitState.OPEN:
        // Verificar si ya pasó el timeout para pasar a HALF_OPEN
        const lastOpen = await this.getLastOpenTime();
        if (Date.now() - lastOpen >= this.config.resetTimeoutMs) {
          await this.setState(CircuitState.HALF_OPEN);
          logger.info(`[CircuitBreaker:${this.config.name}] OPEN → HALF_OPEN (timeout alcanzado)`);
          return true; // Permitir 1 request de prueba
        }
        return false;

      case CircuitState.HALF_OPEN:
        return true; // Permitir request de prueba

      default:
        return true; // Fail-open
    }
  }

  /**
   * Registra un éxito — puede cerrar el circuito si está en HALF_OPEN
   */
  async onSuccess(): Promise<void> {
    const state = await this.getState();

    if (state === CircuitState.HALF_OPEN) {
      const successCount = await this.incrementSuccess();
      if (successCount >= this.config.successThreshold) {
        await this.reset();
        logger.info(`[CircuitBreaker:${this.config.name}] HALF_OPEN → CLOSED (${successCount} éxitos)`);
      }
    } else if (state === CircuitState.CLOSED) {
      // Reset failure count en éxito normal
      await this.resetFailures();
    }
  }

  /**
   * Registra un fallo — puede abrir el circuito
   * @param statusCode - Código HTTP del error (opcional)
   */
  async onFailure(statusCode?: number): Promise<void> {
    // Solo contar fallos por status codes configurados
    if (statusCode && !this.config.failureStatusCodes.includes(statusCode)) {
      return; // Errores de validación (400, 401, 404) no cuentan
    }

    const state = await this.getState();

    if (state === CircuitState.HALF_OPEN) {
      // Un fallo en HALF_OPEN abre el circuito inmediatamente
      await this.openCircuit();
      logger.warn(`[CircuitBreaker:${this.config.name}] HALF_OPEN → OPEN (fallo en prueba, status: ${statusCode})`);
      return;
    }

    const failureCount = await this.incrementFailures();

    if (failureCount >= this.config.failureThreshold) {
      await this.openCircuit();
      logger.warn(
        `[CircuitBreaker:${this.config.name}] CLOSED → OPEN (${failureCount} fallos, umbral: ${this.config.failureThreshold})`
      );
    }
  }

  /**
   * Obtiene el estado actual del circuito
   */
  async getState(): Promise<CircuitState> {
    try {
      if (cacheLayer) {
        const state = await cacheLayer.get(`${this.redisKeyPrefix}:state`);
        if (state) return state as CircuitState;
      }
    } catch {
      // Fail-open: si Redis falla, usar estado local
    }
    return this.localState;
  }

  /**
   * Obtiene métricas del circuito para dashboards
   */
  async getMetrics(): Promise<{
    name: string;
    state: CircuitState;
    failureCount: number;
    lastOpenTime: number;
    config: CircuitBreakerConfig;
  }> {
    return {
      name: this.config.name,
      state: await this.getState(),
      failureCount: await this.getFailureCount(),
      lastOpenTime: await this.getLastOpenTime(),
      config: this.config,
    };
  }

  // ==================== MÉTODOS PRIVADOS ====================

  private async setState(state: CircuitState): Promise<void> {
    this.localState = state;
    try {
      if (cacheLayer) {
        await cacheLayer.set(`${this.redisKeyPrefix}:state`, state, "EX", 3600); // TTL 1h
      }
    } catch {
      // Fail-open
    }
  }

  private async openCircuit(): Promise<void> {
    await this.setState(CircuitState.OPEN);
    const now = Date.now();
    this.localLastOpenTime = now;
    this.localSuccessCount = 0;
    try {
      if (cacheLayer) {
        await cacheLayer.set(`${this.redisKeyPrefix}:lastOpen`, String(now), "EX", 3600);
        await cacheLayer.set(`${this.redisKeyPrefix}:successCount`, "0", "EX", 3600);
      }
    } catch {
      // Fail-open
    }
  }

  private async reset(): Promise<void> {
    await this.setState(CircuitState.CLOSED);
    this.localFailureCount = 0;
    this.localSuccessCount = 0;
    try {
      if (cacheLayer) {
        await cacheLayer.set(`${this.redisKeyPrefix}:failures`, "0", "EX", 3600);
        await cacheLayer.set(`${this.redisKeyPrefix}:successCount`, "0", "EX", 3600);
      }
    } catch {
      // Fail-open
    }
  }

  private async resetFailures(): Promise<void> {
    this.localFailureCount = 0;
    try {
      if (cacheLayer) {
        await cacheLayer.set(`${this.redisKeyPrefix}:failures`, "0", "EX", 3600);
      }
    } catch {
      // Fail-open
    }
  }

  private async incrementFailures(): Promise<number> {
    this.localFailureCount++;
    try {
      if (cacheLayer) {
        const count = await cacheLayer.incr(`${this.redisKeyPrefix}:failures`);
        await cacheLayer.expire(`${this.redisKeyPrefix}:failures`, 3600);
        return count;
      }
    } catch {
      // Fail-open
    }
    return this.localFailureCount;
  }

  private async incrementSuccess(): Promise<number> {
    this.localSuccessCount++;
    try {
      if (cacheLayer) {
        const count = await cacheLayer.incr(`${this.redisKeyPrefix}:successCount`);
        await cacheLayer.expire(`${this.redisKeyPrefix}:successCount`, 3600);
        return count;
      }
    } catch {
      // Fail-open
    }
    return this.localSuccessCount;
  }

  private async getLastOpenTime(): Promise<number> {
    try {
      if (cacheLayer) {
        const time = await cacheLayer.get(`${this.redisKeyPrefix}:lastOpen`);
        if (time) return parseInt(time);
      }
    } catch {
      // Fail-open
    }
    return this.localLastOpenTime;
  }

  private async getFailureCount(): Promise<number> {
    try {
      if (cacheLayer) {
        const count = await cacheLayer.get(`${this.redisKeyPrefix}:failures`);
        if (count) return parseInt(count);
      }
    } catch {
      // Fail-open
    }
    return this.localFailureCount;
  }
}

// ==================== INSTANCIAS PRE-CONFIGURADAS ====================

/** Circuit breaker para OpenAI */
export const openaiCircuitBreaker = new CircuitBreaker({
  name: "openai",
  failureThreshold: 5,
  resetTimeoutMs: 60_000,    // 1 minuto
  successThreshold: 2,
  failureStatusCodes: [429, 500, 502, 503, 504],
});

/** Circuit breaker para Anthropic */
export const anthropicCircuitBreaker = new CircuitBreaker({
  name: "anthropic",
  failureThreshold: 5,
  resetTimeoutMs: 60_000,
  successThreshold: 2,
  failureStatusCodes: [429, 500, 502, 503, 529],
});

/** Circuit breaker para Google (Gemini) */
export const googleCircuitBreaker = new CircuitBreaker({
  name: "google",
  failureThreshold: 5,
  resetTimeoutMs: 60_000,
  successThreshold: 2,
  failureStatusCodes: [429, 500, 503],
});

/**
 * Obtiene el circuit breaker por nombre de proveedor
 */
export function getCircuitBreaker(providerName: string): CircuitBreaker {
  switch (providerName.toLowerCase()) {
    case "openai":
      return openaiCircuitBreaker;
    case "anthropic":
      return anthropicCircuitBreaker;
    case "google":
    case "gemini":
      return googleCircuitBreaker;
    default:
      // Crear uno nuevo para proveedores desconocidos
      return new CircuitBreaker({ name: providerName });
  }
}

/**
 * Obtiene métricas de todos los circuit breakers para dashboards
 */
export async function getAllCircuitBreakerMetrics() {
  return Promise.all([
    openaiCircuitBreaker.getMetrics(),
    anthropicCircuitBreaker.getMetrics(),
    googleCircuitBreaker.getMetrics(),
  ]);
}
