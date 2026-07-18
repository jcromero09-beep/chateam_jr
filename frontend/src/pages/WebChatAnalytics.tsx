import { useState, useEffect, useCallback } from 'react'
// [Fase2·G] Conservados como MUI Joy a propósito: no hay equivalente en el design
// system (progress bars / spinner). El resto de la pantalla ya usa Tailwind + shadcn.
import { LinearProgress, CircularProgress } from '@mui/joy'
import {
  ChartBar,
  TrendUp,
  SquaresFour,
  ChatCircle,
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
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

  const getActivityColor = (lastActivity: string | null): 'success' | 'warning' | 'danger' => {
    if (!lastActivity) return 'danger'
    const daysSinceActivity = Math.floor(
      (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24)
    )
    if (daysSinceActivity < 1) return 'success'
    if (daysSinceActivity < 7) return 'warning'
    return 'danger'
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

  const summaryCards = [
    { icon: SquaresFour, iconClass: 'text-primary', label: 'Total Widgets', value: summary.totalWidgets, valueClass: 'text-foreground' },
    { icon: CheckCircle, iconClass: 'text-success-text', label: 'Activos', value: summary.activeWidgets, valueClass: 'text-success-text' },
    { icon: XCircle, iconClass: 'text-muted-foreground', label: 'Inactivos', value: summary.inactiveWidgets, valueClass: 'text-muted-foreground' },
    { icon: TicketIcon, iconClass: 'text-warning-text', label: 'Tickets Creados', value: summary.totalTickets, valueClass: 'text-foreground' },
    { icon: ChatCircle, iconClass: 'text-primary', label: 'Total Mensajes', value: summary.totalMessages, valueClass: 'text-foreground' },
    { icon: TrendUp, iconClass: 'text-success-text', label: 'Prom. Tickets/Widget', value: summary.avgTicketsPerWidget, valueClass: 'text-foreground' },
  ] as const

  const columns = [
    'Widget',
    ...(isSuper ? ['Empresa'] : []),
    'Conexión',
    'Estado',
    'Tickets',
    'Mensajes',
    'Última Actividad',
    'API Key',
  ]

  return (
    <TooltipProvider>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
                <ChartBar className="size-6" weight="fill" aria-hidden />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    Analytics WebChat
                  </h1>
                  {isSuper && (
                    <Badge variant="warning">Super Admin - Todas las empresas</Badge>
                  )}
                </div>
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
                <ArrowClockwise className={refreshing ? 'size-5 animate-spin' : 'size-5'} aria-hidden />
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
            {summaryCards.map((card) => {
              const Icon = card.icon
              return (
                <div
                  key={card.label}
                  className="rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/[0.02]"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Icon className={`size-5 ${card.iconClass}`} weight="fill" aria-hidden />
                    <span className="text-sm text-muted-foreground">{card.label}</span>
                  </div>
                  <p className={`text-2xl font-semibold tracking-tight tabular-nums ${card.valueClass}`}>
                    {card.value}
                  </p>
                </div>
              )
            })}
          </div>

          {/* Gráficos de actividad */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <h2 className="mb-4 text-sm font-semibold text-foreground">
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
                        <span className="text-xs font-semibold tabular-nums text-foreground">{day.count}</span>
                      </div>
                      <LinearProgress determinate value={percentage} color="warning" size="sm" />
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <h2 className="mb-4 text-sm font-semibold text-foreground">
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
                        <div className="flex items-center gap-2 tabular-nums">
                          <span className="text-xs text-success-text">↑{day.sent}</span>
                          <span className="text-xs text-primary">↓{day.received}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
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
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold text-foreground">
                Detalle de Widgets ({analytics?.widgets.length || 0})
              </h2>
            </div>

            {analytics?.widgets.length === 0 ? (
              <div className="flex flex-col items-center gap-1 px-4 py-12 text-center">
                <SquaresFour className="mb-2 size-12 text-muted-foreground/50" aria-hidden />
                <p className="text-sm text-foreground">No hay widgets creados</p>
                <p className="text-sm text-muted-foreground">
                  Ve a WebChat Settings para crear tu primer widget
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left">
                      {columns.map((c, i) => (
                        <th
                          key={i}
                          className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {analytics?.widgets.map((widget) => {
                      const actColor = getActivityColor(widget.lastActivity)
                      const actVariant: BadgeProps['variant'] =
                        actColor === 'danger' ? 'destructive' : actColor
                      return (
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
                                <Buildings className="size-4" aria-hidden />
                                <span className="text-foreground">
                                  {widget.companyName || `ID: ${widget.companyId}`}
                                </span>
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
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <TicketIcon className="size-4" aria-hidden />
                              <span className="font-medium tabular-nums text-foreground">
                                {widget.ticketsCreated}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <Tooltip title="Enviados">
                                <Badge variant="success">↑{widget.messagesSent}</Badge>
                              </Tooltip>
                              <Tooltip title="Recibidos">
                                <Badge variant="primary">↓{widget.messagesReceived}</Badge>
                              </Tooltip>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <Badge variant={actVariant}>{formatDate(widget.lastActivity)}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <Tooltip title="Copiar API Key">
                                <button
                                  type="button"
                                  aria-label="Copiar API Key"
                                  onClick={() => copyApiKey(widget.apiKey)}
                                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                                >
                                  <Copy className="size-[18px]" aria-hidden />
                                </button>
                              </Tooltip>
                              <span className="max-w-[100px] truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                                {widget.apiKey.substring(0, 12)}...
                              </span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
