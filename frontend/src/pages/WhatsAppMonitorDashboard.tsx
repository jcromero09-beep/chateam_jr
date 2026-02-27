import { useState, useEffect } from 'react'
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
  Security as SecurityIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Speed as SpeedIcon,
  Message as MessageIcon,
  Schedule as ScheduleIcon,
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  Block as BlockIcon,
  Timer as TimerIcon,
} from '@mui/icons-material'
import api from '../services/api'
import { toast } from 'react-toastify'

// Interfaces
interface GlobalMetrics {
  totalConnections: number
  activeConnections: number
  totalMessagesSent: number
  totalMessagesFailed: number
  successRate: number
  failureRate: number
  averageResponseTime: number
}

interface WhatsAppHealth {
  whatsappId: number
  companyId: number
  name?: string
  status: 'connected' | 'disconnected' | 'qrcode' | 'error'
  qrCode: string | null
  lastHealthCheck: string
  consecutiveFailures: number
  isHealthy: boolean
}

interface RateLimitMetrics {
  blockedConversations: number
  totalRequests: number
  throttledRequests: number
  limits: {
    perConversation: number
    perUser: number
    perWhatsapp: number
    perCompany: number
  }
}

interface AntiBanMetrics {
  delaysApplied: number
  typingSimulations: number
  averageDelayMs: number
  minDelayMs: number
  maxDelayMs: number
  rateLimitEnabled: boolean
  maxMessagesPerHour: number
}

interface DashboardData {
  global: GlobalMetrics
  whatsapps: WhatsAppHealth[]
  rateLimit: RateLimitMetrics
  antiBan: AntiBanMetrics
  timestamp: string
}

