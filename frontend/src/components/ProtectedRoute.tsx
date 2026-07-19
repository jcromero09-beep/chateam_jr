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
  superOnly?: boolean
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
  superOnly = false,
}: ProtectedRouteProps) {
  // `user`, `loading` e `isAuthenticated` salen de la MISMA instancia de useAuth, y de ese
  // mismo `user` derivamos `isSuperAdmin`. NO usamos el isSuperAdmin de usePermissions porque
  // ese hook llama a useAuth() otra vez creando una SEGUNDA instancia con su propio initAuth
  // async: esta instancia marcaba loading=false antes de que la de usePermissions cargara su
  // `user`, así que el super veía un flash de "AccessDenied" que se auto-corregía. Como en
  // useAuth el setUser+setIsAuthenticated+setLoading van batcheados en initAuth, cuando
  // loading=false el `user` de ESTA instancia ya está hidratado y `super` es confiable.
  const { isAuthenticated, loading, user } = useAuth()
  const { canAccess } = usePermissions()
  const isSuperAdmin = user?.super === true

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

  if (superOnly && !isSuperAdmin) {
    return (
      <AppLayout>
        <AccessDenied message="Solo el superadmin puede acceder a este modulo" />
      </AppLayout>
    )
  }

  // Si se especifica un módulo, verificar permisos. El super bypassa módulos (igual que
  // usePermissions.canAccess, que retorna true para super); anteponer `!isSuperAdmin` evita
  // depender del canAccess de la otra instancia de useAuth mientras hidrata (otra fuente del
  // flash para el super en rutas con `module`, como /permissions-manager).
  if (module && !isSuperAdmin && !canAccess(module)) {
    return (
      <AppLayout>
        <AccessDenied message={`No tienes permisos para acceder al módulo: ${module}`} />
      </AppLayout>
    )
  }

  // Renderizar con layout si está autenticado y tiene permisos
  return <AppLayout>{children}</AppLayout>
}
