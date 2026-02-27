/**
 * 🔄 DUAL WHATSAPP ADAPTER - JR CHATEAM v6.0.0
 *
 * Sistema de adaptadores duales para usar Baileys o WhatsApp Cloud API
 * de manera transparente y con fallback automático.
 *
 * @version 1.0.0 - Fase 3
 * @date 14 de octubre de 2025
 * @author JR Chateam Development Team
 */

import { WASocket } from "@whiskeysockets/baileys";
import { WhatsAppCloudAPIService } from "../WhatsAppCloudAPI/CloudAPIService";
import { antiBanManager } from "../../utils/antiBan";
import logger, { logError, logInfo, logWarn, logDebug } from "../../utils/logger";

/**
 * Tipos de proveedores WhatsApp
 */
export enum WhatsAppProvider {
  BAILEYS = "baileys",
  CLOUD_API = "cloud_api"
}

/**
 * Configuración del adaptador dual
 */
export interface DualAdapterConfig {
  // Proveedor primario
  primaryProvider: WhatsAppProvider;

  // Proveedor de fallback
  fallbackProvider?: WhatsAppProvider;

  // Auto-fallback en caso de error
  enableAutoFallback: boolean;

  // Tiempo máximo de espera para fallback (ms)
  fallbackTimeout: number;

  // Aplicar anti-ban en Baileys
  applyAntiBanBailey: boolean;

  // Aplicar delays en Cloud API (menos necesario pero opcional)
  applyDelaysCloudAPI: boolean;

  // Límite de reintentos antes de fallback
  maxRetries: number;
}

/**
 * Opciones de mensaje unificadas
 */
export interface UnifiedMessageOptions {
  to: string; // Número destino (con o sin @s.whatsapp.net)
  type: "text" | "image" | "video" | "audio" | "document" | "template";

  // Para mensajes de texto
  text?: string;
  previewUrl?: boolean;

  // Para media
  mediaUrl?: string;
  caption?: string;
  filename?: string;

  // Para templates
  templateName?: string;
  templateLanguage?: string;
  templateComponents?: any[];

  // Metadatos
  quotedMessageId?: string;
  mentions?: string[];
}

/**
 * Resultado de envío unificado
 */
export interface UnifiedSendResult {
  success: boolean;
  messageId?: string;
  provider: WhatsAppProvider;
  usedFallback: boolean;
  error?: string;
  timestamp: Date;
  retriesUsed: number;
}

/**
 * Estadísticas del adaptador
 */
export interface AdapterStats {
  totalMessages: number;
  successBailey: number;
  successCloudAPI: number;
  failedBailey: number;
  failedCloudAPI: number;
  fallbacksUsed: number;
  averageResponseTime: number;
}

/**
 * 🔄 CLASE PRINCIPAL: DUAL ADAPTER
 */
export class DualWhatsAppAdapter {
  private config: DualAdapterConfig;
  private stats: AdapterStats;

  // Instancias de conexión
  private baileysSocket?: WASocket;
  private cloudAPIService?: WhatsAppCloudAPIService;

  constructor(config: Partial<DualAdapterConfig> = {}) {
    this.config = {
      primaryProvider: WhatsAppProvider.BAILEYS,
      fallbackProvider: WhatsAppProvider.CLOUD_API,
      enableAutoFallback: true,
      fallbackTimeout: 10000,
      applyAntiBanBailey: true,
      applyDelaysCloudAPI: false,
      maxRetries: 2,
      ...config
    };

    this.stats = {
      totalMessages: 0,
      successBailey: 0,
      successCloudAPI: 0,
      failedBailey: 0,
      failedCloudAPI: 0,
      fallbacksUsed: 0,
      averageResponseTime: 0
    };

    logInfo("🔄 Dual WhatsApp Adapter initialized", {
      primaryProvider: this.config.primaryProvider,
      fallbackEnabled: this.config.enableAutoFallback
    });
  }

  /**
   * 🔌 Conectar instancia Baileys
   */
  connectBaileys(socket: WASocket) {
    this.baileysSocket = socket;
    logInfo("🔌 Baileys socket connected to adapter");
  }

  /**
   * ☁️ Conectar instancia Cloud API
   */
  connectCloudAPI(service: WhatsAppCloudAPIService) {
    this.cloudAPIService = service;
    logInfo("☁️ Cloud API service connected to adapter");
  }

  /**
   * 📤 MÉTODO PRINCIPAL: Enviar mensaje usando el provider configurado
   */
  async sendMessage(options: UnifiedMessageOptions): Promise<UnifiedSendResult> {
    const startTime = Date.now();
    this.stats.totalMessages++;

    logInfo("📤 Sending message via Dual Adapter", {
      to: options.to,
      type: options.type,
      primaryProvider: this.config.primaryProvider
    });

    // Intentar con proveedor primario
    let result = await this.sendWithProvider(
      this.config.primaryProvider,
      options,
      0
    );

    // Si falló y el fallback está habilitado, intentar con fallback
    if (!result.success &&
        this.config.enableAutoFallback &&
        this.config.fallbackProvider) {

      logWarn("⚠️ Primary provider failed, trying fallback", {
        primaryProvider: this.config.primaryProvider,
        fallbackProvider: this.config.fallbackProvider
      });

      this.stats.fallbacksUsed++;

      result = await this.sendWithProvider(
        this.config.fallbackProvider,
        options,
        0
      );

      if (result.success) {
        result.usedFallback = true;
        logInfo("✅ Message sent successfully using fallback provider");
      }
    }

    // Actualizar estadísticas
    const responseTime = Date.now() - startTime;
    this.updateStats(result, responseTime);

    result.timestamp = new Date();

    return result;
  }

