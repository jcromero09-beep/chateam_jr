import { BaseIntegrationService, SyncResult } from './BaseIntegrationService';
import Contact from '../../models/Contact';
import logger from '../../config/logger.js';

/**
 * Billie Integration Service
 * Sistema de facturación y pagos
 */
class BillieIntegrationService extends BaseIntegrationService {
  /**
   * Get authentication headers for Billie API
   */
  protected getAuthHeaders(): Record<string, string> {
    const apiKey = this.connection.authCredentials.apiKey;

    return {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-API-Version': '2024-01'
    };
  }

  /**
   * Validate Billie connection
   */
  async validateConnection(): Promise<boolean> {
    try {
      const response = await this.httpClient.get('/api/v1/auth/validate');
      return response.status === 200;
    } catch (error) {
      logger.error('Billie connection validation failed', { error });
      return false;
    }
  }

  /**
   * Sync customers from Billie to JR CHATEAM contacts
   */
  async syncInbound(entityType: string, options?: any): Promise<SyncResult> {
    const syncLog = await this.createSyncLog('full', 'inbound', entityType);

    const result: SyncResult = {
      success: true,
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsFailed: 0,
      errors: []
    };

    try {
      if (entityType === 'customers') {
        // Fetch customers from Billie
        const response = await this.httpClient.get('/api/v1/customers', {
          params: {
            limit: options?.limit || 100,
            offset: options?.offset || 0,
            updated_since: options?.updatedSince
          }
        });

        const customers = response.data.data || [];
        result.recordsProcessed = customers.length;

        for (const customer of customers) {
          try {
            await this.syncCustomer(customer);
            result.recordsCreated++;
          } catch (error: any) {
            result.recordsFailed++;
            result.errors?.push({
              entity: customer,
              error: error.message
            });
          }
        }
      } else if (entityType === 'invoices') {
        await this.syncInvoices(options);
      } else if (entityType === 'payments') {
        await this.syncPayments(options);
      }

      result.success = result.recordsFailed === 0;
    } catch (error: any) {
      result.success = false;
      result.errors?.push({
        entity: null,
        error: error.message
      });
    }

    await this.updateSyncLog(syncLog, result);
    return result;
  }

  /**
   * Sync contacts from JR CHATEAM to Billie customers
   */
  async syncOutbound(
    entityType: string,
    entityIds: number[],
    options?: any
  ): Promise<SyncResult> {
    const syncLog = await this.createSyncLog('incremental', 'outbound', entityType);

    const result: SyncResult = {
      success: true,
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsFailed: 0,
      errors: []
    };

    try {
      if (entityType === 'contacts') {
        const contacts = await Contact.findAll({
          where: {
            id: entityIds,
            companyId: this.connection.companyId
          }
        });

        result.recordsProcessed = contacts.length;

        for (const contact of contacts) {
          try {
            const existingMapping = await this.getEntityMapping(
              'customer',
              contact.id
            );

            if (existingMapping) {
              // Update customer in Billie
              await this.updateBillieCustomer(contact, existingMapping.externalEntityId);
              result.recordsUpdated++;
            } else {
              // Create new customer in Billie
              const billieCustomerId = await this.createBillieCustomer(contact);
              await this.mapEntity(
                'customer',
                contact.id,
                billieCustomerId,
                { name: contact.name, email: contact.email },
                { billie_id: billieCustomerId }
              );
              result.recordsCreated++;
            }
          } catch (error: any) {
            result.recordsFailed++;
            result.errors?.push({
              entity: contact,
              error: error.message
            });
          }
        }
      }

      result.success = result.recordsFailed === 0;
    } catch (error: any) {
      result.success = false;
      result.errors?.push({
        entity: null,
        error: error.message
      });
    }

    await this.updateSyncLog(syncLog, result);
    return result;
  }

  /**
   * Process webhook from Billie
   */
  async processWebhook(eventType: string, payload: any): Promise<void> {
    logger.info('Processing Billie webhook', { eventType, payload });

    switch (eventType) {
      case 'customer.created':
      case 'customer.updated':
        await this.handleCustomerWebhook(payload);
        break;

      case 'invoice.created':
      case 'invoice.updated':
        await this.handleInvoiceWebhook(payload);
        break;

      case 'payment.received':
        await this.handlePaymentWebhook(payload);
        break;

      case 'payment.failed':
        await this.handlePaymentFailedWebhook(payload);
        break;

      default:
        logger.warn('Unknown Billie webhook event type', { eventType });
    }
  }

  /**
   * Sync a single customer from Billie
   */
  private async syncCustomer(billieCustomer: any): Promise<void> {
    const mapping = await this.getEntityMapping(
      'customer',
      undefined,
      billieCustomer.id
    );

    const contactData = {
      companyId: this.connection.companyId,
      name: billieCustomer.name,
      email: billieCustomer.email,
      number: billieCustomer.phone,
      extraInfo: billieCustomer.notes
    };

    if (mapping) {
      // Update existing contact
      await Contact.update(contactData, {
        where: { id: mapping.localEntityId }
      });
    } else {
      // Create new contact
      const contact = await Contact.create(contactData);
      await this.mapEntity(
        'customer',
        contact.id,
        billieCustomer.id,
        { name: contact.name, email: contact.email },
        billieCustomer
      );
    }
  }

