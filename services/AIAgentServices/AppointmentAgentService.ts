import Appointment from "../../models/Appointments/Appointment";
import AppointmentService from "../../models/AppointmentService";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import logger from "../../utils/logger";
import AvailabilityService from "../AppointmentServices/AvailabilityService";
import BookingService from "../AppointmentServices/BookingService";
import ReminderService from "../AppointmentServices/ReminderService";
import AppointmentContextStore from "./AppointmentContextStore";
import AppointmentResponseClassifier from "./AppointmentResponseClassifier";

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
  /**
   * 🆕 Bug C fix: fecha/hora resuelta por QueryEnrichmentAgent.
   * Si viene, tiene PRECEDENCIA sobre la extracción regex local (que es
   * frágil con "mañana", "el lunes", etc). Formato YYYY-MM-DD y HH:mm 24h.
   */
  resolvedDate?: string;
  resolvedTime?: string;
  resolvedTimezone?: string;
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

// Palabras clave para detectar INTENT de cita (solo keywords inequívocas).
// Las respuestas conversacionales cortas ("si", "ok", "no", "dale", 👍, etc)
// las maneja AppointmentResponseClassifier con comprensión semántica LLM,
// no este regex. Aquí solo capturamos frases que CLARAMENTE son sobre citas.
const INTENT_KEYWORDS = {
  create: [
    "agendar", "agenda", "cita", "citar", "turno", "reservar", "reservación",
    "quiero una cita", "necesito una cita", "sacar cita", "separar cita",
    "programar cita", "reservar hora", "reservar turno"
  ],
  reschedule: [
    "reagendar", "reprogramar",
    "cambiar cita", "cambiar hora", "mover cita", "otra fecha para mi cita"
  ],
  cancel: [
    "cancelar cita", "anular cita", "eliminar cita",
    "ya no quiero la cita", "quitar mi cita"
  ],
  list: [
    "mis citas", "ver citas", "tengo cita", "cuándo es mi cita",
    "mi turno", "mi horario", "próxima cita"
  ],
  confirm: [
    "confirmar cita", "confirmo mi cita", "confirmar mi turno"
  ]
};

/**
 * Detecta la intención de cita en el mensaje usando solo keywords inequívocas.
 *
 * Las respuestas conversacionales cortas ("si", "ok", "no", "dale", emojis)
 * NO se manejan aquí — las intercepta AppointmentResponseClassifier (LLM)
 * en el bypass 0b del SupervisorService cuando hay una cita pendiente.
 *
 * Este regex solo captura intents claros de cita ("agendar", "mis citas",
 * "cancelar cita", etc.) para el flujo inicial de agendamiento cuando NO
 * hay una cita previa asociada al contacto.
 */