  /**
   * 🔧 Enviar con un proveedor específico (con reintentos)
   */
  private async sendWithProvider(
    provider: WhatsAppProvider,
    options: UnifiedMessageOptions,
    retryCount: number
  ): Promise<UnifiedSendResult> {

    try {
      let messageId: string | undefined;

      if (provider === WhatsAppProvider.BAILEYS) {
        messageId = await this.sendViaBaileys(options);
        this.stats.successBailey++;
      } else {
        messageId = await this.sendViaCloudAPI(options);
        this.stats.successCloudAPI++;
      }

      return {
        success: true,
        messageId,
        provider,
        usedFallback: false,
        timestamp: new Date(),
        retriesUsed: retryCount
      };

    } catch (error) {
      logError(`❌ Error sending message via ${provider}`, {
        error: error.message,
        retryCount
      });

      // Incrementar estadísticas de fallo
      if (provider === WhatsAppProvider.BAILEYS) {
        this.stats.failedBailey++;
      } else {
        this.stats.failedCloudAPI++;
      }

      // Reintentar si no hemos alcanzado el límite
      if (retryCount < this.config.maxRetries) {
        logInfo(`🔄 Retrying with ${provider} (attempt ${retryCount + 2}/${this.config.maxRetries + 1})`);

        // Esperar un poco antes de reintentar
        await this.delay(1000 * (retryCount + 1));

        return this.sendWithProvider(provider, options, retryCount + 1);
      }

      return {
        success: false,
        provider,
        usedFallback: false,
        error: error.message,
        timestamp: new Date(),
        retriesUsed: retryCount
      };
    }
  }

  /**
   * 📱 Enviar vía Baileys
   */
  private async sendViaBaileys(options: UnifiedMessageOptions): Promise<string> {
    if (!this.baileysSocket) {
      throw new Error("Baileys socket not connected");
    }

    const jid = this.normalizeJid(options.to);

    // Aplicar anti-ban si está habilitado
    if (this.config.applyAntiBanBailey) {
      const antiBanResult = await antiBanManager.applyAntiBan(
        this.baileysSocket,
        jid,
        options.type === "text" ? "text" : "media"
      );

      if (!antiBanResult.success) {
        throw new Error(`Anti-ban blocked message: ${antiBanResult.reason}`);
      }
    }

    let sentMessage: any;

    switch (options.type) {
      case "text":
        sentMessage = await this.baileysSocket.sendMessage(jid, {
          text: options.text || "",
          ...(options.quotedMessageId && {
            quoted: { key: { id: options.quotedMessageId } }
          }),
          ...(options.mentions && { mentions: options.mentions })
        });
        break;

      case "image":
        sentMessage = await this.baileysSocket.sendMessage(jid, {
          image: { url: options.mediaUrl || "" },
          caption: options.caption
        });
        break;

      case "video":
        sentMessage = await this.baileysSocket.sendMessage(jid, {
          video: { url: options.mediaUrl || "" },
          caption: options.caption
        });
        break;

      case "audio":
        sentMessage = await this.baileysSocket.sendMessage(jid, {
          audio: { url: options.mediaUrl || "" },
          mimetype: "audio/mp4"
        });
        break;

      case "document":
        sentMessage = await this.baileysSocket.sendMessage(jid, {
          document: { url: options.mediaUrl || "" },
          mimetype: "application/octet-stream",
          fileName: options.filename || "document",
          caption: options.caption
        });
        break;

      default:
        throw new Error(`Unsupported message type for Baileys: ${options.type}`);
    }

    return sentMessage?.key?.id || "unknown";
  }

