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
  Textarea,
  Stack,
  Checkbox,
  FormControl,
  FormLabel,
  LinearProgress,
} from '@mui/joy'
import {
  Add as AddIcon,
  Refresh,
  Search as SearchIcon,
  Campaign as CampaignIcon,
  PlayArrow,
  Pause,
  Visibility,
  VideoLibrary,
  PublishedWithChanges,
  BarChart,
  AttachMoney as MoneyIcon,
  CheckCircle,
  RadioButtonUnchecked,
} from '@mui/icons-material'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devError = (...args: unknown[]) => { if (isDev) console.error(...args) }

// ─── Types ────────────────────────────────────────────────────────────────────

type CampaignStatus = 'draft' | 'briefing' | 'producing' | 'active' | 'paused' | 'completed'
type VideoProvider = 'heygen' | 'kling' | 'runway'
type VideoFormat = '9:16' | '16:9' | '1:1'
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
  videosCount: number
  videoLanguage: VideoLanguage
  platforms: SocialPlatform[]
  autoPublish: boolean
  abTesting: boolean
  budget: number
  stats: CampaignStats
  createdAt: string
}

interface WizardForm {
  // Paso 1
  name: string
  description: string
  product: string
  tone: ToneType | ''
  targetAudience: string
  callToAction: string
  // Paso 2
  videoProvider: VideoProvider | ''
  videoFormat: VideoFormat | ''
  videoDuration: string
  videosCount: string
  videoLanguage: VideoLanguage | ''
  // Paso 3
  platforms: SocialPlatform[]
  autoPublish: boolean
  abTesting: boolean
  budget: string
}

