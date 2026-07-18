import { useState, useEffect, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
// [Fase2·G] CircularProgress se conserva en MUI Joy: no hay equivalente en el design system.
import CircularProgress from '@mui/joy/CircularProgress'
import {
  Plugs,
  PaperPlaneTilt,
  CheckCircle,
  XCircle,
  TrendUp,
  SquaresFour,
  FileText,
  ArrowClockwise,
  Trash,
  Eye,
  Warning,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import api from '../services/api'

// Colores para gráficos — atados a los tokens del design system (no hardcodeados).
const COLORS = {
  success: 'var(--success)',
  failed: 'var(--destructive)',
  sent: 'var(--primary)'
}

// Estilos de tooltip/ejes de recharts atados a los tokens del design system.
const chartTooltipStyle = {
  backgroundColor: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--popover-foreground)',
  fontSize: 12,
}
const AXIS_COLOR = 'var(--muted-foreground)'
const GRID_COLOR = 'var(--border)'

const failedColumns = [
  'Número',
  'Mensaje',
  'Error',
  'Endpoint',
  'Estado',
  'Reintentos',
  'Fecha',
  'Acciones',
]

type Tone = 'primary' | 'success' | 'destructive'

const toneBorder: Record<Tone, string> = {
  primary: 'border-l-primary',
  success: 'border-l-success',
  destructive: 'border-l-destructive',
}
// [a11y] Texto de estado con los tokens *-text; los tokens de superficie no llegan a 4.5:1.
const toneText: Record<Tone, string> = {
  primary: 'text-primary',
  success: 'text-success-text',
  destructive: 'text-destructive-text',
}
const toneBg: Record<Tone, string> = {
  primary: 'bg-primary/12',
  success: 'bg-success/14',
  destructive: 'bg-destructive/12',
}

/** Tarjeta de métrica con ícono y acento lateral (variante local de StatTile). */
function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string
  value: string
  icon: ReactNode
  tone: Tone
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-l-4 border-border bg-card p-5 shadow-sm shadow-black/[0.02]',
        toneBorder[tone],
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p
            className={cn(
              'mt-1.5 text-3xl font-semibold tracking-tight tabular-nums',
              toneText[tone],
            )}
          >
            {value}
          </p>
        </div>
        <span
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-full',
            toneBg[tone],
            toneText[tone],
          )}
        >
          {icon}
        </span>
      </div>
    </div>
  )
}

/** Botón de acción de fila (mismo look que RowAction del design system, con onClick). */
function ActionBtn({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** Campo del modal de detalles. */
function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  )
}

interface DashboardStats {
  totalAllTime: number
  daily: { sent: number; success: number; failed: number }
  weekly: { sent: number; success: number; failed: number }
  monthly: { sent: number; success: number; failed: number }
}

interface DetailedStats {
  period: string
  startDate: string
  endDate: string
  totals: {
    sent: number
    success: number
    failed: number
    text: number
    pdf: number
    image: number
    video: number
    other: number
    checkNumber: number
  }
  dailyStats: Array<{
    date: string
    sent: number
    success: number
    failed: number
  }>
}

interface FailedMessage {
  id: number
  companyId: number
  whatsappId: number | null
  number: string | null
  message: string | null
  error: string | null
  errorCode: string | null
  errorSubcode: string | null
  fbtraceId: string | null
  status: 'pending' | 'retried' | 'failed'
  retryCount: number
  ticketId: number | null
  endpoint: string
  metadata: any
  createdAt: string
  updatedAt: string
}

interface FailedMessagesPagination {
  total: number
  page: number
  limit: number
  pages: number
}

