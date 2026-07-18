/**
 * CommentAutoReplyLogs — Historial de logs de una campaña de auto-respuesta
 * Ruta: /comment-autoreply/campaigns/:id/logs
 */
import { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft,
  ArrowClockwise,
  ThumbsUp,
  EyeSlash,
  Trash,
  FacebookLogo,
  InstagramLogo,
  ChatsCircle,
  CircleNotch,
} from '@phosphor-icons/react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import api from '../services/api'

const devLog = (...args: unknown[]) => { if (import.meta.env.DEV) console.log(...args) }
const devError = (...args: unknown[]) => { if (import.meta.env.DEV) console.error(...args) }

// ─── Types ────────────────────────────────────────────────────────────────────

type PublicReplyStatus = 'sent' | 'failed' | 'skipped' | 'pending'
type ReplySource = 'keyword' | 'ai' | 'default' | 'offensive'

interface CampaignInfo {
  id: number
  name: string
  platform: string
  campaignType: string
  status: string
  totalReplies: number
  publicRepliesSent: number
  privateRepliesSent: number
}

interface LogEntry {
  id: number
  commenterName: string
  commenterId: string
  commentText: string
  matchedKeyword: string | null
  publicReply: string | null
  publicReplyStatus: PublicReplyStatus
  privateReply: string | null
  privateReplyStatus: PublicReplyStatus
  replySource: ReplySource
  likeExecuted: boolean
  hideExecuted: boolean
  deleteExecuted: boolean
  processedAt: string
}

type BadgeVariant = NonNullable<BadgeProps['variant']>

// ─── Helpers ──────────────────────────────────────────────────────────────────

