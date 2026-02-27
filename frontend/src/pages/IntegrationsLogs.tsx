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
  Select,
  Option,
  Chip,
  Table,
  Sheet,
  Tooltip,
} from '@mui/joy'
import {
  Article as LogIcon,
  Search as SearchIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material'

interface IntegrationLog {
  id: number
  timestamp: string
  integration: 'Billie' | 'Aria Lite' | 'SmartTrack' | 'SGR' | 'Custom' | 'All'
  type: 'sync' | 'error' | 'warning' | 'info'
  message: string
  records: number
  duration: number
  details?: string
}

export default function IntegrationsLogs() {
  const [filterIntegration, setFilterIntegration] = useState<string>('All')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterDate, setFilterDate] = useState<string>('today')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const stats = {
    totalEvents: 15234,
    successRate: 99.2,
    avgDuration: 156,
    errors24h: 23,
  }

  const logs: IntegrationLog[] = [
    {
      id: 1,
      timestamp: '2025-10-13 10:45:23',
      integration: 'Billie',
      type: 'sync',
      message: 'Sincronización de contactos completada exitosamente',
      records: 245,
      duration: 18,
      details: 'Sincronizados 245 contactos, 0 errores',
    },
    {
      id: 2,
      timestamp: '2025-10-13 10:40:12',
      integration: 'Aria Lite',
      type: 'sync',
      message: 'Sincronización bidireccional de leads completada',
      records: 87,
      duration: 12,
      details: 'Creados 45 leads, actualizados 42',
    },
    {
      id: 3,
      timestamp: '2025-10-13 10:35:45',
      integration: 'SmartTrack',
      type: 'warning',
      message: 'Sincronización con retrasos - alto volumen de datos',
      records: 456,
      duration: 67,
      details: 'Procesamiento más lento de lo habitual',
    },
    {
      id: 4,
      timestamp: '2025-10-13 10:35:18',
      integration: 'SGR',
      type: 'sync',
      message: 'Reclamos actualizados - 34 casos cerrados',
      records: 34,
      duration: 12,
      details: '34 casos cerrados, 12 en proceso',
    },
    {
      id: 5,
      timestamp: '2025-10-13 10:30:45',
      integration: 'Billie',
      type: 'sync',
      message: 'Sincronización de facturas completada',
      records: 89,
      duration: 24,
      details: 'Procesadas 89 facturas',
    },
    {
      id: 6,
      timestamp: '2025-10-13 10:25:33',
      integration: 'SmartTrack',
      type: 'sync',
      message: 'Actualización de envíos en tránsito',
      records: 156,
      duration: 34,
      details: '156 envíos actualizados',
    },
    {
      id: 7,
      timestamp: '2025-10-13 10:20:12',
      integration: 'Aria Lite',
      type: 'sync',
      message: 'Sincronización de oportunidades',
      records: 44,
      duration: 15,
      details: '44 oportunidades sincronizadas',
    },
    {
      id: 8,
      timestamp: '2025-10-13 10:15:47',
      integration: 'Billie',
      type: 'sync',
      message: 'Sincronización de productos completada',
      records: 156,
      duration: 12,
      details: 'Actualizados 156 productos',
    },
    {
      id: 9,
      timestamp: '2025-10-13 10:10:23',
      integration: 'SGR',
      type: 'info',
      message: 'Verificación de estado de reclamos',
      records: 0,
      duration: 3,
      details: 'Verificación de rutina completada',
    },
    {
      id: 10,
      timestamp: '2025-10-13 10:05:15',
      integration: 'SmartTrack',
      type: 'warning',
      message: 'Tiempo de respuesta de API elevado',
      records: 234,
      duration: 45,
      details: 'API respondiendo lentamente',
    },
    {
      id: 11,
      timestamp: '2025-10-13 10:00:12',
      integration: 'Billie',
      type: 'warning',
      message: 'Algunos registros no se pudieron sincronizar',
      records: 67,
      duration: 32,
      details: '5 registros con errores de validación',
    },
    {
      id: 12,
      timestamp: '2025-10-13 09:55:47',
      integration: 'Aria Lite',
      type: 'sync',
      message: 'Sincronización de clientes completada',
      records: 123,
      duration: 18,
      details: '123 clientes actualizados',
    },
    {
      id: 13,
      timestamp: '2025-10-13 09:50:33',
      integration: 'SGR',
      type: 'sync',
      message: 'Nuevos reclamos sincronizados',
      records: 8,
      duration: 6,
      details: '8 nuevos reclamos recibidos',
    },
    {
      id: 14,
      timestamp: '2025-10-13 09:45:33',
      integration: 'Billie',
      type: 'error',
      message: 'Error de autenticación - Token expirado',
      records: 0,
      duration: 0,
      details: 'Se requiere renovar el token de API',
    },
    {
      id: 15,
      timestamp: '2025-10-13 09:40:18',
      integration: 'SmartTrack',
      type: 'sync',
      message: 'Sincronización de rutas completada',
      records: 89,
      duration: 21,
      details: '89 rutas actualizadas',
    },
    {
      id: 16,
      timestamp: '2025-10-13 09:35:45',
      integration: 'Aria Lite',
      type: 'sync',
      message: 'Actualización de pipeline de ventas',
      records: 67,
      duration: 14,
      details: '67 oportunidades en pipeline',
    },
    {
      id: 17,
      timestamp: '2025-10-13 09:30:12',
      integration: 'Custom',
      type: 'error',
      message: 'Fallo en conexión con API externa',
      records: 0,
      duration: 0,
      details: 'Error de red - timeout',
    },
    {
      id: 18,
      timestamp: '2025-10-13 09:25:33',
      integration: 'Billie',
      type: 'sync',
      message: 'Sincronización de órdenes de compra',
      records: 45,
      duration: 16,
      details: '45 órdenes procesadas',
    },
    {
      id: 19,
      timestamp: '2025-10-13 09:20:47',
      integration: 'SGR',
      type: 'info',
      message: 'Backup de datos completado',
      records: 0,
      duration: 8,
      details: 'Backup automático ejecutado',
    },
    {
      id: 20,
      timestamp: '2025-10-13 09:15:22',
      integration: 'Custom',
      type: 'error',
      message: 'Error de autenticación - Token expirado',
      records: 0,
      duration: 0,
      details: 'Credenciales inválidas',
    },
  ]

  const activityByHour = [
    { hour: '00:00', events: 45 },
    { hour: '01:00', events: 23 },
    { hour: '02:00', events: 12 },
    { hour: '03:00', events: 8 },
    { hour: '04:00', events: 15 },
    { hour: '05:00', events: 34 },
    { hour: '06:00', events: 67 },
    { hour: '07:00', events: 123 },
    { hour: '08:00', events: 234 },
    { hour: '09:00', events: 456 },
    { hour: '10:00', events: 678 },
    { hour: '11:00', events: 543 },
  ]

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'sync':
        return 'success'
      case 'error':
        return 'danger'
      case 'warning':
        return 'warning'
      case 'info':
        return 'primary'
      default:
        return 'neutral'
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'sync':
        return <CheckCircleIcon fontSize="small" />
      case 'error':
        return <ErrorIcon fontSize="small" />
      case 'warning':
        return <WarningIcon fontSize="small" />
      case 'info':
        return <InfoIcon fontSize="small" />
      default:
        return null
    }
  }

  const filteredLogs = logs.filter(log => {
    if (filterIntegration !== 'All' && log.integration !== filterIntegration) return false
    if (filterType !== 'all' && log.type !== filterType) return false
    if (searchQuery && !log.message.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage)

  const handleExportCSV = () => {
    console.log('Exportando logs a CSV...')
  }

  const handleRefresh = () => {
    console.log('Actualizando logs...')
  }

  const maxActivity = Math.max(...activityByHour.map(a => a.events))

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography level="h2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <LogIcon sx={{ fontSize: 32 }} />
            Logs de Integraciones
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Registro centralizado de todas las operaciones de integración
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startDecorator={<DownloadIcon />} onClick={handleExportCSV}>
            Exportar CSV
          </Button>
          <Button startDecorator={<RefreshIcon />} onClick={handleRefresh}>
            Actualizar
          </Button>
        </Box>
      </Box>

      {/* KPIs */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Total Eventos
              </Typography>
              <Typography level="h3">{stats.totalEvents.toLocaleString()}</Typography>
              <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                Últimos 30 días
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Tasa de Éxito
              </Typography>
              <Typography level="h3" sx={{ color: 'success.500' }}>{stats.successRate}%</Typography>
              <Typography level="body-xs" sx={{ color: 'success.500', mt: 0.5 }}>
                +0.3% vs semana pasada
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Duración Promedio
              </Typography>
              <Typography level="h3">{stats.avgDuration}ms</Typography>
              <Typography level="body-xs" sx={{ color: 'success.500', mt: 0.5 }}>
                -12ms vs semana pasada
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Errores 24h
              </Typography>
              <Typography level="h3" sx={{ color: stats.errors24h > 20 ? 'danger.500' : 'warning.500' }}>
                {stats.errors24h}
              </Typography>
              <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                0.8% del total
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Gráfico de Actividad */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography level="title-lg" sx={{ mb: 2 }}>
            Actividad por Hora (Últimas 12 horas)
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 200 }}>
            {activityByHour.map((item, idx) => (
              <Tooltip key={idx} title={`${item.hour}: ${item.events} eventos`}>
                <Box
                  sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <Box
                    sx={{
                      width: '100%',
                      height: `${(item.events / maxActivity) * 100}%`,
                      bgcolor: 'primary.500',
                      borderRadius: 'sm',
                      transition: 'all 0.3s',
                      '&:hover': {
                        bgcolor: 'primary.600',
                        transform: 'scaleY(1.05)',
                      },
                    }}
                  />
                  <Typography level="body-xs" sx={{ mt: 1, color: 'text.tertiary' }}>
                    {item.hour.split(':')[0]}h
                  </Typography>
                </Box>
              </Tooltip>
            ))}
          </Box>
        </CardContent>
      </Card>

      {/* Filtros */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="flex-end">
            <Grid xs={12} sm={6} md={3}>
              <FormControl>
                <FormLabel>Integración</FormLabel>
                <Select
                  value={filterIntegration}
                  onChange={(_, value) => setFilterIntegration(value as string)}
                  size="sm"
                  startDecorator={<FilterIcon />}
                >
                  <Option value="All">Todas</Option>
                  <Option value="Billie">Billie</Option>
                  <Option value="Aria Lite">Aria Lite</Option>
                  <Option value="SmartTrack">SmartTrack</Option>
                  <Option value="SGR">SGR</Option>
                  <Option value="Custom">Custom</Option>
                </Select>
              </FormControl>
            </Grid>
            <Grid xs={12} sm={6} md={3}>
              <FormControl>
                <FormLabel>Tipo de Evento</FormLabel>
                <Select
                  value={filterType}
                  onChange={(_, value) => setFilterType(value as string)}
                  size="sm"
                >
                  <Option value="all">Todos</Option>
                  <Option value="sync">Sync</Option>
                  <Option value="error">Error</Option>
                  <Option value="warning">Warning</Option>
                  <Option value="info">Info</Option>
                </Select>
              </FormControl>
            </Grid>
            <Grid xs={12} sm={6} md={3}>
              <FormControl>
                <FormLabel>Período</FormLabel>
                <Select
                  value={filterDate}
                  onChange={(_, value) => setFilterDate(value as string)}
                  size="sm"
                >
                  <Option value="today">Hoy</Option>
                  <Option value="yesterday">Ayer</Option>
                  <Option value="week">Última semana</Option>
                  <Option value="month">Último mes</Option>
                </Select>
              </FormControl>
            </Grid>
            <Grid xs={12} sm={6} md={3}>
              <FormControl>
                <FormLabel>Buscar</FormLabel>
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar en mensajes..."
                  size="sm"
                  startDecorator={<SearchIcon />}
                />
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Tabla de Logs */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography level="title-lg">
              Registro de Eventos ({filteredLogs.length})
            </Typography>
            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
              Página {currentPage} de {totalPages}
            </Typography>
          </Box>

          <Sheet sx={{ overflow: 'auto' }}>
            <Table>
              <thead>
                <tr>
                  <th style={{ width: 140 }}>Timestamp</th>
                  <th style={{ width: 120 }}>Integración</th>
                  <th style={{ width: 100 }}>Tipo</th>
                  <th>Mensaje</th>
                  <th style={{ width: 80 }}>Registros</th>
                  <th style={{ width: 80 }}>Duración</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLogs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <Typography level="body-xs">
                        {log.timestamp}
                      </Typography>
                    </td>
                    <td>
                      <Chip size="sm" variant="outlined">
                        {log.integration}
                      </Chip>
                    </td>
                    <td>
                      <Chip
                        size="sm"
                        color={getTypeColor(log.type)}
                        variant="soft"
                        startDecorator={getTypeIcon(log.type)}
                      >
                        {log.type}
                      </Chip>
                    </td>
                    <td>
                      <Typography level="body-sm">
                        {log.message}
                      </Typography>
                      {log.details && (
                        <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                          {log.details}
                        </Typography>
                      )}
                    </td>
                    <td>
                      <Typography level="body-sm" fontWeight="lg">
                        {log.records > 0 ? log.records : '-'}
                      </Typography>
                    </td>
                    <td>
                      <Typography level="body-sm">
                        {log.duration > 0 ? `${log.duration}s` : '-'}
                      </Typography>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Sheet>

          {paginatedLogs.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                No se encontraron logs con los filtros seleccionados
              </Typography>
            </Box>
          )}

          {/* Paginación */}
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 2 }}>
              <Button
                size="sm"
                variant="outlined"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
              >
                Anterior
              </Button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const pageNum = currentPage <= 3 ? i + 1 : currentPage - 2 + i
                if (pageNum > totalPages) return null
                return (
                  <Button
                    key={pageNum}
                    size="sm"
                    variant={currentPage === pageNum ? 'solid' : 'outlined'}
                    onClick={() => setCurrentPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                )
              })}
              <Button
                size="sm"
                variant="outlined"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
              >
                Siguiente
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}
