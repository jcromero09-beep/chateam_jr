import { Job } from "bull";
import logger, { logError, logInfo, logWarn, logDebug } from "../utils/logger";
import Schedule from "../models/Schedule";
import Contact from "../models/Contact";
import Whatsapp from "../models/Whatsapp";
import User from "../models/User";
import Queue from "../models/Queue";
import CampaignSetting from "../models/CampaignSetting";
import { getIO } from "../libs/socket";
import moment from "moment";
import { isEmpty, isNil } from "lodash";
import { add } from "../queues";

interface ScheduledMessageData {
  id: number;
  companyId: number;
}

// Función para procesar variables en el mensaje
function getProcessedMessage(msg: string, contact: any, user?: any): string {
  let finalMessage = msg;

  if (finalMessage.includes("{nome}") || finalMessage.includes("{name}")) {
    finalMessage = finalMessage.replace(/{nome}/g, contact.name);
    finalMessage = finalMessage.replace(/{name}/g, contact.name);
  }
  if (finalMessage.includes("{email}")) {
    finalMessage = finalMessage.replace(/{email}/g, contact.email || "");
  }
  if (finalMessage.includes("{numero}") || finalMessage.includes("{number}")) {
    finalMessage = finalMessage.replace(/{numero}/g, contact.number);
    finalMessage = finalMessage.replace(/{number}/g, contact.number);
  }

  // Variables adicionales para mensajes programados
  if (finalMessage.includes("{usuario}") && user) {
    finalMessage = finalMessage.replace(/{usuario}/g, user.name);
  }
  if (finalMessage.includes("{data}")) {
    finalMessage = finalMessage.replace(/{data}/g, moment().format("DD/MM/YYYY"));
  }
  if (finalMessage.includes("{hora}")) {
    finalMessage = finalMessage.replace(/{hora}/g, moment().format("HH:mm"));
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
    where: {
      key: "startHour",
      companyId
    }
  });

  const endHour = await CampaignSetting.findOne({
    where: {
      key: "endHour",
      companyId
    }
  });

  if (!startHour || !endHour) {
    logWarn(`[SCHEDULED] Horarios no configurados para empresa ${companyId}`);
    return true; // Permitir si no hay configuración
  }

  const hour = startHour.value as unknown as number;
  const endHours = endHour.value as unknown as number;
  const timeNow = moment().format("HH:mm") as unknown as number;

  if (timeNow <= endHours && timeNow >= hour) {
    return true;
  }

  logInfo(
    `[SCHEDULED] Envio inicia as ${hour} e termina as ${endHours}, hora atual ${timeNow} não está dentro do horário`
  );

  return false;
};

// Función para calcular el próximo envío basado en intervalo
function calculateNextSendTime(currentSendAt: Date, intervalo: number, valorIntervalo: number, tipoDias: number): Date {
  const nextSendAt = moment(currentSendAt);

  switch (intervalo) {
    case 1: // Días
      nextSendAt.add(valorIntervalo, 'days');
      break;
    case 2: // Semanas
      nextSendAt.add(valorIntervalo, 'weeks');
      break;
    case 3: // Meses
      nextSendAt.add(valorIntervalo, 'months');
      break;
    case 4: // Minutos
      nextSendAt.add(valorIntervalo, 'minutes');
      break;
    default:
      nextSendAt.add(1, 'day'); // Default: 1 día
  }

  // Ajustar por días laborables si es necesario
  if (tipoDias === 5) { // Enviar un día laborable antes
    while (nextSendAt.day() === 0 || nextSendAt.day() === 6) {
      nextSendAt.subtract(1, 'day');
    }
  } else if (tipoDias === 6) { // Enviar un día laborable después
    while (nextSendAt.day() === 0 || nextSendAt.day() === 6) {
      nextSendAt.add(1, 'day');
    }
  }

  return nextSendAt.toDate();
}

async function getSchedule(id: number) {
  return await Schedule.findOne({
    where: { id },
    include: [
      {
        model: Contact,
        as: "contact",
        attributes: ["id", "name", "number", "email"]
      },
      {
        model: Whatsapp,
        as: "whatsapp",
        attributes: ["id", "name", "status", "channel"]
      },
      {
        model: User,
        as: "user",
        attributes: ["id", "name"]
      },
      {
        model: User,
        as: "ticketUser",
        attributes: ["id", "name"]
      },
      {
        model: Queue,
        as: "queue",
        attributes: ["id", "name"]
      }
    ]
  });
}

