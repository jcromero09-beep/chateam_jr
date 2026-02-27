import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Select,
  Option,
  Chip,
  LinearProgress,
  CircularProgress,
  Table,
  IconButton,
  Tooltip,
  Stack,
  Badge,
} from '@mui/joy'
import {
  Analytics as AnalyticsIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Widgets as WidgetsIcon,
  Message as MessageIcon,
  ConfirmationNumber as TicketIcon,
  Business as BusinessIcon,
  Refresh as RefreshIcon,
  CheckCircle as ActiveIcon,
  Cancel as InactiveIcon,
  ContentCopy as CopyIcon,
  OpenInNew as OpenIcon,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
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
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
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
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography level="h2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <AnalyticsIcon sx={{ fontSize: 32 }} />
            Analytics WebChat
            {isSuper && (
              <Chip size="sm" color="warning" variant="soft">
                Super Admin - Todas las empresas
              </Chip>
            )}
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Control y métricas de widgets WebChat {isSuper ? 'de todas las empresas' : 'de tu empresa'}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <IconButton
            variant="outlined"
            color="neutral"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshIcon sx={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          </IconButton>
          <Select
            value={timeRange}
            onChange={(_, val) => setTimeRange(val as string)}
            sx={{ minWidth: 150 }}
          >
            <Option value="24h">Últimas 24 horas</Option>
            <Option value="7d">Últimos 7 días</Option>
            <Option value="30d">Últimos 30 días</Option>
            <Option value="90d">Últimos 90 días</Option>
          </Select>
        </Stack>
      </Box>

      {/* Tarjetas de resumen */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={2}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <WidgetsIcon sx={{ color: 'primary.500' }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Total Widgets</Typography>
              </Stack>
              <Typography level="h2">{summary.totalWidgets}</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={2}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <ActiveIcon sx={{ color: 'success.500' }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Activos</Typography>
              </Stack>
              <Typography level="h2" sx={{ color: 'success.500' }}>{summary.activeWidgets}</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={2}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <InactiveIcon sx={{ color: 'neutral.500' }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Inactivos</Typography>
              </Stack>
              <Typography level="h2" sx={{ color: 'neutral.500' }}>{summary.inactiveWidgets}</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={2}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <TicketIcon sx={{ color: 'warning.500' }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Tickets Creados</Typography>
              </Stack>
              <Typography level="h2">{summary.totalTickets}</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={2}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <MessageIcon sx={{ color: 'primary.500' }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Total Mensajes</Typography>
              </Stack>
              <Typography level="h2">{summary.totalMessages}</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={2}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <TrendingUpIcon sx={{ color: 'success.500' }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Prom. Tickets/Widget</Typography>
              </Stack>
              <Typography level="h2">{summary.avgTicketsPerWidget}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Gráficos de actividad */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography level="title-md" sx={{ mb: 2 }}>Tickets por Día (últimos 7 días)</Typography>
              <Stack spacing={1}>
                {analytics?.ticketsByDay.map((day) => {
                  const maxCount = Math.max(...(analytics?.ticketsByDay.map(d => d.count) || [1]))
                  const percentage = maxCount > 0 ? (day.count / maxCount) * 100 : 0
                  return (
                    <Box key={day.date}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography level="body-xs">
                          {new Date(day.date).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })}
                        </Typography>
                        <Typography level="body-xs" fontWeight="lg">{day.count}</Typography>
                      </Box>
                      <LinearProgress
                        determinate
                        value={percentage}
                        color="warning"
                        size="sm"
                      />
                    </Box>
                  )
                })}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography level="title-md" sx={{ mb: 2 }}>Mensajes por Día (últimos 7 días)</Typography>
              <Stack spacing={1}>
                {analytics?.messagesByDay.map((day) => {
                  const maxSent = Math.max(...(analytics?.messagesByDay.map(d => d.sent) || [1]))
                  const maxReceived = Math.max(...(analytics?.messagesByDay.map(d => d.received) || [1]))
                  const maxTotal = Math.max(maxSent, maxReceived, 1)
                  return (
                    <Box key={day.date}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography level="body-xs">
                          {new Date(day.date).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })}
                        </Typography>
                        <Stack direction="row" spacing={1}>
                          <Typography level="body-xs" sx={{ color: 'success.500' }}>↑{day.sent}</Typography>
                          <Typography level="body-xs" sx={{ color: 'primary.500' }}>↓{day.received}</Typography>
                        </Stack>
                      </Box>
                      <Stack direction="row" spacing={0.5}>
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
                      </Stack>
                    </Box>
                  )
                })}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabla de widgets */}
      <Card>
        <CardContent>
          <Typography level="title-md" sx={{ mb: 2 }}>
            Detalle de Widgets ({analytics?.widgets.length || 0})
          </Typography>

          {analytics?.widgets.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <WidgetsIcon sx={{ fontSize: 48, color: 'neutral.300', mb: 1 }} />
              <Typography level="body-md" sx={{ color: 'text.tertiary' }}>
                No hay widgets creados
              </Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Ve a WebChat Settings para crear tu primer widget
              </Typography>
            </Box>
          ) : (
            <Box sx={{ overflowX: 'auto' }}>
              <Table sx={{ '& th': { fontWeight: 'lg' } }}>
                <thead>
                  <tr>
                    <th>Widget</th>
                    {isSuper && <th>Empresa</th>}
                    <th>Conexión</th>
                    <th>Estado</th>
                    <th>Tickets</th>
                    <th>Mensajes</th>
                    <th>Última Actividad</th>
                    <th>API Key</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics?.widgets.map((widget) => (
                    <tr key={widget.id}>
                      <td>
                        <Stack>
                          <Typography level="body-sm" fontWeight="md">{widget.name}</Typography>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            {widget.channel}
                          </Typography>
                        </Stack>
                      </td>
                      {isSuper && (
                        <td>
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <BusinessIcon sx={{ fontSize: 16, color: 'neutral.500' }} />
                            <Typography level="body-sm">{widget.companyName || `ID: ${widget.companyId}`}</Typography>
                          </Stack>
                        </td>
                      )}
                      <td>
                        <Typography level="body-sm">{widget.whatsappName || 'N/A'}</Typography>
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          color={widget.status ? 'success' : 'neutral'}
                          variant="soft"
                          startDecorator={widget.status ? <ActiveIcon sx={{ fontSize: 14 }} /> : <InactiveIcon sx={{ fontSize: 14 }} />}
                        >
                          {widget.status ? 'Activo' : 'Inactivo'}
                        </Chip>
                      </td>
                      <td>
                        <Badge
                          badgeContent={widget.ticketsCreated}
                          color="warning"
                          max={999}
                        >
                          <TicketIcon sx={{ color: 'neutral.400' }} />
                        </Badge>
                      </td>
                      <td>
                        <Stack direction="row" spacing={1}>
                          <Tooltip title="Enviados">
                            <Chip size="sm" color="success" variant="soft">↑{widget.messagesSent}</Chip>
                          </Tooltip>
                          <Tooltip title="Recibidos">
                            <Chip size="sm" color="primary" variant="soft">↓{widget.messagesReceived}</Chip>
                          </Tooltip>
                        </Stack>
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          color={getActivityColor(widget.lastActivity)}
                          variant="soft"
                        >
                          {formatDate(widget.lastActivity)}
                        </Chip>
                      </td>
                      <td>
                        <Stack direction="row" spacing={0.5}>
                          <Tooltip title="Copiar API Key">
                            <IconButton
                              size="sm"
                              variant="plain"
                              onClick={() => copyApiKey(widget.apiKey)}
                            >
                              <CopyIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                          <Typography level="body-xs" sx={{
                            fontFamily: 'monospace',
                            bgcolor: 'neutral.100',
                            px: 0.5,
                            borderRadius: 'xs',
                            maxWidth: 100,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {widget.apiKey.substring(0, 12)}...
                          </Typography>
                        </Stack>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Box>
          )}
        </CardContent>
      </Card>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Box>
  )
}
