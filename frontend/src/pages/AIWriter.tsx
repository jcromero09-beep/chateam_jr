/**
 * Página: AIWriter
 * Escritor de IA — generación de texto asistida con modelos avanzados.
 */

import { useState, useEffect, useCallback, useContext } from 'react'
// [migración] CircularProgress se CONSERVA como MUI Joy (no hay equivalente en el DS).
import { CircularProgress } from '@mui/joy'
import {
  PencilLine,
  MagicWand,
  Copy,
  Check,
  X,
  Coins,
  FileText,
  ArrowClockwise,
  Sparkle,
  Clock,
  Hash,
  TextT,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
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
  const [creditsTotal, setCreditsTotal] = useState<number | null>(null)
  const [creditsUsed, setCreditsUsed] = useState<number | null>(null)

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

      // Endpoint UNIFICADO: balance real del sistema AICreditBalance.
      // AIWriter cobra como "message" (configurable). Se filtra solo ese tipo.
      const response = await api.get('/ai/credits/summary?keys=message')
      const raw = response.data as {
        byKey?: Record<string, { totalCredits?: number; usedCredits?: number; remaining?: number }>
        totalCredits?: number
        totalUsed?: number
        totalRemaining?: number
      }

      const messageBalance = raw?.byKey?.message
      if (messageBalance) {
        setCredits(Number(messageBalance.remaining ?? 0))
        setCreditsTotal(Number(messageBalance.totalCredits ?? 0))
        setCreditsUsed(Number(messageBalance.usedCredits ?? 0))
      } else {
        // Fallback: si la company no tiene balance "message" inicializado.
        setCredits(0)
        setCreditsTotal(0)
        setCreditsUsed(0)
      }
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

  const selectedContentLabel = CONTENT_TYPE_OPTIONS.find((t) => t.value === contentType)?.label

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <PencilLine className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Escritor IA
              </h1>
              <p className="text-sm text-muted-foreground">
                Genera texto profesional asistido por modelos de IA avanzados
              </p>
            </div>
          </div>

          {/* Créditos disponibles — balance REAL del sistema unificado (tipo message) */}
          <div
            className={cn(
              'min-w-[220px] rounded-lg border p-3',
              noCredits
                ? 'border-destructive/30 bg-destructive/10'
                : 'border-success/30 bg-success/10',
            )}
          >
            <div className="flex items-center gap-2">
              <Coins
                className={cn(
                  'size-[18px] shrink-0',
                  noCredits ? 'text-destructive-text' : 'text-success-text',
                )}
                aria-hidden
              />
              <div>
                <p className="text-xs text-muted-foreground">
                  Créditos disponibles (mensajes IA)
                </p>
                {loading ? (
                  <CircularProgress size="sm" />
                ) : (
                  <div>
                    <p className="text-base font-semibold text-foreground">
                      {isSuperAdmin
                        ? '∞ Ilimitado'
                        : credits !== null
                          ? formatCredits(credits)
                          : '—'}
                      {!isSuperAdmin && creditsTotal !== null && creditsTotal > 0 && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          / {formatCredits(creditsTotal)}
                        </span>
                      )}
                    </p>
                    {!isSuperAdmin && creditsUsed !== null && creditsUsed > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Usados: {formatCredits(creditsUsed)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Error global */}
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
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-destructive-text transition-colors hover:bg-destructive/15"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        {/* Sin créditos */}
        {!loading && noCredits && (
          <div
            role="alert"
            className="rounded-lg border border-warning/30 bg-warning/16 px-4 py-3 text-sm text-warning-text"
          >
            No tienes créditos disponibles para generación de texto. Contacta al administrador para recargar tu saldo.
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Panel izquierdo: Formulario */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
              <MagicWand className="size-5" aria-hidden />
              Configurar generación
            </h2>

            {/* Tipo de contenido */}
            <div className="mb-4 space-y-1.5">
              <Label htmlFor="content-type">Tipo de contenido</Label>
              <Select
                value={contentType}
                onValueChange={(val) => setContentType(val as ContentType)}
                disabled={generating}
              >
                <SelectTrigger id="content-type" aria-label="Tipo de contenido">
                  <span className="flex items-center gap-2 truncate">
                    <TextT className="size-3.5 shrink-0 opacity-60" aria-hidden />
                    <span className="truncate">{selectedContentLabel}</span>
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{opt.description}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Prompt / Tema */}
            <div className="mb-4 space-y-1.5">
              <Label htmlFor="prompt">Tema o instrucción</Label>
              <textarea
                id="prompt"
                placeholder="Describe sobre qué quieres generar el contenido..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                disabled={generating}
                className="min-h-[104px] w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-55"
              />
            </div>

            {/* Sugerencias rápidas */}
            <div className="mb-4">
              <p className="mb-1.5 text-xs text-muted-foreground">Ejemplos rápidos:</p>
              <div className="flex flex-wrap gap-1.5">
                {PROMPT_EXAMPLES.map((example) => (
                  <button
                    key={example.text}
                    type="button"
                    onClick={() => {
                      setPrompt(example.text)
                      setContentType(example.type)
                    }}
                    className="inline-flex items-center rounded-full border border-border bg-transparent px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-accent hover:bg-accent hover:text-accent-foreground"
                  >
                    {example.text.length > 40 ? `${example.text.substring(0, 40)}...` : example.text}
                  </button>
                ))}
              </div>
            </div>

            <div className="my-4 border-t border-border" />

            {/* Tono */}
            <div className="mb-4 space-y-1.5">
              <Label htmlFor="tone">Tono</Label>
              <Select
                value={tone}
                onValueChange={(val) => setTone(val as ToneOption)}
                disabled={generating}
              >
                <SelectTrigger id="tone" aria-label="Tono">
                  <span className="truncate">
                    {TONE_OPTIONS.find((t) => t.value === tone)?.label}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {TONE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Errores de generación */}
            {generationError && (
              <div
                role="alert"
                className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/12 px-4 py-3 text-sm text-destructive-text"
              >
                <span>{generationError}</span>
                <button
                  type="button"
                  aria-label="Cerrar aviso"
                  onClick={() => setGenerationError(null)}
                  className="flex size-6 shrink-0 items-center justify-center rounded-md text-destructive-text transition-colors hover:bg-destructive/15"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            )}

            {/* Acciones */}
            <div className="flex gap-2">
              <Button
                className="flex-1"
                loading={generating}
                disabled={!prompt.trim() || noCredits || loading}
                onClick={handleGenerate}
              >
                {!generating && <Sparkle className="size-4" aria-hidden />}
                {generating ? 'Generando...' : 'Generar texto'}
              </Button>
              {(prompt || result) && (
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Limpiar"
                  title="Limpiar"
                  onClick={handleClear}
                >
                  <ArrowClockwise className="size-4" aria-hidden />
                </Button>
              )}
            </div>
          </div>

          {/* Panel derecho: Resultado */}
          <div className="flex min-h-[400px] flex-col rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <FileText className="size-5" aria-hidden />
                Resultado
              </h2>

              {result && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                  className={cn(copied && 'border-success/40 text-success-text')}
                >
                  {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                  {copied ? 'Copiado' : 'Copiar'}
                </Button>
              )}
            </div>

            {generating ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8">
                <CircularProgress size="md" />
                <p className="text-sm text-muted-foreground">
                  Generando {selectedContentLabel?.toLowerCase()}...
                </p>
              </div>
            ) : result ? (
              <div className="flex flex-1 flex-col gap-3">
                {/* Metadatos del resultado */}
                <div className="flex flex-wrap gap-1.5">
                  {lastWordCount !== null && (
                    <Badge variant="primary">
                      <Hash className="size-2.5" aria-hidden />
                      {lastWordCount} palabras
                    </Badge>
                  )}
                  {lastTokensUsed !== null && (
                    <Badge variant="neutral">
                      {new Intl.NumberFormat('es-ES').format(lastTokensUsed)} tokens
                    </Badge>
                  )}
                  {lastLatency !== null && (
                    <Badge variant="neutral">
                      <Clock className="size-2.5" aria-hidden />
                      {(lastLatency / 1000).toFixed(1)}s
                    </Badge>
                  )}
                  {lastModel && <Badge variant="outline">{lastModel}</Badge>}
                </div>

                {/* Contenido */}
                <div className="flex-1 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-4 text-sm leading-7 text-foreground">
                  {result}
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
                <Sparkle className="size-10 text-muted-foreground/50" aria-hidden />
                <p className="text-sm text-muted-foreground">
                  Elige un tipo de contenido, escribe un tema
                  <br />
                  y presiona &quot;Generar texto&quot; para ver el resultado
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
