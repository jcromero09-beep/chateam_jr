import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Sheet,
  Card,
  Chip,
  Button,
  CircularProgress,
  Select,
  Option,
  Divider,
  IconButton,
} from '@mui/joy'
import {
  Article,
  Refresh,
  Visibility,
  FavoriteBorder,
  ChatBubbleOutline,
  Share,
  AttachMoney,
  Instagram,
  Videocam,
  Facebook,
  Image as ImageIcon,
} from '@mui/icons-material'
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

const PLATFORM_CONFIG: Record<PostPlatform, { label: string; color: string; icon: React.ReactNode }> = {
  instagram: { label: 'Instagram', color: '#E1306C', icon: <Instagram sx={{ fontSize: 14 }} /> },
  tiktok:    { label: 'TikTok',    color: '#010101', icon: <Videocam sx={{ fontSize: 14 }} /> },
  facebook:  { label: 'Facebook',  color: '#1877F2', icon: <Facebook sx={{ fontSize: 14 }} /> },
  youtube:   { label: 'YouTube',   color: '#FF0000', icon: <Videocam sx={{ fontSize: 14 }} /> },
}

const STATUS_CONFIG: Record<PostStatus, { label: string; color: 'success' | 'primary' | 'danger' }> = {
  published: { label: 'Publicado',  color: 'success' },
  scheduled: { label: 'Programado', color: 'primary' },
  failed:    { label: 'Fallido',    color: 'danger'  },
}

const POST_TYPE_LABELS: Record<PostType, string> = {
  feed:  'Feed',
  story: 'Story',
  reel:  'Reel',
  short: 'Short',
  video: 'Video',
}

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

function engagementColor(rate: number): 'success' | 'warning' | 'danger' {
  if (rate >= 5) return 'success'
  if (rate >= 2) return 'warning'
  return 'danger'
}

function truncate(text: string, max = 100): string {
  return text.length > max ? text.slice(0, max) + '...' : text
}

// ─── Post Row ─────────────────────────────────────────────────────────────────