export default function WhatsAppMonitorDashboard() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)

  // Fetch dashboard data
  const fetchDashboard = async (showLoader = true) => {
    try {
      if (showLoader) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      const response = await api.get('/whatsapp-monitor/dashboard')
      setDashboard(response.data)
    } catch (error: any) {
      console.error('Error fetching dashboard:', error)
      toast.error('Error al cargar el dashboard de monitoreo')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Initial load
  useEffect(() => {
    fetchDashboard()
  }, [])

  // Auto refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      fetchDashboard(false)
    }, 30000)

    return () => clearInterval(interval)
  }, [autoRefresh])

  const handleRefresh = () => {
    fetchDashboard(false)
  }

  const getStatusColor = (status: WhatsAppHealth['status']) => {
    switch (status) {
      case 'connected':
        return 'success'
      case 'disconnected':
        return 'neutral'
      case 'error':
        return 'danger'
      case 'qrcode':
        return 'warning'
      default:
        return 'neutral'
    }
  }

  const getStatusText = (status: WhatsAppHealth['status']) => {
    switch (status) {
      case 'connected':
        return 'Conectado'
      case 'disconnected':
        return 'Desconectado'
      case 'error':
        return 'Error'
      case 'qrcode':
        return 'QR Code'
      default:
        return 'Desconocido'
    }
  }

  const getHealthColor = (isHealthy: boolean, failures: number) => {
    if (isHealthy && failures === 0) return 'success'
    if (failures > 0 && failures < 3) return 'warning'
    return 'danger'
  }

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
        }}
      >
        <CircularProgress size="lg" />
      </Box>
    )
  }

  if (!dashboard) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography level="h4">No hay datos disponibles</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography level="h2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <SecurityIcon sx={{ fontSize: 32, color: '#2196F3' }} />
            Sistema Anti-Bloqueos WhatsApp
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Monitoreo en tiempo real de salud, rate limiting y métricas anti-ban
          </Typography>
          <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
            Última actualización: {new Date(dashboard.timestamp).toLocaleString('es-ES')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Chip
            size="sm"
            color={autoRefresh ? 'success' : 'neutral'}
            onClick={() => setAutoRefresh(!autoRefresh)}
            sx={{ cursor: 'pointer' }}
          >
            {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          </Chip>
          <IconButton
            size="sm"
            variant="outlined"
            onClick={handleRefresh}
            loading={refreshing}
          >
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {/* KPIs Principales */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                    Conexiones Activas
                  </Typography>
                  <Typography level="h3">
                    {dashboard.global.activeConnections || 0}/{dashboard.global.totalConnections || 0}
                  </Typography>
                  <Chip
                    size="sm"
                    color={(dashboard.global.activeConnections || 0) === (dashboard.global.totalConnections || 0) ? 'success' : 'warning'}
                    sx={{ mt: 1 }}
                  >
                    {(dashboard.global.totalConnections || 0) > 0
                      ? Math.round(((dashboard.global.activeConnections || 0) / (dashboard.global.totalConnections || 1)) * 100)
                      : 0}% Disponibilidad
                  </Chip>
                </Box>
                <Avatar sx={{ bgcolor: 'success.softBg', color: 'success.solidBg' }}>
                  <CheckCircleIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                    Tasa de Éxito
                  </Typography>
                  <Typography level="h3">{(dashboard.global.successRate || 0).toFixed(1)}%</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                    <TrendingUpIcon sx={{ fontSize: 16, color: 'success.500' }} />
                    <Typography level="body-xs" sx={{ color: 'success.500' }}>
                      {(dashboard.global.totalMessagesSent || 0).toLocaleString()} enviados
                    </Typography>
                  </Box>
                </Box>
                <Avatar sx={{ bgcolor: 'primary.softBg', color: 'primary.solidBg' }}>
                  <MessageIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                    Rate Limiting
                  </Typography>
                  <Typography level="h3">{dashboard.rateLimit?.blockedConversations || 0}</Typography>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 1 }}>
                    Conversaciones bloqueadas
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'warning.softBg', color: 'warning.solidBg' }}>
                  <BlockIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                    Delay Promedio
                  </Typography>
                  <Typography level="h3">{dashboard.antiBan?.averageDelayMs || 0}ms</Typography>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 1 }}>
                    {dashboard.antiBan?.delaysApplied || 0} delays aplicados
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'info.softBg', color: 'info.solidBg' }}>
                  <TimerIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Métricas Anti-Ban y Rate Limiting */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography level="title-md" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <SecurityIcon sx={{ color: 'primary.500' }} />
                Métricas Anti-Ban
              </Typography>
              <Grid container spacing={2}>
                <Grid xs={6}>
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                      Delays Aplicados
                    </Typography>
                    <Typography level="h4" sx={{ color: 'primary.500' }}>
                      {dashboard.antiBan?.delaysApplied || 0}
                    </Typography>
                  </Box>
                </Grid>
                <Grid xs={6}>
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                      Simulaciones Typing
                    </Typography>
                    <Typography level="h4" sx={{ color: 'success.500' }}>
                      {dashboard.antiBan?.typingSimulations || 0}
                    </Typography>
                  </Box>
                </Grid>
                <Grid xs={6}>
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                      Rango de Delays
                    </Typography>
                    <Typography level="h4" sx={{ color: 'warning.500' }}>
                      {dashboard.antiBan?.minDelayMs || 0}-{dashboard.antiBan?.maxDelayMs || 0}ms
                    </Typography>
                  </Box>
                </Grid>
                <Grid xs={6}>
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                      Límite por Hora
                    </Typography>
                    <Typography level="h4" sx={{ color: 'info.500' }}>
                      {dashboard.antiBan?.maxMessagesPerHour || 0} msg/h
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
              <Box sx={{ mt: 2 }}>
                <Chip
                  size="sm"
                  color={dashboard.antiBan?.rateLimitEnabled ? 'success' : 'danger'}
                  startDecorator={dashboard.antiBan?.rateLimitEnabled ? <CheckCircleIcon /> : <ErrorIcon />}
                >
                  Rate Limiting {dashboard.antiBan?.rateLimitEnabled ? 'Activo' : 'Inactivo'}
                </Chip>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography level="title-md" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <SpeedIcon sx={{ color: 'warning.500' }} />
                Límites de Velocidad
              </Typography>
              <Grid container spacing={2}>
                <Grid xs={6}>
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                      Por Conversación
                    </Typography>
                    <Typography level="h4" sx={{ color: 'primary.500' }}>
                      {dashboard.rateLimit?.limits?.perConversation || 0}/h
                    </Typography>
                  </Box>
                </Grid>
                <Grid xs={6}>
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                      Por Usuario
                    </Typography>
                    <Typography level="h4" sx={{ color: 'success.500' }}>
                      {dashboard.rateLimit?.limits?.perUser || 0}/h
                    </Typography>
                  </Box>
                </Grid>
                <Grid xs={6}>
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                      Por WhatsApp
                    </Typography>
                    <Typography level="h4" sx={{ color: 'warning.500' }}>
                      {dashboard.rateLimit?.limits?.perWhatsapp || 0}/h
                    </Typography>
                  </Box>
                </Grid>
                <Grid xs={6}>
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                      Por Compañía
                    </Typography>
                    <Typography level="h4" sx={{ color: 'info.500' }}>
                      {dashboard.rateLimit?.limits?.perCompany || 0}/h
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
              <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                <Chip size="sm" color="warning">
                  {dashboard.rateLimit?.throttledRequests || 0} requests throttled
                </Chip>
                <Chip size="sm" color="neutral">
                  {dashboard.rateLimit?.totalRequests || 0} total requests
                </Chip>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabla de Estado de WhatsApps */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography level="title-md">
              Estado de Salud de Conexiones WhatsApp
            </Typography>
          </Box>

          {dashboard.whatsapps.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography level="body-md" sx={{ color: 'text.tertiary' }}>
                No hay conexiones WhatsApp configuradas
              </Typography>
            </Box>
          ) : (
            <Sheet sx={{ overflow: 'auto' }}>
              <Table>
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>ID</th>
                    <th style={{ width: 150 }}>Estado</th>
                    <th style={{ width: 120 }}>Salud</th>
                    <th style={{ width: 120 }}>Fallos</th>
                    <th style={{ width: 200 }}>Último Check</th>
                    <th style={{ width: 100, textAlign: 'center' }}>QR Code</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.whatsapps.map((whatsapp) => (
                    <tr key={whatsapp.whatsappId}>
                      <td>
                        <Typography level="body-sm" fontWeight="lg">
                          #{whatsapp.whatsappId}
                        </Typography>
                        {whatsapp.name && (
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            {whatsapp.name}
                          </Typography>
                        )}
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          color={getStatusColor(whatsapp.status)}
                          startDecorator={
                            whatsapp.status === 'connected' ? (
                              <CheckCircleIcon />
                            ) : whatsapp.status === 'error' ? (
                              <ErrorIcon />
                            ) : whatsapp.status === 'qrcode' ? (
                              <ScheduleIcon />
                            ) : (
                              <WarningIcon />
                            )
                          }
                        >
                          {getStatusText(whatsapp.status)}
                        </Chip>
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          color={getHealthColor(whatsapp.isHealthy, whatsapp.consecutiveFailures)}
                          startDecorator={
                            whatsapp.isHealthy ? <CheckCircleIcon /> : <ErrorIcon />
                          }
                        >
                          {whatsapp.isHealthy ? 'Saludable' : 'Problema'}
                        </Chip>
                      </td>
                      <td>
                        <Typography
                          level="body-sm"
                          fontWeight="lg"
                          sx={{
                            color: whatsapp.consecutiveFailures === 0 ? 'success.500' : 'danger.500'
                          }}
                        >
                          {whatsapp.consecutiveFailures} fallos
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          {new Date(whatsapp.lastHealthCheck).toLocaleString('es-ES')}
                        </Typography>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {whatsapp.qrCode ? (
                          <Button size="sm" variant="outlined" color="warning">
                            Ver QR
                          </Button>
                        ) : (
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            N/A
                          </Typography>
                        )}
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
