/**
 * Controller: AIImageGenerationController
 * Maneja todas las peticiones HTTP para generación de imágenes con IA
 */

import { Request, Response } from "express";
import AppError from "../errors/AppError";
import fs from "fs";

// Servicios
import CreateImageGenerationService from "../services/AIImageGenerationService/CreateImageGenerationService";
import ListImageGenerationsService from "../services/AIImageGenerationService/ListImageGenerationsService";
import ShowImageGenerationService from "../services/AIImageGenerationService/ShowImageGenerationService";
import DeleteImageGenerationService from "../services/AIImageGenerationService/DeleteImageGenerationService";
import DownloadImageService from "../services/AIImageGenerationService/DownloadImageService";
import GetUserCreditsBalanceService from "../services/AIImageCreditService/GetUserCreditsBalanceService";

// DTOs y validaciones
import {
  createImageGenerationSchema,
  listImageGenerationsSchema,
  showImageGenerationSchema,
  deleteImageGenerationSchema,
  downloadImageSchema,
  validateOrThrow
} from "../dto/AIImageGenerationDTO";

import { AI_IMAGE_PRICING, AI_IMAGE_CONFIG } from "../config/aiImagePricing";

// [2026-08-01] Aquí había un `declare module 'express-serve-static-core'` que
// redefinía `req.user` con solo { id, companyId, profile? }. No era local: al
// augmentar el módulo donde Express declara Request DE VERDAD, ganaba sobre
// `@types/express.d.ts` (que augmenta el namespace global) y dejaba a `req.user` sin
// `super`, `company`, `roleId`, `clientType`… EN TODO EL PROYECTO.
//
// Ése era el origen de los 26 errores de `npm run type-check`: 26 controllers y
// middlewares leyendo campos que sí existen en el token pero que este bloque borraba
// del tipo. El tipo bueno y completo está en @types/express.d.ts; no hace falta
// declarar nada aquí.

// ============================================================================
// POST /api/ai-image-generation
// Genera nuevas imágenes con IA
// ============================================================================

export const generate = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Validar autenticación
    if (!req.user || !req.user.companyId) {
      throw new AppError("Usuario no autenticado", 401);
    }

    const { companyId, id: userId } = req.user;

    // Validar entrada
    const validatedData = await validateOrThrow(createImageGenerationSchema, req.body);

    console.log(`\n🎨 Nueva solicitud de generación de imágenes`);
    console.log(`  Company: ${companyId}, User: ${userId}`);
    console.log(`  Prompt: "${validatedData.prompt.substring(0, 50)}..."`);

    // Llamar al servicio de creación
    const result = await CreateImageGenerationService({
      companyId,
      userId,
      prompt: validatedData.prompt,
      imageSize: validatedData.imageSize,
      numberOfImages: validatedData.numberOfImages,
      stylePreset: validatedData.stylePreset,
      model: validatedData.model
    });

    return res.status(201).json({
      success: true,
      message: "Imágenes generadas exitosamente",
      data: result
    });

  } catch (error: any) {
    console.error("❌ Error en generate:", error);

    // Errores específicos con códigos HTTP apropiados
    if (error.statusCode === 402) {
      return res.status(402).json({
        success: false,
        error: "Créditos insuficientes",
        message: error.message
      });
    }

    if (error.statusCode === 400) {
      return res.status(400).json({
        success: false,
        error: "Validación fallida",
        message: error.message
      });
    }

    // Error genérico
    return res.status(error.statusCode || 500).json({
      success: false,
      error: "Error al generar imágenes",
      message: error.message || "Error interno del servidor"
    });
  }
};

// ============================================================================
// GET /api/ai-image-generation
// Lista generaciones con paginación y filtros
// ============================================================================

export const index = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user || !req.user.companyId) {
      throw new AppError("Usuario no autenticado", 401);
    }

    const { companyId } = req.user;

    // Validar y parsear query params
    const validatedQuery = await validateOrThrow(listImageGenerationsSchema, {
      pageNumber: req.query.pageNumber ? parseInt(req.query.pageNumber as string) : 1,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : 20,
      searchParam: req.query.searchParam,
      status: req.query.status,
      userId: req.query.userId ? parseInt(req.query.userId as string) : undefined,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined
    });

    // Llamar al servicio de listado
    const result = await ListImageGenerationsService({
      companyId,
      ...validatedQuery
    });

    return res.status(200).json({
      success: true,
      data: result.generations,
      pagination: result.pagination
    });

  } catch (error: any) {
    console.error("❌ Error en index:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: "Error al listar generaciones",
      message: error.message
    });
  }
};

// ============================================================================
// GET /api/ai-image-generation/:id
// Obtiene detalles de una generación específica
// ============================================================================

export const show = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user || !req.user.companyId) {
      throw new AppError("Usuario no autenticado", 401);
    }

    const { companyId } = req.user;
    const generationId = parseInt(req.params.id);

    // Validar ID
    await validateOrThrow(showImageGenerationSchema, { generationId });

    // Llamar al servicio
    const result = await ShowImageGenerationService({
      generationId,
      companyId
    });

    return res.status(200).json({
      success: true,
      data: result
    });

  } catch (error: any) {
    console.error("❌ Error en show:", error);

    if (error.statusCode === 404) {
      return res.status(404).json({
        success: false,
        error: "No encontrado",
        message: error.message
      });
    }

    return res.status(error.statusCode || 500).json({
      success: false,
      error: "Error al obtener generación",
      message: error.message
    });
  }
};

