/**
 * Routes: AI Image Generation
 * Define todas las rutas para generación de imágenes con IA
 *
 * CORRECCIONES DE SEGURIDAD:
 * - Rate Limiting implementado para prevenir DoS/abuso
 * - Rutas ordenadas correctamente (específicas antes de paramétricas)
 */

import express from "express";
import rateLimit from "express-rate-limit";
import isAuth from "../middleware/isAuth";
import * as AIImageGenerationController from "../controllers/AIImageGenerationController";

const aiImageGenerationRoutes = express.Router();

// ============================================================================
// RATE LIMITERS - Prevención de abuso y DoS
// ============================================================================

/**
 * Rate Limiter para generación de imágenes (más restrictivo)
 * - 10 generaciones por cada 15 minutos por IP
 * - Previene abuso de la API de OpenAI
 */
const generateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // máximo 10 requests por ventana
  message: {
    success: false,
    error: "Demasiadas solicitudes de generación. Por favor, espera 15 minutos.",
    retryAfter: "15 minutos"
  },
  standardHeaders: true, // Incluye headers `RateLimit-*`
  legacyHeaders: false,  // Deshabilita headers `X-RateLimit-*`
  keyGenerator: (req) => {
    // Usa combinación de IP + userId para rate limiting más preciso
    const userId = (req as any).user?.id || 'anonymous';
    return `${req.ip}-${userId}`;
  }
});

/**
 * Rate Limiter para consultas/lecturas (menos restrictivo)
 * - 100 requests por minuto por IP
 * - Para endpoints de listado, detalles, balance, etc.
 */
const readLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 100, // máximo 100 requests por ventana
  message: {
    success: false,
    error: "Demasiadas solicitudes. Por favor, espera un momento.",
    retryAfter: "1 minuto"
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Rate Limiter para descargas (moderado)
 * - 50 descargas por minuto por IP
 * - Previene scraping masivo de imágenes
 */
const downloadLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 50, // máximo 50 descargas por ventana
  message: {
    success: false,
    error: "Demasiadas descargas. Por favor, espera un momento.",
    retryAfter: "1 minuto"
  },
  standardHeaders: true,
  legacyHeaders: false
});

// ============================================================================
// RUTAS AUXILIARES (DEBEN IR PRIMERO - antes de rutas con :id)
// ============================================================================
// IMPORTANTE: Estas rutas específicas deben definirse ANTES de las rutas
// con parámetros como /:id, de lo contrario Express las matcheará incorrectamente
// ============================================================================

/**
 * GET /api/ai-image-generation/credits/balance
 * Obtiene el balance de créditos de la company
 *
 * Respuesta:
 * - 200: Balance de créditos con estadísticas
 */
aiImageGenerationRoutes.get(
  "/credits/balance",
  isAuth,
  readLimiter,
  AIImageGenerationController.getCreditsBalance
);

/**
 * GET /api/ai-image-generation/pricing
 * Obtiene la tabla de precios y configuración
 *
 * Respuesta:
 * - 200: Precios y configuración disponible
 */
aiImageGenerationRoutes.get(
  "/pricing",
  isAuth,
  readLimiter,
  AIImageGenerationController.getPricing
);

// ============================================================================
// RUTAS PRINCIPALES
// ============================================================================

/**
 * POST /api/ai-image-generation
 * Genera nuevas imágenes con OpenAI DALL-E
 *
 * Body:
 * - prompt: string (requerido)
 * - imageSize: '1024x1024' | '512x512' | '256x256' (requerido)
 * - numberOfImages: number (1-10) (requerido)
 * - stylePreset: string (opcional)
 * - model: 'dall-e-2' | 'dall-e-3' (opcional, default: 'dall-e-3')
 *
 * Respuesta:
 * - 201: Imágenes generadas exitosamente
 * - 400: Validación fallida
 * - 402: Créditos insuficientes
 * - 429: Rate limit excedido
 * - 500: Error interno
 */
aiImageGenerationRoutes.post(
  "/",
  isAuth,
  generateLimiter, // Rate limiting más estricto para generación
  AIImageGenerationController.generate
);

/**
 * GET /api/ai-image-generation
 * Lista generaciones con paginación y filtros
 *
 * Query params:
 * - pageNumber: number (opcional, default: 1)
 * - pageSize: number (opcional, default: 20, max: 100)
 * - searchParam: string (opcional, busca en prompt)
 * - status: 'pending' | 'processing' | 'completed' | 'failed' (opcional)
 * - userId: number (opcional)
 * - startDate: ISO date string (opcional)
 * - endDate: ISO date string (opcional)
 *
 * Respuesta:
 * - 200: Lista de generaciones con metadata de paginación
 */
aiImageGenerationRoutes.get(
  "/",
  isAuth,
  readLimiter,
  AIImageGenerationController.index
);

/**
 * GET /api/ai-image-generation/:id
 * Obtiene detalles completos de una generación
 *
 * Params:
 * - id: number (ID de la generación)
 *
 * Respuesta:
 * - 200: Detalles de la generación
 * - 404: Generación no encontrada
 */
aiImageGenerationRoutes.get(
  "/:id",
  isAuth,
  readLimiter,
  AIImageGenerationController.show
);

/**
 * DELETE /api/ai-image-generation/:id
 * Elimina una generación y sus archivos asociados
 *
 * Params:
 * - id: number (ID de la generación)
 *
 * Respuesta:
 * - 200: Generación eliminada exitosamente
 * - 404: Generación no encontrada
 * - 500: Error al eliminar
 */
aiImageGenerationRoutes.delete(
  "/:id",
  isAuth,
  readLimiter, // También limitamos deletes para prevenir abuso
  AIImageGenerationController.remove
);

/**
 * GET /api/ai-image-generation/:generationId/download/:imageId
 * Descarga una imagen específica
 *
 * Params:
 * - generationId: number (ID de la generación)
 * - imageId: number (ID de la imagen)
 *
 * Respuesta:
 * - 200: Stream del archivo (Content-Type: image/png)
 * - 404: Imagen o archivo no encontrado
 */
aiImageGenerationRoutes.get(
  "/:generationId/download/:imageId",
  isAuth,
  downloadLimiter, // Rate limiting específico para descargas
  AIImageGenerationController.downloadImage
);

// ============================================================================
// EXPORTS
// ============================================================================

export default aiImageGenerationRoutes;
console.log("📄 AI-IMAGE-ROUTES.TS LOADED\!");
