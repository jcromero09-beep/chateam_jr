import { useState, useEffect, useCallback } from 'react'
import CircularProgress from '@mui/joy/CircularProgress'
import {
  Gear,
  CheckCircle,
  XCircle,
  CurrencyDollar,
  ArrowClockwise,
  X,
  Warning,
  Eye,
  Function as FunctionIcon,
  Lightning,
} from '@phosphor-icons/react'
import { StatTile } from '@/components/ui/stat-tile'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import api from '../services/api'

interface ModelInfo {
  id: string
  name: string
  description: string
  inputCost: number
  outputCost: number
  contextWindow: number
  supportsVision: boolean
  supportsFunctions: boolean
  supportsStreaming: boolean
}

interface ProviderModels {
  provider: string
  providerName: string
  isConnected: boolean
  models: ModelInfo[]
}

const PROVIDER_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
  google: 'Google (Gemini)',
  azure: 'Azure OpenAI',
  cohere: 'Cohere',
  mistral: 'Mistral AI',
  deepseek: 'DeepSeek',
}

// Default models info for when provider is not connected
const DEFAULT_MODELS: Record<string, ModelInfo[]> = {
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o', description: 'Modelo mas capaz, multimodal', inputCost: 2.50, outputCost: 10.00, contextWindow: 128000, supportsVision: true, supportsFunctions: true, supportsStreaming: true },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Version economica de GPT-4o', inputCost: 0.15, outputCost: 0.60, contextWindow: 128000, supportsVision: true, supportsFunctions: true, supportsStreaming: true },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Version rapida de GPT-4', inputCost: 10.00, outputCost: 30.00, contextWindow: 128000, supportsVision: true, supportsFunctions: true, supportsStreaming: true },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Modelo economico para tareas simples', inputCost: 0.50, outputCost: 1.50, contextWindow: 16385, supportsVision: false, supportsFunctions: true, supportsStreaming: true },
  ],
  anthropic: [
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'El mas inteligente de Claude', inputCost: 3.00, outputCost: 15.00, contextWindow: 200000, supportsVision: true, supportsFunctions: true, supportsStreaming: true },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Rapido y economico', inputCost: 0.80, outputCost: 4.00, contextWindow: 200000, supportsVision: true, supportsFunctions: true, supportsStreaming: true },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: 'Maximo rendimiento', inputCost: 15.00, outputCost: 75.00, contextWindow: 200000, supportsVision: true, supportsFunctions: true, supportsStreaming: true },
  ],
  google: [
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Modelo avanzado con contexto largo', inputCost: 1.25, outputCost: 5.00, contextWindow: 2000000, supportsVision: true, supportsFunctions: true, supportsStreaming: true },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Respuestas rapidas', inputCost: 0.075, outputCost: 0.30, contextWindow: 1000000, supportsVision: true, supportsFunctions: true, supportsStreaming: true },
    { id: 'gemini-pro', name: 'Gemini Pro', description: 'Version base', inputCost: 0.50, outputCost: 1.50, contextWindow: 32768, supportsVision: false, supportsFunctions: true, supportsStreaming: true },
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek Chat', description: 'Chat general economico', inputCost: 0.14, outputCost: 0.28, contextWindow: 64000, supportsVision: false, supportsFunctions: false, supportsStreaming: true },
    { id: 'deepseek-coder', name: 'DeepSeek Coder', description: 'Especializado en codigo', inputCost: 0.14, outputCost: 0.28, contextWindow: 64000, supportsVision: false, supportsFunctions: false, supportsStreaming: true },
  ],
  mistral: [
    { id: 'mistral-large-latest', name: 'Mistral Large', description: 'Modelo mas potente', inputCost: 2.00, outputCost: 6.00, contextWindow: 128000, supportsVision: false, supportsFunctions: true, supportsStreaming: true },
    { id: 'mistral-medium-latest', name: 'Mistral Medium', description: 'Balance entre costo y rendimiento', inputCost: 2.70, outputCost: 8.10, contextWindow: 32000, supportsVision: false, supportsFunctions: true, supportsStreaming: true },
    { id: 'mistral-small-latest', name: 'Mistral Small', description: 'Economico', inputCost: 0.20, outputCost: 0.60, contextWindow: 32000, supportsVision: false, supportsFunctions: true, supportsStreaming: true },
  ],
  cohere: [
    { id: 'command-r-plus', name: 'Command R+', description: 'Modelo avanzado con RAG', inputCost: 2.50, outputCost: 10.00, contextWindow: 128000, supportsVision: false, supportsFunctions: true, supportsStreaming: true },
    { id: 'command-r', name: 'Command R', description: 'Modelo base', inputCost: 0.15, outputCost: 0.60, contextWindow: 128000, supportsVision: false, supportsFunctions: true, supportsStreaming: true },
  ],
}

// Umbral de costo -> variante de Badge del design system.
const inputCostVariant = (cost: number): BadgeProps['variant'] =>
  cost < 1 ? 'success' : cost < 5 ? 'warning' : 'destructive'
const outputCostVariant = (cost: number): BadgeProps['variant'] =>
  cost < 2 ? 'success' : cost < 10 ? 'warning' : 'destructive'

