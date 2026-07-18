import { useState, useEffect } from 'react'
// [migración] Se conserva de MUI Joy solo el indicador de progreso (no hay equivalente
// en el design system Tailwind/shadcn). El resto de la pantalla ya es tokens + utilidades.
import { CircularProgress } from '@mui/joy'
import {
  ShieldCheck,
  CheckCircle,
  XCircle,
  Warning,
  Gauge,
  ChatCircleText,
  Clock,
  ArrowClockwise,
  TrendUp,
  Prohibit,
  Timer,
} from '@phosphor-icons/react'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import api from '../services/api'
import { toast } from 'react-toastify'

// Interfaces
interface GlobalMetrics {
  totalConnections: number
  activeConnections: number
  totalMessagesSent: number
  totalMessagesFailed: number
  successRate: number
  failureRate: number
  averageResponseTime: number
}

interface WhatsAppHealth {
  whatsappId: number
  companyId: number
  name?: string
  status: 'connected' | 'disconnected' | 'qrcode' | 'error'
  qrCode: string | null
  lastHealthCheck: string
  consecutiveFailures: number
  isHealthy: boolean
}

interface RateLimitMetrics {
  blockedConversations: number
  totalRequests: number
  throttledRequests: number
  limits: {
    perConversation: number
    perUser: number
    perWhatsapp: number
    perCompany: number
  }
}

interface AntiBanMetrics {
  delaysApplied: number
  typingSimulations: number
  averageDelayMs: number
  minDelayMs: number
  maxDelayMs: number
  rateLimitEnabled: boolean
  maxMessagesPerHour: number
}

interface DashboardData {
  global: GlobalMetrics
  whatsapps: WhatsAppHealth[]
  rateLimit: RateLimitMetrics
  antiBan: AntiBanMetrics
  timestamp: string
}

const columns = ['ID', 'Estado', 'Salud', 'Fallos', 'Último check', 'QR Code']

// Tarjeta base del design system (sustituye Card/CardContent de Joy)
function Panel({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]',
        className,
      )}
    >
      {children}
    </div>
  )
}

// KPI con icono (sustituye Card + Avatar de Joy; el Avatar del DS solo pinta iniciales)
function KpiCard({
  label,
  value,
  icon,
  iconClassName,
  footer,
}: {
  label: string
  value: string
  icon: React.ReactNode
  iconClassName?: string
  footer?: React.ReactNode
}) {
  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums text-foreground">
            {value}
          </p>
          {footer && <div className="mt-2">{footer}</div>}
        </div>
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg',
            iconClassName,
          )}
        >
          {icon}
        </span>
      </div>
    </Panel>
  )
}

// Métrica compacta dentro de los paneles (sustituye Grid + Typography)
function Metric({
  label,
  value,
  valueClassName,
}: {
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-xl font-semibold tracking-tight tabular-nums',
          valueClassName ?? 'text-foreground',
        )}
      >
        {value}
      </p>
    </div>
  )
}

