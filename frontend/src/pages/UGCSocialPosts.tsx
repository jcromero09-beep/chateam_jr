import { useState, useEffect, useCallback } from 'react'
import { CircularProgress } from '@mui/joy'
import {
  Article,
  ArrowClockwise,
  Eye,
  Heart,
  ChatCircle,
  ShareNetwork,
  CurrencyDollar,
  InstagramLogo,
  FacebookLogo,
  YoutubeLogo,
  VideoCamera,
  Image as ImageIcon,
} from '@phosphor-icons/react'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devError = (...args: unknown[]) => { if (isDev) console.error(...args) }

// ─── Types ────────────────────────────────────────────────────────────────────

type PostPlatform = 'instagram' | 'tiktok' | 'facebook' | 'youtube'
type PostType     = 'feed' | 'story' | 'reel' | 'short' | 'video'
type PostStatus   = 'published' | 'scheduled' | 'failed'

interface SocialPost {
  id: number
  thumbnailUrl?: string
  caption: string
  platform: PostPlatform
  postType: PostType
  status: PostStatus
  publishedAt: string
  viewsCount: number
  likesCount: number
  commentsCount: number
  sharesCount: number
  engagementRate: number
  purchaseIntents: number
  accountUsername: string
  campaignName?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_CONFIG: Record<PostPlatform, { label: string; icon: React.ReactNode }> = {
  instagram: { label: 'Instagram', icon: <InstagramLogo className="size-3.5 text-[#e4405f]" weight="fill" aria-hidden /> },
  tiktok:    { label: 'TikTok',    icon: <VideoCamera className="size-3.5 text-foreground" weight="fill" aria-hidden /> },
  facebook:  { label: 'Facebook',  icon: <FacebookLogo className="size-3.5 text-[#1877f2]" weight="fill" aria-hidden /> },
  youtube:   { label: 'YouTube',   icon: <YoutubeLogo className="size-3.5 text-[#ff0000]" weight="fill" aria-hidden /> },
}

const STATUS_CONFIG: Record<PostStatus, { label: string; variant: BadgeProps['variant'] }> = {
  published: { label: 'Publicado',  variant: 'success' },
  scheduled: { label: 'Programado', variant: 'primary' },
  failed:    { label: 'Fallido',    variant: 'destructive' },
}

const POST_TYPE_LABELS: Record<PostType, string> = {
  feed:  'Feed',
  story: 'Story',
  reel:  'Reel',
  short: 'Short',
  video: 'Video',
}

// Grid layout compartido entre header y filas
const GRID_COLUMNS =
  '60px 1fr 110px 80px 100px minmax(60px,80px) minmax(60px,80px) minmax(60px,80px) minmax(60px,80px) 80px 70px 90px'

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30)  return `hace ${days} dias`
  return new Date(dateStr).toLocaleDateString('es', { day: '2-digit', month: 'short' })
}

function engagementVariant(rate: number): BadgeProps['variant'] {
  if (rate >= 5) return 'success'
  if (rate >= 2) return 'warning'
  return 'destructive'
}

function truncate(text: string, max = 100): string {
  return text.length > max ? text.slice(0, max) + '...' : text
}

// ─── Post Row ─────────────────────────────────────────────────────────────────

function PostRow({ post }: { post: SocialPost }) {
  const platformCfg = PLATFORM_CONFIG[post.platform]
  const statusCfg   = STATUS_CONFIG[post.status]
  const engVariant  = engagementVariant(post.engagementRate)

  return (
    <div
      className="grid items-center gap-1 border-b border-border px-4 py-3 transition-colors hover:bg-accent/40"
      style={{ gridTemplateColumns: GRID_COLUMNS }}
    >
      {/* Thumbnail */}
      <div className="flex size-[50px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
        {post.thumbnailUrl ? (
          <img src={post.thumbnailUrl} alt="thumb" className="size-full object-cover" />
        ) : (
          <ImageIcon className="size-[22px] text-muted-foreground" aria-hidden />
        )}
      </div>

      {/* Caption */}
      <div className="min-w-0">
        <p className="mb-0.5 truncate text-sm text-foreground">{truncate(post.caption)}</p>
        <p className="text-xs text-muted-foreground">@{post.accountUsername}</p>
      </div>

      {/* Platform */}
      <Badge variant="neutral" className="max-w-[110px]">
        {platformCfg.icon}
        {platformCfg.label}
      </Badge>

      {/* Type */}
      <Badge variant="outline">{POST_TYPE_LABELS[post.postType]}</Badge>

      {/* Published */}
      <span className="text-xs text-muted-foreground">{formatDate(post.publishedAt)}</span>

      {/* Views */}
      <div className="flex items-center gap-1">
        <Eye className="size-[13px] text-muted-foreground" aria-hidden />
        <span className="text-xs text-foreground">{formatNumber(post.viewsCount)}</span>
      </div>

      {/* Likes */}
      <div className="flex items-center gap-1">
        <Heart className="size-[13px] text-muted-foreground" aria-hidden />
        <span className="text-xs text-foreground">{formatNumber(post.likesCount)}</span>
      </div>

      {/* Comments */}
      <div className="flex items-center gap-1">
        <ChatCircle className="size-[13px] text-muted-foreground" aria-hidden />
        <span className="text-xs text-foreground">{formatNumber(post.commentsCount)}</span>
      </div>

      {/* Shares */}
      <div className="flex items-center gap-1">
        <ShareNetwork className="size-[13px] text-muted-foreground" aria-hidden />
        <span className="text-xs text-foreground">{formatNumber(post.sharesCount)}</span>
      </div>

      {/* Engagement Rate */}
      <Badge variant={engVariant}>{post.engagementRate.toFixed(1)}%</Badge>

      {/* Purchase Intents */}
      <div className="flex items-center gap-1">
        <CurrencyDollar className="size-[13px] text-success-text" aria-hidden />
        <span className="text-xs font-medium text-foreground">{post.purchaseIntents}</span>
      </div>

      {/* Status */}
      <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
    </div>
  )
}

