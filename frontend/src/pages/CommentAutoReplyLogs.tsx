/**
 * CommentAutoReplyLogs — Historial de logs de una campaña de auto-respuesta
 * Ruta: /comment-autoreply/campaigns/:id/logs
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
  Sheet,
  Table,
  Select,
  Option,
  Divider,
  IconButton,
} from '@mui/joy'
import {
  ArrowBack as ArrowBackIcon,
  Refresh as RefreshIcon,
  ThumbUp as ThumbUpIcon,
  VisibilityOff as VisibilityOffIcon,
  Delete as DeleteIcon,
  Facebook as FacebookIcon,
  Instagram as InstagramIcon,
  Forum as ForumIcon,
} from '@mui/icons-material'
import { useNavigate, useParams } from 'react-router-dom'
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

const statusColor = (s: PublicReplyStatus): 'success' | 'danger' | 'warning' | 'neutral' => {
  const map: Record<PublicReplyStatus, 'success' | 'danger' | 'warning' | 'neutral'> = {
    sent: 'success',
    failed: 'danger',
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

const sourceColor = (s: ReplySource): 'primary' | 'success' | 'neutral' | 'danger' => {
  const map: Record<ReplySource, 'primary' | 'success' | 'neutral' | 'danger'> = {
    keyword: 'primary',
    ai: 'success',
    default: 'neutral',
    offensive: 'danger',
  }
  return map[s] ?? 'neutral'
}

const sourceLabel: Record<string, string> = {
  keyword: 'Keyword',
  ai: 'IA',
  default: 'Por Defecto',
  offensive: 'Ofensivo',
}

const campaignStatusColor = (s: string): 'success' | 'warning' | 'neutral' => {
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

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" gap={1.5} mb={3}>
        <IconButton
          variant="outlined"
          color="neutral"
          onClick={() => navigate('/comment-autoreply/campaigns')}
          title="Volver a campañas"
        >
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography level="h3" fontWeight={700}>
            Logs de Campaña
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
            Historial detallado de comentarios procesados
          </Typography>
        </Box>
        <IconButton variant="outlined" color="neutral" onClick={fetchData} title="Actualizar">
          <RefreshIcon />
        </IconButton>
      </Stack>

      {/* Campaign Info Card */}
      {campaign && (
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              alignItems={{ sm: 'center' }}
              justifyContent="space-between"
              gap={2}
            >
              <Stack direction="row" alignItems="center" gap={1.5}>
                {campaign.platform === 'facebook' ? (
                  <FacebookIcon sx={{ color: '#1877f2', fontSize: 28 }} />
                ) : (
                  <InstagramIcon sx={{ color: '#e1306c', fontSize: 28 }} />
                )}
                <Box>
                  <Typography level="title-md" fontWeight={700}>{campaign.name}</Typography>
                  <Stack direction="row" gap={1} mt={0.5} flexWrap="wrap">
                    <Chip size="sm" variant="soft" color="neutral" sx={{ textTransform: 'capitalize' }}>
                      {campaign.campaignType === 'post' ? 'Por Post' : 'Por Página'}
                    </Chip>
                    <Chip size="sm" variant="soft" color={campaignStatusColor(campaign.status)} sx={{ textTransform: 'capitalize' }}>
                      {campaign.status === 'active' ? 'Activa' : campaign.status === 'paused' ? 'Pausada' : 'Borrador'}
                    </Chip>
                  </Stack>
                </Box>
              </Stack>
              <Stack direction="row" gap={3} flexWrap="wrap">
                {[
                  { label: 'Total Procesados', value: campaign.totalReplies, color: '#3b82f6' },
                  { label: 'Públicas Enviadas', value: campaign.publicRepliesSent, color: '#52b788' },
                  { label: 'Privadas Enviadas', value: campaign.privateRepliesSent, color: '#7c3aed' },
                ].map(stat => (
                  <Box key={stat.label} sx={{ textAlign: 'center' }}>
                    <Typography level="h3" sx={{ color: stat.color, fontWeight: 700 }}>
                      {stat.value.toLocaleString()}
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                      {stat.label}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Filter Bar */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent sx={{ py: 1.5 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}>
            <Select
              size="sm"
              value={publicStatusFilter}
              onChange={(_, v) => { setPublicStatusFilter(v ?? 'all'); setPage(1) }}
              sx={{ minWidth: 200 }}
              placeholder="Estado de Respuesta Pública"
            >
              <Option value="all">Todos los estados</Option>
              <Option value="sent">Enviado</Option>
              <Option value="failed">Fallido</Option>
              <Option value="skipped">Omitido</Option>
              <Option value="pending">Pendiente</Option>
            </Select>
            <Select
              size="sm"
              value={sourceFilter}
              onChange={(_, v) => { setSourceFilter(v ?? 'all'); setPage(1) }}
              sx={{ minWidth: 180 }}
              placeholder="Fuente de Respuesta"
            >
              <Option value="all">Todas las fuentes</Option>
              <Option value="keyword">Keyword</Option>
              <Option value="ai">IA</Option>
              <Option value="default">Por Defecto</Option>
              <Option value="offensive">Ofensivo</Option>
            </Select>
            <Box sx={{ flex: 1 }} />
            <Typography level="body-xs" sx={{ color: 'text.secondary', alignSelf: 'center' }}>
              {total} registros
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Alert color="danger" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Loading */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : logs.length === 0 ? (
        <Card variant="outlined">
          <CardContent>
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <ForumIcon sx={{ fontSize: 56, color: 'text.secondary', mb: 1.5 }} />
              <Typography level="title-md" sx={{ mb: 0.5 }}>Sin logs</Typography>
              <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                No hay registros con los filtros seleccionados
              </Typography>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Card variant="outlined">
          <Sheet sx={{ overflow: 'auto' }}>
            <Table
              hoverRow
              stickyHeader
              sx={{ '--TableCell-paddingY': '10px', '--TableCell-paddingX': '12px' }}
            >
              <thead>
                <tr>
                  <th style={{ minWidth: 130 }}>Comentarista</th>
                  <th style={{ minWidth: 200 }}>Comentario</th>
                  <th style={{ width: 120 }}>Keyword</th>
                  <th style={{ minWidth: 160 }}>Respuesta Pública</th>
                  <th style={{ width: 110 }}>Estado Público</th>
                  <th style={{ minWidth: 160 }}>Respuesta Privada</th>
                  <th style={{ width: 110 }}>Estado Privado</th>
                  <th style={{ width: 100 }}>Fuente</th>
                  <th style={{ width: 90 }}>Acciones</th>
                  <th style={{ width: 140 }}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td>
                      <Typography level="body-sm" fontWeight={600}>
                        {log.commenterName}
                      </Typography>
                      <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                        {log.commenterId}
                      </Typography>
                    </td>
                    <td>
                      <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                        {truncate(log.commentText, 80)}
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
                      <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                        {truncate(log.publicReply, 50)}
                      </Typography>
                    </td>
                    <td>
                      <Chip size="sm" variant="soft" color={statusColor(log.publicReplyStatus)}>
                        {statusLabel[log.publicReplyStatus] ?? log.publicReplyStatus}
                      </Chip>
                    </td>
                    <td>
                      <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                        {truncate(log.privateReply, 50)}
                      </Typography>
                    </td>
                    <td>
                      <Chip size="sm" variant="soft" color={statusColor(log.privateReplyStatus)}>
                        {statusLabel[log.privateReplyStatus] ?? log.privateReplyStatus}
                      </Chip>
                    </td>
                    <td>
                      <Chip size="sm" variant="soft" color={sourceColor(log.replySource)}>
                        {sourceLabel[log.replySource] ?? log.replySource}
                      </Chip>
                    </td>
                    <td>
                      <Stack direction="row" gap={0.25}>
                        {log.likeExecuted && (
                          <ThumbUpIcon
                            sx={{ fontSize: 16, color: '#3b82f6' }}
                            titleAccess="Like ejecutado"
                          />
                        )}
                        {log.hideExecuted && (
                          <VisibilityOffIcon
                            sx={{ fontSize: 16, color: '#f3a43b' }}
                            titleAccess="Comentario oculto"
                          />
                        )}
                        {log.deleteExecuted && (
                          <DeleteIcon
                            sx={{ fontSize: 16, color: '#ef4444' }}
                            titleAccess="Comentario eliminado"
                          />
                        )}
                        {!log.likeExecuted && !log.hideExecuted && !log.deleteExecuted && (
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>—</Typography>
                        )}
                      </Stack>
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

          {/* Pagination */}
          {totalPages > 1 && (
            <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                  Página {page} de {totalPages} — {total} registros
                </Typography>
                <Stack direction="row" gap={0.5}>
                  <Button
                    size="sm"
                    variant="outlined"
                    color="neutral"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    Anterior
                  </Button>
                  <Button
                    size="sm"
                    variant="outlined"
                    color="neutral"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Siguiente
                  </Button>
                </Stack>
              </Stack>
            </Box>
          )}
        </Card>
      )}
    </Box>
  )
}
