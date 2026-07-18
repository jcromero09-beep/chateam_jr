/**
 * Helpers para mostrar nombres de contactos de forma consistente
 * entre la lista de tickets y el encabezado del chat.
 *
 * Problema resuelto:
 *  - WhatsApp/Baileys puede crear contactos sin push_name humano,
 *    quedando con name === number en BD (146 casos vistos en producción).
 *  - Eventos socket pueden traer payloads parciales del contacto donde
 *    name === number, pisando un nombre humano que sí existe en otra vista.
 *
 * Reglas:
 *  - displayContactName: devuelve el name humano si existe y es distinto del number.
 *    En caso contrario, fallback al number. Nunca retorna cadena vacía.
 *  - displayContactSubtitle: devuelve el number sólo cuando tenemos un name humano
 *    distinto, para que pueda mostrarse como subtítulo sin duplicar el título.
 *  - mergeContactPreservingName: al fusionar un contacto entrante con uno previo,
 *    si el entrante no trae un name humano válido pero el previo sí, conserva el
 *    name humano (evita que un evento socket parcial degrade el header del chat).
 */

export interface ContactLike {
  id?: number
  name?: string | null
  number?: string | null
}

const safeTrim = (value?: string | null): string => (value ?? "").toString().trim()

const isHumanName = (name: string, number: string): boolean => {
  if (!name) return false
  if (name === number) return false
  // Name "humano" debe contener al menos una letra
  return /[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]/.test(name)
}

export const displayContactName = (contact?: ContactLike | null): string => {
  if (!contact) return "—"
  const name = safeTrim(contact.name)
  const number = safeTrim(contact.number)

  if (isHumanName(name, number)) return name
  if (number) return number
  if (name) return name
  return "—"
}

export const displayContactSubtitle = (contact?: ContactLike | null): string | null => {
  if (!contact) return null
  const name = safeTrim(contact.name)
  const number = safeTrim(contact.number)
  if (isHumanName(name, number) && number) return number
  return null
}

/**
 * Inicial para usar en Avatar fallback. Siempre devuelve un carácter visible.
 */
export const contactAvatarInitial = (contact?: ContactLike | null): string => {
  const display = displayContactName(contact)
  const first = display.charAt(0)
  return first || "?"
}

/**
 * Fusiona un contacto entrante (de socket o API) con el previo, preservando
 * el name humano si el entrante no trae uno válido.
 *
 * Reglas:
 *  - Si el entrante es null/undefined → devuelve el previo intacto.
 *  - Si el entrante tiene un name humano (con letras y distinto de su number)
 *    → el entrante es la fuente de verdad y se aplica completo.
 *  - Si el entrante NO tiene name humano → se hace spread del entrante pero se
 *    preserva el name previo cuando este sí era humano.
 */
export const mergeContactPreservingName = <T extends ContactLike>(
  previous: T | null | undefined,
  incoming: Partial<T> | null | undefined
): T | undefined => {
  if (!incoming) return previous ?? undefined
  if (!previous) return incoming as T

  const incomingName = safeTrim(incoming.name as string | null | undefined)
  const incomingNumber = safeTrim((incoming.number ?? previous.number) as string | null | undefined)
  const previousName = safeTrim(previous.name)
  const previousNumber = safeTrim(previous.number)

  const incomingIsHuman = isHumanName(incomingName, incomingNumber)
  const previousIsHuman = isHumanName(previousName, previousNumber)

  // Spread base
  const merged = {
    ...previous,
    ...incoming
  } as T

  // Si el entrante no tiene name humano pero el previo sí, conservamos el previo
  if (!incomingIsHuman && previousIsHuman) {
    merged.name = previous.name
  }

  return merged
}
