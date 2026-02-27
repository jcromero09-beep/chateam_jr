import Stripe from 'stripe';
import User from '../models/User';
import Company from '../models/Company';

/**
 * Opciones para crear una sesión de checkout de Stripe
 * Funciona tanto para planes de suscripción como para subplanes de tokens
 */
export interface CheckoutOptions {
  type: 'plan' | 'subplan';
  companyId: number;
  itemId: number;        // planId o subplanId
  priceUsd: number;
  itemName: string;
  stripePriceId?: string;
  isRecurrent?: boolean;
  metadata?: Record<string, string>;
}

export interface CheckoutResult {
  sessionId: string;
  sessionUrl: string;
}

/**
 * Obtiene la clave de Stripe del SuperAdmin
 */
async function getStripeKey(): Promise<string> {
  const superAdmin = await User.findOne({ where: { super: true } });
  if (!superAdmin) {
    throw new Error('SuperAdmin no encontrado');
  }

  const superAdminCompany = await Company.findByPk(superAdmin.companyId);
  const stripeKey = superAdminCompany?.stripeSecretKey;

  if (!stripeKey) {
    throw new Error('Stripe no está configurado. Configure la clave secreta de Stripe en la empresa del SuperAdmin.');
  }

  return stripeKey;
}

/**
 * Crea una sesión de checkout de Stripe
 * Servicio unificado que funciona tanto para planes como subplanes
 */
export async function createStripeCheckoutSession(options: CheckoutOptions): Promise<CheckoutResult> {
  const stripeKey = await getStripeKey();
  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' as any });

  // Construir metadata según el tipo
  const metadata: Record<string, string> = {
    type: options.type === 'subplan' ? 'ai_subplan' : 'plan',
    companyId: String(options.companyId),
  };

  if (options.type === 'subplan') {
    metadata.subplanId = String(options.itemId);
    if (options.metadata?.tokens) {
      metadata.tokens = options.metadata.tokens;
    }
  } else {
    metadata.planId = String(options.itemId);
    if (options.metadata?.invoiceId) {
      metadata.invoiceId = options.metadata.invoiceId;
    }
  }

  // Agregar metadata adicional
  if (options.metadata) {
    Object.keys(options.metadata).forEach(key => {
      if (!metadata[key]) {
        metadata[key] = options.metadata![key];
      }
    });
  }

  let session: Stripe.Checkout.Session;

  if (options.stripePriceId && options.isRecurrent) {
    // Suscripción recurrente con precio preconfigurado en Stripe
    session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: options.stripePriceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.STRIPE_OK_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: process.env.STRIPE_CANCEL_URL,
      metadata,
      subscription_data: {
        metadata
      }
    });
  } else {
    // Pago único (para subplanes de tokens o planes no recurrentes)
    session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: options.itemName,
              description: options.type === 'subplan'
                ? `Paquete de tokens de IA`
                : `Plan de suscripción`
            },
            unit_amount: Math.round(options.priceUsd * 100), // Convertir a centavos
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.STRIPE_OK_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: process.env.STRIPE_CANCEL_URL,
      metadata,
    });
  }

  if (!session.url) {
    throw new Error('No se pudo generar la URL de checkout de Stripe');
  }

  return {
    sessionId: session.id,
    sessionUrl: session.url,
  };
}

export default {
  createStripeCheckoutSession,
};
