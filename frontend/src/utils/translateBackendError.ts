/**
 * translateBackendError
 *
 * Traduce los códigos de error del backend (AppError, p. ej. "ERR_DUPLICATED_CONTACT")
 * a mensajes claros en español para mostrar al usuario.
 *
 * Uso:
 *   catch (error) {
 *     setFormError(translateBackendError(error, 'Error al guardar el contacto'))
 *   }
 */

// Mapa de código de error -> mensaje amigable en español
const ERROR_MESSAGES: Record<string, string> = {
  // Contactos
  ERR_DUPLICATED_CONTACT:
    'Ya existe un contacto con ese número de teléfono.',
  ERR_NO_CONTACT_FOUND: 'No se encontró el contacto.',

  // Genéricos frecuentes
  ERR_SESSION_EXPIRED: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  ERR_NO_PERMISSION: 'No tienes permisos para realizar esta acción.',
  ERR_OUT_OF_HOURS: 'Fuera del horario de atención.',
}

interface BackendErrorShape {
  response?: {
    data?: {
      error?: string
      message?: string
    }
  }
  message?: string
}

/** Extrae el código/mensaje crudo del error de Axios/AppError. */
function extractRawCode(error: unknown): string {
  const err = error as BackendErrorShape
  return (
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.message ||
    ''
  )
}

export function translateBackendError(
  error: unknown,
  fallback = 'Ocurrió un error. Inténtalo de nuevo.'
): string {
  const raw = extractRawCode(error)
  if (!raw) return fallback

  // Coincidencia exacta por código
  if (ERROR_MESSAGES[raw]) return ERROR_MESSAGES[raw]

  // Si el backend ya devolvió un texto legible (no es un código ERR_...),
  // lo mostramos tal cual.
  if (!/^ERR_[A-Z0-9_]+$/.test(raw)) return raw

  // Código ERR_ desconocido -> fallback claro
  return fallback
}

export default translateBackendError
