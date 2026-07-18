import * as Yup from "yup";
import AppError from "../../errors/AppError";
import Plan from "../../models/Plan";
import { createStripeProductAndPrice } from "../PaymentSync/StripeProductService";
import { createPaypalProductAndPlan } from "../PaymentSync/PaypalProductService";
import { logPaymentInfo, logPaymentSuccess, logPaymentWarning } from "../../utils/paymentLogger";

interface PlanData {
  name: string;
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
  trial?: boolean;
  trialDays?: number;
  recurrence?: string;
  useOpenAi?: boolean;
  useIntegrations?: boolean;
  isPublic?: boolean;
  useMarketing?: boolean;
  useLeads?: boolean;
  allowRecurringPayments?: boolean;
}

const CreatePlanService = async (planData: PlanData): Promise<Plan> => {
  const { name, amount } = planData;

  // Validación del nombre
  const planSchema = Yup.object().shape({
    name: Yup.string()
      .min(2, "ERR_PLAN_INVALID_NAME")
      .required("ERR_PLAN_INVALID_NAME")
      .test(
        "Check-unique-name",
        "ERR_PLAN_NAME_ALREADY_EXISTS",
        async value => {
          if (value) {
            const planWithSameName = await Plan.findOne({
              where: { name: value }
            });
            return !planWithSameName;
          }
          return false;
        }
      )
  });

  try {
    await planSchema.validate({ name });
  } catch (err) {
    throw new AppError(err.message);
  }

  // Crear plan en base de datos primero (sin IDs de payment providers)
  const plan = await Plan.create({
    ...planData,
  });

  logPaymentInfo('system', 'createPlan', `Plan creado en DB: ${plan.id} - ${plan.name}`, plan.id);

  // Preparar datos para payment providers
  const planDataForSync = {
    id: plan.id,
    name: plan.name,
    amount: amount || '0',
    recurrence: planData.recurrence,
    description: `Plan ${plan.name}`
  };

  // Variables para almacenar IDs de payment providers
  let stripeProductId: string | null = null;
  let stripePriceId: string | null = null;
  let paypalProductId: string | null = null;
  let paypalPlanId: string | null = null;

  // ============ SINCRONIZACIÓN CON STRIPE ============
  try {
    const stripeResult = await createStripeProductAndPrice(planDataForSync);
    if (stripeResult) {
      stripeProductId = stripeResult.productId;
      stripePriceId = stripeResult.priceId;
      logPaymentSuccess('stripe', 'createPlan', {
        stripeProductId,
        stripePriceId
      }, plan.id);
    } else {
      logPaymentWarning('stripe', 'createPlan', 'No se pudo crear producto/precio en Stripe (keys no configuradas o error)', plan.id);
    }
  } catch (stripeError) {
    // Loggear pero no fallar - el plan ya está creado en DB
    logPaymentWarning('stripe', 'createPlan', `Error de Stripe: ${stripeError.message}`, plan.id);
  }

  // ============ SINCRONIZACIÓN CON PAYPAL ============
  try {
    const paypalResult = await createPaypalProductAndPlan(planDataForSync);
    if (paypalResult) {
      paypalProductId = paypalResult.productId;
      paypalPlanId = paypalResult.planId;
      logPaymentSuccess('paypal', 'createPlan', {
        paypalProductId,
        paypalPlanId
      }, plan.id);
    } else {
      logPaymentWarning('paypal', 'createPlan', 'No se pudo crear producto/plan en PayPal (keys no configuradas o error)', plan.id);
    }
  } catch (paypalError) {
    // Loggear pero no fallar - el plan ya está creado en DB
    logPaymentWarning('paypal', 'createPlan', `Error de PayPal: ${paypalError.message}`, plan.id);
  }

  // ============ ACTUALIZAR PLAN CON IDS DE PAYMENT PROVIDERS ============
  if (stripeProductId || stripePriceId || paypalProductId || paypalPlanId) {
    await plan.update({
      stripeProductId,
      stripePriceId,
      paypalProductId,
      paypalPlanId
    });

    await plan.reload();

    logPaymentInfo('system', 'createPlan', `Plan actualizado con IDs de payment providers`, plan.id);
  }

  console.log('Plan creado:', {
    id: plan.id,
    name: plan.name,
    stripeProductId,
    stripePriceId,
    paypalProductId,
    paypalPlanId
  });

  return plan;
};

export default CreatePlanService;
