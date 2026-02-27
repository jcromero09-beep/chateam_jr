  import Stripe from 'stripe';
  import CompanyBilling from '../models/CompanyBilling';
  import Invoice from '../models/Invoice';
  import Refund from '../models/Refund';
  import logger, { logError, logInfo, logWarn, logDebug } from '../utils/logger';

  export class StripeService {
    private stripe: Stripe;

    constructor() {
      this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: '2025-03-31' as Stripe.LatestApiVersion,
      });
    }

    // ==========================================
    // CUSTOMER MANAGEMENT
    // ==========================================

    /**
     * Crea un customer en Stripe para una empresa
     */
    async createCustomer(companyData: {
      name: string;
      email: string;
      phone?: string;
      address?: any;
      metadata?: any;
    }): Promise<{ customer: Stripe.Customer; error?: string }> {
      try {
        const customer = await this.stripe.customers.create({
          name: companyData.name,
          email: companyData.email,
          phone: companyData.phone,
          address: companyData.address,
          metadata: {
            ...companyData.metadata,
            created_by: 'chateam_platform'
          }
        });

        logInfo(`✅ Stripe customer created: ${customer.id}`, {
          customerId: customer.id,
          name: companyData.name,
          email: companyData.email
        });

        return { customer };
      } catch (error) {
        logError('❌ Error creating Stripe customer:', error);
        return { customer: null as any, error: error.message };
      }
    }

    /**
     * Actualiza un customer en Stripe
     */
    async updateCustomer(customerId: string, updateData: {
      name?: string;
      email?: string;
      phone?: string;
      address?: any;
      metadata?: any;
    }): Promise<{ customer: Stripe.Customer; error?: string }> {
      try {
        const customer = await this.stripe.customers.update(customerId, updateData);

        logInfo(`✅ Stripe customer updated: ${customer.id}`);
        return { customer };
      } catch (error) {
        logError('❌ Error updating Stripe customer:', error);
        return { customer: null as any, error: error.message };
      }
    }

    // ==========================================
    // CHECKOUT SESSIONS
    // ==========================================

    /**
     * Crea una sesión de checkout para suscripción
     */
    async createCheckoutSession(data: {
      customerId: string;
      priceId: string;
      companyId: number;
      trialDays?: number;
      successUrl?: string;
      cancelUrl?: string;
      metadata?: any;
    }): Promise<{ session: Stripe.Checkout.Session; error?: string }> {
      try {
        const sessionData: Stripe.Checkout.SessionCreateParams = {
          customer: data.customerId,
          payment_method_types: ['card'],
          mode: 'subscription',
          line_items: [
            {
              price: data.priceId,
              quantity: 1,
            },
          ],
          success_url: data.successUrl || process.env.STRIPE_SUCCESS_URL || 'https://app.chateam.com/billing/success',
          cancel_url: data.cancelUrl || process.env.STRIPE_CANCEL_URL || 'https://app.chateam.com/billing/cancel',
          metadata: {
            company_id: data.companyId.toString(),
            ...data.metadata,
          },
        };

        // Agregar trial si se especifica
        if (data.trialDays && data.trialDays > 0) {
          sessionData.subscription_data = {
            trial_period_days: data.trialDays,
          };
        }

        const session = await this.stripe.checkout.sessions.create(sessionData);

        logInfo(`✅ Checkout session created: ${session.id}`, {
          sessionId: session.id,
          customerId: data.customerId,
          priceId: data.priceId,
          companyId: data.companyId
        });

        return { session };
      } catch (error) {
        logError('❌ Error creating checkout session:', error);
        return { session: null as any, error: error.message };
      }
    }

    /**
     * Crea una sesión de checkout para pago único
     */
    async createOneTimeCheckoutSession(data: {
      customerId: string;
      amountCents: number;
      currency: string;
      description: string;
      companyId: number;
      successUrl?: string;
      cancelUrl?: string;
      metadata?: any;
    }): Promise<{ session: Stripe.Checkout.Session; error?: string }> {
      try {
        const session = await this.stripe.checkout.sessions.create({
          customer: data.customerId,
          payment_method_types: ['card'],
          mode: 'payment',
          line_items: [
            {
              price_data: {
                currency: data.currency,
                product_data: {
                  name: data.description,
                },
                unit_amount: data.amountCents,
              },
              quantity: 1,
            },
          ],
          success_url: data.successUrl || process.env.STRIPE_SUCCESS_URL || 'https://app.chateam.com/billing/success',
          cancel_url: data.cancelUrl || process.env.STRIPE_CANCEL_URL || 'https://app.chateam.com/billing/cancel',
          metadata: {
            company_id: data.companyId.toString(),
            payment_type: 'one_time',
            ...data.metadata,
          },
        });

        return { session };
      } catch (error) {
        logError('❌ Error creating one-time checkout session:', error);
        return { session: null as any, error: error.message };
      }
    }

    // ==========================================
    // BILLING PORTAL
    // ==========================================

    /**
     * Crea una sesión del portal de billing
     */
    async createBillingPortalSession(customerId: string, returnUrl?: string): Promise<{ session: Stripe.BillingPortal.Session; error?: string }> {
      try {
        const session = await this.stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: returnUrl || process.env.FRONTEND_URL || 'https://app.chateam.com/billing',
        });

        logInfo(`✅ Billing portal session created: ${session.id}`, {
          customerId,
          sessionId: session.id
        });

        return { session };
      } catch (error) {
        logError('❌ Error creating billing portal session:', error);
        return { session: null as any, error: error.message };
      }
    }

    // ==========================================
    // SUBSCRIPTION MANAGEMENT
    // ==========================================

    /**
     * Cancela una suscripción
     */
    async cancelSubscription(subscriptionId: string, cancelAtPeriodEnd: boolean = true): Promise<{ subscription: Stripe.Subscription; error?: string }> {
      try {
        let subscription: Stripe.Subscription;

        if (cancelAtPeriodEnd) {
          subscription = await this.stripe.subscriptions.update(subscriptionId, {
            cancel_at_period_end: true,
          });
        } else {
          subscription = await this.stripe.subscriptions.cancel(subscriptionId);
        }

        logInfo(`✅ Subscription ${cancelAtPeriodEnd ? 'scheduled for cancellation' : 'canceled'}: ${subscriptionId}`);
        return { subscription };
      } catch (error) {
        logError('❌ Error canceling subscription:', error);
        return { subscription: null as any, error: error.message };
      }
    }

    /**
     * Reactiva una suscripción cancelada
     */
    async reactivateSubscription(subscriptionId: string): Promise<{ subscription: Stripe.Subscription; error?: string }> {
      try {
        const subscription = await this.stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: false,
        });

        logInfo(`✅ Subscription reactivated: ${subscriptionId}`);
        return { subscription };
      } catch (error) {
        logError('❌ Error reactivating subscription:', error);
        return { subscription: null as any, error: error.message };
      }
    }

    // ==========================================
    // REFUNDS
    // ==========================================

    /**
     * Crea un reembolso
     */
    async createRefund(data: {
      chargeId: string;
      amountCents?: number;
      reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
      metadata?: any;
    }): Promise<{ refund: Stripe.Refund; error?: string }> {
      try {
        const refundData: Stripe.RefundCreateParams = {
          charge: data.chargeId,
          reason: data.reason,
          metadata: data.metadata,
        };

        if (data.amountCents) {
          refundData.amount = data.amountCents;
        }

        const refund = await this.stripe.refunds.create(refundData);

        logInfo(`✅ Refund created: ${refund.id}`, {
          refundId: refund.id,
          chargeId: data.chargeId,
          amount: refund.amount
        });

        return { refund };
      } catch (error) {
        logError('❌ Error creating refund:', error);
        return { refund: null as any, error: error.message };
      }
    }

    // ==========================================
    // WEBHOOK PROCESSING
    // ==========================================

    /**
     * Verifica y procesa webhooks de Stripe
     */
    async processWebhook(payload: string, signature: string): Promise<{ processed: boolean; error?: string }> {
      try {
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret) {
          throw new Error('Stripe webhook secret not configured');
        }

        const event = this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);

        logInfo(`📥 Processing Stripe webhook: ${event.type}`, {
          eventId: event.id,
          eventType: event.type
        });

        switch (event.type) {
          case 'customer.subscription.created':
          case 'customer.subscription.updated':
            await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
            break;

          case 'customer.subscription.deleted':
            await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
            break;

          case 'invoice.payment_succeeded':
            await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
            break;

          case 'invoice.payment_failed':
            await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
            break;

          case 'charge.dispute.created':
            await this.handleChargeDisputeCreated(event.data.object as Stripe.Dispute);
            break;

          default:
            logInfo(`🔄 Unhandled webhook event type: ${event.type}`);
        }

        return { processed: true };
      } catch (error) {
        logError('❌ Error processing webhook:', error);
        return { processed: false, error: error.message };
      }
    }

    // ==========================================
    // WEBHOOK HANDLERS
    // ==========================================

    private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
      try {
        const companyId = parseInt(subscription.metadata?.company_id || '0');
        if (!companyId) {
          logWarn('No company_id in subscription metadata');
          return;
        }

        await CompanyBilling.upsert({
          company_id: companyId,
          stripe_customer_id: subscription.customer as string,
          stripe_subscription_id: subscription.id,
          stripe_price_id: subscription.items.data[0]?.price.id,
          status: subscription.status as any,
          billing_cycle: subscription.items.data[0]?.price.recurring?.interval === 'year' ? 'yearly' : 'monthly',
          current_period_start: new Date(subscription.current_period_start * 1000),
          current_period_end: new Date(subscription.current_period_end * 1000),
          cancel_at_period_end: subscription.cancel_at_period_end || false,
          cancel_at: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
          trial_start: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
          trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
          amount_cents: subscription.items.data[0]?.price.unit_amount || 0,
          currency: subscription.items.data[0]?.price.currency || 'usd',
          metadata: subscription.metadata,
        });

        logInfo(`✅ Company billing updated for subscription: ${subscription.id}`);
      } catch (error) {
        logError('❌ Error handling subscription updated:', error);
      }
    }

    private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
      try {
        const companyId = parseInt(subscription.metadata?.company_id || '0');
        if (!companyId) return;

        await CompanyBilling.update({
          status: 'canceled',
          cancel_at: new Date(),
        }, {
          where: { company_id: companyId }
        });

        logInfo(`✅ Company billing canceled for subscription: ${subscription.id}`);
      } catch (error) {
        logError('❌ Error handling subscription deleted:', error);
      }
    }

    private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
      try {
        const companyId = parseInt(invoice.metadata?.company_id || '0');
        if (!companyId) return;

        await Invoice.upsert({
          company_id: companyId,
          stripe_invoice_id: invoice.id,
          stripe_subscription_id: invoice.subscription as string,
          invoice_number: invoice.number || '',
          status: 'paid',
          amount_due_cents: invoice.amount_due,
          amount_paid_cents: invoice.amount_paid,
          amount_remaining_cents: invoice.amount_remaining,
          currency: invoice.currency,
          description: invoice.description || '',
          invoice_pdf_url: invoice.invoice_pdf || undefined,
          hosted_invoice_url: invoice.hosted_invoice_url || undefined,
          payment_intent_id: invoice.payment_intent as string,
          period_start: invoice.period_start ? new Date(invoice.period_start * 1000) : undefined,
          period_end: invoice.period_end ? new Date(invoice.period_end * 1000) : undefined,
          due_date: invoice.due_date ? new Date(invoice.due_date * 1000) : undefined,
          paid_at: new Date(),
          subtotal_cents: invoice.subtotal,
          total_cents: invoice.total,
          tax_amount_cents: invoice.tax || undefined,
          metadata: invoice.metadata,
        });

        logInfo(`✅ Invoice payment succeeded: ${invoice.id}`);
      } catch (error) {
        logError('❌ Error handling invoice payment succeeded:', error);
      }
    }

    private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
      try {
        const companyId = parseInt(invoice.metadata?.company_id || '0');
        if (!companyId) return;

        await Invoice.upsert({
          company_id: companyId,
          stripe_invoice_id: invoice.id,
          stripe_subscription_id: invoice.subscription as string,
          invoice_number: invoice.number || '',
          status: 'open',
          amount_due_cents: invoice.amount_due,
          amount_paid_cents: invoice.amount_paid,
          amount_remaining_cents: invoice.amount_remaining,
          currency: invoice.currency,
          attempt_count: invoice.attempt_count,
          next_payment_attempt: invoice.next_payment_attempt ? new Date(invoice.next_payment_attempt * 1000) : undefined,
          subtotal_cents: invoice.subtotal,
          total_cents: invoice.total,
          metadata: invoice.metadata,
        });

        // Actualizar estado de billing a past_due
        await CompanyBilling.update({
          status: 'past_due',
        }, {
          where: { company_id: companyId }
        });

        logInfo(`❌ Invoice payment failed: ${invoice.id}`);
      } catch (error) {
        logError('❌ Error handling invoice payment failed:', error);
      }
    }

    private async handleChargeDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
      try {
        logWarn(`⚠️ Charge dispute created: ${dispute.id}`, {
          disputeId: dispute.id,
          chargeId: dispute.charge,
          amount: dispute.amount,
          reason: dispute.reason
        });

        // Aquí puedes implementar lógica adicional para manejar disputas
        // Por ejemplo, notificar al equipo de soporte, pausar servicios, etc.
      } catch (error) {
        logError('❌ Error handling charge dispute:', error);
      }
    }
  }

  export default StripeService;