function PostRow({ post }: { post: SocialPost }) {
  const platformCfg    = PLATFORM_CONFIG[post.platform]
  const statusCfg      = STATUS_CONFIG[post.status]
  const engColor       = engagementColor(post.engagementRate)

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '60px 1fr 110px 80px 100px minmax(60px,80px) minmax(60px,80px) minmax(60px,80px) minmax(60px,80px) 80px 70px 90px',
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: 1.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        '&:hover': { bgcolor: 'neutral.softBg' },
        transition: 'background-color 0.15s',
      }}
    >
      {/* Thumbnail */}
      <Box
        sx={{
          width: 50,
          height: 50,
          borderRadius: 'sm',
          overflow: 'hidden',
          flexShrink: 0,
          bgcolor: 'neutral.100',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {post.thumbnailUrl ? (
          <Box
            component="img"
            src={post.thumbnailUrl}
            alt="thumb"
            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <ImageIcon sx={{ fontSize: 22, color: 'neutral.400' }} />
        )}
      </Box>

      {/* Caption */}
      <Box sx={{ minWidth: 0 }}>
        <Typography level="body-sm" noWrap sx={{ mb: 0.25 }}>
          {truncate(post.caption)}
        </Typography>
        <Typography level="body-xs" color="neutral">@{post.accountUsername}</Typography>
      </Box>

      {/* Platform */}
      <Chip
        size="sm"
        variant="soft"
        startDecorator={platformCfg.icon}
        sx={{ maxWidth: 110 }}
      >
        {platformCfg.label}
      </Chip>

      {/* Type */}
      <Chip size="sm" variant="outlined" color="neutral">
        {POST_TYPE_LABELS[post.postType]}
      </Chip>

      {/* Published */}
      <Typography level="body-xs" color="neutral">
        {formatDate(post.publishedAt)}
      </Typography>

      {/* Views */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Visibility sx={{ fontSize: 13, color: 'text.tertiary' }} />
        <Typography level="body-xs">{formatNumber(post.viewsCount)}</Typography>
      </Box>

      {/* Likes */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <FavoriteBorder sx={{ fontSize: 13, color: 'text.tertiary' }} />
        <Typography level="body-xs">{formatNumber(post.likesCount)}</Typography>
      </Box>

      {/* Comments */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <ChatBubbleOutline sx={{ fontSize: 13, color: 'text.tertiary' }} />
        <Typography level="body-xs">{formatNumber(post.commentsCount)}</Typography>
      </Box>

      {/* Shares */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Share sx={{ fontSize: 13, color: 'text.tertiary' }} />
        <Typography level="body-xs">{formatNumber(post.sharesCount)}</Typography>
      </Box>

      {/* Engagement Rate */}
      <Chip size="sm" variant="soft" color={engColor}>
        {post.engagementRate.toFixed(1)}%
      </Chip>

      {/* Purchase Intents */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <AttachMoney sx={{ fontSize: 13, color: 'success.500' }} />
        <Typography level="body-xs" fontWeight="md">{post.purchaseIntents}</Typography>
      </Box>

      {/* Status */}
      <Chip size="sm" variant="soft" color={statusCfg.color}>
        {statusCfg.label}
      </Chip>
    </Box>
  )
}

// ─── Table Header ─────────────────────────────────────────────────────────────

function TableHeader() {
  const cols = [
    { label: 'Imagen',      w: '60px' },
    { label: 'Publicacion', w: '1fr'  },
    { label: 'Plataforma',  w: '110px' },
    { label: 'Tipo',        w: '80px' },
    { label: 'Publicado',   w: '100px' },
    { label: 'Views',       w: 'minmax(60px,80px)' },
    { label: 'Likes',       w: 'minmax(60px,80px)' },
    { label: 'Coment.',     w: 'minmax(60px,80px)' },
    { label: 'Shares',      w: 'minmax(60px,80px)' },
    { label: 'Engagement',  w: '80px' },
    { label: 'Intents',     w: '70px' },
    { label: 'Estado',      w: '90px' },
  ]

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: cols.map(c => c.w).join(' '),
        gap: 1,
        px: 2,
        py: 1,
        bgcolor: 'background.level1',
        borderBottom: '2px solid',
        borderColor: 'divider',
      }}
    >
      {cols.map(col => (
        <Typography key={col.label} level="body-xs" fontWeight="lg" color="neutral" noWrap>
          {col.label}
        </Typography>
      ))}
    </Box>
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
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      {/* ── Header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Article sx={{ fontSize: 28, color: 'primary.500' }} />
          <Box>
            <Typography level="h3">Publicaciones</Typography>
            <Typography level="body-sm" color="neutral">
              Metricas de publicaciones en todas las plataformas
            </Typography>
          </Box>
        </Box>
        <IconButton variant="outlined" color="neutral" size="sm" onClick={fetchPosts} disabled={loading}>
          <Refresh />
        </IconButton>
      </Box>

      {/* ── Filters ── */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
        <Select
          size="sm"
          value={platformFilter}
          onChange={(_, v) => setPlatformFilter(v as PostPlatform | 'all')}
          sx={{ minWidth: 130 }}
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
          value={typeFilter}
          onChange={(_, v) => setTypeFilter(v as PostType | 'all')}
          sx={{ minWidth: 120 }}
          placeholder="Tipo"
        >
          <Option value="all">Todos los tipos</Option>
          <Option value="feed">Feed</Option>
          <Option value="story">Story</Option>
          <Option value="reel">Reel</Option>
          <Option value="short">Short</Option>
          <Option value="video">Video</Option>
        </Select>

        <Select
          size="sm"
          value={statusFilter}
          onChange={(_, v) => setStatusFilter(v as PostStatus | 'all')}
          sx={{ minWidth: 120 }}
          placeholder="Estado"
        >
          <Option value="all">Todos los estados</Option>
          <Option value="published">Publicado</Option>
          <Option value="scheduled">Programado</Option>
          <Option value="failed">Fallido</Option>
        </Select>

        <Typography level="body-xs" color="neutral" sx={{ ml: 'auto' }}>
          {filteredPosts.length} publicacion{filteredPosts.length !== 1 ? 'es' : ''}
        </Typography>
      </Box>

      {/* ── Error state ── */}
      {error && (
        <Sheet variant="soft" color="danger" sx={{ p: 2, borderRadius: 'md', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography level="body-sm" color="danger">{error}</Typography>
            <Button size="sm" variant="plain" color="danger" onClick={fetchPosts}>Reintentar</Button>
          </Box>
        </Sheet>
      )}

      {/* ── Table ── */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size="lg" />
        </Box>
      ) : filteredPosts.length === 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 10, gap: 2 }}>
          <Article sx={{ fontSize: 64, color: 'text.tertiary' }} />
          <Typography level="h3" textAlign="center">Sin publicaciones</Typography>
          <Typography level="body-md" color="neutral" textAlign="center" sx={{ maxWidth: 400 }}>
            {posts.length === 0
              ? 'No hay publicaciones sincronizadas. Conecta cuentas sociales y espera la primera sincronizacion.'
              : 'No hay publicaciones que coincidan con los filtros seleccionados.'}
          </Typography>
        </Box>
      ) : (
        <Card variant="outlined" sx={{ overflow: 'auto' }}>
          <Box sx={{ minWidth: 1100 }}>
            <TableHeader />
            {filteredPosts.map(post => (
              <PostRow key={post.id} post={post} />
            ))}
          </Box>
        </Card>
      )}

      {/* Engagement legend */}
      {filteredPosts.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Typography level="body-xs" color="neutral" fontWeight="md">Engagement:</Typography>
            {([
              { color: 'success' as const, label: '>5% excelente' },
              { color: 'warning' as const, label: '2-5% aceptable' },
              { color: 'danger' as const,  label: '<2% bajo'      },
            ]).map(item => (
              <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Chip size="sm" variant="soft" color={item.color}>{item.label}</Chip>
              </Box>
            ))}
          </Box>
        </>
      )}
    </Box>
  )
}
