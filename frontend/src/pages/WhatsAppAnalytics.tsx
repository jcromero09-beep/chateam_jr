import { useState, useEffect, useCallback } from 'react'
import { CircularProgress, LinearProgress } from '@mui/joy'
import {
  ChartBar,
  TrendUp,
  SquaresFour,
  ChatCircleText,
  Ticket as TicketIcon,
  Buildings,
  ArrowClockwise,
  CheckCircle,
  XCircle,
  Copy,
} from '@phosphor-icons/react'
import { toast } from 'react-toastify'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'

interface WidgetStats {
  id: number
  name: string
  channel: string
  status: boolean
  apiKey: string
  companyId: number
  companyName?: string
  whatsappName?: string
  ticketsCreated: number
  messagesReceived: number
  messagesSent: number
  lastActivity: string | null
  createdAt: string
}

interface AnalyticsData {
  summary: {
    totalWidgets: number
    activeWidgets: number
    inactiveWidgets: number
    totalTickets: number
    totalMessages: number
    avgTicketsPerWidget: number
  }
  widgets: WidgetStats[]
  ticketsByDay: { date: string; count: number }[]
  messagesByDay: { date: string; sent: number; received: number }[]
}

// Tarjeta de resumen con ícono (el StatTile del design system no lleva ícono)
function SummaryCard({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: React.ReactNode
  label: string
  value: number
  valueClass?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
      <div className="mb-1.5 flex items-center gap-2">
        {icon}
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className={cn('text-3xl font-semibold tracking-tight tabular-nums text-foreground', valueClass)}>
        {value}
      </p>
    </div>
  )
}

