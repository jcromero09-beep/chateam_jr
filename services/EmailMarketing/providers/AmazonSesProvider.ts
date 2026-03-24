import {
  SESClient,
  SendEmailCommand,
  SendBulkTemplatedEmailCommand,
  VerifyEmailIdentityCommand,
  GetAccountCommand
} from '@aws-sdk/client-ses';
import type {
  SendEmailCommandInput,
  SendBulkTemplatedEmailCommandInput
} from '@aws-sdk/client-ses';
import logger from '../../../utils/logger';
import {
  BaseEmailProvider,
  EmailMessage,
  SendEmailResponse,
  BulkEmailMessage,
  BulkSendResponse
} from './BaseEmailProvider';

/**
 * AmazonSesProvider — Tier 1
 *
 * Proveedor de email usando Amazon SES (Simple Email Service).
 * apiKey = AWS Access Key ID, apiSecret = AWS Secret Access Key.
 * Region configurable via config.region (default: us-east-1).
 */
export class AmazonSesProvider extends BaseEmailProvider {
  private sesClient: SESClient;
  private region: string;

  constructor(apiKey: string, apiSecret?: string, config: Record<string, any> = {}) {
    super(apiKey, apiSecret, config);

    this.region = config.region || 'us-east-1';

    this.sesClient = new SESClient({
      region: this.region,
      credentials: {
        accessKeyId: this.apiKey,
        secretAccessKey: this.apiSecret || ''
      }
    });

    this.logActivity('Amazon SES cliente inicializado', {
      region: this.region,
      accessKeyPrefix: this.apiKey.substring(0, 8) + '...'
    });
  }

  /**
   * Enviar un email individual via Amazon SES
   */
  async sendEmail(message: EmailMessage): Promise<SendEmailResponse> {
    try {
      const params: SendEmailCommandInput = {
        Source: `${message.fromName} <${message.from}>`,
        Destination: {
          ToAddresses: [
            message.toName ? `${message.toName} <${message.to}>` : message.to
          ]
        },
        Message: {
          Subject: {
            Data: message.subject,
            Charset: 'UTF-8'
          },
          Body: {
            Html: {
              Data: message.htmlContent,
              Charset: 'UTF-8'
            }
          }
        }
      };

      // Contenido texto plano
      if (message.textContent && params.Message?.Body) {
        params.Message.Body.Text = {
          Data: message.textContent,
          Charset: 'UTF-8'
        };
      }

      // Reply-To
      if (message.replyTo) {
        params.ReplyToAddresses = [message.replyTo];
      }

      // Tags desde customArgs
      if (message.customArgs) {
        params.Tags = Object.entries(message.customArgs).map(([key, value]) => ({
          Name: key,
          Value: value
        }));
      }

      const command = new SendEmailCommand(params);
      const response = await this.sesClient.send(command);
      const messageId = response.MessageId || '';

      this.logActivity('Email enviado exitosamente', {
        messageId,
        to: message.to,
        subject: message.subject,
        requestId: response.$metadata.requestId
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
   * Enviar emails masivos.
   * Intenta usar SendBulkTemplatedEmail si hay un templateName en config,
   * de lo contrario itera y envia individualmente.
   */
  async sendBulkEmails(message: BulkEmailMessage): Promise<BulkSendResponse> {
    const templateName = this.config.templateName as string | undefined;

    // Si hay un template configurado, usar bulk templated
    if (templateName) {
      return this.sendBulkTemplated(message, templateName);
    }

    // Fallback: envio individual iterado
    return this.sendBulkIndividual(message);
  }

  /**
   * Envio masivo usando SendBulkTemplatedEmail
   */
  private async sendBulkTemplated(
    message: BulkEmailMessage,
    templateName: string
  ): Promise<BulkSendResponse> {
    const results: BulkSendResponse['results'] = [];
    let totalSent = 0;
    let totalFailed = 0;

    try {
      const params: SendBulkTemplatedEmailCommandInput = {
        Source: `${message.fromName} <${message.from}>`,
        Template: templateName,
        DefaultTemplateData: JSON.stringify(message.customArgs || {}),
        Destinations: message.recipients.map(recipient => ({
          Destination: {
            ToAddresses: [
              recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email
            ]
          },
          ReplacementTemplateData: JSON.stringify(recipient.substitutions || {})
        }))
      };

      if (message.replyTo) {
        params.ReplyToAddresses = [message.replyTo];
      }

      const command = new SendBulkTemplatedEmailCommand(params);
      const response = await this.sesClient.send(command);

      if (response.Status) {
        for (let i = 0; i < response.Status.length; i++) {
          const status = response.Status[i];
          const recipient = message.recipients[i];

          if (status.Status === 'Success') {
            totalSent++;
            results.push({
              email: recipient.email,
              success: true,
              messageId: status.MessageId
            });
          } else {
            totalFailed++;
            results.push({
              email: recipient.email,
              success: false,
              error: status.Error
            });
          }
        }
      }

      this.logActivity('Envio masivo templated completado', {
        template: templateName,
        totalRequested: message.recipients.length,
        totalSent,
        totalFailed
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logActivity('Envio masivo templated fallido, usando fallback individual', {
        error: errorMessage
      }, 'warn');

      // Fallback a envio individual
      return this.sendBulkIndividual(message);
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
   * Envio masivo iterando individualmente
   */
  private async sendBulkIndividual(message: BulkEmailMessage): Promise<BulkSendResponse> {
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

    this.logActivity('Envio masivo individual completado', {
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
   * Verificar identidad de email en SES
   */
  async verifySender(email: string, _domain?: string): Promise<boolean> {
    try {
      const command = new VerifyEmailIdentityCommand({
        EmailAddress: email
      });

      await this.sesClient.send(command);

      this.logActivity('Solicitud de verificacion enviada', {
        email,
        note: 'AWS SES enviara un email de verificacion al destinatario'
      });

      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logActivity('Verificacion de sender fallida', { email, error: errorMessage }, 'error');
      return false;
    }
  }

  /**
   * Validar configuracion verificando acceso a la cuenta SES
   */
  async validateConfig(): Promise<boolean> {
    try {
      const command = new GetAccountCommand({});
      await this.sesClient.send(command);

      this.logActivity('Configuracion Amazon SES validada', { region: this.region });
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
    return 'amazon_ses';
  }
}

export default AmazonSesProvider;
