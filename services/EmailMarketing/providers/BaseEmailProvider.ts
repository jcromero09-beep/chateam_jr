import logger from '../../../utils/logger';

export interface EmailMessage {
  to: string;
  toName?: string;
  from: string;
  fromName: string;
  replyTo?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  attachments?: Array<{
    filename: string;
    /**
     * Contenido inline del adjunto.
     * Si se provee `path`, este campo puede omitirse — el provider hará stream del archivo.
     */
    content?: string | Buffer;
    /**
     * Ruta absoluta al archivo. Si está presente, el provider preferirá leer
     * el archivo por stream en lugar de cargar `content` en memoria.
     */
    path?: string;
    contentType?: string;
  }>;
  customArgs?: Record<string, string>;
  trackingSettings?: {
    clickTracking?: boolean;
    openTracking?: boolean;
    subscriptionTracking?: boolean;
  };
}

export interface SendEmailResponse {
  success: boolean;
  messageId?: string;
  providerId?: string;
  error?: string;
}

export interface BulkEmailMessage extends Omit<EmailMessage, 'to' | 'toName'> {
  recipients: Array<{
    email: string;
    name?: string;
    substitutions?: Record<string, string>;
  }>;
}

export interface BulkSendResponse {
  success: boolean;
  totalRequested: number;
  totalSent: number;
  totalFailed: number;
  results: Array<{
    email: string;
    success: boolean;
    messageId?: string;
    error?: string;
  }>;
}

export abstract class BaseEmailProvider {
  protected apiKey: string;
  protected apiSecret?: string;
  protected config: Record<string, any>;

  constructor(apiKey: string, apiSecret?: string, config: Record<string, any> = {}) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.config = config;
  }

  /**
   * Send a single email
   */
  abstract sendEmail(message: EmailMessage): Promise<SendEmailResponse>;

  /**
   * Send bulk emails
   */
  abstract sendBulkEmails(message: BulkEmailMessage): Promise<BulkSendResponse>;

  /**
   * Verify sender email/domain
   */
  abstract verifySender(email: string, domain?: string): Promise<boolean>;

  /**
   * Get provider name
   */
  abstract getProviderName(): string;

  /**
   * Validate configuration
   */
  abstract validateConfig(): Promise<boolean>;

  /**
   * Log email activity
   */
  protected logActivity(
    action: string,
    details: Record<string, any>,
    level: 'info' | 'error' | 'warn' = 'info'
  ): void {
    logger[level](`[${this.getProviderName()}] ${action} | ${JSON.stringify(details)}`);
  }

  /**
   * Handle provider errors
   */
  protected handleError(error: any, context: string): SendEmailResponse {
    this.logActivity(`Error in ${context}`, {
      error: error.message,
      stack: error.stack
    }, 'error');

    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    };
  }
}
