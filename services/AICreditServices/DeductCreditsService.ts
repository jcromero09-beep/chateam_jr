import * as Yup from "yup";
import AICreditBalance from "../../models/AICreditBalance";
import AICreditTransaction from "../../models/AICreditTransaction";
import AICreditType from "../../models/AICreditType";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import User from "../../models/User";

interface Request {
  companyId: number;
  creditTypeKey: string;
  amount: number;
  description?: string; // Descripción de la operación
  userId?: number; // Para verificar si es super admin
  source?: string; // Fuente del consumo: 'email', 'image_gen', 'agent_execution', etc.
  sourceId?: string; // ID del recurso que genera el consumo
  tokensUsed?: number; // Tokens reales consumidos en la operación
}

interface Response {
  success: boolean;
  balance: AICreditBalance;
  previousUsed: number;
  newUsed: number;
  remaining: number;
  deducted: number;
}

/**
 * Deduce créditos del balance de una company.
 * Este servicio es el punto central para todos los consumos de IA:
 * - Generación de texto (chat_tokens)
 * - Generación de imágenes (image_gen)
 * - Consultas RAG (rag_query)
 * - Embeddings (embedding_tokens)
 * - Ejecución de agentes (agent_execution)
 * etc.
 *
 * IMPORTANTE: Si no hay créditos suficientes, lanza error.
 */
const DeductCreditsService = async ({
  companyId,
  creditTypeKey,
  amount,
  description = "consumo",
  userId,
  source,
  sourceId,
  tokensUsed
}: Request): Promise<Response> => {
  const schema = Yup.object().shape({
    companyId: Yup.number().required().positive(),
    creditTypeKey: Yup.string().required(),
    amount: Yup.number().required().positive("La cantidad debe ser positiva")
  });

  try {
    await schema.validate({ companyId, creditTypeKey, amount }, { abortEarly: false });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  // Super admin nunca se limita por créditos — se registra uso pero sin bloquear
  if (userId) {
    const user = await User.findByPk(userId);
    if (user?.super) {
      logger.info(
        `[AICreditService] Super admin bypass: company=${companyId}, ` +
        `tipo=${creditTypeKey}, cantidad=${amount}, descripción=${description}`
      );
      // Buscar o crear balance para registro, pero no bloquear
      const creditType = await AICreditType.findOne({
        where: { key: creditTypeKey, isActive: true }
      });
      if (creditType) {
        let balance = await AICreditBalance.findOne({
          where: { companyId, creditTypeId: creditType.id }
        });
        if (!balance) {
          balance = await AICreditBalance.create({
            companyId,
            creditTypeId: creditType.id,
            totalCredits: 999999,
            usedCredits: 0
          } as any);
        }
        const previousUsed = balance.usedCredits;
        await balance.update({ usedCredits: balance.usedCredits + amount });
        await balance.reload();

        // Registrar transacción de auditoría (super admin)
        try {
          await AICreditTransaction.create({
            companyId,
            creditTypeId: creditType.id,
            amount,
            direction: "debit",
            balanceBefore: previousUsed,
            balanceAfter: balance.usedCredits,
            source: source || description || "consumo",
            sourceId,
            description: `[Super Admin] ${description}`,
            userId,
            tokensUsed
          } as any);
        } catch (e) {
          logger.warn(`[AICreditService] Error registrando transaccion audit (super admin): ${e}`);
        }

        return {
          success: true,
          balance,
          previousUsed,
          newUsed: balance.usedCredits,
          remaining: balance.totalCredits - balance.usedCredits,
          deducted: amount
        };
      }
      // Si no existe el tipo de crédito, retornar mock success para no bloquear
      return {
        success: true,
        balance: {} as AICreditBalance,
        previousUsed: 0,
        newUsed: 0,
        remaining: 999999,
        deducted: amount
      };
    }
  }

  // Buscar el tipo de crédito por key
  const creditType = await AICreditType.findOne({
    where: { key: creditTypeKey, isActive: true }
  });

  if (!creditType) {
    throw new AppError("ERR_AI_CREDIT_TYPE_NOT_FOUND", 404);
  }

  // Buscar balance existente
  const balance = await AICreditBalance.findOne({
    where: {
      companyId,
      creditTypeId: creditType.id
    }
  });

  if (!balance) {
    throw new AppError("ERR_AI_NO_CREDIT_BALANCE", 402);
  }

  const remaining = balance.totalCredits - balance.usedCredits;

  if (remaining < amount) {
    logger.warn(
      `[AICreditService] Créditos insuficientes: company=${companyId}, ` +
      `tipo=${creditTypeKey}, requeridos=${amount}, disponibles=${remaining}`
    );
    throw new AppError("ERR_AI_INSUFFICIENT_CREDITS", 402);
  }

  const previousUsed = balance.usedCredits;

  // Deducir créditos
  await balance.update({
    usedCredits: balance.usedCredits + amount
  });

  await balance.reload();

  const newRemaining = balance.totalCredits - balance.usedCredits;

  // Registrar transacción de auditoría
  try {
    await AICreditTransaction.create({
      companyId,
      creditTypeId: creditType.id,
      amount,
      direction: "debit",
      balanceBefore: previousUsed,
      balanceAfter: balance.usedCredits,
      source: source || description || "consumo",
      sourceId,
      description,
      userId,
      tokensUsed
    } as any);
  } catch (e) {
    logger.warn(`[AICreditService] Error registrando transaccion audit: ${e}`);
  }

  logger.info(
    `[AICreditService] Créditos deducidos: company=${companyId}, ` +
    `tipo=${creditTypeKey}, cantidad=${amount}, descripción=${description}, ` +
    `restantes=${newRemaining}`
  );

  return {
    success: true,
    balance,
    previousUsed,
    newUsed: balance.usedCredits,
    remaining: newRemaining,
    deducted: amount
  };
};

export default DeductCreditsService;
