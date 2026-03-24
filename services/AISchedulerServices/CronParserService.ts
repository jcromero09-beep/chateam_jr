import logger from "../../utils/logger";

/**
 * CronParserService — Valida, parsea y describe expresiones cron de 5 campos.
 * Campos: minuto(0-59) hora(0-23) dia-mes(1-31) mes(1-12) dia-semana(0-6)
 * Sin dependencias externas.
 */

interface CronParseResult {
  valid: boolean;
  error?: string;
  description?: string;
}

interface CronField {
  values: number[];
}

const FIELD_RANGES: { name: string; min: number; max: number }[] = [
  { name: "minuto", min: 0, max: 59 },
  { name: "hora", min: 0, max: 23 },
  { name: "dia del mes", min: 1, max: 31 },
  { name: "mes", min: 1, max: 12 },
  { name: "dia de la semana", min: 0, max: 6 }
];

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
const MONTH_NAMES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/**
 * Parsea un campo individual de cron y retorna los valores expandidos.
 */
const parseField = (field: string, min: number, max: number): number[] => {
  const values: Set<number> = new Set();

  const parts = field.split(",");

  for (const part of parts) {
    // Rango con paso: 1-5/2 o */2
    if (part.includes("/")) {
      const [rangePart, stepStr] = part.split("/");
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step < 1) {
        throw new Error(`Paso invalido: ${stepStr}`);
      }

      let start = min;
      let end = max;

      if (rangePart === "*") {
        // */step
        start = min;
      } else if (rangePart.includes("-")) {
        const [s, e] = rangePart.split("-").map(Number);
        start = s;
        end = e;
      } else {
        start = parseInt(rangePart, 10);
      }

      for (let i = start; i <= end; i += step) {
        values.add(i);
      }
    } else if (part.includes("-")) {
      // Rango: 1-5
      const [start, end] = part.split("-").map(Number);
      if (isNaN(start) || isNaN(end)) {
        throw new Error(`Rango invalido: ${part}`);
      }
      for (let i = start; i <= end; i++) {
        values.add(i);
      }
    } else if (part === "*") {
      for (let i = min; i <= max; i++) {
        values.add(i);
      }
    } else {
      const num = parseInt(part, 10);
      if (isNaN(num)) {
        throw new Error(`Valor invalido: ${part}`);
      }
      values.add(num);
    }
  }

  // Validar que todos los valores esten en rango
  for (const v of values) {
    if (v < min || v > max) {
      throw new Error(`Valor ${v} fuera de rango [${min}-${max}]`);
    }
  }

  return Array.from(values).sort((a, b) => a - b);
};

/**
 * Parsea los 5 campos de una expresion cron.
 */
