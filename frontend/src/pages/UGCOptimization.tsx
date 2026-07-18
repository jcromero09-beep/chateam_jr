import { useState, useEffect, useCallback } from 'react'
// [Fase2·G] Se conserva CircularProgress de MUI Joy a propósito (no hay equivalente
// en el design system Tailwind/shadcn). El resto de la pantalla usa tokens + wrappers ui/.
import { CircularProgress } from '@mui/joy'
import {
  MagicWand,
  ArrowClockwise,
  Play,
  Bank,
  Lightbulb,
  TrendUp,
  TrendDown,
  Clock,
  Megaphone,
  CheckCircle,
  CalendarCheck,
  Brain,
} from '@phosphor-icons/react'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

type Tone = 'primary' | 'success' | 'warning' | 'destructive' | 'neutral'

// Tinte de superficie + texto accesible por tono (mismos ratios que ui/badge).
const TONE_TILE: Record<Tone, string> = {
  primary:     'bg-primary/12 text-primary',
  success:     'bg-success/14 text-success-text',
  warning:     'bg-warning/16 text-warning-text',
  destructive: 'bg-destructive/12 text-destructive-text',
  neutral:     'bg-muted text-muted-foreground',
}

const TONE_BAR: Record<'success' | 'warning' | 'destructive', string> = {
  success:     'bg-success',
  warning:     'bg-warning',
  destructive: 'bg-destructive',
}

const LEARNING_TYPE_CONFIG: Record<LearningType, { label: string; emoji: string; tone: Tone }> = {
  content_style:    { label: 'Estilo de Contenido',    emoji: 'CS', tone: 'primary' },
  posting_time:     { label: 'Horario de Publicacion', emoji: 'HO', tone: 'success' },
  audience_segment: { label: 'Segmento de Audiencia',  emoji: 'AU', tone: 'warning' },
  hook_pattern:     { label: 'Patron de Hook',         emoji: 'HP', tone: 'destructive' },
  cta_pattern:      { label: 'Patron CTA',             emoji: 'CT', tone: 'neutral' },
  format:           { label: 'Formato',                emoji: 'FM', tone: 'primary' },
  hashtag:          { label: 'Hashtag',                emoji: 'HT', tone: 'success' },
  tone:             { label: 'Tono',                   emoji: 'TN', tone: 'warning' },
}

const IMPACT_CONFIG: Record<ImpactLevel, { label: string; tone: Tone }> = {
  high:   { label: 'Alto',  tone: 'destructive' },
  medium: { label: 'Medio', tone: 'warning' },
  low:    { label: 'Bajo',  tone: 'success' },
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
  const items: { label: string; value: string; tone: 'neutral' | 'success' | 'warning' }[] = [
    { label: 'Ciclos Ejecutados',          value: stats ? String(stats.totalCycles) : '—',                        tone: 'neutral' },
    { label: 'Learnings Generados',        value: stats ? String(stats.learningsGenerated) : '—',                 tone: 'success' },
    { label: 'Budget Optimizado',          value: stats ? `$${stats.budgetOptimized.toFixed(0)}` : '—',           tone: 'warning' },
    { label: 'Mejora Engagement Promedio', value: stats ? `+${stats.avgEngagementImprovement.toFixed(1)}%` : '—', tone: 'neutral' },
  ]

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {items.map(item => (
          <div
            key={item.label}
            className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]"
          >
            <p className="text-sm text-muted-foreground">{item.label}</p>
            <div className="mt-1.5 flex h-9 items-center">
              <CircularProgress size="sm" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {items.map(item => (
        <StatTile key={item.label} label={item.label} value={item.value} tone={item.tone} />
      ))}
    </div>
  )
}

// ─── Confidence Bar ───────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value))
  const bar = pct >= 75 ? TONE_BAR.success : pct >= 50 ? TONE_BAR.warning : TONE_BAR.destructive
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Nivel de confianza"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-300', bar)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="min-w-8 text-right text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  )
}

// ─── Learning Card ────────────────────────────────────────────────────────────

