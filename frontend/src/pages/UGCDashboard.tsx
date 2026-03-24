import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Typography,
  Card,
  Chip,
  Avatar,
  Button,
  CircularProgress,
  Sheet,
  Divider,
} from '@mui/joy'
import {
  Add,
  AutoAwesome,
  Person,
  Campaign,
  Videocam,
  TrendingUp,
  Refresh,
  ChevronRight,
  Circle,
} from '@mui/icons-material'
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
  status: 'active' | 'paused' | 'completed' | 'draft'
  videosCount: number
  identitiesCount: number
  startDate: string
}

interface UGCStats {
  totalIdentities: number
  activeCampaigns: number
  videosGenerated: number
  totalInteractions: number
}

const STATUS_COLOR_MAP: Record<CampaignSummary['status'], 'success' | 'warning' | 'neutral' | 'primary'> = {
  active:    'success',
  paused:    'warning',
  completed: 'neutral',
  draft:     'primary',
}

const STATUS_LABEL_MAP: Record<CampaignSummary['status'], string> = {
  active:    'Activa',
  paused:    'Pausada',
  completed: 'Completada',
  draft:     'Borrador',
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: string | number
  icon: React.ReactNode
  color?: 'primary' | 'success' | 'warning' | 'neutral'
  loading?: boolean
}

