import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  Chip,
  Sheet,
  Table,
  Typography,
  FormControl,
  FormLabel,
  Select,
  Option,
  Alert,
  CircularProgress,
  Stack,
  Grid,
  LinearProgress
} from '@mui/joy';
import {
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Sync as SyncIcon,
  Speed as SpeedIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../../services/api';

interface IntegrationConnection {
  id: number;
  name: string;
  integration_type: string;
  is_active: boolean;
}

interface AnalyticsData {
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  pendingSyncs: number;
  successRate: number;
  totalRecordsProcessed: number;
  totalRecordsFailed: number;
  averageSyncDuration: number;
  syncsByType: {
    inbound: number;
    outbound: number;
  };
  syncsByEntity: Array<{
    entity_type: string;
    count: number;
  }>;
  recentErrors: Array<{
    date: string;
    connection: string;
    entity: string;
    error: string;
  }>;
  syncTrend: Array<{
    date: string;
    success: number;
    failed: number;
  }>;
  topPerformingConnections: Array<{
    connection: string;
    successRate: number;
    totalSyncs: number;
  }>;
  entityMappingStats: {
    total: number;
    synced: number;
    pending: number;
    failed: number;
  };
  webhookStats: {
    total: number;
    processed: number;
    pending: number;
    failed: number;
  };
}

const IntegrationsAnalytics: React.FC = () => {
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<string>('7days');
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConnections();
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [selectedConnection, timeRange]);

  const fetchConnections = async () => {
    try {
      const { data } = await api.get('/integrations/connections');
      setConnections(data);
    } catch (error: any) {
      toast.error('Error al cargar conexiones: ' + (error.response?.data?.message || error.message));
    }
  };

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const params = {
        time_range: timeRange,
        ...(selectedConnection !== 'all' && { connection_id: selectedConnection })
      };

      const { data } = await api.get('/integrations/analytics', { params });
      setAnalytics(data);
    } catch (error: any) {
      toast.error('Error al cargar analytics: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('es-ES').format(num);
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}min`;
  };

  const getEntityTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      contact: 'Contactos',
      ticket: 'Tickets',
      message: 'Mensajes',
      user: 'Usuarios',
      company: 'Empresas',
      queue: 'Colas',
      tag: 'Etiquetas',
      campaign: 'Campañas'
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (!analytics) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert color="danger">Error al cargar los datos de analytics.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography level="h2">Analytics de Integraciones</Typography>
        <Button
          startDecorator={<RefreshIcon />}
          variant="outlined"
          onClick={() => fetchAnalytics()}
        >
          Actualizar
        </Button>
      </Stack>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <Stack direction="row" spacing={2}>
          <FormControl sx={{ minWidth: 250 }}>
            <FormLabel>Conexión</FormLabel>
            <Select
              value={selectedConnection}
              onChange={(_, value) => setSelectedConnection(value!)}
            >
              <Option value="all">Todas las Conexiones</Option>
              {connections.map((conn) => (
                <Option key={conn.id} value={conn.id.toString()}>
                  {conn.name} ({conn.integration_type})
                </Option>
              ))}
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 200 }}>
            <FormLabel>Período de Tiempo</FormLabel>
            <Select
              value={timeRange}
              onChange={(_, value) => setTimeRange(value!)}
            >
              <Option value="24hours">Últimas 24 horas</Option>
              <Option value="7days">Últimos 7 días</Option>
              <Option value="30days">Últimos 30 días</Option>
              <Option value="90days">Últimos 90 días</Option>
            </Select>
          </FormControl>
        </Stack>
      </Card>

      {/* Key Metrics Cards */}
      <Typography level="h4" mb={2}>Métricas Principales</Typography>
      <Grid container spacing={2} mb={4}>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <Stack spacing={1}>
              <Typography level="body-sm" textColor="text.secondary">
                Total Sincronizaciones
              </Typography>
              <Typography level="h3" startDecorator={<SyncIcon />}>
                {formatNumber(analytics.totalSyncs)}
              </Typography>
              <Typography level="body-xs" textColor="text.tertiary">
                En el período seleccionado
              </Typography>
            </Stack>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={3}>
          <Card>
            <Stack spacing={1}>
              <Typography level="body-sm" textColor="text.secondary">
                Tasa de Éxito
              </Typography>
              <Typography
                level="h3"
                color={analytics.successRate >= 90 ? 'success' : analytics.successRate >= 70 ? 'warning' : 'danger'}
                startDecorator={analytics.successRate >= 90 ? <TrendingUpIcon /> : <TrendingDownIcon />}
              >
                {analytics.successRate.toFixed(1)}%
              </Typography>
              <LinearProgress
                determinate
                value={analytics.successRate}
                color={analytics.successRate >= 90 ? 'success' : analytics.successRate >= 70 ? 'warning' : 'danger'}
              />
            </Stack>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={3}>
          <Card>
            <Stack spacing={1}>
              <Typography level="body-sm" textColor="text.secondary">
                Registros Procesados
              </Typography>
              <Typography level="h3" color="primary">
                {formatNumber(analytics.totalRecordsProcessed)}
              </Typography>
              <Typography level="body-xs" color="danger">
                {formatNumber(analytics.totalRecordsFailed)} fallidos
              </Typography>
            </Stack>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={3}>
          <Card>
            <Stack spacing={1}>
              <Typography level="body-sm" textColor="text.secondary">
                Duración Promedio
              </Typography>
              <Typography level="h3" startDecorator={<SpeedIcon />}>
                {formatDuration(analytics.averageSyncDuration)}
              </Typography>
              <Typography level="body-xs" textColor="text.tertiary">
                Por sincronización
              </Typography>
            </Stack>
          </Card>
        </Grid>
      </Grid>

      {/* Status Distribution */}
      <Grid container spacing={2} mb={4}>
        <Grid xs={12} md={6}>
          <Card>
            <Typography level="h4" mb={2}>Distribución de Estado</Typography>
            <Stack spacing={2}>
              <Box>
                <Stack direction="row" justifyContent="space-between" mb={0.5}>
                  <Typography level="body-sm">Exitosos</Typography>
                  <Chip size="sm" color="success" variant="soft">
                    {formatNumber(analytics.successfulSyncs)}
                  </Chip>
                </Stack>
                <LinearProgress
                  determinate
                  value={(analytics.successfulSyncs / analytics.totalSyncs) * 100}
                  color="success"
                />
              </Box>

              <Box>
                <Stack direction="row" justifyContent="space-between" mb={0.5}>
                  <Typography level="body-sm">Fallidos</Typography>
                  <Chip size="sm" color="danger" variant="soft">
                    {formatNumber(analytics.failedSyncs)}
                  </Chip>
                </Stack>
                <LinearProgress
                  determinate
                  value={(analytics.failedSyncs / analytics.totalSyncs) * 100}
                  color="danger"
                />
              </Box>

              <Box>
                <Stack direction="row" justifyContent="space-between" mb={0.5}>
                  <Typography level="body-sm">Pendientes</Typography>
                  <Chip size="sm" color="warning" variant="soft">
                    {formatNumber(analytics.pendingSyncs)}
                  </Chip>
                </Stack>
                <LinearProgress
                  determinate
                  value={(analytics.pendingSyncs / analytics.totalSyncs) * 100}
                  color="warning"
                />
              </Box>
            </Stack>
          </Card>
        </Grid>

        <Grid xs={12} md={6}>
          <Card>
            <Typography level="h4" mb={2}>Tipo de Sincronización</Typography>
            <Stack spacing={2}>
              <Box>
                <Stack direction="row" justifyContent="space-between" mb={0.5}>
                  <Typography level="body-sm">Inbound (Entrante)</Typography>
                  <Chip size="sm" color="primary" variant="soft">
                    {formatNumber(analytics.syncsByType.inbound)}
                  </Chip>
                </Stack>
                <LinearProgress
                  determinate
                  value={(analytics.syncsByType.inbound / analytics.totalSyncs) * 100}
                  color="primary"
                />
              </Box>

              <Box>
                <Stack direction="row" justifyContent="space-between" mb={0.5}>
                  <Typography level="body-sm">Outbound (Saliente)</Typography>
                  <Chip size="sm" color="success" variant="soft">
                    {formatNumber(analytics.syncsByType.outbound)}
                  </Chip>
                </Stack>
                <LinearProgress
                  determinate
                  value={(analytics.syncsByType.outbound / analytics.totalSyncs) * 100}
                  color="success"
                />
              </Box>
            </Stack>
          </Card>
        </Grid>
      </Grid>

      {/* Syncs by Entity Type */}
      <Typography level="h4" mb={2}>Sincronizaciones por Tipo de Entidad</Typography>
      <Card sx={{ mb: 4 }}>
        <Sheet variant="outlined" sx={{ borderRadius: 'sm', overflow: 'auto' }}>
          <Table>
            <thead>
              <tr>
                <th>Tipo de Entidad</th>
                <th>Total Sincronizaciones</th>
                <th>Porcentaje</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {analytics.syncsByEntity.map((item) => (
                <tr key={item.entity_type}>
                  <td>
                    <Chip size="sm" variant="outlined">
                      {getEntityTypeLabel(item.entity_type)}
                    </Chip>
                  </td>
                  <td>{formatNumber(item.count)}</td>
                  <td>{((item.count / analytics.totalSyncs) * 100).toFixed(1)}%</td>
                  <td>
                    <LinearProgress
                      determinate
                      value={(item.count / analytics.totalSyncs) * 100}
                      sx={{ width: 200 }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Sheet>
      </Card>

      {/* Top Performing Connections */}
      <Typography level="h4" mb={2}>Conexiones con Mejor Rendimiento</Typography>
      <Card sx={{ mb: 4 }}>
        <Sheet variant="outlined" sx={{ borderRadius: 'sm', overflow: 'auto' }}>
          <Table>
            <thead>
              <tr>
                <th>Conexión</th>
                <th>Total Sincronizaciones</th>
                <th>Tasa de Éxito</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {analytics.topPerformingConnections.map((item, index) => (
                <tr key={index}>
                  <td>{item.connection}</td>
                  <td>{formatNumber(item.totalSyncs)}</td>
                  <td>
                    <Chip
                      size="sm"
                      color={item.successRate >= 90 ? 'success' : item.successRate >= 70 ? 'warning' : 'danger'}
                      variant="soft"
                      startDecorator={item.successRate >= 90 ? <SuccessIcon /> : <ErrorIcon />}
                    >
                      {item.successRate.toFixed(1)}%
                    </Chip>
                  </td>
                  <td>
                    <LinearProgress
                      determinate
                      value={item.successRate}
                      color={item.successRate >= 90 ? 'success' : item.successRate >= 70 ? 'warning' : 'danger'}
                      sx={{ width: 200 }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Sheet>
      </Card>

      {/* Additional Stats */}
      <Grid container spacing={2} mb={4}>
        <Grid xs={12} md={6}>
          <Card>
            <Typography level="h4" mb={2}>Estadísticas de Mapeo de Entidades</Typography>
            <Stack spacing={2}>
              <Stack direction="row" justifyContent="space-between">
                <Typography level="body-sm">Total Mapeos</Typography>
                <Typography level="h4">{formatNumber(analytics.entityMappingStats.total)}</Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography level="body-sm">Sincronizados</Typography>
                <Chip size="sm" color="success" variant="soft">
                  {formatNumber(analytics.entityMappingStats.synced)}
                </Chip>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography level="body-sm">Pendientes</Typography>
                <Chip size="sm" color="warning" variant="soft">
                  {formatNumber(analytics.entityMappingStats.pending)}
                </Chip>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography level="body-sm">Fallidos</Typography>
                <Chip size="sm" color="danger" variant="soft">
                  {formatNumber(analytics.entityMappingStats.failed)}
                </Chip>
              </Stack>
            </Stack>
          </Card>
        </Grid>

        <Grid xs={12} md={6}>
          <Card>
            <Typography level="h4" mb={2}>Estadísticas de Webhooks</Typography>
            <Stack spacing={2}>
              <Stack direction="row" justifyContent="space-between">
                <Typography level="body-sm">Total Eventos</Typography>
                <Typography level="h4">{formatNumber(analytics.webhookStats.total)}</Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography level="body-sm">Procesados</Typography>
                <Chip size="sm" color="success" variant="soft">
                  {formatNumber(analytics.webhookStats.processed)}
                </Chip>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography level="body-sm">Pendientes</Typography>
                <Chip size="sm" color="warning" variant="soft">
                  {formatNumber(analytics.webhookStats.pending)}
                </Chip>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography level="body-sm">Fallidos</Typography>
                <Chip size="sm" color="danger" variant="soft">
                  {formatNumber(analytics.webhookStats.failed)}
                </Chip>
              </Stack>
            </Stack>
          </Card>
        </Grid>
      </Grid>

      {/* Recent Errors */}
      {analytics.recentErrors.length > 0 && (
        <>
          <Typography level="h4" mb={2}>Errores Recientes</Typography>
          <Card>
            <Sheet variant="outlined" sx={{ borderRadius: 'sm', overflow: 'auto' }}>
              <Table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Conexión</th>
                    <th>Entidad</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.recentErrors.slice(0, 10).map((error, index) => (
                    <tr key={index}>
                      <td>{new Date(error.date).toLocaleString('es-ES')}</td>
                      <td>{error.connection}</td>
                      <td>
                        <Chip size="sm" variant="outlined">
                          {getEntityTypeLabel(error.entity)}
                        </Chip>
                      </td>
                      <td>
                        <Typography level="body-sm" noWrap sx={{ maxWidth: 400 }}>
                          {error.error}
                        </Typography>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Sheet>
          </Card>
        </>
      )}
    </Box>
  );
};

export default IntegrationsAnalytics;
