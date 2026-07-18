import logger from "../../../utils/logger";
import EmailProviderConfig from "../../../models/EmailMarketing/EmailProviderConfig";
import AppError from "../../../errors/AppError";
import { EmailMarketingProvider } from "./EmailMarketingProvider";
import { AcelleProvider } from "./AcelleProvider";
import { ListmonkProvider } from "./ListmonkProvider";

/**
 * EmailMarketingFactory — Factory ESTRICTO para el modulo de Email Marketing.
 *
 * Diferencias con ProviderFactory clasico:
 *   - Solo acepta `acelle` y `listmonk` (no SendGrid/Mailgun/SES/Carbonio)
 *   - NO hace fallback silencioso. Si no hay provider activo => AppError
 *   - Retorna EmailMarketingProvider (interfaz extendida con listas/templates/campaigns)
 *
 * El modulo de Email Marketing (campanas, listas, templates) DEBE usar este
 * factory. Los flujos transaccionales puros (forgot-password, ToolRegistry)
 * siguen usando ProviderFactory + helpers/SendMail.ts.
 */

const ALLOWED_PROVIDERS = ["acelle", "listmonk"] as const;
type AllowedProvider = typeof ALLOWED_PROVIDERS[number];

export class EmailMarketingFactory {
  /**
   * Lista de providers permitidos en Email Marketing.
   */
  static readonly ALLOWED: ReadonlyArray<string> = ALLOWED_PROVIDERS;

  /**
   * Verificar si un nombre de provider es permitido.
   */
  static isAllowed(provider: string): boolean {
    return ALLOWED_PROVIDERS.includes(provider as AllowedProvider);
  }

  /**
   * Obtener el provider activo de Email Marketing para una company.
   * Lanza AppError si no hay provider activo o el activo no es valido.
   */
  static async getProvider(companyId: number): Promise<EmailMarketingProvider> {
    const cfg = await EmailProviderConfig.findOne({
      where: { companyId, isActive: true }
    });

    if (!cfg) {
      throw new AppError(
        "Proveedor de email no configurado. Active Acelle o Listmonk en Configuracion → Email Marketing.",
        400
      );
    }

    if (!this.isAllowed(cfg.provider)) {
      throw new AppError(
        `El proveedor '${cfg.provider}' no esta permitido en Email Marketing. Use 'acelle' o 'listmonk'.`,
        400
      );
    }

    const settings = (typeof cfg.settings === "object" && cfg.settings !== null
      ? (cfg.settings as Record<string, unknown>)
      : {});

    const config: Record<string, unknown> = {
      ...settings,
      domain: cfg.domain || "",
      region: cfg.region || "",
      verifiedSenderEmail: cfg.verifiedSenderEmail || "",
      verifiedSenderName: cfg.verifiedSenderName || "",
      dailyLimit: cfg.dailyLimit,
      hourlyLimit: cfg.hourlyLimit
    };

    const provider = this.instantiate(
      cfg.provider as AllowedProvider,
      cfg.apiKey,
      cfg.apiSecret || undefined,
      config
    );

    logger.info(
      `[EmailMarketingFactory] Provider '${cfg.provider}' instanciado para company ${companyId}`
    );

    return provider;
  }

  /**
   * Probar credenciales sin guardar.
   */
  static async testProvider(
    provider: string,
    config: {
      apiKey?: string;
      apiSecret?: string;
      [key: string]: unknown;
    }
  ): Promise<{ success: boolean; message: string }> {
    if (!this.isAllowed(provider)) {
      return {
        success: false,
        message: `Provider no permitido: ${provider}. Use 'acelle' o 'listmonk'.`
      };
    }
    if (!config.apiKey) {
      return { success: false, message: "apiKey es requerido" };
    }

    try {
      const instance = this.instantiate(
        provider as AllowedProvider,
        config.apiKey,
        config.apiSecret,
        config
      );
      const isValid = await instance.validateConfig();
      return {
        success: isValid,
        message: isValid
          ? `Conexion con ${provider} verificada`
          : `No se pudo verificar conexion con ${provider}. Revise credenciales.`
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      return { success: false, message };
    }
  }

  /**
   * Instanciar el provider correspondiente. NO hace fallback.
   */
  private static instantiate(
    provider: AllowedProvider,
    apiKey: string,
    apiSecret?: string,
    config: Record<string, unknown> = {}
  ): EmailMarketingProvider {
    switch (provider) {
      case "acelle":
        return new AcelleProvider(apiKey, apiSecret, config);
      case "listmonk":
        return new ListmonkProvider(apiKey, apiSecret, config);
      default: {
        // Type-safe exhaustive check
        const _exhaustive: never = provider;
        throw new AppError(`Provider no implementado: ${_exhaustive}`, 500);
      }
    }
  }
}

export default EmailMarketingFactory;
