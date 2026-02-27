import express from 'express';
import * as AppointmentController from '../controllers/AppointmentController';
import isAuth from '../middleware/isAuth';

const router = express.Router();

// ============ APPOINTMENT SERVICES ============

router.get('/services', isAuth, AppointmentController.listServices);
router.post('/services', isAuth, AppointmentController.createService);
router.put('/services/:id', isAuth, AppointmentController.updateService);
router.delete('/services/:id', isAuth, AppointmentController.deleteService);

// ============ AVAILABILITY ============

router.get('/availability/slots', isAuth, AppointmentController.getAvailableSlots);
router.post('/availability', isAuth, AppointmentController.setAvailability);
router.post('/availability/bulk', isAuth, AppointmentController.saveAvailabilityBulk);
router.get('/availability/user/:userId', isAuth, AppointmentController.getUserAvailability);
router.get('/availability/blocks', isAuth, AppointmentController.getCompanyBlocks);
router.post('/availability/blocks', isAuth, AppointmentController.createBlock);
router.delete('/availability/blocks/:id', isAuth, AppointmentController.deleteBlock);

// ============ CALENDAR OPTIMIZED ============

router.get('/calendar/dates', isAuth, AppointmentController.getAppointmentDates);
router.get('/calendar/day', isAuth, AppointmentController.getAppointmentsByDate);

// ============ BOOKINGS ============

router.get('/appointments', isAuth, AppointmentController.getAppointments);
router.get('/appointments/:id', isAuth, AppointmentController.getAppointmentById);
router.post('/appointments', isAuth, AppointmentController.createBooking);
router.put('/appointments/:id', isAuth, AppointmentController.updateAppointment);
router.delete('/appointments/:id', isAuth, AppointmentController.deleteAppointment);
router.post('/appointments/:id/reschedule', isAuth, AppointmentController.rescheduleAppointment);
router.post('/appointments/:id/cancel', isAuth, AppointmentController.cancelAppointment);
router.post('/appointments/:id/confirm', isAuth, AppointmentController.confirmAppointment);
router.post('/appointments/:id/complete', isAuth, AppointmentController.completeAppointment);

// ============ CALENDAR SYNC ============

router.post('/calendar/google/setup', isAuth, AppointmentController.setupGoogleSync);
router.post('/calendar/outlook/setup', isAuth, AppointmentController.setupOutlookSync);
router.get('/calendar/syncs', isAuth, AppointmentController.getUserSyncs);
router.delete('/calendar/sync/:provider', isAuth, AppointmentController.disableSync);
router.get('/calendar/google/auth-url', isAuth, AppointmentController.getGoogleAuthUrl);
router.get('/calendar/google/callback', AppointmentController.handleGoogleCallback);

// ============ AI SCHEDULING ============

router.get('/ai/suggestions', isAuth, AppointmentController.getAISuggestions);
router.get('/ai/suggestions/contact/:contactId', isAuth, AppointmentController.getSuggestionsForContact);
router.post('/ai/suggestions/:id/apply', isAuth, AppointmentController.applySuggestion);
router.get('/ai/optimize', isAuth, AppointmentController.optimizeSchedule);

// ============ REMINDER TEMPLATES ============

router.get('/reminders/templates', isAuth, AppointmentController.getTemplates);
router.post('/reminders/templates', isAuth, AppointmentController.createTemplate);
router.put('/reminders/templates/:id', isAuth, AppointmentController.updateTemplate);
router.delete('/reminders/templates/:id', isAuth, AppointmentController.deleteTemplate);
router.post('/reminders/templates/:id/toggle', isAuth, AppointmentController.toggleTemplate);

// ============ REMINDER HISTORY ============

router.get('/reminders/history', isAuth, AppointmentController.getReminderHistory);
router.get('/reminders/stats', isAuth, AppointmentController.getReminderStats);

// ============ AVAILABILITY BLOCKS FOR BOOKING ============

router.get('/availability/blocks-for-date', isAuth, AppointmentController.getAvailableBlocksForDate);
router.post('/availability/mark-booked', isAuth, AppointmentController.markBlockAsBooked);
router.post('/availability/release/:appointmentId', isAuth, AppointmentController.releaseBlock);

export default router;
console.log("📄 APPOINTMENT-ROUTES.TS LOADED\!");
