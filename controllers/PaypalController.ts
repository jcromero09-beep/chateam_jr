import { Request, Response } from "express";
import * as Yup from "yup";
import CreatePaypalOrderService from "../services/PaypalService/CreatePaypalOrderService";
import CapturePaypalOrderService from "../services/PaypalService/CapturePaypalOrderService";
import AppError from "../errors/AppError";
import Invoices from "../models/Invoices";
import Company from "../models/Company";
import Plan from "../models/Plan";
import { getIO } from "../libs/socket";
import { updateDueDateByCompanyId } from "../services/CompanyService/dateCompany";
import ListWhatsAppsService from "../services/WhatsappService/ListWhatsAppsService";
import { StartWhatsAppSession } from "../services/WbotServices/StartWhatsAppSession";
import * as Sentry from "@sentry/node";

/**
 * POST /paypal/create-order
 * Crea una orden de pago en PayPal
 * Body: { invoiceId, planId, months }
 */
export const createOrder = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Validación de entrada
    const schema = Yup.object().shape({
      invoiceId: Yup.number().required("invoiceId es requerido"),
      planId: Yup.number().required("planId es requerido"),
      months: Yup.number().min(1, "months debe ser al menos 1").required("months es requerido")
    });

    await schema.validate(req.body, { abortEarly: false });

    const { invoiceId, planId, months } = req.body;

    // Verificar que el usuario tenga acceso a la factura
    const invoice = await Invoices.findByPk(invoiceId);
    if (!invoice) {
      throw new AppError("Factura no encontrada", 404);
    }

    // Verificar que la factura pertenece a la compañía del usuario (seguridad)
    if (req.user && req.user.companyId !== invoice.companyId) {
      throw new AppError("No tienes permiso para acceder a esta factura", 403);
    }

    // Crear la orden de PayPal
    const result = await CreatePaypalOrderService({
      invoiceId,
      planId,
      months
    });

    return res.status(200).json({
      success: true,
      orderID: result.orderID,
      approveURL: result.approveURL,
      message: "Orden de PayPal creada exitosamente"
    });

  } catch (error: any) {
    console.error("❌ Error en createOrder:", error.message);

    if (error instanceof Yup.ValidationError) {
      return res.status(400).json({
        success: false,
        message: "Errores de validación",
        errors: error.errors
      });
    }

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: "Error al crear la orden de PayPal",
      error: error.message
    });
  }
};

/**
 * POST /paypal/capture-order
 * Captura el pago después de la aprobación del cliente
 * Body: { orderID, invoiceId }
 */
export const captureOrder = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Validación de entrada
    const schema = Yup.object().shape({
      orderID: Yup.string().required("orderID es requerido"),
      invoiceId: Yup.number().required("invoiceId es requerido")
    });

    await schema.validate(req.body, { abortEarly: false });

    const { orderID, invoiceId } = req.body;

    // Verificar que el usuario tenga acceso a la factura
    const invoice = await Invoices.findByPk(invoiceId);
    if (!invoice) {
      throw new AppError("Factura no encontrada", 404);
    }

    // Verificar que la factura pertenece a la compañía del usuario (seguridad)
    if (req.user && req.user.companyId !== invoice.companyId) {
      throw new AppError("No tienes permiso para acceder a esta factura", 403);
    }

    // Capturar el pago de PayPal
    const result = await CapturePaypalOrderService({
      orderID,
      invoiceId
    });

    return res.status(200).json({
      success: result.success,
      captureID: result.captureID,
      status: result.status,
      invoiceId: result.invoiceId,
      companyId: result.companyId,
      message: "Pago capturado exitosamente"
    });

  } catch (error: any) {
    console.error("❌ Error en captureOrder:", error.message);

    if (error instanceof Yup.ValidationError) {
      return res.status(400).json({
        success: false,
        message: "Errores de validación",
        errors: error.errors
      });
    }

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: "Error al capturar el pago",
      error: error.message
    });
  }
};

/**
 * POST /paypal/webhook
 * Procesa eventos de PayPal (webhooks)
 * Documentación: https://developer.paypal.com/docs/api-basics/notifications/webhooks/
 */
