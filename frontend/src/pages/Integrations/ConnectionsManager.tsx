import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card as _Card,
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
  Textarea,
  Alert,
  CircularProgress,
  Stack
} from '@mui/joy';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Refresh as RefreshIcon,
  PlayArrow as TestIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../../services/api';

interface IntegrationConnection {
  id: number;
  integration_type: 'billie' | 'aria_lite' | 'smarttrack' | 'sgr';
  name: string;
  is_active: boolean;
  credentials: Record<string, any>;
  webhook_url: string | null;
  last_sync_at: string | null;
  sync_frequency_minutes: number;
  created_at: string;
  updated_at: string;
}

interface ConnectionFormData {
  integration_type: string;
  name: string;
  is_active: boolean;
  credentials: string;
  webhook_url: string;
  sync_frequency_minutes: number;
}

const ConnectionsManager: React.FC = () => {
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<IntegrationConnection | null>(null);
  const [testingConnection, setTestingConnection] = useState<number | null>(null);
  const [formData, setFormData] = useState<ConnectionFormData>({
    integration_type: 'billie',
    name: '',
    is_active: true,
    credentials: '{}',
    webhook_url: '',
    sync_frequency_minutes: 60
  });

  useEffect(() => {
    fetchConnections();
  }, []);

  const fetchConnections = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/integrations/connections');
      setConnections(data);
    } catch (error: any) {
      toast.error('Error al cargar conexiones: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (connection?: IntegrationConnection) => {
    if (connection) {
      setEditingConnection(connection);
      setFormData({
        integration_type: connection.integration_type,
        name: connection.name,
        is_active: connection.is_active,
        credentials: JSON.stringify(connection.credentials, null, 2),
        webhook_url: connection.webhook_url || '',
        sync_frequency_minutes: connection.sync_frequency_minutes
      });
    } else {
      setEditingConnection(null);
      setFormData({
        integration_type: 'billie',
        name: '',
        is_active: true,
        credentials: '{}',
        webhook_url: '',
        sync_frequency_minutes: 60
      });
    }
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingConnection(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Validate credentials JSON
      const credentialsObj = JSON.parse(formData.credentials);

      const payload = {
        ...formData,
        credentials: credentialsObj
      };

      if (editingConnection) {
        await api.put(`/integrations/connections/${editingConnection.id}`, payload);
        toast.success('Conexión actualizada exitosamente');
      } else {
        await api.post('/integrations/connections', payload);
        toast.success('Conexión creada exitosamente');
      }

      handleCloseModal();
      fetchConnections();
    } catch (error: any) {
      if (error instanceof SyntaxError) {
        toast.error('Credenciales JSON inválidas');
      } else {
        toast.error('Error al guardar conexión: ' + (error.response?.data?.message || error.message));
      }
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Está seguro de eliminar esta conexión?')) {
      return;
    }

    try {
      await api.delete(`/integrations/connections/${id}`);
      toast.success('Conexión eliminada exitosamente');
      fetchConnections();
    } catch (error: any) {
      toast.error('Error al eliminar conexión: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleTestConnection = async (connectionId: number) => {
    try {
      setTestingConnection(connectionId);
      const { data } = await api.post(`/integrations/connections/${connectionId}/test`);

      if (data.success) {
        toast.success('Conexión probada exitosamente');
      } else {
        toast.error('Error en la prueba de conexión: ' + data.error);
      }
    } catch (error: any) {
      toast.error('Error al probar conexión: ' + (error.response?.data?.message || error.message));
    } finally {
      setTestingConnection(null);
    }
  };

  const getIntegrationTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      billie: 'Billie',
      aria_lite: 'Aria Lite',
      smarttrack: 'SmartTrack',
      sgr: 'SGR'
    };
    return labels[type] || type;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Nunca';
    return new Date(dateString).toLocaleString('es-ES');
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography level="h2">Gestión de Conexiones de Integración</Typography>
        <Stack direction="row" spacing={2}>
          <Button
            startDecorator={<RefreshIcon />}
            variant="outlined"
            onClick={fetchConnections}
          >
            Actualizar
          </Button>
          <Button
            startDecorator={<AddIcon />}
            onClick={() => handleOpenModal()}
          >
            Nueva Conexión
          </Button>
        </Stack>
      </Stack>

      {connections.length === 0 ? (
        <Alert color="neutral">
          No hay conexiones configuradas. Cree una nueva conexión para comenzar.
        </Alert>
      ) : (
        <Sheet variant="outlined" sx={{ borderRadius: 'sm', overflow: 'auto' }}>
          <Table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Nombre</th>
                <th>Estado</th>
                <th>Última Sincronización</th>
                <th>Frecuencia</th>
                <th>Webhook</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {connections.map((connection) => (
                <tr key={connection.id}>
                  <td>
                    <Chip size="sm" variant="soft" color="primary">
                      {getIntegrationTypeLabel(connection.integration_type)}
                    </Chip>
                  </td>
                  <td>{connection.name}</td>
                  <td>
                    <Chip
                      size="sm"
                      variant="soft"
                      color={connection.is_active ? 'success' : 'neutral'}
                      startDecorator={
                        connection.is_active ? <CheckCircleIcon /> : <ErrorIcon />
                      }
                    >
                      {connection.is_active ? 'Activa' : 'Inactiva'}
                    </Chip>
                  </td>
                  <td>{formatDate(connection.last_sync_at)}</td>
                  <td>{connection.sync_frequency_minutes} min</td>
                  <td>
                    {connection.webhook_url ? (
                      <Chip size="sm" variant="soft" color="success">
                        Configurado
                      </Chip>
                    ) : (
                      <Chip size="sm" variant="soft" color="neutral">
                        No configurado
                      </Chip>
                    )}
                  </td>
                  <td>
                    <Stack direction="row" spacing={1}>
                      <IconButton
                        size="sm"
                        variant="plain"
                        color="primary"
                        onClick={() => handleTestConnection(connection.id)}
                        loading={testingConnection === connection.id}
                      >
                        <TestIcon />
                      </IconButton>
                      <IconButton
                        size="sm"
                        variant="plain"
                        color="neutral"
                        onClick={() => handleOpenModal(connection)}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        size="sm"
                        variant="plain"
                        color="danger"
                        onClick={() => handleDelete(connection.id)}
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

      <Modal open={modalOpen} onClose={handleCloseModal}>
        <ModalDialog sx={{ width: 600, maxWidth: '90vw' }}>
          <ModalClose />
          <Typography level="h4" mb={2}>
            {editingConnection ? 'Editar Conexión' : 'Nueva Conexión'}
          </Typography>

          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <FormControl required>
                <FormLabel>Tipo de Integración</FormLabel>
                <Select
                  value={formData.integration_type}
                  onChange={(_, value) => setFormData({ ...formData, integration_type: value! })}
                  disabled={!!editingConnection}
                >
                  <Option value="billie">Billie</Option>
                  <Option value="aria_lite">Aria Lite</Option>
                  <Option value="smarttrack">SmartTrack</Option>
                  <Option value="sgr">SGR</Option>
                </Select>
              </FormControl>

              <FormControl required>
                <FormLabel>Nombre</FormLabel>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Conexión Billie Producción"
                />
              </FormControl>

              <FormControl required>
                <FormLabel>Credenciales (JSON)</FormLabel>
                <Textarea
                  value={formData.credentials}
                  onChange={(e) => setFormData({ ...formData, credentials: e.target.value })}
                  minRows={4}
                  placeholder='{"api_key": "xxx", "api_secret": "yyy"}'
                />
              </FormControl>

              <FormControl>
                <FormLabel>Webhook URL</FormLabel>
                <Input
                  value={formData.webhook_url}
                  onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })}
                  placeholder="https://api.example.com/webhooks/integration"
                />
              </FormControl>

              <FormControl required>
                <FormLabel>Frecuencia de Sincronización (minutos)</FormLabel>
                <Input
                  type="number"
                  value={formData.sync_frequency_minutes}
                  onChange={(e) => setFormData({ ...formData, sync_frequency_minutes: Number(e.target.value) })}
                  slotProps={{ input: { min: 1, max: 1440 } }}
                />
              </FormControl>

              <FormControl>
                <FormLabel>Estado</FormLabel>
                <Select
                  value={formData.is_active ? 'active' : 'inactive'}
                  onChange={(_, value) => setFormData({ ...formData, is_active: value === 'active' })}
                >
                  <Option value="active">Activa</Option>
                  <Option value="inactive">Inactiva</Option>
                </Select>
              </FormControl>

              <Stack direction="row" spacing={2} justifyContent="flex-end" mt={2}>
                <Button variant="outlined" color="neutral" onClick={handleCloseModal}>
                  Cancelar
                </Button>
                <Button type="submit" variant="solid" color="primary">
                  {editingConnection ? 'Actualizar' : 'Crear'}
                </Button>
              </Stack>
            </Stack>
          </form>
        </ModalDialog>
      </Modal>
    </Box>
  );
};

export default ConnectionsManager;
