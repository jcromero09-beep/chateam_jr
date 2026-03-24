import sgMail from '@sendgrid/mail';
import type { MailDataRequired } from '@sendgrid/mail';
import logger from '../../../utils/logger';
import {
  BaseEmailProvider,
  EmailMessage,
  SendEmailResponse,
  BulkEmailMessage,
  BulkSendResponse
} from './BaseEmailProvider';

/**
 * SendGridProvider — Tier 1
 *
 * Proveedor de email usando SendGrid API.
 * Soporta envio individual y masivo con sgMail.sendMultiple().
 */
export class SendGridProvider extends BaseEmailProvider {
  constructor(apiKey: string, apiSecret?: string, config: Record<string, any> = {}) {
    super(apiKey, apiSecret, config);

    sgMail.setApiKey(this.apiKey);

    this.logActivity('SendGrid cliente inicializado', {
      apiKeyPrefix: this.apiKey.substring(0, 10) + '...'
    });
  }

  /**
   * Enviar un email individual via SendGrid
   */
  async sendEmail(message: EmailMessage): Promise<SendEmailResponse> {
    try {
      const sgMessage: MailDataRequired = {
        to: {
          email: message.to,
          name: message.toName || undefined
        },
        from: {
          email: message.from,
          name: message.fromName
        },
        subject: message.subject,
        html: message.htmlContent,
        text: message.textContent || undefined,
        replyTo: message.replyTo ? { email: message.replyTo } : undefined,
        customArgs: message.customArgs || undefined,
        trackingSettings: message.trackingSettings
          ? {
              clickTracking: {
                enable: message.trackingSettings.clickTracking ?? true
              },
              openTracking: {
                enable: message.trackingSettings.openTracking ?? true
              },
              subscriptionTracking: {
                enable: message.trackingSettings.subscriptionTracking ?? false
              }
            }
          : undefined
      };

      // Adjuntos
      if (message.attachments && message.attachments.length > 0) {
        sgMessage.attachments = message.attachments.map(att => ({
          filename: att.filename,
          content: typeof att.content === 'string'
            ? att.content
            : att.content.toString('base64'),
          type: att.contentType || 'application/octet-stream',
          disposition: 'attachment' as const
        }));
      }

      const [response] = await sgMail.send(sgMessage);
      const messageId = response.headers?.['x-message-id'] || '';

      this.logActivity('Email enviado exitosamente', {
        messageId,
        to: message.to,
        subject: message.subject,
        statusCode: response.statusCode
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
   * Enviar emails masivos usando sgMail.sendMultiple()
   */
  async sendBulkEmails(message: BulkEmailMessage): Promise<BulkSendResponse> {
    const results: BulkSendResponse['results'] = [];
    let totalSent = 0;
    let totalFailed = 0;

    try {
      const sgMessages: MailDataRequired[] = message.recipients.map(recipient => {
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

        return {
          to: {
            email: recipient.email,
            name: recipient.name || undefined
          },
          from: {
            email: message.from,
            name: message.fromName
          },
          subject: message.subject,
          html: htmlContent,
          text: textContent || undefined,
          replyTo: message.replyTo ? { email: message.replyTo } : undefined,
          customArgs: message.customArgs || undefined
        };
      });

      await sgMail.sendMultiple(sgMessages);

      // sendMultiple no retorna IDs individuales, marcamos todos como exitosos
      for (const recipient of message.recipients) {
        totalSent++;
        results.push({
          email: recipient.email,
          success: true
        });
      }

      this.logActivity('Envio masivo completado via sendMultiple', {
        totalRequested: message.recipients.length,
        totalSent
      });
    } catch (error: unknown) {
      // Si sendMultiple falla, todos fallan
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      for (const recipient of message.recipients) {
        totalFailed++;
        results.push({
          email: recipient.email,
          success: false,
          error: errorMessage
        });
      }

      this.logActivity('Envio masivo fallido', {
        totalFailed,
        error: errorMessage
      }, 'error');
    }

    return {
      success: totalFailed === 0,
      totalRequested: message.recipients.length,
      totalSent,
      totalFailed,
      results
    };
  }

  /**
   * SendGrid verifica senders a nivel de cuenta, no via API directamente
   */
  async verifySender(_email: string, _domain?: string): Promise<boolean> {
    this.logActivity('Verificacion de sender delegada a panel SendGrid', {
      note: 'SendGrid verifica senders a nivel de cuenta'
    });
    return true;
  }

  /**
   * Validar configuracion verificando que la API key existe
   */
  async validateConfig(): Promise<boolean> {
    try {
      if (!this.apiKey || !this.apiKey.startsWith('SG.')) {
        this.logActivity('API key invalida', { keyPrefix: this.apiKey?.substring(0, 5) }, 'warn');
        return false;
      }

      this.logActivity('Configuracion SendGrid validada', {});
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
    return 'sendgrid';
  }
}

export default SendGridProvider;
