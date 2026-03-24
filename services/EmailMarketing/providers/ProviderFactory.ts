import logger from '../../../utils/logger';
import EmailProviderConfig from '../../../models/EmailMarketing/EmailProviderConfig';
import { BaseEmailProvider } from './BaseEmailProvider';
import { CarbonioProvider } from './CarbonioProvider';

// Los providers externos se cargan LAZY para evitar crash si los SDK no están instalados
// Solo Carbonio (Tier 0) se importa estáticamente — es el provider por defecto

/**
 * ProviderFactory — Factory para instanciar proveedores de email
 *
 * Busca la configuracion activa de la company en BD.
 * Si no existe configuracion, retorna CarbonioProvider (Tier 0 por defecto).
 *
 * Los providers externos (SendGrid, Mailgun, SES) se cargan con require()
 * lazy para evitar crash si los SDK no están instalados.
 */
export class ProviderFactory {
  /**
   * Obtener el proveedor de email configurado para una company.
   * Si no hay configuracion activa, retorna CarbonioProvider (default).
   */
  static async getProvider(companyId: number): Promise<BaseEmailProvider> {
    try {
      const providerConfig = await EmailProviderConfig.findOne({
        where: {
          companyId,
          isActive: true
        }
      });

      if (!providerConfig) {
        logger.info(`[ProviderFactory] No hay configuracion activa para company ${companyId}, usando Carbonio por defecto`);
        return ProviderFactory.getDefaultProvider();
      }

      const config: Record<string, any> = {
        domain: providerConfig.domain || '',
        region: providerConfig.region || '',
        verifiedSenderEmail: providerConfig.verifiedSenderEmail || '',
        verifiedSenderName: providerConfig.verifiedSenderName || '',
        dailyLimit: providerConfig.dailyLimit,
        hourlyLimit: providerConfig.hourlyLimit,
        ...(typeof providerConfig.settings === 'object' && providerConfig.settings !== null
          ? providerConfig.settings
          : {})
      };

      const provider = ProviderFactory.createProvider(
        providerConfig.provider,
        providerConfig.apiKey,
        providerConfig.apiSecret,
        config
      );

      logger.info(`[ProviderFactory] Proveedor '${providerConfig.provider}' instanciado para company ${companyId}`);
      return provider;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[ProviderFactory] Error al obtener proveedor para company ${companyId}: ${errorMessage}`);

      // Fallback a Carbonio en caso de error
      logger.warn(`[ProviderFactory] Usando Carbonio como fallback para company ${companyId}`);
      return ProviderFactory.getDefaultProvider();
    }
  }

  /**
   * Obtener el proveedor por defecto (Carbonio SMTP)
   */
  static getDefaultProvider(): CarbonioProvider {
    return new CarbonioProvider();
  }

  /**
   * Probar un proveedor con configuracion temporal.
   * Util para validar credenciales antes de guardar en BD.
   */
  static async testProvider(
    provider: string,
    config: {
      apiKey?: string;
      apiSecret?: string;
      domain?: string;
      region?: string;
      [key: string]: any;
    }
  ): Promise<boolean> {
    try {
      const providerInstance = ProviderFactory.createProvider(
        provider,
        config.apiKey || '',
        config.apiSecret,
        config
      );

      const isValid = await providerInstance.validateConfig();

      logger.info(`[ProviderFactory] Test de proveedor '${provider}': ${isValid ? 'exitoso' : 'fallido'}`);

      // Cerrar pool si es Carbonio
      if (providerInstance instanceof CarbonioProvider) {
        providerInstance.close();
      }

      return isValid;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[ProviderFactory] Test de proveedor '${provider}' fallido: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Crear instancia del proveedor segun nombre.
   * Los providers Tier 1 (SendGrid, Mailgun, SES) se cargan LAZY
   * con require() para evitar crash si los SDK no estan instalados.
   */
  private static createProvider(
    providerName: string,
    apiKey: string,
    apiSecret?: string,
    config: Record<string, any> = {}
  ): BaseEmailProvider {
    switch (providerName.toLowerCase()) {
      case 'sendgrid': {
        try {
          const { SendGridProvider } = require('./SendGridProvider');
          return new SendGridProvider(apiKey, apiSecret, config);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          logger.error(`[ProviderFactory] Error cargando SendGridProvider: ${msg}. Instale @sendgrid/mail`);
          throw new Error(`SendGrid SDK no disponible: ${msg}`);
        }
      }

      case 'mailgun': {
        try {
          const { MailgunProvider } = require('./MailgunProvider');
          return new MailgunProvider(apiKey, apiSecret, config);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          logger.error(`[ProviderFactory] Error cargando MailgunProvider: ${msg}. Instale mailgun.js`);
          throw new Error(`Mailgun SDK no disponible: ${msg}`);
        }
      }

      case 'amazon_ses':
      case 'ses': {
        try {
          const { AmazonSesProvider } = require('./AmazonSesProvider');
          return new AmazonSesProvider(apiKey, apiSecret, config);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          logger.error(`[ProviderFactory] Error cargando AmazonSesProvider: ${msg}. Instale @aws-sdk/client-ses`);
          throw new Error(`AWS SES SDK no disponible: ${msg}`);
        }
      }

      case 'carbonio':
      case 'smtp':
        return new CarbonioProvider(apiKey, apiSecret, config);

      default:
        logger.warn(`[ProviderFactory] Proveedor '${providerName}' no reconocido, usando Carbonio`);
        return new CarbonioProvider(apiKey, apiSecret, config);
    }
  }
}

export default ProviderFactory;