const truncate = (text: string | null | undefined, max: number) => {
  if (!text) return '—'
  return text.length > max ? text.slice(0, max) + '…' : text
}

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('es-MX', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

const statusVariant = (s: PublicReplyStatus): BadgeVariant => {
  const map: Record<PublicReplyStatus, BadgeVariant> = {
    sent: 'success',
    failed: 'destructive',
    skipped: 'warning',
    pending: 'neutral',
  }
  return map[s] ?? 'neutral'
}

const statusLabel: Record<string, string> = {
  sent: 'Enviado',
  failed: 'Fallido',
  skipped: 'Omitido',
  pending: 'Pendiente',
}

const sourceVariant = (s: ReplySource): BadgeVariant => {
  const map: Record<ReplySource, BadgeVariant> = {
    keyword: 'primary',
    ai: 'success',
    default: 'neutral',
    offensive: 'destructive',
  }
  return map[s] ?? 'neutral'
}

const sourceLabel: Record<string, string> = {
  keyword: 'Keyword',
  ai: 'IA',
  default: 'Por Defecto',
  offensive: 'Ofensivo',
}

const campaignStatusVariant = (s: string): BadgeVariant => {
  if (s === 'active') return 'success'
  if (s === 'paused') return 'warning'
  return 'neutral'
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CommentAutoReplyLogs() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [campaign, setCampaign] = useState<CampaignInfo | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [publicStatusFilter, setPublicStatusFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const LIMIT = 20

  const fetchData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      // Fetch campaign info
      const campaignRes = await api.get(`/comment-autoreply/campaigns/${id}`)
      setCampaign(campaignRes.data.data ?? campaignRes.data)

      // Fetch logs
      const params: Record<string, string | number> = { page, limit: LIMIT }
      if (publicStatusFilter !== 'all') params.publicReplyStatus = publicStatusFilter
      if (sourceFilter !== 'all') params.replySource = sourceFilter

      const logsRes = await api.get(`/comment-autoreply/campaigns/${id}/logs`, { params })
      setLogs(logsRes.data.data?.logs ?? logsRes.data.logs ?? [])
      setTotal(logsRes.data.data?.total ?? logsRes.data.total ?? 0)
      devLog('[CommentAutoReplyLogs] fetched', { campaign: campaignRes.data, logs: logsRes.data })
    } catch (err: unknown) {
      devError('[CommentAutoReplyLogs] fetch error', err)
      setError(err instanceof Error ? err.message : 'Error al cargar los logs')
    } finally {
      setLoading(false)
    }
  }, [id, page, publicStatusFilter, sourceFilter])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const totalPages = Math.ceil(total / LIMIT)

  const stats = campaign
    ? [
        { label: 'Total Procesados', value: campaign.totalReplies, tone: 'text-primary' },
        { label: 'Públicas Enviadas', value: campaign.publicRepliesSent, tone: 'text-success-text' },
        { label: 'Privadas Enviadas', value: campaign.privateRepliesSent, tone: 'text-brand-teal dark:text-brand-cyan' },
      ]
    : []

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            aria-label="Volver a campañas"
            onClick={() => navigate('/comment-autoreply/campaigns')}
          >
            <ArrowLeft className="size-5" aria-hidden />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Logs de Campaña
            </h1>
            <p className="text-sm text-muted-foreground">
              Historial detallado de comentarios procesados
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            aria-label="Actualizar"
            onClick={fetchData}
          >
            <ArrowClockwise className="size-5" aria-hidden />
          </Button>
        </div>

        {/* Campaign Info Card */}
        {campaign && (
          <div className="mb-4 rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                {campaign.platform === 'facebook' ? (
                  <FacebookLogo className="size-7 text-[#1877f2]" weight="fill" aria-hidden />
                ) : (
                  <InstagramLogo className="size-7 text-[#e4405f]" weight="fill" aria-hidden />
                )}
                <div>
                  <p className="text-base font-bold text-foreground">{campaign.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge variant="neutral">
                      {campaign.campaignType === 'post' ? 'Por Post' : 'Por Página'}
                    </Badge>
                    <Badge variant={campaignStatusVariant(campaign.status)}>
                      {campaign.status === 'active' ? 'Activa' : campaign.status === 'paused' ? 'Pausada' : 'Borrador'}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-6">
                {stats.map(stat => (
                  <div key={stat.label} className="text-center">
                    <p className={`text-2xl font-bold tabular-nums ${stat.tone}`}>
                      {stat.value.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Filter Bar */}
        <div className="mb-4 rounded-xl border border-border bg-card p-3 shadow-sm shadow-black/[0.02]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select
              value={publicStatusFilter}
              onValueChange={(v) => { setPublicStatusFilter(v); setPage(1) }}
            >
              <SelectTrigger className="w-full sm:w-[220px]" aria-label="Estado de respuesta pública">
                <SelectValue placeholder="Estado de Respuesta Pública" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="sent">Enviado</SelectItem>
                <SelectItem value="failed">Fallido</SelectItem>
                <SelectItem value="skipped">Omitido</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={sourceFilter}
              onValueChange={(v) => { setSourceFilter(v); setPage(1) }}
            >
              <SelectTrigger className="w-full sm:w-[200px]" aria-label="Fuente de respuesta">
                <SelectValue placeholder="Fuente de Respuesta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las fuentes</SelectItem>
                <SelectItem value="keyword">Keyword</SelectItem>
                <SelectItem value="ai">IA</SelectItem>
                <SelectItem value="default">Por Defecto</SelectItem>
                <SelectItem value="offensive">Ofensivo</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1" />
            <span className="self-center text-xs text-muted-foreground">
              {total} registros
            </span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/12 px-4 py-3 text-sm text-destructive-text">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <CircleNotch className="size-10 animate-spin" aria-hidden />
          </div>
        ) : logs.length === 0 ? (
          <div className="rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
            <div className="py-16 text-center">
              <ChatsCircle className="mx-auto mb-3 size-14 text-muted-foreground" aria-hidden />
              <p className="mb-0.5 text-base font-semibold text-foreground">Sin logs</p>
              <p className="text-sm text-muted-foreground">
                No hay registros con los filtros seleccionados
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    <th className="min-w-[130px] whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comentarista</th>
                    <th className="min-w-[200px] whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comentario</th>
                    <th className="w-[120px] whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Keyword</th>
                    <th className="min-w-[160px] whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Respuesta Pública</th>
                    <th className="w-[110px] whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado Público</th>
                    <th className="min-w-[160px] whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Respuesta Privada</th>
                    <th className="w-[110px] whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado Privado</th>
                    <th className="w-[100px] whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fuente</th>
                    <th className="w-[90px] whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Acciones</th>
                    <th className="w-[140px] whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map(log => (
                    <tr key={log.id} className="transition-colors hover:bg-accent/40">
                      <td className="px-3 py-2.5 align-top">
                        <p className="text-sm font-semibold text-foreground">{log.commenterName}</p>
                        <p className="text-xs text-muted-foreground">{log.commenterId}</p>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <p className="text-xs text-muted-foreground">{truncate(log.commentText, 80)}</p>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        {log.matchedKeyword ? (
                          <Badge variant="primary">{log.matchedKeyword}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <p className="text-xs text-muted-foreground">{truncate(log.publicReply, 50)}</p>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <Badge variant={statusVariant(log.publicReplyStatus)}>
                          {statusLabel[log.publicReplyStatus] ?? log.publicReplyStatus}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <p className="text-xs text-muted-foreground">{truncate(log.privateReply, 50)}</p>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <Badge variant={statusVariant(log.privateReplyStatus)}>
                          {statusLabel[log.privateReplyStatus] ?? log.privateReplyStatus}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <Badge variant={sourceVariant(log.replySource)}>
                          {sourceLabel[log.replySource] ?? log.replySource}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <div className="flex items-center gap-1">
                          {log.likeExecuted && (
                            <ThumbsUp className="size-4 text-primary" weight="fill" aria-label="Like ejecutado" />
                          )}
                          {log.hideExecuted && (
                            <EyeSlash className="size-4 text-warning-text" weight="fill" aria-label="Comentario oculto" />
                          )}
                          {log.deleteExecuted && (
                            <Trash className="size-4 text-destructive-text" weight="fill" aria-label="Comentario eliminado" />
                          )}
                          {!log.likeExecuted && !log.hideExecuted && !log.deleteExecuted && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 align-top">
                        <p className="text-xs text-muted-foreground">{formatDate(log.processedAt)}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="border-t border-border px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Página {page} de {totalPages} — {total} registros
                  </span>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page <= 1}
                      onClick={() => setPage(p => p - 1)}
                    >
                      Anterior
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page >= totalPages}
                      onClick={() => setPage(p => p + 1)}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
