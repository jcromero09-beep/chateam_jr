import { useState } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  Input,
  FormControl,
  FormLabel,
  Switch,
  Chip,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Table,
  Sheet,
  Alert,
  Select,
  Option,
} from '@mui/joy'
import {
  Assignment as AssignmentIcon,
  Save as SaveIcon,
  Sync as SyncIcon,
  CheckCircle as CheckCircleIcon,
  Settings as SettingsIcon,
  BarChart as BarChartIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  PendingActions as PendingIcon,
} from '@mui/icons-material'

interface Claim {
  id: number
  claimNumber: string
  customerName: string
  status: 'pending' | 'in_progress' | 'closed' | 'rejected'
  createdAt: string
  updatedAt: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  amount: number
}

interface ClaimStat {
  total: number
  pending: number
  inProgress: number
  closed: number
  rejected: number
}

export default function IntegrationSGR() {
  const [config, setConfig] = useState({
    enabled: true,
    apiUrl: 'https://api.sgr.gov.ar/v2.0',
    apiKey: '••••••••••••••••',
    companyCode: 'SGR_DEMO001',
    syncInterval: 20,
    autoSync: true,
    notifyNewClaims: true,
    notifyStatusChange: true,
    autoAssignTickets: false,
  })

  const [selectedStatus, setSelectedStatus] = useState<string>('all')

  const stats: ClaimStat = {
    total: 1253,
    pending: 234,
    inProgress: 189,
    closed: 798,
    rejected: 32,
  }

  const generalStats = {
    lastSync: '2025-10-13 10:35:18',
    nextSync: '2025-10-13 10:55:00',
    syncedToday: 34,
    errors: 5,
    uptime: 98.9,
    avgResponseTime: 2.3,
  }

  const recentClaims: Claim[] = [
    {
      id: 1,
      claimNumber: 'SGR-2025-00234',
      customerName: 'Juan Pérez',
      status: 'pending',
      createdAt: '2025-10-13 10:15:00',
      updatedAt: '2025-10-13 10:15:00',
      priority: 'high',
      amount: 15000,
    },
    {
      id: 2,
      claimNumber: 'SGR-2025-00233',
      customerName: 'María González',
      status: 'in_progress',
      createdAt: '2025-10-13 09:45:00',
      updatedAt: '2025-10-13 10:30:00',
      priority: 'medium',
      amount: 8500,
    },
    {
      id: 3,
      claimNumber: 'SGR-2025-00232',
      customerName: 'Carlos Rodríguez',
      status: 'closed',
      createdAt: '2025-10-13 08:20:00',
      updatedAt: '2025-10-13 10:10:00',
      priority: 'low',
      amount: 3200,
    },
    {
      id: 4,
      claimNumber: 'SGR-2025-00231',
      customerName: 'Ana Martínez',
      status: 'in_progress',
      createdAt: '2025-10-13 07:50:00',
      updatedAt: '2025-10-13 09:45:00',
      priority: 'critical',
      amount: 25000,
    },
    {
      id: 5,
      claimNumber: 'SGR-2025-00230',
      customerName: 'Luis Fernández',
      status: 'rejected',
      createdAt: '2025-10-12 16:30:00',
      updatedAt: '2025-10-13 08:15:00',
      priority: 'medium',
      amount: 5600,
    },
  ]

  const handleSave = () => {
    console.log('Guardando configuración SGR...', config)
  }

  const handleSyncNow = () => {
    console.log('Iniciando sincronización manual de reclamos...')
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'warning'
      case 'in_progress':
        return 'primary'
      case 'closed':
        return 'success'
      case 'rejected':
        return 'danger'
      default:
        return 'neutral'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Pendiente'
      case 'in_progress':
        return 'En Proceso'
      case 'closed':
        return 'Cerrado'
      case 'rejected':
        return 'Rechazado'
      default:
        return status
    }
  }

  const getPriorityColor = (priority: string) => {
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

  const filteredClaims = selectedStatus === 'all'
    ? recentClaims
    : recentClaims.filter(claim => claim.status === selectedStatus)

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography level="h2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <AssignmentIcon sx={{ fontSize: 32 }} />
            Integración SGR - Sistema de Reclamos
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Gestión de reclamos con Sistema General de Reclamos v2.0
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startDecorator={<SyncIcon />} onClick={handleSyncNow}>
            Sincronizar Ahora
          </Button>
          <Button startDecorator={<SaveIcon />} onClick={handleSave}>
            Guardar Cambios
          </Button>
        </Box>
      </Box>

      {/* KPIs de Reclamos */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <AssignmentIcon sx={{ color: 'primary.500' }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Total Reclamos
                </Typography>
              </Box>
              <Typography level="h3">{stats.total.toLocaleString()}</Typography>
              <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                Histórico completo
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <PendingIcon sx={{ color: 'warning.500' }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Pendientes
                </Typography>
              </Box>
              <Typography level="h3">{stats.pending}</Typography>
              <Typography level="body-xs" sx={{ color: 'warning.500', mt: 0.5 }}>
                Requieren atención
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <WarningIcon sx={{ color: 'primary.500' }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  En Proceso
                </Typography>
              </Box>
              <Typography level="h3">{stats.inProgress}</Typography>
              <Typography level="body-xs" sx={{ color: 'primary.500', mt: 0.5 }}>
                En gestión activa
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <CheckCircleIcon sx={{ color: 'success.500' }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Cerrados
                </Typography>
              </Box>
              <Typography level="h3">{stats.closed}</Typography>
              <Typography level="body-xs" sx={{ color: 'success.500', mt: 0.5 }}>
                {((stats.closed / stats.total) * 100).toFixed(1)}% del total
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <ErrorIcon sx={{ color: 'danger.500' }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Rechazados
                </Typography>
              </Box>
              <Typography level="h3">{stats.rejected}</Typography>
              <Typography level="body-xs" sx={{ color: 'danger.500', mt: 0.5 }}>
                {((stats.rejected / stats.total) * 100).toFixed(1)}% del total
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Estado General */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} md={8}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography level="title-lg">Estado de Conexión</Typography>
                <Chip color="success" startDecorator={<CheckCircleIcon />}>
                  Activo
                </Chip>
              </Box>
              <Grid container spacing={2}>
                <Grid xs={6} sm={4}>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Última Sincronización</Typography>
                  <Typography level="body-sm" fontWeight="lg">{generalStats.lastSync}</Typography>
                </Grid>
                <Grid xs={6} sm={4}>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Próxima Sincronización</Typography>
                  <Typography level="body-sm" fontWeight="lg">{generalStats.nextSync}</Typography>
                </Grid>
                <Grid xs={6} sm={4}>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Sincronizados Hoy</Typography>
                  <Typography level="body-sm" fontWeight="lg" sx={{ color: 'success.500' }}>{generalStats.syncedToday}</Typography>
                </Grid>
                <Grid xs={6} sm={4}>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Errores 24h</Typography>
                  <Typography level="body-sm" fontWeight="lg" sx={{ color: 'warning.500' }}>{generalStats.errors}</Typography>
                </Grid>
                <Grid xs={6} sm={4}>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Uptime</Typography>
                  <Typography level="body-sm" fontWeight="lg" sx={{ color: 'success.500' }}>{generalStats.uptime}%</Typography>
                </Grid>
                <Grid xs={6} sm={4}>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Tiempo Respuesta Prom.</Typography>
                  <Typography level="body-sm" fontWeight="lg">{generalStats.avgResponseTime}s</Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography level="title-md" sx={{ mb: 2 }}>Acciones Rápidas</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Button variant="outlined" size="sm" fullWidth startDecorator={<SyncIcon />}>
                  Sincronizar Reclamos
                </Button>
                <Button variant="outlined" size="sm" fullWidth startDecorator={<AssignmentIcon />}>
                  Crear Nuevo Reclamo
                </Button>
                <Button variant="outlined" size="sm" fullWidth startDecorator={<BarChartIcon />}>
                  Ver Reportes
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Tabs defaultValue={0}>
        <TabList>
          <Tab>Configuración</Tab>
          <Tab>Gestión de Reclamos</Tab>
          <Tab>Reportes</Tab>
        </TabList>

        <TabPanel value={0}>
          <Card>
            <CardContent>
              <Typography level="title-lg" startDecorator={<SettingsIcon />} sx={{ mb: 3 }}>
                Configuración de Conexión SGR
              </Typography>

              <Grid container spacing={2}>
                <Grid xs={12}>
                  <FormControl>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <FormLabel>Habilitar Integración</FormLabel>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          Activar o desactivar la sincronización con SGR
                        </Typography>
                      </Box>
                      <Switch
                        checked={config.enabled}
                        onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                      />
                    </Box>
                  </FormControl>
                </Grid>

                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>URL de API SGR</FormLabel>
                    <Input
                      value={config.apiUrl}
                      onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
                    />
                  </FormControl>
                </Grid>

                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>API Key</FormLabel>
                    <Input
                      type="password"
                      value={config.apiKey}
                      onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                    />
                  </FormControl>
                </Grid>

                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Código de Empresa</FormLabel>
                    <Input
                      value={config.companyCode}
                      onChange={(e) => setConfig({ ...config, companyCode: e.target.value })}
                    />
                  </FormControl>
                </Grid>

                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Intervalo de Sincronización (minutos)</FormLabel>
                    <Input
                      type="number"
                      value={config.syncInterval}
                      onChange={(e) => setConfig({ ...config, syncInterval: parseInt(e.target.value) })}
                      slotProps={{ input: { min: 5, max: 60 } }}
                    />
                  </FormControl>
                </Grid>

                <Grid xs={12}>
                  <Alert color="primary" sx={{ mt: 2 }}>
                    <Typography level="body-sm" fontWeight="lg" sx={{ mb: 0.5 }}>
                      Información Importante
                    </Typography>
                    <Typography level="body-xs">
                      La sincronización automática obtiene nuevos reclamos del SGR cada {config.syncInterval} minutos.
                      Los cambios de estado se notifican en tiempo real mediante webhooks.
                    </Typography>
                  </Alert>
                </Grid>

                <Grid xs={12}>
                  <FormControl>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <FormLabel>Sincronización Automática</FormLabel>
                      <Switch
                        checked={config.autoSync}
                        onChange={(e) => setConfig({ ...config, autoSync: e.target.checked })}
                      />
                    </Box>
                  </FormControl>
                </Grid>

                <Grid xs={12}>
                  <FormControl>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <FormLabel>Notificar Nuevos Reclamos</FormLabel>
                      <Switch
                        checked={config.notifyNewClaims}
                        onChange={(e) => setConfig({ ...config, notifyNewClaims: e.target.checked })}
                      />
                    </Box>
                  </FormControl>
                </Grid>

                <Grid xs={12}>
                  <FormControl>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <FormLabel>Notificar Cambios de Estado</FormLabel>
                      <Switch
                        checked={config.notifyStatusChange}
                        onChange={(e) => setConfig({ ...config, notifyStatusChange: e.target.checked })}
                      />
                    </Box>
                  </FormControl>
                </Grid>

                <Grid xs={12}>
                  <FormControl>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <FormLabel>Crear Tickets Automáticamente</FormLabel>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          Crea un ticket en JR Chateam por cada nuevo reclamo
                        </Typography>
                      </Box>
                      <Switch
                        checked={config.autoAssignTickets}
                        onChange={(e) => setConfig({ ...config, autoAssignTickets: e.target.checked })}
                      />
                    </Box>
                  </FormControl>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value={1}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography level="title-lg">Reclamos Recientes</Typography>
                <FormControl sx={{ width: 200 }}>
                  <Select
                    value={selectedStatus}
                    onChange={(_, value) => setSelectedStatus(value as string)}
                    size="sm"
                  >
                    <Option value="all">Todos los estados</Option>
                    <Option value="pending">Pendientes</Option>
                    <Option value="in_progress">En Proceso</Option>
                    <Option value="closed">Cerrados</Option>
                    <Option value="rejected">Rechazados</Option>
                  </Select>
                </FormControl>
              </Box>

              <Sheet sx={{ overflow: 'auto' }}>
                <Table>
                  <thead>
                    <tr>
                      <th>Número de Reclamo</th>
                      <th>Cliente</th>
                      <th>Estado</th>
                      <th>Prioridad</th>
                      <th>Monto</th>
                      <th>Fecha Creación</th>
                      <th>Última Actualización</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClaims.map((claim) => (
                      <tr key={claim.id}>
                        <td>
                          <Typography level="body-sm" fontWeight="lg">
                            {claim.claimNumber}
                          </Typography>
                        </td>
                        <td>{claim.customerName}</td>
                        <td>
                          <Chip size="sm" color={getStatusColor(claim.status)} variant="soft">
                            {getStatusLabel(claim.status)}
                          </Chip>
                        </td>
                        <td>
                          <Chip size="sm" color={getPriorityColor(claim.priority)} variant="outlined">
                            {claim.priority}
                          </Chip>
                        </td>
                        <td>
                          <Typography level="body-sm" fontWeight="lg">
                            ${claim.amount.toLocaleString()}
                          </Typography>
                        </td>
                        <td>
                          <Typography level="body-xs">
                            {claim.createdAt}
                          </Typography>
                        </td>
                        <td>
                          <Typography level="body-xs">
                            {claim.updatedAt}
                          </Typography>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Sheet>

              {filteredClaims.length === 0 && (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    No hay reclamos con el estado seleccionado
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value={2}>
          <Card>
            <CardContent>
              <Typography level="title-lg" startDecorator={<BarChartIcon />} sx={{ mb: 3 }}>
                Reportes y Estadísticas
              </Typography>

              <Grid container spacing={2}>
                <Grid xs={12} md={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography level="title-md" sx={{ mb: 2 }}>Distribución por Estado</Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography level="body-sm">Pendientes</Typography>
                            <Typography level="body-sm" fontWeight="lg">{stats.pending} ({((stats.pending / stats.total) * 100).toFixed(1)}%)</Typography>
                          </Box>
                          <Box sx={{ height: 8, bgcolor: 'neutral.100', borderRadius: 'sm', overflow: 'hidden' }}>
                            <Box sx={{ width: `${(stats.pending / stats.total) * 100}%`, height: '100%', bgcolor: 'warning.500' }} />
                          </Box>
                        </Box>
                        <Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography level="body-sm">En Proceso</Typography>
                            <Typography level="body-sm" fontWeight="lg">{stats.inProgress} ({((stats.inProgress / stats.total) * 100).toFixed(1)}%)</Typography>
                          </Box>
                          <Box sx={{ height: 8, bgcolor: 'neutral.100', borderRadius: 'sm', overflow: 'hidden' }}>
                            <Box sx={{ width: `${(stats.inProgress / stats.total) * 100}%`, height: '100%', bgcolor: 'primary.500' }} />
                          </Box>
                        </Box>
                        <Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography level="body-sm">Cerrados</Typography>
                            <Typography level="body-sm" fontWeight="lg">{stats.closed} ({((stats.closed / stats.total) * 100).toFixed(1)}%)</Typography>
                          </Box>
                          <Box sx={{ height: 8, bgcolor: 'neutral.100', borderRadius: 'sm', overflow: 'hidden' }}>
                            <Box sx={{ width: `${(stats.closed / stats.total) * 100}%`, height: '100%', bgcolor: 'success.500' }} />
                          </Box>
                        </Box>
                        <Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography level="body-sm">Rechazados</Typography>
                            <Typography level="body-sm" fontWeight="lg">{stats.rejected} ({((stats.rejected / stats.total) * 100).toFixed(1)}%)</Typography>
                          </Box>
                          <Box sx={{ height: 8, bgcolor: 'neutral.100', borderRadius: 'sm', overflow: 'hidden' }}>
                            <Box sx={{ width: `${(stats.rejected / stats.total) * 100}%`, height: '100%', bgcolor: 'danger.500' }} />
                          </Box>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid xs={12} md={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography level="title-md" sx={{ mb: 2 }}>Métricas Clave</Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Box>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Tiempo Promedio de Resolución</Typography>
                          <Typography level="h4" sx={{ mt: 0.5 }}>4.2 días</Typography>
                        </Box>
                        <Box>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Tasa de Cierre</Typography>
                          <Typography level="h4" sx={{ mt: 0.5, color: 'success.500' }}>
                            {((stats.closed / stats.total) * 100).toFixed(1)}%
                          </Typography>
                        </Box>
                        <Box>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Tasa de Rechazo</Typography>
                          <Typography level="h4" sx={{ mt: 0.5, color: 'danger.500' }}>
                            {((stats.rejected / stats.total) * 100).toFixed(1)}%
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid xs={12}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography level="title-md" sx={{ mb: 2 }}>Resumen del Mes</Typography>
                      <Grid container spacing={2}>
                        <Grid xs={6} sm={3}>
                          <Box sx={{ textAlign: 'center', p: 2 }}>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Nuevos Reclamos</Typography>
                            <Typography level="h3" sx={{ mt: 1 }}>87</Typography>
                            <Typography level="body-xs" sx={{ color: 'success.500', mt: 0.5 }}>+12% vs mes anterior</Typography>
                          </Box>
                        </Grid>
                        <Grid xs={6} sm={3}>
                          <Box sx={{ textAlign: 'center', p: 2 }}>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Cerrados</Typography>
                            <Typography level="h3" sx={{ mt: 1, color: 'success.500' }}>102</Typography>
                            <Typography level="body-xs" sx={{ color: 'success.500', mt: 0.5 }}>+8% vs mes anterior</Typography>
                          </Box>
                        </Grid>
                        <Grid xs={6} sm={3}>
                          <Box sx={{ textAlign: 'center', p: 2 }}>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Tiempo Prom. Respuesta</Typography>
                            <Typography level="h3" sx={{ mt: 1 }}>2.1h</Typography>
                            <Typography level="body-xs" sx={{ color: 'success.500', mt: 0.5 }}>-0.3h vs mes anterior</Typography>
                          </Box>
                        </Grid>
                        <Grid xs={6} sm={3}>
                          <Box sx={{ textAlign: 'center', p: 2 }}>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Satisfacción Cliente</Typography>
                            <Typography level="h3" sx={{ mt: 1, color: 'success.500' }}>94%</Typography>
                            <Typography level="body-xs" sx={{ color: 'success.500', mt: 0.5 }}>+2% vs mes anterior</Typography>
                          </Box>
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </TabPanel>
      </Tabs>
    </Box>
  )
}
