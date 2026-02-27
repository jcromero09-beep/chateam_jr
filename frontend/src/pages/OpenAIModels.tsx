import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Button,
  Table,
  Sheet,
  Alert,
  CircularProgress,
  Tabs,
  TabList,
  Tab,
  TabPanel,
} from '@mui/joy'
import {
  Settings as SettingsIcon,
  CheckCircle as ActiveIcon,
  Cancel as InactiveIcon,
  Speed as SpeedIcon,
  AttachMoney as CostIcon,
  Refresh as RefreshIcon,
  Close as CloseIcon,
} from '@mui/icons-material'
import IconButton from '@mui/joy/IconButton'
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
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress size="lg" />
      </Box>
    )
  }

  const currentProvider = providerModels[selectedProvider]

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography level="h2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <SettingsIcon sx={{ fontSize: 32 }} />
            Modelos de IA Disponibles
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Catalogo de modelos por proveedor con costos y capacidades
          </Typography>
        </Box>
        <Button variant="outlined" startDecorator={<RefreshIcon />} onClick={fetchModels}>
          Actualizar
        </Button>
      </Box>

      {error && (
        <Alert
          color="danger"
          sx={{ mb: 2 }}
          endDecorator={
            <IconButton variant="soft" color="danger" onClick={() => setError(null)}>
              <CloseIcon />
            </IconButton>
          }
        >
          {error}
        </Alert>
      )}

      {/* Resumen de Proveedores */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Total Proveedores
              </Typography>
              <Typography level="h3">{providerModels.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Proveedores Conectados
              </Typography>
              <Typography level="h3" sx={{ color: 'success.500' }}>
                {providerModels.filter(p => p.isConnected).length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Total Modelos
              </Typography>
              <Typography level="h3">
                {providerModels.reduce((sum, p) => sum + p.models.length, 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Modelos con Vision
              </Typography>
              <Typography level="h3">
                {providerModels.reduce((sum, p) => sum + p.models.filter(m => m.supportsVision).length, 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Tabs value={selectedProvider} onChange={(_, val) => setSelectedProvider(val as number)}>
        <TabList>
          {providerModels.map((provider, index) => (
            <Tab key={provider.provider}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {provider.isConnected ? (
                  <ActiveIcon sx={{ fontSize: 16, color: 'success.500' }} />
                ) : (
                  <InactiveIcon sx={{ fontSize: 16, color: 'neutral.400' }} />
                )}
                {provider.providerName}
                <Chip size="sm" variant="soft">{provider.models.length}</Chip>
              </Box>
            </Tab>
          ))}
        </TabList>

        {providerModels.map((provider, index) => (
          <TabPanel key={provider.provider} value={index}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Box>
                    <Typography level="title-lg">
                      Modelos de {provider.providerName}
                    </Typography>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                      {provider.models.length} modelos disponibles
                    </Typography>
                  </Box>
                  <Chip
                    size="lg"
                    color={provider.isConnected ? 'success' : 'neutral'}
                    startDecorator={provider.isConnected ? <ActiveIcon /> : <InactiveIcon />}
                  >
                    {provider.isConnected ? 'Conectado' : 'No Configurado'}
                  </Chip>
                </Box>

                {!provider.isConnected && (
                  <Alert color="warning" sx={{ mb: 2 }}>
                    Este proveedor no esta configurado. Ve a Configuracion de IA para agregar tu API key.
                  </Alert>
                )}

                <Sheet sx={{ overflow: 'auto' }}>
                  <Table>
                    <thead>
                      <tr>
                        <th style={{ width: 200 }}>Modelo</th>
                        <th>Descripcion</th>
                        <th style={{ width: 120, textAlign: 'right' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
                            <CostIcon sx={{ fontSize: 16 }} />
                            Input/1M
                          </Box>
                        </th>
                        <th style={{ width: 120, textAlign: 'right' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
                            <CostIcon sx={{ fontSize: 16 }} />
                            Output/1M
                          </Box>
                        </th>
                        <th style={{ width: 100, textAlign: 'center' }}>Contexto</th>
                        <th style={{ width: 200, textAlign: 'center' }}>Capacidades</th>
                      </tr>
                    </thead>
                    <tbody>
                      {provider.models.map((model) => (
                        <tr key={model.id}>
                          <td>
                            <Typography level="title-sm">{model.name}</Typography>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary', fontFamily: 'monospace' }}>
                              {model.id}
                            </Typography>
                          </td>
                          <td>
                            <Typography level="body-sm">{model.description}</Typography>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <Chip
                              size="sm"
                              color={model.inputCost < 1 ? 'success' : model.inputCost < 5 ? 'warning' : 'danger'}
                            >
                              {formatCost(model.inputCost)}
                            </Chip>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <Chip
                              size="sm"
                              color={model.outputCost < 2 ? 'success' : model.outputCost < 10 ? 'warning' : 'danger'}
                            >
                              {formatCost(model.outputCost)}
                            </Chip>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <Chip size="sm" variant="outlined">
                              {formatContext(model.contextWindow)}
                            </Chip>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center', flexWrap: 'wrap' }}>
                              {model.supportsVision && (
                                <Chip size="sm" color="primary" variant="soft">Vision</Chip>
                              )}
                              {model.supportsFunctions && (
                                <Chip size="sm" color="success" variant="soft">Functions</Chip>
                              )}
                              {model.supportsStreaming && (
                                <Chip size="sm" color="neutral" variant="soft">Stream</Chip>
                              )}
                            </Box>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Sheet>
              </CardContent>
            </Card>
          </TabPanel>
        ))}
      </Tabs>

      {/* Leyenda de Costos */}
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography level="title-sm" sx={{ mb: 1 }}>
            Informacion de Precios
          </Typography>
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
              Los precios son por 1 millon de tokens (Diciembre 2024)
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Chip size="sm" color="success">Bajo</Chip>
              <Typography level="body-xs">{'< $1 input / < $2 output'}</Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Chip size="sm" color="warning">Medio</Chip>
              <Typography level="body-xs">{'$1-$5 input / $2-$10 output'}</Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Chip size="sm" color="danger">Alto</Chip>
              <Typography level="body-xs">{'>= $5 input / >= $10 output'}</Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  )
}
