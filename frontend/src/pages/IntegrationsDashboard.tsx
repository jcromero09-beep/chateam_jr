import { useState } from 'react'
import {
  SquaresFour,
  CheckCircle,
  XCircle,
  Warning,
  ArrowsClockwise,
  Gear,
  ArrowClockwise,
  Play,
  Stop,
  ChartLine,
} from '@phosphor-icons/react'
// [Fase2·G] Se CONSERVA LinearProgress de MUI Joy (sin equivalente en el DS).
import { LinearProgress } from '@mui/joy'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Integration {
  id: number
  name: string
  type: string
  status: 'active' | 'inactive' | 'error' | 'syncing'
  lastSync: string
  nextSync: string
  syncedRecords: number
  pendingRecords: number
  errorCount: number
  uptime: number
  apiVersion: string
  companyName: string
}

interface SyncLog {
  id: number
  integration: string
  timestamp: string
  type: 'sync' | 'error' | 'warning'
  message: string
  records: number
  duration: number
}

// Botón de acción de fila (mismo look que RowAction del prototipo, con onClick).
function ActionBtn({
  label,
  onClick,
  className,
  children,
}: {
  label: string
  onClick: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
        className,
      )}
    >
      {children}
    </button>
  )
}

// Tarjeta KPI (superficie del DS + subtexto opcional).
function Kpi({
  label,
  value,
  children,
}: {
  label: string
  value: string
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
        {value}
      </p>
      {children}
    </div>
  )
}

