import { useState, useEffect } from 'react'
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
  LinearProgress,
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
import api from '../services/api'

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
  const [selectedIntegration, setSelectedIntegration] = useState<string>('')
  const [selectedTest, setSelectedTest] = useState<string>('connection')
  const [testing, setTesting] = useState(false)
  const [testResults, setTestResults] = useState<TestResult[]>([])
  const [response, setResponse] = useState<string>('')
  const [testHistory, setTestHistory] = useState<TestHistory[]>([])
  const [integrations, setIntegrations] = useState<string[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const testTypes = [
    { value: 'connection', label: 'Test de Conexión', icon: <PingIcon /> },
    { value: 'auth', label: 'Test de Autenticación', icon: <AuthIcon /> },
    { value: 'read', label: 'Test de Lectura', icon: <ReadIcon /> },
    { value: 'write', label: 'Test de Escritura', icon: <WriteIcon /> },
    { value: 'sync', label: 'Test de Sincronización', icon: <SyncIcon /> },
    { value: 'webhook', label: 'Test de Webhook', icon: <WebhookIcon /> },
  ]

  useEffect(() => {
    const fetchIntegrations = async () => {
      try {
        const { data } = await api.get('/integrations')
        const list: string[] = data?.data ?? data ?? []
        setIntegrations(list)
        if (list.length > 0) setSelectedIntegration(list[0])
      } catch {
        setIntegrations([])
      }
    }

    const fetchHistory = async () => {
      setLoadingHistory(true)
      try {
        const { data } = await api.get('/integrations/test/history')
        setTestHistory(data?.data ?? data ?? [])
      } catch {
        setTestHistory([])
      } finally {
        setLoadingHistory(false)
      }
    }

    fetchIntegrations()
    fetchHistory()
  }, [])

  const handleRunTest = async () => {
    if (!selectedIntegration) return
    setTesting(true)
    setTestResults([])
    setResponse('')

    try {
      const { data } = await api.post('/integrations/test', {
        integration: selectedIntegration,
        testType: selectedTest,
      })

      const result = data?.data ?? data ?? {}
      setTestResults(result.steps ?? [])
      setResponse(JSON.stringify(result.apiResponse ?? result, null, 2))

      // Agregar al historial local
      const historyEntry: TestHistory = {
        id: Date.now(),
        integration: selectedIntegration,
        testType: testTypes.find((t) => t.value === selectedTest)?.label ?? selectedTest,
        status: result.success ? 'success' : 'failed',
        timestamp: new Date().toLocaleString('es-ES'),
        duration: result.duration ?? 0,
      }
      setTestHistory((prev) => [historyEntry, ...prev])
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Error al ejecutar el test'
      setTestResults([
        {
          test: selectedTest,
          status: 'failed',
          message: errorMsg,
          duration: 0,
          timestamp: new Date().toISOString(),
        },
      ])
      setResponse(JSON.stringify({ error: errorMsg }, null, 2))
    } finally {
      setTesting(false)
    }
  }

  const handleRunAllTests = () => {
    setSelectedTest('all')
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
                      placeholder="Selecciona una integración"
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
                      disabled={!selectedIntegration}
                      fullWidth
                    >
                      Ejecutar Test Seleccionado
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={handleRunAllTests}
                      loading={testing}
                      disabled={!selectedIntegration}
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

          {loadingHistory && <LinearProgress sx={{ mb: 2 }} />}

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
                {testHistory.length === 0 && !loadingHistory ? (
                  <tr>
                    <td colSpan={5}>
                      <Box sx={{ py: 4, textAlign: 'center' }}>
                        <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                          No hay tests ejecutados aún.
                        </Typography>
                      </Box>
                    </td>
                  </tr>
                ) : (
                  testHistory.map((test) => (
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
                  ))
                )}
              </tbody>
            </Table>
          </Sheet>
        </CardContent>
      </Card>
    </Box>
  )
}
