/**
 * Routes: AI Video Generation
 * Define todas las rutas para generacion de videos con IA (OpenAI Sora)
 *
 * CORRECCIONES DE SEGURIDAD:
 * - Rate Limiting implementado para prevenir DoS/abuso
 * - Rutas ordenadas correctamente (especificas antes de parametricas)
 * - Rate limits mas restrictivos que imagenes (videos cuestan mas creditos)
 */

import express from "express";
import rateLimit from "express-rate-limit";
import isAuth from "../middleware/isAuth";
import validateAICredits from "../middleware/validateAICredits";
import * as AIVideoGenerationController from "../controllers/AIVideoGenerationController";

const aiVideoGenerationRoutes = express.Router();

// ============================================================================
// RATE LIMITERS - Prevencion de abuso y DoS
// ============================================================================

/**
 * Rate Limiter para generacion de videos (MAS restrictivo que imagenes)
 * - 5 generaciones por cada 15 minutos por IP
 * - Videos cuestan mas creditos y recursos de API
 */
const generateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // maximo 5 requests por ventana (vs 10 para imagenes)
  message: {
    success: false,
    error: "Demasiadas solicitudes de generacion de video. Por favor, espera 15 minutos.",
    retryAfter: "15 minutos"
  },
  standardHeaders: true, // Incluye headers `RateLimit-*`
  legacyHeaders: false,  // Deshabilita headers `X-RateLimit-*`
  keyGenerator: (req) => {
    // Usa combinacion de IP + userId para rate limiting mas preciso
    const userId = req.user?.id || 'anonymous';
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
  max: 100, // maximo 100 requests por ventana
  message: {
    success: false,
    error: "Demasiadas solicitudes. Por favor, espera un momento.",
    retryAfter: "1 minuto"
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Rate Limiter para descargas de video (moderado, menos que imagenes)
 * - 30 descargas por minuto por IP
 * - Videos son archivos mas grandes, mas carga de red
 */
const downloadLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 30, // maximo 30 descargas por ventana (vs 50 para imagenes)
  message: {
    success: false,
    error: "Demasiadas descargas de video. Por favor, espera un momento.",
    retryAfter: "1 minuto"
  },
  standardHeaders: true,
  legacyHeaders: false
});

// ============================================================================
// RUTAS AUXILIARES (DEBEN IR PRIMERO - antes de rutas con :id)
// ============================================================================
// IMPORTANTE: Estas rutas especificas deben definirse ANTES de las rutas
// con parametros como /:id, de lo contrario Express las matcheara incorrectamente
// ============================================================================

/**
 * GET /api/ai-video-generation/credits/balance
 * Obtiene el balance de creditos de la company (compartido con imagenes)
 *
 * Respuesta:
 * - 200: Balance de creditos con estadisticas
 */
aiVideoGenerationRoutes.get(
  "/credits/balance",
  isAuth,
  readLimiter,
  AIVideoGenerationController.getCreditsBalance
);

/**
 * GET /api/ai-video-generation/pricing
 * Obtiene la tabla de precios y configuracion de video
 *
 * Respuesta:
 * - 200: Precios y configuracion disponible para videos
 */
aiVideoGenerationRoutes.get(
  "/pricing",
  isAuth,
  readLimiter,
  AIVideoGenerationController.getPricing
);

// ============================================================================
// RUTAS PRINCIPALES
// ============================================================================

/**
 * POST /api/ai-video-generation
 * Genera un nuevo video con OpenAI Sora
 *
 * Body:
 * - prompt: string (requerido, 10-1000 chars)
 * - videoSize: string (requerido, ej: '1280x720', '1792x1024')
 * - duration: number (requerido, ej: 4, 8, 12 para sora-2)
 * - stylePreset: string (opcional)
 * - model: 'sora-2' | 'sora-2-pro' (opcional, default: 'sora-2')
 *
 * Respuesta:
 * - 201: Video enviado a generacion
 * - 400: Validacion fallida
 * - 402: Creditos insuficientes
 * - 429: Rate limit excedido
 * - 500: Error interno
 */
aiVideoGenerationRoutes.post(
  "/",
  isAuth,
  generateLimiter, // Rate limiting mas estricto para generacion de video
  validateAICredits("video", 1), // Verificar créditos antes de generar video
  AIVideoGenerationController.generate
);

/**
 * GET /api/ai-video-generation
 * Lista generaciones de video con paginacion y filtros
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
 * - 200: Lista de generaciones con metadata de paginacion
 */
aiVideoGenerationRoutes.get(
  "/",
  isAuth,
  readLimiter,
  AIVideoGenerationController.index
);

/**
 * GET /api/ai-video-generation/:id
 * Obtiene detalles completos de una generacion de video
 *
 * Params:
 * - id: number (ID de la generacion)
 *
 * Respuesta:
 * - 200: Detalles de la generacion de video
 * - 404: Generacion no encontrada
 */
aiVideoGenerationRoutes.get(
  "/:id",
  isAuth,
  readLimiter,
  AIVideoGenerationController.show
);

/**
 * DELETE /api/ai-video-generation/:id
 * Elimina una generacion de video y sus archivos asociados
 *
 * Params:
 * - id: number (ID de la generacion)
 *
 * Respuesta:
 * - 200: Generacion eliminada exitosamente
 * - 404: Generacion no encontrada
 * - 500: Error al eliminar
 */
aiVideoGenerationRoutes.delete(
  "/:id",
  isAuth,
  readLimiter, // Tambien limitamos deletes para prevenir abuso
  AIVideoGenerationController.remove
);

/**
 * GET /api/ai-video-generation/:generationId/download/:videoId
 * Descarga un video especifico
 *
 * Params:
 * - generationId: number (ID de la generacion)
 * - videoId: number (ID del video)
 *
 * Respuesta:
 * - 200: Stream del archivo (Content-Type: video/mp4)
 * - 404: Video o archivo no encontrado
 */
aiVideoGenerationRoutes.get(
  "/:generationId/download/:videoId",
  isAuth,
  downloadLimiter, // Rate limiting especifico para descargas de video
  AIVideoGenerationController.downloadVideo
);

// ============================================================================
// EXPORTS
// ============================================================================

export default aiVideoGenerationRoutes;
