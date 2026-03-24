import { useState, useEffect, useRef } from 'react'
import { Socket } from 'socket.io-client'
import authService from '../services/authService'
import socketService from '../services/socket'
import { setLoggingOut } from '../services/api'
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
  const initRef = useRef(false)

  useEffect(() => {
    // Guardia contra doble ejecución por React StrictMode
    if (initRef.current) return
    initRef.current = true

    const initAuth = async () => {
      const token = authService.getToken()

      if (token) {
        try {
          const isValid = await authService.validateToken()

          if (isValid) {
            const userData = await authService.getCurrentUser()
            setUser(userData)
            setIsAuthenticated(true)
          } else {
            setIsAuthenticated(false)
          }
        } catch (error) {
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
    if (user && user.id && user.companyId) {
      const io = socketService.connect(user.companyId, user.id)
      setSocket(io)
    }

    return () => {
      // No desconectamos el socket en cleanup para mantener la conexion
    }
  }, [user])

  const login = async (email: string, password: string, force: boolean = false) => {
    try {
      const data = await authService.login({ email, password, force })
      setUser(data.user)
      setIsAuthenticated(true)
      return { success: true }
    } catch (error: any) {
      // Auto-force: si hay sesión web activa (409), reintentar cerrando la sesión anterior
      if (error.response?.status === 409 && !force) {
        return login(email, password, true)
      }

      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Credenciales inválidas'
      toast.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  const logout = async () => {
    // 0. INMEDIATO: suprimir errores ANTES de cualquier acción
    setLoggingOut(true)

    try {
      // 1. Desconectar socket (errores ya suprimidos por flag)
      socketService.disconnect()
      setSocket(null)

      // 2. Ejecutar logout en el servidor
      await authService.logout()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      // 3. Limpiar estado de React
      setUser(null)
      setIsAuthenticated(false)

      // 4. Resetear flag de logout después de 2s
      // (permite que todas las requests pendientes terminen de ser suprimidas)
      setTimeout(() => {
        setLoggingOut(false)
      }, 2000)
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
