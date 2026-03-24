import { Op } from 'sequelize';
import Appointment from '../../models/Appointments/Appointment';
import AppointmentService from '../../models/AppointmentService';
import AppointmentReminder from '../../models/Appointments/AppointmentReminder';
import Contact from '../../models/Contact';
import User from '../../models/User';
import logger, { logError, logInfo, logWarn, logDebug } from '../../utils/logger';
import AvailabilityService from './AvailabilityService';
import ReminderService from './ReminderService';

interface CreateBookingRequest {
  companyId: number;
  serviceId: number;
  userId: number;
  contactId: number;
  startTime: Date;
  timezone?: string;
  notes?: string;
  attendeeName?: string;
  attendeeEmail?: string;
  attendeePhone?: string;
  location?: string;
  meetingUrl?: string;
}

interface UpdateBookingRequest {
  id: number;
  companyId: number;
  notes?: string;
  location?: string;
  meetingUrl?: string;
  status?: string;
}

class BookingService {
  /**
   * Create a new appointment booking
   */
  async createBooking(data: CreateBookingRequest): Promise<Appointment> {
    try {
      // Get service details
      const service = await AppointmentService.findByPk(data.serviceId);
      if (!service) {
        throw new Error('Service not found');
      }

      // Calculate end time based on service duration
      const endTime = new Date(data.startTime.getTime() + service.duration * 60000);

      // Check if slot is available (skip validation if no availability configured)
      // Expand date range to include the full day for availability checking
      const dayStart = new Date(data.startTime);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(data.startTime);
      dayEnd.setHours(23, 59, 59, 999);

      const slots = await AvailabilityService.getAvailableSlots({
        companyId: data.companyId,
        serviceId: data.serviceId,
        startDate: dayStart,
        endDate: dayEnd,
        userId: data.userId
      });

      // If no availability is configured (slots.length === 0), allow booking anyway
      // This allows appointments to be created even without availability setup
      if (slots.length > 0) {
        // Check if the requested time overlaps with an available slot
        const isAvailable = slots.some(
          slot =>
            slot.available &&
            data.startTime >= slot.start &&
            endTime <= slot.end
        );

        if (!isAvailable) {
          // Log for debugging
          logWarn('Booking rejected - no available slot found', {
            requestedStart: data.startTime,
            requestedEnd: endTime,
            availableSlots: slots.filter(s => s.available).map(s => ({
              start: s.start,
              end: s.end
            }))
          });
          throw new Error('Selected time slot is not available');
        }
      } else {
        // No availability configured - log and allow booking
        logInfo('No availability configured, allowing booking', {
          companyId: data.companyId,
          userId: data.userId,
          serviceId: data.serviceId
        });
      }

      // Get contact info if not provided
      let attendeeName = data.attendeeName;
      let attendeePhone = data.attendeePhone;

      if (!attendeeName || !attendeePhone) {
        const contact = await Contact.findByPk(data.contactId);
        if (contact) {
          attendeeName = attendeeName || contact.name;
          attendeePhone = attendeePhone || contact.number;
        }
      }

      // Create the appointment
      const appointment = await Appointment.create({
        companyId: data.companyId,
        serviceId: data.serviceId,
        userId: data.userId,
        contactId: data.contactId,
        title: service.name,
        description: data.notes,
        startTime: data.startTime,
        endTime,
        timezone: data.timezone || 'UTC',
        status: service.requiresConfirmation ? 'scheduled' : 'confirmed',
        attendeeName,
        attendeeEmail: data.attendeeEmail,
        attendeePhone,
        location: data.location,
        meetingUrl: data.meetingUrl,
        notes: data.notes
      });

      // Create default reminders
      await ReminderService.createDefaultReminders(appointment);

      logInfo('Appointment booked', {
        appointmentId: appointment.id,
        serviceId: data.serviceId,
        userId: data.userId,
        contactId: data.contactId,
        startTime: data.startTime
      });

      return appointment;
    } catch (error) {
      logError('Error creating booking', { error, data });
      throw error;
    }
  }

