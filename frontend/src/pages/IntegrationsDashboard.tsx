import { useState } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  Chip,
  LinearProgress,
  Avatar,
  IconButton,
  Tooltip,
  Alert,
} from '@mui/joy'
import {
  Dashboard as DashboardIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Sync as SyncIcon,
  Settings as SettingsIcon,
  Refresh as RefreshIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Timeline as TimelineIcon,
} from '@mui/icons-material'

interface Integration {
  id: number
  name: string
  type: string
  status: 'active' | 'inactive' | 'error' | 'syncing'
  lastSync: string
  nextSync: string
  syncedRecords: number
  pendingRecords: number
  errorCount: number
  uptime: number
  apiVersion: string
  companyName: string
}

interface SyncLog {
  id: number
  integration: string
  timestamp: string
  type: 'sync' | 'error' | 'warning'
  message: string
  records: number
  duration: number
}

export default function IntegrationsDashboard() {
  const [refreshing, setRefreshing] = useState(false)

  const stats = {
    totalIntegrations: 5,
    activeIntegrations: 4,
    syncedToday: 12845,
    pendingSync: 234,
    errorRate: 0.5,
    avgSyncTime: 23,
  }

  const integrations: Integration[] = [
    {
      id: 1,
      name: 'Billie',
      type: 'ERP',
      status: 'active',
      lastSync: '2025-10-13 10:45:23',
      nextSync: '2025-10-13 11:00:00',
      syncedRecords: 5482,
      pendingRecords: 45,
      errorCount: 2,
      uptime: 99.8,
      apiVersion: 'v2.5',
      companyName: 'Empresa Demo S.A.',
    },
    {
      id: 2,
      name: 'Aria Lite',
      type: 'CRM',
      status: 'active',
      lastSync: '2025-10-13 10:40:12',
      nextSync: '2025-10-13 11:10:00',
      syncedRecords: 3234,
      pendingRecords: 67,
      errorCount: 0,
      uptime: 100,
      apiVersion: 'v1.8',
      companyName: 'Tech Solutions Ltd.',
    },
    {
      id: 3,
      name: 'SmartTrack',
      type: 'Logistics',
      status: 'syncing',
      lastSync: '2025-10-13 10:30:45',
      nextSync: '2025-10-13 11:00:00',
      syncedRecords: 2876,
      pendingRecords: 89,
      errorCount: 1,
      uptime: 99.5,
      apiVersion: 'v3.1',
      companyName: 'Global Logistics Inc.',
    },
    {
      id: 4,
      name: 'SGR',
      type: 'Claims',
      status: 'active',
      lastSync: '2025-10-13 10:35:18',
      nextSync: '2025-10-13 11:05:00',
      syncedRecords: 1253,
      pendingRecords: 33,
      errorCount: 5,
      uptime: 98.9,
      apiVersion: 'v2.0',
      companyName: 'Insurance Corp.',
    },
    {
      id: 5,
      name: 'Custom API',
      type: 'Custom',
      status: 'error',
      lastSync: '2025-10-13 09:15:22',
      nextSync: 'Paused',
      syncedRecords: 0,
      pendingRecords: 0,
      errorCount: 12,
      uptime: 85.2,
      apiVersion: 'v1.0',
      companyName: 'Beta Company',
    },
  ]

  const recentLogs: SyncLog[] = [
    {
      id: 1,
      integration: 'Billie',
      timestamp: '2025-10-13 10:45:23',
      type: 'sync',
      message: 'Sincronización completada exitosamente - 245 contactos actualizados',
      records: 245,
      duration: 18,
    },
    {
      id: 2,
      integration: 'Aria Lite',
      timestamp: '2025-10-13 10:40:12',
      type: 'sync',
      message: 'Sincronización bidireccional completada - 187 registros',
      records: 187,
      duration: 24,
    },
    {
      id: 3,
      integration: 'SmartTrack',
      timestamp: '2025-10-13 10:35:45',
      type: 'warning',
      message: 'Sincronización con retrasos - alto volumen de datos',
      records: 456,
      duration: 67,
    },
    {
      id: 4,
      integration: 'SGR',
      timestamp: '2025-10-13 10:35:18',
      type: 'sync',
      message: 'Reclamos actualizados - 34 casos cerrados',
      records: 34,
      duration: 12,
    },
    {
      id: 5,
      integration: 'Custom API',
      timestamp: '2025-10-13 09:15:22',
      type: 'error',
      message: 'Error de autenticación - Token expirado',
      records: 0,
      duration: 0,
    },
  ]

  const handleRefresh = () => {
    setRefreshing(true)
    setTimeout(() => {
      setRefreshing(false)
    }, 2000)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'success'
      case 'syncing':
        return 'primary'
      case 'inactive':
        return 'neutral'
      case 'error':
        return 'danger'
      default:
        return 'neutral'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircleIcon />
      case 'syncing':
        return <SyncIcon className="rotating" />
      case 'error':
        return <ErrorIcon />
      default:
        return <WarningIcon />
    }
  }

  const getLogTypeColor = (type: string) => {
    switch (type) {
      case 'sync':
        return 'success'
      case 'warning':
        return 'warning'
      case 'error':
        return 'danger'
      default:
        return 'neutral'
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography level="h2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <DashboardIcon sx={{ fontSize: 32 }} />
            Dashboard de Integraciones
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Estado y monitoreo de todas las integraciones empresariales
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startDecorator={<TimelineIcon />}
            onClick={() => {}}
          >
            Ver Logs Completos
          </Button>
          <Button
            startDecorator={<RefreshIcon />}
            loading={refreshing}
            onClick={handleRefresh}
          >
            Actualizar
          </Button>
        </Box>
      </Box>

      {/* KPIs */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={2}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Total Integraciones
              </Typography>
              <Typography level="h3">{stats.totalIntegrations}</Typography>
              <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                {stats.activeIntegrations} activas
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={2}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Sincronizados Hoy
              </Typography>
              <Typography level="h3">{stats.syncedToday.toLocaleString()}</Typography>
              <Typography level="body-xs" sx={{ color: 'success.500', mt: 0.5 }}>
                +12.5% vs ayer
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={2}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Pendientes
              </Typography>
              <Typography level="h3">{stats.pendingSync}</Typography>
              <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                En cola
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Tasa de Error
              </Typography>
              <Typography level="h3">{stats.errorRate}%</Typography>
              <LinearProgress
                determinate
                value={stats.errorRate}
                color={stats.errorRate < 1 ? 'success' : 'danger'}
                size="sm"
                sx={{ mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Tiempo Promedio Sync
              </Typography>
              <Typography level="h3">{stats.avgSyncTime}s</Typography>
              <Typography level="body-xs" sx={{ color: 'success.500', mt: 0.5 }}>
                -3s vs semana pasada
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Estado de Integraciones */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography level="title-lg" sx={{ mb: 2 }}>
            Estado de Integraciones
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {integrations.map((integration) => (
              <Card key={integration.id} variant="outlined">
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ bgcolor: `${getStatusColor(integration.status)}.softBg` }}>
                      {getStatusIcon(integration.status)}
                    </Avatar>

                    <Box sx={{ flexGrow: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Typography level="title-md">{integration.name}</Typography>
                        <Chip size="sm" color={getStatusColor(integration.status)} variant="soft">
                          {integration.status}
                        </Chip>
                        <Chip size="sm" variant="outlined">
                          {integration.type}
                        </Chip>
                      </Box>

                      <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid xs={12} sm={6} md={3}>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            Empresa
                          </Typography>
                          <Typography level="body-sm" fontWeight="lg">
                            {integration.companyName}
                          </Typography>
                        </Grid>
                        <Grid xs={12} sm={6} md={3}>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            Última Sincronización
                          </Typography>
                          <Typography level="body-sm" fontWeight="lg">
                            {integration.lastSync}
                          </Typography>
                        </Grid>
                        <Grid xs={12} sm={6} md={2}>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            Registros Sincronizados
                          </Typography>
                          <Typography level="body-sm" fontWeight="lg">
                            {integration.syncedRecords.toLocaleString()}
                          </Typography>
                        </Grid>
                        <Grid xs={12} sm={6} md={2}>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            Pendientes
                          </Typography>
                          <Typography level="body-sm" fontWeight="lg" sx={{ color: 'warning.500' }}>
                            {integration.pendingRecords}
                          </Typography>
                        </Grid>
                        <Grid xs={12} sm={6} md={2}>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            Uptime
                          </Typography>
                          <Typography level="body-sm" fontWeight="lg" sx={{ color: 'success.500' }}>
                            {integration.uptime}%
                          </Typography>
                        </Grid>
                      </Grid>

                      {integration.errorCount > 0 && (
                        <Alert color="warning" size="sm" sx={{ mt: 1 }}>
                          {integration.errorCount} errores en las últimas 24 horas
                        </Alert>
                      )}
                    </Box>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Tooltip title="Configurar">
                        <IconButton variant="outlined" size="sm">
                          <SettingsIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={integration.status === 'active' ? 'Pausar' : 'Activar'}>
                        <IconButton
                          variant="outlined"
                          size="sm"
                          color={integration.status === 'active' ? 'danger' : 'success'}
                        >
                          {integration.status === 'active' ? <StopIcon /> : <PlayIcon />}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Sincronizar Ahora">
                        <IconButton variant="outlined" size="sm" color="primary">
                          <RefreshIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        </CardContent>
      </Card>

      {/* Logs Recientes */}
      <Card>
        <CardContent>
          <Typography level="title-lg" sx={{ mb: 2 }}>
            Actividad Reciente
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {recentLogs.map((log) => (
              <Card key={log.id} variant="outlined">
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Chip size="sm" color={getLogTypeColor(log.type)} variant="soft">
                      {log.type}
                    </Chip>
                    <Box sx={{ flexGrow: 1 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography level="title-sm">{log.integration}</Typography>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          {log.timestamp}
                        </Typography>
                      </Box>
                      <Typography level="body-sm" sx={{ mt: 0.5 }}>
                        {log.message}
                      </Typography>
                      {log.records > 0 && (
                        <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                          {log.records} registros en {log.duration}s
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        </CardContent>
      </Card>

      <style>
        {`
          @keyframes rotate {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .rotating {
            animation: rotate 2s linear infinite;
          }
        `}
      </style>
    </Box>
  )
}
