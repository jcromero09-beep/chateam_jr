/**
 * Service: CalculateVideoCostService
 * Calcula el costo en creditos de una generacion de video
 * Basado en la configuracion de precios de aiVideoPricing.ts
 */

import { calculateVideoCost, isSupportedVideoSize, isSupportedDuration, AI_VIDEO_CONFIG } from "../../config/aiVideoPricing";
import AppError from "../../errors/AppError";

interface CalculateVideoCostRequest {
  videoSize: string;
  duration: number;
  model?: string;
}

interface CalculateVideoCostResponse {
  totalCredits: number;
  videoSize: string;
  duration: number;
  costUsd?: number;
}

/**
 * Calcula el costo total en creditos para generar un video
 *
 * El precio depende de la combinacion de tamano y duracion.
 * Cada combinacion tiene un precio fijo definido en AI_VIDEO_PRICING.
 *
 * Ejemplos:
 * - 1280x720 4s (sora-2): 40 creditos
 * - 1792x1024 25s (sora-2-pro): 1250 creditos
 *
 * @param request Datos de la generacion
 * @returns Costo calculado
 * @throws AppError si la combinacion tamano/duracion no es soportada
 */
const CalculateVideoCostService = async ({
  videoSize,
  duration,
  model
}: CalculateVideoCostRequest): Promise<CalculateVideoCostResponse> => {
  // Validar que el tamano de video sea soportado para el modelo
  const effectiveModel = model || AI_VIDEO_CONFIG.DEFAULT_MODEL;

  if (!isSupportedVideoSize(videoSize, effectiveModel)) {
    throw new AppError(
      `Tamano de video no soportado: ${videoSize} para modelo ${effectiveModel}`,
      400
    );
  }

  // Validar que la duracion sea soportada para el modelo
  if (!isSupportedDuration(duration, effectiveModel)) {
    throw new AppError(
      `Duracion no soportada: ${duration}s para modelo ${effectiveModel}`,
      400
    );
  }

  // Calcular costo total usando la funcion de aiVideoPricing
  let totalCredits: number;
  try {
    totalCredits = calculateVideoCost(videoSize, duration);
  } catch (error: any) {
    throw new AppError(
      `Combinacion de tamano/duracion no soportada: ${videoSize} ${duration}s`,
      400
    );
  }

  // Calcular costo en USD (opcional, para referencia)
  // Usando la conversion definida en AI_VIDEO_CONFIG
  const costUsd = totalCredits * AI_VIDEO_CONFIG.USD_PER_CREDIT;

  return {
    totalCredits,
    videoSize,
    duration,
    costUsd
  };
};

export default CalculateVideoCostService;