export default function IntegrationsDashboard() {
  const [refreshing, setRefreshing] = useState(false)

  const stats = {
    totalIntegrations: 5,
    activeIntegrations: 4,
    syncedToday: 12845,
    pendingSync: 234,
    errorRate: 0.5,
    avgSyncTime: 23,
  }

  const integrations: Integration[] = [
    {
      id: 1,
      name: 'Billie',
      type: 'ERP',
      status: 'active',
      lastSync: '2025-10-13 10:45:23',
      nextSync: '2025-10-13 11:00:00',
      syncedRecords: 5482,
      pendingRecords: 45,
      errorCount: 2,
      uptime: 99.8,
      apiVersion: 'v2.5',
      companyName: 'Empresa Demo S.A.',
    },
    {
      id: 2,
      name: 'Aria Lite',
      type: 'CRM',
      status: 'active',
      lastSync: '2025-10-13 10:40:12',
      nextSync: '2025-10-13 11:10:00',
      syncedRecords: 3234,
      pendingRecords: 67,
      errorCount: 0,
      uptime: 100,
      apiVersion: 'v1.8',
      companyName: 'Tech Solutions Ltd.',
    },
    {
      id: 3,
      name: 'SmartTrack',
      type: 'Logistics',
      status: 'syncing',
      lastSync: '2025-10-13 10:30:45',
      nextSync: '2025-10-13 11:00:00',
      syncedRecords: 2876,
      pendingRecords: 89,
      errorCount: 1,
      uptime: 99.5,
      apiVersion: 'v3.1',
      companyName: 'Global Logistics Inc.',
    },
    {
      id: 4,
      name: 'SGR',
      type: 'Claims',
      status: 'active',
      lastSync: '2025-10-13 10:35:18',
      nextSync: '2025-10-13 11:05:00',
      syncedRecords: 1253,
      pendingRecords: 33,
      errorCount: 5,
      uptime: 98.9,
      apiVersion: 'v2.0',
      companyName: 'Insurance Corp.',
    },
    {
      id: 5,
      name: 'Custom API',
      type: 'Custom',
      status: 'error',
      lastSync: '2025-10-13 09:15:22',
      nextSync: 'Paused',
      syncedRecords: 0,
      pendingRecords: 0,
      errorCount: 12,
      uptime: 85.2,
      apiVersion: 'v1.0',
      companyName: 'Beta Company',
    },
  ]

  const recentLogs: SyncLog[] = [
    {
      id: 1,
      integration: 'Billie',
      timestamp: '2025-10-13 10:45:23',
      type: 'sync',
      message: 'Sincronización completada exitosamente - 245 contactos actualizados',
      records: 245,
      duration: 18,
    },
    {
      id: 2,
      integration: 'Aria Lite',
      timestamp: '2025-10-13 10:40:12',
      type: 'sync',
      message: 'Sincronización bidireccional completada - 187 registros',
      records: 187,
      duration: 24,
    },
    {
      id: 3,
      integration: 'SmartTrack',
      timestamp: '2025-10-13 10:35:45',
      type: 'warning',
      message: 'Sincronización con retrasos - alto volumen de datos',
      records: 456,
      duration: 67,
    },
    {
      id: 4,
      integration: 'SGR',
      timestamp: '2025-10-13 10:35:18',
      type: 'sync',
      message: 'Reclamos actualizados - 34 casos cerrados',
      records: 34,
      duration: 12,
    },
    {
      id: 5,
      integration: 'Custom API',
      timestamp: '2025-10-13 09:15:22',
      type: 'error',
      message: 'Error de autenticación - Token expirado',
      records: 0,
      duration: 0,
    },
  ]

  const handleRefresh = () => {
    setRefreshing(true)
    setTimeout(() => {
      setRefreshing(false)
    }, 2000)
  }

  const getStatusVariant = (status: string): BadgeProps['variant'] => {
    switch (status) {
      case 'active':
        return 'success'
      case 'syncing':
        return 'primary'
      case 'error':
        return 'destructive'
      default:
        return 'neutral'
    }
  }

  // Contenedor tipo avatar del icono de estado (tinte del token de superficie).
  const getStatusIconWrap = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-success/14 text-success-text'
      case 'syncing':
        return 'bg-primary/12 text-primary'
      case 'error':
        return 'bg-destructive/12 text-destructive-text'
      default:
        return 'bg-muted text-muted-foreground'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="size-5" weight="fill" aria-hidden />
      case 'syncing':
        return <ArrowsClockwise className="size-5 animate-spin" aria-hidden />
      case 'error':
        return <XCircle className="size-5" weight="fill" aria-hidden />
      default:
        return <Warning className="size-5" weight="fill" aria-hidden />
    }
  }

  const getLogTypeVariant = (type: string): BadgeProps['variant'] => {
    switch (type) {
      case 'sync':
        return 'success'
      case 'warning':
        return 'warning'
      case 'error':
        return 'destructive'
      default:
        return 'neutral'
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <SquaresFour className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Dashboard de Integraciones
              </h1>
              <p className="text-sm text-muted-foreground">
                Estado y monitoreo de todas las integraciones empresariales
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => {}}>
              <ChartLine className="size-4" aria-hidden />
              Ver Logs Completos
            </Button>
            <Button size="sm" loading={refreshing} onClick={handleRefresh}>
              <ArrowClockwise className="size-4" aria-hidden />
              Actualizar
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Kpi label="Total Integraciones" value={String(stats.totalIntegrations)}>
            <p className="mt-1 text-xs text-muted-foreground">
              {stats.activeIntegrations} activas
            </p>
          </Kpi>
          <Kpi label="Sincronizados Hoy" value={stats.syncedToday.toLocaleString()}>
            <p className="mt-1 text-xs text-success-text">+12.5% vs ayer</p>
          </Kpi>
          <Kpi label="Pendientes" value={String(stats.pendingSync)}>
            <p className="mt-1 text-xs text-muted-foreground">En cola</p>
          </Kpi>
          <Kpi label="Tasa de Error" value={`${stats.errorRate}%`}>
            <LinearProgress
              determinate
              value={stats.errorRate}
              color={stats.errorRate < 1 ? 'success' : 'danger'}
              size="sm"
              sx={{ mt: 1 }}
            />
          </Kpi>
          <Kpi label="Tiempo Promedio Sync" value={`${stats.avgSyncTime}s`}>
            <p className="mt-1 text-xs text-success-text">-3s vs semana pasada</p>
          </Kpi>
        </div>

        {/* Estado de Integraciones */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            Estado de Integraciones
          </h2>

          <div className="flex flex-col gap-3">
            {integrations.map((integration) => (
              <div
                key={integration.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-full',
                      getStatusIconWrap(integration.status),
                    )}
                  >
                    {getStatusIcon(integration.status)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold text-foreground">
                        {integration.name}
                      </span>
                      <Badge variant={getStatusVariant(integration.status)}>
                        {integration.status}
                      </Badge>
                      <Badge variant="outline">{integration.type}</Badge>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                      <div>
                        <p className="text-xs text-muted-foreground">Empresa</p>
                        <p className="text-sm font-semibold text-foreground">
                          {integration.companyName}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Última Sincronización
                        </p>
                        <p className="text-sm font-semibold text-foreground">
                          {integration.lastSync}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Registros Sincronizados
                        </p>
                        <p className="text-sm font-semibold tabular-nums text-foreground">
                          {integration.syncedRecords.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Pendientes</p>
                        <p className="text-sm font-semibold tabular-nums text-warning-text">
                          {integration.pendingRecords}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Uptime</p>
                        <p className="text-sm font-semibold tabular-nums text-success-text">
                          {integration.uptime}%
                        </p>
                      </div>
                    </div>

                    {integration.errorCount > 0 && (
                      <div
                        role="alert"
                        className="mt-3 flex items-center gap-2 rounded-md border border-warning/30 bg-warning/16 px-3 py-2 text-sm text-warning-text"
                      >
                        <Warning className="size-4 shrink-0" weight="fill" aria-hidden />
                        {integration.errorCount} errores en las últimas 24 horas
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col gap-1">
                    <ActionBtn
                      label="Configurar"
                      onClick={() => {}}
                      className="border border-input"
                    >
                      <Gear className="size-[18px]" aria-hidden />
                    </ActionBtn>
                    <ActionBtn
                      label={integration.status === 'active' ? 'Pausar' : 'Activar'}
                      onClick={() => {}}
                      className={cn(
                        'border border-input',
                        integration.status === 'active'
                          ? 'text-destructive-text hover:bg-destructive/10 hover:text-destructive-text'
                          : 'text-success-text hover:bg-success/10 hover:text-success-text',
                      )}
                    >
                      {integration.status === 'active' ? (
                        <Stop className="size-[18px]" weight="fill" aria-hidden />
                      ) : (
                        <Play className="size-[18px]" weight="fill" aria-hidden />
                      )}
                    </ActionBtn>
                    <ActionBtn
                      label="Sincronizar Ahora"
                      onClick={() => {}}
                      className="border border-input text-primary hover:bg-primary/10 hover:text-primary"
                    >
                      <ArrowClockwise className="size-[18px]" aria-hidden />
                    </ActionBtn>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Logs Recientes */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            Actividad Reciente
          </h2>

          <div className="flex flex-col gap-2">
            {recentLogs.map((log) => (
              <div
                key={log.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-start gap-3">
                  <Badge variant={getLogTypeVariant(log.type)}>{log.type}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {log.integration}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {log.timestamp}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-foreground">{log.message}</p>
                    {log.records > 0 && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {log.records} registros en {log.duration}s
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