export default function ApiMessages() {
  const [searchParams] = useSearchParams()
  const initialTab = parseInt(searchParams.get("tab") || "0", 10)
  const [tabIndex, setTabIndex] = useState(initialTab)
  const [period, setPeriod] = useState<string>('week')
  const [loading, setLoading] = useState(true)
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null)
  const [detailedStats, setDetailedStats] = useState<DetailedStats | null>(null)

  // Failed Messages State
  const [failedMessages, setFailedMessages] = useState<FailedMessage[] | null>(null)
  const [failedLoading, setFailedLoading] = useState(false)
  const [retryingId, setRetryingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [selectedFailed, setSelectedFailed] = useState<FailedMessage | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [failedStatus, setFailedStatus] = useState<string>('all')
  const [failedEndpoint, setFailedEndpoint] = useState<string>('all')
  const [failedPage, setFailedPage] = useState(1)
  const [failedPagination, setFailedPagination] = useState<FailedMessagesPagination | null>(null)

  useEffect(() => {
    fetchStats()
  }, [period])

  const fetchStats = async () => {
    setLoading(true)
    try {
      const [dashboardRes, statsRes] = await Promise.all([
        api.get('/api/messages/dashboard-stats'),
        api.get(`/api/messages/stats?period=${period}`)
      ])
      setDashboardStats(dashboardRes.data)
      setDetailedStats(statsRes.data)
    } catch (err) {
      console.error('Error fetching API stats:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchFailedMessages = async () => {
    setFailedLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(failedPage),
        limit: '20'
      })
      if (failedStatus !== 'all') params.set('status', failedStatus)
      if (failedEndpoint !== 'all') params.set('endpoint', failedEndpoint)

      const res = await api.get(`/api/messages/failed-messages?${params.toString()}`)
      setFailedMessages(res.data.messages || [])
      setFailedPagination(res.data.pagination || null)
    } catch (err) {
      console.error('Error fetching failed messages:', err)
      toast.error('Error al cargar mensajes fallidos')
    } finally {
      setFailedLoading(false)
    }
  }

  const handleRetry = async (id: number) => {
    setRetryingId(id)
    try {
      await api.post(`/api/messages/failed-messages/${id}/retry`)
      toast.success('Mensaje reenviado correctamente')
      await fetchFailedMessages()
    } catch (err: any) {
      console.error('Error retrying message:', err)
      toast.error(err.response?.data?.message || 'Error al reintentar mensaje')
    } finally {
      setRetryingId(null)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar este mensaje fallido?')) return

    setDeletingId(id)
    try {
      await api.delete(`/api/messages/failed-messages/${id}`)
      toast.success('Mensaje eliminado correctamente')
      await fetchFailedMessages()
    } catch (err: any) {
      console.error('Error deleting message:', err)
      toast.error(err.response?.data?.message || 'Error al eliminar mensaje')
    } finally {
      setDeletingId(null)
    }
  }

  const openDetails = (msg: FailedMessage) => {
    setSelectedFailed(msg)
    setDetailsOpen(true)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusVariant = (status: string): BadgeProps['variant'] => {
    switch (status) {
      case 'pending': return 'warning'
      case 'retried': return 'success'
      case 'failed': return 'destructive'
      default: return 'neutral'
    }
  }

  // Cargar mensajes fallidos cuando se cambie a la pestaña
  useEffect(() => {
    if (tabIndex === 2) {
      fetchFailedMessages()
    }
  }, [tabIndex, failedStatus, failedEndpoint, failedPage])

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num?.toString() || '0'
  }

  const getPeriodLabel = (): string => {
    switch (period) {
      case 'day': return 'Hoy'
      case 'week': return 'Esta Semana'
      case 'month': return 'Este Mes'
      default: return ''
    }
  }

  const getCurrentPeriodStats = () => {
    if (!dashboardStats) return { sent: 0, success: 0, failed: 0 }
    switch (period) {
      case 'day': return dashboardStats.daily
      case 'week': return dashboardStats.weekly
      case 'month': return dashboardStats.monthly
      default: return dashboardStats.weekly
    }
  }

  const prepareChartData = () => {
    if (!detailedStats?.dailyStats) return []
    return detailedStats.dailyStats.map(day => ({
      date: day.date.substring(5), // MM-DD
      Exitosos: day.success,
      Fallidos: day.failed
    }))
  }

  const preparePieData = () => {
    const stats = getCurrentPeriodStats()
    return [
      { name: 'Exitosos', value: stats.success || 0 },
      { name: 'Fallidos', value: stats.failed || 0 }
    ]
  }

  const currentStats = getCurrentPeriodStats()
  const chartData = prepareChartData()
  const pieData = preparePieData()

  const getEndpoint = () => {
    return `${import.meta.env.VITE_API_URL || ''}/api/messages/send`
  }

  const messages = Array.isArray(failedMessages) ? failedMessages : []

  return (
    <TooltipProvider>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
                <Plugs className="size-6" weight="fill" aria-hidden />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  API de Mensajes
                </h1>
                <p className="text-sm text-muted-foreground">
                  Integracion API para envio de mensajes
                </p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs
            value={String(tabIndex)}
            onValueChange={(value) => setTabIndex(Number(value))}
          >
            <TabsList className="flex-wrap">
              <TabsTrigger value="0">
                <SquaresFour className="size-4" aria-hidden />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="1">
                <FileText className="size-4" aria-hidden />
                Documentacion API
              </TabsTrigger>
              <TabsTrigger value="2">
                <XCircle className="size-4" aria-hidden />
                Mensajes Fallidos
              </TabsTrigger>
            </TabsList>

            {/* ------------------------------ Dashboard ------------------------------ */}
            <TabsContent value="0" className="mt-4 space-y-6">
              {/* Filtro de período */}
              <div className="flex justify-end">
                <Select value={period} onValueChange={(value) => value && setPeriod(value)}>
                  <SelectTrigger className="w-[180px]" aria-label="Período">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Hoy</SelectItem>
                    <SelectItem value="week">Ultima Semana</SelectItem>
                    <SelectItem value="month">Ultimo Mes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {loading ? (
                <div className="flex justify-center py-16">
                  <CircularProgress />
                </div>
              ) : (
                <>
                  {/* Card Total — grande arriba */}
                  <div className="rounded-xl bg-gradient-to-br from-primary to-primary-hover p-6 text-primary-foreground shadow-sm">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm text-primary-foreground/70">
                          Total de Envios (Historico)
                        </p>
                        <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums">
                          {formatNumber(dashboardStats?.totalAllTime || 0)}
                        </p>
                      </div>
                      <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary-foreground/20">
                        <TrendUp className="size-9" weight="bold" aria-hidden />
                      </span>
                    </div>
                  </div>

                  {/* Cards de estadísticas del período */}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <StatCard
                      label={`Enviados (${getPeriodLabel()})`}
                      value={formatNumber(currentStats.sent)}
                      tone="primary"
                      icon={<PaperPlaneTilt className="size-6" weight="fill" aria-hidden />}
                    />
                    <StatCard
                      label={`Exitosos (${getPeriodLabel()})`}
                      value={formatNumber(currentStats.success)}
                      tone="success"
                      icon={<CheckCircle className="size-6" weight="fill" aria-hidden />}
                    />
                    <StatCard
                      label={`Fallidos (${getPeriodLabel()})`}
                      value={formatNumber(currentStats.failed)}
                      tone="destructive"
                      icon={<XCircle className="size-6" weight="fill" aria-hidden />}
                    />
                  </div>

                  {/* Gráficos */}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {/* Gráfico de barras */}
                    <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] md:col-span-2">
                      <h2 className="mb-4 text-base font-semibold text-foreground">
                        Envios Diarios ({getPeriodLabel()})
                      </h2>
                      <div className="h-[350px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                            <XAxis dataKey="date" stroke={AXIS_COLOR} fontSize={12} />
                            <YAxis stroke={AXIS_COLOR} fontSize={12} />
                            <RechartsTooltip contentStyle={chartTooltipStyle} />
                            <Legend />
                            <Bar dataKey="Exitosos" fill={COLORS.success} radius={[4, 4, 0, 0]} />
                            <Bar dataKey="Fallidos" fill={COLORS.failed} radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Gráfico de torta */}
                    <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
                      <h2 className="mb-4 text-base font-semibold text-foreground">
                        Distribucion ({getPeriodLabel()})
                      </h2>
                      <div className="h-[350px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={(props: any) => `${props.name}: ${((props.percent || 0) * 100).toFixed(0)}%`}
                              outerRadius={80}
                              fill={COLORS.sent}
                              dataKey="value"
                            >
                              {pieData.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={index === 0 ? COLORS.success : COLORS.failed} />
                              ))}
                            </Pie>
                            <RechartsTooltip contentStyle={chartTooltipStyle} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Desglose por tipo de contenido */}
                  {detailedStats && (
                    <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
                      <h2 className="mb-4 text-base font-semibold text-foreground">
                        Desglose por Tipo de Contenido ({getPeriodLabel()})
                      </h2>
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
                        {[
                          { label: 'Texto', value: detailedStats.totals?.text || 0 },
                          { label: 'Imagenes', value: detailedStats.totals?.image || 0 },
                          { label: 'PDF', value: detailedStats.totals?.pdf || 0 },
                          { label: 'Videos', value: detailedStats.totals?.video || 0 },
                          { label: 'Otros', value: detailedStats.totals?.other || 0 },
                          { label: 'Verificaciones', value: detailedStats.totals?.checkNumber || 0 }
                        ].map((item, index) => (
                          <div key={index} className="rounded-lg bg-muted p-4 text-center">
                            <p className="text-2xl font-semibold tabular-nums text-foreground">
                              {item.value}
                            </p>
                            <p className="text-sm text-muted-foreground">{item.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            {/* --------------------------- Documentación --------------------------- */}
            <TabsContent value="1" className="mt-4">
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] sm:p-6">
                <h2 className="mb-4 text-xl font-semibold text-foreground">
                  Documentacion de la API
                </h2>

                <h3 className="mb-1 text-base font-semibold text-primary">
                  Metodos disponibles
                </h3>
                <ol className="list-decimal space-y-1 pl-6 text-sm text-foreground">
                  <li>Envio de mensajes de texto</li>
                  <li>Envio de mensajes con medios (imagenes, PDF, video)</li>
                </ol>

                <hr className="my-5 border-0 border-t border-border" />

                <h3 className="mb-1 text-base font-semibold text-primary">
                  Instrucciones
                </h3>
                <p className="mb-1 text-sm font-semibold text-foreground">
                  Observaciones importantes:
                </p>
                <ul className="list-disc space-y-1 pl-6 text-sm text-foreground">
                  <li>El numero debe incluir el codigo de pais</li>
                  <li>
                    Formato del numero:
                    <ul className="list-disc space-y-1 pl-6">
                      <li>Codigo de pais (ej: 591 para Bolivia)</li>
                      <li>Codigo de area</li>
                      <li>Numero</li>
                    </ul>
                  </li>
                </ul>

                <hr className="my-5 border-0 border-t border-border" />

                <h3 className="mb-1 text-base font-semibold text-primary">
                  Mensaje de Texto
                </h3>
                <div className="mb-4 rounded-lg bg-muted p-4">
                  <p className="mb-1 text-sm text-foreground">
                    <strong>Endpoint:</strong> {getEndpoint()}
                  </p>
                  <p className="mb-1 text-sm text-foreground">
                    <strong>Metodo:</strong> POST
                  </p>
                  <p className="mb-1 text-sm text-foreground">
                    <strong>Headers:</strong> Authorization: Bearer (token) y Content-Type: application/json
                  </p>
                  <div className="text-sm text-foreground">
                    <strong>Body:</strong>
                    <pre className="m-0 mt-1 overflow-x-auto rounded-md bg-background p-3 text-xs text-foreground">
{`{
  "number": "591999999999",
  "body": "Mensaje",
  "userId": "ID de usuario (opcional)",
  "queueId": "ID de cola (opcional)",
  "sendSignature": true/false,
  "closeTicket": true/false
}`}
                    </pre>
                  </div>
                </div>

                <hr className="my-5 border-0 border-t border-border" />

                <h3 className="mb-1 text-base font-semibold text-primary">
                  Mensaje con Media
                </h3>
                <div className="rounded-lg bg-muted p-4">
                  <p className="mb-1 text-sm text-foreground">
                    <strong>Endpoint:</strong> {getEndpoint()}
                  </p>
                  <p className="mb-1 text-sm text-foreground">
                    <strong>Metodo:</strong> POST
                  </p>
                  <p className="mb-1 text-sm text-foreground">
                    <strong>Headers:</strong> Authorization: Bearer (token) y Content-Type: multipart/form-data
                  </p>
                  <div className="text-sm text-foreground">
                    <strong>FormData:</strong>
                    <ul className="mt-1 list-disc space-y-1 pl-6">
                      <li><strong>number:</strong> 591999999999</li>
                      <li><strong>body:</strong> Mensaje (opcional si hay media)</li>
                      <li><strong>userId:</strong> ID de usuario (opcional)</li>
                      <li><strong>queueId:</strong> ID de cola (opcional)</li>
                      <li><strong>medias:</strong> Archivo</li>
                      <li><strong>sendSignature:</strong> true/false</li>
                      <li><strong>closeTicket:</strong> true/false</li>
                    </ul>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ------------------------- Mensajes Fallidos ------------------------- */}
            <TabsContent value="2" className="mt-4 space-y-6">
              {/* Header con botón de actualizar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold text-foreground">
                  Mensajes Fallidos
                </h2>
                <Button size="sm" variant="outline" onClick={fetchFailedMessages}>
                  <ArrowClockwise className="size-4" aria-hidden />
                  Actualizar
                </Button>
              </div>

              {/* Filtros */}
              <div className="flex flex-col gap-3 sm:flex-row">
                <Select
                  value={failedStatus}
                  onValueChange={(value) => {
                    if (!value) return
                    setFailedStatus(value)
                    setFailedPage(1)
                  }}
                >
                  <SelectTrigger className="sm:w-[200px]" aria-label="Filtrar por estado">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    <SelectItem value="pending">Pendientes</SelectItem>
                    <SelectItem value="failed">Fallidos</SelectItem>
                    <SelectItem value="retried">Reenviados</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={failedEndpoint}
                  onValueChange={(value) => {
                    if (!value) return
                    setFailedEndpoint(value)
                    setFailedPage(1)
                  }}
                >
                  <SelectTrigger className="sm:w-[200px]" aria-label="Filtrar por endpoint">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los endpoints</SelectItem>
                    <SelectItem value="send-template">Templates</SelectItem>
                    <SelectItem value="send">Texto</SelectItem>
                    <SelectItem value="send/linkImage">Imagen</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {failedLoading ? (
                <div className="flex justify-center py-16">
                  <CircularProgress />
                </div>
              ) : messages.length === 0 ? (
                <div
                  role="status"
                  className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/14 px-4 py-3 text-sm text-success-text"
                >
                  <CheckCircle className="size-5 shrink-0" weight="fill" aria-hidden />
                  No hay mensajes fallidos. ¡Todos los envíos fueron exitosos!
                </div>
              ) : (
                <>
                  {/* Resumen de estados */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <StatCard
                      label="Pendientes"
                      value={String(messages.filter(m => m.status === 'pending').length)}
                      tone="primary"
                      icon={<ArrowClockwise className="size-6" aria-hidden />}
                    />
                    <StatCard
                      label="Reenviados"
                      value={String(messages.filter(m => m.status === 'retried').length)}
                      tone="success"
                      icon={<CheckCircle className="size-6" weight="fill" aria-hidden />}
                    />
                    <StatCard
                      label="Fallidos Definitivos"
                      value={String(messages.filter(m => m.status === 'failed').length)}
                      tone="destructive"
                      icon={<XCircle className="size-6" weight="fill" aria-hidden />}
                    />
                  </div>

                  {/* Tabla de mensajes fallidos */}
                  <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px] text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/40 text-left">
                            {failedColumns.map((c, i) => (
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
                          {messages.map((msg) => (
                            <tr key={msg.id} className="transition-colors hover:bg-accent/40">
                              <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums text-foreground">
                                {msg.number || 'N/A'}
                              </td>
                              <td className="max-w-[200px] px-4 py-3">
                                <Tooltip title={msg.message || ''}>
                                  <span
                                    tabIndex={msg.message ? 0 : undefined}
                                    className="block truncate text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  >
                                    {msg.message?.substring(0, 50) || '(Sin mensaje)'}
                                    {msg.message && msg.message.length > 50 ? '...' : ''}
                                  </span>
                                </Tooltip>
                              </td>
                              <td className="max-w-[200px] px-4 py-3">
                                <Tooltip title={msg.error || ''}>
                                  <span
                                    tabIndex={msg.error ? 0 : undefined}
                                    className="block truncate text-destructive-text outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  >
                                    {msg.error?.substring(0, 40) || 'Error desconocido'}
                                    {msg.error && msg.error.length > 40 ? '...' : ''}
                                  </span>
                                </Tooltip>
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant="neutral">{msg.endpoint}</Badge>
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant={getStatusVariant(msg.status)} dot>
                                  {msg.status === 'pending' ? 'Pendiente' :
                                   msg.status === 'retried' ? 'Reenviado' : 'Fallido'}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 tabular-nums text-muted-foreground">
                                {msg.retryCount}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                                {formatDate(msg.createdAt)}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-0.5">
                                  <ActionBtn
                                    label="Ver detalles"
                                    onClick={() => openDetails(msg)}
                                    className="hover:bg-primary/10 hover:text-primary"
                                  >
                                    <Eye className="size-[18px]" aria-hidden />
                                  </ActionBtn>
                                  {(msg.status === 'pending' || msg.status === 'failed') && (
                                    <ActionBtn
                                      label="Reintentar"
                                      onClick={() => handleRetry(msg.id)}
                                      disabled={retryingId === msg.id}
                                      className="hover:bg-success/10 hover:text-success-text"
                                    >
                                      {retryingId === msg.id ? (
                                        <CircularProgress size="sm" />
                                      ) : (
                                        <ArrowClockwise className="size-[18px]" aria-hidden />
                                      )}
                                    </ActionBtn>
                                  )}
                                  <ActionBtn
                                    label="Eliminar"
                                    onClick={() => handleDelete(msg.id)}
                                    disabled={deletingId === msg.id}
                                    className="hover:bg-destructive/10 hover:text-destructive-text"
                                  >
                                    {deletingId === msg.id ? (
                                      <CircularProgress size="sm" />
                                    ) : (
                                      <Trash className="size-[18px]" aria-hidden />
                                    )}
                                  </ActionBtn>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {failedPagination && failedPagination.pages > 1 && (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">
                        Página {failedPagination.page} de {failedPagination.pages} · {failedPagination.total} registros
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={failedPage <= 1 || failedLoading}
                          onClick={() => setFailedPage(page => Math.max(1, page - 1))}
                        >
                          Anterior
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={failedPagination.page >= failedPagination.pages || failedLoading}
                          onClick={() => setFailedPage(page => page + 1)}
                        >
                          Siguiente
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Modal de detalles */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Warning className="size-5 text-warning-text" weight="fill" aria-hidden />
                Detalles del Mensaje Fallido
              </DialogTitle>
              <DialogDescription>
                Información completa del error devuelto por el proveedor.
              </DialogDescription>
            </DialogHeader>

            {selectedFailed && (
              <div className="space-y-4">
                <DetailField label="Número">
                  <p className="text-sm tabular-nums text-foreground">
                    {selectedFailed.number || 'N/A'}
                  </p>
                </DetailField>

                <DetailField label="Mensaje">
                  <div className="max-h-[100px] overflow-auto rounded-md bg-muted p-2">
                    <p className="text-sm text-foreground">
                      {selectedFailed.message || '(Sin mensaje)'}
                    </p>
                  </div>
                </DetailField>

                <DetailField label="Error">
                  <div className="max-h-[100px] overflow-auto rounded-md bg-destructive/12 p-2">
                    <p className="text-sm text-destructive-text">
                      {selectedFailed.error || 'Error desconocido'}
                    </p>
                  </div>
                </DetailField>

                <div className="grid grid-cols-2 gap-4">
                  <DetailField label="Código de Error">
                    <p className="text-sm text-foreground">
                      {selectedFailed.errorCode || 'N/A'}
                    </p>
                  </DetailField>
                  <DetailField label="Subcódigo">
                    <p className="text-sm text-foreground">
                      {selectedFailed.errorSubcode || 'N/A'}
                    </p>
                  </DetailField>
                </div>

                <DetailField label="FBTrace ID">
                  <p className="break-all font-mono text-sm text-foreground">
                    {selectedFailed.fbtraceId || 'N/A'}
                  </p>
                </DetailField>

                <div className="grid grid-cols-2 gap-4">
                  <DetailField label="Endpoint">
                    <Badge variant="neutral">{selectedFailed.endpoint}</Badge>
                  </DetailField>
                  <DetailField label="Estado">
                    <Badge variant={getStatusVariant(selectedFailed.status)} dot>
                      {selectedFailed.status}
                    </Badge>
                  </DetailField>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <DetailField label="Reintentos">
                    <p className="text-sm tabular-nums text-foreground">
                      {selectedFailed.retryCount}
                    </p>
                  </DetailField>
                  <DetailField label="Ticket ID">
                    <p className="text-sm tabular-nums text-foreground">
                      {selectedFailed.ticketId || 'N/A'}
                    </p>
                  </DetailField>
                </div>

                <DetailField label="Metadata">
                  <pre className="m-0 max-h-[150px] overflow-auto rounded-md bg-muted p-2 text-xs text-foreground">
                    {JSON.stringify(selectedFailed.metadata, null, 2) || 'N/A'}
                  </pre>
                </DetailField>

                <DetailField label="Fecha de Creación">
                  <p className="text-sm text-foreground">
                    {formatDate(selectedFailed.createdAt)}
                  </p>
                </DetailField>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
