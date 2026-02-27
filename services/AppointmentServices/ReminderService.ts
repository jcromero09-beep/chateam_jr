import { Op } from 'sequelize';
import AppointmentReminder from '../../models/Appointments/AppointmentReminder';
import Appointment from '../../models/Appointments/Appointment';
import ReminderTemplate from '../../models/Appointments/ReminderTemplate';
import Contact from '../../models/Contact';
import User from '../../models/User';
import AppointmentService from '../../models/AppointmentService';
import logger, { logError, logInfo, logWarn, logDebug } from '../../utils/logger';

interface CreateReminderRequest {
  appointmentId: number;
  companyId: number;
  reminderType: 'email' | 'whatsapp';
  remindAt: Date;
  minutesBefore: number;
}

interface CreateTemplateRequest {
  companyId: number;
  name: string;
  channel: 'email' | 'whatsapp';
  subject?: string;
  messageConfirm: string;  // Mensaje para pedir confirmación
  messageReminder: string; // Mensaje de recordatorio cuando ya confirmó
  timing: number;
  isActive?: boolean;
}

interface UpdateTemplateRequest extends Partial<CreateTemplateRequest> {
  id: number;
}

class ReminderService {
  // ============ TEMPLATE METHODS ============

  /**
   * Get all templates for a company
   */
  async getTemplates(companyId: number): Promise<ReminderTemplate[]> {
    try {
      const templates = await ReminderTemplate.findAll({
        where: { companyId },
        order: [['createdAt', 'DESC']]
      });

      return templates;
    } catch (error) {
      logError('Error getting templates', { error, companyId });
      throw error;
    }
  }

  /**
   * Create a new template
   */
  async createTemplate(data: CreateTemplateRequest): Promise<ReminderTemplate> {
    try {
      const template = await ReminderTemplate.create({
        companyId: data.companyId,
        name: data.name,
        channel: data.channel,
        subject: data.subject,
        messageConfirm: data.messageConfirm,
        messageReminder: data.messageReminder,
        timing: data.timing,
        isActive: data.isActive !== undefined ? data.isActive : true,
        sentCount: 0,
        deliveryRate: 0
      });

      logInfo('Reminder template created', {
        templateId: template.id,
        name: data.name,
        channel: data.channel
      });

      return template;
    } catch (error) {
      logError('Error creating template', { error, data });
      throw error;
    }
  }

  /**
   * Update a template
   */
  async updateTemplate(data: UpdateTemplateRequest, companyId: number): Promise<ReminderTemplate | null> {
    try {
      const template = await ReminderTemplate.findOne({
        where: { id: data.id, companyId }
      });

      if (!template) {
        return null;
      }

      await template.update({
        name: data.name ?? template.name,
        channel: data.channel ?? template.channel,
        subject: data.subject ?? template.subject,
        messageConfirm: data.messageConfirm ?? template.messageConfirm,
        messageReminder: data.messageReminder ?? template.messageReminder,
        timing: data.timing ?? template.timing,
        isActive: data.isActive !== undefined ? data.isActive : template.isActive
      });

      logInfo('Reminder template updated', { templateId: data.id });

      return template;
    } catch (error) {
      logError('Error updating template', { error, data });
      throw error;
    }
  }

  /**
   * Delete a template
   */
  async deleteTemplate(templateId: number, companyId: number): Promise<boolean> {
    try {
      const result = await ReminderTemplate.destroy({
        where: { id: templateId, companyId }
      });

      logInfo('Reminder template deleted', { templateId });

      return result > 0;
    } catch (error) {
      logError('Error deleting template', { error, templateId, companyId });
      throw error;
    }
  }

  /**
   * Toggle template active status
   */
  async toggleTemplate(templateId: number, companyId: number): Promise<ReminderTemplate | null> {
    try {
      const template = await ReminderTemplate.findOne({
        where: { id: templateId, companyId }
      });

      if (!template) {
        return null;
      }

      await template.update({ isActive: !template.isActive });

      logInfo('Template toggled', { templateId, isActive: template.isActive });

      return template;
    } catch (error) {
      logError('Error toggling template', { error, templateId });
      throw error;
    }
  }

  // ============ REMINDER HISTORY METHODS ============

