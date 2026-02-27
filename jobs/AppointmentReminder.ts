import { Job } from "bull";
import logger, { logError, logInfo, logWarn, logDebug } from "../utils/logger";
import Appointment from "../models/Appointments/Appointment";
import ReminderTemplate from "../models/Appointments/ReminderTemplate";
import Contact from "../models/Contact";
import Whatsapp from "../models/Whatsapp";
import User from "../models/User";
import AppointmentService from "../models/AppointmentService";
import CampaignSetting from "../models/CampaignSetting";
import moment from "moment";
import { add } from "../queues";

interface AppointmentReminderData {
  appointmentId: number;
  companyId: number;
  type: 'confirm' | 'reminder';
}

// Función para procesar variables en el mensaje
function getProcessedMessage(
  msg: string,
  contact: any,
  appointment: any,
  user?: any,
  service?: any
): string {
  let finalMessage = msg;

  // Variables del contacto
  if (finalMessage.includes("{{clientName}}") || finalMessage.includes("{clientName}")) {
    finalMessage = finalMessage.replace(/\{\{clientName\}\}/g, contact?.name || "Cliente");
    finalMessage = finalMessage.replace(/\{clientName\}/g, contact?.name || "Cliente");
  }
  if (finalMessage.includes("{{email}}") || finalMessage.includes("{email}")) {
    finalMessage = finalMessage.replace(/\{\{email\}\}/g, contact?.email || "");
    finalMessage = finalMessage.replace(/\{email\}/g, contact?.email || "");
  }
  if (finalMessage.includes("{{phone}}") || finalMessage.includes("{phone}")) {
    finalMessage = finalMessage.replace(/\{\{phone\}\}/g, contact?.number || "");
    finalMessage = finalMessage.replace(/\{phone\}/g, contact?.number || "");
  }

  // Variables de la cita
  if (finalMessage.includes("{{date}}") || finalMessage.includes("{date}")) {
    const dateStr = moment(appointment?.startTime).format("DD/MM/YYYY");
    finalMessage = finalMessage.replace(/\{\{date\}\}/g, dateStr);
    finalMessage = finalMessage.replace(/\{date\}/g, dateStr);
  }
  if (finalMessage.includes("{{time}}") || finalMessage.includes("{time}")) {
    const timeStr = moment(appointment?.startTime).format("HH:mm");
    finalMessage = finalMessage.replace(/\{\{time\}\}/g, timeStr);
    finalMessage = finalMessage.replace(/\{time\}/g, timeStr);
  }

  // Variables del agente/usuario
  if (finalMessage.includes("{{agent}}") || finalMessage.includes("{agent}")) {
    finalMessage = finalMessage.replace(/\{\{agent\}\}/g, user?.name || "");
    finalMessage = finalMessage.replace(/\{agent\}/g, user?.name || "");
  }

  // Variables del servicio
  if (finalMessage.includes("{{service}}") || finalMessage.includes("{service}")) {
    finalMessage = finalMessage.replace(/\{\{service\}\}/g, service?.name || "");
    finalMessage = finalMessage.replace(/\{service\}/g, service?.name || "");
  }

  return finalMessage;
}

// Función para verificar horarios permitidos
const checkerWeek = async (companyId: number) => {
  const sab = moment().day() === 6;
  const dom = moment().day() === 0;

  const sabado = await CampaignSetting.findOne({
    where: { key: "sabado", companyId }
  });

  const domingo = await CampaignSetting.findOne({
    where: { key: "domingo", companyId }
  });

  if (sabado?.value === "false" && sab) {
    return true; // Pausar
  }

  if (domingo?.value === "false" && dom) {
    return true; // Pausar
  }

  return false;
};

const checkTime = async (companyId: number) => {
  const startHour = await CampaignSetting.findOne({
    where: { key: "startHour", companyId }
  });

  const endHour = await CampaignSetting.findOne({
    where: { key: "endHour", companyId }
  });

  if (!startHour || !endHour) {
    logWarn(`[APPT-REMINDER] Horarios no configurados para empresa ${companyId}`);
    return true; // Permitir si no hay configuración
  }

  const hour = startHour.value as unknown as number;
  const endHours = endHour.value as unknown as number;
  const timeNow = moment().format("HH:mm") as unknown as number;

  if (timeNow <= endHours && timeNow >= hour) {
    return true;
  }

  logInfo(
    `[APPT-REMINDER] Envio inicia as ${hour} e termina as ${endHours}, hora atual ${timeNow}`
  );

  return false;
};

async function getAppointmentWithDetails(appointmentId: number) {
  return await Appointment.findOne({
    where: { id: appointmentId },
    include: [
      {
        model: Contact,
        as: "contact",
        attributes: ["id", "name", "number", "email", "companyId"]
      },
      {
        model: ReminderTemplate,
        as: "reminderTemplate"
      },
      {
        model: User,
        as: "assignedUser",
        attributes: ["id", "name", "email"]
      },
      {
        model: AppointmentService,
        as: "service",
        attributes: ["id", "name", "duration"]
      }
    ]
  });
}

