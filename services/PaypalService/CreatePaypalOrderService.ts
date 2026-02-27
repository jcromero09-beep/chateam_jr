import paypal from "@paypal/checkout-server-sdk";
import { getPayPalClient } from "./paypalConfig";
import Invoices from "../../models/Invoices";
import Plan from "../../models/Plan";
import AppError from "../../errors/AppError";

interface CreatePaypalOrderRequest {
  invoiceId: number;
  planId: number;
  months: number;
}

interface CreatePaypalOrderResponse {
  orderID: string;
  approveURL: string;
}

/**
 * Servicio para crear una orden de pago en PayPal
 * - Recibe: invoiceId, planId, months (cantidad de meses a pagar)
 * - Calcula precio total: plan.amount * months
 * - Crea orden en PayPal API con currency USD
 * - Retorna: { orderID, approveURL }
 */
const CreatePaypalOrderService = async ({
  invoiceId,
  planId,
  months
}: CreatePaypalOrderRequest): Promise<CreatePaypalOrderResponse> => {
  try {
    // Validar parámetros
    if (!invoiceId || !planId || !months || months < 1) {
      throw new AppError("Parámetros inválidos. Se requiere invoiceId, planId y months (mínimo 1).", 400);
    }

    // Buscar la factura
    const invoice = await Invoices.findByPk(invoiceId);
    if (!invoice) {
      throw new AppError("Factura no encontrada", 404);
    }

    // Buscar el plan
    const plan = await Plan.findByPk(planId);
    if (!plan) {
      throw new AppError("Plan no encontrado", 404);
    }

    // Calcular el precio total (plan.amount * months)
    const planAmount = parseFloat(plan.amount);
    if (isNaN(planAmount) || planAmount <= 0) {
      throw new AppError("El monto del plan es inválido", 400);
    }

    const totalAmount = (planAmount * months).toFixed(2);

    // Obtener el cliente de PayPal
    const client = await getPayPalClient();

    // Crear la solicitud de orden de PayPal
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
      intent: "CAPTURE",
      purchase_units: [
        {
          description: `Plan ${plan.name} - ${months} mes(es) - Factura #${invoiceId}`,
          amount: {
            currency_code: "USD",
            value: totalAmount
          },
          reference_id: invoiceId.toString(),
          custom_id: JSON.stringify({
            invoiceId,
            planId,
            months,
            companyId: invoice.companyId
          })
        }
      ],
      application_context: {
        brand_name: "ChatEam",
        landing_page: "BILLING",
        user_action: "PAY_NOW",
        return_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/payment-success`,
        cancel_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/payment-cancel`
      }
    });

    // Ejecutar la solicitud
    const response = await client.execute(request);

    // Obtener el orderID
    const orderID = response.result.id;

    // Buscar el link de aprobación
    const approveLink = response.result.links?.find(
      (link: any) => link.rel === "approve"
    );

    if (!approveLink) {
      throw new AppError("No se pudo obtener el link de aprobación de PayPal", 500);
    }

    const approveURL = approveLink.href;

    // Actualizar la factura con información de PayPal
    await invoice.update({
      paypalOrderId: orderID,
      status: "pending"
    } as any);

    console.log(`✅ Orden de PayPal creada exitosamente: ${orderID} para factura ${invoiceId}`);

    return {
      orderID,
      approveURL
    };

  } catch (error: any) {
    console.error("❌ Error creando orden de PayPal:", error.message);

    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(`Error al crear la orden de PayPal: ${error.message}`, 500);
  }
};

export default CreatePaypalOrderService;
