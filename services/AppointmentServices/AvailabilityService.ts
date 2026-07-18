import { Op } from 'sequelize';
import AppointmentAvailability from '../../models/Appointments/AppointmentAvailability';
import Appointment from '../../models/Appointments/Appointment';
import AppointmentBlock from '../../models/Appointments/AppointmentBlock';
import AppointmentService from '../../models/AppointmentService';
import User from '../../models/User';
import logger, { logError, logInfo, logWarn, logDebug } from '../../utils/logger';

interface TimeSlot {
  start: Date;
  end: Date;
  available: boolean;
  userId?: number;
}

interface AvailabilityRequest {
  companyId: number;
  serviceId: number;
  startDate: Date;
  endDate: Date;
  userId?: number;
}

interface SetAvailabilityRequest {
  companyId: number;
  userId: number;
  serviceId?: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable?: boolean;
  timezone?: string;
}

interface BulkAvailabilityDay {
  dayOfWeek: number;
  enabled: boolean;
  slots: Array<{
    start: string;
    end: string;
    enabled: boolean;
  }>;
}

class AvailabilityService {
  private parseCalendarDate(value: string): Date {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map(Number);
      return new Date(year, month - 1, day, 0, 0, 0, 0);
    }

    return new Date(value);
  }

  private buildAvailabilityWhere(companyId: number, userId?: number, dayOfWeek?: number): any {
    const where: any = {
      companyId,
      isAvailable: true
    };

    if (userId) {
      where.userId = userId;
    }

    if (typeof dayOfWeek === 'number') {
      where.dayOfWeek = dayOfWeek;
    }

    return where;
  }

  private sortAvailabilities(availabilities: AppointmentAvailability[]): AppointmentAvailability[] {
    return [...availabilities].sort((left, right) => {
      if (left.dayOfWeek !== right.dayOfWeek) {
        return left.dayOfWeek - right.dayOfWeek;
      }

      return left.startTime.localeCompare(right.startTime);
    });
  }

  private mergeSpecificWithGeneric(
    specificAvailabilities: AppointmentAvailability[],
    genericAvailabilities: AppointmentAvailability[]
  ): AppointmentAvailability[] {
    if (specificAvailabilities.length === 0) {
      return this.sortAvailabilities(genericAvailabilities);
    }

    return this.sortAvailabilities(specificAvailabilities);
  }

  private async loadAvailabilities(
    companyId: number,
    options: {
      userId?: number;
      dayOfWeek?: number;
      serviceId?: number;
      include?: any[];
    } = {}
  ): Promise<AppointmentAvailability[]> {
    const { userId, dayOfWeek, serviceId, include } = options;
    const baseWhere = this.buildAvailabilityWhere(companyId, userId, dayOfWeek);
    const order: any[] = [['dayOfWeek', 'ASC'], ['startTime', 'ASC']];

    if (!serviceId) {
      return AppointmentAvailability.findAll({
        where: baseWhere,
        include,
        order
      });
    }

    const [specificAvailabilities, genericAvailabilities] = await Promise.all([
      AppointmentAvailability.findAll({
        where: {
          ...baseWhere,
          serviceId
        },
        include,
        order
      }),
      AppointmentAvailability.findAll({
        where: {
          ...baseWhere,
          serviceId: {
            [Op.is]: null
          }
        },
        include,
        order
      })
    ]);

    return this.mergeSpecificWithGeneric(specificAvailabilities, genericAvailabilities);
  }

  /**
   * Get available time slots for a service within a date range
   */
  async getAvailableSlots(request: AvailabilityRequest): Promise<TimeSlot[]> {
    try {
      const { companyId, serviceId, startDate, endDate, userId } = request;

      // Get the service to know duration
      const service = await AppointmentService.findByPk(serviceId);
      if (!service) {
        throw new Error('Service not found');
      }

      const slotDuration = service.duration; // in minutes
      const bufferTime = service.bufferTime || 0;

      const availabilities = await this.loadAvailabilities(companyId, {
        userId,
        serviceId
      });

      // Get existing appointments in the date range
      // 🆕 Bug B1 fix: solo estados que realmente ocupan el slot.
      // Antes Op.notIn incluía 'completed', 'no_show' y null como "ocupando",
      // lo cual generaba falsos positivos de "no disponibilidad".
      const appointmentWhere: any = {
        companyId,
        serviceId,
        startTime: { [Op.gte]: startDate },
        endTime: { [Op.lte]: endDate },
        status: { [Op.in]: ['scheduled', 'confirmed'] }
      };

      if (userId) {
        appointmentWhere.userId = userId;
      }

      const existingAppointments = await Appointment.findAll({
        where: appointmentWhere
      });

      // Get blocks in the date range
      const blockWhere: any = {
        companyId,
        startTime: { [Op.lte]: endDate },
        endTime: { [Op.gte]: startDate }
      };

      if (userId) {
        blockWhere.userId = userId;
      }

      logInfo('Fetching blocks with where:', { blockWhere });
      const blocks = await AppointmentBlock.findAll({
        where: blockWhere,
        attributes: ['id', 'companyId', 'userId', 'title', 'startTime', 'endTime', 'isRecurring']
      });
      logInfo('Blocks fetched successfully:', { count: blocks.length });

      // Generate time slots
      const slots: TimeSlot[] = [];
      const current = new Date(startDate);

      while (current < endDate) {
        const dayOfWeek = current.getDay();
        const dayAvailability = availabilities.filter(a => a.dayOfWeek === dayOfWeek);

        for (const availability of dayAvailability) {
          // Parse availability times
          const [startHour, startMin] = availability.startTime.split(':').map(Number);
          const [endHour, endMin] = availability.endTime.split(':').map(Number);

          const dayStart = new Date(current);
          dayStart.setHours(startHour, startMin, 0, 0);

          const dayEnd = new Date(current);
          dayEnd.setHours(endHour, endMin, 0, 0);

          // Generate slots for this availability window
          const slotStart = new Date(dayStart);
          while (slotStart < dayEnd) {
            const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000);

            if (slotEnd <= dayEnd) {
              // Check if slot is available (not blocked, not already booked)
              const isBlocked = blocks.some(block => {
                const isSameUserScope = availability.userId
                  ? block.userId === availability.userId
                  : !userId || block.userId === userId;

                if (!isSameUserScope) {
                  return false;
                }

                return slotStart < block.endTime && slotEnd > block.startTime;
              });

              const isBooked = existingAppointments.some(apt => {
                const isSameUserScope = availability.userId
                  ? apt.userId === availability.userId
                  : !userId || apt.userId === userId;

                if (!isSameUserScope) {
                  return false;
                }

                return slotStart < apt.endTime && slotEnd > apt.startTime;
              });

              // Check if slot is in the past (for today's date)
              const now = new Date();
              const isPast = slotStart < now;

              slots.push({
                start: new Date(slotStart),
                end: new Date(slotEnd),
                available: !isBlocked && !isBooked && !isPast,
                userId: availability.userId
              });
            }

            // Move to next slot (including buffer time)
            slotStart.setMinutes(slotStart.getMinutes() + slotDuration + bufferTime);
          }
        }

        // Move to next day
        current.setDate(current.getDate() + 1);
        current.setHours(0, 0, 0, 0);
      }

      return slots;
    } catch (error) {
      logError('Error getting available slots', { error, request });
      throw error;
    }
  }

  /**
   * Set user availability
   */
  async setAvailability(request: SetAvailabilityRequest): Promise<AppointmentAvailability> {
    try {
      const {
        companyId,
        userId,
        serviceId,
        dayOfWeek,
        startTime,
        endTime,
        isAvailable = true,
        timezone = 'UTC'
      } = request;

      const where: any = {
        companyId,
        userId,
        dayOfWeek,
        serviceId: serviceId || {
          [Op.is]: null
        }
      };

      const defaults: any = {
        companyId,
        userId,
        dayOfWeek,
        startTime,
        endTime,
        isAvailable,
        timezone
      };

      if (serviceId) {
        defaults.serviceId = serviceId;
      }

      // Find or create availability for this day
      const [availability, created] = await AppointmentAvailability.findOrCreate({
        where,
        defaults
      });

      if (!created) {
        await availability.update({
          startTime,
          endTime,
          isAvailable,
          timezone
        });
      }

      logInfo('User availability updated', {
        userId,
        serviceId,
        dayOfWeek,
        startTime,
        endTime
      });

      return availability;
    } catch (error) {
      logError('Error setting availability', { error, request });
      throw error;
    }
  }

  /**
   * Get user availability for all days
   */
  async getUserAvailability(
    userId: number,
    companyId: number,
    serviceId?: number
  ): Promise<AppointmentAvailability[]> {
    try {
      const availabilities = await this.loadAvailabilities(companyId, {
        userId,
        serviceId
      });

      return availabilities;
    } catch (error) {
      logError('Error getting user availability', { error, userId, companyId, serviceId });
      throw error;
    }
  }

  /**
   * Create a time block (vacation, break, etc.)
   */
  async createBlock(data: {
    companyId: number;
    userId: number;
    title: string;
    startTime: Date;
    endTime: Date;
    reason?: string;
    isRecurring?: boolean;
    recurrenceRule?: string;
  }): Promise<AppointmentBlock> {
    try {
      const block = await AppointmentBlock.create({
        companyId: data.companyId,
        userId: data.userId,
        title: data.title,
        startTime: data.startTime,
        endTime: data.endTime,
        reason: data.reason,
        isRecurring: data.isRecurring || false,
        recurrenceRule: data.recurrenceRule
      });

      logInfo('Time block created', {
        blockId: block.id,
        userId: data.userId,
        title: data.title
      });

      return block;
    } catch (error) {
      logError('Error creating time block', { error, data });
      throw error;
    }
  }

  /**
   * Delete a time block
   */
  async deleteBlock(blockId: number, companyId: number): Promise<boolean> {
    try {
      const block = await AppointmentBlock.findOne({
        where: { id: blockId, companyId }
      });

      if (!block) {
        return false;
      }

      await block.destroy();

      logInfo('Time block deleted', { blockId });

      return true;
    } catch (error) {
      logError('Error deleting time block', { error, blockId, companyId });
      throw error;
    }
  }

  /**
   * Get blocks for a user within a date range
   */
  async getUserBlocks(
    userId: number,
    companyId: number,
    startDate: Date,
    endDate: Date
  ): Promise<AppointmentBlock[]> {
    try {
      const blocks = await AppointmentBlock.findAll({
        where: {
          userId,
          companyId,
          startTime: { [Op.lte]: endDate },
          endTime: { [Op.gte]: startDate }
        },
        order: [['startTime', 'ASC']]
      });

      return blocks;
    } catch (error) {
      logError('Error getting user blocks', { error, userId, companyId });
      throw error;
    }
  }

  /**
   * Save availability in bulk (replaces all existing availability for a user)
   */
  async saveAvailabilityBulk(data: {
    companyId: number;
    userId: number;
    serviceId?: number;
    schedule: BulkAvailabilityDay[];
    timezone?: string;
  }): Promise<{ saved: number; deleted: number }> {
    try {
      const { companyId, userId, serviceId, schedule, timezone = 'UTC' } = data;

      logInfo('saveAvailabilityBulk called', {
        companyId,
        userId,
        serviceId,
        scheduleLength: schedule?.length,
        timezone
      });

      const availabilityWhere: any = { companyId, userId };
      if (serviceId) {
        availabilityWhere.serviceId = serviceId;
      } else {
        availabilityWhere.serviceId = {
          [Op.is]: null
        };
      }

      // Delete all existing availability for this user and service scope
      const deleted = await AppointmentAvailability.destroy({
        where: availabilityWhere
      });
      logInfo('Deleted existing availability', { deleted });

      let saved = 0;

      // Create new availability records for each enabled slot
      for (const day of schedule) {
        logInfo('Processing day', { dayOfWeek: day.dayOfWeek, enabled: day.enabled, slotsCount: day.slots?.length });

        if (day.enabled && day.slots && day.slots.length > 0) {
          for (const slot of day.slots) {
            if (slot.enabled) {
              logInfo('Creating availability slot', { dayOfWeek: day.dayOfWeek, start: slot.start, end: slot.end });

              const availabilityPayload: any = {
                companyId,
                userId,
                dayOfWeek: day.dayOfWeek,
                startTime: slot.start,
                endTime: slot.end,
                isAvailable: true,
                timezone
              };

              if (serviceId) {
                availabilityPayload.serviceId = serviceId;
              }

              await AppointmentAvailability.create(availabilityPayload);
              saved++;
            }
          }
        }
      }

      logInfo('Availability saved in bulk', {
        userId,
        companyId,
        serviceId,
        deleted,
        saved
      });

      return { saved, deleted };
    } catch (error: any) {
      logError('Error saving availability in bulk', {
        error: error.message,
        stack: error.stack,
        original: error.original?.message,
        data
      });
      throw error;
    }
  }

  /**
   * Get all blocks/exceptions for a company
   */
  async getCompanyBlocks(companyId: number): Promise<AppointmentBlock[]> {
    try {
      const blocks = await AppointmentBlock.findAll({
        where: { companyId },
        order: [['startTime', 'ASC']]
      });

      return blocks;
    } catch (error) {
      logError('Error getting company blocks', { error, companyId });
      throw error;
    }
  }

  /**
   * Delete a block by ID
   */
  async deleteBlockById(blockId: number, companyId: number): Promise<boolean> {
    try {
      const result = await AppointmentBlock.destroy({
        where: { id: blockId, companyId }
      });

      return result > 0;
    } catch (error) {
      logError('Error deleting block by ID', { error, blockId, companyId });
      throw error;
    }
  }

  /**
   * Get available time blocks for a specific date
   * Returns the availability slots with their booking status
   */
  async getAvailableBlocksForDate(
    companyId: number,
    date: string,
    userId?: number,
    serviceId?: number
  ): Promise<Array<{
    id: number;
    startTime: string;
    endTime: string;
    isBooked: boolean;
    bookedByAppointmentId?: number;
    userId?: number;
    userName?: string;
  }>> {
    try {
      const targetDate = this.parseCalendarDate(date);
      const dayOfWeek = targetDate.getDay();

      const availabilities = await this.loadAvailabilities(companyId, {
        userId,
        dayOfWeek,
        serviceId,
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'name']
          }
        ],
      });

      // Check for existing appointments on this specific date
      const startOfDay = this.parseCalendarDate(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = this.parseCalendarDate(date);
      endOfDay.setHours(23, 59, 59, 999);

      const appointmentWhere: any = {
        companyId,
        startTime: { [Op.gte]: startOfDay },
        endTime: { [Op.lte]: endOfDay },
        // 🆕 Bug B1 fix: solo citas activas ocupan slot
        status: { [Op.in]: ['scheduled', 'confirmed'] }
      };

      const existingAppointments = await Appointment.findAll({
        where: appointmentWhere
      });

      // Get current time for past slot validation
      const now = new Date();
      const isToday = targetDate.toDateString() === now.toDateString();

      // Map availability blocks with booking status
      const blocks = availabilities.map(avail => {
        const blockStart = new Date(targetDate);
        const [startHour, startMin] = avail.startTime.split(':').map(Number);
        blockStart.setHours(startHour, startMin, 0, 0);

        const blockEnd = new Date(targetDate);
        const [endHour, endMin] = avail.endTime.split(':').map(Number);
        blockEnd.setHours(endHour, endMin, 0, 0);

        const bookedAppointment = existingAppointments.find(apt => {
          const isSameUserScope = avail.userId
            ? apt.userId === avail.userId
            : !userId || apt.userId === userId;
          const isSameServiceScope = avail.serviceId
            ? apt.serviceId === avail.serviceId
            : !serviceId || apt.serviceId === serviceId;

          if (!isSameUserScope || !isSameServiceScope) {
            return false;
          }

          return new Date(apt.startTime) < blockEnd && new Date(apt.endTime) > blockStart;
        });

        // Check if this slot is in the past (only for today)
        let isPast = false;
        if (isToday) {
          isPast = blockStart < now;
        }

        return {
          id: avail.id,
          startTime: avail.startTime,
          endTime: avail.endTime,
          isBooked: !!bookedAppointment || isPast,
          bookedByAppointmentId: bookedAppointment?.id,
          userId: avail.userId,
          userName: (avail as any).user?.name,
          isPast // Include flag so frontend can show different styling if needed
        };
      });

      return blocks;
    } catch (error) {
      logError('Error getting available blocks for date', { error, companyId, date });
      throw error;
    }
  }

  /**
   * Mark a block as booked when creating an appointment
   */
  async markBlockAsBooked(
    blockId: number,
    appointmentId: number,
    companyId: number
  ): Promise<boolean> {
    try {
      logDebug('Skipping persistent block booking update', {
        blockId,
        appointmentId,
        companyId
      });

      return true;
    } catch (error) {
      logError('Error marking block as booked', { error, blockId, appointmentId });
      throw error;
    }
  }

  /**
   * Release a block when cancelling an appointment
   */
  async releaseBlock(appointmentId: number, companyId: number): Promise<boolean> {
    try {
      logDebug('Skipping persistent block release update', {
        appointmentId,
        companyId
      });

      return true;
    } catch (error) {
      logError('Error releasing block', { error, appointmentId });
      throw error;
    }
  }
}

export default new AvailabilityService();

