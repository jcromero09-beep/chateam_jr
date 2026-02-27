/**
 * Service: CalculateImageCostService
 * Calcula el costo en créditos de una generación de imágenes
 * Migrado desde Laravel AiGen: PromptEngine.php::processCreditsCalculation()
 */

import { AI_IMAGE_PRICING, isSupportedSize } from "../../config/aiImagePricing";
import AppError from "../../errors/AppError";

interface CalculateCostRequest {
  imageSize: string;
  numberOfImages: number;
}

interface CalculateCostResponse {
  creditsPerImage: number;
  totalCredits: number;
  imageSize: string;
  numberOfImages: number;
  costUsd?: number;
}

/**
 * Calcula el costo total en créditos para generar imágenes
 *
 * Fórmula (del sistema Laravel):
 * - Imagen 1024x1024: 30 créditos
 * - Imagen 512x512: 20 créditos
 * - Imagen 256x256: 10 créditos
 *
 * totalCredits = numberOfImages × precio[imageSize]
 *
 * @param request Datos de la generación
 * @returns Costo calculado
 * @throws AppError si el tamaño no es soportado o los valores son inválidos
 */
const CalculateImageCostService = async ({
  imageSize,
  numberOfImages
}: CalculateCostRequest): Promise<CalculateCostResponse> => {
  // Validar que el tamaño de imagen sea soportado
  if (!isSupportedSize(imageSize)) {
    throw new AppError(
      `Tamaño de imagen no soportado: ${imageSize}. Tamaños válidos: 1024x1024, 512x512, 256x256`,
      400
    );
  }

  // Validar número de imágenes
  if (numberOfImages < 1 || numberOfImages > 10) {
    throw new AppError(
      "El número de imágenes debe estar entre 1 y 10",
      400
    );
  }

  // Obtener precio por imagen según tamaño
  const creditsPerImage = AI_IMAGE_PRICING[imageSize as keyof typeof AI_IMAGE_PRICING];

  // Calcular costo total
  const totalCredits = numberOfImages * creditsPerImage;

  // Calcular costo en USD (opcional, para referencia)
  // 1 crédito = $0.01 USD
  const costUsd = totalCredits * 0.01;

  return {
    creditsPerImage,
    totalCredits,
    imageSize,
    numberOfImages,
    costUsd
  };
};

export default CalculateImageCostService;
