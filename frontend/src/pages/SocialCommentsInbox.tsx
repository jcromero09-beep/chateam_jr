/**
 * SocialCommentsInbox — Bandeja de comentarios Facebook / Instagram (estilo TikTok)
 * 2 paneles: lista de posts (izquierda) + hilo de comentarios (derecha)
 */

import { useState, useEffect, useCallback } from 'react'
// [migración G] CircularProgress se conserva como MUI (no hay equivalente en el DS).
import { CircularProgress } from '@mui/joy'
import {
  FacebookLogo,
  InstagramLogo,
  ArrowClockwise,
  ThumbsUp,
  EyeSlash,
  Eye,
  PaperPlaneRight,
  ChatsCircle,
  ArrowsClockwise,
  Robot,
  Hand,
  Sparkle,
  ArrowBendUpLeft,
  MagnifyingGlass,
  ImageBroken,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  getPosts,
  getPostComments,
  replyToComment,
  likeComment,
  unlikeComment,
  hideComment,
  syncWhatsapp,
  getSettings,
  type SocialPost,
  type SocialComment,
  type SocialPlatform,
  type CommentResponseSetting,
} from '../services/socialCommentService'
import socketService from '../services/socket'
import { useAuth } from '../hooks/useAuth'

// ─── Dev helpers ───────────────────────────────────────────────────────────

const isDev = import.meta.env.DEV
const devError = (...args: unknown[]) => { if (isDev) console.error(...args) }

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'ahora'
  if (minutes < 60) return `hace ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours}h`
  return `hace ${Math.floor(hours / 24)}d`
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}

// Colores de marca de las plataformas (identidad, no tokens de superficie).
const PLATFORM_CONFIG: Record<
  SocialPlatform,
  { label: string; textClass: string; Icon: typeof FacebookLogo }
> = {
  facebook: { label: 'Facebook', textClass: 'text-[#1877F2]', Icon: FacebookLogo },
  instagram: { label: 'Instagram', textClass: 'text-[#E1306C]', Icon: InstagramLogo },
}

// ─── Banner de modo activo ─────────────────────────────────────────────────

interface ModeBannerProps {
  post: SocialPost | null
  settings: CommentResponseSetting[]
  onSync: () => void
  syncing: boolean
}

function ModeBanner({ post, settings, onSync, syncing }: ModeBannerProps) {
  if (!post) return null

  // Resolución: override por post → modo de la conexión → 'manual'
  const postSetting = settings.find(s => s.whatsappId === post.whatsappId && s.socialPostId === post.id)
  const connSetting = settings.find(s => s.whatsappId === post.whatsappId && s.socialPostId === null)
  const effectiveSetting = postSetting ?? connSetting
  const mode = effectiveSetting?.mode ?? 'manual'

  const modeConfig: Record<
    'manual' | 'auto_message' | 'ai',
    { label: string; emoji: string; variant: BadgeProps['variant']; Icon: typeof Hand }
  > = {
    manual:       { label: 'Manual',     emoji: '✋', variant: 'neutral', Icon: Hand },
    auto_message: { label: 'Automatico', emoji: '💬', variant: 'warning', Icon: Sparkle },
    ai:           { label: 'IA',         emoji: '🤖', variant: 'primary', Icon: Robot },
  }
  const cfg = modeConfig[mode]

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2">
      <Badge variant={cfg.variant}>
        <cfg.Icon className="size-3.5" aria-hidden />
        {cfg.emoji} {cfg.label}
      </Badge>
      <p className="flex-1 text-xs text-muted-foreground">
        {mode === 'manual' && 'Respuesta manual — el equipo responde desde aquí'}
        {mode === 'auto_message' && 'Respuesta automática con mensaje fijo'}
        {mode === 'ai' && 'Respuesta generada por agente de IA'}
      </p>
      <Tooltip title="Sincronizar comentarios">
        <Button
          variant="outline"
          size="icon"
          className="size-9"
          aria-label="Sincronizar comentarios"
          loading={syncing}
          onClick={onSync}
        >
          <ArrowsClockwise className="size-4" aria-hidden />
        </Button>
      </Tooltip>
    </div>
  )
}

