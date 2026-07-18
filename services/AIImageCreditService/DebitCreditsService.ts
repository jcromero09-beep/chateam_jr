/**
 * Service: DebitCreditsService
 * Debita créditos de una company y registra la transacción
 * Migrado desde Laravel AiGen: CreditWalletEngine.php::processDebitCredits()
 */

import Company from "../../models/Company";
import AIImageCreditTransaction from "../../models/AIImageCreditTransaction";
import AIImageGeneration from "../../models/AIImageGeneration";
import AppError from "../../errors/AppError";
import sequelize from "../../database";

interface DebitCreditsRequest {
  companyId: number;
  userId: number;
  creditsAmount: number;
  aiImageGenerationId?: number;
  imageSize?: string;
  numberOfImages?: number;
  description?: string;
  metadata?: Record<string, any>;
}

interface DebitCreditsResponse {
  transactionId: number;
  companyId: number;
  userId: number;
  creditsAmount: number;
  newBalance: number;
  previousBalance: number;
  description: string;
}

/**
 * Debita créditos de la company y registra la transacción
 *
 * Este servicio:
 * 1. Verifica que la company tenga créditos suficientes
 * 2. Resta créditos del balance (Company.imageGenerationCredits)
 * 3. Suma créditos al total usado (Company.totalImageGenerationCreditsUsed)
 * 4. Crea registro en AIImageCreditTransactions
 * 5. Todo dentro de una transacción de BD (rollback si falla)
 *
 * Referencia Laravel:
 * - CreditWalletEngine.php::processDebitCredits() (línea 866)
 * - Guarda créditos como NEGATIVO en Laravel, aquí guardamos como type='debit'
 *
 * @param request Datos del débito
 * @returns Resultado de la operación
 * @throws AppError si no hay créditos suficientes o falla la operación
 */
const DebitCreditsService = async ({
  companyId,
  userId,
  creditsAmount,
  aiImageGenerationId,
  imageSize,
  numberOfImages,
  description,
  metadata
}: DebitCreditsRequest): Promise<DebitCreditsResponse> => {
  // Validar que creditsAmount sea positivo
  if (creditsAmount <= 0) {
    throw new AppError("El monto de créditos debe ser mayor a 0", 400);
  }

  // Iniciar transacción de BD
  const transaction = await sequelize.transaction();

  try {
    // 1. Obtener la company con bloqueo pesimista (FOR UPDATE)
    const company = await Company.findByPk(companyId, {
      lock: transaction.LOCK.UPDATE,
      transaction
    });

    if (!company) {
      throw new AppError("Company not found", 404);
    }

    const previousBalance = company.aiTokenBalance || 0;

    // 2. Verificar créditos suficientes
    if (previousBalance < creditsAmount) {
      throw new AppError(
        `Créditos insuficientes. Disponibles: ${previousBalance}, Requeridos: ${creditsAmount}`,
        402 // Payment Required
      );
    }

    // 3. Actualizar balances de la company
    const newBalance = previousBalance - creditsAmount;
    const totalUsed = (company.totalImageGenerationCreditsUsed || 0) + creditsAmount;

    await company.update({
      aiTokenBalance: newBalance,
      totalImageGenerationCreditsUsed: totalUsed
    }, { transaction });

    // 4. Generar descripción automática si no se proporciona
    let finalDescription = description;
    if (!finalDescription && imageSize && numberOfImages) {
      finalDescription = `Generación de ${numberOfImages} imagen(es) de ${imageSize}`;
    } else if (!finalDescription) {
      finalDescription = "Débito por generación de imágenes";
    }

    // 5. Calcular costo en USD (opcional)
    const costUsd = creditsAmount * 0.01; // 1 crédito = $0.01 USD

    // 6. Crear registro de transacción
    const creditTransaction = await AIImageCreditTransaction.create({
      companyId,
      userId,
      aiImageGenerationId,
      transactionType: 'debit',
      creditsAmount,
      costUsd,
      description: finalDescription,
      metadata: {
        ...metadata,
        imageSize,
        numberOfImages,
        previousBalance,
        newBalance
      },
      status: 'completed'
    }, { transaction });

    // 7. Si hay un generationId, actualizar el campo totalCreditsUsed
    if (aiImageGenerationId) {
      await AIImageGeneration.update(
        { totalCreditsUsed: creditsAmount },
        { where: { id: aiImageGenerationId }, transaction }
      );
    }

    // Commit de la transacción
    await transaction.commit();

    return {
      transactionId: creditTransaction.id,
      companyId,
      userId,
      creditsAmount,
      newBalance,
      previousBalance,
      description: finalDescription
    };

  } catch (error) {
    // Rollback en caso de error
    await transaction.rollback();
    throw error;
  }
};

export default DebitCreditsService;
