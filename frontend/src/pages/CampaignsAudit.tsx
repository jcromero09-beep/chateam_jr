import { useState, useEffect } from 'react'
// [Re-skin Tailwind v4] De MUI Joy sólo se conservan los indicadores de progreso
// (CircularProgress / LinearProgress), que no tienen equivalente en el design system.
import { CircularProgress, LinearProgress } from '@mui/joy'
import {
  Robot,
  TrendUp,
  Warning,
  CheckCircle,
  Info,
  Lightbulb,
  Megaphone,
  DownloadSimple,
  Brain,
  Envelope,
  WhatsappLogo,
  TelegramLogo,
  PencilSimple,
  Eye,
  Trash,
  Check,
  Coins,
  FunnelSimple,
  X,
  MagnifyingGlass,
  CaretDown,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import api from '../services/api'
import { toast } from 'react-toastify'
import MetaAgentPlanCard from '../components/MetaAgentPlanCard'
import MetaOfficialMcpCard from '../components/MetaOfficialMcpCard'
import {
  listMetaConnections,
  sendAgentChatMessage,
  requestPlan,
  PlanResponse,
  MetaConnection,
} from '../services/metaAdsAgentService'

// ── Clases de tabla compartidas (tokens del design system) ────────────────────
const TH = 'whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground'
const TD = 'px-4 py-3 align-middle'

// Reset mínimo para <button> crudos: `tailwind.css` se importa SIN preflight.
const BTN_RESET = 'appearance-none border-0 [font-family:inherit] cursor-pointer'

// Sentinel para el Select de cuenta Meta: Radix no admite <SelectItem value="">.
const MAIN_ACCOUNT = '__main__'

// Botón de acción de fila (mismo look que RowAction del prototipo, con onClick)
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
    <Tooltip title={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={cn(
          BTN_RESET,
          'flex size-8 items-center justify-center rounded-md bg-transparent text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        {children}
      </button>
    </Tooltip>
  )
}

// Chip de filtro activo, con botón de limpiar accesible (target ≥24px).
function FilterChip({
  variant = 'primary',
  clearLabel,
  onClear,
  children,
}: {
  variant?: BadgeProps['variant']
  clearLabel: string
  onClear: () => void
  children: React.ReactNode
}) {
  return (
    <Badge variant={variant} className="py-1 pr-1">
      {children}
      <button
        type="button"
        aria-label={clearLabel}
        onClick={onClear}
        className={cn(
          BTN_RESET,
          'flex size-6 items-center justify-center rounded-full bg-transparent text-current transition-colors hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <X className="size-3" weight="bold" aria-hidden />
      </button>
    </Badge>
  )
}

// Multi-select (Radix Select no soporta `multiple`) → dropdown-menu + checkbox items.
function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  className,
}: {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (next: string[]) => void
  className?: string
}) {
  const toggle = (value: string) =>
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            BTN_RESET,
            'flex h-9 items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
            className,
          )}
        >
          <span className={cn('truncate', selected.length === 0 && 'text-muted-foreground')}>
            {selected.length === 0 ? label : `${label} (${selected.length})`}
          </span>
          <CaretDown className="size-4 shrink-0 opacity-60" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.includes(o.value)}
            onCheckedChange={() => toggle(o.value)}
            onSelect={(e) => e.preventDefault()}
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface AIRecommendation {
  id: number
  campaignId: string
  campaignName: string
  type: 'optimization' | 'warning' | 'opportunity' | 'insight'
  priority: 'critical' | 'high' | 'medium' | 'low'
  category: 'timing' | 'content' | 'segmentation' | 'budget' | 'channel'
  title: string
  description: string
  impact: string
  effort: string
  potentialGain: string
  actionData?: any
  status: 'active' | 'applied' | 'dismissed'
  appliedAt?: string
  createdAt: string
  updatedAt: string
}

interface CampaignScore {
  campaignId: string
  campaignName: string
  channel: string
  overallScore: number
  contentScore: number
  timingScore: number
  audienceScore: number
  budgetScore: number
  performanceScore: number
  recommendations: number
}

interface TokenStatus {
  available: boolean
  used: number
  limit: number
  remaining: number
}

interface FacebookCampaign {
  id: string
  name: string
  status: string
  effective_status?: string
  objective: string
  daily_budget?: number
  lifetime_budget?: number
  budget_remaining?: number
  stop_time?: string
  activeAds?: number
  created_time: string
  insights: {
    impressions: number
    clicks: number
    spend: number
    reach: number
    frequency: number
    ctr: number
    cpc: number
    cpm: number
  }
}

interface AgentChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  plan?: PlanResponse
}

type DeliveryState = 'ACTIVA' | 'NO_HAY_ANUNCIOS' | 'COMPLETADA' | 'DESACTIVADA' | 'PAUSADA'

function classifyCampaignDelivery(campaign: FacebookCampaign): DeliveryState {
  if (campaign.status === 'PAUSED') return 'DESACTIVADA'

  if (campaign.effective_status === 'COMPLETED') return 'COMPLETADA'

  if (campaign.effective_status === 'CAMPAIGN_PAUSED') {
    const hasValidStopTime = campaign.stop_time && campaign.stop_time !== '0000-00-00' && campaign.stop_time !== ''
    const stopTimePassed = hasValidStopTime && campaign.stop_time && new Date(campaign.stop_time) < new Date()
    const budgetExhausted = campaign.budget_remaining !== undefined && Number(campaign.budget_remaining) <= 0

    if (stopTimePassed || (budgetExhausted && campaign.daily_budget === undefined && campaign.lifetime_budget === undefined)) {
      return 'COMPLETADA'
    }

    return 'PAUSADA'
  }

  const hasLifetimeBudget = campaign.lifetime_budget !== undefined && Number(campaign.lifetime_budget) > 0
  const hasDailyBudget = campaign.daily_budget !== undefined && Number(campaign.daily_budget) > 0
  const budgetRemaining = campaign.budget_remaining !== undefined ? Number(campaign.budget_remaining) : null

  if (hasLifetimeBudget && !hasDailyBudget && budgetRemaining !== null && budgetRemaining <= 0) {
    return 'COMPLETADA'
  }

  if (campaign.stop_time && campaign.stop_time !== '0000-00-00' && campaign.stop_time !== '') {
    const stopDate = new Date(campaign.stop_time)
    if (!isNaN(stopDate.getTime()) && stopDate < new Date()) {
      if (!hasDailyBudget || (budgetRemaining !== null && budgetRemaining <= 0)) {
        return 'COMPLETADA'
      }
    }
  }

  if (campaign.activeAds !== undefined && campaign.activeAds === 0) {
    return 'NO_HAY_ANUNCIOS'
  }

  if (campaign.status === 'ACTIVE' && campaign.effective_status === 'ACTIVE') return 'ACTIVA'
  if (campaign.status === 'ACTIVE') return 'ACTIVA'

  if (campaign.effective_status === 'PAUSED' || campaign.effective_status === 'DELETED' || campaign.effective_status === 'ARCHIVED') {
    return 'DESACTIVADA'
  }

  if (hasDailyBudget || hasLifetimeBudget) return 'ACTIVA'

  return 'DESACTIVADA'
}

