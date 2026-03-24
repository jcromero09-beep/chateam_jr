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
  Button as _Button,
  Divider,
  RadioGroup as _RadioGroup,
  Radio as _Radio,
  IconButton,
  Tooltip,
  LinearProgress,
} from '@mui/joy'
import {
  Attribution as AttributionIcon,
  TrendingUp as TrendingUpIcon,
  TouchApp as TouchAppIcon,
  Timeline as TimelineIcon,
  Analytics as AnalyticsIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  Email as EmailIcon,
  WhatsApp as WhatsAppIcon,
  Telegram as TelegramIcon,
  Facebook as FacebookIcon,
  Campaign as CampaignIcon,
  ShoppingCart as ShoppingCartIcon,
} from '@mui/icons-material'
import {
  Sankey as _Sankey,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  LineChart as _LineChart,
  Line as _Line,
} from 'recharts'
import api from '../services/api'
import { toast } from 'react-toastify'

interface TouchPoint {
  id: number
  channel: string
  campaign: string
  timestamp: string
  action: string
  position: number
}

interface AttributionModel {
  model: string
  label: string
  description: string
}

interface ChannelAttribution {
  channel: string
  firstTouch: number
  lastTouch: number
  linear: number
  timeDecay: number
  positionBased: number
  datadriven: number
  conversions: number
  revenue: number
}

interface CustomerJourney {
  id: number
  customerId: string
  customerName: string
  touchPoints: TouchPoint[]
  converted: boolean
  revenue: number
  duration: number
}

interface AttributionMetrics {
  avgTouchpoints: number
  multiTouchPercentage: number
  avgConversionTimeHours: number
  totalConversions: number
  totalRevenue: number
}

