/**
 * Service: ProcessCreatorPaymentService
 * Procesa un pago a un creador de contenido UGC.
 * Calcula platformFee (10%) y netAmount.
 * Si es stripe y tiene stripeAccountId, placeholder para Stripe Transfer.
 * Si es paypal, placeholder para PayPal Payout.
 * Deduce credito 'agent_execution'.
 */

import UGCCreator from "../../models/UGCCreator";
import UGCCreatorPayment from "../../models/UGCCreatorPayment";
import UGCCreatorAssignment from "../../models/UGCCreatorAssignment";
import DeductCreditsService from "../AICreditServices/DeductCreditsService";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface ProcessCreatorPaymentRequest {
  companyId: number;
  creatorId: number;
  assignmentId?: number;
  amount: number;
  currency?: string;
  description?: string;
}

interface ProcessCreatorPaymentResponse {
  payment: UGCCreatorPayment;
}

const ProcessCreatorPaymentService = async (
  params: ProcessCreatorPaymentRequest
): Promise<ProcessCreatorPaymentResponse> => {
  const {
    companyId,
    creatorId,
    assignmentId,
    amount,
    currency = "USD",
    description
  } = params;

  if (!amount || amount <= 0) {
    throw new AppError("ERR_UGC_PAYMENT_INVALID_AMOUNT", 400);
  }

  // Validar creador
  const creator = await UGCCreator.findOne({
    where: { id: creatorId, companyId }
  });

  if (!creator) {
    throw new AppError("ERR_UGC_CREATOR_NOT_FOUND", 404);
  }

  // Validar assignment si se proporciona
  if (assignmentId) {
    const assignment = await UGCCreatorAssignment.findOne({
      where: { id: assignmentId, companyId, creatorId }
    });

    if (!assignment) {
      throw new AppError("ERR_UGC_CREATOR_ASSIGNMENT_NOT_FOUND", 404);
    }
  }

  // Deducir credito
  await DeductCreditsService({
    companyId,
    creditTypeKey: "agent_execution",
    amount: 1,
    description: `Pago a creador UGC: ${creator.name} ($${amount})`,
    source: "ugc_payment",
    sourceId: String(creator.id)
  });

  // Calcular fees
  const platformFeeRate = 0.10; // 10%
  const platformFee = Math.round(amount * platformFeeRate * 100) / 100;
  const netAmount = Math.round((amount - platformFee) * 100) / 100;

  // Crear registro de pago
  const payment = await UGCCreatorPayment.create({
    companyId,
    creatorId,
    assignmentId: assignmentId || undefined,
    amount,
    currency,
    platformFee,
    netAmount,
    paymentMethod: creator.paymentMethod,
    description: description || `Pago a ${creator.name}`,
    status: "pending"
  } as Partial<UGCCreatorPayment> as UGCCreatorPayment);

  try {
    // Procesar segun metodo de pago
    if (creator.paymentMethod === "stripe" && creator.stripeAccountId) {
      // Placeholder para Stripe Transfer
      logger.info(
        `[ProcessCreatorPaymentService] Stripe Transfer placeholder: ` +
        `amount=${netAmount}, stripeAccount=${creator.stripeAccountId}, ` +
        `paymentId=${payment.id}`
      );

      await payment.markProcessing();

      // TODO: Implementar Stripe Transfer real
      // const transfer = await stripe.transfers.create({
      //   amount: Math.round(netAmount * 100),
      //   currency: currency.toLowerCase(),
      //   destination: creator.stripeAccountId,
      //   description: description || `Pago UGC - ${creator.name}`
      // });
      // await payment.update({ stripeTransferId: transfer.id });

    } else if (creator.paymentMethod === "paypal" && creator.paypalEmail) {
      // Placeholder para PayPal Payout
      logger.info(
        `[ProcessCreatorPaymentService] PayPal Payout placeholder: ` +
        `amount=${netAmount}, paypalEmail=${creator.paypalEmail}, ` +
        `paymentId=${payment.id}`
      );

      await payment.markProcessing();

      // TODO: Implementar PayPal Payout real
      // const payout = await paypal.payouts.create({...});
      // await payment.update({ paypalPayoutId: payout.id });

    } else if (creator.paymentMethod === "bank_transfer") {
      // Bank transfer es manual
      logger.info(
        `[ProcessCreatorPaymentService] Bank Transfer pendiente: ` +
        `amount=${netAmount}, paymentId=${payment.id}`
      );
      // Se queda en 'pending' hasta que se confirme manualmente

    } else {
      logger.info(
        `[ProcessCreatorPaymentService] Metodo de pago no procesable automaticamente: ` +
        `method=${creator.paymentMethod}, paymentId=${payment.id}`
      );
    }
  } catch (paymentError: unknown) {
    const paymentMsg = paymentError instanceof Error ? paymentError.message : String(paymentError);
    logger.warn(
      `[ProcessCreatorPaymentService] Error procesando pago (no critico): ${paymentMsg}`
    );
    await payment.markFailed(paymentMsg);
  }

  logger.info(
    `[ProcessCreatorPaymentService] Pago creado: id=${payment.id}, creator=${creatorId}, ` +
    `amount=${amount}, fee=${platformFee}, net=${netAmount}, method=${creator.paymentMethod}, ` +
    `status=${payment.status}, company=${companyId}`
  );

  return { payment };
};

export default ProcessCreatorPaymentService;
