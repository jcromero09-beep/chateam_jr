import React, { useState, useEffect } from 'react';
// [Fase2·G] Conservado de MUI Joy a propósito: no hay equivalente en el design
// system (indicador de progreso). Todo lo demás migrado a Tailwind v4 + tokens.
import { CircularProgress } from '@mui/joy';
import {
  ArrowClockwise,
  MagnifyingGlass,
  CheckCircle,
  XCircle,
  Warning,
  Info,
  ClockCounterClockwise,
} from '@phosphor-icons/react';
import { StatTile } from '@/components/ui/stat-tile';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
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

// Superficie base del design system (misma que IntegrationsAnalytics).
function Panel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]',
        className,
      )}
    >
      {children}
    </div>
  );
}

// Campo de texto/fecha con los tokens del design system.
const fieldClass =
  'h-9 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30';

const columns = [
  'Fecha',
  'Conexión',
  'Tipo',
  'Entidad',
  'Estado',
  'Procesados',
  'Fallidos',
  'Duración',
  'Acciones',
];

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

  // Estado -> variante del Badge (tokens semánticos *-text vía badge.tsx).
  const getStatusVariant = (status: string): BadgeProps['variant'] => {
    switch (status) {
      case 'success':
        return 'success';
      case 'error':
        return 'destructive';
      case 'warning':
        return 'warning';
      default:
        return 'neutral';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="size-3.5 shrink-0" aria-hidden />;
      case 'error':
        return <XCircle className="size-3.5 shrink-0" aria-hidden />;
      case 'warning':
        return <Warning className="size-3.5 shrink-0" aria-hidden />;
      default:
        return <Info className="size-3.5 shrink-0" aria-hidden />;
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
              <ClockCounterClockwise className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Logs de Sincronización
              </h1>
              <p className="text-sm text-muted-foreground">
                Historial de sincronizaciones de las integraciones
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchLogs()}>
            <ArrowClockwise className="size-4" aria-hidden />
            Actualizar
          </Button>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            label="Tasa de Éxito"
            value={`${calculateSuccessRate()}%`}
            tone="success"
          />
          <StatTile
            label="Registros Procesados"
            value={String(getTotalRecordsProcessed())}
            tone="primary"
          />
          <StatTile
            label="Registros Fallidos"
            value={String(getTotalRecordsFailed())}
            tone="destructive"
          />
          <StatTile label="Total Sincronizaciones" value={String(logs.length)} />
        </div>

        {/* Filters */}
        <Panel>
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[200px] space-y-1.5">
              <Label htmlFor="logs-connection">Conexión</Label>
              <Select
                value={filters.connection_id}
                onValueChange={(value) => setFilters({ ...filters, connection_id: value })}
              >
                <SelectTrigger id="logs-connection" className="w-full sm:w-[200px]">
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

            <div className="min-w-[150px] space-y-1.5">
              <Label htmlFor="logs-sync-type">Tipo de Sync</Label>
              <Select
                value={filters.sync_type}
                onValueChange={(value) => setFilters({ ...filters, sync_type: value })}
              >
                <SelectTrigger id="logs-sync-type" className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="inbound">Inbound</SelectItem>
                  <SelectItem value="outbound">Outbound</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[150px] space-y-1.5">
              <Label htmlFor="logs-entity">Entidad</Label>
              <Select
                value={filters.entity_type}
                onValueChange={(value) => setFilters({ ...filters, entity_type: value })}
              >
                <SelectTrigger id="logs-entity" className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="contact">Contacto</SelectItem>
                  <SelectItem value="ticket">Ticket</SelectItem>
                  <SelectItem value="message">Mensaje</SelectItem>
                  <SelectItem value="user">Usuario</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[150px] space-y-1.5">
              <Label htmlFor="logs-status">Estado</Label>
              <Select
                value={filters.status}
                onValueChange={(value) => setFilters({ ...filters, status: value })}
              >
                <SelectTrigger id="logs-status" className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="success">Éxito</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="warning">Advertencia</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[180px] space-y-1.5">
              <Label htmlFor="logs-date-from">Fecha Desde</Label>
              <input
                id="logs-date-from"
                type="date"
                value={filters.date_from}
                onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
                className={cn(fieldClass, 'sm:w-[180px]')}
              />
            </div>

            <div className="min-w-[180px] space-y-1.5">
              <Label htmlFor="logs-date-to">Fecha Hasta</Label>
              <input
                id="logs-date-to"
                type="date"
                value={filters.date_to}
                onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
                className={cn(fieldClass, 'sm:w-[180px]')}
              />
            </div>

            <div className="min-w-[250px] flex-1 space-y-1.5">
              <Label htmlFor="logs-search">Buscar</Label>
              <div className="relative">
                <MagnifyingGlass
                  className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  id="logs-search"
                  placeholder="Buscar en logs..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className={cn(fieldClass, 'pl-10')}
                />
              </div>
            </div>

            <Button variant="outline" size="sm" onClick={handleResetFilters}>
              Limpiar
            </Button>
          </div>
        </Panel>

        {/* Logs Table */}
        {logs.length === 0 ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
          >
            <Info className="size-5 shrink-0" aria-hidden />
            No se encontraron logs con los filtros aplicados.
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
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
                    {logs.map((log) => (
                      <tr key={log.id} className="transition-colors hover:bg-accent/40">
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {formatDate(log.started_at)}
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {getConnectionName(log.connection_id)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={log.sync_type === 'inbound' ? 'primary' : 'success'}>
                            {log.sync_type === 'inbound' ? 'Entrada' : 'Salida'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{log.entity_type}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={getStatusVariant(log.status)}>
                            {getStatusIcon(log.status)}
                            {log.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {log.records_processed}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {log.records_failed > 0 ? (
                            <Badge variant="destructive">{log.records_failed}</Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">
                          {formatDuration(log.duration_ms)}
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleShowDetails(log)}
                          >
                            Ver Detalles
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
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
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Details Modal */}
      <Dialog open={detailsModalOpen} onOpenChange={setDetailsModalOpen}>
        <DialogContent className="max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Detalles del Log de Sincronización</DialogTitle>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">ID</p>
                  <p className="text-sm tabular-nums text-foreground">{selectedLog.id}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Conexión</p>
                  <p className="text-sm text-foreground">
                    {getConnectionName(selectedLog.connection_id)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="mb-1 text-sm text-muted-foreground">Tipo</p>
                  <Badge variant="primary">{selectedLog.sync_type}</Badge>
                </div>
                <div>
                  <p className="mb-1 text-sm text-muted-foreground">Entidad</p>
                  <Badge variant="outline">{selectedLog.entity_type}</Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Inicio</p>
                  <p className="text-sm text-foreground">{formatDate(selectedLog.started_at)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Fin</p>
                  <p className="text-sm text-foreground">
                    {selectedLog.completed_at ? formatDate(selectedLog.completed_at) : 'En progreso'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Registros Procesados</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                    {selectedLog.records_processed}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Registros Fallidos</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-destructive-text">
                    {selectedLog.records_failed}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Duración</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                    {formatDuration(selectedLog.duration_ms)}
                  </p>
                </div>
              </div>

              {selectedLog.error_message && (
                <div>
                  <p className="mb-1 text-sm text-muted-foreground">Mensaje de Error</p>
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text"
                  >
                    <XCircle className="mt-0.5 size-5 shrink-0" aria-hidden />
                    <span className="break-words">{selectedLog.error_message}</span>
                  </div>
                </div>
              )}

              {selectedLog.metadata && (
                <div>
                  <label
                    htmlFor="log-metadata"
                    className="mb-1 block text-sm text-muted-foreground"
                  >
                    Metadata (JSON)
                  </label>
                  <textarea
                    id="log-metadata"
                    value={JSON.stringify(selectedLog.metadata, null, 2)}
                    readOnly
                    rows={6}
                    className="w-full rounded-md border border-input bg-card p-3 font-mono text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SyncLogsViewer;
