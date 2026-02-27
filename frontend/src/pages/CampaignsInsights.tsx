import { useState, useEffect } from 'react'
import {
  Container,
  Typography,
  Box,
  Stack,
  Card,
  CardContent,
  Grid,
  Select,
  Option,
  Chip,
  Sheet,
  Table,
  LinearProgress,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
  Input,
} from '@mui/joy'
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Remove as RemoveIcon,
  Campaign as CampaignIcon,
  Visibility as VisibilityIcon,
  TouchApp as TouchAppIcon,
  AttachMoney as MoneyIcon,
  People as PeopleIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  PauseCircle as PauseCircleIcon,
  Error as ErrorIcon,
  Search as SearchIcon,
  KeyboardArrowLeft as ArrowLeftIcon,
  KeyboardArrowRight as ArrowRightIcon,
  Chat as ChatIcon,
  PersonAdd as PersonAddIcon,
  Forum as ForumIcon,
} from '@mui/icons-material'
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
import api from '../services/api'
import DateRangePicker from '../components/DateRangePicker'

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
type DeliveryState = 'ACTIVA' | 'NO_HAY_ANUNCIOS' | 'COMPLETADA' | 'DESACTIVADA'

// Función para clasificar el estado de entrega de una campaña
// Combina status, effective_status, fechas y presupuesto para determinar el estado real
// NOTA: No usamos impresiones=0 como criterio porque una campaña puede estar activa
// pero aún no haber generado impresiones (ej: campaña nueva o en cola de aprendizaje)
function classifyCampaignDelivery(campaign: FacebookCampaign): DeliveryState {
  // 1. Si el usuario pausó manualmente la campaña
  if (campaign.status === 'PAUSED') {
    return 'DESACTIVADA'
  }

  // 2. Si la fecha de fin ya pasó
  if (campaign.stop_time && new Date(campaign.stop_time) < new Date()) {
    return 'COMPLETADA'
  }

  // 3. Si el presupuesto se agotó
  if (campaign.budget_remaining !== undefined && Number(campaign.budget_remaining) <= 0) {
    return 'COMPLETADA'
  }

  // 4. Si no hay ads activos (dato viene del backend)
  // activeAds es el conteo real de anuncios con effective_status=ACTIVE
  if (campaign.activeAds !== undefined && campaign.activeAds === 0) {
    return 'NO_HAY_ANUNCIOS'
  }

  // 5. Si status y effective_status son ACTIVE → la campaña está activa
  // (incluso si tiene 0 impresiones - puede ser nueva o en cola de aprendizaje)
  if (campaign.status === 'ACTIVE' && campaign.effective_status === 'ACTIVE') {
    return 'ACTIVA'
  }

  // 6. Si solo status es ACTIVE (sin effective_status) → también activa
  if (campaign.status === 'ACTIVE') {
    return 'ACTIVA'
  }

  // 7. Estados de completado
  if (campaign.effective_status === 'COMPLETED' || campaign.effective_status === 'CAMPAIGN_PAUSED') {
    return 'COMPLETADA'
  }

  // Default: cualquier otro caso
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
  const [ads, setAds] = useState<FacebookAd[]>([])
  const [trendData, setTrendData] = useState<InsightsTrend[]>([])
  const [totals, setTotals] = useState<AggregatedInsights | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'error'>('checking')
  const [adsConnections, setAdsConnections] = useState<AdsConnection[]>([])
  const [selectedConnection, setSelectedConnection] = useState<number | null>(null)
  const [debugMode, setDebugMode] = useState(false)

  // Estados para búsqueda y paginación - Campañas
  const [campaignSearch, setCampaignSearch] = useState('')
  const [campaignPage, setCampaignPage] = useState(1)
  const [campaignRowsPerPage, setCampaignRowsPerPage] = useState(10)

  // Estado para vista de métricas por objetivo
  type ObjectiveView = 'base' | 'ventas' | 'mensajes' | 'leads' | 'video'
  const [objectiveView, setObjectiveView] = useState<ObjectiveView>('base')

  // Estados para búsqueda y paginación - Anuncios
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
        setError('MODO DEBUG: ' + (response.data.message || 'Error de conexion. Verifica FB_ACCESS_TOKEN y FB_AD_ACCOUNT_ID en el .env del backend'))
      }
    } catch (err: any) {
      console.error('🧪 MODO DEBUG error:', err)
      setConnectionStatus('error')
      setError('No hay conexiones configuradas y el MODO DEBUG fallo. Verifica FB_ACCESS_TOKEN y FB_AD_ACCOUNT_ID en el .env del backend.')
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
    return count
  }

  const stats = totals ? [
    {
      label: 'Gasto Total',
      value: formatCurrency(totals.spend),
      icon: <MoneyIcon />,
      color: 'primary',
      description: 'Cantidad total gastada en todas las campanas durante el periodo seleccionado',
    },
    {
      label: 'Impresiones',
      value: formatNumber(totals.impressions),
      icon: <VisibilityIcon />,
      color: 'success',
      description: 'Numero total de veces que tus anuncios fueron mostrados en pantalla',
    },
    {
      label: 'Clics',
      value: formatNumber(totals.clicks),
      icon: <TouchAppIcon />,
      color: 'warning',
      description: 'Numero total de clics en tus anuncios (enlaces, CTA, imagen, etc.)',
    },
    {
      label: 'CTR',
      value: formatPercent(totals.ctr),
      icon: <TrendingUpIcon />,
      color: 'success',
      description: 'Click-Through Rate: porcentaje de personas que hicieron clic despues de ver el anuncio (Clics / Impresiones)',
    },
    {
      label: 'CPC',
      value: formatCurrency(totals.cpc),
      icon: <MoneyIcon />,
      color: 'neutral',
      description: 'Costo Por Clic: precio promedio pagado por cada clic en tus anuncios',
    },
    {
      label: 'CPM',
      value: formatCurrency(totals.cpm),
      icon: <MoneyIcon />,
      color: 'neutral',
      description: 'Costo Por Mil impresiones: precio promedio pagado por cada 1.000 visualizaciones del anuncio',
    },
    {
      label: 'Alcance',
      value: formatNumber(totals.reach),
      icon: <PeopleIcon />,
      color: 'primary',
      description: 'Numero de personas unicas que vieron tus anuncios al menos una vez',
    },
    {
      label: 'Frecuencia',
      value: totals.frequency.toFixed(2),
      icon: <CampaignIcon />,
      color: 'neutral',
      description: 'Promedio de veces que cada persona vio tu anuncio (Impresiones / Alcance)',
    },
    // === Mensajería (totales calculados desde campañas) ===
    {
      label: 'Conversaciones',
      value: formatNumber(campaigns.reduce((sum, c) => sum + (c.insights?.conversationsStarted || 0), 0)),
      icon: <ChatIcon />,
      color: 'primary',
      description: 'Total de conversaciones iniciadas desde anuncios (messaging_conversation_started_7d)',
    },
    {
      label: 'Contactos Msj',
      value: formatNumber(campaigns.reduce((sum, c) => sum + (c.insights?.messagingContacts || 0), 0)),
      icon: <ForumIcon />,
      color: 'success',
      description: 'Total de contactos que respondieron por primera vez a tus anuncios (messaging_first_reply)',
    },
    {
      label: 'Nuevos Contactos',
      value: formatNumber(campaigns.reduce((sum, c) => sum + (c.insights?.newMessagingConnections || 0), 0)),
      icon: <PersonAddIcon />,
      color: 'warning',
      description: 'Total de nuevas conexiones de mensajeria generadas por tus anuncios (total_messaging_connection)',
    },
  ] : []

  // Usa delivery_state (estado calculado) para determinar el estado real de la campaña
  const getDeliveryStateIcon = (state: DeliveryState) => {
    switch (state) {
      case 'ACTIVA':
        return <CheckCircleIcon sx={{ color: 'success.500', fontSize: 18 }} />
      case 'DESACTIVADA':
        return <PauseCircleIcon sx={{ color: 'warning.500', fontSize: 18 }} />
      case 'COMPLETADA':
        return <CheckCircleIcon sx={{ color: 'neutral.500', fontSize: 18 }} />
      case 'NO_HAY_ANUNCIOS':
        return <ErrorIcon sx={{ color: 'danger.500', fontSize: 18 }} />
      default:
        return <ErrorIcon sx={{ color: 'neutral.500', fontSize: 18 }} />
    }
  }

  const getDeliveryStateColor = (state: DeliveryState): 'success' | 'warning' | 'neutral' | 'danger' => {
    switch (state) {
      case 'ACTIVA':
        return 'success'
      case 'DESACTIVADA':
        return 'warning'
      case 'COMPLETADA':
        return 'neutral'
      case 'NO_HAY_ANUNCIOS':
        return 'danger'
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
        return [...baseRow, ...extraRow].join(',')
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
      <Container maxWidth="xl">
        <Stack spacing={3} alignItems="center" justifyContent="center" sx={{ minHeight: '50vh' }}>
          <CircularProgress size="lg" />
          <Typography level="body-lg">Verificando conexion con Facebook...</Typography>
        </Stack>
      </Container>
    )
  }

  if (connectionStatus === 'error') {
    return (
      <Container maxWidth="xl">
        <Stack spacing={3} sx={{ mt: 4 }}>
          <Alert
            color="danger"
            variant="soft"
            startDecorator={<ErrorIcon />}
          >
            <Stack spacing={1}>
              <Typography level="title-md">Error de Conexion</Typography>
              <Typography level="body-sm">{error}</Typography>
              <Typography level="body-xs">
                Ve a Conexiones - Facebook - Credenciales y configura el Ad Account ID.
              </Typography>
            </Stack>
          </Alert>

          {adsConnections.length > 0 && (
            <Box>
              <Typography level="body-sm" sx={{ mb: 1 }}>Selecciona una conexion:</Typography>
              <Select
                value={selectedConnection?.toString() || ''}
                onChange={(_, value) => handleConnectionChange(Number(value))}
                placeholder="Seleccionar conexion"
                sx={{ minWidth: 250 }}
              >
                {adsConnections.map((conn) => (
                  <Option key={conn.id} value={conn.id.toString()}>
                    {conn.name} (act_{conn.facebookAdAccountId})
                  </Option>
                ))}
              </Select>
            </Box>
          )}

          <Box>
            <IconButton variant="outlined" onClick={() => fetchAdsConnections()}>
              <RefreshIcon />
            </IconButton>
          </Box>
        </Stack>
      </Container>
    )
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <CampaignIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Facebook Ads Insights</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Metricas de tu cuenta publicitaria de Meta
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={2}>
            {adsConnections.length > 1 && (
              <Select
                value={selectedConnection?.toString() || ''}
                onChange={(_, value) => handleConnectionChange(Number(value))}
                sx={{ minWidth: 200 }}
              >
                {adsConnections.map((conn) => (
                  <Option key={conn.id} value={conn.id.toString()}>
                    {conn.name}
                  </Option>
                ))}
              </Select>
            )}

            <DateRangePicker
              since={dateSince}
              until={dateUntil}
              presetLabel={dateLabel}
              onApply={async (s, u, label) => {
                // Invalidar cache para obtener datos frescos de la API
                try {
                  await api.post('/meta-marketing/invalidate-cache')
                } catch (_) {}
                setDateSince(s)
                setDateUntil(u)
                setDateLabel(label)
              }}
            />

            <Tooltip title="Forzar recarga (invalida cache)">
              <IconButton variant="outlined" color="neutral" onClick={handleForceRefresh} disabled={loading}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>

            <Tooltip title="Exportar CSV">
              <IconButton variant="outlined" color="neutral" onClick={exportData} disabled={campaigns.length === 0}>
                <DownloadIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        {loading && <LinearProgress />}

        {error && (
          <Alert color="warning" variant="soft">
            {error}
          </Alert>
        )}

        {/* KPI Cards */}
        {totals && (
          <Grid container spacing={2}>
            {stats.map((stat, index) => (
              <Grid xs={12} sm={6} md={3} key={index}>
                <Tooltip
                  title={stat.description}
                  placement="top"
                  arrow
                  sx={{
                    maxWidth: 280,
                    borderRadius: '12px',
                    px: 1.5,
                    py: 1,
                    fontSize: '13px',
                    lineHeight: 1.4,
                    boxShadow: 'md',
                  }}
                >
                  <Card sx={{ cursor: 'default' }}>
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                        <Box>
                          <Typography level="body-sm" sx={{ mb: 1, color: 'text.tertiary' }}>
                            {stat.label}
                          </Typography>
                          <Typography level="h3">
                            {stat.value}
                          </Typography>
                        </Box>
                        <Box sx={{ color: `${stat.color}.500` }}>
                          {stat.icon}
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>
                </Tooltip>
              </Grid>
            ))}
          </Grid>
        )}

        {/* Campaigns Table */}
        <Card>
          <CardContent>
            <Stack spacing={2}>
              {/* Header con título y controles */}
              <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
                <Typography level="h4">
                  Campanas ({filteredCampaigns.length})
                </Typography>
                <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                  {/* Buscador */}
                  <Input
                    size="sm"
                    placeholder="Buscar campana..."
                    startDecorator={<SearchIcon sx={{ fontSize: 18 }} />}
                    value={campaignSearch}
                    onChange={(e) => setCampaignSearch(e.target.value)}
                    sx={{ minWidth: 200 }}
                  />
                  {/* Filtro de estado (usa delivery_state calculado) */}
                  <Select
                    size="sm"
                    value={statusFilter}
                    onChange={(_, value) => setStatusFilter(value as string)}
                    sx={{ minWidth: 160 }}
                  >
                    <Option value="all">Todos</Option>
                    <Option value="ACTIVA">Activas</Option>
                    <Option value="DESACTIVADA">Desactivadas</Option>
                    <Option value="COMPLETADA">Completadas</Option>
                    <Option value="NO_HAY_ANUNCIOS">Sin Anuncios</Option>
                  </Select>
                  {/* Selector de métricas por objetivo */}
                  <Select
                    size="sm"
                    value={objectiveView}
                    onChange={(_, value) => setObjectiveView((value as ObjectiveView) || 'base')}
                    sx={{ minWidth: 200 }}
                  >
                    <Option value="base">Metricas Base</Option>
                    <Option value="ventas">+ Ventas (E-commerce)</Option>
                    <Option value="mensajes">+ Mensajes</Option>
                    <Option value="leads">+ Leads</Option>
                    <Option value="video">+ Video (Branding)</Option>
                  </Select>
                  {/* Filas por página */}
                  <Select
                    size="sm"
                    value={campaignRowsPerPage.toString()}
                    onChange={(_, value) => setCampaignRowsPerPage(Number(value))}
                    sx={{ minWidth: 80 }}
                  >
                    <Option value="5">5</Option>
                    <Option value="10">10</Option>
                    <Option value="25">25</Option>
                    <Option value="50">50</Option>
                  </Select>
                </Stack>
              </Stack>

              {/* Tabla con scroll horizontal */}
              <Sheet sx={{ overflowX: 'auto', overflowY: 'hidden' }}>
                <Table sx={{
                  '& th, & td': { whiteSpace: 'nowrap' },
                  // Columna Campaña fija a la izquierda
                  '& th:first-of-type, & td:first-of-type': {
                    position: 'sticky',
                    left: 0,
                    zIndex: 1,
                    bgcolor: 'background.surface',
                    boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)',
                  },
                  '& thead th:first-of-type': {
                    zIndex: 2,
                  },
                  tableLayout: 'auto',
                  minWidth: objectiveView === 'base' ? 900 : 1200,
                }}>
                  <thead>
                    <tr>
                      {/* === BLOQUE BASE (siempre visible) === */}
                      <th style={{ minWidth: 250, width: 250 }}>Campana</th>
                      <th>Estado</th>
                      <th>Objetivo</th>
                      <th style={{ textAlign: 'right' }}>Gasto</th>
                      <th style={{ textAlign: 'right' }}>Impresiones</th>
                      <th style={{ textAlign: 'right' }}>Alcance</th>
                      <th style={{ textAlign: 'right' }}>Frecuencia</th>
                      <th style={{ textAlign: 'right' }}>CPM</th>
                      <th style={{ textAlign: 'right' }}>Clics</th>
                      <th style={{ textAlign: 'right' }}>CTR</th>
                      <th style={{ textAlign: 'right' }}>CPC</th>
                      {/* === BLOQUE VENTAS === */}
                      {objectiveView === 'ventas' && (
                        <>
                          <th style={{ textAlign: 'right', background: 'var(--joy-palette-success-softBg)' }}>LPV</th>
                          <th style={{ textAlign: 'right', background: 'var(--joy-palette-success-softBg)' }}>$/LPV</th>
                          <th style={{ textAlign: 'right', background: 'var(--joy-palette-success-softBg)' }}>Carrito</th>
                          <th style={{ textAlign: 'right', background: 'var(--joy-palette-success-softBg)' }}>Checkout</th>
                          <th style={{ textAlign: 'right', background: 'var(--joy-palette-success-softBg)' }}>Compras</th>
                          <th style={{ textAlign: 'right', background: 'var(--joy-palette-success-softBg)' }}>$/Compra</th>
                          <th style={{ textAlign: 'right', background: 'var(--joy-palette-success-softBg)' }}>Val.Conv.</th>
                          <th style={{ textAlign: 'right', background: 'var(--joy-palette-success-softBg)' }}>ROAS</th>
                        </>
                      )}
                      {/* === BLOQUE MENSAJES === */}
                      {objectiveView === 'mensajes' && (
                        <>
                          <th style={{ textAlign: 'right', background: 'var(--joy-palette-primary-softBg)' }}>Conversaciones</th>
                          <th style={{ textAlign: 'right', background: 'var(--joy-palette-primary-softBg)' }}>$/Conv.</th>
                          <th style={{ textAlign: 'right', background: 'var(--joy-palette-primary-softBg)' }}>Contactos Msj</th>
                          <th style={{ textAlign: 'right', background: 'var(--joy-palette-primary-softBg)' }}>$/Contacto</th>
                          <th style={{ textAlign: 'right', background: 'var(--joy-palette-primary-softBg)' }}>Nuevos Contactos</th>
                        </>
                      )}
                      {/* === BLOQUE LEADS === */}
                      {objectiveView === 'leads' && (
                        <>
                          <th style={{ textAlign: 'right', background: 'var(--joy-palette-warning-softBg)' }}>Leads</th>
                          <th style={{ textAlign: 'right', background: 'var(--joy-palette-warning-softBg)' }}>$/Lead</th>
                        </>
                      )}
                      {/* === BLOQUE VIDEO === */}
                      {objectiveView === 'video' && (
                        <>
                          <th style={{ textAlign: 'right', background: 'var(--joy-palette-neutral-softBg)' }}>Reprod. 3s</th>
                          <th style={{ textAlign: 'right', background: 'var(--joy-palette-neutral-softBg)' }}>ThruPlays</th>
                          <th style={{ textAlign: 'right', background: 'var(--joy-palette-neutral-softBg)' }}>$/ThruPlay</th>
                          <th style={{ textAlign: 'right', background: 'var(--joy-palette-neutral-softBg)' }}>Visto 50%</th>
                          <th style={{ textAlign: 'right', background: 'var(--joy-palette-neutral-softBg)' }}>Visto 95%</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedCampaigns.length === 0 ? (
                      <tr>
                        <td colSpan={getColumnCount()}>
                          <Typography level="body-sm" sx={{ textAlign: 'center', py: 4, color: 'text.tertiary' }}>
                            {campaignSearch ? 'No se encontraron campanas con ese nombre' : 'No hay campanas para mostrar'}
                          </Typography>
                        </td>
                      </tr>
                    ) : (
                      paginatedCampaigns.map((campaign) => {
                        const ins = campaign.insights
                        return (
                          <tr key={campaign.id}>
                            {/* === BLOQUE BASE === */}
                            <td>
                              <Tooltip title={campaign.name} placement="top-start">
                                <Typography level="body-sm" fontWeight="bold" sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {campaign.name}
                                </Typography>
                              </Tooltip>
                            </td>
                            <td>
                              {(() => {
                                const deliveryState = classifyCampaignDelivery(campaign)
                                return (
                                  <Chip
                                    size="sm"
                                    color={getDeliveryStateColor(deliveryState)}
                                    variant="soft"
                                    startDecorator={getDeliveryStateIcon(deliveryState)}
                                  >
                                    {getDeliveryStateLabel(deliveryState)}
                                  </Chip>
                                )
                              })()}
                            </td>
                            <td>
                              <Chip size="sm" variant="outlined">
                                {getObjectiveLabel(campaign.objective)}
                              </Chip>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <Typography level="body-sm" fontWeight="bold">
                                {formatCurrency(ins.spend)}
                              </Typography>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <Typography level="body-sm">
                                {formatNumber(ins.impressions)}
                              </Typography>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <Typography level="body-sm">
                                {formatNumber(ins.reach)}
                              </Typography>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <Typography level="body-sm">
                                {ins.frequency.toFixed(2)}
                              </Typography>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <Typography level="body-sm">
                                {formatCurrency(ins.cpm)}
                              </Typography>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <Typography level="body-sm">
                                {formatNumber(ins.clicks)}
                              </Typography>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <Typography level="body-sm" fontWeight="bold">
                                {formatPercent(ins.ctr)}
                              </Typography>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <Typography level="body-sm">
                                {formatCurrency(ins.cpc)}
                              </Typography>
                            </td>
                            {/* === BLOQUE VENTAS === */}
                            {objectiveView === 'ventas' && (
                              <>
                                <td style={{ textAlign: 'right' }}>
                                  <Typography level="body-sm">{formatNumber(ins.landingPageViews || 0)}</Typography>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <Typography level="body-sm">{formatCurrency(ins.costPerLPV || 0)}</Typography>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <Typography level="body-sm">{formatNumber(ins.addToCart || 0)}</Typography>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <Typography level="body-sm">{formatNumber(ins.initiateCheckout || 0)}</Typography>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <Typography level="body-sm" fontWeight="bold">{formatNumber(ins.purchases || 0)}</Typography>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <Typography level="body-sm" fontWeight="bold">{formatCurrency(ins.costPerPurchase || 0)}</Typography>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <Typography level="body-sm">{formatCurrency(ins.conversionValue || 0)}</Typography>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <Typography level="body-sm" fontWeight="bold" sx={{ color: (ins.roas || 0) >= 1 ? 'success.600' : 'danger.600' }}>
                                    {(ins.roas || 0).toFixed(2)}x
                                  </Typography>
                                </td>
                              </>
                            )}
                            {/* === BLOQUE MENSAJES === */}
                            {objectiveView === 'mensajes' && (
                              <>
                                <td style={{ textAlign: 'right' }}>
                                  <Typography level="body-sm" fontWeight="bold">{formatNumber(ins.conversationsStarted || 0)}</Typography>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <Typography level="body-sm" fontWeight="bold">{formatCurrency(ins.costPerConversation || 0)}</Typography>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <Typography level="body-sm" fontWeight="bold">{formatNumber(ins.messagingContacts || 0)}</Typography>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <Typography level="body-sm" fontWeight="bold">{formatCurrency(ins.costPerMessagingContact || 0)}</Typography>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <Typography level="body-sm" fontWeight="bold">{formatNumber(ins.newMessagingConnections || 0)}</Typography>
                                </td>
                              </>
                            )}
                            {/* === BLOQUE LEADS === */}
                            {objectiveView === 'leads' && (
                              <>
                                <td style={{ textAlign: 'right' }}>
                                  <Typography level="body-sm" fontWeight="bold">{formatNumber(ins.leads || 0)}</Typography>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <Typography level="body-sm" fontWeight="bold">{formatCurrency(ins.costPerLead || 0)}</Typography>
                                </td>
                              </>
                            )}
                            {/* === BLOQUE VIDEO === */}
                            {objectiveView === 'video' && (
                              <>
                                <td style={{ textAlign: 'right' }}>
                                  <Typography level="body-sm">{formatNumber(ins.videoPlays || 0)}</Typography>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <Typography level="body-sm" fontWeight="bold">{formatNumber(ins.thruPlays || 0)}</Typography>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <Typography level="body-sm" fontWeight="bold">{formatCurrency(ins.costPerThruPlay || 0)}</Typography>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <Typography level="body-sm">{formatNumber(ins.videoP50 || 0)}</Typography>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <Typography level="body-sm">{formatNumber(ins.videoP95 || 0)}</Typography>
                                </td>
                              </>
                            )}
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </Table>
              </Sheet>

              {/* Paginación */}
              {totalCampaignPages > 1 && (
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Mostrando {((campaignPage - 1) * campaignRowsPerPage) + 1} - {Math.min(campaignPage * campaignRowsPerPage, filteredCampaigns.length)} de {filteredCampaigns.length}
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <IconButton
                      size="sm"
                      variant="outlined"
                      disabled={campaignPage === 1}
                      onClick={() => setCampaignPage(p => p - 1)}
                    >
                      <ArrowLeftIcon />
                    </IconButton>
                    <Typography level="body-sm">
                      Pagina {campaignPage} de {totalCampaignPages}
                    </Typography>
                    <IconButton
                      size="sm"
                      variant="outlined"
                      disabled={campaignPage === totalCampaignPages}
                      onClick={() => setCampaignPage(p => p + 1)}
                    >
                      <ArrowRightIcon />
                    </IconButton>
                  </Stack>
                </Stack>
              )}
            </Stack>
          </CardContent>
        </Card>

        {/* Ads Table */}
        {ads.length > 0 && (
          <Card>
            <CardContent>
              <Stack spacing={2}>
                {/* Header con título y controles */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
                  <Typography level="h4">
                    Anuncios ({filteredAds.length})
                  </Typography>
                  <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                    {/* Buscador */}
                    <Input
                      size="sm"
                      placeholder="Buscar anuncio o campana..."
                      startDecorator={<SearchIcon sx={{ fontSize: 18 }} />}
                      value={adSearch}
                      onChange={(e) => setAdSearch(e.target.value)}
                      sx={{ minWidth: 220 }}
                    />
                    {/* Filtro por estado de campaña padre */}
                    <Select
                      size="sm"
                      value={adStatusFilter}
                      onChange={(_, value) => setAdStatusFilter(value as string)}
                      sx={{ minWidth: 160 }}
                    >
                      <Option value="all">Todas las campanas</Option>
                      <Option value="ACTIVA">Campanas Activas</Option>
                      <Option value="DESACTIVADA">Campanas Desactivadas</Option>
                      <Option value="COMPLETADA">Campanas Completadas</Option>
                      <Option value="NO_HAY_ANUNCIOS">Sin Anuncios</Option>
                    </Select>
                    {/* Filas por página */}
                    <Select
                      size="sm"
                      value={adRowsPerPage.toString()}
                      onChange={(_, value) => setAdRowsPerPage(Number(value))}
                      sx={{ minWidth: 80 }}
                    >
                      <Option value="5">5</Option>
                      <Option value="10">10</Option>
                      <Option value="25">25</Option>
                      <Option value="50">50</Option>
                    </Select>
                  </Stack>
                </Stack>

                {/* Tabla */}
                <Sheet sx={{ overflow: 'auto' }}>
                  <Table>
                    <thead>
                      <tr>
                        <th style={{ width: '20%' }}>Anuncio</th>
                        <th style={{ width: '20%' }}>Campana</th>
                        <th style={{ textAlign: 'right' }}>Impresiones</th>
                        <th style={{ textAlign: 'right' }}>Clics</th>
                        <th style={{ textAlign: 'right' }}>CTR</th>
                        <th style={{ textAlign: 'right' }}>Gasto</th>
                        <th style={{ textAlign: 'right' }}>CPC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedAds.length === 0 ? (
                        <tr>
                          <td colSpan={7}>
                            <Typography level="body-sm" sx={{ textAlign: 'center', py: 4, color: 'text.tertiary' }}>
                              {adSearch || adStatusFilter !== 'all' ? 'No se encontraron anuncios con esos filtros' : 'No hay anuncios para mostrar'}
                            </Typography>
                          </td>
                        </tr>
                      ) : (
                        paginatedAds.map((ad) => (
                          <tr key={ad.id}>
                            <td>
                              <Typography level="body-sm" fontWeight="bold">
                                {ad.name}
                              </Typography>
                            </td>
                            <td>
                              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                {ad.campaign_name}
                              </Typography>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <Typography level="body-sm">
                                {formatNumber(ad.impressions)}
                              </Typography>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <Typography level="body-sm">
                                {formatNumber(ad.clicks)}
                              </Typography>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <Typography level="body-sm" fontWeight="bold">
                                {formatPercent(ad.ctr)}
                              </Typography>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <Typography level="body-sm" fontWeight="bold">
                                {formatCurrency(ad.spend)}
                              </Typography>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <Typography level="body-sm">
                                {formatCurrency(ad.cpc)}
                              </Typography>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </Table>
                </Sheet>

                {/* Paginación */}
                {totalAdPages > 1 && (
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                      Mostrando {((adPage - 1) * adRowsPerPage) + 1} - {Math.min(adPage * adRowsPerPage, filteredAds.length)} de {filteredAds.length}
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <IconButton
                        size="sm"
                        variant="outlined"
                        disabled={adPage === 1}
                        onClick={() => setAdPage(p => p - 1)}
                      >
                        <ArrowLeftIcon />
                      </IconButton>
                      <Typography level="body-sm">
                        Pagina {adPage} de {totalAdPages}
                      </Typography>
                      <IconButton
                        size="sm"
                        variant="outlined"
                        disabled={adPage === totalAdPages}
                        onClick={() => setAdPage(p => p + 1)}
                      >
                        <ArrowRightIcon />
                      </IconButton>
                    </Stack>
                  </Stack>
                )}
              </Stack>
            </CardContent>
          </Card>
        )}

        {/* Trend Chart */}
        {trendData.length > 0 && (
          <Card>
            <CardContent>
              <Typography level="h4" sx={{ mb: 3 }}>
                Tendencia de Metricas
              </Typography>
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
                    formatter={(value: any, name: string) => {
                      const v = Number(value) || 0
                      if (name === 'spend') return [formatCurrency(v), 'Gasto']
                      return [formatNumber(v), name === 'impressions' ? 'Impresiones' : name === 'clicks' ? 'Clics' : name === 'reach' ? 'Alcance' : name]
                    }}
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
            </CardContent>
          </Card>
        )}
      </Stack>
    </Container>
  )
}
