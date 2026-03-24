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
  Stack,
} from '@mui/joy'
import {
  AutoFixHigh as OptimizeIcon,
  Refresh,
  PlayArrow as RunIcon,
  AccountBalance as BudgetIcon,
  EmojiObjects as LearningIcon,
  TrendingUp,
  TrendingDown,
  AccessTime as ClockIcon,
  Campaign as CampaignIcon,
  CheckCircle,
  Schedule as ScheduleIcon,
  Psychology as PsychologyIcon,
  FiberManualRecord as DotIcon,
} from '@mui/icons-material'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devError = (...args: unknown[]) => { if (isDev) console.error(...args) }

// ─── Types ────────────────────────────────────────────────────────────────────

type LearningType =
  | 'content_style'
  | 'posting_time'
  | 'audience_segment'
  | 'hook_pattern'
  | 'cta_pattern'
  | 'format'
  | 'hashtag'
  | 'tone'

type ImpactLevel = 'high' | 'medium' | 'low'
type LearningSource = 'feedback_loop' | 'manual' | 'ai_analysis'

interface Learning {
  id: number
  type: LearningType
  title: string
  description: string
  impact: ImpactLevel
  confidence: number
  recommendation: string
  applied: boolean
  appliedAt?: string
  source: LearningSource
  campaignId?: number
  campaignName?: string
  createdAt: string
}

interface OptimizedCampaign {
  id: number
  name: string
  autoOptimize: boolean
  lastCycleAt?: string
  nextCycleAt?: string
  totalCycles: number
}

interface MetricSnapshot {
  id: number
  date: string
  views: number
  likes: number
  comments: number
  engagementRate: number
  purchaseIntents: number
  roas: number
  prevViews?: number
  prevEngagementRate?: number
}

