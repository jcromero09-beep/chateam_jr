import Plan from "../../models/Plan";
import AppError from "../../errors/AppError";
import { archiveStripeProduct, archiveStripePrice } from "../PaymentSync/StripeProductService";
import { deactivatePaypalPlan } from "../PaymentSync/PaypalProductService";
import { logPaymentInfo, logPaymentSuccess, logPaymentWarning } from "../../utils/paymentLogger";

const DeletePlanService = async (id: string): Promise<void> => {
  const plan = await Plan.findOne({ where: { id } });

  if (!plan) {
    throw new AppError("ERR_NO_PLAN_FOUND", 404);
  }

  logPaymentInfo('system', 'deletePlan', `Eliminando plan: ${plan.id} - ${plan.name}`, plan.id);

  // ============ DESACTIVAR EN STRIPE ============
  if (plan.stripePriceId) {
    try {
      await archiveStripePrice(plan.stripePriceId, plan.id);
      logPaymentSuccess('stripe', 'deletePlan', { archivedPriceId: plan.stripePriceId }, plan.id);
    } catch (err) {
      logPaymentWarning('stripe', 'deletePlan', `No se pudo archivar precio: ${err.message}`, plan.id);
      // No bloqueamos la eliminación del plan por errores de Stripe
    }
  }

  if (plan.stripeProductId) {
    try {
      await archiveStripeProduct(plan.stripeProductId, plan.id);
      logPaymentSuccess('stripe', 'deletePlan', { archivedProductId: plan.stripeProductId }, plan.id);
    } catch (err) {
      logPaymentWarning('stripe', 'deletePlan', `No se pudo archivar producto: ${err.message}`, plan.id);
    }
  }

  // ============ DESACTIVAR EN PAYPAL ============
  if (plan.paypalPlanId) {
    try {
      await deactivatePaypalPlan(plan.paypalPlanId, plan.id);
      logPaymentSuccess('paypal', 'deletePlan', { deactivatedPlanId: plan.paypalPlanId }, plan.id);
    } catch (err) {
      logPaymentWarning('paypal', 'deletePlan', `No se pudo desactivar plan: ${err.message}`, plan.id);
      // No bloqueamos la eliminación del plan por errores de PayPal
    }
  }

  // ============ ELIMINAR DE LA BASE DE DATOS ============
  await plan.destroy();

  logPaymentSuccess('system', 'deletePlan', { message: 'Plan eliminado correctamente' }, plan.id);
};

export default DeletePlanService;