export default function CampaignsAudit() {
  const [loading, setLoading] = useState(false)
  const [period, setPeriod] = useState('last_30_days')
  const [filter, setFilter] = useState('all')
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([])
  const [campaignScores, setCampaignScores] = useState<CampaignScore[]>([])
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null)
  const [runningAudit, setRunningAudit] = useState(false)
  const [runningCampaignAudit, setRunningCampaignAudit] = useState(false)

  // New filter states - ACTIVE por defecto para solo mostrar campañas activas
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState<string>('ACTIVE')
  const [dateRange, setDateRange] = useState<{
    from: string | null
    to: string | null
  }>({
    from: null,
    to: null
  })

  // Advanced campaign filter states
  const [spendRange, setSpendRange] = useState<{ min: number | null; max: number | null }>({
    min: null,
    max: null
  })
  const [ctrThreshold, setCtrThreshold] = useState<{ operator: 'gt' | 'lt' | 'eq' | 'any'; value: number | null }>({
    operator: 'any',
    value: null
  })
  const [cpcThreshold, setCpcThreshold] = useState<{ operator: 'gt' | 'lt' | 'eq' | 'any'; value: number | null }>({
    operator: 'any',
    value: null
  })
  const [impressionsThreshold, setImpressionsThreshold] = useState<number | null>(null)
  const [objectiveFilter, setObjectiveFilter] = useState<string[]>([])
  const [campaignNameSearch, setCampaignNameSearch] = useState<string>('')

  // Estados para filtro de mensajes (conversaciones de campañas)
  const [messageDateSince, setMessageDateSince] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 29)
    return d.toISOString().split('T')[0]
  })
  const [messageDateUntil, setMessageDateUntil] = useState(() => new Date().toISOString().split('T')[0])

  // Estados para conexiones WhatsApp (Facebook)
  const [selectedConnection, setSelectedConnection] = useState<number | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'error'>('checking')
  const [debugMode, setDebugMode] = useState(false)

  // Estados para datos de campañas
  const [activeCampaignOptions, setActiveCampaignOptions] = useState<FacebookCampaign[]>([])
  const [loadingCampaignOptions, setLoadingCampaignOptions] = useState(false)
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('')

  // Modal states
  const [selectedRecommendation, setSelectedRecommendation] = useState<AIRecommendation | null>(null)
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [editForm, setEditForm] = useState<Partial<AIRecommendation>>({})
  const [filterModalOpen, setFilterModalOpen] = useState(false)

  // Pagination states
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)

  // ── Agente IA Meta Ads (plan + execute) ──────────────────────────────────
  const [agentPrompt, setAgentPrompt] = useState('')
  const [agentLoading, setAgentLoading] = useState(false)
  const [agentConnections, setAgentConnections] = useState<MetaConnection[]>([])
  const [agentSelectedWaId, setAgentSelectedWaId] = useState<number | null>(null)
  const [currentPlan, setCurrentPlan] = useState<PlanResponse | null>(null)
  const [planModalOpen, setPlanModalOpen] = useState(false)
  const [agentChatMessages, setAgentChatMessages] = useState<AgentChatMessage[]>([])

  // OAuth callback result (leído del querystring por el componente MetaOfficialMcpCard)
  const [mcpOauthResult, setMcpOauthResult] = useState<'success' | 'error' | null>(null)
  const [mcpOauthReason, setMcpOauthReason] = useState<string | null>(null)

  // Table filters for recommendations
  const [tableFilters, setTableFilters] = useState<{
    searchText: string
    priorityFilter: string[]
    typeFilter: string[]
    categoryFilter: string[]
    statusFilter: string[]
  }>({
    searchText: '',
    priorityFilter: [],
    typeFilter: [],
    categoryFilter: [],
    statusFilter: []
  })

  const selectedCampaign = activeCampaignOptions.find(campaign => String(campaign.id) === selectedCampaignId) || null
  const isGeneratingRecommendations = runningAudit || runningCampaignAudit
  const loadingTitle = runningCampaignAudit
    ? 'Analizando conversaciones de la campaña'
    : 'Generando recomendaciones'
  const loadingDescription = runningCampaignAudit
    ? selectedCampaign
      ? `La IA está leyendo los tickets y mensajes vinculados a "${selectedCampaign.name}". Esto puede tardar un poco.`
      : 'La IA está leyendo los tickets y mensajes vinculados a la campaña seleccionada. Esto puede tardar un poco.'
    : 'La IA está procesando campañas activas y construyendo recomendaciones. Si hay muchas campañas, puede tardar unos momentos.'
  const loadingChipLabel = runningCampaignAudit
    ? 'Procesando ticket por ticket'
    : 'Procesando campañas activas'

  // Funciones para obtener conexiones
  const fetchAdsConnections = async () => {
    try {
      const response = await api.get('/whatsapp')
      const connections = response.data.whatsapps || response.data || []

      // Filtrar solo conexiones de Facebook con Ad Account ID
      const fbConnections = connections.filter(
        (conn: any) => conn.channel === 'facebook' && conn.facebookAdAccountId
      )

      if (fbConnections.length === 1) {
        setSelectedConnection(fbConnections[0].id)
        checkConnection(fbConnections[0].id)
      } else if (fbConnections.length === 0) {
        tryDebugMode()
      }
    } catch (error: any) {
      console.error('Error fetching connections:', error)
      tryDebugMode()
    }
  }

  const checkConnection = async (whatsappId: number) => {
    try {
      const response = await api.get(`/meta-marketing/test-connection?whatsappId=${whatsappId}`)
      if (response.data.success) {
        setConnectionStatus('connected')
      } else {
        setConnectionStatus('error')
      }
    } catch (error) {
      setConnectionStatus('error')
    }
  }

  const tryDebugMode = async () => {
    try {
      const response = await api.get('/meta-marketing/test-connection')
      if (response.data.success) {
        setDebugMode(true)
        setConnectionStatus('connected')
      }
    } catch (error) {
      setConnectionStatus('error')
    }
  }

  useEffect(() => {
    fetchAdsConnections()
  }, [])

  useEffect(() => {
    if (connectionStatus === 'connected') {
      fetchAuditData()
    }
  }, [period, filter, deliveryStatusFilter, dateRange.from, dateRange.to, selectedCampaignId, connectionStatus])

  useEffect(() => {
    if (connectionStatus === 'connected') {
      fetchActiveCampaignOptions()
    }
  }, [connectionStatus, selectedConnection, debugMode, period])

  // Reset page when table filters change
  useEffect(() => {
    setPage(0)
  }, [tableFilters])

  // ── Agente IA Meta Ads — cargar conexiones disponibles ─────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const data = await listMetaConnections()
        setAgentConnections(data)
        // Si solo hay 1 conexión con AdAccount, preseleccionar
        const firstWithAd = data.find((c) => c.facebookAdAccountId)
        if (firstWithAd) setAgentSelectedWaId(firstWithAd.id)
      } catch (err: any) {
        // No bloquea la página: simplemente queda sin conexiones (fallback Capa B en backend)
        console.warn('[CampaignsAudit.agent] listMetaConnections falló:', err?.message || err)
      }
    }
    load()
  }, [])

  // ── OAuth callback result desde el querystring ─────────────────────────
  // El backend redirige a /campaigns/audit?mcp_oauth=success|error&reason=...
  // tras completar (o fallar) el flow OAuth contra mcp.facebook.com/ads.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const oauth = params.get('mcp_oauth')
    if (oauth === 'success' || oauth === 'error') {
      setMcpOauthResult(oauth)
      setMcpOauthReason(params.get('reason'))
    }
  }, [])

  const handleMcpCallbackHandled = () => {
    // Limpia los params del querystring para no re-disparar la alerta
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.delete('mcp_oauth')
      url.searchParams.delete('reason')
      window.history.replaceState({}, '', url.toString())
    }
    setMcpOauthResult(null)
    setMcpOauthReason(null)
  }

  const handleGenerateAgentPlan = async () => {
    if (!agentPrompt.trim()) {
      toast.warn('Escribe una pregunta o instrucción para el agente')
      return
    }
    setAgentLoading(true)
    try {
      const plan = await requestPlan({
        prompt: agentPrompt.trim(),
        whatsappId: agentSelectedWaId,
      })
      setCurrentPlan(plan)
      setPlanModalOpen(true)
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Error generando plan'
      toast.error(msg)
    } finally {
      setAgentLoading(false)
    }
  }

  const handleSendAgentChatMessage = async () => {
    const prompt = agentPrompt.trim()
    if (!prompt) {
      toast.warn('Escribe una pregunta para el agente')
      return
    }

    const userMessage: AgentChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: prompt,
    }

    setAgentChatMessages((prev) => [...prev, userMessage])
    setAgentPrompt('')
    setAgentLoading(true)

    try {
      const response = await sendAgentChatMessage({
        message: prompt,
        whatsappId: agentSelectedWaId,
      })

      const plan = response.plan || null

      const assistantMessage: AgentChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.message || 'Listo, procesé tu solicitud.',
        plan: plan || undefined,
      }

      if (plan) setCurrentPlan(plan)
      setAgentChatMessages((prev) => [...prev, assistantMessage])
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Error consultando al agente'
      setAgentChatMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: msg,
        },
      ])
      toast.error(msg)
    } finally {
      setAgentLoading(false)
    }
  }

  const fetchAuditData = async () => {
    setLoading(true)
    try {
      // Validate date range
      if (dateRange.from && dateRange.to) {
        const from = new Date(dateRange.from)
        const to = new Date(dateRange.to)

        if (from > to) {
          toast.error('La fecha "Desde" no puede ser posterior a la fecha "Hasta"')
          setLoading(false)
          return
        }
      }

      // Build query parameters
      const params = new URLSearchParams()
      if (filter !== 'all') params.append('status', filter)
      if (deliveryStatusFilter !== 'all') params.append('campaignStatus', deliveryStatusFilter)
      if (dateRange.from) params.append('dateFrom', dateRange.from)
      if (dateRange.to) params.append('dateTo', dateRange.to)
      if (selectedCampaignId) params.append('campaignId', selectedCampaignId)

      // Fetch recommendations and token status
      const [recsResponse, scoresResponse] = await Promise.all([
        api.get(`/campaigns/audit/recommendations?${params.toString()}`),
        api.get(`/campaigns/audit/scores?period=${period}`)
      ])

      setRecommendations(recsResponse.data.recommendations || [])
      setTokenStatus(recsResponse.data.tokenStatus || null)
      const scores = scoresResponse.data.scores || []
      setCampaignScores(
        selectedCampaignId
          ? scores.filter((score: CampaignScore) => score.campaignId === selectedCampaignId)
          : scores
      )
    } catch (error: any) {
      console.error('Error fetching audit data:', error)
      toast.error(error.response?.data?.error || 'Error cargando datos de auditoria')
    } finally {
      setLoading(false)
    }
  }

  const fetchCampaignsData = async () => {
    if (!selectedConnection && !debugMode) {
      toast.error('No hay conexión de Facebook configurada')
      return []
    }

    try {
      const url = debugMode
        ? `/meta-marketing/dashboard?period=${period}`
        : `/meta-marketing/dashboard?period=${period}&whatsappId=${selectedConnection}`
      console.log(`📊 Fetching campaigns data for audit: ${url}`)
      const response = await api.get(url)

      if (response.data.success) {
        return response.data.campaigns || []
      } else {
        toast.error(response.data.message || 'Error al cargar campañas')
        return []
      }
    } catch (err: any) {
      console.error('Error fetching campaigns data:', err)
      toast.error(err.response?.data?.message || 'Error al cargar datos de campañas')
      return []
    }
  }

  const fetchActiveCampaignOptions = async () => {
    if (!selectedConnection && !debugMode) {
      setActiveCampaignOptions([])
      setSelectedCampaignId('')
      return
    }

    setLoadingCampaignOptions(true)
    try {
      const params: Record<string, string | number> = { period }
      if (!debugMode && selectedConnection) {
        params.whatsappId = selectedConnection
      }

      const response = await api.get('/meta-marketing/campaigns', { params })
      const allCampaigns = response.data.campaigns || response.data || []
      const activeCampaigns = allCampaigns.filter((campaign: FacebookCampaign) => classifyCampaignDelivery(campaign) === 'ACTIVA')

      setActiveCampaignOptions(activeCampaigns)
      setSelectedCampaignId(prev =>
        activeCampaigns.some((campaign: FacebookCampaign) => String(campaign.id) === prev) ? prev : ''
      )
    } catch (error: any) {
      console.error('Error fetching active campaign options:', error)
      toast.error(error.response?.data?.message || 'Error cargando campañas activas')
      setActiveCampaignOptions([])
    } finally {
      setLoadingCampaignOptions(false)
    }
  }

  const runAIAudit = async () => {
    if (tokenStatus && !tokenStatus.available) {
      toast.error(`Limite de tokens alcanzado (${tokenStatus.used}/${tokenStatus.limit})`)
      return
    }

    setRunningAudit(true)
    try {
      // Primero obtener datos frescos de campañas
      const campaigns = await fetchCampaignsData()

      if (!campaigns || campaigns.length === 0) {
        toast.error('No hay datos de campañas disponibles para analizar')
        setRunningAudit(false)
        return
      }

      // 🔥 FILTRAR CAMPAÑAS SEGÚN FILTROS ACTIVOS
      let filteredCampaigns = [...campaigns]
      const totalCampaigns = campaigns.length

      // 🔥 Filtro por estado de entrega REAL (effective_status como Ads Manager)
      // Meta usa effective_status para el estado operativo real de la campaña
      if (deliveryStatusFilter !== 'all') {
        const now = new Date()
        filteredCampaigns = filteredCampaigns.filter(campaign => {
          // Obtener effective_status (puede venir como effective_status o effectiveStatus)
          const effectiveStatus = campaign.effective_status || campaign.effectiveStatus || campaign.status

          // Verificar si está realmente completada por fecha o presupuesto
          const stopTime = campaign.stop_time
          const budgetRemaining = Number(campaign.budget_remaining) || 0
          const hasLifetimeBudget = campaign.lifetime_budget !== undefined

          // Determinar estado real de entrega
          let realDeliveryState = effectiveStatus

          // Si stop_time pasó → COMPLETED
          if (stopTime && new Date(stopTime) < now) {
            realDeliveryState = 'COMPLETED'
          }
          // Si presupuesto agotado → COMPLETED
          else if (hasLifetimeBudget && budgetRemaining <= 10) {
            realDeliveryState = 'COMPLETED'
          }

          return realDeliveryState === deliveryStatusFilter
        })
        console.log(`🔍 Filtrado por effective_status=${deliveryStatusFilter}: ${filteredCampaigns.length} de ${totalCampaigns} campañas`)
      }

      // Filtro por rango de fechas (created_time de la campaña)
      if (dateRange.from || dateRange.to) {
        filteredCampaigns = filteredCampaigns.filter(campaign => {
          const campaignDate = new Date(campaign.created_time)

          if (dateRange.from) {
            const fromDate = new Date(dateRange.from)
            if (campaignDate < fromDate) return false
          }

          if (dateRange.to) {
            const toDate = new Date(dateRange.to)
            toDate.setDate(toDate.getDate() + 1) // Incluir el día completo
            if (campaignDate >= toDate) return false
          }

          return true
        })
        console.log(`📅 Filtrado por fechas: ${filteredCampaigns.length} campañas`)
      }

      // Filtro por rango de gasto
      if (spendRange.min !== null || spendRange.max !== null) {
        filteredCampaigns = filteredCampaigns.filter(campaign => {
          const spend = campaign.insights?.spend || 0
          if (spendRange.min !== null && spend < spendRange.min) return false
          if (spendRange.max !== null && spend > spendRange.max) return false
          return true
        })
        console.log(`💰 Filtrado por rango de gasto: ${filteredCampaigns.length} campañas`)
      }

      // Filtro por CTR threshold
      if (ctrThreshold.operator !== 'any' && ctrThreshold.value !== null) {
        filteredCampaigns = filteredCampaigns.filter(campaign => {
          const ctr = campaign.insights?.ctr || 0
          if (ctrThreshold.operator === 'gt') return ctr > ctrThreshold.value!
          if (ctrThreshold.operator === 'lt') return ctr < ctrThreshold.value!
          if (ctrThreshold.operator === 'eq') return ctr === ctrThreshold.value!
          return true
        })
        console.log(`📊 Filtrado por CTR: ${filteredCampaigns.length} campañas`)
      }

      // Filtro por CPC threshold
      if (cpcThreshold.operator !== 'any' && cpcThreshold.value !== null) {
        filteredCampaigns = filteredCampaigns.filter(campaign => {
          const cpc = campaign.insights?.cpc || 0
          if (cpcThreshold.operator === 'gt') return cpc > cpcThreshold.value!
          if (cpcThreshold.operator === 'lt') return cpc < cpcThreshold.value!
          if (cpcThreshold.operator === 'eq') return cpc === cpcThreshold.value!
          return true
        })
        console.log(`💵 Filtrado por CPC: ${filteredCampaigns.length} campañas`)
      }

      // Filtro por impressions threshold
      if (impressionsThreshold !== null) {
        filteredCampaigns = filteredCampaigns.filter(campaign => {
          const impressions = campaign.insights?.impressions || 0
          return impressions >= impressionsThreshold
        })
        console.log(`👁️ Filtrado por impressions: ${filteredCampaigns.length} campañas`)
      }

      // Filtro por objetivo
      if (objectiveFilter.length > 0) {
        filteredCampaigns = filteredCampaigns.filter(campaign =>
          objectiveFilter.includes(campaign.objective)
        )
        console.log(`🎯 Filtrado por objetivo: ${filteredCampaigns.length} campañas`)
      }

      // Filtro por nombre de campaña
      if (campaignNameSearch.trim() !== '') {
        const searchLower = campaignNameSearch.toLowerCase()
        filteredCampaigns = filteredCampaigns.filter(campaign =>
          campaign.name.toLowerCase().includes(searchLower)
        )
        console.log(`🔍 Filtrado por nombre: ${filteredCampaigns.length} campañas`)
      }

      if (filteredCampaigns.length === 0) {
        toast.error('No hay campañas que cumplan con los filtros aplicados')
        setRunningAudit(false)
        return
      }

      console.log(`🤖 Enviando ${filteredCampaigns.length} campañas filtradas a la IA (de ${totalCampaigns} totales)`)

      // Enviar solo las campañas FILTRADAS al backend
      const response = await api.post('/campaigns/audit/recommendations/generate', {
        period,
        campaigns: filteredCampaigns, // ✅ Solo campañas filtradas
        messageDateSince,
        messageDateUntil
      })

      const message = totalCampaigns !== filteredCampaigns.length
        ? `Generadas ${response.data.generated} recomendaciones de ${filteredCampaigns.length} campañas filtradas (${response.data.tokensUsed} tokens)`
        : `Generadas ${response.data.generated} recomendaciones (${response.data.tokensUsed} tokens usados)`

      toast.success(message)
      await fetchAuditData()
    } catch (error: any) {
      console.error('Error running AI audit:', error)
      toast.error(error.response?.data?.error || 'Error generando recomendaciones')
    } finally {
      setRunningAudit(false)
    }
  }

  const runSelectedCampaignAudit = async () => {
    if (!selectedCampaignId) {
      toast.error('Selecciona una campaña activa para analizar sus conversaciones')
      return
    }

    if (tokenStatus && !tokenStatus.available) {
      toast.error(`Limite de tokens alcanzado (${tokenStatus.used}/${tokenStatus.limit})`)
      return
    }

    setRunningCampaignAudit(true)
    try {
      const campaigns = await fetchCampaignsData()
      const selectedCampaignData = campaigns.find((campaign: { id: number | string }) => String(campaign.id) === selectedCampaignId)

      if (!selectedCampaignData) {
        toast.error('No se pudo cargar la campaña seleccionada para auditoría')
        return
      }

      const response = await api.post('/campaigns/audit/recommendations/generate', {
        period,
        campaigns: [selectedCampaignData],
        campaignId: selectedCampaignId,
        whatsappId: debugMode ? undefined : selectedConnection,
        messageDateSince,
        messageDateUntil
      })

      toast.success(
        `Analisis conversacional completado para ${selectedCampaignData.name} (${response.data.generated} recomendacion, ${response.data.tokensUsed} tokens)`
      )
      await fetchAuditData()
    } catch (error: any) {
      console.error('Error running selected campaign audit:', error)
      toast.error(error.response?.data?.error || 'Error generando la recomendación de la campaña seleccionada')
    } finally {
      setRunningCampaignAudit(false)
    }
  }

  const handleApplyRecommendation = async (rec: AIRecommendation) => {
    try {
      await api.post(`/campaigns/audit/recommendations/${rec.id}/apply`)
      toast.success('Recomendacion marcada como aplicada')
      await fetchAuditData()
      setDetailModalOpen(false)
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Error aplicando recomendacion')
    }
  }

  const handleEditRecommendation = async () => {
    if (!selectedRecommendation) return
    try {
      await api.put(`/campaigns/audit/recommendations/${selectedRecommendation.id}`, editForm)
      toast.success('Recomendacion actualizada')
      await fetchAuditData()
      setEditModalOpen(false)
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Error actualizando recomendacion')
    }
  }

  const handleDismissRecommendation = async () => {
    if (!selectedRecommendation) return
    try {
      await api.delete(`/campaigns/audit/recommendations/${selectedRecommendation.id}`)
      toast.success('Recomendacion eliminada permanentemente')
      await fetchAuditData()
      setDeleteModalOpen(false)
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Error eliminando recomendacion')
    }
  }

  const openDetailModal = (rec: AIRecommendation) => {
    setSelectedRecommendation(rec)
    setDetailModalOpen(true)
  }

  const openEditModal = (rec: AIRecommendation) => {
    setSelectedRecommendation(rec)
    setEditForm({
      title: rec.title,
      description: rec.description,
      impact: rec.impact,
      effort: rec.effort,
      potentialGain: rec.potentialGain,
      priority: rec.priority,
      category: rec.category
    })
    setEditModalOpen(true)
  }

  const openDeleteModal = (rec: AIRecommendation) => {
    setSelectedRecommendation(rec)
    setDeleteModalOpen(true)
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return <Warning className="size-[18px] text-warning-text" aria-hidden />
      case 'optimization':
        return <TrendUp className="size-[18px] text-success-text" aria-hidden />
      case 'opportunity':
        return <Lightbulb className="size-[18px] text-primary" aria-hidden />
      case 'insight':
        return (
          <Info
            className="size-[18px] text-[color:var(--brand-teal)] dark:text-brand-cyan"
            aria-hidden
          />
        )
      default:
        return <Robot className="size-[18px] text-muted-foreground" aria-hidden />
    }
  }

  const getPriorityColor = (priority: string): BadgeProps['variant'] => {
    switch (priority) {
      case 'critical':
        return 'destructive'
      case 'high':
        return 'warning'
      case 'medium':
        return 'primary'
      case 'low':
        return 'neutral'
      default:
        return 'neutral'
    }
  }

  // Color Joy que aún consume el LinearProgress determinado de los scores.
  const getScoreColor = (score: number): 'success' | 'primary' | 'warning' | 'danger' => {
    if (score >= 80) return 'success'
    if (score >= 60) return 'primary'
    if (score >= 40) return 'warning'
    return 'danger'
  }

  // Mismo umbral que getScoreColor, pero en tokens del design system.
  const getScoreTone = (score: number): 'success' | 'primary' | 'warning' | 'destructive' => {
    if (score >= 80) return 'success'
    if (score >= 60) return 'primary'
    if (score >= 40) return 'warning'
    return 'destructive'
  }

  const scoreCircleClass: Record<string, string> = {
    success: 'border-success/40 bg-success/14 text-success-text',
    primary: 'border-primary/40 bg-primary/12 text-primary',
    warning: 'border-warning/40 bg-warning/16 text-warning-text',
    destructive: 'border-destructive/40 bg-destructive/12 text-destructive-text',
  }

  const getChannelIcon = (channel: string) => {
    switch (channel?.toLowerCase()) {
      case 'whatsapp':
        return <WhatsappLogo className="size-[18px] text-wa" weight="fill" aria-hidden />
      case 'email':
        return <Envelope className="size-[18px] text-primary" weight="fill" aria-hidden />
      case 'telegram':
        return <TelegramLogo className="size-[18px] text-[#0088cc]" weight="fill" aria-hidden />
      default:
        return <Megaphone className="size-[18px] text-muted-foreground" aria-hidden />
    }
  }

  const criticalCount = recommendations.filter((r) => r.priority === 'critical').length
  const highCount = recommendations.filter((r) => r.priority === 'high').length
  const activeCount = recommendations.filter((r) => r.status === 'active').length
  const appliedCount = recommendations.filter((r) => r.status === 'applied').length

  const exportReport = async () => {
    try {
      const params = new URLSearchParams()
      if (filter !== 'all') params.append('status', filter)
      if (selectedCampaignId) params.append('campaignId', selectedCampaignId)

      const response = await api.get(`/campaigns/audit/export?${params.toString()}`, {
        responseType: 'blob'
      })

      // Si el backend retorna JSON (sin datos), manejarlo
      if (response.headers['content-type']?.includes('application/json')) {
        toast.info('No hay recomendaciones para exportar')
        return
      }

      // Descargar archivo CSV
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `audit-recomendaciones-${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)

      toast.success('Reporte exportado exitosamente')
    } catch (error: any) {
      console.error('Error exporting report:', error)
      toast.error('Error al exportar reporte')
    }
  }

  // Helper to count active filters
  const getActiveFiltersCount = () => {
    let count = 0
    if (filter !== 'all') count++
    if (deliveryStatusFilter !== 'all') count++
    if (dateRange.from || dateRange.to) count++
    if (spendRange.min !== null || spendRange.max !== null) count++
    if (ctrThreshold.operator !== 'any') count++
    if (cpcThreshold.operator !== 'any') count++
    if (impressionsThreshold !== null) count++
    if (objectiveFilter.length > 0) count++
    if (campaignNameSearch.trim() !== '') count++
    if (selectedCampaignId) count++
    return count
  }

  const clearAllFilters = () => {
    setFilter('all')
    setDeliveryStatusFilter('all')
    setDateRange({ from: null, to: null })
    setSpendRange({ min: null, max: null })
    setCtrThreshold({ operator: 'any', value: null })
    setCpcThreshold({ operator: 'any', value: null })
    setImpressionsThreshold(null)
    setObjectiveFilter([])
    setCampaignNameSearch('')
    setSelectedCampaignId('')
    const d = new Date()
    d.setDate(d.getDate() - 29)
    setMessageDateSince(d.toISOString().split('T')[0])
    setMessageDateUntil(new Date().toISOString().split('T')[0])
  }

  // CHAT_ONLY_MODE deja la auditoria original comentada funcionalmente.
  // No se borra codigo: el return completo de auditoria permanece debajo para reactivarlo.
  const CHAT_ONLY_MODE = true

  if (CHAT_ONLY_MODE) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-96px)] max-w-3xl flex-col gap-4 p-5 sm:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Robot className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Agente Meta Ads
              </h1>
              <p className="text-sm text-muted-foreground">
                Pregunta por campañas, reportes e insights. Las acciones quedan para la siguiente fase.
              </p>
            </div>
          </div>
        </div>

        {/* Card del MCP oficial — flow OAuth completo dentro del sistema */}
        <MetaOfficialMcpCard
          oauthCallbackResult={mcpOauthResult}
          oauthCallbackReason={mcpOauthReason}
          onCallbackHandled={handleMcpCallbackHandled}
        />

        {/* Selector de cuenta Meta */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/[0.02]">
          <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
            <div className="space-y-1.5">
              <Label htmlFor="agent-account-chat">Cuenta Meta</Label>
              <Select
                value={agentSelectedWaId === null ? MAIN_ACCOUNT : String(agentSelectedWaId)}
                onValueChange={(v) => setAgentSelectedWaId(v === MAIN_ACCOUNT ? null : Number(v))}
              >
                <SelectTrigger
                  id="agent-account-chat"
                  className="min-w-[240px]"
                  aria-label="Cuenta Meta"
                >
                  <SelectValue placeholder="Cuenta Meta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={MAIN_ACCOUNT}>Cuenta principal de la empresa</SelectItem>
                  {agentConnections.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                      {c.facebookAdAccountId ? ` · act_${c.facebookAdAccountId}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Hilo de conversación */}
        <div className="min-h-[420px] flex-1 overflow-y-auto rounded-lg border border-border bg-background p-4">
          <div className="flex flex-col gap-3">
            {agentChatMessages.length === 0 && (
              <div className="mx-auto flex max-w-[520px] flex-col items-center gap-2 py-12 text-center">
                <Brain className="size-10 text-primary" aria-hidden />
                <p className="text-lg font-semibold text-foreground">
                  Pregunta algo sobre tus campañas
                </p>
                <p className="text-sm text-muted-foreground">
                  Prueba con: "listame las campañas activas", "dame un reporte de la campaña X" o "que me recomiendas mejorar esta semana".
                </p>
              </div>
            )}

            {agentChatMessages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex',
                  message.role === 'user' ? 'justify-end' : 'justify-start',
                )}
              >
                <div
                  className={cn(
                    'max-w-[82%] rounded-lg p-3.5 text-sm',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border bg-card text-card-foreground',
                  )}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.plan && message.plan.proposedActions?.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => {
                        setCurrentPlan(message.plan || null)
                        setPlanModalOpen(true)
                      }}
                    >
                      Ver plan sugerido
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {agentLoading && (
              <div className="flex items-center gap-2">
                <CircularProgress size="sm" />
                <p className="text-sm text-muted-foreground">
                  Consultando campañas y preparando respuesta...
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/[0.02]">
          <div className="flex flex-col gap-2 md:flex-row">
            <textarea
              rows={1}
              aria-label="Pregunta para el agente Meta Ads"
              placeholder="Escribe tu pregunta para el agente Meta Ads..."
              value={agentPrompt}
              onChange={(e) => setAgentPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSendAgentChatMessage()
                }
              }}
              className="min-h-11 max-h-32 flex-1 resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            <Button
              onClick={handleSendAgentChatMessage}
              loading={agentLoading}
              disabled={!agentPrompt.trim()}
              className="min-w-[120px]"
            >
              <Brain className="size-4" aria-hidden />
              Enviar
            </Button>
          </div>
        </div>

        <MetaAgentPlanCard
          open={planModalOpen}
          plan={currentPlan}
          onClose={() => setPlanModalOpen(false)}
          onExecuted={() => {
            if (selectedConnection && connectionStatus === 'connected') {
              fetchCampaignsData()
            }
          }}
        />
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* ───────── Agente IA Meta Ads (plan + execute) ───────── */}
        <div className="rounded-xl border border-primary/30 bg-primary/[0.06] p-5">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Robot className="size-5 text-primary" weight="fill" aria-hidden />
              <h2 className="text-base font-semibold text-foreground">
                Pregúntale al Agente IA · Meta Ads
              </h2>
              <Badge variant="primary">Beta</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Ejemplo: "lista mis 5 campañas con peor CPL los últimos 7 días" · "pausa las campañas con gasto sin conversiones" · "duplica la mejor del mes con +20% de presupuesto".
              El agente devuelve un plan que tú revisas y confirmas antes de ejecutar.
            </p>

            <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
              <Select
                value={agentSelectedWaId === null ? MAIN_ACCOUNT : String(agentSelectedWaId)}
                onValueChange={(v) => setAgentSelectedWaId(v === MAIN_ACCOUNT ? null : Number(v))}
              >
                <SelectTrigger className="min-w-[240px] md:w-[240px]" aria-label="Cuenta Meta a usar">
                  <SelectValue placeholder="Cuenta Meta a usar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={MAIN_ACCOUNT}>Cuenta principal de la empresa</SelectItem>
                  {agentConnections.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                      {c.facebookAdAccountId ? ` · act_${c.facebookAdAccountId}` : ''}
                      {c.status ? ` · ${c.status}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <textarea
                rows={1}
                aria-label="Qué quieres analizar o cambiar en tus campañas"
                placeholder="¿Qué quieres analizar o cambiar en tus campañas?"
                value={agentPrompt}
                onChange={(e) => setAgentPrompt(e.target.value)}
                className="min-h-9 max-h-24 flex-1 resize-y rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />

              <Button
                size="sm"
                onClick={handleGenerateAgentPlan}
                loading={agentLoading}
                disabled={!agentPrompt.trim()}
                className="min-w-[160px]"
              >
                <Brain className="size-4" aria-hidden />
                Generar plan
              </Button>
            </div>
          </div>
        </div>

        {/* Header - Compacto */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Título */}
          <div className="flex items-center gap-3">
            <span className="relative flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Robot className="size-7" weight="fill" aria-hidden />
              {activeCount > 0 && (
                <span
                  className="absolute -right-1.5 -top-1.5 flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold leading-none text-destructive-foreground"
                  aria-label={`${activeCount} recomendaciones activas`}
                >
                  {activeCount > 99 ? '99+' : activeCount}
                </span>
              )}
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Auditoría con IA
              </h1>
              <p className="text-sm text-muted-foreground">
                Recomendaciones inteligentes para optimizar tus campañas
              </p>
            </div>
          </div>

          {/* Controles */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Token Status */}
            {tokenStatus && (
              <Badge variant={tokenStatus.available ? 'success' : 'destructive'}>
                <Coins className="size-3.5" aria-hidden />
                {tokenStatus.remaining.toLocaleString()} / {tokenStatus.limit.toLocaleString()}
              </Badge>
            )}

            {/* Período rápido */}
            <Select value={period} onValueChange={(value) => setPeriod(value)}>
              <SelectTrigger className="w-[140px]" aria-label="Período">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last_7_days">Últimos 7 días</SelectItem>
                <SelectItem value="last_30_days">Últimos 30 días</SelectItem>
                <SelectItem value="last_90_days">Últimos 90 días</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={selectedCampaignId}
              onValueChange={(value) => setSelectedCampaignId(value || '')}
            >
              <SelectTrigger className="w-[240px] max-w-[340px]" aria-label="Campaña activa">
                <SelectValue
                  placeholder={loadingCampaignOptions ? 'Cargando campañas...' : 'Campaña activa'}
                />
              </SelectTrigger>
              <SelectContent>
                {activeCampaignOptions.map((campaign) => (
                  <SelectItem key={campaign.id} value={String(campaign.id)}>
                    {campaign.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Botón de Filtros */}
            <div className="relative">
              <Button variant="outline" size="sm" onClick={() => setFilterModalOpen(true)}>
                <FunnelSimple className="size-4" aria-hidden />
                Filtros
              </Button>
              {getActiveFiltersCount() > 0 && (
                <span
                  className="pointer-events-none absolute -right-1.5 -top-1.5 flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground"
                  aria-label={`${getActiveFiltersCount()} filtros activos`}
                >
                  {getActiveFiltersCount()}
                </span>
              )}
            </div>

            <Button
              onClick={runAIAudit}
              loading={runningAudit}
              size="sm"
              disabled={tokenStatus ? !tokenStatus.available : false}
            >
              <Brain className="size-4" aria-hidden />
              Generar general
            </Button>

            <Button
              onClick={runSelectedCampaignAudit}
              loading={runningCampaignAudit}
              size="sm"
              variant="whatsapp"
              disabled={!selectedCampaignId || (tokenStatus ? !tokenStatus.available : false)}
            >
              <Robot className="size-4" aria-hidden />
              Analizar campaña
            </Button>

            <Tooltip title="Exportar reporte">
              <Button variant="outline" size="icon" aria-label="Exportar reporte" onClick={exportReport}>
                <DownloadSimple className="size-5" aria-hidden />
              </Button>
            </Tooltip>
          </div>
        </div>

        {loading && <LinearProgress />}

        {/* Active Filters Summary - Compacto */}
        {getActiveFiltersCount() > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Filtros:</span>

            {filter !== 'all' && (
              <FilterChip clearLabel="Quitar filtro de estado" onClear={() => setFilter('all')}>
                {filter === 'active' ? 'Activas' : 'Aplicadas'}
              </FilterChip>
            )}

            {deliveryStatusFilter !== 'all' && (
              <FilterChip
                variant={
                  deliveryStatusFilter === 'ACTIVE'
                    ? 'success'
                    : deliveryStatusFilter === 'PAUSED'
                      ? 'destructive'
                      : 'neutral'
                }
                clearLabel="Quitar filtro de estado de entrega"
                onClear={() => setDeliveryStatusFilter('all')}
              >
                {deliveryStatusFilter === 'ACTIVE' && 'Activa'}
                {deliveryStatusFilter === 'COMPLETED' && 'Completada'}
                {deliveryStatusFilter === 'PAUSED' && 'Pausada'}
                {deliveryStatusFilter === 'ARCHIVED' && 'Archivada'}
                {deliveryStatusFilter === 'WITH_ISSUES' && 'Con problemas'}
              </FilterChip>
            )}

            {(dateRange.from || dateRange.to) && (
              <FilterChip
                clearLabel="Quitar filtro de fechas"
                onClear={() => setDateRange({ from: null, to: null })}
              >
                {dateRange.from || '...'} - {dateRange.to || '...'}
              </FilterChip>
            )}

            {(spendRange.min !== null || spendRange.max !== null) && (
              <FilterChip
                clearLabel="Quitar filtro de gasto"
                onClear={() => setSpendRange({ min: null, max: null })}
              >
                Gasto: ${spendRange.min || 0} - ${spendRange.max || '∞'}
              </FilterChip>
            )}

            {ctrThreshold.operator !== 'any' && (
              <FilterChip
                clearLabel="Quitar filtro de CTR"
                onClear={() => setCtrThreshold({ operator: 'any', value: null })}
              >
                CTR {ctrThreshold.operator === 'gt' ? '>' : ctrThreshold.operator === 'lt' ? '<' : '='} {ctrThreshold.value}%
              </FilterChip>
            )}

            {cpcThreshold.operator !== 'any' && (
              <FilterChip
                clearLabel="Quitar filtro de CPC"
                onClear={() => setCpcThreshold({ operator: 'any', value: null })}
              >
                CPC {cpcThreshold.operator === 'gt' ? '>' : cpcThreshold.operator === 'lt' ? '<' : '='} ${cpcThreshold.value}
              </FilterChip>
            )}

            {impressionsThreshold !== null && (
              <FilterChip
                clearLabel="Quitar filtro de impresiones"
                onClear={() => setImpressionsThreshold(null)}
              >
                Impressions ≥ {impressionsThreshold.toLocaleString()}
              </FilterChip>
            )}

            {objectiveFilter.length > 0 && (
              <FilterChip
                clearLabel="Quitar filtro de objetivos"
                onClear={() => setObjectiveFilter([])}
              >
                Objetivos: {objectiveFilter.length}
              </FilterChip>
            )}

            {campaignNameSearch.trim() !== '' && (
              <FilterChip
                clearLabel="Quitar filtro de nombre"
                onClear={() => setCampaignNameSearch('')}
              >
                Nombre: "{campaignNameSearch}"
              </FilterChip>
            )}

            {selectedCampaign && (
              <FilterChip
                clearLabel="Quitar filtro de campaña"
                onClear={() => setSelectedCampaignId('')}
              >
                Campaña: {selectedCampaign.name}
              </FilterChip>
            )}

            <Button variant="ghost" size="sm" onClick={clearAllFilters}>
              Limpiar todos
            </Button>
          </div>
        )}

        {/* Alert Summary */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl border border-destructive/25 bg-destructive/[0.08] p-4">
            <Warning className="size-6 shrink-0 text-destructive-text" aria-hidden />
            <div>
              <p className="text-lg font-bold tabular-nums text-foreground">{criticalCount}</p>
              <p className="text-sm text-muted-foreground">Recomendaciones Criticas</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-warning/25 bg-warning/[0.1] p-4">
            <TrendUp className="size-6 shrink-0 text-warning-text" aria-hidden />
            <div>
              <p className="text-lg font-bold tabular-nums text-foreground">{highCount}</p>
              <p className="text-sm text-muted-foreground">Oportunidades de Alta Prioridad</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-success/25 bg-success/[0.1] p-4">
            <CheckCircle className="size-6 shrink-0 text-success-text" aria-hidden />
            <div>
              <p className="text-lg font-bold tabular-nums text-foreground">{appliedCount}</p>
              <p className="text-sm text-muted-foreground">Recomendaciones Aplicadas</p>
            </div>
          </div>
        </div>

        {/* Campaign Scores */}
        {campaignScores.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <h2 className="mb-5 text-xl font-semibold text-foreground">
              Score de Campanas por IA
            </h2>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {campaignScores.map((campaign) => (
                <div
                  key={campaign.campaignId}
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {getChannelIcon(campaign.channel)}
                      <p className="text-base font-medium text-foreground">
                        {campaign.campaignName}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          'flex size-[60px] shrink-0 items-center justify-center rounded-full border-[3px] text-xl font-semibold tabular-nums',
                          scoreCircleClass[getScoreTone(campaign.overallScore)],
                        )}
                      >
                        {campaign.overallScore}
                      </div>
                      <Badge variant="primary">{campaign.recommendations} tips</Badge>
                    </div>
                  </div>

                  <div className="my-4 border-t border-border" />

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Contenido</p>
                      <LinearProgress
                        determinate
                        value={campaign.contentScore}
                        color={getScoreColor(campaign.contentScore)}
                        sx={{ mt: 0.5 }}
                      />
                      <p className="text-xs font-bold tabular-nums text-foreground">
                        {campaign.contentScore}/100
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Timing</p>
                      <LinearProgress
                        determinate
                        value={campaign.timingScore}
                        color={getScoreColor(campaign.timingScore)}
                        sx={{ mt: 0.5 }}
                      />
                      <p className="text-xs font-bold tabular-nums text-foreground">
                        {campaign.timingScore}/100
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Audiencia</p>
                      <LinearProgress
                        determinate
                        value={campaign.audienceScore}
                        color={getScoreColor(campaign.audienceScore)}
                        sx={{ mt: 0.5 }}
                      />
                      <p className="text-xs font-bold tabular-nums text-foreground">
                        {campaign.audienceScore}/100
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Performance</p>
                      <LinearProgress
                        determinate
                        value={campaign.performanceScore}
                        color={getScoreColor(campaign.performanceScore)}
                        sx={{ mt: 0.5 }}
                      />
                      <p className="text-xs font-bold tabular-nums text-foreground">
                        {campaign.performanceScore}/100
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations Table */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-foreground">
              Recomendaciones ({recommendations.length})
            </h2>
            <Select
              value={String(rowsPerPage)}
              onValueChange={(value) => {
                setRowsPerPage(Number(value))
                setPage(0)
              }}
            >
              <SelectTrigger className="w-[130px]" aria-label="Filas por página">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 / página</SelectItem>
                <SelectItem value="10">10 / página</SelectItem>
                <SelectItem value="25">25 / página</SelectItem>
                <SelectItem value="50">50 / página</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table Filters Bar */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Input
              placeholder="Buscar título o campaña..."
              aria-label="Buscar título o campaña"
              value={tableFilters.searchText}
              onChange={(e) => setTableFilters({ ...tableFilters, searchText: e.target.value })}
              leftIcon={<MagnifyingGlass aria-hidden />}
              className="h-9 min-w-[300px]"
            />

            <MultiSelectFilter
              label="Prioridad"
              className="min-w-[140px]"
              selected={tableFilters.priorityFilter}
              onChange={(next) => setTableFilters({ ...tableFilters, priorityFilter: next })}
              options={[
                { value: 'critical', label: 'Crítica' },
                { value: 'high', label: 'Alta' },
                { value: 'medium', label: 'Media' },
                { value: 'low', label: 'Baja' },
              ]}
            />

            <MultiSelectFilter
              label="Tipo"
              className="min-w-[140px]"
              selected={tableFilters.typeFilter}
              onChange={(next) => setTableFilters({ ...tableFilters, typeFilter: next })}
              options={[
                { value: 'warning', label: 'Alerta' },
                { value: 'optimization', label: 'Optimización' },
                { value: 'opportunity', label: 'Oportunidad' },
                { value: 'insight', label: 'Insight' },
              ]}
            />

            <MultiSelectFilter
              label="Categoría"
              className="min-w-[140px]"
              selected={tableFilters.categoryFilter}
              onChange={(next) => setTableFilters({ ...tableFilters, categoryFilter: next })}
              options={[
                { value: 'timing', label: 'Tiempo' },
                { value: 'content', label: 'Contenido' },
                { value: 'segmentation', label: 'Segmentación' },
                { value: 'budget', label: 'Presupuesto' },
                { value: 'channel', label: 'Canal' },
              ]}
            />

            <MultiSelectFilter
              label="Estado"
              className="min-w-[120px]"
              selected={tableFilters.statusFilter}
              onChange={(next) => setTableFilters({ ...tableFilters, statusFilter: next })}
              options={[
                { value: 'active', label: 'Activa' },
                { value: 'applied', label: 'Aplicada' },
                { value: 'dismissed', label: 'Descartada' },
              ]}
            />

            {/* Clear table filters button */}
            {(tableFilters.searchText ||
              tableFilters.priorityFilter.length > 0 ||
              tableFilters.typeFilter.length > 0 ||
              tableFilters.categoryFilter.length > 0 ||
              tableFilters.statusFilter.length > 0) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setTableFilters({
                    searchText: '',
                    priorityFilter: [],
                    typeFilter: [],
                    categoryFilter: [],
                    statusFilter: [],
                  })
                }
              >
                Limpiar filtros
              </Button>
            )}
          </div>

          {recommendations.length === 0 && !loading ? (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-4">
              <Robot className="size-6 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="text-sm font-medium text-foreground">
                  No hay recomendaciones con estos filtros
                </p>
                <p className="text-sm text-muted-foreground">
                  {(deliveryStatusFilter !== 'all' || dateRange.from || dateRange.to)
                    ? 'Intenta ajustar los filtros de fecha o estado de campaña'
                    : 'Haz clic en "Actualizar" para generar análisis con IA'}
                </p>
              </div>
            </div>
          ) : recommendations.length > 0 ? (
            <>
              {(() => {
                // Apply table filters
                const filteredRecommendations = recommendations.filter(rec => {
                  // Search text filter (searches in title, description, campaign name)
                  if (tableFilters.searchText.trim() !== '') {
                    const searchLower = tableFilters.searchText.toLowerCase()
                    const matchesSearch =
                      rec.title.toLowerCase().includes(searchLower) ||
                      rec.description.toLowerCase().includes(searchLower) ||
                      rec.campaignName.toLowerCase().includes(searchLower)
                    if (!matchesSearch) return false
                  }

                  // Priority filter
                  if (tableFilters.priorityFilter.length > 0) {
                    if (!tableFilters.priorityFilter.includes(rec.priority)) return false
                  }

                  // Type filter
                  if (tableFilters.typeFilter.length > 0) {
                    if (!tableFilters.typeFilter.includes(rec.type)) return false
                  }

                  // Category filter
                  if (tableFilters.categoryFilter.length > 0) {
                    if (!tableFilters.categoryFilter.includes(rec.category)) return false
                  }

                  // Status filter
                  if (tableFilters.statusFilter.length > 0) {
                    if (!tableFilters.statusFilter.includes(rec.status)) return false
                  }

                  return true
                })

                return (
                  <>
                    <div className="overflow-hidden rounded-lg border border-border">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[1000px] text-sm">
                          <thead>
                            <tr className="border-b border-border bg-muted/40">
                              <th className={cn(TH, 'w-[100px]')}>Estado</th>
                              <th className={cn(TH, 'w-[100px]')}>Prioridad</th>
                              <th className={cn(TH, 'w-[120px]')}>Tipo</th>
                              <th className={cn(TH, 'min-w-[200px]')}>Título</th>
                              <th className={cn(TH, 'min-w-[150px]')}>Campaña</th>
                              <th className={cn(TH, 'w-[120px]')}>Categoría</th>
                              <th className={cn(TH, 'w-[120px]')}>Fecha Creación</th>
                              <th className={cn(TH, 'w-[180px]')}>Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {filteredRecommendations
                              .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                              .map((recommendation) => (
                                <tr
                                  key={recommendation.id}
                                  className="transition-colors hover:bg-accent/40"
                                >
                                  {/* Estado */}
                                  <td className={TD}>
                                    <Badge
                                      variant={
                                        recommendation.status === 'applied'
                                          ? 'success'
                                          : recommendation.status === 'active'
                                            ? 'primary'
                                            : 'neutral'
                                      }
                                    >
                                      {recommendation.status === 'applied' && (
                                        <Check className="size-3" weight="bold" aria-hidden />
                                      )}
                                      {recommendation.status === 'active'
                                        ? 'Activa'
                                        : recommendation.status === 'applied'
                                          ? 'Aplicada'
                                          : 'Descartada'}
                                    </Badge>
                                  </td>

                                  {/* Prioridad */}
                                  <td className={TD}>
                                    <Badge variant={getPriorityColor(recommendation.priority)}>
                                      {recommendation.priority === 'critical' ? 'Crítica' :
                                       recommendation.priority === 'high' ? 'Alta' :
                                       recommendation.priority === 'medium' ? 'Media' : 'Baja'}
                                    </Badge>
                                  </td>

                                  {/* Tipo */}
                                  <td className={TD}>
                                    <div className="flex items-center gap-2">
                                      {getTypeIcon(recommendation.type)}
                                      <span className="text-foreground">
                                        {recommendation.type === 'optimization' ? 'Optimización' :
                                         recommendation.type === 'warning' ? 'Alerta' :
                                         recommendation.type === 'opportunity' ? 'Oportunidad' : 'Insight'}
                                      </span>
                                    </div>
                                  </td>

                                  {/* Título */}
                                  <td className={TD}>
                                    <Tooltip title={recommendation.description}>
                                      <span
                                        tabIndex={0}
                                        className="rounded-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      >
                                        {recommendation.title}
                                      </span>
                                    </Tooltip>
                                  </td>

                                  {/* Campaña */}
                                  <td className={TD}>
                                    <span className="text-muted-foreground">
                                      {recommendation.campaignName}
                                    </span>
                                  </td>

                                  {/* Categoría */}
                                  <td className={TD}>
                                    <Badge variant="outline">
                                      {recommendation.category === 'timing' ? 'Tiempo' :
                                       recommendation.category === 'content' ? 'Contenido' :
                                       recommendation.category === 'segmentation' ? 'Segmentación' :
                                       recommendation.category === 'budget' ? 'Presupuesto' : 'Canal'}
                                    </Badge>
                                  </td>

                                  {/* Fecha Creación */}
                                  <td className={cn(TD, 'whitespace-nowrap text-xs text-muted-foreground')}>
                                    {new Date(recommendation.createdAt).toLocaleDateString('es-ES', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric'
                                    })}
                                  </td>

                                  {/* Acciones */}
                                  <td className={TD}>
                                    <div className="flex items-center gap-0.5">
                                      <ActionBtn
                                        label="Ver detalles"
                                        onClick={() => openDetailModal(recommendation)}
                                      >
                                        <Eye className="size-[18px]" aria-hidden />
                                      </ActionBtn>
                                      <ActionBtn
                                        label="Editar"
                                        onClick={() => openEditModal(recommendation)}
                                      >
                                        <PencilSimple className="size-[18px]" aria-hidden />
                                      </ActionBtn>
                                      {recommendation.status === 'active' && (
                                        <ActionBtn
                                          label="Aplicar"
                                          onClick={() => handleApplyRecommendation(recommendation)}
                                          className="text-primary hover:bg-primary/10 hover:text-primary"
                                        >
                                          <Check className="size-[18px]" aria-hidden />
                                        </ActionBtn>
                                      )}
                                      <ActionBtn
                                        label="Eliminar"
                                        onClick={() => openDeleteModal(recommendation)}
                                        className="hover:bg-destructive/10 hover:text-destructive-text"
                                      >
                                        <Trash className="size-[18px]" aria-hidden />
                                      </ActionBtn>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Paginación */}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">
                        Mostrando {page * rowsPerPage + 1} a{' '}
                        {Math.min((page + 1) * rowsPerPage, filteredRecommendations.length)} de{' '}
                        {filteredRecommendations.length} recomendaciones
                        {filteredRecommendations.length < recommendations.length && (
                          <span> (filtradas de {recommendations.length} totales)</span>
                        )}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={page === 0}
                          onClick={() => setPage(page - 1)}
                        >
                          Anterior
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={page >= Math.ceil(filteredRecommendations.length / rowsPerPage) - 1}
                          onClick={() => setPage(page + 1)}
                        >
                          Siguiente
                        </Button>
                      </div>
                    </div>
                  </>
                )
              })()}
            </>
          ) : null}
        </div>

      {/* Loading Modal (auditoría en curso) */}
      <Dialog open={isGeneratingRecommendations}>
        <DialogContent
          hideClose
          className="max-w-[520px] sm:min-w-[440px]"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <div className="flex flex-col items-center gap-5 px-2 py-4 text-center">
            <CircularProgress size="lg" />
            <div>
              <DialogTitle className="text-xl">{loadingTitle}</DialogTitle>
              <DialogDescription className="mt-1">{loadingDescription}</DialogDescription>
            </div>
            <LinearProgress sx={{ width: '100%' }} />
            <Badge variant={runningCampaignAudit ? 'success' : 'primary'}>
              {loadingChipLabel}
            </Badge>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Modal */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Detalle de Recomendacion</DialogTitle>
          </DialogHeader>
          {selectedRecommendation && (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Titulo</p>
                <p className="text-sm text-foreground">{selectedRecommendation.title}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Campana</p>
                <p className="text-sm text-foreground">{selectedRecommendation.campaignName}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Descripcion</p>
                <p className="text-sm text-foreground">{selectedRecommendation.description}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Impacto</p>
                  <p className="text-sm text-foreground">{selectedRecommendation.impact}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Esfuerzo</p>
                  <p className="text-sm text-foreground">{selectedRecommendation.effort}</p>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-success-text">Ganancia Potencial</p>
                <p className="text-sm font-bold text-success-text">
                  {selectedRecommendation.potentialGain}
                </p>
              </div>
              {selectedRecommendation.actionData && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Datos de Accion</p>
                  <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-2 text-xs text-foreground">
                    {JSON.stringify(selectedRecommendation.actionData, null, 2)}
                  </pre>
                </div>
              )}
              <div className="border-t border-border" />
              <DialogFooter>
                <Button variant="outline" onClick={() => setDetailModalOpen(false)}>
                  Cerrar
                </Button>
                {selectedRecommendation.status === 'active' && (
                  <Button onClick={() => handleApplyRecommendation(selectedRecommendation)}>
                    <Check className="size-4" weight="bold" aria-hidden />
                    Marcar como Aplicada
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Editar Recomendacion</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-title">Titulo</Label>
              <Input
                id="edit-title"
                value={editForm.title || ''}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-description">Descripcion</Label>
              <textarea
                id="edit-description"
                rows={3}
                value={editForm.description || ''}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-impact">Impacto</Label>
                <Input
                  id="edit-impact"
                  value={editForm.impact || ''}
                  onChange={(e) => setEditForm({ ...editForm, impact: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-effort">Esfuerzo</Label>
                <Input
                  id="edit-effort"
                  value={editForm.effort || ''}
                  onChange={(e) => setEditForm({ ...editForm, effort: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-gain">Ganancia Potencial</Label>
              <Input
                id="edit-gain"
                value={editForm.potentialGain || ''}
                onChange={(e) => setEditForm({ ...editForm, potentialGain: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-priority">Prioridad</Label>
                <Select
                  value={editForm.priority ?? ''}
                  onValueChange={(value) => setEditForm({ ...editForm, priority: value as any })}
                >
                  <SelectTrigger id="edit-priority" aria-label="Prioridad">
                    <SelectValue placeholder="Prioridad" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critica</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="medium">Media</SelectItem>
                    <SelectItem value="low">Baja</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-category">Categoria</Label>
                <Select
                  value={editForm.category ?? ''}
                  onValueChange={(value) => setEditForm({ ...editForm, category: value as any })}
                >
                  <SelectTrigger id="edit-category" aria-label="Categoria">
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="timing">Timing</SelectItem>
                    <SelectItem value="content">Contenido</SelectItem>
                    <SelectItem value="segmentation">Segmentacion</SelectItem>
                    <SelectItem value="budget">Presupuesto</SelectItem>
                    <SelectItem value="channel">Canal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="border-t border-border" />
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleEditRecommendation}>Guardar Cambios</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive-text">Descartar Recomendacion</DialogTitle>
            <DialogDescription>
              Esta accion eliminara permanentemente la recomendacion. Esta seguro?
            </DialogDescription>
          </DialogHeader>
          {selectedRecommendation && (
            <p className="text-sm text-muted-foreground">"{selectedRecommendation.title}"</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleDismissRecommendation}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar Permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Filters Modal */}
      <Dialog open={filterModalOpen} onOpenChange={setFilterModalOpen}>
        <DialogContent className="max-w-[600px] sm:min-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FunnelSimple className="size-5" aria-hidden />
              Filtros de Auditoría
            </DialogTitle>
          </DialogHeader>

          <div className="border-t border-border" />

          <div className="flex flex-col gap-6">
            {/* Estado de Recomendación */}
            <div className="space-y-1.5">
              <Label htmlFor="filter-status">Estado de Recomendación</Label>
              <Select value={filter} onValueChange={(value) => setFilter(value)}>
                <SelectTrigger id="filter-status" aria-label="Estado de Recomendación">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="active">Activas</SelectItem>
                  <SelectItem value="applied">Aplicadas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Estado de Entrega de Campaña (effective_status de Meta) */}
            <div className="space-y-1.5">
              <Label htmlFor="filter-delivery">Estado de Entrega (Ads Manager)</Label>
              <Select
                value={deliveryStatusFilter}
                onValueChange={(value) => setDeliveryStatusFilter(value)}
              >
                <SelectTrigger id="filter-delivery" aria-label="Estado de Entrega">
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="ACTIVE">Activa (entregando)</SelectItem>
                  <SelectItem value="COMPLETED">Completada</SelectItem>
                  <SelectItem value="PAUSED">Pausada</SelectItem>
                  <SelectItem value="ARCHIVED">Archivada</SelectItem>
                  <SelectItem value="WITH_ISSUES">Con problemas</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Usa "Activa" para ver solo campañas que realmente están entregando
              </p>
            </div>

            {/* Rango de Fechas */}
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">Rango de Fechas</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="filter-date-from">Desde</Label>
                  <Input
                    id="filter-date-from"
                    type="date"
                    value={dateRange.from || ''}
                    onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                    max={dateRange.to || undefined}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="filter-date-to">Hasta</Label>
                  <Input
                    id="filter-date-to"
                    type="date"
                    value={dateRange.to || ''}
                    onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                    min={dateRange.from || undefined}
                  />
                </div>
              </div>
              {(dateRange.from || dateRange.to) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2"
                  onClick={() => setDateRange({ from: null, to: null })}
                >
                  Limpiar fechas
                </Button>
              )}
            </div>

            <div className="border-t border-border" />

            {/* Filtros Avanzados de Campañas */}
            <p className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Megaphone className="size-5" aria-hidden />
              Filtros Avanzados de Campañas
            </p>

            {/* Rango de Gasto */}
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">Rango de Gasto ($)</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="filter-spend-min">Mínimo</Label>
                  <Input
                    id="filter-spend-min"
                    type="number"
                    placeholder="0"
                    value={spendRange.min ?? ''}
                    onChange={(e) => setSpendRange({ ...spendRange, min: e.target.value ? Number(e.target.value) : null })}
                    leftIcon={<span className="text-sm">$</span>}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="filter-spend-max">Máximo</Label>
                  <Input
                    id="filter-spend-max"
                    type="number"
                    placeholder="∞"
                    value={spendRange.max ?? ''}
                    onChange={(e) => setSpendRange({ ...spendRange, max: e.target.value ? Number(e.target.value) : null })}
                    leftIcon={<span className="text-sm">$</span>}
                  />
                </div>
              </div>
            </div>

            {/* CTR Threshold */}
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">CTR (Click-Through Rate) %</p>
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-4">
                  <Select
                    value={ctrThreshold.operator}
                    onValueChange={(value) => setCtrThreshold({ ...ctrThreshold, operator: value as any })}
                  >
                    <SelectTrigger className="h-11" aria-label="Operador CTR">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Cualquiera</SelectItem>
                      <SelectItem value="gt">Mayor que</SelectItem>
                      <SelectItem value="lt">Menor que</SelectItem>
                      <SelectItem value="eq">Igual a</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-8">
                  <Input
                    type="number"
                    step={0.01}
                    aria-label="Valor de CTR"
                    placeholder="Ej: 2.5"
                    value={ctrThreshold.value ?? ''}
                    onChange={(e) => setCtrThreshold({ ...ctrThreshold, value: e.target.value ? Number(e.target.value) : null })}
                    disabled={ctrThreshold.operator === 'any'}
                    rightSlot={<span className="pr-2 text-sm text-muted-foreground">%</span>}
                  />
                </div>
              </div>
            </div>

            {/* CPC Threshold */}
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">CPC (Cost Per Click) $</p>
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-4">
                  <Select
                    value={cpcThreshold.operator}
                    onValueChange={(value) => setCpcThreshold({ ...cpcThreshold, operator: value as any })}
                  >
                    <SelectTrigger className="h-11" aria-label="Operador CPC">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Cualquiera</SelectItem>
                      <SelectItem value="gt">Mayor que</SelectItem>
                      <SelectItem value="lt">Menor que</SelectItem>
                      <SelectItem value="eq">Igual a</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-8">
                  <Input
                    type="number"
                    step={0.01}
                    aria-label="Valor de CPC"
                    placeholder="Ej: 1.50"
                    value={cpcThreshold.value ?? ''}
                    onChange={(e) => setCpcThreshold({ ...cpcThreshold, value: e.target.value ? Number(e.target.value) : null })}
                    disabled={cpcThreshold.operator === 'any'}
                    leftIcon={<span className="text-sm">$</span>}
                  />
                </div>
              </div>
            </div>

            {/* Impressions Threshold */}
            <div className="space-y-1.5">
              <Label htmlFor="filter-impressions">Impresiones Mínimas</Label>
              <Input
                id="filter-impressions"
                type="number"
                placeholder="Ej: 10000"
                value={impressionsThreshold ?? ''}
                onChange={(e) => setImpressionsThreshold(e.target.value ? Number(e.target.value) : null)}
              />
            </div>

            {/* Objective Filter */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">Objetivo de Campaña</p>
              <MultiSelectFilter
                label="Seleccionar objetivos..."
                className="h-11 w-full"
                selected={objectiveFilter}
                onChange={setObjectiveFilter}
                options={[
                  { value: 'CONVERSIONS', label: 'Conversiones' },
                  { value: 'TRAFFIC', label: 'Tráfico' },
                  { value: 'AWARENESS', label: 'Reconocimiento' },
                  { value: 'ENGAGEMENT', label: 'Interacción' },
                  { value: 'APP_INSTALLS', label: 'Instalaciones de App' },
                  { value: 'LEAD_GENERATION', label: 'Generación de Leads' },
                  { value: 'MESSAGES', label: 'Mensajes' },
                  { value: 'SALES', label: 'Ventas' },
                ]}
              />
              {objectiveFilter.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {objectiveFilter.map((option) => (
                    <Badge key={option} variant="neutral">
                      {option}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Campaign Name Search */}
            <div className="space-y-1.5">
              <Label htmlFor="filter-name">Buscar por Nombre de Campaña</Label>
              <Input
                id="filter-name"
                placeholder="Ej: Black Friday, Navidad..."
                value={campaignNameSearch}
                onChange={(e) => setCampaignNameSearch(e.target.value)}
                leftIcon={<MagnifyingGlass aria-hidden />}
              />
            </div>

            <div className="border-t border-border" />

            {/* Acciones */}
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="outline"
                onClick={clearAllFilters}
                disabled={getActiveFiltersCount() === 0}
              >
                Limpiar todos
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setFilterModalOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => setFilterModalOpen(false)}>Aplicar Filtros</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal del Plan del Agente Meta Ads */}
      <MetaAgentPlanCard
        open={planModalOpen}
        plan={currentPlan}
        onClose={() => setPlanModalOpen(false)}
        onExecuted={() => {
          // Refrescar datos relevantes después de ejecutar acciones
          if (selectedConnection && connectionStatus === 'connected') {
            fetchCampaignsData()
          }
        }}
      />
      </div>
    </TooltipProvider>
  )
}
