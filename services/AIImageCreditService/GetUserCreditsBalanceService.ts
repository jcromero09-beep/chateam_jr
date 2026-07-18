/**
 * Service: GetUserCreditsBalanceService
 * Obtiene el balance de créditos y estadísticas de uso de imágenes de una company
 * Migrado desde Laravel AiGen: Helper totalUserCredits()
 */

import Company from "../../models/Company";
import AIImageCreditTransaction from "../../models/AIImageCreditTransaction";
import AISubplan from "../../models/AISubplan";
import AppError from "../../errors/AppError";
import { Op } from "sequelize";
import { AI_IMAGE_PRICING } from "../../config/aiImagePricing";

interface GetCreditsBalanceRequest {
  companyId: number;
}

interface GetCreditsBalanceResponse {
  companyId: number;
  companyName: string;

  // Balance actual (usando aiTokenBalance)
  balance: number;
  totalUsed: number;

  // Subplan activo
  activeSubplan?: {
    id: number;
    name: string;
    monthlyTokens: number;
    description?: string;
  };

  // Capacidades (cuántas imágenes puede generar)
  imagesCapacity: {
    '1024x1024': number;
    '512x512': number;
    '256x256': number;
  };

  // Estadísticas de este mes
  monthStats: {
    creditsUsed: number;
    imagesGenerated: number;
    totalCostUsd: number;
  };

  // Estadísticas totales
  allTimeStats: {
    totalImagesGenerated: number;
    totalCostUsd: number;
  };

  // Última transacción
  lastTransaction?: {
    id: number;
    type: string;
    amount: number;
    date: Date;
  };
}

/**
 * Obtiene el balance de créditos y estadísticas de una company
 *
 * Similar a totalUserCredits() de Laravel pero adaptado a:
 * - Multi-tenancy por company (no por user)
 * - Estadísticas adicionales
 * - Cálculo de capacidades por tamaño de imagen
 *
 * @param request Datos de la solicitud
 * @returns Balance y estadísticas
 * @throws AppError si la company no existe
 */
const GetUserCreditsBalanceService = async ({
  companyId
}: GetCreditsBalanceRequest): Promise<GetCreditsBalanceResponse> => {
  // 1. Obtener la company
  const company = await Company.findByPk(companyId);

  if (!company) {
    throw new AppError("Company not found", 404);
  }

  const totalCredits = company.aiTokenBalance || 0;
  const totalCreditsUsed = company.totalImageGenerationCreditsUsed || 0;

  // Obtener información del subplan activo si existe
  let activeSubplanData = undefined;
  if (company.activeAISubplanId) {
    const subplan = await AISubplan.findByPk(company.activeAISubplanId);
    if (subplan) {
      activeSubplanData = {
        id: subplan.id,
        name: subplan.name,
        monthlyTokens: subplan.tokens,
        description: subplan.description
      };
    }
  }

  // 2. Calcular capacidades (cuántas imágenes puede generar con créditos actuales)
  const imagesCapacity = {
    '1024x1024': Math.floor(totalCredits / AI_IMAGE_PRICING['1024x1024']),
    '512x512': Math.floor(totalCredits / AI_IMAGE_PRICING['512x512']),
    '256x256': Math.floor(totalCredits / AI_IMAGE_PRICING['256x256'])
  };

  // 3. Estadísticas del mes actual
  const firstDayOfMonth = new Date();
  firstDayOfMonth.setDate(1);
  firstDayOfMonth.setHours(0, 0, 0, 0);

  const monthTransactions = await AIImageCreditTransaction.findAll({
    where: {
      companyId,
      transactionType: 'debit',
      createdAt: {
        [Op.gte]: firstDayOfMonth
      }
    }
  });

  const monthStats = {
    creditsUsed: monthTransactions.reduce((sum, t) => sum + t.creditsAmount, 0),
    imagesGenerated: monthTransactions.length,
    totalCostUsd: monthTransactions.reduce((sum, t) => sum + (Number(t.costUsd) || 0), 0)
  };

  // 4. Estadísticas de todos los tiempos
  const allTransactions = await AIImageCreditTransaction.count({
    where: {
      companyId,
      transactionType: 'debit'
    }
  });

  const allTimeStats = {
    totalImagesGenerated: allTransactions,
    totalCostUsd: totalCreditsUsed * 0.01 // 1 crédito = $0.01 USD
  };

  // 5. Última transacción
  const lastTransaction = await AIImageCreditTransaction.findOne({
    where: { companyId },
    order: [['createdAt', 'DESC']],
    limit: 1
  });

  const lastTransactionData = lastTransaction ? {
    id: lastTransaction.id,
    type: lastTransaction.transactionType,
    amount: lastTransaction.creditsAmount,
    date: lastTransaction.createdAt
  } : undefined;

  return {
    companyId,
    companyName: company.name,
    balance: totalCredits,
    totalUsed: totalCreditsUsed,
    activeSubplan: activeSubplanData,
    imagesCapacity,
    monthStats,
    allTimeStats,
    lastTransaction: lastTransactionData
  };
};

export default GetUserCreditsBalanceService;
