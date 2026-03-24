import Appointment from "../../models/Appointments/Appointment";
import AppointmentService from "../../models/AppointmentService";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import logger from "../../utils/logger";
import AvailabilityService from "../AppointmentServices/AvailabilityService";
import AppointmentContextStore from "./AppointmentContextStore";

/**
 * Appointment Agent — Gestión de Citas
 *
 * Este agente maneja:
 * - Detectar intención de agendar/reagendar/cancelar citas
 * - Buscar citas existentes del contacto
 * - Crear nuevas citas
 * - Reagendar citas existentes
 * - Cancelar citas
 * - Confirmar al cliente
 *
 * Se integra con el SupervisorService para cuando detecta intención de cita
 */

export interface AppointmentContext {
  ticketId?: number;
  contactId?: number;
  companyId: number;
}

export interface AppointmentResponse {
  message: string;
  action: "create" | "reschedule" | "cancel" | "list" | "confirm" | "none";
  appointmentId?: number;
  confidence: number;
  appointmentDetails?: {
    id: number;
    title: string;
    startTime: Date;
    endTime: Date;
    status: string;
  }[];
}

// Palabras clave para detectar intención de citas
const INTENT_KEYWORDS = {
  create: [
    "agendar", "agenda", "cita", "citar", "turno", "reservar", "reservación",
    "quiero una cita", "necesito una cita", "sacar cita", "separar cita",
    "programar cita", "reservar hora", "reservar turno", "disponible"
  ],
  reschedule: [
    "reagendar", "cambiar", "modificar", "mover", "reprogramar",
    "cambiar cita", "cambiar hora", "otra fecha", "otro día", "otro horario"
  ],
  cancel: [
    "cancelar", "anular", "eliminar", "borrar", "quitar",
    "cancelar cita", "anular cita", "eliminar cita", "no puedo", "ya no puedo"
  ],
  list: [
    "mis citas", "ver citas", "tengo cita", "cuándo es mi cita",
    "mi turno", "mi horario", "próxima cita"
  ],
  confirm: [
    "confirmar", "confirmo", "si", "sí", "afirmativo", "dale", "ok",
    "confirmar cita", "si quiero", "si, quiero"
  ]
};

/**
 * Detecta si el mensaje es una confirmación simple de cita
 * (sí, ok, dale, confirmo, etc.)
 */
function detectSimpleConfirmation(message: string): boolean {
  const lowerMessage = message.toLowerCase().trim();
  const confirmPatterns = [
    /^sí$/i, /^si$/i, /^si,$/i, /^sí,$/i,
    /^ok$/i, /^oke$/i, /^okay$/i,
    /^dale$/i, /^dale,$/i,
    /^confirmo$/i, /^confirmar$/i,
    /^afirmativo$/i, /^perfecto$/i,
    /^si,?\s*(confirmo|quiero|esta bien|está bien)/i,
    /^(sí|si)\s+(confirmo|quiero|perfecto|esta bien|está bien)/i,
    /^yes$/i, /^yep$/i, /^yup$/i
  ];

  return confirmPatterns.some(pattern => pattern.test(lowerMessage));
}

/**
 * Detecta si el mensaje es una negación simple de cita
 * (no, cancelar, etc.)
 */
function detectSimpleNegation(message: string): boolean {
  const lowerMessage = message.toLowerCase().trim();
  const negatePatterns = [
    /^no$/i, /^no,$/i,
    /^cancelar$/i, /^cancelo$/i, /^cancelar cita$/i,
    /^anular$/i, /^anulo$/i,
    /^mejor no$/i, /^prefiero no$/i,
    /^no puedo$/i, /^ya no puedo$/i,
    /^cambié de opinión$/i, /^cambie de opinion$/i
  ];

  return negatePatterns.some(pattern => pattern.test(lowerMessage));
}

/**
 * Detecta la intención de cita en el mensaje
 */
