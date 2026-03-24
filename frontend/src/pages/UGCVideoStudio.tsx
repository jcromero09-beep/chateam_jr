import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Sheet,
  Card,
  Chip,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  Select,
  Option,
  Input,
  Modal,
  ModalDialog,
  ModalClose,
  Stack,
  LinearProgress,
  AspectRatio,
} from '@mui/joy'
import {
  VideoLibrary as VideoLibraryIcon,
  Refresh,
  Search as SearchIcon,
  PlayCircle,
  Download,
  Replay,
  CheckCircle,
  RadioButtonUnchecked,
  ErrorOutline,
  Close,
} from '@mui/icons-material'
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
  assets: VideoAssets
  pipelineTimestamps: PipelineTimestamps
  createdAt: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PIPELINE_STAGES = ['Script', 'Avatar', 'Video', 'Compose', 'Review', 'Done']

const STATUS_CONFIG: Record<VideoStatus, {
  label: string
  color: 'neutral' | 'primary' | 'success' | 'danger'
  icon: React.ReactNode
}> = {
  queued:    { label: 'En Cola',      color: 'neutral',  icon: <RadioButtonUnchecked sx={{ fontSize: 12 }} /> },
  producing: { label: 'Produciendo',  color: 'primary',  icon: <CircularProgress size="sm" sx={{ '--CircularProgress-size': '12px' }} /> },
  completed: { label: 'Completado',   color: 'success',  icon: <CheckCircle sx={{ fontSize: 12 }} /> },
  failed:    { label: 'Fallido',      color: 'danger',   icon: <ErrorOutline sx={{ fontSize: 12 }} /> },
}

const PROVIDER_CONFIG: Record<VideoProvider, { label: string; color: string }> = {
  heygen: { label: 'HeyGen', color: '#1565C0' },
  kling:  { label: 'Kling',  color: '#2E7D32' },
  runway: { label: 'Runway', color: '#6A1B9A' },
}

const FORMAT_RATIO: Record<VideoFormat, number> = {
  '9:16':  9 / 16,
  '16:9':  16 / 9,
  '1:1':   1,
}

// ─── Pipeline Visual ──────────────────────────────────────────────────────────

