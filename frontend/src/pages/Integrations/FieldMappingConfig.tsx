import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  Chip,
  IconButton,
  Modal,
  ModalDialog,
  ModalClose,
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
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Divider
} from '@mui/joy';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  ArrowForward as ArrowIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../../services/api';

interface IntegrationConnection {
  id: number;
  integration_type: string;
  name: string;
}

interface FieldMapping {
  id: number;
  connection_id: number;
  entity_type: string;
  local_field: string;
  external_field: string;
  is_required: boolean;
  default_value: string | null;
  transformation_rule: string | null;
  created_at: string;
}

interface FieldMappingFormData {
  connection_id: number;
  entity_type: string;
  local_field: string;
  external_field: string;
  is_required: boolean;
  default_value: string;
  transformation_rule: string;
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

const LOCAL_FIELDS_BY_ENTITY: Record<string, string[]> = {
  contact: ['name', 'number', 'email', 'profilePicUrl', 'isGroup', 'extraInfo'],
  ticket: ['status', 'userId', 'contactId', 'queueId', 'whatsappId', 'isGroup'],
  message: ['body', 'fromMe', 'mediaType', 'mediaUrl', 'ack', 'read'],
  user: ['name', 'email', 'profile', 'tokenVersion'],
  company: ['name', 'email', 'phone', 'plan', 'dueDate'],
  queue: ['name', 'color', 'greetingMessage', 'startWork', 'endWork'],
  tag: ['name', 'color', 'kanban'],
  campaign: ['name', 'status', 'scheduledAt', 'whatsappId', 'contactListId']
};

const TRANSFORMATION_RULES = [
  { value: 'none', label: 'Sin transformación' },
  { value: 'uppercase', label: 'MAYÚSCULAS' },
  { value: 'lowercase', label: 'minúsculas' },
  { value: 'trim', label: 'Eliminar espacios' },
  { value: 'normalize_phone', label: 'Normalizar teléfono (+521234567890)' },
  { value: 'parse_json', label: 'Parsear JSON' },
  { value: 'date_iso', label: 'Fecha ISO (YYYY-MM-DD)' },
  { value: 'boolean', label: 'Convertir a boolean' }
];

const FieldMappingConfig: React.FC = () => {
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<number | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string>('contact');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<FieldMapping | null>(null);
  const [formData, setFormData] = useState<FieldMappingFormData>({
    connection_id: 0,
    entity_type: 'contact',
    local_field: '',
    external_field: '',
    is_required: false,
    default_value: '',
    transformation_rule: 'none'
  });

  useEffect(() => {
    fetchConnections();
  }, []);

  useEffect(() => {
    if (selectedConnection) {
      fetchMappings();
    }
  }, [selectedConnection, selectedEntity]);

  const fetchConnections = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/integrations/connections');
      setConnections(data.filter((c: any) => c.is_active));

      if (data.length > 0 && !selectedConnection) {
        setSelectedConnection(data[0].id);
      }
    } catch (error: any) {
      toast.error('Error al cargar conexiones: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const fetchMappings = async () => {
    if (!selectedConnection) return;

    try {
      const { data } = await api.get(`/integrations/connections/${selectedConnection}/mappings`, {
        params: { entity_type: selectedEntity }
      });
      setMappings(data);
    } catch (error: any) {
      toast.error('Error al cargar mapeos: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleOpenModal = (mapping?: FieldMapping) => {
    if (mapping) {
      setEditingMapping(mapping);
      setFormData({
        connection_id: mapping.connection_id,
        entity_type: mapping.entity_type,
        local_field: mapping.local_field,
        external_field: mapping.external_field,
        is_required: mapping.is_required,
        default_value: mapping.default_value || '',
        transformation_rule: mapping.transformation_rule || 'none'
      });
    } else {
      setEditingMapping(null);
      setFormData({
        connection_id: selectedConnection || 0,
        entity_type: selectedEntity,
        local_field: '',
        external_field: '',
        is_required: false,
        default_value: '',
        transformation_rule: 'none'
      });
    }
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingMapping(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const payload = {
        ...formData,
        default_value: formData.default_value || null,
        transformation_rule: formData.transformation_rule === 'none' ? null : formData.transformation_rule
      };

      if (editingMapping) {
        await api.put(`/integrations/field-mappings/${editingMapping.id}`, payload);
        toast.success('Mapeo actualizado exitosamente');
      } else {
        await api.post('/integrations/field-mappings', payload);
        toast.success('Mapeo creado exitosamente');
      }

      handleCloseModal();
      fetchMappings();
    } catch (error: any) {
      toast.error('Error al guardar mapeo: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Está seguro de eliminar este mapeo?')) {
      return;
    }

    try {
      await api.delete(`/integrations/field-mappings/${id}`);
      toast.success('Mapeo eliminado exitosamente');
      fetchMappings();
    } catch (error: any) {
      toast.error('Error al eliminar mapeo: ' + (error.response?.data?.message || error.message));
    }
  };

  const _getConnectionName = (connectionId: number) => {
    const connection = connections.find(c => c.id === connectionId);
    return connection ? connection.name : `ID: ${connectionId}`;
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (connections.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert color="warning">
          No hay conexiones activas. Configure una conexión primero para poder mapear campos.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography level="h2">Configuración de Mapeo de Campos</Typography>
        <Button
          startDecorator={<AddIcon />}
          onClick={() => handleOpenModal()}
        >
          Nuevo Mapeo
        </Button>
      </Stack>

      <Card sx={{ mb: 3 }}>
        <FormControl>
          <FormLabel>Conexión</FormLabel>
          <Select
            value={selectedConnection}
            onChange={(_, value) => setSelectedConnection(value)}
          >
            {connections.map((conn) => (
              <Option key={conn.id} value={conn.id}>
                {conn.name} ({conn.integration_type})
              </Option>
            ))}
          </Select>
        </FormControl>
      </Card>

      <Tabs value={selectedEntity} onChange={(_, value) => setSelectedEntity(value as string)}>
        <TabList>
          {ENTITY_TYPES.map((entity) => (
            <Tab key={entity.value} value={entity.value}>
              {entity.label}
            </Tab>
          ))}
        </TabList>

        {ENTITY_TYPES.map((entity) => (
          <TabPanel key={entity.value} value={entity.value} sx={{ p: 0, pt: 2 }}>
            {mappings.length === 0 ? (
              <Alert color="neutral">
                No hay mapeos configurados para {entity.label} en esta conexión.
              </Alert>
            ) : (
              <Sheet variant="outlined" sx={{ borderRadius: 'sm', overflow: 'auto' }}>
                <Table>
                  <thead>
                    <tr>
                      <th>Campo Local</th>
                      <th></th>
                      <th>Campo Externo</th>
                      <th>Requerido</th>
                      <th>Transformación</th>
                      <th>Valor por Defecto</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.map((mapping) => (
                      <tr key={mapping.id}>
                        <td>
                          <Chip size="sm" variant="soft" color="primary">
                            {mapping.local_field}
                          </Chip>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <ArrowIcon fontSize="small" />
                        </td>
                        <td>
                          <Chip size="sm" variant="soft" color="success">
                            {mapping.external_field}
                          </Chip>
                        </td>
                        <td>
                          <Chip
                            size="sm"
                            variant="soft"
                            color={mapping.is_required ? 'danger' : 'neutral'}
                          >
                            {mapping.is_required ? 'Sí' : 'No'}
                          </Chip>
                        </td>
                        <td>
                          {mapping.transformation_rule ? (
                            <Chip size="sm" variant="outlined">
                              {mapping.transformation_rule}
                            </Chip>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td>
                          {mapping.default_value ? (
                            <Typography level="body-sm" noWrap sx={{ maxWidth: 150 }}>
                              {mapping.default_value}
                            </Typography>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td>
                          <Stack direction="row" spacing={1}>
                            <IconButton
                              size="sm"
                              variant="plain"
                              color="neutral"
                              onClick={() => handleOpenModal(mapping)}
                            >
                              <EditIcon />
                            </IconButton>
                            <IconButton
                              size="sm"
                              variant="plain"
                              color="danger"
                              onClick={() => handleDelete(mapping.id)}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Stack>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Sheet>
            )}
          </TabPanel>
        ))}
      </Tabs>

      <Modal open={modalOpen} onClose={handleCloseModal}>
        <ModalDialog sx={{ width: 600, maxWidth: '90vw' }}>
          <ModalClose />
          <Typography level="h4" mb={2}>
            {editingMapping ? 'Editar Mapeo de Campo' : 'Nuevo Mapeo de Campo'}
          </Typography>

          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <FormControl required>
                <FormLabel>Tipo de Entidad</FormLabel>
                <Select
                  value={formData.entity_type}
                  onChange={(_, value) => setFormData({ ...formData, entity_type: value!, local_field: '' })}
                >
                  {ENTITY_TYPES.map((entity) => (
                    <Option key={entity.value} value={entity.value}>
                      {entity.label}
                    </Option>
                  ))}
                </Select>
              </FormControl>

              <Divider />

              <FormControl required>
                <FormLabel>Campo Local (Sistema JR Chateam)</FormLabel>
                <Select
                  value={formData.local_field}
                  onChange={(_, value) => setFormData({ ...formData, local_field: value! })}
                  placeholder="Seleccione un campo local"
                >
                  {LOCAL_FIELDS_BY_ENTITY[formData.entity_type]?.map((field) => (
                    <Option key={field} value={field}>
                      {field}
                    </Option>
                  ))}
                </Select>
              </FormControl>

              <FormControl required>
                <FormLabel>Campo Externo (Sistema Integrado)</FormLabel>
                <Input
                  value={formData.external_field}
                  onChange={(e) => setFormData({ ...formData, external_field: e.target.value })}
                  placeholder="Ej: customer_name, phone_number"
                />
              </FormControl>

              <Divider />

              <FormControl>
                <FormLabel>Regla de Transformación</FormLabel>
                <Select
                  value={formData.transformation_rule}
                  onChange={(_, value) => setFormData({ ...formData, transformation_rule: value! })}
                >
                  {TRANSFORMATION_RULES.map((rule) => (
                    <Option key={rule.value} value={rule.value}>
                      {rule.label}
                    </Option>
                  ))}
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel>Valor por Defecto</FormLabel>
                <Input
                  value={formData.default_value}
                  onChange={(e) => setFormData({ ...formData, default_value: e.target.value })}
                  placeholder="Valor a usar si el campo está vacío"
                />
              </FormControl>

              <FormControl>
                <Stack direction="row" spacing={2} alignItems="center">
                  <input
                    type="checkbox"
                    checked={formData.is_required}
                    onChange={(e) => setFormData({ ...formData, is_required: e.target.checked })}
                    id="is_required"
                  />
                  <FormLabel htmlFor="is_required" sx={{ m: 0, cursor: 'pointer' }}>
                    Campo requerido (bloquear sincronización si falta)
                  </FormLabel>
                </Stack>
              </FormControl>

              <Stack direction="row" spacing={2} justifyContent="flex-end" mt={2}>
                <Button variant="outlined" color="neutral" onClick={handleCloseModal}>
                  Cancelar
                </Button>
                <Button type="submit" variant="solid" color="primary" startDecorator={<SaveIcon />}>
                  {editingMapping ? 'Actualizar' : 'Crear'}
                </Button>
              </Stack>
            </Stack>
          </form>
        </ModalDialog>
      </Modal>
    </Box>
  );
};

export default FieldMappingConfig;
