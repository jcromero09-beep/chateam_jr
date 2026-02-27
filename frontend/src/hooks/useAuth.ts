import { useState, useEffect } from 'react'
import { Socket } from 'socket.io-client'
import authService from '../services/authService'
import socketService from '../services/socket'
import { toast } from 'react-toastify'

export interface Plan {
  id: number
  name: string
  users: number
  connections: number
  queues: number
  useWhatsapp: boolean
  useFacebook: boolean
  useInstagram: boolean
  useCampaigns: boolean
  useSchedules: boolean
  useInternalChat: boolean
  useExternalApi: boolean
  useKanban: boolean
  useOpenAi: boolean
  useIntegrations: boolean
  useMarketing: boolean
  useLeads: boolean
  isPublic: boolean
  trial: boolean
  trialDays: number
  interfacePermissions?: string // JSON con permisos de interfaz por modulo
}

export interface Company {
  id: number
  name: string
  planId: number
  plan?: Plan
  status: boolean
  dueDate: string
}

export interface User {
  id: number
  name: string
  email: string
  companyId: number
  profile: string
  profileImage?: string
  super?: boolean
  company?: Company
}

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [socket, setSocket] = useState<Socket | null>(null)

  useEffect(() => {
    // Verificar si hay token y validarlo
    const initAuth = async () => {
      const token = authService.getToken()

      if (token) {
        try {
          const isValid = await authService.validateToken()

          if (isValid) {
            const userData = await authService.getCurrentUser()
            console.log('useAuth: initAuth - userData:', userData)
            console.log('useAuth: initAuth - companyId:', userData?.companyId)
            setUser(userData)
            setIsAuthenticated(true)
          } else {
            setIsAuthenticated(false)
          }
        } catch (error) {
          console.error('Token validation failed:', error)
          // Clear invalid tokens from localStorage
          authService.logout()
          setIsAuthenticated(false)
        }
      }

      setLoading(false)
    }

    initAuth()
  }, [])

  // Conectar socket cuando el usuario está autenticado
  useEffect(() => {
    console.log('useAuth socket effect - user:', user?.id, 'companyId:', user?.companyId)
    if (user && user.id && user.companyId) {
      console.log('Iniciando conexion socket para user:', user.id, 'company:', user.companyId)
      const io = socketService.connect(user.companyId, user.id)
      setSocket(io)
    }

    return () => {
      // No desconectamos el socket en cleanup para mantener la conexion
    }
  }, [user])

  const login = async (email: string, password: string, force: boolean = false) => {
    console.log('useAuth: Login called with email:', email, 'force:', force)

    try {
      console.log('useAuth: Calling authService.login')
      const data = await authService.login({ email, password, force })
      console.log('useAuth: Login successful, data:', data)
      console.log('useAuth: User data received:', data.user)
      console.log('useAuth: CompanyId in user:', data.user?.companyId)

      setUser(data.user)
      setIsAuthenticated(true)
      return { success: true }
    } catch (error: any) {
      console.error('useAuth: Login error caught:', error)
      console.log('useAuth: Error response:', error.response)
      console.log('useAuth: Error status:', error.response?.status)

      // Manejar error de sesión web activa (HTTP 409)
      if (error.response?.status === 409) {
        const errorCode = error.response?.data?.error
        console.log('useAuth: 409 error detected, errorCode:', errorCode)
        console.log('useAuth: Error data:', error.response?.data)

        if (errorCode === 'web_session_already_active') {
          console.log('useAuth: Returning needsForce: true')
          return {
            success: false,
            error: 'Ya existe una sesión web activa',
            needsForce: true,
            message: error.response?.data?.message || 'Ya existe una sesión web activa. ¿Desea cerrar la sesión anterior y continuar?'
          }
        }
      }

      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Credenciales inválidas'
      console.log('useAuth: Returning error:', errorMessage)
      toast.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  const logout = async () => {
    try {
      await authService.logout()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      socketService.disconnect()
      setSocket(null)
      setUser(null)
      setIsAuthenticated(false)
    }
  }

  return {
    isAuthenticated,
    user,
    loading,
    login,
    logout,
    socket,
  }
}
