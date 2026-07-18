/**
 * ☁️ WHATSAPP CLOUD API SERVICE - JR CHATEAM v6.0.0
 *
 * Servicio para enviar mensajes via WhatsApp Cloud API (oficial de Meta)
 * - Cumplimiento 100% con políticas WhatsApp
 * - Sin riesgo de bloqueos
 * - Alta disponibilidad
 * - Escalabilidad ilimitada
 *
 * @version 3.0.0 - Fase 3
 * @date 14 de octubre de 2025
 * @author JR Chateam Development Team
 */

import axios, { AxiosInstance } from "axios";
import logger, { logDebug, logError, logInfo } from "../../utils/logger";
import FormData from "form-data";
import fs from "fs";

/**
 * Configuración de Cloud API
 */
interface CloudAPIConfig {
  phoneNumberId: string;
  accessToken: string;
  apiVersion: string;
  businessAccountId?: string;
}

/**
 * Mensaje de texto Cloud API
 */
interface TextMessage {
  to: string;
  type: "text";
  text: {
    body: string;
    preview_url?: boolean;
  };
}

/**
 * Mensaje de media Cloud API
 */
interface MediaMessage {
  to: string;
  type: "image" | "video" | "audio" | "document";
  image?: { link: string; caption?: string };
  video?: { link: string; caption?: string };
  audio?: { link: string };
  document?: { link: string; caption?: string; filename?: string };
}

/**
 * Mensaje de template Cloud API
 */
interface TemplateMessage {
  to: string;
  type: "template";
  template: {
    name: string;
    language: { code: string };
    components?: Array<{
      type: string;
      parameters: Array<{ type: string; text?: string; image?: any; video?: any }>;
    }>;
  };
}

/**
 * Respuesta de envío
 */
interface SendMessageResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  status?: string;
}

/**
 * ☁️ WHATSAPP CLOUD API SERVICE CLASS
 */
