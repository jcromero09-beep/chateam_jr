import api from './api'
// `import type` se elide al compilar, así que no crea ciclo con useAuth (que
// importa este service en runtime). El tipo User vive allí junto a Role/Company/Plan.
import type { User } from '../hooks/useAuth'

export interface LoginCredentials {
  email: string
  password: string
}

export interface LoginResponse {
  token: string
  refreshToken?: string
  sid?: string
  clientType?: 'web' | 'app'
  user: {
    id: number
    name: string
    email: string
    companyId: number
    profile: string
  }
}

export interface RefreshTokenResponse {
  token: string
}

class AuthService {
  /**
   * Login de usuario.
   * Marca explícitamente el canal como web para que el backend aplique la
   * política de "1 sesión web por usuario" sin tocar la sesión móvil.
   */
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response = await api.post(
      '/api/auth/login',
      { ...credentials, clientType: 'web' },
      { headers: { 'x-client-type': 'web' } }
    )
    const data = response.data

    if (data.token) {
      localStorage.setItem('token', data.token)
    }
    if (data.sid) {
      localStorage.setItem('sid', data.sid)
    }

    // En web el refresh token vive en cookie HTTPOnly (jrt). No se guarda en JS.
    // Limpiamos cualquier refreshToken residual de instalaciones legacy.
    localStorage.removeItem('refreshToken')

    return data
  }

  /**
   * Logout de usuario
   */
  async logout(): Promise<void> {
    // Flag isLoggingOut ya activado por useAuth.logout() antes de llegar aquí
    try {
      await api.delete('/api/auth/logout')
    } catch (error) {
      console.warn('Logout request failed:', error)
    } finally {
      // Limpiar tokens independientemente del resultado
      localStorage.removeItem('token')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('sid')
    }
  }

  /**
   * Refrescar token de acceso.
   * En web, el refresh token viaja en la cookie HTTPOnly `jrt` (no en JS).
   */
  async refreshToken(): Promise<string> {
    const response = await api.post<RefreshTokenResponse>(
      '/api/auth/refresh_token',
      {},
      { headers: { 'x-client-type': 'web' } }
    )
    const newToken = response.data.token
    localStorage.setItem('token', newToken)
    return newToken
  }

  /**
   * Validar token actual
   */
  async validateToken(): Promise<boolean> {
    try {
      const response = await api.get('/api/auth/validate')
      return response.status === 200
    } catch (error) {
      return false
    }
  }

  /**
   * Obtener usuario actual
   */
  // [Ola 4] Devolvía `any` implícito, y ese `any` se propagaba a todo el árbol de
  // User en cada consumidor (incluido el RBAC de usePermissions).
  async getCurrentUser(): Promise<User> {
    const response = await api.get<User>('/api/auth/me')
    return response.data
  }

  /**
   * Verificar si el usuario está autenticado
   */
  isAuthenticated(): boolean {
    const token = localStorage.getItem('token')
    return !!token
  }

  /**
   * Obtener token actual
   */
  getToken(): string | null {
    return localStorage.getItem('token')
  }
}

export default new AuthService()
