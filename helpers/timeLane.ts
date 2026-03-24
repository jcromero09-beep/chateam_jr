/**
 * timeLane.ts — Helper compartido para conversión de unidades de tiempo del Kanban
 *
 * El campo Tag.timeLane almacena un valor numérico cuya unidad se define en
 * Tag.timeLaneUnit ('minutes' | 'hours' | 'days'). Por compatibilidad,
 * el default es 'hours' (comportamiento original con setHours).
 */

const MULTIPLIERS: Record<string, number> = {
  minutes: 60_000,        // 1 minuto en ms
  hours:   3_600_000,     // 1 hora en ms
  days:    86_400_000,    // 1 día en ms
};

/**
 * Convierte un valor de timeLane a milisegundos
 * @param value - Valor numérico del timeLane
 * @param unit - Unidad: 'minutes' | 'hours' | 'days' (default: 'hours')
 * @returns Milisegundos equivalentes
 */
export function timeLaneToMs(value: number, unit: string = "hours"): number {
  const multiplier = MULTIPLIERS[unit] || MULTIPLIERS.hours;
  return value * multiplier;
}

/**
 * Calcula la fecha límite restando el timeLane del momento actual
 * Útil para comparar: si ticket.updatedAt < timeLaneToDate(value, unit) → vencido
 * @param value - Valor numérico del timeLane
 * @param unit - Unidad: 'minutes' | 'hours' | 'days' (default: 'hours')
 * @returns Date con el momento límite
 */
export function timeLaneToDate(value: number, unit: string = "hours"): Date {
  const d = new Date();
  d.setTime(d.getTime() - timeLaneToMs(value, unit));
  return d;
}