  /**
   * Create customer in Billie
   */
  private async createBillieCustomer(contact: Contact): Promise<string> {
    const response = await this.httpClient.post('/api/v1/customers', {
      name: contact.name,
      email: contact.email,
      phone: contact.number,
      notes: contact.extraInfo,
      metadata: {
        jrchateam_contact_id: contact.id.toString()
      }
    });

    return response.data.id;
  }

  /**
   * Update customer in Billie
   */
  private async updateBillieCustomer(
    contact: Contact,
    billieCustomerId: string
  ): Promise<void> {
    await this.httpClient.put(`/api/v1/customers/${billieCustomerId}`, {
      name: contact.name,
      email: contact.email,
      phone: contact.number,
      notes: contact.extraInfo
    });
  }

  /**
   * Sync invoices from Billie
   */
  private async syncInvoices(options?: any): Promise<void> {
    const response = await this.httpClient.get('/api/v1/invoices', {
      params: {
        limit: options?.limit || 100,
        status: options?.status,
        updated_since: options?.updatedSince
      }
    });

    const invoices = response.data.data || [];

    for (const invoice of invoices) {
      // Store invoice data in metadata
      const mapping = await this.getEntityMapping(
        'customer',
        undefined,
        invoice.customer_id
      );

      if (mapping) {
        const contact = await Contact.findByPk(mapping.localEntityId);
        if (contact) {
          const metadata = (contact as any).metadata || {};
          metadata.billie_invoices = metadata.billie_invoices || [];
          metadata.billie_invoices.push(invoice);
          await contact.update({ metadata });
        }
      }
    }
  }

  /**
   * Sync payments from Billie
   */
  private async syncPayments(options?: any): Promise<void> {
    const response = await this.httpClient.get('/api/v1/payments', {
      params: {
        limit: options?.limit || 100,
        updated_since: options?.updatedSince
      }
    });

    const payments = response.data.data || [];

    for (const payment of payments) {
      // Store payment data in metadata
      const mapping = await this.getEntityMapping(
        'customer',
        undefined,
        payment.customer_id
      );

      if (mapping) {
        const contact = await Contact.findByPk(mapping.localEntityId);
        if (contact) {
          const metadata = (contact as any).metadata || {};
          metadata.billie_payments = metadata.billie_payments || [];
          metadata.billie_payments.push(payment);
          await contact.update({ metadata });
        }
      }
    }
  }

  /**
   * Handle customer webhook
   */
  private async handleCustomerWebhook(payload: any): Promise<void> {
    await this.syncCustomer(payload.customer);
  }

  /**
   * Handle invoice webhook
   */
  private async handleInvoiceWebhook(payload: any): Promise<void> {
    const invoice = payload.invoice;
    const mapping = await this.getEntityMapping(
      'customer',
      undefined,
      invoice.customer_id
    );

    if (mapping) {
      const contact = await Contact.findByPk(mapping.localEntityId);
      if (contact) {
        const metadata = contact.metadata || {};
        metadata.billie_last_invoice = invoice;
        await contact.update({ metadata });

        logger.info('Invoice updated for contact', {
          contactId: contact.id,
          invoiceId: invoice.id
        });
      }
    }
  }

  /**
   * Handle payment webhook
   */
  private async handlePaymentWebhook(payload: any): Promise<void> {
    const payment = payload.payment;
    const mapping = await this.getEntityMapping(
      'customer',
      undefined,
      payment.customer_id
    );

    if (mapping) {
      const contact = await Contact.findByPk(mapping.localEntityId);
      if (contact) {
        const metadata = contact.metadata || {};
        metadata.billie_last_payment = payment;
        await contact.update({ metadata });

        logger.info('Payment received for contact', {
          contactId: contact.id,
          paymentId: payment.id,
          amount: payment.amount
        });
      }
    }
  }

  /**
   * Handle payment failed webhook
   */
  private async handlePaymentFailedWebhook(payload: any): Promise<void> {
    const payment = payload.payment;
    const mapping = await this.getEntityMapping(
      'customer',
      undefined,
      payment.customer_id
    );

    if (mapping) {
      logger.warn('Payment failed for contact', {
        contactId: mapping.localEntityId,
        paymentId: payment.id,
        reason: payment.failure_reason
      });

      // Could create a ticket or notification here
    }
  }

  /**
   * Get customer invoices from Billie
   */
  async getCustomerInvoices(contactId: number): Promise<any[]> {
    const mapping = await this.getEntityMapping('customer', contactId);

    if (!mapping) {
      return [];
    }

    const response = await this.httpClient.get('/api/v1/invoices', {
      params: {
        customer_id: mapping.externalEntityId
      }
    });

    return response.data.data || [];
  }

  /**
   * Create invoice in Billie
   */
  async createInvoice(contactId: number, invoiceData: any): Promise<any> {
    const mapping = await this.getEntityMapping('customer', contactId);

    if (!mapping) {
      throw new Error('Customer not mapped to Billie');
    }

    const response = await this.httpClient.post('/api/v1/invoices', {
      customer_id: mapping.externalEntityId,
      ...invoiceData
    });

    return response.data;
  }
}

export default BillieIntegrationService;
