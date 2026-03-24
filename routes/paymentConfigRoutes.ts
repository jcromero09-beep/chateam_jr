import { Router, Request, Response } from "express";
import isAuth from "../middleware/isAuth";
import { getPaymentConfig } from "../services/PaymentConfigService";

const paymentConfigRoutes = Router();

/**
 * GET /payment-config
 * Obtiene las claves públicas de pago configuradas en el SuperAdmin
 * Útil para el frontend (Stripe Public Key, PayPal Client ID)
 */
paymentConfigRoutes.get("/payment-config", isAuth, async (req: Request, res: Response): Promise<Response> => {
  try {
    const config = await getPaymentConfig();

    return res.json({
      success: true,
      data: {
        stripePublicKey: config.stripePublicKey,
        paypalClientId: config.paypalClientId,
        isStripeConfigured: !!config.stripeSecretKey,
        isPaypalConfigured: !!(config.paypalClientId && config.paypalSecretKey)
      }
    });
  } catch (error: any) {
    console.error("❌ Error obteniendo configuración de pagos:", error.message);
    return res.status(500).json({
      success: false,
      message: "Error al obtener la configuración de pagos",
      error: error.message
    });
  }
});

/**
 * GET /payment-config/public
 * Obtiene solo las claves públicas (sin autenticación)
 */
paymentConfigRoutes.get("/payment-config/public", async (req: Request, res: Response): Promise<Response> => {
  try {
    const config = await getPaymentConfig();

    return res.json({
      success: true,
      data: {
        stripePublicKey: config.stripePublicKey,
        paypalClientId: config.paypalClientId,
        isStripeConfigured: !!config.stripeSecretKey,
        isPaypalConfigured: !!(config.paypalClientId && config.paypalSecretKey)
      }
    });
  } catch (error: any) {
    console.error("❌ Error obteniendo configuración de pagos:", error.message);
    return res.status(500).json({
      success: false,
      message: "Error al obtener la configuración de pagos",
      error: error.message
    });
  }
});

export default paymentConfigRoutes;
