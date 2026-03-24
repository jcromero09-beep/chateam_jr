import { REDIS_URI_CONNECTION } from "../../config/redis";
import logger from "../../utils/logger";

/**
 * Contexto de una cita en proceso
 */
export interface AppointmentContext {
  ticketId: number;
  step: 'awaiting_date' | 'awaiting_confirmation' | 'confirmed' | 'cancelled';
  appointmentId?: number;
  serviceId?: number;
  serviceName?: string;
  contactId?: number;
  lastAction: 'create' | 'reschedule' | 'list';
  createdAt: string;
  expiresAt: string;
  metadata?: Record<string, any>;
}

/**
 * Almacén de contexto de citas
 * Usa Redis si está disponible, si no usa Map en memoria
 *
 * Mantiene el estado de cada ticket en proceso de confirmación de cita
 */
class AppointmentContextStore {
  private redisClient: any = null;
  private memoryStore: Map<number, AppointmentContext> = new Map();
  private useRedis: boolean = false;
  private readonly KEY_PREFIX = 'appointment:context:';
  private readonly TTL_SECONDS = 1800; // 30 minutos

  constructor() {
    this.initRedis();
  }

  /**
   * Inicializa cliente Redis si está disponible
   */
  private async initRedis() {
    if (!REDIS_URI_CONNECTION) {
      logger.info('[AppointmentContextStore] Redis no configurado, usando store en memoria');
      return;
    }

    try {
      const { createClient } = await import('redis');
      this.redisClient = createClient({
        url: REDIS_URI_CONNECTION
      });

      this.redisClient.on('error', (err: any) => {
        logger.error(`[AppointmentContextStore] Error en Redis: ${err.message}`);
      });

      await this.redisClient.connect();
      this.useRedis = true;
      logger.info('[AppointmentContextStore] Conectado a Redis para contexto de citas');
    } catch (error: any) {
      logger.warn(`[AppointmentContextStore] No se pudo conectar a Redis: ${error.message}. Usando store en memoria.`);
      this.useRedis = false;
    }
  }

  /**
   * Genera la clave Redis para un ticket
   */
  private getKey(ticketId: number): string {
    return `${this.KEY_PREFIX}${ticketId}`;
  }

  /**
   * Guarda el contexto de una cita
   */
  async set(context: AppointmentContext): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.TTL_SECONDS * 1000);

    const storedContext: AppointmentContext = {
      ...context,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    };

    if (this.useRedis && this.redisClient) {
      try {
        await this.redisClient.setEx(
          this.getKey(context.ticketId),
          this.TTL_SECONDS,
          JSON.stringify(storedContext)
        );
        logger.info(`[AppointmentContextStore] Contexto guardado en Redis para ticket ${context.ticketId}`);
      } catch (error: any) {
        logger.error(`[AppointmentContextStore] Error guardando en Redis: ${error.message}`);
        this.memoryStore.set(context.ticketId, storedContext);
      }
    } else {
      this.memoryStore.set(context.ticketId, storedContext);
    }
  }

  /**
   * Obtiene el contexto de una cita
   */
  async get(ticketId: number): Promise<AppointmentContext | null> {
    if (this.useRedis && this.redisClient) {
      try {
        const data = await this.redisClient.get(this.getKey(ticketId));
        if (data) {
          return JSON.parse(data) as AppointmentContext;
        }
        return null;
      } catch (error: any) {
        logger.error(`[AppointmentContextStore] Error leyendo de Redis: ${error.message}`);
        return this.memoryStore.get(ticketId) || null;
      }
    }

    return this.memoryStore.get(ticketId) || null;
  }

  /**
   * Actualiza parcialmente el contexto
   */
  async update(ticketId: number, updates: Partial<AppointmentContext>): Promise<void> {
    const existing = await this.get(ticketId);
    if (!existing) {
      logger.warn(`[AppointmentContextStore] No existe contexto para actualizar ticket ${ticketId}`);
      return;
    }

    await this.set({
      ...existing,
      ...updates,
      ticketId
    });
  }

  /**
   * Elimina el contexto de una cita
   */
  async delete(ticketId: number): Promise<void> {
    if (this.useRedis && this.redisClient) {
      try {
        await this.redisClient.del(this.getKey(ticketId));
      } catch (error: any) {
        logger.error(`[AppointmentContextStore] Error eliminando de Redis: ${error.message}`);
      }
    }

    this.memoryStore.delete(ticketId);
    logger.info(`[AppointmentContextStore] Contexto eliminado para ticket ${ticketId}`);
  }

  /**
   * Verifica si hay un contexto activo para un ticket
   */
  async hasActiveContext(ticketId: number): Promise<boolean> {
    const context = await this.get(ticketId);
    if (!context) return false;

    // Verificar si no ha expirado
    const expiresAt = new Date(context.expiresAt);
    if (expiresAt < new Date()) {
      await this.delete(ticketId);
      return false;
    }

    return context.step === 'awaiting_confirmation' || context.step === 'awaiting_date';
  }

  /**
   * Obtiene el paso actual del contexto
   */
  async getStep(ticketId: number): Promise<string | null> {
    const context = await this.get(ticketId);
    return context?.step || null;
  }
}

// Exportar instancia singleton
export default new AppointmentContextStore();