export default function WhatsAppMonitorDashboard() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)

  // Fetch dashboard data
  const fetchDashboard = async (showLoader = true) => {
    try {
      if (showLoader) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      const response = await api.get('/whatsapp-monitor/dashboard')
      setDashboard(response.data)
    } catch (error: any) {
      console.error('Error fetching dashboard:', error)
      toast.error('Error al cargar el dashboard de monitoreo')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Initial load
  useEffect(() => {
    fetchDashboard()
  }, [])

  // Auto refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      fetchDashboard(false)
    }, 30000)

    return () => clearInterval(interval)
  }, [autoRefresh])

  const handleRefresh = () => {
    fetchDashboard(false)
  }

  const getStatusVariant = (status: WhatsAppHealth['status']): BadgeProps['variant'] => {
    switch (status) {
      case 'connected':
        return 'success'
      case 'disconnected':
        return 'neutral'
      case 'error':
        return 'destructive'
      case 'qrcode':
        return 'warning'
      default:
        return 'neutral'
    }
  }

  const getStatusText = (status: WhatsAppHealth['status']) => {
    switch (status) {
      case 'connected':
        return 'Conectado'
      case 'disconnected':
        return 'Desconectado'
      case 'error':
        return 'Error'
      case 'qrcode':
        return 'QR Code'
      default:
        return 'Desconocido'
    }
  }

  const getStatusIcon = (status: WhatsAppHealth['status']) => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="size-3.5" weight="fill" aria-hidden />
      case 'error':
        return <XCircle className="size-3.5" weight="fill" aria-hidden />
      case 'qrcode':
        return <Clock className="size-3.5" weight="fill" aria-hidden />
      default:
        return <Warning className="size-3.5" weight="fill" aria-hidden />
    }
  }

  const getHealthVariant = (
    isHealthy: boolean,
    failures: number,
  ): BadgeProps['variant'] => {
    if (isHealthy && failures === 0) return 'success'
    if (failures > 0 && failures < 3) return 'warning'
    return 'destructive'
  }

  if (loading) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center">
        <CircularProgress size="lg" />
      </div>
    )
  }

  if (!dashboard) {
    return (
      <div className="p-5 sm:p-6 lg:p-8">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          No hay datos disponibles
        </h2>
      </div>
    )
  }

  const { global, rateLimit, antiBan, whatsapps } = dashboard

  const availability =
    (global.totalConnections || 0) > 0
      ? Math.round(((global.activeConnections || 0) / (global.totalConnections || 1)) * 100)
      : 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <ShieldCheck className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Sistema Anti-Bloqueos WhatsApp
              </h1>
              <p className="text-sm text-muted-foreground">
                Monitoreo en tiempo real de salud, rate limiting y métricas anti-ban
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Última actualización: {new Date(dashboard.timestamp).toLocaleString('es-ES')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Chip clicable de Joy -> botón real (toggle) con estilo de badge */}
            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              aria-pressed={autoRefresh}
              className={cn(
                'inline-flex min-h-6 cursor-pointer select-none items-center gap-1.5 rounded-full border-0 px-2.5 py-1 text-xs font-medium leading-none [font-family:inherit] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                autoRefresh
                  ? 'bg-success/14 text-success-text hover:bg-success/20'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70',
              )}
            >
              <span className="size-1.5 rounded-full bg-current" aria-hidden />
              {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
            </button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Actualizar"
              onClick={handleRefresh}
              disabled={refreshing}
              className="text-muted-foreground"
            >
              <ArrowClockwise
                className={cn('size-5', refreshing && 'animate-spin')}
                aria-hidden
              />
            </Button>
          </div>
        </div>

        {/* KPIs Principales */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Conexiones activas"
            value={`${global.activeConnections || 0}/${global.totalConnections || 0}`}
            icon={<CheckCircle className="size-5" weight="fill" aria-hidden />}
            iconClassName="bg-success/14 text-success-text"
            footer={
              <Badge
                variant={
                  (global.activeConnections || 0) === (global.totalConnections || 0)
                    ? 'success'
                    : 'warning'
                }
              >
                {availability}% Disponibilidad
              </Badge>
            }
          />

          <KpiCard
            label="Tasa de éxito"
            value={`${(global.successRate || 0).toFixed(1)}%`}
            icon={<ChatCircleText className="size-5" weight="fill" aria-hidden />}
            iconClassName="bg-primary/12 text-primary"
            footer={
              <span className="inline-flex items-center gap-1 text-xs text-success-text">
                <TrendUp className="size-4" weight="bold" aria-hidden />
                {(global.totalMessagesSent || 0).toLocaleString()} enviados
              </span>
            }
          />

          <KpiCard
            label="Rate limiting"
            value={String(rateLimit?.blockedConversations || 0)}
            icon={<Prohibit className="size-5" weight="fill" aria-hidden />}
            iconClassName="bg-warning/16 text-warning-text"
            footer={
              <span className="text-xs text-muted-foreground">
                Conversaciones bloqueadas
              </span>
            }
          />

          <KpiCard
            label="Delay promedio"
            value={`${antiBan?.averageDelayMs || 0}ms`}
            icon={<Timer className="size-5" weight="fill" aria-hidden />}
            iconClassName="bg-accent text-accent-foreground"
            footer={
              <span className="text-xs text-muted-foreground">
                {antiBan?.delaysApplied || 0} delays aplicados
              </span>
            }
          />
        </div>

        {/* Métricas Anti-Ban y Rate Limiting */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel>
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
              <ShieldCheck className="size-5 text-primary" weight="fill" aria-hidden />
              Métricas Anti-Ban
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <Metric
                label="Delays aplicados"
                value={String(antiBan?.delaysApplied || 0)}
                valueClassName="text-primary"
              />
              <Metric
                label="Simulaciones typing"
                value={String(antiBan?.typingSimulations || 0)}
                valueClassName="text-success-text"
              />
              <Metric
                label="Rango de delays"
                value={`${antiBan?.minDelayMs || 0}-${antiBan?.maxDelayMs || 0}ms`}
                valueClassName="text-warning-text"
              />
              <Metric
                label="Límite por hora"
                value={`${antiBan?.maxMessagesPerHour || 0} msg/h`}
              />
            </div>
            <div className="mt-4">
              <Badge variant={antiBan?.rateLimitEnabled ? 'success' : 'destructive'}>
                {antiBan?.rateLimitEnabled ? (
                  <CheckCircle className="size-3.5" weight="fill" aria-hidden />
                ) : (
                  <XCircle className="size-3.5" weight="fill" aria-hidden />
                )}
                Rate Limiting {antiBan?.rateLimitEnabled ? 'Activo' : 'Inactivo'}
              </Badge>
            </div>
          </Panel>

          <Panel>
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
              <Gauge className="size-5 text-warning-text" weight="fill" aria-hidden />
              Límites de Velocidad
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <Metric
                label="Por conversación"
                value={`${rateLimit?.limits?.perConversation || 0}/h`}
                valueClassName="text-primary"
              />
              <Metric
                label="Por usuario"
                value={`${rateLimit?.limits?.perUser || 0}/h`}
                valueClassName="text-success-text"
              />
              <Metric
                label="Por WhatsApp"
                value={`${rateLimit?.limits?.perWhatsapp || 0}/h`}
                valueClassName="text-warning-text"
              />
              <Metric
                label="Por compañía"
                value={`${rateLimit?.limits?.perCompany || 0}/h`}
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge variant="warning">
                {rateLimit?.throttledRequests || 0} requests throttled
              </Badge>
              <Badge variant="neutral">
                {rateLimit?.totalRequests || 0} total requests
              </Badge>
            </div>
          </Panel>
        </div>

        {/* Tabla de Estado de WhatsApps */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">
            Estado de Salud de Conexiones WhatsApp
          </h2>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    {columns.map((c, i) => (
                      <th
                        key={i}
                        className={cn(
                          'whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                          i === columns.length - 1 && 'text-center',
                        )}
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {whatsapps.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-10 text-center text-muted-foreground"
                      >
                        No hay conexiones WhatsApp configuradas
                      </td>
                    </tr>
                  ) : (
                    whatsapps.map((whatsapp) => (
                      <tr
                        key={whatsapp.whatsappId}
                        className="transition-colors hover:bg-accent/40"
                      >
                        <td className="px-4 py-3">
                          <span className="block font-medium tabular-nums text-foreground">
                            #{whatsapp.whatsappId}
                          </span>
                          {whatsapp.name && (
                            <span className="block text-xs text-muted-foreground">
                              {whatsapp.name}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={getStatusVariant(whatsapp.status)}>
                            {getStatusIcon(whatsapp.status)}
                            {getStatusText(whatsapp.status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={getHealthVariant(
                              whatsapp.isHealthy,
                              whatsapp.consecutiveFailures,
                            )}
                          >
                            {whatsapp.isHealthy ? (
                              <CheckCircle className="size-3.5" weight="fill" aria-hidden />
                            ) : (
                              <XCircle className="size-3.5" weight="fill" aria-hidden />
                            )}
                            {whatsapp.isHealthy ? 'Saludable' : 'Problema'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'font-medium tabular-nums',
                              whatsapp.consecutiveFailures === 0
                                ? 'text-success-text'
                                : 'text-destructive-text',
                            )}
                          >
                            {whatsapp.consecutiveFailures} fallos
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                          {new Date(whatsapp.lastHealthCheck).toLocaleString('es-ES')}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {whatsapp.qrCode ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-warning-text"
                            >
                              Ver QR
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">N/A</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
