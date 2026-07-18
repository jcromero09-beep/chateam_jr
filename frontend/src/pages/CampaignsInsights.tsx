import { useState, useEffect } from 'react'
// [Re-skin Tailwind v4] De MUI Joy sólo se conservan los indicadores de progreso
// (CircularProgress / LinearProgress), que no tienen equivalente en el design system.
import { CircularProgress, LinearProgress } from '@mui/joy'
import {
  Megaphone,
  Eye,
  HandTap,
  CurrencyDollar,
  Users,
  DownloadSimple,
  ArrowClockwise,
  CheckCircle,
  PauseCircle,
  WarningCircle,
  MagnifyingGlass,
  CaretLeft,
  CaretRight,
  ChatCircle,
  UserPlus,
  ChatsCircle,
  Columns,
  TrendUp,
} from '@phosphor-icons/react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import api from '../services/api'
import logger from '../utils/logger'
import DateRangePicker from '../components/DateRangePicker'
import CustomColumnModal, {
  type CustomColumn,
  evaluateCustomColumn,
  formatCustomValue,
  getOperatorSymbol,
} from '../components/CustomColumnModal'

// ── Clases de tabla compartidas (tokens del design system) ────────────────────
const TH = 'whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground'
const TH_NUM = `${TH} text-right`
const TD = 'whitespace-nowrap px-4 py-3'
const TD_NUM = 'whitespace-nowrap px-4 py-3 text-right tabular-nums'

// Columna fija a la izquierda: el fondo debe ser OPACO (si no, las celdas de la
// derecha se ven por debajo al hacer scroll horizontal) y a la vez idéntico al
// compuesto real (card + tinte de la fila) → color-mix sobre los mismos tokens.
const STICKY_HEAD_CELL =
  'sticky left-0 z-20 bg-[color-mix(in_srgb,var(--muted)_40%,var(--card))] shadow-[2px_0_4px_-2px] shadow-black/10'
const STICKY_BODY_CELL =
  'sticky left-0 z-10 bg-card shadow-[2px_0_4px_-2px] shadow-black/10 transition-colors group-hover:bg-[color-mix(in_srgb,var(--accent)_40%,var(--card))]'

// Tinte de cada bloque de métricas por objetivo (cabeceras)
const BLOCK_TINT = {
  ventas: 'bg-success/12',
  mensajes: 'bg-primary/12',
  leads: 'bg-warning/16',
  video: 'bg-muted',
  custom: 'bg-primary/12',
} as const

// Color del icono de cada KPI
const STAT_TONE: Record<string, string> = {
  primary: 'text-primary',
  success: 'text-success-text',
  warning: 'text-warning-text',
  neutral: 'text-muted-foreground',
}

interface FacebookCampaign {
  id: string
  name: string
  status: string
  effective_status: string // Estado REAL de entrega (ACTIVE, PAUSED, COMPLETED, etc.)
  objective: string
  daily_budget?: number
  lifetime_budget?: number
  budget_remaining?: string
  stop_time?: string
  created_time: string
  activeAds?: number // Cantidad de ads activos (viene del backend)
  insights: {
    // Base
    impressions: number
    clicks: number
    spend: number
    reach: number
    frequency: number
    ctr: number
    cpc: number
    cpm: number
    // Ventas (E-commerce)
    landingPageViews?: number
    costPerLPV?: number
    addToCart?: number
    initiateCheckout?: number
    purchases?: number
    costPerPurchase?: number
    conversionValue?: number
    roas?: number
    // Mensajes
    conversationsStarted?: number
    costPerConversation?: number
    messagingContacts?: number
    costPerMessagingContact?: number
    newMessagingConnections?: number
    // Leads
    leads?: number
    costPerLead?: number
    // Video
    videoPlays?: number
    thruPlays?: number
    costPerThruPlay?: number
    videoP50?: number
    videoP95?: number
  }
}

interface FacebookAd {
  id: string
  name: string
  campaign_id: string
  campaign_name: string
  adset_id?: string
  adset_name?: string
  status: string
  impressions: number
  clicks: number
  spend: number
  reach: number
  ctr: number
  cpc: number
  cpm: number
}

interface FacebookAdSet {
  id: string
  name: string
  campaign_id: string
  campaign_name: string
  status: string
  impressions: number
  clicks: number
  spend: number
  reach: number
  frequency: number
  ctr: number
  cpc: number
  cpm: number
}

interface InsightsTrend {
  date: string
  spend: number
  impressions: number
  clicks: number
  reach: number
  conversions: number
}

interface AggregatedInsights {
  spend: number
  impressions: number
  clicks: number
  reach: number
  frequency: number
  ctr: number
  cpc: number
  cpm: number
  conversions: number
  costPerConversion: number
}

interface AdsConnection {
  id: number
  name: string
  facebookAdAccountId: string
  facebookBusinessId?: string
  channel: string
}

// Tipo para el estado de entrega calculado (delivery_state)
// Este es el estado REAL de la campaña basado en múltiples factores
type DeliveryState = 'ACTIVA' | 'NO_HAY_ANUNCIOS' | 'COMPLETADA' | 'DESACTIVADA' | 'PAUSADA'

// Función para clasificar el estado de entrega de una campaña
// Combina status, effective_status, fechas y presupuesto para determinar el estado real
// NOTA: No usamos impresiones=0 como criterio porque una campaña puede estar activa
// pero aún no haber generado impresiones (ej: campaña nueva o en cola de aprendizaje)
function classifyCampaignDelivery(campaign: FacebookCampaign): DeliveryState {
  // 1. Si el usuario pausó manualmente la campaña
  if (campaign.status === 'PAUSED') {
    return 'DESACTIVADA'
  }

  // 2. Si effective_status indica que la campaña está completada o pausada a nivel de Meta
  if (campaign.effective_status === 'COMPLETED') {
    return 'COMPLETADA'
  }

  // 3. Si CAMPAIGN_PAUSED (pausada por Meta por presupuesto u otros motivos)
  // Solo marcar como completada si además tiene stop_time en el pasado o budget agotado
  if (campaign.effective_status === 'CAMPAIGN_PAUSED') {
    // Verificar si realmente terminó o si solo está paused por presupuesto
    const hasValidStopTime = campaign.stop_time && campaign.stop_time !== '0000-00-00' && campaign.stop_time !== ''
    const stopTimePassed = hasValidStopTime && campaign.stop_time && new Date(campaign.stop_time) < new Date()
    const budgetExhausted = campaign.budget_remaining !== undefined && Number(campaign.budget_remaining) <= 0

    // Solo marcar como completada si realmente terminó (stop_time pasó O budget agotado Y sin presupuesto restante)
    if (stopTimePassed || (budgetExhausted && campaign.daily_budget === undefined && campaign.lifetime_budget === undefined)) {
      return 'COMPLETADA'
    }
    // De lo contrario, está pause pero podría reactivarse
    return 'PAUSADA'
  }

  // 4. Si el presupuesto lifetime se agotó Y no hay daily budget activo
  const hasLifetimeBudget = campaign.lifetime_budget !== undefined && Number(campaign.lifetime_budget) > 0
  const hasDailyBudget = campaign.daily_budget !== undefined && Number(campaign.daily_budget) > 0
  const budgetRemaining = campaign.budget_remaining !== undefined ? Number(campaign.budget_remaining) : null

  // Si es campaña de presupuesto lifetime y se agotó completamente
  if (hasLifetimeBudget && !hasDailyBudget && budgetRemaining !== null && budgetRemaining <= 0) {
    return 'COMPLETADA'
  }

  // 5. Si la fecha de fin ya pasó (solo para campañas con lifetime budget)
  if (campaign.stop_time && campaign.stop_time !== '0000-00-00' && campaign.stop_time !== '') {
    const stopDate = new Date(campaign.stop_time)
    // Validar que sea una fecha válida
    if (!isNaN(stopDate.getTime()) && stopDate < new Date()) {
      // Solo marcar como completada si no hay presupuesto activo
      if (!hasDailyBudget || (budgetRemaining !== null && budgetRemaining <= 0)) {
        return 'COMPLETADA'
      }
    }
  }

  // 6. Si no hay ads activos (dato viene del backend)
  // activeAds es el conteo real de anuncios con effective_status=ACTIVE
  if (campaign.activeAds !== undefined && campaign.activeAds === 0) {
    return 'NO_HAY_ANUNCIOS'
  }

  // 7. Si status y effective_status son ACTIVE → la campaña está activa
  // (incluso si tiene 0 impresiones - puede ser nueva o en cola de aprendizaje)
  if (campaign.status === 'ACTIVE' && campaign.effective_status === 'ACTIVE') {
    return 'ACTIVA'
  }

  // 8. Si solo status es ACTIVE (sin effective_status) → también activa
  if (campaign.status === 'ACTIVE') {
    return 'ACTIVA'
  }

  // 9. Otros estados de efectivo
  if (campaign.effective_status === 'PAUSED' || campaign.effective_status === 'DELETED' || campaign.effective_status === 'ARCHIVED') {
    return 'DESACTIVADA'
  }

  // Default: cualquier otro caso →假设 activa si tiene presupuesto
  if (hasDailyBudget || hasLifetimeBudget) {
    return 'ACTIVA'
  }

  return 'DESACTIVADA'
}