function StatCard({ label, value, icon, color = 'primary', loading }: StatCardProps) {
  return (
    <Card variant="soft" color={color} sx={{ flex: 1, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography level="body-xs" sx={{ mb: 0.5, opacity: 0.8 }}>{label}</Typography>
          {loading ? (
            <CircularProgress size="sm" />
          ) : (
            <Typography level="h3" fontWeight={700}>{value}</Typography>
          )}
        </Box>
        <Box sx={{ opacity: 0.7 }}>{icon}</Box>
      </Box>
    </Card>
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

    // Identidades recientes (usadas también para stats)
    api.get('/ugc/identities?limit=5')
      .then(({ data }) => {
        const list: IdentitySummary[] = data.data ?? data ?? []
        setIdentities(list)
        // Derive stats from available data if no dedicated stats endpoint
        setStats(prev => ({
          totalIdentities: data.total ?? list.length,
          activeCampaigns: prev?.activeCampaigns ?? 0,
          videosGenerated: prev?.videosGenerated ?? 0,
          totalInteractions: list.reduce((acc, i) => acc + (i.interactionsToday ?? 0), 0),
        }))
      })
      .catch(err => {
        devError('[UGCDashboard] identities error:', err)
        setError('Error al cargar los datos del dashboard.')
      })
      .finally(() => {
        setLoadingStats(false)
        setLoadingIdentities(false)
      })

    // Campañas recientes
    api.get('/ugc/campaigns?limit=5')
      .then(({ data }) => {
        const list: CampaignSummary[] = data.data ?? data ?? []
        setCampaigns(list)
        setStats(prev => ({
          totalIdentities: prev?.totalIdentities ?? 0,
          activeCampaigns: list.filter(c => c.status === 'active').length,
          videosGenerated: prev?.videosGenerated ?? 0,
          totalInteractions: prev?.totalInteractions ?? 0,
        }))
      })
      .catch(() => {
        // Campañas puede no existir aún — no es error crítico
        setCampaigns([])
      })
      .finally(() => setLoadingCampaigns(false))
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
      {/* ── Page header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography level="h2">UGC Pipeline</Typography>
          <Typography level="body-sm" color="neutral">
            Dashboard de contenido generado por usuario con identidades IA
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            color="neutral"
            startDecorator={<Refresh />}
            size="sm"
            onClick={fetchData}
          >
            Actualizar
          </Button>
          <Button
            startDecorator={<Add />}
            size="sm"
            onClick={() => navigate('/ugc/identities')}
          >
            Nueva Campaña
          </Button>
        </Box>
      </Box>

      {error && (
        <Sheet variant="soft" color="danger" sx={{ p: 2, borderRadius: 'md', mb: 3 }}>
          <Typography level="body-sm" color="danger">{error}</Typography>
        </Sheet>
      )}

      {/* ── Stat cards ── */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <StatCard
          label="Total Identidades"
          value={stats ? formatNumber(stats.totalIdentities) : '—'}
          icon={<Person sx={{ fontSize: 28 }} />}
          color="primary"
          loading={loadingStats}
        />
        <StatCard
          label="Campañas Activas"
          value={stats ? formatNumber(stats.activeCampaigns) : '—'}
          icon={<Campaign sx={{ fontSize: 28 }} />}
          color="success"
          loading={loadingStats}
        />
        <StatCard
          label="Videos Generados"
          value={stats ? formatNumber(stats.videosGenerated) : '—'}
          icon={<Videocam sx={{ fontSize: 28 }} />}
          color="warning"
          loading={loadingStats}
        />
        <StatCard
          label="Total Interacciones"
          value={stats ? formatNumber(stats.totalInteractions) : '—'}
          icon={<TrendingUp sx={{ fontSize: 28 }} />}
          color="neutral"
          loading={loadingStats}
        />
      </Box>

      {/* ── Two-column grid ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
        {/* Recent identities */}
        <Card variant="outlined">
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AutoAwesome sx={{ fontSize: 18, color: 'primary.500' }} />
              <Typography level="title-md">Identidades Recientes</Typography>
            </Box>
            <Button
              variant="plain"
              size="sm"
              endDecorator={<ChevronRight />}
              onClick={() => navigate('/ugc/identities')}
            >
              Ver todas
            </Button>
          </Box>

          <Divider sx={{ mb: 1.5 }} />

          {loadingIdentities ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size="sm" />
            </Box>
          ) : identities.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <Person sx={{ fontSize: 36, color: 'text.tertiary', mb: 1 }} />
              <Typography level="body-sm" color="neutral">Sin identidades aún</Typography>
              <Button
                size="sm"
                variant="plain"
                startDecorator={<Add />}
                onClick={() => navigate('/ugc/identities')}
                sx={{ mt: 1 }}
              >
                Crear identidad
              </Button>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {identities.map(identity => (
                <Box
                  key={identity.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1,
                    borderRadius: 'sm',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'neutral.softBg' },
                    transition: 'background-color 0.15s',
                  }}
                  onClick={() => navigate('/ugc/identities')}
                >
                  <Box sx={{ position: 'relative', flexShrink: 0 }}>
                    <Avatar src={identity.avatarUrl} sx={{ width: 32, height: 32, fontSize: 12 }}>
                      {identity.name.charAt(0)}
                    </Avatar>
                    <Circle
                      sx={{
                        position: 'absolute',
                        bottom: -1,
                        right: -1,
                        fontSize: 8,
                        color: identity.isOnline ? 'success.500' : 'neutral.400',
                      }}
                    />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography level="body-sm" fontWeight="md" noWrap>{identity.name}</Typography>
                    <Typography level="body-xs" color="neutral" noWrap>@{identity.handle} · {identity.niche}</Typography>
                  </Box>
                  <Typography level="body-xs" color="neutral">
                    {formatNumber(identity.interactionsToday)} hoy
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </Card>

        {/* Recent campaigns */}
        <Card variant="outlined">
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Campaign sx={{ fontSize: 18, color: 'success.500' }} />
              <Typography level="title-md">Campañas Recientes</Typography>
            </Box>
            <Button
              variant="plain"
              size="sm"
              endDecorator={<ChevronRight />}
              onClick={() => navigate('/ugc/campaigns')}
            >
              Ver todas
            </Button>
          </Box>

          <Divider sx={{ mb: 1.5 }} />

          {loadingCampaigns ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size="sm" />
            </Box>
          ) : campaigns.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <Campaign sx={{ fontSize: 36, color: 'text.tertiary', mb: 1 }} />
              <Typography level="body-sm" color="neutral">Sin campañas aún</Typography>
              <Button
                size="sm"
                variant="plain"
                startDecorator={<Add />}
                onClick={() => navigate('/ugc/campaigns')}
                sx={{ mt: 1 }}
              >
                Crear campaña
              </Button>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {campaigns.map(campaign => (
                <Box
                  key={campaign.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1,
                    borderRadius: 'sm',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'neutral.softBg' },
                    transition: 'background-color 0.15s',
                  }}
                  onClick={() => navigate('/ugc/campaigns')}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography level="body-sm" fontWeight="md" noWrap>{campaign.name}</Typography>
                    <Typography level="body-xs" color="neutral" noWrap>
                      {campaign.videosCount} videos · {campaign.identitiesCount} identidades
                    </Typography>
                  </Box>
                  <Chip
                    size="sm"
                    variant="soft"
                    color={STATUS_COLOR_MAP[campaign.status]}
                  >
                    {STATUS_LABEL_MAP[campaign.status]}
                  </Chip>
                </Box>
              ))}
            </Box>
          )}
        </Card>
      </Box>
    </Box>
  )
}