function PipelineDots({ stage, compact = false }: { stage: number; compact?: boolean }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: compact ? 0.25 : 0.5 }}>
      {PIPELINE_STAGES.map((label, i) => (
        <Box key={label} sx={{ display: 'flex', alignItems: 'center' }}>
          {i < stage ? (
            <CheckCircle sx={{ fontSize: compact ? 10 : 14, color: 'success.500' }} />
          ) : i === stage ? (
            <Box
              sx={{
                width: compact ? 8 : 12,
                height: compact ? 8 : 12,
                borderRadius: '50%',
                bgcolor: 'primary.500',
                boxShadow: '0 0 0 2px',
                boxShadowColor: 'primary.100',
              }}
            />
          ) : (
            <Box
              sx={{
                width: compact ? 6 : 10,
                height: compact ? 6 : 10,
                borderRadius: '50%',
                bgcolor: 'neutral.200',
              }}
            />
          )}
          {!compact && i < PIPELINE_STAGES.length - 1 && (
            <Box sx={{ width: 8, height: 1, bgcolor: i < stage ? 'success.300' : 'neutral.200', mx: 0.25 }} />
          )}
        </Box>
      ))}
    </Box>
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
  const statusCfg   = STATUS_CONFIG[video.status]
  const provCfg     = PROVIDER_CONFIG[video.provider]
  const ratio       = FORMAT_RATIO[video.format]
  const isRetrying  = retryLoading === video.id

  const handleDownload = () => {
    const url = video.assets.composed ?? video.assets.raw ?? video.videoUrl
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = `${video.name}.mp4`
    a.click()
  }

  return (
    <Card variant="outlined" sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, overflow: 'hidden' }}>
      {/* Thumbnail con play overlay */}
      <AspectRatio
        ratio={ratio}
        sx={{
          borderRadius: 'sm',
          overflow: 'hidden',
          bgcolor: 'background.level2',
          cursor: video.status === 'completed' ? 'pointer' : 'default',
          '&:hover .play-overlay': { opacity: 1 },
          position: 'relative',
          maxHeight: 160,
        }}
        onClick={() => video.status === 'completed' && onPreview(video)}
      >
        <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
          {video.thumbnailUrl ? (
            <Box
              component="img"
              src={video.thumbnailUrl}
              alt={video.name}
              sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 0.5 }}>
              <VideoLibraryIcon sx={{ fontSize: 32, color: 'neutral.400' }} />
              <Typography level="body-xs" color="neutral">{video.format}</Typography>
            </Box>
          )}
          {video.status === 'completed' && (
            <Box
              className="play-overlay"
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'rgba(0,0,0,0.4)',
                opacity: 0,
                transition: 'opacity 0.2s',
                borderRadius: 'sm',
              }}
            >
              <PlayCircle sx={{ fontSize: 40, color: 'white' }} />
            </Box>
          )}
          {video.status === 'producing' && (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'rgba(0,0,0,0.3)',
              }}
            >
              <CircularProgress size="md" sx={{ color: 'white' }} />
            </Box>
          )}
        </Box>
      </AspectRatio>

      {/* Nombre */}
      <Typography level="body-sm" fontWeight="lg" noWrap title={video.name}>
        {video.name}
      </Typography>

      {/* Chips */}
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        <Chip size="sm" variant="soft" color="neutral" sx={{ fontSize: 10 }}>
          {video.campaignName}
        </Chip>
        <Chip
          size="sm"
          variant="soft"
          sx={{ fontSize: 10, bgcolor: `${provCfg.color}18`, color: provCfg.color }}
        >
          {provCfg.label}
        </Chip>
      </Box>

      {/* Pipeline dots */}
      <Box>
        <Typography level="body-xs" color="neutral" sx={{ mb: 0.5, fontSize: 9 }}>
          {PIPELINE_STAGES[Math.min(video.stage, PIPELINE_STAGES.length - 1)]}
        </Typography>
        <PipelineDots stage={video.stage} compact />
      </Box>

      {/* Status + duracion */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Chip size="sm" variant="soft" color={statusCfg.color} startDecorator={statusCfg.icon}>
          {statusCfg.label}
        </Chip>
        <Typography level="body-xs" color="neutral">{video.duration}s</Typography>
      </Box>

      {/* Creative Score */}
      {video.creativeScore !== null && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
            <Typography level="body-xs" color="neutral" sx={{ fontSize: 10 }}>Creative Score</Typography>
            <Typography level="body-xs" fontWeight="lg" sx={{ fontSize: 10 }}>{video.creativeScore}/100</Typography>
          </Box>
          <LinearProgress
            determinate
            value={video.creativeScore}
            color={video.creativeScore >= 70 ? 'success' : video.creativeScore >= 40 ? 'warning' : 'danger'}
            size="sm"
          />
        </Box>
      )}

      <Divider />

      {/* Acciones */}
      <Box sx={{ display: 'flex', gap: 0.75 }}>
        {video.status === 'completed' && (
          <>
            <Button
              size="sm"
              variant="soft"
              color="primary"
              startDecorator={<PlayCircle sx={{ fontSize: 14 }} />}
              onClick={() => onPreview(video)}
              sx={{ flex: 1 }}
            >
              Preview
            </Button>
            <IconButton size="sm" variant="outlined" color="neutral" onClick={handleDownload}>
              <Download sx={{ fontSize: 16 }} />
            </IconButton>
          </>
        )}
        {video.status === 'failed' && (
          <Button
            size="sm"
            variant="soft"
            color="danger"
            startDecorator={isRetrying ? <CircularProgress size="sm" /> : <Replay sx={{ fontSize: 14 }} />}
            onClick={() => onRetry(video.id)}
            disabled={isRetrying}
            fullWidth
          >
            Reintentar
          </Button>
        )}
        {video.status === 'producing' && (
          <Typography level="body-xs" color="neutral" sx={{ py: 0.5, textAlign: 'center', width: '100%' }}>
            Generando video...
          </Typography>
        )}
        {video.status === 'queued' && (
          <Typography level="body-xs" color="neutral" sx={{ py: 0.5, textAlign: 'center', width: '100%' }}>
            En cola de procesamiento
          </Typography>
        )}
      </Box>
    </Card>
  )
}

// ─── Modal Preview ─────────────────────────────────────────────────────────────

interface PreviewModalProps {
  video: UGCVideo | null
  onClose: () => void
}

