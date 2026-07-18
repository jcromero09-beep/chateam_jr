import { useState, useEffect, type ReactNode } from 'react'
import { LinearProgress } from '@mui/joy'
import {
  Bug,
  Play,
  CheckCircle,
  XCircle,
  Code,
  ClockCounterClockwise,
  WebhooksLogo,
  ArrowsClockwise,
  WifiHigh,
  Key,
  Eye,
  PencilSimple,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
    { value: 'connection', label: 'Test de Conexión', icon: <WifiHigh className="size-5" aria-hidden /> },
    { value: 'auth', label: 'Test de Autenticación', icon: <Key className="size-5" aria-hidden /> },
    { value: 'read', label: 'Test de Lectura', icon: <Eye className="size-5" aria-hidden /> },
    { value: 'write', label: 'Test de Escritura', icon: <PencilSimple className="size-5" aria-hidden /> },
    { value: 'sync', label: 'Test de Sincronización', icon: <ArrowsClockwise className="size-5" aria-hidden /> },
    { value: 'webhook', label: 'Test de Webhook', icon: <WebhooksLogo className="size-5" aria-hidden /> },
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

  const getStatusVariant = (status: string): BadgeProps['variant'] => {
    switch (status) {
      case 'success':
        return 'success'
      case 'failed':
        return 'destructive'
      case 'pending':
        return 'warning'
      default:
        return 'neutral'
    }
  }

  const getStatusIcon = (status: string): ReactNode => {
    switch (status) {
      case 'success':
        return <CheckCircle className="size-3.5" weight="fill" aria-hidden />
      case 'failed':
        return <XCircle className="size-3.5" weight="fill" aria-hidden />
      default:
        return null
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Bug className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Testing de Integraciones
              </h1>
              <p className="text-sm text-muted-foreground">
                Herramientas de diagnóstico y prueba para todas las integraciones
              </p>
            </div>
          </div>
        </div>

        {/* Configuración de Test */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <h2 className="mb-4 text-lg font-semibold text-foreground">Configurar Test</h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="integration-select">Seleccionar Integración</Label>
                <Select
                  value={selectedIntegration}
                  onValueChange={(value) => setSelectedIntegration(value)}
                >
                  <SelectTrigger id="integration-select">
                    <SelectValue placeholder="Selecciona una integración" />
                  </SelectTrigger>
                  <SelectContent>
                    {integrations.map((integration) => (
                      <SelectItem key={integration} value={integration}>
                        {integration}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="test-type-select">Tipo de Test</Label>
                <Select
                  value={selectedTest}
                  onValueChange={(value) => setSelectedTest(value)}
                >
                  <SelectTrigger id="test-type-select">
                    <SelectValue placeholder="Selecciona un tipo de test" />
                  </SelectTrigger>
                  <SelectContent>
                    {testTypes.map((test) => (
                      <SelectItem key={test.value} value={test.value}>
                        {test.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <div className="rounded-lg border border-primary/25 bg-primary/10 p-3.5">
                  <p className="mb-1 text-sm font-semibold text-foreground">
                    Acerca de los Tests
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Los tests verifican la conectividad, autenticación y operaciones básicas con las integraciones.
                    Los datos utilizados son de prueba y no afectan los sistemas en producción.
                  </p>
                </div>
              </div>

              <div className="md:col-span-2 flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={handleRunTest}
                  loading={testing}
                  disabled={!selectedIntegration}
                  className="w-full"
                >
                  <Play className="size-4" weight="fill" aria-hidden />
                  Ejecutar Test Seleccionado
                </Button>
                <Button
                  variant="outline"
                  onClick={handleRunAllTests}
                  loading={testing}
                  disabled={!selectedIntegration}
                  className="w-full"
                >
                  Ejecutar Todos los Tests
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <h2 className="mb-4 text-base font-semibold text-foreground">Tests Disponibles</h2>
            <div className="flex flex-col gap-1">
              {testTypes.map((test) => (
                <button
                  key={test.value}
                  type="button"
                  onClick={() => setSelectedTest(test.value)}
                  aria-pressed={selectedTest === test.value}
                  className={
                    selectedTest === test.value
                      ? 'flex items-center gap-2 rounded-md bg-primary/12 p-2 text-left text-primary transition-colors'
                      : 'flex items-center gap-2 rounded-md p-2 text-left text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground'
                  }
                >
                  <span className={selectedTest === test.value ? 'text-primary' : 'text-primary/80'}>
                    {test.icon}
                  </span>
                  <span className="text-sm text-foreground">{test.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Resultados de Test */}
        {testResults.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <h2 className="mb-4 text-lg font-semibold text-foreground">Resultados del Test</h2>

            <div className="overflow-hidden rounded-lg border border-border">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left">
                      <th className="w-[30%] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Test</th>
                      <th className="w-[15%] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado</th>
                      <th className="w-[45%] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mensaje</th>
                      <th className="w-[10%] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Duración</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {testResults.map((result, idx) => (
                      <tr key={idx} className="transition-colors hover:bg-accent/40">
                        <td className="px-4 py-3 font-medium text-foreground">{result.test}</td>
                        <td className="px-4 py-3">
                          <Badge variant={getStatusVariant(result.status)}>
                            {getStatusIcon(result.status)}
                            {result.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{result.message}</td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {result.duration > 0 ? `${result.duration}ms` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">
                {testResults.filter((r) => r.status === 'success').length} de {testResults.length} tests exitosos
              </span>
              <Badge variant={testResults.every((r) => r.status === 'success') ? 'success' : 'destructive'}>
                {testResults.every((r) => r.status === 'success') ? (
                  <CheckCircle className="size-3.5" weight="fill" aria-hidden />
                ) : (
                  <XCircle className="size-3.5" weight="fill" aria-hidden />
                )}
                {testResults.every((r) => r.status === 'success')
                  ? 'Todos los tests pasaron'
                  : 'Algunos tests fallaron'}
              </Badge>
            </div>
          </div>
        )}

        {/* Consola de Respuestas */}
        {response && (
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <Code className="size-5" aria-hidden />
                Respuesta de la API
              </h2>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigator.clipboard.writeText(response)}
              >
                Copiar JSON
              </Button>
            </div>

            <div className="max-h-[400px] overflow-auto rounded-lg border border-border bg-muted p-4">
              <pre className="whitespace-pre-wrap font-mono text-sm text-foreground">
                {response}
              </pre>
            </div>
          </div>
        )}

        {/* Historial de Tests */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <ClockCounterClockwise className="size-5" aria-hidden />
            Historial de Tests Ejecutados
          </h2>

          {loadingHistory && <LinearProgress sx={{ mb: 2 }} />}

          <div className="overflow-hidden rounded-lg border border-border">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timestamp</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Integración</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipo de Test</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Duración</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {testHistory.length === 0 && !loadingHistory ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                        No hay tests ejecutados aún.
                      </td>
                    </tr>
                  ) : (
                    testHistory.map((test) => (
                      <tr key={test.id} className="transition-colors hover:bg-accent/40">
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                          {test.timestamp}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{test.integration}</Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{test.testType}</td>
                        <td className="px-4 py-3">
                          <Badge variant={test.status === 'success' ? 'success' : 'destructive'}>
                            {test.status === 'success' ? (
                              <CheckCircle className="size-3.5" weight="fill" aria-hidden />
                            ) : (
                              <XCircle className="size-3.5" weight="fill" aria-hidden />
                            )}
                            {test.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {test.duration > 0 ? `${test.duration}ms` : 'N/A'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
