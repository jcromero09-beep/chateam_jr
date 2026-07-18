import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
// [Re-skin Tailwind v4] Sólo se conserva de MUI Joy el indicador de progreso
// (CircularProgress), que no tiene equivalente en el design system.
import { CircularProgress } from '@mui/joy'
import {
  ArrowClockwise,
  MagnifyingGlass,
  Eye,
  ArrowCounterClockwise,
  FacebookLogo,
  TrendUp,
  CheckCircle,
  WarningCircle,
  Clock,
  MinusCircle,
  FunnelSimple,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import api from '../services/api'

// ─── Tipos ────────────────────────────────────────────────────────
type Status = 'pending' | 'sent' | 'success' | 'failed' | 'skipped'

interface LeadEventRow {
  id: number
  companyId: number
  ticketId: number | null
  contactId: number | null
  kanbanTagId: number | null
  kanbanKey: string | null
  kanbanTagName: string | null
  eventName: string
  eventId: string | null
  source: string | null
  destinationId: string | null
  destinationSource: string | null
  responseStatus: Status
  fbtraceId: string | null
  errorMessage: string | null
  userData: Record<string, unknown> | null
  customData: Record<string, unknown> | null
  fbResponse: Record<string, unknown> | null
  sentAt: string | null
  createdAt: string
  updatedAt: string
  contact?: { id: number; name: string; number: string; email?: string }
  kanbanTag?: {
    id: number
    name: string
    key: string
    color?: string
    kanban?: number
    metaConversionName?: string | null
    metaEventName?: string | null
    metaLeadStatus?: string | null
    metaRule?: string | null
    metaCustomEventType?: string | null
    metaCustomConversionId?: string | null
    metaConversionStatus?: string | null
    metaLastSyncAt?: string | null
    metaLastError?: string | null
  }
  ticket?: { id: number; status: string; lastMessage?: string; updatedAt: string }
}

interface StatsResponse {
  total: number
  success: number
  failed: number
  pending: number
  sent: number
  skipped: number
}

/** Tono semántico compartido por badges, KPIs y avisos. */
type Tone = 'success' | 'danger' | 'warning' | 'primary' | 'neutral'

const STATUS_LABELS: Record<Status, string> = {
  pending: 'Pendiente',
  sent: 'Enviada sin confirmar',
  success: 'Recibida por Meta',
  failed: 'Fallido',
  skipped: 'Omitido'
}

const STATUS_COLOR: Record<Status, Tone> = {
  pending: 'warning',
  sent: 'primary',
  success: 'success',
  failed: 'danger',
  skipped: 'neutral'
}

const STATUS_ICON: Record<Status, ReactElement> = {
  pending: <Clock className="size-3.5" aria-hidden />,
  sent: <TrendUp className="size-3.5" aria-hidden />,
  success: <CheckCircle className="size-3.5" aria-hidden />,
  failed: <WarningCircle className="size-3.5" aria-hidden />,
  skipped: <MinusCircle className="size-3.5" aria-hidden />
}

/** Tono → variante del Badge del design system. */
const TONE_BADGE: Record<Tone, BadgeProps['variant']> = {
  success: 'success',
  danger: 'destructive',
  warning: 'warning',
  primary: 'primary',
  neutral: 'neutral'
}

/** Superficie tintada del aviso (equivalente a `Alert variant="soft"` de Joy). */
const TONE_SURFACE: Record<Tone, string> = {
  success: 'border-success/30 bg-success/10',
  danger: 'border-destructive/30 bg-destructive/10',
  warning: 'border-warning/30 bg-warning/10',
  primary: 'border-primary/30 bg-primary/10',
  neutral: 'border-border bg-muted/50'
}

// [a11y] Texto de estado con los tokens *-text; los tokens de superficie
// (--success/--warning/--destructive) no alcanzan 4.5:1 como color de texto.
const TONE_TEXT: Record<Tone, string> = {
  success: 'text-success-text',
  danger: 'text-destructive-text',
  warning: 'text-warning-text',
  primary: 'text-primary',
  neutral: 'text-foreground'
}

const TONE_ICON_WRAP: Record<Tone, string> = {
  success: 'bg-success/12 text-success-text',
  danger: 'bg-destructive/12 text-destructive-text',
  warning: 'bg-warning/16 text-warning-text',
  primary: 'bg-primary/12 text-primary',
  neutral: 'bg-muted text-muted-foreground'
}

const inputClass =
  'h-9 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'

/** Valor centinela: Radix Select no admite `value=""`. */
const ANY_STATUS = '__any__'

const formatDate = (iso?: string | null) => {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

const maskId = (value?: string | null) => {
  if (!value) return '—'
  if (value.length <= 8) return value
  return `${value.slice(0, 4)}…${value.slice(-4)}`
}

const truncate = (value?: string | null, max = 60) => {
  if (!value) return '—'
  if (value.length <= max) return value
  return `${value.slice(0, max)}…`
}

const getMetaError = (row: LeadEventRow) => {
  const responseError = row.fbResponse?.error as
    | { message?: string; error_user_msg?: string; error_user_title?: string; code?: number; error_subcode?: number }
    | undefined
  return {
    title: responseError?.error_user_title,
    message: row.errorMessage || responseError?.error_user_msg || responseError?.message || '',
    code: responseError?.code,
    subcode: responseError?.error_subcode
  }
}

const getEventsReceived = (row: LeadEventRow) => {
  const value = row.fbResponse?.events_received
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const getAttributionInfo = (row: LeadEventRow) => {
  const mode = row.customData?.attribution_mode
  const hasCtwa = Boolean(row.userData?.ctwa_clid)

  if (mode === 'phone_physical_store') {
    return {
      label: 'Por teléfono',
      detail: 'Meta recibió el evento usando el número del contacto. No necesitó ctwa_clid.'
    }
  }

  if (hasCtwa) {
    return {
      label: 'Click de anuncio WhatsApp',
      detail: 'Se envió con ctwa_clid, útil para atribución directa de campañas click-to-WhatsApp.'
    }
  }

  return {
    label: 'Datos del contacto',
    detail: 'Se envió con los datos disponibles del contacto.'
  }
}

const getMetaLocation = (row: LeadEventRow) => {
  const conversionName = row.kanbanTag?.metaConversionName || row.kanbanTagName || 'Conversión Kanban'
  const conversionId = row.kanbanTag?.metaCustomConversionId || '—'
  const pixelId = row.destinationId || '—'

  return {
    conversionName,
    conversionId,
    pixelId,
    path: 'Administrador de eventos > Conjuntos de datos > abre el pixel/dataset indicado > Conversiones personalizadas'
  }
}

const wasSentBeforeCurrentConversion = (row: LeadEventRow) => {
  if (!row.sentAt || !row.kanbanTag?.metaLastSyncAt) return false
  const sent = new Date(row.sentAt).getTime()
  const synced = new Date(row.kanbanTag.metaLastSyncAt).getTime()
  return Number.isFinite(sent) && Number.isFinite(synced) && sent < synced
}

const getFixSuggestion = (message?: string, subcode?: number) => {
  const text = (message || '').toLowerCase()

  if (text.includes('access token') || text.includes('token')) {
    return 'El token de Meta no fue aceptado. Revisa la conexión de Meta y vuelve a guardar/sincronizar credenciales.'
  }
  if (subcode === 2804066 || text.includes('tipo de evento no válido')) {
    return 'El evento elegido no es válido para mensajes de WhatsApp. Usa LeadSubmitted/Lead para etapas de lead.'
  }
  if (subcode === 2804069 || text.includes('page_id')) {
    return 'Meta pidió page_id. Vincula una conexión Facebook Page activa a la empresa.'
  }
  if (subcode === 2804071 || text.includes('ctwa_clid')) {
    return 'Meta pidió ctwa_clid para atribución de WhatsApp. Si el ticket no viene de anuncio, usa el modo por teléfono.'
  }
  if (text.includes('sin destino')) {
    return 'No hay pixel/dataset activo para esta empresa. Sincroniza el conjunto de datos de Meta.'
  }
  if (text.includes('contacto')) {
    return 'El ticket no tenía contacto asociado. Asocia o corrige el contacto antes de reenviar.'
  }

  return message || 'Revisa la configuración de la etiqueta, el pixel/dataset y la conexión de Meta.'
}

const getInitialQueryParam = (name: string) => {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get(name) || ''
}

const getUserSummary = (row: LeadEventRow) => {
  if (row.responseStatus === 'success') {
    const received = getEventsReceived(row)
    return {
      color: 'success' as const,
      title: received > 0 ? 'Meta recibió esta conversión' : 'Meta respondió correctamente',
      detail: received > 0
        ? 'Meta confirmó ' + received + ' evento(s) recibido(s) en el pixel/dataset.'
        : 'La solicitud fue aceptada por Meta.'
    }
  }

  if (row.responseStatus === 'failed') {
    const metaError = getMetaError(row)
    return {
      color: 'danger' as const,
      title: 'No se pudo enviar a Meta',
      detail: getFixSuggestion(metaError.message, metaError.subcode)
    }
  }

  if (row.responseStatus === 'pending') {
    return {
      color: 'warning' as const,
      title: 'Pendiente de envío',
      detail: 'ChatEAM creó el registro, pero todavía no hay confirmación de Meta.'
    }
  }

  if (row.responseStatus === 'skipped') {
    return {
      color: 'neutral' as const,
      title: 'No se envió',
      detail: row.errorMessage || 'El sistema omitió este evento porque faltaba una condición necesaria.'
    }
  }

  return {
    color: 'primary' as const,
    title: 'Enviada a Meta, sin recepción confirmada',
    detail: 'Meta respondió la solicitud, pero no confirmó events_received mayor a cero. Revisa el ID de soporte Meta.'
  }
}

const JsonBlock = ({ value }: { value: unknown }) => {
  if (value === null || value === undefined) {
    return <p className="text-xs text-muted-foreground">— vacío —</p>
  }
  let text = ''
  try {
    text =
      typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  } catch {
    text = String(value)
  }
  return (
    <div className="max-h-[280px] overflow-auto rounded-md bg-muted p-3">
      <pre className="m-0 whitespace-pre-wrap break-all font-mono text-xs text-foreground">
        {text}
      </pre>
    </div>
  )
}

/** Par etiqueta/valor usado en las fichas del detalle. */
const Field = ({
  label,
  children,
  mono
}: {
  label: string
  children: ReactNode
  mono?: boolean
}) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={cn('mt-0.5 text-sm text-foreground', mono && 'break-all font-mono')}>
      {children}
    </p>
  </div>
)

/** Ficha con borde del detalle (equivalente a `Card variant="outlined"`). */
const SectionCard = ({ title, children }: { title?: string; children: ReactNode }) => (
  <div className="rounded-lg border border-border bg-card p-4">
    {title && <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>}
    {children}
  </div>
)

/** Aviso tintado (equivalente a `Alert variant="soft" color=…` de Joy). */
const Callout = ({
  tone,
  children,
  className
}: {
  tone: Tone
  children: ReactNode
  className?: string
}) => (
  <div className={cn('rounded-lg border p-4', TONE_SURFACE[tone], className)}>{children}</div>
)

export default function KanbanLeadConversions({ embedded = false }: { embedded?: boolean }) {
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<LeadEventRow[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(20)

  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  // Filtros
  const [q, setQ] = useState(() => getInitialQueryParam('q'))
  const [qInput, setQInput] = useState(() => getInitialQueryParam('q'))
  const [status, setStatus] = useState<string>(() => getInitialQueryParam('status'))
  const [kanbanKey, setKanbanKey] = useState(() => getInitialQueryParam('kanbanKey'))
  const [ticketId, setTicketId] = useState(() => getInitialQueryParam('ticketId'))
  const [contactId, setContactId] = useState(() => getInitialQueryParam('contactId'))
  const [dateFrom, setDateFrom] = useState(() => getInitialQueryParam('dateFrom'))
  const [dateTo, setDateTo] = useState(() => getInitialQueryParam('dateTo'))

  // Detalle
  const [selected, setSelected] = useState<LeadEventRow | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(count / limit)),
    [count, limit]
  )

  // ─── Fetchers ──────────────────────────────────────────────────
  const fetchList = async (
    overrides: Partial<{
      page: number
      q: string
      status: string
      kanbanKey: string
      ticketId: string
      contactId: string
      dateFrom: string
      dateTo: string
    }> = {}
  ) => {
    try {
      setLoading(true)
      const effective = {
        page,
        q,
        status,
        kanbanKey,
        ticketId,
        contactId,
        dateFrom,
        dateTo,
        ...overrides
      }
      const params: Record<string, string | number> = { page: effective.page, limit }
      if (effective.q) params.q = effective.q
      if (effective.status) params.status = effective.status
      if (effective.kanbanKey) params.kanbanKey = effective.kanbanKey
      if (effective.ticketId) params.ticketId = effective.ticketId
      if (effective.contactId) params.contactId = effective.contactId
      if (effective.dateFrom) params.dateFrom = effective.dateFrom
      if (effective.dateTo) params.dateTo = effective.dateTo

      const { data } = await api.get('/kanban-lead-conversions', { params })
      setRows(data?.rows || [])
      setCount(data?.count || 0)
    } catch (err) {
      console.error('[KanbanLeadConversions] fetchList error', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async (
    overrides: Partial<{ dateFrom: string; dateTo: string }> = {}
  ) => {
    try {
      setStatsLoading(true)
      const effective = { dateFrom, dateTo, ...overrides }
      const params: Record<string, string> = {}
      if (effective.dateFrom) params.dateFrom = effective.dateFrom
      if (effective.dateTo) params.dateTo = effective.dateTo
      const { data } = await api.get('/kanban-lead-conversions/stats', {
        params
      })
      setStats(data)
    } catch (err) {
      console.error('[KanbanLeadConversions] fetchStats error', err)
    } finally {
      setStatsLoading(false)
    }
  }

  useEffect(() => {
    fetchList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  useEffect(() => {
    fetchStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSearch = () => {
    const nextQ = qInput.trim()
    setQ(nextQ)
    setPage(1)
    fetchList({ page: 1, q: nextQ })
  }

  const handleApplyFilters = () => {
    setPage(1)
    fetchList({ page: 1 })
    fetchStats()
  }

  const handleResetFilters = () => {
    setQ('')
    setQInput('')
    setStatus('')
    setKanbanKey('')
    setTicketId('')
    setContactId('')
    setDateFrom('')
    setDateTo('')
    setPage(1)
    fetchList({
      page: 1,
      q: '',
      status: '',
      kanbanKey: '',
      ticketId: '',
      contactId: '',
      dateFrom: '',
      dateTo: ''
    })
    fetchStats({ dateFrom: '', dateTo: '' })
  }

  const handleOpenDetail = async (row: LeadEventRow) => {
    setSelected(row)
    setDetailError(null)
    try {
      setDetailLoading(true)
      const { data } = await api.get(`/kanban-lead-conversions/${row.id}`)
      setSelected(data)
    } catch (err: any) {
      setDetailError(err?.response?.data?.error || err?.message || 'Error cargando detalle')
    } finally {
      setDetailLoading(false)
    }
  }

  const handleRetry = async () => {
    if (!selected) return
    if (selected.responseStatus !== 'failed') return
    try {
      setRetrying(true)
      setDetailError(null)
      const { data } = await api.post(
        `/kanban-lead-conversions/${selected.id}/retry`
      )
      if (data?.record) {
        setSelected(data.record)
        // Refrescar listado y stats
        fetchList()
        fetchStats()
      }
    } catch (err: any) {
      setDetailError(err?.response?.data?.error || err?.message || 'Error al reintentar')
    } finally {
      setRetrying(false)
    }
  }

  const kpiCards: { key: string; label: string; value: number; tone: Tone; icon: ReactElement }[] = [
    {
      key: 'total',
      label: 'Total',
      value: stats?.total ?? 0,
      tone: 'neutral',
      icon: <TrendUp className="size-5" aria-hidden />
    },
    {
      key: 'sentOrSuccess',
      label: 'Recibidas por Meta',
      value: stats?.success ?? 0,
      tone: 'success',
      icon: <CheckCircle className="size-5" aria-hidden />
    },
    {
      key: 'failed',
      label: 'Fallidos',
      value: stats?.failed ?? 0,
      tone: 'danger',
      icon: <WarningCircle className="size-5" aria-hidden />
    },
    {
      key: 'pendingSkipped',
      label: 'Pendientes / no enviadas',
      value: (stats?.pending ?? 0) + (stats?.skipped ?? 0),
      tone: 'warning',
      icon: <Clock className="size-5" aria-hidden />
    }
  ]

  // ─── Render ────────────────────────────────────────────────────
  return (
    <TooltipProvider>
      <div className={cn(!embedded && 'h-full overflow-y-auto')}>
        <div className={cn('mx-auto max-w-[1400px] space-y-6', !embedded && 'p-5 sm:p-6 lg:p-8')}>
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            {!embedded && (
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[#1877f2]/10 text-[#1877f2]">
                  <FacebookLogo className="size-6" weight="fill" aria-hidden />
                </span>
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    Reporte de conversiones Kanban a Meta
                  </h1>
                  <p className="max-w-2xl text-sm text-muted-foreground">
                    Aquí ves si ChatEAM envió la conversión a Meta, en qué pixel quedó
                    recibida y con qué conversión personalizada debes buscarla en Facebook.
                  </p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  fetchList()
                  fetchStats()
                }}
              >
                <ArrowClockwise className="size-4" aria-hidden />
                Actualizar
              </Button>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpiCards.map(card => (
              <div
                key={card.key}
                className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.label}</p>
                    <p
                      className={cn(
                        'mt-1.5 text-3xl font-semibold tracking-tight tabular-nums',
                        TONE_TEXT[card.tone]
                      )}
                    >
                      {statsLoading ? '…' : Number(card.value).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-lg',
                      TONE_ICON_WRAP[card.tone]
                    )}
                  >
                    {card.icon}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Buscador + filtros */}
          <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="relative flex-1">
                <MagnifyingGlass
                  className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  placeholder="Buscar por ticket, contacto, etiqueta, conversión Meta, pixel, error o ID de soporte…"
                  aria-label="Buscar conversiones"
                  value={qInput}
                  onChange={e => setQInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSearch()
                  }}
                  className={cn(inputClass, 'h-10 pl-10')}
                />
              </div>
              <Button size="sm" className="h-10" onClick={handleSearch}>
                Buscar
              </Button>
            </div>

            <div className="border-t border-border" />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="klc-status">
                  Estado
                </Label>
                <Select
                  value={status || ANY_STATUS}
                  onValueChange={v => setStatus(v === ANY_STATUS ? '' : v)}
                >
                  <SelectTrigger id="klc-status" aria-label="Estado">
                    <SelectValue placeholder="Cualquiera" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY_STATUS}>Cualquiera</SelectItem>
                    <SelectItem value="pending">Pendiente</SelectItem>
                    <SelectItem value="sent">Enviada sin confirmar</SelectItem>
                    <SelectItem value="success">Recibida por Meta</SelectItem>
                    <SelectItem value="failed">Fallido</SelectItem>
                    <SelectItem value="skipped">Omitido</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="klc-kanban-key">
                  Etiqueta interna
                </Label>
                <input
                  id="klc-kanban-key"
                  placeholder="ej: interesado"
                  value={kanbanKey}
                  onChange={e => setKanbanKey(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="klc-ticket-id">
                  Ticket ID
                </Label>
                <input
                  id="klc-ticket-id"
                  type="number"
                  value={ticketId}
                  onChange={e => setTicketId(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="klc-contact-id">
                  ID contacto
                </Label>
                <input
                  id="klc-contact-id"
                  type="number"
                  value={contactId}
                  onChange={e => setContactId(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="klc-date-from">
                  Desde
                </Label>
                <input
                  id="klc-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="klc-date-to">
                  Hasta
                </Label>
                <input
                  id="klc-date-to"
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={handleResetFilters}>
                Limpiar
              </Button>
              <Button size="sm" onClick={handleApplyFilters}>
                <FunnelSimple className="size-4" aria-hidden />
                Aplicar filtros
              </Button>
            </div>
          </div>

          {/* Tabla */}
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
            {loading ? (
              <div className="p-10 text-center">
                <CircularProgress size="md" />
              </div>
            ) : rows.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Aún no hay eventos Lead enviados.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left">
                      {[
                        'Fecha',
                        'Resultado',
                        'Conversión en Meta',
                        'Evento',
                        'Ticket',
                        'Contacto',
                        'Pixel / dataset',
                        'Atribución',
                        'Soporte Meta',
                        'Acción'
                      ].map(c => (
                        <th
                          key={c}
                          className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map(row => {
                      const attribution = getAttributionInfo(row)
                      const location = getMetaLocation(row)
                      return (
                        <tr
                          key={row.id}
                          className="cursor-pointer transition-colors hover:bg-accent/40"
                        >
                          <td
                            className="whitespace-nowrap px-4 py-3 text-muted-foreground"
                            onClick={() => handleOpenDetail(row)}
                          >
                            {formatDate(row.createdAt)}
                          </td>
                          <td className="px-4 py-3" onClick={() => handleOpenDetail(row)}>
                            <Badge variant={TONE_BADGE[STATUS_COLOR[row.responseStatus]]}>
                              {STATUS_ICON[row.responseStatus]}
                              {STATUS_LABELS[row.responseStatus] || row.responseStatus}
                            </Badge>
                          </td>
                          <td className="px-4 py-3" onClick={() => handleOpenDetail(row)}>
                            <span className="block font-medium text-foreground">
                              {truncate(location.conversionName, 40)}
                            </span>
                            <span className="block font-mono text-xs text-muted-foreground">
                              ID {maskId(location.conversionId)}
                            </span>
                          </td>
                          <td className="px-4 py-3" onClick={() => handleOpenDetail(row)}>
                            <Badge variant="outline">{row.eventName}</Badge>
                          </td>
                          <td
                            className="px-4 py-3 tabular-nums text-muted-foreground"
                            onClick={() => handleOpenDetail(row)}
                          >
                            {row.ticketId ?? '—'}
                          </td>
                          <td className="px-4 py-3" onClick={() => handleOpenDetail(row)}>
                            <span className="block text-foreground">
                              {row.contact?.name || row.contactId || '—'}
                            </span>
                            {row.contact?.number && (
                              <span className="block text-xs tabular-nums text-muted-foreground">
                                {row.contact.number}
                              </span>
                            )}
                          </td>
                          <td
                            className="px-4 py-3 font-mono text-xs text-muted-foreground"
                            onClick={() => handleOpenDetail(row)}
                          >
                            {maskId(row.destinationId)}
                          </td>
                          <td className="px-4 py-3" onClick={() => handleOpenDetail(row)}>
                            {/* `Badge` no usa forwardRef; Radix `asChild` necesita
                                un nodo DOM real al que anclar el tooltip. */}
                            <Tooltip title={attribution.detail}>
                              <span className="inline-flex">
                                <Badge variant="neutral">{attribution.label}</Badge>
                              </span>
                            </Tooltip>
                          </td>
                          <td
                            className="px-4 py-3 font-mono text-xs text-muted-foreground"
                            onClick={() => handleOpenDetail(row)}
                          >
                            {maskId(row.fbtraceId)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end">
                              <Tooltip title="Ver detalle">
                                <button
                                  type="button"
                                  aria-label={`Ver detalle del evento ${row.id}`}
                                  onClick={() => handleOpenDetail(row)}
                                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                                >
                                  <Eye className="size-[18px]" aria-hidden />
                                </button>
                              </Tooltip>
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

          {/* Paginación */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {count.toLocaleString()} eventos — página {page} de {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </div>

        {/* Modal Detalle */}
        <Dialog
          open={!!selected}
          onOpenChange={o => {
            if (!o) setSelected(null)
          }}
        >
          <DialogContent className="max-w-4xl">
            {selected && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex flex-wrap items-center gap-2 pr-8">
                    <FacebookLogo className="size-5 text-[#1877f2]" weight="fill" aria-hidden />
                    Evento Lead #{selected.id}
                    <Badge variant={TONE_BADGE[STATUS_COLOR[selected.responseStatus]]}>
                      {STATUS_ICON[selected.responseStatus]}
                      {STATUS_LABELS[selected.responseStatus] || selected.responseStatus}
                    </Badge>
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                  {detailError && (
                    <Callout tone="danger">
                      <p className="text-sm text-destructive-text">{detailError}</p>
                    </Callout>
                  )}
                  {detailLoading && (
                    <div className="flex justify-center">
                      <CircularProgress size="sm" />
                    </div>
                  )}

                  {(() => {
                    const summary = getUserSummary(selected)
                    const location = getMetaLocation(selected)
                    const attribution = getAttributionInfo(selected)
                    const sentBeforeCurrentConversion = wasSentBeforeCurrentConversion(selected)

                    return (
                      <Callout tone={summary.color}>
                        <div className="space-y-3">
                          <p className={cn('text-sm font-semibold', TONE_TEXT[summary.color])}>
                            {summary.title}
                          </p>
                          <p className="text-sm text-foreground">{summary.detail}</p>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field label="Dónde verlo en Facebook">{location.path}</Field>
                            <Field label="Conversión personalizada">
                              {location.conversionName} · ID {location.conversionId}
                            </Field>
                            <Field label="Pixel / dataset" mono>
                              {location.pixelId}
                            </Field>
                            <Field label="Tipo de atribución">
                              {attribution.label}. {attribution.detail}
                            </Field>
                          </div>
                          {sentBeforeCurrentConversion && (
                            <Callout tone="warning" className="p-3">
                              <p className="text-xs text-foreground">
                                Este evento se envió antes de la última sincronización de la
                                conversión personalizada actual. Meta puede haberlo recibido en el
                                pixel, pero no necesariamente contarlo en el ID nuevo.
                              </p>
                            </Callout>
                          )}
                        </div>
                      </Callout>
                    )
                  })()}

                  {/* Sección Kanban */}
                  <SectionCard title="Etiqueta Kanban">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Nombre etiqueta">
                        {selected.kanbanTagName || selected.kanbanTag?.name || '—'}
                      </Field>
                      <Field label="Etiqueta interna" mono>
                        {selected.kanbanKey || '—'}
                      </Field>
                      <Field label="ID etiqueta">{selected.kanbanTagId ?? '—'}</Field>
                      <Field label="Origen interno">{selected.source || '—'}</Field>
                    </div>
                  </SectionCard>

                  {/* Sección Evento */}
                  <SectionCard title="Evento Meta CAPI">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Evento Meta">{selected.eventName}</Field>
                      <Field label="ID deduplicación" mono>
                        {selected.eventId || '—'}
                      </Field>
                      <Field label="ID ticket">{selected.ticketId ?? '—'}</Field>
                      <Field label="ID contacto">
                        {selected.contactId ?? '—'}
                        {selected.contact?.name ? ` — ${selected.contact.name}` : ''}
                      </Field>
                      <Field label="ID empresa">{selected.companyId}</Field>
                      <Field label="Enviado a Meta">{formatDate(selected.sentAt)}</Field>
                    </div>
                  </SectionCard>

                  {/* Sección Destino */}
                  <SectionCard title="Destino Meta (Pixel / Dataset)">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Pixel / dataset ID" mono>
                        {selected.destinationId || '—'}
                      </Field>
                      <Field label="Fuente del pixel/dataset">
                        {selected.destinationSource || '—'}
                      </Field>
                      <Field label="ID soporte Meta" mono>
                        {selected.fbtraceId || '—'}
                      </Field>
                    </div>
                  </SectionCard>

                  {/* Detalle técnico */}
                  <details className="group">
                    <summary className="cursor-pointer list-none text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      Detalle técnico para soporte
                    </summary>
                    <div className="mt-3 space-y-3">
                      <SectionCard title="Datos enviados a Meta">
                        <JsonBlock value={selected.customData} />
                      </SectionCard>
                      <SectionCard title="Identificadores hasheados">
                        <JsonBlock value={selected.userData} />
                      </SectionCard>
                      <SectionCard title="Respuesta original de Meta">
                        <JsonBlock value={selected.fbResponse} />
                      </SectionCard>
                    </div>
                  </details>

                  {selected.errorMessage && (
                    <Callout tone="danger">
                      <p className="text-sm font-semibold text-destructive-text">Error</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                        {selected.errorMessage}
                      </p>
                    </Callout>
                  )}

                  {/* Fechas */}
                  <SectionCard>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <Field label="Creado">{formatDate(selected.createdAt)}</Field>
                      <Field label="Actualizado">{formatDate(selected.updatedAt)}</Field>
                      <Field label="Enviado">{formatDate(selected.sentAt)}</Field>
                    </div>
                  </SectionCard>
                </div>

                {/* Acciones */}
                <DialogFooter>
                  <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                    Cerrar
                  </Button>
                  {selected.responseStatus === 'failed' && (
                    <Button size="sm" loading={retrying} onClick={handleRetry}>
                      <ArrowCounterClockwise className="size-4" aria-hidden />
                      Reintentar envío
                    </Button>
                  )}
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
