import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPPool from 'nodemailer/lib/smtp-pool';
import logger from '../../../utils/logger';
import {
  BaseEmailProvider,
  EmailMessage,
  SendEmailResponse,
  BulkEmailMessage,
  BulkSendResponse
} from './BaseEmailProvider';

/**
 * CarbonioProvider — Tier 0 (PRIMARY)
 *
 * Proveedor SMTP principal usando Carbonio mail server.
 * Utiliza nodemailer con pool de conexiones para envio eficiente.
 * No requiere configuracion externa: lee credenciales de process.env.
 */
export class CarbonioProvider extends BaseEmailProvider {
  private transporter: Transporter;
  private host: string;
  private port: number;
  private user: string;
  private pass: string;
  private defaultFrom: string;
  private defaultFromName: string;

  constructor(apiKey: string = '', apiSecret?: string, config: Record<string, any> = {}) {
    super(apiKey, apiSecret, config);

    this.host = process.env.MAIL_HOST || 'mail.chateam.ws';
    this.port = Number(process.env.MAIL_PORT) || 465;
    this.user = process.env.MAIL_USER || '';
    this.pass = process.env.MAIL_PASS || '';
    this.defaultFrom = process.env.MAIL_FROM || this.user;
    this.defaultFromName = process.env.MAIL_FROM_NAME || 'ChatEAM';

    this.transporter = nodemailer.createTransport({
      pool: true,
      host: this.host,
      port: this.port,
      secure: this.port === 465,
      auth: {
        user: this.user,
        pass: this.pass
      },
      maxConnections: 5,
      maxMessages: 100,
      rateDelta: 1000,
      rateLimit: 10,
      tls: {
        rejectUnauthorized: false
      }
    } as SMTPPool.Options);

    this.logActivity('Transporter SMTP pool inicializado', {
      host: this.host,
      port: this.port,
      user: this.user,
      maxConnections: 5,
      maxMessages: 100
    });
  }

  /**
   * Enviar un email individual via SMTP
   */
  async sendEmail(message: EmailMessage): Promise<SendEmailResponse> {
    try {
      const mailOptions: nodemailer.SendMailOptions = {
        from: `"${message.fromName || this.defaultFromName}" <${message.from || this.defaultFrom}>`,
        to: message.toName ? `"${message.toName}" <${message.to}>` : message.to,
        subject: message.subject,
        html: message.htmlContent,
        text: message.textContent || undefined,
        replyTo: message.replyTo || undefined,
        headers: {} as Record<string, string>
      };

      // Headers personalizados para tracking de campanas
      if (message.customArgs) {
        const headers: Record<string, string> = {};
        if (message.customArgs.campaignId) {
          headers['X-Campaign-Id'] = message.customArgs.campaignId;
        }
        for (const [key, value] of Object.entries(message.customArgs)) {
          headers[`X-Custom-${key}`] = value;
        }
        mailOptions.headers = headers;
      }

      // Adjuntos
      if (message.attachments && message.attachments.length > 0) {
        mailOptions.attachments = message.attachments.map(att => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType || undefined
        }));
      }

      const info = await this.transporter.sendMail(mailOptions);

      this.logActivity('Email enviado exitosamente', {
        messageId: info.messageId,
        to: message.to,
        subject: message.subject,
        response: info.response
      });

      return {
        success: true,
        messageId: info.messageId,
        providerId: info.messageId
      };
    } catch (error: unknown) {
      return this.handleError(error, 'sendEmail');
    }
  }

  /**
   * Enviar emails masivos iterando sobre recipients
   */
  async sendBulkEmails(message: BulkEmailMessage): Promise<BulkSendResponse> {
    const results: BulkSendResponse['results'] = [];
    let totalSent = 0;
    let totalFailed = 0;

    for (const recipient of message.recipients) {
      try {
        let htmlContent = message.htmlContent;
        let textContent = message.textContent || '';

        // Aplicar sustituciones si existen
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
   * Verificar conexion SMTP creando un transporter temporal
   */
  async verifySender(_email: string, _domain?: string): Promise<boolean> {
    try {
      const verifyTransporter = nodemailer.createTransport({
        host: this.host,
        port: this.port,
        secure: this.port === 465,
        auth: {
          user: this.user,
          pass: this.pass
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      await verifyTransporter.verify();
      verifyTransporter.close();

      this.logActivity('Verificacion SMTP exitosa', { host: this.host, port: this.port });
      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logActivity('Verificacion SMTP fallida', { error: errorMessage }, 'error');
      return false;
    }
  }

  /**
   * Validar configuracion intentando verificar el transporter principal
   */
  async validateConfig(): Promise<boolean> {
    try {
      await this.transporter.verify();
      this.logActivity('Configuracion SMTP validada', { host: this.host, port: this.port });
      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logActivity('Configuracion SMTP invalida', { error: errorMessage }, 'warn');
      return false;
    }
  }

  /**
   * Nombre del proveedor
   */
  getProviderName(): string {
    return 'carbonio';
  }

  /**
   * Cerrar el pool de conexiones SMTP
   */
  close(): void {
    try {
      this.transporter.close();
      this.logActivity('Pool SMTP cerrado', { host: this.host });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logActivity('Error al cerrar pool SMTP', { error: errorMessage }, 'warn');
    }
  }
}

export default CarbonioProvider;
