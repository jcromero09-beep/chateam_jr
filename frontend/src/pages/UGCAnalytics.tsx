import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Sheet,
  Card,
  Chip,
  Avatar,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  Select,
  Option,
} from '@mui/joy'
import {
  BarChart as BarChartIcon,
  Refresh,
  TrendingUp,
  TrendingDown,
  AttachMoney,
  Forum,
  AutoAwesome,
  Instagram,
  Videocam,
  Facebook,
  Person,
  Circle,
} from '@mui/icons-material'
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

const PLATFORM_CONFIG = {
  instagram: { label: 'Instagram', color: '#E1306C', icon: <Instagram sx={{ fontSize: 18 }} /> },
  tiktok:    { label: 'TikTok',    color: '#010101', icon: <Videocam sx={{ fontSize: 18 }} /> },
  facebook:  { label: 'Facebook',  color: '#1877F2', icon: <Facebook sx={{ fontSize: 18 }} /> },
  youtube:   { label: 'YouTube',   color: '#FF0000', icon: <Videocam sx={{ fontSize: 18 }} /> },
}

const COMMENT_TYPE_COLORS: Record<CommentType, string> = {
  purchase_intent: 'var(--joy-palette-success-500, #1F7A1F)',
  question:        'var(--joy-palette-primary-500, #0B6BCB)',
  praise:          'var(--joy-palette-warning-500, #9A5B13)',
  complaint:       'var(--joy-palette-danger-500, #C41C1C)',
  neutral:         'var(--joy-palette-neutral-400, #9FA6AD)',
}

const COMMENT_TYPE_LABELS: Record<CommentType, string> = {
  purchase_intent: 'Purchase Intent',
  question:        'Pregunta',
  praise:          'Elogio',
  complaint:       'Queja',
  neutral:         'Neutral',
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

interface BigStatCardProps {
  label: string
  value: string
  trend: number
  icon: React.ReactNode
  color: 'primary' | 'success' | 'warning' | 'neutral'
  loading?: boolean
}

function BigStatCard({ label, value, trend, icon, color, loading }: BigStatCardProps) {
  const isPositive = trend >= 0
  return (
    <Card variant="soft" color={color} sx={{ flex: 1, minWidth: 200 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ opacity: 0.7 }}>{icon}</Box>
        {!loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {isPositive
              ? <TrendingUp sx={{ fontSize: 14, color: 'success.600' }} />
              : <TrendingDown sx={{ fontSize: 14, color: 'danger.500' }} />
            }
            <Typography
              level="body-xs"
              sx={{ color: isPositive ? 'success.700' : 'danger.600', fontWeight: 'md' }}
            >
              {isPositive ? '+' : ''}{trend.toFixed(1)}%
            </Typography>
          </Box>
        )}
      </Box>
      {loading ? (
        <CircularProgress size="sm" sx={{ my: 1 }} />
      ) : (
        <Typography level="h2" fontWeight={700} sx={{ mb: 0.25 }}>{value}</Typography>
      )}
      <Typography level="body-xs" sx={{ opacity: 0.8 }}>{label}</Typography>
    </Card>
  )
}

// ─── Agents Table ─────────────────────────────────────────────────────────────