function detectAppointmentIntent(message: string): string {
  const lowerMessage = message.toLowerCase();

  // PRIMERO: Verificar confirmación/negación simple
  if (detectSimpleConfirmation(message)) {
    return "confirm";
  }
  if (detectSimpleNegation(message)) {
    return "cancel";
  }

  // Luego verificar otras intenciones
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerMessage.includes(keyword)) {
        return intent;
      }
    }
  }

  return "none";
}

/**
 * Extrae fecha y hora del mensaje con NLP básico
 */
function extractDateTime(message: string): { date?: Date; time?: string; extractedDate?: string; extractedTime?: string } | null {
  const lowerMessage = message.toLowerCase();
  const now = new Date();

  // Mapeo de días de la semana
  const dayMap: Record<string, number> = {
    'domingo': 0, 'lunes': 1, 'martes': 2, 'miércoles': 3, 'jueves': 4,
    'viernes': 5, 'sábado': 6, 'sabado': 6
  };

  // Mapeo de meses
  const monthMap: Record<string, number> = {
    'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3, 'mayo': 4, 'junio': 5,
    'julio': 6, 'agosto': 7, 'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
  };

  let extractedDate: Date | undefined;
  let extractedTime: string | undefined;

  // ===== EXTRAER FECHA =====

  // 1. "hoy"
  if (/\bhoy\b/.test(lowerMessage)) {
    extractedDate = new Date(now);
  }

  // 2. "mañana" (manhana sin tilde)
  else if (/\bmañana\b|\bmanhana\b/.test(lowerMessage)) {
    extractedDate = new Date(now);
    extractedDate.setDate(extractedDate.getDate() + 1);
  }

  // 3. "el lunes/martes/etc." - próximo día de la semana
  else {
    const dayMatch = lowerMessage.match(/\b(lunes|martes|miércoles|jueves|viernes|sábado|domingo|sabado)\b/i);
    if (dayMatch) {
      const targetDay = dayMap[dayMatch[1].toLowerCase()];
      if (targetDay !== undefined) {
        extractedDate = new Date(now);
        const currentDay = extractedDate.getDay();
        let daysUntil = targetDay - currentDay;
        if (daysUntil <= 0) daysUntil += 7; // Si ya pasó esta semana, ir a la próxima
        extractedDate.setDate(extractedDate.getDate() + daysUntil);
      }
    }

    // 4. "el 15 de marzo", "15 de marzo"
    const dateNumMatch = lowerMessage.match(/(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/);
    if (dateNumMatch && !extractedDate) {
      const day = parseInt(dateNumMatch[1]);
      const month = monthMap[dateNumMatch[2].toLowerCase()];
      if (month !== undefined) {
        extractedDate = new Date(now.getFullYear(), month, day);
        // Si la fecha ya pasó, usar próximo año
        if (extractedDate < now) {
          extractedDate.setFullYear(extractedDate.getFullYear() + 1);
        }
      }
    }

    // 5. "15/03" o "15/03/2026"
    const slashMatch = lowerMessage.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (slashMatch && !extractedDate) {
      const day = parseInt(slashMatch[1]);
      const month = parseInt(slashMatch[2]) - 1;
      let year = slashMatch[3] ? parseInt(slashMatch[3]) : now.getFullYear();
      if (year < 100) year += 2000;
      extractedDate = new Date(year, month, day);
    }

    // 6. "2026-03-15" formato ISO
    const isoMatch = lowerMessage.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch && !extractedDate) {
      extractedDate = new Date(
        parseInt(isoMatch[1]),
        parseInt(isoMatch[2]) - 1,
        parseInt(isoMatch[3])
      );
    }
  }

  // ===== EXTRAER HORA =====

  // 1. "a las 3", "a las 3pm", "a las 15:00"
  let hourMatch = lowerMessage.match(/(?:a\s+)?las\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (hourMatch) {
    let hour = parseInt(hourMatch[1]);
    const minutes = hourMatch[2] ? parseInt(hourMatch[2]) : 0;
    const period = hourMatch[3]?.toLowerCase();

    // Ajustar AM/PM
    if (period === 'pm' && hour < 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;

    extractedTime = `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  // 2. "3 de la tarde", "10 de la mañana", "8 de la noche"
  if (!extractedTime) {
    const periodMatch = lowerMessage.match(/(\d{1,2})\s*(?:de\s+)?(?:la\s+)?(mañana|tarde|noche)/i);
    if (periodMatch) {
      let hour = parseInt(periodMatch[1]);
      const period = periodMatch[2].toLowerCase();

      if (period === 'tarde' && hour < 12) hour += 12;
      if (period === 'noche' && hour < 12) hour += 12;
      if (period === 'mañana' && hour === 12) hour = 0;

      extractedTime = `${hour.toString().padStart(2, '0')}:00`;
    }
  }

  // 3. Solo número "a las 3" (asumir mañana si es < 7, tarde si >= 7)
  if (!extractedTime) {
    const justNumber = lowerMessage.match(/\ba\s+las\s+(\d{1,2})\b/);
    if (justNumber) {
      let hour = parseInt(justNumber[1]);
      if (hour >= 1 && hour <= 11) {
        extractedTime = `${hour.toString().padStart(2, '0')}:00`;
      }
    }
  }

  // Si se encontró al menos fecha o hora
  if (extractedDate || extractedTime) {
    // Si hay fecha pero no hora, usar hora por defecto 10:00
    if (extractedDate && !extractedTime) {
      extractedTime = "10:00";
    }

    // Si hay hora pero no fecha, usar hoy
    if (!extractedDate) {
      extractedDate = new Date(now);
      // Si la hora ya pasó hoy, usar mañana
      if (extractedTime) {
        const [h, m] = extractedTime.split(':').map(Number);
        const extracted = new Date(now);
        extracted.setHours(h, m, 0, 0);
        if (extracted < now) {
          extractedDate.setDate(extractedDate.getDate() + 1);
        }
      }
    }

    return {
      date: extractedDate,
      time: extractedTime,
      extractedDate: extractedDate?.toISOString(),
      extractedTime
    };
  }

  return null;
}

/**
 * Procesa una solicitud de cita
 */
const processAppointmentRequest = async (
  message: string,
  context: AppointmentContext
): Promise<AppointmentResponse> => {
  const { companyId, contactId, ticketId } = context;

  logger.info(
    `[AppointmentAgent] Procesando solicitud: company=${companyId}, ` +
    `contact=${contactId}, msg="${message.substring(0, 50)}..."`
  );

  // 1. Detectar intención
  const intent = detectAppointmentIntent(message);

  if (intent === "none") {
    return {
      message: "",
      action: "none",
      confidence: 0
    };
  }

  // 2. Obtener información del contacto
  let contact = null;
  if (contactId) {
    contact = await Contact.findByPk(contactId);
  }

  if (!contact && ticketId) {
    const ticket = await Ticket.findByPk(ticketId);
    if (ticket?.contactId) {
      contact = await Contact.findByPk(ticket.contactId);
    }
  }

  if (!contact) {
    return {
      message: "No pude identificar tu información de contacto. ¿Podrías proporcionarme tu nombre?",
      action: "none",
      confidence: 0.9
    };
  }

  // 3. Procesar según la intención
  switch (intent) {
    case "list":
      return await handleListAppointments(contact.id, companyId);

    case "create":
      return await handleCreateAppointment(message, contact.id, companyId, ticketId);

    case "reschedule":
      return await handleRescheduleAppointment(message, contact.id, companyId);

    case "cancel":
      return await handleCancelAppointment(message, contact.id, companyId);

    case "confirm":
      return await handleConfirmAppointment(message, contact.id, companyId, ticketId);

    default:
      return {
        message: "",
        action: "none",
        confidence: 0
      };
  }
};

/**
 * Lista las citas próximas del contacto
 */
async function handleListAppointments(
  contactId: number,
  companyId: number
): Promise<AppointmentResponse> {
  const appointments = await Appointment.findAll({
    where: {
      contactId,
      companyId,
      status: ["scheduled", "confirmed"]
    },
    order: [["startTime", "ASC"]],
    limit: 5
  });

  if (appointments.length === 0) {
    return {
      message: "No tienes citas programadas. ¿Te gustaría agendar una?",
      action: "list",
      confidence: 0.95
    };
  }

  const listText = appointments.map((apt, i) => {
    const date = new Date(apt.startTime);
    const dateStr = date.toLocaleDateString("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit"
    });
    return `${i + 1}. ${apt.title} - ${dateStr}`;
  }).join("\n");

  return {
    message: `Tienes las siguientes citas programadas:\n\n${listText}\n\n¿Necesitas hacer algún cambio?`,
    action: "list",
    confidence: 0.95,
    appointmentDetails: appointments.map(apt => ({
      id: apt.id,
      title: apt.title,
      startTime: apt.startTime,
      endTime: apt.endTime,
      status: apt.status
    }))
  };
}

/**
 * Verifica si hay disponibilidad para una fecha/hora específica
 * Retorna los usuarios disponibles en ese horario
 */
async function checkAvailability(
  companyId: number,
  serviceId: number,
  date: Date,
  time: string
): Promise<{ available: boolean; availableUsers: number; slots: any[] }> {
  try {
    // Obtener los bloques disponibles para esa fecha
    const dateStr = date.toISOString().split('T')[0];
    const blocks = await AvailabilityService.getAvailableBlocksForDate(
      companyId,
      dateStr,
      undefined,
      serviceId
    );

    // Filtrar solo los bloques no reservados
    const availableSlots = blocks.filter(b => !b.isBooked);

    return {
      available: availableSlots.length > 0,
      availableUsers: availableSlots.length,
      slots: availableSlots
    };
  } catch (error: any) {
    logger.error(`[AppointmentAgent] Error consultando disponibilidad: ${error.message}`);
    return { available: false, availableUsers: 0, slots: [] };
  }
}

/**
 * Obtiene los próximos horarios disponibles
 */
async function getNextAvailableSlots(
  companyId: number,
  serviceId: number,
  daysAhead: number = 7
): Promise<string[]> {
  try {
    const now = new Date();
    const startDate = new Date(now);
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + daysAhead);

    const slots = await AvailabilityService.getAvailableSlots({
      companyId,
      serviceId,
      startDate,
      endDate
    });

    // Filtrar solo los disponibles y tomar los primeros 5
    const availableSlots = slots
      .filter(s => s.available)
      .slice(0, 5);

    return availableSlots.map(slot => {
      const date = new Date(slot.start);
      return date.toLocaleDateString("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit"
      });
    });
  } catch (error: any) {
    logger.error(`[AppointmentAgent] Error obteniendo slots disponibles: ${error.message}`);
    return [];
  }
}

/**
 * Crea una nueva cita
 */
async function handleCreateAppointment(
  message: string,
  contactId: number,
  companyId: number,
  ticketId?: number
): Promise<AppointmentResponse> {
  // Extraer fecha/hora del mensaje
  const dateTime = extractDateTime(message);

  // Obtener servicios disponibles
  const services = await AppointmentService.findAll({
    where: { companyId, isActive: true },
    limit: 5
  });

  if (services.length === 0) {
    return {
      message: "No hay servicios disponibles para agendar. ¿Te gustaría que un asesor te contacte?",
      action: "create",
      confidence: 0.8
    };
  }

  const servicesList = services.map((s, i) =>
    `${i + 1}. ${s.name} (${s.duration} min)`
  ).join("\n");

  // Usar el primer servicio por defecto
  const service = services[0];

  // Si no hay fecha específica, mostrar servicios Y pedir fecha
  if (!dateTime) {
    // Obtener próximos horarios disponibles
    const availableSlots = await getNextAvailableSlots(companyId, service.id, 7);
    let availabilityMsg = "";

    if (availableSlots.length > 0) {
      availabilityMsg = `\n\n📅 *Horarios disponibles próximos:*\n${availableSlots.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
    }

    return {
      message: `Perfecto, puedo ayudarte a agendar una cita. ¿Qué servicio necesitas?\n\n${servicesList}${availabilityMsg}\n\nTambién dime qué fecha y horario te gustaría.`,
      action: "create",
      confidence: 0.85
    };
  }

  // ========== VERIFICAR DISPONIBILIDAD ==========
  const targetDate = dateTime.date || new Date();
  const targetTime = dateTime.time || "10:00";

  // Verificar si hay disponibilidad para la fecha/hora solicitada
  const availability = await checkAvailability(companyId, service.id, targetDate, targetTime);

  if (!availability.available) {
    // No hay disponibilidad, mostrar opciones
    const availableSlots = await getNextAvailableSlots(companyId, service.id, 7);
    let optionsMsg = "";

    if (availableSlots.length > 0) {
      optionsMsg = `\n\n📅 *Horarios disponibles:*\n${availableSlots.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
    } else {
      optionsMsg = "\n\nLo sentimos, no hay horarios disponibles en los próximos días.";
    }

    return {
      message: `😔 El horario solicitado (${targetDate.toLocaleDateString("es-ES")} a las ${targetTime}) no está disponible.\n${optionsMsg}\n\n¿Te gustaría elegir uno de estos horarios?`,
      action: "create",
      confidence: 0.9
    };
  }

  // ========== GUARDAR CONTEXTO Y MOSTRAR OPCIONES (SIN CREAR CITA) ==========
  // Obtener slots detallados para guardar en contexto
  const detailedSlots = await getAvailableSlotsForContext(companyId, service.id, 7);

  if (detailedSlots.length === 0) {
    return {
      message: `😔 No hay horarios disponibles en los próximos días.\n\n¿ Te gustaría otra fecha?`,
      action: "create",
      confidence: 0.9
    };
  }

  // Guardar contexto con los slots disponibles
  if (ticketId) {
    await AppointmentContextStore.set({
      ticketId,
      step: 'awaiting_confirmation',
      serviceId: service.id,
      serviceName: service.name,
      contactId,
      lastAction: 'create',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      metadata: { availableSlots: detailedSlots }
    } as any);
  }

  // Mostrar opciones al usuario
  const optionsText = detailedSlots.slice(0, 5).map((s: any, i: number) =>
    `${i + 1}) ${s.formatted}`
  ).join("\n");

  return {
    message: `✅Tengo los siguientes horarios disponibles:\n\n${optionsText}\n\nResponde con el *número* o el *horario* que prefieras para agendar tu cita.`,
    action: "create",
    confidence: 0.95
  };
}

/**
 * Obtiene slots detallados para guardar en contexto
 */
async function getAvailableSlotsForContext(
  companyId: number,
  serviceId: number,
  daysAhead: number = 7
): Promise<any[]> {
  try {
    const now = new Date();
    const startDate = new Date(now);
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + daysAhead);

    const slots = await AvailabilityService.getAvailableSlots({
      companyId,
      serviceId,
      startDate,
      endDate
    });

    return slots
      .filter((s: any) => s.available)
      .slice(0, 10)
      .map((slot: any) => ({
        start: slot.start,
        end: slot.end,
        userId: slot.userId,
        formatted: new Date(slot.start).toLocaleDateString("es-ES", {
          weekday: "long",
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit"
        })
      }));
  } catch (error: any) {
    logger.error(`[AppointmentAgent] Error obteniendo slots para contexto: ${error.message}`);
    return [];
  }
}

/**
 * Reagenda una cita existente
 */
async function handleRescheduleAppointment(
  message: string,
  contactId: number,
  companyId: number
): Promise<AppointmentResponse> {
  // Buscar la próxima cita del contacto
  const appointment = await Appointment.findOne({
    where: {
      contactId,
      companyId,
      status: ["scheduled", "confirmed"]
    },
    order: [["startTime", "ASC"]]
  });

  if (!appointment) {
    return {
      message: "No tienes citas programadas para modificar. ¿Te gustaría agendar una nueva?",
      action: "reschedule",
      confidence: 0.9
    };
  }

  // Extraer nueva fecha/hora
  const dateTime = extractDateTime(message);

  if (!dateTime) {
    return {
      message: `Tu cita actual es el ${new Date(appointment.startTime).toLocaleDateString("es-ES")}. ` +
        `¿Qué fecha y horario prefieres?`,
      action: "reschedule",
      confidence: 0.85,
      appointmentDetails: [{
        id: appointment.id,
        title: appointment.title,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        status: appointment.status
      }]
    };
  }

  // Actualizar la cita
  const newStartTime = dateTime.date || new Date();
  const duration = appointment.duration || 60;
  const newEndTime = new Date(newStartTime.getTime() + duration * 60000);

  await appointment.update({
    startTime: newStartTime,
    endTime: newEndTime,
    status: "scheduled"
  });

  return {
    message: `¡Cita modificada exitosamente! 📅\n\n` +
      `*Servicio:* ${appointment.title}\n` +
      `*Nueva fecha:* ${newStartTime.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}\n` +
      `*Nueva hora:* ${newStartTime.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}\n\n` +
      `¿Confirmas este nuevo horario?`,
    action: "reschedule",
    confidence: 0.9,
    appointmentId: appointment.id,
    appointmentDetails: [{
      id: appointment.id,
      title: appointment.title,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      status: appointment.status
    }]
  };
}

/**
 * Cancela una cita
 */
async function handleCancelAppointment(
  message: string,
  contactId: number,
  companyId: number
): Promise<AppointmentResponse> {
  // Buscar la próxima cita del contacto
  const appointment = await Appointment.findOne({
    where: {
      contactId,
      companyId,
      status: ["scheduled", "confirmed"]
    },
    order: [["startTime", "ASC"]]
  });

  if (!appointment) {
    return {
      message: "No tienes citas programadas para cancelar.",
      action: "cancel",
      confidence: 0.9
    };
  }

  // Cancelar la cita
  await appointment.update({ status: "cancelled" });

  // 🆕 Limpiar contexto de cita después de cancelar
  if (appointment.ticketId) {
    await AppointmentContextStore.delete(appointment.ticketId);
    logger.info(`[AppointmentAgent] Contexto limpiado para ticket ${appointment.ticketId} tras cancelación`);
  }

  return {
    message: `Tu cita de "${appointment.title}" para el ${new Date(appointment.startTime).toLocaleDateString("es-ES")} ha sido cancelada.\n\n` +
      `¿Te gustaría agendar una nueva?`,
    action: "cancel",
    confidence: 0.95,
    appointmentId: appointment.id
  };
}

/**
 * Confirma una cita - puede confirmar una existente O crear una nueva
 */
async function handleConfirmAppointment(
  message: string,
  contactId: number,
  companyId: number,
  ticketId?: number
): Promise<AppointmentResponse> {
  logger.info(`[AppointmentAgent] handleConfirmAppointment: ticketId=${ticketId}, msg="${message.substring(0, 30)}..."`);

  // ===== CASO 1: Ticket con contexto - CREAR LA CITA =====
  if (ticketId) {
    const context = await AppointmentContextStore.get(ticketId);

    if (context && context.step === 'awaiting_confirmation') {
      logger.info(`[AppointmentAgent] Contexto encontrado para ticket ${ticketId}: ${JSON.stringify(context)}`);

      // Extraer la elección del usuario (número, horario, o "sí"/"confirmo")
      const lowerMsg = message.toLowerCase().trim();

      // Obtener los slots del metadata del contexto
      const slots = (context as any).metadata?.availableSlots || [];
      let selectedSlot: any = null;

      // Extraer selección del usuario
      // "1", "el primero", "9am", "sí", "confirmo"
      const numMatch = lowerMsg.match(/^(\d+)$/);
      if (numMatch) {
        const index = parseInt(numMatch[1]) - 1;
        selectedSlot = slots[index];
      } else if (lowerMsg.includes('primero') || lowerMsg.includes('1)')) {
        selectedSlot = slots[0];
      } else if (lowerMsg.includes('segundo') || lowerMsg.includes('2)')) {
        selectedSlot = slots[1];
      } else if (lowerMsg.includes('tercero') || lowerMsg.includes('3)')) {
        selectedSlot = slots[2];
      } else {
        // Buscar por horario mencionado
        for (const slot of slots) {
          if (lowerMsg.includes(slot.formatted?.toLowerCase()) ||
              lowerMsg.includes(new Date(slot.start).getHours().toString())) {
            selectedSlot = slot;
            break;
          }
        }
      }

      // Si no se encontró selección, usar el primer slot por defecto
      if (!selectedSlot && slots.length > 0) {
        selectedSlot = slots[0];
      }

      if (!selectedSlot) {
        // No hay slots disponibles, pedir selección
        const optionsText = slots.slice(0, 5).map((s: any, i: number) =>
          `${i + 1}) ${s.formatted}`
        ).join("\n");

        return {
          message: `No entendí tu respuesta. Por favor responde con el *número* del horario que prefieras:\n\n${optionsText}`,
          action: "confirm",
          confidence: 0.8
        };
      }

      // ===== CREAR LA CITA =====
      const service = await AppointmentService.findByPk(context.serviceId!);
      if (!service) {
        return {
          message: "Error: No se encontró el servicio. Por favor intenta de nuevo.",
          action: "confirm",
          confidence: 0.5
        };
      }

      const startTime = new Date(selectedSlot.start);
      const endTime = new Date(selectedSlot.end);
      const assignedUserId = selectedSlot.userId;

      const appointmentData: any = {
        companyId,
        contactId,
        ticketId,
        serviceId: service.id,
        title: service.name,
        description: `Cita solicitada via ChatEAM`,
        startTime,
        endTime,
        duration: service.duration || 60,
        status: "scheduled", // Pendiente de confirmación del cliente
        attendeeName: "",
        attendeeEmail: "",
        attendeePhone: "",
        attendeeCount: 1,
        location: "",
        locationType: "in_person"
      };

      if (assignedUserId) {
        appointmentData.userId = assignedUserId;
      }

      const appointment = await Appointment.create(appointmentData);

      // Marcar bloque como reservado
      if (assignedUserId && selectedSlot.id) {
        try {
          await AvailabilityService.markBlockAsBooked(
            selectedSlot.id,
            appointment.id,
            companyId
          );
        } catch (e) {
          logger.warn(`[AppointmentAgent] No se pudo marcar bloque: ${e}`);
        }
      }

      // Limpiar contexto
      await AppointmentContextStore.delete(ticketId);

      return {
        message: `¡Tu cita ha sido confirmada! ✅\n\n` +
          `*Servicio:* ${service.name}\n` +
          `*Fecha:* ${startTime.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}\n` +
          `*Hora:* ${startTime.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}\n\n` +
          `Te enviaremos un recordatorio. ¡Gracias!`,
        action: "confirm",
        confidence: 0.95,
        appointmentId: appointment.id,
        appointmentDetails: [{
          id: appointment.id,
          title: appointment.title,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          status: appointment.status
        }]
      };
    }
  }

  // ===== CASO 2: Sin contexto - buscar cita scheduled (compatibilidad) =====
  // Buscar la cita más reciente sin confirmar
  const appointment = await Appointment.findOne({
    where: {
      contactId,
      companyId,
      status: "scheduled"
    },
    order: [["createdAt", "DESC"]]
  });

  if (!appointment) {
    return {
      message: "No tienes citas pendientes por confirmar.",
      action: "confirm",
      confidence: 0.9
    };
  }

  // Confirmar la cita
  await appointment.update({ status: "confirmed" });

  // 🆕 Limpiar contexto de cita después de confirmar
  if (appointment.ticketId) {
    await AppointmentContextStore.delete(appointment.ticketId);
  }

  return {
    message: `¡Tu cita ha sido confirmada! ✅\n\n` +
      `*Servicio:* ${appointment.title}\n` +
      `*Fecha:* ${new Date(appointment.startTime).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}\n` +
      `*Hora:* ${new Date(appointment.startTime).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}\n\n` +
      `Te enviaremos un recordatorio. ¡Gracias!`,
    action: "confirm",
    confidence: 0.95,
    appointmentId: appointment.id,
    appointmentDetails: [{
      id: appointment.id,
      title: appointment.title,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      status: "confirmed"
    }]
  };
}

export default {
  processAppointmentRequest,
  detectAppointmentIntent
};
