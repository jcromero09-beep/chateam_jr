import { selectModel } from "./ModelRouterService";
import AvailabilityService from "../AppointmentServices/AvailabilityService";
import AppointmentService from "../../models/AppointmentService";
import logger from "../../utils/logger";

/**
 * AppointmentAvailabilityGuard — Verificador dedicado de disponibilidad de citas
 *
 * Este agente se comunica con el ResponseGatekeeperService. Cuando el Gatekeeper
 * detecta que un borrador dice "no hay disponibilidad" (o similar) para una
 * fecha específica, invoca este Guard para VERIFICAR en BD si realmente no hay
 * slots, o si es un falso negativo del agente principal.
 *
 * Flujo:
 *   1. Guard recibe: {companyId, message del cliente, borrador, fecha candidata}
 *   2. Extrae la fecha (YYYY-MM-DD) que el cliente pidió, usando el LLM
 *      si no viene explícita en los parámetros
 *   3. Consulta AvailabilityService.getAvailableSlots para esa fecha
 *   4. Devuelve veredicto:
 *      - actuallyAvailable: true/false (fuente de verdad: BD)
 *      - availableSlots: lista de slots reales en la fecha
 *      - correction: si el borrador contradice la BD, mensaje corregido
 *
 * Evita repetir el bug "mañana no hay cita" cuando sí hay bloques configurados.
 */

export interface GuardInput {
  companyId: number;
  clientMessage: string;
  draftResponse: string;
  /** Fecha candidata YYYY-MM-DD (si ya fue resuelta por el enriquecedor) */
  resolvedDate?: string;
  /** Hora candidata HH:mm (si fue especificada) */
  resolvedTime?: string;
  /** ID del servicio si ya se conoce; si no, toma el primero activo */
  serviceId?: number;
}

export interface GuardResult {
  /** Verdad según la BD para la fecha verificada */
  actuallyAvailable: boolean;
  /** Fecha que efectivamente se verificó (YYYY-MM-DD) */
  verifiedDate: string | null;
  /**
   * Slots reales disponibles en esa fecha (deduplicados por start). Incluye
   * userId y id del bloque — necesarios para que el Gatekeeper pueda
   * persistir el contexto awaiting_confirmation que leerá el AppointmentAgent
   * cuando el cliente seleccione un slot en el siguiente turno.
   */
  availableSlots: Array<{
    start: string;
    end: string;
    formatted: string;
    userId?: number;
    id?: number;
  }>;
  /** serviceId que se usó para consultar disponibilidad */
  serviceId?: number;
  /**
   * Si el borrador contradice la realidad de BD, este texto sugiere una
   * respuesta corregida que el Gatekeeper puede usar para reescribir.
   */
  suggestedCorrection?: string;
  /** Razonamiento legible para el log */
  reasoning: string;
}

/**
 * Extrae fecha del mensaje del cliente usando LLM si no viene resuelta.
 * Usa selectModel para respetar la config por empresa.
 */
const extractDateFromMessage = async (
  message: string,
  companyId: number
): Promise<string | null> => {
  const modelSelection = await selectModel('availability_guard', message, 'nano');
  const modelKey = modelSelection?.entity.key || 'gpt-4.1-mini';

  const now = new Date();
  const today = now.toISOString().split('T')[0]; // YYYY-MM-DD

  const prompt = `Extrae la FECHA absoluta que el cliente está pidiendo para una cita.
Hoy es: ${today}. El cliente puede decir "mañana", "el lunes", "15 de abril", etc.

MENSAJE DEL CLIENTE: "${message}"

Responde SOLO con JSON válido:
{
  "date": "YYYY-MM-DD o null si no menciona fecha"
}`;

  try {
    const AIClientService = require("../AIClientService").default;
    const res = await AIClientService.generateText({
      prompt,
      modelKey,
      maxTokens: 40,
      temperature: 0,
      responseFormat: 'json',
      companyId
    });
    const parsed = JSON.parse(res.text);
    return typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
      ? parsed.date
      : null;
  } catch (err: any) {
    logger.warn(`[AvailabilityGuard] Error extrayendo fecha: ${err.message}`);
    return null;
  }
};

/**
 * Formatea un slot para presentación al cliente en español.
 */
const formatSlot = (start: Date): string => {
  return start.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  });
};

/**
 * Verifica disponibilidad real contra BD. Es la función principal.
 */
