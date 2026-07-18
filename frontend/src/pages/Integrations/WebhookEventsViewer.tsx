import React, { useState, useEffect } from 'react';
// [Fase2·G] CircularProgress se conserva en MUI Joy a propósito (no hay equivalente
// en el design system Tailwind/Radix todavía).
import { CircularProgress } from '@mui/joy';
import {
  WebhooksLogo,
  ArrowClockwise,
  MagnifyingGlass,
  CheckCircle,
  XCircle,
  Clock,
  Info,
  CaretLeft,
  CaretRight,
} from '@phosphor-icons/react';
import { toast } from 'react-toastify';
import { StatTile } from '@/components/ui/stat-tile';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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

const columns = [
  'Fecha',
  'Conexión',
  'Tipo de Evento',
  'Estado',
  'Procesado',
  'Reintentos',
  '',
];

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

  const getStatusVariant = (status: string): BadgeProps['variant'] => {
    switch (status) {
      case 'processed':
        return 'success';
      case 'failed':
        return 'destructive';
      case 'pending':
        return 'warning';
      default:
        return 'neutral';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processed':
        return <CheckCircle className="size-3.5" weight="fill" aria-hidden />;
      case 'failed':
        return <XCircle className="size-3.5" weight="fill" aria-hidden />;
      case 'pending':
        return <Clock className="size-3.5" weight="fill" aria-hidden />;
      default:
        return <Info className="size-3.5" weight="fill" aria-hidden />;
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
      <div className="flex min-h-[400px] items-center justify-center">
        <CircularProgress />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <WebhooksLogo className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Eventos de Webhook
              </h1>
              <p className="text-sm text-muted-foreground">
                Registro de eventos entrantes de las integraciones
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchEvents()}>
            <ArrowClockwise className="size-4" aria-hidden />
            Actualizar
          </Button>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Procesados" value={String(statusCounts.processed)} tone="success" />
          <StatTile label="Pendientes" value={String(statusCounts.pending)} tone="warning" />
          <StatTile label="Fallidos" value={String(statusCounts.failed)} tone="destructive" />
          <StatTile label="Total Eventos" value={String(events.length)} />
        </div>

        {/* Filters */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="filter-connection">Conexión</Label>
              <Select
                value={filters.connection_id}
                onValueChange={(value) => setFilters({ ...filters, connection_id: value })}
              >
                <SelectTrigger id="filter-connection" className="h-11" aria-label="Filtrar por conexión">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {connections.map((conn) => (
                    <SelectItem key={conn.id} value={conn.id.toString()}>
                      {conn.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filter-event-type">Tipo de Evento</Label>
              <Select
                value={filters.event_type}
                onValueChange={(value) => setFilters({ ...filters, event_type: value })}
              >
                <SelectTrigger id="filter-event-type" className="h-11" aria-label="Filtrar por tipo de evento">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="contact.created">Contacto Creado</SelectItem>
                  <SelectItem value="contact.updated">Contacto Actualizado</SelectItem>
                  <SelectItem value="ticket.created">Ticket Creado</SelectItem>
                  <SelectItem value="ticket.updated">Ticket Actualizado</SelectItem>
                  <SelectItem value="ticket.closed">Ticket Cerrado</SelectItem>
                  <SelectItem value="message.sent">Mensaje Enviado</SelectItem>
                  <SelectItem value="message.received">Mensaje Recibido</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filter-status">Estado</Label>
              <Select
                value={filters.status}
                onValueChange={(value) => setFilters({ ...filters, status: value })}
              >
                <SelectTrigger id="filter-status" className="h-11" aria-label="Filtrar por estado">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="processed">Procesado</SelectItem>
                  <SelectItem value="pending">Pendiente</SelectItem>
                  <SelectItem value="failed">Fallido</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filter-date-from">Fecha Desde</Label>
              <Input
                id="filter-date-from"
                type="date"
                value={filters.date_from}
                onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filter-date-to">Fecha Hasta</Label>
              <Input
                id="filter-date-to"
                type="date"
                value={filters.date_to}
                onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filter-search">Buscar</Label>
              <Input
                id="filter-search"
                placeholder="Buscar en eventos..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                leftIcon={<MagnifyingGlass aria-hidden />}
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button variant="outline" size="sm" onClick={handleResetFilters}>
              Limpiar
            </Button>
          </div>
        </div>

        {/* Events Table */}
        {events.length === 0 ? (
          <div
            role="status"
            className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground shadow-sm shadow-black/[0.02]"
          >
            No se encontraron eventos con los filtros aplicados.
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left">
                      {columns.map((c, i) => (
                        <th
                          key={i}
                          className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {events.map((event) => (
                      <tr key={event.id} className="transition-colors hover:bg-accent/40">
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {formatDate(event.created_at)}
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {getConnectionName(event.connection_id)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{getEventTypeLabel(event.event_type)}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={getStatusVariant(event.status)}>
                            {getStatusIcon(event.status)}
                            {event.status}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {event.processed_at ? formatDate(event.processed_at) : '-'}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {event.retry_count > 0 ? (
                            <Badge variant="warning">{event.retry_count}</Badge>
                          ) : (
                            '0'
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleShowDetails(event)}
                            >
                              Ver Detalles
                            </Button>
                            {event.status === 'failed' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-warning-text hover:bg-warning/10 hover:text-warning-text"
                                onClick={() => handleRetryEvent(event.id)}
                              >
                                Reintentar
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                <CaretLeft className="size-4" aria-hidden />
                Anterior
              </Button>
              <span className="text-sm tabular-nums text-muted-foreground">
                Página {page} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
              >
                Siguiente
                <CaretRight className="size-4" aria-hidden />
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Details Modal */}
      <Dialog open={detailsModalOpen} onOpenChange={setDetailsModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalles del Evento de Webhook</DialogTitle>
          </DialogHeader>

          {selectedEvent && (
            <Tabs defaultValue="general">
              <TabsList>
                <TabsTrigger value="general">Información General</TabsTrigger>
                <TabsTrigger value="payload">Payload</TabsTrigger>
                <TabsTrigger value="headers">Headers</TabsTrigger>
              </TabsList>

              <TabsContent value="general">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-sm text-muted-foreground">ID</p>
                      <p className="text-sm tabular-nums text-foreground">{selectedEvent.id}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Conexión</p>
                      <p className="text-sm text-foreground">
                        {getConnectionName(selectedEvent.connection_id)}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="mb-1 text-sm text-muted-foreground">Tipo de Evento</p>
                    <Badge variant="outline">{getEventTypeLabel(selectedEvent.event_type)}</Badge>
                  </div>

                  <div>
                    <p className="mb-1 text-sm text-muted-foreground">Estado</p>
                    <Badge variant={getStatusVariant(selectedEvent.status)}>
                      {getStatusIcon(selectedEvent.status)}
                      {selectedEvent.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-sm text-muted-foreground">Recibido</p>
                      <p className="text-sm text-foreground">
                        {formatDate(selectedEvent.created_at)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Procesado</p>
                      <p className="text-sm text-foreground">
                        {selectedEvent.processed_at
                          ? formatDate(selectedEvent.processed_at)
                          : 'Pendiente'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground">Número de Reintentos</p>
                    <p className="text-sm tabular-nums text-foreground">
                      {selectedEvent.retry_count}
                    </p>
                  </div>

                  {selectedEvent.error_message && (
                    <div>
                      <p className="mb-1 text-sm text-muted-foreground">Mensaje de Error</p>
                      <div
                        role="alert"
                        className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/12 px-3 py-2.5 text-sm text-destructive-text"
                      >
                        <XCircle className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
                        <span className="break-words">{selectedEvent.error_message}</span>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="payload">
                <div>
                  <Label htmlFor="event-payload" className="mb-1.5 block text-muted-foreground">
                    Payload (JSON)
                  </Label>
                  <textarea
                    id="event-payload"
                    value={JSON.stringify(selectedEvent.payload, null, 2)}
                    readOnly
                    rows={15}
                    className="w-full resize-y rounded-md border border-input bg-card p-3 font-mono text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                </div>
              </TabsContent>

              <TabsContent value="headers">
                <div>
                  <Label htmlFor="event-headers" className="mb-1.5 block text-muted-foreground">
                    Headers (JSON)
                  </Label>
                  <textarea
                    id="event-headers"
                    value={JSON.stringify(selectedEvent.headers, null, 2)}
                    readOnly
                    rows={15}
                    className="w-full resize-y rounded-md border border-input bg-card p-3 font-mono text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WebhookEventsViewer;
