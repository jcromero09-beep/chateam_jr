import { useState, useEffect, useRef } from 'react'
import { Socket } from 'socket.io-client'
import authService from '../services/authService'
import socketService from '../services/socket'
import { setLoggingOut, clearTokenRefresh } from '../services/api'
import { toast } from 'react-toastify'
import type { InterfacePermissions } from '../utils/permissions'

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

export interface Membership {
  companyId: number
  companyName: string | null
  status?: boolean | string | null
  profile: string
  isCurrent: boolean
}

/**
 * [Ola 4 · RBAC] Rol del usuario en la empresa activa.
 *
 * Este tipo faltaba, así que `usePermissions` leía el rol con `(user as any).role`
 * y el compilador no validaba NADA: un typo en `permissions`/`unrestricted` no daba
 * error, solo hacía que los permisos se evaluaran mal en silencio.
 *
 * Refleja exactamente lo que el backend envía en /auth/me — ROLE_ATTRIBUTES de
 * services/UserServices/ShowUserService.ts: ["id","name","key","unrestricted",
 * "editable","permissions"]. Si el backend cambia esa lista, hay que cambiar esto.
 *
 * Semántica (models/Role.ts): unrestricted=true => el rol no restringe y manda el
 * plan; unrestricted=false => `permissions` es una allow-list y el módulo ausente
 * queda denegado. El acceso efectivo es permisos_del_plan ∩ permisos_del_rol.
 */
export interface Role {
  id: number
  name: string
  /** slug estable: 'super_admin' | 'company_admin' | 'supervisor' | 'agent' | ... */
  key: string
  unrestricted: boolean
  editable: boolean
  /** Mismo shape que Plan.interfacePermissions (JSONB en BD). */
  permissions: InterfacePermissions
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
  /** Rol en la empresa activa. null = sin rol asignado (no restringe). */
  role?: Role | null
  roleId?: number | null
  // Impersonación: el super está "dentro" de una empresa (vista operativa).
  impersonating?: boolean
  impersonatedCompanyName?: string
  // Multi-empresa: empresas donde el usuario tiene membresía (selector de empresa).
  memberships?: Membership[]
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

  const login = async (email: string, password: string) => {
    try {
      const data = await authService.login({ email, password })
      setUser(data.user)
      setIsAuthenticated(true)
      return { success: true }
    } catch (error: any) {
      // El backend ahora SIEMPRE toma control (revoca la sesión web previa).
      // Cualquier 401/403 que llegue aquí es credencial real, horario o canal.
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.error ||
        'Credenciales inválidas'
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

      // Cancelar el refresh proactivo para que no revele/renueve el token tras el logout.
      clearTokenRefresh()

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
