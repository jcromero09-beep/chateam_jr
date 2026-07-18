import * as Yup from "yup";
import AICreditBalance from "../../models/AICreditBalance";
import AICreditTransaction from "../../models/AICreditTransaction";
import AICreditType from "../../models/AICreditType";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface Request {
  companyId: number;
  creditTypeKey: string;
  amount: number;
  description?: string;
  source?: string;
  sourceId?: string;
}

interface Response {
  success: boolean;
  balance: AICreditBalance;
  previousUsed: number;
  newUsed: number;
  remaining: number;
  refunded: number;
}

/**
 * RefundCreditsService — inverso de DeductCreditsService.
 *
 * Decrementa `usedCredits` (con piso 0) en el AICreditBalance de la company
 * para el creditTypeKey dado y registra una transacción de auditoría con
 * direction='credit'. Pensado para revertir cobros cuando una operación
 * downstream falló (p.ej. fal.ai devolvió error después de un descuento).
 *
 * Regla:
 *   - amount > 0 obligatorio (no refundeamos negativos ni 0).
 *   - Si `usedCredits - amount` queda < 0, ajustamos a 0 (no permitimos
 *     refund mayor que lo cobrado).
 *   - Si el creditType o balance no existe → AppError (no refundear
 *     silenciosamente).
 *
 * Auditoría: AICreditTransaction con direction='credit'.
 */
const RefundCreditsService = async ({
  companyId,
  creditTypeKey,
  amount,
  description = "refund",
  source,
  sourceId
}: Request): Promise<Response> => {
  const schema = Yup.object().shape({
    companyId: Yup.number().required().positive(),
    creditTypeKey: Yup.string().required(),
    amount: Yup.number().required().positive("La cantidad a refundear debe ser positiva")
  });

  try {
    await schema.validate({ companyId, creditTypeKey, amount }, { abortEarly: false });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  const creditType = await AICreditType.findOne({
    where: { key: creditTypeKey, isActive: true }
  });
  if (!creditType) {
    throw new AppError("ERR_AI_CREDIT_TYPE_NOT_FOUND", 404);
  }

  const balance = await AICreditBalance.findOne({
    where: { companyId, creditTypeId: creditType.id }
  });
  if (!balance) {
    throw new AppError("ERR_AI_NO_CREDIT_BALANCE", 404);
  }

  const previousUsed = balance.usedCredits;
  // Piso en 0 — un refund nunca puede dejar usedCredits negativo
  const newUsed = Math.max(0, previousUsed - amount);
  const refunded = previousUsed - newUsed;

  await balance.update({ usedCredits: newUsed });
  await balance.reload();

  try {
    await AICreditTransaction.create({
      companyId,
      creditTypeId: creditType.id,
      amount: refunded,
      direction: "credit",
      balanceBefore: previousUsed,
      balanceAfter: balance.usedCredits,
      source: source || "refund",
      sourceId,
      description
    } as any);
  } catch (e) {
    logger.warn(`[AICreditService] Error registrando transacción refund: ${e}`);
  }

  logger.info(
    `[AICreditService] Refund ejecutado: company=${companyId}, ` +
      `tipo=${creditTypeKey}, monto=${refunded}, descripción=${description}, ` +
      `usedCredits ${previousUsed} → ${balance.usedCredits}`
  );

  return {
    success: true,
    balance,
    previousUsed,
    newUsed: balance.usedCredits,
    remaining: balance.totalCredits - balance.usedCredits,
    refunded
  };
};

export default RefundCreditsService;
