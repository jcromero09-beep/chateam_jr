import AppointmentService from '../../models/AppointmentService';
import logger, { logError, logInfo, logWarn, logDebug } from '../../utils/logger';

interface CreateServiceRequest {
  companyId: number;
  name: string;
  description?: string;
  duration: number;
  bufferTime?: number;
  price?: number;
  currency?: string;
  color?: string;
  isActive?: boolean;
  maxAttendees?: number;
  requiresConfirmation?: boolean;
  settings?: Record<string, any>;
}

interface UpdateServiceRequest extends Partial<CreateServiceRequest> {
  id: number;
}

class AppointmentServiceCRUD {
  /**
   * Create a new appointment service
   */
  async create(data: CreateServiceRequest): Promise<AppointmentService> {
    try {
      const service = await AppointmentService.create({
        companyId: data.companyId,
        name: data.name,
        description: data.description,
        duration: data.duration,
        bufferTime: data.bufferTime || 0,
        price: data.price,
        currency: data.currency || 'USD',
        color: data.color || '#007bff',
        isActive: data.isActive !== false,
        maxAttendees: data.maxAttendees || 1,
        requiresConfirmation: data.requiresConfirmation || false,
        settings: data.settings || {}
      });

      logInfo('Appointment service created', {
        serviceId: service.id,
        companyId: data.companyId,
        name: data.name
      });

      return service;
    } catch (error) {
      logError('Error creating appointment service', { error, data });
      throw error;
    }
  }

  /**
   * Update an existing appointment service
   */
  async update(data: UpdateServiceRequest): Promise<AppointmentService> {
    try {
      const service = await AppointmentService.findByPk(data.id);
      if (!service) {
        throw new Error('Appointment service not found');
      }

      await service.update({
        ...data,
        id: undefined // Prevent id update
      });

      logInfo('Appointment service updated', {
        serviceId: service.id,
        companyId: service.companyId
      });

      return service;
    } catch (error) {
      logError('Error updating appointment service', { error, data });
      throw error;
    }
  }

  /**
   * Get all services for a company
   */
  async listByCompany(companyId: number, activeOnly: boolean = false): Promise<AppointmentService[]> {
    try {
      const where: any = { companyId };
      if (activeOnly) {
        where.isActive = true;
      }

      const services = await AppointmentService.findAll({
        where,
        order: [['name', 'ASC']]
      });

      return services;
    } catch (error) {
      logError('Error listing appointment services', { error, companyId });
      throw error;
    }
  }

  /**
   * Get a single service by ID
   */
  async getById(id: number, companyId: number): Promise<AppointmentService | null> {
    try {
      const service = await AppointmentService.findOne({
        where: { id, companyId }
      });

      return service;
    } catch (error) {
      logError('Error getting appointment service', { error, id, companyId });
      throw error;
    }
  }

  /**
   * Delete a service (soft delete by marking as inactive)
   */
  async delete(id: number, companyId: number): Promise<boolean> {
    try {
      const service = await AppointmentService.findOne({
        where: { id, companyId }
      });

      if (!service) {
        return false;
      }

      await service.update({ isActive: false });

      logInfo('Appointment service deactivated', {
        serviceId: id,
        companyId
      });

      return true;
    } catch (error) {
      logError('Error deleting appointment service', { error, id, companyId });
      throw error;
    }
  }

  /**
   * Get service statistics
   */
  async getServiceStats(serviceId: number, companyId: number): Promise<{
    totalBookings: number;
    completedBookings: number;
    cancelledBookings: number;
    revenue: number;
  }> {
    try {
      const service = await AppointmentService.findOne({
        where: { id: serviceId, companyId }
      });

      if (!service) {
        throw new Error('Service not found');
      }

      // TODO: Implement appointment counting when Appointment model is available
      // For now, return basic stats
      return {
        totalBookings: 0,
        completedBookings: 0,
        cancelledBookings: 0,
        revenue: 0
      };
    } catch (error) {
      logError('Error getting service stats', { error, serviceId, companyId });
      throw error;
    }
  }
}

export default new AppointmentServiceCRUD();