interface OptimizationStats {
  totalCycles: number
  learningsGenerated: number
  budgetOptimized: number
  avgEngagementImprovement: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LEARNING_TYPE_CONFIG: Record<LearningType, { label: string; emoji: string; color: 'primary' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  content_style:    { label: 'Estilo de Contenido',  emoji: 'CS', color: 'primary' },
  posting_time:     { label: 'Horario de Publicacion', emoji: 'HO', color: 'success' },
  audience_segment: { label: 'Segmento de Audiencia', emoji: 'AU', color: 'warning' },
  hook_pattern:     { label: 'Patron de Hook',        emoji: 'HP', color: 'danger' },
  cta_pattern:      { label: 'Patron CTA',            emoji: 'CT', color: 'neutral' },
  format:           { label: 'Formato',               emoji: 'FM', color: 'primary' },
  hashtag:          { label: 'Hashtag',               emoji: 'HT', color: 'success' },
  tone:             { label: 'Tono',                  emoji: 'TN', color: 'warning' },
}

const IMPACT_CONFIG: Record<ImpactLevel, {
  label: string
  color: 'danger' | 'warning' | 'success'
  dot: string
}> = {
  high:   { label: 'Alto',  color: 'danger',  dot: '#C41C1C' },
  medium: { label: 'Medio', color: 'warning', dot: '#9A5B13' },
  low:    { label: 'Bajo',  color: 'success', dot: '#1F7A1F' },
}

const SOURCE_LABELS: Record<LearningSource, string> = {
  feedback_loop: 'Feedback Loop',
  manual:        'Manual',
  ai_analysis:   'Analisis IA',
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function formatDateTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return dateStr
  }
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// ─── Stats Strip ──────────────────────────────────────────────────────────────

function StatsStrip({ stats, loading }: { stats: OptimizationStats | null; loading: boolean }) {
  const items = [
    { label: 'Ciclos Ejecutados',          value: stats ? String(stats.totalCycles) : '—',                           color: 'primary' as const },
    { label: 'Learnings Generados',        value: stats ? String(stats.learningsGenerated) : '—',                    color: 'success' as const },
    { label: 'Budget Optimizado',          value: stats ? `$${stats.budgetOptimized.toFixed(0)}` : '—',             color: 'warning' as const },
    { label: 'Mejora Engagement Promedio', value: stats ? `+${stats.avgEngagementImprovement.toFixed(1)}%` : '—',   color: 'neutral' as const },
  ]
  return (
    <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
      {items.map(item => (
        <Card key={item.label} variant="soft" color={item.color} sx={{ flex: 1, minWidth: 150, py: 1.5, px: 2 }}>
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

// ─── Confidence Bar ───────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value))
  const color = pct >= 75 ? '#1F7A1F' : pct >= 50 ? '#9A5B13' : '#C41C1C'
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box
        sx={{
          flex: 1,
          height: 6,
          borderRadius: 4,
          bgcolor: 'neutral.200',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            width: `${pct}%`,
            height: '100%',
            bgcolor: color,
            borderRadius: 4,
            transition: 'width 0.3s',
          }}
        />
      </Box>
      <Typography level="body-xs" sx={{ minWidth: 32, textAlign: 'right' }}>{pct}%</Typography>
    </Box>
  )
}

// ─── Learning Card ────────────────────────────────────────────────────────────

function LearningCard({ learning }: { learning: Learning }) {
  const typeCfg   = LEARNING_TYPE_CONFIG[learning.type]
  const impactCfg = IMPACT_CONFIG[learning.impact]

  return (
    <Card variant="outlined" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 'sm',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            bgcolor: typeCfg.color + '.softBg',
          }}
        >
          <Typography level="body-xs" fontWeight="lg" sx={{ color: typeCfg.color + '.600' }}>
            {typeCfg.emoji}
          </Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mb: 0.25 }}>
            <Chip size="sm" variant="soft" color={typeCfg.color}>{typeCfg.label}</Chip>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
              <DotIcon sx={{ fontSize: 10, color: impactCfg.dot }} />
              <Chip size="sm" variant="soft" color={impactCfg.color}>{impactCfg.label}</Chip>
            </Box>
            {learning.applied && (
              <Chip
                size="sm"
                variant="solid"
                color="success"
                startDecorator={<CheckCircle sx={{ fontSize: 11 }} />}
              >
                Aplicada
              </Chip>
            )}
          </Box>
          <Typography level="body-sm" fontWeight="lg">{learning.title}</Typography>
        </Box>
      </Box>

      {/* Descripcion */}
      <Typography level="body-xs" color="neutral">{learning.description}</Typography>

      {/* Confidence */}
      <Box>
        <Typography level="body-xs" color="neutral" sx={{ mb: 0.5 }}>
          Confianza
        </Typography>
        <ConfidenceBar value={learning.confidence} />
      </Box>

      {/* Recomendacion */}
      <Box
        sx={{
          bgcolor: 'primary.softBg',
          borderRadius: 'sm',
          p: 1,
          borderLeft: '3px solid',
          borderColor: 'primary.400',
        }}
      >
        <Typography level="body-xs" sx={{ fontStyle: 'italic' }}>{learning.recommendation}</Typography>
      </Box>

      {/* Footer */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 0.5 }}>
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
          <Chip size="sm" variant="plain" color="neutral">{SOURCE_LABELS[learning.source]}</Chip>
          {learning.campaignName && (
            <Chip size="sm" variant="plain" color="neutral"
              startDecorator={<CampaignIcon sx={{ fontSize: 11 }} />}
            >
              {learning.campaignName}
            </Chip>
          )}
        </Box>
        {learning.applied && learning.appliedAt ? (
          <Typography level="body-xs" color="success">
            Aplicada el {formatDate(learning.appliedAt)}
          </Typography>
        ) : (
          <Typography level="body-xs" color="neutral">{formatDate(learning.createdAt)}</Typography>
        )}
      </Box>
    </Card>
  )
}

// ─── Campaign Optimization Row ────────────────────────────────────────────────

interface CampaignOptRowProps {
  campaign: OptimizedCampaign
  runningId: number | null
  optimizingId: number | null
  extractingId: number | null
  onRun: (id: number) => void
  onOptimizeBudget: (id: number) => void
  onExtractLearnings: (id: number) => void
  onSelectMetrics: (id: number) => void
  selectedMetricsId: number | null
}

