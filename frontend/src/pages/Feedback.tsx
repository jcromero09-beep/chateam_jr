import { useState, useEffect } from 'react'
import {
  ChatCenteredText,
  CheckCircle,
  Star,
  ThumbsUp,
  Bug,
  Lightbulb,
  Smiley,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import api from '../services/api'
import logger from '../utils/logger'
import { toast } from 'react-toastify'

interface FeedbackEntry {
  id: string | number
  type: string
  message: string
  createdAt: string
}

interface FeedbackStats {
  total: number
  implemented: number
  avgRating: number
}

export default function Feedback() {
  const [feedbackType, setFeedbackType] = useState('suggestion')
  const [rating, setRating] = useState(0)
  const [message, setMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [recentFeedback, setRecentFeedback] = useState<FeedbackEntry[]>([])
  const [feedbackStats, setFeedbackStats] = useState<FeedbackStats>({ total: 0, implemented: 0, avgRating: 0 })

  useEffect(() => {
    fetchFeedback()
  }, [])

  const fetchFeedback = async () => {
    try {
      const response = await api.get('/feedback')
      const data = response.data?.data ?? response.data ?? {}
      setRecentFeedback(data.recent ?? data.items ?? [])
      setFeedbackStats({
        total: data.total ?? 0,
        implemented: data.implemented ?? 0,
        avgRating: data.avgRating ?? 0,
      })
    } catch {
      // Sin datos disponibles — se mostrará estado vacío
      setRecentFeedback([])
      setFeedbackStats({ total: 0, implemented: 0, avgRating: 0 })
    }
  }

  const handleSubmit = async () => {
    // [Ola 3] setSubmitted iba FUERA del try con un catch vacío: la pantalla decía
    // "enviado" aunque el POST fallara y el feedback se perdía sin que nadie lo supiera.
    // El éxito ahora solo se muestra si el POST realmente terminó.
    try {
      await api.post('/feedback', {
        type: feedbackType,
        rating,
        message,
        timestamp: new Date().toISOString(),
      })
    } catch (err) {
      logger.error('[Feedback] error al enviar feedback', err)
      toast.error('No se pudo enviar tu comentario. Inténtalo de nuevo.')
      return
    }

    setSubmitted(true)
    setTimeout(() => {
      setSubmitted(false)
      setMessage('')
      setRating(0)
      fetchFeedback()
    }, 3000)
  }

  const feedbackTypes = [
    {
      value: 'suggestion',
      label: 'Sugerencia',
      icon: <Lightbulb className="size-5" weight="fill" aria-hidden />,
      description: 'Ideas para mejorar el sistema',
    },
    {
      value: 'bug',
      label: 'Reportar Bug',
      icon: <Bug className="size-5" weight="fill" aria-hidden />,
      description: 'Problemas o errores encontrados',
    },
    {
      value: 'feature',
      label: 'Nueva Función',
      icon: <Smiley className="size-5" weight="fill" aria-hidden />,
      description: 'Solicitar nuevas funcionalidades',
    },
    {
      value: 'compliment',
      label: 'Felicitación',
      icon: <ThumbsUp className="size-5" weight="fill" aria-hidden />,
      description: 'Algo que te gustó del sistema',
    },
  ]

  // [a11y] Tintes por tipo: los tokens *-text alcanzan contraste como texto.
  const typeAccentText: Record<string, string> = {
    suggestion: 'text-warning-text',
    bug: 'text-destructive-text',
    feature: 'text-success-text',
    compliment: 'text-primary',
  }
  const typeSelectedSurface: Record<string, string> = {
    suggestion: 'border-warning/50 bg-warning/10',
    bug: 'border-destructive/50 bg-destructive/10',
    feature: 'border-success/50 bg-success/10',
    compliment: 'border-primary/50 bg-primary/10',
  }

  const badgeVariantForType = (type: string): BadgeProps['variant'] => {
    switch (type) {
      case 'suggestion': return 'warning'
      case 'bug': return 'destructive'
      case 'feature': return 'success'
      case 'compliment': return 'primary'
      default: return 'neutral'
    }
  }

  const labelForType = (type: string) => {
    switch (type) {
      case 'suggestion': return 'Sugerencia'
      case 'bug': return 'Bug'
      case 'feature': return 'Nueva Función'
      case 'compliment': return 'Felicitación'
      default: return type
    }
  }

  const formatRelativeTime = (dateStr: string) => {
    try {
      const diff = Date.now() - new Date(dateStr).getTime()
      const days = Math.floor(diff / 86400000)
      if (days === 0) return 'Hoy'
      if (days === 1) return 'Hace 1 día'
      return `Hace ${days} días`
    } catch {
      return ''
    }
  }

  const ratingLabel = (value: number) =>
    value === 5 ? 'Excelente!'
      : value === 4 ? 'Muy bien'
      : value === 3 ? 'Bien'
      : value === 2 ? 'Regular'
      : 'Necesita mejorar'

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
            <ChatCenteredText className="size-6" weight="fill" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Enviar Feedback
            </h1>
            <p className="text-sm text-muted-foreground">
              Tu opinión es importante para nosotros. Ayúdanos a mejorar JR Chateam
            </p>
          </div>
        </div>

        {/* Success Message */}
        {submitted && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-lg border border-success/40 bg-success/14 p-4 text-sm text-success-text"
          >
            <CheckCircle className="mt-0.5 size-5 shrink-0" weight="fill" aria-hidden />
            <span>
              ¡Gracias por tu feedback! Lo hemos recibido correctamente y nuestro equipo lo revisará
              pronto.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_1fr]">
          {/* Feedback Form */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02] sm:p-8">
            <h2 className="mb-6 text-lg font-semibold text-foreground">
              Completa el formulario
            </h2>

            {/* Feedback Type */}
            <fieldset className="mb-6">
              <legend className="mb-3 text-sm font-medium text-foreground">Tipo de Feedback</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {feedbackTypes.map((type) => {
                  const selected = feedbackType === type.value
                  return (
                    <label
                      key={type.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-all hover:shadow-sm ${
                        selected
                          ? typeSelectedSurface[type.value]
                          : 'border-border bg-card hover:border-muted-foreground/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="feedbackType"
                        value={type.value}
                        checked={selected}
                        onChange={(e) => setFeedbackType(e.target.value)}
                        className="mt-1 size-4 shrink-0 cursor-pointer accent-[color:var(--primary)]"
                      />
                      <span className="flex items-start gap-2">
                        <span className={selected ? typeAccentText[type.value] : 'text-muted-foreground'}>
                          {type.icon}
                        </span>
                        <span>
                          <span className="block text-sm font-medium text-foreground">{type.label}</span>
                          <span className="block text-xs text-muted-foreground">{type.description}</span>
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>

            {/* Rating */}
            <div className="mb-6">
              <Label className="mb-2 block">Calificación General</Label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    aria-label={`Calificar con ${star} ${star === 1 ? 'estrella' : 'estrellas'}`}
                    aria-pressed={star <= rating}
                    className={`flex size-9 items-center justify-center rounded-md outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring ${
                      star <= rating ? 'text-warning' : 'text-muted-foreground'
                    }`}
                  >
                    <Star className="size-7" weight={star <= rating ? 'fill' : 'regular'} aria-hidden />
                  </button>
                ))}
                {rating > 0 && (
                  <span className="ml-2 self-center text-sm text-foreground">
                    {ratingLabel(rating)}
                  </span>
                )}
              </div>
            </div>

            {/* Message */}
            <div className="mb-6 space-y-1.5">
              <Label htmlFor="feedback-message">Cuéntanos más (opcional)</Label>
              <textarea
                id="feedback-message"
                placeholder="Describe tu experiencia, sugerencia o problema en detalle..."
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
              <p className="text-xs text-muted-foreground">{message.length} / 1000 caracteres</p>
            </div>

            {/* Submit Button */}
            <Button
              size="lg"
              className="w-full"
              onClick={handleSubmit}
              disabled={rating === 0}
            >
              <ChatCenteredText className="size-5" weight="fill" aria-hidden />
              Enviar Feedback
            </Button>
          </div>

          {/* Sidebar Info */}
          <div className="flex flex-col gap-6">
            {/* Stats Card */}
            <div className="rounded-xl border border-border bg-accent p-5 text-accent-foreground">
              <h3 className="mb-4 text-base font-semibold">Tu Impacto</h3>
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-2xl font-semibold tabular-nums">{feedbackStats.total}</p>
                  <p className="text-sm">Feedback enviados</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums">{feedbackStats.implemented}</p>
                  <p className="text-sm">Sugerencias implementadas</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums">
                    {feedbackStats.avgRating > 0 ? feedbackStats.avgRating.toFixed(1) : '—'}
                  </p>
                  <p className="text-sm">Calificación promedio</p>
                </div>
              </div>
            </div>

            {/* Recent Feedback */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <h3 className="mb-4 text-base font-semibold text-foreground">Feedback Reciente</h3>
              {recentFeedback.length > 0 ? (
                <div className="flex flex-col gap-4">
                  {recentFeedback.map((entry) => (
                    <div key={entry.id}>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <Badge variant={badgeVariantForType(entry.type)}>
                          {labelForType(entry.type)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(entry.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-foreground">{entry.message}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No hay feedback registrado. Los usuarios podrán enviar feedback una vez configurado.
                </p>
              )}
            </div>

            {/* Community */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <h3 className="mb-1 text-base font-semibold text-foreground">Comunidad Activa</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Únete a nuestra comunidad de +5,000 usuarios que ayudan a mejorar JR Chateam
              </p>
              <Button variant="outline" size="sm" className="w-full">
                Unirse al Foro
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