// ============================================================================
// DELETE /api/ai-image-generation/:id
// Elimina una generación y sus archivos
// ============================================================================

export const remove = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user || !req.user.companyId) {
      throw new AppError("Usuario no autenticado", 401);
    }

    const { companyId, id: userId, profile: userProfile } = req.user;
    const generationId = parseInt(req.params.id);

    // Validar ID
    await validateOrThrow(deleteImageGenerationSchema, { generationId });

    // Llamar al servicio de eliminación (incluye verificación de permisos IDOR)
    const result = await DeleteImageGenerationService({
      generationId,
      companyId,
      userId,
      userProfile: userProfile || 'user'
    });

    return res.status(200).json({
      success: true,
      message: result.message,
      data: result.deletedItems
    });

  } catch (error: any) {
    console.error("❌ Error en remove:", error);

    if (error.statusCode === 404) {
      return res.status(404).json({
        success: false,
        error: "No encontrado",
        message: error.message
      });
    }

    return res.status(error.statusCode || 500).json({
      success: false,
      error: "Error al eliminar generación",
      message: error.message
    });
  }
};

// ============================================================================
// GET /api/ai-image-generation/:generationId/download/:imageId
// Descarga una imagen específica
// ============================================================================

export const downloadImage = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user.companyId) {
      throw new AppError("Usuario no autenticado", 401);
    }

    const { companyId } = req.user;
    const generationId = parseInt(req.params.generationId);
    const imageId = parseInt(req.params.imageId);

    // Validar IDs
    await validateOrThrow(downloadImageSchema, { generationId, imageId });

    // Llamar al servicio de descarga
    const result = await DownloadImageService({
      generationId,
      imageId,
      companyId
    });

    // Configurar headers para descarga
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);

    if (result.fileSize) {
      res.setHeader('Content-Length', result.fileSize.toString());
    }

    // ============================================================================
    // OPTIMIZACIÓN: Streaming con timeout y cleanup
    // Previene conexiones colgadas y libera recursos correctamente
    // ============================================================================

    // Stream del archivo con chunks optimizados
    const fileStream = fs.createReadStream(result.filePath, {
      highWaterMark: 64 * 1024 // 64KB chunks para mejor rendimiento
    });

    // Timeout de 60 segundos para descargas
    const DOWNLOAD_TIMEOUT_MS = 60000;
    const downloadTimeout = setTimeout(() => {
      console.warn(`⚠️ Timeout en descarga de imagen: ${result.fileName}`);
      fileStream.destroy();
      if (!res.headersSent) {
        res.status(504).json({
          success: false,
          error: "Timeout",
          message: "La descarga excedió el tiempo límite"
        });
      }
    }, DOWNLOAD_TIMEOUT_MS);

    // Limpiar timeout cuando termina exitosamente
    fileStream.on('end', () => {
      clearTimeout(downloadTimeout);
    });

    // Manejar errores de lectura
    fileStream.on('error', (error) => {
      clearTimeout(downloadTimeout);
      console.error("❌ Error al leer archivo:", error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: "Error al descargar imagen",
          message: "No se pudo leer el archivo"
        });
      }
    });

    // Cleanup si el cliente aborta la conexión
    req.on('aborted', () => {
      clearTimeout(downloadTimeout);
      fileStream.destroy();
      console.log(`⚠️ Cliente abortó descarga: ${result.fileName}`);
    });

    // También manejar close del request
    req.on('close', () => {
      clearTimeout(downloadTimeout);
      if (!fileStream.destroyed) {
        fileStream.destroy();
      }
    });

    fileStream.pipe(res);

  } catch (error: any) {
    console.error("❌ Error en downloadImage:", error);

    if (!res.headersSent) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: "Error al descargar imagen",
        message: error.message
      });
    }
  }
};

// ============================================================================
// GET /api/ai-image-generation/credits/balance
// Obtiene el balance de créditos de la company
// ============================================================================

export const getCreditsBalance = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user || !req.user.companyId) {
      throw new AppError("Usuario no autenticado", 401);
    }

    const { companyId } = req.user;

    // Llamar al servicio de balance
    const result = await GetUserCreditsBalanceService({ companyId });

    return res.status(200).json({
      success: true,
      data: result
    });

  } catch (error: any) {
    console.error("❌ Error en getCreditsBalance:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: "Error al obtener balance de créditos",
      message: error.message
    });
  }
};

// ============================================================================
// GET /api/ai-image-generation/pricing
// Obtiene la tabla de precios
// ============================================================================

export const getPricing = async (req: Request, res: Response): Promise<Response> => {
  try {
    return res.status(200).json({
      success: true,
      data: {
        pricing: AI_IMAGE_PRICING,
        config: {
          supportedSizes: AI_IMAGE_CONFIG.SUPPORTED_SIZES,
          supportedModels: AI_IMAGE_CONFIG.SUPPORTED_MODELS,
          stylePresets: AI_IMAGE_CONFIG.STYLE_PRESETS,
          maxImagesPerRequest: AI_IMAGE_CONFIG.MAX_IMAGES_PER_REQUEST,
          minImagesPerRequest: AI_IMAGE_CONFIG.MIN_IMAGES_PER_REQUEST
        }
      }
    });
  } catch (error: any) {
    console.error("❌ Error en getPricing:", error);
    return res.status(500).json({
      success: false,
      error: "Error al obtener precios",
      message: error.message
    });
  }
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generate,
  index,
  show,
  remove,
  downloadImage,
  getCreditsBalance,
  getPricing
};