  /**
   * Update an appointment
   */
  async updateAppointment(data: UpdateBookingRequest): Promise<Appointment> {
    try {
      const appointment = await Appointment.findOne({
        where: { id: data.id, companyId: data.companyId }
      });

      if (!appointment) {
        throw new Error('Appointment not found');
      }

      await appointment.update({
        notes: data.notes,
        location: data.location,
        meetingUrl: data.meetingUrl,
        status: data.status
      });

      logInfo('Appointment updated', {
        appointmentId: appointment.id,
        status: data.status
      });

      return appointment;
    } catch (error) {
      logError('Error updating appointment', { error, data });
      throw error;
    }
  }

  /**
   * Reschedule an appointment
   */
  async rescheduleAppointment(
    appointmentId: number,
    companyId: number,
    newStartTime: Date
  ): Promise<Appointment> {
    try {
      const appointment = await Appointment.findOne({
        where: { id: appointmentId, companyId },
        include: [{ model: AppointmentService, as: 'service' }]
      });

      if (!appointment) {
        throw new Error('Appointment not found');
      }

      // Release the old time slot before rescheduling
      logInfo(`📅 [RESCHEDULE] Iniciando reagendamiento de cita ID=${appointmentId}`);
      logInfo(`📅 [RESCHEDULE] Horario anterior: ${appointment.startTime} - ${appointment.endTime}`);

      await AvailabilityService.releaseBlock(appointmentId, companyId);
      logInfo(`✅ [RESCHEDULE] Horario anterior liberado correctamente para cita ID=${appointmentId}`);

      // Calculate new end time
      const duration = appointment.service?.duration || 60;
      const newEndTime = new Date(newStartTime.getTime() + duration * 60000);

      // Check availability
      const slots = await AvailabilityService.getAvailableSlots({
        companyId,
        serviceId: appointment.serviceId,
        startDate: newStartTime,
        endDate: newEndTime,
        userId: appointment.userId
      });

      const isAvailable = slots.some(
        slot =>
          slot.available &&
          slot.start.getTime() === newStartTime.getTime()
      );

      if (!isAvailable) {
        throw new Error('Selected time slot is not available');
      }

      // Update appointment
      await appointment.update({
        startTime: newStartTime,
        endTime: newEndTime,
        status: 'rescheduled'
      });

      // Update reminders
      await ReminderService.updateRemindersForReschedule(appointment);

      logInfo(`✅ [RESCHEDULE] Cita reagendada correctamente`, {
        appointmentId,
        anteriorInicio: appointment.startTime,
        nuevoInicio: newStartTime.toISOString(),
        nuevoFin: newEndTime.toISOString()
      });

      return appointment;
    } catch (error: any) {
      logError(`❌ [RESCHEDULE] Error al reagendar cita ID=${appointmentId}: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * Cancel an appointment
   */
  async cancelAppointment(
    appointmentId: number,
    companyId: number,
    reason?: string
  ): Promise<Appointment> {
    try {
      const appointment = await Appointment.findOne({
        where: { id: appointmentId, companyId }
      });

      if (!appointment) {
        throw new Error('Appointment not found');
      }

      await appointment.update({
        status: 'cancelled',
        cancellationReason: reason,
        cancelledAt: new Date()
      });

      // Cancel pending reminders
      await AppointmentReminder.update(
        { status: 'cancelled' },
        {
          where: {
            appointmentId,
            status: 'pending'
          }
        }
      );

      logInfo('Appointment cancelled', {
        appointmentId,
        reason
      });

      return appointment;
    } catch (error) {
      logError('Error cancelling appointment', { error, appointmentId });
      throw error;
    }
  }

  /**
   * Confirm an appointment and schedule the reminder message
   */
  async confirmAppointment(
    appointmentId: number,
    companyId: number
  ): Promise<Appointment> {
    try {
      logInfo(`📅 [CONFIRM] Iniciando confirmación de cita ID=${appointmentId}`);

      const appointment = await Appointment.findOne({
        where: { id: appointmentId, companyId },
        include: [
          { model: require('../../models/Appointments/ReminderTemplate').default, as: 'reminderTemplate' }
        ]
      });

      if (!appointment) {
        logError(`❌ [CONFIRM] Cita no encontrada ID=${appointmentId}`);
        throw new Error('Appointment not found');
      }

      logInfo(`📅 [CONFIRM] Cita encontrada. Status actual: ${appointment.status}`);

      await appointment.update({
        status: 'confirmed',
        confirmedAt: new Date()
      });

      logInfo(`✅ [CONFIRM] Estado actualizado a 'confirmed' para cita ID=${appointmentId}`);

      // Schedule the reminder message based on timing
      const reminderTemplate = (appointment as any).reminderTemplate;
      if (reminderTemplate && reminderTemplate.isActive) {
        // const appointmentTime = new Date(appointment.startTime).getTime();
        // const timingMs = (reminderTemplate.timing || 1) * 60 * 60 * 1000; // hours to ms
        // const sendTime = appointmentTime - timingMs;
        // const now = Date.now();
        // const delay = Math.max(0, sendTime - now);

        // CAMBIO SOLICITADO: Programar envio 1 min despues de confirmar
        const delay = 60000; // 1 minuto fixed delay

        logInfo(`📅 [CONFIRM] Programando recordatorio para cita ID=${appointmentId}`);
        // logInfo(`📅 [CONFIRM] - Hora de cita: ${new Date(appointmentTime).toISOString()}`);
        // logInfo(`📅 [CONFIRM] - Timing: ${reminderTemplate.timing} horas antes`);
        // logInfo(`📅 [CONFIRM] - Hora de envío: ${new Date(sendTime).toISOString()}`);
        logInfo(`📅 [CONFIRM] - Delay: ${Math.round(delay / 60000)} minutos`);

        // Import add from queues to schedule the reminder
        const { add } = require('../../queues');

        await add("AppointmentReminder", {
          appointmentId: appointment.id,
          companyId: appointment.companyId,
          type: 'reminder' // This time it's the reminder, not confirmation
        }, {
          delay: delay,
          removeOnComplete: { age: 60 * 60, count: 100 },
          removeOnFail: { age: 60 * 60, count: 50 }
        });

        logInfo(`✅ [CONFIRM] Recordatorio programado exitosamente para cita ID=${appointmentId}`);
      } else {
        logWarn(`⚠️ [CONFIRM] Cita confirmada pero SIN plantilla de recordatorio activa. ID=${appointmentId}`);
      }

      return appointment;
    } catch (error: any) {
      logError(`❌ [CONFIRM] Error confirmando cita ID=${appointmentId}: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * Complete an appointment
   */
  async completeAppointment(
    appointmentId: number,
    companyId: number
  ): Promise<Appointment> {
    try {
      const appointment = await Appointment.findOne({
        where: { id: appointmentId, companyId }
      });

      if (!appointment) {
        throw new Error('Appointment not found');
      }

      await appointment.update({
        status: 'completed',
        completedAt: new Date()
      });

      logInfo('Appointment completed', { appointmentId });

      return appointment;
    } catch (error) {
      logError('Error completing appointment', { error, appointmentId });
      throw error;
    }
  }

  /**
   * Get appointments with filters
   */
  async getAppointments(filters: {
    companyId: number;
    userId?: number;
    contactId?: number;
    serviceId?: number;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }): Promise<{ appointments: Appointment[]; total: number; totalPages: number; page: number }> {
    try {
      const {
        companyId,
        userId,
        contactId,
        serviceId,
        status,
        startDate,
        endDate,
        page = 1,
        limit = 20
      } = filters;

      const where: any = { companyId };

      if (userId) where.userId = userId;
      if (contactId) where.contactId = contactId;
      if (serviceId) where.serviceId = serviceId;
      if (status) {
        // Soportar múltiples estados separados por coma
        if (status.includes(',')) {
          where.status = { [Op.in]: status.split(',').map(s => s.trim()) };
        } else {
          where.status = status;
        }
      }

      if (startDate && endDate) {
        where.startTime = {
          [Op.gte]: startDate,
          [Op.lte]: endDate
        };
      } else if (startDate) {
        where.startTime = { [Op.gte]: startDate };
      } else if (endDate) {
        where.startTime = { [Op.lte]: endDate };
      }

      const { count, rows } = await Appointment.findAndCountAll({
        where,
        include: [
          { model: AppointmentService, as: 'service', required: false },
          { model: Contact, as: 'contact', required: false },
          { model: User, as: 'assignedUser', attributes: ['id', 'name', 'email'], required: false }
        ],
        order: [['startTime', 'ASC']],
        limit,
        offset: (page - 1) * limit
      });

      return {
        appointments: rows,
        total: count,
        totalPages: Math.ceil(count / limit),
        page
      };
    } catch (error) {
      logError('Error getting appointments', { error, filters });
      throw error;
    }
  }

  /**
   * Get a single appointment by ID
   */
  async getAppointmentById(
    appointmentId: number,
    companyId: number
  ): Promise<Appointment | null> {
    try {
      const appointment = await Appointment.findOne({
        where: { id: appointmentId, companyId },
        include: [
          { model: AppointmentService, as: 'service', required: false },
          { model: Contact, as: 'contact', required: false },
          { model: User, as: 'assignedUser', attributes: ['id', 'name', 'email'], required: false },
          { model: AppointmentReminder, as: 'reminders', required: false }
        ]
      });

      return appointment;
    } catch (error) {
      logError('Error getting appointment', { error, appointmentId, companyId });
      throw error;
    }
  }

  /**
   * Delete an appointment
   */
  async deleteAppointment(
    appointmentId: number,
    companyId: number
  ): Promise<boolean> {
    try {
      const appointment = await Appointment.findOne({
        where: { id: appointmentId, companyId }
      });

      if (!appointment) {
        return false;
      }

      // Delete reminders first
      await AppointmentReminder.destroy({
        where: { appointmentId }
      });

      await appointment.destroy();

      logInfo('Appointment deleted', { appointmentId });

      return true;
    } catch (error) {
      logError('Error deleting appointment', { error, appointmentId, companyId });
      throw error;
    }
  }

  /**
   * Get dates that have appointments (optimized for calendar view)
   * Returns only dates with appointment count - no full appointment data
   */
  async getAppointmentDates(filters: {
    companyId: number;
    startDate: Date;
    endDate: Date;
    userId?: number;
  }): Promise<{ date: string; count: number }[]> {
    try {
      const { companyId, startDate, endDate, userId } = filters;

      const where: any = {
        companyId,
        startTime: {
          [Op.gte]: startDate,
          [Op.lte]: endDate
        },
        status: { [Op.notIn]: ['cancelled'] }
      };

      if (userId) where.userId = userId;

      const appointments = await Appointment.findAll({
        where,
        attributes: ['startTime'],
        raw: true
      });

      // Group by date
      const dateMap = new Map<string, number>();
      appointments.forEach((apt: any) => {
        const dateStr = new Date(apt.startTime).toISOString().split('T')[0];
        dateMap.set(dateStr, (dateMap.get(dateStr) || 0) + 1);
      });

      return Array.from(dateMap.entries()).map(([date, count]) => ({
        date,
        count
      }));
    } catch (error) {
      logError('Error getting appointment dates', { error, filters });
      throw error;
    }
  }

  /**
   * Get appointments for a specific date
   */
  async getAppointmentsByDate(filters: {
    companyId: number;
    date: Date;
    userId?: number;
  }): Promise<Appointment[]> {
    try {
      const { companyId, date, userId } = filters;

      logInfo('getAppointmentsByDate called', { companyId, date, userId });

      // Start and end of the selected day
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      logInfo('Date range', { startOfDay, endOfDay });

      const where: any = {
        companyId,
        startTime: {
          [Op.gte]: startOfDay,
          [Op.lte]: endOfDay
        }
      };

      if (userId) where.userId = userId;

      const appointments = await Appointment.findAll({
        where,
        include: [
          { model: AppointmentService, as: 'service', required: false },
          { model: Contact, as: 'contact', required: false },
          { model: User, as: 'assignedUser', attributes: ['id', 'name', 'email'], required: false }
        ],
        order: [['startTime', 'ASC']]
      });

      logInfo('Appointments found', { count: appointments.length });

      return appointments;
    } catch (error: any) {
      logError('Error getting appointments by date', {
        error: error.message,
        stack: error.stack,
        filters
      });
      throw error;
    }
  }
}

export default new BookingService();

