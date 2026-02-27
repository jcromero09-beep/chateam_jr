import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  Chip,
  Typography,
  FormControl,
  FormLabel,
  Select,
  Option,
  Alert,
  CircularProgress,
  Stack,
  List,
  ListItem,
  ListItemDecorator,
  Textarea,
  Divider
} from '@mui/joy';
import {
  PlayArrow as TestIcon,
  CheckCircle as SuccessIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../../services/api';

interface IntegrationConnection {
  id: number;
  name: string;
  integration_type: string;
  is_active: boolean;
  credentials: Record<string, any>;
  webhook_url: string | null;
}

interface TestResult {
  success: boolean;
  timestamp: string;
  tests: Array<{
    name: string;
    status: 'success' | 'error' | 'warning' | 'info';
    message: string;
    duration?: number;
    details?: any;
  }>;
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  error?: string;
}

const ConnectionTester: React.FC = () => {
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    fetchConnections();
  }, []);

  const fetchConnections = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/integrations/connections');
      setConnections(data);

      if (data.length > 0 && !selectedConnection) {
        setSelectedConnection(data[0].id);
      }
    } catch (error: any) {
      toast.error('Error al cargar conexiones: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    if (!selectedConnection) {
      toast.error('Seleccione una conexión para probar');
      return;
    }

    try {
      setTesting(true);
      setTestResult(null);

      const { data } = await api.post(`/integrations/connections/${selectedConnection}/test`);
      setTestResult(data);

      if (data.success) {
        toast.success('Prueba de conexión completada exitosamente');
      } else {
        toast.error('La prueba de conexión encontró errores');
      }
    } catch (error: any) {
      const errorResult: TestResult = {
        success: false,
        timestamp: new Date().toISOString(),
        tests: [
          {
            name: 'Conexión al Servidor',
            status: 'error',
            message: error.response?.data?.message || error.message
          }
        ],
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          warnings: 0
        },
        error: error.response?.data?.message || error.message
      };
      setTestResult(errorResult);
      toast.error('Error al probar conexión: ' + (error.response?.data?.message || error.message));
    } finally {
      setTesting(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <SuccessIcon color="success" />;
      case 'error':
        return <ErrorIcon color="error" />;
      case 'warning':
        return <WarningIcon color="warning" />;
      case 'info':
      default:
        return <InfoIcon color="info" />;
    }
  };

  const _getStatusColor = (status: string): 'success' | 'danger' | 'warning' | 'neutral' => {
    switch (status) {
      case 'success':
        return 'success';
      case 'error':
        return 'danger';
      case 'warning':
        return 'warning';
      case 'info':
      default:
        return 'neutral';
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getSelectedConnectionData = () => {
    return connections.find(c => c.id === selectedConnection);
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
          No hay conexiones configuradas. Configure una conexión primero para poder probarla.
        </Alert>
      </Box>
    );
  }

  const connectionData = getSelectedConnectionData();

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography level="h2">Probador de Conexiones</Typography>
        <Button
          startDecorator={<RefreshIcon />}
          variant="outlined"
          onClick={fetchConnections}
        >
          Actualizar Lista
        </Button>
      </Stack>

      <Card sx={{ mb: 3 }}>
        <Typography level="h4" mb={2}>
          Seleccionar Conexión
        </Typography>
        <FormControl>
          <FormLabel>Conexión a Probar</FormLabel>
          <Select
            value={selectedConnection}
            onChange={(_, value) => {
              setSelectedConnection(value);
              setTestResult(null);
            }}
          >
            {connections.map((conn) => (
              <Option key={conn.id} value={conn.id}>
                {conn.name} ({conn.integration_type}) {!conn.is_active && '(Inactiva)'}
              </Option>
            ))}
          </Select>
        </FormControl>

        {connectionData && (
          <Box sx={{ mt: 2 }}>
            <Stack spacing={1}>
              <Stack direction="row" spacing={2}>
                <Typography level="body-sm" textColor="text.secondary">
                  Tipo:
                </Typography>
                <Chip size="sm" variant="soft" color="primary">
                  {connectionData.integration_type}
                </Chip>
              </Stack>
              <Stack direction="row" spacing={2}>
                <Typography level="body-sm" textColor="text.secondary">
                  Estado:
                </Typography>
                <Chip
                  size="sm"
                  variant="soft"
                  color={connectionData.is_active ? 'success' : 'neutral'}
                >
                  {connectionData.is_active ? 'Activa' : 'Inactiva'}
                </Chip>
              </Stack>
              {connectionData.webhook_url && (
                <Stack direction="row" spacing={2}>
                  <Typography level="body-sm" textColor="text.secondary">
                    Webhook:
                  </Typography>
                  <Typography level="body-sm" noWrap sx={{ maxWidth: 400 }}>
                    {connectionData.webhook_url}
                  </Typography>
                </Stack>
              )}
            </Stack>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        <Button
          fullWidth
          size="lg"
          startDecorator={testing ? <CircularProgress size="sm" /> : <TestIcon />}
          onClick={handleTestConnection}
          loading={testing}
          disabled={!selectedConnection || testing}
        >
          {testing ? 'Probando Conexión...' : 'Ejecutar Prueba de Conexión'}
        </Button>
      </Card>

      {testResult && (
        <Card>
          <Typography level="h4" mb={2}>
            Resultados de la Prueba
          </Typography>

          {/* Summary */}
          <Alert
            color={testResult.success ? 'success' : 'danger'}
            startDecorator={testResult.success ? <SuccessIcon /> : <ErrorIcon />}
            sx={{ mb: 3 }}
          >
            <Stack spacing={1}>
              <Typography level="title-md">
                {testResult.success
                  ? 'Prueba completada exitosamente'
                  : 'Prueba completada con errores'}
              </Typography>
              <Typography level="body-sm">
                Total: {testResult.summary.total} pruebas |
                Exitosas: {testResult.summary.passed} |
                Fallidas: {testResult.summary.failed} |
                Advertencias: {testResult.summary.warnings}
              </Typography>
              <Typography level="body-xs">
                Ejecutado: {new Date(testResult.timestamp).toLocaleString('es-ES')}
              </Typography>
            </Stack>
          </Alert>

          {/* Test Details */}
          <Typography level="title-lg" mb={2}>
            Detalle de Pruebas
          </Typography>
          <List>
            {testResult.tests.map((test, index) => (
              <React.Fragment key={index}>
                <ListItem>
                  <ListItemDecorator>
                    {getStatusIcon(test.status)}
                  </ListItemDecorator>
                  <Box sx={{ flex: 1 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                      <Typography level="title-sm">{test.name}</Typography>
                      {test.duration && (
                        <Chip size="sm" variant="outlined">
                          {formatDuration(test.duration)}
                        </Chip>
                      )}
                    </Stack>
                    <Typography level="body-sm" textColor="text.secondary">
                      {test.message}
                    </Typography>
                    {test.details && (
                      <Box sx={{ mt: 1 }}>
                        <Textarea
                          value={JSON.stringify(test.details, null, 2)}
                          readOnly
                          minRows={3}
                          maxRows={8}
                          sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                        />
                      </Box>
                    )}
                  </Box>
                </ListItem>
                {index < testResult.tests.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>

          {testResult.error && (
            <Box sx={{ mt: 3 }}>
              <Alert color="danger" startDecorator={<ErrorIcon />}>
                <Typography level="title-sm" mb={1}>
                  Error General
                </Typography>
                <Typography level="body-sm">{testResult.error}</Typography>
              </Alert>
            </Box>
          )}
        </Card>
      )}

      {/* Test Information */}
      <Card sx={{ mt: 3, bgcolor: 'background.level1' }}>
        <Typography level="h4" mb={2}>
          ℹ️ Información sobre las Pruebas
        </Typography>
        <List size="sm">
          <ListItem>
            <ListItemDecorator>
              <CheckCircleIcon />
            </ListItemDecorator>
            <Typography level="body-sm">
              <strong>Validación de Credenciales:</strong> Verifica que las credenciales de API sean válidas y tengan los permisos necesarios.
            </Typography>
          </ListItem>
          <ListItem>
            <ListItemDecorator>
              <CheckCircleIcon />
            </ListItemDecorator>
            <Typography level="body-sm">
              <strong>Conectividad:</strong> Prueba la conexión con el servidor externo y verifica que sea accesible.
            </Typography>
          </ListItem>
          <ListItem>
            <ListItemDecorator>
              <CheckCircleIcon />
            </ListItemDecorator>
            <Typography level="body-sm">
              <strong>Endpoints API:</strong> Valida que los endpoints principales estén disponibles y respondiendo correctamente.
            </Typography>
          </ListItem>
          <ListItem>
            <ListItemDecorator>
              <CheckCircleIcon />
            </ListItemDecorator>
            <Typography level="body-sm">
              <strong>Mapeo de Campos:</strong> Verifica que existan mapeos de campos configurados para la sincronización.
            </Typography>
          </ListItem>
          <ListItem>
            <ListItemDecorator>
              <CheckCircleIcon />
            </ListItemDecorator>
            <Typography level="body-sm">
              <strong>Webhook (opcional):</strong> Si está configurado, prueba que el webhook sea accesible y responda correctamente.
            </Typography>
          </ListItem>
        </List>

        <Divider sx={{ my: 2 }} />

        <Typography level="body-xs" textColor="text.tertiary">
          <strong>Nota:</strong> Las pruebas no modifican ningún dato. Solo validan la configuración y conectividad.
        </Typography>
      </Card>
    </Box>
  );
};

export default ConnectionTester;