function AgentsTable({ agents, loading }: { agents: AgentPerformance[]; loading: boolean }) {
  return (
    <Card variant="outlined">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Person sx={{ fontSize: 20, color: 'primary.500' }} />
        <Typography level="title-md">Rendimiento por Agente</Typography>
      </Box>
      <Divider sx={{ mb: 1.5 }} />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size="sm" />
        </Box>
      ) : agents.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Person sx={{ fontSize: 36, color: 'text.tertiary', mb: 1 }} />
          <Typography level="body-sm" color="neutral">Sin datos de agentes</Typography>
        </Box>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          {/* Header */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
              gap: 1,
              px: 1.5,
              py: 1,
              bgcolor: 'background.level1',
              borderRadius: 'sm',
              mb: 0.5,
            }}
          >
            {['Agente', 'Interacciones', 'Purchase Intents', 'Engagement', 'Consistencia'].map(col => (
              <Typography key={col} level="body-xs" fontWeight="lg" color="neutral">{col}</Typography>
            ))}
          </Box>

          {agents.map(agent => (
            <Box
              key={agent.agentId}
              sx={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                gap: 1,
                px: 1.5,
                py: 1.25,
                alignItems: 'center',
                borderBottom: '1px solid',
                borderColor: 'divider',
                '&:last-child': { borderBottom: 0 },
                '&:hover': { bgcolor: 'neutral.softBg' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Avatar src={agent.agentAvatarUrl} sx={{ width: 30, height: 30, fontSize: 11 }}>
                  {agent.agentName.charAt(0)}
                </Avatar>
                <Typography level="body-sm" fontWeight="md" noWrap>{agent.agentName}</Typography>
              </Box>
              <Typography level="body-sm">{formatNumber(agent.interactions)}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AttachMoney sx={{ fontSize: 14, color: 'success.500' }} />
                <Typography level="body-sm">{agent.purchaseIntents}</Typography>
              </Box>
              <Chip
                size="sm"
                variant="soft"
                color={agent.engagementRate >= 5 ? 'success' : agent.engagementRate >= 2 ? 'warning' : 'danger'}
              >
                {agent.engagementRate.toFixed(1)}%
              </Chip>
              <Chip
                size="sm"
                variant="soft"
                color={agent.consistencyScore >= 80 ? 'success' : agent.consistencyScore >= 50 ? 'warning' : 'danger'}
              >
                {agent.consistencyScore}%
              </Chip>
            </Box>
          ))}
        </Box>
      )}
    </Card>
  )
}

// ─── Platform Cards ───────────────────────────────────────────────────────────

function PlatformCards({ platforms, loading }: { platforms: PlatformStats[]; loading: boolean }) {
  return (
    <Card variant="outlined">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <BarChartIcon sx={{ fontSize: 20, color: 'primary.500' }} />
        <Typography level="title-md">Metricas por Plataforma</Typography>
      </Box>
      <Divider sx={{ mb: 2 }} />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size="sm" />
        </Box>
      ) : platforms.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography level="body-sm" color="neutral">Sin datos de plataformas</Typography>
        </Box>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
            gap: 1.5,
          }}
        >
          {platforms.map(p => {
            const cfg = PLATFORM_CONFIG[p.platform]
            return (
              <Box
                key={p.platform}
                sx={{
                  p: 2,
                  borderRadius: 'md',
                  border: '1px solid',
                  borderColor: 'divider',
                  textAlign: 'center',
                }}
              >
                <Box sx={{ color: cfg.color, display: 'flex', justifyContent: 'center', mb: 1 }}>
                  {cfg.icon}
                </Box>
                <Typography level="title-sm" sx={{ mb: 1 }}>{cfg.label}</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography level="body-xs" color="neutral">Interacciones</Typography>
                    <Typography level="body-xs" fontWeight="md">{formatNumber(p.interactions)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography level="body-xs" color="neutral">Purchase Intents</Typography>
                    <Typography level="body-xs" fontWeight="md">{p.purchaseIntents}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography level="body-xs" color="neutral">Engagement</Typography>
                    <Chip size="sm" variant="soft" color={p.avgEngagement >= 5 ? 'success' : p.avgEngagement >= 2 ? 'warning' : 'danger'}>
                      {p.avgEngagement.toFixed(1)}%
                    </Chip>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography level="body-xs" color="neutral">Posts</Typography>
                    <Typography level="body-xs" fontWeight="md">{p.postsCount}</Typography>
                  </Box>
                </Box>
              </Box>
            )
          })}
        </Box>
      )}
    </Card>
  )
}

// ─── Activity Timeline ─────────────────────────────────────────────────────────