export default function CampaignsInsights() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dateSince, setDateSince] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 29)
    return d.toISOString().split('T')[0]
  })
  const [dateUntil, setDateUntil] = useState(() => new Date().toISOString().split('T')[0])
  const [dateLabel, setDateLabel] = useState('Ultimos 30 dias')
  const [statusFilter, setStatusFilter] = useState('ACTIVA')
  const [campaigns, setCampaigns] = useState<FacebookCampaign[]>([])
  const [adSets, setAdSets] = useState<FacebookAdSet[]>([])
  const [ads, setAds] = useState<FacebookAd[]>([])
  const [trendData, setTrendData] = useState<InsightsTrend[]>([])
  const [totals, setTotals] = useState<AggregatedInsights | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'error'>('checking')
  const [adsConnections, setAdsConnections] = useState<AdsConnection[]>([])
  const [selectedConnection, setSelectedConnection] = useState<number | null>(null)
  const [debugMode, setDebugMode] = useState(false)

  // Estados para búsqueda y paginación - Campañas
  const [insightsTab, setInsightsTab] = useState<'campaigns' | 'adsets' | 'ads'>('campaigns')
  const [campaignSearch, setCampaignSearch] = useState('')
  const [campaignPage, setCampaignPage] = useState(1)
  const [campaignRowsPerPage, setCampaignRowsPerPage] = useState(10)

  // Estado para vista de métricas por objetivo
  type ObjectiveView = 'base' | 'ventas' | 'mensajes' | 'leads' | 'video'
  const [objectiveView, setObjectiveView] = useState<ObjectiveView>('base')

  // Columnas personalizadas
  const [customColumnsModalOpen, setCustomColumnsModalOpen] = useState(false)
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>(() => {
    try {
      const stored = localStorage.getItem('chateam_custom_columns_insights')
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })

  const handleSaveCustomColumns = (cols: CustomColumn[]) => {
    setCustomColumns(cols)
    localStorage.setItem('chateam_custom_columns_insights', JSON.stringify(cols))
  }

  // Estados para búsqueda y paginación - Anuncios
  const [adSetSearch, setAdSetSearch] = useState('')
  const [adSetStatusFilter, setAdSetStatusFilter] = useState('ACTIVA')
  const [adSetPage, setAdSetPage] = useState(1)
  const [adSetRowsPerPage, setAdSetRowsPerPage] = useState(10)
  const [adSearch, setAdSearch] = useState('')
  const [adStatusFilter, setAdStatusFilter] = useState('ACTIVA')
  const [adPage, setAdPage] = useState(1)
  const [adRowsPerPage, setAdRowsPerPage] = useState(10)

  useEffect(() => {
    fetchAdsConnections()
  }, [])

  useEffect(() => {
    if (connectionStatus === 'connected' && (selectedConnection || debugMode)) {
      fetchDashboardData()
    }
  }, [dateSince, dateUntil, connectionStatus, selectedConnection, debugMode])

  const fetchAdsConnections = async () => {
    try {
      // Fetch all Facebook connections that have facebookAdAccountId configured
      const response = await api.get('/whatsapp')
      const connections = response.data.filter(
        (conn: any) => conn.channel === 'facebook' && conn.facebookAdAccountId
      )
      setAdsConnections(connections)

      if (connections.length === 1) {
        // If only one connection, auto-select it
        setSelectedConnection(connections[0].id)
        checkConnection(connections[0].id)
      } else if (connections.length > 1) {
        // Multiple connections, user needs to select
        setConnectionStatus('error')
        setError('Selecciona una conexion de Facebook con cuenta publicitaria configurada')
      } else {
        // No connections with ads configured - try DEBUG MODE
        console.log('🧪 No hay conexiones configuradas, probando MODO DEBUG con .env...')
        tryDebugMode()
      }
    } catch (err: any) {
      console.error('Error fetching connections:', err)
      // Try debug mode on error
      console.log('🧪 Error al cargar conexiones, probando MODO DEBUG...')
      tryDebugMode()
    }
  }

  // ============================================================
  // MODO DEBUG: Conectar usando credenciales del .env del backend
  // ============================================================
  const tryDebugMode = async () => {
    setConnectionStatus('checking')
    try {
      // Call test-connection WITHOUT whatsappId - backend will use .env
      const response = await api.get('/meta-marketing/test-connection')
      if (response.data.success) {
        console.log('🧪 MODO DEBUG: Conexion exitosa usando .env')
        setDebugMode(true)
        setConnectionStatus('connected')
        setError(null)
      } else {
        setConnectionStatus('error')
        setError('No se pudo conectar con Meta Ads. Contacta al administrador para configurar las credenciales de Facebook.')
      }
    } catch (err: any) {
      console.error('🧪 MODO DEBUG error:', err)
      setConnectionStatus('error')
      setError('Aún no tienes una cuenta de Meta Ads vinculada. Configura tu conexión con Facebook para ver las métricas de tus campañas.')
    }
  }
  // ============================================================

  const handleConnectionChange = (whatsappId: number) => {
    setSelectedConnection(whatsappId)
    checkConnection(whatsappId)
  }

  const checkConnection = async (whatsappId?: number) => {
    if (!whatsappId && !selectedConnection) {
      setConnectionStatus('error')
      setError('Selecciona una conexion de Facebook')
      return
    }

    const wpId = whatsappId || selectedConnection
    setConnectionStatus('checking')
    try {
      const response = await api.get(`/meta-marketing/test-connection?whatsappId=${wpId}`)
      if (response.data.success) {
        setConnectionStatus('connected')
      } else {
        setConnectionStatus('error')
        setError(response.data.message || 'Error de conexion con Facebook')
      }
    } catch (err: any) {
      setConnectionStatus('error')
      setError(err.response?.data?.message || 'No se pudo conectar con la API de Facebook. Verifica el Ad Account ID en la conexion.')
    }
  }

  const fetchDashboardData = async () => {
    if (!selectedConnection && !debugMode) return

    setLoading(true)
    setError(null)
    try {
      // En modo debug, no enviamos whatsappId - el backend usará .env
      const params = new URLSearchParams({ since: dateSince, until: dateUntil })
      if (!debugMode && selectedConnection) {
        params.set('whatsappId', String(selectedConnection))
      }
      const url = `/meta-marketing/dashboard?${params.toString()}`

      console.log(`📊 Fetching dashboard data: ${url}`)
      const response = await api.get(url)

      if (response.data.success) {
        setCampaigns(response.data.campaigns || [])
        setAdSets(response.data.adSets || response.data.adsets || [])
        setTrendData(response.data.trends || [])
        setTotals(response.data.totals || null)
        setAds(response.data.ads || [])
      } else {
        setError(response.data.message || 'Error al cargar datos')
      }
    } catch (err: any) {
      console.error('Error fetching dashboard data:', err)
      setError(err.response?.data?.message || 'Error al cargar los datos del dashboard')
    } finally {
      setLoading(false)
    }
  }

  // Forzar recarga invalidando el cache
  const handleForceRefresh = async () => {
    setLoading(true)
    try {
      // Primero invalidar el cache
      console.log('🗑️ Invalidando cache...')
      await api.post('/meta-marketing/invalidate-cache')
      console.log('✅ Cache invalidado')
      // Luego recargar los datos
      await fetchDashboardData()
    } catch (err: any) {
      console.error('Error forzando recarga:', err)
      setError(err.response?.data?.message || 'Error al recargar datos')
      setLoading(false)
    }
  }

  // Filtrar campañas por delivery_state (estado calculado) y búsqueda
  // delivery_state combina: status, effective_status, stop_time, budget_remaining, activeAds
  const filteredCampaigns = campaigns.filter(campaign => {
    const deliveryState = classifyCampaignDelivery(campaign)
    const matchesStatus = statusFilter === 'all' || deliveryState === statusFilter
    const matchesSearch = campaign.name.toLowerCase().includes(campaignSearch.toLowerCase())
    return matchesStatus && matchesSearch
  })

  // Paginación de campañas
  const totalCampaignPages = Math.ceil(filteredCampaigns.length / campaignRowsPerPage)
  const paginatedCampaigns = filteredCampaigns.slice(
    (campaignPage - 1) * campaignRowsPerPage,
    campaignPage * campaignRowsPerPage
  )

  // Mapas para lookup de campaña padre desde anuncios
  // Primario: por campaign_id. Fallback: por campaign_name (para IDs con precision loss de JS)
  const campaignMap = new Map(campaigns.map(c => [String(c.id), c]))
  const campaignNameMap = new Map(campaigns.map(c => [c.name, c]))

  // Filtrar conjuntos por búsqueda y por estado de entrega de su campaña padre
  const filteredAdSets = adSets.filter(adSet => {
    const search = adSetSearch.toLowerCase()
    const matchesSearch = (adSet.name || '').toLowerCase().includes(search) ||
                          (adSet.campaign_name || '').toLowerCase().includes(search)
    let matchesStatus = true
    if (adSetStatusFilter !== 'all') {
      const parentCampaign = campaignMap.get(String(adSet.campaign_id)) || campaignNameMap.get(adSet.campaign_name)
      if (parentCampaign) {
        const deliveryState = classifyCampaignDelivery(parentCampaign)
        matchesStatus = deliveryState === adSetStatusFilter
      } else {
        matchesStatus = false
      }
    }
    return matchesSearch && matchesStatus
  })

  // Paginación de conjuntos
  const totalAdSetPages = Math.ceil(filteredAdSets.length / adSetRowsPerPage)
  const paginatedAdSets = filteredAdSets.slice(
    (adSetPage - 1) * adSetRowsPerPage,
    adSetPage * adSetRowsPerPage
  )

  // Filtrar anuncios por búsqueda y por estado de entrega de su campaña padre
  const filteredAds = ads.filter(ad => {
    const matchesSearch = ad.name.toLowerCase().includes(adSearch.toLowerCase()) ||
                          ad.campaign_name.toLowerCase().includes(adSearch.toLowerCase())
    let matchesStatus = true
    if (adStatusFilter !== 'all') {
      // Intentar por ID primero, fallback por nombre (Facebook IDs de 18 digitos pierden precision en JS)
      const parentCampaign = campaignMap.get(String(ad.campaign_id)) || campaignNameMap.get(ad.campaign_name)
      if (parentCampaign) {
        const deliveryState = classifyCampaignDelivery(parentCampaign)
        matchesStatus = deliveryState === adStatusFilter
      } else {
        matchesStatus = false
      }
    }
    return matchesSearch && matchesStatus
  })

  // Paginación de anuncios
  const totalAdPages = Math.ceil(filteredAds.length / adRowsPerPage)
  const paginatedAds = filteredAds.slice(
    (adPage - 1) * adRowsPerPage,
    adPage * adRowsPerPage
  )

  // Reset página cuando cambian los filtros
  useEffect(() => {
    setCampaignPage(1)
  }, [campaignSearch, statusFilter])

  useEffect(() => {
    setAdSetPage(1)
  }, [adSetSearch, adSetStatusFilter])

  useEffect(() => {
    setAdPage(1)
  }, [adSearch, adStatusFilter])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value)
  }

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('es-ES').format(Math.round(value))
  }

  const formatPercent = (value: number) => {
    return `${value.toFixed(2)}%`
  }

  // Etiqueta legible para el objetivo de campaña de Facebook
  const getObjectiveLabel = (objective: string): string => {
    const map: Record<string, string> = {
      'OUTCOME_SALES': 'Ventas',
      'CONVERSIONS': 'Ventas',
      'PRODUCT_CATALOG_SALES': 'Catalogo',
      'MESSAGES': 'Mensajes',
      'OUTCOME_ENGAGEMENT': 'Interaccion',
      'LEAD_GENERATION': 'Leads',
      'OUTCOME_LEADS': 'Leads',
      'VIDEO_VIEWS': 'Video',
      'OUTCOME_AWARENESS': 'Reconocimiento',
      'OUTCOME_TRAFFIC': 'Trafico',
      'LINK_CLICKS': 'Trafico',
      'REACH': 'Alcance',
      'BRAND_AWARENESS': 'Reconocimiento',
      'POST_ENGAGEMENT': 'Interaccion',
      'PAGE_LIKES': 'Me gusta',
      'APP_INSTALLS': 'Instalaciones',
    }
    return map[objective] || objective
  }

  // Calcular número de columnas según vista seleccionada
  const getColumnCount = (): number => {
    let count = 11 // base columns
    if (objectiveView === 'ventas') count += 8
    if (objectiveView === 'mensajes') count += 5
    if (objectiveView === 'leads') count += 2
    if (objectiveView === 'video') count += 5
    count += customColumns.length
    return count
  }

  const stats = totals ? [
    {
      label: 'Gasto Total',
      value: formatCurrency(totals.spend),
      icon: <CurrencyDollar className="size-5" aria-hidden />,
      color: 'primary',
      description: 'Cantidad total gastada en todas las campanas durante el periodo seleccionado',
    },
    {
      label: 'Impresiones',
      value: formatNumber(totals.impressions),
      icon: <Eye className="size-5" aria-hidden />,
      color: 'success',
      description: 'Numero total de veces que tus anuncios fueron mostrados en pantalla',
    },
    {
      label: 'Clics',
      value: formatNumber(totals.clicks),
      icon: <HandTap className="size-5" aria-hidden />,
      color: 'warning',
      description: 'Numero total de clics en tus anuncios (enlaces, CTA, imagen, etc.)',
    },
    {
      label: 'CTR',
      value: formatPercent(totals.ctr),
      icon: <TrendUp className="size-5" aria-hidden />,
      color: 'success',
      description: 'Click-Through Rate: porcentaje de personas que hicieron clic despues de ver el anuncio (Clics / Impresiones)',
    },
    {
      label: 'CPC',
      value: formatCurrency(totals.cpc),
      icon: <CurrencyDollar className="size-5" aria-hidden />,
      color: 'neutral',
      description: 'Costo Por Clic: precio promedio pagado por cada clic en tus anuncios',
    },
    {
      label: 'CPM',
      value: formatCurrency(totals.cpm),
      icon: <CurrencyDollar className="size-5" aria-hidden />,
      color: 'neutral',
      description: 'Costo Por Mil impresiones: precio promedio pagado por cada 1.000 visualizaciones del anuncio',
    },
    {
      label: 'Alcance',
      value: formatNumber(totals.reach),
      icon: <Users className="size-5" aria-hidden />,
      color: 'primary',
      description: 'Numero de personas unicas que vieron tus anuncios al menos una vez',
    },
    {
      label: 'Frecuencia',
      value: totals.frequency.toFixed(2),
      icon: <Megaphone className="size-5" aria-hidden />,
      color: 'neutral',
      description: 'Promedio de veces que cada persona vio tu anuncio (Impresiones / Alcance)',
    },
    // === Mensajería (totales calculados desde campañas) ===
    {
      label: 'Conversaciones',
      value: formatNumber(campaigns.reduce((sum, c) => sum + (c.insights?.conversationsStarted || 0), 0)),
      icon: <ChatCircle className="size-5" aria-hidden />,
      color: 'primary',
      description: 'Total de conversaciones iniciadas desde anuncios (messaging_conversation_started_7d)',
    },
    {
      label: 'Contactos Msj',
      value: formatNumber(campaigns.reduce((sum, c) => sum + (c.insights?.messagingContacts || 0), 0)),
      icon: <ChatsCircle className="size-5" aria-hidden />,
      color: 'success',
      description: 'Total de contactos que respondieron por primera vez a tus anuncios (messaging_first_reply)',
    },
    {
      label: 'Nuevos Contactos',
      value: formatNumber(campaigns.reduce((sum, c) => sum + (c.insights?.newMessagingConnections || 0), 0)),
      icon: <UserPlus className="size-5" aria-hidden />,
      color: 'warning',
      description: 'Total de nuevas conexiones de mensajeria generadas por tus anuncios (total_messaging_connection)',
    },
  ] : []

  // Usa delivery_state (estado calculado) para determinar el estado real de la campaña
  // El icono hereda el color del Badge contenedor (currentColor) → sin colores hardcodeados.
  const getDeliveryStateIcon = (state: DeliveryState) => {
    switch (state) {
      case 'ACTIVA':
        return <CheckCircle className="size-3.5" weight="fill" aria-hidden />
      case 'DESACTIVADA':
        return <PauseCircle className="size-3.5" weight="fill" aria-hidden />
      case 'COMPLETADA':
        return <CheckCircle className="size-3.5" weight="fill" aria-hidden />
      case 'NO_HAY_ANUNCIOS':
        return <WarningCircle className="size-3.5" weight="fill" aria-hidden />
      default:
        return <WarningCircle className="size-3.5" weight="fill" aria-hidden />
    }
  }

  const getDeliveryStateColor = (state: DeliveryState): BadgeProps['variant'] => {
    switch (state) {
      case 'ACTIVA':
        return 'success'
      case 'DESACTIVADA':
        return 'warning'
      case 'COMPLETADA':
        return 'neutral'
      case 'NO_HAY_ANUNCIOS':
        return 'destructive'
      default:
        return 'neutral'
    }
  }

  // Obtener etiqueta legible para delivery_state
  const getDeliveryStateLabel = (state: DeliveryState): string => {
    switch (state) {
      case 'ACTIVA':
        return 'Activa'
      case 'DESACTIVADA':
        return 'Desactivada'
      case 'COMPLETADA':
        return 'Completada'
      case 'NO_HAY_ANUNCIOS':
        return 'Sin Anuncios'
      default:
        return state
    }
  }

  const exportData = () => {
    // Headers base
    const baseHeaders = ['Campana', 'Estado', 'Objetivo', 'Gasto', 'Impresiones', 'Alcance', 'Frecuencia', 'CPM', 'Clics', 'CTR', 'CPC']
    // Headers adicionales según objetivo
    const ventasHeaders = ['LPV', 'Costo/LPV', 'Carrito', 'Checkout', 'Compras', 'Costo/Compra', 'Valor Conv.', 'ROAS']
    const mensajesHeaders = ['Conversaciones', 'Costo/Conv.', 'Contactos Msj', 'Costo/Contacto', 'Nuevos Contactos']
    const leadsHeaders = ['Leads', 'Costo/Lead']
    const videoHeaders = ['Reprod. 3s', 'ThruPlays', 'Costo/ThruPlay', 'Visto 50%', 'Visto 95%']

    let headers = [...baseHeaders]
    if (objectiveView === 'ventas') headers = [...headers, ...ventasHeaders]
    if (objectiveView === 'mensajes') headers = [...headers, ...mensajesHeaders]
    if (objectiveView === 'leads') headers = [...headers, ...leadsHeaders]
    if (objectiveView === 'video') headers = [...headers, ...videoHeaders]
    // Columnas personalizadas
    const customHeaders = customColumns.map(col => col.name)
    headers = [...headers, ...customHeaders]

    const csvContent = [
      headers.join(','),
      ...filteredCampaigns.map(c => {
        const ins = c.insights
        const baseRow = [
          `"${c.name}"`,
          getDeliveryStateLabel(classifyCampaignDelivery(c)),
          getObjectiveLabel(c.objective),
          ins.spend,
          ins.impressions,
          ins.reach,
          ins.frequency.toFixed(2),
          ins.cpm,
          ins.clicks,
          ins.ctr,
          ins.cpc
        ]
        let extraRow: (string | number)[] = []
        if (objectiveView === 'ventas') {
          extraRow = [ins.landingPageViews || 0, ins.costPerLPV || 0, ins.addToCart || 0, ins.initiateCheckout || 0, ins.purchases || 0, ins.costPerPurchase || 0, ins.conversionValue || 0, ins.roas || 0]
        }
        if (objectiveView === 'mensajes') {
          extraRow = [ins.conversationsStarted || 0, ins.costPerConversation || 0, ins.messagingContacts || 0, ins.costPerMessagingContact || 0, ins.newMessagingConnections || 0]
        }
        if (objectiveView === 'leads') {
          extraRow = [ins.leads || 0, ins.costPerLead || 0]
        }
        if (objectiveView === 'video') {
          extraRow = [ins.videoPlays || 0, ins.thruPlays || 0, ins.costPerThruPlay || 0, ins.videoP50 || 0, ins.videoP95 || 0]
        }
        // Columnas personalizadas
        const customValues = customColumns.map(col => {
          const value = evaluateCustomColumn(col, ins as unknown as Record<string, number | undefined>)
          return value !== null && isFinite(value) ? value.toFixed(4) : '0'
        })
        return [...baseRow, ...extraRow, ...customValues].join(',')
      })
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `facebook_campaigns_${dateSince}_${dateUntil}_${objectiveView}_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  if (connectionStatus === 'checking') {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto flex min-h-[50vh] max-w-[1400px] flex-col items-center justify-center gap-4 p-5 sm:p-6 lg:p-8">
          <CircularProgress size="lg" />
          <p className="text-base text-muted-foreground">Verificando conexion con Facebook...</p>
        </div>
      </div>
    )
  }

  if (connectionStatus === 'error') {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Megaphone className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Facebook Ads Insights
              </h1>
              <p className="text-sm text-muted-foreground">
                Métricas de tu cuenta publicitaria de Meta
              </p>
            </div>
          </div>

          {/* Card de configuración pendiente */}
          <section className="mx-auto mt-4 w-full max-w-[600px] rounded-xl border border-warning/30 bg-warning/10 p-6 text-center">
            <span className="mx-auto mb-4 flex size-14 items-center justify-center text-warning-text">
              <Megaphone className="size-14" weight="fill" aria-hidden />
            </span>
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              Configuración Pendiente
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">
              {error || 'Para visualizar las métricas de tus campañas, necesitas vincular tu cuenta publicitaria de Meta (Facebook Ads).'}
            </p>

            <div className="mb-6 rounded-lg border border-border bg-card p-4 text-left">
              <h3 className="mb-3 text-sm font-semibold text-foreground">¿Cómo configurarlo?</h3>
              <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground marker:font-bold marker:text-primary">
                <li>
                  Ve a <strong className="font-semibold text-foreground">Canales → Facebook</strong> en el menú lateral
                </li>
                <li>Vincula tu cuenta de Facebook con permisos de Ads</li>
                <li>
                  Configura tu <strong className="font-semibold text-foreground">Ad Account ID</strong> en las credenciales
                </li>
                <li>Regresa aquí y tus métricas aparecerán automáticamente</li>
              </ol>
            </div>

            {adsConnections.length > 0 && (
              <div className="mb-4 text-left">
                <p className="mb-1.5 text-sm text-foreground">Conexiones disponibles:</p>
                <Select
                  value={selectedConnection?.toString() ?? ''}
                  onValueChange={(value) => handleConnectionChange(Number(value))}
                >
                  <SelectTrigger className="h-10 w-full max-w-[280px]" aria-label="Seleccionar conexión">
                    <SelectValue placeholder="Seleccionar conexión" />
                  </SelectTrigger>
                  <SelectContent>
                    {adsConnections.map((conn) => (
                      <SelectItem key={conn.id} value={conn.id.toString()}>
                        {conn.name} (act_{conn.facebookAdAccountId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button variant="outline" size="sm" onClick={() => fetchAdsConnections()}>
              <ArrowClockwise className="size-4" aria-hidden />
              Reintentar conexión
            </Button>
          </section>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
                <Megaphone className="size-6" weight="fill" aria-hidden />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Facebook Ads Insights
                </h1>
                <p className="text-sm text-muted-foreground">
                  Metricas de tu cuenta publicitaria de Meta
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {adsConnections.length > 1 && (
                <Select
                  value={selectedConnection?.toString() ?? ''}
                  onValueChange={(value) => handleConnectionChange(Number(value))}
                >
                  <SelectTrigger className="h-10 w-[200px]" aria-label="Conexión de Facebook">
                    <SelectValue placeholder="Conexión" />
                  </SelectTrigger>
                  <SelectContent>
                    {adsConnections.map((conn) => (
                      <SelectItem key={conn.id} value={conn.id.toString()}>
                        {conn.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <DateRangePicker
                since={dateSince}
                until={dateUntil}
                presetLabel={dateLabel}
                onApply={async (s, u, label) => {
                  // Invalidar cache para obtener datos frescos de la API.
                  // Si falla, se muestran los datos cacheados (degradación aceptable).
                  try {
                    await api.post('/meta-marketing/invalidate-cache')
                  } catch (err) {
                    logger.warn('[CampaignsInsights] no se pudo invalidar la caché de Meta', err)
                  }
                  setDateSince(s)
                  setDateUntil(u)
                  setDateLabel(label)
                }}
              />

              <Tooltip title="Forzar recarga (invalida cache)">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Forzar recarga"
                  onClick={handleForceRefresh}
                  disabled={loading}
                >
                  <ArrowClockwise className="size-5" aria-hidden />
                </Button>
              </Tooltip>

              <Tooltip title="Exportar CSV">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Exportar CSV"
                  onClick={exportData}
                  disabled={campaigns.length === 0}
                >
                  <DownloadSimple className="size-5" aria-hidden />
                </Button>
              </Tooltip>
            </div>
          </div>

          {loading && <LinearProgress />}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/16 p-4 text-sm text-warning-text"
            >
              <WarningCircle className="size-5 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          {/* KPI Cards */}
          {totals && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {stats.map((stat, index) => (
                <Tooltip key={index} title={stat.description}>
                  <div
                    tabIndex={0}
                    className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-muted-foreground">{stat.label}</p>
                        <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums text-foreground">
                          {stat.value}
                        </p>
                      </div>
                      <span className={cn('shrink-0', STAT_TONE[stat.color])}>{stat.icon}</span>
                    </div>
                  </div>
                </Tooltip>
              ))}
            </div>
          )}

          <Tabs
            value={insightsTab}
            onValueChange={(value) => setInsightsTab((value as 'campaigns' | 'adsets' | 'ads') || 'campaigns')}
          >
            <div className="rounded-xl border border-border bg-card p-2 shadow-sm shadow-black/[0.02]">
              <TabsList className="flex-wrap">
                <TabsTrigger value="campaigns">Campanas ({filteredCampaigns.length})</TabsTrigger>
                <TabsTrigger value="adsets">Conjuntos de anuncios ({filteredAdSets.length})</TabsTrigger>
                <TabsTrigger value="ads">Anuncios ({filteredAds.length})</TabsTrigger>
              </TabsList>
            </div>

            {/* Campaigns Table */}
            <TabsContent value="campaigns" className="mt-6 space-y-4">
              {/* Header con título y controles */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-foreground">
                  Campanas ({filteredCampaigns.length})
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Buscador */}
                  <Input
                    className="h-9 w-[200px]"
                    placeholder="Buscar campana..."
                    aria-label="Buscar campana"
                    leftIcon={<MagnifyingGlass aria-hidden />}
                    value={campaignSearch}
                    onChange={(e) => setCampaignSearch(e.target.value)}
                  />
                  {/* Filtro de estado (usa delivery_state calculado) */}
                  <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value)}>
                    <SelectTrigger className="h-9 w-[160px]" aria-label="Filtrar por estado">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="ACTIVA">Activas</SelectItem>
                      <SelectItem value="DESACTIVADA">Desactivadas</SelectItem>
                      <SelectItem value="COMPLETADA">Completadas</SelectItem>
                      <SelectItem value="NO_HAY_ANUNCIOS">Sin Anuncios</SelectItem>
                    </SelectContent>
                  </Select>
                  {/* Selector de métricas por objetivo */}
                  <Select
                    value={objectiveView}
                    onValueChange={(value) => setObjectiveView((value as ObjectiveView) || 'base')}
                  >
                    <SelectTrigger className="h-9 w-[200px]" aria-label="Vista de metricas">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="base">Metricas Base</SelectItem>
                      <SelectItem value="ventas">+ Ventas (E-commerce)</SelectItem>
                      <SelectItem value="mensajes">+ Mensajes</SelectItem>
                      <SelectItem value="leads">+ Leads</SelectItem>
                      <SelectItem value="video">+ Video (Branding)</SelectItem>
                    </SelectContent>
                  </Select>
                  {/* Botón Columnas Personalizadas */}
                  <Tooltip title="Crear columnas con formulas personalizadas">
                    <Button variant="outline" size="sm" onClick={() => setCustomColumnsModalOpen(true)}>
                      <Columns className="size-4" aria-hidden />
                      Personalizar
                      {customColumns.length > 0 && (
                        <Badge variant="primary" className="ml-0.5">
                          {customColumns.length}
                        </Badge>
                      )}
                    </Button>
                  </Tooltip>
                  {/* Filas por página */}
                  <Select
                    value={campaignRowsPerPage.toString()}
                    onValueChange={(value) => setCampaignRowsPerPage(Number(value))}
                  >
                    <SelectTrigger className="h-9 w-[80px]" aria-label="Filas por pagina">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Tabla con scroll horizontal */}
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
                <div className="overflow-x-auto">
                  <table
                    className={cn(
                      'w-full text-sm',
                      objectiveView === 'base' ? 'min-w-[900px]' : 'min-w-[1200px]',
                    )}
                  >
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left">
                        {/* === BLOQUE BASE (siempre visible) === */}
                        <th className={cn(TH, STICKY_HEAD_CELL, 'w-[250px] min-w-[250px]')}>Campana</th>
                        <th className={TH}>Estado</th>
                        <th className={TH}>Objetivo</th>
                        <th className={TH_NUM}>Gasto</th>
                        <th className={TH_NUM}>Impresiones</th>
                        <th className={TH_NUM}>Alcance</th>
                        <th className={TH_NUM}>Frecuencia</th>
                        <th className={TH_NUM}>CPM</th>
                        <th className={TH_NUM}>Clics</th>
                        <th className={TH_NUM}>CTR</th>
                        <th className={TH_NUM}>CPC</th>
                        {/* === BLOQUE VENTAS === */}
                        {objectiveView === 'ventas' && (
                          <>
                            <th className={cn(TH_NUM, BLOCK_TINT.ventas)}>LPV</th>
                            <th className={cn(TH_NUM, BLOCK_TINT.ventas)}>$/LPV</th>
                            <th className={cn(TH_NUM, BLOCK_TINT.ventas)}>Carrito</th>
                            <th className={cn(TH_NUM, BLOCK_TINT.ventas)}>Checkout</th>
                            <th className={cn(TH_NUM, BLOCK_TINT.ventas)}>Compras</th>
                            <th className={cn(TH_NUM, BLOCK_TINT.ventas)}>$/Compra</th>
                            <th className={cn(TH_NUM, BLOCK_TINT.ventas)}>Val.Conv.</th>
                            <th className={cn(TH_NUM, BLOCK_TINT.ventas)}>ROAS</th>
                          </>
                        )}
                        {/* === BLOQUE MENSAJES === */}
                        {objectiveView === 'mensajes' && (
                          <>
                            <th className={cn(TH_NUM, BLOCK_TINT.mensajes)}>Conversaciones</th>
                            <th className={cn(TH_NUM, BLOCK_TINT.mensajes)}>$/Conv.</th>
                            <th className={cn(TH_NUM, BLOCK_TINT.mensajes)}>Contactos Msj</th>
                            <th className={cn(TH_NUM, BLOCK_TINT.mensajes)}>$/Contacto</th>
                            <th className={cn(TH_NUM, BLOCK_TINT.mensajes)}>Nuevos Contactos</th>
                          </>
                        )}
                        {/* === BLOQUE LEADS === */}
                        {objectiveView === 'leads' && (
                          <>
                            <th className={cn(TH_NUM, BLOCK_TINT.leads)}>Leads</th>
                            <th className={cn(TH_NUM, BLOCK_TINT.leads)}>$/Lead</th>
                          </>
                        )}
                        {/* === BLOQUE VIDEO === */}
                        {objectiveView === 'video' && (
                          <>
                            <th className={cn(TH_NUM, BLOCK_TINT.video)}>Reprod. 3s</th>
                            <th className={cn(TH_NUM, BLOCK_TINT.video)}>ThruPlays</th>
                            <th className={cn(TH_NUM, BLOCK_TINT.video)}>$/ThruPlay</th>
                            <th className={cn(TH_NUM, BLOCK_TINT.video)}>Visto 50%</th>
                            <th className={cn(TH_NUM, BLOCK_TINT.video)}>Visto 95%</th>
                          </>
                        )}
                        {/* === COLUMNAS PERSONALIZADAS (siempre visibles) === */}
                        {customColumns.map(col => (
                          <th
                            key={col.id}
                            className={cn(TH_NUM, BLOCK_TINT.custom, 'min-w-[110px]')}
                          >
                            <Tooltip title={`${col.name}: ${getOperatorSymbol(col.operator)} (formula personalizada)`}>
                              <span className="block truncate">{col.name}</span>
                            </Tooltip>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {paginatedCampaigns.length === 0 ? (
                        <tr>
                          <td colSpan={getColumnCount()} className="px-4 py-10 text-center text-muted-foreground">
                            {campaignSearch ? 'No se encontraron campanas con ese nombre' : 'No hay campanas para mostrar'}
                          </td>
                        </tr>
                      ) : (
                        paginatedCampaigns.map((campaign) => {
                          const ins = campaign.insights
                          return (
                            <tr key={campaign.id} className="group transition-colors hover:bg-accent/40">
                              {/* === BLOQUE BASE === */}
                              <td className={cn(TD, STICKY_BODY_CELL)}>
                                <Tooltip title={campaign.name}>
                                  <span className="block max-w-[220px] truncate font-semibold text-foreground">
                                    {campaign.name}
                                  </span>
                                </Tooltip>
                              </td>
                              <td className={TD}>
                                {(() => {
                                  const deliveryState = classifyCampaignDelivery(campaign)
                                  return (
                                    <Badge variant={getDeliveryStateColor(deliveryState)}>
                                      {getDeliveryStateIcon(deliveryState)}
                                      {getDeliveryStateLabel(deliveryState)}
                                    </Badge>
                                  )
                                })()}
                              </td>
                              <td className={TD}>
                                <Badge variant="outline">{getObjectiveLabel(campaign.objective)}</Badge>
                              </td>
                              <td className={cn(TD_NUM, 'font-semibold text-foreground')}>
                                {formatCurrency(ins.spend)}
                              </td>
                              <td className={cn(TD_NUM, 'text-muted-foreground')}>
                                {formatNumber(ins.impressions)}
                              </td>
                              <td className={cn(TD_NUM, 'text-muted-foreground')}>
                                {formatNumber(ins.reach)}
                              </td>
                              <td className={cn(TD_NUM, 'text-muted-foreground')}>
                                {ins.frequency.toFixed(2)}
                              </td>
                              <td className={cn(TD_NUM, 'text-muted-foreground')}>
                                {formatCurrency(ins.cpm)}
                              </td>
                              <td className={cn(TD_NUM, 'text-muted-foreground')}>
                                {formatNumber(ins.clicks)}
                              </td>
                              <td className={cn(TD_NUM, 'font-semibold text-foreground')}>
                                {formatPercent(ins.ctr)}
                              </td>
                              <td className={cn(TD_NUM, 'text-muted-foreground')}>
                                {formatCurrency(ins.cpc)}
                              </td>
                              {/* === BLOQUE VENTAS === */}
                              {objectiveView === 'ventas' && (
                                <>
                                  <td className={cn(TD_NUM, 'text-muted-foreground')}>{formatNumber(ins.landingPageViews || 0)}</td>
                                  <td className={cn(TD_NUM, 'text-muted-foreground')}>{formatCurrency(ins.costPerLPV || 0)}</td>
                                  <td className={cn(TD_NUM, 'text-muted-foreground')}>{formatNumber(ins.addToCart || 0)}</td>
                                  <td className={cn(TD_NUM, 'text-muted-foreground')}>{formatNumber(ins.initiateCheckout || 0)}</td>
                                  <td className={cn(TD_NUM, 'font-semibold text-foreground')}>{formatNumber(ins.purchases || 0)}</td>
                                  <td className={cn(TD_NUM, 'font-semibold text-foreground')}>{formatCurrency(ins.costPerPurchase || 0)}</td>
                                  <td className={cn(TD_NUM, 'text-muted-foreground')}>{formatCurrency(ins.conversionValue || 0)}</td>
                                  <td
                                    className={cn(
                                      TD_NUM,
                                      'font-semibold',
                                      (ins.roas || 0) >= 1 ? 'text-success-text' : 'text-destructive-text',
                                    )}
                                  >
                                    {(ins.roas || 0).toFixed(2)}x
                                  </td>
                                </>
                              )}
                              {/* === BLOQUE MENSAJES === */}
                              {objectiveView === 'mensajes' && (
                                <>
                                  <td className={cn(TD_NUM, 'font-semibold text-foreground')}>{formatNumber(ins.conversationsStarted || 0)}</td>
                                  <td className={cn(TD_NUM, 'font-semibold text-foreground')}>{formatCurrency(ins.costPerConversation || 0)}</td>
                                  <td className={cn(TD_NUM, 'font-semibold text-foreground')}>{formatNumber(ins.messagingContacts || 0)}</td>
                                  <td className={cn(TD_NUM, 'font-semibold text-foreground')}>{formatCurrency(ins.costPerMessagingContact || 0)}</td>
                                  <td className={cn(TD_NUM, 'font-semibold text-foreground')}>{formatNumber(ins.newMessagingConnections || 0)}</td>
                                </>
                              )}
                              {/* === BLOQUE LEADS === */}
                              {objectiveView === 'leads' && (
                                <>
                                  <td className={cn(TD_NUM, 'font-semibold text-foreground')}>{formatNumber(ins.leads || 0)}</td>
                                  <td className={cn(TD_NUM, 'font-semibold text-foreground')}>{formatCurrency(ins.costPerLead || 0)}</td>
                                </>
                              )}
                              {/* === BLOQUE VIDEO === */}
                              {objectiveView === 'video' && (
                                <>
                                  <td className={cn(TD_NUM, 'text-muted-foreground')}>{formatNumber(ins.videoPlays || 0)}</td>
                                  <td className={cn(TD_NUM, 'font-semibold text-foreground')}>{formatNumber(ins.thruPlays || 0)}</td>
                                  <td className={cn(TD_NUM, 'font-semibold text-foreground')}>{formatCurrency(ins.costPerThruPlay || 0)}</td>
                                  <td className={cn(TD_NUM, 'text-muted-foreground')}>{formatNumber(ins.videoP50 || 0)}</td>
                                  <td className={cn(TD_NUM, 'text-muted-foreground')}>{formatNumber(ins.videoP95 || 0)}</td>
                                </>
                              )}
                              {/* === COLUMNAS PERSONALIZADAS === */}
                              {customColumns.map(col => {
                                const value = evaluateCustomColumn(col, ins as unknown as Record<string, number | undefined>)
                                return (
                                  <td key={col.id} className={cn(TD_NUM, 'font-semibold text-foreground')}>
                                    {formatCustomValue(value, col.format, formatCurrency, formatNumber, formatPercent)}
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Paginación */}
              {totalCampaignPages > 1 && (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    Mostrando {((campaignPage - 1) * campaignRowsPerPage) + 1} - {Math.min(campaignPage * campaignRowsPerPage, filteredCampaigns.length)} de {filteredCampaigns.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-9"
                      aria-label="Pagina anterior"
                      disabled={campaignPage === 1}
                      onClick={() => setCampaignPage(p => p - 1)}
                    >
                      <CaretLeft className="size-4" aria-hidden />
                    </Button>
                    <span className="text-sm text-foreground">
                      Pagina {campaignPage} de {totalCampaignPages}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-9"
                      aria-label="Pagina siguiente"
                      disabled={campaignPage === totalCampaignPages}
                      onClick={() => setCampaignPage(p => p + 1)}
                    >
                      <CaretRight className="size-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Ad Sets Table */}
            <TabsContent value="adsets" className="mt-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-foreground">
                  Conjuntos de anuncios ({filteredAdSets.length})
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="h-9 w-[240px]"
                    placeholder="Buscar conjunto o campana..."
                    aria-label="Buscar conjunto o campana"
                    leftIcon={<MagnifyingGlass aria-hidden />}
                    value={adSetSearch}
                    onChange={(e) => setAdSetSearch(e.target.value)}
                  />
                  <Select value={adSetStatusFilter} onValueChange={(value) => setAdSetStatusFilter(value)}>
                    <SelectTrigger className="h-9 w-[180px]" aria-label="Filtrar por estado de campana">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las campanas</SelectItem>
                      <SelectItem value="ACTIVA">Campanas Activas</SelectItem>
                      <SelectItem value="DESACTIVADA">Campanas Desactivadas</SelectItem>
                      <SelectItem value="COMPLETADA">Campanas Completadas</SelectItem>
                      <SelectItem value="NO_HAY_ANUNCIOS">Sin Anuncios</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={adSetRowsPerPage.toString()}
                    onValueChange={(value) => setAdSetRowsPerPage(Number(value))}
                  >
                    <SelectTrigger className="h-9 w-[80px]" aria-label="Filas por pagina">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left">
                        <th className={cn(TH, STICKY_HEAD_CELL, 'w-[260px] min-w-[260px]')}>
                          Conjunto de anuncios
                        </th>
                        <th className={cn(TH, 'min-w-[240px]')}>Campana</th>
                        <th className={TH}>Estado</th>
                        <th className={TH_NUM}>Gasto</th>
                        <th className={TH_NUM}>Impresiones</th>
                        <th className={TH_NUM}>Alcance</th>
                        <th className={TH_NUM}>Frecuencia</th>
                        <th className={TH_NUM}>CPM</th>
                        <th className={TH_NUM}>Clics</th>
                        <th className={TH_NUM}>CTR</th>
                        <th className={TH_NUM}>CPC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {paginatedAdSets.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="px-4 py-10 text-center text-muted-foreground">
                            {adSetSearch || adSetStatusFilter !== 'all' ? 'No se encontraron conjuntos con esos filtros' : 'No hay conjuntos de anuncios para mostrar'}
                          </td>
                        </tr>
                      ) : (
                        paginatedAdSets.map((adSet) => {
                          const parentCampaign = campaignMap.get(String(adSet.campaign_id)) || campaignNameMap.get(adSet.campaign_name)
                          const deliveryState = parentCampaign ? classifyCampaignDelivery(parentCampaign) : 'DESACTIVADA'
                          return (
                            <tr key={adSet.id} className="group transition-colors hover:bg-accent/40">
                              <td className={cn(TD, STICKY_BODY_CELL)}>
                                <Tooltip title={adSet.name}>
                                  <span className="block max-w-[240px] truncate font-semibold text-foreground">
                                    {adSet.name}
                                  </span>
                                </Tooltip>
                              </td>
                              <td className={TD}>
                                <Tooltip title={adSet.campaign_name}>
                                  <span className="block max-w-[220px] truncate text-xs text-muted-foreground">
                                    {adSet.campaign_name}
                                  </span>
                                </Tooltip>
                              </td>
                              <td className={TD}>
                                <Badge variant={getDeliveryStateColor(deliveryState)}>
                                  {getDeliveryStateIcon(deliveryState)}
                                  {getDeliveryStateLabel(deliveryState)}
                                </Badge>
                              </td>
                              <td className={cn(TD_NUM, 'font-semibold text-foreground')}>
                                {formatCurrency(adSet.spend)}
                              </td>
                              <td className={cn(TD_NUM, 'text-muted-foreground')}>{formatNumber(adSet.impressions)}</td>
                              <td className={cn(TD_NUM, 'text-muted-foreground')}>{formatNumber(adSet.reach)}</td>
                              <td className={cn(TD_NUM, 'text-muted-foreground')}>{adSet.frequency.toFixed(2)}</td>
                              <td className={cn(TD_NUM, 'text-muted-foreground')}>{formatCurrency(adSet.cpm)}</td>
                              <td className={cn(TD_NUM, 'text-muted-foreground')}>{formatNumber(adSet.clicks)}</td>
                              <td className={cn(TD_NUM, 'font-semibold text-foreground')}>{formatPercent(adSet.ctr)}</td>
                              <td className={cn(TD_NUM, 'text-muted-foreground')}>{formatCurrency(adSet.cpc)}</td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {totalAdSetPages > 1 && (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    Mostrando {((adSetPage - 1) * adSetRowsPerPage) + 1} - {Math.min(adSetPage * adSetRowsPerPage, filteredAdSets.length)} de {filteredAdSets.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-9"
                      aria-label="Pagina anterior"
                      disabled={adSetPage === 1}
                      onClick={() => setAdSetPage(p => p - 1)}
                    >
                      <CaretLeft className="size-4" aria-hidden />
                    </Button>
                    <span className="text-sm text-foreground">
                      Pagina {adSetPage} de {totalAdSetPages}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-9"
                      aria-label="Pagina siguiente"
                      disabled={adSetPage === totalAdSetPages}
                      onClick={() => setAdSetPage(p => p + 1)}
                    >
                      <CaretRight className="size-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Ads Table */}
            <TabsContent value="ads" className="mt-6 space-y-4">
              {/* Header con título y controles */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-foreground">
                  Anuncios ({filteredAds.length})
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Buscador */}
                  <Input
                    className="h-9 w-[220px]"
                    placeholder="Buscar anuncio o campana..."
                    aria-label="Buscar anuncio o campana"
                    leftIcon={<MagnifyingGlass aria-hidden />}
                    value={adSearch}
                    onChange={(e) => setAdSearch(e.target.value)}
                  />
                  {/* Filtro por estado de campaña padre */}
                  <Select value={adStatusFilter} onValueChange={(value) => setAdStatusFilter(value)}>
                    <SelectTrigger className="h-9 w-[160px]" aria-label="Filtrar por estado de campana">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las campanas</SelectItem>
                      <SelectItem value="ACTIVA">Campanas Activas</SelectItem>
                      <SelectItem value="DESACTIVADA">Campanas Desactivadas</SelectItem>
                      <SelectItem value="COMPLETADA">Campanas Completadas</SelectItem>
                      <SelectItem value="NO_HAY_ANUNCIOS">Sin Anuncios</SelectItem>
                    </SelectContent>
                  </Select>
                  {/* Filas por página */}
                  <Select
                    value={adRowsPerPage.toString()}
                    onValueChange={(value) => setAdRowsPerPage(Number(value))}
                  >
                    <SelectTrigger className="h-9 w-[80px]" aria-label="Filas por pagina">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Tabla */}
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left">
                        <th className={cn(TH, 'w-1/5')}>Anuncio</th>
                        <th className={cn(TH, 'w-1/5')}>Campana</th>
                        <th className={TH_NUM}>Impresiones</th>
                        <th className={TH_NUM}>Clics</th>
                        <th className={TH_NUM}>CTR</th>
                        <th className={TH_NUM}>Gasto</th>
                        <th className={TH_NUM}>CPC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {paginatedAds.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                            {adSearch || adStatusFilter !== 'all' ? 'No se encontraron anuncios con esos filtros' : 'No hay anuncios para mostrar'}
                          </td>
                        </tr>
                      ) : (
                        paginatedAds.map((ad) => (
                          <tr key={ad.id} className="transition-colors hover:bg-accent/40">
                            <td className={TD}>
                              <span className="font-semibold text-foreground">{ad.name}</span>
                            </td>
                            <td className={TD}>
                              <span className="text-xs text-muted-foreground">{ad.campaign_name}</span>
                            </td>
                            <td className={cn(TD_NUM, 'text-muted-foreground')}>{formatNumber(ad.impressions)}</td>
                            <td className={cn(TD_NUM, 'text-muted-foreground')}>{formatNumber(ad.clicks)}</td>
                            <td className={cn(TD_NUM, 'font-semibold text-foreground')}>{formatPercent(ad.ctr)}</td>
                            <td className={cn(TD_NUM, 'font-semibold text-foreground')}>{formatCurrency(ad.spend)}</td>
                            <td className={cn(TD_NUM, 'text-muted-foreground')}>{formatCurrency(ad.cpc)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Paginación */}
              {totalAdPages > 1 && (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    Mostrando {((adPage - 1) * adRowsPerPage) + 1} - {Math.min(adPage * adRowsPerPage, filteredAds.length)} de {filteredAds.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-9"
                      aria-label="Pagina anterior"
                      disabled={adPage === 1}
                      onClick={() => setAdPage(p => p - 1)}
                    >
                      <CaretLeft className="size-4" aria-hidden />
                    </Button>
                    <span className="text-sm text-foreground">
                      Pagina {adPage} de {totalAdPages}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-9"
                      aria-label="Pagina siguiente"
                      disabled={adPage === totalAdPages}
                      onClick={() => setAdPage(p => p + 1)}
                    >
                      <CaretRight className="size-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Trend Chart */}
          {trendData.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <h2 className="mb-5 text-base font-semibold text-foreground">Tendencia de Metricas</h2>
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) => new Date(value).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <RechartsTooltip
                    labelFormatter={(value) => new Date(value).toLocaleDateString('es-ES')}
                    formatter={((value: any, name: string) => {
                      const v = Number(value) || 0
                      if (name === 'spend') return [formatCurrency(v), 'Gasto']
                      return [formatNumber(v), name === 'impressions' ? 'Impresiones' : name === 'clicks' ? 'Clics' : name === 'reach' ? 'Alcance' : name]
                    }) as any}
                  />
                  <Legend />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="spend"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.3}
                    name="Gasto ($)"
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="impressions"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.3}
                    name="Impresiones"
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="clicks"
                    stroke="#f59e0b"
                    fill="#f59e0b"
                    fillOpacity={0.3}
                    name="Clics"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </section>
          )}
        </div>

        {/* Modal Columnas Personalizadas */}
        <CustomColumnModal
          open={customColumnsModalOpen}
          onClose={() => setCustomColumnsModalOpen(false)}
          onSave={handleSaveCustomColumns}
          columns={customColumns}
          previewData={campaigns.length > 0 ? (campaigns[0].insights as unknown as Record<string, number | undefined>) : null}
        />
      </div>
    </TooltipProvider>
  )
}
