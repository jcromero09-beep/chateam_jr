import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
// [conservado] CircularProgress y LinearProgress se mantienen en MUI Joy: no hay
// equivalente en el design system (Tailwind/shadcn) y son solo indicadores de carga.
import { CircularProgress, LinearProgress } from '@mui/joy'
import {
  ArrowClockwise,
  MagnifyingGlass,
  Megaphone,
  Play,
  Pause,
  Eye,
  VideoCamera,
  Images,
  MusicNote,
  ArrowsClockwise,
  PaperPlaneTilt,
  ChartBar,
  CheckCircle,
  Circle,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import api from '../services/api'
import GenerationBar, {
  type GenerationModelOption,
  type GenerationPayload,
  type GenerationPrefill,
} from '../components/UGC/GenerationBar'
import {
  listFalModels,
  type FalCatalogEntry,
  type PipelineMode
} from '../services/ugcModelSelectorService'

const isDev = import.meta.env.DEV
const devError = (...args: unknown[]) => { if (isDev) console.error(...args) }

const PAGE_SIZE = 12

// ─── Types ────────────────────────────────────────────────────────────────────

type CampaignStatus = 'draft' | 'briefing' | 'producing' | 'active' | 'paused' | 'completed'
type VideoProvider = 'fal-wan' | 'wan' | 'heygen' | 'kling' | 'runway'
type VideoFormat = '9:16' | '16:9' | '1:1'
type VideoResolution = '480p' | '720p' | '1080p'
type VideoLanguage = 'es' | 'en' | 'pt' | 'fr' | 'de'
type ToneType = 'profesional' | 'casual' | 'divertido' | 'inspiracional'
type SocialPlatform = 'instagram' | 'tiktok' | 'facebook' | 'youtube'

interface CampaignStats {
  videos: number
  posts: number
  views: number
  engagement: number
}

interface Campaign {
  id: number
  name: string
  status: CampaignStatus
  brief: string
  product: string
  tone: ToneType
  targetAudience: string
  callToAction: string
  videoProvider: VideoProvider
  videoFormat: VideoFormat
  videoDuration: number
  videoResolution: VideoResolution
  videosCount: number
  imagesCount: number
  videoLanguage: VideoLanguage
  platforms: SocialPlatform[]
  autoPublish: boolean
  abTesting: boolean
  budget: number
  stats: CampaignStats
  createdAt: string
  hasAudio: boolean
  videoModelKey?: string
  imageModelKey?: string
  promptText?: string
  isPending?: boolean
}

interface ApiCampaign {
  id: number
  name?: string
  status?: CampaignStatus
  description?: string
  brief?: string
  product?: string
  tone?: ToneType
  targetAudience?: string
  callToAction?: string
  videoProvider?: VideoProvider
  videoFormat?: VideoFormat
  videoDuration?: number
  videoResolution?: VideoResolution
  videosCount?: number
  imagesCount?: number
  videoLanguage?: VideoLanguage
  platforms?: SocialPlatform[]
  autoPublish?: boolean
  abTesting?: boolean
  budget?: number | string
  stats?: Partial<CampaignStats>
  createdAt?: string
  totalVideosGenerated?: number
  totalPostsPublished?: number
  productBrief?: {
    productName?: string
    targetAudience?: string
    tone?: ToneType
    callToAction?: string
    keyFeatures?: string[]
  }
  videoModelKey?: string | null
  imageModelKey?: string | null
  generationConfig?: {
    videoCount?: number
    imageCount?: number
    videoDuration?: number
    videoResolution?: VideoResolution
    aspectRatio?: VideoFormat
    videoProvider?: VideoProvider
    language?: VideoLanguage
    audioEnabled?: boolean
    prompt?: string
    mentions?: string[]
  }
  publishConfig?: {
    platforms?: SocialPlatform[]
    autoPublish?: boolean
  }
  optimizationConfig?: {
    abTestEnabled?: boolean
  }
  videoJobs?: Array<{
    id: number
    status?: string
    stage?: string
    finalVideoUrl?: string
    rawVideoUrl?: string
    thumbnailUrl?: string
    duration?: number
    metadata?: {
      creativeKind?: string
    }
    assets?: Array<{
      id: number
      assetType?: string
      localPath?: string
      originalUrl?: string
      mimeType?: string
    }>
  }>
}

// ─── Constants ────────────────────────────────────────────────────────────────

type StatusColor = 'neutral' | 'warning' | 'primary' | 'success' | 'danger' | 'secondary'

type StatusConfigEntry = {
  label: string
  color: StatusColor
}

const STATUS_CONFIG: Record<CampaignStatus, StatusConfigEntry> = {
  draft:      { label: 'Borrador',    color: 'neutral'  },
  briefing:   { label: 'Briefing',    color: 'warning'  },
  producing:  { label: 'Produciendo', color: 'primary'  },
  active:     { label: 'Activa',      color: 'success'  },
  paused:     { label: 'Pausada',     color: 'warning'  },
  completed:  { label: 'Completada',  color: 'secondary' },
}

const STATUS_FALLBACK: StatusConfigEntry = { label: 'Desconocido', color: 'neutral' }

function getStatusCfg(status: CampaignStatus | string | null | undefined): StatusConfigEntry {
  if (!status) return STATUS_FALLBACK
  return STATUS_CONFIG[status as CampaignStatus] ?? STATUS_FALLBACK
}

// Estado (color MUI) -> variante del Badge del design system
const STATUS_BADGE_VARIANT: Record<StatusColor, BadgeProps['variant']> = {
  neutral:   'neutral',
  warning:   'warning',
  primary:   'primary',
  success:   'success',
  danger:    'destructive',
  secondary: 'accent',
}

// Estado (color MUI) -> clases de superficie (tinte) para el avatar de la fila.
// [a11y] texto semántico con tokens *-text; superficies con tinte /12-/16.
const STATUS_SURFACE: Record<StatusColor, string> = {
  neutral:   'bg-muted text-muted-foreground',
  warning:   'bg-warning/16 text-warning-text',
  primary:   'bg-primary/12 text-primary',
  success:   'bg-success/14 text-success-text',
  danger:    'bg-destructive/12 text-destructive-text',
  secondary: 'bg-accent text-accent-foreground',
}

const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  tiktok:    'TikTok',
  facebook:  'Facebook',
  youtube:   'YouTube',
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}