function PreviewModal({ video, onClose }: PreviewModalProps) {
  if (!video) return null

  const provCfg = PROVIDER_CONFIG[video.provider]
  const videoSrc = video.assets.composed ?? video.assets.raw ?? video.videoUrl

  const timestampItems = [
    { label: 'Script generado', ts: video.pipelineTimestamps.script },
    { label: 'Avatar creado',   ts: video.pipelineTimestamps.avatar },
    { label: 'Video renderizado', ts: video.pipelineTimestamps.video },
    { label: 'Composicion',     ts: video.pipelineTimestamps.compose },
    { label: 'Revision',        ts: video.pipelineTimestamps.review },
    { label: 'Completado',      ts: video.pipelineTimestamps.done },
  ]

  return (
    <Modal open={!!video} onClose={onClose}>
      <ModalDialog
        sx={{
          width: 700,
          maxWidth: '95vw',
          maxHeight: '90vh',
          overflow: 'auto',
          p: 0,
        }}
      >
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <VideoLibraryIcon sx={{ fontSize: 20, color: 'primary.500' }} />
            <Typography level="title-md">{video.name}</Typography>
          </Box>
          <IconButton size="sm" variant="plain" color="neutral" onClick={onClose}>
            <Close />
          </IconButton>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 0 }}>
          {/* Video player */}
          <Box sx={{ p: 2, bgcolor: 'background.level1', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280 }}>
            {videoSrc ? (
              <Box
                component="video"
                src={videoSrc}
                controls
                sx={{
                  width: '100%',
                  maxHeight: 360,
                  borderRadius: 'sm',
                  bgcolor: 'black',
                }}
              />
            ) : (
              <Box sx={{ textAlign: 'center' }}>
                <VideoLibraryIcon sx={{ fontSize: 48, color: 'neutral.400', mb: 1 }} />
                <Typography level="body-sm" color="neutral">Video no disponible</Typography>
              </Box>
            )}
          </Box>

          {/* Info panel */}
          <Box sx={{ p: 2 }}>
            {/* Chips info */}
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 2 }}>
              <Chip size="sm" variant="soft" color="neutral">{video.campaignName}</Chip>
              <Chip size="sm" variant="soft" sx={{ bgcolor: `${provCfg.color}18`, color: provCfg.color }}>
                {provCfg.label}
              </Chip>
              <Chip size="sm" variant="outlined" color="neutral">{video.format}</Chip>
              <Chip size="sm" variant="outlined" color="neutral">{video.duration}s</Chip>
            </Box>

            {/* Creative Score */}
            {video.creativeScore !== null && (
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography level="body-sm" fontWeight="md">Creative Score</Typography>
                  <Typography level="body-sm" fontWeight="lg" color={video.creativeScore >= 70 ? 'success' : 'warning'}>
                    {video.creativeScore}/100
                  </Typography>
                </Box>
                <LinearProgress
                  determinate
                  value={video.creativeScore}
                  color={video.creativeScore >= 70 ? 'success' : video.creativeScore >= 40 ? 'warning' : 'danger'}
                />
              </Box>
            )}

            {/* Script generado */}
            {video.scriptGenerated && (
              <Box sx={{ mb: 2 }}>
                <Typography level="body-xs" color="neutral" fontWeight="md" sx={{ mb: 0.5 }}>Script Generado</Typography>
                <Sheet variant="soft" color="neutral" sx={{ p: 1.25, borderRadius: 'sm', maxHeight: 100, overflowY: 'auto' }}>
                  <Typography level="body-xs" sx={{ fontStyle: 'italic', lineHeight: 1.6 }}>
                    {video.scriptGenerated}
                  </Typography>
                </Sheet>
              </Box>
            )}

            {/* Pipeline timestamps */}
            <Typography level="body-xs" color="neutral" fontWeight="md" sx={{ mb: 0.75 }}>Pipeline</Typography>
            <Stack spacing={0.5}>
              {PIPELINE_STAGES.map((stage, i) => {
                const item = timestampItems[i]
                const done = i < video.stage
                const active = i === video.stage
                return (
                  <Box
                    key={stage}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      p: 0.75,
                      borderRadius: 'sm',
                      bgcolor: done ? 'success.softBg' : active ? 'primary.softBg' : 'transparent',
                    }}
                  >
                    {done ? (
                      <CheckCircle sx={{ fontSize: 14, color: 'success.500', flexShrink: 0 }} />
                    ) : active ? (
                      <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: 'primary.500', flexShrink: 0 }} />
                    ) : (
                      <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: 'neutral.200', flexShrink: 0 }} />
                    )}
                    <Typography level="body-xs" color={done ? 'success' : active ? 'primary' : 'neutral'} sx={{ flex: 1 }}>
                      {stage}
                    </Typography>
                    {item.ts && (
                      <Typography level="body-xs" color="neutral" sx={{ fontSize: 9 }}>
                        {new Date(item.ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                      </Typography>
                    )}
                  </Box>
                )
              })}
            </Stack>

            {/* Assets */}
            {Object.values(video.assets).some(Boolean) && (
              <Box sx={{ mt: 2 }}>
                <Typography level="body-xs" color="neutral" fontWeight="md" sx={{ mb: 0.75 }}>Assets</Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {video.assets.raw      && <Chip size="sm" variant="outlined" color="neutral">Raw</Chip>}
                  {video.assets.composed && <Chip size="sm" variant="outlined" color="success">Composed</Chip>}
                  {video.assets.thumbnail && <Chip size="sm" variant="outlined" color="primary">Thumbnail</Chip>}
                  {video.assets.subtitles && <Chip size="sm" variant="outlined" color="warning">Subtitulos</Chip>}
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      </ModalDialog>
    </Modal>
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
      setVideos(data.data ?? data ?? [])
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
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      {/* ── Header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <VideoLibraryIcon sx={{ fontSize: 28, color: 'primary.500' }} />
          <Box>
            <Typography level="h3">Video Studio</Typography>
            <Typography level="body-sm" color="neutral">
              Galeria y gestion de videos UGC generados por IA
            </Typography>
          </Box>
        </Box>
        <IconButton variant="outlined" color="neutral" size="sm" onClick={fetchVideos} disabled={loading}>
          <Refresh />
        </IconButton>
      </Box>

      {/* ── Stats rápidas ── */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        {[
          { label: 'Total',       value: stats.total,     color: 'neutral'  as const },
          { label: 'Completados', value: stats.completed, color: 'success'  as const },
          { label: 'Produciendo', value: stats.producing, color: 'primary'  as const },
          { label: 'Fallidos',    value: stats.failed,    color: 'danger'   as const },
        ].map(item => (
          <Card key={item.label} variant="soft" color={item.color} sx={{ flex: 1, minWidth: 110, py: 1.25, px: 1.75 }}>
            <Typography level="h3" fontWeight={700}>{item.value}</Typography>
            <Typography level="body-xs" sx={{ opacity: 0.8 }}>{item.label}</Typography>
          </Card>
        ))}
      </Box>

      {/* ── Error state ── */}
      {error && (
        <Sheet variant="soft" color="danger" sx={{ p: 2, borderRadius: 'md', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography level="body-sm" color="danger">{error}</Typography>
            <Button size="sm" variant="plain" color="danger" onClick={fetchVideos}>Reintentar</Button>
          </Box>
        </Sheet>
      )}

      {/* ── Filtros ── */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
        <Input
          size="sm"
          placeholder="Buscar videos..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          startDecorator={<SearchIcon sx={{ fontSize: 16 }} />}
          sx={{ minWidth: 200 }}
        />
        <Select
          size="sm"
          value={statusFilter}
          onChange={(_, v) => v && setStatusFilter(v as VideoStatus | 'all')}
          sx={{ minWidth: 150 }}
        >
          <Option value="all">Todos los estados</Option>
          <Option value="queued">En Cola</Option>
          <Option value="producing">Produciendo</Option>
          <Option value="completed">Completado</Option>
          <Option value="failed">Fallido</Option>
        </Select>
        <Select
          size="sm"
          value={providerFilter}
          onChange={(_, v) => v && setProviderFilter(v as VideoProvider | 'all')}
          sx={{ minWidth: 130 }}
        >
          <Option value="all">Todos los providers</Option>
          <Option value="heygen">HeyGen</Option>
          <Option value="kling">Kling AI</Option>
          <Option value="runway">Runway ML</Option>
        </Select>
        {campaigns.length > 0 && (
          <Select
            size="sm"
            value={campaignFilter}
            onChange={(_, v) => v && setCampaignFilter(v)}
            sx={{ minWidth: 150 }}
          >
            <Option value="all">Todas las campanas</Option>
            {campaigns.map(name => (
              <Option key={name} value={name}>{name}</Option>
            ))}
          </Select>
        )}
        <Typography level="body-xs" color="neutral" sx={{ ml: 'auto', alignSelf: 'center' }}>
          {filtered.length} video{filtered.length !== 1 ? 's' : ''}
        </Typography>
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* ── Content ── */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size="lg" />
        </Box>
      ) : filtered.length === 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 10, gap: 2 }}>
          <VideoLibraryIcon sx={{ fontSize: 64, color: 'text.tertiary' }} />
          <Typography level="h3" textAlign="center">Sin videos</Typography>
          <Typography level="body-md" color="neutral" textAlign="center" sx={{ maxWidth: 380 }}>
            {videos.length === 0
              ? 'No hay videos generados aun. Crea una campana UGC para empezar a producir videos.'
              : 'No hay videos que coincidan con los filtros seleccionados.'}
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
              lg: 'repeat(4, 1fr)',
              xl: 'repeat(5, 1fr)',
            },
            gap: 2,
          }}
        >
          {filtered.map(video => (
            <VideoCard
              key={video.id}
              video={video}
              onPreview={v => setPreviewVideo(v)}
              onRetry={handleRetry}
              retryLoading={retryLoading}
            />
          ))}
        </Box>
      )}

      {/* ── Modal Preview ── */}
      <PreviewModal
        video={previewVideo}
        onClose={() => setPreviewVideo(null)}
      />
    </Box>
  )
}