  /**
   * Get reminder history/logs for a company with appointment details
   */
  async getReminderHistory(
    companyId: number,
    filters?: {
      status?: string;
      channel?: string;
      startDate?: Date;
      endDate?: Date;
      page?: number;
      limit?: number;
    }
  ): Promise<{ reminders: any[]; total: number; page: number; totalPages: number }> {
    try {
      const page = filters?.page || 1;
      const limit = filters?.limit || 50;
      const offset = (page - 1) * limit;

      const where: any = { companyId };

      if (filters?.status) {
        where.status = filters.status;
      }

      if (filters?.channel) {
        where.reminderType = filters.channel;
      }

      if (filters?.startDate || filters?.endDate) {
        where.createdAt = {};
        if (filters.startDate) {
          where.createdAt[Op.gte] = filters.startDate;
        }
        if (filters.endDate) {
          where.createdAt[Op.lte] = filters.endDate;
        }
      }

      const { count, rows } = await AppointmentReminder.findAndCountAll({
        where,
        include: [
          {
            model: Appointment,
            as: 'appointment',
            required: false,
            include: [
              { model: Contact, as: 'contact', required: false, attributes: ['id', 'name', 'email', 'number'] },
              { model: User, as: 'assignedUser', required: false, attributes: ['id', 'name', 'email'] },
              { model: AppointmentService, as: 'service', required: false, attributes: ['id', 'name'] }
            ]
          }
        ],
        order: [['createdAt', 'DESC']],
        limit,
        offset
      });

      // Transform data for frontend
      const reminders = rows.map(reminder => {
        const appointment = (reminder as any).appointment;
        return {
          id: reminder.id,
          appointmentId: reminder.appointmentId,
          clientName: appointment?.contact?.name || appointment?.attendeeName || 'Sin nombre',
          clientEmail: appointment?.contact?.email || appointment?.attendeeEmail || '',
          clientPhone: appointment?.contact?.number || appointment?.attendeePhone || '',
          channel: reminder.reminderType,
          status: reminder.status,
          sentAt: reminder.createdAt,
          deliveredAt: reminder.sentAt,
          errorMessage: reminder.errorMessage,
          appointmentDate: appointment?.startTime,
          serviceName: appointment?.service?.name || 'Sin servicio',
          agentName: appointment?.assignedUser?.name || 'Sin asignar'
        };
      });

      return {
        reminders,
        total: count,
        page,
        totalPages: Math.ceil(count / limit)
      };
    } catch (error) {
      logError('Error getting reminder history', { error, companyId, filters });
      throw error;
    }
  }

  /**
   * Get reminder stats for dashboard
   */
  async getReminderStats(companyId: number): Promise<{
    totalSent: number;
    delivered: number;
    failed: number;
    pending: number;
    deliveryRate: number;
    byChannel: { channel: string; count: number }[];
  }> {
    try {
      const allReminders = await AppointmentReminder.findAll({
        where: { companyId },
        attributes: ['status', 'reminderType']
      });

      const totalSent = allReminders.filter(r => r.status === 'sent').length;
      const delivered = allReminders.filter(r => r.status === 'sent').length; // sent = delivered in this context
      const failed = allReminders.filter(r => r.status === 'failed').length;
      const pending = allReminders.filter(r => r.status === 'pending').length;

      const total = totalSent + failed;
      const deliveryRate = total > 0 ? (totalSent / total) * 100 : 0;

      // Count by channel
      const channelCounts = new Map<string, number>();
      allReminders.forEach(r => {
        const count = channelCounts.get(r.reminderType) || 0;
        channelCounts.set(r.reminderType, count + 1);
      });

      const byChannel = Array.from(channelCounts.entries()).map(([channel, count]) => ({
        channel,
        count
      }));

      return {
        totalSent,
        delivered,
        failed,
        pending,
        deliveryRate,
        byChannel
      };
    } catch (error) {
      logError('Error getting reminder stats', { error, companyId });
      throw error;
    }
  }

  // ============ ORIGINAL REMINDER METHODS ============

  /**
   * Create a reminder for an appointment
   */
  async createReminder(data: CreateReminderRequest): Promise<AppointmentReminder> {
    try {
      const reminder = await AppointmentReminder.create({
        appointmentId: data.appointmentId,
        companyId: data.companyId,
        reminderType: data.reminderType,
        remindAt: data.remindAt,
        minutesBefore: data.minutesBefore,
        status: 'pending'
      });

      logInfo('Appointment reminder created', {
        reminderId: reminder.id,
        appointmentId: data.appointmentId,
        reminderType: data.reminderType,
        remindAt: data.remindAt
      });

      return reminder;
    } catch (error) {
      logError('Error creating reminder', { error, data });
      throw error;
    }
  }

