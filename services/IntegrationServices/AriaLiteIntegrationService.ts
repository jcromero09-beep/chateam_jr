import { BaseIntegrationService, SyncResult } from './BaseIntegrationService';
import Contact from '../../models/Contact';
import Ticket from '../../models/Ticket';
import { logger } from '../../config/logger.js';

/**
 * Aria Lite Integration Service
 * Sistema CRM empresarial con OAuth2
 */
class AriaLiteIntegrationService extends BaseIntegrationService {
  /**
   * Get authentication headers for Aria Lite API (OAuth2)
   */
  protected getAuthHeaders(): Record<string, string> {
    const accessToken = this.connection.authCredentials.accessToken;

    return {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  /**
   * Validate Aria Lite connection
   */
  async validateConnection(): Promise<boolean> {
    try {
      const response = await this.httpClient.get('/api/v2/me');
      return response.status === 200;
    } catch (error) {
      logger.error('Aria Lite connection validation failed', { error });
      return false;
    }
  }

  /**
   * Sync contacts/companies/deals from Aria Lite
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
      if (entityType === 'contacts') {
        const response = await this.httpClient.get('/api/v2/contacts', {
          params: {
            page_size: options?.limit || 100,
            page: options?.page || 1,
            updated_since: options?.updatedSince
          }
        });

        const contacts = response.data.results || [];
        result.recordsProcessed = contacts.length;

        for (const ariaContact of contacts) {
          try {
            await this.syncContact(ariaContact);
            result.recordsCreated++;
          } catch (error: any) {
            result.recordsFailed++;
            result.errors?.push({
              entity: ariaContact,
              error: error.message
            });
          }
        }
      } else if (entityType === 'companies') {
        await this.syncCompanies(options);
      } else if (entityType === 'deals') {
        await this.syncDeals(options);
      } else if (entityType === 'activities') {
        await this.syncActivities(options);
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
   * Sync contacts/tickets to Aria Lite
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
              'contact',
              contact.id
            );

            if (existingMapping) {
              await this.updateAriaContact(contact, existingMapping.externalEntityId);
              result.recordsUpdated++;
            } else {
              const ariaContactId = await this.createAriaContact(contact);
              await this.mapEntity(
                'contact',
                contact.id,
                ariaContactId,
                { name: contact.name, email: contact.email },
                { aria_id: ariaContactId }
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
      } else if (entityType === 'tickets') {
        await this.syncTicketsToDeals(entityIds, result);
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
   * Process webhook from Aria Lite
   */
  async processWebhook(eventType: string, payload: any): Promise<void> {
    logger.info('Processing Aria Lite webhook', { eventType, payload });

    switch (eventType) {
      case 'contact.created':
      case 'contact.updated':
        await this.handleContactWebhook(payload);
        break;

      case 'deal.created':
      case 'deal.updated':
        await this.handleDealWebhook(payload);
        break;

      case 'activity.created':
        await this.handleActivityWebhook(payload);
        break;

      default:
        logger.warn('Unknown Aria Lite webhook event type', { eventType });
    }
  }

  /**
   * Sync a single contact from Aria Lite
   */
  private async syncContact(ariaContact: any): Promise<void> {
    const mapping = await this.getEntityMapping(
      'contact',
      undefined,
      ariaContact.id
    );

    const contactData = {
      companyId: this.connection.companyId,
      name: ariaContact.name || `${ariaContact.first_name} ${ariaContact.last_name}`,
      email: ariaContact.email,
      number: ariaContact.phone,
      extraInfo: ariaContact.description
    };

    if (mapping) {
      await Contact.update(contactData, {
        where: { id: mapping.localEntityId }
      });
    } else {
      const contact = await Contact.create(contactData);
      await this.mapEntity(
        'contact',
        contact.id,
        ariaContact.id,
        { name: contact.name, email: contact.email },
        ariaContact
      );
    }
  }

  /**
   * Create contact in Aria Lite
   */
  private async createAriaContact(contact: Contact): Promise<string> {
    const nameParts = contact.name.split(' ');
    const response = await this.httpClient.post('/api/v2/contacts', {
      first_name: nameParts[0],
      last_name: nameParts.slice(1).join(' ') || nameParts[0],
      email: contact.email,
      phone: contact.number,
      description: contact.extraInfo,
      custom_fields: {
        jrchateam_contact_id: contact.id.toString()
      }
    });

    return response.data.id;
  }

  /**
   * Update contact in Aria Lite
   */
  private async updateAriaContact(
    contact: Contact,
    ariaContactId: string
  ): Promise<void> {
    const nameParts = contact.name.split(' ');
    await this.httpClient.put(`/api/v2/contacts/${ariaContactId}`, {
      first_name: nameParts[0],
      last_name: nameParts.slice(1).join(' ') || nameParts[0],
      email: contact.email,
      phone: contact.number,
      description: contact.extraInfo
    });
  }

  /**
   * Sync companies from Aria Lite
   */
  private async syncCompanies(options?: any): Promise<void> {
    const response = await this.httpClient.get('/api/v2/companies', {
      params: {
        page_size: options?.limit || 100,
        page: options?.page || 1
      }
    });

    // Store companies in metadata or create custom table
    logger.info('Companies synced', { count: response.data.results?.length || 0 });
  }

  /**
   * Sync deals from Aria Lite
   */
  private async syncDeals(options?: any): Promise<void> {
    const response = await this.httpClient.get('/api/v2/deals', {
      params: {
        page_size: options?.limit || 100,
        page: options?.page || 1,
        status: options?.status
      }
    });

    const deals = response.data.results || [];

    for (const deal of deals) {
      const mapping = await this.getEntityMapping(
        'contact',
        undefined,
        deal.contact_id
      );

      if (mapping) {
        const contact = await Contact.findByPk(mapping.localEntityId);
        if (contact) {
          const metadata = contact.metadata || {};
          metadata.aria_deals = metadata.aria_deals || [];
          metadata.aria_deals.push(deal);
          await contact.update({ metadata });
        }
      }
    }
  }

  /**
   * Sync activities from Aria Lite
   */
  private async syncActivities(options?: any): Promise<void> {
    const response = await this.httpClient.get('/api/v2/activities', {
      params: {
        page_size: options?.limit || 100,
        page: options?.page || 1,
        updated_since: options?.updatedSince
      }
    });

    logger.info('Activities synced', { count: response.data.results?.length || 0 });
  }

  /**
   * Sync tickets to Aria Lite deals
   */
  private async syncTicketsToDeals(
    ticketIds: number[],
    result: SyncResult
  ): Promise<void> {
    const tickets = await Ticket.findAll({
      where: {
        id: ticketIds,
        companyId: this.connection.companyId
      },
      include: [{ model: Contact, as: 'contact' }]
    });

    for (const ticket of tickets) {
      try {
        const contactMapping = await this.getEntityMapping(
          'contact',
          ticket.contactId
        );

        if (!contactMapping) {
          continue;
        }

        const dealMapping = await this.getEntityMapping(
          'deal',
          ticket.id
        );

        if (dealMapping) {
          // Update deal
          await this.httpClient.put(`/api/v2/deals/${dealMapping.externalEntityId}`, {
            title: ticket.subject || `Ticket #${ticket.id}`,
            status: this.mapTicketStatusToDealStatus(ticket.status),
            value: 0, // Could map from ticket custom fields
            contact_id: contactMapping.externalEntityId
          });
          result.recordsUpdated++;
        } else {
          // Create deal
          const response = await this.httpClient.post('/api/v2/deals', {
            title: ticket.subject || `Ticket #${ticket.id}`,
            status: this.mapTicketStatusToDealStatus(ticket.status),
            value: 0,
            contact_id: contactMapping.externalEntityId,
            custom_fields: {
              jrchateam_ticket_id: ticket.id.toString()
            }
          });

          await this.mapEntity(
            'deal',
            ticket.id,
            response.data.id,
            { subject: ticket.subject, status: ticket.status },
            response.data
          );
          result.recordsCreated++;
        }
      } catch (error: any) {
        result.recordsFailed++;
        result.errors?.push({
          entity: ticket,
          error: error.message
        });
      }
    }
  }

  /**
   * Map ticket status to Aria Lite deal status
   */
  private mapTicketStatusToDealStatus(ticketStatus: string): string {
    const mapping: Record<string, string> = {
      'open': 'open',
      'pending': 'in_progress',
      'closed': 'won',
      'resolved': 'won'
    };

    return mapping[ticketStatus] || 'open';
  }

  /**
   * Handle contact webhook
   */
  private async handleContactWebhook(payload: any): Promise<void> {
    await this.syncContact(payload.contact);
  }

  /**
   * Handle deal webhook
   */
  private async handleDealWebhook(payload: any): Promise<void> {
    const deal = payload.deal;
    logger.info('Deal webhook received', { dealId: deal.id, status: deal.status });
    // Could create or update tickets based on deal changes
  }

  /**
   * Handle activity webhook
   */
  private async handleActivityWebhook(payload: any): Promise<void> {
    const activity = payload.activity;
    logger.info('Activity webhook received', { activityId: activity.id });
    // Could create messages or notes in tickets
  }

  /**
   * Create deal in Aria Lite
   */
  async createDeal(dealData: any): Promise<any> {
    const response = await this.httpClient.post('/api/v2/deals', dealData);
    return response.data;
  }

  /**
   * Get contact deals from Aria Lite
   */
  async getContactDeals(contactId: number): Promise<any[]> {
    const mapping = await this.getEntityMapping('contact', contactId);

    if (!mapping) {
      return [];
    }

    const response = await this.httpClient.get('/api/v2/deals', {
      params: {
        contact_id: mapping.externalEntityId
      }
    });

    return response.data.results || [];
  }
}

export default AriaLiteIntegrationService;
