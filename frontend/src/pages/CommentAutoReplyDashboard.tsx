/**
 * CommentAutoReplyDashboard — Panel principal del sistema de Auto-Respuesta de Comentarios
 * Ruta: /comment-autoreply
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Stack,
  Card,
  CardContent,
  Button,
  Chip,
  Alert,
  CircularProgress,
  Grid,
  Sheet,
  Table,
  Divider,
  IconButton,
} from '@mui/joy'
import {
  Campaign as CampaignIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
  Visibility as VisibilityIcon,
  ThumbUp as ThumbUpIcon,
  Forum as ForumIcon,
  VisibilityOff as VisibilityOffIcon,
  Delete as DeleteIcon,
  Message as MessageIcon,
  SmartToy as SmartToyIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

const devLog = (...args: unknown[]) => { if (import.meta.env.DEV) console.log(...args) }
const devError = (...args: unknown[]) => { if (import.meta.env.DEV) console.error(...args) }

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  activeCampaigns: number
  publicRepliesSent: number
  privateRepliesSent: number
  commentsHidden: number
  commentsDeleted: number
  likesGiven: number
  repliesPerDay: Array<{ date: string; count: number }>
  recentLogs: RecentLog[]
}

interface RecentLog {
  id: number
  commenterName: string
  commentText: string
  matchedKeyword: string | null
  publicReplyStatus: string
  replySource: string
  processedAt: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const truncate = (text: string, max: number) =>
  text.length > max ? text.slice(0, max) + '…' : text

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('es-MX', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

const replySourceColor = (src: string): 'primary' | 'success' | 'warning' | 'neutral' | 'danger' => {
  const map: Record<string, 'primary' | 'success' | 'warning' | 'neutral' | 'danger'> = {
    keyword: 'primary',
    ai: 'success',
    default: 'neutral',
    offensive: 'danger',
  }
  return map[src] ?? 'neutral'
}

const publicStatusColor = (st: string): 'success' | 'warning' | 'danger' | 'neutral' => {
  const map: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
    sent: 'success',
    failed: 'danger',
    skipped: 'warning',
    pending: 'neutral',
  }
  return map[st] ?? 'neutral'
}

// ─── Mock fallback data ────────────────────────────────────────────────────────

const MOCK_STATS: DashboardStats = {
  activeCampaigns: 3,
  publicRepliesSent: 142,
  privateRepliesSent: 58,
  commentsHidden: 12,
  commentsDeleted: 4,
  likesGiven: 89,
  repliesPerDay: [
    { date: 'Lun', count: 18 },
    { date: 'Mar', count: 34 },
    { date: 'Mié', count: 22 },
    { date: 'Jue', count: 41 },
    { date: 'Vie', count: 56 },
    { date: 'Sáb', count: 28 },
    { date: 'Dom', count: 15 },
  ],
  recentLogs: [
    {
      id: 1,
      commenterName: 'María González',
      commentText: '¡Me encanta este producto! ¿Tienen envío a Monterrey?',
      matchedKeyword: 'envío',
      publicReplyStatus: 'sent',
      replySource: 'keyword',
      processedAt: new Date(Date.now() - 300000).toISOString(),
    },
    {
      id: 2,
      commenterName: 'Carlos Ramírez',
      commentText: '¿Cuál es el precio actual?',
      matchedKeyword: 'precio',
      publicReplyStatus: 'sent',
      replySource: 'keyword',
      processedAt: new Date(Date.now() - 900000).toISOString(),
    },
    {
      id: 3,
      commenterName: 'Ana Martínez',
      commentText: 'Excelente atención al cliente',
      matchedKeyword: null,
      publicReplyStatus: 'sent',
      replySource: 'ai',
      processedAt: new Date(Date.now() - 1800000).toISOString(),
    },
  ],
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string
  value: number
  icon: React.ReactNode
  color: string
  bg: string
}

function KpiCard({ label, value, icon, color, bg }: KpiCardProps) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography level="body-xs" sx={{ color: 'text.secondary', mb: 0.5 }}>
              {label}
            </Typography>
            <Typography level="h2" sx={{ fontWeight: 700, color }}>
              {(value ?? 0).toLocaleString()}
            </Typography>
          </Box>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: '12px',
              background: bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color,
            }}
          >
            {icon}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  )
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────

function SimpleBarChart({ data = [] }: { data: Array<{ date: string; count: number }> }) {
  if (!data || data.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 120, mt: 2 }}>
        <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Sin datos aún</Typography>
      </Box>
    )
  }
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 120, mt: 2 }}>
      {data.map(d => (
        <Box key={d.date} sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
          <Typography level="body-xs" sx={{ color: 'text.secondary', fontSize: 11 }}>
            {d.count}
          </Typography>
          <Box
            sx={{
              width: '100%',
              height: `${(d.count / max) * 90}px`,
              minHeight: 4,
              borderRadius: '4px 4px 0 0',
              background: 'linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)',
              transition: 'height 0.4s ease',
            }}
          />
          <Typography level="body-xs" sx={{ color: 'text.secondary', fontSize: 10 }}>
            {d.date}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CommentAutoReplyDashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get('/comment-autoreply/dashboard')
      const raw = res.data.data ?? res.data
      // Mapear nombres del backend a los del frontend
      const mapped: DashboardStats = {
        activeCampaigns: Number(raw.activeCampaigns) || 0,
        publicRepliesSent: Number(raw.totalRepliesSent ?? raw.publicRepliesSent) || 0,
        privateRepliesSent: Number(raw.totalPrivateReplies ?? raw.privateRepliesSent) || 0,
        commentsHidden: Number(raw.totalHidden ?? raw.commentsHidden) || 0,
        commentsDeleted: Number(raw.totalDeleted ?? raw.commentsDeleted) || 0,
        likesGiven: Number(raw.totalLikesGiven ?? raw.likesGiven) || 0,
        repliesPerDay: Array.isArray(raw.repliesByDay ?? raw.repliesPerDay) ? (raw.repliesByDay ?? raw.repliesPerDay) : [],
        recentLogs: Array.isArray(raw.recentLogs) ? raw.recentLogs : [],
      }
      setStats(mapped)
      devLog('[CommentAutoReplyDashboard] stats loaded', mapped)
    } catch (err: unknown) {
      devError('[CommentAutoReplyDashboard] fetch error', err)
      // Usar datos de fallback en desarrollo
      setStats(MOCK_STATS)
      if (err instanceof Error && !err.message.includes('404')) {
        setError('No se pudo cargar el dashboard. Mostrando datos de ejemplo.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  // ── Loading ──
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Stack alignItems="center" gap={2}>
          <CircularProgress size="lg" />
          <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
            Cargando dashboard...
          </Typography>
        </Stack>
      </Box>
    )
  }

  const s = stats ?? MOCK_STATS

  const kpis: KpiCardProps[] = [
    {
      label: 'Campañas Activas',
      value: s.activeCampaigns,
      icon: <CampaignIcon fontSize="small" />,
      color: '#3b82f6',
      bg: 'rgba(59,130,246,0.12)',
    },
    {
      label: 'Respuestas Públicas Enviadas',
      value: s.publicRepliesSent,
      icon: <ForumIcon fontSize="small" />,
      color: '#52b788',
      bg: 'rgba(82,183,136,0.12)',
    },
    {
      label: 'Respuestas Privadas',
      value: s.privateRepliesSent,
      icon: <MessageIcon fontSize="small" />,
      color: '#7c3aed',
      bg: 'rgba(124,58,237,0.12)',
    },
    {
      label: 'Comentarios Ocultos',
      value: s.commentsHidden,
      icon: <VisibilityOffIcon fontSize="small" />,
      color: '#f3a43b',
      bg: 'rgba(243,164,59,0.12)',
    },
    {
      label: 'Comentarios Eliminados',
      value: s.commentsDeleted,
      icon: <DeleteIcon fontSize="small" />,
      color: '#ef4444',
      bg: 'rgba(239,68,68,0.12)',
    },
    {
      label: 'Likes Dados',
      value: s.likesGiven,
      icon: <ThumbUpIcon fontSize="small" />,
      color: '#ec4899',
      bg: 'rgba(236,72,153,0.12)',
    },
  ]

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ sm: 'center' }}
        justifyContent="space-between"
        gap={2}
        mb={3}
      >
        <Box>
          <Stack direction="row" alignItems="center" gap={1.5}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: '10px',
                background: 'rgba(59,130,246,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <SmartToyIcon sx={{ color: '#3b82f6', fontSize: 22 }} />
            </Box>
            <Box>
              <Typography level="h3" sx={{ fontWeight: 700 }}>
                Auto-Respondedor de Comentarios
              </Typography>
              <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                Gestión automatizada de comentarios en redes sociales
              </Typography>
            </Box>
          </Stack>
        </Box>
        <Stack direction="row" gap={1}>
          <IconButton
            variant="outlined"
            color="neutral"
            onClick={fetchDashboard}
            title="Actualizar"
          >
            <RefreshIcon />
          </IconButton>
          <Button
            startDecorator={<AddIcon />}
            onClick={() => navigate('/comment-autoreply/campaigns')}
            sx={{ background: '#3b82f6', '&:hover': { background: '#2563eb' } }}
          >
            Nueva Campaña
          </Button>
        </Stack>
      </Stack>

      {/* Error alert */}
      {error && (
        <Alert color="warning" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* KPI Grid */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {kpis.map(kpi => (
          <Grid key={kpi.label} xs={12} sm={6} md={4}>
            <KpiCard {...kpi} />
          </Grid>
        ))}
      </Grid>

      {/* Chart + Quick Actions */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} md={8}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography level="title-sm" sx={{ fontWeight: 600, mb: 1 }}>
                Respuestas por Día — Últimos 7 días
              </Typography>
              <Divider />
              <SimpleBarChart data={s.repliesPerDay} />
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} md={4}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography level="title-sm" sx={{ fontWeight: 600, mb: 2 }}>
                Acciones Rápidas
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Stack gap={1.5}>
                <Button
                  fullWidth
                  variant="soft"
                  color="primary"
                  startDecorator={<AddIcon />}
                  onClick={() => navigate('/comment-autoreply/campaigns')}
                >
                  Nueva Campaña
                </Button>
                <Button
                  fullWidth
                  variant="soft"
                  color="neutral"
                  startDecorator={<VisibilityIcon />}
                  onClick={() => navigate('/comment-autoreply/campaigns')}
                >
                  Ver Todas las Campañas
                </Button>
                <Button
                  fullWidth
                  variant="soft"
                  color="neutral"
                  startDecorator={<CampaignIcon />}
                  onClick={() => navigate('/comment-autoreply/settings')}
                >
                  Configuración
                </Button>
              </Stack>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ p: 1.5, background: 'rgba(59,130,246,0.06)', borderRadius: 'sm', border: '1px solid rgba(59,130,246,0.2)' }}>
                <Typography level="body-xs" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                  El sistema procesa comentarios en tiempo real via webhooks de Meta. Las campañas activas responden automaticamente segun las reglas configuradas.
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Recent Logs Table */}
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
            <Typography level="title-sm" sx={{ fontWeight: 600 }}>
              Actividad Reciente
            </Typography>
            <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
              Ultimos 10 eventos
            </Typography>
          </Stack>
          <Divider sx={{ mb: 2 }} />

          {s.recentLogs.length === 0 ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <ForumIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
              <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                No hay actividad reciente
              </Typography>
            </Box>
          ) : (
            <Sheet
              variant="outlined"
              sx={{ borderRadius: 'sm', overflow: 'auto' }}
            >
              <Table
                hoverRow
                stickyHeader
                sx={{ '--TableCell-paddingY': '10px', '--TableCell-paddingX': '12px' }}
              >
                <thead>
                  <tr>
                    <th style={{ width: 140 }}>Comentarista</th>
                    <th>Comentario</th>
                    <th style={{ width: 130 }}>Keyword</th>
                    <th style={{ width: 120 }}>Estado Público</th>
                    <th style={{ width: 110 }}>Fuente</th>
                    <th style={{ width: 140 }}>Procesado</th>
                  </tr>
                </thead>
                <tbody>
                  {s.recentLogs.map(log => (
                    <tr key={log.id}>
                      <td>
                        <Typography level="body-sm" fontWeight={600}>
                          {log.commenterName}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                          {truncate(log.commentText, 50)}
                        </Typography>
                      </td>
                      <td>
                        {log.matchedKeyword ? (
                          <Chip size="sm" variant="soft" color="primary">
                            {log.matchedKeyword}
                          </Chip>
                        ) : (
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>—</Typography>
                        )}
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          variant="soft"
                          color={publicStatusColor(log.publicReplyStatus)}
                          sx={{ textTransform: 'capitalize' }}
                        >
                          {log.publicReplyStatus}
                        </Chip>
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          variant="soft"
                          color={replySourceColor(log.replySource)}
                          sx={{ textTransform: 'capitalize' }}
                        >
                          {log.replySource}
                        </Chip>
                      </td>
                      <td>
                        <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                          {formatDate(log.processedAt)}
                        </Typography>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Sheet>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}
