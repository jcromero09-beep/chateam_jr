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
  Button,
  Divider,
  IconButton,
  Tooltip,
  LinearProgress,
  Alert,
  Badge,
  Modal,
  ModalDialog,
  ModalClose,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  Table,
  Sheet,
} from '@mui/joy'
import {
  SmartToy as SmartToyIcon,
  TrendingUp as TrendingUpIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Info as InfoIcon,
  Lightbulb as LightbulbIcon,
  Campaign as CampaignIcon,
  Download as DownloadIcon,
  Psychology as PsychologyIcon,
  Email as EmailIcon,
  WhatsApp as WhatsAppIcon,
  Telegram as TelegramIcon,
  Edit as EditIcon,
  Visibility as VisibilityIcon,
  Delete as DeleteIcon,
  Check as CheckIcon,
  Token as TokenIcon,
  Error as ErrorIcon,
  FilterList as FilterListIcon,
  Close as CloseIcon,
  Search as SearchIcon,
} from '@mui/icons-material'
import api from '../services/api'
import { toast } from 'react-toastify'

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
  objective: string
  daily_budget?: number
  lifetime_budget?: number
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

interface AdsConnection {
  id: number
  name: string
  facebookAdAccountId: string
  facebookBusinessId?: string
  channel: string
}

export default function CampaignsAudit() {
  const [loading, setLoading] = useState(false)
  const [period, setPeriod] = useState('last_30_days')
  const [filter, setFilter] = useState('all')
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([])
  const [campaignScores, setCampaignScores] = useState<CampaignScore[]>([])
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null)
  const [runningAudit, setRunningAudit] = useState(false)

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

  // Estados para conexiones WhatsApp (Facebook)
  const [adsConnections, setAdsConnections] = useState<AdsConnection[]>([])
  const [selectedConnection, setSelectedConnection] = useState<number | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'error'>('checking')
  const [debugMode, setDebugMode] = useState(false)

  // Estados para datos de campañas
  const [campaignsData, setCampaignsData] = useState<FacebookCampaign[]>([])
  const [loadingCampaigns, setLoadingCampaigns] = useState(false)

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

  // Funciones para obtener conexiones
  const fetchAdsConnections = async () => {
    try {
      const response = await api.get('/whatsapp')
      const connections = response.data.whatsapps || response.data || []

      // Filtrar solo conexiones de Facebook con Ad Account ID
      const fbConnections = connections.filter(
        (conn: any) => conn.channel === 'facebook' && conn.facebookAdAccountId
      )

      setAdsConnections(fbConnections)

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
  }, [period, filter, deliveryStatusFilter, dateRange.from, dateRange.to, connectionStatus])

  // Reset page when table filters change
  useEffect(() => {
    setPage(0)
  }, [tableFilters])

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

      // Fetch recommendations and token status
      const [recsResponse, scoresResponse] = await Promise.all([
        api.get(`/campaigns/audit/recommendations?${params.toString()}`),
        api.get(`/campaigns/audit/scores?period=${period}`)
      ])

      setRecommendations(recsResponse.data.recommendations || [])
      setTokenStatus(recsResponse.data.tokenStatus || null)
      setCampaignScores(scoresResponse.data.scores || [])
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

    setLoadingCampaigns(true)
    try {
      const url = debugMode
        ? `/meta-marketing/dashboard?period=${period}`
        : `/meta-marketing/dashboard?period=${period}&whatsappId=${selectedConnection}`
      console.log(`📊 Fetching campaigns data for audit: ${url}`)
      const response = await api.get(url)

      if (response.data.success) {
        setCampaignsData(response.data.campaigns || [])
        return response.data.campaigns || []
      } else {
        toast.error(response.data.message || 'Error al cargar campañas')
        return []
      }
    } catch (err: any) {
      console.error('Error fetching campaigns data:', err)
      toast.error(err.response?.data?.message || 'Error al cargar datos de campañas')
      return []
    } finally {
      setLoadingCampaigns(false)
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
      let campaigns = await fetchCampaignsData()

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
        campaigns: filteredCampaigns // ✅ Solo campañas filtradas
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
        return <WarningIcon sx={{ color: 'warning.main' }} />
      case 'optimization':
        return <TrendingUpIcon sx={{ color: 'success.main' }} />
      case 'opportunity':
        return <LightbulbIcon sx={{ color: 'primary.main' }} />
      case 'insight':
        return <InfoIcon sx={{ color: 'info.main' }} />
      default:
        return <SmartToyIcon />
    }
  }

  const getPriorityColor = (priority: string): 'danger' | 'warning' | 'primary' | 'neutral' => {
    switch (priority) {
      case 'critical':
        return 'danger'
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

  const getScoreColor = (score: number): 'success' | 'primary' | 'warning' | 'danger' => {
    if (score >= 80) return 'success'
    if (score >= 60) return 'primary'
    if (score >= 40) return 'warning'
    return 'danger'
  }

  const getChannelIcon = (channel: string) => {
    switch (channel?.toLowerCase()) {
      case 'whatsapp':
        return <WhatsAppIcon sx={{ color: '#25D366', fontSize: 18 }} />
      case 'email':
        return <EmailIcon sx={{ color: '#0078D4', fontSize: 18 }} />
      case 'telegram':
        return <TelegramIcon sx={{ color: '#0088CC', fontSize: 18 }} />
      default:
        return <CampaignIcon sx={{ fontSize: 18 }} />
    }
  }

  const criticalCount = recommendations.filter((r) => r.priority === 'critical').length
  const highCount = recommendations.filter((r) => r.priority === 'high').length
  const activeCount = recommendations.filter((r) => r.status === 'active').length
  const appliedCount = recommendations.filter((r) => r.status === 'applied').length

  const exportReport = () => {
    console.log('Exporting audit report...')
    toast.info('Exportacion de reporte en desarrollo')
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
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header - Compacto */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ flexWrap: 'wrap', gap: 2 }}>
          {/* Título */}
          <Stack direction="row" spacing={2} alignItems="center">
            <Badge badgeContent={activeCount} color="danger" max={99}>
              <SmartToyIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            </Badge>
            <Box>
              <Typography level="h2">Auditoría con IA</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Recomendaciones inteligentes para optimizar tus campañas
              </Typography>
            </Box>
          </Stack>

          {/* Controles */}
          <Stack direction="row" spacing={1} alignItems="center">
            {/* Token Status */}
            {tokenStatus && (
              <Chip
                startDecorator={<TokenIcon />}
                color={tokenStatus.available ? 'success' : 'danger'}
                variant="soft"
                size="sm"
              >
                {tokenStatus.remaining.toLocaleString()} / {tokenStatus.limit.toLocaleString()}
              </Chip>
            )}

            {/* Período rápido */}
            <Select
              value={period}
              onChange={(_, value) => setPeriod(value as string)}
              size="sm"
              sx={{ minWidth: 140 }}
            >
              <Option value="last_7_days">Últimos 7 días</Option>
              <Option value="last_30_days">Últimos 30 días</Option>
              <Option value="last_90_days">Últimos 90 días</Option>
            </Select>

            {/* Botón de Filtros */}
            <Badge badgeContent={getActiveFiltersCount()} color="primary" size="sm">
              <Button
                startDecorator={<FilterListIcon />}
                variant="outlined"
                color="neutral"
                size="sm"
                onClick={() => setFilterModalOpen(true)}
              >
                Filtros
              </Button>
            </Badge>

            <Button
              startDecorator={<PsychologyIcon />}
              onClick={runAIAudit}
              loading={runningAudit}
              color="primary"
              variant="solid"
              size="sm"
              disabled={tokenStatus ? !tokenStatus.available : false}
            >
              Actualizar
            </Button>

            <Tooltip title="Exportar reporte">
              <IconButton variant="outlined" color="neutral" size="sm" onClick={exportReport}>
                <DownloadIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        {loading && <LinearProgress />}

        {/* Active Filters Summary - Compacto */}
        {getActiveFiltersCount() > 0 && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Filtros:</Typography>

            {filter !== 'all' && (
              <Chip
                size="sm"
                variant="soft"
                color="primary"
                endDecorator={
                  <CloseIcon
                    sx={{ fontSize: 16, cursor: 'pointer' }}
                    onClick={() => setFilter('all')}
                  />
                }
              >
                {filter === 'active' ? 'Activas' : 'Aplicadas'}
              </Chip>
            )}

            {deliveryStatusFilter !== 'all' && (
              <Chip
                size="sm"
                variant="soft"
                color={deliveryStatusFilter === 'ACTIVE' ? 'success' : deliveryStatusFilter === 'PAUSED' ? 'danger' : 'neutral'}
                endDecorator={
                  <CloseIcon
                    sx={{ fontSize: 16, cursor: 'pointer' }}
                    onClick={() => setDeliveryStatusFilter('all')}
                  />
                }
              >
                {deliveryStatusFilter === 'ACTIVE' && '🟢 Activa'}
                {deliveryStatusFilter === 'COMPLETED' && '⚪ Completada'}
                {deliveryStatusFilter === 'PAUSED' && '🔴 Pausada'}
                {deliveryStatusFilter === 'ARCHIVED' && '📦 Archivada'}
                {deliveryStatusFilter === 'WITH_ISSUES' && '⚠️ Con problemas'}
              </Chip>
            )}

            {(dateRange.from || dateRange.to) && (
              <Chip
                size="sm"
                variant="soft"
                color="primary"
                endDecorator={
                  <CloseIcon
                    sx={{ fontSize: 16, cursor: 'pointer' }}
                    onClick={() => setDateRange({ from: null, to: null })}
                  />
                }
              >
                {dateRange.from || '...'} - {dateRange.to || '...'}
              </Chip>
            )}

            {(spendRange.min !== null || spendRange.max !== null) && (
              <Chip
                size="sm"
                variant="soft"
                color="primary"
                endDecorator={
                  <CloseIcon
                    sx={{ fontSize: 16, cursor: 'pointer' }}
                    onClick={() => setSpendRange({ min: null, max: null })}
                  />
                }
              >
                Gasto: ${spendRange.min || 0} - ${spendRange.max || '∞'}
              </Chip>
            )}

            {ctrThreshold.operator !== 'any' && (
              <Chip
                size="sm"
                variant="soft"
                color="primary"
                endDecorator={
                  <CloseIcon
                    sx={{ fontSize: 16, cursor: 'pointer' }}
                    onClick={() => setCtrThreshold({ operator: 'any', value: null })}
                  />
                }
              >
                CTR {ctrThreshold.operator === 'gt' ? '>' : ctrThreshold.operator === 'lt' ? '<' : '='} {ctrThreshold.value}%
              </Chip>
            )}

            {cpcThreshold.operator !== 'any' && (
              <Chip
                size="sm"
                variant="soft"
                color="primary"
                endDecorator={
                  <CloseIcon
                    sx={{ fontSize: 16, cursor: 'pointer' }}
                    onClick={() => setCpcThreshold({ operator: 'any', value: null })}
                  />
                }
              >
                CPC {cpcThreshold.operator === 'gt' ? '>' : cpcThreshold.operator === 'lt' ? '<' : '='} ${cpcThreshold.value}
              </Chip>
            )}

            {impressionsThreshold !== null && (
              <Chip
                size="sm"
                variant="soft"
                color="primary"
                endDecorator={
                  <CloseIcon
                    sx={{ fontSize: 16, cursor: 'pointer' }}
                    onClick={() => setImpressionsThreshold(null)}
                  />
                }
              >
                Impressions ≥ {impressionsThreshold.toLocaleString()}
              </Chip>
            )}

            {objectiveFilter.length > 0 && (
              <Chip
                size="sm"
                variant="soft"
                color="primary"
                endDecorator={
                  <CloseIcon
                    sx={{ fontSize: 16, cursor: 'pointer' }}
                    onClick={() => setObjectiveFilter([])}
                  />
                }
              >
                Objetivos: {objectiveFilter.length}
              </Chip>
            )}

            {campaignNameSearch.trim() !== '' && (
              <Chip
                size="sm"
                variant="soft"
                color="primary"
                endDecorator={
                  <CloseIcon
                    sx={{ fontSize: 16, cursor: 'pointer' }}
                    onClick={() => setCampaignNameSearch('')}
                  />
                }
              >
                Nombre: "{campaignNameSearch}"
              </Chip>
            )}

            <Button
              size="sm"
              variant="plain"
              color="neutral"
              onClick={clearAllFilters}
            >
              Limpiar todos
            </Button>
          </Stack>
        )}

        {/* Alert Summary */}
        <Grid container spacing={2}>
          <Grid xs={12} md={4}>
            <Alert color="danger" variant="soft" startDecorator={<WarningIcon />}>
              <Box>
                <Typography level="title-lg" fontWeight="bold">
                  {criticalCount}
                </Typography>
                <Typography level="body-sm">Recomendaciones Criticas</Typography>
              </Box>
            </Alert>
          </Grid>
          <Grid xs={12} md={4}>
            <Alert color="warning" variant="soft" startDecorator={<TrendingUpIcon />}>
              <Box>
                <Typography level="title-lg" fontWeight="bold">
                  {highCount}
                </Typography>
                <Typography level="body-sm">Oportunidades de Alta Prioridad</Typography>
              </Box>
            </Alert>
          </Grid>
          <Grid xs={12} md={4}>
            <Alert color="success" variant="soft" startDecorator={<CheckCircleIcon />}>
              <Box>
                <Typography level="title-lg" fontWeight="bold">
                  {appliedCount}
                </Typography>
                <Typography level="body-sm">Recomendaciones Aplicadas</Typography>
              </Box>
            </Alert>
          </Grid>
        </Grid>

        {/* Campaign Scores */}
        {campaignScores.length > 0 && (
          <Card>
            <CardContent>
              <Typography level="h4" sx={{ mb: 3 }}>
                Score de Campanas por IA
              </Typography>
              <Grid container spacing={3}>
                {campaignScores.map((campaign) => (
                  <Grid xs={12} md={6} key={campaign.campaignId}>
                    <Card variant="outlined">
                      <CardContent>
                        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            {getChannelIcon(campaign.channel)}
                            <Typography level="title-md">{campaign.campaignName}</Typography>
                          </Stack>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Box
                              sx={{
                                width: 60,
                                height: 60,
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                bgcolor: `${getScoreColor(campaign.overallScore)}.softBg`,
                                border: '3px solid',
                                borderColor: `${getScoreColor(campaign.overallScore)}.outlinedBorder`,
                              }}
                            >
                              <Typography level="h3" sx={{ color: `${getScoreColor(campaign.overallScore)}.main` }}>
                                {campaign.overallScore}
                              </Typography>
                            </Box>
                            <Chip size="sm" color="primary" variant="soft">
                              {campaign.recommendations} tips
                            </Chip>
                          </Stack>
                        </Stack>

                        <Divider sx={{ my: 2 }} />

                        <Grid container spacing={1}>
                          <Grid xs={6}>
                            <Box>
                              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                Contenido
                              </Typography>
                              <LinearProgress
                                determinate
                                value={campaign.contentScore}
                                color={getScoreColor(campaign.contentScore)}
                                sx={{ mt: 0.5 }}
                              />
                              <Typography level="body-xs" fontWeight="bold">
                                {campaign.contentScore}/100
                              </Typography>
                            </Box>
                          </Grid>
                          <Grid xs={6}>
                            <Box>
                              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                Timing
                              </Typography>
                              <LinearProgress
                                determinate
                                value={campaign.timingScore}
                                color={getScoreColor(campaign.timingScore)}
                                sx={{ mt: 0.5 }}
                              />
                              <Typography level="body-xs" fontWeight="bold">
                                {campaign.timingScore}/100
                              </Typography>
                            </Box>
                          </Grid>
                          <Grid xs={6}>
                            <Box>
                              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                Audiencia
                              </Typography>
                              <LinearProgress
                                determinate
                                value={campaign.audienceScore}
                                color={getScoreColor(campaign.audienceScore)}
                                sx={{ mt: 0.5 }}
                              />
                              <Typography level="body-xs" fontWeight="bold">
                                {campaign.audienceScore}/100
                              </Typography>
                            </Box>
                          </Grid>
                          <Grid xs={6}>
                            <Box>
                              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                Performance
                              </Typography>
                              <LinearProgress
                                determinate
                                value={campaign.performanceScore}
                                color={getScoreColor(campaign.performanceScore)}
                                sx={{ mt: 0.5 }}
                              />
                              <Typography level="body-xs" fontWeight="bold">
                                {campaign.performanceScore}/100
                              </Typography>
                            </Box>
                          </Grid>
                        </Grid>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        )}

        {/* Recommendations Table */}
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography level="h4">
                Recomendaciones ({recommendations.length})
              </Typography>
              <Select
                size="sm"
                value={rowsPerPage}
                onChange={(_, value) => {
                  setRowsPerPage(value as number)
                  setPage(0)
                }}
                sx={{ minWidth: 100 }}
              >
                <Option value={5}>5 / página</Option>
                <Option value={10}>10 / página</Option>
                <Option value={25}>25 / página</Option>
                <Option value={50}>50 / página</Option>
              </Select>
            </Stack>

            {/* Table Filters Bar */}
            <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap' }}>
              <Input
                size="sm"
                placeholder="Buscar título o campaña..."
                value={tableFilters.searchText}
                onChange={(e) => setTableFilters({...tableFilters, searchText: e.target.value})}
                startDecorator={<SearchIcon />}
                sx={{ minWidth: 300 }}
              />

              <Select
                size="sm"
                placeholder="Prioridad"
                multiple
                value={tableFilters.priorityFilter}
                onChange={(_, value) => setTableFilters({...tableFilters, priorityFilter: value as string[]})}
                sx={{ minWidth: 140 }}
              >
                <Option value="critical">Crítica</Option>
                <Option value="high">Alta</Option>
                <Option value="medium">Media</Option>
                <Option value="low">Baja</Option>
              </Select>

              <Select
                size="sm"
                placeholder="Tipo"
                multiple
                value={tableFilters.typeFilter}
                onChange={(_, value) => setTableFilters({...tableFilters, typeFilter: value as string[]})}
                sx={{ minWidth: 140 }}
              >
                <Option value="warning">Alerta</Option>
                <Option value="optimization">Optimización</Option>
                <Option value="opportunity">Oportunidad</Option>
                <Option value="insight">Insight</Option>
              </Select>

              <Select
                size="sm"
                placeholder="Categoría"
                multiple
                value={tableFilters.categoryFilter}
                onChange={(_, value) => setTableFilters({...tableFilters, categoryFilter: value as string[]})}
                sx={{ minWidth: 140 }}
              >
                <Option value="timing">Tiempo</Option>
                <Option value="content">Contenido</Option>
                <Option value="segmentation">Segmentación</Option>
                <Option value="budget">Presupuesto</Option>
                <Option value="channel">Canal</Option>
              </Select>

              <Select
                size="sm"
                placeholder="Estado"
                multiple
                value={tableFilters.statusFilter}
                onChange={(_, value) => setTableFilters({...tableFilters, statusFilter: value as string[]})}
                sx={{ minWidth: 120 }}
              >
                <Option value="active">Activa</Option>
                <Option value="applied">Aplicada</Option>
                <Option value="dismissed">Descartada</Option>
              </Select>

              {/* Clear table filters button */}
              {(tableFilters.searchText ||
                tableFilters.priorityFilter.length > 0 ||
                tableFilters.typeFilter.length > 0 ||
                tableFilters.categoryFilter.length > 0 ||
                tableFilters.statusFilter.length > 0) && (
                <Button
                  size="sm"
                  variant="outlined"
                  color="neutral"
                  onClick={() => setTableFilters({
                    searchText: '',
                    priorityFilter: [],
                    typeFilter: [],
                    categoryFilter: [],
                    statusFilter: []
                  })}
                >
                  Limpiar filtros
                </Button>
              )}
            </Stack>

            {recommendations.length === 0 && !loading ? (
              <Alert color="neutral" variant="soft">
                <Stack direction="row" spacing={2} alignItems="center">
                  <SmartToyIcon />
                  <Box>
                    <Typography level="title-sm">No hay recomendaciones con estos filtros</Typography>
                    <Typography level="body-sm">
                      {(deliveryStatusFilter !== 'all' || dateRange.from || dateRange.to)
                        ? 'Intenta ajustar los filtros de fecha o estado de campaña'
                        : 'Haz clic en "Actualizar" para generar análisis con IA'}
                    </Typography>
                  </Box>
                </Stack>
              </Alert>
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
                      <Sheet variant="outlined" sx={{ borderRadius: 'sm', overflow: 'auto' }}>
                        <Table
                          stickyHeader
                          hoverRow
                          sx={{
                            '& thead th': {
                              bgcolor: 'background.surface',
                              fontWeight: 'bold',
                            },
                          }}
                        >
                          <thead>
                            <tr>
                              <th style={{ width: 100 }}>Estado</th>
                              <th style={{ width: 100 }}>Prioridad</th>
                              <th style={{ width: 120 }}>Tipo</th>
                              <th style={{ minWidth: 200 }}>Título</th>
                              <th style={{ minWidth: 150 }}>Campaña</th>
                              <th style={{ width: 120 }}>Categoría</th>
                              <th style={{ width: 120 }}>Fecha Creación</th>
                              <th style={{ width: 180 }}>Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredRecommendations
                              .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                              .map((recommendation) => (
                          <tr key={recommendation.id}>
                            {/* Estado */}
                            <td>
                              <Chip
                                size="sm"
                                variant="soft"
                                color={recommendation.status === 'applied' ? 'success' : recommendation.status === 'active' ? 'primary' : 'neutral'}
                                startDecorator={recommendation.status === 'applied' ? <CheckIcon /> : null}
                              >
                                {recommendation.status === 'active' ? 'Activa' : recommendation.status === 'applied' ? 'Aplicada' : 'Descartada'}
                              </Chip>
                            </td>

                            {/* Prioridad */}
                            <td>
                              <Chip
                                size="sm"
                                variant="soft"
                                color={getPriorityColor(recommendation.priority)}
                              >
                                {recommendation.priority === 'critical' ? 'Crítica' :
                                 recommendation.priority === 'high' ? 'Alta' :
                                 recommendation.priority === 'medium' ? 'Media' : 'Baja'}
                              </Chip>
                            </td>

                            {/* Tipo */}
                            <td>
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Box sx={{ display: 'flex' }}>{getTypeIcon(recommendation.type)}</Box>
                                <Typography level="body-sm">
                                  {recommendation.type === 'optimization' ? 'Optimización' :
                                   recommendation.type === 'warning' ? 'Alerta' :
                                   recommendation.type === 'opportunity' ? 'Oportunidad' : 'Insight'}
                                </Typography>
                              </Stack>
                            </td>

                            {/* Título */}
                            <td>
                              <Tooltip title={recommendation.description}>
                                <Typography level="body-sm" sx={{ fontWeight: 'md' }}>
                                  {recommendation.title}
                                </Typography>
                              </Tooltip>
                            </td>

                            {/* Campaña */}
                            <td>
                              <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                                {recommendation.campaignName}
                              </Typography>
                            </td>

                            {/* Categoría */}
                            <td>
                              <Chip size="sm" variant="outlined">
                                {recommendation.category === 'timing' ? 'Tiempo' :
                                 recommendation.category === 'content' ? 'Contenido' :
                                 recommendation.category === 'segmentation' ? 'Segmentación' :
                                 recommendation.category === 'budget' ? 'Presupuesto' : 'Canal'}
                              </Chip>
                            </td>

                            {/* Fecha Creación */}
                            <td>
                              <Typography level="body-xs">
                                {new Date(recommendation.createdAt).toLocaleDateString('es-ES', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric'
                                })}
                              </Typography>
                            </td>

                            {/* Acciones */}
                            <td>
                              <Stack direction="row" spacing={0.5}>
                                <Tooltip title="Ver detalles">
                                  <IconButton
                                    size="sm"
                                    variant="plain"
                                    color="neutral"
                                    onClick={() => openDetailModal(recommendation)}
                                  >
                                    <VisibilityIcon />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Editar">
                                  <IconButton
                                    size="sm"
                                    variant="plain"
                                    color="neutral"
                                    onClick={() => openEditModal(recommendation)}
                                  >
                                    <EditIcon />
                                  </IconButton>
                                </Tooltip>
                                {recommendation.status === 'active' && (
                                  <Tooltip title="Aplicar">
                                    <IconButton
                                      size="sm"
                                      variant="plain"
                                      color="primary"
                                      onClick={() => handleApplyRecommendation(recommendation)}
                                    >
                                      <CheckIcon />
                                    </IconButton>
                                  </Tooltip>
                                )}
                                <Tooltip title="Eliminar">
                                  <IconButton
                                    size="sm"
                                    variant="plain"
                                    color="danger"
                                    onClick={() => openDeleteModal(recommendation)}
                                  >
                                    <DeleteIcon />
                                  </IconButton>
                                </Tooltip>
                              </Stack>
                            </td>
                          </tr>
                        ))}
                          </tbody>
                        </Table>
                      </Sheet>

                      {/* Paginación */}
                      <Stack
                        direction="row"
                        spacing={2}
                        alignItems="center"
                        justifyContent="space-between"
                        sx={{ mt: 2 }}
                      >
                        <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                          Mostrando {page * rowsPerPage + 1} a{' '}
                          {Math.min((page + 1) * rowsPerPage, filteredRecommendations.length)} de{' '}
                          {filteredRecommendations.length} recomendaciones
                          {filteredRecommendations.length < recommendations.length && (
                            <span> (filtradas de {recommendations.length} totales)</span>
                          )}
                        </Typography>
                        <Stack direction="row" spacing={1}>
                          <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            disabled={page === 0}
                            onClick={() => setPage(page - 1)}
                          >
                            Anterior
                          </Button>
                          <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            disabled={page >= Math.ceil(filteredRecommendations.length / rowsPerPage) - 1}
                            onClick={() => setPage(page + 1)}
                          >
                            Siguiente
                          </Button>
                        </Stack>
                      </Stack>
                    </>
                  )
                })()}
              </>
            ) : null}
          </CardContent>
        </Card>
      </Stack>

      {/* Detail Modal */}
      <Modal open={detailModalOpen} onClose={() => setDetailModalOpen(false)}>
        <ModalDialog sx={{ maxWidth: 600 }}>
          <ModalClose />
          <Typography level="h4">Detalle de Recomendacion</Typography>
          {selectedRecommendation && (
            <Stack spacing={2} sx={{ mt: 2 }}>
              <Box>
                <Typography level="title-sm" sx={{ color: 'text.tertiary' }}>Titulo</Typography>
                <Typography>{selectedRecommendation.title}</Typography>
              </Box>
              <Box>
                <Typography level="title-sm" sx={{ color: 'text.tertiary' }}>Campana</Typography>
                <Typography>{selectedRecommendation.campaignName}</Typography>
              </Box>
              <Box>
                <Typography level="title-sm" sx={{ color: 'text.tertiary' }}>Descripcion</Typography>
                <Typography>{selectedRecommendation.description}</Typography>
              </Box>
              <Grid container spacing={2}>
                <Grid xs={6}>
                  <Typography level="title-sm" sx={{ color: 'text.tertiary' }}>Impacto</Typography>
                  <Typography>{selectedRecommendation.impact}</Typography>
                </Grid>
                <Grid xs={6}>
                  <Typography level="title-sm" sx={{ color: 'text.tertiary' }}>Esfuerzo</Typography>
                  <Typography>{selectedRecommendation.effort}</Typography>
                </Grid>
              </Grid>
              <Box>
                <Typography level="title-sm" sx={{ color: 'success.main' }}>Ganancia Potencial</Typography>
                <Typography sx={{ color: 'success.main', fontWeight: 'bold' }}>{selectedRecommendation.potentialGain}</Typography>
              </Box>
              {selectedRecommendation.actionData && (
                <Box>
                  <Typography level="title-sm" sx={{ color: 'text.tertiary' }}>Datos de Accion</Typography>
                  <pre style={{ fontSize: 12, background: '#f5f5f5', padding: 8, borderRadius: 4 }}>
                    {JSON.stringify(selectedRecommendation.actionData, null, 2)}
                  </pre>
                </Box>
              )}
              <Divider />
              <Stack direction="row" spacing={2} justifyContent="flex-end">
                <Button variant="outlined" color="neutral" onClick={() => setDetailModalOpen(false)}>
                  Cerrar
                </Button>
                {selectedRecommendation.status === 'active' && (
                  <Button
                    variant="solid"
                    color="primary"
                    startDecorator={<CheckIcon />}
                    onClick={() => handleApplyRecommendation(selectedRecommendation)}
                  >
                    Marcar como Aplicada
                  </Button>
                )}
              </Stack>
            </Stack>
          )}
        </ModalDialog>
      </Modal>

      {/* Edit Modal */}
      <Modal open={editModalOpen} onClose={() => setEditModalOpen(false)}>
        <ModalDialog sx={{ maxWidth: 600 }}>
          <ModalClose />
          <Typography level="h4">Editar Recomendacion</Typography>
          <Stack spacing={2} sx={{ mt: 2 }}>
            <FormControl>
              <FormLabel>Titulo</FormLabel>
              <Input
                value={editForm.title || ''}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Descripcion</FormLabel>
              <Textarea
                minRows={3}
                value={editForm.description || ''}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              />
            </FormControl>
            <Grid container spacing={2}>
              <Grid xs={6}>
                <FormControl>
                  <FormLabel>Impacto</FormLabel>
                  <Input
                    value={editForm.impact || ''}
                    onChange={(e) => setEditForm({ ...editForm, impact: e.target.value })}
                  />
                </FormControl>
              </Grid>
              <Grid xs={6}>
                <FormControl>
                  <FormLabel>Esfuerzo</FormLabel>
                  <Input
                    value={editForm.effort || ''}
                    onChange={(e) => setEditForm({ ...editForm, effort: e.target.value })}
                  />
                </FormControl>
              </Grid>
            </Grid>
            <FormControl>
              <FormLabel>Ganancia Potencial</FormLabel>
              <Input
                value={editForm.potentialGain || ''}
                onChange={(e) => setEditForm({ ...editForm, potentialGain: e.target.value })}
              />
            </FormControl>
            <Grid container spacing={2}>
              <Grid xs={6}>
                <FormControl>
                  <FormLabel>Prioridad</FormLabel>
                  <Select
                    value={editForm.priority}
                    onChange={(_, value) => setEditForm({ ...editForm, priority: value as any })}
                  >
                    <Option value="critical">Critica</Option>
                    <Option value="high">Alta</Option>
                    <Option value="medium">Media</Option>
                    <Option value="low">Baja</Option>
                  </Select>
                </FormControl>
              </Grid>
              <Grid xs={6}>
                <FormControl>
                  <FormLabel>Categoria</FormLabel>
                  <Select
                    value={editForm.category}
                    onChange={(_, value) => setEditForm({ ...editForm, category: value as any })}
                  >
                    <Option value="timing">Timing</Option>
                    <Option value="content">Contenido</Option>
                    <Option value="segmentation">Segmentacion</Option>
                    <Option value="budget">Presupuesto</Option>
                    <Option value="channel">Canal</Option>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            <Divider />
            <Stack direction="row" spacing={2} justifyContent="flex-end">
              <Button variant="outlined" color="neutral" onClick={() => setEditModalOpen(false)}>
                Cancelar
              </Button>
              <Button variant="solid" color="primary" onClick={handleEditRecommendation}>
                Guardar Cambios
              </Button>
            </Stack>
          </Stack>
        </ModalDialog>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={deleteModalOpen} onClose={() => setDeleteModalOpen(false)}>
        <ModalDialog>
          <ModalClose />
          <Typography level="h4" color="danger">Descartar Recomendacion</Typography>
          <Typography sx={{ mt: 2 }}>
            Esta accion eliminara permanentemente la recomendacion. Esta seguro?
          </Typography>
          {selectedRecommendation && (
            <Typography level="body-sm" sx={{ mt: 1, color: 'text.tertiary' }}>
              "{selectedRecommendation.title}"
            </Typography>
          )}
          <Stack direction="row" spacing={2} justifyContent="flex-end" sx={{ mt: 3 }}>
            <Button variant="outlined" color="neutral" onClick={() => setDeleteModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="solid" color="danger" onClick={handleDismissRecommendation}>
              Eliminar Permanentemente
            </Button>
          </Stack>
        </ModalDialog>
      </Modal>

      {/* Filters Modal */}
      <Modal open={filterModalOpen} onClose={() => setFilterModalOpen(false)}>
        <ModalDialog sx={{ minWidth: 500, maxWidth: 600 }}>
          <ModalClose />
          <Typography level="h4" startDecorator={<FilterListIcon />}>
            Filtros de Auditoría
          </Typography>

          <Divider sx={{ my: 2 }} />

          <Stack spacing={3}>
            {/* Estado de Recomendación */}
            <FormControl>
              <FormLabel>Estado de Recomendación</FormLabel>
              <Select
                value={filter}
                onChange={(_, value) => setFilter(value as string)}
              >
                <Option value="all">Todas</Option>
                <Option value="active">Activas</Option>
                <Option value="applied">Aplicadas</Option>
              </Select>
            </FormControl>

            {/* Estado de Entrega de Campaña (effective_status de Meta) */}
            <FormControl>
              <FormLabel>Estado de Entrega (Ads Manager)</FormLabel>
              <Select
                value={deliveryStatusFilter}
                onChange={(_, value) => setDeliveryStatusFilter(value as string)}
              >
                <Option value="all">Todos los estados</Option>
                <Option value="ACTIVE">🟢 Activa (entregando)</Option>
                <Option value="COMPLETED">⚪ Completada</Option>
                <Option value="PAUSED">🔴 Pausada</Option>
                <Option value="ARCHIVED">📦 Archivada</Option>
                <Option value="WITH_ISSUES">⚠️ Con problemas</Option>
              </Select>
              <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                Usa "Activa" para ver solo campañas que realmente están entregando
              </Typography>
            </FormControl>

            {/* Rango de Fechas */}
            <Box>
              <FormLabel sx={{ mb: 1 }}>Rango de Fechas</FormLabel>
              <Grid container spacing={2}>
                <Grid xs={6}>
                  <FormControl>
                    <FormLabel>Desde</FormLabel>
                    <Input
                      type="date"
                      value={dateRange.from || ''}
                      onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                      slotProps={{
                        input: {
                          max: dateRange.to || undefined
                        }
                      }}
                    />
                  </FormControl>
                </Grid>
                <Grid xs={6}>
                  <FormControl>
                    <FormLabel>Hasta</FormLabel>
                    <Input
                      type="date"
                      value={dateRange.to || ''}
                      onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                      slotProps={{
                        input: {
                          min: dateRange.from || undefined
                        }
                      }}
                    />
                  </FormControl>
                </Grid>
              </Grid>
              {(dateRange.from || dateRange.to) && (
                <Button
                  size="sm"
                  variant="plain"
                  color="neutral"
                  onClick={() => setDateRange({ from: null, to: null })}
                  sx={{ mt: 1 }}
                >
                  Limpiar fechas
                </Button>
              )}
            </Box>

            <Divider />

            {/* Filtros Avanzados de Campañas */}
            <Typography level="title-md" startDecorator={<CampaignIcon />}>
              Filtros Avanzados de Campañas
            </Typography>

            {/* Rango de Gasto */}
            <Box>
              <FormLabel sx={{ mb: 1 }}>Rango de Gasto ($)</FormLabel>
              <Grid container spacing={2}>
                <Grid xs={6}>
                  <FormControl>
                    <FormLabel>Mínimo</FormLabel>
                    <Input
                      type="number"
                      placeholder="0"
                      value={spendRange.min || ''}
                      onChange={(e) => setSpendRange({ ...spendRange, min: e.target.value ? Number(e.target.value) : null })}
                      startDecorator="$"
                    />
                  </FormControl>
                </Grid>
                <Grid xs={6}>
                  <FormControl>
                    <FormLabel>Máximo</FormLabel>
                    <Input
                      type="number"
                      placeholder="∞"
                      value={spendRange.max || ''}
                      onChange={(e) => setSpendRange({ ...spendRange, max: e.target.value ? Number(e.target.value) : null })}
                      startDecorator="$"
                    />
                  </FormControl>
                </Grid>
              </Grid>
            </Box>

            {/* CTR Threshold */}
            <Box>
              <FormLabel sx={{ mb: 1 }}>CTR (Click-Through Rate) %</FormLabel>
              <Grid container spacing={2}>
                <Grid xs={4}>
                  <FormControl>
                    <Select
                      value={ctrThreshold.operator}
                      onChange={(_, value) => setCtrThreshold({ ...ctrThreshold, operator: value as any })}
                    >
                      <Option value="any">Cualquiera</Option>
                      <Option value="gt">Mayor que</Option>
                      <Option value="lt">Menor que</Option>
                      <Option value="eq">Igual a</Option>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid xs={8}>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="Ej: 2.5"
                      value={ctrThreshold.value || ''}
                      onChange={(e) => setCtrThreshold({ ...ctrThreshold, value: e.target.value ? Number(e.target.value) : null })}
                      endDecorator="%"
                      disabled={ctrThreshold.operator === 'any'}
                      slotProps={{
                        input: {
                          step: 0.01
                        }
                      }}
                    />
                  </FormControl>
                </Grid>
              </Grid>
            </Box>

            {/* CPC Threshold */}
            <Box>
              <FormLabel sx={{ mb: 1 }}>CPC (Cost Per Click) $</FormLabel>
              <Grid container spacing={2}>
                <Grid xs={4}>
                  <FormControl>
                    <Select
                      value={cpcThreshold.operator}
                      onChange={(_, value) => setCpcThreshold({ ...cpcThreshold, operator: value as any })}
                    >
                      <Option value="any">Cualquiera</Option>
                      <Option value="gt">Mayor que</Option>
                      <Option value="lt">Menor que</Option>
                      <Option value="eq">Igual a</Option>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid xs={8}>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="Ej: 1.50"
                      value={cpcThreshold.value || ''}
                      onChange={(e) => setCpcThreshold({ ...cpcThreshold, value: e.target.value ? Number(e.target.value) : null })}
                      startDecorator="$"
                      disabled={cpcThreshold.operator === 'any'}
                      slotProps={{
                        input: {
                          step: 0.01
                        }
                      }}
                    />
                  </FormControl>
                </Grid>
              </Grid>
            </Box>

            {/* Impressions Threshold */}
            <FormControl>
              <FormLabel>Impresiones Mínimas</FormLabel>
              <Input
                type="number"
                placeholder="Ej: 10000"
                value={impressionsThreshold || ''}
                onChange={(e) => setImpressionsThreshold(e.target.value ? Number(e.target.value) : null)}
              />
            </FormControl>

            {/* Objective Filter */}
            <FormControl>
              <FormLabel>Objetivo de Campaña</FormLabel>
              <Select
                multiple
                placeholder="Seleccionar objetivos..."
                value={objectiveFilter}
                onChange={(_, value) => setObjectiveFilter(value as string[])}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {selected.map((option) => (
                      <Chip key={option.value} size="sm" variant="soft">
                        {option.label}
                      </Chip>
                    ))}
                  </Box>
                )}
              >
                <Option value="CONVERSIONS">Conversiones</Option>
                <Option value="TRAFFIC">Tráfico</Option>
                <Option value="AWARENESS">Reconocimiento</Option>
                <Option value="ENGAGEMENT">Interacción</Option>
                <Option value="APP_INSTALLS">Instalaciones de App</Option>
                <Option value="LEAD_GENERATION">Generación de Leads</Option>
                <Option value="MESSAGES">Mensajes</Option>
                <Option value="SALES">Ventas</Option>
              </Select>
            </FormControl>

            {/* Campaign Name Search */}
            <FormControl>
              <FormLabel>Buscar por Nombre de Campaña</FormLabel>
              <Input
                placeholder="Ej: Black Friday, Navidad..."
                value={campaignNameSearch}
                onChange={(e) => setCampaignNameSearch(e.target.value)}
                startDecorator={<SearchIcon />}
              />
            </FormControl>

            <Divider />

            {/* Acciones */}
            <Stack direction="row" spacing={2} justifyContent="space-between">
              <Button
                variant="outlined"
                color="neutral"
                onClick={clearAllFilters}
                disabled={getActiveFiltersCount() === 0}
              >
                Limpiar todos
              </Button>
              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  color="neutral"
                  onClick={() => setFilterModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  variant="solid"
                  color="primary"
                  onClick={() => setFilterModalOpen(false)}
                >
                  Aplicar Filtros
                </Button>
              </Stack>
            </Stack>
          </Stack>
        </ModalDialog>
      </Modal>
    </Container>
  )
}
