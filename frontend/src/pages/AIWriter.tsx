/**
 * Página: AIWriter
 * Escritor de IA — generación de texto asistida con modelos avanzados.
 */

import { useState, useEffect, useCallback, useContext } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Alert,
  IconButton,
  Button,
  Textarea,
  Select,
  Option,
  FormControl,
  FormLabel,
  Divider,
  Chip,
} from '@mui/joy'
import {
  PenLine,
  Wand2,
  Copy,
  Check,
  X,
  Coins,
  FileText,
  RefreshCw,
  Sparkles,
  Clock,
  Hash,
  Type,
} from 'lucide-react'
import { toast } from 'sonner'
import api from '../services/api'
import { AuthContext } from '../context/Auth/AuthContext'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type ContentType =
  | 'email' | 'whatsapp' | 'sms' | 'social_post'
  | 'blog_article' | 'product_description' | 'faq_answer'
  | 'campaign_message' | 'follow_up' | 'greeting'

type ToneOption = 'professional' | 'friendly' | 'casual' | 'formal' | 'persuasive' | 'empathetic' | 'urgent'

interface GenerateResponse {
  content: string
  wordCount: number
  tokensUsed: { input: number; output: number }
  modelUsed: string
  latencyMs: number
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const CONTENT_TYPE_OPTIONS: { value: ContentType; label: string; description: string }[] = [
  { value: 'email', label: 'Correo electrónico', description: 'Email profesional con asunto y estructura' },
  { value: 'whatsapp', label: 'Mensaje WhatsApp', description: 'Mensaje corto y directo (máx 1000 car.)' },
  { value: 'social_post', label: 'Post redes sociales', description: 'Publicación con hashtags relevantes' },
  { value: 'blog_article', label: 'Artículo de blog', description: 'Artículo con secciones y conclusión' },
  { value: 'product_description', label: 'Descripción de producto', description: 'Descripción atractiva con beneficios' },
  { value: 'campaign_message', label: 'Mensaje de campaña', description: 'Marketing persuasivo con CTA' },
  { value: 'follow_up', label: 'Seguimiento', description: 'Mensaje de seguimiento post-reunión' },
  { value: 'greeting', label: 'Saludo de bienvenida', description: 'Bienvenida cálida y profesional' },
  { value: 'faq_answer', label: 'Respuesta FAQ', description: 'Respuesta clara a pregunta frecuente' },
  { value: 'sms', label: 'SMS', description: 'Mensaje conciso (máx 160 car.)' },
]

const TONE_OPTIONS: { value: ToneOption; label: string }[] = [
  { value: 'professional', label: 'Profesional' },
  { value: 'friendly', label: 'Amigable' },
  { value: 'casual', label: 'Casual' },
  { value: 'formal', label: 'Formal' },
  { value: 'persuasive', label: 'Persuasivo' },
  { value: 'empathetic', label: 'Empático' },
  { value: 'urgent', label: 'Urgente' },
]

const PROMPT_EXAMPLES: { text: string; type: ContentType }[] = [
  { text: 'Escribe un correo de bienvenida para nuevos clientes', type: 'email' },
  { text: 'Redacta una descripción de producto para una tienda online', type: 'product_description' },
  { text: 'Crea un mensaje de seguimiento post-reunión', type: 'follow_up' },
  { text: 'Genera una publicación para LinkedIn sobre tendencias de IA', type: 'social_post' },
]

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function AIWriter() {
  const authContext = useContext(AuthContext)
  const isSuperAdmin = authContext?.user?.super === true

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [credits, setCredits] = useState<number | null>(null)

  // Formulario
  const [prompt, setPrompt] = useState('')
  const [contentType, setContentType] = useState<ContentType>('email')
  const [tone, setTone] = useState<ToneOption>('professional')

  // Generación
  const [generating, setGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [lastTokensUsed, setLastTokensUsed] = useState<number | null>(null)
  const [lastWordCount, setLastWordCount] = useState<number | null>(null)
  const [lastLatency, setLastLatency] = useState<number | null>(null)
  const [lastModel, setLastModel] = useState<string | null>(null)

  // Copiar
  const [copied, setCopied] = useState(false)

  // ---------------------------------------------------------------------------
  // Cargar créditos
  // ---------------------------------------------------------------------------

  const loadCredits = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Usar endpoint de token-info que devuelve el balance general de tokens de la compañía
      const response = await api.get('/ai/subplan-purchase/token-info')
      const raw = response.data as Record<string, unknown>
      // El endpoint devuelve: { tokenBalance, activeSubplan, activeSubplanId }
      const tokenBalance = typeof raw.tokenBalance === 'number' ? raw.tokenBalance : 0
      setCredits(tokenBalance)
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Error al cargar los créditos disponibles'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCredits()
  }, [loadCredits])

