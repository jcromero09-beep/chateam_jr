import axios, { AxiosResponse } from "axios";
import logger, { logError, logInfo, logWarn, logDebug } from "../../utils/logger";

export interface TelegramMessage {
  message_id: number;
  from?: {
    id: number;
    is_bot: boolean;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
  };
  chat: {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    type: "private" | "group" | "supergroup" | "channel";
    title?: string;
  };
  date: number;
  text?: string;
  photo?: Array<{
    file_id: string;
    file_unique_id: string;
    file_size: number;
    width: number;
    height: number;
  }>;
  caption?: string;
  document?: {
    file_id: string;
    file_unique_id: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
  };
  voice?: {
    file_id: string;
    file_unique_id: string;
    duration: number;
    mime_type?: string;
    file_size?: number;
  };
  video?: {
    file_id: string;
    file_unique_id: string;
    width: number;
    height: number;
    duration: number;
    mime_type?: string;
    file_size?: number;
  };
  sticker?: {
    file_id: string;
    file_unique_id: string;
    type: string;
    width: number;
    height: number;
    is_animated: boolean;
    is_video: boolean;
  };
  location?: {
    longitude: number;
    latitude: number;
  };
  contact?: {
    phone_number: string;
    first_name: string;
    last_name?: string;
    user_id?: number;
  };
  reply_to_message?: TelegramMessage;
  forward_from?: any;
  forward_date?: number;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  inline_query?: any;
  chosen_inline_result?: any;
  callback_query?: any;
}

export interface SendMessageOptions {
  chat_id: number | string;
  text: string;
  parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
  disable_web_page_preview?: boolean;
  disable_notification?: boolean;
  reply_to_message_id?: number;
  reply_markup?: any;
}

export interface SendPhotoOptions {
  chat_id: number | string;
  photo: string;
  caption?: string;
  parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
  disable_notification?: boolean;
  reply_to_message_id?: number;
  reply_markup?: any;
}

export interface SendDocumentOptions {
  chat_id: number | string;
  document: string;
  caption?: string;
  parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
  disable_notification?: boolean;
  reply_to_message_id?: number;
  reply_markup?: any;
}

export interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

export class TelegramBotAPI {
  private botToken: string;
  private baseURL: string;

  constructor(botToken: string) {
    this.botToken = botToken;
    this.baseURL = `https://api.telegram.org/bot${botToken}`;
  }

  // Enviar mensagem de texto
  async sendMessage(options: SendMessageOptions): Promise<TelegramMessage> {
    try {
      // Log detallado de los parámetros antes del envío
      logInfo("Enviando mensaje Telegram con parámetros:", {
        chat_id: options.chat_id,
        text_length: options.text?.length || 0,
        has_reply_to: !!options.reply_to_message_id,
        parse_mode: options.parse_mode,
        text_preview: options.text?.substring(0, 100) + (options.text?.length > 100 ? '...' : '')
      });

      // Validaciones adicionales
      if (!options.chat_id) {
        throw new Error("chat_id es requerido");
      }
      
      if (!options.text || options.text.trim() === "") {
        throw new Error("text es requerido y no puede estar vacío");
      }

      if (options.text.length > 4096) {
        throw new Error(`Texto demasiado largo: ${options.text.length} caracteres (máximo 4096)`);
      }

      const response: AxiosResponse = await axios.post(
        `${this.baseURL}/sendMessage`,
        options
      );

      if (!response.data.ok) {
        logError("Telegram API devolvió error:", {
          ok: response.data.ok,
          error_code: response.data.error_code,
          description: response.data.description,
          parameters: response.data.parameters,
          sent_options: options
        });
        throw new Error(`Telegram API Error: ${response.data.description}`);
      }

      return response.data.result;
    } catch (error: any) {
      // Log más detallado del error
      logError("Error al enviar mensaje Telegram:", {
        error_message: error.message,
        error_code: error.response?.status,
        telegram_error: error.response?.data,
        sent_options: options,
        axios_config: error.config ? {
          url: error.config.url,
          method: error.config.method,
          data: error.config.data
        } : null
      });
      throw error;
    }
  }

  // Enviar foto
  async sendPhoto(options: SendPhotoOptions): Promise<TelegramMessage> {
    try {
      const response: AxiosResponse = await axios.post(
        `${this.baseURL}/sendPhoto`,
        options
      );

      if (!response.data.ok) {
        throw new Error(`Telegram API Error: ${response.data.description}`);
      }

      return response.data.result;
    } catch (error: any) {
      logError("Error al enviar foto Telegram:", error.response?.data || error.message);
      throw error;
    }
  }

  // Enviar documento
  async sendDocument(options: SendDocumentOptions): Promise<TelegramMessage> {
    try {
      const response: AxiosResponse = await axios.post(
        `${this.baseURL}/sendDocument`,
        options
      );

      if (!response.data.ok) {
        throw new Error(`Telegram API Error: ${response.data.description}`);
      }

      return response.data.result;
    } catch (error: any) {
      logError("Error al enviar documento Telegram:", error.response?.data || error.message);
      throw error;
    }
  }

  // Obter informações do arquivo
  async getFile(fileId: string): Promise<TelegramFile> {
    try {
      const response: AxiosResponse = await axios.get(
        `${this.baseURL}/getFile?file_id=${fileId}`
      );

      if (!response.data.ok) {
        throw new Error(`Telegram API Error: ${response.data.description}`);
      }

      return response.data.result;
    } catch (error: any) {
      logError("Error al obtener archivo Telegram:", error.response?.data || error.message);
      throw error;
    }
  }

  // Download de arquivo
  async downloadFile(filePath: string): Promise<Buffer> {
    try {
      const response = await axios.get(
        `https://api.telegram.org/file/bot${this.botToken}/${filePath}`,
        { responseType: "arraybuffer" }
      );

      return Buffer.from(response.data);
    } catch (error: any) {
      logError("Error al hacer descarga del archivo Telegram:", error.message);
      throw error;
    }
  }

  // Obter informações do bot
  async getMe(): Promise<any> {
    try {
      const response: AxiosResponse = await axios.get(
        `${this.baseURL}/getMe`
      );

      if (!response.data.ok) {
        throw new Error(`Telegram API Error: ${response.data.description}`);
      }

      return response.data.result;
    } catch (error: any) {
      logError("Error al obtener información del bot:", error.response?.data || error.message);
      throw error;
    }
  }

  // Configurar webhook
  async setWebhook(webhookUrl: string): Promise<boolean> {
    try {
      const response: AxiosResponse = await axios.post(
        `${this.baseURL}/setWebhook`,
        {
          url: webhookUrl,
          allowed_updates: [
            "message",
            "edited_message",
            "channel_post", 
            "edited_channel_post",
            "callback_query"
          ]
        }
      );

      return response.data.ok;
    } catch (error: any) {
      logError("Error al configurar webhook:", error.response?.data || error.message);
      throw error;
    }
  }

  // Remover webhook
  async deleteWebhook(): Promise<boolean> {
    try {
      const response: AxiosResponse = await axios.post(
        `${this.baseURL}/deleteWebhook`
      );

      return response.data.ok;
    } catch (error: any) {
      logError("Error al remover webhook:", error.response?.data || error.message);
      throw error;
    }
  }
}

export default TelegramBotAPI;