  /**
   * ☁️ Enviar vía WhatsApp Cloud API
   */
  private async sendViaCloudAPI(options: UnifiedMessageOptions): Promise<string> {
    if (!this.cloudAPIService) {
      throw new Error("Cloud API service not connected");
    }

    // Aplicar delay opcional en Cloud API
    if (this.config.applyDelaysCloudAPI) {
      await this.delay(1000); // Delay básico de 1s
    }

    let result: any;

    switch (options.type) {
      case "text":
        result = await this.cloudAPIService.sendTextMessage(
          options.to,
          options.text || "",
          options.previewUrl
        );
        break;

      case "image":
        result = await this.cloudAPIService.sendImageMessage(
          options.to,
          options.mediaUrl || "",
          options.caption
        );
        break;

      case "video":
        result = await this.cloudAPIService.sendVideoMessage(
          options.to,
          options.mediaUrl || "",
          options.caption
        );
        break;

      case "audio":
        result = await this.cloudAPIService.sendAudioMessage(
          options.to,
          options.mediaUrl || ""
        );
        break;

      case "document":
        result = await this.cloudAPIService.sendDocumentMessage(
          options.to,
          options.mediaUrl || "",
          options.filename,
          options.caption
        );
        break;

      case "template":
        result = await this.cloudAPIService.sendTemplateMessage(
          options.to,
          options.templateName || "",
          options.templateLanguage || "es",
          options.templateComponents
        );
        break;

      default:
        throw new Error(`Unsupported message type for Cloud API: ${options.type}`);
    }

    if (!result.success) {
      throw new Error(result.error || "Cloud API send failed");
    }

    return result.messageId || "unknown";
  }

  /**
   * 🔄 Cambiar proveedor primario en tiempo real
   */
  switchPrimaryProvider(provider: WhatsAppProvider) {
    logInfo(`🔄 Switching primary provider to ${provider}`);
    this.config.primaryProvider = provider;
  }

  /**
   * 📊 Obtener estadísticas del adaptador
   */
  getStats(): AdapterStats {
    return { ...this.stats };
  }

  /**
   * 🧹 Resetear estadísticas
   */
  resetStats() {
    this.stats = {
      totalMessages: 0,
      successBailey: 0,
      successCloudAPI: 0,
      failedBailey: 0,
      failedCloudAPI: 0,
      fallbacksUsed: 0,
      averageResponseTime: 0
    };
    logInfo("🧹 Adapter statistics reset");
  }

  /**
   * 🏥 Health check del adaptador
   */
  async healthCheck(): Promise<{
    baileys: boolean;
    cloudAPI: boolean;
    overall: boolean;
  }> {
    const baileysHealthy = !!this.baileysSocket;

    let cloudAPIHealthy = false;
    if (this.cloudAPIService) {
      try {
        cloudAPIHealthy = await this.cloudAPIService.healthCheck();
      } catch {
        cloudAPIHealthy = false;
      }
    }

    return {
      baileys: baileysHealthy,
      cloudAPI: cloudAPIHealthy,
      overall: baileysHealthy || cloudAPIHealthy
    };
  }

  /**
   * 🔧 Utilidades privadas
   */

  private normalizeJid(phone: string): string {
    // Si ya tiene sufijo de WhatsApp, retornar tal cual
    if (phone.includes("@")) {
      return phone;
    }

    // Remover caracteres no numéricos
    const cleaned = phone.replace(/[^\d]/g, "");

    // Agregar sufijo de WhatsApp
    return `${cleaned}@s.whatsapp.net`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private updateStats(result: UnifiedSendResult, responseTime: number) {
    // Actualizar tiempo promedio de respuesta
    const currentAvg = this.stats.averageResponseTime;
    const totalMessages = this.stats.totalMessages;

    this.stats.averageResponseTime =
      (currentAvg * (totalMessages - 1) + responseTime) / totalMessages;
  }
}

/**
 * 🏭 FACTORY: Crear adaptadores preconfigurados
 */
export class DualAdapterFactory {
  /**
   * Adaptador con Baileys como primario y Cloud API como fallback
   */
  static createBaileysFirst(): DualWhatsAppAdapter {
    return new DualWhatsAppAdapter({
      primaryProvider: WhatsAppProvider.BAILEYS,
      fallbackProvider: WhatsAppProvider.CLOUD_API,
      enableAutoFallback: true,
      applyAntiBanBailey: true,
      applyDelaysCloudAPI: false,
      maxRetries: 2,
      fallbackTimeout: 10000
    });
  }

  /**
   * Adaptador con Cloud API como primario y Baileys como fallback
   */
  static createCloudAPIFirst(): DualWhatsAppAdapter {
    return new DualWhatsAppAdapter({
      primaryProvider: WhatsAppProvider.CLOUD_API,
      fallbackProvider: WhatsAppProvider.BAILEYS,
      enableAutoFallback: true,
      applyAntiBanBailey: true,
      applyDelaysCloudAPI: true,
      maxRetries: 2,
      fallbackTimeout: 10000
    });
  }

  /**
   * Adaptador solo Baileys (sin fallback)
   */
  static createBaileysOnly(): DualWhatsAppAdapter {
    return new DualWhatsAppAdapter({
      primaryProvider: WhatsAppProvider.BAILEYS,
      enableAutoFallback: false,
      applyAntiBanBailey: true,
      maxRetries: 3
    });
  }

  /**
   * Adaptador solo Cloud API (sin fallback)
   */
  static createCloudAPIOnly(): DualWhatsAppAdapter {
    return new DualWhatsAppAdapter({
      primaryProvider: WhatsAppProvider.CLOUD_API,
      enableAutoFallback: false,
      applyDelaysCloudAPI: true,
      maxRetries: 3
    });
  }
}

/**
 * 📤 Exports
 */
export default DualWhatsAppAdapter;