export default function WhatsAppAnalytics() {
  const { user } = useAuth()
  const [timeRange, setTimeRange] = useState('30d')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)

  const isSuper = user?.profile === 'super'

  const loadAnalytics = useCallback(async () => {
    console.log('loadAnalytics: STARTING')
    try {
      // Calcular fechas según el rango seleccionado
      const endDate = new Date()
      const startDate = new Date()

      switch (timeRange) {
        case '24h':
          startDate.setDate(startDate.getDate() - 1)
          break
        case '7d':
          startDate.setDate(startDate.getDate() - 7)
          break
        case '30d':
          startDate.setDate(startDate.getDate() - 30)
          break
        case '90d':
          startDate.setDate(startDate.getDate() - 90)
          break
      }

      console.log('loadAnalytics: Calling /webchat/analytics', {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      })

      const { data } = await api.get('/webchat/analytics', {
        params: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        }
      })

      console.log('loadAnalytics: SUCCESS', data)
      setAnalytics(data)
    } catch (error) {
      console.error('loadAnalytics: ERROR', error)
      toast.error('Error al cargar analytics')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [timeRange])

  useEffect(() => {
    loadAnalytics()
  }, [loadAnalytics])

  const handleRefresh = () => {
    setRefreshing(true)
    loadAnalytics()
  }

  const copyApiKey = (apiKey: string) => {
    navigator.clipboard.writeText(apiKey)
    toast.success('API Key copiada')
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Sin actividad'
    const date = new Date(dateStr)
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getActivityColor = (lastActivity: string | null): BadgeProps['variant'] => {
    if (!lastActivity) return 'destructive'
    const daysSinceActivity = Math.floor(
      (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24)
    )
    if (daysSinceActivity < 1) return 'success'
    if (daysSinceActivity < 7) return 'warning'
    return 'destructive'
  }

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <CircularProgress />
      </div>
    )
  }

  const summary = analytics?.summary || {
    totalWidgets: 0,
    activeWidgets: 0,
    inactiveWidgets: 0,
    totalTickets: 0,
    totalMessages: 0,
    avgTicketsPerWidget: 0
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <ChartBar className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
                Analytics WebChat
                {isSuper && (
                  <Badge variant="warning">Super Admin · Todas las empresas</Badge>
                )}
              </h1>
              <p className="text-sm text-muted-foreground">
                Control y métricas de widgets WebChat {isSuper ? 'de todas las empresas' : 'de tu empresa'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar"
              className="text-muted-foreground"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <ArrowClockwise className={cn('size-5', refreshing && 'animate-spin')} aria-hidden />
            </Button>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[180px]" aria-label="Rango de tiempo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Últimas 24 horas</SelectItem>
                <SelectItem value="7d">Últimos 7 días</SelectItem>
                <SelectItem value="30d">Últimos 30 días</SelectItem>
                <SelectItem value="90d">Últimos 90 días</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tarjetas de resumen */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryCard
            icon={<SquaresFour className="size-5 text-primary" weight="fill" aria-hidden />}
            label="Total Widgets"
            value={summary.totalWidgets}
          />
          <SummaryCard
            icon={<CheckCircle className="size-5 text-success-text" weight="fill" aria-hidden />}
            label="Activos"
            value={summary.activeWidgets}
            valueClass="text-success-text"
          />
          <SummaryCard
            icon={<XCircle className="size-5 text-muted-foreground" weight="fill" aria-hidden />}
            label="Inactivos"
            value={summary.inactiveWidgets}
            valueClass="text-muted-foreground"
          />
          <SummaryCard
            icon={<TicketIcon className="size-5 text-warning-text" weight="fill" aria-hidden />}
            label="Tickets Creados"
            value={summary.totalTickets}
          />
          <SummaryCard
            icon={<ChatCircleText className="size-5 text-primary" weight="fill" aria-hidden />}
            label="Total Mensajes"
            value={summary.totalMessages}
          />
          <SummaryCard
            icon={<TrendUp className="size-5 text-success-text" weight="fill" aria-hidden />}
            label="Prom. Tickets/Widget"
            value={summary.avgTicketsPerWidget}
          />
        </div>

        {/* Gráficos de actividad */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <h2 className="mb-4 text-base font-semibold text-foreground">
              Tickets por Día (últimos 7 días)
            </h2>
            <div className="space-y-3">
              {analytics?.ticketsByDay.map((day) => {
                const maxCount = Math.max(...(analytics?.ticketsByDay.map(d => d.count) || [1]))
                const percentage = maxCount > 0 ? (day.count / maxCount) * 100 : 0
                return (
                  <div key={day.date}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {new Date(day.date).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })}
                      </span>
                      <span className="text-xs font-semibold text-foreground tabular-nums">{day.count}</span>
                    </div>
                    <LinearProgress
                      determinate
                      value={percentage}
                      color="warning"
                      size="sm"
                    />
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <h2 className="mb-4 text-base font-semibold text-foreground">
              Mensajes por Día (últimos 7 días)
            </h2>
            <div className="space-y-3">
              {analytics?.messagesByDay.map((day) => {
                const maxSent = Math.max(...(analytics?.messagesByDay.map(d => d.sent) || [1]))
                const maxReceived = Math.max(...(analytics?.messagesByDay.map(d => d.received) || [1]))
                const maxTotal = Math.max(maxSent, maxReceived, 1)
                return (
                  <div key={day.date}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {new Date(day.date).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })}
                      </span>
                      <span className="flex items-center gap-2 text-xs tabular-nums">
                        <span className="text-success-text">↑{day.sent}</span>
                        <span className="text-primary">↓{day.received}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <LinearProgress
                        determinate
                        value={(day.sent / maxTotal) * 100}
                        color="success"
                        size="sm"
                        sx={{ flex: 1 }}
                      />
                      <LinearProgress
                        determinate
                        value={(day.received / maxTotal) * 100}
                        color="primary"
                        size="sm"
                        sx={{ flex: 1 }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Tabla de widgets */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <h2 className="mb-4 text-base font-semibold text-foreground">
            Detalle de Widgets ({analytics?.widgets.length || 0})
          </h2>

          {analytics?.widgets.length === 0 ? (
            <div className="py-10 text-center">
              <SquaresFour className="mx-auto mb-2 size-12 text-muted-foreground/50" aria-hidden />
              <p className="text-sm text-muted-foreground">No hay widgets creados</p>
              <p className="text-xs text-muted-foreground">
                Ve a WebChat Settings para crear tu primer widget
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Widget</th>
                    {isSuper && (
                      <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Empresa</th>
                    )}
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conexión</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tickets</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mensajes</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Última Actividad</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">API Key</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {analytics?.widgets.map((widget) => (
                    <tr key={widget.id} className="transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{widget.name}</span>
                          <span className="text-xs text-muted-foreground">{widget.channel}</span>
                        </div>
                      </td>
                      {isSuper && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Buildings className="size-4 shrink-0" aria-hidden />
                            <span>{widget.companyName || `ID: ${widget.companyId}`}</span>
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-3 text-muted-foreground">
                        {widget.whatsappName || 'N/A'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={widget.status ? 'success' : 'neutral'}>
                          {widget.status ? (
                            <CheckCircle className="size-3.5" weight="fill" aria-hidden />
                          ) : (
                            <XCircle className="size-3.5" weight="fill" aria-hidden />
                          )}
                          {widget.status ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <TicketIcon className="size-4 text-muted-foreground" aria-hidden />
                          <span className="font-medium text-foreground tabular-nums">{widget.ticketsCreated}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="success" title="Enviados">↑{widget.messagesSent}</Badge>
                          <Badge variant="primary" title="Recibidos">↓{widget.messagesReceived}</Badge>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Badge variant={getActivityColor(widget.lastActivity)}>
                          {formatDate(widget.lastActivity)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            aria-label="Copiar API Key"
                            title="Copiar API Key"
                            onClick={() => copyApiKey(widget.apiKey)}
                            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                          >
                            <Copy className="size-[18px]" aria-hidden />
                          </button>
                          <code className="max-w-[110px] overflow-hidden text-ellipsis whitespace-nowrap rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                            {widget.apiKey.substring(0, 12)}...
                          </code>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
