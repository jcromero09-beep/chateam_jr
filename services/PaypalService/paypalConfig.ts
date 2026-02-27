import paypal from "@paypal/checkout-server-sdk";
import Setting from "../../models/Setting";
import AppError from "../../errors/AppError";

/**
 * Configuración del SDK de PayPal
 * Obtiene las credenciales desde la base de datos (modelo Setting)
 * y configura el entorno de PayPal (sandbox/producción)
 */

let cachedClient: paypal.core.PayPalHttpClient | null = null;

export const getPayPalClient = async (): Promise<paypal.core.PayPalHttpClient> => {
  // Si ya tenemos un cliente en cache, retornarlo
  if (cachedClient) {
    return cachedClient;
  }

  try {
    // Obtener credenciales de PayPal desde Settings (companyId: 1 es el admin/principal)
    const companyId = 1;

    const [paypalModeSettings, paypalClientIdSettings, paypalSecretSettings] = await Promise.all([
      Setting.findOne({ where: { companyId, key: "paypalmode" } }),
      Setting.findOne({ where: { companyId, key: "paypalclientid" } }),
      Setting.findOne({ where: { companyId, key: "paypalsecret" } })
    ]);

    const paypalMode = paypalModeSettings?.value || "sandbox";
    const paypalClientId = paypalClientIdSettings?.value;
    const paypalSecret = paypalSecretSettings?.value;

    // Validar que existan las credenciales
    if (!paypalClientId || !paypalSecret) {
      throw new AppError("Credenciales de PayPal no configuradas. Por favor, configure paypalclientid y paypalsecret en Settings.", 500);
    }

    // Configurar el entorno de PayPal
    let environment: paypal.core.SandboxEnvironment | paypal.core.LiveEnvironment;

    if (paypalMode === "production" || paypalMode === "live") {
      // Modo producción
      environment = new paypal.core.LiveEnvironment(paypalClientId, paypalSecret);
      console.log("✅ PayPal configurado en modo PRODUCCIÓN");
    } else {
      // Modo sandbox (desarrollo)
      environment = new paypal.core.SandboxEnvironment(paypalClientId, paypalSecret);
      console.log("✅ PayPal configurado en modo SANDBOX");
    }

    // Crear el cliente de PayPal
    cachedClient = new paypal.core.PayPalHttpClient(environment);

    return cachedClient;

  } catch (error: any) {
    console.error("❌ Error configurando PayPal:", error.message);
    throw new AppError(`Error al configurar PayPal: ${error.message}`, 500);
  }
};

/**
 * Resetear el cliente en cache (útil para tests o reconfiguración)
 */
export const resetPayPalClient = (): void => {
  cachedClient = null;
};
