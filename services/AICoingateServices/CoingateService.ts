import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import logger from "../../utils/logger";
// Autenticación del callback (token en la URL). Módulo aparte para poder
// testearlo sin arrastrar el cliente HTTP de este servicio.
import {
  verifyCallbackToken,
  withCallbackToken,
  CallbackVerdict
} from "./coingateCallbackToken";

export { verifyCallbackToken };
export type { CallbackVerdict };

export interface CoingatOrder {
  id: string;
  status: string;
  priceAmount: number;
  priceCurrency: string;
  receiveAmount: number;
  receiveCurrency: string;
  paymentUrl: string;
  createdAt: string;
}

export interface CoingatePaymentResult {
  id: string;
  status: 'new' | 'pending' | 'confirming' | 'paid' | 'invalid' | 'expired' | 'canceled';
  priceAmount: number;
  priceCurrency: string;
  payAmount: number;
  payCurrency: string;
  createdAt: string;
}

/**
 * Create a crypto payment order
 */
const createOrder = async (
  companyId: number,
  options: {
    amount: number;
    currency?: string;
    receiveCurrency?: string;
    title: string;
    description?: string;
    callbackUrl?: string;
    successUrl?: string;
    cancelUrl?: string;
  }
): Promise<CoingatOrder> => {
  const apiToken = process.env.COINGATE_API_TOKEN;
  if (!apiToken) {
    throw new Error('COINGATE_API_TOKEN no configurado');
  }

  const isSandbox = process.env.COINGATE_SANDBOX === 'true';
  const baseUrl = isSandbox
    ? 'https://api-sandbox.coingate.com/v2'
    : 'https://api.coingate.com/v2';

  try {
    const axios = require('axios');
    const response = await axios.post(
      `${baseUrl}/orders`,
      {
        order_id: `chateam_${companyId}_${Date.now()}`,
        price_amount: options.amount,
        price_currency: options.currency || 'USD',
        receive_currency: options.receiveCurrency || 'USD',
        title: options.title,
        description: options.description || options.title,
        callback_url: withCallbackToken(
          options.callbackUrl || `${process.env.BACKEND_URL}/api/ai/coingate/webhook`
        ),
        success_url: options.successUrl || `${process.env.FRONTEND_URL}/payment/success`,
        cancel_url: options.cancelUrl || `${process.env.FRONTEND_URL}/payment/cancel`
      },
      {
        headers: {
          'Authorization': `Token ${apiToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    const data = response.data;
    logger.info(`[Coingate] Order created: ${data.id}, amount=${options.amount} ${options.currency || 'USD'}, empresa=${companyId}`);

    return {
      id: String(data.id),
      status: data.status,
      priceAmount: data.price_amount,
      priceCurrency: data.price_currency,
      receiveAmount: data.receive_amount,
      receiveCurrency: data.receive_currency,
      paymentUrl: data.payment_url,
      createdAt: data.created_at
    };
  } catch (error: any) {
    logger.error(`[Coingate] Error creating order: ${error.response?.data?.message || error.message}`);
    throw error;
  }
};

/**
 * Get order status
 */
const getOrder = async (orderId: string): Promise<CoingatePaymentResult> => {
  const apiToken = process.env.COINGATE_API_TOKEN;
  if (!apiToken) throw new Error('COINGATE_API_TOKEN no configurado');

  const isSandbox = process.env.COINGATE_SANDBOX === 'true';
  const baseUrl = isSandbox ? 'https://api-sandbox.coingate.com/v2' : 'https://api.coingate.com/v2';

  try {
    const axios = require('axios');
    const response = await axios.get(`${baseUrl}/orders/${orderId}`, {
      headers: { 'Authorization': `Token ${apiToken}` },
      timeout: 10000
    });

    const data = response.data;
    return {
      id: String(data.id),
      status: data.status,
      priceAmount: data.price_amount,
      priceCurrency: data.price_currency,
      payAmount: data.pay_amount,
      payCurrency: data.pay_currency,
      createdAt: data.created_at
    };
  } catch (error: any) {
    logger.error(`[Coingate] Error getting order ${orderId}: ${error.message}`);
    throw error;
  }
};

/**
 * Procesa el callback de CoinGate.
 *
 * Del body solo se usa el `id` de la orden: todo lo demás (estado, importe,
 * divisa) se relee de la API de CoinGate. Antes se devolvía el body tal cual,
 * de modo que quien conociera la URL podía declarar `status: 'paid'` con el
 * importe que quisiera.
 */
const processWebhook = async (payload: Record<string, any>): Promise<CoingatePaymentResult | null> => {
  const { id } = payload;

  if (!id) {
    logger.warn('[Coingate] Webhook received without order ID');
    return null;
  }

  // Fuente de verdad: la API, no el remitente del callback.
  const order = await getOrder(String(id));

  const claimedStatus = payload.status;
  if (claimedStatus && claimedStatus !== order.status) {
    logger.warn(
      `[Coingate] El callback declaraba status='${claimedStatus}' pero la API dice '${order.status}' ` +
        `(order=${order.id}) — prevalece la API`
    );
  }

  logger.info(
    `[Coingate] Webhook: order=${order.id}, status=${order.status}, ` +
      `amount=${order.priceAmount} ${order.priceCurrency} (verificado contra la API)`
  );

  return order;
};

/**
 * Get supported cryptocurrencies
 */
const getSupportedCurrencies = async (): Promise<string[]> => {
  const apiToken = process.env.COINGATE_API_TOKEN;
  if (!apiToken) return ['BTC', 'ETH', 'USDT', 'USDC', 'LTC'];

  try {
    const axios = require('axios');
    const isSandbox = process.env.COINGATE_SANDBOX === 'true';
    const baseUrl = isSandbox ? 'https://api-sandbox.coingate.com/v2' : 'https://api.coingate.com/v2';

    const response = await axios.get(`${baseUrl}/currencies`, {
      headers: { 'Authorization': `Token ${apiToken}` },
      timeout: 5000
    });

    return response.data?.map((c: any) => c.symbol || c) || ['BTC', 'ETH', 'USDT'];
  } catch {
    return ['BTC', 'ETH', 'USDT', 'USDC', 'LTC'];
  }
};

/**
 * Check if Coingate is configured
 */
const isConfigured = (): boolean => {
  return !!process.env.COINGATE_API_TOKEN;
};

export default {
  createOrder,
  getOrder,
  processWebhook,
  getSupportedCurrencies,
  isConfigured,
  verifyCallbackToken
};