export default function CampaignsAttribution() {
  const [loading, setLoading] = useState(false)
  const [attributionModel, setAttributionModel] = useState('datadriven')
  const [period, setPeriod] = useState('30days')
  // Fixed datadriven property name throughout the file
  const [channelAttribution, setChannelAttribution] = useState<ChannelAttribution[]>([])
  const [customerJourneys, setCustomerJourneys] = useState<CustomerJourney[]>([])
  const [sankeyData, setSankeyData] = useState<any>(null)
  const [metrics, setMetrics] = useState<AttributionMetrics>({
    avgTouchpoints: 2.4,
    multiTouchPercentage: 35,
    avgConversionTimeHours: 48,
    totalConversions: 0,
    totalRevenue: 0
  })
  // Suppress unused warning for sankeyData
  void sankeyData

  const attributionModels: AttributionModel[] = [
    {
      model: 'firsttouch',
      label: 'First Touch',
      description: '100% del crédito al primer punto de contacto',
    },
    {
      model: 'lasttouch',
      label: 'Last Touch',
      description: '100% del crédito al último punto de contacto',
    },
    {
      model: 'linear',
      label: 'Linear',
      description: 'Crédito igual distribuido entre todos los touchpoints',
    },
    {
      model: 'timedecay',
      label: 'Time Decay',
      description: 'Más crédito a touchpoints más cercanos a la conversión',
    },
    {
      model: 'positionbased',
      label: 'Position Based (U-Shaped)',
      description: '40% primer y último touchpoint, 20% resto',
    },
    {
      model: 'datadriven',
      label: 'Data-Driven (IA)',
      description: 'Modelo basado en machine learning y datos históricos',
    },
  ]

  useEffect(() => {
    fetchAttributionData()
  }, [period, attributionModel])

  const fetchAttributionData = async () => {
    setLoading(true)
    try {
      // Map frontend model names to backend model names
      const modelMap: Record<string, string> = {
        'firsttouch': 'first_touch',
        'lasttouch': 'last_touch',
        'linear': 'linear',
        'timedecay': 'time_decay',
        'positionbased': 'position_based',
        'datadriven': 'data_driven'
      }

      const backendModel = modelMap[attributionModel] || 'time_decay'

      const response = await api.get('/attribution/dashboard', {
        params: {
          period,
          model: backendModel
        }
      })

      if (response.data) {
        // Update state with real data
        if (response.data.channels && response.data.channels.length > 0) {
          setChannelAttribution(response.data.channels)
        } else {
          // Use mock data as fallback if no real data
          setChannelAttribution(mockChannelAttribution)
        }

        if (response.data.journeys && response.data.journeys.length > 0) {
          setCustomerJourneys(response.data.journeys)
        } else {
          setCustomerJourneys(mockCustomerJourneys)
        }

        if (response.data.metrics) {
          setMetrics(response.data.metrics)
        }

        setSankeyData(mockSankeyData)
      }
    } catch (error: any) {
      console.error('Error fetching attribution data:', error)
      // Use mock data on error
      setChannelAttribution(mockChannelAttribution)
      setCustomerJourneys(mockCustomerJourneys)
      setSankeyData(mockSankeyData)

      if (error.response?.status !== 401) {
        toast.error('Error al cargar datos de atribución. Mostrando datos de ejemplo.')
      }
    } finally {
      setLoading(false)
    }
  }

  // Mock data
  const mockChannelAttribution: ChannelAttribution[] = [
    {
      channel: 'WhatsApp',
      firstTouch: 45,
      lastTouch: 78,
      linear: 62,
      timeDecay: 68,
      positionBased: 65,
      datadriven: 72,
      conversions: 289,
      revenue: 86700,
    },
    {
      channel: 'Email',
      firstTouch: 120,
      lastTouch: 32,
      linear: 68,
      timeDecay: 45,
      positionBased: 58,
      datadriven: 52,
      conversions: 156,
      revenue: 31200,
    },
    {
      channel: 'Telegram',
      firstTouch: 28,
      lastTouch: 56,
      linear: 42,
      timeDecay: 48,
      positionBased: 45,
      datadriven: 58,
      conversions: 184,
      revenue: 55200,
    },
    {
      channel: 'Facebook',
      firstTouch: 85,
      lastTouch: 45,
      linear: 58,
      timeDecay: 52,
      positionBased: 62,
      datadriven: 68,
      conversions: 217,
      revenue: 65100,
    },
    {
      channel: 'Google Ads',
      firstTouch: 142,
      lastTouch: 89,
      linear: 105,
      timeDecay: 98,
      positionBased: 112,
      datadriven: 124,
      conversions: 356,
      revenue: 142400,
    },
    {
      channel: 'Organic Search',
      firstTouch: 98,
      lastTouch: 42,
      linear: 65,
      timeDecay: 55,
      positionBased: 68,
      datadriven: 62,
      conversions: 198,
      revenue: 39600,
    },
  ]

  const mockCustomerJourneys: CustomerJourney[] = [
    {
      id: 1,
      customerId: 'C001',
      customerName: 'María González',
      touchPoints: [
        { id: 1, channel: 'email', campaign: 'Newsletter', timestamp: '2025-01-01T10:00:00', action: 'opened', position: 1 },
        { id: 2, channel: 'facebook', campaign: 'Retargeting', timestamp: '2025-01-02T15:30:00', action: 'clicked', position: 2 },
        { id: 3, channel: 'whatsapp', campaign: 'Follow-up', timestamp: '2025-01-03T09:15:00', action: 'replied', position: 3 },
        { id: 4, channel: 'whatsapp', campaign: 'Offer', timestamp: '2025-01-03T18:45:00', action: 'converted', position: 4 },
      ],
      converted: true,
      revenue: 450,
      duration: 2.5,
    },
    {
      id: 2,
      customerId: 'C002',
      customerName: 'Carlos Martínez',
      touchPoints: [
        { id: 5, channel: 'google', campaign: 'Search Ads', timestamp: '2025-01-05T11:20:00', action: 'clicked', position: 1 },
        { id: 6, channel: 'email', campaign: 'Welcome', timestamp: '2025-01-05T12:00:00', action: 'opened', position: 2 },
        { id: 7, channel: 'email', campaign: 'Promotion', timestamp: '2025-01-06T10:30:00', action: 'clicked', position: 3 },
        { id: 8, channel: 'telegram', campaign: 'Support', timestamp: '2025-01-07T14:15:00', action: 'converted', position: 4 },
      ],
      converted: true,
      revenue: 780,
      duration: 2.1,
    },
    {
      id: 3,
      customerId: 'C003',
      customerName: 'Ana López',
      touchPoints: [
        { id: 9, channel: 'facebook', campaign: 'Brand Awareness', timestamp: '2025-01-08T09:00:00', action: 'viewed', position: 1 },
        { id: 10, channel: 'whatsapp', campaign: 'Initial Contact', timestamp: '2025-01-08T16:30:00', action: 'replied', position: 2 },
        { id: 11, channel: 'whatsapp', campaign: 'Quote', timestamp: '2025-01-09T11:00:00', action: 'converted', position: 3 },
      ],
      converted: true,
      revenue: 1200,
      duration: 1.1,
    },
    {
      id: 4,
      customerId: 'C004',
      customerName: 'Pedro Sánchez',
      touchPoints: [
        { id: 12, channel: 'organic', campaign: 'Blog Post', timestamp: '2025-01-10T08:45:00', action: 'viewed', position: 1 },
        { id: 13, channel: 'email', campaign: 'Lead Magnet', timestamp: '2025-01-10T09:30:00', action: 'opened', position: 2 },
        { id: 14, channel: 'telegram', campaign: 'Demo Invite', timestamp: '2025-01-11T14:00:00', action: 'clicked', position: 3 },
        { id: 15, channel: 'telegram', campaign: 'Proposal', timestamp: '2025-01-12T10:15:00', action: 'replied', position: 4 },
        { id: 16, channel: 'email', campaign: 'Contract', timestamp: '2025-01-13T16:30:00', action: 'converted', position: 5 },
      ],
      converted: true,
      revenue: 2500,
      duration: 3.3,
    },
  ]

  const mockSankeyData = {
    nodes: [
      { name: 'Email' },
      { name: 'WhatsApp' },
      { name: 'Facebook' },
      { name: 'Telegram' },
      { name: 'Google' },
      { name: 'Conversión' },
    ],
    links: [
      { source: 0, target: 5, value: 120 },
      { source: 1, target: 5, value: 289 },
      { source: 2, target: 5, value: 217 },
      { source: 3, target: 5, value: 184 },
      { source: 4, target: 5, value: 356 },
    ],
  }

  const getChannelIcon = (channel: string) => {
    switch (channel.toLowerCase()) {
      case 'whatsapp':
        return <WhatsAppIcon sx={{ color: '#25D366', fontSize: 18 }} />
      case 'email':
        return <EmailIcon sx={{ color: '#0078D4', fontSize: 18 }} />
      case 'telegram':
        return <TelegramIcon sx={{ color: '#0088CC', fontSize: 18 }} />
      case 'facebook':
        return <FacebookIcon sx={{ color: '#1877F2', fontSize: 18 }} />
      case 'google':
        return <AnalyticsIcon sx={{ color: '#4285F4', fontSize: 18 }} />
      case 'organic':
        return <TrendingUpIcon sx={{ color: '#10b981', fontSize: 18 }} />
      default:
        return <CampaignIcon sx={{ fontSize: 18 }} />
    }
  }

  const getAttributionValue = (channel: ChannelAttribution) => {
    switch (attributionModel) {
      case 'firsttouch':
        return channel.firstTouch
      case 'lasttouch':
        return channel.lastTouch
      case 'linear':
        return channel.linear
      case 'timedecay':
        return channel.timeDecay
      case 'positionbased':
        return channel.positionBased
      case 'datadriven':
        return channel.datadriven
      default:
        return channel.datadriven
    }
  }

  const totalConversions = channelAttribution.reduce((acc, ch) => acc + getAttributionValue(ch), 0)

  const exportData = () => {
    try {
      if (channelAttribution.length === 0) {
        toast.info('No hay datos de atribución para exportar')
        return
      }

      const headers = [
        'Canal', 'First Touch', 'Last Touch', 'Linear',
        'Time Decay', 'Position Based', 'Data Driven',
        'Conversiones', 'Revenue'
      ]

      const rows = channelAttribution.map((ch) => [
        ch.channel,
        ch.firstTouch,
        ch.lastTouch,
        ch.linear,
        ch.timeDecay,
        ch.positionBased,
        ch.datadriven,
        ch.conversions,
        ch.revenue
      ])

      const csvContent = [
        headers.join(','),
        ...rows.map((row) => row.join(','))
      ].join('\n')

      const BOM = '\uFEFF'
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `atribucion-${attributionModel}-${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)

      toast.success('Datos de atribución exportados')
    } catch (error) {
      console.error('Error exporting attribution data:', error)
      toast.error('Error al exportar datos')
    }
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <AttributionIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Atribución de Marketing</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Análisis multi-touch del recorrido del cliente
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={2}>
            <Select value={period} onChange={(_, value) => setPeriod(value as string)} sx={{ minWidth: 150 }}>
              <Option value="7days">Últimos 7 días</Option>
              <Option value="30days">Últimos 30 días</Option>
              <Option value="90days">Últimos 90 días</Option>
              <Option value="custom">Personalizado</Option>
            </Select>

            <Tooltip title="Actualizar datos">
              <IconButton variant="outlined" color="neutral" onClick={fetchAttributionData}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>

            <Tooltip title="Exportar reporte">
              <IconButton variant="outlined" color="neutral" onClick={exportData}>
                <DownloadIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        {loading && <LinearProgress />}

        {/* Attribution Models */}
        <Card>
          <CardContent>
            <Typography level="h4" sx={{ mb: 2 }}>
              Modelo de Atribución
            </Typography>
            <Typography level="body-sm" sx={{ mb: 3, color: 'text.tertiary' }}>
              Selecciona cómo quieres atribuir el crédito de conversión entre los diferentes touchpoints
            </Typography>
            <Grid container spacing={2}>
              {attributionModels.map((model) => (
                <Grid xs={12} md={6} lg={4} key={model.model}>
                  <Card
                    variant={attributionModel === model.model ? 'solid' : 'outlined'}
                    color={attributionModel === model.model ? 'primary' : 'neutral'}
                    sx={{
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      '&:hover': { boxShadow: 'md' },
                    }}
                    onClick={() => setAttributionModel(model.model)}
                  >
                    <CardContent>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                        {model.model === 'datadriven' && <TouchAppIcon />}
                        <Typography level="title-md">{model.label}</Typography>
                      </Stack>
                      <Typography level="body-sm">{model.description}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>

        {/* Channel Attribution Chart */}
        <Card>
          <CardContent>
            <Typography level="h4" sx={{ mb: 3 }}>
              Atribución por Canal - {attributionModels.find((m) => m.model === attributionModel)?.label}
            </Typography>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={channelAttribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="channel" />
                <YAxis />
                <RechartsTooltip
                  formatter={((value: number) => [`${value} conversiones`, 'Conversiones Atribuidas']) as any}
                />
                <Legend />
                <Bar
                  dataKey={(data) => getAttributionValue(data)}
                  fill="#3b82f6"
                  name="Conversiones Atribuidas"
                  radius={[8, 8, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Attribution Table */}
        <Card>
          <CardContent>
            <Typography level="h4" sx={{ mb: 3 }}>
              Comparación de Modelos de Atribución
            </Typography>
            <Sheet sx={{ overflow: 'auto' }}>
              <Table>
                <thead>
                  <tr>
                    <th>Canal</th>
                    <th>First Touch</th>
                    <th>Last Touch</th>
                    <th>Linear</th>
                    <th>Time Decay</th>
                    <th>Position Based</th>
                    <th>Data-Driven (IA)</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {channelAttribution.map((channel, index) => (
                    <tr key={index}>
                      <td>
                        <Stack direction="row" spacing={1} alignItems="center">
                          {getChannelIcon(channel.channel)}
                          <Typography level="body-sm" fontWeight="bold">
                            {channel.channel}
                          </Typography>
                        </Stack>
                      </td>
                      <td>
                        <Box>
                          <Typography level="body-sm" fontWeight="bold">
                            {channel.firstTouch}
                          </Typography>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            {((channel.firstTouch / totalConversions) * 100).toFixed(1)}%
                          </Typography>
                        </Box>
                      </td>
                      <td>
                        <Box>
                          <Typography level="body-sm" fontWeight="bold">
                            {channel.lastTouch}
                          </Typography>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            {((channel.lastTouch / totalConversions) * 100).toFixed(1)}%
                          </Typography>
                        </Box>
                      </td>
                      <td>
                        <Box>
                          <Typography level="body-sm" fontWeight="bold">
                            {channel.linear}
                          </Typography>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            {((channel.linear / totalConversions) * 100).toFixed(1)}%
                          </Typography>
                        </Box>
                      </td>
                      <td>
                        <Box>
                          <Typography level="body-sm" fontWeight="bold">
                            {channel.timeDecay}
                          </Typography>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            {((channel.timeDecay / totalConversions) * 100).toFixed(1)}%
                          </Typography>
                        </Box>
                      </td>
                      <td>
                        <Box>
                          <Typography level="body-sm" fontWeight="bold">
                            {channel.positionBased}
                          </Typography>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            {((channel.positionBased / totalConversions) * 100).toFixed(1)}%
                          </Typography>
                        </Box>
                      </td>
                      <td>
                        <Box>
                          <Typography level="body-sm" fontWeight="bold" sx={{ color: 'primary.main' }}>
                            {channel.datadriven}
                          </Typography>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            {((channel.datadriven / totalConversions) * 100).toFixed(1)}%
                          </Typography>
                        </Box>
                      </td>
                      <td>
                        <Typography level="body-sm" fontWeight="bold">
                          ${(channel.revenue / 1000).toFixed(1)}K
                        </Typography>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Sheet>
          </CardContent>
        </Card>

        {/* Customer Journeys */}
        <Card>
          <CardContent>
            <Typography level="h4" sx={{ mb: 3 }}>
              Recorridos de Cliente Exitosos
            </Typography>
            <Stack spacing={3}>
              {customerJourneys.map((journey) => (
                <Card key={journey.id} variant="outlined">
                  <CardContent>
                    <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                      <Box>
                        <Typography level="title-md">{journey.customerName}</Typography>
                        <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                          ID: {journey.customerId} • Duración: {journey.duration} días
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Chip color="success" variant="soft" startDecorator={<ShoppingCartIcon />}>
                          ${journey.revenue}
                        </Chip>
                        <Chip color="primary" variant="soft">
                          {journey.touchPoints.length} touchpoints
                        </Chip>
                      </Stack>
                    </Stack>

                    <Divider sx={{ my: 2 }} />

                    <Stack direction="row" spacing={2} sx={{ overflowX: 'auto', pb: 1 }}>
                      {journey.touchPoints.map((touchPoint, index) => (
                        <Box key={touchPoint.id} sx={{ minWidth: 180 }}>
                          <Card size="sm" variant="soft" color={index === journey.touchPoints.length - 1 ? 'success' : 'neutral'}>
                            <CardContent>
                              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                                {getChannelIcon(touchPoint.channel)}
                                <Typography level="body-xs" fontWeight="bold">
                                  Paso {touchPoint.position}
                                </Typography>
                              </Stack>
                              <Typography level="body-sm" fontWeight="bold" sx={{ mb: 0.5 }}>
                                {touchPoint.channel.charAt(0).toUpperCase() + touchPoint.channel.slice(1)}
                              </Typography>
                              <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                                {touchPoint.campaign}
                              </Typography>
                              <Chip size="sm" color={touchPoint.action === 'converted' ? 'success' : 'neutral'} variant="soft">
                                {touchPoint.action}
                              </Chip>
                            </CardContent>
                          </Card>
                          {index < journey.touchPoints.length - 1 && (
                            <Box sx={{ display: 'flex', justifyContent: 'center', my: 1 }}>
                              <Typography level="body-lg" sx={{ color: 'text.tertiary' }}>
                                →
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      ))}
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </CardContent>
        </Card>

        {/* Insights */}
        <Grid container spacing={3}>
          <Grid xs={12} md={4}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                  <TimelineIcon sx={{ fontSize: 32, color: 'primary.main' }} />
                  <Box>
                    <Typography level="h3">{metrics.avgTouchpoints.toFixed(1)}</Typography>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                      Touchpoints Promedio
                    </Typography>
                  </Box>
                </Stack>
                <Typography level="body-sm">
                  Los clientes interactúan en promedio con {metrics.avgTouchpoints.toFixed(1)} canales antes de convertir
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} md={4}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                  <TouchAppIcon sx={{ fontSize: 32, color: 'success.main' }} />
                  <Box>
                    <Typography level="h3">{metrics.multiTouchPercentage.toFixed(0)}%</Typography>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                      Conversiones Multi-Touch
                    </Typography>
                  </Box>
                </Stack>
                <Typography level="body-sm">
                  {metrics.multiTouchPercentage.toFixed(0)}% de conversiones involucran múltiples puntos de contacto
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} md={4}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                  <TrendingUpIcon sx={{ fontSize: 32, color: 'warning.main' }} />
                  <Box>
                    <Typography level="h3">{(metrics.avgConversionTimeHours / 24).toFixed(1)} días</Typography>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                      Tiempo Promedio de Conversión
                    </Typography>
                  </Box>
                </Stack>
                <Typography level="body-sm">
                  El ciclo promedio desde el primer touchpoint hasta la conversión
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Stack>
    </Container>
  )
}