export const webhook = async (req: Request, res: Response): Promise<Response> => {
  try {
    const event = req.body;

    console.log("📦 PayPal Webhook Event:", JSON.stringify(event, null, 2));

    // Responder inmediatamente a PayPal (200 OK)
    res.status(200).send("OK");

    // Procesar el evento en segundo plano
    (async () => {
      try {
        const eventType = event.event_type;
        const resource = event.resource;

        console.log(`🔔 PayPal Event Type: ${eventType}`);

        switch (eventType) {
          case "PAYMENT.CAPTURE.COMPLETED":
            await handlePaymentCaptureCompleted(resource);
            break;

          case "PAYMENT.CAPTURE.DENIED":
          case "PAYMENT.CAPTURE.DECLINED":
            await handlePaymentCaptureFailed(resource);
            break;

          case "CHECKOUT.ORDER.APPROVED":
            console.log("✅ Orden aprobada por el cliente:", resource.id);
            break;

          case "CHECKOUT.ORDER.COMPLETED":
            await handleCheckoutOrderCompleted(resource);
            break;

          // ============ SUBSCRIPTION EVENTS ============
          case "BILLING.SUBSCRIPTION.ACTIVATED":
            await handleSubscriptionActivated(resource);
            break;

          case "BILLING.SUBSCRIPTION.CANCELLED":
          case "BILLING.SUBSCRIPTION.EXPIRED":
          case "BILLING.SUBSCRIPTION.SUSPENDED":
            await handleSubscriptionCancelled(resource, eventType);
            break;

          case "BILLING.SUBSCRIPTION.PAYMENT.FAILED":
            await handleSubscriptionPaymentFailed(resource);
            break;

          case "PAYMENT.SALE.COMPLETED":
            await handlePaymentSaleCompleted(resource);
            break;

          default:
            console.warn("⚠️ Evento de PayPal no manejado:", eventType);
            break;
        }

      } catch (error: any) {
        console.error("❌ Error procesando webhook de PayPal:", error.message);
        Sentry.captureException(error);
      }
    })();

    return res;

  } catch (error: any) {
    console.error("❌ Error en webhook de PayPal:", error.message);
    return res.status(500).json({
      success: false,
      message: "Error procesando webhook"
    });
  }
};

/**
 * Maneja el evento PAYMENT.CAPTURE.COMPLETED
 */
async function handlePaymentCaptureCompleted(resource: any) {
  try {
    console.log("✅ Procesando PAYMENT.CAPTURE.COMPLETED");

    const captureId = resource.id;
    const customId = resource.custom_id;

    if (!customId) {
      console.warn("⚠️ No se encontró customId en el recurso");
      return;
    }

    // Parsear customId para obtener información
    const customData = JSON.parse(customId);
    const { invoiceId, planId, months, companyId } = customData;

    // Buscar la factura
    const invoice = await Invoices.findByPk(invoiceId);
    if (!invoice) {
      console.warn(`⚠️ Factura no encontrada: ${invoiceId}`);
      return;
    }

    // Si ya está pagada, no hacer nada
    if (invoice.status === "paid") {
      console.log(`✅ La factura ${invoiceId} ya está marcada como pagada`);
      return;
    }

    // Buscar el plan
    const plan = await Plan.findByPk(planId);
    if (!plan) {
      console.error(`❌ Plan no encontrado: ${planId}`);
      return;
    }

    // Actualizar la factura
    await invoice.update({
      status: "paid",
      paymentMethod: "paypal",
      payment_intent: captureId,
      detail: `${plan.name} - ${months} mes(es)`
    } as any);

    // Actualizar fecha de vencimiento
    for (let i = 0; i < months; i++) {
      await updateDueDateByCompanyId(companyId, planId, `${plan.name} - PayPal`, plan.recurrence);
    }

    // Reiniciar sesiones de WhatsApp
    try {
      const whatsapps = await ListWhatsAppsService({ companyId });
      for (const wa of whatsapps) {
        await StartWhatsAppSession(wa, companyId);
      }
    } catch (e) {
      console.error("❌ Error iniciando sesiones de WhatsApp:", e);
      Sentry.captureException(e);
    }

    // Emitir evento socket
    const io = getIO();
    const company = await Company.findByPk(companyId);
    io.emit(`company-${companyId}-payment`, {
      action: "CONCLUIDA",
      company: company?.toJSON(),
      invoice: invoice.toJSON(),
      paymentMethod: "paypal"
    });

    console.log(`✅ Pago completado para factura ${invoiceId}`);

  } catch (error: any) {
    console.error("❌ Error en handlePaymentCaptureCompleted:", error.message);
    Sentry.captureException(error);
  }
}

/**
 * Maneja el evento PAYMENT.CAPTURE.DENIED o DECLINED
 */