function detectAppointmentIntent(message: string): string {
  const lowerMessage = message.toLowerCase();

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

  // 🆕 FIX ticket 1099: si hay contexto awaiting_confirmation activo,
  // FORZAR el flujo de confirmación pase lo que pase. Antes, si el cliente
  // escribía algo como "para carro aveo" (sin keywords de cita ni número),
  // el regex local decía 'none' y RAG tomaba control → alucinaba "cita
  // confirmada" sin persistir. Ahora cualquier mensaje con contexto activo
  // pasa a handleConfirmAppointment que sabe interpretar la selección.
  if (ticketId) {
    const ctx = await AppointmentContextStore.get(ticketId);
    if (ctx?.step === 'awaiting_confirmation') {
      logger.info(
        `[AppointmentAgent] Contexto awaiting_confirmation detectado para ticket ${ticketId} — ` +
        `forzando handleConfirmAppointment en lugar de evaluar regex`
      );
      // Buscar contacto si no vino en el context
      let effectiveContactId = contactId;
      if (!effectiveContactId && ticketId) {
        const ticket = await Ticket.findByPk(ticketId);
        if (ticket?.contactId) effectiveContactId = ticket.contactId;
      }
      if (effectiveContactId) {
        return await handleConfirmAppointment(message, effectiveContactId, companyId, ticketId);
      }
    }
  }

  // 🆕 0. CLASIFICACIÓN SEMÁNTICA PRIORITARIA
  // Si el contacto tiene una cita scheduled (pendiente de confirmar tras
  // el 1er recordatorio) Y no hay contexto activo de agendamiento inicial,
  // usamos el clasificador LLM en lugar del regex frágil.
  if (contactId && ticketId) {
    const existingContext = await AppointmentContextStore.get(ticketId);
    const inInitialSchedulingFlow = existingContext?.step === 'awaiting_confirmation';

    if (!inInitialSchedulingFlow) {
      const pendingAppointment = await Appointment.findOne({
        where: {
          contactId,
          companyId,
          status: "scheduled"
        },
        order: [["startTime", "ASC"]]
      });

      if (pendingAppointment) {
        const classification = await AppointmentResponseClassifier.classifyResponse(
          message,
          {
            appointmentTitle: pendingAppointment.title,
            appointmentStartTime: pendingAppointment.startTime,
            companyId
          }
        );

        // Umbral: si la confianza es muy baja, tratamos como ambiguous
        const effectiveIntent = classification.confidence >= 0.6
          ? classification.intent
          : 'ambiguous';

        logger.info(
          `[AppointmentAgent] Clasificación semántica: intent=${effectiveIntent}, ` +
          `confidence=${classification.confidence.toFixed(2)}, ` +
          `appointmentId=${pendingAppointment.id}`
        );

        switch (effectiveIntent) {
          case 'confirm':
            return await handleSemanticConfirm(pendingAppointment.id, companyId, ticketId);

          case 'reschedule':
            // Extraer fecha/hora si el cliente la propuso en el mismo mensaje
            return await handleSemanticReschedule(message, pendingAppointment.id, companyId);

          case 'cancel':
            return await handleSemanticCancel(pendingAppointment.id, companyId, ticketId);

          case 'ambiguous':
          default:
            // Devolver 'none' para que el Supervisor continúe al flujo normal
            // (Sales/Support con tools) — opción (b): el LLM principal decidirá
            // si es pregunta informativa u otra intención.
            logger.info(
              `[AppointmentAgent] Intent ambiguo — devolviendo control al Supervisor`
            );
            return {
              message: "",
              action: "none",
              confidence: 0
            };
        }
      }
    }
  }

  // 1. Detectar intención (fallback regex para flujos de agendamiento inicial)
  let intent = detectAppointmentIntent(message);

  // 🆕 FIX ticket 1100: si el regex no detectó keywords pero el enriquecedor
  // ya resolvió una fecha absoluta (YYYY-MM-DD) para este mensaje,
  // significa que el QueryEnrichmentAgent clasificó como appointment_request
  // con una fecha concreta (ej: "para mañana a las 10:30 + info del carro").
  // Forzamos 'create' para que el flujo de agendamiento tome control en vez
  // de caer a RAG/sales que alucinan confirmaciones.
  if (intent === "none" && context.resolvedDate) {
    logger.info(
      `[AppointmentAgent] Regex devolvió 'none' pero enriquecedor resolvió ` +
      `fecha=${context.resolvedDate} hora=${context.resolvedTime || 'n/a'} → ` +
      `forzando intent='create'`
    );
    intent = "create";
  }

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
      return await handleCreateAppointment(
        message, contact.id, companyId, ticketId,
        { resolvedDate: context.resolvedDate, resolvedTime: context.resolvedTime }
      );

    case "reschedule":
      return await handleRescheduleAppointment(
        message, contact.id, companyId,
        { resolvedDate: context.resolvedDate, resolvedTime: context.resolvedTime }
      );

    case "cancel":
      return await handleCancelAppointment(message, contact.id, companyId);

    case "confirm": {
      // 🆕 Fix ticket 1097: si el cliente escribe algo como
      // "si, puede ser para mañana a las 10:30" (confirm + propuesta de fecha
      // todo en un mensaje) sin haber pasado por handleCreateAppointment,
      // NO hay contexto awaiting_confirmation ni cita scheduled previa.
      // handleConfirmAppointment caería al CASO 2 y respondería
      // "No tienes citas pendientes por confirmar" — falso mensaje que
      // el gatekeeper podría reescribir sin crear la cita en BD.
      //
      // En ese caso, SI hay fecha resuelta por el enriquecedor o extraída
      // del mensaje, redirigimos a handleCreateAppointment para que se
      // agende correctamente.
      const hasResolvedDate = !!context.resolvedDate;
      const localDt = hasResolvedDate ? null : extractDateTime(message);
      const clientProposesDate = hasResolvedDate || !!(localDt?.date);

      if (clientProposesDate && ticketId) {
        const existingCtx = await AppointmentContextStore.get(ticketId);
        const hasScheduledForContact = await Appointment.findOne({
          where: { contactId: contact.id, companyId, status: "scheduled" }
        });

        if (!existingCtx && !hasScheduledForContact) {
          logger.info(
            `[AppointmentAgent] Intent 'confirm' SIN contexto ni cita previa, ` +
            `pero el cliente propone fecha. Redirigiendo a handleCreateAppointment. ` +
            `resolvedDate=${context.resolvedDate || (localDt?.date ? localDt.date.toISOString().slice(0,10) : 'n/a')}`
          );
          return await handleCreateAppointment(
            message, contact.id, companyId, ticketId,
            { resolvedDate: context.resolvedDate, resolvedTime: context.resolvedTime }
          );
        }
      }

      return await handleConfirmAppointment(message, contact.id, companyId, ticketId);
    }

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
    // 🆕 Bug B2 fix: antes usábamos `getAvailableBlocksForDate` que compara
    // horas en strings (frágil) y NO coordina bien con `getAvailableSlots`
    // (que es la fuente de verdad usada para proponer slots). Resultado:
    // se proponía un slot y luego se rechazaba al verificarlo.
    // Ahora usamos `getAvailableSlots` con comparación de timestamps exactos.

    // Construir timestamp preciso del slot solicitado
    const [hh, mm] = (time || "00:00").split(":").map(n => parseInt(n, 10) || 0);
    const slotStart = new Date(date);
    slotStart.setHours(hh, mm, 0, 0);

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const allSlots = await AvailabilityService.getAvailableSlots({
      companyId,
      serviceId,
      startDate: dayStart,
      endDate: dayEnd
    });

    // Comparar por timestamp exacto (±1 minuto de tolerancia para microsegundos)
    const TOL_MS = 60 * 1000;
    const matching = allSlots.filter((s: any) => {
      if (!s.available) return false;
      const startTs = new Date(s.start).getTime();
      return Math.abs(startTs - slotStart.getTime()) < TOL_MS;
    });

    return {
      available: matching.length > 0,
      availableUsers: matching.length,
      slots: matching
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

    // 🆕 Bug A fix: deduplicar por horario (start) ANTES de slice.
    // El usuario puede tener 2 bloques idénticos (ej: 8:30) configurados a
    // propósito para permitir 2 citas simultáneas. Al cliente le mostramos
    // el horario UNA sola vez; internamente los bloques se consumen secuencialmente
    // y el slot seguirá apareciendo hasta que AMBOS estén ocupados.
    const seen = new Set<string>();
    const availableSlots = slots
      .filter(s => s.available)
      .filter(s => {
        const key = new Date(s.start).toISOString();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
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
  ticketId?: number,
  resolved?: { resolvedDate?: string; resolvedTime?: string }
): Promise<AppointmentResponse> {
  // 🆕 Bug C fix: priorizar fecha/hora resuelta por el enriquecedor LLM
  // sobre el regex local (que falla con expresiones naturales complejas).
  // Si vienen ambas, usamos la del enriquecedor; si solo una, combinamos.
  let dateTime: { date?: Date; time?: string } | null = null;
  if (resolved?.resolvedDate) {
    // resolvedDate en formato YYYY-MM-DD → crear Date en medianoche local
    const [y, m, d] = resolved.resolvedDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const timeStr = resolved.resolvedTime || undefined;
    dateTime = { date: dt, time: timeStr };
    logger.info(
      `[AppointmentAgent] Usando fecha resuelta por enriquecedor: ` +
      `date=${resolved.resolvedDate}, time=${resolved.resolvedTime || '(sin hora)'}`
    );
  } else {
    // Fallback al regex local
    dateTime = extractDateTime(message);
  }

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

    // 🆕 Bug A fix: deduplicar por start. En el contexto guardamos el primer
    // slot de cada horario único. Si ese bloque se reserva y existe otro
    // bloque gemelo (ej: 2 asesores a 8:30), el próximo `getAvailableSlots`
    // devolverá el gemelo y el slot seguirá apareciendo.
    const seen = new Set<string>();
    return slots
      .filter((s: any) => s.available)
      .filter((s: any) => {
        const key = new Date(s.start).toISOString();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
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
  companyId: number,
  resolved?: { resolvedDate?: string; resolvedTime?: string }
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

  // 🆕 Bug C fix: priorizar fecha/hora resuelta por enriquecedor LLM
  let dateTime: { date?: Date; time?: string } | null = null;
  if (resolved?.resolvedDate) {
    const [y, m, d] = resolved.resolvedDate.split('-').map(Number);
    dateTime = { date: new Date(y, m - 1, d), time: resolved.resolvedTime || undefined };
  } else {
    dateTime = extractDateTime(message);
  }

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

      // 🆕 FIX ticket 1099: eliminado el default peligroso `slots[0]`.
      // Antes si el cliente escribía "para carro aveo" sin número, el sistema
      // silenciosamente creaba la cita en el primer slot, que podía ser un
      // horario diferente al que el cliente realmente quería.
      // Ahora si no detectamos selección clara, PEDIMOS confirmación explícita.
      if (!selectedSlot) {
        const optionsText = slots.slice(0, 5).map((s: any, i: number) =>
          `${i + 1}) ${s.formatted}`
        ).join("\n");

        const hasOptions = slots.length > 0;
        return {
          message: hasOptions
            ? `Para confirmar tu cita, por favor responde con el *número* del horario que prefieras:\n\n${optionsText}`
            : `No tengo horarios disponibles en este momento. ¿Te contacto con un asesor?`,
          action: "confirm",
          confidence: 0.85
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
      const reminderTemplate = await ReminderService.resolveWhatsappTemplate(companyId);

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

      if (reminderTemplate) {
        appointmentData.reminderTemplateId = reminderTemplate.id;
        logger.info(
          `[AppointmentAgent] Plantilla de recordatorio aplicada por defecto: ` +
          `id=${reminderTemplate.id}, name="${reminderTemplate.name}"`
        );
      } else {
        logger.warn(
          `[AppointmentAgent] No hay plantilla activa de WhatsApp para companyId=${companyId}; ` +
          `la cita se creará sin reminderTemplateId`
        );
      }

      if (assignedUserId) {
        appointmentData.userId = assignedUserId;
      }

      // 🆕 Bug D fix: logs explícitos del payload ANTES del INSERT para poder
      // depurar si Sequelize falla silenciosamente
      logger.info(
        `[AppointmentAgent] [PERSIST] Intentando crear cita: ` +
        `companyId=${companyId}, contactId=${contactId}, ticketId=${ticketId}, ` +
        `serviceId=${service.id}, userId=${assignedUserId ?? 'null'}, ` +
        `startTime=${startTime.toISOString()}, endTime=${endTime.toISOString()}, ` +
        `duration=${appointmentData.duration}, title="${appointmentData.title}"`
      );

      let appointment: any;
      try {
        appointment = await Appointment.create(appointmentData);
        logger.info(
          `[AppointmentAgent] [PERSIST] ✅ Cita creada: id=${appointment.id}, ` +
          `status=${appointment.status}, startTime=${appointment.startTime}`
        );
      } catch (createErr: any) {
        // 🆕 Log de error completo: Sequelize oculta detalles en message pero
        // los pone en .errors (ValidationError) o .parent.detail (PG)
        const sequelizeErrors = createErr?.errors?.map((e: any) => ({
          field: e.path,
          type: e.type,
          message: e.message,
          value: e.value
        })) || [];
        logger.error(
          `[AppointmentAgent] [PERSIST] ❌ FALLO al crear cita: ${createErr?.message || createErr}\n` +
          `  → sequelizeErrors: ${JSON.stringify(sequelizeErrors)}\n` +
          `  → pgDetail: ${createErr?.parent?.detail || 'n/a'}\n` +
          `  → pgCode: ${createErr?.parent?.code || 'n/a'}\n` +
          `  → payload: ${JSON.stringify(appointmentData)}`
        );
        // Devolver respuesta amigable y NO limpiar contexto (permite reintento)
        return {
          message:
            `😓 Hubo un problema al guardar tu cita. Un asesor te contactará en breve. ` +
            `Si prefieres, puedes intentarlo de nuevo respondiendo con el número del horario.`,
          action: "none",
          confidence: 0
        };
      }

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

      // 🆕 Crear recordatorios por defecto (equivalente a BookingService.createBooking)
      // Garantiza que las citas creadas desde el flujo IA también tengan seguimiento automático
      try {
        await ReminderService.createDefaultReminders(appointment);
        logger.info(`[AppointmentAgent] Recordatorios creados para cita ID=${appointment.id}`);
      } catch (reminderErr: any) {
        logger.warn(`[AppointmentAgent] No se pudieron crear recordatorios para cita ID=${appointment.id}: ${reminderErr.message}`);
        // No fallar la confirmación de la cita por un error de reminders
      }

      try {
        await BookingService.enqueueConfirmationReminder(appointment);
      } catch (reminderQueueErr: any) {
        logger.warn(
          `[AppointmentAgent] No se pudo encolar el mensaje inicial de confirmación ` +
          `para cita ID=${appointment.id}: ${reminderQueueErr.message}`
        );
      }

      // 🆕 Bug E fix: sync a Google Calendar / Outlook si el user tiene sync configurado
      if (appointment.userId) {
        try {
          const CalendarSyncService = require("../AppointmentServices/CalendarSyncService").default;
          const gEventId = await CalendarSyncService.syncToGoogleCalendar(
            appointment, appointment.userId, companyId
          );
          if (gEventId) {
            logger.info(`[AppointmentAgent] Cita sincronizada a Google Calendar: eventId=${gEventId}`);
          }
          const oEventId = await CalendarSyncService.syncToOutlookCalendar(
            appointment, appointment.userId
          );
          if (oEventId) {
            logger.info(`[AppointmentAgent] Cita sincronizada a Outlook: eventId=${oEventId}`);
          }
        } catch (syncErr: any) {
          logger.warn(`[AppointmentAgent] Error en sync de calendario para cita ID=${appointment.id}: ${syncErr?.message || syncErr}`);
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
  const appointmentToConfirm = await Appointment.findOne({
    where: {
      contactId,
      companyId,
      status: "scheduled"
    },
    order: [["createdAt", "DESC"]]
  });

  if (!appointmentToConfirm) {
    return {
      message: "No tienes citas pendientes por confirmar.",
      action: "confirm",
      confidence: 0.9
    };
  }

  // 🆕 Confirmar vía BookingService.confirmAppointment
  // Esto NO solo actualiza status=confirmed, sino que ENCOLA el job Bull
  // 'AppointmentReminder' con delay 60s → es lo que dispara el 2do mensaje
  // de recordatorio automático. Antes se usaba appointment.update() directo
  // lo cual NUNCA disparaba el 2do mensaje (bug silencioso).
  const appointment = await BookingService.confirmAppointment(
    appointmentToConfirm.id,
    companyId
  );

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

// ═══════════════════════════════════════════════════════════════════════
// HANDLERS SEMÁNTICOS (usados tras AppointmentResponseClassifier)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Confirma una cita semánticamente detectada.
 * CRÍTICO: usa BookingService.confirmAppointment en lugar de update() directo.
 * Eso es lo que encola el job 'AppointmentReminder' con el 2do mensaje.
 */
async function handleSemanticConfirm(
  appointmentId: number,
  companyId: number,
  ticketId: number
): Promise<AppointmentResponse> {
  try {
    const appointment = await BookingService.confirmAppointment(appointmentId, companyId);

    // Limpiar cualquier contexto residual
    await AppointmentContextStore.delete(ticketId);

    const fechaStr = new Date(appointment.startTime).toLocaleDateString("es-ES", {
      weekday: "long", day: "numeric", month: "long"
    });
    const horaStr = new Date(appointment.startTime).toLocaleTimeString("es-ES", {
      hour: "2-digit", minute: "2-digit"
    });

    return {
      message:
        `¡Perfecto! Tu cita ha sido confirmada ✅\n\n` +
        `*${appointment.title}*\n` +
        `${fechaStr} a las ${horaStr}\n\n` +
        `Te enviaremos un recordatorio cercano a la fecha. ¡Gracias!`,
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
  } catch (error: any) {
    logger.error(
      `[AppointmentAgent] Error confirmando cita semánticamente ID=${appointmentId}: ${error.message}`
    );
    // Si falla el confirm, devolver ambiguous para que el Supervisor reintente con tools
    return { message: "", action: "none", confidence: 0 };
  }
}

/**
 * Reagenda una cita semánticamente detectada.
 * Si el cliente propuso una fecha en el mismo mensaje, la usa;
 * si no, pide fecha/hora nueva.
 */
async function handleSemanticReschedule(
  message: string,
  appointmentId: number,
  companyId: number
): Promise<AppointmentResponse> {
  const dateTime = extractDateTime(message);

  const appointment = await Appointment.findOne({
    where: { id: appointmentId, companyId }
  });

  if (!appointment) {
    return { message: "", action: "none", confidence: 0 };
  }

  const fechaActualStr = new Date(appointment.startTime).toLocaleDateString("es-ES", {
    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit"
  });

  // Si el cliente NO propuso una nueva fecha, pedirla
  if (!dateTime?.date) {
    return {
      message:
        `Entiendo, quieres cambiar tu cita de *${fechaActualStr}*. ` +
        `¿Qué nueva fecha y horario te vendría bien?`,
      action: "reschedule",
      confidence: 0.9,
      appointmentId: appointment.id
    };
  }

  // Reagendar con BookingService (valida disponibilidad y actualiza reminders)
  try {
    const [h, m] = (dateTime.time || "10:00").split(":").map(Number);
    const newStart = new Date(dateTime.date);
    newStart.setHours(h, m, 0, 0);

    const updated = await BookingService.rescheduleAppointment(
      appointmentId,
      companyId,
      newStart
    );

    const nuevaFecha = newStart.toLocaleDateString("es-ES", {
      weekday: "long", day: "numeric", month: "long"
    });
    const nuevaHora = newStart.toLocaleTimeString("es-ES", {
      hour: "2-digit", minute: "2-digit"
    });

    return {
      message:
        `Tu cita fue reagendada 📅\n\n` +
        `*${updated.title}*\n` +
        `Nueva fecha: ${nuevaFecha} a las ${nuevaHora}\n\n` +
        `¿Confirmas este nuevo horario?`,
      action: "reschedule",
      confidence: 0.95,
      appointmentId: updated.id,
      appointmentDetails: [{
        id: updated.id,
        title: updated.title,
        startTime: updated.startTime,
        endTime: updated.endTime,
        status: updated.status
      }]
    };
  } catch (error: any) {
    logger.warn(
      `[AppointmentAgent] Reschedule semántico falló (${error.message}), ` +
      `pidiendo al cliente otra fecha`
    );
    return {
      message:
        `Ese horario no está disponible. ¿Puedes proponerme otra fecha u hora?`,
      action: "reschedule",
      confidence: 0.8,
      appointmentId: appointment.id
    };
  }
}

/**
 * Cancela una cita semánticamente detectada.
 */
async function handleSemanticCancel(
  appointmentId: number,
  companyId: number,
  ticketId: number
): Promise<AppointmentResponse> {
  try {
    const appointment = await BookingService.cancelAppointment(
      appointmentId,
      companyId,
      "Cancelada por el cliente (confirmación detectada por IA)"
    );

    await AppointmentContextStore.delete(ticketId);

    return {
      message:
        `Tu cita ha sido cancelada. Si en el futuro quieres agendar nuevamente, escríbenos cuando gustes. ¡Gracias!`,
      action: "cancel",
      confidence: 0.95,
      appointmentId: appointment.id
    };
  } catch (error: any) {
    logger.error(
      `[AppointmentAgent] Error cancelando cita semánticamente ID=${appointmentId}: ${error.message}`
    );
    return { message: "", action: "none", confidence: 0 };
  }
}

export default {
  processAppointmentRequest,
  detectAppointmentIntent
};
