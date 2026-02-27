import { ReactNode } from 'react'
import { Box, Alert, Typography } from '@mui/joy'
import { Block as BlockIcon } from '@mui/icons-material'
import { Module } from '../utils/permissions'
import { usePermissions } from '../hooks/usePermissions'

interface PermissionGateProps {
  /**
   * Módulo requerido para acceder al contenido
   */
  module?: Module

  /**
   * Array de módulos - el usuario necesita acceso a al menos uno
   */
  modules?: Module[]

  /**
   * Si true, requiere acceso de escritura (no solo lectura)
   * @default false
   */
  requireWrite?: boolean

  /**
   * Si true, requiere acceso a TODOS los módulos en el array
   * Si false, requiere acceso a AL MENOS UNO
   * @default false
   */
  requireAll?: boolean

  /**
   * Contenido a mostrar si el usuario tiene permisos
   */
  children: ReactNode

  /**
   * Contenido alternativo a mostrar si el usuario NO tiene permisos
   * @default null (no muestra nada)
   */
  fallback?: ReactNode

  /**
   * Si true, muestra un mensaje de acceso denegado cuando no tiene permisos
   * Si false, no muestra nada cuando no tiene permisos
   * @default false
   */
  showDeniedMessage?: boolean

  /**
   * Mensaje personalizado para mostrar cuando se deniega el acceso
   */
  deniedMessage?: string
}

/**
 * Componente PermissionGate - Controla el renderizado basado en permisos del usuario
 *
 * Permite mostrar/ocultar componentes según los permisos del usuario actual.
 * Soporta verificación de un módulo individual o múltiples módulos.
 *
 * @example
 * ```tsx
 * // Uso básico - mostrar solo si tiene acceso
 * <PermissionGate module="campaigns">
 *   <CreateCampaignButton />
 * </PermissionGate>
 *
 * // Requiere acceso de escritura
 * <PermissionGate module="campaigns" requireWrite>
 *   <EditCampaignButton />
 * </PermissionGate>
 *
 * // Verificar múltiples módulos (al menos uno)
 * <PermissionGate modules={['campaigns', 'campaigns_insights']}>
 *   <CampaignsSection />
 * </PermissionGate>
 *
 * // Requiere todos los módulos
 * <PermissionGate
 *   modules={['campaigns', 'campaigns_settings']}
 *   requireAll
 *   requireWrite
 * >
 *   <AdvancedCampaignsPanel />
 * </PermissionGate>
 *
 * // Con mensaje de acceso denegado
 * <PermissionGate
 *   module="admin_panel"
 *   showDeniedMessage
 *   deniedMessage="Solo administradores pueden acceder"
 * >
 *   <AdminPanel />
 * </PermissionGate>
 *
 * // Con fallback personalizado
 * <PermissionGate
 *   module="reports"
 *   fallback={<Typography>Contáctanos para acceder a reportes</Typography>}
 * >
 *   <ReportsWidget />
 * </PermissionGate>
 * ```
 */
export const PermissionGate = ({
  module,
  modules,
  requireWrite = false,
  requireAll = false,
  children,
  fallback,
  showDeniedMessage = false,
  deniedMessage,
}: PermissionGateProps) => {
  const { canAccess, canWrite } = usePermissions()

  // Validar props
  if (!module && !modules) {
    console.error('PermissionGate: Debes proporcionar "module" o "modules"')
    return null
  }

  if (module && modules) {
    console.error('PermissionGate: No puedes proporcionar "module" y "modules" al mismo tiempo')
    return null
  }

  /**
   * Verifica si el usuario tiene los permisos necesarios
   */
  const hasPermission = (): boolean => {
    // Caso 1: Verificar un solo módulo
    if (module) {
      if (requireWrite) {
        return canWrite(module)
      }
      return canAccess(module)
    }

    // Caso 2: Verificar múltiples módulos
    if (modules) {
      if (requireAll) {
        // Requiere acceso a TODOS los módulos
        return modules.every(m => (requireWrite ? canWrite(m) : canAccess(m)))
      } else {
        // Requiere acceso a AL MENOS UNO
        return modules.some(m => (requireWrite ? canWrite(m) : canAccess(m)))
      }
    }

    return false
  }

  // Verificar permisos
  const permitted = hasPermission()

  // Si tiene permisos, renderizar children
  if (permitted) {
    return <>{children}</>
  }

  // Si no tiene permisos...

  // 1. Si hay fallback personalizado, mostrarlo
  if (fallback) {
    return <>{fallback}</>
  }

  // 2. Si se debe mostrar mensaje de denegado, mostrarlo
  if (showDeniedMessage) {
    const defaultMessage = 'No tienes permisos para acceder a esta función'
    const displayMessage = deniedMessage || defaultMessage

    return (
      <Box sx={{ p: 2 }}>
        <Alert
          color="warning"
          variant="soft"
          startDecorator={<BlockIcon />}
        >
          <Box>
            <Typography level="title-sm">Acceso Restringido</Typography>
            <Typography level="body-sm">{displayMessage}</Typography>
          </Box>
        </Alert>
      </Box>
    )
  }

  // 3. Por defecto, no renderizar nada
  return null
}

export default PermissionGate