async function handlePaymentCaptureFailed(resource: any) {
  try {
    console.log("⚠️ Procesando PAYMENT.CAPTURE.DENIED/DECLINED");

    const customId = resource.custom_id;

    if (!customId) {
      console.warn("⚠️ No se encontró customId en el recurso");
      return;
    }

    const customData = JSON.parse(customId);
    const { invoiceId, companyId } = customData;

    // Buscar la factura
    const invoice = await Invoices.findByPk(invoiceId);
    if (!invoice) {
      console.warn(`⚠️ Factura no encontrada: ${invoiceId}`);
      return;
    }

    // Actualizar estado a fallido
    await invoice.update({
      status: "open"
    });

    // Emitir evento socket
    const io = getIO();
    io.emit(`company-${companyId}-payment`, {
      action: "FAILED",
      invoice: invoice.toJSON(),
      paymentMethod: "paypal"
    });

    console.log(`⚠️ Pago fallido para factura ${invoiceId}`);

  } catch (error: any) {
    console.error("❌ Error en handlePaymentCaptureFailed:", error.message);
  }
}

/**
 * Maneja el evento CHECKOUT.ORDER.COMPLETED
 */
async function handleCheckoutOrderCompleted(resource: any) {
  try {
    console.log("✅ Procesando CHECKOUT.ORDER.COMPLETED");

    const orderId = resource.id;
    const customId = resource.purchase_units?.[0]?.custom_id;

    if (!customId) {
      console.warn("⚠️ No se encontró customId en el recurso");
      return;
    }

    const customData = JSON.parse(customId);
    const { invoiceId } = customData;

    console.log(`✅ Orden completada: ${orderId} para factura ${invoiceId}`);

  } catch (error: any) {
    console.error("❌ Error en handleCheckoutOrderCompleted:", error.message);
  }
}

/**
 * ============ SUBSCRIPTION HANDLERS ============
 */

/**
 * Maneja el evento BILLING.SUBSCRIPTION.ACTIVATED
 * Cuando una suscripción se activa por primera vez
 */
async function handleSubscriptionActivated(resource: any) {
  try {
    console.log("✅ Procesando BILLING.SUBSCRIPTION.ACTIVATED");

    const subscriptionId = resource.id;
    const planId = resource.plan_id;
    const customId = resource.custom_id;
    const subscriberEmail = resource.subscriber?.email_address;

    console.log(`Suscripción activada: ${subscriptionId}`);
    console.log(`Plan PayPal: ${planId}`);
    console.log(`Email: ${subscriberEmail}`);

    if (!customId) {
      console.warn("⚠️ No se encontró customId en la suscripción");
      return;
    }

    // Parsear customId para obtener información
    let customData;
    try {
      customData = JSON.parse(customId);
    } catch {
      console.warn("⚠️ customId no es JSON válido:", customId);
      return;
    }

    const { invoiceId, companyId } = customData;

    // Buscar la factura
    const invoice = await Invoices.findByPk(invoiceId);
    if (!invoice) {
      console.warn(`⚠️ Factura no encontrada: ${invoiceId}`);
      return;
    }

    // Actualizar la factura con el ID de suscripción de PayPal
    await invoice.update({
      status: "paid",
      paymentMethod: "paypal",
      paypalOrderId: subscriptionId
    } as any);

    // Actualizar fecha de vencimiento
    const plan = await Plan.findByPk(invoice.planId);
    if (plan) {
      await updateDueDateByCompanyId(companyId, invoice.planId, `${plan.name} - PayPal`, plan.recurrence);
    }

    // Reiniciar sesiones de WhatsApp
    try {
      const whatsapps = await ListWhatsAppsService({ companyId });
      for (const wa of whatsapps) {
        await StartWhatsAppSession(wa, companyId);
      }
    } catch (e) {
      console.error("❌ Error iniciando sesiones de WhatsApp:", e);
      Sentry.captureException(e);
    }

    // Emitir evento socket
    const io = getIO();
    const company = await Company.findByPk(companyId);
    io.emit(`company-${companyId}-payment`, {
      action: "SUBSCRIPTION_ACTIVATED",
      company: company?.toJSON(),
      invoice: invoice.toJSON(),
      paymentMethod: "paypal"
    });

    console.log(`✅ Suscripción PayPal activada para factura ${invoiceId}`);

  } catch (error: any) {
    console.error("❌ Error en handleSubscriptionActivated:", error.message);
    Sentry.captureException(error);
  }
}

/**
 * Maneja eventos de cancelación de suscripción
 * BILLING.SUBSCRIPTION.CANCELLED, EXPIRED, SUSPENDED
 */
