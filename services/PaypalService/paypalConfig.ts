import paypal from "@paypal/checkout-server-sdk";
import Company from "../../models/Company";
import User from "../../models/User";
import AppError from "../../errors/AppError";

/**
 * Configuración del SDK de PayPal
 * Obtiene las credenciales desde la company del SuperAdmin (igual que Stripe)
 */

let cachedClient: paypal.core.PayPalHttpClient | null = null;

export const getPayPalClient = async (): Promise<paypal.core.PayPalHttpClient> => {
  // Si ya tenemos un cliente en cache, retornarlo
  if (cachedClient) {
    return cachedClient;
  }

  try {
    // Obtener el superadmin para encontrar su company
    const superAdmin = await User.findOne({ where: { super: true } });
    if (!superAdmin) {
      throw new AppError("SuperAdmin no encontrado", 500);
    }

    // Obtener la company del superadmin
    const superAdminCompany = await Company.findByPk(superAdmin.companyId);
    if (!superAdminCompany) {
      throw new AppError("Company del SuperAdmin no encontrada", 500);
    }

    const paypalClientId = superAdminCompany.paypalClientId;
    const paypalSecret = superAdminCompany.paypalSecretKey;

    // Validar que existan las credenciales
    if (!paypalClientId || !paypalSecret) {
      throw new AppError("Credenciales de PayPal no configuradas. Configure paypalClientId y paypalSecretKey en la empresa del SuperAdmin.", 500);
    }

    // Configurar el entorno de PayPal (usar sandbox por defecto si no está configurado)
    // El modo se puede configurar via variable de entorno o se asume sandbox para desarrollo
    const paypalMode = process.env.PAYPAL_MODE || "sandbox";
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

/**
 * [Fase A S-5] Credenciales crudas + base URL de la API PayPal (para verificación de webhooks).
 * Mismo origen que getPayPalClient (Company del SuperAdmin).
 */
export const getPayPalCreds = async (): Promise<{ clientId: string; secret: string; base: string }> => {
  const superAdmin = await User.findOne({ where: { super: true } });
  const superAdminCompany = superAdmin ? await Company.findByPk(superAdmin.companyId) : null;
  const clientId = superAdminCompany?.paypalClientId;
  const secret = superAdminCompany?.paypalSecretKey;
  if (!clientId || !secret) {
    throw new AppError("Credenciales de PayPal no configuradas", 500);
  }
  const mode = process.env.PAYPAL_MODE || "sandbox";
  const base =
    mode === "production" || mode === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";
  return { clientId, secret, base };
};