export default async function handle(job: Job<AppointmentReminderData>): Promise<void> {
  const { appointmentId, companyId, type } = job.data;
  logInfo(`📥 [APPT-REMINDER] Procesando recordatorio tipo=${type} para cita ID=${appointmentId}, empresa=${companyId}`);

  if (!companyId) {
    logError(`❌ [APPT-REMINDER] CompanyId es undefined para cita ID=${appointmentId}`);
    throw new Error(`CompanyId es undefined para cita ID=${appointmentId}`);
  }

  try {
    // Obtener la cita con todos los detalles
    const appointment = await getAppointmentWithDetails(appointmentId);

    if (!appointment) {
      logWarn(`❌ [APPT-REMINDER] Cita ID=${appointmentId} no encontrada`);
      return;
    }

    // DEBUG: Verificar company IDs
    logInfo(`[APPT-REMINDER] DEBUG - Appointment companyId: ${appointment.companyId}`);
    logInfo(`[APPT-REMINDER] DEBUG - Contact companyId: ${appointment.contact?.companyId}`);
    const companyMatch = appointment.companyId === appointment.contact?.companyId;
    logInfo(`[APPT-REMINDER] DEBUG - Company IDs match: ${companyMatch}`);

    // Check company consistency
    if (!companyMatch) {
      logError(`❌ [APPT-REMINDER] Company ID mismatch for appointment ${appointmentId}: appointment=${appointment.companyId}, contact=${appointment.contact?.companyId}`);
      throw new Error('Company ID mismatch - contact from different company');
    }

    // Verificar que la cita no haya sido cancelada
    if (appointment.status === 'cancelled') {
      logInfo(`ℹ️ [APPT-REMINDER] Cita ID=${appointmentId} está cancelada, omitiendo recordatorio`);
      return;
    }

    // Verificar que tenga plantilla de recordatorio
    if (!appointment.reminderTemplate) {
      logWarn(`⚠️ [APPT-REMINDER] Cita ID=${appointmentId} no tiene plantilla de recordatorio asignada`);
      return;
    }

    // Verificar que tenga contacto
    if (!appointment.contact) {
      logWarn(`⚠️ [APPT-REMINDER] Cita ID=${appointmentId} no tiene contacto asignado`);
      return;
    }

    // Verificar horarios permitidos
    const isTimeAllowed = await checkTime(companyId);
    const isWeekAllowed = !(await checkerWeek(companyId));

    if (!isTimeAllowed || !isWeekAllowed) {
      logInfo(`📵 [APPT-REMINDER] Fora do horário permitido para cita ID=${appointmentId}`);
      logInfo(`⏰ [APPT-REMINDER] Reagendando para dentro de 30 minutos...`);

      const error = new Error("Fora do horário permitido - reagendando em 30 minutos");
      (error as any).delay = 30 * 60 * 1000;
      throw error;
    }

    // Obtener WhatsApp disponible para la empresa
    const whatsapp = await Whatsapp.findOne({
      where: {
        companyId,
        status: "CONNECTED"
      },
      attributes: ["id", "name", "status"]
    });

    if (!whatsapp) {
      logWarn(`⚠️ [APPT-REMINDER] No hay WhatsApp conectado para empresa ${companyId}`);
      const error = new Error("WhatsApp no conectado - reagendando en 5 minutos");
      (error as any).delay = 5 * 60 * 1000;
      throw error;
    }

    logInfo(`✅ [APPT-REMINDER] Cita ID=${appointmentId} lista para enviar recordatorio`);

    // Determinar qué mensaje usar según el tipo
    const template = appointment.reminderTemplate;
    let messageToSend = '';

    if (type === 'confirm') {
      // Mensaje de confirmación
      messageToSend = template.messageConfirm || '';
      logInfo(`📩 [APPT-REMINDER] Usando mensaje de confirmación`);
    } else {
      // Mensaje de recordatorio (cuando ya confirmó)
      messageToSend = template.messageReminder || '';
      logInfo(`✅ [APPT-REMINDER] Usando mensaje de recordatorio`);
    }

    if (!messageToSend) {
      logWarn(`⚠️ [APPT-REMINDER] Plantilla no tiene mensaje para tipo=${type}`);
      return;
    }

    // Procesar el mensaje con variables
    const processedMessage = getProcessedMessage(
      messageToSend,
      appointment.contact,
      appointment,
      appointment.assignedUser,
      appointment.service
    );

    logInfo(`📤 [APPT-REMINDER] Enviando job al backend principal para contacto: ${appointment.contact.name}`);

    // Crear data para el backend
    const reminderData = {
      appointmentId: appointment.id,
      companyId: appointment.companyId,
      whatsappId: whatsapp.id,
      contact: {
        id: appointment.contact.id,
        name: appointment.contact.name,
        number: appointment.contact.number,
        email: appointment.contact.email,
        companyId: appointment.contact.companyId
      },
      body: processedMessage,
      type: type,
      templateId: template.id
    };

    // Enviar al backend principal para procesar el envío real
    await add("SendAppointmentReminder",
      { reminder: reminderData },
      {
        priority: 1,
        removeOnComplete: { age: 60 * 60, count: 100 },
        removeOnFail: { age: 60 * 60, count: 50 }
      }
    );

    // Actualizar estado de la cita
    if (type === 'confirm') {
      await appointment.update({ confirmationSent: true });
      logInfo(`✅ [APPT-REMINDER] Cita ID=${appointmentId} marcada como confirmationSent=true`);
    } else {
      await appointment.update({ reminderSent: true });
      logInfo(`✅ [APPT-REMINDER] Cita ID=${appointmentId} marcada como reminderSent=true`);
    }

    logInfo(`✅ [APPT-REMINDER] Recordatorio tipo=${type} para cita ID=${appointmentId} procesado exitosamente`);

  } catch (error: any) {
    logError(`❌ [APPT-REMINDER] Error procesando recordatorio para cita ID=${appointmentId}: ${error.message}`);
    throw error;
  }
}

export const key = "AppointmentReminder";

