import { Request, Response } from 'express';
import AppointmentServiceCRUD from '../services/AppointmentServices/AppointmentServiceCRUD';
import AvailabilityService from '../services/AppointmentServices/AvailabilityService';
import BookingService from '../services/AppointmentServices/BookingService';
import CalendarSyncService from '../services/AppointmentServices/CalendarSyncService';
import ReminderService from '../services/AppointmentServices/ReminderService';
import AISchedulingService from '../services/AppointmentServices/AISchedulingService';
import logger, { logError, logInfo, logWarn } from '../utils/logger';

// ============ APPOINTMENT SERVICES ============

export const listServices = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { activeOnly } = req.query;

    const services = await AppointmentServiceCRUD.listByCompany(
      companyId,
      activeOnly === 'true'
    );

    return res.json(services);
  } catch (error) {
    logError('Error listing appointment services', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createService = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const serviceData = { ...req.body, companyId };

    const service = await AppointmentServiceCRUD.create(serviceData);

    return res.status(201).json(service);
  } catch (error) {
    logError('Error creating appointment service', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateService = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const { companyId } = req.user as any;

    const service = await AppointmentServiceCRUD.update({
      id: parseInt(id),
      ...req.body,
      companyId
    });

    return res.json(service);
  } catch (error) {
    logError('Error updating appointment service', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteService = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const { companyId } = req.user as any;

    const deleted = await AppointmentServiceCRUD.delete(parseInt(id), companyId);

    if (!deleted) {
      return res.status(404).json({ error: 'Service not found' });
    }

    return res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    logError('Error deleting appointment service', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ============ AVAILABILITY ============

export const getAvailableSlots = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { serviceId, userId, startDate, endDate } = req.query;

    const slots = await AvailabilityService.getAvailableSlots({
      companyId,
      serviceId: parseInt(serviceId as string),
      userId: userId ? parseInt(userId as string) : undefined,
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string)
    });

    return res.json(slots);
  } catch (error) {
    logError('Error getting available slots', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const setAvailability = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;

    const availability = await AvailabilityService.setAvailability({
      companyId,
      ...req.body
    });

    return res.status(201).json(availability);
  } catch (error) {
    logError('Error setting availability', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getUserAvailability = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { userId } = req.params;

    const availability = await AvailabilityService.getUserAvailability(
      parseInt(userId),
      companyId
    );

    return res.json(availability);
  } catch (error) {
    logError('Error getting user availability', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createBlock = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId, id: userId } = req.user as any;

    logInfo('createBlock called', {
      companyId,
      userId,
      body: req.body
    });

    if (!req.body.title || !req.body.startTime || !req.body.endTime) {
      return res.status(400).json({ error: 'title, startTime and endTime are required' });
    }

    const block = await AvailabilityService.createBlock({
      companyId,
      userId: req.body.userId || userId,
      title: req.body.title,
      startTime: new Date(req.body.startTime),
      endTime: new Date(req.body.endTime),
      reason: req.body.reason,
      isRecurring: req.body.isRecurring || false,
      recurrenceRule: req.body.recurrenceRule
    });

    logInfo('Block created', { blockId: block.id });

    return res.status(201).json(block);
  } catch (error: any) {
    logError('Error creating time block', {
      error: error.message,
      stack: error.stack,
      original: error.original?.message
    });
    return res.status(500).json({
      error: error.message || 'Internal server error',
      details: error.original?.message
    });
  }
};

export const saveAvailabilityBulk = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId, id: userId } = req.user as any;
    const { schedule, timezone } = req.body;

    logInfo('saveAvailabilityBulk endpoint called', { companyId, userId, scheduleLength: schedule?.length });

    if (!schedule || !Array.isArray(schedule)) {
      return res.status(400).json({ error: 'Schedule must be an array' });
    }

    const result = await AvailabilityService.saveAvailabilityBulk({
      companyId,
      userId,
      schedule,
      timezone
    });

    return res.json(result);
  } catch (error: any) {
    logError('Error saving availability in bulk', {
      error: error.message,
      stack: error.stack,
      original: error.original?.message
    });
    return res.status(500).json({
      error: error.message || 'Internal server error',
      details: error.original?.message
    });
  }
};

export const getCompanyBlocks = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;

    logInfo('getCompanyBlocks called', { companyId });

    const blocks = await AvailabilityService.getCompanyBlocks(companyId);

    logInfo('Blocks fetched', { count: blocks.length });

    return res.json(blocks);
  } catch (error: any) {
    logError('Error getting company blocks', {
      error: error.message,
      stack: error.stack,
      original: error.original?.message
    });
    return res.status(500).json({
      error: error.message || 'Internal server error',
      details: error.original?.message
    });
  }
};

