import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Table,
  IconButton,
  Button,
  Sheet,
  Avatar,
  CircularProgress,
} from '@mui/joy'
import {
  WhatsApp as WhatsAppIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  TrendingUp as TrendingUpIcon,
  People as PeopleIcon,
  Message as MessageIcon,
  Schedule as ScheduleIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
  Add as AddIcon,
} from '@mui/icons-material'
import api from '../services/api'

// Interfaces
interface WhatsAppConnection {
  id: number
  name: string
  number: string
  status: string
  channel: string
  messagesLast24h: number
  lastSync: string
}

interface DashboardMetrics {
  totalConnections: number
  activeConnections: number
  messagesLast24h: number
  messagesSent24h: number
  messagesReceived24h: number
  activeConversations: number
  avgResponseTime: number
}

interface DashboardData {
  connections: WhatsAppConnection[]
  metrics: DashboardMetrics
}

export default function WhatsAppDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connections, setConnections] = useState<WhatsAppConnection[]>([])
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalConnections: 0,
    activeConnections: 0,
    messagesLast24h: 0,
    messagesSent24h: 0,
    messagesReceived24h: 0,
    activeConversations: 0,
    avgResponseTime: 0,
  })

  // Cargar datos del dashboard
  const loadDashboard = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await api.get<DashboardData>('/whatsapp-meta/dashboard')
      setConnections(response.data.connections)
      setMetrics(response.data.metrics)
    } catch (err: any) {
      console.error('Error loading WhatsApp Meta dashboard:', err)
      setError(err.response?.data?.message || 'Error al cargar el dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  // Funciones auxiliares
  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case 'CONNECTED':
      case 'QRCODE':
        return 'success'
      case 'DISCONNECTED':
        return 'neutral'
      case 'ERROR':
      case 'TIMEOUT':
        return 'danger'
      case 'PENDING':
      case 'OPENING':
        return 'warning'
      default:
        return 'neutral'
    }
  }

  const getStatusText = (status: string) => {
    switch (status.toUpperCase()) {
      case 'CONNECTED':
        return 'Conectado'
      case 'DISCONNECTED':
        return 'Desconectado'
      case 'QRCODE':
        return 'QR Code'
      case 'ERROR':
        return 'Error'
      case 'TIMEOUT':
        return 'Timeout'
      case 'PENDING':
        return 'Pendiente'
      case 'OPENING':
        return 'Iniciando'
      default:
        return status || 'Desconocido'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status.toUpperCase()) {
      case 'CONNECTED':
        return <CheckCircleIcon />
      case 'ERROR':
      case 'TIMEOUT':
        return <ErrorIcon />
      case 'PENDING':
      case 'OPENING':
      case 'QRCODE':
        return <ScheduleIcon />
      default:
        return <WarningIcon />
    }
  }

  const formatResponseTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`
    return `${Math.round(seconds / 3600)}h`
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const handleRefresh = () => {
    loadDashboard()
  }

  const handleAddConnection = () => {
    navigate('/connections')
  }

  const handleViewConnection = (id: number) => {
    navigate(`/connections`)
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress size="lg" />
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Card color="danger" variant="soft">
          <CardContent>
            <Typography level="title-md">Error al cargar el dashboard</Typography>
            <Typography level="body-sm">{error}</Typography>
            <Button
              size="sm"
              variant="solid"
              color="danger"
              onClick={handleRefresh}
              sx={{ mt: 2 }}
            >
              Reintentar
            </Button>
          </CardContent>
        </Card>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography level="h2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <WhatsAppIcon sx={{ fontSize: 32, color: '#25D366' }} />
            WhatsApp Business API Dashboard
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Gestión y monitoreo de conexiones WhatsApp Cloud API (canal Meta)
          </Typography>
        </Box>
        <IconButton
          variant="outlined"
          color="neutral"
          onClick={handleRefresh}
          title="Actualizar datos"
        >
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* KPIs Principales - 3 cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                    Conexiones Activas
                  </Typography>
                  <Typography level="h3">{metrics.activeConnections}/{metrics.totalConnections}</Typography>
                  <Chip
                    size="sm"
                    color={metrics.totalConnections > 0 && metrics.activeConnections === metrics.totalConnections ? 'success' : 'warning'}
                    sx={{ mt: 1 }}
                  >
                    {metrics.totalConnections > 0
                      ? `${Math.round((metrics.activeConnections / metrics.totalConnections) * 100)}% Disponibilidad`
                      : 'Sin conexiones'}
                  </Chip>
                </Box>
                <Avatar sx={{ bgcolor: 'success.softBg', color: 'success.solidBg' }}>
                  <CheckCircleIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                    Mensajes (24h)
                  </Typography>
                  <Typography level="h3">{metrics.messagesLast24h.toLocaleString()}</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                    {metrics.messagesLast24h > 0 ? (
                      <>
                        <TrendingUpIcon sx={{ fontSize: 16, color: 'success.500' }} />
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          {metrics.messagesSent24h} enviados / {metrics.messagesReceived24h} recibidos
                        </Typography>
                      </>
                    ) : (
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        Sin actividad
                      </Typography>
                    )}
                  </Box>
                </Box>
                <Avatar sx={{ bgcolor: 'primary.softBg', color: 'primary.solidBg' }}>
                  <MessageIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                    Conversaciones Activas
                  </Typography>
                  <Typography level="h3">{metrics.activeConversations}</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                    {metrics.avgResponseTime > 0 ? (
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        Resp. promedio: {formatResponseTime(metrics.avgResponseTime)}
                      </Typography>
                    ) : (
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        Tickets abiertos/pendientes
                      </Typography>
                    )}
                  </Box>
                </Box>
                <Avatar sx={{ bgcolor: 'warning.softBg', color: 'warning.solidBg' }}>
                  <PeopleIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Métricas Secundarias */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12}>
          <Card>
            <CardContent>
              <Typography level="title-md" sx={{ mb: 2 }}>
                Estadísticas de Mensajes (24h)
              </Typography>
              <Grid container spacing={2}>
                <Grid xs={6} sm={3}>
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                      Enviados
                    </Typography>
                    <Typography level="h4" sx={{ color: 'primary.500' }}>
                      {metrics.messagesSent24h.toLocaleString()}
                    </Typography>
                  </Box>
                </Grid>
                <Grid xs={6} sm={3}>
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                      Recibidos
                    </Typography>
                    <Typography level="h4" sx={{ color: 'success.500' }}>
                      {metrics.messagesReceived24h.toLocaleString()}
                    </Typography>
                  </Box>
                </Grid>
                <Grid xs={6} sm={3}>
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                      Tasa de Respuesta
                    </Typography>
                    <Typography level="h4" sx={{ color: 'warning.500' }}>
                      {metrics.messagesReceived24h > 0
                        ? `${Math.round((metrics.messagesSent24h / metrics.messagesReceived24h) * 100)}%`
                        : '0%'}
                    </Typography>
                  </Box>
                </Grid>
                <Grid xs={6} sm={3}>
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                      Tiempo Promedio
                    </Typography>
                    <Typography level="h4" sx={{ color: 'info.500' }}>
                      {metrics.avgResponseTime > 0
                        ? formatResponseTime(metrics.avgResponseTime)
                        : '-'}
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabla de Conexiones */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography level="title-md">
              Conexiones WhatsApp Business API
            </Typography>
            <Button
              size="sm"
              variant="solid"
              color="primary"
              startDecorator={<AddIcon />}
              onClick={handleAddConnection}
            >
              Agregar Conexión
            </Button>
          </Box>

          {connections.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <WhatsAppIcon sx={{ fontSize: 48, color: 'text.tertiary', mb: 2 }} />
              <Typography level="body-md" sx={{ color: 'text.tertiary', mb: 2 }}>
                No hay conexiones WhatsApp Cloud API configuradas
              </Typography>
              <Button
                variant="outlined"
                color="primary"
                startDecorator={<AddIcon />}
                onClick={handleAddConnection}
              >
                Agregar tu primera conexión
              </Button>
            </Box>
          ) : (
            <Sheet sx={{ overflow: 'auto' }}>
              <Table>
                <thead>
                  <tr>
                    <th style={{ width: 200 }}>Número / Nombre</th>
                    <th style={{ width: 120 }}>Estado</th>
                    <th style={{ width: 120 }}>Mensajes 24h</th>
                    <th style={{ width: 180 }}>Última Sincronización</th>
                    <th style={{ width: 100, textAlign: 'center' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {connections.map((connection) => (
                    <tr key={connection.id}>
                      <td>
                        <Box>
                          <Typography level="body-sm" fontWeight="lg">
                            {connection.number || '-'}
                          </Typography>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            {connection.name}
                          </Typography>
                        </Box>
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          color={getStatusColor(connection.status)}
                          startDecorator={getStatusIcon(connection.status)}
                        >
                          {getStatusText(connection.status)}
                        </Chip>
                      </td>
                      <td>
                        <Typography level="body-sm" fontWeight="lg">
                          {connection.messagesLast24h.toLocaleString()}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          {formatDate(connection.lastSync)}
                        </Typography>
                      </td>
                      <td>
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="neutral"
                            onClick={() => handleViewConnection(connection.id)}
                            title="Ver configuración"
                          >
                            <SettingsIcon />
                          </IconButton>
                        </Box>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Sheet>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}
