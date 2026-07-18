import Mailgun from 'mailgun.js';
import FormData from 'form-data';
import type { IMailgunClient } from 'mailgun.js/Interfaces';
import logger from '../../../utils/logger';
import {
  BaseEmailProvider,
  EmailMessage,
  SendEmailResponse,
  BulkEmailMessage,
  BulkSendResponse
} from './BaseEmailProvider';

/**
 * MailgunProvider — Tier 1
 *
 * Proveedor de email usando Mailgun API.
 * Requiere apiKey y domain en config para funcionar.
 */
export class MailgunProvider extends BaseEmailProvider {
  private mg: IMailgunClient;
  private domain: string;

  constructor(apiKey: string, apiSecret?: string, config: Record<string, any> = {}) {
    super(apiKey, apiSecret, config);

    this.domain = config.domain || '';

    const mailgun = new Mailgun(FormData);
    this.mg = mailgun.client({
      username: 'api',
      key: this.apiKey,
      url: config.region === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net'
    });

    this.logActivity('Mailgun cliente inicializado', {
      domain: this.domain,
      region: config.region || 'us'
    });
  }

  /**
   * Enviar un email individual via Mailgun
   */
  async sendEmail(message: EmailMessage): Promise<SendEmailResponse> {
    try {
      const mgMessage: Record<string, any> = {
        from: `${message.fromName} <${message.from}>`,
        to: message.toName ? `${message.toName} <${message.to}>` : message.to,
        subject: message.subject,
        html: message.htmlContent,
        text: message.textContent || undefined,
        'h:Reply-To': message.replyTo || undefined
      };

      // Headers personalizados via customArgs
      if (message.customArgs) {
        for (const [key, value] of Object.entries(message.customArgs)) {
          mgMessage[`v:${key}`] = value;
        }
      }

      // Tracking settings
      if (message.trackingSettings) {
        mgMessage['o:tracking-clicks'] = message.trackingSettings.clickTracking !== false ? 'yes' : 'no';
        mgMessage['o:tracking-opens'] = message.trackingSettings.openTracking !== false ? 'yes' : 'no';
      }

      // Adjuntos
      if (message.attachments && message.attachments.length > 0) {
        mgMessage.attachment = message.attachments.map(att => ({
          filename: att.filename,
          data: typeof att.content === 'string' ? Buffer.from(att.content, 'base64') : att.content,
          contentType: att.contentType || 'application/octet-stream'
        }));
      }

      const response = await this.mg.messages.create(this.domain, mgMessage);
      const messageId = response.id || '';

      this.logActivity('Email enviado exitosamente', {
        messageId,
        to: message.to,
        subject: message.subject,
        status: response.status
      });

      return {
        success: true,
        messageId,
        providerId: messageId
      };
    } catch (error: unknown) {
      return this.handleError(error, 'sendEmail');
    }
  }

  /**
   * Enviar emails masivos iterando sobre recipients (Mailgun no tiene bulk nativo)
   */
  async sendBulkEmails(message: BulkEmailMessage): Promise<BulkSendResponse> {
    const results: BulkSendResponse['results'] = [];
    let totalSent = 0;
    let totalFailed = 0;

    for (const recipient of message.recipients) {
      try {
        let htmlContent = message.htmlContent;
        let textContent = message.textContent || '';

        // Aplicar sustituciones
        if (recipient.substitutions) {
          for (const [key, value] of Object.entries(recipient.substitutions)) {
            const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            htmlContent = htmlContent.replace(placeholder, value);
            if (textContent) {
              textContent = textContent.replace(placeholder, value);
            }
          }
        }

        const emailMessage: EmailMessage = {
          to: recipient.email,
          toName: recipient.name,
          from: message.from,
          fromName: message.fromName,
          replyTo: message.replyTo,
          subject: message.subject,
          htmlContent,
          textContent: textContent || undefined,
          attachments: message.attachments,
          customArgs: message.customArgs,
          trackingSettings: message.trackingSettings
        };

        const response = await this.sendEmail(emailMessage);

        results.push({
          email: recipient.email,
          success: response.success,
          messageId: response.messageId,
          error: response.error
        });

        if (response.success) {
          totalSent++;
        } else {
          totalFailed++;
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        totalFailed++;
        results.push({
          email: recipient.email,
          success: false,
          error: errorMessage
        });
      }
    }

    this.logActivity('Envio masivo completado', {
      totalRequested: message.recipients.length,
      totalSent,
      totalFailed
    });

    return {
      success: totalFailed === 0,
      totalRequested: message.recipients.length,
      totalSent,
      totalFailed,
      results
    };
  }

  /**
   * Verificar dominio en Mailgun
   */
  async verifySender(_email: string, domain?: string): Promise<boolean> {
    try {
      const domainToVerify = domain || this.domain;
      const domainInfo = await this.mg.domains.get(domainToVerify);

      this.logActivity('Dominio verificado', {
        domain: domainToVerify,
        state: domainInfo.receiving_dns_records ? 'active' : 'pending'
      });

      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logActivity('Verificacion de dominio fallida', { error: errorMessage }, 'error');
      return false;
    }
  }

  /**
   * Validar configuracion listando dominios
   */
  async validateConfig(): Promise<boolean> {
    try {
      await this.mg.domains.list();

      this.logActivity('Configuracion Mailgun validada', { domain: this.domain });
      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logActivity('Validacion de configuracion fallida', { error: errorMessage }, 'warn');
      return false;
    }
  }

  /**
   * Nombre del proveedor
   */
  getProviderName(): string {
    return 'mailgun';
  }
}

export default MailgunProvider;