export default function OpenAIModels() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [providerModels, setProviderModels] = useState<ProviderModels[]>([])
  const [selectedProvider, setSelectedProvider] = useState(0)

  const fetchModels = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      console.log('[OpenAIModels] Fetching providers and models...')

      // Get configured providers
      const providersResponse = await api.get('/ai/providers')
      const providers = providersResponse.data

      // Build provider models list
      const allProviders: ProviderModels[] = Object.keys(DEFAULT_MODELS).map(provider => {
        const configuredProvider = providers.find((p: any) => p.provider === provider)
        return {
          provider,
          providerName: PROVIDER_NAMES[provider] || provider,
          isConnected: configuredProvider?.connectionStatus === 'connected',
          models: DEFAULT_MODELS[provider] || [],
        }
      })

      console.log('[OpenAIModels] Models loaded:', allProviders)
      setProviderModels(allProviders)
    } catch (err: any) {
      console.error('[OpenAIModels] Error fetching models:', err)
      setError(err.response?.data?.error || 'Error al cargar modelos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchModels()
  }, [fetchModels])

  const formatCost = (cost: number) => {
    return `$${cost.toFixed(2)}`
  }

  const formatContext = (tokens: number) => {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`
    } else if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(0)}K`
    }
    return tokens.toString()
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <CircularProgress size="lg" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Gear className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Modelos de IA Disponibles
              </h1>
              <p className="text-sm text-muted-foreground">
                Catalogo de modelos por proveedor con costos y capacidades
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchModels}>
            <ArrowClockwise className="size-4" aria-hidden />
            Actualizar
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/12 px-4 py-3 text-sm text-destructive-text"
          >
            <span>{error}</span>
            <button
              type="button"
              aria-label="Cerrar aviso"
              onClick={() => setError(null)}
              className="flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-destructive/15"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        {/* Resumen de Proveedores */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Total Proveedores" value={String(providerModels.length)} />
          <StatTile
            label="Proveedores Conectados"
            value={String(providerModels.filter(p => p.isConnected).length)}
            tone="success"
          />
          <StatTile
            label="Total Modelos"
            value={String(providerModels.reduce((sum, p) => sum + p.models.length, 0))}
          />
          <StatTile
            label="Modelos con Vision"
            value={String(
              providerModels.reduce((sum, p) => sum + p.models.filter(m => m.supportsVision).length, 0),
            )}
          />
        </div>

        {/* Tabs por proveedor */}
        <Tabs
          value={String(selectedProvider)}
          onValueChange={(val) => setSelectedProvider(Number(val))}
        >
          <div className="overflow-x-auto">
            <TabsList>
              {providerModels.map((provider, index) => (
                <TabsTrigger key={provider.provider} value={String(index)}>
                  {provider.isConnected ? (
                    <CheckCircle className="size-4 text-success-text" weight="fill" aria-hidden />
                  ) : (
                    <XCircle className="size-4 text-muted-foreground" aria-hidden />
                  )}
                  {provider.providerName}
                  <Badge variant="neutral">{provider.models.length}</Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {providerModels.map((provider, index) => (
            <TabsContent key={provider.provider} value={String(index)}>
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">
                      Modelos de {provider.providerName}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {provider.models.length} modelos disponibles
                    </p>
                  </div>
                  <Badge variant={provider.isConnected ? 'success' : 'neutral'}>
                    {provider.isConnected ? (
                      <CheckCircle className="size-3.5" weight="fill" aria-hidden />
                    ) : (
                      <XCircle className="size-3.5" aria-hidden />
                    )}
                    {provider.isConnected ? 'Conectado' : 'No Configurado'}
                  </Badge>
                </div>

                {!provider.isConnected && (
                  <div
                    role="alert"
                    className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/16 px-4 py-3 text-sm text-warning-text"
                  >
                    <Warning className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
                    <span>
                      Este proveedor no esta configurado. Ve a Configuracion de IA para agregar tu API key.
                    </span>
                  </div>
                )}

                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left">
                        <th className="w-[200px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Modelo
                        </th>
                        <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Descripcion
                        </th>
                        <th className="w-[120px] whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          <span className="inline-flex items-center justify-end gap-1">
                            <CurrencyDollar className="size-4" aria-hidden />
                            Input/1M
                          </span>
                        </th>
                        <th className="w-[120px] whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          <span className="inline-flex items-center justify-end gap-1">
                            <CurrencyDollar className="size-4" aria-hidden />
                            Output/1M
                          </span>
                        </th>
                        <th className="w-[100px] whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Contexto
                        </th>
                        <th className="w-[200px] whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Capacidades
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {provider.models.map((model) => (
                        <tr key={model.id} className="transition-colors hover:bg-accent/40">
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{model.name}</p>
                            <p className="font-mono text-xs text-muted-foreground">{model.id}</p>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{model.description}</td>
                          <td className="px-4 py-3 text-right">
                            <Badge variant={inputCostVariant(model.inputCost)}>
                              {formatCost(model.inputCost)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Badge variant={outputCostVariant(model.outputCost)}>
                              {formatCost(model.outputCost)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant="outline">{formatContext(model.contextWindow)}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap justify-center gap-1.5">
                              {model.supportsVision && (
                                <Badge variant="primary">
                                  <Eye className="size-3.5" aria-hidden />
                                  Vision
                                </Badge>
                              )}
                              {model.supportsFunctions && (
                                <Badge variant="success">
                                  <FunctionIcon className="size-3.5" aria-hidden />
                                  Functions
                                </Badge>
                              )}
                              {model.supportsStreaming && (
                                <Badge variant="neutral">
                                  <Lightning className="size-3.5" aria-hidden />
                                  Stream
                                </Badge>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        {/* Leyenda de Costos */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Informacion de Precios</h3>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <p className="text-xs text-muted-foreground">
              Los precios son por 1 millon de tokens (Diciembre 2024)
            </p>
            <div className="flex items-center gap-1.5">
              <Badge variant="success">Bajo</Badge>
              <span className="text-xs text-muted-foreground">{'< $1 input / < $2 output'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="warning">Medio</Badge>
              <span className="text-xs text-muted-foreground">{'$1-$5 input / $2-$10 output'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="destructive">Alto</Badge>
              <span className="text-xs text-muted-foreground">{'>= $5 input / >= $10 output'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