function normalizeCampaign(raw: ApiCampaign): Campaign {
  const productBrief = raw.productBrief || {}
  const generationConfig = raw.generationConfig || {}
  const publishConfig = raw.publishConfig || {}
  const optimizationConfig = raw.optimizationConfig || {}
  const videoJobs = raw.videoJobs || []
  const completedJobs = videoJobs.filter(job => job.status === 'completed')
  const completedVideos = completedJobs.filter(job => job.metadata?.creativeKind !== 'image').length

  return {
    id: raw.id,
    name: raw.name || 'Campana UGC',
    status: raw.status || 'draft',
    brief: raw.brief || raw.description || productBrief.keyFeatures?.[0] || '',
    product: raw.product || productBrief.productName || 'Producto',
    tone: raw.tone || productBrief.tone || 'casual',
    targetAudience: raw.targetAudience || productBrief.targetAudience || '',
    callToAction: raw.callToAction || productBrief.callToAction || '',
    videoProvider: raw.videoProvider || generationConfig.videoProvider || 'fal-wan',
    videoFormat: raw.videoFormat || generationConfig.aspectRatio || '9:16',
    videoDuration: raw.videoDuration || generationConfig.videoDuration || 30,
    videoResolution: raw.videoResolution || generationConfig.videoResolution || '720p',
    videosCount: raw.videosCount || generationConfig.videoCount || videoJobs.length || 0,
    imagesCount: raw.imagesCount || generationConfig.imageCount || 0,
    videoLanguage: raw.videoLanguage || generationConfig.language || 'es',
    platforms: raw.platforms || publishConfig.platforms || [],
    autoPublish: raw.autoPublish ?? Boolean(publishConfig.autoPublish),
    abTesting: raw.abTesting ?? Boolean(optimizationConfig.abTestEnabled),
    budget: Number(raw.budget || 0),
    stats: {
      videos: raw.stats?.videos ?? raw.totalVideosGenerated ?? completedVideos,
      posts: raw.stats?.posts ?? raw.totalPostsPublished ?? 0,
      views: raw.stats?.views ?? 0,
      engagement: raw.stats?.engagement ?? 0,
    },
    createdAt: raw.createdAt || new Date().toISOString(),
    hasAudio: Boolean(generationConfig.audioEnabled),
    videoModelKey: raw.videoModelKey || undefined,
    imageModelKey: raw.imageModelKey || undefined,
    promptText: generationConfig.prompt || raw.brief || raw.description || '',
  }
}

function configurableOptions(model: FalCatalogEntry, fieldName: string): string[] {
  const field = model.configurableFields.find(field => field.name === fieldName)
  return (field?.options || []).map(option => String(option))
}

function parseDurations(model: FalCatalogEntry): number[] {
  const options = configurableOptions(model, 'duration')
    .map(value => Number(String(value).replace('s', '')))
    .filter(value => Number.isFinite(value) && value > 0)
  if (options.length > 0) return Array.from(new Set(options)).sort((a, b) => a - b)

  const field = model.configurableFields.find(field => field.name === 'duration')
  if (field?.min && field?.max) {
    const step = Number(field.step || 2)
    const values: number[] = []
    for (let value = Number(field.min); value <= Number(field.max); value += step) {
      values.push(value)
    }
    return values
  }
  return [4, 6, 8, 10]
}

function modelBadges(model: FalCatalogEntry): string[] {
  const tags = model.tags.map(tag => tag.toLowerCase())
  return [
    tags.includes('new') ? 'NEW' : null,
    tags.includes('exclusive') || tags.includes('premium') ? 'EXCLUSIVE' : null,
    model.recommended ? 'FEATURED' : null,
  ].filter(Boolean) as string[]
}

