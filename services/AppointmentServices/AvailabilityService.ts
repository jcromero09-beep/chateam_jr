import { Op } from 'sequelize';
import AppointmentAvailability from '../../models/Appointments/AppointmentAvailability';
import Appointment from '../../models/Appointments/Appointment';
import AppointmentBlock from '../../models/Appointments/AppointmentBlock';
import AppointmentService from '../../models/AppointmentService';
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

      // Get user availability
      const availabilityWhere: any = { companyId, isAvailable: true };
      if (userId) {
        availabilityWhere.userId = userId;
      }

      const availabilities = await AppointmentAvailability.findAll({
        where: availabilityWhere
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
              const isBlocked = blocks.some(block =>
                slotStart < block.endTime && slotEnd > block.startTime
              );

              const isBooked = existingAppointments.some(apt =>
                slotStart < apt.endTime && slotEnd > apt.startTime
              );

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
        dayOfWeek,
        startTime,
        endTime,
        isAvailable = true,
        timezone = 'UTC'
      } = request;

      // Find or create availability for this day
      const [availability, created] = await AppointmentAvailability.findOrCreate({
        where: {
          companyId,
          userId,
          dayOfWeek
        },
        defaults: {
          companyId,
          userId,
          dayOfWeek,
          startTime,
          endTime,
          isAvailable,
          timezone
        }
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
  async getUserAvailability(userId: number, companyId: number): Promise<AppointmentAvailability[]> {
    try {
      const availabilities = await AppointmentAvailability.findAll({
        where: { userId, companyId },
        order: [['dayOfWeek', 'ASC']]
      });

      return availabilities;
    } catch (error) {
      logError('Error getting user availability', { error, userId, companyId });
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
    schedule: BulkAvailabilityDay[];
    timezone?: string;
  }): Promise<{ saved: number; deleted: number }> {
    try {
      const { companyId, userId, schedule, timezone = 'UTC' } = data;

      logInfo('saveAvailabilityBulk called', { companyId, userId, scheduleLength: schedule?.length, timezone });

      // Delete all existing availability for this user
      const deleted = await AppointmentAvailability.destroy({
        where: { companyId, userId }
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

              await AppointmentAvailability.create({
                companyId,
                userId,
                dayOfWeek: day.dayOfWeek,
                startTime: slot.start,
                endTime: slot.end,
                isAvailable: true,
                timezone
              });
              saved++;
            }
          }
        }
      }

      logInfo('Availability saved in bulk', {
        userId,
        companyId,
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
      const targetDate = new Date(date);
      const dayOfWeek = targetDate.getDay();

      // Build where clause
      const where: any = {
        companyId,
        dayOfWeek,
        isAvailable: true
      };

      if (userId) {
        where.userId = userId;
      }

      // Get availability blocks for this day of week
      const availabilities = await AppointmentAvailability.findAll({
        where,
        include: [
          {
            model: require('../../models/User').default,
            as: 'user',
            attributes: ['id', 'name']
          }
        ],
        order: [['startTime', 'ASC']]
      });

      // Check for existing appointments on this specific date
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const appointmentWhere: any = {
        companyId,
        startTime: { [Op.gte]: startOfDay },
        endTime: { [Op.lte]: endOfDay },
        // 🆕 Bug B1 fix: solo citas activas ocupan slot
        status: { [Op.in]: ['scheduled', 'confirmed'] }
      };

      if (serviceId) {
        appointmentWhere.serviceId = serviceId;
      }

      const existingAppointments = await Appointment.findAll({
        where: appointmentWhere
      });

      // Get current time for past slot validation
      const now = new Date();
      const isToday = targetDate.toDateString() === now.toDateString();

      // Map availability blocks with booking status
      const blocks = availabilities.map(avail => {
        // Check if this time slot is already booked
        const bookedAppointment = existingAppointments.find(apt => {
          const aptStartTime = new Date(apt.startTime);
          const aptHours = aptStartTime.getHours().toString().padStart(2, '0');
          const aptMinutes = aptStartTime.getMinutes().toString().padStart(2, '0');
          const aptTimeStr = `${aptHours}:${aptMinutes}`;

          // Check if appointment overlaps with this availability block
          return aptTimeStr >= avail.startTime && aptTimeStr < avail.endTime;
        });

        // Check if this slot is in the past (only for today)
        let isPast = false;
        if (isToday) {
          const [startHour, startMin] = avail.startTime.split(':').map(Number);
          const slotDateTime = new Date(targetDate);
          slotDateTime.setHours(startHour, startMin, 0, 0);
          isPast = slotDateTime < now;
        }

        return {
          id: avail.id,
          startTime: avail.startTime,
          endTime: avail.endTime,
          isBooked: avail.isBooked || !!bookedAppointment || isPast,
          bookedByAppointmentId: avail.bookedByAppointmentId || bookedAppointment?.id,
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
      const result = await AppointmentAvailability.update(
        {
          isBooked: true,
          bookedByAppointmentId: appointmentId
        },
        {
          where: { id: blockId, companyId }
        }
      );

      return result[0] > 0;
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
      const result = await AppointmentAvailability.update(
        {
          isBooked: false,
          bookedByAppointmentId: null
        },
        {
          where: { bookedByAppointmentId: appointmentId, companyId }
        }
      );

      return result[0] > 0;
    } catch (error) {
      logError('Error releasing block', { error, appointmentId });
      throw error;
    }
  }
}

export default new AvailabilityService();

