import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import crypto from 'crypto';
import IntegrationConnection from '../../models/Integrations/IntegrationConnection';
import IntegrationSyncLog from '../../models/Integrations/IntegrationSyncLog';
import IntegrationEntityMapping from '../../models/Integrations/IntegrationEntityMapping';
import IntegrationApiRequest from '../../models/Integrations/IntegrationApiRequest';
import logger from '../../config/logger.js';

export interface SyncResult {
  success: boolean;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsFailed: number;
  errors?: Array<{ entity: any; error: string }>;
}

export abstract class BaseIntegrationService {
  protected connection: IntegrationConnection;
  protected httpClient: AxiosInstance;
  protected encryptionKey: string;

  // [W1-SEC] Antes se caía a este literal público si el env estaba vacío →
  // cualquiera que leyera el repo podía descifrar credenciales de integración.
  // Se conserva SOLO como clave legacy para descifrar datos ya cifrados con ella.
  static readonly LEGACY_WEAK_KEY = 'default-key-change-in-production';

  constructor(connection: IntegrationConnection) {
    this.connection = connection;
    // [W1-SEC] Clave fuerte: env dedicado → si falta, deriva del ENCRYPTION_KEY
    // (secreto fuerte ya presente). El literal débil queda solo como último recurso.
    this.encryptionKey =
      process.env.INTEGRATION_ENCRYPTION_KEY ||
      process.env.ENCRYPTION_KEY ||
      BaseIntegrationService.LEGACY_WEAK_KEY;
    if (this.encryptionKey === BaseIntegrationService.LEGACY_WEAK_KEY) {
      logger.warn(
        '[BaseIntegrationService] INTEGRATION_ENCRYPTION_KEY y ENCRYPTION_KEY sin definir — usando clave débil legacy. Configura una clave fuerte.'
      );
    }

    // Initialize HTTP client
    this.httpClient = axios.create({
      baseURL: connection.provider.baseUrl,
      timeout: 30000,
      headers: this.getAuthHeaders()
    });

    // Add request/response interceptors for logging
    this.setupInterceptors();
  }

  /**
   * Get authentication headers based on auth type
   */
  protected abstract getAuthHeaders(): Record<string, string>;

  /**
   * Sync entities from external system to JR CHATEAM
   */
  abstract syncInbound(entityType: string, options?: any): Promise<SyncResult>;

  /**
   * Sync entities from JR CHATEAM to external system
   */
  abstract syncOutbound(entityType: string, entityIds: number[], options?: any): Promise<SyncResult>;

  /**
   * Process webhook event from external system
   */
  abstract processWebhook(eventType: string, payload: any): Promise<void>;

  /**
   * Validate connection credentials
   */
  abstract validateConnection(): Promise<boolean>;