export class WhatsAppCloudAPIService {
  private config: CloudAPIConfig;
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(config: CloudAPIConfig) {
    this.config = {
      apiVersion: "v24.0",
      ...config
    };

    this.baseUrl = `https://graph.facebook.com/${this.config.apiVersion}/${this.config.phoneNumberId}`;

    // Crear cliente HTTP
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        "Authorization": `Bearer ${this.config.accessToken}`,
        "Content-Type": "application/json"
      },
      timeout: 30000
    });

    // Interceptor para logging
    this.client.interceptors.request.use(
      (config) => {
        logDebug("☁️ Cloud API Request", {
          method: config.method,
          url: config.url,
          data: config.data
        });
        return config;
      },
      (error) => {
        logError("❌ Cloud API Request Error", { error: error.message });
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logDebug("☁️ Cloud API Response", {
          status: response.status,
          data: response.data
        });
        return response;
      },
      (error) => {
        logError("❌ Cloud API Response Error", {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message
        });
        return Promise.reject(error);
      }
    );

    logInfo("☁️ WhatsApp Cloud API Service initialized", {
      phoneNumberId: this.config.phoneNumberId,
      apiVersion: this.config.apiVersion
    });
  }

  /**
   * 📤 Enviar mensaje de texto
   */
  async sendTextMessage(
    to: string,
    text: string,
    previewUrl: boolean = false
  ): Promise<SendMessageResponse> {
    try {
      // Normalizar número (remover @ y sufijos)
      const normalizedTo = this.normalizePhoneNumber(to);

      const message: TextMessage = {
        to: normalizedTo,
        type: "text",
        text: {
          body: text,
          preview_url: previewUrl
        }
      };

      logInfo("📤 Sending text message via Cloud API", {
        to: normalizedTo,
        length: text.length
      });

      const response = await this.client.post("/messages", message);

      const messageId = response.data?.messages?.[0]?.id;

      logInfo("✅ Text message sent via Cloud API", {
        to: normalizedTo,
        messageId
      });

      return {
        success: true,
        messageId,
        status: "sent"
      };

    } catch (error) {
      logError("❌ Error sending text message via Cloud API", {
        to,
        error: error.message,
        response: error.response?.data
      });

      return {
        success: false,
        error: error.message,
        status: "failed"
      };
    }
  }

  /**
   * 🖼️ Enviar mensaje de imagen
   */
  async sendImageMessage(
    to: string,
    imageUrl: string,
    caption?: string
  ): Promise<SendMessageResponse> {
    try {
      const normalizedTo = this.normalizePhoneNumber(to);

      const message: MediaMessage = {
        to: normalizedTo,
        type: "image",
        image: {
          link: imageUrl,
          caption
        }
      };

      logInfo("📤 Sending image message via Cloud API", {
        to: normalizedTo,
        imageUrl
      });

      const response = await this.client.post("/messages", message);
      const messageId = response.data?.messages?.[0]?.id;

      logInfo("✅ Image message sent via Cloud API", {
        to: normalizedTo,
        messageId
      });

      return {
        success: true,
        messageId,
        status: "sent"
      };

    } catch (error) {
      logError("❌ Error sending image message via Cloud API", {
        to,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        status: "failed"
      };
    }
  }

  /**
   * 🎬 Enviar mensaje de video
   */
  async sendVideoMessage(
    to: string,
    videoUrl: string,
    caption?: string
  ): Promise<SendMessageResponse> {
    try {
      const normalizedTo = this.normalizePhoneNumber(to);

      const message: MediaMessage = {
        to: normalizedTo,
        type: "video",
        video: {
          link: videoUrl,
          caption
        }
      };

      const response = await this.client.post("/messages", message);
      const messageId = response.data?.messages?.[0]?.id;

      return {
        success: true,
        messageId,
        status: "sent"
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        status: "failed"
      };
    }
  }

  /**
   * 🎵 Enviar mensaje de audio
   */
  async sendAudioMessage(
    to: string,
    audioUrl: string
  ): Promise<SendMessageResponse> {
    try {
      const normalizedTo = this.normalizePhoneNumber(to);

      const message: MediaMessage = {
        to: normalizedTo,
        type: "audio",
        audio: {
          link: audioUrl
        }
      };

      const response = await this.client.post("/messages", message);
      const messageId = response.data?.messages?.[0]?.id;

      return {
        success: true,
        messageId,
        status: "sent"
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        status: "failed"
      };
    }
  }

  /**
   * 📄 Enviar mensaje de documento
   */
  async sendDocumentMessage(
    to: string,
    documentUrl: string,
    filename?: string,
    caption?: string
  ): Promise<SendMessageResponse> {
    try {
      const normalizedTo = this.normalizePhoneNumber(to);

      const message: MediaMessage = {
        to: normalizedTo,
        type: "document",
        document: {
          link: documentUrl,
          filename,
          caption
        }
      };

      const response = await this.client.post("/messages", message);
      const messageId = response.data?.messages?.[0]?.id;

      return {
        success: true,
        messageId,
        status: "sent"
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        status: "failed"
      };
    }
  }

  /**
   * 📋 Enviar template message
   */
  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string = "es",
    components?: any[]
  ): Promise<SendMessageResponse> {
    try {
      const normalizedTo = this.normalizePhoneNumber(to);

      const message: TemplateMessage = {
        to: normalizedTo,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          components
        }
      };

      logInfo("📤 Sending template message via Cloud API", {
        to: normalizedTo,
        template: templateName
      });

      const response = await this.client.post("/messages", message);
      const messageId = response.data?.messages?.[0]?.id;

      logInfo("✅ Template message sent via Cloud API", {
        to: normalizedTo,
        messageId
      });

      return {
        success: true,
        messageId,
        status: "sent"
      };

    } catch (error) {
      logError("❌ Error sending template message via Cloud API", {
        to,
        template: templateName,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        status: "failed"
      };
    }
  }

  /**
   * ✅ Marcar mensaje como leído
   */
  async markAsRead(messageId: string): Promise<boolean> {
    try {
      await this.client.post("/messages", {
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId
      });

      logDebug("✅ Message marked as read via Cloud API", { messageId });
      return true;

    } catch (error) {
      logError("❌ Error marking message as read", {
        messageId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * 📊 Obtener información del número de teléfono
   */
  async getPhoneNumberInfo(): Promise<any> {
    try {
      const response = await this.client.get("");
      return response.data;
    } catch (error) {
      logError("❌ Error getting phone number info", {
        error: error.message
      });
      return null;
    }
  }

  /**
   * 🔍 Verificar salud de la API
   */
  async healthCheck(): Promise<boolean> {
    try {
      const info = await this.getPhoneNumberInfo();
      return !!info;
    } catch (error) {
      return false;
    }
  }

  /**
   * 🔧 Normalizar número de teléfono
   */
  private normalizePhoneNumber(phone: string): string {
    // Remover sufijos de WhatsApp
    let normalized = phone.replace(/@s\.whatsapp\.net|@c\.us|@g\.us/g, "");

    // Remover caracteres no numéricos excepto +
    normalized = normalized.replace(/[^\d+]/g, "");

    // Asegurar que tenga código de país
    if (!normalized.startsWith("+")) {
      // Asumir código de país si no tiene (configurar según región)
      // normalized = "+" + normalized;
    }

    return normalized;
  }

  /**
   * 📈 Obtener métricas de uso
   */
  getMetrics() {
    return {
      phoneNumberId: this.config.phoneNumberId,
      apiVersion: this.config.apiVersion,
      baseUrl: this.baseUrl
    };
  }
}

/**
 * 🏭 Factory para crear instancias de Cloud API
 */
export class CloudAPIFactory {
  private static instances: Map<string, WhatsAppCloudAPIService> = new Map();

  /**
   * Obtener o crear instancia de Cloud API
   */
  static getInstance(
    phoneNumberId: string,
    accessToken: string,
    apiVersion?: string
  ): WhatsAppCloudAPIService {
    const key = `${phoneNumberId}:${accessToken}`;

    if (!this.instances.has(key)) {
      const service = new WhatsAppCloudAPIService({
        phoneNumberId,
        accessToken,
        apiVersion: apiVersion || "v24.0"
      });

      this.instances.set(key, service);
      logInfo("🏭 Created new Cloud API instance", { phoneNumberId });
    }

    return this.instances.get(key)!;
  }

  /**
   * Limpiar instancias
   */
  static clearInstances() {
    this.instances.clear();
    logInfo("🧹 Cleared all Cloud API instances");
  }

  /**
   * Obtener todas las instancias
   */
  static getAllInstances(): WhatsAppCloudAPIService[] {
    return Array.from(this.instances.values());
  }
}

/**
 * 📤 Exports
 */
export default WhatsAppCloudAPIService;