  /**
   * Create default reminders for an appointment
   * MODO PRUEBAS: Primer recordatorio en 5 minutos, segundo 1h antes
   * PRODUCCIÓN: Cambiar a 24h y 1h antes
   */
  async createDefaultReminders(appointment: Appointment): Promise<AppointmentReminder[]> {
    try {
      const reminders: AppointmentReminder[] = [];
      const now = new Date();

      // PRUEBA: 5 minutos después de crear la cita (para testing)
      const reminder5min = new Date(now.getTime() + 5 * 60 * 1000);
      const r5 = await this.createReminder({
        appointmentId: appointment.id,
        companyId: appointment.companyId,
        reminderType: 'whatsapp',
        remindAt: reminder5min,
        minutesBefore: 5
      });
      reminders.push(r5);
      logInfo(`📅 Recordatorio de PRUEBA programado para ${reminder5min.toISOString()} (en 5 min)`);

      // 1 hour before (60 minutes) - mantener para producción
      const reminder1h = new Date(appointment.startTime.getTime() - 60 * 60 * 1000);
      if (reminder1h > new Date()) {
        const r1 = await this.createReminder({
          appointmentId: appointment.id,
          companyId: appointment.companyId,
          reminderType: 'whatsapp',
          remindAt: reminder1h,
          minutesBefore: 60
        });
        reminders.push(r1);
      }

      return reminders;
    } catch (error) {
      logError('Error creating default reminders', { error, appointmentId: appointment.id });
      throw error;
    }
  }

  /**
   * Update reminders when appointment is rescheduled
   */
  async updateRemindersForReschedule(appointment: Appointment): Promise<void> {
    try {
      // Cancel old reminders
      await AppointmentReminder.update(
        { status: 'cancelled' },
        {
          where: {
            appointmentId: appointment.id,
            status: 'pending'
          }
        }
      );

      // Create new reminders
      await this.createDefaultReminders(appointment);

      logInfo('Reminders updated for reschedule', { appointmentId: appointment.id });
    } catch (error) {
      logError('Error updating reminders for reschedule', { error, appointmentId: appointment.id });
      throw error;
    }
  }

  /**
   * Get pending reminders that need to be sent
   */
  async getPendingReminders(): Promise<AppointmentReminder[]> {
    try {
      const now = new Date();

      const reminders = await AppointmentReminder.findAll({
        where: {
          status: 'pending',
          remindAt: { [Op.lte]: now }
        },
        include: [
          {
            model: Appointment,
            as: 'appointment',
            where: {
              status: { [Op.notIn]: ['cancelled', 'completed'] }
            },
            include: [
              { model: Contact, as: 'contact' }
            ]
          }
        ],
        limit: 100
      });

      return reminders;
    } catch (error) {
      logError('Error getting pending reminders', { error });
      throw error;
    }
  }

  /**
   * Mark reminder as sent
   */
  async markAsSent(reminderId: number): Promise<void> {
    try {
      await AppointmentReminder.update(
        {
          status: 'sent',
          sentAt: new Date()
        },
        { where: { id: reminderId } }
      );

      logInfo('Reminder marked as sent', { reminderId });
    } catch (error) {
      logError('Error marking reminder as sent', { error, reminderId });
      throw error;
    }
  }

  /**
   * Mark reminder as failed
   */
  async markAsFailed(reminderId: number, errorMessage: string): Promise<void> {
    try {
      await AppointmentReminder.update(
        {
          status: 'failed',
          errorMessage
        },
        { where: { id: reminderId } }
      );

      logError('Reminder marked as failed', { reminderId, errorMessage });
    } catch (error) {
      logError('Error marking reminder as failed', { error, reminderId });
      throw error;
    }
  }

  /**
   * Delete a reminder
   */
  async deleteReminder(reminderId: number, companyId: number): Promise<boolean> {
    try {
      const reminder = await AppointmentReminder.findOne({
        where: { id: reminderId, companyId }
      });

      if (!reminder) {
        return false;
      }

      await reminder.destroy();

      logInfo('Reminder deleted', { reminderId });

      return true;
    } catch (error) {
      logError('Error deleting reminder', { error, reminderId, companyId });
      throw error;
    }
  }

  /**
   * Get reminders for an appointment
   */
  async getAppointmentReminders(
    appointmentId: number,
    companyId: number
  ): Promise<AppointmentReminder[]> {
    try {
      const reminders = await AppointmentReminder.findAll({
        where: { appointmentId, companyId },
        order: [['remindAt', 'ASC']]
      });

      return reminders;
    } catch (error) {
      logError('Error getting appointment reminders', { error, appointmentId, companyId });
      throw error;
    }
  }

  /**
   * Process pending reminders (called by cron job)
   */
  async processReminders(): Promise<{ processed: number; failed: number }> {
    try {
      const pendingReminders = await this.getPendingReminders();
      let processed = 0;
      let failed = 0;

      for (const reminder of pendingReminders) {
        try {
          // Here you would integrate with your notification service
          // For now, just mark as sent
          await this.markAsSent(reminder.id);
          processed++;
        } catch (sendError: any) {
          await this.markAsFailed(reminder.id, sendError.message);
          failed++;
        }
      }

      logInfo('Reminder processing completed', { processed, failed });

      return { processed, failed };
    } catch (error) {
      logError('Error processing reminders', { error });
      throw error;
    }
  }
}

export default new ReminderService();