// ─── Table Header ─────────────────────────────────────────────────────────────

function TableHeader() {
  const cols = [
    'Imagen', 'Publicacion', 'Plataforma', 'Tipo', 'Publicado',
    'Views', 'Likes', 'Coment.', 'Shares', 'Engagement', 'Intents', 'Estado',
  ]

  return (
    <div
      className="grid gap-1 border-b-2 border-border bg-muted/40 px-4 py-2"
      style={{ gridTemplateColumns: GRID_COLUMNS }}
    >
      {cols.map(label => (
        <span
          key={label}
          className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {label}
        </span>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UGCSocialPosts() {
  const [posts, setPosts]                   = useState<SocialPost[]>([])
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState<string | null>(null)
  const [platformFilter, setPlatformFilter] = useState<PostPlatform | 'all'>('all')
  const [statusFilter, setStatusFilter]     = useState<PostStatus | 'all'>('all')
  const [typeFilter, setTypeFilter]         = useState<PostType | 'all'>('all')

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/ugc/social/posts')
      setPosts(data.data ?? data ?? [])
    } catch (err: unknown) {
      devError('[UGCSocialPosts] fetch error:', err)
      setError('No se pudieron cargar las publicaciones.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  const filteredPosts = posts.filter(p => {
    if (platformFilter !== 'all' && p.platform !== platformFilter) return false
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    if (typeFilter !== 'all' && p.postType !== typeFilter) return false
    return true
  })

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] p-4 md:p-6">
        {/* ── Header ── */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Article className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Publicaciones</h1>
              <p className="text-sm text-muted-foreground">
                Metricas de publicaciones en todas las plataformas
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="icon"
            aria-label="Actualizar"
            className="text-muted-foreground"
            onClick={fetchPosts}
            disabled={loading}
          >
            <ArrowClockwise className="size-5" aria-hidden />
          </Button>
        </div>

        {/* ── Filters ── */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Select
            value={platformFilter}
            onValueChange={(v) => setPlatformFilter(v as PostPlatform | 'all')}
          >
            <SelectTrigger className="w-[150px]" aria-label="Filtrar por plataforma">
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

          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v as PostType | 'all')}
          >
            <SelectTrigger className="w-[140px]" aria-label="Filtrar por tipo">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              <SelectItem value="feed">Feed</SelectItem>
              <SelectItem value="story">Story</SelectItem>
              <SelectItem value="reel">Reel</SelectItem>
              <SelectItem value="short">Short</SelectItem>
              <SelectItem value="video">Video</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as PostStatus | 'all')}
          >
            <SelectTrigger className="w-[140px]" aria-label="Filtrar por estado">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="published">Publicado</SelectItem>
              <SelectItem value="scheduled">Programado</SelectItem>
              <SelectItem value="failed">Fallido</SelectItem>
            </SelectContent>
          </Select>

          <span className="ml-auto text-xs text-muted-foreground">
            {filteredPosts.length} publicacion{filteredPosts.length !== 1 ? 'es' : ''}
          </span>
        </div>

        {/* ── Error state ── */}
        {error && (
          <div className="mb-6 flex items-center justify-between rounded-md bg-destructive/12 p-4">
            <span className="text-sm text-destructive-text">{error}</span>
            <Button variant="ghost" size="sm" className="text-destructive-text" onClick={fetchPosts}>
              Reintentar
            </Button>
          </div>
        )}

        {/* ── Table ── */}
        {loading ? (
          <div className="flex justify-center py-16">
            <CircularProgress size="lg" />
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20">
            <Article className="size-16 text-muted-foreground" aria-hidden />
            <h2 className="text-center text-2xl font-semibold text-foreground">Sin publicaciones</h2>
            <p className="max-w-[400px] text-center text-muted-foreground">
              {posts.length === 0
                ? 'No hay publicaciones sincronizadas. Conecta cuentas sociales y espera la primera sincronizacion.'
                : 'No hay publicaciones que coincidan con los filtros seleccionados.'}
            </p>
          </div>
        ) : (
          <div className="overflow-auto rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
            <div className="min-w-[1100px]">
              <TableHeader />
              {filteredPosts.map(post => (
                <PostRow key={post.id} post={post} />
              ))}
            </div>
          </div>
        )}

        {/* Engagement legend */}
        {filteredPosts.length > 0 && (
          <>
            <div className="my-4 border-t border-border" />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Engagement:</span>
              {([
                { variant: 'success' as const, label: '>5% excelente' },
                { variant: 'warning' as const, label: '2-5% aceptable' },
                { variant: 'destructive' as const, label: '<2% bajo' },
              ]).map(item => (
                <Badge key={item.label} variant={item.variant}>{item.label}</Badge>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