async function handleSubscriptionCancelled(resource: any, eventType: string) {
  try {
    console.log(`⚠️ Procesando ${eventType}`);

    const subscriptionId = resource.id;
    const customId = resource.custom_id;

    console.log(`Suscripción cancelada/expirada: ${subscriptionId}`);

    if (!customId) {
      console.warn("⚠️ No se encontró customId en la suscripción");
      return;
    }

    let customData;
    try {
      customData = JSON.parse(customId);
    } catch {
      console.warn("⚠️ customId no es JSON válido:", customId);
      return;
    }

    const { invoiceId, companyId } = customData;

    // Buscar la factura
    const invoice = await Invoices.findByPk(invoiceId);
    if (invoice) {
      await invoice.update({
        status: "cancelled"
      });
    }

    // Emitir evento socket
    const io = getIO();
    io.emit(`company-${companyId}-payment`, {
      action: eventType,
      subscriptionId,
      paymentMethod: "paypal"
    });

    console.log(`⚠️ Suscripción ${eventType} para factura ${invoiceId}`);

  } catch (error: any) {
    console.error(`❌ Error en handleSubscriptionCancelled (${eventType}):`, error.message);
  }
}

/**
 * Maneja el evento BILLING.SUBSCRIPTION.PAYMENT.FAILED
 */
async function handleSubscriptionPaymentFailed(resource: any) {
  try {
    console.log("⚠️ Procesando BILLING.SUBSCRIPTION.PAYMENT.FAILED");

    const subscriptionId = resource.id;
    const customId = resource.custom_id;

    if (!customId) {
      console.warn("⚠️ No se encontró customId en la suscripción");
      return;
    }

    let customData;
    try {
      customData = JSON.parse(customId);
    } catch {
      return;
    }

    const { invoiceId, companyId } = customData;

    // Buscar la factura
    const invoice = await Invoices.findByPk(invoiceId);
    if (invoice) {
      await invoice.update({
        status: "open"
      });
    }

    // Emitir evento socket
    const io = getIO();
    io.emit(`company-${companyId}-payment`, {
      action: "PAYMENT_FAILED",
      subscriptionId,
      paymentMethod: "paypal"
    });

    console.log(`⚠️ Pago fallido para suscripción ${subscriptionId}`);

  } catch (error: any) {
    console.error("❌ Error en handleSubscriptionPaymentFailed:", error.message);
  }
}

/**
 * Maneja el evento PAYMENT.SALE.COMPLETED
 * Evento de renovación de suscripción (pago recurrente completado)
 */
async function handlePaymentSaleCompleted(resource: any) {
  try {
    console.log("✅ Procesando PAYMENT.SALE.COMPLETED (renovación)");

    const saleId = resource.id;
    const billingAgreementId = resource.billing_agreement_id;
    const amount = resource.amount?.total;
    const customId = resource.custom;

    console.log(`Pago de renovación completado: ${saleId}`);
    console.log(`Suscripción: ${billingAgreementId}`);
    console.log(`Monto: ${amount}`);

    if (!customId) {
      // Intentar buscar por billing_agreement_id
      const invoice = await Invoices.findOne({
        where: { paypalOrderId: billingAgreementId }
      });

      if (invoice) {
        const { planId, companyId } = invoice;

        // Buscar el plan para obtener la recurrencia
        const plan = await Plan.findByPk(planId);
        if (plan) {
          await updateDueDateByCompanyId(companyId, planId, `${plan.name} - PayPal`, plan.recurrence);
        }

        // Actualizar estado de la factura
        await invoice.update({
          status: "paid",
          payment_intent: saleId
        } as any);

        // Reiniciar sesiones de WhatsApp
        try {
          const whatsapps = await ListWhatsAppsService({ companyId });
          for (const wa of whatsapps) {
            await StartWhatsAppSession(wa, companyId);
          }
        } catch (e) {
          Sentry.captureException(e);
        }

        // Emitir evento socket
        const io = getIO();
        const company = await Company.findByPk(companyId);
        io.emit(`company-${companyId}-payment`, {
          action: "PAYMENT_RENEWAL",
          company: company?.toJSON(),
          invoice: invoice.toJSON(),
          paymentMethod: "paypal"
        });

        console.log(`✅ Renovación procesada para company ${companyId}`);
      } else {
        console.warn("⚠️ No se encontró factura para la renovación");
      }
      return;
    }

    // Si hay customId, procesar como antes
    let customData;
    try {
      customData = JSON.parse(customId);
    } catch {
      return;
    }

    const { invoiceId, companyId, planId } = customData;

    // Actualizar fecha de vencimiento
    const plan = await Plan.findByPk(planId);
    if (plan) {
      await updateDueDateByCompanyId(companyId, planId, `${plan.name} - PayPal`, plan.recurrence);
    }

    // Buscar y actualizar factura
    const invoice = await Invoices.findByPk(invoiceId);
    if (invoice) {
      await invoice.update({
        status: "paid",
        payment_intent: saleId
      } as any);
    }

    console.log(`✅ Renovación completada para factura ${invoiceId}`);

  } catch (error: any) {
    console.error("❌ Error en handlePaymentSaleCompleted:", error.message);
    Sentry.captureException(error);
  }
}
