import { BaseIntegrationService, SyncResult } from './BaseIntegrationService';
import Ticket from '../../models/Ticket';
import Contact from '../../models/Contact';
import logger from '../../config/logger.js';
import { getIO } from '../../libs/socket';

/**
 * SmartTrack Integration Service
 * Sistema de tracking de envíos con notificaciones en tiempo real
 */
class SmartTrackIntegrationService extends BaseIntegrationService {
  /**
   * Get authentication headers for SmartTrack API
   */
  protected getAuthHeaders(): Record<string, string> {
    const apiKey = this.connection.authCredentials.apiKey;

    return {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Validate SmartTrack connection
   */
  async validateConnection(): Promise<boolean> {
    try {
      const response = await this.httpClient.get('/api/v1/status');
      return response.status === 200;
    } catch (error) {
      logger.error('SmartTrack connection validation failed', { error });
      return false;
    }
  }

  /**
   * Sync shipments from SmartTrack
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
      if (entityType === 'shipments') {
        const response = await this.httpClient.get('/api/v1/shipments', {
          params: {
            limit: options?.limit || 100,
            offset: options?.offset || 0,
            status: options?.status,
            updated_since: options?.updatedSince
          }
        });

        const shipments = response.data.shipments || [];
        result.recordsProcessed = shipments.length;

        for (const shipment of shipments) {
          try {
            await this.syncShipment(shipment);
            result.recordsCreated++;
          } catch (error: any) {
            result.recordsFailed++;
            result.errors?.push({
              entity: shipment,
              error: error.message
            });
          }
        }
      } else if (entityType === 'tracking_events') {
        await this.syncTrackingEvents(options);
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
   * Sync tickets to SmartTrack shipments
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
      if (entityType === 'tickets') {
        const tickets = await Ticket.findAll({
          where: {
            id: entityIds,
            companyId: this.connection.companyId
          },
          include: [{ model: Contact, as: 'contact' }]
        });

        result.recordsProcessed = tickets.length;

        for (const ticket of tickets) {
          try {
            const existingMapping = await this.getEntityMapping(
              'shipment',
              ticket.id
            );

            if (existingMapping) {
              await this.updateShipment(ticket, existingMapping.externalEntityId);
              result.recordsUpdated++;
            } else {
              const trackingNumber = await this.createShipment(ticket);
              await this.mapEntity(
                'shipment',
                ticket.id,
                trackingNumber,
                { subject: ticket.title },
                { tracking_number: trackingNumber }
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
   * Process webhook from SmartTrack
   */
  async processWebhook(eventType: string, payload: any): Promise<void> {
    logger.info('Processing SmartTrack webhook', { eventType, payload });

    switch (eventType) {
      case 'shipment.created':
      case 'shipment.updated':
        await this.handleShipmentWebhook(payload);
        break;

      case 'tracking.status_changed':
        await this.handleTrackingStatusWebhook(payload);
        break;

      case 'shipment.delivered':
        await this.handleDeliveryWebhook(payload);
        break;

      case 'shipment.exception':
        await this.handleExceptionWebhook(payload);
        break;

      default:
        logger.warn('Unknown SmartTrack webhook event type', { eventType });
    }
  }

  /**
   * Sync a single shipment
   */
  private async syncShipment(shipment: any): Promise<void> {
    const mapping = await this.getEntityMapping(
      'shipment',
      undefined,
      shipment.tracking_number
    );

    if (mapping) {
      const ticket = await Ticket.findByPk(mapping.localEntityId);
      if (ticket) {
        const metadata = (ticket as any).metadata || {};
        metadata.smarttrack_shipment = shipment;
        metadata.tracking_number = shipment.tracking_number;
        metadata.delivery_status = shipment.status;
        metadata.estimated_delivery = shipment.estimated_delivery_date;
        await ticket.update({ metadata });
      }
    }
  }

  /**
   * Create shipment in SmartTrack
   */
  private async createShipment(ticket: Ticket): Promise<string> {
    const contact = ticket.contact;

    const response = await this.httpClient.post('/api/v1/shipments', {
      reference_number: `TICKET-${ticket.id}`,
      recipient: {
        name: contact?.name,
        email: contact?.email,
        phone: contact?.number,
        address: (ticket as any).metadata?.shipping_address || {}
      },
      items: (ticket as any).metadata?.items || [],
      service_level: (ticket as any).metadata?.service_level || 'standard',
      metadata: {
        jrchateam_ticket_id: ticket.id.toString(),
        jrchateam_company_id: ticket.companyId.toString()
      }
    });

    return response.data.tracking_number;
  }

  /**
   * Update shipment in SmartTrack
   */
  private async updateShipment(ticket: Ticket, trackingNumber: string): Promise<void> {
    await this.httpClient.put(`/api/v1/shipments/${trackingNumber}`, {
      reference_number: `TICKET-${ticket.id}`,
      status: ticket.status === 'closed' ? 'delivered' : 'in_transit'
    });
  }

  /**
   * Sync tracking events
   */
  private async syncTrackingEvents(options?: any): Promise<void> {
    const response = await this.httpClient.get('/api/v1/tracking/events', {
      params: {
        limit: options?.limit || 100,
        since: options?.since
      }
    });

    const events = response.data.events || [];
    logger.info('Tracking events synced', { count: events.length });
  }

  /**
   * Handle shipment webhook
   */
  private async handleShipmentWebhook(payload: any): Promise<void> {
    await this.syncShipment(payload.shipment);
  }

  /**
   * Handle tracking status webhook
   */
  private async handleTrackingStatusWebhook(payload: any): Promise<void> {
    const { tracking_number, status, location, timestamp } = payload;

    const mapping = await this.getEntityMapping(
      'shipment',
      undefined,
      tracking_number
    );

    if (mapping) {
      const ticket = await Ticket.findByPk(mapping.localEntityId);
      if (ticket) {
        const metadata = (ticket as any).metadata || {};
        metadata.delivery_status = status;
        metadata.last_location = location;
        metadata.last_update = timestamp;
        await ticket.update({ metadata });

        // Emit real-time update
        const io = getIO();
        io.to(`company-${ticket.companyId}`).emit('shipment:status_update', {
          ticketId: ticket.id,
          trackingNumber: tracking_number,
          status,
          location
        });

        logger.info('Shipment status updated', {
          ticketId: ticket.id,
          status,
          location
        });
      }
    }
  }

  /**
   * Handle delivery webhook
   */
  private async handleDeliveryWebhook(payload: any): Promise<void> {
    const { tracking_number, delivered_at, signed_by } = payload;

    const mapping = await this.getEntityMapping(
      'shipment',
      undefined,
      tracking_number
    );

    if (mapping) {
      const ticket = await Ticket.findByPk(mapping.localEntityId);
      if (ticket) {
        const metadata = (ticket as any).metadata || {};
        metadata.delivery_status = 'delivered';
        metadata.delivered_at = delivered_at;
        metadata.signed_by = signed_by;
        await ticket.update({
          metadata,
          status: 'closed' // Auto-close ticket on delivery
        });

        // Emit real-time update
        const io = getIO();
        io.to(`company-${ticket.companyId}`).emit('shipment:delivered', {
          ticketId: ticket.id,
          trackingNumber: tracking_number,
          deliveredAt: delivered_at,
          signedBy: signed_by
        });

        logger.info('Shipment delivered', {
          ticketId: ticket.id,
          deliveredAt: delivered_at
        });
      }
    }
  }

  /**
   * Handle exception webhook
   */
  private async handleExceptionWebhook(payload: any): Promise<void> {
    const { tracking_number, exception_type, description } = payload;

    const mapping = await this.getEntityMapping(
      'shipment',
      undefined,
      tracking_number
    );

    if (mapping) {
      const ticket = await Ticket.findByPk(mapping.localEntityId);
      if (ticket) {
        const metadata = (ticket as any).metadata || {};
        metadata.delivery_exception = {
          type: exception_type,
          description,
          timestamp: new Date()
        };
        await ticket.update({ metadata });

        // Emit alert
        const io = getIO();
        io.to(`company-${ticket.companyId}`).emit('shipment:exception', {
          ticketId: ticket.id,
          trackingNumber: tracking_number,
          exceptionType: exception_type,
          description
        });

        logger.warn('Shipment exception', {
          ticketId: ticket.id,
          exceptionType: exception_type,
          description
        });
      }
    }
  }

  /**
   * Get tracking info for ticket
   */
  async getTrackingInfo(ticketId: number): Promise<any> {
    const mapping = await this.getEntityMapping('shipment', ticketId);

    if (!mapping) {
      return null;
    }

    const response = await this.httpClient.get(
      `/api/v1/tracking/${mapping.externalEntityId}`
    );

    return response.data;
  }

  /**
   * Get shipment history
   */
  async getShipmentHistory(trackingNumber: string): Promise<any[]> {
    const response = await this.httpClient.get(
      `/api/v1/shipments/${trackingNumber}/history`
    );

    return response.data.events || [];
  }
}

export default SmartTrackIntegrationService;
