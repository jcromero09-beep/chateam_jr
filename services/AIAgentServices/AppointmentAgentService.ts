import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import { Op } from "sequelize";
import Appointment from "../../models/Appointments/Appointment";
import AppointmentAvailability from "../../models/Appointments/AppointmentAvailability";
import AppointmentService from "../../models/AppointmentService";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
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

type ExtractedDateTime = {
  date?: Date;
  time?: string;
  extractedDate?: string;
  extractedTime?: string;
};

type SlotMatch = {
  slot: any;
  diffMinutes: number;
  requestedTime: string;
  requestedDate?: string;
};

const SLOT_TIME_TOLERANCE_MINUTES = 45;
const ACTIVE_CREATE_CONTEXT_STEPS = [
  "awaiting_service_selection",
  "awaiting_user_selection",
  "awaiting_date"
];

const NUMBER_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12
};

function normalizeAppointmentText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(value?: string): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function buildOptionList(options: Array<{ name: string; duration?: number }>): string {
  return options
    .map((option, index) => {
      const duration = option.duration ? ` (${option.duration} min)` : "";
      return `${index + 1}. ${option.name}${duration}`;
    })
    .join("\n");
}

function matchOptionByMessage<T extends { id: number; name: string }>(
  message: string,
  options: T[]
): T | null {
  const normalized = normalizeAppointmentText(message);
  const plainNumber = normalized.match(/^(\d{1,2})$/);
  const optionNumber = normalized.match(/(?:opcion|opción|numero|número|servicio|asesor|usuario)\s+(\d{1,2})/);
  const numericChoice = plainNumber || optionNumber;

  if (numericChoice) {
    const index = Number(numericChoice[1]) - 1;
    if (index >= 0 && index < options.length) {
      return options[index];
    }
  }

  for (const option of options) {
    const optionName = normalizeAppointmentText(option.name);
    if (optionName && (normalized === optionName || normalized.includes(optionName))) {
      return option;
    }
  }

  return null;
}

async function loadActiveAppointmentServices(companyId: number): Promise<AppointmentService[]> {
  return AppointmentService.findAll({
    where: { companyId, isActive: true },
    order: [["name", "ASC"]],
    limit: 10
  });
}

async function loadUsersForService(
  companyId: number,
  serviceId: number
): Promise<Array<{ id: number; name: string }>> {
  const specificRows = await AppointmentAvailability.findAll({
    where: {
      companyId,
      isAvailable: true,
      serviceId
    },
    attributes: ["userId"],
    order: [["userId", "ASC"]]
  });

  const availabilityRows = specificRows.length > 0 ? specificRows : await AppointmentAvailability.findAll({
    where: {
      companyId,
      isAvailable: true,
      serviceId: { [Op.is]: null }
    } as any,
    attributes: ["userId"],
    order: [["userId", "ASC"]]
  });

  const userIds = Array.from(
    new Set(
      availabilityRows
        .map(row => Number(row.userId))
        .filter(userId => Number.isFinite(userId) && userId > 0)
    )
  );

  if (userIds.length === 0) return [];

  const users = await User.findAll({
    where: {
      companyId,
      id: { [Op.in]: userIds }
    },
    attributes: ["id", "name"],
    order: [["name", "ASC"]]
  });

  return users.map(user => ({ id: Number(user.id), name: user.name }));
}

function parseHourToken(token?: string): number | null {
  if (!token) return null;
  const normalized = normalizeAppointmentText(token);
  if (/^\d{1,2}$/.test(normalized)) return parseInt(normalized, 10);
  return NUMBER_WORDS[normalized] ?? null;
}

function parseMinuteToken(token?: string): number {
  if (!token) return 0;
  const normalized = normalizeAppointmentText(token);
  if (/^\d{1,2}$/.test(normalized)) return parseInt(normalized, 10);
  if (normalized === "media" || normalized === "treinta") return 30;
  if (normalized === "cuarto" || normalized === "quince") return 15;
  return 0;
}

