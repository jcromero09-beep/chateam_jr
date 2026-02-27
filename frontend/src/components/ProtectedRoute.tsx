import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { usePermissions } from '../hooks/usePermissions'
import { Module } from '../utils/permissions'
import AppLayout from './AppLayout'
import AccessDenied from './AccessDenied'

interface ProtectedRouteProps {
  children: ReactNode
  module?: Module
  requireAuth?: boolean
}

/**
 * Componente ProtectedRoute con sistema RBAC
 * - Verifica autenticación
 * - Verifica permisos de acceso al módulo
 * - Renderiza el layout automáticamente
 * - Muestra AccessDenied si no tiene permisos
 */
export default function ProtectedRoute({
  children,
  module,
  requireAuth = true,
}: ProtectedRouteProps) {
  const { isAuthenticated, loading } = useAuth()
  const { canAccess } = usePermissions()

  // Mostrar loading mientras se verifica la autenticación
  if (loading) {
    return (
      <AppLayout>
        <div>Cargando...</div>
      </AppLayout>
    )
  }

  // Redirigir a login si no está autenticado y se requiere autenticación
  if (requireAuth && !isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Si se especifica un módulo, verificar permisos
  if (module && !canAccess(module)) {
    return (
      <AppLayout>
        <AccessDenied message={`No tienes permisos para acceder al módulo: ${module}`} />
      </AppLayout>
    )
  }

  // Renderizar con layout si está autenticado y tiene permisos
  return <AppLayout>{children}</AppLayout>
}