function LearningCard({ learning }: { learning: Learning }) {
  const typeCfg   = LEARNING_TYPE_CONFIG[learning.type]
  const impactCfg = IMPACT_CONFIG[learning.impact]

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/[0.02]">
      {/* Header */}
      <div className="flex items-start gap-2">
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-md text-xs font-semibold',
            TONE_TILE[typeCfg.tone],
          )}
          aria-hidden
        >
          {typeCfg.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <Badge variant={typeCfg.tone}>{typeCfg.label}</Badge>
            <Badge variant={impactCfg.tone} dot>{impactCfg.label}</Badge>
            {learning.applied && (
              <Badge variant="success">
                <CheckCircle className="size-3" weight="fill" aria-hidden />
                Aplicada
              </Badge>
            )}
          </div>
          <p className="text-sm font-semibold text-foreground">{learning.title}</p>
        </div>
      </div>

      {/* Descripcion */}
      <p className="text-xs text-muted-foreground">{learning.description}</p>

      {/* Confidence */}
      <div>
        <p className="mb-1 text-xs text-muted-foreground">Confianza</p>
        <ConfidenceBar value={learning.confidence} />
      </div>

      {/* Recomendacion */}
      <div className="rounded-md border-l-[3px] border-primary/50 bg-primary/8 p-2">
        <p className="text-xs italic text-foreground">{learning.recommendation}</p>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{SOURCE_LABELS[learning.source]}</Badge>
          {learning.campaignName && (
            <Badge variant="outline">
              <Megaphone className="size-3" aria-hidden />
              {learning.campaignName}
            </Badge>
          )}
        </div>
        {learning.applied && learning.appliedAt ? (
          <span className="text-xs text-success-text">
            Aplicada el {formatDate(learning.appliedAt)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{formatDate(learning.createdAt)}</span>
        )}
      </div>
    </div>
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
    <div
      className={cn(
        'mb-3 rounded-xl border p-4 transition-colors',
        isSelected ? 'border-primary/50 bg-primary/8' : 'border-border bg-card',
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        {/* Info */}
        <div className="min-w-[200px] flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            <Megaphone className="size-[18px] shrink-0 text-primary" weight="fill" aria-hidden />
            <p className="text-sm font-semibold text-foreground">{campaign.name}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5 shrink-0" aria-hidden />
              Ultimo ciclo: {campaign.lastCycleAt ? formatDateTime(campaign.lastCycleAt) : 'Nunca'}
            </span>
            {campaign.nextCycleAt && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarCheck className="size-3.5 shrink-0" aria-hidden />
                Proximo: {formatDateTime(campaign.nextCycleAt)}
              </span>
            )}
            <Badge variant="neutral">{campaign.totalCycles} ciclos</Badge>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            loading={isRunning}
            onClick={() => onRun(campaign.id)}
          >
            {!isRunning && <Play className="size-3.5" weight="fill" aria-hidden />}
            Ejecutar Ahora
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-success-text hover:bg-success/10 hover:text-success-text"
            loading={isOptimizing}
            onClick={() => onOptimizeBudget(campaign.id)}
          >
            {!isOptimizing && <Bank className="size-3.5" aria-hidden />}
            Optimizar Budget
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-warning-text hover:bg-warning/10 hover:text-warning-text"
            loading={isExtracting}
            onClick={() => onExtractLearnings(campaign.id)}
          >
            {!isExtracting && <Lightbulb className="size-3.5" aria-hidden />}
            Extraer Learnings
          </Button>
          <Button
            size="sm"
            variant={isSelected ? 'primary' : 'ghost'}
            aria-expanded={isSelected}
            onClick={() => onSelectMetrics(campaign.id)}
          >
            {isSelected ? 'Ocultar Metricas' : 'Ver Metricas'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Metrics Table ────────────────────────────────────────────────────────────

function TrendIcon({ current, previous }: { current: number; previous?: number }) {
  if (previous === undefined) return null
  return current >= previous
    ? <TrendUp className="size-3.5 shrink-0 text-success-text" aria-label="Al alza" />
    : <TrendDown className="size-3.5 shrink-0 text-destructive-text" aria-label="A la baja" />
}

const METRIC_COLS = ['Fecha', 'Views', 'Likes', 'Comentarios', 'Engagement', 'Purchase Intents', 'ROAS']

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
      <div className="flex justify-center py-8">
        <CircularProgress size="sm" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
        <p className="text-sm text-destructive-text">{error}</p>
      </div>
    )
  }

  if (metrics.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <TrendUp className="size-9 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">Sin snapshots de metricas</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              {METRIC_COLS.map(col => (
                <th
                  key={col}
                  className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {metrics.map((m, idx) => {
              const prev = idx < metrics.length - 1 ? metrics[idx + 1] : undefined
              return (
                <tr key={m.id} className="transition-colors hover:bg-accent/40">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(m.date)}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 tabular-nums text-foreground">
                      {formatNumber(m.views)}
                      <TrendIcon current={m.views} previous={prev?.views} />
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-foreground">{formatNumber(m.likes)}</td>
                  <td className="px-4 py-3 tabular-nums text-foreground">{formatNumber(m.comments)}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5">
                      <Badge
                        variant={
                          m.engagementRate >= 5 ? 'success' : m.engagementRate >= 2 ? 'warning' : 'destructive'
                        }
                      >
                        {m.engagementRate.toFixed(1)}%
                      </Badge>
                      <TrendIcon current={m.engagementRate} previous={prev?.prevEngagementRate} />
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-foreground">{m.purchaseIntents}</td>
                  <td className="px-4 py-3">
                    <Badge variant={m.roas >= 3 ? 'success' : m.roas >= 1 ? 'warning' : 'destructive'}>
                      {m.roas.toFixed(2)}x
                    </Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
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
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1200px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Brain className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Optimizacion Autonoma
                </h1>
                <Badge variant={hasAutoOptimize ? 'success' : 'neutral'} dot>
                  {hasAutoOptimize ? 'Activo' : 'Inactivo'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Ciclos de optimizacion IA + learnings automaticos
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Actualizar"
            className="text-muted-foreground"
            onClick={() => { fetchStats(); fetchLearnings() }}
            disabled={loadingStats}
          >
            <ArrowClockwise className="size-5" aria-hidden />
          </Button>
        </div>

        {/* ── Stats strip ── */}
        <StatsStrip stats={stats} loading={loadingStats} />

        {/* ── Error state ── */}
        {error && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
            <p className="text-sm text-destructive-text">{error}</p>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
              onClick={fetchStats}
            >
              Reintentar
            </Button>
          </div>
        )}

        {/* ── Action Feedback ── */}
        {actionFeedback && (
          <div className="rounded-lg border border-success/30 bg-success/10 p-3" role="status" aria-live="polite">
            <p className="text-sm text-success-text">{actionFeedback}</p>
          </div>
        )}

        {/* ── Campanas con Optimizacion ── */}
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <div className="flex items-center gap-2">
            <MagicWand className="size-5 shrink-0 text-primary" aria-hidden />
            <h2 className="text-base font-semibold text-foreground">Campanas con Optimizacion</h2>
          </div>
          <div className="my-4 border-t border-border" />

          {loadingStats ? (
            <div className="flex justify-center py-8">
              <CircularProgress size="sm" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <MagicWand className="size-12 text-muted-foreground" aria-hidden />
              <p className="text-sm font-semibold text-foreground">Sin campanas con optimizacion activa</p>
              <p className="max-w-[340px] text-sm text-muted-foreground">
                Activa la optimizacion automatica en una campana para comenzar.
              </p>
            </div>
          ) : (
            <div>
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
            </div>
          )}

          {/* ── Metrics inline ── */}
          {selectedMetricsId !== null && (
            <div className="mt-4">
              <div className="mb-4 border-t border-border" />
              <div className="mb-4 flex items-center gap-2">
                <TrendUp className="size-[18px] shrink-0 text-primary" aria-hidden />
                <h3 className="text-sm font-semibold text-foreground">
                  Historial de Metricas — {campaigns.find(c => c.id === selectedMetricsId)?.name}
                </h3>
              </div>
              <MetricsTable campaignId={selectedMetricsId} />
            </div>
          )}
        </section>

        {/* ── Learnings ── */}
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Lightbulb className="size-5 shrink-0 text-warning-text" weight="fill" aria-hidden />
              <h2 className="text-base font-semibold text-foreground">Learnings</h2>
            </div>
            <span className="text-xs text-muted-foreground">
              {filteredLearnings.length} de {learnings.length} learnings
            </span>
          </div>

          {/* Filtros learnings */}
          <div className="mt-4 flex flex-wrap gap-3">
            <Select
              value={learningTypeFilter}
              onValueChange={(v) => v && setLearningTypeFilter(v as LearningType | 'all')}
            >
              <SelectTrigger className="w-[200px]" aria-label="Filtrar por tipo de learning">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {(Object.entries(LEARNING_TYPE_CONFIG) as [LearningType, typeof LEARNING_TYPE_CONFIG[LearningType]][]).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={impactFilter}
              onValueChange={(v) => v && setImpactFilter(v as ImpactLevel | 'all')}
            >
              <SelectTrigger className="w-[170px]" aria-label="Filtrar por impacto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los impactos</SelectItem>
                <SelectItem value="high">Alto</SelectItem>
                <SelectItem value="medium">Medio</SelectItem>
                <SelectItem value="low">Bajo</SelectItem>
              </SelectContent>
            </Select>

            {uniqueCampaignOptions.length > 0 && (
              <Select
                value={campaignFilter}
                onValueChange={(v) => v && setCampaignFilter(v)}
              >
                <SelectTrigger className="w-[190px]" aria-label="Filtrar por campana">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las campanas</SelectItem>
                  {uniqueCampaignOptions.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="my-4 border-t border-border" />

          {loadingLearnings ? (
            <div className="flex justify-center py-12">
              <CircularProgress size="md" />
            </div>
          ) : filteredLearnings.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Lightbulb className="size-14 text-muted-foreground" aria-hidden />
              <p className="text-xl font-semibold text-foreground">Sin learnings</p>
              <p className="max-w-[360px] text-sm text-muted-foreground">
                {learnings.length === 0
                  ? 'Los learnings se generan automaticamente al ejecutar ciclos de optimizacion.'
                  : 'No hay learnings que coincidan con los filtros seleccionados.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredLearnings.map(l => (
                <LearningCard key={l.id} learning={l} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