export default async function handle(job: Job<ScheduledMessageData>): Promise<void> {
  const { id, companyId } = job.data;
  logInfo(`📥 [SCHEDULED] Procesando mensaje programado ID=${id} para empresa=${companyId}`);

  if (!companyId) {
    logError(`❌ [SCHEDULED] CompanyId es undefined para mensaje ID=${id}`);
    throw new Error(`CompanyId es undefined para mensaje ID=${id}`);
  }

  try {
    // Obtener el mensaje programado
    const schedule = await getSchedule(id);

    if (!schedule) {
      logWarn(`❌ [SCHEDULED] Mensaje programado ID=${id} no encontrado`);
      return;
    }

    // Verificar si ya fue enviado
    if (schedule.sentAt) {
      logInfo(`ℹ️ [SCHEDULED] Mensaje ID=${id} ya fue enviado previamente`);
      return;
    }

    // Verificar si la fecha de envío ya llegó (NO enviar antes de tiempo)
    const now = moment();
    const sendAt = moment(schedule.sendAt);
    const diffMinutes = sendAt.diff(now, 'minutes');

    // Si faltan más de 1 minuto, NO enviar todavía
    if (diffMinutes > 1) {
      logInfo(`⏰ [SCHEDULED] Mensaje ID=${id} aún no es hora. Programado para: ${sendAt.format('DD/MM/YYYY HH:mm')}, faltan ${diffMinutes} minutos`);

      // Reagendar para el momento correcto
      const delay = sendAt.diff(now, 'milliseconds');
      if (delay > 0) {
        await add("ScheduledMessages", { id, companyId }, { delay });
        logInfo(`🔄 [SCHEDULED] Mensaje ID=${id} reagendado para ${sendAt.format('DD/MM HH:mm')} (delay: ${Math.round(delay/60000)}min)`);
      }
      return;
    }

    // Solo enviar si ya llegó la hora (diferencia <= 1 minuto)
    logInfo(`⏰ [SCHEDULED] Mensaje ID=${id} es hora de enviar. Programado: ${sendAt.format('DD/MM/YYYY HH:mm')}, actual: ${now.format('DD/MM/YYYY HH:mm')}, diff: ${diffMinutes}min`)

    // Solo verificar horarios si el tiempo está dentro del rango apropiado
    const isTimeAllowed = await checkTime(companyId);
    const isWeekAllowed = !(await checkerWeek(companyId));

    if (!isTimeAllowed || !isWeekAllowed) {
      logInfo(`📵 [SCHEDULED] Fora do horário permitido para mensaje ID=${id}. TimeAllowed: ${isTimeAllowed}, WeekAllowed: ${isWeekAllowed}`);
      logInfo(`⏰ [SCHEDULED] Reagendando mensaje para dentro de 30 minutos...`);

      const error = new Error("Fora do horário permitido - reagendando em 30 minutos");
      (error as any).delay = 30 * 60 * 1000; // 30 minutos
      throw error;
    }

    // Verificar que el whatsapp esté disponible
    if (!schedule.whatsapp || schedule.whatsapp.status !== "CONNECTED") {
      logWarn(`⚠️ [SCHEDULED] Whatsapp ID=${schedule.whatsappId} no está conectado para mensaje ID=${id}`);

      // Reagendar para dentro de 5 minutos
      const error = new Error("WhatsApp no conectado - reagendando en 5 minutos");
      (error as any).delay = 5 * 60 * 1000;
      throw error;
    }

    logInfo(`✅ [SCHEDULED] Mensaje ID=${id} listo para enviar`);

    // Procesar el mensaje con variables
    let processedMessage = getProcessedMessage(schedule.body, schedule.contact, schedule.user);

    logInfo(`📤 [SCHEDULED] Enviando job al backend principal para contacto: ${schedule.contact.name}`);

    // PRIMERO enviar el mensaje
    logInfo(`📤 [SCHEDULED] Enviando mensaje al backend...`);
    await add("SendScheduledMessages",
      {
        whatsappId: schedule.whatsappId,
        data: {
          body: processedMessage,
          number: schedule.contact.number,
          mediaPath: schedule.mediaPath,
          mediaName: schedule.mediaName,
          companyId: schedule.companyId
        },
        meta: {
          scheduleId: schedule.id,
          ticketId: schedule.ticketId,
          openTicket: schedule.openTicket,
          statusTicket: schedule.statusTicket,
          ticketUserId: schedule.ticketUserId,
          queueId: schedule.queueId,
          contadorEnvio: schedule.contadorEnvio || 0,
          assinar: schedule.assinar
        }
      },
      {
        priority: 1,
        removeOnComplete: { age: 60 * 60, count: 100 },
        removeOnFail: { age: 60 * 60, count: 50 }
      }
    );

    // DESPUÉS del envío exitoso, incrementar contador y verificar recurrencia
    const currentContador = schedule.contadorEnvio || 0;
    const newContadorEnvio = currentContador + 1;

    logInfo(`📊 [SCHEDULED] Mensaje enviado exitosamente. Contador: ${currentContador} → ${newContadorEnvio}/${schedule.enviarQuantasVezes}`);

    // Verificar si debe continuar la recurrencia
    const shouldContinueRecurrence = newContadorEnvio < schedule.enviarQuantasVezes &&
                                   schedule.valorIntervalo > 0;

    if (shouldContinueRecurrence) {
      // Calcular próximo envío
      const nextSendAt = calculateNextSendTime(
        schedule.sendAt,
        schedule.intervalo,
        schedule.valorIntervalo,
        schedule.tipoDias
      );

      // Actualizar el MISMO registro para el próximo envío
      await schedule.update({
        sendAt: nextSendAt,
        status: "PENDENTE",
        contadorEnvio: newContadorEnvio,
        sentAt: null // Mantener null hasta el último envío
      });

      logInfo(`🔄 [SCHEDULED] Próximo envío programado para: ${moment(nextSendAt).format('DD/MM/YYYY HH:mm')} (${newContadorEnvio}/${schedule.enviarQuantasVezes})`);

    } else {
      // Último envío - marcar como completado
      await schedule.update({
        sentAt: new Date(),
        status: "ENVIADA",
        contadorEnvio: newContadorEnvio
      });

      logInfo(`✅ [SCHEDULED] Serie completada: ${newContadorEnvio}/${schedule.enviarQuantasVezes} envíos - marcando como ENVIADA`);
    }

    // TODO: Emitir evento de actualización para el frontend
    // El worker no tiene Socket IO configurado, solo el backend principal
    // const io = getIO();
    // io.of(String(companyId)).emit(`company${companyId}-schedule`, {
    //   action: "update",
    //   schedule: await getSchedule(id)
    // });

    logInfo(`📡 [SCHEDULED] Evento Socket omitido - worker no tiene Socket IO`);

    logInfo(`✅ [SCHEDULED] Mensaje programado ID=${id} procesado exitosamente para ${schedule.contact.name}`);

  } catch (error) {
    logError(`❌ [SCHEDULED] Error procesando mensaje programado ID=${id}: ${error.message}`);

    // Solo marcar como error si es un error ANTES del envío del mensaje
    // Errores después del envío (como Socket IO) no deben afectar la recurrencia
    if (!error.delay && !error.message.includes("Socket IO")) {
      try {
        const schedule = await Schedule.findByPk(id);
        if (schedule) {
          await schedule.update({
            status: "ERRO",
            sentAt: new Date() // Marcar como procesado para evitar reintentos infinitos
          });
        }
        logError(`❌ [SCHEDULED] Mensaje ID=${id} marcado como ERRO debido a: ${error.message}`);
      } catch (updateError) {
        logError(`❌ [SCHEDULED] Error actualizando status de error: ${updateError.message}`);
      }
    } else {
      logWarn(`⚠️ [SCHEDULED] Error no crítico ID=${id} (no afecta recurrencia): ${error.message}`);
    }

    // Solo re-lanzar error si es crítico
    if (!error.message.includes("Socket IO")) {
      throw error;
    }
  }
}


