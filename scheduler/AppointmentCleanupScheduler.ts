import { Op } from "sequelize";
import Appointment from "../models/Appointments/Appointment";
import logger from "../utils/logger";

const LOG_PREFIX = "[AppointmentCleanupScheduler]";

/**
 * Scheduler que limpia citas diarias a la 1:00 AM
 *
 * Proceso:
 * 1. Busca citas con fecha anterior a hoy
 * 2. Las que están en estado "confirmed" → marca como "completed"
 * 3. Las que están en estado "scheduled" → marca como "cancelled"
 *
 * Esto evita que citas antiguas aparezcan en la lista de citas activas
 */
let isAppointmentCleanupRunning = false;

async function appointmentCleanup(): Promise<void> {
  if (isAppointmentCleanupRunning) {
    logger.info(`${LOG_PREFIX} Ya está ejecutándose — saltando iteración`);
    return;
  }

  isAppointmentCleanupRunning = true;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Inicio de hoy

    logger.info(`${LOG_PREFIX} 🧹 Iniciando limpieza de citas...`);

    // 1. Citas confirmadas anteriores a hoy → completed
    const confirmedAppointments = await Appointment.findAll({
      where: {
        status: "confirmed",
        startTime: { [Op.lt]: today }
      }
    });

    if (confirmedAppointments.length > 0) {
      const appointmentIds = confirmedAppointments.map(a => a.id);
      await Appointment.update(
        { status: "completed" },
        { where: { id: { [Op.in]: appointmentIds } } }
      );
      logger.info(`${LOG_PREFIX} ✅ ${confirmedAppointments.length} citas confirmadas marcadas como completadas`);
    } else {
      logger.info(`${LOG_PREFIX} 😴 No hay citas confirmadas pendientes de completar`);
    }

    // 2. Citas programadas (scheduled) anteriores a hoy → cancelled
    const scheduledAppointments = await Appointment.findAll({
      where: {
        status: "scheduled",
        startTime: { [Op.lt]: today }
      }
    });

    if (scheduledAppointments.length > 0) {
      const appointmentIds = scheduledAppointments.map(a => a.id);
      await Appointment.update(
        { status: "cancelled" },
        { where: { id: { [Op.in]: appointmentIds } } }
      );
      logger.info(`${LOG_PREFIX} ❌ ${scheduledAppointments.length} citas programadas marcadas como canceladas`);
    } else {
      logger.info(`${LOG_PREFIX} 😴 No hay citas programadas pendientes de cancelar`);
    }

    // 3. También cancelar citas de hoy que ya pasaron (más de 2 horas de la hora de inicio)
    const twoHoursAgo = new Date();
    twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

    const todayAppointments = await Appointment.findAll({
      where: {
        status: "scheduled",
        startTime: {
          [Op.lt]: twoHoursAgo,
          [Op.gte]: today
        }
      }
    });

    if (todayAppointments.length > 0) {
      const appointmentIds = todayAppointments.map(a => a.id);
      await Appointment.update(
        { status: "cancelled" },
        { where: { id: { [Op.in]: appointmentIds } } }
      );
      logger.info(`${LOG_PREFIX} ⏰ ${todayAppointments.length} citas de hoy (ya pasadas) marcadas como canceladas`);
    }

    logger.info(`${LOG_PREFIX} 🎉 Limpieza completada`);

  } catch (error: any) {
    logger.error(`${LOG_PREFIX} ❌ Error en scheduler de limpieza de citas: ${error.message}`);
  } finally {
    isAppointmentCleanupRunning = false;
  }
}

/**
 * Calcula milisegundos hasta la próxima ejecución (1:00 AM)
 */
function getMillisecondsUntilNextExecution(hour: number = 1, minute: number = 0): number {
  const now = new Date();
  const next = new Date(now);

  next.setHours(hour, minute, 0, 0);

  // Si ya pasó la hora de hoy, programar para mañana
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next.getTime() - now.getTime();
}

/**
 * Inicia el scheduler de limpieza de citas
 * Se debe llamar desde worker.ts
 */
export function startAppointmentCleanupScheduler(): void {
  logger.info(`${LOG_PREFIX} 🚀 Iniciando scheduler de limpieza de citas...`);

  // Primera ejecución: esperar hasta las 1:00 AM
  const initialDelay = getMillisecondsUntilNextExecution(1, 0);

  logger.info(`${LOG_PREFIX} ⏰ Primera ejecución programada en ${Math.round(initialDelay / 1000 / 60)} minutos`);

  setTimeout(() => {
    // Ejecutar inmediatamente la primera vez
    appointmentCleanup();

    // Luego ejecutar cada 24 horas (1 vez al día)
    const intervalMs = 24 * 60 * 60 * 1000; // 24 horas

    setInterval(() => {
      appointmentCleanup();
    }, intervalMs);

    logger.info(`${LOG_PREFIX} ✅ Scheduler configurado para ejecutar daily a la 1:00 AM`);
  }, initialDelay);

  // Cleanup en cierre graceful
  process.on("SIGTERM", () => {
    logger.info(`${LOG_PREFIX} 🔄 Cerrando scheduler...`);
  });

  process.on("SIGINT", () => {
    logger.info(`${LOG_PREFIX} 🔄 Cerrando scheduler...`);
  });
}
