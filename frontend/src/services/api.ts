import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios'
import { toast } from 'react-toastify'

const API_URL = import.meta.env.VITE_API_URL || ''

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

    if (!isSilentRoute) {
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
          window.location.href = '/login'
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
      // No mostrar si no hay token (usuario cerró sesión). Silenciar pollers de fondo (no son
      // acción del usuario) y deduplicar el resto: 3 pollers no deben apilar 3 toasts idénticos.
      const bgPoller = /chats-total-unreads|total-unreads|notifications|heartbeat/i.test(
        originalRequest?.url || ''
      )
      if (localStorage.getItem('token') && !bgPoller) {
        toast.error('Error de conexión. Verifica tu conexión a internet.', { toastId: 'net-error' })
      }
    }

    return Promise.reject(error)
  }
)

export default api