function toGenerationModelOption(model: FalCatalogEntry): GenerationModelOption {
  const resolutionOptions = configurableOptions(model, 'resolution')
  const resolutions = resolutionOptions.length > 0
    ? resolutionOptions
    : model.outputs.includes('image')
      ? ['1K', '2K', '4K']
      : ['720p', '1080p']

  return {
    id: model.key,
    label: model.displayName,
    description: `${model.vendor} · ${model.pricing.displayLabel}`,
    resolutions,
    durations: model.outputs.includes('video') ? parseDurations(model) : undefined,
    badges: modelBadges(model),
    costMultiplier: model.pricing.estimateUsd > 0 ? Math.max(0.75, model.pricing.estimateUsd * 10) : 1,
    acceptsImage: model.inputs.includes('image'),
  }
}

function buildDefaultsForModel(
  model: FalCatalogEntry,
  overrides: {
    duration?: string
    aspectRatio?: string
    resolution?: string
    camera?: string
    motion?: string
    styleMode?: string
  }
): Record<string, unknown> {
  const defaults: Record<string, unknown> = { ...(model.defaults || {}) }
  const setIfAccepted = (name: string, value?: string): void => {
    if (!value) return
    const field = model.configurableFields.find(f => f.name === name)
    if (!field) return
    if (!field.options || field.options.includes(value)) {
      defaults[name] = value
      return
    }
    const secondsValue = `${value}s`
    if (field.options.includes(secondsValue)) {
      defaults[name] = secondsValue
    }
  }

  setIfAccepted('duration', overrides.duration)
  setIfAccepted('aspect_ratio', overrides.aspectRatio)
  setIfAccepted('resolution', overrides.resolution)
  setIfAccepted('camera', overrides.camera)
  setIfAccepted('motion', overrides.motion)
  setIfAccepted('style', overrides.styleMode)
  return defaults
}

function campaignNameFromPrompt(prompt: string): string {
  const compact = prompt.replace(/\s+/g, ' ').trim()
  if (!compact) return 'Campana UGC'
  return truncate(compact, 58)
}

function apiMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback
}

// ─── Campaign Row (lista moderna) ───────────────────────────────────────────────

interface CampaignRowProps {
  campaign: Campaign
  onLaunch: (id: number) => void
  onPause: (id: number) => void
  onView: (campaign: Campaign) => void
  onConfigureModels: (id: number) => void
  onReuse: (campaign: Campaign) => void
  actionLoading: number | null
}