export const deleteBlock = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { id } = req.params;

    const deleted = await AvailabilityService.deleteBlockById(parseInt(id), companyId);

    if (!deleted) {
      return res.status(404).json({ error: 'Block not found' });
    }

    return res.json({ message: 'Block deleted successfully' });
  } catch (error) {
    logError('Error deleting block', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ============ BOOKINGS ============

export const createBooking = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId, id: userId } = req.user as any;
    const { startTime, ...restBody } = req.body;

    logInfo(`📅 [CREATE-BOOKING] Iniciando creación de cita`);
    logInfo(`📅 [CREATE-BOOKING] - CompanyId: ${companyId}`);
    logInfo(`📅 [CREATE-BOOKING] - UserId: ${restBody.userId || userId}`);
    logInfo(`📅 [CREATE-BOOKING] - StartTime: ${startTime}`);
    logInfo(`📅 [CREATE-BOOKING] - ContactId: ${restBody.contactId}`);
    logInfo(`📅 [CREATE-BOOKING] - ServiceId: ${restBody.serviceId}`);
    logInfo(`📅 [CREATE-BOOKING] - ReminderTemplateId: ${restBody.reminderTemplateId || 'N/A'}`);

    const appointment = await BookingService.createBooking({
      companyId,
      userId: restBody.userId || userId,
      ...restBody,
      startTime: new Date(startTime)
    });

    logInfo(`✅ [CREATE-BOOKING] Cita creada exitosamente ID=${appointment.id}`);

    // Sync to calendar if configured
    if (appointment.userId) {
      try {
        await CalendarSyncService.syncToGoogleCalendar(appointment, appointment.userId, companyId);
        await CalendarSyncService.syncToOutlookCalendar(appointment, appointment.userId);
      } catch (syncError) {
        logWarn('Calendar sync failed', { error: syncError, appointmentId: appointment.id });
      }
    }

    if (appointment.reminderTemplateId) {
      logInfo(`📅 [CREATE-BOOKING] Cita creada con plantilla de recordatorio ID=${appointment.reminderTemplateId}`);
    } else {
      logInfo(`📅 [CREATE-BOOKING] Cita sin plantilla de recordatorio asignada`);
    }

    logInfo(`✅ [CREATE-BOOKING] Proceso completado para cita ID=${appointment.id}`);
    return res.status(201).json(appointment);
  } catch (error: any) {
    logError(`❌ [CREATE-BOOKING] Error creando cita: ${error?.message || error}`);
    return res.status(400).json({ error: error.message || 'Failed to create booking' });
  }
};