function ActivityTimeline({ interactions, loading }: { interactions: RecentInteraction[]; loading: boolean }) {
  return (
    <Card variant="outlined">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Forum sx={{ fontSize: 20, color: 'primary.500' }} />
        <Typography level="title-md">Actividad Reciente</Typography>
      </Box>
      <Divider sx={{ mb: 1.5 }} />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size="sm" />
        </Box>
      ) : interactions.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Forum sx={{ fontSize: 36, color: 'text.tertiary', mb: 1 }} />
          <Typography level="body-sm" color="neutral">Sin interacciones recientes</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {interactions.map((interaction, idx) => {
            const dotColor = COMMENT_TYPE_COLORS[interaction.commentType]
            const platformCfg = PLATFORM_CONFIG[interaction.platform]
            return (
              <Box
                key={interaction.id}
                sx={{
                  display: 'flex',
                  gap: 1.5,
                  pb: idx < interactions.length - 1 ? 1.5 : 0,
                  mb: idx < interactions.length - 1 ? 1.5 : 0,
                  borderBottom: idx < interactions.length - 1 ? '1px dashed' : 'none',
                  borderColor: 'divider',
                }}
              >
                {/* Timeline dot */}
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <Circle sx={{ fontSize: 10, color: dotColor, mt: 0.5 }} />
                </Box>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.25 }}>
                    <Chip
                      size="sm"
                      variant="soft"
                      sx={{ fontSize: 10 }}
                    >
                      {COMMENT_TYPE_LABELS[interaction.commentType]}
                    </Chip>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box sx={{ color: platformCfg.color, display: 'flex' }}>
                        {platformCfg.icon}
                      </Box>
                    </Box>
                    <Typography level="body-xs" color="neutral" sx={{ ml: 'auto' }}>
                      {formatTimeAgo(interaction.createdAt)}
                    </Typography>
                  </Box>
                  <Typography level="body-xs" sx={{ mb: 0.5 }} noWrap>
                    {interaction.text}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Avatar
                      src={interaction.agentAvatarUrl}
                      sx={{ width: 16, height: 16, fontSize: 8 }}
                    >
                      {interaction.agentName.charAt(0)}
                    </Avatar>
                    <Typography level="body-xs" color="neutral">{interaction.agentName}</Typography>
                  </Box>
                </Box>
              </Box>
            )
          })}
        </Box>
      )}
    </Card>
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
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
      {/* ── Header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <BarChartIcon sx={{ fontSize: 28, color: 'primary.500' }} />
          <Box>
            <Typography level="h3">UGC Analytics</Typography>
            <Typography level="body-sm" color="neutral">
              Metricas consolidadas del Pipeline de contenido
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Select
            size="sm"
            value={dateRange}
            onChange={(_, v) => v && setDateRange(v)}
            sx={{ minWidth: 120 }}
          >
            <Option value="7d">Ultimos 7 dias</Option>
            <Option value="30d">Ultimos 30 dias</Option>
            <Option value="90d">Ultimos 90 dias</Option>
          </Select>
          <IconButton variant="outlined" color="neutral" size="sm" onClick={handleRefresh} disabled={loadingStats}>
            <Refresh />
          </IconButton>
        </Box>
      </Box>

      {/* ── Error ── */}
      {error && (
        <Sheet variant="soft" color="danger" sx={{ p: 2, borderRadius: 'md', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography level="body-sm" color="danger">{error}</Typography>
            <Button size="sm" variant="plain" color="danger" onClick={fetchAnalytics}>Reintentar</Button>
          </Box>
        </Sheet>
      )}

      {/* ── 4 Big stat cards ── */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <BigStatCard
          label="Total Interacciones"
          value={stats ? formatNumber(stats.totalInteractions) : '—'}
          trend={stats?.totalInteractionsTrend ?? 0}
          icon={<Forum sx={{ fontSize: 28 }} />}
          color="primary"
          loading={loadingStats}
        />
        <BigStatCard
          label="Purchase Intents"
          value={stats ? formatNumber(stats.purchaseIntents) : '—'}
          trend={stats?.purchaseIntentsTrend ?? 0}
          icon={<AttachMoney sx={{ fontSize: 28 }} />}
          color="success"
          loading={loadingStats}
        />
        <BigStatCard
          label="Engagement Promedio"
          value={stats ? `${stats.avgEngagementRate.toFixed(1)}%` : '—'}
          trend={stats?.avgEngagementRateTrend ?? 0}
          icon={<TrendingUp sx={{ fontSize: 28 }} />}
          color="warning"
          loading={loadingStats}
        />
        <BigStatCard
          label="Auto-respondidos"
          value={stats ? formatNumber(stats.autoReplied) : '—'}
          trend={stats?.autoRepliedTrend ?? 0}
          icon={<AutoAwesome sx={{ fontSize: 28 }} />}
          color="neutral"
          loading={loadingStats}
        />
      </Box>

      {/* ── Agents + Platforms ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' }, gap: 3, mb: 3 }}>
        <AgentsTable agents={agents} loading={loadingStats} />
        <PlatformCards platforms={platforms} loading={loadingStats} />
      </Box>

      {/* ── Activity timeline ── */}
      <ActivityTimeline interactions={recentActivity} loading={loadingActivity} />
    </Box>
  )
}