const verify = async (input: GuardInput): Promise<GuardResult> => {
  const startTime = Date.now();

  // 1. Determinar fecha a verificar
  let dateToCheck = input.resolvedDate;
  if (!dateToCheck) {
    const extracted = await extractDateFromMessage(input.clientMessage, input.companyId);
    dateToCheck = extracted || undefined;
  }

  if (!dateToCheck) {
    logger.info(
      `[AvailabilityGuard] Sin fecha extraíble del mensaje "${input.clientMessage.substring(0, 40)}..." — saltando verificación`
    );
    return {
      actuallyAvailable: false,
      verifiedDate: null,
      availableSlots: [],
      reasoning: 'No se pudo extraer fecha del mensaje del cliente'
    };
  }

  // 2. Determinar servicio (tomar el primero activo si no viene)
  let serviceId = input.serviceId;
  if (!serviceId) {
    const firstService = await AppointmentService.findOne({
      where: { companyId: input.companyId, isActive: true },
      order: [['id', 'ASC']]
    });
    serviceId = firstService?.id;
  }

  if (!serviceId) {
    logger.warn(`[AvailabilityGuard] No hay servicios activos para companyId=${input.companyId}`);
    return {
      actuallyAvailable: false,
      verifiedDate: dateToCheck,
      availableSlots: [],
      reasoning: 'La empresa no tiene servicios de cita activos'
    };
  }

  // 3. Consultar slots reales en BD
  try {
    const [y, m, d] = dateToCheck.split('-').map(Number);
    const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
    const dayEnd = new Date(y, m - 1, d, 23, 59, 59, 999);

    const allSlots = await AvailabilityService.getAvailableSlots({
      companyId: input.companyId,
      serviceId,
      startDate: dayStart,
      endDate: dayEnd
    });

    // Deduplicar por start (consistente con la lógica del AppointmentAgent)
    // 🆕 Incluir userId e id para que el contexto awaiting_confirmation quede
    // completo y el AppointmentAgent pueda crear la cita en el siguiente turno.
    const seen = new Set<string>();
    const realSlots = allSlots
      .filter((s: any) => s.available)
      .filter((s: any) => {
        const key = new Date(s.start).toISOString();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 5)
      .map((s: any) => ({
        start: new Date(s.start).toISOString(),
        end: new Date(s.end).toISOString(),
        formatted: formatSlot(new Date(s.start)),
        userId: s.userId,
        id: s.id
      }));

    const actuallyAvailable = realSlots.length > 0;

    // 4. Detectar si el borrador dice "no hay" cuando SÍ hay → sugerir corrección
    const draftLower = input.draftResponse.toLowerCase();
    const draftSaysNoAvailability =
      /no hay (horarios?|disponibilidad|cupos?|citas?)/.test(draftLower) ||
      /no (est[aá]|tenemos) disponibl/.test(draftLower) ||
      /sin disponibilidad/.test(draftLower) ||
      /no (tengo|queda) (?:disponibilidad|cupos?|horarios?)/.test(draftLower);

    let suggestedCorrection: string | undefined;
    if (actuallyAvailable && draftSaysNoAvailability) {
      const opciones = realSlots.slice(0, 3).map((s, i) => `${i + 1}. ${s.formatted}`).join('\n');
      suggestedCorrection =
        `¡Sí tenemos disponibilidad! 📅 Te dejo las opciones:\n\n${opciones}\n\n` +
        `Responde con el número del horario que prefieras.`;
    }

    const result: GuardResult = {
      actuallyAvailable,
      verifiedDate: dateToCheck,
      availableSlots: realSlots,
      serviceId,
      suggestedCorrection,
      reasoning: suggestedCorrection
        ? `Borrador dice "no hay" pero BD tiene ${realSlots.length} slots reales para ${dateToCheck}`
        : actuallyAvailable
          ? `BD confirma ${realSlots.length} slots reales para ${dateToCheck}`
          : `BD confirma: sin slots para ${dateToCheck} (borrador correcto)`
    };

    logger.info(
      `[AvailabilityGuard] verifiedDate=${dateToCheck}, actuallyAvailable=${actuallyAvailable}, ` +
      `realSlots=${realSlots.length}, falseNegative=${!!suggestedCorrection}, ` +
      `latency=${Date.now() - startTime}ms`
    );

    return result;
  } catch (error: any) {
    logger.error(`[AvailabilityGuard] Error verificando: ${error.message}`);
    return {
      actuallyAvailable: false,
      verifiedDate: dateToCheck,
      availableSlots: [],
      reasoning: `Error técnico: ${error.message}`
    };
  }
};

export default { verify };
