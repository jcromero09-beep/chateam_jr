/**
 * formatLastMessagePreview
 *
 * Formatea el texto del último mensaje (ticket.lastMessage) para mostrarlo en
 * la lista de tickets y paneles de resumen.
 *
 * Caso principal: cuando el último mensaje es un contacto (vCard), el body
 * guardado es el vCard crudo ("BEGIN:VCARD\nVERSION:3.0\nN:;Jheyso...").
 * En ese caso devolvemos solo el/los nombre(s) del contacto, precedido de 👤.
 *
 * Cualquier otro texto se devuelve intacto. No muta datos (solo presentación),
 * por lo que respeta la BD SAGRADA y cubre tickets ya existentes.
 */

// Desescapa las secuencias estándar de vCard (\n, \, , \; , \\)
function unescapeVCardValue(value: string): string {
  return value
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim()
}

// A partir del valor de "N:" (apellido;nombre;;;) arma "Nombre Apellido"
function parseStructuredName(value: string): string {
  const [lastName = '', firstName = ''] = value.split(';')
  return `${unescapeVCardValue(firstName)} ${unescapeVCardValue(lastName)}`.trim()
}

/** Extrae los nombres de todos los contactos incluidos en un body vCard. */
export function extractVCardNames(body: string): string[] {
  const names: string[] = []
  const blocks = body.split(/(?=BEGIN:VCARD)/)

  for (const block of blocks) {
    if (!block.includes('BEGIN:VCARD')) continue

    const fnMatch = block.match(/^FN(?:;[^:]*)?:(.+)$/m)
    const nMatch = block.match(/^N(?:;[^:]*)?:(.+)$/m)

    let name = ''
    if (fnMatch && fnMatch[1].trim()) {
      name = unescapeVCardValue(fnMatch[1])
    } else if (nMatch && nMatch[1].trim()) {
      name = parseStructuredName(nMatch[1])
    }

    if (name) names.push(name)
  }

  return names
}

export function isVCard(text?: string | null): boolean {
  return !!text && text.includes('BEGIN:VCARD')
}

export function formatLastMessagePreview(text?: string | null): string {
  if (!text) return ''

  if (isVCard(text)) {
    const names = extractVCardNames(text)
    if (names.length > 0) {
      return `👤 ${names.join(', ')}`
    }
    return '👤 Contacto'
  }

  return text
}

export default formatLastMessagePreview
