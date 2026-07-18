/**
 * PaymentConfigService — Obtiene las claves de pago desde la Company del SuperAdmin
 * Centraliza la lógica de acceso a Stripe y PayPal
 */

import Company from "../models/Company.js";
import User from "../models/User.js";
import AppError from "../errors/AppError.js";

interface PaymentConfig {
  stripeSecretKey: string | null;
  stripePublicKey: string | null;
  paypalClientId: string | null;
  paypalSecretKey: string | null;
}

/**
 * Obtiene las claves de pago configuradas en la Company del SuperAdmin
 * @throws AppError si no hay SuperAdmin o no tiene claves configuradas
 */
export const getPaymentConfig = async (): Promise<PaymentConfig> => {
  const superAdminUser = await User.findOne({ where: { super: true } });

  if (!superAdminUser) {
    throw new AppError("No existe un usuario SuperAdmin en el sistema", 500);
  }

  const superAdminCompany = await Company.findByPk(superAdminUser.companyId);

  if (!superAdminCompany) {
    throw new AppError("Company del SuperAdmin no encontrada", 500);
  }

  return {
    stripeSecretKey: superAdminCompany.stripeSecretKey || null,
    stripePublicKey: superAdminCompany.stripePublicKey || null,
    paypalClientId: superAdminCompany.paypalClientId || null,
    paypalSecretKey: superAdminCompany.paypalSecretKey || null
  };
};

/**
 * Obtiene solo la clave de Stripe (para compatibilidad hacia atrás)
 */
export const getStripeKey = async (): Promise<string> => {
  const config = await getPaymentConfig();

  if (!config.stripeSecretKey) {
    throw new AppError("Stripe Secret Key no configurada en la Company del SuperAdmin", 500);
  }

  return config.stripeSecretKey;
};

/**
 * Obtiene las claves de PayPal
 */
export const getPayPalConfig = async (): Promise<{ clientId: string; secretKey: string }> => {
  const config = await getPaymentConfig();

  if (!config.paypalClientId || !config.paypalSecretKey) {
    throw new AppError("PayPal no configurado en la Company del SuperAdmin", 500);
  }

  return {
    clientId: config.paypalClientId,
    secretKey: config.paypalSecretKey
  };
};

export default {
  getPaymentConfig,
  getStripeKey,
  getPayPalConfig
};
