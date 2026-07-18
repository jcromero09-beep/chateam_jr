import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { CircularProgress } from '@mui/joy'
import {
  VideoCamera,
  ArrowClockwise,
  X,
  User,
  FilmSlate,
  Clock,
  CheckCircle,
  WarningCircle,
  CircleNotch,
  PaperPlaneTilt,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { StatTile } from '@/components/ui/stat-tile'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args) }
const devError = (...args: unknown[]) => { if (isDev) console.error(...args) }

// --- Types ---
type VideoStatus = 'pending' | 'processing' | 'completed' | 'failed'
type Language = 'es' | 'en' | 'pt'

interface Avatar {
  avatarId: string
  name: string
  language: string
  previewUrl?: string
}

interface GeneratedVideo {
  id: number | string
  title: string
  status: VideoStatus
  duration: number | null
  createdAt: string
  thumbnailUrl?: string
  avatarId?: string
}

interface HeyGenStats {
  totalAvatars: number
  totalVideos: number
  remainingCredits: number
}

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: 'es', label: 'Espanol' },
  { value: 'en', label: 'Ingles' },
  { value: 'pt', label: 'Portugues' },
]

const VIDEO_STATUS_CONFIG: Record<VideoStatus, { label: string; variant: BadgeProps['variant']; icon: ReactNode }> = {
  pending: { label: 'Pendiente', variant: 'neutral', icon: <Clock className="size-3" aria-hidden /> },
  processing: { label: 'Procesando', variant: 'primary', icon: <CircleNotch className="size-3 animate-spin" aria-hidden /> },
  completed: { label: 'Completado', variant: 'success', icon: <CheckCircle className="size-3" aria-hidden /> },
  failed: { label: 'Fallido', variant: 'destructive', icon: <WarningCircle className="size-3" aria-hidden /> },
}

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return dateStr }
}

