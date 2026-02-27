/**
 * Service: CheckCreditsService
 * Verifica si una company tiene créditos suficientes para generar imágenes
 * Migrado desde Laravel AiGen: PromptEngine.php::isCreditsEnough()
 */

import Company from "../../models/Company";
import AppError from "../../errors/AppError";
import CalculateImageCostService from "./CalculateImageCostService";

interface CheckCreditsRequest {
  companyId: number;
  imageSize: string;
  numberOfImages: number;
}

interface CheckCreditsResponse {
  hasEnoughCredits: boolean;
  requiredCredits: number;
  availableCredits: number;
  deficit?: number;
  imageSize: string;
  numberOfImages: number;
}

/**
 * Verifica si la company tiene créditos suficientes para la generación
 *
 * Flujo (basado en Laravel):
 * 1. Calcular créditos necesarios
 * 2. Obtener créditos disponibles de la company
 * 3. Comparar y retornar resultado
 *
 * @param request Datos de la verificación
 * @returns Resultado de la verificación
 * @throws AppError si la company no existe
 */
const CheckCreditsService = async ({
  companyId,
  imageSize,
  numberOfImages
}: CheckCreditsRequest): Promise<CheckCreditsResponse> => {
  // 1. Obtener la company
  const company = await Company.findByPk(companyId);

  if (!company) {
    throw new AppError("Company not found", 404);
  }

  // 2. Calcular créditos requeridos
  const costCalculation = await CalculateImageCostService({
    imageSize,
    numberOfImages
  });

  const requiredCredits = costCalculation.totalCredits;
  const availableCredits = company.aiTokenBalance || 0;

  // 3. Verificar si hay suficientes créditos
  const hasEnoughCredits = availableCredits >= requiredCredits;

  const response: CheckCreditsResponse = {
    hasEnoughCredits,
    requiredCredits,
    availableCredits,
    imageSize,
    numberOfImages
  };

  // Agregar déficit si no hay suficientes créditos
  if (!hasEnoughCredits) {
    response.deficit = requiredCredits - availableCredits;
  }

  return response;
};

export default CheckCreditsService;