const EMPTY_FORM: WizardForm = {
  name: '',
  description: '',
  product: '',
  tone: '',
  targetAudience: '',
  callToAction: '',
  videoProvider: '',
  videoFormat: '',
  videoDuration: '30',
  videosCount: '3',
  videoLanguage: '',
  platforms: [],
  autoPublish: false,
  abTesting: false,
  budget: '',
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<CampaignStatus, {
  label: string
  color: 'neutral' | 'warning' | 'primary' | 'success' | 'danger' | 'secondary'
}> = {
  draft:      { label: 'Borrador',    color: 'neutral'  },
  briefing:   { label: 'Briefing',    color: 'warning'  },
  producing:  { label: 'Produciendo', color: 'primary'  },
  active:     { label: 'Activa',      color: 'success'  },
  paused:     { label: 'Pausada',     color: 'warning'  },
  completed:  { label: 'Completada',  color: 'secondary' as 'neutral' },
}

const PROVIDER_COLORS: Record<VideoProvider, string> = {
  heygen: '#1565C0',
  kling:  '#2E7D32',
  runway: '#6A1B9A',
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

// ─── Stats Strip ──────────────────────────────────────────────────────────────

interface GlobalStats {
  active: number
  videosProduced: number
  postsPublished: number
  totalEngagement: number
}

function StatsStrip({ stats, loading }: { stats: GlobalStats | null; loading: boolean }) {
  const items = [
    { label: 'Campanas Activas',    value: stats ? String(stats.active) : '—',                      color: 'success'  as const },
    { label: 'Videos Producidos',   value: stats ? String(stats.videosProduced) : '—',               color: 'primary'  as const },
    { label: 'Posts Publicados',    value: stats ? String(stats.postsPublished) : '—',               color: 'warning'  as const },
    { label: 'Engagement Total',    value: stats ? formatNumber(stats.totalEngagement) : '—',        color: 'neutral'  as const },
  ]
  return (
    <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
      {items.map(item => (
        <Card key={item.label} variant="soft" color={item.color} sx={{ flex: 1, minWidth: 140, py: 1.5, px: 2 }}>
          {loading ? (
            <CircularProgress size="sm" />
          ) : (
            <Typography level="h3" fontWeight={700}>{item.value}</Typography>
          )}
          <Typography level="body-xs" sx={{ opacity: 0.8 }}>{item.label}</Typography>
        </Card>
      ))}
    </Box>
  )
}

// ─── Campaign Card ─────────────────────────────────────────────────────────────

interface CampaignCardProps {
  campaign: Campaign
  onLaunch: (id: number) => void
  onPause: (id: number) => void
  onView: (campaign: Campaign) => void
  actionLoading: number | null
}

function CampaignCard({ campaign, onLaunch, onPause, onView, actionLoading }: CampaignCardProps) {
  const statusCfg = STATUS_CONFIG[campaign.status]
  const isLoading = actionLoading === campaign.id

  return (
    <Card variant="outlined" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography level="title-sm" fontWeight="lg" noWrap>{campaign.name}</Typography>
          <Typography level="body-xs" color="neutral" sx={{ mt: 0.25 }}>{campaign.product}</Typography>
        </Box>
        <Chip
          size="sm"
          variant="soft"
          color={statusCfg.color === 'secondary' ? 'neutral' : statusCfg.color}
          sx={statusCfg.color === 'secondary' ? { bgcolor: '#EDE7F6', color: '#6A1B9A' } : {}}
        >
          {statusCfg.label}
        </Chip>
      </Box>

      {/* Brief */}
      <Typography level="body-xs" color="neutral" sx={{ lineHeight: 1.5 }}>
        {truncate(campaign.brief, 100)}
      </Typography>

      <Divider />

      {/* Mini Stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.5 }}>
        {[
          { label: 'Videos',      value: campaign.stats.videos },
          { label: 'Posts',       value: campaign.stats.posts },
          { label: 'Vistas',      value: formatNumber(campaign.stats.views) },
          { label: 'Engagement',  value: formatNumber(campaign.stats.engagement) },
        ].map(stat => (
          <Box key={stat.label} sx={{ textAlign: 'center', p: 0.75, bgcolor: 'background.level1', borderRadius: 'sm' }}>
            <Typography level="body-xs" fontWeight="lg">{stat.value}</Typography>
            <Typography level="body-xs" color="neutral" sx={{ fontSize: 9 }}>{stat.label}</Typography>
          </Box>
        ))}
      </Box>

      {/* Budget + fecha */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <MoneyIcon sx={{ fontSize: 14, color: 'success.500' }} />
          <Typography level="body-xs" fontWeight="lg">${campaign.budget.toFixed(0)}</Typography>
        </Box>
        <Typography level="body-xs" color="neutral">
          {new Date(campaign.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
        </Typography>
      </Box>

      <Divider />

      {/* Acciones */}
      <Box sx={{ display: 'flex', gap: 1 }}>
        {campaign.status === 'draft' && (
          <Button
            size="sm"
            variant="soft"
            color="success"
            startDecorator={isLoading ? <CircularProgress size="sm" /> : <PlayArrow sx={{ fontSize: 14 }} />}
            onClick={() => onLaunch(campaign.id)}
            disabled={isLoading}
            sx={{ flex: 1 }}
          >
            Lanzar
          </Button>
        )}
        {campaign.status === 'active' && (
          <Button
            size="sm"
            variant="soft"
            color="warning"
            startDecorator={isLoading ? <CircularProgress size="sm" /> : <Pause sx={{ fontSize: 14 }} />}
            onClick={() => onPause(campaign.id)}
            disabled={isLoading}
            sx={{ flex: 1 }}
          >
            Pausar
          </Button>
        )}
        {!['draft', 'active'].includes(campaign.status) && (
          <Box sx={{ flex: 1 }} />
        )}
        <Button
          size="sm"
          variant="outlined"
          color="neutral"
          startDecorator={<Visibility sx={{ fontSize: 14 }} />}
          onClick={() => onView(campaign)}
        >
          Detalle
        </Button>
      </Box>
    </Card>
  )
}

// ─── Wizard Nueva Campana ─────────────────────────────────────────────────────

interface WizardProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

function NewCampaignWizard({ open, onClose, onSuccess }: WizardProps) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<WizardForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalSteps = 3

  const resetAndClose = () => {
    if (saving) return
    setStep(1)
    setForm(EMPTY_FORM)
    setError(null)
    onClose()
  }

  const togglePlatform = (p: SocialPlatform) => {
    setForm(prev => ({
      ...prev,
      platforms: prev.platforms.includes(p)
        ? prev.platforms.filter(x => x !== p)
        : [...prev.platforms, p],
    }))
  }

  const canGoNext = (): boolean => {
    if (step === 1) return !!(form.name && form.description && form.product && form.tone && form.targetAudience && form.callToAction)
    if (step === 2) return !!(form.videoProvider && form.videoFormat && form.videoDuration && form.videosCount && form.videoLanguage)
    return true
  }

  const handleSubmit = async () => {
    if (!form.budget) { setError('Ingresa el presupuesto.'); return }
    setSaving(true)
    setError(null)
    try {
      await api.post('/ugc/campaigns', {
        name: form.name,
        brief: form.description,
        product: form.product,
        tone: form.tone,
        targetAudience: form.targetAudience,
        callToAction: form.callToAction,
        videoProvider: form.videoProvider,
        videoFormat: form.videoFormat,
        videoDuration: Number(form.videoDuration),
        videosCount: Number(form.videosCount),
        videoLanguage: form.videoLanguage,
        platforms: form.platforms,
        autoPublish: form.autoPublish,
        abTesting: form.abTesting,
        budget: Number(form.budget),
      })
      onSuccess()
      resetAndClose()
    } catch (err: unknown) {
      devError('[NewCampaignWizard] submit error:', err)
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'No se pudo crear la campana. Intenta nuevamente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose}>
      <ModalDialog sx={{ width: 520, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto' }}>
        <ModalClose disabled={saving} />
        <Typography level="h4">Nueva Campana UGC</Typography>

        {/* Progress indicator */}
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
            {['Brief', 'Video', 'Publicacion'].map((label, i) => (
              <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box
                  sx={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: i + 1 < step ? 'success.500' : i + 1 === step ? 'primary.500' : 'neutral.200',
                    color: i + 1 <= step ? 'white' : 'neutral.500',
                    fontSize: 11,
                    fontWeight: 700,
                    transition: 'background-color 0.2s',
                  }}
                >
                  {i + 1 < step ? <CheckCircle sx={{ fontSize: 14 }} /> : i + 1}
                </Box>
                <Typography level="body-xs" color={i + 1 === step ? 'primary' : 'neutral'} fontWeight={i + 1 === step ? 'lg' : 'md'}>
                  {label}
                </Typography>
              </Box>
            ))}
          </Box>
          <LinearProgress determinate value={(step / totalSteps) * 100} size="sm" />
        </Box>

        {error && (
          <Sheet variant="soft" color="danger" sx={{ p: 1.5, borderRadius: 'sm', mb: 1.5 }}>
            <Typography level="body-sm" color="danger">{error}</Typography>
          </Sheet>
        )}

        {/* ── Paso 1: Brief ── */}
        {step === 1 && (
          <Stack spacing={1.5}>
            <FormControl required>
              <FormLabel>Nombre de la campana</FormLabel>
              <Input
                placeholder="Ej: Lanzamiento Verano 2025"
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </FormControl>
            <FormControl required>
              <FormLabel>Descripcion del producto</FormLabel>
              <Textarea
                placeholder="Describe el producto o servicio que se va a promocionar..."
                minRows={3}
                value={form.description}
                onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
              />
            </FormControl>
            <FormControl required>
              <FormLabel>Producto / Marca</FormLabel>
              <Input
                placeholder="Ej: Zapatillas RunPro"
                value={form.product}
                onChange={e => setForm(prev => ({ ...prev, product: e.target.value }))}
              />
            </FormControl>
            <FormControl required>
              <FormLabel>Tono de comunicacion</FormLabel>
              <Select
                placeholder="Selecciona el tono..."
                value={form.tone || null}
                onChange={(_, v) => v && setForm(prev => ({ ...prev, tone: v as ToneType }))}
              >
                <Option value="profesional">Profesional</Option>
                <Option value="casual">Casual</Option>
                <Option value="divertido">Divertido</Option>
                <Option value="inspiracional">Inspiracional</Option>
              </Select>
            </FormControl>
            <FormControl required>
              <FormLabel>Publico objetivo</FormLabel>
              <Input
                placeholder="Ej: Jovenes de 18-30 anos interesados en fitness"
                value={form.targetAudience}
                onChange={e => setForm(prev => ({ ...prev, targetAudience: e.target.value }))}
              />
            </FormControl>
            <FormControl required>
              <FormLabel>Call to Action</FormLabel>
              <Input
                placeholder="Ej: Visita nuestra tienda, Descuento del 20%"
                value={form.callToAction}
                onChange={e => setForm(prev => ({ ...prev, callToAction: e.target.value }))}
              />
            </FormControl>
          </Stack>
        )}

        {/* ── Paso 2: Configuracion Video ── */}
        {step === 2 && (
          <Stack spacing={1.5}>
            <FormControl required>
              <FormLabel>Provider de video</FormLabel>
              <Select
                placeholder="Selecciona el provider..."
                value={form.videoProvider || null}
                onChange={(_, v) => v && setForm(prev => ({ ...prev, videoProvider: v as VideoProvider }))}
              >
                <Option value="heygen">HeyGen — Avatares IA</Option>
                <Option value="kling">Kling AI — Video generativo</Option>
                <Option value="runway">Runway ML — Cinematic AI</Option>
              </Select>
            </FormControl>
            <FormControl required>
              <FormLabel>Formato de video</FormLabel>
              <Select
                placeholder="Selecciona el formato..."
                value={form.videoFormat || null}
                onChange={(_, v) => v && setForm(prev => ({ ...prev, videoFormat: v as VideoFormat }))}
              >
                <Option value="9:16">9:16 — Vertical (Reels, TikTok, Stories)</Option>
                <Option value="16:9">16:9 — Horizontal (YouTube, Facebook)</Option>
                <Option value="1:1">1:1 — Cuadrado (Instagram feed)</Option>
              </Select>
            </FormControl>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <FormControl required>
                <FormLabel>Duracion (segundos)</FormLabel>
                <Input
                  type="number"
                  placeholder="30"
                  value={form.videoDuration}
                  onChange={e => setForm(prev => ({ ...prev, videoDuration: e.target.value }))}
                  slotProps={{ input: { min: 5, max: 300 } }}
                />
              </FormControl>
              <FormControl required>
                <FormLabel>Cantidad de videos</FormLabel>
                <Input
                  type="number"
                  placeholder="3"
                  value={form.videosCount}
                  onChange={e => setForm(prev => ({ ...prev, videosCount: e.target.value }))}
                  slotProps={{ input: { min: 1, max: 50 } }}
                />
              </FormControl>
            </Box>
            <FormControl required>
              <FormLabel>Idioma del script</FormLabel>
              <Select
                placeholder="Selecciona el idioma..."
                value={form.videoLanguage || null}
                onChange={(_, v) => v && setForm(prev => ({ ...prev, videoLanguage: v as VideoLanguage }))}
              >
                <Option value="es">Espanol</Option>
                <Option value="en">Ingles</Option>
                <Option value="pt">Portugues</Option>
                <Option value="fr">Frances</Option>
                <Option value="de">Aleman</Option>
              </Select>
            </FormControl>
          </Stack>
        )}

        {/* ── Paso 3: Publicacion ── */}
        {step === 3 && (
          <Stack spacing={1.5}>
            <FormControl>
              <FormLabel>Plataformas de publicacion</FormLabel>
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.5 }}>
                {(Object.entries(PLATFORM_LABELS) as [SocialPlatform, string][]).map(([key, label]) => (
                  <Chip
                    key={key}
                    size="sm"
                    variant={form.platforms.includes(key) ? 'solid' : 'outlined'}
                    color={form.platforms.includes(key) ? 'primary' : 'neutral'}
                    onClick={() => togglePlatform(key)}
                    sx={{ cursor: 'pointer' }}
                  >
                    {label}
                  </Chip>
                ))}
              </Box>
            </FormControl>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Checkbox
                  checked={form.autoPublish}
                  onChange={e => setForm(prev => ({ ...prev, autoPublish: e.target.checked }))}
                />
                <Box>
                  <Typography level="body-sm" fontWeight="md">Auto-publicar al completar</Typography>
                  <Typography level="body-xs" color="neutral">Los videos se publican automaticamente cuando el pipeline termina</Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Checkbox
                  checked={form.abTesting}
                  onChange={e => setForm(prev => ({ ...prev, abTesting: e.target.checked }))}
                />
                <Box>
                  <Typography level="body-sm" fontWeight="md">Habilitar A/B Testing</Typography>
                  <Typography level="body-xs" color="neutral">Genera variantes del script para optimizar el engagement</Typography>
                </Box>
              </Box>
            </Box>
            <FormControl required>
              <FormLabel>Presupuesto total ($)</FormLabel>
              <Input
                type="number"
                placeholder="500"
                value={form.budget}
                onChange={e => setForm(prev => ({ ...prev, budget: e.target.value }))}
                startDecorator={<MoneyIcon sx={{ fontSize: 16 }} />}
                slotProps={{ input: { min: 0 } }}
              />
            </FormControl>
          </Stack>
        )}

        {/* Navegacion del wizard */}
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'space-between', mt: 2 }}>
          <Button
            variant="outlined"
            color="neutral"
            onClick={() => step > 1 ? setStep(s => s - 1) : resetAndClose()}
            disabled={saving}
          >
            {step === 1 ? 'Cancelar' : 'Atras'}
          </Button>
          {step < totalSteps ? (
            <Button
              onClick={() => setStep(s => s + 1)}
              disabled={!canGoNext()}
            >
              Siguiente
            </Button>
          ) : (
            <Button
              color="success"
              onClick={handleSubmit}
              loading={saving}
              startDecorator={<CampaignIcon sx={{ fontSize: 16 }} />}
            >
              Crear Campana
            </Button>
          )}
        </Box>
      </ModalDialog>
    </Modal>
  )
}

// ─── Modal Detalle Campana ────────────────────────────────────────────────────

const PIPELINE_STAGES = ['Script', 'Avatar', 'Video', 'Compose', 'Review', 'Done']

interface VideoItem {
  id: number
  name: string
  stage: number
  status: string
  duration: number
  creativeScore: number | null
}

interface CampaignDetail {
  campaign: Campaign
  videos: VideoItem[]
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
      .then(res => setDetail(res.data?.data ?? res.data))
      .catch(err => devError('[DetailModal] fetch:', err))
      .finally(() => setLoading(false))
  }, [campaign])

  if (!campaign) return null

  const statusCfg = STATUS_CONFIG[campaign.status]

  return (
    <Modal open={!!campaign} onClose={onClose}>
      <ModalDialog sx={{ width: 640, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto' }}>
        <ModalClose />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
          <CampaignIcon sx={{ fontSize: 22, color: 'primary.500' }} />
          <Typography level="h4">{campaign.name}</Typography>
          <Chip
            size="sm"
            variant="soft"
            color={statusCfg.color === 'secondary' ? 'neutral' : statusCfg.color}
          >
            {statusCfg.label}
          </Chip>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Info general */}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 2.5 }}>
          {[
            { label: 'Producto',    value: campaign.product },
            { label: 'Tono',        value: campaign.tone },
            { label: 'Provider',    value: campaign.videoProvider.toUpperCase() },
            { label: 'Formato',     value: campaign.videoFormat },
            { label: 'Duracion',    value: `${campaign.videoDuration}s` },
            { label: 'Presupuesto', value: `$${campaign.budget}` },
            { label: 'Plataformas', value: campaign.platforms.map(p => PLATFORM_LABELS[p]).join(', ') || '—' },
            { label: 'Auto-publicar', value: campaign.autoPublish ? 'Si' : 'No' },
          ].map(item => (
            <Box key={item.label} sx={{ p: 1.25, bgcolor: 'background.level1', borderRadius: 'sm' }}>
              <Typography level="body-xs" color="neutral">{item.label}</Typography>
              <Typography level="body-sm" fontWeight="md">{item.value}</Typography>
            </Box>
          ))}
        </Box>

        {/* Brief */}
        <Typography level="body-xs" color="neutral" fontWeight="md" sx={{ mb: 0.75 }}>Brief / Descripcion</Typography>
        <Sheet variant="soft" color="neutral" sx={{ p: 1.5, borderRadius: 'sm', mb: 2.5 }}>
          <Typography level="body-sm">{campaign.brief}</Typography>
        </Sheet>

        {/* Stats */}
        <Typography level="title-sm" sx={{ mb: 1 }}>Estadisticas</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, mb: 2.5 }}>
          {[
            { label: 'Videos',     value: campaign.stats.videos,                  icon: <VideoLibrary sx={{ fontSize: 16 }} /> },
            { label: 'Posts',      value: campaign.stats.posts,                   icon: <PublishedWithChanges sx={{ fontSize: 16 }} /> },
            { label: 'Vistas',     value: formatNumber(campaign.stats.views),     icon: <BarChart sx={{ fontSize: 16 }} /> },
            { label: 'Engagement', value: formatNumber(campaign.stats.engagement), icon: <BarChart sx={{ fontSize: 16 }} /> },
          ].map(stat => (
            <Card key={stat.label} variant="soft" color="primary" sx={{ textAlign: 'center', p: 1.5 }}>
              <Box sx={{ color: 'primary.500', mb: 0.25 }}>{stat.icon}</Box>
              <Typography level="h4" fontWeight={700}>{stat.value}</Typography>
              <Typography level="body-xs">{stat.label}</Typography>
            </Card>
          ))}
        </Box>

        {/* Videos pipeline */}
        <Typography level="title-sm" sx={{ mb: 1 }}>Videos en Pipeline</Typography>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size="sm" />
          </Box>
        ) : !detail || detail.videos.length === 0 ? (
          <Sheet variant="soft" color="neutral" sx={{ p: 2, borderRadius: 'sm', textAlign: 'center' }}>
            <Typography level="body-sm" color="neutral">No hay videos generados aun</Typography>
          </Sheet>
        ) : (
          <Stack spacing={1}>
            {detail.videos.map(video => (
              <Sheet key={video.id} variant="outlined" sx={{ p: 1.5, borderRadius: 'sm' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Typography level="body-sm" fontWeight="md">{video.name}</Typography>
                  <Chip size="sm" variant="soft" color="neutral">{video.duration}s</Chip>
                </Box>
                {/* Pipeline dots */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {PIPELINE_STAGES.map((stage, i) => (
                    <Box key={stage} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {i < video.stage ? (
                        <CheckCircle sx={{ fontSize: 14, color: 'success.500' }} />
                      ) : i === video.stage ? (
                        <RadioButtonUnchecked sx={{ fontSize: 14, color: 'primary.500' }} />
                      ) : (
                        <RadioButtonUnchecked sx={{ fontSize: 14, color: 'neutral.300' }} />
                      )}
                      <Typography level="body-xs" color={i <= video.stage ? 'primary' : 'neutral'} sx={{ fontSize: 9 }}>
                        {stage}
                      </Typography>
                      {i < PIPELINE_STAGES.length - 1 && (
                        <Box sx={{ width: 12, height: 1, bgcolor: i < video.stage ? 'success.400' : 'neutral.200' }} />
                      )}
                    </Box>
                  ))}
                </Box>
                {video.creativeScore !== null && (
                  <Box sx={{ mt: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
                      <Typography level="body-xs" color="neutral">Creative Score</Typography>
                      <Typography level="body-xs" fontWeight="lg">{video.creativeScore}/100</Typography>
                    </Box>
                    <LinearProgress
                      determinate
                      value={video.creativeScore}
                      color={video.creativeScore >= 70 ? 'success' : video.creativeScore >= 40 ? 'warning' : 'danger'}
                      size="sm"
                    />
                  </Box>
                )}
              </Sheet>
            ))}
          </Stack>
        )}
      </ModalDialog>
    </Modal>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UGCCampaigns() {
  const [campaigns, setCampaigns]       = useState<Campaign[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | 'all'>('all')
  const [showWizard, setShowWizard]     = useState(false)
  const [detailCampaign, setDetailCampaign] = useState<Campaign | null>(null)
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  const globalStats: GlobalStats | null = campaigns.length > 0 ? {
    active:          campaigns.filter(c => c.status === 'active').length,
    videosProduced:  campaigns.reduce((acc, c) => acc + c.stats.videos, 0),
    postsPublished:  campaigns.reduce((acc, c) => acc + c.stats.posts, 0),
    totalEngagement: campaigns.reduce((acc, c) => acc + c.stats.engagement, 0),
  } : null

  const fetchCampaigns = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/ugc/campaigns')
      setCampaigns(data.data ?? data ?? [])
    } catch (err: unknown) {
      devError('[UGCCampaigns] fetch error:', err)
      setError('No se pudieron cargar las campanas. Verifica tu conexion.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchCampaigns() }, [fetchCampaigns])

  const handleLaunch = async (id: number) => {
    setActionLoading(id)
    try {
      await api.post(`/ugc/campaigns/${id}/launch`)
      await fetchCampaigns()
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
      await fetchCampaigns()
    } catch (err: unknown) {
      devError('[UGCCampaigns] pause error:', err)
    } finally {
      setActionLoading(null)
    }
  }

  const filtered = campaigns.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!c.name.toLowerCase().includes(q) && !c.product.toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
      {/* ── Header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CampaignIcon sx={{ fontSize: 28, color: 'primary.500' }} />
          <Box>
            <Typography level="h3">Campanas UGC</Typography>
            <Typography level="body-sm" color="neutral">
              Gestiona y lanza campanas de contenido generado por IA
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton variant="outlined" color="neutral" size="sm" onClick={fetchCampaigns} disabled={loading}>
            <Refresh />
          </IconButton>
          <Button
            color="primary"
            startDecorator={<AddIcon />}
            onClick={() => setShowWizard(true)}
          >
            Nueva Campana
          </Button>
        </Box>
      </Box>

      {/* ── Stats ── */}
      <StatsStrip stats={globalStats} loading={loading} />

      {/* ── Error state ── */}
      {error && (
        <Sheet variant="soft" color="danger" sx={{ p: 2, borderRadius: 'md', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography level="body-sm" color="danger">{error}</Typography>
            <Button size="sm" variant="plain" color="danger" onClick={fetchCampaigns}>Reintentar</Button>
          </Box>
        </Sheet>
      )}

      {/* ── Filtros ── */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
        <Input
          size="sm"
          placeholder="Buscar por nombre o producto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          startDecorator={<SearchIcon sx={{ fontSize: 16 }} />}
          sx={{ minWidth: 220 }}
        />
        <Select
          size="sm"
          value={statusFilter}
          onChange={(_, v) => v && setStatusFilter(v as CampaignStatus | 'all')}
          sx={{ minWidth: 160 }}
        >
          <Option value="all">Todos los estados</Option>
          <Option value="draft">Borrador</Option>
          <Option value="briefing">Briefing</Option>
          <Option value="producing">Produciendo</Option>
          <Option value="active">Activa</Option>
          <Option value="paused">Pausada</Option>
          <Option value="completed">Completada</Option>
        </Select>
        <Typography level="body-xs" color="neutral" sx={{ ml: 'auto', alignSelf: 'center' }}>
          {filtered.length} campana{filtered.length !== 1 ? 's' : ''}
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
          <CampaignIcon sx={{ fontSize: 64, color: 'text.tertiary' }} />
          <Typography level="h3" textAlign="center">Sin campanas</Typography>
          <Typography level="body-md" color="neutral" textAlign="center" sx={{ maxWidth: 380 }}>
            {campaigns.length === 0
              ? 'No hay campanas UGC creadas. Crea tu primera campana de contenido generado por IA.'
              : 'No hay campanas que coincidan con los filtros seleccionados.'}
          </Typography>
          {campaigns.length === 0 && (
            <Button startDecorator={<AddIcon />} onClick={() => setShowWizard(true)}>
              Crear Primera Campana
            </Button>
          )}
        </Box>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              lg: 'repeat(3, 1fr)',
              xl: 'repeat(4, 1fr)',
            },
            gap: 2,
          }}
        >
          {filtered.map(campaign => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onLaunch={handleLaunch}
              onPause={handlePause}
              onView={c => setDetailCampaign(c)}
              actionLoading={actionLoading}
            />
          ))}
        </Box>
      )}

      {/* ── Modales ── */}
      <NewCampaignWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onSuccess={fetchCampaigns}
      />
      <DetailModal
        campaign={detailCampaign}
        onClose={() => setDetailCampaign(null)}
      />
    </Box>
  )
}
