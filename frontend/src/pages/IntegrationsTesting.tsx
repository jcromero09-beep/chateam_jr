import { useState } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  FormControl,
  FormLabel,
  Select,
  Option,
  Chip,
  Sheet,
  Table,
  Alert,
} from '@mui/joy'
import {
  BugReport as TestIcon,
  PlayArrow as RunIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Code as CodeIcon,
  History as HistoryIcon,
  Webhook as WebhookIcon,
  Sync as SyncIcon,
  NetworkCheck as PingIcon,
  VpnKey as AuthIcon,
  Visibility as ReadIcon,
  Edit as WriteIcon,
} from '@mui/icons-material'

interface TestResult {
  test: string
  status: 'success' | 'failed' | 'pending'
  message: string
  duration: number
  timestamp: string
}

interface TestHistory {
  id: number
  integration: string
  testType: string
  status: 'success' | 'failed'
  timestamp: string
  duration: number
}

export default function IntegrationsTesting() {
  const [selectedIntegration, setSelectedIntegration] = useState<string>('Billie')
  const [selectedTest, setSelectedTest] = useState<string>('connection')
  const [testing, setTesting] = useState(false)
  const [testResults, setTestResults] = useState<TestResult[]>([])
  const [response, setResponse] = useState<string>('')

  const integrations = ['Billie', 'Aria Lite', 'SmartTrack', 'SGR', 'Custom']

  const testTypes = [
    { value: 'connection', label: 'Test de Conexión', icon: <PingIcon /> },
    { value: 'auth', label: 'Test de Autenticación', icon: <AuthIcon /> },
    { value: 'read', label: 'Test de Lectura', icon: <ReadIcon /> },
    { value: 'write', label: 'Test de Escritura', icon: <WriteIcon /> },
    { value: 'sync', label: 'Test de Sincronización', icon: <SyncIcon /> },
    { value: 'webhook', label: 'Test de Webhook', icon: <WebhookIcon /> },
  ]

  const testHistory: TestHistory[] = [
    {
      id: 1,
      integration: 'Billie',
      testType: 'Connection Test',
      status: 'success',
      timestamp: '2025-10-13 10:45:23',
      duration: 234,
    },
    {
      id: 2,
      integration: 'Aria Lite',
      testType: 'Sync Test',
      status: 'success',
      timestamp: '2025-10-13 10:40:12',
      duration: 1245,
    },
    {
      id: 3,
      integration: 'SmartTrack',
      testType: 'Auth Test',
      status: 'success',
      timestamp: '2025-10-13 10:35:45',
      duration: 156,
    },
    {
      id: 4,
      integration: 'SGR',
      testType: 'Read Test',
      status: 'success',
      timestamp: '2025-10-13 10:30:18',
      duration: 456,
    },
    {
      id: 5,
      integration: 'Custom',
      testType: 'Connection Test',
      status: 'failed',
      timestamp: '2025-10-13 10:25:22',
      duration: 0,
    },
    {
      id: 6,
      integration: 'Billie',
      testType: 'Webhook Test',
      status: 'success',
      timestamp: '2025-10-13 10:20:47',
      duration: 89,
    },
    {
      id: 7,
      integration: 'Aria Lite',
      testType: 'Write Test',
      status: 'success',
      timestamp: '2025-10-13 10:15:33',
      duration: 678,
    },
    {
      id: 8,
      integration: 'SmartTrack',
      testType: 'Connection Test',
      status: 'success',
      timestamp: '2025-10-13 10:10:12',
      duration: 198,
    },
  ]

  const mockResponses: Record<string, any> = {
    Billie: {
      connection: {
        status: 'success',
        message: 'Conexión establecida exitosamente',
        data: {
          apiVersion: 'v2.5',
          serverTime: '2025-10-13T10:45:23Z',
          latency: '234ms',
          endpoints: {
            contacts: 'https://api.billie.com/v2.5/contacts',
            invoices: 'https://api.billie.com/v2.5/invoices',
            products: 'https://api.billie.com/v2.5/products',
          },
        },
      },
      auth: {
        status: 'success',
        message: 'Autenticación exitosa',
        data: {
          authenticated: true,
          tokenValid: true,
          expiresAt: '2025-10-14T10:45:23Z',
          permissions: ['read', 'write', 'delete'],
        },
      },
      read: {
        status: 'success',
        message: 'Lectura de datos exitosa',
        data: {
          recordsFound: 245,
          sampleRecords: [
            { id: 1, name: 'Juan Pérez', email: 'juan@example.com' },
            { id: 2, name: 'María González', email: 'maria@example.com' },
            { id: 3, name: 'Carlos Rodríguez', email: 'carlos@example.com' },
          ],
        },
      },
    },
    'Aria Lite': {
      connection: {
        status: 'success',
        message: 'Conexión establecida con Aria Lite CRM',
        data: {
          apiVersion: 'v1.8',
          serverStatus: 'online',
          responseTime: '123ms',
        },
      },
    },
    SmartTrack: {
      connection: {
        status: 'success',
        message: 'Conexión establecida con SmartTrack',
        data: {
          apiVersion: 'v3.1',
          status: 'operational',
          activeShipments: 456,
        },
      },
    },
    SGR: {
      connection: {
        status: 'success',
        message: 'Conexión establecida con SGR',
        data: {
          apiVersion: 'v2.0',
          status: 'active',
          openClaims: 234,
        },
      },
    },
    Custom: {
      connection: {
        status: 'failed',
        message: 'Error de conexión: timeout',
        error: {
          code: 'ETIMEDOUT',
          message: 'Connection timeout after 30000ms',
        },
      },
    },
  }

  const handleRunTest = async () => {
    setTesting(true)
    setTestResults([])
    setResponse('')

    const tests: TestResult[] = []

    if (selectedTest === 'connection' || selectedTest === 'all') {
      tests.push({
        test: 'Ping API',
        status: 'pending',
        message: 'Verificando disponibilidad del servidor...',
        duration: 0,
        timestamp: new Date().toISOString(),
      })
      setTestResults([...tests])

      await new Promise(resolve => setTimeout(resolve, 1000))

      tests[tests.length - 1].status = 'success'
      tests[tests.length - 1].message = 'Servidor disponible'
      tests[tests.length - 1].duration = 234
      setTestResults([...tests])
    }

    if (selectedTest === 'auth' || selectedTest === 'connection' || selectedTest === 'all') {
      tests.push({
        test: 'Auth Test',
        status: 'pending',
        message: 'Verificando credenciales...',
        duration: 0,
        timestamp: new Date().toISOString(),
      })
      setTestResults([...tests])

      await new Promise(resolve => setTimeout(resolve, 1200))

      tests[tests.length - 1].status = selectedIntegration === 'Custom' ? 'failed' : 'success'
      tests[tests.length - 1].message = selectedIntegration === 'Custom'
        ? 'Credenciales inválidas'
        : 'Autenticación exitosa'
      tests[tests.length - 1].duration = 156
      setTestResults([...tests])
    }

    if (selectedTest === 'read' || selectedTest === 'all') {
      tests.push({
        test: 'Read Test',
        status: 'pending',
        message: 'Leyendo datos de prueba...',
        duration: 0,
        timestamp: new Date().toISOString(),
      })
      setTestResults([...tests])

      await new Promise(resolve => setTimeout(resolve, 1500))

      tests[tests.length - 1].status = selectedIntegration === 'Custom' ? 'failed' : 'success'
      tests[tests.length - 1].message = selectedIntegration === 'Custom'
        ? 'Error al leer datos'
        : 'Datos leídos correctamente (245 registros)'
      tests[tests.length - 1].duration = 456
      setTestResults([...tests])
    }

    if (selectedTest === 'write' || selectedTest === 'all') {
      tests.push({
        test: 'Write Test',
        status: 'pending',
        message: 'Escribiendo datos de prueba...',
        duration: 0,
        timestamp: new Date().toISOString(),
      })
      setTestResults([...tests])

      await new Promise(resolve => setTimeout(resolve, 1800))

      tests[tests.length - 1].status = selectedIntegration === 'Custom' ? 'failed' : 'success'
      tests[tests.length - 1].message = selectedIntegration === 'Custom'
        ? 'Error al escribir datos'
        : 'Datos escritos correctamente'
      tests[tests.length - 1].duration = 678
      setTestResults([...tests])
    }

    const mockData = mockResponses[selectedIntegration]?.[selectedTest] || mockResponses[selectedIntegration]?.connection

    setResponse(JSON.stringify(mockData, null, 2))
    setTesting(false)
  }

  const handleRunAllTests = async () => {
    setSelectedTest('all')
    await new Promise(resolve => setTimeout(resolve, 100))
    handleRunTest()
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'success'
      case 'failed':
        return 'danger'
      case 'pending':
        return 'warning'
      default:
        return 'neutral'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircleIcon />
      case 'failed':
        return <ErrorIcon />
      default:
        return null
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography level="h2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <TestIcon sx={{ fontSize: 32 }} />
            Testing de Integraciones
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Herramientas de diagnóstico y prueba para todas las integraciones
          </Typography>
        </Box>
      </Box>

      {/* Configuración de Test */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 2 }}>
                Configurar Test
              </Typography>

              <Grid container spacing={2}>
                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Seleccionar Integración</FormLabel>
                    <Select
                      value={selectedIntegration}
                      onChange={(_, value) => setSelectedIntegration(value as string)}
                    >
                      {integrations.map((integration) => (
                        <Option key={integration} value={integration}>
                          {integration}
                        </Option>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Tipo de Test</FormLabel>
                    <Select
                      value={selectedTest}
                      onChange={(_, value) => setSelectedTest(value as string)}
                    >
                      {testTypes.map((test) => (
                        <Option key={test.value} value={test.value}>
                          {test.label}
                        </Option>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid xs={12}>
                  <Alert color="primary">
                    <Typography level="body-sm" fontWeight="lg" sx={{ mb: 0.5 }}>
                      Acerca de los Tests
                    </Typography>
                    <Typography level="body-xs">
                      Los tests verifican la conectividad, autenticación y operaciones básicas con las integraciones.
                      Los datos utilizados son de prueba y no afectan los sistemas en producción.
                    </Typography>
                  </Alert>
                </Grid>

                <Grid xs={12}>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      startDecorator={<RunIcon />}
                      onClick={handleRunTest}
                      loading={testing}
                      fullWidth
                    >
                      Ejecutar Test Seleccionado
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={handleRunAllTests}
                      loading={testing}
                      fullWidth
                    >
                      Ejecutar Todos los Tests
                    </Button>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography level="title-md" sx={{ mb: 2 }}>Tests Disponibles</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {testTypes.map((test) => (
                  <Box
                    key={test.value}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      p: 1,
                      borderRadius: 'sm',
                      bgcolor: selectedTest === test.value ? 'primary.softBg' : 'transparent',
                      cursor: 'pointer',
                      '&:hover': {
                        bgcolor: 'neutral.softHoverBg',
                      },
                    }}
                    onClick={() => setSelectedTest(test.value)}
                  >
                    <Box sx={{ color: 'primary.500' }}>{test.icon}</Box>
                    <Typography level="body-sm">{test.label}</Typography>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Resultados de Test */}
      {testResults.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography level="title-lg" sx={{ mb: 2 }}>
              Resultados del Test
            </Typography>

            <Sheet sx={{ overflow: 'auto' }}>
              <Table>
                <thead>
                  <tr>
                    <th style={{ width: '30%' }}>Test</th>
                    <th style={{ width: '15%' }}>Estado</th>
                    <th style={{ width: '45%' }}>Mensaje</th>
                    <th style={{ width: '10%' }}>Duración</th>
                  </tr>
                </thead>
                <tbody>
                  {testResults.map((result, idx) => (
                    <tr key={idx}>
                      <td>
                        <Typography level="body-sm" fontWeight="lg">
                          {result.test}
                        </Typography>
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          color={getStatusColor(result.status)}
                          variant="soft"
                          startDecorator={getStatusIcon(result.status)}
                        >
                          {result.status}
                        </Chip>
                      </td>
                      <td>
                        <Typography level="body-sm">
                          {result.message}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-sm">
                          {result.duration > 0 ? `${result.duration}ms` : '-'}
                        </Typography>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Sheet>

            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                {testResults.filter(r => r.status === 'success').length} de {testResults.length} tests exitosos
              </Typography>
              <Chip
                color={testResults.every(r => r.status === 'success') ? 'success' : 'danger'}
                variant="soft"
                size="lg"
                startDecorator={
                  testResults.every(r => r.status === 'success') ? <CheckCircleIcon /> : <ErrorIcon />
                }
              >
                {testResults.every(r => r.status === 'success') ? 'Todos los tests pasaron' : 'Algunos tests fallaron'}
              </Chip>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Consola de Respuestas */}
      {response && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography level="title-lg" startDecorator={<CodeIcon />}>
                Respuesta de la API
              </Typography>
              <Button
                size="sm"
                variant="outlined"
                onClick={() => navigator.clipboard.writeText(response)}
              >
                Copiar JSON
              </Button>
            </Box>

            <Sheet
              sx={{
                bgcolor: 'neutral.900',
                p: 2,
                borderRadius: 'sm',
                overflow: 'auto',
                maxHeight: 400,
              }}
            >
              <Typography
                level="body-sm"
                sx={{
                  fontFamily: 'monospace',
                  color: 'common.white',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {response}
              </Typography>
            </Sheet>
          </CardContent>
        </Card>
      )}

      {/* Historial de Tests */}
      <Card>
        <CardContent>
          <Typography level="title-lg" startDecorator={<HistoryIcon />} sx={{ mb: 2 }}>
            Historial de Tests Ejecutados
          </Typography>

          <Sheet sx={{ overflow: 'auto' }}>
            <Table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Integración</th>
                  <th>Tipo de Test</th>
                  <th>Estado</th>
                  <th>Duración</th>
                </tr>
              </thead>
              <tbody>
                {testHistory.map((test) => (
                  <tr key={test.id}>
                    <td>
                      <Typography level="body-xs">
                        {test.timestamp}
                      </Typography>
                    </td>
                    <td>
                      <Chip size="sm" variant="outlined">
                        {test.integration}
                      </Chip>
                    </td>
                    <td>
                      <Typography level="body-sm">
                        {test.testType}
                      </Typography>
                    </td>
                    <td>
                      <Chip
                        size="sm"
                        color={test.status === 'success' ? 'success' : 'danger'}
                        variant="soft"
                        startDecorator={test.status === 'success' ? <CheckCircleIcon /> : <ErrorIcon />}
                      >
                        {test.status}
                      </Chip>
                    </td>
                    <td>
                      <Typography level="body-sm">
                        {test.duration > 0 ? `${test.duration}ms` : 'N/A'}
                      </Typography>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Sheet>
        </CardContent>
      </Card>
    </Box>
  )
}
