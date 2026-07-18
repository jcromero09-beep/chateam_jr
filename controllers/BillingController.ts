import { Request, Response } from 'express';
import StripeService from '../services/StripeService';
import CompanyBilling from '../models/CompanyBilling';
import Invoice from '../models/Invoice';
import Refund from '../models/Refund';

export class BillingController {
  private stripeService: StripeService;

  constructor() {
    this.stripeService = new StripeService();
  }

  /**
   * Crea una sesión de checkout para suscripción
   * POST /api/billing/checkout-session
   */
  async createCheckoutSession(req: Request, res: Response): Promise<void> {
    try {
      const { priceId, trialDays, metadata } = req.body;
      const companyId = req.tenant?.id || 1;

      if (!priceId) {
        res.status(400).json({ error: 'priceId is required' });
        return;
      }

      // Buscar o crear customer
      let billing = await CompanyBilling.findOne({ where: { company_id: companyId } });
      let customerId = billing?.stripe_customer_id;

      if (!customerId) {
        // Crear customer en Stripe
        const customerResult = await this.stripeService.createCustomer({
          name: req.tenant?.name || 'Company',
          email: req.user?.email || 'admin@company.com',
          metadata: { company_id: companyId.toString() }
        });

        if (customerResult.error) {
          res.status(400).json({ error: customerResult.error });
          return;
        }

        customerId = customerResult.customer.id;

        // Crear registro de billing
        billing = await CompanyBilling.create({
          company_id: companyId,
          stripe_customer_id: customerId,
          status: 'inactive',
          billing_cycle: 'monthly',
          amount_cents: 0,
          currency: 'usd'
        });
      }

      // Crear sesión de checkout
      const sessionResult = await this.stripeService.createCheckoutSession({
        customerId,
        priceId,
        companyId,
        trialDays,
        metadata
      });

      if (sessionResult.error) {
        res.status(400).json({ error: sessionResult.error });
        return;
      }

      res.status(201).json({
        sessionId: sessionResult.session.id,
        url: sessionResult.session.url
      });
    } catch (error) {
      console.error('Error creating checkout session:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Crea una sesión del portal de billing
   * POST /api/billing/portal
   */
  async createBillingPortal(req: Request, res: Response): Promise<void> {
    try {
      const companyId = req.tenant?.id || 1;
      const { returnUrl } = req.body;

      const billing = await CompanyBilling.findOne({ where: { company_id: companyId } });

      if (!billing || !billing.stripe_customer_id) {
        res.status(404).json({ error: 'Billing not found. Please subscribe first.' });
        return;
      }

      const sessionResult = await this.stripeService.createBillingPortalSession(
        billing.stripe_customer_id,
        returnUrl
      );

      if (sessionResult.error) {
        res.status(400).json({ error: sessionResult.error });
        return;
      }

      res.status(200).json({
        url: sessionResult.session.url
      });
    } catch (error) {
      console.error('Error creating billing portal:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Obtiene información de billing
   * GET /api/billing
   */
  async getBillingInfo(req: Request, res: Response): Promise<void> {
    try {
      const companyId = req.tenant?.id || 1;

      const billing = await CompanyBilling.findOne({
        where: { company_id: companyId }
      });

      if (!billing) {
        res.status(200).json({
          status: 'not_subscribed',
          hasCustomer: false
        });
        return;
      }

      res.status(200).json({
        status: billing.status,
        billingCycle: billing.billing_cycle,
        currentPeriodStart: billing.current_period_start,
        currentPeriodEnd: billing.current_period_end,
        cancelAtPeriodEnd: billing.cancel_at_period_end,
        cancelAt: billing.cancel_at,
        trialEnd: billing.trial_end,
        amount: billing.getFormattedAmount(),
        currency: billing.currency,
        isActive: billing.isActive(),
        isInTrial: billing.isInTrial(),
        daysUntilRenewal: billing.daysUntilRenewal(),
        hasCustomer: !!billing.stripe_customer_id
      });
    } catch (error) {
      console.error('Error getting billing info:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Cancela suscripción
   * POST /api/billing/cancel
   */
  async cancelSubscription(req: Request, res: Response): Promise<void> {
    try {
      const companyId = req.tenant?.id || 1;
      const { cancelAtPeriodEnd = true } = req.body;

      const billing = await CompanyBilling.findOne({ where: { company_id: companyId } });

      if (!billing || !billing.stripe_subscription_id) {
        res.status(404).json({ error: 'Active subscription not found' });
        return;
      }

      const result = await this.stripeService.cancelSubscription(
        billing.stripe_subscription_id,
        cancelAtPeriodEnd
      );

      if (result.error) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.status(200).json({
        message: cancelAtPeriodEnd ? 'Subscription will be canceled at period end' : 'Subscription canceled immediately',
        cancelAtPeriodEnd: result.subscription.cancel_at_period_end,
        cancelAt: result.subscription.cancel_at
      });
    } catch (error) {
      console.error('Error canceling subscription:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Reactiva suscripción
   * POST /api/billing/reactivate
   */
  async reactivateSubscription(req: Request, res: Response): Promise<void> {
    try {
      const companyId = req.tenant?.id || 1;

      const billing = await CompanyBilling.findOne({ where: { company_id: companyId } });

      if (!billing || !billing.stripe_subscription_id) {
        res.status(404).json({ error: 'Subscription not found' });
        return;
      }

      const result = await this.stripeService.reactivateSubscription(billing.stripe_subscription_id);

      if (result.error) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.status(200).json({
        message: 'Subscription reactivated successfully',
        status: result.subscription.status
      });
    } catch (error) {
      console.error('Error reactivating subscription:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Lista facturas
   * GET /api/billing/invoices
   */
  async getInvoices(req: Request, res: Response): Promise<void> {
    try {
      const companyId = req.tenant?.id || 1;
      const { page = 1, limit = 20, status } = req.query;

      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
      const whereClause: any = { company_id: companyId };

      if (status) {
        whereClause.status = status;
      }

      const { count, rows } = await Invoice.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit as string),
        offset,
        order: [['created_at', 'DESC']]
      });

      res.status(200).json({
        invoices: rows.map(invoice => ({
          id: invoice.id,
          invoiceNumber: invoice.invoice_number,
          status: invoice.status,
          amount: invoice.getFormattedAmount(),
          amountCents: invoice.total_cents,
          currency: invoice.currency,
          description: invoice.description,
          dueDate: invoice.due_date,
          paidAt: invoice.paid_at,
          periodStart: invoice.period_start,
          periodEnd: invoice.period_end,
          pdfUrl: invoice.invoice_pdf_url,
          hostedUrl: invoice.hosted_invoice_url,
          isPaid: invoice.isPaid(),
          isOverdue: invoice.isOverdue(),
          daysOverdue: invoice.getDaysOverdue(),
          createdAt: invoice.created_at
        })),
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total: count,
          pages: Math.ceil(count / parseInt(limit as string))
        }
      });
    } catch (error) {
      console.error('Error getting invoices:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Procesa refunds
   * POST /api/billing/refund
   */
  async processRefund(req: Request, res: Response): Promise<void> {
    try {
      const { invoiceId, amountCents, reason, description } = req.body;
      const companyId = req.tenant?.id || 1;
      const userId = req.user?.id || 1;

      if (!invoiceId) {
        res.status(400).json({ error: 'invoiceId is required' });
        return;
      }

      // Buscar la factura
      const invoice = await Invoice.findOne({
        where: { id: invoiceId, company_id: companyId }
      });

      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }

      if (!invoice.isPaid()) {
        res.status(400).json({ error: 'Cannot refund unpaid invoice' });
        return;
      }

      // Obtener el charge ID (simplificado - en realidad necesitarías obtenerlo de Stripe)
      const chargeId = invoice.payment_intent_id; // Esto puede requerir una llamada adicional a Stripe

      if (!chargeId) {
        res.status(400).json({ error: 'Charge ID not found for this invoice' });
        return;
      }

      // Crear refund en Stripe
      const refundResult = await this.stripeService.createRefund({
        chargeId,
        amountCents,
        reason: reason || 'requested_by_customer',
        metadata: {
          invoice_id: invoiceId.toString(),
          company_id: companyId.toString(),
          refunded_by: userId.toString()
        }
      });

      if (refundResult.error) {
        res.status(400).json({ error: refundResult.error });
        return;
      }

      // Crear registro local del refund
      const refund = await Refund.create({
        company_id: companyId,
        invoice_id: invoiceId,
        stripe_refund_id: refundResult.refund.id,
        stripe_charge_id: chargeId,
        amount_cents: refundResult.refund.amount,
        currency: refundResult.refund.currency,
        reason: reason || 'requested_by_customer',
        status: refundResult.refund.status as any,
        description,
        refunded_by: userId,
        metadata: refundResult.refund.metadata
      });

      res.status(201).json({
        refundId: refund.id,
        stripeRefundId: refund.stripe_refund_id,
        amount: refund.getFormattedAmount(),
        status: refund.status,
        reason: refund.getReasonDescription()
      });
    } catch (error) {
      console.error('Error processing refund:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Procesa webhooks de Stripe
   * POST /api/billing/webhook
   */
  async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      const signature = req.headers['stripe-signature'] as string;
      const payload = req.body;

      if (!signature) {
        res.status(400).json({ error: 'Missing stripe-signature header' });
        return;
      }

      const result = await this.stripeService.processWebhook(payload, signature);

      if (result.error) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.status(200).json({ received: true });
    } catch (error) {
      console.error('Error handling webhook:', error);
      res.status(400).json({ error: 'Webhook processing failed' });
    }
  }

  /**
   * Obtiene estadísticas de billing
   * GET /api/billing/stats
   */
  async getBillingStats(req: Request, res: Response): Promise<void> {
    try {
      const companyId = req.tenant?.id || 1;

      // Estadísticas de facturas
      const invoiceStats = await Invoice.findOne({
        attributes: [
          [Invoice.sequelize.fn('COUNT', Invoice.sequelize.col('id')), 'total_invoices'],
          [Invoice.sequelize.fn('SUM', Invoice.sequelize.literal("CASE WHEN status = 'paid' THEN total_cents ELSE 0 END")), 'total_paid_cents'],
          [Invoice.sequelize.fn('COUNT', Invoice.sequelize.literal("CASE WHEN status = 'paid' THEN 1 END")), 'paid_invoices'],
          [Invoice.sequelize.fn('COUNT', Invoice.sequelize.literal("CASE WHEN status = 'open' AND due_date < NOW() THEN 1 END")), 'overdue_invoices'],
        ],
        where: { company_id: companyId },
        raw: true
      }) as any;

      // Estadísticas de refunds
      const refundStats = await Refund.findOne({
        attributes: [
          [Refund.sequelize.fn('COUNT', Refund.sequelize.col('id')), 'total_refunds'],
          [Refund.sequelize.fn('SUM', Refund.sequelize.literal("CASE WHEN status = 'succeeded' THEN amount_cents ELSE 0 END")), 'total_refunded_cents'],
        ],
        where: { company_id: companyId },
        raw: true
      }) as any;

      res.status(200).json({
        invoices: {
          total: parseInt(invoiceStats.total_invoices) || 0,
          paid: parseInt(invoiceStats.paid_invoices) || 0,
          overdue: parseInt(invoiceStats.overdue_invoices) || 0,
          totalPaidAmount: this.formatCents(parseInt(invoiceStats.total_paid_cents) || 0)
        },
        refunds: {
          total: parseInt(refundStats.total_refunds) || 0,
          totalRefundedAmount: this.formatCents(parseInt(refundStats.total_refunded_cents) || 0)
        }
      });
    } catch (error) {
      console.error('Error getting billing stats:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Formatea centavos a moneda
   */
  private formatCents(cents: number, currency: string = 'usd'): string {
    const amount = cents / 100;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(amount);
  }
}

export default BillingController;