  /**
   * Setup HTTP interceptors for logging
   */
  protected setupInterceptors(): void {
    this.httpClient.interceptors.request.use(
      (config) => {
        // Usar as any porque metadata es una propiedad personalizada de timing
        (config as any).metadata = { startTime: Date.now() };
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.httpClient.interceptors.response.use(
      async (response) => {
        const duration = Date.now() - (response.config as any).metadata.startTime;
        await this.logApiRequest(response.config, response, duration);
        return response;
      },
      async (error) => {
        const duration = (error.config as any)?.metadata?.startTime
          ? Date.now() - (error.config as any).metadata.startTime
          : 0;
        await this.logApiRequest(error.config, error.response, duration);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Log API request to database
   */
  protected async logApiRequest(
    config: AxiosRequestConfig,
    response: any,
    duration: number
  ): Promise<void> {
    try {
      await IntegrationApiRequest.create({
        connectionId: this.connection.id,
        companyId: this.connection.companyId,
        method: config.method?.toUpperCase() || 'GET',
        endpoint: config.url || '',
        requestHeaders: config.headers,
        requestBody: config.data,
        responseStatus: response?.status,
        responseHeaders: response?.headers,
        responseBody: response?.data,
        durationMs: duration
      });
    } catch (error) {
      logger.error('Error logging API request', { error });
    }
  }

  /**
   * Create sync log entry
   */
  protected async createSyncLog(
    syncType: string,
    direction: string,
    entityType: string
  ): Promise<IntegrationSyncLog> {
    return await IntegrationSyncLog.create({
      connectionId: this.connection.id,
      companyId: this.connection.companyId,
      syncType,
      direction,
      entityType,
      startedAt: new Date(),
      status: 'running'
    });
  }

  /**
   * Update sync log with results
   */
  protected async updateSyncLog(
    syncLog: IntegrationSyncLog,
    result: SyncResult
  ): Promise<void> {
    await syncLog.update({
      completedAt: new Date(),
      status: result.success ? 'completed' : 'failed',
      recordsProcessed: result.recordsProcessed,
      recordsCreated: result.recordsCreated,
      recordsUpdated: result.recordsUpdated,
      recordsFailed: result.recordsFailed,
      errorMessage: result.errors?.map(e => e.error).join('; ')
    });

    // Update connection last sync
    await this.connection.update({
      lastSyncAt: new Date(),
      syncStatus: result.success ? 'success' : 'failed',
      lastError: result.success ? null : result.errors?.[0]?.error
    });
  }

  /**
   * Map entity between JR CHATEAM and external system
   */
  protected async mapEntity(
    entityType: string,
    localEntityId: number,
    externalEntityId: string,
    localData?: any,
    externalData?: any
  ): Promise<IntegrationEntityMapping> {
    const [mapping, created] = await IntegrationEntityMapping.findOrCreate({
      where: {
        connectionId: this.connection.id,
        entityType,
        localEntityId
      },
      defaults: {
        connectionId: this.connection.id,
        companyId: this.connection.companyId,
        entityType,
        localEntityId,
        externalEntityId,
        localData,
        externalData,
        lastSyncedAt: new Date()
      }
    });

    if (!created) {
      await mapping.update({
        externalEntityId,
        localData,
        externalData,
        lastSyncedAt: new Date()
      });
    }

    return mapping;
  }

  /**
   * Get entity mapping
   */
  protected async getEntityMapping(
    entityType: string,
    localEntityId?: number,
    externalEntityId?: string
  ): Promise<IntegrationEntityMapping | null> {
    const where: any = {
      connectionId: this.connection.id,
      entityType
    };

    if (localEntityId) where.localEntityId = localEntityId;
    if (externalEntityId) where.externalEntityId = externalEntityId;

    return await IntegrationEntityMapping.findOne({ where });
  }

  /**
   * Encrypt sensitive data
   */
  protected encrypt(text: string): string {
    // Cifra SIEMPRE con la clave fuerte actual.
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  }

  private decryptWith(text: string, keyStr: string): string {
    const key = crypto.scryptSync(keyStr, 'salt', 32);
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    let decrypted = decipher.update(parts[1], 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Decrypt sensitive data. [W1-SEC] Intenta con la clave fuerte actual y, si
   * falla, reintenta con la clave legacy débil (retrocompat de datos cifrados
   * antes del hardening). Los datos re-cifran a clave fuerte al siguiente update.
   */
  protected decrypt(text: string): string {
    try {
      return this.decryptWith(text, this.encryptionKey);
    } catch (e) {
      if (this.encryptionKey !== BaseIntegrationService.LEGACY_WEAK_KEY) {
        return this.decryptWith(text, BaseIntegrationService.LEGACY_WEAK_KEY);
      }
      throw e;
    }
  }

  /**
   * Verify webhook signature
   */
  protected verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(payload).digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(digest),
      Buffer.from(signature)
    );
  }

  /**
   * Handle rate limiting with retry
   */
  protected async withRetry<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3,
    delay: number = 1000
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        if (error.response?.status === 429) {
          // Rate limit - wait and retry
          const retryAfter = parseInt(error.response.headers['retry-after'] || delay);
          logger.warn(`Rate limited, retrying after ${retryAfter}ms`, {
            attempt,
            connectionId: this.connection.id
          });
          await new Promise(resolve => setTimeout(resolve, retryAfter));
        } else if (attempt < maxAttempts) {
          // Exponential backoff
          const backoff = delay * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, backoff));
        }
      }
    }

    throw lastError;
  }

  /**
   * Transform field names based on mappings
   */
  protected transformFields(
    data: Record<string, any>,
    mappings: Record<string, string>,
    reverse: boolean = false
  ): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(data)) {
      const mappedKey = reverse
        ? Object.entries(mappings).find(([k, v]) => v === key)?.[0] || key
        : mappings[key] || key;

      result[mappedKey] = value;
    }

    return result;
  }
}

export default BaseIntegrationService;
