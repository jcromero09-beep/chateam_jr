import { BaseIntegrationService, SyncResult } from './BaseIntegrationService';
import User from '../../models/User';
import Ticket from '../../models/Ticket';
import logger from '../../config/logger.js';

/**
 * SGR Integration Service
 * Sistema de Gestión de Recursos (Resource Management)
 */
class SGRIntegrationService extends BaseIntegrationService {
  /**
   * Get authentication headers for SGR API (Basic Auth)
   */
  protected getAuthHeaders(): Record<string, string> {
    const { username, password } = this.connection.authCredentials;
    const encoded = Buffer.from(`${username}:${password}`).toString('base64');

    return {
      'Authorization': `Basic ${encoded}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Validate SGR connection
   */
  async validateConnection(): Promise<boolean> {
    try {
      const response = await this.httpClient.get('/api/health');
      return response.status === 200;
    } catch (error) {
      logger.error('SGR connection validation failed', { error });
      return false;
    }
  }

  /**
   * Sync resources/assignments from SGR
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
      if (entityType === 'resources') {
        const response = await this.httpClient.get('/api/resources', {
          params: {
            limit: options?.limit || 100,
            offset: options?.offset || 0,
            type: options?.type,
            status: options?.status
          }
        });

        const resources = response.data.resources || [];
        result.recordsProcessed = resources.length;

        for (const resource of resources) {
          try {
            await this.syncResource(resource);
            result.recordsCreated++;
          } catch (error: any) {
            result.recordsFailed++;
            result.errors?.push({
              entity: resource,
              error: error.message
            });
          }
        }
      } else if (entityType === 'assignments') {
        await this.syncAssignments(options);
      } else if (entityType === 'availability') {
        await this.syncAvailability(options);
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
   * Sync users to SGR resources
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
      if (entityType === 'users') {
        const users = await User.findAll({
          where: {
            id: entityIds,
            companyId: this.connection.companyId
          }
        });

        result.recordsProcessed = users.length;

        for (const user of users) {
          try {
            const existingMapping = await this.getEntityMapping(
              'resource',
              user.id
            );

            if (existingMapping) {
              await this.updateResource(user, existingMapping.externalEntityId);
              result.recordsUpdated++;
            } else {
              const resourceId = await this.createResource(user);
              await this.mapEntity(
                'resource',
                user.id,
                resourceId,
                { name: user.name, email: user.email },
                { sgr_id: resourceId }
              );
              result.recordsCreated++;
            }
          } catch (error: any) {
            result.recordsFailed++;
            result.errors?.push({
              entity: user,
              error: error.message
            });
          }
        }
      } else if (entityType === 'tickets') {
        await this.syncTicketAssignments(entityIds, result);
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
   * Process webhook from SGR
   * Note: SGR doesn't support webhooks, but keeping for interface consistency
   */
  async processWebhook(eventType: string, payload: any): Promise<void> {
    logger.info('SGR webhook received (unsupported)', { eventType, payload });
    // SGR doesn't support webhooks in the current implementation
  }

  /**
   * Sync a single resource
   */
  private async syncResource(resource: any): Promise<void> {
    const mapping = await this.getEntityMapping(
      'resource',
      undefined,
      resource.id
    );

    if (mapping) {
      const user = await User.findByPk(mapping.localEntityId);
      if (user) {
        const metadata = (user as any).metadata || {};
        metadata.sgr_resource = resource;
        metadata.sgr_skills = resource.skills;
        metadata.sgr_availability = resource.availability;
        await user.update({ metadata: metadata as any });
      }
    }
  }

  /**
   * Create resource in SGR
   */
  private async createResource(user: User): Promise<string> {
    const response = await this.httpClient.post('/api/resources', {
      name: user.name,
      email: user.email,
      type: 'agent',
      skills: (user as any).metadata?.skills || [],
      hourly_rate: (user as any).metadata?.hourly_rate || 0,
      metadata: {
        jrchateam_user_id: user.id.toString(),
        jrchateam_company_id: user.companyId.toString()
      }
    });

    return response.data.id;
  }

  /**
   * Update resource in SGR
   */
  private async updateResource(user: User, resourceId: string): Promise<void> {
    await this.httpClient.put(`/api/resources/${resourceId}`, {
      name: user.name,
      email: user.email,
      skills: (user as any).metadata?.skills || [],
      hourly_rate: (user as any).metadata?.hourly_rate || 0
    });
  }

  /**
   * Sync assignments from SGR
   */
  private async syncAssignments(options?: any): Promise<void> {
    const response = await this.httpClient.get('/api/assignments', {
      params: {
        limit: options?.limit || 100,
        status: options?.status,
        start_date: options?.startDate,
        end_date: options?.endDate
      }
    });

    const assignments = response.data.assignments || [];

    for (const assignment of assignments) {
      const mapping = await this.getEntityMapping(
        'resource',
        undefined,
        assignment.resource_id
      );

      if (mapping) {
        const user = await User.findByPk(mapping.localEntityId);
        if (user) {
          const metadata = (user as any).metadata || {};
          metadata.sgr_assignments = metadata.sgr_assignments || [];
          metadata.sgr_assignments.push(assignment);
          await user.update({ metadata: metadata as any });
        }
      }
    }

    logger.info('Assignments synced', { count: assignments.length });
  }

  /**
   * Sync availability from SGR
   */
  private async syncAvailability(options?: any): Promise<void> {
    const response = await this.httpClient.get('/api/availability', {
      params: {
        limit: options?.limit || 100,
        date: options?.date
      }
    });

    const availabilities = response.data.availabilities || [];
    logger.info('Availabilities synced', { count: availabilities.length });
  }

  /**
   * Sync ticket assignments to SGR
   */
  private async syncTicketAssignments(
    ticketIds: number[],
    result: SyncResult
  ): Promise<void> {
    const tickets = await Ticket.findAll({
      where: {
        id: ticketIds,
        companyId: this.connection.companyId
      },
      include: [{ model: User, as: 'user' }]
    });

    for (const ticket of tickets) {
      try {
        if (!ticket.userId) {
          continue;
        }

        const resourceMapping = await this.getEntityMapping(
          'resource',
          ticket.userId
        );

        if (!resourceMapping) {
          continue;
        }

        const assignmentMapping = await this.getEntityMapping(
          'assignment',
          ticket.id
        );

        if (assignmentMapping) {
          // Update assignment
          await this.httpClient.put(
            `/api/assignments/${assignmentMapping.externalEntityId}`,
            {
              resource_id: resourceMapping.externalEntityId,
              task_name: ticket.title || `Ticket #${ticket.id}`,
              status: this.mapTicketStatusToAssignmentStatus(ticket.status),
              start_date: ticket.createdAt,
              end_date: ticket.updatedAt
            }
          );
          result.recordsUpdated++;
        } else {
          // Create assignment
          const response = await this.httpClient.post('/api/assignments', {
            resource_id: resourceMapping.externalEntityId,
            task_name: ticket.title || `Ticket #${ticket.id}`,
            task_type: 'support_ticket',
            status: this.mapTicketStatusToAssignmentStatus(ticket.status),
            start_date: ticket.createdAt,
            estimated_hours: 1,
            metadata: {
              jrchateam_ticket_id: ticket.id.toString()
            }
          });

          await this.mapEntity(
            'assignment',
            ticket.id,
            response.data.id,
            { subject: ticket.title, userId: ticket.userId },
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
   * Map ticket status to SGR assignment status
   */
  private mapTicketStatusToAssignmentStatus(ticketStatus: string): string {
    const mapping: Record<string, string> = {
      'open': 'assigned',
      'pending': 'in_progress',
      'closed': 'completed',
      'resolved': 'completed'
    };

    return mapping[ticketStatus] || 'assigned';
  }

  /**
   * Get resource availability
   */
  async getResourceAvailability(
    userId: number,
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    const mapping = await this.getEntityMapping('resource', userId);

    if (!mapping) {
      return null;
    }

    const response = await this.httpClient.get(
      `/api/resources/${mapping.externalEntityId}/availability`,
      {
        params: {
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0]
        }
      }
    );

    return response.data;
  }

  /**
   * Get resource assignments
   */
  async getResourceAssignments(userId: number): Promise<any[]> {
    const mapping = await this.getEntityMapping('resource', userId);

    if (!mapping) {
      return [];
    }

    const response = await this.httpClient.get('/api/assignments', {
      params: {
        resource_id: mapping.externalEntityId
      }
    });

    return response.data.assignments || [];
  }

  /**
   * Find available resources for a task
   */
  async findAvailableResources(
    startDate: Date,
    endDate: Date,
    requiredSkills?: string[]
  ): Promise<any[]> {
    const response = await this.httpClient.get('/api/resources/available', {
      params: {
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        skills: requiredSkills?.join(',')
      }
    });

    return response.data.resources || [];
  }

  /**
   * Create assignment in SGR
   */
  async createAssignment(assignmentData: any): Promise<any> {
    const response = await this.httpClient.post('/api/assignments', assignmentData);
    return response.data;
  }
}

export default SGRIntegrationService;