  // ---------------------------------------------------------------------------
  // Generar texto
  // ---------------------------------------------------------------------------

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setGenerationError('Escribe un tema o instrucción antes de generar')
      return
    }

    try {
      setGenerating(true)
      setGenerationError(null)
      setResult(null)
      setLastTokensUsed(null)
      setLastWordCount(null)
      setLastLatency(null)
      setLastModel(null)

      const response = await api.post('/ai/writer/generate', {
        type: contentType,
        topic: prompt.trim(),
        tone,
        language: 'es',
        maxLength: contentType === 'blog_article' ? 1000 : 500,
      })

      const raw = response.data as Record<string, unknown>
      const data = (raw?.data ?? raw) as GenerateResponse

      setResult(data.content ?? '')
      setLastWordCount(data.wordCount ?? null)
      setLastModel(data.modelUsed ?? null)
      setLastLatency(data.latencyMs ?? null)

      if (data.tokensUsed) {
        setLastTokensUsed((data.tokensUsed.input ?? 0) + (data.tokensUsed.output ?? 0))
      }

      toast.success('Texto generado correctamente')

      // Refrescar créditos después de generar
      await loadCredits()
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Error al generar el texto'
      setGenerationError(message)
    } finally {
      setGenerating(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Copiar resultado
  // ---------------------------------------------------------------------------

  const handleCopy = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result)
      setCopied(true)
      toast.success('Texto copiado al portapapeles')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Error al copiar al portapapeles')
    }
  }

  // ---------------------------------------------------------------------------
  // Limpiar
  // ---------------------------------------------------------------------------

  const handleClear = () => {
    setPrompt('')
    setResult(null)
    setGenerationError(null)
    setLastTokensUsed(null)
    setLastWordCount(null)
    setLastLatency(null)
    setLastModel(null)
  }

  const noCredits = !isSuperAdmin && credits !== null && credits <= 0
  const formatCredits = (n: number) => new Intl.NumberFormat('es-ES').format(n)

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          gap: 2,
          mb: 3,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <PenLine size={32} color="var(--joy-palette-primary-500)" />
          <Box>
            <Typography level="h2">Escritor IA</Typography>
            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
              Genera texto profesional asistido por modelos de IA avanzados
            </Typography>
          </Box>
        </Box>

        {/* Créditos disponibles */}
        <Card
          variant="soft"
          color={noCredits ? 'danger' : 'success'}
          sx={{ minWidth: 180 }}
        >
          <CardContent sx={{ py: 1, px: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Coins size={18} />
              <Box>
                <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                  Créditos disponibles
                </Typography>
                {loading ? (
                  <CircularProgress size="sm" />
                ) : (
                  <Typography level="title-md">
                    {isSuperAdmin ? '∞ Ilimitado' : credits !== null ? formatCredits(credits) : '—'}
                  </Typography>
                )}
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Error global */}
      {error && (
        <Alert
          color="danger"
          sx={{ mb: 2 }}
          endDecorator={
            <IconButton size="sm" variant="plain" color="danger" onClick={() => setError(null)}>
              <X size={16} />
            </IconButton>
          }
        >
          {error}
        </Alert>
      )}

      {/* Sin créditos */}
      {!loading && noCredits && (
        <Alert color="warning" sx={{ mb: 2 }}>
          No tienes créditos disponibles para generación de texto. Contacta al administrador para recargar tu saldo.
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Panel izquierdo: Formulario */}
        <Grid xs={12} md={6}>
          <Card variant="outlined">
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Wand2 size={20} />
                Configurar generación
              </Typography>

              {/* Tipo de contenido */}
              <FormControl sx={{ mb: 2 }}>
                <FormLabel>Tipo de contenido</FormLabel>
                <Select
                  value={contentType}
                  onChange={(_, val) => val && setContentType(val as ContentType)}
                  disabled={generating}
                  startDecorator={<Type size={14} />}
                >
                  {CONTENT_TYPE_OPTIONS.map((opt) => (
                    <Option key={opt.value} value={opt.value}>
                      <Box>
                        <Typography level="body-sm" fontWeight="md">
                          {opt.label}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          {opt.description}
                        </Typography>
                      </Box>
                    </Option>
                  ))}
                </Select>
              </FormControl>

              {/* Prompt / Tema */}
              <FormControl sx={{ mb: 2 }}>
                <FormLabel>Tema o instrucción</FormLabel>
                <Textarea
                  placeholder="Describe sobre qué quieres generar el contenido..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  minRows={4}
                  maxRows={10}
                  disabled={generating}
                  sx={{ fontSize: 'sm' }}
                />
              </FormControl>

              {/* Sugerencias rápidas */}
              <Box sx={{ mb: 2 }}>
                <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 1 }}>
                  Ejemplos rápidos:
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {PROMPT_EXAMPLES.map((example) => (
                    <Chip
                      key={example.text}
                      size="sm"
                      variant="outlined"
                      color="neutral"
                      onClick={() => {
                        setPrompt(example.text)
                        setContentType(example.type)
                      }}
                      sx={{ cursor: 'pointer', fontSize: '11px' }}
                    >
                      {example.text.length > 40 ? `${example.text.substring(0, 40)}...` : example.text}
                    </Chip>
                  ))}
                </Box>
              </Box>

              <Divider sx={{ mb: 2 }} />

              {/* Tono */}
              <FormControl sx={{ mb: 2 }}>
                <FormLabel>Tono</FormLabel>
                <Select
                  value={tone}
                  onChange={(_, val) => val && setTone(val as ToneOption)}
                  disabled={generating}
                >
                  {TONE_OPTIONS.map((opt) => (
                    <Option key={opt.value} value={opt.value}>
                      {opt.label}
                    </Option>
                  ))}
                </Select>
              </FormControl>

              {/* Errores de generación */}
              {generationError && (
                <Alert
                  color="danger"
                  sx={{ mb: 2 }}
                  endDecorator={
                    <IconButton size="sm" variant="plain" color="danger" onClick={() => setGenerationError(null)}>
                      <X size={16} />
                    </IconButton>
                  }
                >
                  {generationError}
                </Alert>
              )}

              {/* Acciones */}
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  fullWidth
                  startDecorator={generating ? undefined : <Sparkles size={16} />}
                  loading={generating}
                  disabled={!prompt.trim() || noCredits || loading}
                  onClick={handleGenerate}
                >
                  {generating ? 'Generando...' : 'Generar texto'}
                </Button>
                {(prompt || result) && (
                  <IconButton variant="outlined" onClick={handleClear} title="Limpiar">
                    <RefreshCw size={16} />
                  </IconButton>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Panel derecho: Resultado */}
        <Grid xs={12} md={6}>
          <Card
            variant="outlined"
            sx={{ height: '100%', minHeight: 400 }}
          >
            <CardContent sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography level="title-lg" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <FileText size={20} />
                  Resultado
                </Typography>

                {result && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Button
                      size="sm"
                      variant="outlined"
                      color={copied ? 'success' : 'neutral'}
                      startDecorator={copied ? <Check size={14} /> : <Copy size={14} />}
                      onClick={handleCopy}
                    >
                      {copied ? 'Copiado' : 'Copiar'}
                    </Button>
                  </Box>
                )}
              </Box>

              {generating ? (
                <Box
                  sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    py: 4,
                  }}
                >
                  <CircularProgress size="md" />
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Generando {CONTENT_TYPE_OPTIONS.find((t) => t.value === contentType)?.label.toLowerCase()}...
                  </Typography>
                </Box>
              ) : result ? (
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {/* Metadatos del resultado */}
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {lastWordCount !== null && (
                      <Chip size="sm" color="primary" variant="soft" startDecorator={<Hash size={10} />}>
                        {lastWordCount} palabras
                      </Chip>
                    )}
                    {lastTokensUsed !== null && (
                      <Chip size="sm" color="neutral" variant="soft">
                        {new Intl.NumberFormat('es-ES').format(lastTokensUsed)} tokens
                      </Chip>
                    )}
                    {lastLatency !== null && (
                      <Chip size="sm" color="neutral" variant="soft" startDecorator={<Clock size={10} />}>
                        {(lastLatency / 1000).toFixed(1)}s
                      </Chip>
                    )}
                    {lastModel && (
                      <Chip size="sm" color="neutral" variant="outlined">
                        {lastModel}
                      </Chip>
                    )}
                  </Box>

                  {/* Contenido */}
                  <Box
                    sx={{
                      flex: 1,
                      p: 2,
                      bgcolor: 'background.level1',
                      borderRadius: 'sm',
                      overflow: 'auto',
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.7,
                    }}
                  >
                    <Typography level="body-sm">{result}</Typography>
                  </Box>
                </Box>
              ) : (
                <Box
                  sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1.5,
                    py: 4,
                    color: 'text.tertiary',
                  }}
                >
                  <Sparkles size={40} color="var(--joy-palette-neutral-300)" />
                  <Typography level="body-sm" sx={{ color: 'text.tertiary', textAlign: 'center' }}>
                    Elige un tipo de contenido, escribe un tema
                    <br />
                    y presiona "Generar texto" para ver el resultado
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
