import logger from "../../utils/logger";

export interface MercadoPagoConfig {
  accessToken: string;
  publicKey: string;
  webhookSecret: string;
}

export interface PaymentPreference {
  id: string;
  initPoint: string;
  sandboxInitPoint: string;
}

export interface PaymentResult {
  id: string;
  status: 'approved' | 'pending' | 'rejected' | 'in_process' | 'cancelled';
  statusDetail: string;
  transactionAmount: number;
  currency: string;
  paymentMethod: string;
  payer: { email: string; name?: string };
}

/**
 * Create a payment preference (checkout)
 */
const createPreference = async (
  companyId: number,
  options: {
    title: string;
    description: string;
    amount: number;
    currency?: string;
    externalReference?: string;
    backUrls?: {
      success: string;
      failure: string;
      pending: string;
    };
    notificationUrl?: string;
    payer?: { email: string; name?: string };
  }
): Promise<PaymentPreference> => {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('MERCADOPAGO_ACCESS_TOKEN no configurado');
  }

  try {
    const axios = require('axios');
    const response = await axios.post(
      'https://api.mercadopago.com/checkout/preferences',
      {
        items: [{
          title: options.title,
          description: options.description,
          quantity: 1,
          unit_price: options.amount,
          currency_id: options.currency || 'USD'
        }],
        payer: options.payer ? {
          email: options.payer.email,
          name: options.payer.name
        } : undefined,
        back_urls: options.backUrls || {
          success: `${process.env.FRONTEND_URL}/payment/success`,
          failure: `${process.env.FRONTEND_URL}/payment/failure`,
          pending: `${process.env.FRONTEND_URL}/payment/pending`
        },
        notification_url: options.notificationUrl ||
          `${process.env.BACKEND_URL}/api/ai/mercadopago/webhook`,
        external_reference: options.externalReference || `company_${companyId}_${Date.now()}`,
        auto_return: 'approved'
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    logger.info(`[MercadoPago] Preference created: ${response.data.id}, empresa=${companyId}`);

    return {
      id: response.data.id,
      initPoint: response.data.init_point,
      sandboxInitPoint: response.data.sandbox_init_point
    };
  } catch (error: any) {
    logger.error(`[MercadoPago] Error creating preference: ${error.message}`);
    throw error;
  }
};

/**
 * Get payment details by ID
 */
const getPayment = async (paymentId: string): Promise<PaymentResult> => {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('MERCADOPAGO_ACCESS_TOKEN no configurado');
  }

  try {
    const axios = require('axios');
    const response = await axios.get(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        timeout: 10000
      }
    );

    const data = response.data;
    return {
      id: String(data.id),
      status: data.status,
      statusDetail: data.status_detail,
      transactionAmount: data.transaction_amount,
      currency: data.currency_id,
      paymentMethod: data.payment_method_id,
      payer: {
        email: data.payer?.email || '',
        name: data.payer?.first_name ? `${data.payer.first_name} ${data.payer.last_name || ''}`.trim() : undefined
      }
    };
  } catch (error: any) {
    logger.error(`[MercadoPago] Error getting payment: ${error.message}`);
    throw error;
  }
};

/**
 * Process webhook notification
 */
const processWebhook = async (
  type: string,
  dataId: string
): Promise<PaymentResult | null> => {
  if (type !== 'payment') {
    logger.info(`[MercadoPago] Webhook ignored: type=${type}`);
    return null;
  }

  const payment = await getPayment(dataId);
  logger.info(
    `[MercadoPago] Webhook processed: payment=${payment.id}, status=${payment.status}, ` +
    `amount=${payment.transactionAmount} ${payment.currency}`
  );

  return payment;
};

/**
 * Check if MercadoPago is configured
 */
const isConfigured = (): boolean => {
  return !!process.env.MERCADOPAGO_ACCESS_TOKEN;
};

export default {
  createPreference,
  getPayment,
  processWebhook,
  isConfigured
};
