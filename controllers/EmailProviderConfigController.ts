/**
 * Controller: EmailProviderConfigController
 * Maneja las peticiones HTTP para la configuracion de proveedores de email.
 *
 * Endpoints:
 * - GET    /email-provider-configs           - Lista configuraciones de la company
 * - POST   /email-provider-configs           - Crea nueva configuracion
 * - PUT    /email-provider-configs/:id       - Actualiza configuracion
 * - DELETE /email-provider-configs/:id       - Desactiva configuracion (soft delete)
 * - POST   /email-provider-configs/:id/test  - Prueba conexion del proveedor
 */

import { Request, Response } from "express";
import EmailProviderConfigService from "../services/EmailMarketing/EmailProviderConfigService";
import AppError from "../errors/AppError";
import logger from "../utils/logger";

/**
 * GET /email-provider-configs
 * Lista todas las configuraciones de proveedores de email para la company
 */
export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  try {
    const configs = await EmailProviderConfigService.list(companyId);

    return res.status(200).json({
      success: true,
      data: configs
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[EmailProviderConfigController.index] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al listar configuraciones de proveedor"
    });
  }
};

/**
 * POST /email-provider-configs
 * Crea una nueva configuracion de proveedor de email
 */
export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const {
    provider,
    apiKey,
    apiSecret,
    domain,
    region,
    verifiedSenderEmail,
    verifiedSenderName,
    isActive,
    dailyLimit,
    hourlyLimit,
    settings
  } = req.body;

  try {
    if (!provider || !apiKey) {
      return res.status(400).json({
        success: false,
        message: "El proveedor y la API key son obligatorios"
      });
    }

    const config = await EmailProviderConfigService.create(companyId, {
      provider,
      apiKey,
      apiSecret,
      domain,
      region,
      verifiedSenderEmail,
      verifiedSenderName,
      isActive,
      dailyLimit,
      hourlyLimit,
      settings
    });

    return res.status(201).json({
      success: true,
      message: "Configuracion de proveedor creada exitosamente",
      data: config
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[EmailProviderConfigController.store] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al crear configuracion de proveedor"
    });
  }
};

/**
 * PUT /email-provider-configs/:id
 * Actualiza una configuracion de proveedor existente
 */
export const update = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;
  const {
    provider,
    apiKey,
    apiSecret,
    domain,
    region,
    verifiedSenderEmail,
    verifiedSenderName,
    isActive,
    dailyLimit,
    hourlyLimit,
    settings
  } = req.body;

  try {
    const config = await EmailProviderConfigService.update(companyId, Number(id), {
      provider,
      apiKey,
      apiSecret,
      domain,
      region,
      verifiedSenderEmail,
      verifiedSenderName,
      isActive,
      dailyLimit,
      hourlyLimit,
      settings
    });

    return res.status(200).json({
      success: true,
      message: "Configuracion de proveedor actualizada exitosamente",
      data: config
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[EmailProviderConfigController.update] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al actualizar configuracion de proveedor"
    });
  }
};

/**
 * DELETE /email-provider-configs/:id
 * Soft delete: desactiva la configuracion (BD SAGRADA — nunca eliminar)
 */
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  try {
    await EmailProviderConfigService.remove(companyId, Number(id));

    return res.status(200).json({
      success: true,
      message: "Configuracion de proveedor desactivada exitosamente"
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[EmailProviderConfigController.remove] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al desactivar configuracion de proveedor"
    });
  }
};

/**
 * POST /email-provider-configs/:id/test
 * Prueba la conexion del proveedor con las credenciales configuradas
 */
export const testConnection = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  try {
    const result = await EmailProviderConfigService.testConnection(companyId, Number(id));

    return res.status(200).json({
      success: result.success,
      message: result.message,
      data: {
        provider: result.provider,
        connectionValid: result.success
      }
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[EmailProviderConfigController.testConnection] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al probar conexion del proveedor"
    });
  }
};

// Prueba de conexion con datos AD-HOC (sin configuracion guardada todavia)
export const testConnectionAdHoc = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { provider, apiKey, apiSecret, domain, region, settings } = req.body;

  try {
    const result = await EmailProviderConfigService.testConnectionAdHoc(companyId, {
      provider,
      apiKey,
      apiSecret,
      domain,
      region,
      settings
    });

    return res.status(200).json({
      success: result.success,
      message: result.message,
      data: {
        provider: result.provider,
        connectionValid: result.success
      }
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[EmailProviderConfigController.testConnectionAdHoc] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al probar conexion del proveedor"
    });
  }
};
