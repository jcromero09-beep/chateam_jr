import React, { useState, useEffect } from 'react';
// [Fase2·G] CircularProgress se conserva en MUI Joy a propósito (no hay equivalente
// en el design system Tailwind/Radix todavía). El resto de la pantalla ya está migrado.
import { CircularProgress } from '@mui/joy';
import {
  ArrowClockwise,
  ArrowRight,
  Info,
  LinkSimple,
  MagnifyingGlass,
} from '@phosphor-icons/react';
import { toast } from 'react-toastify';
import { StatTile } from '@/components/ui/stat-tile';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import api from '../../services/api';

interface EntityMapping {
  id: number;
  connection_id: number;
  entity_type: string;
  local_id: number;
  external_id: string;
  sync_status: 'synced' | 'pending' | 'failed';
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

interface IntegrationConnection {
  id: number;
  name: string;
  integration_type: string;
}

interface Filters {
  connection_id: string;
  entity_type: string;
  sync_status: string;
  search: string;
}

const ENTITY_TYPES = [
  { value: 'contact', label: 'Contacto' },
  { value: 'ticket', label: 'Ticket' },
  { value: 'message', label: 'Mensaje' },
  { value: 'user', label: 'Usuario' },
  { value: 'company', label: 'Empresa' },
  { value: 'queue', label: 'Cola/Departamento' },
  { value: 'tag', label: 'Etiqueta' },
  { value: 'campaign', label: 'Campaña' }
];

const columns = [
  'Conexión',
  'Tipo de Entidad',
  'ID Local',
  '',
  'ID Externo',
  'Estado Sync',
  'Última Sincronización',
  'Acciones'
];

/** Par etiqueta/valor de la ficha de detalle. */
function DetailField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm text-foreground">{children}</div>
    </div>
  );
}

