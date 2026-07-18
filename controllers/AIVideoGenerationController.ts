/**
 * Controller: AIVideoGenerationController
 * Maneja todas las peticiones HTTP para generacion de videos con IA (OpenAI Sora)
 */

import { Request, Response } from "express";
import AppError from "../errors/AppError";
import fs from "fs";

// Servicios
import CreateVideoGenerationService from "../services/AIVideoGenerationService/CreateVideoGenerationService";
import ListVideoGenerationsService from "../services/AIVideoGenerationService/ListVideoGenerationsService";
import ShowVideoGenerationService from "../services/AIVideoGenerationService/ShowVideoGenerationService";
import DeleteVideoGenerationService from "../services/AIVideoGenerationService/DeleteVideoGenerationService";
import DownloadVideoService from "../services/AIVideoGenerationService/DownloadVideoService";
import GetUserCreditsBalanceService from "../services/AIImageCreditService/GetUserCreditsBalanceService";

// DTOs y validaciones
import {
  createVideoGenerationSchema,
  listVideoGenerationsSchema,
  showVideoGenerationSchema,
  deleteVideoGenerationSchema,
  downloadVideoSchema,
  validateOrThrow
} from "../dto/AIVideoGenerationDTO";

import { AI_VIDEO_PRICING, AI_VIDEO_CONFIG } from "../config/aiVideoPricing";

// ============================================================================
// POST /api/ai-video-generation
// Genera un nuevo video con IA (envio a cola de procesamiento)
// ============================================================================

export const generate = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Validar autenticacion
    if (!req.user || !req.user.companyId) {
      throw new AppError("Usuario no autenticado", 401);
    }

    const { companyId, id: userId } = req.user;

    // Validar entrada
    const validatedData = await validateOrThrow(createVideoGenerationSchema, req.body);

    console.log(`\n🎬 Nueva solicitud de generacion de video`);
    console.log(`  Company: ${companyId}, User: ${userId}`);
    console.log(`  Prompt: "${validatedData.prompt.substring(0, 50)}..."`);
    console.log(`  Modelo: ${validatedData.model}, Tamano: ${validatedData.videoSize}, Duracion: ${validatedData.duration}s`);

    // Llamar al servicio de creacion
    const result = await CreateVideoGenerationService({
      companyId,
      userId,
      prompt: validatedData.prompt,
      videoSize: validatedData.videoSize,
      duration: validatedData.duration,
      stylePreset: validatedData.stylePreset,
      model: validatedData.model
    });

    return res.status(201).json({
      success: true,
      message: "Video enviado a generacion. Recibiras una notificacion cuando este listo.",
      data: result
    });

  } catch (error: any) {
    console.error("❌ Error en generate (video):", error);

    // Errores especificos con codigos HTTP apropiados
    if (error.statusCode === 402) {
      return res.status(402).json({
        success: false,
        error: "Creditos insuficientes",
        message: error.message
      });
    }

    if (error.statusCode === 400) {
      return res.status(400).json({
        success: false,
        error: "Validacion fallida",
        message: error.message
      });
    }

    // Error generico
    return res.status(error.statusCode || 500).json({
      success: false,
      error: "Error al generar video",
      message: error.message || "Error interno del servidor"
    });
  }
};

// ============================================================================
// GET /api/ai-video-generation
// Lista generaciones de video con paginacion y filtros
// ============================================================================

export const index = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user || !req.user.companyId) {
      throw new AppError("Usuario no autenticado", 401);
    }

    const { companyId } = req.user;

    // Validar y parsear query params
    const validatedQuery = await validateOrThrow(listVideoGenerationsSchema, {
      pageNumber: req.query.pageNumber ? parseInt(req.query.pageNumber as string) : 1,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : 20,
      searchParam: req.query.searchParam,
      status: req.query.status,
      userId: req.query.userId ? parseInt(req.query.userId as string) : undefined,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined
    });

    // Llamar al servicio de listado
    const result = await ListVideoGenerationsService({
      companyId,
      ...validatedQuery
    });

    return res.status(200).json({
      success: true,
      data: result.generations,
      pagination: result.pagination
    });

  } catch (error: any) {
    console.error("❌ Error en index (video):", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: "Error al listar generaciones de video",
      message: error.message
    });
  }
};

// ============================================================================
// GET /api/ai-video-generation/:id
// Obtiene detalles de una generacion de video especifica
// ============================================================================

export const show = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user || !req.user.companyId) {
      throw new AppError("Usuario no autenticado", 401);
    }

    const { companyId } = req.user;
    const generationId = parseInt(req.params.id);

    // Validar ID
    await validateOrThrow(showVideoGenerationSchema, { generationId });

    // Llamar al servicio
    const result = await ShowVideoGenerationService({
      generationId,
      companyId
    });

    return res.status(200).json({
      success: true,
      data: result
    });

  } catch (error: any) {
    console.error("❌ Error en show (video):", error);

    if (error.statusCode === 404) {
      return res.status(404).json({
        success: false,
        error: "No encontrado",
        message: error.message
      });
    }

    return res.status(error.statusCode || 500).json({
      success: false,
      error: "Error al obtener generacion de video",
      message: error.message
    });
  }
};

// ============================================================================
// DELETE /api/ai-video-generation/:id
// Elimina una generacion de video y sus archivos
// ============================================================================

