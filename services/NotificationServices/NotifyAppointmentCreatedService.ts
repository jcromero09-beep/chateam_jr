import { Op } from "sequelize";
import Appointment from "../../models/Appointments/Appointment";
import User from "../../models/User";
import Contact from "../../models/Contact";
import CreateNotificationService from "./CreateNotificationService";
import logger from "../../utils/logger";

const LOG_PREFIX = "[NotifyAppointmentCreated]";

/**
 * Crea notificaciones in-app cuando se registra una nueva cita.
 *
 * Destinatarios:
 *   - El usuario asignado (`appointment.userId`) — SIEMPRE recibe (sin toggle)
 *   - Los admins (profile='admin') con `notifyNewAppointments = true`
 *
 * Deduplica usuarios para no enviar dos notificaciones a la misma persona.
 * Falla silenciosamente para no abortar la creación de la cita.
 */
const NotifyAppointmentCreatedService = async (
  appointment: Appointment
): Promise<{ sent: number; recipients: number[] }> => {
  try {
    if (!appointment || !appointment.companyId) {
      return { sent: 0, recipients: [] };
    }

    // Cargar contacto para enriquecer el mensaje
    let contactName = "Cliente";
    if (appointment.contactId) {
      try {
        const contact = await Contact.findByPk(appointment.contactId, {
          attributes: ["id", "name"]
        });
        if (contact?.name) contactName = contact.name;
      } catch {
        /* sin contacto -> usar default */
      }
    }

    // Construir lista de destinatarios deduplicada
    const recipientIds = new Set<number>();

    // 1. Usuario asignado (SIEMPRE)
    if (appointment.userId) {
      recipientIds.add(appointment.userId);
    }

    // 2. Admins con toggle activo
    const adminsToNotify = await User.findAll({
      where: {
        companyId: appointment.companyId,
        profile: "admin",
        notifyNewAppointments: true
      } as any,
      attributes: ["id"]
    });

    for (const a of adminsToNotify) {
      recipientIds.add(a.id);
    }

    if (recipientIds.size === 0) {
      logger.info(
        `${LOG_PREFIX} Cita ${appointment.id} sin destinatarios (sin asignado y sin admins con toggle)`
      );
      return { sent: 0, recipients: [] };
    }

    // 3. Construir contenido del mensaje
    const startTime = appointment.startTime
      ? new Date(appointment.startTime)
      : null;
    const dateLabel = startTime
      ? startTime.toLocaleDateString("es-MX", {
          day: "2-digit",
          month: "long",
          year: "numeric"
        })
      : "—";
    const timeLabel = startTime
      ? startTime.toLocaleTimeString("es-MX", {
          hour: "2-digit",
          minute: "2-digit"
        })
      : "—";

    const title = appointment.title
      ? `Nueva cita: ${appointment.title}`
      : "Nueva cita programada";

    const message = `${contactName} — ${dateLabel} a las ${timeLabel}`;
    const actionUrl = `/appointments/${appointment.id}`;

    // 4. Crear una notificación por destinatario
    const recipients = Array.from(recipientIds);
    let sent = 0;

    for (const userId of recipients) {
      const result = await CreateNotificationService({
        companyId: appointment.companyId,
        userId,
        type: "info",
        category: "appointment",
        title,
        message,
        actionUrl,
        metadata: {
          appointmentId: appointment.id,
          contactId: appointment.contactId,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          isAssignedUser: userId === appointment.userId
        }
      });
      if (result) sent++;
    }

    logger.info(
      `${LOG_PREFIX} 🔔 ${sent}/${recipients.length} notificaciones creadas para cita ${appointment.id}`
    );

    return { sent, recipients };
  } catch (err: any) {
    logger.error(`${LOG_PREFIX} Error general: ${err.message}`);
    return { sent: 0, recipients: [] };
  }
};

export default NotifyAppointmentCreatedService;
