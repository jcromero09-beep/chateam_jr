import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircularProgress } from '@mui/joy'
import {
  Plus,
  Sparkle,
  User,
  Megaphone,
  VideoCamera,
  Image as ImageIcon,
  TrendUp,
  ArrowClockwise,
  CaretRight,
  Circle,
} from '@phosphor-icons/react'
import { Avatar } from '@/components/ui/avatar'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devError = (...args: unknown[]) => { if (isDev) console.error(...args) }

// ─── Types ────────────────────────────────────────────────────────────────────

interface IdentitySummary {
  id: number
  name: string
  handle: string
  platform: string
  niche: string
  avatarUrl?: string
  isOnline: boolean
  interactionsToday: number
}

interface CampaignSummary {
  id: number
  name: string
  status: 'active' | 'paused' | 'completed' | 'draft' | 'producing' | 'review' | 'publishing' | 'optimizing' | 'archived'
  videosCount: number
  identitiesCount: number
  startDate: string
}

interface UGCStats {
  totalIdentities: number
  totalCampaigns: number
  activeCampaigns?: number
  videosGenerated: number
  generatedImages: number
  totalInteractions: number
}

const STATUS_COLOR_MAP: Record<CampaignSummary['status'], BadgeProps['variant']> = {
  active:    'success',
  producing: 'warning',
  review:    'primary',
  publishing:'warning',
  optimizing:'primary',
  paused:    'warning',
  completed: 'neutral',
  draft:     'primary',
  archived:  'neutral',
}

