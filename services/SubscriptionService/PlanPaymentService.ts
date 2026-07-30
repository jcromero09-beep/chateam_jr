import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import * as Sentry from "@sentry/node";
import { getIO } from "../../libs/socket";
import Company from "../../models/Company";
import Invoices from "../../models/Invoices";
import Plan from "../../models/Plan";
import { updateDueDateByCompanyId } from "../CompanyService/dateCompany";
import ProvisionCreditsService from "../AICreditServices/ProvisionCreditsService";
import ListWhatsAppsService from "../WhatsappService/ListWhatsAppsService";
import { StartWhatsAppSession } from "../WbotServices/StartWhatsAppSession";
import { markAffiliateReferralClaimable } from "../AffiliateServices/ProcessAffiliateActivationService";
import {
  buildWebsiteEventUserFromCompany,
  sendWebsiteConversionEventAsync
} from "../FacebookConversionService/SendWebsiteEvent";

type PaymentMethod = "stripe" | "paypal" | "comprobante" | "pix" | "apple";

interface ProcessPaidPlanPaymentRequest {
  invoice?: Invoices | null;
  companyId: number;
  planId: number;
  paymentMethod: PaymentMethod;
  paymentIntent?: string | null;
  stripeId?: string | null;
  subscriptionId?: string | null;
  customerId?: string | null;
  paypalOrderId?: string | null;
  linkInvoice?: string | null;
  createNewInvoice?: boolean;
}

const buildInvoiceData = (
  companyId: number,
  plan: Plan,
  paymentMethod: PaymentMethod,
  overrides: Partial<Invoices> = {}
) => ({
  companyId,
  recurrence: plan.recurrence,
  planId: plan.id,
  detail: plan.name,
  value: Number(plan.amount),
  users: plan.users,
  status: "paid",
  connections: plan.connections,
  queues: plan.queues,
  useWhatsapp: plan.useWhatsapp,
  useFacebook: plan.useFacebook,
  useInstagram: plan.useInstagram,
  useCampaigns: plan.useCampaigns,
  useSchedules: plan.useSchedules,
  useInternalChat: plan.useInternalChat,
  useExternalApi: plan.useExternalApi,
  dueDate: new Date().toISOString(),
  paymentMethod,
  ...overrides
});

export const processPaidPlanPayment = async ({
  invoice,
  companyId,
  planId,
  paymentMethod,
  paymentIntent,
  stripeId,
  subscriptionId,
  customerId,
  paypalOrderId,
  linkInvoice,
  createNewInvoice = false
}: ProcessPaidPlanPaymentRequest): Promise<{ invoice: Invoices; company: Company | null }> => {
  const plan = await Plan.findByPk(planId);
  if (!plan) {
    throw new Error(`Plan no encontrado: ${planId}`);
  }

  const invoiceData = buildInvoiceData(companyId, plan, paymentMethod, {
    ...(paymentIntent ? { payment_intent: paymentIntent } : {}),
    ...(stripeId ? { stripe_id: stripeId } : {}),
    ...(subscriptionId ? { subscriptionId } : {}),
    ...(customerId ? { customId: customerId } : {}),
    ...(paypalOrderId ? { paypalOrderId } : {}),
    ...(linkInvoice ? { linkInvoice } : {}),
    ...(invoice?.isEmailPlan !== undefined ? { isEmailPlan: invoice.isEmailPlan } : {}),
    ...(invoice?.emailPlanId ? { emailPlanId: invoice.emailPlanId } : {})
  } as Partial<Invoices>);

  const paidInvoice = createNewInvoice
    ? await Invoices.create(invoiceData as any)
    : await invoice!.update(invoiceData as any);

  await updateDueDateByCompanyId(companyId, plan.id, plan.name, plan.recurrence);

  try {
    await ProvisionCreditsService({ companyId, planId: plan.id, mode: "renew" });
    console.log(`✅ Créditos IA provisionados: company=${companyId}, plan=${plan.id}`);
  } catch (error: any) {
    console.error("❌ Error provisionando créditos IA:", error.message);
    Sentry.captureException(error);
  }

  try {
    const invoiceForEmail = paidInvoice || invoice;
    const EmailPlanService = require("../EmailPlanService").default;
    if (invoiceForEmail?.isEmailPlan && invoiceForEmail.emailPlanId) {
      await EmailPlanService.provisionEmailCredits(companyId, invoiceForEmail.emailPlanId, "renew");
      console.log(`✅ Créditos de email provisionados: company=${companyId}, emailPlan=${invoiceForEmail.emailPlanId}`);
    }
  } catch (error: any) {
    console.error("❌ Error provisionando créditos de email:", error.message);
  }

  try {
    const whatsapps = await ListWhatsAppsService({ companyId });
    for (const whatsapp of whatsapps) {
      await StartWhatsAppSession(whatsapp, companyId);
    }
  } catch (error) {
    console.error("❌ Error iniciando sesiones de WhatsApp:", error);
    Sentry.captureException(error);
  }

  // ── Marcar referral como "claimable" (sin entregar recompensa) ──
  // El cobro lo hace la company afiliadora manualmente desde su wallet.
  try {
    await markAffiliateReferralClaimable(companyId);
  } catch (error: any) {
    console.error("❌ Error marcando referral claimable:", error.message);
    Sentry.captureException(error);
  }

  const company = await Company.findByPk(companyId);

  if (company) {
    try {
      const eventUser = await buildWebsiteEventUserFromCompany(company);
      const orderId =
        paymentIntent ||
        stripeId ||
        paypalOrderId ||
        subscriptionId ||
        `invoice_${paidInvoice.id}`;

      sendWebsiteConversionEventAsync({
        eventName: "Purchase",
        eventId: `purchase_${orderId}`,
        user: eventUser,
        context: {
          actionSource: "system_generated",
          eventSourceUrl: `${process.env.FRONTEND_URL || "https://chateam.com"}/checkout/success`
        },
        customData: {
          currency: "MXN",
          value: Number(plan.amount) || Number(paidInvoice.value) || 0,
          content_ids: [`plan_${plan.id}`],
          content_type: "product",
          content_name: plan.name,
          order_id: String(orderId),
          payment_method: paymentMethod
        }
      });
    } catch (error: any) {
      console.error("[FB-WEB-CAPI] Error preparando Purchase:", error.message);
    }
  }

  const io = getIO();
  io.emit(`company-${companyId}-payment`, {
    action: "CONCLUIDA",
    company: company?.toJSON(),
    invoice: paidInvoice.toJSON(),
    paymentMethod,
    status: "paid"
  });

  return { invoice: paidInvoice, company };
};