// ─── Burbuja de comentario (estilo TikTok) ─────────────────────────────────

interface CommentBubbleProps {
  comment: SocialComment
  platform: SocialPlatform
  depth?: number
  onReply: (id: number, text: string) => void
  onLike: (id: number, liked: boolean) => void
  onHide: (id: number, hidden: boolean) => void
  replyingId: number | null
  likingId: number | null
  hidingId: number | null
}

function CommentBubble({
  comment,
  platform,
  depth = 0,
  onReply,
  onLike,
  onHide,
  replyingId,
  likingId,
  hidingId,
}: CommentBubbleProps) {
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState('')
  const isReplying = replyingId === comment.id
  const isLiking = likingId === comment.id
  const isHiding = hidingId === comment.id

  const handleSendReply = () => {
    if (!replyText.trim()) return
    onReply(comment.id, replyText.trim())
    setReplyOpen(false)
    setReplyText('')
  }

  if (comment.isDeleted) return null

  return (
    <div className={cn('mb-1', depth > 0 && 'ml-8')}>
      <div className={cn('flex gap-3', comment.isHidden && 'opacity-55')}>
        {/* Avatar */}
        <span className="relative flex size-[34px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/12 text-[13px] font-semibold text-primary">
          {comment.authorName.charAt(0).toUpperCase()}
          {comment.authorAvatarUrl && (
            <img
              src={comment.authorAvatarUrl}
              alt=""
              width={34}
              height={34}
              className="absolute inset-0 size-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
          )}
        </span>

        <div className="min-w-0 flex-1">
          {/* Cabecera */}
          <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold text-foreground">
              {comment.authorName}
            </span>
            {comment.isHidden && <Badge variant="neutral">Oculto</Badge>}
            {comment.autoReplyStatus === 'sent' && <Badge variant="success">Respondido</Badge>}
            {comment.autoReplyStatus === 'generating' && <Badge variant="warning">Generando...</Badge>}
            <span className="ml-auto text-xs text-muted-foreground">
              {formatTimeAgo(comment.createdAt)}
            </span>
          </div>

          {/* Texto del comentario */}
          <p className="mb-1.5 break-words text-sm leading-relaxed text-foreground">
            {comment.text}
          </p>

          {/* Respuesta automática enviada */}
          {comment.replySentText && (
            <div className="mb-1.5 rounded-md border-l-[3px] border-primary bg-primary/10 p-3">
              <div className="mb-0.5 flex items-center gap-1.5 text-primary">
                <ArrowBendUpLeft className="size-3" aria-hidden />
                <span className="text-xs font-medium">Respuesta enviada</span>
              </div>
              <p className="text-xs text-foreground">{comment.replySentText}</p>
            </div>
          )}

          {/* Acciones */}
          <div className="flex flex-wrap items-center gap-1">
            {/* Likes — solo en Facebook */}
            {platform === 'facebook' && (
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={comment.likeCount > 0 ? 'Quitar me gusta' : 'Me gusta'}
                  loading={isLiking}
                  onClick={() => onLike(comment.id, comment.likeCount > 0)}
                >
                  <ThumbsUp
                    className={cn('size-3.5', comment.likeCount > 0 && 'text-[#1877F2]')}
                    weight={comment.likeCount > 0 ? 'fill' : 'regular'}
                    aria-hidden
                  />
                </Button>
                {comment.likeCount > 0 && (
                  <span className="text-xs text-muted-foreground">{comment.likeCount}</span>
                )}
              </div>
            )}

            {/* Responder */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => setReplyOpen(v => !v)}
            >
              Responder
            </Button>

            {/* Ocultar/Mostrar */}
            <Tooltip title={comment.isHidden ? 'Mostrar' : 'Ocultar'}>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={comment.isHidden ? 'Mostrar comentario' : 'Ocultar comentario'}
                loading={isHiding}
                onClick={() => onHide(comment.id, !comment.isHidden)}
              >
                {comment.isHidden
                  ? <Eye className="size-3.5" aria-hidden />
                  : <EyeSlash className="size-3.5" aria-hidden />}
              </Button>
            </Tooltip>
          </div>

          {/* Input de respuesta inline */}
          {replyOpen && (
            <div className="mt-1.5 flex items-end gap-1.5">
              <textarea
                rows={1}
                placeholder="Escribe una respuesta..."
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                className="max-h-24 min-h-9 flex-1 resize-none rounded-md border border-input bg-card px-3 py-2 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSendReply()
                }}
              />
              <Button
                size="icon"
                className="size-9"
                aria-label="Enviar respuesta"
                loading={isReplying}
                disabled={!replyText.trim()}
                onClick={handleSendReply}
              >
                <PaperPlaneRight className="size-3.5" weight="fill" aria-hidden />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Respuestas anidadas (solo 1 nivel de profundidad extra) */}
      {comment.replies && comment.replies.length > 0 && depth === 0 && (
        <div className="mt-1">
          {comment.replies.map(reply => (
            <CommentBubble
              key={reply.id}
              comment={reply}
              platform={platform}
              depth={1}
              onReply={onReply}
              onLike={onLike}
              onHide={onHide}
              replyingId={replyingId}
              likingId={likingId}
              hidingId={hidingId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tarjeta de post (panel izquierdo) ────────────────────────────────────

interface PostCardProps {
  post: SocialPost
  selected: boolean
  onClick: () => void
}

function PostCard({ post, selected, onClick }: PostCardProps) {
  const platform = PLATFORM_CONFIG[post.platform]
  const { Icon } = platform
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'mb-2 flex w-full gap-3 rounded-lg border p-3 text-left transition-all hover:shadow-sm',
        selected
          ? 'border-transparent bg-primary text-primary-foreground'
          : 'border-border bg-card text-foreground',
      )}
    >
      {/* Thumbnail */}
      <span
        className={cn(
          'flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md',
          selected ? 'bg-white/15' : 'bg-muted',
        )}
      >
        {post.mediaUrl ? (
          <img
            src={post.mediaUrl}
            alt=""
            width={56}
            height={56}
            className="size-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <ImageBroken className="size-6 text-muted-foreground" aria-hidden />
        )}
      </span>

      <span className="min-w-0 flex-1">
        {/* Plataforma + badge */}
        <span className="mb-0.5 flex items-center gap-1.5">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium leading-none',
              selected ? 'bg-white/15 text-primary-foreground' : platform.textClass,
            )}
          >
            <Icon className="size-3.5" weight="fill" aria-hidden />
            {platform.label}
          </span>
          {post.pendingComments > 0 && (
            <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold leading-none text-destructive-foreground">
              {post.pendingComments}
            </span>
          )}
        </span>

        <span
          className={cn(
            'block overflow-hidden text-xs leading-snug [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]',
            selected ? 'text-primary-foreground' : 'text-foreground',
          )}
        >
          {post.caption || '(sin descripción)'}
        </span>

        <span
          className={cn(
            'mt-0.5 block text-xs',
            selected ? 'text-primary-foreground/70' : 'text-muted-foreground',
          )}
        >
          {post.totalComments} comentario{post.totalComments !== 1 ? 's' : ''}
          {' · '}
          {formatTimeAgo(post.publishedAt)}
        </span>
      </span>
    </button>
  )
}

// ─── Componente principal ──────────────────────────────────────────────────

export default function SocialCommentsInbox() {
  const { user } = useAuth()

  // Panel izquierdo — posts
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [postsLoading, setPostsLoading] = useState(true)
  const [postsError, setPostsError] = useState<string | null>(null)
  const [platformFilter, setPlatformFilter] = useState<SocialPlatform | ''>('')
  const [search, setSearch] = useState('')
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null)

  // Panel derecho — comentarios
  const [comments, setComments] = useState<SocialComment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsError, setCommentsError] = useState<string | null>(null)

  // Acciones
  const [replyingId, setReplyingId] = useState<number | null>(null)
  const [likingId, setLikingId] = useState<number | null>(null)
  const [hidingId, setHidingId] = useState<number | null>(null)
  const [syncing, setSyncing] = useState(false)

  // Settings (para banner de modo)
  const [settings, setSettings] = useState<CommentResponseSetting[]>([])

  // ─── Carga de posts ──────────────────────────────────────────────────────

  const fetchPosts = useCallback(async () => {
    setPostsLoading(true)
    setPostsError(null)
    try {
      const result = await getPosts({ platform: platformFilter || undefined })
      setPosts(result.records)
    } catch (err) {
      devError('[SocialCommentsInbox] fetchPosts:', err)
      setPostsError('No se pudieron cargar los posts.')
    } finally {
      setPostsLoading(false)
    }
  }, [platformFilter])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  // ─── Carga de settings ───────────────────────────────────────────────────

  const fetchSettings = useCallback(async () => {
    try {
      const result = await getSettings()
      setSettings(result)
    } catch (err) {
      devError('[SocialCommentsInbox] fetchSettings:', err)
    }
  }, [])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  // ─── Carga de comentarios al seleccionar post ────────────────────────────

  const fetchComments = useCallback(async (postId: number) => {
    setCommentsLoading(true)
    setCommentsError(null)
    try {
      const result = await getPostComments(postId)
      setComments(result.records)
    } catch (err) {
      devError('[SocialCommentsInbox] fetchComments:', err)
      setCommentsError('No se pudieron cargar los comentarios.')
    } finally {
      setCommentsLoading(false)
    }
  }, [])

  const handleSelectPost = (post: SocialPost) => {
    setSelectedPost(post)
    setComments([])
    fetchComments(post.id)
  }

  // ─── Socket — tiempo real ────────────────────────────────────────────────

  useEffect(() => {
    if (!user?.companyId) return
    const socket = socketService.getSocket()
    if (!socket) return

    const event = `company-${user.companyId}-fb-comment`

    const handleNewComment = (incoming: SocialComment) => {
      // Si el post del comentario es el seleccionado, insertarlo en tiempo real
      setComments(prev => {
        const exists = prev.some(c => c.id === incoming.id)
        if (exists) return prev
        return [incoming, ...prev]
      })
      // Actualizar badge del post en la lista
      setPosts(prev =>
        prev.map(p => {
          // El post relacionado llega con postId implícito; si no disponemos de él
          // refrescamos la lista completa
          return p
        })
      )
    }

    socket.on(event, handleNewComment)
    return () => { socket.off(event, handleNewComment) }
  }, [user?.companyId])

  // ─── Acciones ─────────────────────────────────────────────────────────────

  const handleReply = useCallback(async (commentId: number, text: string) => {
    setReplyingId(commentId)
    try {
      await replyToComment(commentId, text)
      setComments(prev =>
        prev.map(c =>
          c.id === commentId
            ? { ...c, autoReplyStatus: 'sent' as const, replySentText: text }
            : {
                ...c,
                replies: c.replies?.map(r =>
                  r.id === commentId
                    ? { ...r, autoReplyStatus: 'sent' as const, replySentText: text }
                    : r
                ),
              }
        )
      )
      toast.success('Respuesta enviada')
    } catch (err) {
      devError('[SocialCommentsInbox] reply error:', err)
      toast.error('No se pudo enviar la respuesta')
    } finally {
      setReplyingId(null)
    }
  }, [])

  const handleLike = async (commentId: number, currentlyLiked: boolean) => {
    setLikingId(commentId)
    try {
      if (currentlyLiked) {
        await unlikeComment(commentId)
        setComments(prev =>
          prev.map(c =>
            c.id === commentId ? { ...c, likeCount: Math.max(0, c.likeCount - 1) } : c
          )
        )
      } else {
        await likeComment(commentId)
        setComments(prev =>
          prev.map(c =>
            c.id === commentId ? { ...c, likeCount: c.likeCount + 1 } : c
          )
        )
      }
    } catch (err) {
      devError('[SocialCommentsInbox] like error:', err)
      toast.error('No se pudo actualizar el like')
    } finally {
      setLikingId(null)
    }
  }

  const handleHide = async (commentId: number, hidden: boolean) => {
    setHidingId(commentId)
    try {
      await hideComment(commentId, hidden)
      setComments(prev =>
        prev.map(c =>
          c.id === commentId
            ? { ...c, isHidden: hidden }
            : {
                ...c,
                replies: c.replies?.map(r =>
                  r.id === commentId ? { ...r, isHidden: hidden } : r
                ),
              }
        )
      )
      toast.success(hidden ? 'Comentario ocultado' : 'Comentario visible')
    } catch (err) {
      devError('[SocialCommentsInbox] hide error:', err)
      toast.error('No se pudo cambiar la visibilidad')
    } finally {
      setHidingId(null)
    }
  }

  const handleSync = async () => {
    if (!selectedPost) return
    setSyncing(true)
    try {
      await syncWhatsapp(selectedPost.whatsappId)
      await fetchComments(selectedPost.id)
      toast.success('Comentarios sincronizados')
    } catch (err) {
      devError('[SocialCommentsInbox] sync error:', err)
      toast.error('No se pudo sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  // ─── Filtrado de posts ────────────────────────────────────────────────────

  const filteredPosts = posts.filter(p => {
    if (search.trim()) {
      return p.caption?.toLowerCase().includes(search.toLowerCase())
    }
    return true
  })

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="flex h-[calc(100vh-64px)] overflow-hidden">
        {/* ── Panel izquierdo: lista de posts ── */}
        <aside className="flex w-full shrink-0 flex-col overflow-hidden border-r border-border bg-card md:w-80">
          {/* Cabecera panel izquierdo */}
          <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <ChatsCircle className="size-6 text-primary" weight="fill" aria-hidden />
              <h1 className="text-base font-semibold text-foreground">Comentarios FB / IG</h1>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto size-8 text-muted-foreground"
                aria-label="Actualizar posts"
                onClick={fetchPosts}
                disabled={postsLoading}
              >
                <ArrowClockwise className="size-4" aria-hidden />
              </Button>
            </div>

            {/* Búsqueda */}
            <Input
              placeholder="Buscar por caption..."
              aria-label="Buscar por caption"
              value={search}
              onChange={e => setSearch(e.target.value)}
              leftIcon={<MagnifyingGlass aria-hidden />}
              className="h-9"
            />

            {/* Filtro plataforma */}
            <Select
              value={platformFilter || 'all'}
              onValueChange={v => setPlatformFilter(v === 'all' ? '' : (v as SocialPlatform))}
            >
              <SelectTrigger aria-label="Filtrar por plataforma">
                <SelectValue placeholder="Todas las plataformas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="facebook">
                  <span className="flex items-center gap-2">
                    <FacebookLogo className="size-3.5 text-[#1877F2]" weight="fill" aria-hidden />
                    Facebook
                  </span>
                </SelectItem>
                <SelectItem value="instagram">
                  <span className="flex items-center gap-2">
                    <InstagramLogo className="size-3.5 text-[#E1306C]" weight="fill" aria-hidden />
                    Instagram
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Lista de posts */}
          <div className="flex-1 overflow-y-auto p-3">
            {postsLoading ? (
              <div className="flex justify-center py-12">
                <CircularProgress size="md" />
              </div>
            ) : postsError ? (
              <div className="p-3">
                <p className="text-sm text-destructive-text">{postsError}</p>
                <Button variant="ghost" size="sm" className="mt-2 text-destructive-text" onClick={fetchPosts}>
                  Reintentar
                </Button>
              </div>
            ) : filteredPosts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
                <ChatsCircle className="size-11" aria-hidden />
                <p className="text-center text-sm">
                  {posts.length === 0
                    ? 'No hay posts con comentarios'
                    : 'Sin resultados para la búsqueda'}
                </p>
              </div>
            ) : (
              filteredPosts.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  selected={selectedPost?.id === post.id}
                  onClick={() => handleSelectPost(post)}
                />
              ))
            )}
          </div>
        </aside>

        {/* ── Panel derecho: hilo de comentarios ── */}
        <div
          className={cn(
            'flex-1 flex-col overflow-hidden',
            selectedPost ? 'flex' : 'hidden md:flex',
          )}
        >
          {!selectedPost ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
              <ChatsCircle className="size-16" aria-hidden />
              <h2 className="text-xl font-semibold text-foreground">Selecciona un post</h2>
              <p className="max-w-xs text-center text-sm">
                Elige un post de la lista para ver y gestionar sus comentarios.
              </p>
            </div>
          ) : (
            <>
              {/* Cabecera con info del post */}
              <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-5 py-2.5">
                {selectedPost.mediaUrl && (
                  <img
                    src={selectedPost.mediaUrl}
                    alt=""
                    width={40}
                    height={40}
                    className="size-10 shrink-0 rounded-md object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-1.5">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-medium leading-none',
                        PLATFORM_CONFIG[selectedPost.platform].textClass,
                      )}
                    >
                      {(() => {
                        const { Icon } = PLATFORM_CONFIG[selectedPost.platform]
                        return <Icon className="size-3.5" weight="fill" aria-hidden />
                      })()}
                      {PLATFORM_CONFIG[selectedPost.platform].label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {selectedPost.totalComments} comentarios
                    </span>
                  </div>
                  <p className="truncate text-sm text-foreground">
                    {truncate(selectedPost.caption || '(sin descripción)', 80)}
                  </p>
                </div>
              </div>

              {/* Banner de modo */}
              <ModeBanner
                post={selectedPost}
                settings={settings}
                onSync={handleSync}
                syncing={syncing}
              />

              {/* Hilo de comentarios */}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {commentsLoading ? (
                  <div className="flex justify-center py-16">
                    <CircularProgress size="md" />
                  </div>
                ) : commentsError ? (
                  <div>
                    <p className="text-sm text-destructive-text">{commentsError}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-destructive-text"
                      onClick={() => fetchComments(selectedPost.id)}
                    >
                      Reintentar
                    </Button>
                  </div>
                ) : comments.filter(c => !c.isDeleted && c.parentCommentId === null).length === 0 ? (
                  <div className="flex flex-col items-center gap-4 py-16 text-muted-foreground">
                    <ChatsCircle className="size-14" aria-hidden />
                    <h2 className="text-xl font-semibold text-foreground">Sin comentarios</h2>
                    <p className="max-w-xs text-center text-sm">
                      No hay comentarios en este post. Los comentarios aparecerán aquí en tiempo real.
                    </p>
                  </div>
                ) : (
                  comments
                    .filter(c => !c.isDeleted && c.parentCommentId === null)
                    .map(comment => (
                      <div key={comment.id}>
                        <CommentBubble
                          comment={comment}
                          platform={selectedPost.platform}
                          depth={0}
                          onReply={handleReply}
                          onLike={handleLike}
                          onHide={handleHide}
                          replyingId={replyingId}
                          likingId={likingId}
                          hidingId={hidingId}
                        />
                        <div className="my-2.5 border-t border-border" />
                      </div>
                    ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
