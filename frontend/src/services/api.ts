import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios'
import { toast } from 'react-toastify'

const API_URL = import.meta.env.VITE_API_URL || ''

// Pollers/lecturas de fondo (no son acción del usuario): badge de unreads, chip "Tokens IA",
// banner de comunicados (GET), routing-preview de coexistencia. Se usan para (a) darles un timeout
// corto —que fallen rápido y en silencio en vez de colgar 30s cuando el NAS se satura— y (b)
// silenciar sus errores (ni console.error ni toast), para que un timeout de fondo NO se vea como
// desconexión. `announcements$` matchea el GET del banner pero NO `/announcements/broadcast`.
const BG_POLLER_RE = /chats-total-unreads|total-unreads|notifications|heartbeat|token-info|routing-preview|announcements$/i
const BG_POLLER_TIMEOUT = 15000

// --- Flag de logout para suprimir errores durante cierre de sesión ---
let isLoggingOut = false

export function setLoggingOut(value: boolean): void {
  isLoggingOut = value
}

// Crear instancia de Axios
const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

// Request Interceptor - Agregar token a todas las requests
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token')

    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }

    // Mantener el access token fresco (refresh proactivo antes de expirar) para
    // que los pollers/requests no peguen 401 en ráfaga cada ~15min.
    if (token) ensureTokenRefreshScheduled(token)

    // Pollers de fondo: timeout corto para que fallen rápido y en silencio en saturación del NAS
    // (en vez de colgar los 30s globales). Solo si el caller no fijó un timeout explícito propio.
    if (config.url && BG_POLLER_RE.test(config.url) && (config.timeout == null || config.timeout === 30000)) {
      config.timeout = BG_POLLER_TIMEOUT
    }

    // Identifica el canal para la política de sesión por canal.
    if (config.headers && !config.headers['x-client-type']) {
      config.headers['x-client-type'] = 'web'
    }

    // ✅ NO forzar Content-Type cuando es FormData (Axios lo maneja automáticamente con el boundary)
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
      // Las subidas de archivos (videos/PDF/audio) pueden tardar más que el timeout
      // global de 30s. Un video de ~38MB en una conexión típica supera los 30s y axios
      // abortaba la petición antes de completar (síntoma: archivos grandes "no avanzan",
      // los pequeños sí). Damos 5 min a los uploads multipart salvo override explícito.
      if (config.timeout == null || config.timeout === 30000) {
        config.timeout = 300000
      }
    }

    // Log en desarrollo
    if (import.meta.env.VITE_DEBUG === 'true') {
      console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`, {
        headers: config.headers,
        data: config.data,
      })
    }

    return config
  },
  (error) => {
    console.error('[API Request Error]', error)
    return Promise.reject(error)
  }
)

// Variables para manejar el refresh token
let isRefreshing = false
let failedQueue: Array<{
  resolve: (value?: any) => void
  reject: (reason?: any) => void
}> = []

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })

  failedQueue = []
}

// ── Refresh proactivo del access token ───────────────────────────────────────
// El access token vive ~15min. Sin refresh proactivo, cuando expira una ráfaga
// de requests (pollers de AppLayout, routing-preview, token-info, unreads…)
// devuelve 401 antes de que el refresh reactivo las reintente → la consola se
// llena de 401 cada ~15min. Refrescamos el token ~60s ANTES de expirar para que
// esas requests nunca peguen el 401.
// Diseño loop-safe y defensivo: 1 solo timer; si el refresh proactivo falla es
// un NO-OP (no cerramos sesión) y no se reintenta proactivamente ese token
// (`failedForToken`) — el próximo 401 real dispara el refresh reactivo de siempre.
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let scheduledForToken: string | null = null
let failedForToken: string | null = null

function decodeJwtExpMs(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof json.exp === 'number' ? json.exp * 1000 : null
  } catch {
    return null
  }
}

async function doProactiveRefresh(forToken: string): Promise<void> {
  refreshTimer = null
  // Si el token cambió mientras esperábamos, o hay un refresh en curso, no hacemos nada.
  if (localStorage.getItem('token') !== forToken || isRefreshing) return
  isRefreshing = true
  try {
    const response = await axios.post(
      `${API_URL}/api/auth/refresh_token`,
      {},
      { baseURL: API_URL, withCredentials: true, headers: { 'x-client-type': 'web' } }
    )
    const newToken = response.data?.token
    if (newToken) {
      localStorage.setItem('token', newToken)
      processQueue(null, newToken)
      scheduledForToken = null // fuerza reprogramar para el nuevo token
      failedForToken = null
    } else {
      failedForToken = forToken
    }
  } catch {
    // NO-OP deliberado: no cerramos sesión ni reintentamos proactivamente este
    // token (evita loop). El próximo 401 real usa el refresh reactivo, con su
    // manejo de session_revoked/logout.
    failedForToken = forToken
  } finally {
    isRefreshing = false
  }
}

// Programa (o reprograma) el refresh proactivo solo cuando el token cambia.
// Idempotente: seguro llamarla en cada request desde el interceptor.
function ensureTokenRefreshScheduled(token: string): void {
  if (typeof window === 'undefined') return
  if (token === scheduledForToken || token === failedForToken) return
  const expMs = decodeJwtExpMs(token)
  scheduledForToken = token
  if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null }
  if (!expMs) return // token opaco/sin exp: lo cubre el flujo reactivo
  const LEAD_MS = 60_000
  const delay = Math.max(5_000, expMs - Date.now() - LEAD_MS)
  refreshTimer = setTimeout(() => { void doProactiveRefresh(token) }, delay)
}

// Limpia el timer (logout / sesión terminada) para que no dispare un refresh
// que reviva la sesión con la cookie residual.
export function clearTokenRefresh(): void {
  if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null }
  scheduledForToken = null
  failedForToken = null
}

// Response Interceptor - Manejar errores globalmente
api.interceptors.response.use(
  (response) => {
    // Log en desarrollo
    if (import.meta.env.VITE_DEBUG === 'true') {
      console.log(`[API Response] ${response.config.method?.toUpperCase()} ${response.config.url}`, {
        status: response.status,
        data: response.data,
      })
    }

    return response
  },
  async (error: AxiosError) => {
    // Suprimir TODOS los errores durante logout (race condition prevention)
    if (isLoggingOut) {
      return Promise.reject(error)
    }

    // Suprimir requests canceladas (AbortController)
    if (axios.isCancel(error)) {
      return Promise.reject(error)
    }

    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // Suprimir logs para rutas de auth donde los errores son esperados (401 validate, 409 login, etc.)
    const silentAuthUrls = ['/api/auth/validate', '/api/auth/login', '/api/auth/refresh_token']
    const isSilentRoute = silentAuthUrls.some(url => originalRequest?.url?.includes(url))

    // Pollers/lecturas de fondo (ver BG_POLLER_RE): un timeout suyo en saturación NO es desconexión.
    const isBgPoller = BG_POLLER_RE.test(originalRequest?.url || '')

    // 401 transitorios (el interceptor los refresca+reintenta abajo) y pollers de fondo (se
    // auto-manejan): no ensuciamos la consola con ninguno.
    if (!isSilentRoute && !isBgPoller && error.response?.status !== 401) {
      console.error('[API Response Error]', {
        status: error.response?.status,
        message: error.message,
        url: error.config?.url,
      })
    }

    // Si es 401 (No autorizado) y no es la ruta de login/refresh
    const isAuthRoute = originalRequest?.url === '/api/auth/login' ||
      originalRequest?.url === '/api/auth/refresh_token'

    if (error.response?.status === 401 && !isAuthRoute) {
      // No intentar refresh durante logout
      if (isLoggingOut) {
        return Promise.reject(error)
      }

      // Si el backend indica que la sesión fue revocada (login en otro
      // dispositivo o logout forzado), no tiene sentido refrescar:
      // limpiamos local y mandamos a login con mensaje específico.
      const errCode = (error.response?.data as any)?.error
      if (errCode === 'session_revoked') {
        processQueue(error, null)
        isRefreshing = false
        localStorage.removeItem('token')
        localStorage.removeItem('refreshToken')
        localStorage.removeItem('sid')
        try {
          toast.info('Tu sesión fue iniciada en otro dispositivo.')
        } catch {/* noop */}
        window.location.href = '/login?reason=session_revoked'
        return Promise.reject(error)
      }

      if (isRefreshing) {
        // Si ya hay un refresh en progreso, agregar esta request a la cola
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then(token => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`
            }
            return api(originalRequest)
          })
          .catch(err => {
            return Promise.reject(err)
          })
      }

      originalRequest._retry = true
      isRefreshing = true

      // Intentar refrescar el token (web: cookie HTTPOnly jrt)
      try {
        console.log('[API] Attempting token refresh...')

        const response = await axios.post(
          `${API_URL}/api/auth/refresh_token`,
          {},
          {
            baseURL: API_URL,
            withCredentials: true,
            headers: { 'x-client-type': 'web' }
          }
        )

        const { token: newToken } = response.data

        console.log('[API] Token refresh successful')

        // Guardar nuevo token
        localStorage.setItem('token', newToken)

        // Procesar la cola de requests pendientes
        processQueue(null, newToken)

        // Reprogramar el refresh proactivo para el nuevo token (el próximo request lo agenda).
        clearTokenRefresh()

        // Reintentar request original con nuevo token
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`
        }

        isRefreshing = false
        return api(originalRequest)
      } catch (refreshError: any) {
        // Si falla el refresh, limpiar tokens y redirigir a login
        console.error('[API] Token refresh failed:', refreshError)

        processQueue(refreshError, null)
        isRefreshing = false

        localStorage.removeItem('token')
        localStorage.removeItem('refreshToken')
        localStorage.removeItem('sid')

        const refreshErrCode = refreshError?.response?.data?.error
        if (refreshErrCode === 'session_revoked') {
          try { toast.info('Tu sesión fue iniciada en otro dispositivo.') } catch {/* noop */}
          window.location.href = '/login?reason=session_revoked'
        } else {
          toast.error('Sesión expirada. Por favor inicia sesión nuevamente.')
          // ?reason= → el Login muestra un banner claro (evita que la desconexión se vea como "error").
          window.location.href = '/login?reason=session_expired'
        }
        return Promise.reject(refreshError)
      }
    }

    // Manejar otros errores
    // Mostrar toast para errores específicos
    if (error.response?.status === 403) {
      toast.error('No tienes permisos para realizar esta acción')
    } else if (error.response?.status === 404) {
      toast.error('Recurso no encontrado')
    } else if (error.response?.status === 429) {
      toast.error('Demasiadas solicitudes. Por favor, espera un momento.')
    } else if (error.response?.status && error.response.status >= 500) {
      // toastId evita apilamiento cuando varias requests fallan a la vez (p.ej. reinicio backend).
      toast.error('Error del servidor. Por favor, intenta más tarde.', { toastId: 'server-error' })
    } else if (!error.response) {
      // Sin respuesta (timeout de red / caída). No avisamos si no hay token (usuario cerró sesión)
      // ni para pollers de fondo (`isBgPoller`, arriba): un timeout de un poll en saturación NO es
      // desconexión. El resto se deduplica con toastId para no apilar toasts idénticos.
      if (localStorage.getItem('token') && !isBgPoller) {
        toast.error('Error de conexión. Verifica tu conexión a internet.', { toastId: 'net-error' })
      }
    }

    return Promise.reject(error)
  }
)

export default api