/**
 * Reclama una factura para procesar su pago, de forma ATÓMICA.
 *
 * ## El problema que cierra
 *
 * Los handlers de webhook de Stripe desduplicaban así:
 *
 *   const invoice = await Invoices.findOne({ where: { stripe_id } });
 *   if (invoice.status === "paid") return;      // lee
 *   await processPaidPlanPayment({ invoice });  // escribe
 *
 * Eso es un *read-then-write* sin lock. Stripe reintenta ante cualquier no-2xx y
 * puede solapar entregas: **dos webhooks concurrentes leen los dos "no pagada" y
 * los dos procesan**. Y procesar dos veces no es cosmético — `processPaidPlanPayment`
 * llama a `ProvisionCreditsService` y a `updateDueDateByCompanyId`, o sea, dobla
 * créditos y dobla la extensión de la suscripción.
 *
 * El camino de créditos (`processSubplanPurchase`) ya lo resolvía bien con
 * transacción + `SELECT … FOR UPDATE`. Esto lleva el MISMO patrón al camino de
 * facturas, para que haya una sola forma de hacerlo en todo el código de dinero.
 *
 * ## Por qué la transacción es corta
 *
 * Solo cubre bloquear → comprobar → marcar. El trabajo lento de
 * `processPaidPlanPayment` (provisión de créditos, emails, eventos de Facebook,
 * reinicio de sesiones) queda FUERA: sostener un lock de fila mientras se manda
 * un email es cómo se construye un atasco en la base de datos.
 *
 * ## Semántica de fallo
 *
 * Se marca `paid` antes de provisionar créditos. Si la provisión falla después,
 * queda una factura pagada sin créditos. **Eso ya pasaba antes** —
 * `processPaidPlanPayment` actualiza la factura y luego provisiona dentro de un
 * try/catch que se traga el error— así que este cambio no introduce un modo de
 * fallo nuevo. Lo que sí evita es el doble cobro de créditos, que es peor.
 *
 * @returns `true` si esta llamada ganó la reclamación y debe procesar.
 *          `false` si otra la ganó (ya está pagada) → el caller debe salir SIN
 *          efectos secundarios.
 */
export const claimInvoiceForPayment = async (
  invoiceId: number
): Promise<boolean> => {
  const sequelize = Invoices.sequelize;
  if (!sequelize) {
    throw new Error("Invoices no está asociada a una instancia de Sequelize");
  }

  const transaction = await sequelize.transaction();
  try {
    const invoice = await Invoices.findByPk(invoiceId, {
      lock: transaction.LOCK.UPDATE,
      transaction
    });

    if (!invoice) {
      await transaction.commit();
      console.warn(`[claimInvoice] Factura ${invoiceId} no encontrada`);
      return false;
    }

    if (invoice.status === "paid") {
      await transaction.commit();
      console.log(`[claimInvoice] Factura ${invoiceId} ya estaba pagada — se descarta`);
      return false;
    }

    await invoice.update({ status: "paid" } as any, { transaction });
    await transaction.commit();
    return true;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};