export const getAppointments = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { startDate, endDate, userId, serviceId, status, contactId, page, limit } = req.query;

    const result = await BookingService.getAppointments({
      companyId,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      userId: userId ? parseInt(userId as string) : undefined,
      serviceId: serviceId ? parseInt(serviceId as string) : undefined,
      status: status as string,
      contactId: contactId ? parseInt(contactId as string) : undefined,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20
    });

    return res.json(result);
  } catch (error) {
    logError('Error getting appointments', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAppointmentById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { id } = req.params;

    const appointment = await BookingService.getAppointmentById(
      parseInt(id),
      companyId
    );

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    return res.json(appointment);
  } catch (error) {
    logError('Error getting appointment', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const rescheduleAppointment = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { id } = req.params;
    const { newStartTime } = req.body;

    const appointment = await BookingService.rescheduleAppointment(
      parseInt(id),
      companyId,
      new Date(newStartTime)
    );

    // Update calendar events
    if (appointment.userId) {
      try {
        await CalendarSyncService.syncToGoogleCalendar(appointment, appointment.userId, companyId);
        await CalendarSyncService.syncToOutlookCalendar(appointment, appointment.userId);
      } catch (syncError) {
        logWarn('Calendar sync failed', { error: syncError });
      }
    }

    return res.json(appointment);
  } catch (error: any) {
    logError('Error rescheduling appointment', { error });
    return res.status(400).json({ error: error.message || 'Failed to reschedule' });
  }
};

export const cancelAppointment = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { id } = req.params;
    const { reason } = req.body;

    // Get appointment before cancelling (to access googleCalendarEventId)
    const existing = await BookingService.getAppointmentById(parseInt(id), companyId);

    const appointment = await BookingService.cancelAppointment(
      parseInt(id),
      companyId,
      reason
    );

    // Delete from Google Calendar if synced
    if (existing?.googleCalendarEventId && existing.userId) {
      try {
        await CalendarSyncService.deleteFromGoogleCalendar(
          existing.googleCalendarEventId,
          existing.userId,
          companyId
        );
      } catch (syncError) {
        logWarn('Google Calendar delete failed on cancel', { error: syncError });
      }
    }

    return res.json(appointment);
  } catch (error) {
    logError('Error cancelling appointment', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const confirmAppointment = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { id } = req.params;

    const appointment = await BookingService.confirmAppointment(
      parseInt(id),
      companyId
    );

    return res.json(appointment);
  } catch (error) {
    logError('Error confirming appointment', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const completeAppointment = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { id } = req.params;

    const appointment = await BookingService.completeAppointment(
      parseInt(id),
      companyId
    );

    return res.json(appointment);
  } catch (error) {
    logError('Error completing appointment', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateAppointment = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { id } = req.params;

    const appointment = await BookingService.updateAppointment({
      id: parseInt(id),
      companyId,
      ...req.body
    });

    // Sync cambios a Google Calendar (si la cita tiene googleCalendarEventId hace update,
    // si no, lo crea; la lógica la maneja syncToGoogleCalendar internamente).
    if (appointment?.userId) {
      try {
        await CalendarSyncService.syncToGoogleCalendar(appointment, appointment.userId, companyId);
        await CalendarSyncService.syncToOutlookCalendar(appointment, appointment.userId);
      } catch (syncError) {
        logWarn('Calendar sync failed on update', { error: syncError, appointmentId: appointment.id });
      }
    }

    return res.json(appointment);
  } catch (error: any) {
    logError('Error updating appointment', { error });
    return res.status(400).json({ error: error.message || 'Failed to update appointment' });
  }
};

export const deleteAppointment = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { id } = req.params;

    // Get appointment before deleting (to access googleCalendarEventId)
    const existing = await BookingService.getAppointmentById(parseInt(id), companyId);

    // Delete from Google Calendar if synced
    if (existing?.googleCalendarEventId && existing.userId) {
      try {
        await CalendarSyncService.deleteFromGoogleCalendar(
          existing.googleCalendarEventId,
          existing.userId,
          companyId
        );
      } catch (syncError) {
        logWarn('Google Calendar delete failed', { error: syncError });
      }
    }

    const deleted = await BookingService.deleteAppointment(
      parseInt(id),
      companyId
    );

    if (!deleted) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    return res.json({ message: 'Appointment deleted successfully' });
  } catch (error) {
    logError('Error deleting appointment', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ============ CALENDAR OPTIMIZED ============

export const getAppointmentDates = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { startDate, endDate, userId } = req.query;

    const dates = await BookingService.getAppointmentDates({
      companyId,
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string),
      userId: userId ? parseInt(userId as string) : undefined
    });

    return res.json(dates);
  } catch (error) {
    logError('Error getting appointment dates', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAppointmentsByDate = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { date, userId } = req.query;

    const appointments = await BookingService.getAppointmentsByDate({
      companyId,
      date: new Date(date as string),
      userId: userId ? parseInt(userId as string) : undefined
    });

    return res.json(appointments);
  } catch (error) {
    logError('Error getting appointments by date', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ============ CALENDAR SYNC ============

export const setupGoogleSync = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId, id: userId } = req.user as any;

    const sync = await CalendarSyncService.setupGoogleCalendarSync({
      companyId,
      userId,
      ...req.body
    });

    return res.json(sync);
  } catch (error) {
    logError('Error setting up Google sync', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const setupOutlookSync = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId, id: userId } = req.user as any;

    const sync = await CalendarSyncService.setupOutlookCalendarSync({
      companyId,
      userId,
      ...req.body
    });

    return res.json(sync);
  } catch (error) {
    logError('Error setting up Outlook sync', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getUserSyncs = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id: userId } = req.user as any;

    const syncs = await CalendarSyncService.getUserSyncs(userId);

    return res.json(syncs);
  } catch (error) {
    logError('Error getting user syncs', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const disableSync = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id: userId } = req.user as any;
    const { provider } = req.params;

    const result = await CalendarSyncService.disableSync(userId, provider);

    return res.json({ success: result });
  } catch (error) {
    logError('Error disabling sync', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getGoogleAuthUrl = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId, id: userId } = req.user as any;
    const { redirectUri, frontendUrl } = req.query;

    if (!redirectUri) {
      return res.status(400).json({ error: 'redirectUri is required' });
    }

    // Create state parameter with user context (needed for callback since it's unauthenticated)
    const state = Buffer.from(JSON.stringify({
      companyId,
      userId,
      redirectUri,
      frontendUrl: frontendUrl || '/appointments/calendar'
    })).toString('base64');

    // Pass state to be embedded in the OAuth URL by generateAuthUrl
    const authUrl = await CalendarSyncService.getGoogleAuthUrl(
      companyId,
      redirectUri as string,
      state
    );

    if (!authUrl) {
      return res.status(400).json({
        error: 'Credenciales de Google Calendar no configuradas. Ve a Configuracion > General para agregar tu Google Client ID y Secret.'
      });
    }

    return res.json({ authUrl });
  } catch (error) {
    logError('Error getting Google auth URL', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const handleGoogleCallback = async (req: Request, res: Response): Promise<void> => {
  let frontendUrl = '/appointments/calendar';
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      res.status(400).json({ error: 'code and state are required' });
      return;
    }

    // state contains JSON with companyId, userId, redirectUri, frontendUrl
    let stateData: { companyId: number; userId: number; redirectUri: string; frontendUrl: string };
    try {
      stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
      frontendUrl = stateData.frontendUrl || frontendUrl;
    } catch {
      res.status(400).json({ error: 'Invalid state parameter' });
      return;
    }

    await CalendarSyncService.handleGoogleCallback({
      companyId: stateData.companyId,
      userId: stateData.userId,
      code: code as string,
      redirectUri: stateData.redirectUri
    });

    res.redirect(`${frontendUrl}?google_calendar=connected`);
  } catch (error) {
    logError('Error handling Google callback', { error });
    res.redirect(`${frontendUrl}?google_calendar=error`);
  }
};

// ============ AI SCHEDULING ============

export const getAISuggestions = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { contactId, serviceId } = req.query;

    const suggestions = await AISchedulingService.generateSuggestions({
      companyId,
      contactId: parseInt(contactId as string),
      serviceId: parseInt(serviceId as string)
    });

    return res.json(suggestions);
  } catch (error) {
    logError('Error getting AI suggestions', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getSuggestionsForContact = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { contactId } = req.params;

    const suggestions = await AISchedulingService.getSuggestionsForContact(
      parseInt(contactId),
      companyId
    );

    return res.json(suggestions);
  } catch (error) {
    logError('Error getting contact suggestions', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const applySuggestion = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { id } = req.params;

    await AISchedulingService.applySuggestion(parseInt(id), companyId);

    return res.json({ message: 'Suggestion applied successfully' });
  } catch (error) {
    logError('Error applying suggestion', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const optimizeSchedule = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId, id: userId } = req.user as any;
    const { date } = req.query;

    const result = await AISchedulingService.optimizeSchedule(
      companyId,
      userId,
      new Date(date as string)
    );

    return res.json(result);
  } catch (error) {
    logError('Error optimizing schedule', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ============ REMINDER TEMPLATES ============

export const getTemplates = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;

    const templates = await ReminderService.getTemplates(companyId);

    return res.json(templates);
  } catch (error) {
    logError('Error getting templates', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createTemplate = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { name, channel, subject, message, messageConfirm, messageReminder, timing, isActive } = req.body;

    // Retrocompatibilidad: aceptar `message` (legacy) o `messageConfirm`/`messageReminder` (nuevo UI)
    const finalMessageConfirm = messageConfirm || message;
    const finalMessageReminder = messageReminder || message;

    if (!name || !channel || !finalMessageConfirm || !finalMessageReminder || timing === undefined) {
      return res.status(400).json({ error: 'name, channel, messageConfirm, messageReminder and timing are required' });
    }

    const template = await ReminderService.createTemplate({
      companyId,
      name,
      channel,
      subject,
      messageConfirm: finalMessageConfirm,
      messageReminder: finalMessageReminder,
      timing,
      isActive
    });

    return res.status(201).json(template);
  } catch (error) {
    logError('Error creating template', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateTemplate = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { id } = req.params;

    const template = await ReminderService.updateTemplate({
      id: parseInt(id),
      ...req.body
    }, companyId);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    return res.json(template);
  } catch (error) {
    logError('Error updating template', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteTemplate = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { id } = req.params;

    const deleted = await ReminderService.deleteTemplate(parseInt(id), companyId);

    if (!deleted) {
      return res.status(404).json({ error: 'Template not found' });
    }

    return res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    logError('Error deleting template', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const toggleTemplate = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { id } = req.params;

    const template = await ReminderService.toggleTemplate(parseInt(id), companyId);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    return res.json(template);
  } catch (error) {
    logError('Error toggling template', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ============ REMINDER HISTORY ============

export const getReminderHistory = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { status, channel, startDate, endDate, page, limit } = req.query;

    const result = await ReminderService.getReminderHistory(companyId, {
      status: status as string,
      channel: channel as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 50
    });

    return res.json(result);
  } catch (error) {
    logError('Error getting reminder history', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getReminderStats = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;

    const stats = await ReminderService.getReminderStats(companyId);

    return res.json(stats);
  } catch (error) {
    logError('Error getting reminder stats', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ============ AVAILABILITY BLOCKS FOR BOOKING ============

export const getAvailableBlocksForDate = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { date, userId, serviceId } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'date is required' });
    }

    const blocks = await AvailabilityService.getAvailableBlocksForDate(
      companyId,
      date as string,
      userId ? parseInt(userId as string) : undefined,
      serviceId ? parseInt(serviceId as string) : undefined
    );

    return res.json(blocks);
  } catch (error) {
    logError('Error getting available blocks for date', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const markBlockAsBooked = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { blockId, appointmentId } = req.body;

    if (!blockId || !appointmentId) {
      return res.status(400).json({ error: 'blockId and appointmentId are required' });
    }

    const success = await AvailabilityService.markBlockAsBooked(
      parseInt(blockId),
      parseInt(appointmentId),
      companyId
    );

    return res.json({ success });
  } catch (error) {
    logError('Error marking block as booked', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const releaseBlock = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { appointmentId } = req.params;

    const success = await AvailabilityService.releaseBlock(
      parseInt(appointmentId),
      companyId
    );

    return res.json({ success });
  } catch (error) {
    logError('Error releasing block', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};
