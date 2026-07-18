/**
 * CommentAutoReplyDashboard — Panel principal del sistema de Auto-Respuesta de Comentarios
 * Ruta: /comment-autoreply
 */
import { useState, useEffect, useCallback } from 'react'
import { CircularProgress } from '@mui/joy'
import {
  Megaphone,
  Plus,
  ArrowClockwise,
  Eye,
  ThumbsUp,
  ChatsCircle,
  EyeSlash,
  Trash,
  ChatText,
  Robot,
} from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
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

const replySourceVariant = (src: string): BadgeProps['variant'] => {
  const map: Record<string, BadgeProps['variant']> = {
    keyword: 'primary',
    ai: 'success',
    default: 'neutral',
    offensive: 'destructive',
  }
  return map[src] ?? 'neutral'
}

const publicStatusVariant = (st: string): BadgeProps['variant'] => {
  const map: Record<string, BadgeProps['variant']> = {
    sent: 'success',
    failed: 'destructive',
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

type KpiTone = 'primary' | 'success' | 'accent' | 'warning' | 'destructive' | 'coral'

const kpiToneWrap: Record<KpiTone, string> = {
  primary: 'bg-primary/12 text-primary',
  success: 'bg-success/14 text-success-text',
  accent: 'bg-brand-cyan/15 text-[color:var(--brand-teal)] dark:text-brand-cyan',
  warning: 'bg-warning/16 text-warning-text',
  destructive: 'bg-destructive/12 text-destructive-text',
  coral: 'bg-brand-coral/15 text-brand-coral',
}

const kpiToneValue: Record<KpiTone, string> = {
  primary: 'text-foreground',
  success: 'text-success-text',
  accent: 'text-foreground',
  warning: 'text-warning-text',
  destructive: 'text-destructive-text',
  coral: 'text-foreground',
}

interface KpiCardProps {
  label: string
  value: number
  icon: React.ReactNode
  tone: KpiTone
}

function KpiCard({ label, value, icon, tone }: KpiCardProps) {
  return (
    <div className="h-full rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="mb-0.5 text-xs text-muted-foreground">{label}</p>
          <p className={cn('text-3xl font-bold tracking-tight tabular-nums', kpiToneValue[tone])}>
            {(value ?? 0).toLocaleString()}
          </p>
        </div>
        <span
          className={cn('flex size-12 shrink-0 items-center justify-center rounded-xl', kpiToneWrap[tone])}
          aria-hidden
        >
          {icon}
        </span>
      </div>
    </div>
  )
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────

function SimpleBarChart({ data = [] }: { data: Array<{ date: string; count: number }> }) {
  if (!data || data.length === 0) {
    return (
      <div className="mt-2 flex h-[120px] items-center justify-center">
        <span className="text-sm text-muted-foreground">Sin datos aún</span>
      </div>
    )
  }
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div className="mt-2 flex h-[120px] items-end gap-2">
      {data.map(d => (
        <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-[11px] text-muted-foreground">{d.count}</span>
          <div
            className="w-full rounded-t-md bg-primary transition-[height] duration-300 ease-out"
            style={{ height: `${(d.count / max) * 90}px`, minHeight: 4 }}
          />
          <span className="text-[10px] text-muted-foreground">{d.date}</span>
        </div>
      ))}
    </div>
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
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <CircularProgress size="lg" />
          <span className="text-sm text-muted-foreground">Cargando dashboard...</span>
        </div>
      </div>
    )
  }

  const s = stats ?? MOCK_STATS

  const kpis: KpiCardProps[] = [
    {
      label: 'Campañas Activas',
      value: s.activeCampaigns,
      icon: <Megaphone className="size-5" weight="fill" aria-hidden />,
      tone: 'primary',
    },
    {
      label: 'Respuestas Públicas Enviadas',
      value: s.publicRepliesSent,
      icon: <ChatsCircle className="size-5" weight="fill" aria-hidden />,
      tone: 'success',
    },
    {
      label: 'Respuestas Privadas',
      value: s.privateRepliesSent,
      icon: <ChatText className="size-5" weight="fill" aria-hidden />,
      tone: 'accent',
    },
    {
      label: 'Comentarios Ocultos',
      value: s.commentsHidden,
      icon: <EyeSlash className="size-5" weight="fill" aria-hidden />,
      tone: 'warning',
    },
    {
      label: 'Comentarios Eliminados',
      value: s.commentsDeleted,
      icon: <Trash className="size-5" weight="fill" aria-hidden />,
      tone: 'destructive',
    },
    {
      label: 'Likes Dados',
      value: s.likesGiven,
      icon: <ThumbsUp className="size-5" weight="fill" aria-hidden />,
      tone: 'coral',
    },
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary" aria-hidden>
              <Robot className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Auto-Respondedor de Comentarios
              </h1>
              <p className="text-sm text-muted-foreground">
                Gestión automatizada de comentarios en redes sociales
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar"
              className="text-muted-foreground"
              onClick={fetchDashboard}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            <Button size="sm" onClick={() => navigate('/comment-autoreply/campaigns')}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nueva Campaña
            </Button>
          </div>
        </div>

        {/* Error alert */}
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-warning/30 bg-warning/16 px-4 py-3 text-sm text-warning-text"
          >
            {error}
          </div>
        )}

        {/* KPI Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kpis.map(kpi => (
            <KpiCard key={kpi.label} {...kpi} />
          ))}
        </div>

        {/* Chart + Quick Actions */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] lg:col-span-2">
            <h2 className="mb-2 text-sm font-semibold text-foreground">
              Respuestas por Día — Últimos 7 días
            </h2>
            <div className="border-t border-border" />
            <SimpleBarChart data={s.repliesPerDay} />
          </div>
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              Acciones Rápidas
            </h2>
            <div className="mb-4 border-t border-border" />
            <div className="flex flex-col gap-3">
              <Button
                variant="primary"
                className="w-full justify-start"
                onClick={() => navigate('/comment-autoreply/campaigns')}
              >
                <Plus className="size-4" weight="bold" aria-hidden />
                Nueva Campaña
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => navigate('/comment-autoreply/campaigns')}
              >
                <Eye className="size-4" aria-hidden />
                Ver Todas las Campañas
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => navigate('/comment-autoreply/settings')}
              >
                <Megaphone className="size-4" aria-hidden />
                Configuración
              </Button>
            </div>
            <div className="my-4 border-t border-border" />
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                El sistema procesa comentarios en tiempo real via webhooks de Meta. Las campañas activas responden automaticamente segun las reglas configuradas.
              </p>
            </div>
          </div>
        </div>

        {/* Recent Logs Table */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              Actividad Reciente
            </h2>
            <span className="text-xs text-muted-foreground">Ultimos 10 eventos</span>
          </div>
          <div className="mb-4 border-t border-border" />

          {s.recentLogs.length === 0 ? (
            <div className="py-12 text-center">
              <ChatsCircle className="mx-auto mb-2 size-12 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">No hay actividad reciente</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left">
                      <th className="w-[140px] whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comentarista</th>
                      <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comentario</th>
                      <th className="w-[130px] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Keyword</th>
                      <th className="w-[120px] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado Público</th>
                      <th className="w-[110px] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fuente</th>
                      <th className="w-[140px] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Procesado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {s.recentLogs.map(log => (
                      <tr key={log.id} className="transition-colors hover:bg-accent/40">
                        <td className="px-3 py-2.5">
                          <span className="text-sm font-semibold text-foreground">
                            {log.commenterName}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-xs text-muted-foreground">
                            {truncate(log.commentText, 50)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {log.matchedKeyword ? (
                            <Badge variant="primary">{log.matchedKeyword}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant={publicStatusVariant(log.publicReplyStatus)} className="capitalize">
                            {log.publicReplyStatus}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant={replySourceVariant(log.replySource)} className="capitalize">
                            {log.replySource}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <span className="text-xs text-muted-foreground">
                            {formatDate(log.processedAt)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
