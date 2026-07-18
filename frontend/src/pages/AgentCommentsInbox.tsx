import { useState, useEffect, useCallback, type ReactNode } from 'react'
import {
  ChatCircleText,
  ArrowClockwise,
  CurrencyDollar,
  Question,
  ThumbsUp,
  Warning,
  Minus,
  Sparkle,
  CheckCircle,
  User,
  InstagramLogo,
  TiktokLogo,
  FacebookLogo,
  YoutubeLogo,
  CircleNotch,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { StatTile } from '@/components/ui/stat-tile'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  badge: BadgeProps['variant']
  border: string
  icon: ReactNode
}> = {
  purchase_intent: {
    label: 'Purchase Intent',
    badge: 'success',
    border: 'border-l-success',
    icon: <CurrencyDollar className="size-3.5" weight="bold" aria-hidden />,
  },
  question: {
    label: 'Pregunta',
    badge: 'primary',
    border: 'border-l-primary',
    icon: <Question className="size-3.5" weight="bold" aria-hidden />,
  },
  praise: {
    label: 'Elogio',
    badge: 'warning',
    border: 'border-l-warning',
    icon: <ThumbsUp className="size-3.5" weight="bold" aria-hidden />,
  },
  complaint: {
    label: 'Queja',
    badge: 'destructive',
    border: 'border-l-destructive',
    icon: <Warning className="size-3.5" weight="bold" aria-hidden />,
  },
  neutral: {
    label: 'Neutral',
    badge: 'neutral',
    border: 'border-l-border',
    icon: <Minus className="size-3.5" weight="bold" aria-hidden />,
  },
}