function applyTimePeriod(hour: number, period?: string): number {
  const normalized = period ? normalizeAppointmentText(period) : "";
  if (!normalized) return hour;

  if ((normalized.includes("pm") || normalized.includes("tarde") || normalized.includes("noche")) && hour < 12) {
    return hour + 12;
  }

  if ((normalized.includes("am") || normalized.includes("manana")) && hour === 12) {
    return 0;
  }

  return hour;
}

function formatTime(hour: number, minutes: number): string | undefined {
  if (hour < 0 || hour > 23 || minutes < 0 || minutes > 59) return undefined;
  return `${hour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function parseNaturalTime(message: string, allowBareTime = false): string | undefined {
  const text = normalizeAppointmentText(message);
  const hourToken = "(\\d{1,2}|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)";
  const minuteToken = "(\\d{1,2}|media|treinta|cuarto|quince)";
  const periodToken = "(am|pm|a m|p m|de la manana|de manana|de la tarde|de la noche|manana|tarde|noche)";

  const lessQuarterMatch = text.match(
    new RegExp(`(?:a\\s+)?(?:las?|la|para\\s+las?)\\s+${hourToken}\\s+menos\\s+cuarto\\s*(${periodToken})?\\b`)
  );
  if (lessQuarterMatch) {
    const parsedHour = parseHourToken(lessQuarterMatch[1]);
    if (parsedHour !== null) {
      const adjustedHour = applyTimePeriod(parsedHour, lessQuarterMatch[2]) - 1;
      return formatTime(adjustedHour < 0 ? 23 : adjustedHour, 45);
    }
  }

  const patterns = [
    new RegExp(`(?:a\\s+)?(?:las?|la|para\\s+las?|tipo|como\\s+a\\s+las?)\\s+${hourToken}(?:\\s*(?::|y)?\\s*${minuteToken})?\\s*(${periodToken})?\\b`),
    new RegExp(`\\b${hourToken}\\s*(?::|y)\\s*${minuteToken}\\s*(${periodToken})?\\b`)
  ];

  if (allowBareTime) {
    patterns.push(new RegExp(`^\\s*${hourToken}(?::${minuteToken})?\\s*(${periodToken})?\\s*$`));
  }

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const parsedHour = parseHourToken(match[1]);
    if (parsedHour === null) continue;

    const minutes = parseMinuteToken(match[2]);
    const hour = applyTimePeriod(parsedHour, match[3]);
    const formatted = formatTime(hour, minutes);
    if (formatted) return formatted;
  }

  return undefined;
}

function sameLocalDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    (date.getMonth() + 1).toString().padStart(2, "0"),
    date.getDate().toString().padStart(2, "0")
  ].join("-");
}

function timeToMinutes(time?: string): number | null {
  if (!time) return null;
  const [hh, mm] = time.split(":").map(n => parseInt(n, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

function getSlotStart(slot: any): Date | null {
  if (!slot?.start) return null;
  const date = new Date(slot.start);
  return Number.isNaN(date.getTime()) ? null : date;
}

function findClosestSlotByDateTime(
  slots: any[],
  requestedDate: Date | undefined,
  requestedTime: string | undefined,
  toleranceMinutes = SLOT_TIME_TOLERANCE_MINUTES
): SlotMatch | null {
  const requestedMinutes = timeToMinutes(requestedTime);
  if (requestedMinutes === null) return null;

  const matches = slots
    .map(slot => {
      const slotStart = getSlotStart(slot);
      if (!slotStart) return null;
      if (requestedDate && !sameLocalDate(slotStart, requestedDate)) return null;

      const slotMinutes = slotStart.getHours() * 60 + slotStart.getMinutes();
      const diffMinutes = Math.abs(slotMinutes - requestedMinutes);
      if (diffMinutes > toleranceMinutes) return null;

      return { slot, diffMinutes, slotStart };
    })
    .filter((match): match is { slot: any; diffMinutes: number; slotStart: Date } => Boolean(match))
    .sort((a, b) => a.diffMinutes - b.diffMinutes || a.slotStart.getTime() - b.slotStart.getTime());

  const best = matches[0];
  if (!best || !requestedTime) return null;

  return {
    slot: best.slot,
    diffMinutes: best.diffMinutes,
    requestedTime,
    requestedDate: requestedDate ? localDateKey(requestedDate) : undefined
  };
}

function findClosestSlotFromMessage(message: string, slots: any[]): SlotMatch | null {
  const parsed = extractDateTime(message);
  const requestedTime = parsed?.time || parseNaturalTime(message, true);
  if (!requestedTime) return null;

  return findClosestSlotByDateTime(slots, parsed?.date, requestedTime);
}

function prioritizeSlotsByRequest(slots: any[], requestedDate?: Date, requestedTime?: string): any[] {
  const bestMatch = findClosestSlotByDateTime(slots, requestedDate, requestedTime);
  if (!bestMatch) return slots;

  const bestStart = getSlotStart(bestMatch.slot)?.getTime();
  if (!bestStart) return slots;

  return [
    bestMatch.slot,
    ...slots.filter(slot => getSlotStart(slot)?.getTime() !== bestStart)
  ];
}

function isPositiveSlotConfirmation(message: string): boolean {
  const normalized = normalizeAppointmentText(message);
  return /^(si|ok|okay|dale|confirmo|confirmado|perfecto|esta bien|de acuerdo|correcto|listo)\b/.test(normalized);
}

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
function extractDateTime(message: string): ExtractedDateTime | null {
  const lowerMessage = message.toLowerCase();
  const normalizedMessage = normalizeAppointmentText(message);
  const now = new Date();

  // Mapeo de días de la semana
  const dayMap: Record<string, number> = {
    'domingo': 0, 'lunes': 1, 'martes': 2, 'miercoles': 3, 'jueves': 4,
    'viernes': 5, 'sabado': 6
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
  else if (/\bmanana\b|\bmanhana\b/.test(normalizedMessage)) {
    extractedDate = new Date(now);
    extractedDate.setDate(extractedDate.getDate() + 1);
  }

  // 3. "el lunes/martes/etc." - próximo día de la semana
  else {
    const dayMatch = normalizedMessage.match(/\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/i);
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
    const dateNumMatch = normalizedMessage.match(/(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/);
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
    const slashMatch = normalizedMessage.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (slashMatch && !extractedDate) {
      const day = parseInt(slashMatch[1]);
      const month = parseInt(slashMatch[2]) - 1;
      let year = slashMatch[3] ? parseInt(slashMatch[3]) : now.getFullYear();
      if (year < 100) year += 2000;
      extractedDate = new Date(year, month, day);
    }

    // 6. "2026-03-15" formato ISO
    const isoMatch = normalizedMessage.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch && !extractedDate) {
      extractedDate = new Date(
        parseInt(isoMatch[1]),
        parseInt(isoMatch[2]) - 1,
        parseInt(isoMatch[3])
      );
    }
  }

  // ===== EXTRAER HORA =====

  // 1. Lenguaje natural: "8 y media", "ocho y media", "8:30", "8 y cuarto"
  extractedTime = parseNaturalTime(message);

  // 2. "a las 3", "a las 3pm", "a las 15:00"
  const hourMatch = normalizedMessage.match(/(?:a\s+)?las\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!extractedTime && hourMatch) {
    let hour = parseInt(hourMatch[1]);
    const minutes = hourMatch[2] ? parseInt(hourMatch[2]) : 0;
    const period = hourMatch[3]?.toLowerCase();

    // Ajustar AM/PM
    if (period === 'pm' && hour < 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;

    extractedTime = `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  // 3. "3 de la tarde", "10 de la mañana", "8 de la noche"
  if (!extractedTime) {
    const periodMatch = normalizedMessage.match(/(\d{1,2})\s*(?:de\s+)?(?:la\s+)?(manana|tarde|noche)/i);
    if (periodMatch) {
      let hour = parseInt(periodMatch[1]);
      const period = periodMatch[2].toLowerCase();

      if (period === 'tarde' && hour < 12) hour += 12;
      if (period === 'noche' && hour < 12) hour += 12;
      if (period === 'manana' && hour === 12) hour = 0;

      extractedTime = `${hour.toString().padStart(2, '0')}:00`;
    }
  }

  // 4. Solo número "a las 3" (asumir mañana si es < 7, tarde si >= 7)
  if (!extractedTime) {
    const justNumber = normalizedMessage.match(/\ba\s+las\s+(\d{1,2})\b/);
    if (justNumber) {
      const hour = parseInt(justNumber[1]);
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
    if (ctx && ACTIVE_CREATE_CONTEXT_STEPS.includes(ctx.step)) {
      logger.info(
        `[AppointmentAgent] Contexto ${ctx.step} detectado para ticket ${ticketId} — ` +
        `continuando selección antes de consultar horarios`
      );

      let effectiveContactId = contactId || ctx.contactId;
      if (!effectiveContactId) {
        const ticket = await Ticket.findByPk(ticketId);
        if (ticket?.contactId) effectiveContactId = ticket.contactId;
      }

      if (effectiveContactId) {
        return await handleCreateAppointment(
          message,
          effectiveContactId,
          companyId,
          ticketId,
          { resolvedDate: context.resolvedDate, resolvedTime: context.resolvedTime }
        );
      }
    }

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
    const inInitialSchedulingFlow = !!existingContext && [
      ...ACTIVE_CREATE_CONTEXT_STEPS,
      "awaiting_confirmation"
    ].includes(existingContext.step);

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
  userId: number,
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
      userId,
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
  userId: number,
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
      userId,
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
  const existingContext = ticketId ? await AppointmentContextStore.get(ticketId) : null;

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

  if (!dateTime && existingContext?.metadata?.pendingDate) {
    const pendingDate = dateFromKey(String(existingContext.metadata.pendingDate));
    if (pendingDate) {
      dateTime = {
        date: pendingDate,
        time: typeof existingContext.metadata.pendingTime === "string"
          ? existingContext.metadata.pendingTime
          : undefined
      };
    }
  }

  const pendingDate = dateTime?.date ? formatDateKey(dateTime.date) : existingContext?.metadata?.pendingDate;
  const pendingTime = dateTime?.time || existingContext?.metadata?.pendingTime;

  // Obtener servicios disponibles
  const services = await loadActiveAppointmentServices(companyId);

  if (services.length === 0) {
    return {
      message: "No hay servicios disponibles para agendar. ¿Te gustaría que un asesor te contacte?",
      action: "create",
      confidence: 0.8
    };
  }

  let service: AppointmentService | null = null;
  if (existingContext?.serviceId) {
    service = services.find(s => Number(s.id) === Number(existingContext.serviceId)) || null;
  }

  if (!service) {
    const selectedService = matchOptionByMessage(
      message,
      services.map(s => ({ id: Number(s.id), name: s.name, duration: s.duration }))
    );
    if (selectedService) {
      service = services.find(s => Number(s.id) === selectedService.id) || null;
    }
  }

  if (!service && services.length === 1) {
    service = services[0];
  }

  if (!service) {
    if (ticketId) {
      await AppointmentContextStore.set({
        ticketId,
        step: "awaiting_service_selection",
        contactId,
        lastAction: "create",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        metadata: {
          pendingDate,
          pendingTime,
          serviceOptions: services.map(s => ({ id: Number(s.id), name: s.name }))
        }
      } as any);
    }

    return {
      message: `Perfecto, puedo ayudarte a agendar una cita. Primero dime qué servicio necesitas:\n\n${buildOptionList(services)}\n\nPuedes responder con el número o el nombre del servicio.`,
      action: "create",
      confidence: 0.85
    };
  }

  const providers = await loadUsersForService(companyId, Number(service.id));
  if (providers.length === 0) {
    return {
      message: `El servicio "${service.name}" todavía no tiene usuarios con disponibilidad configurada. Te puedo contactar con un asesor para ayudarte a coordinar la cita.`,
      action: "create",
      confidence: 0.82
    };
  }

  let selectedUser = existingContext?.userId
    ? providers.find(user => user.id === Number(existingContext.userId)) || null
    : null;

  if (!selectedUser) {
    selectedUser = matchOptionByMessage(message, providers);
  }

  if (!selectedUser && providers.length === 1) {
    selectedUser = providers[0];
  }

  if (!selectedUser) {
    if (ticketId) {
      await AppointmentContextStore.set({
        ticketId,
        step: "awaiting_user_selection",
        serviceId: Number(service.id),
        serviceName: service.name,
        contactId,
        lastAction: "create",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        metadata: {
          pendingDate,
          pendingTime,
          userOptions: providers
        }
      } as any);
    }

    return {
      message: `Listo, para *${service.name}* necesito elegir el usuario que atenderá la cita:\n\n${buildOptionList(providers)}\n\nResponde con el número o el nombre.`,
      action: "create",
      confidence: 0.87
    };
  }

  if (!dateTime?.date) {
    if (ticketId) {
      await AppointmentContextStore.set({
        ticketId,
        step: "awaiting_date",
        serviceId: Number(service.id),
        serviceName: service.name,
        userId: selectedUser.id,
        userName: selectedUser.name,
        contactId,
        lastAction: "create",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        metadata: {}
      } as any);
    }

    return {
      message: `Perfecto, sería para *${service.name}* con *${selectedUser.name}*. ¿Qué fecha y hora prefieres?`,
      action: "create",
      confidence: 0.88
    };
  }

  // ========== VERIFICAR DISPONIBILIDAD ==========
  const targetDate = dateTime.date || new Date();
  const targetTime = dateTime.time || "10:00";
  const explicitTimeFromText = parseNaturalTime(message);
  const hasExplicitRequestedTime = Boolean(
    resolved?.resolvedTime ||
    explicitTimeFromText ||
    existingContext?.metadata?.pendingTime
  );

  // Verificar si hay disponibilidad para la fecha/hora solicitada
  const availability = await checkAvailability(companyId, Number(service.id), selectedUser.id, targetDate, targetTime);

  if (!availability.available) {
    let detailedSlots = await getAvailableSlotsForContext(companyId, Number(service.id), selectedUser.id, 7);
    const requestedDaySlots = detailedSlots.filter((slot: any) =>
      formatDateKey(new Date(slot.start)) === formatDateKey(targetDate)
    );
    if (requestedDaySlots.length > 0) {
      detailedSlots = requestedDaySlots;
    }
    const nearestSlotMatch = hasExplicitRequestedTime
      ? findClosestSlotByDateTime(detailedSlots, targetDate, targetTime)
      : null;

    if (nearestSlotMatch) {
      const prioritizedSlots = prioritizeSlotsByRequest(detailedSlots, targetDate, targetTime);
      if (ticketId) {
        await AppointmentContextStore.set({
          ticketId,
          step: 'awaiting_confirmation',
          serviceId: Number(service.id),
          serviceName: service.name,
          userId: selectedUser.id,
          userName: selectedUser.name,
          contactId,
          lastAction: 'create',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          metadata: {
            availableSlots: prioritizedSlots,
            suggestedSlotStart: nearestSlotMatch.slot.start
          }
        } as any);
      }

      const nearestMessage = nearestSlotMatch.diffMinutes === 0
        ? `✅ Sí, tengo disponible ese horario:\n\n1) ${nearestSlotMatch.slot.formatted}`
        : `No tengo exactamente las ${targetTime}, pero el horario disponible más cercano es:\n\n1) ${nearestSlotMatch.slot.formatted}`;

      return {
        message: `${nearestMessage}\n\nServicio: *${service.name}* con *${selectedUser.name}*.\n\nSi te sirve, responde *confirmo* o *1* y te agendo esa cita.`,
        action: "create",
        confidence: 0.93
      };
    }

    // No hay disponibilidad cercana, mostrar opciones
    const availableSlots = detailedSlots.slice(0, 5).map((slot: any) => slot.formatted);
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
  let detailedSlots = await getAvailableSlotsForContext(companyId, Number(service.id), selectedUser.id, 7);
  const requestedDaySlots = detailedSlots.filter((slot: any) =>
    formatDateKey(new Date(slot.start)) === formatDateKey(targetDate)
  );
  if (requestedDaySlots.length > 0) {
    detailedSlots = requestedDaySlots;
  }
  const suggestedSlotMatch = hasExplicitRequestedTime
    ? findClosestSlotByDateTime(detailedSlots, targetDate, targetTime)
    : null;
  if (suggestedSlotMatch) {
    detailedSlots = prioritizeSlotsByRequest(detailedSlots, targetDate, targetTime);
  }

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
      serviceId: Number(service.id),
      serviceName: service.name,
      userId: selectedUser.id,
      userName: selectedUser.name,
      contactId,
      lastAction: 'create',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      metadata: {
        availableSlots: detailedSlots,
        suggestedSlotStart: suggestedSlotMatch?.slot.start
      }
    } as any);
  }

  // Mostrar opciones al usuario
  const optionsText = detailedSlots.slice(0, 5).map((s: any, i: number) =>
    `${i + 1}) ${s.formatted}`
  ).join("\n");

  if (suggestedSlotMatch?.diffMinutes === 0) {
    return {
      message: `✅ Sí, tengo disponible ese horario:\n\n1) ${suggestedSlotMatch.slot.formatted}\n\nServicio: *${service.name}* con *${selectedUser.name}*.\n\nResponde *confirmo* o *1* para agendar tu cita.`,
      action: "create",
      confidence: 0.95
    };
  }

  return {
    message: `✅ Tengo los siguientes horarios disponibles para *${service.name}* con *${selectedUser.name}*:\n\n${optionsText}\n\nResponde con el *número* o el *horario* que prefieras para agendar tu cita.`,
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
  userId: number,
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
      userId,
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
      const suggestedSlotStart = (context as any).metadata?.suggestedSlotStart;
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
      } else if (suggestedSlotStart && isPositiveSlotConfirmation(message)) {
        selectedSlot = slots.find((slot: any) =>
          getSlotStart(slot)?.getTime() === new Date(suggestedSlotStart).getTime()
        );
      } else {
        // Buscar por fecha/hora exacta o natural mencionada ("mañana a las 8 y media").
        for (const slot of slots) {
          if (slot.formatted && normalizeAppointmentText(message).includes(normalizeAppointmentText(slot.formatted))) {
            selectedSlot = slot;
            break;
          }
        }

        if (!selectedSlot) {
          const naturalSlotMatch = findClosestSlotFromMessage(message, slots);
          if (naturalSlotMatch) {
            selectedSlot = naturalSlotMatch.slot;
            logger.info(
              `[AppointmentAgent] Slot seleccionado por lenguaje natural: ` +
              `requestedDate=${naturalSlotMatch.requestedDate || 'any'}, ` +
              `requestedTime=${naturalSlotMatch.requestedTime}, ` +
              `selected="${selectedSlot.formatted}", diff=${naturalSlotMatch.diffMinutes}m`
            );
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
      const assignedUserId = selectedSlot.userId || context.userId;

      // 🆕 Unificado con BookingService.createBooking (fuente ÚNICA de creación de citas).
      // Antes la Ruta IA duplicaba manualmente: crear + mensaje de creación + recordatorios +
      // encolar confirmación + notificar + sync de calendarios (riesgo de divergencia con el
      // path REST). Ahora delega TODO en BookingService, que además VALIDA disponibilidad y
      // respeta requiresConfirmation del servicio. El userId SIEMPRE viene del paso de
      // selección de usuario del flujo (awaiting_user_selection).
      logger.info(
        `[AppointmentAgent] [PERSIST] Creando cita vía BookingService: ` +
        `companyId=${companyId}, contactId=${contactId}, ticketId=${ticketId}, ` +
        `serviceId=${service.id}, userId=${assignedUserId ?? 'null'}, startTime=${startTime.toISOString()}`
      );

      let appointment: any;
      try {
        appointment = await BookingService.createBooking({
          companyId,
          serviceId: Number(service.id),
          userId: Number(assignedUserId),
          contactId: contactId!,
          ticketId: ticketId || undefined,
          startTime,
          title: service.name,
          description: `Cita solicitada via ChatEAM`
        });
        logger.info(
          `[AppointmentAgent] [PERSIST] ✅ Cita creada vía BookingService: id=${appointment.id}, ` +
          `status=${appointment.status}, startTime=${appointment.startTime}`
        );
      } catch (createErr: any) {
        logger.error(
          `[AppointmentAgent] [PERSIST] ❌ FALLO al crear cita vía BookingService: ${createErr?.message || createErr}\n` +
          `  → serviceId=${service.id}, userId=${assignedUserId ?? 'null'}, startTime=${startTime.toISOString()}`
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
