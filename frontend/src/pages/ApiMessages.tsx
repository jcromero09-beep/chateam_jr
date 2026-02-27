import { useState, useEffect } from 'react'
import {
  Typography,
  Stack,
  Container,
  Card,
  CardContent,
  Box,
  Grid,
  Button,
  Chip,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Select,
  Option,
  CircularProgress,
  Divider,
  Sheet
} from '@mui/joy'
import {
  Api as ApiIcon,
  Code as CodeIcon,
  Send as SendIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  TrendingUp as TrendingUpIcon,
  Dashboard as DashboardIcon,
  Description as DescriptionIcon
} from '@mui/icons-material'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts'
import api from '../services/api'

// Colores para gráficos
const COLORS = {
  success: '#4caf50',
  failed: '#f44336',
  sent: '#2196f3',
  primary: '#1976d2'
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

export default function ApiMessages() {
  const [tabIndex, setTabIndex] = useState(0)
  const [period, setPeriod] = useState<string>('week')
  const [loading, setLoading] = useState(true)
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null)
  const [detailedStats, setDetailedStats] = useState<DetailedStats | null>(null)

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

  // Dashboard Tab Content
  const DashboardContent = () => (
    <Stack spacing={3}>
      {/* Filtro de período */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Select
          value={period}
          onChange={(_, value) => value && setPeriod(value)}
          size="sm"
          sx={{ minWidth: 150 }}
        >
          <Option value="day">Hoy</Option>
          <Option value="week">Ultima Semana</Option>
          <Option value="month">Ultimo Mes</Option>
        </Select>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* Card Total - Grande arriba */}
          <Card
            sx={{
              background: 'linear-gradient(135deg, #1976d2 0%, #0d47a1 100%)',
              color: 'white'
            }}
          >
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography level="body-sm" sx={{ color: 'rgba(255,255,255,0.7)', mb: 1 }}>
                    Total de Envios (Historico)
                  </Typography>
                  <Typography level="h1" sx={{ fontWeight: 700, color: 'white' }}>
                    {formatNumber(dashboardStats?.totalAllTime || 0)}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    bgcolor: 'rgba(255,255,255,0.2)',
                    borderRadius: '50%',
                    p: 2,
                    display: 'flex'
                  }}
                >
                  <TrendingUpIcon sx={{ fontSize: 40, color: 'white' }} />
                </Box>
              </Box>
            </CardContent>
          </Card>

          {/* Cards de estadísticas del período - 3 columnas */}
          <Grid container spacing={2}>
            <Grid xs={12} md={4}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography level="body-sm" sx={{ color: 'text.tertiary', textTransform: 'uppercase', fontWeight: 500 }}>
                        Enviados ({getPeriodLabel()})
                      </Typography>
                      <Typography level="h2" sx={{ color: COLORS.sent, fontWeight: 700 }}>
                        {formatNumber(currentStats.sent)}
                      </Typography>
                    </Box>
                    <Box sx={{ bgcolor: 'primary.softBg', borderRadius: '50%', p: 1.5 }}>
                      <SendIcon sx={{ color: COLORS.sent, fontSize: 30 }} />
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid xs={12} md={4}>
              <Card sx={{ borderLeft: `4px solid ${COLORS.success}` }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography level="body-sm" sx={{ color: 'text.tertiary', textTransform: 'uppercase', fontWeight: 500 }}>
                        Exitosos ({getPeriodLabel()})
                      </Typography>
                      <Typography level="h2" sx={{ color: COLORS.success, fontWeight: 700 }}>
                        {formatNumber(currentStats.success)}
                      </Typography>
                    </Box>
                    <Box sx={{ bgcolor: 'success.softBg', borderRadius: '50%', p: 1.5 }}>
                      <CheckCircleIcon sx={{ color: COLORS.success, fontSize: 30 }} />
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid xs={12} md={4}>
              <Card sx={{ borderLeft: `4px solid ${COLORS.failed}` }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography level="body-sm" sx={{ color: 'text.tertiary', textTransform: 'uppercase', fontWeight: 500 }}>
                        Fallidos ({getPeriodLabel()})
                      </Typography>
                      <Typography level="h2" sx={{ color: COLORS.failed, fontWeight: 700 }}>
                        {formatNumber(currentStats.failed)}
                      </Typography>
                    </Box>
                    <Box sx={{ bgcolor: 'danger.softBg', borderRadius: '50%', p: 1.5 }}>
                      <ErrorIcon sx={{ color: COLORS.failed, fontSize: 30 }} />
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Gráficos */}
          <Grid container spacing={2}>
            {/* Gráfico de barras */}
            <Grid xs={12} md={8}>
              <Card>
                <CardContent>
                  <Typography level="title-lg" sx={{ mb: 2, fontWeight: 600 }}>
                    Envios Diarios ({getPeriodLabel()})
                  </Typography>
                  <Box sx={{ height: 350 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="Exitosos" fill={COLORS.success} />
                        <Bar dataKey="Fallidos" fill={COLORS.failed} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Gráfico de torta */}
            <Grid xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography level="title-lg" sx={{ mb: 2, fontWeight: 600 }}>
                    Distribucion ({getPeriodLabel()})
                  </Typography>
                  <Box sx={{ height: 350 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={(props: any) => `${props.name}: ${((props.percent || 0) * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {pieData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={index === 0 ? COLORS.success : COLORS.failed} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Desglose por tipo de contenido */}
          {detailedStats && (
            <Card>
              <CardContent>
                <Typography level="title-lg" sx={{ mb: 2, fontWeight: 600 }}>
                  Desglose por Tipo de Contenido ({getPeriodLabel()})
                </Typography>
                <Grid container spacing={2}>
                  {[
                    { label: 'Texto', value: detailedStats.totals?.text || 0 },
                    { label: 'Imagenes', value: detailedStats.totals?.image || 0 },
                    { label: 'PDF', value: detailedStats.totals?.pdf || 0 },
                    { label: 'Videos', value: detailedStats.totals?.video || 0 },
                    { label: 'Otros', value: detailedStats.totals?.other || 0 },
                    { label: 'Verificaciones', value: detailedStats.totals?.checkNumber || 0 }
                  ].map((item, index) => (
                    <Grid xs={6} sm={4} md={2} key={index}>
                      <Sheet
                        variant="soft"
                        sx={{ p: 2, borderRadius: 'md', textAlign: 'center' }}
                      >
                        <Typography level="h3" sx={{ color: 'primary.main' }}>
                          {item.value}
                        </Typography>
                        <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                          {item.label}
                        </Typography>
                      </Sheet>
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Stack>
  )

  // Documentation Tab Content
  const DocumentationContent = () => (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Typography level="h4" sx={{ mb: 2 }}>Documentacion de la API</Typography>

          <Typography level="title-md" sx={{ color: 'primary.main', mb: 1 }}>
            Metodos disponibles
          </Typography>
          <Box component="ol" sx={{ pl: 3 }}>
            <li>Envio de mensajes de texto</li>
            <li>Envio de mensajes con medios (imagenes, PDF, video)</li>
          </Box>

          <Divider sx={{ my: 2 }} />

          <Typography level="title-md" sx={{ color: 'primary.main', mb: 1 }}>
            Instrucciones
          </Typography>
          <Typography level="body-sm" sx={{ fontWeight: 600, mb: 1 }}>
            Observaciones importantes:
          </Typography>
          <Box component="ul" sx={{ pl: 3 }}>
            <li>El numero debe incluir el codigo de pais</li>
            <li>
              Formato del numero:
              <ul>
                <li>Codigo de pais (ej: 591 para Bolivia)</li>
                <li>Codigo de area</li>
                <li>Numero</li>
              </ul>
            </li>
          </Box>

          <Divider sx={{ my: 2 }} />

          <Typography level="title-md" sx={{ color: 'primary.main', mb: 1 }}>
            Mensaje de Texto
          </Typography>
          <Sheet variant="soft" sx={{ p: 2, borderRadius: 'md', mb: 2 }}>
            <Typography level="body-sm" sx={{ mb: 1 }}>
              <strong>Endpoint:</strong> {getEndpoint()}
            </Typography>
            <Typography level="body-sm" sx={{ mb: 1 }}>
              <strong>Metodo:</strong> POST
            </Typography>
            <Typography level="body-sm" sx={{ mb: 1 }}>
              <strong>Headers:</strong> Authorization: Bearer (token) y Content-Type: application/json
            </Typography>
            <Typography level="body-sm" component="div">
              <strong>Body:</strong>
              <Box component="pre" sx={{ bgcolor: 'background.level1', p: 1, borderRadius: 'sm', mt: 1, fontSize: '0.85rem' }}>
{`{
  "number": "591999999999",
  "body": "Mensaje",
  "userId": "ID de usuario (opcional)",
  "queueId": "ID de cola (opcional)",
  "sendSignature": true/false,
  "closeTicket": true/false
}`}
              </Box>
            </Typography>
          </Sheet>

          <Divider sx={{ my: 2 }} />

          <Typography level="title-md" sx={{ color: 'primary.main', mb: 1 }}>
            Mensaje con Media
          </Typography>
          <Sheet variant="soft" sx={{ p: 2, borderRadius: 'md' }}>
            <Typography level="body-sm" sx={{ mb: 1 }}>
              <strong>Endpoint:</strong> {getEndpoint()}
            </Typography>
            <Typography level="body-sm" sx={{ mb: 1 }}>
              <strong>Metodo:</strong> POST
            </Typography>
            <Typography level="body-sm" sx={{ mb: 1 }}>
              <strong>Headers:</strong> Authorization: Bearer (token) y Content-Type: multipart/form-data
            </Typography>
            <Typography level="body-sm" component="div">
              <strong>FormData:</strong>
              <Box component="ul" sx={{ pl: 3, mt: 1 }}>
                <li><strong>number:</strong> 591999999999</li>
                <li><strong>body:</strong> Mensaje (opcional si hay media)</li>
                <li><strong>userId:</strong> ID de usuario (opcional)</li>
                <li><strong>queueId:</strong> ID de cola (opcional)</li>
                <li><strong>medias:</strong> Archivo</li>
                <li><strong>sendSignature:</strong> true/false</li>
                <li><strong>closeTicket:</strong> true/false</li>
              </Box>
            </Typography>
          </Sheet>
        </CardContent>
      </Card>
    </Stack>
  )

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <ApiIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">API de Mensajes</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Integracion API para envio de mensajes
              </Typography>
            </Box>
          </Stack>
        </Stack>

        {/* Tabs */}
        <Tabs value={tabIndex} onChange={(_, value) => setTabIndex(value as number)}>
          <TabList>
            <Tab>
              <DashboardIcon sx={{ mr: 1 }} />
              Dashboard
            </Tab>
            <Tab>
              <DescriptionIcon sx={{ mr: 1 }} />
              Documentacion API
            </Tab>
          </TabList>

          <TabPanel value={0} sx={{ p: 0, pt: 2 }}>
            <DashboardContent />
          </TabPanel>

          <TabPanel value={1} sx={{ p: 0, pt: 2 }}>
            <DocumentationContent />
          </TabPanel>
        </Tabs>
      </Stack>
    </Container>
  )
}
