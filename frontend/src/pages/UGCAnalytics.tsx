import { useState, useEffect, useCallback } from 'react'
import { CircularProgress } from '@mui/joy'
import {
  ChartBar,
  ArrowClockwise,
  TrendUp,
  TrendDown,
  CurrencyDollar,
  ChatsCircle,
  Sparkle,
  InstagramLogo,
  TiktokLogo,
  FacebookLogo,
  YoutubeLogo,
  User,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { Avatar } from '@/components/ui/avatar'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devError = (...args: unknown[]) => { if (isDev) console.error(...args) }

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnalyticsStats {
  totalInteractions: number
  totalInteractionsTrend: number       // % change vs previous period
  purchaseIntents: number
  purchaseIntentsTrend: number
  avgEngagementRate: number
  avgEngagementRateTrend: number
  autoReplied: number
  autoRepliedTrend: number
}

interface AgentPerformance {
  agentId: number
  agentName: string
  agentAvatarUrl?: string
  interactions: number
  purchaseIntents: number
  engagementRate: number
  consistencyScore: number
}

interface PlatformStats {
  platform: 'instagram' | 'tiktok' | 'facebook' | 'youtube'
  interactions: number
  purchaseIntents: number
  avgEngagement: number
  postsCount: number
}

type CommentType = 'purchase_intent' | 'question' | 'praise' | 'complaint' | 'neutral'

interface RecentInteraction {
  id: number
  commentType: CommentType
  text: string
  agentName: string
  agentAvatarUrl?: string
  platform: 'instagram' | 'tiktok' | 'facebook' | 'youtube'
  createdAt: string
}

type DateRange = '7d' | '30d' | '90d'

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_CONFIG: Record<
  PlatformStats['platform'],
  { label: string; color: string; Icon: Icon }
> = {
  instagram: { label: 'Instagram', color: '#E1306C', Icon: InstagramLogo },
  tiktok:    { label: 'TikTok',    color: '#010101', Icon: TiktokLogo },
  facebook:  { label: 'Facebook',  color: '#1877F2', Icon: FacebookLogo },
  youtube:   { label: 'YouTube',   color: '#FF0000', Icon: YoutubeLogo },
}

const COMMENT_TYPE_CONFIG: Record<
  CommentType,
  { label: string; badge: BadgeProps['variant']; dot: string }
> = {
  purchase_intent: { label: 'Purchase Intent', badge: 'success',     dot: 'bg-success' },
  question:        { label: 'Pregunta',        badge: 'primary',     dot: 'bg-primary' },
  praise:          { label: 'Elogio',          badge: 'warning',     dot: 'bg-warning' },
  complaint:       { label: 'Queja',           badge: 'destructive', dot: 'bg-destructive' },
  neutral:         { label: 'Neutral',         badge: 'neutral',     dot: 'bg-muted-foreground' },
}

function engagementVariant(rate: number): BadgeProps['variant'] {
  return rate >= 5 ? 'success' : rate >= 2 ? 'warning' : 'destructive'
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'ahora'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours}h`
  return `hace ${Math.floor(hours / 24)}d`
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

type StatTone = 'primary' | 'success' | 'warning' | 'neutral'

interface BigStatCardProps {
  label: string
  value: string
  trend: number
  icon: React.ReactNode
  color: StatTone
  loading?: boolean
}

const STAT_SURFACE: Record<StatTone, string> = {
  primary: 'border-primary/20 bg-primary/8',
  success: 'border-success/25 bg-success/10',
  warning: 'border-warning/25 bg-warning/12',
  neutral: 'border-border bg-muted',
}

const STAT_ICON: Record<StatTone, string> = {
  primary: 'text-primary',
  success: 'text-success-text',
  warning: 'text-warning-text',
  neutral: 'text-muted-foreground',
}

function BigStatCard({ label, value, trend, icon, color, loading }: BigStatCardProps) {
  const isPositive = trend >= 0
  return (
    <div className={cn('flex min-w-[200px] flex-1 flex-col rounded-xl border p-4', STAT_SURFACE[color])}>
      <div className="mb-1 flex items-start justify-between">
        <span className={cn('opacity-80', STAT_ICON[color])}>{icon}</span>
        {!loading && (
          <span className="flex items-center gap-0.5">
            {isPositive
              ? <TrendUp className="size-3.5 text-success-text" aria-hidden />
              : <TrendDown className="size-3.5 text-destructive-text" aria-hidden />
            }
            <span className={cn('text-xs font-medium', isPositive ? 'text-success-text' : 'text-destructive-text')}>
              {isPositive ? '+' : ''}{trend.toFixed(1)}%
            </span>
          </span>
        )}
      </div>
      {loading ? (
        <div className="my-1"><CircularProgress size="sm" /></div>
      ) : (
        <p className="mb-0.5 text-3xl font-bold tracking-tight tabular-nums text-foreground">{value}</p>
      )}
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

// ─── Agents Table ─────────────────────────────────────────────────────────────

const AGENT_GRID = 'grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2'

function AgentsTable({ agents, loading }: { agents: AgentPerformance[]; loading: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
      <div className="mb-3 flex items-center gap-2">
        <User className="size-5 text-primary" aria-hidden />
        <h2 className="text-base font-semibold text-foreground">Rendimiento por Agente</h2>
      </div>
      <div className="mb-4 border-t border-border" />

      {loading ? (
        <div className="flex justify-center py-8">
          <CircularProgress size="sm" />
        </div>
      ) : agents.length === 0 ? (
        <div className="py-8 text-center">
          <User className="mx-auto mb-1 size-9 text-muted-foreground/60" aria-hidden />
          <p className="text-sm text-muted-foreground">Sin datos de agentes</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          {/* Header */}
          <div className={cn(AGENT_GRID, 'mb-1 rounded-md bg-muted/50 px-3 py-2')}>
            {['Agente', 'Interacciones', 'Purchase Intents', 'Engagement', 'Consistencia'].map(col => (
              <span key={col} className="text-xs font-semibold text-muted-foreground">{col}</span>
            ))}
          </div>

          {agents.map(agent => (
            <div
              key={agent.agentId}
              className={cn(
                AGENT_GRID,
                'items-center border-b border-border px-3 py-2.5 transition-colors last:border-b-0 hover:bg-accent/40',
              )}
            >
              <div className="flex items-center gap-2">
                <Avatar name={agent.agentName} size="sm" />
                <span className="truncate text-sm font-medium text-foreground">{agent.agentName}</span>
              </div>
              <span className="text-sm text-foreground tabular-nums">{formatNumber(agent.interactions)}</span>
              <span className="flex items-center gap-1">
                <CurrencyDollar className="size-3.5 text-success-text" aria-hidden />
                <span className="text-sm text-foreground tabular-nums">{agent.purchaseIntents}</span>
              </span>
              <span>
                <Badge variant={engagementVariant(agent.engagementRate)}>
                  {agent.engagementRate.toFixed(1)}%
                </Badge>
              </span>
              <span>
                <Badge
                  variant={agent.consistencyScore >= 80 ? 'success' : agent.consistencyScore >= 50 ? 'warning' : 'destructive'}
                >
                  {agent.consistencyScore}%
                </Badge>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Platform Cards ───────────────────────────────────────────────────────────

function PlatformCards({ platforms, loading }: { platforms: PlatformStats[]; loading: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
      <div className="mb-3 flex items-center gap-2">
        <ChartBar className="size-5 text-primary" aria-hidden />
        <h2 className="text-base font-semibold text-foreground">Metricas por Plataforma</h2>
      </div>
      <div className="mb-4 border-t border-border" />

      {loading ? (
        <div className="flex justify-center py-8">
          <CircularProgress size="sm" />
        </div>
      ) : platforms.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">Sin datos de plataformas</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {platforms.map(p => {
            const cfg = PLATFORM_CONFIG[p.platform]
            const PlatformIcon = cfg.Icon
            return (
              <div
                key={p.platform}
                className="rounded-lg border border-border p-4 text-center"
              >
                <div className="mb-1 flex justify-center">
                  <PlatformIcon className="size-[18px]" weight="fill" style={{ color: cfg.color }} aria-hidden />
                </div>
                <p className="mb-2 text-sm font-semibold text-foreground">{cfg.label}</p>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Interacciones</span>
                    <span className="text-xs font-medium text-foreground tabular-nums">{formatNumber(p.interactions)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Purchase Intents</span>
                    <span className="text-xs font-medium text-foreground tabular-nums">{p.purchaseIntents}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Engagement</span>
                    <Badge variant={engagementVariant(p.avgEngagement)}>
                      {p.avgEngagement.toFixed(1)}%
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Posts</span>
                    <span className="text-xs font-medium text-foreground tabular-nums">{p.postsCount}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Activity Timeline ─────────────────────────────────────────────────────────

function ActivityTimeline({ interactions, loading }: { interactions: RecentInteraction[]; loading: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
      <div className="mb-3 flex items-center gap-2">
        <ChatsCircle className="size-5 text-primary" aria-hidden />
        <h2 className="text-base font-semibold text-foreground">Actividad Reciente</h2>
      </div>
      <div className="mb-4 border-t border-border" />

      {loading ? (
        <div className="flex justify-center py-8">
          <CircularProgress size="sm" />
        </div>
      ) : interactions.length === 0 ? (
        <div className="py-8 text-center">
          <ChatsCircle className="mx-auto mb-1 size-9 text-muted-foreground/60" aria-hidden />
          <p className="text-sm text-muted-foreground">Sin interacciones recientes</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {interactions.map((interaction, idx) => {
            const typeCfg = COMMENT_TYPE_CONFIG[interaction.commentType]
            const platformCfg = PLATFORM_CONFIG[interaction.platform]
            const PlatformIcon = platformCfg.Icon
            const notLast = idx < interactions.length - 1
            return (
              <div
                key={interaction.id}
                className={cn(
                  'flex gap-3',
                  notLast && 'mb-3 border-b border-dashed border-border pb-3',
                )}
              >
                {/* Timeline dot */}
                <div className="flex shrink-0 flex-col items-center">
                  <span className={cn('mt-1.5 size-2.5 rounded-full', typeCfg.dot)} aria-hidden />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex flex-wrap items-center gap-2">
                    <Badge variant={typeCfg.badge} className="text-[10px]">
                      {typeCfg.label}
                    </Badge>
                    <span className="flex items-center">
                      <PlatformIcon className="size-4" weight="fill" style={{ color: platformCfg.color }} aria-hidden />
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatTimeAgo(interaction.createdAt)}
                    </span>
                  </div>
                  <p className="mb-1 truncate text-xs text-foreground">
                    {interaction.text}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Avatar name={interaction.agentName} size="sm" className="size-4 text-[8px]" />
                    <span className="text-xs text-muted-foreground">{interaction.agentName}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UGCAnalytics() {
  const [stats, setStats]               = useState<AnalyticsStats | null>(null)
  const [agents, setAgents]             = useState<AgentPerformance[]>([])
  const [platforms, setPlatforms]       = useState<PlatformStats[]>([])
  const [recentActivity, setRecentActivity] = useState<RecentInteraction[]>([])
  const [loadingStats, setLoadingStats] = useState(true)
  const [loadingActivity, setLoadingActivity] = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [dateRange, setDateRange]       = useState<DateRange>('30d')

  const fetchAnalytics = useCallback(async () => {
    setLoadingStats(true)
    setError(null)
    try {
      const { data } = await api.get(`/ugc/interactions/analytics?range=${dateRange}`)
      const payload = data.data ?? data
      setStats(payload.stats ?? null)
      setAgents(payload.agents ?? [])
      setPlatforms(payload.platforms ?? [])
    } catch (err: unknown) {
      devError('[UGCAnalytics] analytics error:', err)
      setError('No se pudieron cargar los analytics.')
    } finally {
      setLoadingStats(false)
    }
  }, [dateRange])

  const fetchActivity = useCallback(async () => {
    setLoadingActivity(true)
    try {
      const { data } = await api.get('/ugc/interactions/inbox?limit=20')
      setRecentActivity(data.data ?? data ?? [])
    } catch (err: unknown) {
      devError('[UGCAnalytics] activity error:', err)
    } finally {
      setLoadingActivity(false)
    }
  }, [])

  useEffect(() => {
    fetchAnalytics()
    fetchActivity()
  }, [fetchAnalytics, fetchActivity])

  const handleRefresh = () => {
    fetchAnalytics()
    fetchActivity()
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6">
        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <ChartBar className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">UGC Analytics</h1>
              <p className="text-sm text-muted-foreground">
                Metricas consolidadas del Pipeline de contenido
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
              <SelectTrigger className="w-[150px]" aria-label="Rango de fechas">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Ultimos 7 dias</SelectItem>
                <SelectItem value="30d">Ultimos 30 dias</SelectItem>
                <SelectItem value="90d">Ultimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              aria-label="Actualizar"
              onClick={handleRefresh}
              disabled={loadingStats}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="rounded-md bg-destructive/12 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-destructive-text">{error}</p>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
                onClick={fetchAnalytics}
              >
                Reintentar
              </Button>
            </div>
          </div>
        )}

        {/* ── 4 Big stat cards ── */}
        <div className="flex flex-wrap gap-4">
          <BigStatCard
            label="Total Interacciones"
            value={stats ? formatNumber(stats.totalInteractions) : '—'}
            trend={stats?.totalInteractionsTrend ?? 0}
            icon={<ChatsCircle className="size-7" aria-hidden />}
            color="primary"
            loading={loadingStats}
          />
          <BigStatCard
            label="Purchase Intents"
            value={stats ? formatNumber(stats.purchaseIntents) : '—'}
            trend={stats?.purchaseIntentsTrend ?? 0}
            icon={<CurrencyDollar className="size-7" aria-hidden />}
            color="success"
            loading={loadingStats}
          />
          <BigStatCard
            label="Engagement Promedio"
            value={stats ? `${stats.avgEngagementRate.toFixed(1)}%` : '—'}
            trend={stats?.avgEngagementRateTrend ?? 0}
            icon={<TrendUp className="size-7" aria-hidden />}
            color="warning"
            loading={loadingStats}
          />
          <BigStatCard
            label="Auto-respondidos"
            value={stats ? formatNumber(stats.autoReplied) : '—'}
            trend={stats?.autoRepliedTrend ?? 0}
            icon={<Sparkle className="size-7" aria-hidden />}
            color="neutral"
            loading={loadingStats}
          />
        </div>

        {/* ── Agents + Platforms ── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
          <AgentsTable agents={agents} loading={loadingStats} />
          <PlatformCards platforms={platforms} loading={loadingStats} />
        </div>

        {/* ── Activity timeline ── */}
        <ActivityTimeline interactions={recentActivity} loading={loadingActivity} />
      </div>
    </div>
  )
}