function CampaignRow({ campaign, onLaunch, onPause, onView, onConfigureModels, onReuse, actionLoading }: CampaignRowProps) {
  const statusCfg = getStatusCfg(campaign.status)
  const isLoading = actionLoading === campaign.id

  // Card optimista mientras el backend procesa la creación
  if (campaign.isPending) {
    return (
      <div className="relative flex items-center gap-4 overflow-hidden rounded-lg border border-primary/30 bg-primary/[0.06] p-3 md:p-4">
        <div className="hidden size-[46px] shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary md:flex">
          <CircularProgress size="sm" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 truncate text-sm font-bold text-foreground">
              {campaign.name}
            </span>
            <Badge variant="primary">Enviando…</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {campaign.product} · Creando campaña y enviando a generación
          </p>
          <LinearProgress sx={{ mt: 1 }} />
        </div>
      </div>
    )
  }

  const metrics = [
    { label: 'Videos', value: String(campaign.videosCount), icon: <VideoCamera className="size-3.5" aria-hidden /> },
    { label: 'Fotos',  value: String(campaign.imagesCount), icon: <Images className="size-3.5" aria-hidden /> },
    { label: 'Audio',  value: campaign.hasAudio ? 'Sí' : 'No', icon: <MusicNote className="size-3.5" aria-hidden /> },
  ]

  return (
    <div className="flex flex-col items-stretch gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/30 hover:bg-accent/40 hover:shadow-sm md:flex-row md:items-center md:gap-4 md:p-4">
      {/* Avatar con color de estado */}
      <div
        className={cn(
          'hidden size-[46px] shrink-0 items-center justify-center rounded-xl md:flex',
          STATUS_SURFACE[statusCfg.color],
        )}
      >
        <Megaphone className="size-[22px]" weight="fill" aria-hidden />
      </div>

      {/* Info principal */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 truncate text-sm font-bold text-foreground">
            {campaign.name}
          </span>
          <Badge variant={STATUS_BADGE_VARIANT[statusCfg.color]}>{statusCfg.label}</Badge>
        </div>

        {/* Meta: producto · fecha */}
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">{campaign.product}</span>
          <span className="size-[3px] rounded-full bg-muted-foreground/50" aria-hidden />
          <span className="text-xs text-muted-foreground">
            {new Date(campaign.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        </div>

        {/* Brief */}
        {campaign.brief && (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {truncate(campaign.brief, 130)}
          </p>
        )}

        {/* Métricas en línea */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {metrics.map(m => (
            <div
              key={m.label}
              className="flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5"
            >
              <span className="flex text-muted-foreground">{m.icon}</span>
              <span className="text-xs font-bold text-foreground">{m.value}</span>
              <span className="text-[10px] text-muted-foreground">{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Acciones */}
      <div className="flex shrink-0 flex-wrap gap-2 md:justify-end">
        {campaign.status === 'draft' && (
          <Button
            size="sm"
            variant="outline"
            loading={isLoading}
            disabled={isLoading}
            onClick={() => onLaunch(campaign.id)}
            className="flex-1 border-success/40 bg-success/10 text-success-text hover:border-success/40 hover:bg-success/16 hover:text-success-text md:flex-none"
          >
            {!isLoading && <Play className="size-4" weight="fill" aria-hidden />}
            Lanzar
          </Button>
        )}
        {campaign.status === 'active' && (
          <Button
            size="sm"
            variant="outline"
            loading={isLoading}
            disabled={isLoading}
            onClick={() => onPause(campaign.id)}
            className="flex-1 border-warning/40 bg-warning/10 text-warning-text hover:border-warning/40 hover:bg-warning/16 hover:text-warning-text md:flex-none"
          >
            {!isLoading && <Pause className="size-4" weight="fill" aria-hidden />}
            Pausar
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => onView(campaign)}
          className="flex-1 md:flex-none"
        >
          <Eye className="size-4" aria-hidden />
          Detalle
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={() => onConfigureModels(campaign.id)}
          className="flex-1 md:flex-none"
        >
          <VideoCamera className="size-4" aria-hidden />
          Pipeline
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onReuse(campaign)}
          className="flex-1 border-primary/40 bg-primary/10 text-primary hover:border-primary/40 hover:bg-primary/16 hover:text-primary md:flex-none"
        >
          <ArrowsClockwise className="size-4" aria-hidden />
          Reusar
        </Button>
      </div>
    </div>
  )
}

// ─── Modal Detalle Campana ────────────────────────────────────────────────────

const PIPELINE_STAGES = ['Script', 'Avatar', 'Video', 'Compose', 'Review', 'Done']
const STAGE_INDEX: Record<string, number> = {
  script_generation: 0,
  avatar_generation: 1,
  video_generation: 2,
  composition: 3,
  review: 4,
  completed: 5,
  failed: 5,
}

interface VideoItem {
  id: number
  name: string
  stage: number
  status: string
  duration: number
  assetUrl?: string
  assetType?: string
  mimeType?: string
  creativeScore: number | null
}

interface CampaignDetail {
  campaign: Campaign
  videos: VideoItem[]
}

interface ApiCampaignDetail {
  campaign?: ApiCampaign
  videos?: VideoItem[]
}

function normalizeDetail(raw: ApiCampaignDetail): CampaignDetail {
  const rawCampaign = raw.campaign || (raw as unknown as ApiCampaign)
  const campaign = normalizeCampaign(rawCampaign)
  const videoJobs = rawCampaign.videoJobs || []
  const videos = raw.videos || videoJobs.map((job, index) => {
    const asset = job.assets?.[0]
    const assetUrl = asset?.originalUrl || asset?.localPath || job.finalVideoUrl || job.rawVideoUrl || job.thumbnailUrl
    const isImage = job.metadata?.creativeKind === 'image' || asset?.mimeType?.startsWith('image/')

    return {
      id: job.id,
      name: isImage
      ? `Imagen ${index + 1}`
      : `Video ${index + 1}`,
      stage: STAGE_INDEX[String(job.stage || 'script_generation')] ?? 0,
      status: job.status || 'pending',
      duration: job.duration || campaign.videoDuration,
      assetUrl,
      assetType: isImage ? 'image' : 'video',
      mimeType: asset?.mimeType,
      creativeScore: null,
    }
  })

  return { campaign, videos }
}

interface DetailModalProps {
  campaign: Campaign | null
  onClose: () => void
}

function DetailModal({ campaign, onClose }: DetailModalProps) {
  const [detail, setDetail] = useState<CampaignDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!campaign) { setDetail(null); return }
    setLoading(true)
    api.get(`/ugc/campaigns/${campaign.id}`)
      .then(res => setDetail(normalizeDetail(res.data?.data ?? res.data)))
      .catch(err => devError('[DetailModal] fetch:', err))
      .finally(() => setLoading(false))
  }, [campaign])

  if (!campaign) return null

  const statusCfg = getStatusCfg(campaign.status)

  return (
    <Dialog open={!!campaign} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <div className="flex items-center gap-2 pr-8">
            <Megaphone className="size-[22px] shrink-0 text-primary" weight="fill" aria-hidden />
            <DialogTitle className="min-w-0 truncate text-xl">{campaign.name}</DialogTitle>
            <Badge variant={STATUS_BADGE_VARIANT[statusCfg.color]}>{statusCfg.label}</Badge>
          </div>
        </DialogHeader>

        <div className="border-t border-border" />

        {/* Info general */}
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { label: 'Producto',    value: campaign.product },
            { label: 'Tono',        value: campaign.tone },
            { label: 'Provider',    value: campaign.videoProvider.toUpperCase() },
            { label: 'Formato',     value: campaign.videoFormat },
            { label: 'Duracion',    value: `${campaign.videoDuration}s` },
            { label: 'Resolucion',  value: campaign.videoResolution },
            { label: 'Presupuesto', value: `$${campaign.budget}` },
            { label: 'Plataformas', value: campaign.platforms.map(p => PLATFORM_LABELS[p]).join(', ') || '—' },
            { label: 'Auto-publicar', value: campaign.autoPublish ? 'Si' : 'No' },
          ].map(item => (
            <div key={item.label} className="rounded-md bg-muted/40 p-2.5">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="text-sm font-medium text-foreground">{item.value}</p>
            </div>
          ))}
        </div>

        {/* Brief */}
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Brief / Descripcion</p>
          <div className="rounded-md bg-muted/40 p-3">
            <p className="text-sm text-foreground">{campaign.brief}</p>
          </div>
        </div>

        {/* Stats */}
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">Estadisticas</p>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Videos',     value: campaign.stats.videos,                  icon: <VideoCamera className="size-4" aria-hidden /> },
              { label: 'Posts',      value: campaign.stats.posts,                   icon: <PaperPlaneTilt className="size-4" aria-hidden /> },
              { label: 'Vistas',     value: formatNumber(campaign.stats.views),     icon: <ChartBar className="size-4" aria-hidden /> },
              { label: 'Engagement', value: formatNumber(campaign.stats.engagement), icon: <ChartBar className="size-4" aria-hidden /> },
            ].map(stat => (
              <div key={stat.label} className="rounded-lg bg-primary/12 p-3 text-center text-primary">
                <div className="mb-0.5 flex justify-center">{stat.icon}</div>
                <p className="text-xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Videos pipeline */}
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">Videos en Pipeline</p>
          {loading ? (
            <div className="flex justify-center py-6">
              <CircularProgress size="sm" />
            </div>
          ) : !detail || (detail.videos || []).length === 0 ? (
            <div className="rounded-md bg-muted/40 p-4 text-center">
              <p className="text-sm text-muted-foreground">No hay videos generados aun</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {(detail.videos || []).map(video => (
                <div key={video.id} className="rounded-md border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{video.name}</span>
                    <Badge variant="neutral">{video.duration}s</Badge>
                  </div>
                  {/* Pipeline dots */}
                  <div className="flex items-center gap-1">
                    {PIPELINE_STAGES.map((stage, i) => (
                      <div key={stage} className="flex items-center gap-1">
                        {i < video.stage ? (
                          <CheckCircle className="size-3.5 text-success-text" weight="fill" aria-hidden />
                        ) : i === video.stage ? (
                          <Circle className="size-3.5 text-primary" weight="bold" aria-hidden />
                        ) : (
                          <Circle className="size-3.5 text-muted-foreground/40" aria-hidden />
                        )}
                        <span
                          className={cn(
                            'text-[9px]',
                            i <= video.stage ? 'text-primary' : 'text-muted-foreground',
                          )}
                        >
                          {stage}
                        </span>
                        {i < PIPELINE_STAGES.length - 1 && (
                          <span
                            className={cn(
                              'h-px w-3',
                              i < video.stage ? 'bg-success/60' : 'bg-border',
                            )}
                            aria-hidden
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  {video.assetUrl && (
                    <div className="mt-3">
                      {video.assetType === 'image' ? (
                        <img
                          src={video.assetUrl}
                          alt={video.name}
                          className="max-h-[260px] w-full rounded-md border border-border bg-muted/40 object-contain"
                        />
                      ) : (
                        <video
                          src={video.assetUrl}
                          controls
                          className="max-h-[320px] w-full rounded-md bg-black"
                        />
                      )}
                      <a
                        href={video.assetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
                      >
                        Abrir archivo generado
                      </a>
                    </div>
                  )}
                  {video.creativeScore !== null && (
                    <div className="mt-2">
                      <div className="mb-0.5 flex justify-between">
                        <span className="text-xs text-muted-foreground">Creative Score</span>
                        <span className="text-xs font-bold text-foreground">{video.creativeScore}/100</span>
                      </div>
                      <LinearProgress
                        determinate
                        value={video.creativeScore}
                        color={video.creativeScore >= 70 ? 'success' : video.creativeScore >= 40 ? 'warning' : 'danger'}
                        size="sm"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UGCCampaigns() {
  const navigate = useNavigate()
  const [campaigns, setCampaigns]       = useState<Campaign[]>([])
  const [loading, setLoading]           = useState(true)
  const [loadingMore, setLoadingMore]   = useState(false)
  const [page, setPage]                 = useState(1)
  const [total, setTotal]               = useState(0)
  const [hasMore, setHasMore]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | 'all'>('all')
  const [detailCampaign, setDetailCampaign] = useState<Campaign | null>(null)
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [creatingCampaign, setCreatingCampaign] = useState(false)
  const [pendingCampaign, setPendingCampaign] = useState<Campaign | null>(null)
  const [prefill, setPrefill] = useState<GenerationPrefill | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [falModels, setFalModels] = useState<FalCatalogEntry[]>([])
  const [loadingModels, setLoadingModels] = useState(true)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const availableFalModels = useMemo(
    () => falModels.filter(model => model.available !== false),
    [falModels]
  )

  const videoGenerationModels = useMemo(
    () => availableFalModels
      .filter(model =>
        ['text-to-video', 'image-to-video', 'video-to-video'].includes(model.category) &&
        model.outputs.includes('video') &&
        !model.requiresCampaignAssets.includes('motionReferenceVideo')
      )
      .map(toGenerationModelOption),
    [availableFalModels]
  )

  const imageGenerationModels = useMemo(
    () => availableFalModels
      .filter(model => model.category === 'text-to-image' && model.outputs.includes('image'))
      .map(toGenerationModelOption),
    [availableFalModels]
  )

  const fetchPage = useCallback(async (pageToLoad: number, replace: boolean) => {
    if (replace) setLoading(true)
    else setLoadingMore(true)
    setError(null)
    try {
      const params: Record<string, string | number> = { page: pageToLoad, limit: PAGE_SIZE }
      if (statusFilter !== 'all') params.status = statusFilter
      if (search.trim()) params.searchParam = search.trim()

      const { data } = await api.get('/ugc/campaigns', { params })
      const rows = (data.data ?? data ?? []) as ApiCampaign[]
      const normalized = rows.map(normalizeCampaign)

      setCampaigns(prev => (replace ? normalized : [...prev, ...normalized]))
      const totalCount = data.pagination?.total ?? normalized.length
      const totalPages = data.pagination?.totalPages ?? 1
      setTotal(totalCount)
      setPage(pageToLoad)
      setHasMore(pageToLoad < totalPages)
    } catch (err: unknown) {
      devError('[UGCCampaigns] fetch error:', err)
      setError('No se pudieron cargar las campanas. Verifica tu conexion.')
    } finally {
      if (replace) setLoading(false)
      else setLoadingMore(false)
    }
  }, [statusFilter, search])

  // Carga inicial + recarga al cambiar filtros (con debounce en la búsqueda)
  useEffect(() => {
    const delay = search ? 350 : 0
    const timer = setTimeout(() => { fetchPage(1, true) }, delay)
    return () => clearTimeout(timer)
  }, [fetchPage])

  // Scroll infinito: carga la siguiente página al llegar al final
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          fetchPage(page + 1, false)
        }
      },
      { rootMargin: '240px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loading, loadingMore, page, fetchPage])

  useEffect(() => {
    let cancelled = false
    setLoadingModels(true)
    listFalModels()
      .then(models => {
        if (!cancelled) setFalModels(models)
      })
      .catch(err => {
        devError('[UGCCampaigns] fal models error:', err)
        if (!cancelled) setCreateError('No se pudieron cargar los modelos fal.ai configurados.')
      })
      .finally(() => {
        if (!cancelled) setLoadingModels(false)
      })
    return () => { cancelled = true }
  }, [])

  const handleLaunch = async (id: number) => {
    setActionLoading(id)
    try {
      await api.post(`/ugc/campaigns/${id}/launch`)
      await fetchPage(1, true)
    } catch (err: unknown) {
      devError('[UGCCampaigns] launch error:', err)
    } finally {
      setActionLoading(null)
    }
  }

  const handlePause = async (id: number) => {
    setActionLoading(id)
    try {
      await api.post(`/ugc/campaigns/${id}/pause`)
      await fetchPage(1, true)
    } catch (err: unknown) {
      devError('[UGCCampaigns] pause error:', err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleGenerate = async (payload: GenerationPayload) => {
    setCreatingCampaign(true)
    setCreateError(null)

    // Card optimista: se muestra de inmediato arriba con estado "cargando"
    const optimistic: Campaign = {
      id: -Date.now(),
      name: campaignNameFromPrompt(payload.prompt),
      status: 'briefing',
      brief: payload.prompt,
      product: payload.mentions[0] || (payload.mode === 'image' ? 'Imagen UGC' : 'Contenido UGC'),
      tone: 'casual',
      targetAudience: 'audiencia general',
      callToAction: 'Conoce más',
      videoProvider: 'fal-wan',
      videoFormat: (payload.mode === 'image' ? payload.aspectRatio || '16:9' : '9:16') as VideoFormat,
      videoDuration: payload.mode === 'video' ? Number(payload.duration || 4) : 0,
      videoResolution: payload.resolution as VideoResolution,
      videosCount: payload.mode === 'video' ? payload.count : 0,
      imagesCount: payload.mode === 'image' ? payload.count : 0,
      videoLanguage: 'es',
      platforms: [],
      autoPublish: false,
      abTesting: false,
      budget: 0,
      stats: { videos: 0, posts: 0, views: 0, engagement: 0 },
      createdAt: new Date().toISOString(),
      hasAudio: Boolean(payload.mode === 'video' && payload.audio),
      isPending: true,
    }
    setPendingCampaign(optimistic)

    try {
      const selectedModel = availableFalModels.find(model => model.key === payload.model)
      if (!selectedModel) {
        throw new Error('El modelo seleccionado no está disponible en fal.ai.')
      }

      const imageModel = payload.mode === 'image'
        ? selectedModel
        : availableFalModels.find(model => model.category === 'text-to-image' && model.recommended) ||
          availableFalModels.find(model => model.category === 'text-to-image')

      if (payload.mode === 'video' && !selectedModel.outputs.includes('video')) {
        throw new Error('Selecciona un modelo de video válido.')
      }
      if (payload.mode === 'image' && selectedModel.category !== 'text-to-image') {
        throw new Error('Selecciona un modelo de imagen válido.')
      }

      const pipelineMode: PipelineMode = payload.mode === 'video' && selectedModel.category === 'text-to-video'
        ? 'text-to-video-direct'
        : 'image-then-video'

      if (payload.mode === 'video' && pipelineMode === 'image-then-video' && !imageModel) {
        throw new Error('No hay modelo de imagen configurado para alimentar este modelo de video.')
      }

      const videoModelDefaults = payload.mode === 'video'
        ? buildDefaultsForModel(selectedModel, {
          duration: payload.duration ? String(payload.duration) : undefined,
          aspectRatio: '9:16',
          resolution: payload.resolution,
          camera: payload.camera,
          motion: payload.motion,
          styleMode: payload.styleMode,
        })
        : {}

      const imageModelDefaults = imageModel
        ? buildDefaultsForModel(imageModel, {
          aspectRatio: payload.mode === 'image' ? payload.aspectRatio || '16:9' : '9:16',
          resolution: payload.mode === 'image' ? payload.resolution : '720p',
        })
        : {}

      const voiceModel = payload.mode === 'video' && payload.audio
        ? availableFalModels.find(model =>
          model.category === 'text-to-speech' &&
          model.outputs.includes('audio') &&
          !model.requiresCampaignAssets.includes('audioReference')
        )
        : null

      const createResponse = await api.post('/ugc/campaigns', {
        name: campaignNameFromPrompt(payload.prompt),
        brief: payload.prompt,
        product: payload.mentions[0] || 'Contenido UGC',
        tone: 'casual',
        targetAudience: 'audiencia general',
        callToAction: 'Conoce más',
        videoProvider: 'fal-wan',
        videoFormat: payload.mode === 'image' ? payload.aspectRatio || '16:9' : '9:16',
        videoDuration: payload.mode === 'video' ? Number(payload.duration || 4) : 0,
        videoResolution: payload.resolution,
        videosCount: payload.mode === 'video' ? payload.count : 0,
        imagesCount: payload.mode === 'image' ? payload.count : 0,
        videoLanguage: 'es',
        platforms: [],
        autoPublish: false,
        abTesting: false,
        budget: 0,
        productBrief: {
          productName: payload.mentions[0] || 'Contenido UGC',
          targetAudience: 'audiencia general',
          tone: 'casual',
          callToAction: 'Conoce más',
          keyFeatures: [payload.prompt],
        },
        generationConfig: {
          videoCount: payload.mode === 'video' ? payload.count : 0,
          imageCount: payload.mode === 'image' ? payload.count : 0,
          videoDuration: payload.mode === 'video' ? Number(payload.duration || 4) : 0,
          videoResolution: payload.resolution,
          aspectRatio: payload.mode === 'image' ? payload.aspectRatio || '16:9' : '9:16',
          videoProvider: 'fal-wan',
          imageProvider: 'fal-flux',
          language: 'es',
          subtitlesEnabled: true,
          hooks: [],
          generationMode: payload.mode,
          prompt: payload.prompt,
          references: payload.references,
          mentions: payload.mentions,
          camera: payload.camera,
          motion: payload.motion,
          styleMode: payload.styleMode,
          audioEnabled: Boolean(payload.audio),
          estimatedCredits: payload.estimatedCost || 0,
        },
        publishConfig: {
          platforms: [],
          autoPublish: false,
        },
        optimizationConfig: {
          abTestEnabled: false,
        },
        pipelineMode,
        videoModelKey: payload.mode === 'video' ? selectedModel.key : null,
        videoModelDefaults,
        videoModelMotionReferenceUrl: null,
        imageModelKey: imageModel?.key ?? null,
        imageModelDefaults,
        voiceModelKey: voiceModel?.key ?? null,
        voiceModelDefaults: voiceModel?.defaults ?? {},
        audioReferenceUrl: null,
      })

      const campaignId = Number((createResponse.data?.data ?? createResponse.data)?.id)
      if (campaignId) {
        await api.post(`/ugc/campaigns/${campaignId}/launch`)
      }
      toast.success('Campaña UGC creada y enviada a generación.')
      await fetchPage(1, true)
    } catch (err: unknown) {
      devError('[UGCCampaigns] generate error:', err)
      const apiMsg = apiMessage(err, '')
      const msg = apiMsg || (err instanceof Error
        ? err.message
        : 'No se pudo generar la campaña. Intenta nuevamente.')
      setCreateError(msg)
      toast.error(msg)
    } finally {
      setCreatingCampaign(false)
      setPendingCampaign(null)
    }
  }

  const handleReuse = (campaign: Campaign) => {
    const mode = campaign.imagesCount > 0 && campaign.videosCount === 0 ? 'image' : 'video'
    setPrefill({
      nonce: Date.now(),
      mode,
      prompt: campaign.promptText || campaign.brief || '',
      model: mode === 'video' ? campaign.videoModelKey : campaign.imageModelKey,
      count: mode === 'video' ? campaign.videosCount || 1 : campaign.imagesCount || 1,
      resolution: campaign.videoResolution,
      duration: campaign.videoDuration || undefined,
      aspectRatio: campaign.videoFormat,
      mentions: campaign.product ? [campaign.product] : [],
      audio: campaign.hasAudio,
    })
    toast.info('Datos cargados en el generador. Ajusta lo que quieras y vuelve a generar.')
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }

  const displayList = pendingCampaign ? [pendingCampaign, ...campaigns] : campaigns

  return (
    <div className="mx-auto max-w-[1200px] p-4 pb-40 md:p-6">
      {/* ── Header ── */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
            <Megaphone className="size-6" weight="fill" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Campanas UGC</h1>
            <p className="text-sm text-muted-foreground">
              Gestiona y lanza campanas de contenido generado por IA
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Actualizar"
            className="text-muted-foreground"
            onClick={() => fetchPage(1, true)}
            disabled={loading}
          >
            <ArrowClockwise className="size-5" aria-hidden />
          </Button>
        </div>
      </div>

      {/* ── Error state ── */}
      {error && (
        <div className="mb-6 rounded-lg bg-destructive/12 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-destructive-text">{error}</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => fetchPage(1, true)}
              className="text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
            >
              Reintentar
            </Button>
          </div>
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px]">
          <MagnifyingGlass
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            placeholder="Buscar por nombre o producto..."
            aria-label="Buscar campanas"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as CampaignStatus | 'all')}>
          <SelectTrigger className="min-w-[160px]" aria-label="Filtrar por estado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="briefing">Briefing</SelectItem>
            <SelectItem value="producing">Produciendo</SelectItem>
            <SelectItem value="active">Activa</SelectItem>
            <SelectItem value="paused">Pausada</SelectItem>
            <SelectItem value="completed">Completada</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto self-center text-xs text-muted-foreground">
          {total} campana{total !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="mb-6 border-t border-border" />

      {/* ── Content ── */}
      {loading && displayList.length === 0 ? (
        <div className="flex justify-center py-16">
          <CircularProgress size="lg" />
        </div>
      ) : displayList.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-20">
          <Megaphone className="size-16 text-muted-foreground/50" weight="fill" aria-hidden />
          <h2 className="text-center text-2xl font-semibold text-foreground">Sin campanas</h2>
          <p className="max-w-sm text-center text-base text-muted-foreground">
            {(search || statusFilter !== 'all')
              ? 'No hay campanas que coincidan con los filtros seleccionados.'
              : 'No hay campanas UGC creadas. Configura el prompt y los parametros en la barra inferior para generar la primera.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {displayList.map(campaign => (
            <CampaignRow
              key={campaign.id}
              campaign={campaign}
              onLaunch={handleLaunch}
              onPause={handlePause}
              onView={c => setDetailCampaign(c)}
              onConfigureModels={id => navigate(`/ugc/campaigns/${id}/model-selector`)}
              onReuse={handleReuse}
              actionLoading={actionLoading}
            />
          ))}

          {/* Sentinel para scroll infinito */}
          <div ref={sentinelRef} className="h-px" />

          {loadingMore && (
            <div className="flex justify-center py-2">
              <CircularProgress size="sm" />
            </div>
          )}

          {!hasMore && (
            <p className="py-1.5 text-center text-xs text-muted-foreground opacity-70">
              Mostrando {campaigns.length} de {total} campana{total !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}

      <GenerationBar
        videoModels={videoGenerationModels}
        imageModels={imageGenerationModels}
        onGenerate={handleGenerate}
        loading={creatingCampaign}
        disabled={loadingModels || (videoGenerationModels.length === 0 && imageGenerationModels.length === 0)}
        error={createError}
        prefill={prefill}
      />

      {/* ── Modales ── */}
      <DetailModal
        campaign={detailCampaign}
        onClose={() => setDetailCampaign(null)}
      />
    </div>
  )
}
