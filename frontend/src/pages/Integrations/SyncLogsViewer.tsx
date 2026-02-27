import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  Chip,
  Sheet,
  Table,
  Typography,
  Input,
  FormControl,
  FormLabel,
  Select,
  Option,
  Alert,
  CircularProgress,
  Stack,
  Modal,
  ModalDialog,
  ModalClose,
  Textarea
} from '@mui/joy';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../../services/api';

interface SyncLog {
  id: number;
  connection_id: number;
  sync_type: 'inbound' | 'outbound';
  entity_type: string;
  entity_id: number | null;
  status: 'success' | 'error' | 'warning';
  records_processed: number;
  records_failed: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  metadata: Record<string, any> | null;
}

interface IntegrationConnection {
  id: number;
  name: string;
  integration_type: string;
}

interface Filters {
  connection_id: string;
  sync_type: string;
  entity_type: string;
  status: string;
  date_from: string;
  date_to: string;
  search: string;
}

const SyncLogsViewer: React.FC = () => {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<SyncLog | null>(null);

  const [filters, setFilters] = useState<Filters>({
    connection_id: 'all',
    sync_type: 'all',
    entity_type: 'all',
    status: 'all',
    date_from: '',
    date_to: '',
    search: ''
  });

  useEffect(() => {
    fetchConnections();
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [page, filters]);

  const fetchConnections = async () => {
    try {
      const { data } = await api.get('/integrations/connections');
      setConnections(data);
    } catch (error: any) {
      toast.error('Error al cargar conexiones: ' + (error.response?.data?.message || error.message));
    }
  };

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: 20,
        ...(filters.connection_id !== 'all' && { connection_id: filters.connection_id }),
        ...(filters.sync_type !== 'all' && { sync_type: filters.sync_type }),
        ...(filters.entity_type !== 'all' && { entity_type: filters.entity_type }),
        ...(filters.status !== 'all' && { status: filters.status }),
        ...(filters.date_from && { date_from: filters.date_from }),
        ...(filters.date_to && { date_to: filters.date_to }),
        ...(filters.search && { search: filters.search })
      };

      const { data } = await api.get('/integrations/sync-logs', { params });
      setLogs(data.logs);
      setTotalPages(data.totalPages);
    } catch (error: any) {
      toast.error('Error al cargar logs: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    setFilters({
      connection_id: 'all',
      sync_type: 'all',
      entity_type: 'all',
      status: 'all',
      date_from: '',
      date_to: '',
      search: ''
    });
    setPage(1);
  };

  const handleShowDetails = (log: SyncLog) => {
    setSelectedLog(log);
    setDetailsModalOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'success';
      case 'error':
        return 'danger';
      case 'warning':
        return 'warning';
      default:
        return 'neutral';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <SuccessIcon />;
      case 'error':
        return <ErrorIcon />;
      case 'warning':
        return <WarningIcon />;
      default:
        return <InfoIcon />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-ES');
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}min`;
  };

  const getConnectionName = (connectionId: number) => {
    const connection = connections.find(c => c.id === connectionId);
    return connection ? connection.name : `ID: ${connectionId}`;
  };

  const calculateSuccessRate = () => {
    if (logs.length === 0) return 0;
    const successCount = logs.filter(log => log.status === 'success').length;
    return ((successCount / logs.length) * 100).toFixed(1);
  };

  const getTotalRecordsProcessed = () => {
    return logs.reduce((sum, log) => sum + log.records_processed, 0);
  };

  const getTotalRecordsFailed = () => {
    return logs.reduce((sum, log) => sum + log.records_failed, 0);
  };

  if (loading && page === 1) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography level="h2">Logs de Sincronización</Typography>
        <Button
          startDecorator={<RefreshIcon />}
          variant="outlined"
          onClick={() => fetchLogs()}
        >
          Actualizar
        </Button>
      </Stack>

      {/* Statistics Cards */}
      <Stack direction="row" spacing={2} mb={3}>
        <Card sx={{ flex: 1 }}>
          <Typography level="body-sm" textColor="text.secondary">
            Tasa de Éxito
          </Typography>
          <Typography level="h3" color="success">
            {calculateSuccessRate()}%
          </Typography>
        </Card>
        <Card sx={{ flex: 1 }}>
          <Typography level="body-sm" textColor="text.secondary">
            Registros Procesados
          </Typography>
          <Typography level="h3" color="primary">
            {getTotalRecordsProcessed()}
          </Typography>
        </Card>
        <Card sx={{ flex: 1 }}>
          <Typography level="body-sm" textColor="text.secondary">
            Registros Fallidos
          </Typography>
          <Typography level="h3" color="danger">
            {getTotalRecordsFailed()}
          </Typography>
        </Card>
        <Card sx={{ flex: 1 }}>
          <Typography level="body-sm" textColor="text.secondary">
            Total Sincronizaciones
          </Typography>
          <Typography level="h3">
            {logs.length}
          </Typography>
        </Card>
      </Stack>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <Stack direction="row" spacing={2} flexWrap="wrap">
          <FormControl sx={{ minWidth: 200 }}>
            <FormLabel>Conexión</FormLabel>
            <Select
              value={filters.connection_id}
              onChange={(_, value) => setFilters({ ...filters, connection_id: value! })}
            >
              <Option value="all">Todas</Option>
              {connections.map((conn) => (
                <Option key={conn.id} value={conn.id.toString()}>
                  {conn.name}
                </Option>
              ))}
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 150 }}>
            <FormLabel>Tipo de Sync</FormLabel>
            <Select
              value={filters.sync_type}
              onChange={(_, value) => setFilters({ ...filters, sync_type: value! })}
            >
              <Option value="all">Todos</Option>
              <Option value="inbound">Inbound</Option>
              <Option value="outbound">Outbound</Option>
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 150 }}>
            <FormLabel>Entidad</FormLabel>
            <Select
              value={filters.entity_type}
              onChange={(_, value) => setFilters({ ...filters, entity_type: value! })}
            >
              <Option value="all">Todas</Option>
              <Option value="contact">Contacto</Option>
              <Option value="ticket">Ticket</Option>
              <Option value="message">Mensaje</Option>
              <Option value="user">Usuario</Option>
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 150 }}>
            <FormLabel>Estado</FormLabel>
            <Select
              value={filters.status}
              onChange={(_, value) => setFilters({ ...filters, status: value! })}
            >
              <Option value="all">Todos</Option>
              <Option value="success">Éxito</Option>
              <Option value="error">Error</Option>
              <Option value="warning">Advertencia</Option>
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 180 }}>
            <FormLabel>Fecha Desde</FormLabel>
            <Input
              type="date"
              value={filters.date_from}
              onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
            />
          </FormControl>

          <FormControl sx={{ minWidth: 180 }}>
            <FormLabel>Fecha Hasta</FormLabel>
            <Input
              type="date"
              value={filters.date_to}
              onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
            />
          </FormControl>

          <FormControl sx={{ minWidth: 250, flex: 1 }}>
            <FormLabel>Buscar</FormLabel>
            <Input
              placeholder="Buscar en logs..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              startDecorator={<SearchIcon />}
            />
          </FormControl>

          <Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
            <Button
              variant="outlined"
              color="neutral"
              onClick={handleResetFilters}
            >
              Limpiar
            </Button>
          </Box>
        </Stack>
      </Card>

      {/* Logs Table */}
      {logs.length === 0 ? (
        <Alert color="neutral">
          No se encontraron logs con los filtros aplicados.
        </Alert>
      ) : (
        <>
          <Sheet variant="outlined" sx={{ borderRadius: 'sm', overflow: 'auto' }}>
            <Table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Conexión</th>
                  <th>Tipo</th>
                  <th>Entidad</th>
                  <th>Estado</th>
                  <th>Procesados</th>
                  <th>Fallidos</th>
                  <th>Duración</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDate(log.started_at)}</td>
                    <td>{getConnectionName(log.connection_id)}</td>
                    <td>
                      <Chip
                        size="sm"
                        variant="soft"
                        color={log.sync_type === 'inbound' ? 'primary' : 'success'}
                      >
                        {log.sync_type === 'inbound' ? 'Entrada' : 'Salida'}
                      </Chip>
                    </td>
                    <td>
                      <Chip size="sm" variant="outlined">
                        {log.entity_type}
                      </Chip>
                    </td>
                    <td>
                      <Chip
                        size="sm"
                        variant="soft"
                        color={getStatusColor(log.status)}
                        startDecorator={getStatusIcon(log.status)}
                      >
                        {log.status}
                      </Chip>
                    </td>
                    <td>{log.records_processed}</td>
                    <td>
                      {log.records_failed > 0 ? (
                        <Chip size="sm" color="danger" variant="soft">
                          {log.records_failed}
                        </Chip>
                      ) : (
                        '0'
                      )}
                    </td>
                    <td>{formatDuration(log.duration_ms)}</td>
                    <td>
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => handleShowDetails(log)}
                      >
                        Ver Detalles
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Sheet>

          {/* Pagination */}
          <Stack direction="row" justifyContent="center" spacing={2} mt={3}>
            <Button
              variant="outlined"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </Button>
            <Typography level="body-md" sx={{ display: 'flex', alignItems: 'center' }}>
              Página {page} de {totalPages}
            </Typography>
            <Button
              variant="outlined"
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
            >
              Siguiente
            </Button>
          </Stack>
        </>
      )}

      {/* Details Modal */}
      <Modal open={detailsModalOpen} onClose={() => setDetailsModalOpen(false)}>
        <ModalDialog sx={{ width: 700, maxWidth: '90vw' }}>
          <ModalClose />
          <Typography level="h4" mb={2}>
            Detalles del Log de Sincronización
          </Typography>

          {selectedLog && (
            <Stack spacing={2}>
              <Stack direction="row" spacing={2}>
                <Box sx={{ flex: 1 }}>
                  <Typography level="body-sm" textColor="text.secondary">
                    ID
                  </Typography>
                  <Typography level="body-md">{selectedLog.id}</Typography>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography level="body-sm" textColor="text.secondary">
                    Conexión
                  </Typography>
                  <Typography level="body-md">
                    {getConnectionName(selectedLog.connection_id)}
                  </Typography>
                </Box>
              </Stack>

              <Stack direction="row" spacing={2}>
                <Box sx={{ flex: 1 }}>
                  <Typography level="body-sm" textColor="text.secondary">
                    Tipo
                  </Typography>
                  <Chip size="sm" variant="soft">
                    {selectedLog.sync_type}
                  </Chip>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography level="body-sm" textColor="text.secondary">
                    Entidad
                  </Typography>
                  <Chip size="sm" variant="outlined">
                    {selectedLog.entity_type}
                  </Chip>
                </Box>
              </Stack>

              <Stack direction="row" spacing={2}>
                <Box sx={{ flex: 1 }}>
                  <Typography level="body-sm" textColor="text.secondary">
                    Inicio
                  </Typography>
                  <Typography level="body-md">{formatDate(selectedLog.started_at)}</Typography>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography level="body-sm" textColor="text.secondary">
                    Fin
                  </Typography>
                  <Typography level="body-md">
                    {selectedLog.completed_at ? formatDate(selectedLog.completed_at) : 'En progreso'}
                  </Typography>
                </Box>
              </Stack>

              <Stack direction="row" spacing={2}>
                <Box sx={{ flex: 1 }}>
                  <Typography level="body-sm" textColor="text.secondary">
                    Registros Procesados
                  </Typography>
                  <Typography level="h4" color="primary">
                    {selectedLog.records_processed}
                  </Typography>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography level="body-sm" textColor="text.secondary">
                    Registros Fallidos
                  </Typography>
                  <Typography level="h4" color="danger">
                    {selectedLog.records_failed}
                  </Typography>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography level="body-sm" textColor="text.secondary">
                    Duración
                  </Typography>
                  <Typography level="h4">
                    {formatDuration(selectedLog.duration_ms)}
                  </Typography>
                </Box>
              </Stack>

              {selectedLog.error_message && (
                <Box>
                  <Typography level="body-sm" textColor="text.secondary" mb={1}>
                    Mensaje de Error
                  </Typography>
                  <Alert color="danger">
                    {selectedLog.error_message}
                  </Alert>
                </Box>
              )}

              {selectedLog.metadata && (
                <Box>
                  <Typography level="body-sm" textColor="text.secondary" mb={1}>
                    Metadata (JSON)
                  </Typography>
                  <Textarea
                    value={JSON.stringify(selectedLog.metadata, null, 2)}
                    readOnly
                    minRows={6}
                    sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
                  />
                </Box>
              )}
            </Stack>
          )}
        </ModalDialog>
      </Modal>
    </Box>
  );
};

export default SyncLogsViewer;
