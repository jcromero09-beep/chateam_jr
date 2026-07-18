import AppError from "../../errors/AppError";
import Plan from "../../models/Plan";
import {
  createStripeProductAndPrice,
  updateStripeProduct,
  archiveStripePrice
} from "../PaymentSync/StripeProductService";
import {
  createPaypalProductAndPlan,
  updatePaypalProduct
} from "../PaymentSync/PaypalProductService";
import { logPaymentInfo, logPaymentSuccess, logPaymentWarning } from "../../utils/paymentLogger";

interface PlanData {
  name: string;
  id?: number;
  users?: number;
  connections?: number;
  queues?: number;
  amount?: string;
  useWhatsapp?: boolean;
  useFacebook?: boolean;
  useInstagram?: boolean;
  useCampaigns?: boolean;
  useSchedules?: boolean;
  useInternalChat?: boolean;
  useExternalApi?: boolean;
  useKanban?: boolean;
  useOpenAi?: boolean;
  useIntegrations?: boolean;
  useMarketing?: boolean;
  useLeads?: boolean;
  isPublic?: boolean;
  trial?: boolean;
  trialDays?: number;
  recurrence?: string;
  stripePriceId?: string;
  stripeProductId?: string;
  paypalProductId?: string;
  paypalPlanId?: string;
  allowRecurringPayments?: boolean;
  interfacePermissions?: string;
}

const UpdatePlanService = async (planData: PlanData): Promise<Plan> => {
  const { id, amount, recurrence } = planData;

  const plan = await Plan.findByPk(id);

  if (!plan) {
    throw new AppError("ERR_NO_PLAN_FOUND", 404);
  }

  // Detectar si cambió el precio o la recurrencia
  const priceChanged = amount && amount !== plan.amount;
  const recurrenceChanged = recurrence && recurrence !== plan.recurrence;
  const needsNewPrice = priceChanged || recurrenceChanged;

  logPaymentInfo('system', 'updatePlan', `Actualizando plan: ${plan.id}. Cambios: precio=${priceChanged}, recurrencia=${recurrenceChanged}`, plan.id);

  // Preparar datos para sincronización
  const planDataForSync = {
    id: plan.id,
    name: planData.name || plan.name,
    amount: amount || plan.amount,
    recurrence: recurrence || plan.recurrence,
    description: `Plan ${planData.name || plan.name}`
  };

  // ============ SINCRONIZACIÓN CON STRIPE ============
  if (plan.stripeProductId) {
    try {
      // Actualizar nombre/descripción del producto
      await updateStripeProduct(plan.stripeProductId, planDataForSync);

      // Si cambió precio o recurrencia, crear nuevo Price
      if (needsNewPrice) {
        logPaymentInfo('stripe', 'updatePlan', 'Precio/recurrencia cambió, creando nuevo Price en Stripe', plan.id);

        // Archivar precio anterior
        if (plan.stripePriceId) {
          await archiveStripePrice(plan.stripePriceId, plan.id);
        }

        // Crear nuevo producto y precio (Stripe requiere nuevo precio para cambios de amount)
        const stripeResult = await createStripeProductAndPrice(planDataForSync);
        if (stripeResult) {
          planData.stripeProductId = stripeResult.productId;
          planData.stripePriceId = stripeResult.priceId;
          logPaymentSuccess('stripe', 'updatePlan', { newPriceId: stripeResult.priceId }, plan.id);
        }
      }
    } catch (stripeError) {
      logPaymentWarning('stripe', 'updatePlan', `Error actualizando en Stripe: ${stripeError.message}`, plan.id);
    }
  } else if (needsNewPrice) {
    // No tenía Stripe configurado, intentar crear ahora
    try {
      const stripeResult = await createStripeProductAndPrice(planDataForSync);
      if (stripeResult) {
        planData.stripeProductId = stripeResult.productId;
        planData.stripePriceId = stripeResult.priceId;
        logPaymentSuccess('stripe', 'updatePlan', {
          message: 'Plan sincronizado con Stripe por primera vez',
          productId: stripeResult.productId
        }, plan.id);
      }
    } catch (stripeError) {
      logPaymentWarning('stripe', 'updatePlan', `Error creando en Stripe: ${stripeError.message}`, plan.id);
    }
  }

  // ============ SINCRONIZACIÓN CON PAYPAL ============
  if (plan.paypalProductId) {
    try {
      // Actualizar producto en PayPal
      await updatePaypalProduct(plan.paypalProductId, planDataForSync);

      // PayPal permite actualizar planes existentes con pricing, pero es más complejo
      // Por simplicidad, si cambió el precio, creamos nuevo plan
      if (needsNewPrice) {
        logPaymentInfo('paypal', 'updatePlan', 'Precio/recurrencia cambió, creando nuevo Plan en PayPal', plan.id);

        const paypalResult = await createPaypalProductAndPlan(planDataForSync);
        if (paypalResult) {
          planData.paypalProductId = paypalResult.productId;
          planData.paypalPlanId = paypalResult.planId;
          logPaymentSuccess('paypal', 'updatePlan', { newPlanId: paypalResult.planId }, plan.id);
        }
      }
    } catch (paypalError) {
      logPaymentWarning('paypal', 'updatePlan', `Error actualizando en PayPal: ${paypalError.message}`, plan.id);
    }
  } else if (needsNewPrice) {
    // No tenía PayPal configurado, intentar crear ahora
    try {
      const paypalResult = await createPaypalProductAndPlan(planDataForSync);
      if (paypalResult) {
        planData.paypalProductId = paypalResult.productId;
        planData.paypalPlanId = paypalResult.planId;
        logPaymentSuccess('paypal', 'updatePlan', {
          message: 'Plan sincronizado con PayPal por primera vez',
          planId: paypalResult.planId
        }, plan.id);
      }
    } catch (paypalError) {
      logPaymentWarning('paypal', 'updatePlan', `Error creando en PayPal: ${paypalError.message}`, plan.id);
    }
  }

  // ============ ACTUALIZAR PLAN EN DB ============
  await plan.update(planData);

  console.log('Plan actualizado:', {
    id: plan.id,
    name: plan.name,
    stripeProductId: plan.stripeProductId,
    stripePriceId: plan.stripePriceId,
    paypalProductId: plan.paypalProductId,
    paypalPlanId: plan.paypalPlanId
  });

  return plan;
};

export default UpdatePlanService;
