/**
 * Resolución del markup (margen) aplicado al costo crudo del proveedor antes
 * de convertirlo a créditos internos (spec §6).
 *
 *   creditosCobrados = ceil(costoProveedorUsd * markup * USD_TO_TOKENS)
 *
 * El markup es configurable por plan/tenant. Por ahora se resuelve desde env
 * (`GENERATION_MARKUP`, default 1.0 = sin margen extra). Se deja un punto de
 * extensión `resolveMarkup(companyId)` para, más adelante, leerlo del plan de
 * la company sin tocar el resto de la capa.
 */

/** Markup global default (factor multiplicativo). */
export function getDefaultMarkup(): number {
  const raw = process.env.GENERATION_MARKUP;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 1.0;
}

/**
 * Resuelve el markup para una company. Hoy devuelve el global; el parámetro
 * queda para una futura tabla de markup por plan/tenant.
 */
export async function resolveMarkup(_companyId?: number | null): Promise<number> {
  return getDefaultMarkup();
}
