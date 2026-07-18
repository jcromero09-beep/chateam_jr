import { useState } from 'react'
import { CircularProgress } from '@mui/joy'
import {
  Play as PlayIcon,
  X as ClearIcon,
  FloppyDisk as SaveIcon,
  ClockCounterClockwise as HistoryIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import api from '../services/api'

interface TestResult {
  id: number
  timestamp: string
  model: string
  prompt: string
  response: string
  tokens: number
  cost: number
  duration: number
  success: boolean
}

export default function OpenAITesting() {
  const [selectedModel, setSelectedModel] = useState('gpt-4-turbo')
  const [prompt, setPrompt] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('Eres un asistente útil y profesional.')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(1000)
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState('')
  const [testInfo, setTestInfo] = useState<{ tokens: number; cost: number; duration: number } | null>(null)
  const [history, setHistory] = useState<TestResult[]>([])

  const handleTest = async () => {
    if (!prompt.trim()) return

    setLoading(true)
    setResponse('')
    setTestInfo(null)

    try {
      const { data } = await api.post('/ai/test', {
        prompt,
        model: selectedModel,
        systemPrompt,
        temperature,
        maxTokens,
      })

      const result = data?.data ?? data ?? {}
      const aiResponse: string = result.response ?? ''
      const tokens: number = result.tokens ?? 0
      const cost: number = result.cost ?? 0
      const duration: number = result.duration ?? 0

      setResponse(aiResponse)
      setTestInfo({ tokens, cost, duration })

      const newResult: TestResult = {
        id: Date.now(),
        timestamp: new Date().toLocaleString('es-ES'),
        model: selectedModel,
        prompt,
        response: aiResponse,
        tokens,
        cost,
        duration,
        success: true,
      }
      setHistory((prev) => [newResult, ...prev])
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Error al conectar con la API de IA'
      setResponse(errorMsg)
      setTestInfo(null)

      const failedResult: TestResult = {
        id: Date.now(),
        timestamp: new Date().toLocaleString('es-ES'),
        model: selectedModel,
        prompt,
        response: errorMsg,
        tokens: 0,
        cost: 0,
        duration: 0,
        success: false,
      }
      setHistory((prev) => [failedResult, ...prev])
    } finally {
      setLoading(false)
    }
  }

  const handleClear = () => {
    setPrompt('')
    setResponse('')
    setTestInfo(null)
  }

  const handleSaveTest = async () => {
    try {
      await api.post('/ai/prompts', { prompt, model: selectedModel, systemPrompt })
    } catch {
      // manejar error silenciosamente
    }
  }

  const modelOptions = [
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', cost: '$0.03/1K tokens' },
    { value: 'gpt-35-turbo', label: 'GPT-3.5 Turbo', cost: '$0.001/1K tokens' },
    { value: 'gemini-pro', label: 'Gemini Pro', cost: '$0.0005/1K tokens' },
    { value: 'deepseek-chat', label: 'DeepSeek Chat', cost: '$0.00014/1K tokens' },
    { value: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet', cost: '$0.015/1K tokens' },
  ]

  const textareaClass =
    'w-full rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Testing de Prompts
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Prueba y experimenta con diferentes modelos y configuraciones en tiempo real
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Panel de Configuración */}
          <div className="space-y-4 lg:col-span-5">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
              <h2 className="mb-4 text-lg font-semibold text-foreground">
                Configuración del Test
              </h2>

              <div className="flex flex-col gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="model-select">
                    Modelo <span className="text-destructive-text">*</span>
                  </Label>
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger id="model-select" aria-label="Modelo">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {modelOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <span className="flex w-full items-center justify-between gap-4">
                            <span>{option.label}</span>
                            <span className="text-xs text-muted-foreground">{option.cost}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="system-prompt">System Prompt</Label>
                  <textarea
                    id="system-prompt"
                    rows={2}
                    placeholder="Ej: Eres un asistente especializado en..."
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    className={textareaClass}
                  />
                  <p className="text-xs text-muted-foreground">
                    Define el rol y comportamiento del modelo
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="user-prompt">User Prompt</Label>
                  <textarea
                    id="user-prompt"
                    rows={4}
                    placeholder="Escribe tu prompt aquí..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    required
                    className={textareaClass}
                  />
                  <p className="text-xs text-muted-foreground">
                    {prompt.length} caracteres
                  </p>
                </div>

                <div className="border-t border-border" />

                <div className="space-y-1.5">
                  <Label htmlFor="temperature">Temperature: {temperature}</Label>
                  <input
                    id="temperature"
                    type="range"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    min={0}
                    max={2}
                    step={0.1}
                    className="w-full cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0</span>
                    <span>1</span>
                    <span>2</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    0 = Determinístico y preciso | 2 = Creativo y variado
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="max-tokens">Max Tokens</Label>
                  <input
                    id="max-tokens"
                    type="number"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                    min={100}
                    max={4000}
                    step={100}
                    className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                  <p className="text-xs text-muted-foreground">
                    Límite de tokens en la respuesta
                  </p>
                </div>

                <div className="mt-2 flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={handleTest}
                    disabled={!prompt.trim() || loading}
                  >
                    {loading ? (
                      <CircularProgress size="sm" />
                    ) : (
                      <PlayIcon className="size-4" weight="fill" aria-hidden />
                    )}
                    {loading ? 'Procesando...' : 'Ejecutar Test'}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Limpiar"
                    onClick={handleClear}
                    disabled={loading}
                  >
                    <ClearIcon className="size-5" aria-hidden />
                  </Button>
                </div>
              </div>
            </div>

            {/* Info de Costo Estimado */}
            <div className="rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-foreground">
              <strong>Costo estimado:</strong> ~$0.003 - $0.03 por test (dependiendo del modelo)
            </div>
          </div>

          {/* Panel de Resultados */}
          <div className="space-y-6 lg:col-span-7">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">Respuesta del Modelo</h2>
                {response && (
                  <Button size="sm" variant="outline" onClick={handleSaveTest}>
                    <SaveIcon className="size-4" aria-hidden />
                    Guardar como Prompt
                  </Button>
                )}
              </div>

              {!response && !loading && (
                <div className="flex min-h-[400px] items-center justify-center rounded-md border border-dashed border-border bg-muted/40">
                  <p className="text-sm text-muted-foreground">
                    La respuesta del modelo aparecerá aquí...
                  </p>
                </div>
              )}

              {loading && (
                <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
                  <CircularProgress />
                  <p className="text-sm text-muted-foreground">Generando respuesta...</p>
                </div>
              )}

              {response && (
                <>
                  <div className="mb-4 min-h-[300px] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-4 font-mono text-sm text-foreground">
                    {response}
                  </div>

                  {testInfo && (
                    <div className="grid grid-cols-3 gap-4">
                      <div className="rounded-lg border border-border bg-card p-4">
                        <p className="mb-1 text-xs text-muted-foreground">Tokens</p>
                        <p className="text-lg font-semibold tabular-nums text-foreground">
                          {testInfo.tokens}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border bg-card p-4">
                        <p className="mb-1 text-xs text-muted-foreground">Costo</p>
                        <p className="text-lg font-semibold tabular-nums text-foreground">
                          ${testInfo.cost.toFixed(5)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border bg-card p-4">
                        <p className="mb-1 text-xs text-muted-foreground">Duración</p>
                        <p className="text-lg font-semibold tabular-nums text-foreground">
                          {testInfo.duration.toFixed(2)}s
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Historial de Tests */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                <HistoryIcon className="size-5" aria-hidden />
                Historial de Tests
              </h2>

              {history.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-muted/40 py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No hay tests ejecutados. Escribe un prompt para probar la IA.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {history.map((test) => (
                    <div key={test.id} className="rounded-lg border border-border bg-card p-4">
                      <div className="mb-2 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{test.model}</p>
                          <p className="text-xs text-muted-foreground">{test.timestamp}</p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <Badge variant="outline">{test.tokens} tokens</Badge>
                          <Badge variant="outline">${test.cost.toFixed(5)}</Badge>
                          <Badge variant="outline">{test.duration.toFixed(2)}s</Badge>
                        </div>
                      </div>
                      <p className="mb-2 text-sm italic text-foreground">
                        "{test.prompt.substring(0, 100)}
                        {test.prompt.length > 100 ? '...' : ''}"
                      </p>
                      <div className="my-2 border-t border-border" />
                      <p className="text-xs text-muted-foreground">
                        {test.response.substring(0, 150)}
                        {test.response.length > 150 ? '...' : ''}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
