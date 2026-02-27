import { useState } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  Textarea,
  Select,
  Option,
  FormControl,
  FormLabel,
  Input,
  Slider,
  Chip,
  Alert,
  Divider,
  CircularProgress,
} from '@mui/joy'
import {
  PlayArrow as PlayIcon,
  Clear as ClearIcon,
  Save as SaveIcon,
  History as HistoryIcon,
} from '@mui/icons-material'

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

  const [history, setHistory] = useState<TestResult[]>([
    {
      id: 1,
      timestamp: '2025-10-13 14:35:22',
      model: 'GPT-4 Turbo',
      prompt: 'Analiza el sentimiento del siguiente mensaje: "Estoy muy contento con el servicio"',
      response: '{"sentimiento": "positivo", "confianza": 95, "emocion": "alegría"}',
      tokens: 85,
      cost: 0.00255,
      duration: 1.2,
      success: true,
    },
    {
      id: 2,
      timestamp: '2025-10-13 14:30:15',
      model: 'GPT-3.5 Turbo',
      prompt: 'Resume el siguiente texto en 2 oraciones: [texto largo...]',
      response: 'El cliente reporta un problema con su pedido. Solicita reembolso urgente.',
      tokens: 120,
      cost: 0.00012,
      duration: 0.8,
      success: true,
    },
  ])

  const handleTest = () => {
    if (!prompt.trim()) return

    setLoading(true)
    setResponse('')
    setTestInfo(null)

    // Simular llamada a API
    setTimeout(() => {
      const mockResponse = `Esta es una respuesta de prueba generada por ${selectedModel}.\n\nLa temperatura configurada es ${temperature} y el máximo de tokens es ${maxTokens}.\n\nPrompt del sistema: "${systemPrompt}"\n\nPrompt del usuario: "${prompt}"\n\nEsta respuesta es simulada para propósitos de testing de la interfaz.`
      const mockTokens = Math.floor(Math.random() * 500) + 100
      const mockCost = mockTokens * 0.00003
      const mockDuration = Math.random() * 2 + 0.5

      setResponse(mockResponse)
      setTestInfo({
        tokens: mockTokens,
        cost: mockCost,
        duration: mockDuration,
      })

      // Agregar al historial
      const newResult: TestResult = {
        id: Date.now(),
        timestamp: new Date().toLocaleString('es-ES'),
        model: selectedModel,
        prompt: prompt,
        response: mockResponse,
        tokens: mockTokens,
        cost: mockCost,
        duration: mockDuration,
        success: true,
      }
      setHistory([newResult, ...history])

      setLoading(false)
    }, 2000)
  }

  const handleClear = () => {
    setPrompt('')
    setResponse('')
    setTestInfo(null)
  }

  const handleSaveTest = () => {
    console.log('Guardando test como prompt...')
  }

  const modelOptions = [
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', cost: '$0.03/1K tokens' },
    { value: 'gpt-35-turbo', label: 'GPT-3.5 Turbo', cost: '$0.001/1K tokens' },
    { value: 'gemini-pro', label: 'Gemini Pro', cost: '$0.0005/1K tokens' },
    { value: 'deepseek-chat', label: 'DeepSeek Chat', cost: '$0.00014/1K tokens' },
    { value: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet', cost: '$0.015/1K tokens' },
  ]

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography level="h2" sx={{ mb: 1 }}>
          Testing de Prompts
        </Typography>
        <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
          Prueba y experimenta con diferentes modelos y configuraciones en tiempo real
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Panel de Configuración */}
        <Grid xs={12} lg={5}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 2 }}>
                Configuración del Test
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <FormControl required>
                  <FormLabel>Modelo</FormLabel>
                  <Select value={selectedModel} onChange={(_, val) => setSelectedModel(val as string)}>
                    {modelOptions.map((option) => (
                      <Option key={option.value} value={option.value}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                          <span>{option.label}</span>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            {option.cost}
                          </Typography>
                        </Box>
                      </Option>
                    ))}
                  </Select>
                </FormControl>

                <FormControl>
                  <FormLabel>System Prompt</FormLabel>
                  <Textarea
                    minRows={2}
                    placeholder="Ej: Eres un asistente especializado en..."
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                  />
                  <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                    Define el rol y comportamiento del modelo
                  </Typography>
                </FormControl>

                <FormControl>
                  <FormLabel>User Prompt</FormLabel>
                  <Textarea
                    minRows={4}
                    placeholder="Escribe tu prompt aquí..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    required
                  />
                  <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                    {prompt.length} caracteres
                  </Typography>
                </FormControl>

                <Divider />

                <FormControl>
                  <FormLabel>Temperature: {temperature}</FormLabel>
                  <Slider
                    value={temperature}
                    onChange={(_, value) => setTemperature(value as number)}
                    min={0}
                    max={2}
                    step={0.1}
                    marks={[
                      { value: 0, label: '0' },
                      { value: 1, label: '1' },
                      { value: 2, label: '2' },
                    ]}
                  />
                  <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                    0 = Determinístico y preciso | 2 = Creativo y variado
                  </Typography>
                </FormControl>

                <FormControl>
                  <FormLabel>Max Tokens</FormLabel>
                  <Input
                    type="number"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                    slotProps={{ input: { min: 100, max: 4000, step: 100 } }}
                  />
                  <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                    Límite de tokens en la respuesta
                  </Typography>
                </FormControl>

                <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                  <Button
                    fullWidth
                    startDecorator={loading ? <CircularProgress size="sm" /> : <PlayIcon />}
                    onClick={handleTest}
                    disabled={!prompt.trim() || loading}
                  >
                    {loading ? 'Procesando...' : 'Ejecutar Test'}
                  </Button>
                  <Button variant="outlined" onClick={handleClear} disabled={loading}>
                    <ClearIcon />
                  </Button>
                </Box>
              </Box>
            </CardContent>
          </Card>

          {/* Info de Costo Estimado */}
          <Alert color="primary" sx={{ mt: 2 }}>
            <Typography level="body-sm">
              <strong>Costo estimado:</strong> ~$0.003 - $0.03 por test (dependiendo del modelo)
            </Typography>
          </Alert>
        </Grid>

        {/* Panel de Resultados */}
        <Grid xs={12} lg={7}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography level="title-lg">Respuesta del Modelo</Typography>
                {response && (
                  <Button size="sm" variant="outlined" startDecorator={<SaveIcon />} onClick={handleSaveTest}>
                    Guardar como Prompt
                  </Button>
                )}
              </Box>

              {!response && !loading && (
                <Box
                  sx={{
                    minHeight: 400,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'background.level1',
                    borderRadius: 'sm',
                    border: '1px dashed',
                    borderColor: 'divider',
                  }}
                >
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    La respuesta del modelo aparecerá aquí...
                  </Typography>
                </Box>
              )}

              {loading && (
                <Box
                  sx={{
                    minHeight: 400,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                  }}
                >
                  <CircularProgress />
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Generando respuesta...
                  </Typography>
                </Box>
              )}

              {response && (
                <>
                  <Box
                    sx={{
                      p: 2,
                      bgcolor: 'background.level1',
                      borderRadius: 'sm',
                      border: '1px solid',
                      borderColor: 'divider',
                      minHeight: 300,
                      mb: 2,
                      fontFamily: 'monospace',
                      fontSize: '0.875rem',
                      whiteSpace: 'pre-wrap',
                      overflow: 'auto',
                    }}
                  >
                    {response}
                  </Box>

                  {testInfo && (
                    <Grid container spacing={2}>
                      <Grid xs={4}>
                        <Card variant="outlined" size="sm">
                          <CardContent>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                              Tokens
                            </Typography>
                            <Typography level="title-md">{testInfo.tokens}</Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                      <Grid xs={4}>
                        <Card variant="outlined" size="sm">
                          <CardContent>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                              Costo
                            </Typography>
                            <Typography level="title-md">${testInfo.cost.toFixed(5)}</Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                      <Grid xs={4}>
                        <Card variant="outlined" size="sm">
                          <CardContent>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                              Duración
                            </Typography>
                            <Typography level="title-md">{testInfo.duration.toFixed(2)}s</Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                    </Grid>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Historial de Tests */}
          <Card sx={{ mt: 3 }}>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <HistoryIcon />
                Historial de Tests
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {history.map((test) => (
                  <Card key={test.id} variant="outlined">
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                        <Box>
                          <Typography level="body-sm" fontWeight="lg">
                            {test.model}
                          </Typography>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            {test.timestamp}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Chip size="sm" variant="outlined">
                            {test.tokens} tokens
                          </Chip>
                          <Chip size="sm" variant="outlined">
                            ${test.cost.toFixed(5)}
                          </Chip>
                          <Chip size="sm" variant="outlined">
                            {test.duration.toFixed(2)}s
                          </Chip>
                        </Box>
                      </Box>
                      <Typography level="body-sm" sx={{ mb: 1, fontStyle: 'italic' }}>
                        "{test.prompt.substring(0, 100)}..."
                      </Typography>
                      <Divider sx={{ my: 1 }} />
                      <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                        {test.response.substring(0, 150)}...
                      </Typography>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
