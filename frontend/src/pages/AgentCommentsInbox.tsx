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
  Tab,
  TabList,
  Tabs,
  Select,
  Option,
  IconButton,
} from '@mui/joy'
import {
  Forum,
  Refresh,
  AttachMoney,
  HelpOutline,
  ThumbUp,
  Report,
  Remove,
  AutoAwesome,
  CheckCircle,
  Person,
  Instagram,
  Videocam,
  Ballot,
} from '@mui/icons-material'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devError = (...args: unknown[]) => { if (isDev) console.error(...args) }

// ─── Types ────────────────────────────────────────────────────────────────────

type CommentType = 'purchase_intent' | 'question' | 'praise' | 'complaint' | 'neutral'
type CommentPlatform = 'instagram' | 'tiktok' | 'facebook' | 'youtube'
type ReplyStatus = 'pending' | 'generated' | 'sent'

interface InboxComment {
  id: number
  text: string
  authorUsername: string
  authorAvatarUrl?: string
  commentType: CommentType
  platform: CommentPlatform
  replyStatus: ReplyStatus
  autoReplyContent?: string
  createdAt: string
  assignedAgent?: {
    id: number
    name: string
    avatarUrl?: string
  }
}

interface InboxStats {
  totalToday: number
  purchaseIntents: number
  autoReplied: number
  pending: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COMMENT_TYPE_CONFIG: Record<CommentType, {
  label: string
  color: 'success' | 'primary' | 'warning' | 'danger' | 'neutral'
  borderColor: string
  icon: React.ReactNode
}> = {
  purchase_intent: {
    label: 'Purchase Intent',
    color: 'success',
    borderColor: 'var(--joy-palette-success-500, #1F7A1F)',
    icon: <AttachMoney sx={{ fontSize: 14 }} />,
  },
  question: {
    label: 'Pregunta',
    color: 'primary',
    borderColor: 'var(--joy-palette-primary-500, #0B6BCB)',
    icon: <HelpOutline sx={{ fontSize: 14 }} />,
  },
  praise: {
    label: 'Elogio',
    color: 'warning',
    borderColor: 'var(--joy-palette-warning-500, #9A5B13)',
    icon: <ThumbUp sx={{ fontSize: 14 }} />,
  },
  complaint: {
    label: 'Queja',
    color: 'danger',
    borderColor: 'var(--joy-palette-danger-500, #C41C1C)',
    icon: <Report sx={{ fontSize: 14 }} />,
  },
  neutral: {
    label: 'Neutral',
    color: 'neutral',
    borderColor: 'var(--joy-palette-neutral-400, #9FA6AD)',
    icon: <Remove sx={{ fontSize: 14 }} />,
  },
}

const PLATFORM_CONFIG: Record<CommentPlatform, { label: string; color: string; icon: React.ReactNode }> = {
  instagram: { label: 'Instagram', color: '#E1306C', icon: <Instagram sx={{ fontSize: 14 }} /> },
  tiktok:    { label: 'TikTok',    color: '#010101', icon: <Videocam sx={{ fontSize: 14 }} /> },
  facebook:  { label: 'Facebook',  color: '#1877F2', icon: <Ballot sx={{ fontSize: 14 }} /> },
  youtube:   { label: 'YouTube',   color: '#FF0000', icon: <Videocam sx={{ fontSize: 14 }} /> },
}

const TAB_FILTERS: { value: CommentType | 'all'; label: string }[] = [
  { value: 'all',            label: 'Todos' },
  { value: 'purchase_intent', label: 'Purchase Intent' },
  { value: 'question',       label: 'Preguntas' },
  { value: 'praise',         label: 'Elogios' },
  { value: 'complaint',      label: 'Quejas' },
  { value: 'neutral',        label: 'Neutral' },
]

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'ahora'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours}h`
  return `hace ${Math.floor(hours / 24)}d`
}

// ─── Stats Strip ──────────────────────────────────────────────────────────────

function StatsStrip({ stats, loading }: { stats: InboxStats | null; loading: boolean }) {
  const items = [
    { label: 'Comentarios hoy', value: stats?.totalToday ?? 0, color: 'primary' as const },
    { label: 'Purchase intents', value: stats?.purchaseIntents ?? 0, color: 'success' as const },
    { label: 'Auto-respondidos', value: stats?.autoReplied ?? 0, color: 'warning' as const },
    { label: 'Pendientes', value: stats?.pending ?? 0, color: 'danger' as const },
  ]
  return (
    <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
      {items.map(item => (
        <Card key={item.label} variant="soft" color={item.color} sx={{ flex: 1, minWidth: 140, py: 1.5, px: 2 }}>
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

// ─── Comment Card ─────────────────────────────────────────────────────────────

interface CommentCardProps {
  comment: InboxComment
  onReply: (commentId: number) => void
  onClassify: (commentId: number) => void
  replyingId: number | null
  classifyingId: number | null
}

function CommentCard({ comment, onReply, onClassify, replyingId, classifyingId }: CommentCardProps) {
  const typeConfig     = COMMENT_TYPE_CONFIG[comment.commentType]
  const platformConfig = PLATFORM_CONFIG[comment.platform]
  const isReplying     = replyingId === comment.id
  const isClassifying  = classifyingId === comment.id

  return (
    <Card
      variant="outlined"
      sx={{
        borderLeft: `4px solid ${typeConfig.borderColor}`,
        mb: 1.5,
      }}
    >
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        {/* Author avatar */}
        <Avatar src={comment.authorAvatarUrl} sx={{ width: 36, height: 36, flexShrink: 0 }}>
          {comment.authorUsername.charAt(0).toUpperCase()}
        </Avatar>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Author row */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
            <Typography level="body-sm" fontWeight="lg">@{comment.authorUsername}</Typography>
            <Chip
              size="sm"
              variant="soft"
              color={typeConfig.color}
              startDecorator={typeConfig.icon}
            >
              {typeConfig.label}
            </Chip>
            <Chip
              size="sm"
              variant="outlined"
              sx={{ color: platformConfig.color, borderColor: platformConfig.color }}
              startDecorator={platformConfig.icon}
            >
              {platformConfig.label}
            </Chip>
            <Typography level="body-xs" color="neutral" sx={{ ml: 'auto' }}>
              {formatTimeAgo(comment.createdAt)}
            </Typography>
          </Box>

          {/* Comment text */}
          <Typography level="body-sm" sx={{ mb: 1, lineHeight: 1.5 }}>
            {comment.text}
          </Typography>

          {/* Auto-reply bubble */}
          {comment.autoReplyContent && (
            <Box
              sx={{
                bgcolor: 'primary.softBg',
                borderRadius: 'sm',
                p: 1.5,
                mb: 1,
                borderLeft: '3px solid',
                borderColor: 'primary.500',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                <AutoAwesome sx={{ fontSize: 13, color: 'primary.500' }} />
                <Typography level="body-xs" color="primary" fontWeight="md">
                  Respuesta generada
                </Typography>
              </Box>
              <Typography level="body-sm">{comment.autoReplyContent}</Typography>
            </Box>
          )}

          {/* Footer row */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            {/* Assigned agent */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              {comment.assignedAgent ? (
                <>
                  <Avatar
                    src={comment.assignedAgent.avatarUrl}
                    sx={{ width: 22, height: 22, fontSize: 9 }}
                  >
                    {comment.assignedAgent.name.charAt(0)}
                  </Avatar>
                  <Typography level="body-xs" color="neutral">
                    {comment.assignedAgent.name}
                  </Typography>
                </>
              ) : (
                <>
                  <Person sx={{ fontSize: 18, color: 'text.tertiary' }} />
                  <Typography level="body-xs" color="neutral">Sin asignar</Typography>
                </>
              )}
            </Box>

            {/* Status + actions */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {comment.replyStatus === 'sent' && (
                <Chip size="sm" variant="soft" color="success" startDecorator={<CheckCircle sx={{ fontSize: 13 }} />}>
                  Enviado
                </Chip>
              )}
              {comment.replyStatus === 'generated' && (
                <Chip size="sm" variant="soft" color="warning">
                  Generado
                </Chip>
              )}

              {comment.commentType === 'neutral' && (
                <Button
                  size="sm"
                  variant="outlined"
                  color="neutral"
                  loading={isClassifying}
                  onClick={() => onClassify(comment.id)}
                >
                  Clasificar
                </Button>
              )}

              {comment.replyStatus === 'pending' && (
                <Button
                  size="sm"
                  variant="soft"
                  color="primary"
                  startDecorator={isReplying ? undefined : <AutoAwesome sx={{ fontSize: 14 }} />}
                  loading={isReplying}
                  onClick={() => onReply(comment.id)}
                >
                  Generar Respuesta
                </Button>
              )}
            </Box>
          </Box>
        </Box>
      </Box>
    </Card>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AgentCommentsInbox() {
  const [comments, setComments]       = useState<InboxComment[]>([])
  const [stats, setStats]             = useState<InboxStats | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [activeTab, setActiveTab]     = useState<CommentType | 'all'>('all')
  const [platformFilter, setPlatformFilter] = useState<CommentPlatform | 'all'>('all')
  const [statusFilter, setStatusFilter]     = useState<ReplyStatus | 'all'>('all')
  const [replyingId, setReplyingId]   = useState<number | null>(null)
  const [classifyingId, setClassifyingId] = useState<number | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/ugc/interactions/inbox')
      const list: InboxComment[] = data.data ?? data ?? []
      setComments(list)
      // Derive stats from list
      setStats({
        totalToday: list.length,
        purchaseIntents: list.filter(c => c.commentType === 'purchase_intent').length,
        autoReplied: list.filter(c => c.replyStatus === 'sent').length,
        pending: list.filter(c => c.replyStatus === 'pending').length,
      })
    } catch (err: unknown) {
      devError('[AgentCommentsInbox] fetch error:', err)
      setError('No se pudo cargar la bandeja. Verifica tu conexion.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleReply = async (commentId: number) => {
    setReplyingId(commentId)
    try {
      const { data } = await api.post(`/ugc/interactions/${commentId}/reply`)
      const replyContent: string = data.data?.replyContent ?? data.replyContent ?? ''
      setComments(prev => prev.map(c =>
        c.id === commentId
          ? { ...c, replyStatus: 'generated', autoReplyContent: replyContent }
          : c
      ))
    } catch (err: unknown) {
      devError('[AgentCommentsInbox] reply error:', err)
    } finally {
      setReplyingId(null)
    }
  }

  const handleClassify = async (commentId: number) => {
    setClassifyingId(commentId)
    try {
      const { data } = await api.post(`/ugc/interactions/${commentId}/classify`)
      const newType: CommentType = data.data?.commentType ?? data.commentType ?? 'neutral'
      setComments(prev => prev.map(c =>
        c.id === commentId ? { ...c, commentType: newType } : c
      ))
    } catch (err: unknown) {
      devError('[AgentCommentsInbox] classify error:', err)
    } finally {
      setClassifyingId(null)
    }
  }

  const filteredComments = comments.filter(c => {
    if (activeTab !== 'all' && c.commentType !== activeTab) return false
    if (platformFilter !== 'all' && c.platform !== platformFilter) return false
    if (statusFilter !== 'all' && c.replyStatus !== statusFilter) return false
    return true
  })

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000, mx: 'auto' }}>
      {/* ── Header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Forum sx={{ fontSize: 28, color: 'primary.500' }} />
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography level="h3">Bandeja de Comentarios</Typography>
              <Chip size="sm" variant="soft" color="success">
                Auto-respondiendo
              </Chip>
            </Box>
            <Typography level="body-sm" color="neutral">
              Comentarios clasificados con respuesta automatica
            </Typography>
          </Box>
        </Box>
        <IconButton variant="outlined" color="neutral" size="sm" onClick={fetchData} disabled={loading}>
          <Refresh />
        </IconButton>
      </Box>

      {/* ── Stats strip ── */}
      <StatsStrip stats={stats} loading={loading} />

      {/* ── Error state ── */}
      {error && (
        <Sheet variant="soft" color="danger" sx={{ p: 2, borderRadius: 'md', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography level="body-sm" color="danger">{error}</Typography>
            <Button size="sm" variant="plain" color="danger" onClick={fetchData}>Reintentar</Button>
          </Box>
        </Sheet>
      )}

      {/* ── Type filter tabs ── */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v as CommentType | 'all')}
        sx={{ mb: 2, bgcolor: 'transparent' }}
      >
        <TabList variant="plain" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
          {TAB_FILTERS.map(tab => (
            <Tab key={tab.value} value={tab.value} sx={{ borderRadius: 'sm' }}>
              {tab.label}
            </Tab>
          ))}
        </TabList>
      </Tabs>

      {/* ── Secondary filters ── */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap' }}>
        <Select
          size="sm"
          value={platformFilter}
          onChange={(_, v) => setPlatformFilter(v as CommentPlatform | 'all')}
          sx={{ minWidth: 140 }}
          placeholder="Plataforma"
        >
          <Option value="all">Todas las plataformas</Option>
          <Option value="instagram">Instagram</Option>
          <Option value="tiktok">TikTok</Option>
          <Option value="facebook">Facebook</Option>
          <Option value="youtube">YouTube</Option>
        </Select>

        <Select
          size="sm"
          value={statusFilter}
          onChange={(_, v) => setStatusFilter(v as ReplyStatus | 'all')}
          sx={{ minWidth: 140 }}
          placeholder="Estado respuesta"
        >
          <Option value="all">Todos los estados</Option>
          <Option value="pending">Pendiente</Option>
          <Option value="generated">Generado</Option>
          <Option value="sent">Enviado</Option>
        </Select>

        <Typography level="body-xs" color="neutral" sx={{ alignSelf: 'center', ml: 'auto' }}>
          {filteredComments.length} comentario{filteredComments.length !== 1 ? 's' : ''}
        </Typography>
      </Box>

      <Divider sx={{ mb: 2 }} />

      {/* ── Content ── */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size="lg" />
        </Box>
      ) : filteredComments.length === 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 10, gap: 2 }}>
          <Forum sx={{ fontSize: 64, color: 'text.tertiary' }} />
          <Typography level="h3" textAlign="center">Sin comentarios</Typography>
          <Typography level="body-md" color="neutral" textAlign="center" sx={{ maxWidth: 380 }}>
            {comments.length === 0
              ? 'No hay comentarios en la bandeja. Los comentarios se detectaran automaticamente.'
              : 'No hay comentarios que coincidan con los filtros seleccionados.'}
          </Typography>
        </Box>
      ) : (
        <Box>
          {filteredComments.map(comment => (
            <CommentCard
              key={comment.id}
              comment={comment}
              onReply={handleReply}
              onClassify={handleClassify}
              replyingId={replyingId}
              classifyingId={classifyingId}
            />
          ))}
        </Box>
      )}
    </Box>
  )
}