function CampaignOptRow({
  campaign,
  runningId,
  optimizingId,
  extractingId,
  onRun,
  onOptimizeBudget,
  onExtractLearnings,
  onSelectMetrics,
  selectedMetricsId,
}: CampaignOptRowProps) {
  const isRunning    = runningId === campaign.id
  const isOptimizing = optimizingId === campaign.id
  const isExtracting = extractingId === campaign.id
  const isSelected   = selectedMetricsId === campaign.id

  return (
    <Card
      variant={isSelected ? 'soft' : 'outlined'}
      color={isSelected ? 'primary' : 'neutral'}
      sx={{ mb: 1.5 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap' }}>
        {/* Info */}
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <CampaignIcon sx={{ fontSize: 18, color: 'primary.500' }} />
            <Typography level="title-sm" fontWeight="lg">{campaign.name}</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <ClockIcon sx={{ fontSize: 14, color: 'text.tertiary' }} />
              <Typography level="body-xs" color="neutral">
                Ultimo ciclo: {campaign.lastCycleAt ? formatDateTime(campaign.lastCycleAt) : 'Nunca'}
              </Typography>
            </Box>
            {campaign.nextCycleAt && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <ScheduleIcon sx={{ fontSize: 14, color: 'text.tertiary' }} />
                <Typography level="body-xs" color="neutral">
                  Proximo: {formatDateTime(campaign.nextCycleAt)}
                </Typography>
              </Box>
            )}
            <Chip size="sm" variant="soft" color="neutral">
              {campaign.totalCycles} ciclos
            </Chip>
          </Box>
        </Box>

        {/* Acciones */}
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button
            size="sm"
            variant="soft"
            color="primary"
            startDecorator={isRunning ? undefined : <RunIcon sx={{ fontSize: 14 }} />}
            loading={isRunning}
            onClick={() => onRun(campaign.id)}
          >
            Ejecutar Ahora
          </Button>
          <Button
            size="sm"
            variant="outlined"
            color="success"
            startDecorator={isOptimizing ? undefined : <BudgetIcon sx={{ fontSize: 14 }} />}
            loading={isOptimizing}
            onClick={() => onOptimizeBudget(campaign.id)}
          >
            Optimizar Budget
          </Button>
          <Button
            size="sm"
            variant="outlined"
            color="warning"
            startDecorator={isExtracting ? undefined : <LearningIcon sx={{ fontSize: 14 }} />}
            loading={isExtracting}
            onClick={() => onExtractLearnings(campaign.id)}
          >
            Extraer Learnings
          </Button>
          <Button
            size="sm"
            variant={isSelected ? 'solid' : 'plain'}
            color={isSelected ? 'primary' : 'neutral'}
            onClick={() => onSelectMetrics(campaign.id)}
          >
            {isSelected ? 'Ocultar Metricas' : 'Ver Metricas'}
          </Button>
        </Box>
      </Box>
    </Card>
  )
}

// ─── Metrics Table ────────────────────────────────────────────────────────────

interface MetricsTableProps {
  campaignId: number
}

function MetricsTable({ campaignId }: MetricsTableProps) {
  const [metrics, setMetrics]   = useState<MetricSnapshot[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.get(`/ugc/optimization/${campaignId}/metrics`)
      .then(res => setMetrics(res.data?.data ?? res.data ?? []))
      .catch(err => {
        devError('[MetricsTable] error:', err)
        setError('No se pudieron cargar las metricas.')
      })
      .finally(() => setLoading(false))
  }, [campaignId])

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size="sm" />
      </Box>
    )
  }

  if (error) {
    return (
      <Sheet variant="soft" color="danger" sx={{ p: 1.5, borderRadius: 'sm' }}>
        <Typography level="body-sm" color="danger">{error}</Typography>
      </Sheet>
    )
  }

  if (metrics.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <TrendingUp sx={{ fontSize: 36, color: 'text.tertiary' }} />
        <Typography level="body-sm" color="neutral" sx={{ mt: 1 }}>Sin snapshots de metricas</Typography>
      </Box>
    )
  }

  const COLS = ['Fecha', 'Views', 'Likes', 'Comentarios', 'Engagement', 'Purchase Intents', 'ROAS']

  function TrendIcon({ current, previous }: { current: number; previous?: number }) {
    if (previous === undefined) return null
    const up = current >= previous
    return up
      ? <TrendingUp sx={{ fontSize: 13, color: 'success.500' }} />
      : <TrendingDown sx={{ fontSize: 13, color: 'danger.500' }} />
  }

  return (
    <Box sx={{ overflowX: 'auto' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `1.5fr repeat(${COLS.length - 1}, 1fr)`,
          gap: 1,
          px: 1.5,
          py: 1,
          bgcolor: 'background.level1',
          borderRadius: 'sm',
          mb: 0.5,
          minWidth: 700,
        }}
      >
        {COLS.map(col => (
          <Typography key={col} level="body-xs" fontWeight="lg" color="neutral">{col}</Typography>
        ))}
      </Box>

      {metrics.map((m, idx) => {
        const prev = idx < metrics.length - 1 ? metrics[idx + 1] : undefined
        return (
          <Box
            key={m.id}
            sx={{
              display: 'grid',
              gridTemplateColumns: `1.5fr repeat(${COLS.length - 1}, 1fr)`,
              gap: 1,
              px: 1.5,
              py: 1.25,
              alignItems: 'center',
              borderBottom: '1px solid',
              borderColor: 'divider',
              '&:last-child': { borderBottom: 0 },
              '&:hover': { bgcolor: 'neutral.softBg' },
              minWidth: 700,
            }}
          >
            <Typography level="body-xs">{formatDate(m.date)}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography level="body-xs">{formatNumber(m.views)}</Typography>
              <TrendIcon current={m.views} previous={prev?.views} />
            </Box>
            <Typography level="body-xs">{formatNumber(m.likes)}</Typography>
            <Typography level="body-xs">{formatNumber(m.comments)}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Chip
                size="sm"
                variant="soft"
                color={m.engagementRate >= 5 ? 'success' : m.engagementRate >= 2 ? 'warning' : 'danger'}
              >
                {m.engagementRate.toFixed(1)}%
              </Chip>
              <TrendIcon current={m.engagementRate} previous={prev?.prevEngagementRate} />
            </Box>
            <Typography level="body-xs">{m.purchaseIntents}</Typography>
            <Chip
              size="sm"
              variant="soft"
              color={m.roas >= 3 ? 'success' : m.roas >= 1 ? 'warning' : 'danger'}
            >
              {m.roas.toFixed(2)}x
            </Chip>
          </Box>
        )
      })}
    </Box>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UGCOptimization() {
  const [stats, setStats]                   = useState<OptimizationStats | null>(null)
  const [campaigns, setCampaigns]           = useState<OptimizedCampaign[]>([])
  const [learnings, setLearnings]           = useState<Learning[]>([])
  const [loadingStats, setLoadingStats]     = useState(true)
  const [loadingLearnings, setLoadingLearnings] = useState(true)
  const [error, setError]                   = useState<string | null>(null)

  const [runningId, setRunningId]           = useState<number | null>(null)
  const [optimizingId, setOptimizingId]     = useState<number | null>(null)
  const [extractingId, setExtractingId]     = useState<number | null>(null)
  const [selectedMetricsId, setSelectedMetricsId] = useState<number | null>(null)
  const [actionFeedback, setActionFeedback] = useState<string | null>(null)

  const [learningTypeFilter, setLearningTypeFilter] = useState<LearningType | 'all'>('all')
  const [impactFilter, setImpactFilter]             = useState<ImpactLevel | 'all'>('all')
  const [campaignFilter, setCampaignFilter]         = useState<string>('all')

  const hasAutoOptimize = campaigns.some(c => c.autoOptimize)

  const fetchStats = useCallback(async () => {
    setLoadingStats(true)
    setError(null)
    try {
      const { data } = await api.get('/ugc/optimization/history')
      const payload  = data.data ?? data
      setStats(payload.stats ?? null)
      setCampaigns(payload.campaigns ?? [])
    } catch (err: unknown) {
      devError('[UGCOptimization] stats error:', err)
      setError('No se pudo cargar el panel de optimizacion.')
    } finally {
      setLoadingStats(false)
    }
  }, [])

  const fetchLearnings = useCallback(async () => {
    setLoadingLearnings(true)
    try {
      const { data } = await api.get('/ugc/optimization/learnings')
      setLearnings(data.data ?? data ?? [])
    } catch (err: unknown) {
      devError('[UGCOptimization] learnings error:', err)
    } finally {
      setLoadingLearnings(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
    fetchLearnings()
  }, [fetchStats, fetchLearnings])

  const showFeedback = (msg: string) => {
    setActionFeedback(msg)
    setTimeout(() => setActionFeedback(null), 3000)
  }

  const handleRun = async (campaignId: number) => {
    setRunningId(campaignId)
    try {
      await api.post(`/ugc/optimization/${campaignId}/run`)
      showFeedback('Ciclo de optimizacion ejecutado correctamente.')
      fetchStats()
    } catch (err: unknown) {
      devError('[UGCOptimization] run error:', err)
      showFeedback('Error al ejecutar el ciclo. Intenta de nuevo.')
    } finally {
      setRunningId(null)
    }
  }

  const handleOptimizeBudget = async (campaignId: number) => {
    setOptimizingId(campaignId)
    try {
      await api.post(`/ugc/optimization/${campaignId}/optimize-budget`)
      showFeedback('Budget optimizado correctamente.')
      fetchStats()
    } catch (err: unknown) {
      devError('[UGCOptimization] optimize-budget error:', err)
      showFeedback('Error al optimizar budget.')
    } finally {
      setOptimizingId(null)
    }
  }

  const handleExtractLearnings = async (campaignId: number) => {
    setExtractingId(campaignId)
    try {
      await api.post(`/ugc/optimization/${campaignId}/extract-learnings`)
      showFeedback('Learnings extraidos correctamente.')
      fetchLearnings()
    } catch (err: unknown) {
      devError('[UGCOptimization] extract-learnings error:', err)
      showFeedback('Error al extraer learnings.')
    } finally {
      setExtractingId(null)
    }
  }

  const handleSelectMetrics = (campaignId: number) => {
    setSelectedMetricsId(prev => prev === campaignId ? null : campaignId)
  }

  const filteredLearnings = learnings.filter(l => {
    if (learningTypeFilter !== 'all' && l.type !== learningTypeFilter) return false
    if (impactFilter        !== 'all' && l.impact !== impactFilter)    return false
    if (campaignFilter      !== 'all' && String(l.campaignId) !== campaignFilter) return false
    return true
  })

  const uniqueCampaignOptions = learnings.reduce<{ id: string; name: string }[]>((acc, l) => {
    if (l.campaignId && !acc.find(x => x.id === String(l.campaignId))) {
      acc.push({ id: String(l.campaignId), name: l.campaignName ?? `Campana ${l.campaignId}` })
    }
    return acc
  }, [])

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
      {/* ── Header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <PsychologyIcon sx={{ fontSize: 28, color: 'primary.500' }} />
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography level="h3">Optimizacion Autonoma</Typography>
              <Chip
                size="sm"
                variant="solid"
                color={hasAutoOptimize ? 'success' : 'neutral'}
                startDecorator={
                  <DotIcon sx={{ fontSize: 8 }} />
                }
              >
                {hasAutoOptimize ? 'Activo' : 'Inactivo'}
              </Chip>
            </Box>
            <Typography level="body-sm" color="neutral">
              Ciclos de optimizacion IA + learnings automaticos
            </Typography>
          </Box>
        </Box>
        <IconButton
          variant="outlined"
          color="neutral"
          size="sm"
          onClick={() => { fetchStats(); fetchLearnings() }}
          disabled={loadingStats}
        >
          <Refresh />
        </IconButton>
      </Box>

      {/* ── Stats strip ── */}
      <StatsStrip stats={stats} loading={loadingStats} />

      {/* ── Error state ── */}
      {error && (
        <Sheet variant="soft" color="danger" sx={{ p: 2, borderRadius: 'md', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography level="body-sm" color="danger">{error}</Typography>
            <Button size="sm" variant="plain" color="danger" onClick={fetchStats}>Reintentar</Button>
          </Box>
        </Sheet>
      )}

      {/* ── Action Feedback ── */}
      {actionFeedback && (
        <Sheet variant="soft" color="success" sx={{ p: 1.5, borderRadius: 'md', mb: 2 }}>
          <Typography level="body-sm" color="success">{actionFeedback}</Typography>
        </Sheet>
      )}

      {/* ── Campanas con Optimizacion ── */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <OptimizeIcon sx={{ fontSize: 20, color: 'primary.500' }} />
          <Typography level="title-md">Campanas con Optimizacion</Typography>
        </Box>
        <Divider sx={{ mb: 2 }} />

        {loadingStats ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size="sm" />
          </Box>
        ) : campaigns.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <OptimizeIcon sx={{ fontSize: 48, color: 'text.tertiary' }} />
            <Typography level="title-sm" sx={{ mt: 1 }}>Sin campanas con optimizacion activa</Typography>
            <Typography level="body-sm" color="neutral" sx={{ mt: 0.5, maxWidth: 340, mx: 'auto' }}>
              Activa la optimizacion automatica en una campana para comenzar.
            </Typography>
          </Box>
        ) : (
          <Box>
            {campaigns.map(c => (
              <CampaignOptRow
                key={c.id}
                campaign={c}
                runningId={runningId}
                optimizingId={optimizingId}
                extractingId={extractingId}
                onRun={handleRun}
                onOptimizeBudget={handleOptimizeBudget}
                onExtractLearnings={handleExtractLearnings}
                onSelectMetrics={handleSelectMetrics}
                selectedMetricsId={selectedMetricsId}
              />
            ))}
          </Box>
        )}

        {/* ── Metrics inline ── */}
        {selectedMetricsId !== null && (
          <Box sx={{ mt: 2 }}>
            <Divider sx={{ mb: 2 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <TrendingUp sx={{ fontSize: 18, color: 'primary.500' }} />
              <Typography level="title-sm">
                Historial de Metricas — {campaigns.find(c => c.id === selectedMetricsId)?.name}
              </Typography>
            </Box>
            <MetricsTable campaignId={selectedMetricsId} />
          </Box>
        )}
      </Card>

      {/* ── Learnings ── */}
      <Card variant="outlined">
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LearningIcon sx={{ fontSize: 20, color: 'warning.500' }} />
            <Typography level="title-md">Learnings</Typography>
          </Box>
          <Typography level="body-xs" color="neutral">
            {filteredLearnings.length} de {learnings.length} learnings
          </Typography>
        </Box>

        {/* Filtros learnings */}
        <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
          <Select
            size="sm"
            value={learningTypeFilter}
            onChange={(_, v) => v && setLearningTypeFilter(v as LearningType | 'all')}
            sx={{ minWidth: 180 }}
          >
            <Option value="all">Todos los tipos</Option>
            {(Object.entries(LEARNING_TYPE_CONFIG) as [LearningType, typeof LEARNING_TYPE_CONFIG[LearningType]][]).map(([key, cfg]) => (
              <Option key={key} value={key}>{cfg.label}</Option>
            ))}
          </Select>

          <Select
            size="sm"
            value={impactFilter}
            onChange={(_, v) => v && setImpactFilter(v as ImpactLevel | 'all')}
            sx={{ minWidth: 130 }}
          >
            <Option value="all">Todos los impactos</Option>
            <Option value="high">Alto</Option>
            <Option value="medium">Medio</Option>
            <Option value="low">Bajo</Option>
          </Select>

          {uniqueCampaignOptions.length > 0 && (
            <Select
              size="sm"
              value={campaignFilter}
              onChange={(_, v) => v && setCampaignFilter(v as string)}
              sx={{ minWidth: 160 }}
            >
              <Option value="all">Todas las campanas</Option>
              {uniqueCampaignOptions.map(c => (
                <Option key={c.id} value={c.id}>{c.name}</Option>
              ))}
            </Select>
          )}
        </Box>

        <Divider sx={{ mb: 2 }} />

        {loadingLearnings ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size="md" />
          </Box>
        ) : filteredLearnings.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8, gap: 1.5 }}>
            <LearningIcon sx={{ fontSize: 56, color: 'text.tertiary' }} />
            <Typography level="h4" textAlign="center">Sin learnings</Typography>
            <Typography level="body-md" color="neutral" textAlign="center" sx={{ maxWidth: 360 }}>
              {learnings.length === 0
                ? 'Los learnings se generan automaticamente al ejecutar ciclos de optimizacion.'
                : 'No hay learnings que coincidan con los filtros seleccionados.'}
            </Typography>
          </Box>
        ) : (
          <Stack spacing={1.5}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, 1fr)',
                  lg: 'repeat(3, 1fr)',
                },
                gap: 2,
              }}
            >
              {filteredLearnings.map(l => (
                <LearningCard key={l.id} learning={l} />
              ))}
            </Box>
          </Stack>
        )}
      </Card>
    </Box>
  )
}
