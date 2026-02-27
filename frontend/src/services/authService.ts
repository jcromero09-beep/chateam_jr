import api from './api'

export interface LoginCredentials {
  email: string
  password: string
  force?: boolean
}

export interface LoginResponse {
  token: string
  refreshToken: string
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
   * Login de usuario
   */
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response = await api.post('/api/auth/login', credentials)
    const data = response.data

    // Guardar access token en localStorage
    if (data.token) {
      localStorage.setItem('token', data.token)
    }

    // Para clientType=web, el refresh token viene en cookie HTTPOnly
    // Para clientType=app, el refresh token viene en response body
    if (data.refreshToken) {
      localStorage.setItem('refreshToken', data.refreshToken)
    }

    return data
  }

  /**
   * Logout de usuario
   */
  async logout(): Promise<void> {
    try {
      await api.post('/api/auth/logout')
    } catch (error) {
      console.error('Error during logout:', error)
    } finally {
      // Limpiar tokens independientemente del resultado
      localStorage.removeItem('token')
      localStorage.removeItem('refreshToken')
    }
  }

  /**
   * Refrescar token de acceso
   */
  async refreshToken(): Promise<string> {
    const refreshToken = localStorage.getItem('refreshToken')

    if (!refreshToken) {
      throw new Error('No refresh token available')
    }

    const response = await api.post<RefreshTokenResponse>('/api/auth/refresh_token', {
      refreshToken,
    })

    const newToken = response.data.token

    // Guardar nuevo token
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
  async getCurrentUser() {
    const response = await api.get('/api/auth/me')
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
