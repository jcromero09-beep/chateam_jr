import EmailProviderConfig from "../../models/EmailMarketing/EmailProviderConfig";
import { ProviderFactory } from "./providers/ProviderFactory";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

// ============================================================================
// Interfaces
// ============================================================================

interface CreateProviderData {
  provider: string;
  apiKey: string;
  apiSecret?: string;
  domain?: string;
  region?: string;
  verifiedSenderEmail?: string;
  verifiedSenderName?: string;
  isActive?: boolean;
  dailyLimit?: number;
  hourlyLimit?: number;
  settings?: Record<string, unknown>;
}

interface UpdateProviderData {
  provider?: string;
  apiKey?: string;
  apiSecret?: string;
  domain?: string;
  region?: string;
  verifiedSenderEmail?: string;
  verifiedSenderName?: string;
  isActive?: boolean;
  dailyLimit?: number;
  hourlyLimit?: number;
  settings?: Record<string, unknown>;
}

interface TestConnectionResponse {
  success: boolean;
  provider: string;
  message: string;
}

// ============================================================================
// EmailProviderConfigService — CRUD de configuraciones de proveedores
// ============================================================================

/**
 * Servicio CRUD para gestionar las configuraciones de proveedores
 * de email (SendGrid, Carbonio/SMTP, etc.) por company.
 */
const EmailProviderConfigService = {
  /**
   * Listar todas las configuraciones de proveedores de una company.
   * No expone apiKey ni apiSecret completos por seguridad.
   */
  async list(companyId: number): Promise<EmailProviderConfig[]> {
    const configs = await EmailProviderConfig.findAll({
      where: { companyId },
      order: [["isActive", "DESC"], ["createdAt", "DESC"]]
    });

    logger.info(
      `[EmailProviderConfigService] Listando configs: companyId=${companyId}, ` +
      `total=${configs.length}`
    );

    return configs;
  },

  /**
   * Crear una nueva configuracion de proveedor.
   */
  async create(
    companyId: number,
    data: CreateProviderData
  ): Promise<EmailProviderConfig> {
    if (!data.provider || !data.apiKey) {
      throw new AppError(
        "El proveedor y la API key son obligatorios",
        400
      );
    }

    // Si se marca como activo, desactivar los demas
    if (data.isActive !== false) {
      await EmailProviderConfig.update(
        { isActive: false },
        { where: { companyId, isActive: true } }
      );
    }

    const config = await EmailProviderConfig.create(({
      companyId,
      provider: data.provider,
      apiKey: data.apiKey,
      apiSecret: data.apiSecret || null,
      domain: data.domain || null,
      region: data.region || null,
      verifiedSenderEmail: data.verifiedSenderEmail || null,
      verifiedSenderName: data.verifiedSenderName || null,
      isActive: data.isActive !== false,
      dailyLimit: data.dailyLimit || 10000,
      hourlyLimit: data.hourlyLimit || 1000,
      settings: data.settings || {}
    }) as unknown as Partial<EmailProviderConfig>) as EmailProviderConfig;

    logger.info(
      `[EmailProviderConfigService] Config creada: id=${config.id}, ` +
      `companyId=${companyId}, provider=${data.provider}`
    );

    return config;
  },

  /**
   * Actualizar una configuracion de proveedor existente.
   */
  async update(
    companyId: number,
    id: number,
    data: UpdateProviderData
  ): Promise<EmailProviderConfig> {
    const config = await EmailProviderConfig.findOne({
      where: { id, companyId }
    });

    if (!config) {
      throw new AppError("ERR_EMAIL_PROVIDER_CONFIG_NOT_FOUND", 404);
    }

    // Si se activa este proveedor, desactivar los demas
    if (data.isActive === true && !config.isActive) {
      await EmailProviderConfig.update(
        { isActive: false },
        { where: { companyId, isActive: true } }
      );
    }

    await config.update({
      ...(data.provider !== undefined && { provider: data.provider }),
      ...(data.apiKey !== undefined && { apiKey: data.apiKey }),
      ...(data.apiSecret !== undefined && { apiSecret: data.apiSecret }),
      ...(data.domain !== undefined && { domain: data.domain }),
      ...(data.region !== undefined && { region: data.region }),
      ...(data.verifiedSenderEmail !== undefined && {
        verifiedSenderEmail: data.verifiedSenderEmail
      }),
      ...(data.verifiedSenderName !== undefined && {
        verifiedSenderName: data.verifiedSenderName
      }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.dailyLimit !== undefined && { dailyLimit: data.dailyLimit }),
      ...(data.hourlyLimit !== undefined && { hourlyLimit: data.hourlyLimit }),
      ...(data.settings !== undefined && { settings: data.settings })
    });

    await config.reload();

    logger.info(
      `[EmailProviderConfigService] Config actualizada: id=${id}, ` +
      `companyId=${companyId}`
    );

    return config;
  },

  /**
   * Eliminar (soft delete) una configuracion de proveedor.
   * En realidad desactiva la config en vez de borrarla (BD SAGRADA).
   */
  async remove(companyId: number, id: number): Promise<void> {
    const config = await EmailProviderConfig.findOne({
      where: { id, companyId }
    });

    if (!config) {
      throw new AppError("ERR_EMAIL_PROVIDER_CONFIG_NOT_FOUND", 404);
    }

    // Soft delete: desactivar en vez de borrar
    await config.update({ isActive: false });

    logger.info(
      `[EmailProviderConfigService] Config desactivada (soft delete): id=${id}, ` +
      `companyId=${companyId}`
    );
  },

  /**
   * Probar la conexion de un proveedor configurado.
   * Usa ProviderFactory.testProvider() para validar la configuracion.
   */
  async testConnection(
    companyId: number,
    id: number
  ): Promise<TestConnectionResponse> {
    const config = await EmailProviderConfig.findOne({
      where: { id, companyId }
    });

    if (!config) {
      throw new AppError("ERR_EMAIL_PROVIDER_CONFIG_NOT_FOUND", 404);
    }

    const isValid = await ProviderFactory.testProvider(config.provider, {
      apiKey: config.apiKey,
      apiSecret: config.apiSecret || undefined,
      domain: config.domain || undefined,
      region: config.region || undefined
    });

    logger.info(
      `[EmailProviderConfigService] Test conexion: id=${id}, ` +
      `companyId=${companyId}, provider=${config.provider}, resultado=${isValid}`
    );

    return {
      success: isValid,
      provider: config.provider,
      message: isValid
        ? `Conexion con ${config.provider} verificada exitosamente`
        : `No se pudo verificar la conexion con ${config.provider}. ` +
          `Revise las credenciales y configuracion.`
    };
  }
};

export default EmailProviderConfigService;
