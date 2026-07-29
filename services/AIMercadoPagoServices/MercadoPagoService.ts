import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import logger from "../../utils/logger";
// La validación de firma vive en un módulo propio (sin createRequire) para
// poder testearla aislada. Se re-exporta para no romper a los consumidores.
import {
  verifyWebhookSignature,
  SignatureVerdict
} from "./mercadoPagoSignature";
import {
  registerPaymentEvent,
  NotCreditableReason
} from "../../helpers/paymentWebhookIdempotency";

export { verifyWebhookSignature };
export type { SignatureVerdict };

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
  /**
   * `external_reference` del pago — la referencia `company_{companyId}_{ts}` que
   * se puso al crear la preferencia. Es lo único que ata la notificación a una
   * empresa, y sin empresa no hay clave de idempotencia
   * (ver helpers/paymentWebhookIdempotency).
   */
  externalReference: string | null;
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
      },
      externalReference:
        data.external_reference != null ? String(data.external_reference) : null
    };
  } catch (error: any) {
    logger.error(`[MercadoPago] Error getting payment: ${error.message}`);
    throw error;
  }
};

/**
 * Resultado del webhook: el pago releído de la API más el verdicto de
 * idempotencia. `creditable` es la señal que debe mirar cualquier código que
 * llegue a tocar saldo — hoy nadie lo hace, y por eso hay que dejarlo puesto
 * ANTES de que alguien lo haga.
 */
export interface MercadoPagoWebhookOutcome {
  payment: PaymentResult;
  creditable: boolean;
  reason?: NotCreditableReason;
  companyId: number | null;
}

/**
 * Process webhook notification.
 *
 * MercadoPago manda VARIAS notificaciones por el mismo pago (una por cambio de
 * estado, más reintentos ante cualquier no-2xx), así que el dedupe va por
 * `(pago, estado)` y no por pago: si fuese solo por pago, la notificación de
 * `approved` —la que acredita— se descartaría por haber visto antes la de
 * `pending`. El estado se toma del que devuelve la API, no del body.
 */
const processWebhook = async (
  type: string,
  dataId: string
): Promise<MercadoPagoWebhookOutcome | null> => {
  if (type !== 'payment') {
    logger.info(`[MercadoPago] Webhook ignored: type=${type}`);
    return null;
  }

  const payment = await getPayment(dataId);

  const verdict = await registerPaymentEvent({
    provider: 'mercadopago',
    reference: payment.externalReference,
    externalId: payment.id,
    status: payment.status,
    payload: { type, dataId }
  });

  logger.info(
    `[MercadoPago] Webhook processed: payment=${payment.id}, status=${payment.status}, ` +
    `amount=${payment.transactionAmount} ${payment.currency}, ` +
    `creditable=${verdict.creditable}${verdict.reason ? ` (${verdict.reason})` : ''}`
  );

  return {
    payment,
    creditable: verdict.creditable,
    reason: verdict.reason,
    companyId: verdict.companyId
  };
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
  isConfigured,
  verifyWebhookSignature
};