const PLATFORM_CONFIG: Record<CommentPlatform, { label: string; icon: ReactNode }> = {
  instagram: { label: 'Instagram', icon: <InstagramLogo className="size-3.5 text-[#E1306C]" weight="fill" aria-hidden /> },
  tiktok:    { label: 'TikTok',    icon: <TiktokLogo className="size-3.5 text-foreground" weight="fill" aria-hidden /> },
  facebook:  { label: 'Facebook',  icon: <FacebookLogo className="size-3.5 text-[#1877F2]" weight="fill" aria-hidden /> },
  youtube:   { label: 'YouTube',   icon: <YoutubeLogo className="size-3.5 text-[#FF0000]" weight="fill" aria-hidden /> },
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

// ─── User avatar (imagen o iniciales) ──────────────────────────────────────────

function UserAvatar({
  src,
  name,
  size,
  className,
}: {
  src?: string
  name: string
  size: number
  className?: string
}) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={cn('shrink-0 rounded-full object-cover', className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        'flex shrink-0 select-none items-center justify-center rounded-full bg-primary/12 font-semibold text-primary',
        className,
      )}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

// ─── Stats Strip ──────────────────────────────────────────────────────────────

function StatsStrip({ stats, loading }: { stats: InboxStats | null; loading: boolean }) {
  const items = [
    { label: 'Comentarios hoy', value: stats?.totalToday ?? 0, tone: 'neutral' as const },
    { label: 'Purchase intents', value: stats?.purchaseIntents ?? 0, tone: 'success' as const },
    { label: 'Auto-respondidos', value: stats?.autoReplied ?? 0, tone: 'warning' as const },
    { label: 'Pendientes', value: stats?.pending ?? 0, tone: 'destructive' as const },
  ]
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {items.map(item => (
        <StatTile
          key={item.label}
          label={item.label}
          value={loading ? '—' : String(item.value)}
          tone={item.tone}
        />
      ))}
    </div>
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
    <div
      className={cn(
        'rounded-lg border border-t-border border-r-border border-b-border border-l-4 bg-card p-4 shadow-sm shadow-black/[0.02]',
        typeConfig.border,
      )}
    >
      <div className="flex gap-3">
        {/* Author avatar */}
        <UserAvatar src={comment.authorAvatarUrl} name={comment.authorUsername} size={36} className="text-sm" />

        <div className="min-w-0 flex-1">
          {/* Author row */}
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">@{comment.authorUsername}</span>
            <Badge variant={typeConfig.badge}>
              {typeConfig.icon}
              {typeConfig.label}
            </Badge>
            <Badge variant="outline">
              {platformConfig.icon}
              {platformConfig.label}
            </Badge>
            <span className="ml-auto text-xs text-muted-foreground">
              {formatTimeAgo(comment.createdAt)}
            </span>
          </div>

          {/* Comment text */}
          <p className="mb-2 text-sm leading-relaxed text-foreground">
            {comment.text}
          </p>

          {/* Auto-reply bubble */}
          {comment.autoReplyContent && (
            <div className="mb-2 rounded-md border-l-2 border-l-primary bg-primary/10 p-3">
              <div className="mb-1 flex items-center gap-1.5">
                <Sparkle className="size-3.5 text-primary" weight="fill" aria-hidden />
                <span className="text-xs font-medium text-primary">Respuesta generada</span>
              </div>
              <p className="text-sm text-foreground">{comment.autoReplyContent}</p>
            </div>
          )}

          {/* Footer row */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Assigned agent */}
            <div className="flex items-center gap-2">
              {comment.assignedAgent ? (
                <>
                  <UserAvatar
                    src={comment.assignedAgent.avatarUrl}
                    name={comment.assignedAgent.name}
                    size={22}
                    className="text-[9px]"
                  />
                  <span className="text-xs text-muted-foreground">
                    {comment.assignedAgent.name}
                  </span>
                </>
              ) : (
                <>
                  <User className="size-[18px] text-muted-foreground" aria-hidden />
                  <span className="text-xs text-muted-foreground">Sin asignar</span>
                </>
              )}
            </div>

            {/* Status + actions */}
            <div className="flex items-center gap-2">
              {comment.replyStatus === 'sent' && (
                <Badge variant="success">
                  <CheckCircle className="size-3.5" weight="fill" aria-hidden />
                  Enviado
                </Badge>
              )}
              {comment.replyStatus === 'generated' && (
                <Badge variant="warning">Generado</Badge>
              )}

              {comment.commentType === 'neutral' && (
                <Button
                  size="sm"
                  variant="outline"
                  loading={isClassifying}
                  onClick={() => onClassify(comment.id)}
                >
                  Clasificar
                </Button>
              )}

              {comment.replyStatus === 'pending' && (
                <Button
                  size="sm"
                  loading={isReplying}
                  onClick={() => onReply(comment.id)}
                >
                  {!isReplying && <Sparkle className="size-4" weight="fill" aria-hidden />}
                  Generar Respuesta
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
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
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1000px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <ChatCircleText className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Bandeja de Comentarios
                </h1>
                <Badge variant="success">Auto-respondiendo</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Comentarios clasificados con respuesta automatica
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Actualizar"
            className="text-muted-foreground"
            onClick={fetchData}
            disabled={loading}
          >
            <ArrowClockwise className="size-5" aria-hidden />
          </Button>
        </div>

        {/* ── Stats strip ── */}
        <StatsStrip stats={stats} loading={loading} />

        {/* ── Error state ── */}
        {error && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
            <span className="text-sm text-destructive-text">{error}</span>
            <Button size="sm" variant="ghost" className="text-destructive-text" onClick={fetchData}>
              Reintentar
            </Button>
          </div>
        )}

        {/* ── Type filter tabs ── */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as CommentType | 'all')}>
          <TabsList className="h-auto flex-wrap">
            {TAB_FILTERS.map(tab => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* ── Secondary filters ── */}
        <div className="flex flex-wrap items-center gap-3">
          <Select value={platformFilter} onValueChange={(v) => setPlatformFilter(v as CommentPlatform | 'all')}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Plataforma" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las plataformas</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
              <SelectItem value="facebook">Facebook</SelectItem>
              <SelectItem value="youtube">YouTube</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ReplyStatus | 'all')}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Estado respuesta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="pending">Pendiente</SelectItem>
              <SelectItem value="generated">Generado</SelectItem>
              <SelectItem value="sent">Enviado</SelectItem>
            </SelectContent>
          </Select>

          <span className="ml-auto self-center text-xs text-muted-foreground">
            {filteredComments.length} comentario{filteredComments.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="border-t border-border" />

        {/* ── Content ── */}
        {loading ? (
          <div className="flex justify-center py-16">
            <CircleNotch className="size-8 animate-spin text-muted-foreground" aria-hidden />
          </div>
        ) : filteredComments.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <ChatCircleText className="size-16 text-muted-foreground/60" aria-hidden />
            <h2 className="text-xl font-semibold text-foreground">Sin comentarios</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              {comments.length === 0
                ? 'No hay comentarios en la bandeja. Los comentarios se detectaran automaticamente.'
                : 'No hay comentarios que coincidan con los filtros seleccionados.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
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
          </div>
        )}
      </div>
    </div>
  )
}