const EntityMappingsViewer: React.FC = () => {
  const [mappings, setMappings] = useState<EntityMapping[]>([]);
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedMapping, setSelectedMapping] = useState<EntityMapping | null>(null);
  const [entityDetails, setEntityDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [filters, setFilters] = useState<Filters>({
    connection_id: 'all',
    entity_type: 'all',
    sync_status: 'all',
    search: ''
  });

  useEffect(() => {
    fetchConnections();
  }, []);

  useEffect(() => {
    fetchMappings();
  }, [page, filters]);

  const fetchConnections = async () => {
    try {
      const { data } = await api.get('/integrations/connections');
      setConnections(data);
    } catch (error: any) {
      toast.error('Error al cargar conexiones: ' + (error.response?.data?.message || error.message));
    }
  };

  const fetchMappings = async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: 50,
        ...(filters.connection_id !== 'all' && { connection_id: filters.connection_id }),
        ...(filters.entity_type !== 'all' && { entity_type: filters.entity_type }),
        ...(filters.sync_status !== 'all' && { sync_status: filters.sync_status }),
        ...(filters.search && { search: filters.search })
      };

      const { data } = await api.get('/integrations/entity-mappings', { params });
      setMappings(data.mappings);
      setTotalPages(data.totalPages);
    } catch (error: any) {
      toast.error('Error al cargar mapeos: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    setFilters({
      connection_id: 'all',
      entity_type: 'all',
      sync_status: 'all',
      search: ''
    });
    setPage(1);
  };

  const handleShowDetails = async (mapping: EntityMapping) => {
    setSelectedMapping(mapping);
    setDetailsModalOpen(true);
    setEntityDetails(null);

    // Fetch entity details from local system
    try {
      setLoadingDetails(true);
      const { data } = await api.get(`/integrations/entity-mappings/${mapping.id}/details`);
      setEntityDetails(data);
    } catch (error: any) {
      toast.error('Error al cargar detalles: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleUnlinkMapping = async (mappingId: number) => {
    if (!window.confirm('¿Está seguro de desenlazar este mapeo? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      await api.delete(`/integrations/entity-mappings/${mappingId}`);
      toast.success('Mapeo desenlazado exitosamente');
      fetchMappings();
    } catch (error: any) {
      toast.error('Error al desenlazar mapeo: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleResyncMapping = async (mappingId: number) => {
    try {
      await api.post(`/integrations/entity-mappings/${mappingId}/resync`);
      toast.success('Resincronización iniciada exitosamente');
      fetchMappings();
    } catch (error: any) {
      toast.error('Error al resincronizar: ' + (error.response?.data?.message || error.message));
    }
  };

  const getSyncStatusVariant = (status: string): BadgeProps['variant'] => {
    switch (status) {
      case 'synced':
        return 'success';
      case 'failed':
        return 'destructive';
      case 'pending':
        return 'warning';
      default:
        return 'neutral';
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Nunca';
    return new Date(dateString).toLocaleString('es-ES');
  };

  const getConnectionName = (connectionId: number) => {
    const connection = connections.find(c => c.id === connectionId);
    return connection ? connection.name : `ID: ${connectionId}`;
  };

  const getEntityTypeLabel = (type: string) => {
    const entity = ENTITY_TYPES.find(e => e.value === type);
    return entity ? entity.label : type;
  };

  const getMappingStats = () => {
    return {
      total: mappings.length,
      synced: mappings.filter(m => m.sync_status === 'synced').length,
      pending: mappings.filter(m => m.sync_status === 'pending').length,
      failed: mappings.filter(m => m.sync_status === 'failed').length
    };
  };

  const stats = getMappingStats();

  if (loading && page === 1) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <CircularProgress />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-5 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
            <LinkSimple className="size-6" weight="bold" aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Mapeos de Entidades
          </h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchMappings()}>
          <ArrowClockwise className="size-4" aria-hidden />
          Actualizar
        </Button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Total Mapeos" value={String(stats.total)} />
        <StatTile label="Sincronizados" value={String(stats.synced)} tone="success" />
        <StatTile label="Pendientes" value={String(stats.pending)} tone="warning" />
        <StatTile label="Fallidos" value={String(stats.failed)} tone="destructive" />
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[200px] space-y-1.5">
            <Label htmlFor="filter-connection">Conexión</Label>
            <Select
              value={filters.connection_id}
              onValueChange={(value) => setFilters({ ...filters, connection_id: value })}
            >
              <SelectTrigger id="filter-connection">
                <SelectValue />
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

          <div className="min-w-[200px] space-y-1.5">
            <Label htmlFor="filter-entity-type">Tipo de Entidad</Label>
            <Select
              value={filters.entity_type}
              onValueChange={(value) => setFilters({ ...filters, entity_type: value })}
            >
              <SelectTrigger id="filter-entity-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {ENTITY_TYPES.map((entity) => (
                  <SelectItem key={entity.value} value={entity.value}>
                    {entity.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[150px] space-y-1.5">
            <Label htmlFor="filter-sync-status">Estado de Sync</Label>
            <Select
              value={filters.sync_status}
              onValueChange={(value) => setFilters({ ...filters, sync_status: value })}
            >
              <SelectTrigger id="filter-sync-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="synced">Sincronizado</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="failed">Fallido</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[250px] flex-1 space-y-1.5">
            <Label htmlFor="filter-search">Buscar por ID</Label>
            <Input
              id="filter-search"
              className="h-9"
              placeholder="ID local o externo..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              leftIcon={<MagnifyingGlass aria-hidden />}
            />
          </div>

          <Button variant="outline" size="sm" onClick={handleResetFilters}>
            Limpiar
          </Button>
        </div>
      </div>

      {/* Mappings Table */}
      {mappings.length === 0 ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
        >
          <Info className="size-[18px] shrink-0" aria-hidden />
          No se encontraron mapeos con los filtros aplicados.
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
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
                  {mappings.map((mapping) => (
                    <tr key={mapping.id} className="transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <span className="block max-w-[150px] truncate text-foreground">
                          {getConnectionName(mapping.connection_id)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{getEntityTypeLabel(mapping.entity_type)}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="primary">{mapping.local_id}</Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <LinkSimple
                          className="inline-block size-[18px] text-muted-foreground"
                          aria-hidden
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="success">{mapping.external_id}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={getSyncStatusVariant(mapping.sync_status)} dot>
                          {mapping.sync_status}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {formatDate(mapping.last_synced_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleShowDetails(mapping)}
                          >
                            Ver Detalles
                          </Button>
                          {mapping.sync_status === 'failed' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-warning-text hover:bg-warning/10 hover:text-warning-text"
                              onClick={() => handleResyncMapping(mapping.id)}
                            >
                              Resincronizar
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
                            onClick={() => handleUnlinkMapping(mapping.id)}
                          >
                            Desenlazar
                          </Button>
                        </div>
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
            <span className="text-sm text-muted-foreground">
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

      {/* Details Modal */}
      <Dialog open={detailsModalOpen} onOpenChange={setDetailsModalOpen}>
        <DialogContent className="max-w-[800px]">
          <DialogHeader>
            <DialogTitle>Detalles del Mapeo de Entidad</DialogTitle>
          </DialogHeader>

          {selectedMapping && (
            <Tabs defaultValue="mapping">
              <TabsList>
                <TabsTrigger value="mapping">Información del Mapeo</TabsTrigger>
                <TabsTrigger value="entity">Detalles de la Entidad Local</TabsTrigger>
              </TabsList>

              <TabsContent value="mapping" className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <DetailField label="ID del Mapeo">{selectedMapping.id}</DetailField>
                  <DetailField label="Conexión">
                    {getConnectionName(selectedMapping.connection_id)}
                  </DetailField>
                </div>

                <DetailField label="Tipo de Entidad">
                  <Badge variant="outline">
                    {getEntityTypeLabel(selectedMapping.entity_type)}
                  </Badge>
                </DetailField>

                <div className="flex items-center gap-4">
                  <DetailField label="ID Local (Sistema JR Chateam)" className="flex-1">
                    <Badge variant="primary">{selectedMapping.local_id}</Badge>
                  </DetailField>
                  <ArrowRight className="size-6 shrink-0 text-muted-foreground" aria-hidden />
                  <DetailField label="ID Externo (Sistema Integrado)" className="flex-1">
                    <Badge variant="success">{selectedMapping.external_id}</Badge>
                  </DetailField>
                </div>

                <DetailField label="Estado de Sincronización">
                  <Badge variant={getSyncStatusVariant(selectedMapping.sync_status)} dot>
                    {selectedMapping.sync_status}
                  </Badge>
                </DetailField>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <DetailField label="Última Sincronización">
                    {formatDate(selectedMapping.last_synced_at)}
                  </DetailField>
                  <DetailField label="Creado">
                    {formatDate(selectedMapping.created_at)}
                  </DetailField>
                </div>
              </TabsContent>

              <TabsContent value="entity" className="mt-4">
                {loadingDetails ? (
                  <div className="flex justify-center p-8">
                    <CircularProgress />
                  </div>
                ) : entityDetails ? (
                  <div className="space-y-3">
                    <div
                      role="status"
                      className="flex items-center gap-2 rounded-lg border border-border bg-accent/60 px-4 py-3 text-sm text-accent-foreground"
                    >
                      <Info className="size-[18px] shrink-0" aria-hidden />
                      Datos de la entidad local (ID: {selectedMapping.local_id})
                    </div>
                    <div className="max-h-[400px] overflow-auto rounded-lg border border-border bg-muted/40 p-4">
                      <pre className="m-0 whitespace-pre-wrap break-words font-mono text-sm text-foreground">
                        {JSON.stringify(entityDetails, null, 2)}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div
                    role="status"
                    className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
                  >
                    <Info className="size-[18px] shrink-0" aria-hidden />
                    No se pudieron cargar los detalles de la entidad.
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EntityMappingsViewer;