export const remove = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user || !req.user.companyId) {
      throw new AppError("Usuario no autenticado", 401);
    }

    const { companyId, id: userId, profile: userProfile } = req.user;
    const generationId = parseInt(req.params.id);

    // Validar ID
    await validateOrThrow(deleteVideoGenerationSchema, { generationId });

    // Llamar al servicio de eliminacion (incluye verificacion de permisos IDOR)
    const result = await DeleteVideoGenerationService({
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
    console.error("❌ Error en remove (video):", error);

    if (error.statusCode === 404) {
      return res.status(404).json({
        success: false,
        error: "No encontrado",
        message: error.message
      });
    }

    return res.status(error.statusCode || 500).json({
      success: false,
      error: "Error al eliminar generacion de video",
      message: error.message
    });
  }
};

// ============================================================================
// GET /api/ai-video-generation/:generationId/download/:videoId
// Descarga un video especifico
// ============================================================================

export const downloadVideo = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user.companyId) {
      throw new AppError("Usuario no autenticado", 401);
    }

    const { companyId } = req.user;
    const generationId = parseInt(req.params.generationId);
    const videoId = parseInt(req.params.videoId);

    // Validar IDs
    await validateOrThrow(downloadVideoSchema, { generationId, videoId });

    // Llamar al servicio de descarga
    const result = await DownloadVideoService({
      generationId,
      videoId,
      companyId
    });

    // Configurar headers para descarga
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);

    if (result.fileSize) {
      res.setHeader('Content-Length', result.fileSize.toString());
    }

    // ============================================================================
    // OPTIMIZACION: Streaming con timeout y cleanup
    // Previene conexiones colgadas y libera recursos correctamente
    // Videos son mas grandes que imagenes - chunks mas grandes y timeout mayor
    // ============================================================================

    // Stream del archivo con chunks optimizados para video
    const fileStream = fs.createReadStream(result.filePath, {
      highWaterMark: 256 * 1024 // 256KB chunks para mejor rendimiento con videos
    });

    // Timeout de 120 segundos para descargas de video (mas grande que imagenes)
    const DOWNLOAD_TIMEOUT_MS = 120000;
    const downloadTimeout = setTimeout(() => {
      console.warn(`⚠️ Timeout en descarga de video: ${result.fileName}`);
      fileStream.destroy();
      if (!res.headersSent) {
        res.status(504).json({
          success: false,
          error: "Timeout",
          message: "La descarga excedio el tiempo limite"
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
      console.error("❌ Error al leer archivo de video:", error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: "Error al descargar video",
          message: "No se pudo leer el archivo"
        });
      }
    });

    // Cleanup si el cliente aborta la conexion
    req.on('aborted', () => {
      clearTimeout(downloadTimeout);
      fileStream.destroy();
      console.log(`⚠️ Cliente aborto descarga de video: ${result.fileName}`);
    });

    // Tambien manejar close del request
    req.on('close', () => {
      clearTimeout(downloadTimeout);
      if (!fileStream.destroyed) {
        fileStream.destroy();
      }
    });

    fileStream.pipe(res);

  } catch (error: any) {
    console.error("❌ Error en downloadVideo:", error);

    if (!res.headersSent) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: "Error al descargar video",
        message: error.message
      });
    }
  }
};

// ============================================================================
// GET /api/ai-video-generation/credits/balance
// Obtiene el balance de creditos de la company (compartido con imagenes)
// ============================================================================

export const getCreditsBalance = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user || !req.user.companyId) {
      throw new AppError("Usuario no autenticado", 401);
    }

    const { companyId } = req.user;

    // Llamar al servicio de balance (compartido con AI Image Generation)
    const result = await GetUserCreditsBalanceService({ companyId });

    return res.status(200).json({
      success: true,
      data: result
    });

  } catch (error: any) {
    console.error("❌ Error en getCreditsBalance (video):", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: "Error al obtener balance de creditos",
      message: error.message
    });
  }
};

// ============================================================================
// GET /api/ai-video-generation/pricing
// Obtiene la tabla de precios de video
// ============================================================================

export const getPricing = async (req: Request, res: Response): Promise<Response> => {
  try {
    return res.status(200).json({
      success: true,
      data: {
        pricing: AI_VIDEO_PRICING,
        config: {
          supportedModels: AI_VIDEO_CONFIG.SUPPORTED_MODELS,
          supportedSizesSora2: AI_VIDEO_CONFIG.SUPPORTED_SIZES_SORA2,
          supportedSizesSora2Pro: AI_VIDEO_CONFIG.SUPPORTED_SIZES_SORA2PRO,
          supportedDurationsSora2: AI_VIDEO_CONFIG.SUPPORTED_DURATIONS_SORA2,
          supportedDurationsSora2Pro: AI_VIDEO_CONFIG.SUPPORTED_DURATIONS_SORA2PRO,
          stylePresets: AI_VIDEO_CONFIG.STYLE_PRESETS,
          defaultModel: AI_VIDEO_CONFIG.DEFAULT_MODEL
        }
      }
    });
  } catch (error: any) {
    console.error("❌ Error en getPricing (video):", error);
    return res.status(500).json({
      success: false,
      error: "Error al obtener precios de video",
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
  downloadVideo,
  getCreditsBalance,
  getPricing
};
