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
  Textarea,
  Tabs,
  TabList,
  Tab,
  TabPanel
} from '@mui/joy';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Pending as PendingIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../../services/api';

interface WebhookEvent {
  id: number;
  connection_id: number;
  event_type: string;
  payload: Record<string, any>;
  headers: Record<string, any>;
  status: 'pending' | 'processed' | 'failed';
  processed_at: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
}

interface IntegrationConnection {
  id: number;
  name: string;
  integration_type: string;
}

interface Filters {
  connection_id: string;
  event_type: string;
  status: string;
  date_from: string;
  date_to: string;
  search: string;
}

const WebhookEventsViewer: React.FC = () => {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<WebhookEvent | null>(null);

  const [filters, setFilters] = useState<Filters>({
    connection_id: 'all',
    event_type: 'all',
    status: 'all',
    date_from: '',
    date_to: '',
    search: ''
  });

  useEffect(() => {
    fetchConnections();
  }, []);

  useEffect(() => {
    fetchEvents();
    // Auto-refresh every 10 seconds
    const interval = setInterval(() => {
      fetchEvents();
    }, 10000);

    return () => clearInterval(interval);
  }, [page, filters]);

  const fetchConnections = async () => {
    try {
      const { data } = await api.get('/integrations/connections');
      setConnections(data);
    } catch (error: any) {
      toast.error('Error al cargar conexiones: ' + (error.response?.data?.message || error.message));
    }
  };

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: 20,
        ...(filters.connection_id !== 'all' && { connection_id: filters.connection_id }),
        ...(filters.event_type !== 'all' && { event_type: filters.event_type }),
        ...(filters.status !== 'all' && { status: filters.status }),
        ...(filters.date_from && { date_from: filters.date_from }),
        ...(filters.date_to && { date_to: filters.date_to }),
        ...(filters.search && { search: filters.search })
      };

      const { data } = await api.get('/integrations/webhook-events', { params });
      setEvents(data.events);
      setTotalPages(data.totalPages);
    } catch (error: any) {
      toast.error('Error al cargar eventos: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    setFilters({
      connection_id: 'all',
      event_type: 'all',
      status: 'all',
      date_from: '',
      date_to: '',
      search: ''
    });
    setPage(1);
  };

  const handleShowDetails = (event: WebhookEvent) => {
    setSelectedEvent(event);
    setDetailsModalOpen(true);
  };

  const handleRetryEvent = async (eventId: number) => {
    try {
      await api.post(`/integrations/webhook-events/${eventId}/retry`);
      toast.success('Evento reprocesado exitosamente');
      fetchEvents();
    } catch (error: any) {
      toast.error('Error al reprocesar evento: ' + (error.response?.data?.message || error.message));
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processed':
        return 'success';
      case 'failed':
        return 'danger';
      case 'pending':
        return 'warning';
      default:
        return 'neutral';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processed':
        return <SuccessIcon />;
      case 'failed':
        return <ErrorIcon />;
      case 'pending':
        return <PendingIcon />;
      default:
        return <InfoIcon />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-ES');
  };

  const getConnectionName = (connectionId: number) => {
    const connection = connections.find(c => c.id === connectionId);
    return connection ? connection.name : `ID: ${connectionId}`;
  };

  const getEventTypeLabel = (eventType: string) => {
    const labels: Record<string, string> = {
      'contact.created': 'Contacto Creado',
      'contact.updated': 'Contacto Actualizado',
      'ticket.created': 'Ticket Creado',
      'ticket.updated': 'Ticket Actualizado',
      'ticket.closed': 'Ticket Cerrado',
      'message.sent': 'Mensaje Enviado',
      'message.received': 'Mensaje Recibido',
      'user.created': 'Usuario Creado',
      'user.updated': 'Usuario Actualizado'
    };
    return labels[eventType] || eventType;
  };

  const getStatusCounts = () => {
    return {
      processed: events.filter(e => e.status === 'processed').length,
      failed: events.filter(e => e.status === 'failed').length,
      pending: events.filter(e => e.status === 'pending').length
    };
  };

  const statusCounts = getStatusCounts();

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
        <Typography level="h2">Eventos de Webhook</Typography>
        <Button
          startDecorator={<RefreshIcon />}
          variant="outlined"
          onClick={() => fetchEvents()}
        >
          Actualizar
        </Button>
      </Stack>

      {/* Statistics Cards */}
      <Stack direction="row" spacing={2} mb={3}>
        <Card sx={{ flex: 1 }}>
          <Typography level="body-sm" textColor="text.secondary">
            Procesados
          </Typography>
          <Typography level="h3" color="success">
            {statusCounts.processed}
          </Typography>
        </Card>
        <Card sx={{ flex: 1 }}>
          <Typography level="body-sm" textColor="text.secondary">
            Pendientes
          </Typography>
          <Typography level="h3" color="warning">
            {statusCounts.pending}
          </Typography>
        </Card>
        <Card sx={{ flex: 1 }}>
          <Typography level="body-sm" textColor="text.secondary">
            Fallidos
          </Typography>
          <Typography level="h3" color="danger">
            {statusCounts.failed}
          </Typography>
        </Card>
        <Card sx={{ flex: 1 }}>
          <Typography level="body-sm" textColor="text.secondary">
            Total Eventos
          </Typography>
          <Typography level="h3">
            {events.length}
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

          <FormControl sx={{ minWidth: 200 }}>
            <FormLabel>Tipo de Evento</FormLabel>
            <Select
              value={filters.event_type}
              onChange={(_, value) => setFilters({ ...filters, event_type: value! })}
            >
              <Option value="all">Todos</Option>
              <Option value="contact.created">Contacto Creado</Option>
              <Option value="contact.updated">Contacto Actualizado</Option>
              <Option value="ticket.created">Ticket Creado</Option>
              <Option value="ticket.updated">Ticket Actualizado</Option>
              <Option value="ticket.closed">Ticket Cerrado</Option>
              <Option value="message.sent">Mensaje Enviado</Option>
              <Option value="message.received">Mensaje Recibido</Option>
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 150 }}>
            <FormLabel>Estado</FormLabel>
            <Select
              value={filters.status}
              onChange={(_, value) => setFilters({ ...filters, status: value! })}
            >
              <Option value="all">Todos</Option>
              <Option value="processed">Procesado</Option>
              <Option value="pending">Pendiente</Option>
              <Option value="failed">Fallido</Option>
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
              placeholder="Buscar en eventos..."
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

      {/* Events Table */}
      {events.length === 0 ? (
        <Alert color="neutral">
          No se encontraron eventos con los filtros aplicados.
        </Alert>
      ) : (
        <>
          <Sheet variant="outlined" sx={{ borderRadius: 'sm', overflow: 'auto' }}>
            <Table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Conexión</th>
                  <th>Tipo de Evento</th>
                  <th>Estado</th>
                  <th>Procesado</th>
                  <th>Reintentos</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{formatDate(event.created_at)}</td>
                    <td>{getConnectionName(event.connection_id)}</td>
                    <td>
                      <Chip size="sm" variant="outlined">
                        {getEventTypeLabel(event.event_type)}
                      </Chip>
                    </td>
                    <td>
                      <Chip
                        size="sm"
                        variant="soft"
                        color={getStatusColor(event.status)}
                        startDecorator={getStatusIcon(event.status)}
                      >
                        {event.status}
                      </Chip>
                    </td>
                    <td>
                      {event.processed_at ? formatDate(event.processed_at) : '-'}
                    </td>
                    <td>
                      {event.retry_count > 0 ? (
                        <Chip size="sm" color="warning" variant="soft">
                          {event.retry_count}
                        </Chip>
                      ) : (
                        '0'
                      )}
                    </td>
                    <td>
                      <Stack direction="row" spacing={1}>
                        <Button
                          size="sm"
                          variant="plain"
                          onClick={() => handleShowDetails(event)}
                        >
                          Ver Detalles
                        </Button>
                        {event.status === 'failed' && (
                          <Button
                            size="sm"
                            variant="outlined"
                            color="warning"
                            onClick={() => handleRetryEvent(event.id)}
                          >
                            Reintentar
                          </Button>
                        )}
                      </Stack>
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
        <ModalDialog sx={{ width: 800, maxWidth: '90vw' }}>
          <ModalClose />
          <Typography level="h4" mb={2}>
            Detalles del Evento de Webhook
          </Typography>

          {selectedEvent && (
            <Tabs defaultValue={0}>
              <TabList>
                <Tab>Información General</Tab>
                <Tab>Payload</Tab>
                <Tab>Headers</Tab>
              </TabList>

              <TabPanel value={0}>
                <Stack spacing={2}>
                  <Stack direction="row" spacing={2}>
                    <Box sx={{ flex: 1 }}>
                      <Typography level="body-sm" textColor="text.secondary">
                        ID
                      </Typography>
                      <Typography level="body-md">{selectedEvent.id}</Typography>
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography level="body-sm" textColor="text.secondary">
                        Conexión
                      </Typography>
                      <Typography level="body-md">
                        {getConnectionName(selectedEvent.connection_id)}
                      </Typography>
                    </Box>
                  </Stack>

                  <Box>
                    <Typography level="body-sm" textColor="text.secondary">
                      Tipo de Evento
                    </Typography>
                    <Chip size="sm" variant="outlined">
                      {getEventTypeLabel(selectedEvent.event_type)}
                    </Chip>
                  </Box>

                  <Box>
                    <Typography level="body-sm" textColor="text.secondary">
                      Estado
                    </Typography>
                    <Chip
                      size="sm"
                      variant="soft"
                      color={getStatusColor(selectedEvent.status)}
                      startDecorator={getStatusIcon(selectedEvent.status)}
                    >
                      {selectedEvent.status}
                    </Chip>
                  </Box>

                  <Stack direction="row" spacing={2}>
                    <Box sx={{ flex: 1 }}>
                      <Typography level="body-sm" textColor="text.secondary">
                        Recibido
                      </Typography>
                      <Typography level="body-md">
                        {formatDate(selectedEvent.created_at)}
                      </Typography>
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography level="body-sm" textColor="text.secondary">
                        Procesado
                      </Typography>
                      <Typography level="body-md">
                        {selectedEvent.processed_at
                          ? formatDate(selectedEvent.processed_at)
                          : 'Pendiente'}
                      </Typography>
                    </Box>
                  </Stack>

                  <Box>
                    <Typography level="body-sm" textColor="text.secondary">
                      Número de Reintentos
                    </Typography>
                    <Typography level="body-md">{selectedEvent.retry_count}</Typography>
                  </Box>

                  {selectedEvent.error_message && (
                    <Box>
                      <Typography level="body-sm" textColor="text.secondary" mb={1}>
                        Mensaje de Error
                      </Typography>
                      <Alert color="danger">{selectedEvent.error_message}</Alert>
                    </Box>
                  )}
                </Stack>
              </TabPanel>

              <TabPanel value={1}>
                <Box>
                  <Typography level="body-sm" textColor="text.secondary" mb={1}>
                    Payload (JSON)
                  </Typography>
                  <Textarea
                    value={JSON.stringify(selectedEvent.payload, null, 2)}
                    readOnly
                    minRows={15}
                    sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
                  />
                </Box>
              </TabPanel>

              <TabPanel value={2}>
                <Box>
                  <Typography level="body-sm" textColor="text.secondary" mb={1}>
                    Headers (JSON)
                  </Typography>
                  <Textarea
                    value={JSON.stringify(selectedEvent.headers, null, 2)}
                    readOnly
                    minRows={15}
                    sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
                  />
                </Box>
              </TabPanel>
            </Tabs>
          )}
        </ModalDialog>
      </Modal>
    </Box>
  );
};

export default WebhookEventsViewer;
