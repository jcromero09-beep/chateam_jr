import api from './api'

// Claves en localStorage para preservar el token original del super mientras
// está "dentro" de una empresa (impersonación). El sid NO cambia: el token de
// impersonación reusa el sid del super, así que solo intercambiamos el JWT.
const ORIGINAL_TOKEN_KEY = 'impersonation_original_token'

/**
 * ¿El super está actualmente dentro de una empresa (impersonando)?
 * Se apoya en localStorage para ser robusto ante recargas de página.
 */
export function isImpersonating(): boolean {
  return !!localStorage.getItem(ORIGINAL_TOKEN_KEY)
}

/**
 * Entrar a una empresa como super (impersonación auditada).
 * Pide al backend un JWT con el companyId destino + impersonatedBy=superId,
 * guarda el token original para poder volver, y recarga la app en el contexto
 * operativo de la empresa.
 */
export async function enterCompany(companyId: number): Promise<void> {
  const { data } = await api.post(`/companies/${companyId}/enter`)
  if (!data?.token) {
    throw new Error('No se recibió token de impersonación')
  }
  // Preservar el token original del super (solo si no estábamos ya dentro).
  if (!localStorage.getItem(ORIGINAL_TOKEN_KEY)) {
    const currentToken = localStorage.getItem('token')
    if (currentToken) localStorage.setItem(ORIGINAL_TOKEN_KEY, currentToken)
  }
  // Cambiar al token de impersonación y recargar en el contexto de la empresa.
  localStorage.setItem('token', data.token)
  window.location.href = '/'
}

/**
 * [Multi-empresa] Cambiar de empresa activa (membresía propia, NO impersonación).
 * Re-emite el token apuntando a otra empresa donde el usuario es miembro y recarga.
 * No guarda token original: cambiar entre empresas propias es solo re-scoping; se
 * vuelve con el mismo selector.
 */
export async function switchCompany(companyId: number): Promise<void> {
  const { data } = await api.post(`/switch-company/${companyId}`)
  if (!data?.token) {
    throw new Error('No se recibió token de cambio de empresa')
  }
  // Al cambiar de empresa, cualquier impersonación previa deja de aplicar.
  localStorage.removeItem('impersonation_original_token')
  localStorage.setItem('token', data.token)
  window.location.href = '/'
}

/**
 * Salir de la empresa y volver al modo plataforma del super.
 * Registra la salida en auditoría, restaura el token original y recarga
 * el listado de empresas.
 */
export async function exitCompany(): Promise<void> {
  const original = localStorage.getItem(ORIGINAL_TOKEN_KEY)
  try {
    await api.post('/companies/exit')
  } catch {
    // No romper el retorno aunque la auditoría de salida falle.
  }
  if (original) {
    localStorage.setItem('token', original)
  }
  localStorage.removeItem(ORIGINAL_TOKEN_KEY)
  window.location.href = '/companies'
}