const parseCronFields = (cron: string): CronField[] => {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Se esperan 5 campos, se recibieron ${parts.length}`);
  }

  return parts.map((part, index) => ({
    values: parseField(part, FIELD_RANGES[index].min, FIELD_RANGES[index].max)
  }));
};

/**
 * Valida una expresion cron de 5 campos.
 */
const parseExpression = (cron: string): CronParseResult => {
  try {
    if (!cron || typeof cron !== "string") {
      return { valid: false, error: "Expresion cron vacia o invalida" };
    }

    parseCronFields(cron);
    const description = getDescription(cron);

    return { valid: true, description };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return { valid: false, error: `Expresion cron invalida: ${message}` };
  }
};

/**
 * Calcula la proxima ejecucion a partir de una expresion cron.
 * Busca la proxima fecha/hora que coincida con todos los campos.
 */
const getNextRun = (cron: string, from?: Date): Date => {
  const fields = parseCronFields(cron);
  const [minutes, hours, daysOfMonth, months, daysOfWeek] = fields.map(f => f.values);

  // Empezar desde el siguiente minuto
  const start = from ? new Date(from.getTime()) : new Date();
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 1);

  // Limite de busqueda: 2 anos
  const limit = new Date(start.getTime() + 2 * 365 * 24 * 60 * 60 * 1000);

  const current = new Date(start.getTime());

  while (current < limit) {
    const month = current.getMonth() + 1; // 1-12
    const dayOfMonth = current.getDate();
    const dayOfWeek = current.getDay(); // 0-6
    const hour = current.getHours();
    const minute = current.getMinutes();

    // Verificar mes
    if (!months.includes(month)) {
      // Avanzar al primer dia del siguiente mes valido
      current.setDate(1);
      current.setHours(0, 0, 0, 0);
      current.setMonth(current.getMonth() + 1);
      continue;
    }

    // Verificar dia del mes Y dia de la semana
    const dayOfMonthMatch = daysOfMonth.length === 31 ? true : daysOfMonth.includes(dayOfMonth);
    const dayOfWeekMatch = daysOfWeek.length === 7 ? true : daysOfWeek.includes(dayOfWeek);

    // Si ambos campos son restrictivos (no *), basta que coincida uno (union)
    // Si solo uno es restrictivo, debe coincidir ese
    const domIsWild = daysOfMonth.length === 31;
    const dowIsWild = daysOfWeek.length === 7;

    let dayMatch = false;
    if (domIsWild && dowIsWild) {
      dayMatch = true;
    } else if (domIsWild) {
      dayMatch = dayOfWeekMatch;
    } else if (dowIsWild) {
      dayMatch = dayOfMonthMatch;
    } else {
      // Ambos restrictivos: union (comportamiento cron estandar)
      dayMatch = dayOfMonthMatch || dayOfWeekMatch;
    }

    if (!dayMatch) {
      // Avanzar al siguiente dia
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
      continue;
    }

    // Verificar hora
    if (!hours.includes(hour)) {
      // Avanzar a la siguiente hora valida
      const nextHour = hours.find(h => h > hour);
      if (nextHour !== undefined) {
        current.setHours(nextHour, minutes[0], 0, 0);
      } else {
        // No hay hora valida hoy, avanzar al siguiente dia
        current.setDate(current.getDate() + 1);
        current.setHours(0, 0, 0, 0);
      }
      continue;
    }

    // Verificar minuto
    if (!minutes.includes(minute)) {
      const nextMinute = minutes.find(m => m > minute);
      if (nextMinute !== undefined) {
        current.setMinutes(nextMinute, 0, 0);
      } else {
        // No hay minuto valido en esta hora, avanzar a la siguiente hora
        current.setHours(current.getHours() + 1, 0, 0, 0);
      }
      continue;
    }

    // Coincide todo
    return new Date(current.getTime());
  }

  // Fallback: no se encontro coincidencia en 2 anos (no deberia pasar)
  logger.warn(`[CronParser] No se encontro proxima ejecucion para: ${cron}`);
  return new Date(limit.getTime());
};

/**
 * Genera una descripcion legible en espanol de una expresion cron.
 */
const getDescription = (cron: string): string => {
  try {
    const fields = parseCronFields(cron);
    const [minutes, hours, daysOfMonth, months, daysOfWeek] = fields.map(f => f.values);

    const parts = cron.trim().split(/\s+/);

    // Caso: "* * * * *" → cada minuto
    if (parts.every(p => p === "*")) {
      return "Cada minuto";
    }

    // Detectar patron */N en minutos
    if (parts[0].startsWith("*/") && parts[1] === "*" && parts[2] === "*" && parts[3] === "*" && parts[4] === "*") {
      const step = parseInt(parts[0].split("/")[1], 10);
      return `Cada ${step} minutos`;
    }

    // Detectar patron */N en horas
    if (parts[0] !== "*" && parts[1].startsWith("*/") && parts[2] === "*" && parts[3] === "*" && parts[4] === "*") {
      const step = parseInt(parts[1].split("/")[1], 10);
      const minStr = minutes[0].toString().padStart(2, "0");
      return `Cada ${step} horas a los :${minStr}`;
    }

    // Solo minutos fijos y */N en horas
    if (parts[1].startsWith("*/") && parts[2] === "*" && parts[3] === "*" && parts[4] === "*") {
      const step = parseInt(parts[1].split("/")[1], 10);
      return `Cada ${step} horas`;
    }

    const minStr = minutes.length === 1
      ? minutes[0].toString().padStart(2, "0")
      : minutes.map(m => m.toString().padStart(2, "0")).join(", ");

    const hourStr = hours.length === 1
      ? hours[0].toString().padStart(2, "0")
      : hours.map(h => h.toString().padStart(2, "0")).join(", ");

    const timeStr = `${hourStr}:${minStr}`;

    // Todos los dias a hora fija
    if (parts[2] === "*" && parts[3] === "*" && parts[4] === "*") {
      if (hours.length === 1 && minutes.length === 1) {
        return `Todos los dias a las ${timeStr}`;
      }
      return `Todos los dias a las ${timeStr}`;
    }

    // Dias especificos de la semana
    if (parts[2] === "*" && parts[3] === "*" && parts[4] !== "*") {
      const dayNames = daysOfWeek.map(d => DAY_NAMES[d]);
      if (dayNames.length === 1) {
        return `${dayNames[0]} a las ${timeStr}`;
      }
      return `${dayNames.join(", ")} a las ${timeStr}`;
    }

    // Dias especificos del mes
    if (parts[2] !== "*" && parts[3] === "*" && parts[4] === "*") {
      const dayStr = daysOfMonth.join(", ");
      return `Dia ${dayStr} de cada mes a las ${timeStr}`;
    }

    // Meses especificos
    if (parts[3] !== "*") {
      const monthNames = months.map(m => MONTH_NAMES[m]);
      return `En ${monthNames.join(", ")} a las ${timeStr}`;
    }

    return `Cron: ${cron}`;
  } catch (error: unknown) {
    return `Expresion cron: ${cron}`;
  }
};

export default {
  parseExpression,
  getNextRun,
  getDescription
};
