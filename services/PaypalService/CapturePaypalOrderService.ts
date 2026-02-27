import paypal from "@paypal/checkout-server-sdk";
import { getPayPalClient } from "./paypalConfig";
import Invoices from "../../models/Invoices";
import Plan from "../../models/Plan";
import Company from "../../models/Company";
import AppError from "../../errors/AppError";
import { updateDueDateByCompanyId } from "../CompanyService/dateCompany";
import { getIO } from "../../libs/socket";
import ListWhatsAppsService from "../WhatsappService/ListWhatsAppsService";
import { StartWhatsAppSession } from "../WbotServices/StartWhatsAppSession";
import * as Sentry from "@sentry/node";

interface CapturePaypalOrderRequest {
  orderID: string;
  invoiceId: number;
}

interface CapturePaypalOrderResponse {
  success: boolean;
  captureID: string;
  status: string;
  invoiceId: number;
  companyId: number;
}

/**
 * Servicio para capturar el pago de una orden de PayPal
 * - Recibe: orderID, invoiceId
 * - Captura el pago en PayPal
 * - Actualiza Invoice a "paid" con paymentMethod: 'paypal' y paypalOrderId
 * - Calcula días según meses pagados y actualiza dueDate usando updateDueDateByCompanyId
 * - Emite evento socket company-{companyId}-payment con action: 'CONCLUIDA'
 */
const CapturePaypalOrderService = async ({
  orderID,
  invoiceId
}: CapturePaypalOrderRequest): Promise<CapturePaypalOrderResponse> => {
  try {
    // Validar parámetros
    if (!orderID || !invoiceId) {
      throw new AppError("Parámetros inválidos. Se requiere orderID e invoiceId.", 400);
    }

    // Buscar la factura
    const invoice = await Invoices.findByPk(invoiceId);
    if (!invoice) {
      throw new AppError("Factura no encontrada", 404);
    }

    // Verificar que la factura no esté ya pagada
    if (invoice.status === "paid") {
      console.warn(`⚠️ La factura ${invoiceId} ya está marcada como pagada`);
      return {
        success: true,
        captureID: invoice.paypalOrderId || orderID,
        status: "ALREADY_PAID",
        invoiceId: invoice.id,
        companyId: invoice.companyId
      };
    }

    // Obtener el cliente de PayPal
    const client = await getPayPalClient();

    // Crear la solicitud de captura
    const request = new paypal.orders.OrdersCaptureRequest(orderID);
    request.requestBody({});

    // Ejecutar la captura
    const response = await client.execute(request);
    const captureData = response.result;

    console.log(`✅ Respuesta de PayPal:`, JSON.stringify(captureData, null, 2));

    // Verificar el estado de la captura
    if (captureData.status !== "COMPLETED") {
      throw new AppError(`El pago no se completó. Estado: ${captureData.status}`, 400);
    }

    // Obtener información del pago
    const captureID = captureData.purchase_units[0]?.payments?.captures?.[0]?.id || orderID;
    const customId = captureData.purchase_units[0]?.custom_id;

    // Extraer información personalizada si existe
    let months = 1; // Default: 1 mes
    let planId = invoice.planId;
    let companyId = invoice.companyId;

    if (customId) {
      try {
        const customData = JSON.parse(customId);
        months = customData.months || 1;
        planId = customData.planId || planId;
        companyId = customData.companyId || companyId;
      } catch (e) {
        console.warn("⚠️ No se pudo parsear customId:", customId);
      }
    }

    // Buscar el plan
    const plan = await Plan.findByPk(planId);
    if (!plan) {
      throw new AppError("Plan no encontrado", 404);
    }

    // Calcular la recurrencia basada en los meses
    let recurrence = plan.recurrence;

    // Si se pagaron múltiples meses, ajustar la recurrencia
    if (months > 1) {
      if (months === 2) recurrence = "BIMESTRAL";
      else if (months === 3) recurrence = "TRIMESTRAL";
      else if (months === 6) recurrence = "SEMESTRAL";
      else if (months === 12) recurrence = "ANUAL";
      else {
        // Para cantidades personalizadas, calcular días manualmente
        recurrence = `${months}MONTHS`;
      }
    }

    // Actualizar la factura a "paid"
    await invoice.update({
      status: "paid",
      paymentMethod: "paypal",
      paypalOrderId: orderID,
      payment_intent: captureID,
      planId: planId,
      recurrence: recurrence,
      detail: `${plan.name} - ${months} mes(es)`
    } as any);

    // Actualizar la compañía con el nuevo plan
    const company = await Company.findByPk(companyId);
    if (!company) {
      throw new AppError("Compañía no encontrada", 404);
    }

    // Actualizar la fecha de vencimiento usando el servicio existente
    // Si tenemos meses personalizados, llamamos múltiples veces
    for (let i = 0; i < months; i++) {
      await updateDueDateByCompanyId(companyId, planId, `${plan.name} - PayPal`, plan.recurrence);
    }

    // Actualizar el método de pago de la compañía
    await company.update({
      paymentMethod: "paypal"
    });

    // Reiniciar sesiones de WhatsApp
    try {
      const whatsapps = await ListWhatsAppsService({ companyId });
      if (whatsapps.length > 0) {
        for (const whatsapp of whatsapps) {
          await StartWhatsAppSession(whatsapp, companyId);
        }
        console.log(`✅ Sesiones de WhatsApp reiniciadas para company ${companyId}`);
      }
    } catch (e) {
      console.error("❌ Error iniciando sesiones de WhatsApp:", e);
      Sentry.captureException(e);
    }

    // Recargar la compañía para obtener datos actualizados
    await company.reload();

    // Emitir evento socket
    const io = getIO();
    io.emit(`company-${companyId}-payment`, {
      action: "CONCLUIDA",
      company: company.toJSON(),
      invoice: invoice.toJSON(),
      paymentMethod: "paypal",
      status: "paid"
    });

    console.log(`✅ Pago de PayPal capturado exitosamente para factura ${invoiceId}`);
    console.log(`📅 Nueva fecha de vencimiento: ${company.dueDate}`);

    return {
      success: true,
      captureID,
      status: "COMPLETED",
      invoiceId: invoice.id,
      companyId: company.id
    };

  } catch (error: any) {
    console.error("❌ Error capturando orden de PayPal:", error.message);

    if (error instanceof AppError) {
      throw error;
    }

    // Si es un error de PayPal, proporcionar más detalles
    if (error.statusCode) {
      throw new AppError(
        `Error de PayPal (${error.statusCode}): ${error.message}`,
        error.statusCode
      );
    }

    throw new AppError(`Error al capturar el pago de PayPal: ${error.message}`, 500);
  }
};

export default CapturePaypalOrderService;