const STATUS_LABEL_MAP: Record<CampaignSummary['status'], string> = {
  active:    'Activa',
  producing: 'Produciendo',
  review:    'Revision',
  publishing:'Publicando',
  optimizing:'Optimizando',
  paused:    'Pausada',
  completed: 'Completada',
  draft:     'Borrador',
  archived:  'Archivada',
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

type StatTone = 'primary' | 'success' | 'warning' | 'neutral'

interface StatCardProps {
  label: string
  value: string | number
  icon: React.ReactNode
  tone?: StatTone
  loading?: boolean
}

const valueTone: Record<StatTone, string> = {
  primary: 'text-foreground',
  success: 'text-success-text',
  warning: 'text-warning-text',
  neutral: 'text-foreground',
}

function StatCard({ label, value, icon, tone = 'primary', loading }: StatCardProps) {
  return (
    <div className="min-w-[160px] flex-1 rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 text-sm text-muted-foreground">{label}</p>
          {loading ? (
            <CircularProgress size="sm" />
          ) : (
            <p className={cn('text-3xl font-semibold tracking-tight tabular-nums', valueTone[tone])}>
              {value}
            </p>
          )}
        </div>
        <span className="shrink-0 text-muted-foreground/70">{icon}</span>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UGCDashboard() {
  const navigate = useNavigate()

  const [stats, setStats]             = useState<UGCStats | null>(null)
  const [identities, setIdentities]   = useState<IdentitySummary[]>([])
  const [campaigns, setCampaigns]     = useState<CampaignSummary[]>([])
  const [loadingStats, setLoadingStats]         = useState(true)
  const [loadingIdentities, setLoadingIdentities] = useState(true)
  const [loadingCampaigns, setLoadingCampaigns]   = useState(true)
  const [error, setError]             = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoadingStats(true)
    setLoadingIdentities(true)
    setLoadingCampaigns(true)
    setError(null)

    api.get('/ugc/dashboard')
      .then(({ data }) => {
        const payload = data.data ?? data
        const identityList = (payload.identities ?? []).map((identity: any) => ({
          id: identity.id,
          name: identity.name,
          handle: identity.usernameSuggestion || identity.handle || '',
          platform: Array.isArray(identity.platformFocus) ? identity.platformFocus[0] || 'ugc' : 'ugc',
          niche: identity.niche || '',
          avatarUrl: identity.avatarUrl,
          isOnline: identity.status === 'active',
          interactionsToday: 0,
        }))
        const campaignList = (payload.campaigns ?? []).map((campaign: any) => ({
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          videosCount: campaign.totalVideosGenerated || campaign.generationConfig?.videoCount || 0,
          identitiesCount: campaign.generationConfig?.identitiesCount || 0,
          startDate: campaign.startedAt || campaign.createdAt,
        }))

        setStats(payload.stats)
        setIdentities(identityList)
        setCampaigns(campaignList)
      })
      .catch(err => {
        devError('[UGCDashboard] dashboard error:', err)
        setError('Error al cargar los datos del dashboard.')
      })
      .finally(() => {
        setLoadingStats(false)
        setLoadingIdentities(false)
        setLoadingCampaigns(false)
      })
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6">
        {/* ── Page header ── */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">UGC Pipeline</h1>
            <p className="text-sm text-muted-foreground">
              Dashboard de contenido generado por usuario con identidades IA
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <ArrowClockwise className="size-4" aria-hidden />
              Actualizar
            </Button>
            <Button size="sm" onClick={() => navigate('/ugc/campaigns')}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nueva Campaña
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/12 p-3 text-sm text-destructive-text">
            {error}
          </div>
        )}

        {/* ── Stat cards ── */}
        <div className="flex flex-wrap gap-4">
          <StatCard
            label="Total Identidades"
            value={stats ? formatNumber(stats.totalIdentities) : '—'}
            icon={<User className="size-7" aria-hidden />}
            tone="primary"
            loading={loadingStats}
          />
          <StatCard
            label="Campañas UGC"
            value={stats ? formatNumber(stats.totalCampaigns) : '—'}
            icon={<Megaphone className="size-7" aria-hidden />}
            tone="success"
            loading={loadingStats}
          />
          <StatCard
            label="Videos Generados"
            value={stats ? formatNumber(stats.videosGenerated) : '—'}
            icon={<VideoCamera className="size-7" aria-hidden />}
            tone="warning"
            loading={loadingStats}
          />
          <StatCard
            label="Imágenes Generadas"
            value={stats ? formatNumber(stats.generatedImages) : '—'}
            icon={<ImageIcon className="size-7" aria-hidden />}
            tone="primary"
            loading={loadingStats}
          />
          <StatCard
            label="Total Interacciones"
            value={stats ? formatNumber(stats.totalInteractions) : '—'}
            icon={<TrendUp className="size-7" aria-hidden />}
            tone="neutral"
            loading={loadingStats}
          />
        </div>

        {/* ── Two-column grid ── */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Recent identities */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkle className="size-[18px] text-primary" weight="fill" aria-hidden />
                <h2 className="text-base font-semibold text-foreground">Identidades Recientes</h2>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/ugc/identities')}>
                Ver todas
                <CaretRight className="size-4" aria-hidden />
              </Button>
            </div>

            <div className="mb-3 border-t border-border" />

            {loadingIdentities ? (
              <div className="flex justify-center py-6">
                <CircularProgress size="sm" />
              </div>
            ) : identities.length === 0 ? (
              <div className="py-6 text-center">
                <User className="mx-auto mb-2 size-9 text-muted-foreground/60" aria-hidden />
                <p className="text-sm text-muted-foreground">Sin identidades aún</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1"
                  onClick={() => navigate('/ugc/identities')}
                >
                  <Plus className="size-4" weight="bold" aria-hidden />
                  Crear identidad
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {identities.map(identity => (
                  <button
                    key={identity.id}
                    type="button"
                    onClick={() => navigate('/ugc/identities')}
                    className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-accent/50"
                  >
                    <span className="relative shrink-0">
                      {identity.avatarUrl ? (
                        <img
                          src={identity.avatarUrl}
                          alt=""
                          width={32}
                          height={32}
                          className="size-8 rounded-full object-cover"
                        />
                      ) : (
                        <Avatar name={identity.name} size="sm" />
                      )}
                      <Circle
                        weight="fill"
                        aria-hidden
                        className={cn(
                          'absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full',
                          identity.isOnline ? 'text-success' : 'text-muted-foreground/40',
                        )}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {identity.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        @{identity.handle} · {identity.niche}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatNumber(identity.interactionsToday)} hoy
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Recent campaigns */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Megaphone className="size-[18px] text-success-text" weight="fill" aria-hidden />
                <h2 className="text-base font-semibold text-foreground">Campañas Recientes</h2>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/ugc/campaigns')}>
                Ver todas
                <CaretRight className="size-4" aria-hidden />
              </Button>
            </div>

            <div className="mb-3 border-t border-border" />

            {loadingCampaigns ? (
              <div className="flex justify-center py-6">
                <CircularProgress size="sm" />
              </div>
            ) : campaigns.length === 0 ? (
              <div className="py-6 text-center">
                <Megaphone className="mx-auto mb-2 size-9 text-muted-foreground/60" aria-hidden />
                <p className="text-sm text-muted-foreground">Sin campañas aún</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1"
                  onClick={() => navigate('/ugc/campaigns')}
                >
                  <Plus className="size-4" weight="bold" aria-hidden />
                  Crear campaña
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {campaigns.map(campaign => (
                  <button
                    key={campaign.id}
                    type="button"
                    onClick={() => navigate('/ugc/campaigns')}
                    className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-accent/50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {campaign.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {campaign.videosCount} videos · {campaign.identitiesCount} identidades
                      </span>
                    </span>
                    <Badge variant={STATUS_COLOR_MAP[campaign.status]}>
                      {STATUS_LABEL_MAP[campaign.status]}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
