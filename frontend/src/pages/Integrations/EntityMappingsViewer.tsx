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
  Tabs,
  TabList,
  Tab,
  TabPanel
} from '@mui/joy';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Link as LinkIcon,
  LinkOff as _UnlinkIcon,
  ArrowForward as ArrowIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
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

  const getSyncStatusColor = (status: string) => {
    switch (status) {
      case 'synced':
        return 'success';
      case 'failed':
        return 'danger';
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
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography level="h2">Mapeos de Entidades</Typography>
        <Button
          startDecorator={<RefreshIcon />}
          variant="outlined"
          onClick={() => fetchMappings()}
        >
          Actualizar
        </Button>
      </Stack>

      {/* Statistics Cards */}
      <Stack direction="row" spacing={2} mb={3}>
        <Card sx={{ flex: 1 }}>
          <Typography level="body-sm" textColor="text.secondary">
            Total Mapeos
          </Typography>
          <Typography level="h3">
            {stats.total}
          </Typography>
        </Card>
        <Card sx={{ flex: 1 }}>
          <Typography level="body-sm" textColor="text.secondary">
            Sincronizados
          </Typography>
          <Typography level="h3" color="success">
            {stats.synced}
          </Typography>
        </Card>
        <Card sx={{ flex: 1 }}>
          <Typography level="body-sm" textColor="text.secondary">
            Pendientes
          </Typography>
          <Typography level="h3" color="warning">
            {stats.pending}
          </Typography>
        </Card>
        <Card sx={{ flex: 1 }}>
          <Typography level="body-sm" textColor="text.secondary">
            Fallidos
          </Typography>
          <Typography level="h3" color="danger">
            {stats.failed}
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
            <FormLabel>Tipo de Entidad</FormLabel>
            <Select
              value={filters.entity_type}
              onChange={(_, value) => setFilters({ ...filters, entity_type: value! })}
            >
              <Option value="all">Todas</Option>
              {ENTITY_TYPES.map((entity) => (
                <Option key={entity.value} value={entity.value}>
                  {entity.label}
                </Option>
              ))}
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 150 }}>
            <FormLabel>Estado de Sync</FormLabel>
            <Select
              value={filters.sync_status}
              onChange={(_, value) => setFilters({ ...filters, sync_status: value! })}
            >
              <Option value="all">Todos</Option>
              <Option value="synced">Sincronizado</Option>
              <Option value="pending">Pendiente</Option>
              <Option value="failed">Fallido</Option>
            </Select>
          </FormControl>

          <FormControl sx={{ minWidth: 250, flex: 1 }}>
            <FormLabel>Buscar por ID</FormLabel>
            <Input
              placeholder="ID local o externo..."
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

      {/* Mappings Table */}
      {mappings.length === 0 ? (
        <Alert color="neutral">
          No se encontraron mapeos con los filtros aplicados.
        </Alert>
      ) : (
        <>
          <Sheet variant="outlined" sx={{ borderRadius: 'sm', overflow: 'auto' }}>
            <Table>
              <thead>
                <tr>
                  <th>Conexión</th>
                  <th>Tipo de Entidad</th>
                  <th>ID Local</th>
                  <th></th>
                  <th>ID Externo</th>
                  <th>Estado Sync</th>
                  <th>Última Sincronización</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((mapping) => (
                  <tr key={mapping.id}>
                    <td>
                      <Typography level="body-sm" noWrap sx={{ maxWidth: 150 }}>
                        {getConnectionName(mapping.connection_id)}
                      </Typography>
                    </td>
                    <td>
                      <Chip size="sm" variant="outlined">
                        {getEntityTypeLabel(mapping.entity_type)}
                      </Chip>
                    </td>
                    <td>
                      <Chip size="sm" variant="soft" color="primary">
                        {mapping.local_id}
                      </Chip>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <LinkIcon fontSize="small" color="action" />
                    </td>
                    <td>
                      <Chip size="sm" variant="soft" color="success">
                        {mapping.external_id}
                      </Chip>
                    </td>
                    <td>
                      <Chip
                        size="sm"
                        variant="soft"
                        color={getSyncStatusColor(mapping.sync_status)}
                      >
                        {mapping.sync_status}
                      </Chip>
                    </td>
                    <td>{formatDate(mapping.last_synced_at)}</td>
                    <td>
                      <Stack direction="row" spacing={1}>
                        <Button
                          size="sm"
                          variant="plain"
                          onClick={() => handleShowDetails(mapping)}
                        >
                          Ver Detalles
                        </Button>
                        {mapping.sync_status === 'failed' && (
                          <Button
                            size="sm"
                            variant="outlined"
                            color="warning"
                            onClick={() => handleResyncMapping(mapping.id)}
                          >
                            Resincronizar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outlined"
                          color="danger"
                          onClick={() => handleUnlinkMapping(mapping.id)}
                        >
                          Desenlazar
                        </Button>
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
            Detalles del Mapeo de Entidad
          </Typography>

          {selectedMapping && (
            <Tabs defaultValue={0}>
              <TabList>
                <Tab>Información del Mapeo</Tab>
                <Tab>Detalles de la Entidad Local</Tab>
              </TabList>

              <TabPanel value={0}>
                <Stack spacing={2}>
                  <Stack direction="row" spacing={2}>
                    <Box sx={{ flex: 1 }}>
                      <Typography level="body-sm" textColor="text.secondary">
                        ID del Mapeo
                      </Typography>
                      <Typography level="body-md">{selectedMapping.id}</Typography>
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography level="body-sm" textColor="text.secondary">
                        Conexión
                      </Typography>
                      <Typography level="body-md">
                        {getConnectionName(selectedMapping.connection_id)}
                      </Typography>
                    </Box>
                  </Stack>

                  <Box>
                    <Typography level="body-sm" textColor="text.secondary">
                      Tipo de Entidad
                    </Typography>
                    <Chip size="sm" variant="outlined">
                      {getEntityTypeLabel(selectedMapping.entity_type)}
                    </Chip>
                  </Box>

                  <Stack direction="row" spacing={2} alignItems="center">
                    <Box sx={{ flex: 1 }}>
                      <Typography level="body-sm" textColor="text.secondary">
                        ID Local (Sistema JR Chateam)
                      </Typography>
                      <Chip size="md" variant="soft" color="primary">
                        {selectedMapping.local_id}
                      </Chip>
                    </Box>
                    <ArrowIcon fontSize="large" />
                    <Box sx={{ flex: 1 }}>
                      <Typography level="body-sm" textColor="text.secondary">
                        ID Externo (Sistema Integrado)
                      </Typography>
                      <Chip size="md" variant="soft" color="success">
                        {selectedMapping.external_id}
                      </Chip>
                    </Box>
                  </Stack>

                  <Box>
                    <Typography level="body-sm" textColor="text.secondary">
                      Estado de Sincronización
                    </Typography>
                    <Chip
                      size="md"
                      variant="soft"
                      color={getSyncStatusColor(selectedMapping.sync_status)}
                    >
                      {selectedMapping.sync_status}
                    </Chip>
                  </Box>

                  <Stack direction="row" spacing={2}>
                    <Box sx={{ flex: 1 }}>
                      <Typography level="body-sm" textColor="text.secondary">
                        Última Sincronización
                      </Typography>
                      <Typography level="body-md">
                        {formatDate(selectedMapping.last_synced_at)}
                      </Typography>
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography level="body-sm" textColor="text.secondary">
                        Creado
                      </Typography>
                      <Typography level="body-md">
                        {formatDate(selectedMapping.created_at)}
                      </Typography>
                    </Box>
                  </Stack>
                </Stack>
              </TabPanel>

              <TabPanel value={1}>
                {loadingDetails ? (
                  <Box display="flex" justifyContent="center" p={4}>
                    <CircularProgress />
                  </Box>
                ) : entityDetails ? (
                  <Box>
                    <Alert color="primary" sx={{ mb: 2 }}>
                      Datos de la entidad local (ID: {selectedMapping.local_id})
                    </Alert>
                    <Sheet
                      variant="outlined"
                      sx={{
                        p: 2,
                        borderRadius: 'sm',
                        maxHeight: 400,
                        overflow: 'auto'
                      }}
                    >
                      <pre style={{ margin: 0, fontSize: '0.875rem' }}>
                        {JSON.stringify(entityDetails, null, 2)}
                      </pre>
                    </Sheet>
                  </Box>
                ) : (
                  <Alert color="neutral">
                    No se pudieron cargar los detalles de la entidad.
                  </Alert>
                )}
              </TabPanel>
            </Tabs>
          )}
        </ModalDialog>
      </Modal>
    </Box>
  );
};

export default EntityMappingsViewer;