const formatDuration = (seconds: number | null) => {
  if (seconds === null) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// --- Pagina Principal ---
export default function AIHeyGen() {
  const [avatars, setAvatars] = useState<Avatar[]>([])
  const [videos, setVideos] = useState<GeneratedVideo[]>([])
  const [stats, setStats] = useState<HeyGenStats>({ totalAvatars: 0, totalVideos: 0, remainingCredits: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Formulario de generacion
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>('')
  const [script, setScript] = useState('')
  const [language, setLanguage] = useState<Language>('es')
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [generateSuccess, setGenerateSuccess] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      devLog('[AIHeyGen] Cargando avatares y videos...')

      const [avatarsResult, videosResult] = await Promise.allSettled([
        api.get('/ai/heygen/avatars'),
        api.get('/ai/heygen/videos'),
      ])

      let loadedAvatars: Avatar[] = []
      let loadedVideos: GeneratedVideo[] = []

      if (avatarsResult.status === 'fulfilled') {
        const raw = avatarsResult.value.data
        loadedAvatars = (raw as unknown as { data?: Avatar[] }).data ?? (raw as unknown as Avatar[]) ?? []
        setAvatars(loadedAvatars)
      } else {
        devError('[AIHeyGen] Error al cargar avatares:', avatarsResult.reason)
      }

      if (videosResult.status === 'fulfilled') {
        const raw = videosResult.value.data
        loadedVideos = (raw as unknown as { data?: GeneratedVideo[] }).data ?? (raw as unknown as GeneratedVideo[]) ?? []
        setVideos(loadedVideos)
      } else {
        devError('[AIHeyGen] Error al cargar videos:', videosResult.reason)
      }

      // Calcular stats desde los datos cargados
      if (avatarsResult.status === 'fulfilled') {
        const statsFromData = (avatarsResult.value.data as unknown as { stats?: HeyGenStats })
        if (statsFromData && typeof statsFromData === 'object' && 'stats' in statsFromData && statsFromData.stats) {
          setStats(statsFromData.stats)
        } else {
          setStats({
            totalAvatars: loadedAvatars.length,
            totalVideos: loadedVideos.length,
            remainingCredits: 0,
          })
        }
      } else {
        setStats({
          totalAvatars: loadedAvatars.length,
          totalVideos: loadedVideos.length,
          remainingCredits: 0,
        })
      }

      if (avatarsResult.status === 'rejected' && videosResult.status === 'rejected') {
        setError('Error al cargar los datos de HeyGen. Verifica la configuracion de la integracion.')
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      devError('[AIHeyGen] Error general:', err)
      setError(e.response?.data?.message || 'Error inesperado al cargar los datos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleGenerate = async () => {
    if (!selectedAvatarId) { setGenerateError('Selecciona un avatar'); return }
    if (!script.trim()) { setGenerateError('El guion es requerido'); return }
    try {
      setGenerating(true)
      setGenerateError(null)
      setGenerateSuccess(null)
      devLog('[AIHeyGen] Generando video con avatar:', selectedAvatarId)

      await api.post('/ai/heygen/generate', {
        avatarId: selectedAvatarId,
        script: script.trim(),
        language,
      })

      setGenerateSuccess('Video enviado a generar. Aparecera en el historial cuando este listo.')
      setScript('')
      // Refrescar videos despues de generar
      setTimeout(() => {
        fetchData()
        setGenerateSuccess(null)
      }, 2500)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      devError('[AIHeyGen] Error al generar video:', err)
      setGenerateError(e.response?.data?.message || 'Error al generar el video')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        {/* [conservado] CircularProgress: sin equivalente Radix en el design system */}
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
              <VideoCamera className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                HeyGen — Avatares de Video
              </h1>
              <p className="text-sm text-muted-foreground">
                Genera videos con avatares de IA usando la integracion de HeyGen
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <ArrowClockwise className="size-4" aria-hidden />
            Actualizar
          </Button>
        </div>

        {/* Error global */}
        {error && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text"
          >
            <span>{error}</span>
            <button
              type="button"
              aria-label="Cerrar aviso"
              onClick={() => setError(null)}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-destructive-text/80 transition-colors hover:bg-destructive/15 hover:text-destructive-text"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatTile label="Avatares disponibles" value={String(stats.totalAvatars || avatars.length)} />
          <StatTile label="Videos generados" value={String(stats.totalVideos || videos.length)} tone="primary" />
          <StatTile label="Créditos restantes" value={stats.remainingCredits.toLocaleString('es-ES')} tone="warning" />
        </div>

        {/* Seccion 1: Grid de Avatares */}
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <User className="size-5" aria-hidden />
            Avatares disponibles
          </h2>
          {avatars.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <User className="size-10 text-muted-foreground/40" aria-hidden />
              <p className="text-sm text-muted-foreground">
                No hay avatares disponibles. Verifica la configuracion de HeyGen.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {avatars.map((avatar) => {
                const isSelected = selectedAvatarId === avatar.avatarId
                return (
                  <button
                    key={avatar.avatarId}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedAvatarId(avatar.avatarId)}
                    className={cn(
                      'flex flex-col rounded-lg border p-3 text-left transition-colors',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card hover:border-muted-foreground/40 hover:bg-accent/40',
                    )}
                  >
                    {/* Placeholder de imagen de preview */}
                    <div
                      className={cn(
                        'mb-2 flex h-24 w-full items-center justify-center overflow-hidden rounded-md',
                        isSelected ? 'bg-primary-hover' : 'bg-muted',
                      )}
                    >
                      {avatar.previewUrl ? (
                        <img
                          src={avatar.previewUrl}
                          alt={avatar.name}
                          width={240}
                          height={96}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <User className={cn('size-9', isSelected ? 'opacity-80' : 'opacity-30')} aria-hidden />
                      )}
                    </div>
                    <span className={cn('text-sm font-semibold', isSelected ? 'text-primary-foreground' : 'text-foreground')}>
                      {avatar.name}
                    </span>
                    <span className={cn('text-xs', isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                      {avatar.language}
                    </span>
                    <span className={cn('font-mono text-xs', isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                      ID: {avatar.avatarId.length > 16 ? avatar.avatarId.substring(0, 16) + '...' : avatar.avatarId}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {/* Seccion 2: Formulario de Generacion */}
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <FilmSlate className="size-5" aria-hidden />
            Generar video
          </h2>

          {generateError && (
            <div
              role="alert"
              className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text"
            >
              <span>{generateError}</span>
              <button
                type="button"
                aria-label="Cerrar aviso"
                onClick={() => setGenerateError(null)}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-destructive-text/80 transition-colors hover:bg-destructive/15 hover:text-destructive-text"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          )}

          {generateSuccess && (
            <div
              role="status"
              className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success-text"
            >
              <span>{generateSuccess}</span>
              <button
                type="button"
                aria-label="Cerrar aviso"
                onClick={() => setGenerateSuccess(null)}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-success-text/80 transition-colors hover:bg-success/15 hover:text-success-text"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="avatar-select">Avatar seleccionado</Label>
              <Select
                value={selectedAvatarId}
                onValueChange={(val) => { if (val) setSelectedAvatarId(val) }}
              >
                <SelectTrigger id="avatar-select" className="h-11">
                  <SelectValue placeholder="Selecciona un avatar" />
                </SelectTrigger>
                <SelectContent>
                  {avatars.map((av) => (
                    <SelectItem key={av.avatarId} value={av.avatarId}>{av.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="language-select">Idioma</Label>
              <Select
                value={language}
                onValueChange={(val) => { if (val) setLanguage(val as Language) }}
              >
                <SelectTrigger id="language-select" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="script">Guion del video</Label>
              <textarea
                id="script"
                placeholder="Escribe el guion que el avatar narrara en el video..."
                value={script}
                onChange={(e) => setScript(e.target.value)}
                rows={4}
                className="w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
              <p className="text-xs text-muted-foreground">{script.length} caracteres</p>
            </div>

            <div className="sm:col-span-2">
              <Button
                onClick={handleGenerate}
                loading={generating}
                disabled={!selectedAvatarId || !script.trim()}
              >
                <PaperPlaneTilt className="size-4" aria-hidden />
                Generar video
              </Button>
            </div>
          </div>
        </section>

        {/* Seccion 3: Historial de Videos */}
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <VideoCamera className="size-5" aria-hidden />
            Historial de videos
          </h2>

          {videos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <VideoCamera className="size-12 text-muted-foreground/30" aria-hidden />
              <p className="text-sm text-muted-foreground">
                No hay videos generados aun. Crea tu primer video con un avatar.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              {videos.map((video) => {
                const statusConf = VIDEO_STATUS_CONFIG[video.status] ?? VIDEO_STATUS_CONFIG.pending
                return (
                  <div key={video.id} className="flex flex-col rounded-lg border border-border bg-card p-3">
                    {/* Thumbnail placeholder */}
                    <div className="mb-3 flex h-28 w-full items-center justify-center overflow-hidden rounded-md bg-muted">
                      {video.thumbnailUrl ? (
                        <img
                          src={video.thumbnailUrl}
                          alt={video.title}
                          width={320}
                          height={112}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <FilmSlate className="size-9 text-muted-foreground/30" aria-hidden />
                      )}
                    </div>

                    <p className="mb-2 text-sm font-semibold text-foreground">{video.title}</p>

                    <div className="mb-1 flex items-center justify-between gap-2">
                      <Badge variant={statusConf.variant}>
                        {statusConf.icon}
                        {statusConf.label}
                      </Badge>
                      {video.duration !== null && (
                        <span className="text-xs text-muted-foreground">
                          {formatDuration(video.duration)}
                        </span>
                      )}
                    </div>

                    <span className="text-xs text-muted-foreground">{formatDate(video.createdAt)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
