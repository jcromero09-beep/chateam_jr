import { useState, useEffect, useCallback } from 'react'
// [Migración G] Solo se conservan de MUI Joy los indicadores de progreso (sin
// equivalente Radix en el design system): CircularProgress y LinearProgress.
import { CircularProgress, LinearProgress } from '@mui/joy'
import {
  FilmStrip,
  Image as ImageIcon,
  ArrowClockwise,
  MagnifyingGlass,
  PlayCircle,
  Eye,
  DownloadSimple,
  ArrowCounterClockwise,
  CheckCircle,
  Circle,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { StatTile } from '@/components/ui/stat-tile'
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
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devError = (...args: unknown[]) => { if (isDev) console.error(...args) }

// ─── Types ────────────────────────────────────────────────────────────────────

type VideoStatus = 'queued' | 'producing' | 'completed' | 'failed'
type VideoProvider = 'heygen' | 'kling' | 'runway'
type VideoFormat = '9:16' | '16:9' | '1:1'

interface PipelineTimestamps {
  script?: string
  avatar?: string
  video?: string
  compose?: string
  review?: string
  done?: string
}

interface VideoAssets {
  raw?: string
  composed?: string
  thumbnail?: string
  subtitles?: string
}

type MediaType = 'video' | 'image'

interface UGCVideo {
  id: number
  name: string
  campaignId: number
  campaignName: string
  provider: VideoProvider
  format: VideoFormat
  duration: number
  status: VideoStatus
  stage: number
  scriptGenerated?: string
  creativeScore: number | null
  thumbnailUrl?: string
  videoUrl?: string
  mediaType: MediaType
  mimeType?: string
  assets: VideoAssets
  pipelineTimestamps: PipelineTimestamps
  createdAt: string
}

// ─── Backend → UI Adapter ─────────────────────────────────────────────────────
// El backend (UGCVideoJob + assets[]) tiene un shape distinto al que asume la UI.
// Esta funcion normaliza la respuesta cruda al shape UGCVideo esperado.
type RawAsset = {
  assetType: string
  localPath?: string
  originalUrl?: string
  mimeType?: string
  isActive?: boolean
}

type RawUGCVideo = Record<string, unknown> & {
  id: number
  ugcCampaignId?: number
  ugcCampaign?: { id?: number; name?: string }
  videoProvider?: string
  provider?: string
  status?: string
  stage?: string | number
  script?: string
  scriptGenerated?: string
  creativeScore?: number | string | null
  thumbnailUrl?: string
  finalVideoUrl?: string
  rawVideoUrl?: string
  duration?: number | string
  fileName?: string
  mimeType?: string
  pipelineLog?: Array<{ stage: string; status: string; timestamp: string }>
  metadata?: Record<string, unknown>
  format?: string
  assets?: RawAsset[]
  createdAt?: string
}

function normalizeVideo(raw: RawUGCVideo): UGCVideo {
  const statusMap: Record<string, VideoStatus> = {
    pending: 'queued',
    processing: 'producing',
    completed: 'completed',
    failed: 'failed',
    cancelled: 'failed',
  }
  const stageMap: Record<string, number> = {
    script_generation: 0,
    avatar_generation: 1,
    video_generation: 2,
    composition: 3,
    review: 4,
    completed: 5,
    failed: 5,
  }

  const rawProvider = String(raw.videoProvider ?? raw.provider ?? '').toLowerCase()
  const provider: VideoProvider =
    rawProvider.includes('heygen') ? 'heygen' :
    rawProvider.includes('kling')  ? 'kling'  :
    rawProvider.includes('runway') ? 'runway' :
    (rawProvider as VideoProvider)

  const assetsArr: RawAsset[] = Array.isArray(raw.assets) ? raw.assets : []
  const findAsset = (type: string) =>
    assetsArr.find(a => a.assetType === type && a.isActive !== false)
  const assetUrl = (type: string) => {
    const a = findAsset(type)
    return a ? (a.localPath || a.originalUrl) : undefined
  }
  const findFirstAsset = (types: string[]) => {
    for (const t of types) {
      const a = findAsset(t)
      if (a) return a
    }
    return undefined
  }

  // Detectar si es imagen o video. assetTypes posibles:
  //   raw_avatar | raw_video | composed_final | thumbnail | subtitle_file
  //   generated_image | image_thumbnail
  const hasImageAsset = assetsArr.some(a =>
    a.assetType === 'generated_image' || a.assetType === 'image_thumbnail'
  )
  const composedMime = findAsset('composed_final')?.mimeType || ''
  const jobMime      = String(raw.mimeType || '')
  const looksImage   = hasImageAsset
    || composedMime.startsWith('image/')
    || jobMime.startsWith('image/')
  const mediaType: MediaType = looksImage ? 'image' : 'video'

  // URL principal (foto o video). Para imágenes preferir generated_image.
  const primaryAsset = mediaType === 'image'
    ? findFirstAsset(['generated_image', 'composed_final'])
    : findFirstAsset(['composed_final', 'raw_video'])
  const primaryUrl = primaryAsset?.localPath || primaryAsset?.originalUrl
    || (mediaType === 'image' ? undefined : (raw.finalVideoUrl || raw.rawVideoUrl))

  // Thumbnail: image_thumbnail / thumbnail / job.thumbnailUrl. Si nada y es imagen,
  // usar la imagen misma como portada.
  const thumbAsset = findFirstAsset(['image_thumbnail', 'thumbnail'])
  const thumbnailUrl = thumbAsset?.localPath
    || thumbAsset?.originalUrl
    || raw.thumbnailUrl
    || (mediaType === 'image' ? primaryUrl : undefined)

  const resolvedMime = primaryAsset?.mimeType
    || jobMime
    || (mediaType === 'image' ? 'image/jpeg' : 'video/mp4')

  const log = Array.isArray(raw.pipelineLog) ? raw.pipelineLog : []
  const tsForStage = (stageName: string) =>
    log.find(e => e.stage === stageName && e.status === 'completed')?.timestamp

  const stageVal: number =
    typeof raw.stage === 'number'
      ? raw.stage
      : (stageMap[String(raw.stage ?? '')] ?? 0)

  const fmt = String(raw.format ?? (raw.metadata as { format?: string } | undefined)?.format ?? '9:16')
  const format: VideoFormat = (['9:16', '16:9', '1:1'] as const).includes(fmt as VideoFormat)
    ? (fmt as VideoFormat)
    : '9:16'

  return {
    id: raw.id,
    name: raw.fileName || raw.ugcCampaign?.name || (mediaType === 'image' ? `Imagen #${raw.id}` : `Video #${raw.id}`),
    campaignId: raw.ugcCampaignId ?? 0,
    campaignName: raw.ugcCampaign?.name || (raw.ugcCampaignId ? `Campaña ${raw.ugcCampaignId}` : 'Generación standalone'),
    provider,
    format,
    duration: Number(raw.duration ?? 0),
    status: statusMap[String(raw.status ?? '')] ?? 'queued',
    stage: stageVal,
    scriptGenerated: raw.script ?? raw.scriptGenerated,
    creativeScore: raw.creativeScore != null ? Number(raw.creativeScore) : null,
    thumbnailUrl,
    videoUrl: primaryUrl,
    mediaType,
    mimeType: resolvedMime,
    assets: {
      raw: assetUrl('raw_video') || raw.rawVideoUrl,
      composed: primaryUrl,
      thumbnail: thumbnailUrl,
      subtitles: assetUrl('subtitle_file'),
    },
    pipelineTimestamps: {
      script:  tsForStage('script_generation'),
      avatar:  tsForStage('avatar_generation'),
      video:   tsForStage('video_generation'),
      compose: tsForStage('composition'),
      review:  tsForStage('review'),
      done:    tsForStage('completed'),
    },
    createdAt: raw.createdAt ?? new Date().toISOString(),
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PIPELINE_STAGES = ['Script', 'Avatar', 'Video', 'Compose', 'Review', 'Done']

const STATUS_CONFIG: Record<VideoStatus, {
  label: string
  variant: BadgeProps['variant']
  icon: React.ReactNode
}> = {
  queued:    { label: 'En Cola',      variant: 'neutral',     icon: <Circle className="size-3" aria-hidden /> },
  producing: { label: 'Produciendo',  variant: 'primary',     icon: <CircularProgress size="sm" sx={{ '--CircularProgress-size': '12px' }} /> },
  completed: { label: 'Completado',   variant: 'success',     icon: <CheckCircle className="size-3" weight="fill" aria-hidden /> },
  failed:    { label: 'Fallido',      variant: 'destructive', icon: <WarningCircle className="size-3" weight="fill" aria-hidden /> },
}

const PROVIDER_CONFIG: Record<VideoProvider, { label: string; color: string }> = {
  heygen: { label: 'HeyGen', color: '#1565C0' },
  kling:  { label: 'Kling',  color: '#2E7D32' },
  runway: { label: 'Runway', color: '#6A1B9A' },
}

const DEFAULT_PROVIDER_CFG = { label: 'Desconocido', color: '#64748b' }
const DEFAULT_STATUS_CFG: { label: string; variant: BadgeProps['variant']; icon: React.ReactNode } = {
  label: 'Desconocido',
  variant: 'neutral',
  icon: <Circle className="size-3" aria-hidden />,
}

const getProviderCfg = (provider?: VideoProvider | string | null) =>
  (provider && PROVIDER_CONFIG[provider as VideoProvider]) || DEFAULT_PROVIDER_CFG

const getStatusCfg = (status?: VideoStatus | string | null) =>
  (status && STATUS_CONFIG[status as VideoStatus]) || DEFAULT_STATUS_CFG

const FORMAT_RATIO: Record<VideoFormat, number> = {
  '9:16':  9 / 16,
  '16:9':  16 / 9,
  '1:1':   1,
}

const getFormatRatio = (format?: VideoFormat | string | null) =>
  (format && FORMAT_RATIO[format as VideoFormat]) || 9 / 16

// Badge de proveedor externo. Usa el color de marca del provider (tinte + texto),
// igual patrón que los canales en Connections.tsx (colores de marca inline).
function ProviderBadge({ provider }: { provider?: VideoProvider | string | null }) {
  const cfg = getProviderCfg(provider)
  return (
    <span
      className="inline-flex items-center rounded-full border border-transparent px-2 py-0.5 text-xs font-medium leading-none whitespace-nowrap"
      style={{ backgroundColor: `${cfg.color}18`, color: cfg.color }}
    >
      {cfg.label}
    </span>
  )
}

// ─── Pipeline Visual ──────────────────────────────────────────────────────────

function PipelineDots({ stage, compact = false }: { stage: number; compact?: boolean }) {
  return (
    <div className={cn('flex items-center', compact ? 'gap-0.5' : 'gap-1')}>
      {PIPELINE_STAGES.map((label, i) => (
        <div key={label} className="flex items-center">
          {i < stage ? (
            <CheckCircle
              className={cn(compact ? 'size-2.5' : 'size-3.5', 'text-success-text')}
              weight="fill"
              aria-hidden
            />
          ) : i === stage ? (
            <span
              className={cn('rounded-full bg-primary', compact ? 'size-2' : 'size-3')}
              style={{ boxShadow: '0 0 0 2px var(--accent)' }}
              aria-hidden
            />
          ) : (
            <span
              className={cn('rounded-full bg-muted', compact ? 'size-1.5' : 'size-2.5')}
              aria-hidden
            />
          )}
          {!compact && i < PIPELINE_STAGES.length - 1 && (
            <span className={cn('mx-0.5 h-px w-2', i < stage ? 'bg-success' : 'bg-muted')} aria-hidden />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Video Card ───────────────────────────────────────────────────────────────

interface VideoCardProps {
  video: UGCVideo
  onPreview: (video: UGCVideo) => void
  onRetry: (id: number) => void
  retryLoading: number | null
}

function VideoCard({ video, onPreview, onRetry, retryLoading }: VideoCardProps) {
  const statusCfg   = getStatusCfg(video.status)
  const ratio       = getFormatRatio(video.format)
  const isRetrying  = retryLoading === video.id
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    if (downloading) return
    setDownloading(true)
    try {
      // Preferir endpoint dedicado: resuelve composed_final + incrementa downloadCount
      let url: string | undefined
      const ext = video.mediaType === 'image'
        ? (video.mimeType?.includes('png') ? 'png' : 'jpg')
        : 'mp4'
      let fileName = `${video.name || `media_${video.id}`}.${ext}`
      try {
        const { data } = await api.get(`/ugc/videos/${video.id}/download`)
        url      = data?.data?.downloadUrl
        fileName = data?.data?.fileName || fileName
      } catch (e) {
        devError('[UGCVideoStudio] download endpoint fallback:', e)
      }
      // Fallback al asset ya normalizado
      url = url ?? video.assets?.composed ?? video.assets?.raw ?? video.videoUrl
      if (!url) {
        window.alert(video.mediaType === 'image'
          ? 'Imagen no disponible para descarga'
          : 'Video no disponible para descarga')
        return
      }
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2.5 overflow-hidden rounded-xl border border-border bg-card p-3 shadow-sm shadow-black/[0.02]">
      {/* Thumbnail con play overlay */}
      <div
        className="group relative overflow-hidden rounded-md bg-muted"
        style={{
          aspectRatio: ratio,
          maxHeight: 160,
          cursor: video.status === 'completed' ? 'pointer' : 'default',
        }}
        onClick={() => video.status === 'completed' && onPreview(video)}
      >
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.name}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1">
            {video.mediaType === 'image'
              ? <ImageIcon className="size-8 text-muted-foreground" aria-hidden />
              : <FilmStrip className="size-8 text-muted-foreground" aria-hidden />}
            <span className="text-xs text-muted-foreground">{video.format}</span>
          </div>
        )}
        {video.status === 'completed' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            {video.mediaType === 'image'
              ? <Eye className="size-10 text-white" aria-hidden />
              : <PlayCircle className="size-10 text-white" weight="fill" aria-hidden />}
          </div>
        )}
        {video.status === 'producing' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <CircularProgress size="md" sx={{ color: 'white' }} />
          </div>
        )}
      </div>

      {/* Nombre */}
      <p className="truncate text-sm font-semibold text-foreground" title={video.name}>
        {video.name}
      </p>

      {/* Chips */}
      <div className="flex flex-wrap gap-1">
        <Badge variant="neutral">{video.campaignName}</Badge>
        <ProviderBadge provider={video.provider} />
      </div>

      {/* Pipeline dots */}
      <div>
        <p className="mb-1 text-[9px] text-muted-foreground">
          {PIPELINE_STAGES[Math.min(video.stage ?? 0, PIPELINE_STAGES.length - 1)]}
        </p>
        <PipelineDots stage={video.stage ?? 0} compact />
      </div>

      {/* Status + duracion */}
      <div className="flex items-center justify-between">
        <Badge variant={statusCfg.variant}>
          {statusCfg.icon}
          {statusCfg.label}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {video.mediaType === 'image' ? 'Imagen' : `${video.duration || 0}s`}
        </span>
      </div>

      {/* Creative Score */}
      {video.creativeScore !== null && (
        <div>
          <div className="mb-0.5 flex justify-between">
            <span className="text-[10px] text-muted-foreground">Creative Score</span>
            <span className="text-[10px] font-semibold text-foreground">{video.creativeScore}/100</span>
          </div>
          <LinearProgress
            determinate
            value={video.creativeScore}
            color={video.creativeScore >= 70 ? 'success' : video.creativeScore >= 40 ? 'warning' : 'danger'}
            size="sm"
          />
        </div>
      )}

      <div className="h-px w-full bg-border" />

      {/* Acciones */}
      <div className="flex gap-1.5">
        {video.status === 'completed' && (
          <>
            <Button
              variant="primary"
              size="sm"
              className="flex-1"
              onClick={() => onPreview(video)}
            >
              {video.mediaType === 'image'
                ? <Eye className="size-4" aria-hidden />
                : <PlayCircle className="size-4" weight="fill" aria-hidden />}
              {video.mediaType === 'image' ? 'Ver' : 'Preview'}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-9 shrink-0"
              onClick={handleDownload}
              disabled={downloading}
              aria-label={video.mediaType === 'image' ? 'Descargar imagen' : 'Descargar video'}
            >
              {downloading
                ? <CircularProgress size="sm" sx={{ '--CircularProgress-size': '16px' }} />
                : <DownloadSimple className="size-4" aria-hidden />}
            </Button>
          </>
        )}
        {video.status === 'failed' && (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
            onClick={() => onRetry(video.id)}
            disabled={isRetrying}
          >
            {isRetrying
              ? <CircularProgress size="sm" sx={{ '--CircularProgress-size': '14px' }} />
              : <ArrowCounterClockwise className="size-4" aria-hidden />}
            Reintentar
          </Button>
        )}
        {video.status === 'producing' && (
          <p className="w-full py-1 text-center text-xs text-muted-foreground">
            Generando video...
          </p>
        )}
        {video.status === 'queued' && (
          <p className="w-full py-1 text-center text-xs text-muted-foreground">
            En cola de procesamiento
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Modal Preview ─────────────────────────────────────────────────────────────

interface PreviewModalProps {
  video: UGCVideo | null
  onClose: () => void
}

function PreviewModal({ video, onClose }: PreviewModalProps) {
  if (!video) return null

  const videoSrc = video.assets?.composed ?? video.assets?.raw ?? video.videoUrl

  const ts = video.pipelineTimestamps ?? {}
  const timestampItems = [
    { label: 'Script generado', ts: ts.script },
    { label: 'Avatar creado',   ts: ts.avatar },
    { label: 'Video renderizado', ts: ts.video },
    { label: 'Composicion',     ts: ts.compose },
    { label: 'Revision',        ts: ts.review },
    { label: 'Completado',      ts: ts.done },
  ]

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent
        hideClose
        className="max-w-3xl gap-0 overflow-hidden p-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-border p-4">
          <div className="flex items-center gap-2">
            {video.mediaType === 'image'
              ? <ImageIcon className="size-5 text-primary" aria-hidden />
              : <FilmStrip className="size-5 text-primary" aria-hidden />}
            <DialogTitle className="text-base">{video.name}</DialogTitle>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <X className="size-[18px]" aria-hidden />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* Media player: img si es imagen, video si es video */}
          <div className="flex min-h-[280px] items-center justify-center bg-muted p-4">
            {videoSrc ? (
              video.mediaType === 'image' ? (
                <img
                  src={videoSrc}
                  alt={video.name}
                  className="max-h-[360px] w-full rounded-md bg-black object-contain"
                />
              ) : (
                <video
                  src={videoSrc}
                  controls
                  className="max-h-[360px] w-full rounded-md bg-black"
                />
              )
            ) : (
              <div className="text-center">
                {video.mediaType === 'image'
                  ? <ImageIcon className="mx-auto mb-1 size-12 text-muted-foreground" aria-hidden />
                  : <FilmStrip className="mx-auto mb-1 size-12 text-muted-foreground" aria-hidden />}
                <p className="text-sm text-muted-foreground">
                  {video.mediaType === 'image' ? 'Imagen no disponible' : 'Video no disponible'}
                </p>
              </div>
            )}
          </div>

          {/* Info panel */}
          <div className="p-4">
            {/* Chips info */}
            <div className="mb-4 flex flex-wrap gap-1.5">
              <Badge variant="neutral">{video.campaignName}</Badge>
              <ProviderBadge provider={video.provider} />
              <Badge variant="outline">{video.format}</Badge>
              <Badge variant="outline">
                {video.mediaType === 'image' ? 'Imagen' : `${video.duration || 0}s`}
              </Badge>
            </div>

            {/* Creative Score */}
            {video.creativeScore !== null && (
              <div className="mb-4">
                <div className="mb-1 flex justify-between">
                  <span className="text-sm font-medium text-foreground">Creative Score</span>
                  <span className={cn(
                    'text-sm font-semibold',
                    video.creativeScore >= 70 ? 'text-success-text' : 'text-warning-text',
                  )}>
                    {video.creativeScore}/100
                  </span>
                </div>
                <LinearProgress
                  determinate
                  value={video.creativeScore}
                  color={video.creativeScore >= 70 ? 'success' : video.creativeScore >= 40 ? 'warning' : 'danger'}
                />
              </div>
            )}

            {/* Script generado */}
            {video.scriptGenerated && (
              <div className="mb-4">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Script Generado</p>
                <div className="max-h-[100px] overflow-y-auto rounded-md bg-muted p-3">
                  <p className="text-xs italic leading-relaxed text-foreground">
                    {video.scriptGenerated}
                  </p>
                </div>
              </div>
            )}

            {/* Pipeline timestamps */}
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Pipeline</p>
            <div className="flex flex-col gap-1">
              {PIPELINE_STAGES.map((stage, i) => {
                const item = timestampItems[i]
                const done = i < video.stage
                const active = i === video.stage
                return (
                  <div
                    key={stage}
                    className={cn(
                      'flex items-center gap-2 rounded-md p-1.5',
                      done ? 'bg-success/12' : active ? 'bg-primary/12' : 'bg-transparent',
                    )}
                  >
                    {done ? (
                      <CheckCircle className="size-3.5 shrink-0 text-success-text" weight="fill" aria-hidden />
                    ) : active ? (
                      <span className="size-3.5 shrink-0 rounded-full bg-primary" aria-hidden />
                    ) : (
                      <span className="size-3.5 shrink-0 rounded-full bg-muted" aria-hidden />
                    )}
                    <span className={cn(
                      'flex-1 text-xs',
                      done ? 'text-success-text' : active ? 'text-primary' : 'text-muted-foreground',
                    )}>
                      {stage}
                    </span>
                    {item.ts && (
                      <span className="text-[9px] text-muted-foreground">
                        {new Date(item.ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Assets */}
            {Object.values(video.assets).some(Boolean) && (
              <div className="mt-4">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Assets</p>
                <div className="flex flex-wrap gap-1">
                  {video.assets.raw      && <Badge variant="outline">Raw</Badge>}
                  {video.assets.composed && <Badge variant="success">Composed</Badge>}
                  {video.assets.thumbnail && <Badge variant="primary">Thumbnail</Badge>}
                  {video.assets.subtitles && <Badge variant="warning">Subtitulos</Badge>}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UGCVideoStudio() {
  const [videos, setVideos]               = useState<UGCVideo[]>([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)
  const [search, setSearch]               = useState('')
  const [statusFilter, setStatusFilter]   = useState<VideoStatus | 'all'>('all')
  const [providerFilter, setProviderFilter] = useState<VideoProvider | 'all'>('all')
  const [campaignFilter, setCampaignFilter] = useState<string>('all')
  const [previewVideo, setPreviewVideo]   = useState<UGCVideo | null>(null)
  const [retryLoading, setRetryLoading]   = useState<number | null>(null)

  const campaigns = Array.from(new Set(videos.map(v => v.campaignName))).sort()

  const fetchVideos = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/ugc/videos')
      const rawList: RawUGCVideo[] = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data)
          ? data
          : []
      setVideos(rawList.map(normalizeVideo))
    } catch (err: unknown) {
      devError('[UGCVideoStudio] fetch error:', err)
      setError('No se pudieron cargar los videos. Verifica tu conexion.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchVideos() }, [fetchVideos])

  const handleRetry = async (id: number) => {
    setRetryLoading(id)
    try {
      await api.post(`/ugc/videos/${id}/retry`)
      await fetchVideos()
    } catch (err: unknown) {
      devError('[UGCVideoStudio] retry error:', err)
    } finally {
      setRetryLoading(null)
    }
  }

  const filtered = videos.filter(v => {
    if (statusFilter   !== 'all' && v.status   !== statusFilter)   return false
    if (providerFilter !== 'all' && v.provider !== providerFilter) return false
    if (campaignFilter !== 'all' && v.campaignName !== campaignFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!v.name.toLowerCase().includes(q) && !v.campaignName.toLowerCase().includes(q)) return false
    }
    return true
  })

  const stats = {
    total:     videos.length,
    completed: videos.filter(v => v.status === 'completed').length,
    producing: videos.filter(v => v.status === 'producing').length,
    failed:    videos.filter(v => v.status === 'failed').length,
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <FilmStrip className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Video Studio
              </h1>
              <p className="text-sm text-muted-foreground">
                Galeria y gestion de videos UGC generados por IA
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Actualizar"
            className="text-muted-foreground"
            onClick={fetchVideos}
            disabled={loading}
          >
            <ArrowClockwise className="size-5" aria-hidden />
          </Button>
        </div>

        {/* ── Stats rápidas ── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Total" value={String(stats.total)} />
          <StatTile label="Completados" value={String(stats.completed)} tone="success" />
          <StatTile label="Produciendo" value={String(stats.producing)} tone="primary" />
          <StatTile label="Fallidos" value={String(stats.failed)} tone="destructive" />
        </div>

        {/* ── Error state ── */}
        {error && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
            <p className="text-sm text-destructive-text">{error}</p>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
              onClick={fetchVideos}
            >
              Reintentar
            </Button>
          </div>
        )}

        {/* ── Filtros ── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1 sm:flex-none">
            <MagnifyingGlass
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              placeholder="Buscar videos..."
              aria-label="Buscar videos"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>
          <Select value={statusFilter} onValueChange={v => setStatusFilter(v as VideoStatus | 'all')}>
            <SelectTrigger className="w-[150px]" aria-label="Filtrar por estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="queued">En Cola</SelectItem>
              <SelectItem value="producing">Produciendo</SelectItem>
              <SelectItem value="completed">Completado</SelectItem>
              <SelectItem value="failed">Fallido</SelectItem>
            </SelectContent>
          </Select>
          <Select value={providerFilter} onValueChange={v => setProviderFilter(v as VideoProvider | 'all')}>
            <SelectTrigger className="w-[150px]" aria-label="Filtrar por provider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los providers</SelectItem>
              <SelectItem value="heygen">HeyGen</SelectItem>
              <SelectItem value="kling">Kling AI</SelectItem>
              <SelectItem value="runway">Runway ML</SelectItem>
            </SelectContent>
          </Select>
          {campaigns.length > 0 && (
            <Select value={campaignFilter} onValueChange={v => setCampaignFilter(v)}>
              <SelectTrigger className="w-[170px]" aria-label="Filtrar por campaña">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las campanas</SelectItem>
                {campaigns.map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <span className="ml-auto self-center text-xs text-muted-foreground">
            {filtered.length} video{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="h-px w-full bg-border" />

        {/* ── Content ── */}
        {loading ? (
          <div className="flex justify-center py-16">
            <CircularProgress size="lg" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <FilmStrip className="size-16 text-muted-foreground" aria-hidden />
            <h2 className="text-xl font-semibold text-foreground">Sin videos</h2>
            <p className="max-w-[380px] text-sm text-muted-foreground">
              {videos.length === 0
                ? 'No hay videos generados aun. Crea una campana UGC para empezar a producir videos.'
                : 'No hay videos que coincidan con los filtros seleccionados.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map(video => (
              <VideoCard
                key={video.id}
                video={video}
                onPreview={v => setPreviewVideo(v)}
                onRetry={handleRetry}
                retryLoading={retryLoading}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Modal Preview ── */}
      <PreviewModal
        video={previewVideo}
        onClose={() => setPreviewVideo(null)}
      />
    </div>
  )
}
