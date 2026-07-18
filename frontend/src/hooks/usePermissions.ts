import { useMemo } from 'react'
import { useAuth } from './useAuth'
import {
  Module,
  UserRole,
  InterfacePermissions,
  PermissionLevel,
  hasAccess,
  hasWriteAccess,
  hasReadOnlyAccess,
  getPermissionLevel,
  getAccessibleModules,
  mapProfileToRole,
  parseInterfacePermissions,
  hasAccessByPlan,
  hasWriteAccessByPlan,
  hasReadOnlyAccessByPlan,
  getPermissionLevelByPlan,
  getAccessibleModulesByPlan,
  ALL_MODULES,
} from '../utils/permissions'

/**
 * Hook personalizado para gestionar permisos de usuario
 *
 * SISTEMA DE PERMISOS:
 * 1. Si el usuario tiene super === true, tiene acceso completo a TODO
 * 2. Si no es superadmin, los permisos se obtienen del plan de su empresa
 * 3. Los permisos del plan se almacenan en plan.interfacePermissions (JSON)
 */
export function usePermissions() {
  const { user } = useAuth()

  // Verificar si es superadmin (tiene prioridad sobre todo)
  const isSuperAdmin = useMemo(() => {
    return user?.super === true
  }, [user])

  // Determinar el rol del usuario actual (legacy, pero se mantiene para compatibilidad)
  const userRole: UserRole = useMemo(() => {
    if (!user || !user.profile) {
      return 'user' // Por defecto, usuario basico
    }
    return mapProfileToRole(user.profile)
  }, [user])

  // Obtener permisos del plan de la empresa
  const planPermissions: InterfacePermissions | null = useMemo(() => {
    if (isSuperAdmin) {
      return null // Superadmin no necesita permisos de plan
    }

    // Obtener permisos del plan de la empresa
    const plan = user?.company?.plan
    if (!plan) {
      return null // Sin plan, usar defaults
    }

    // Parsear interfacePermissions del plan
    return parseInterfacePermissions(plan.interfacePermissions)
  }, [user, isSuperAdmin])

  // [Fase3·N2.0] Segundo eje: permisos del ROL (además del plan). Compat total:
  // sin rol asignado o rol `unrestricted` (admin de empresa / super) => pasa (comportamiento actual).
  // [Ola 4] `role` ya está tipado en User (interface Role), así que estos accesos
  // los valida el compilador. Antes eran `(user as any)?.role`: un typo en
  // `permissions`/`unrestricted` no daba error de compilación y degradaba los
  // permisos en silencio.
  const roleGate = (module: Module): boolean => {
    if (isSuperAdmin) return true
    const role = user?.role
    if (!role || role.unrestricted) return true
    const lvl = role.permissions?.[module]
    return lvl === true || lvl === 'read'
  }
  const roleGateWrite = (module: Module): boolean => {
    if (isSuperAdmin) return true
    const role = user?.role
    if (!role || role.unrestricted) return true
    return role.permissions?.[module] === true
  }

  // Funciones de verificacion de permisos: doble filtro plan ∩ rol
  const canAccess = (module: Module): boolean => {
    // Superadmin siempre tiene acceso
    if (isSuperAdmin) return true

    // plan ∩ rol
    return hasAccessByPlan(planPermissions, module, isSuperAdmin) && roleGate(module)
  }

  const canWrite = (module: Module): boolean => {
    // Superadmin siempre tiene acceso de escritura
    if (isSuperAdmin) return true

    // plan ∩ rol
    return hasWriteAccessByPlan(planPermissions, module, isSuperAdmin) && roleGateWrite(module)
  }

  const isReadOnly = (module: Module): boolean => {
    // Superadmin nunca esta en modo solo lectura
    if (isSuperAdmin) return false

    // Usar permisos del plan
    return hasReadOnlyAccessByPlan(planPermissions, module, isSuperAdmin)
  }

  const permissionLevel = (module: Module): PermissionLevel => {
    // Superadmin siempre tiene acceso completo
    if (isSuperAdmin) return true

    // Usar permisos del plan
    return getPermissionLevelByPlan(planPermissions, module, isSuperAdmin)
  }

  const accessibleModules = useMemo(() => {
    // Superadmin tiene acceso a todos los modulos
    if (isSuperAdmin) {
      return ALL_MODULES
    }

    // plan ∩ rol
    const byPlan = getAccessibleModulesByPlan(planPermissions, isSuperAdmin)
    const role = user?.role
    if (!role || role.unrestricted) return byPlan
    const perms = role.permissions ?? {}
    return byPlan.filter((m: Module) => perms[m] === true || perms[m] === 'read')
  }, [planPermissions, isSuperAdmin, user])

  // Verificaciones de rol (mantienen compatibilidad con codigo existente)
  const isAdmin = userRole === 'admin' || isSuperAdmin
  const isSupervisor = userRole === 'supervisor' || isAdmin
  const isUser = userRole === 'user'

  return {
    userRole,
    canAccess,
    canWrite,
    isReadOnly,
    permissionLevel,
    accessibleModules,
    isSuperAdmin,
    isAdmin,
    isSupervisor,
    isUser,
    // Nuevas propiedades para acceso a permisos de plan
    planPermissions,
  }
}
