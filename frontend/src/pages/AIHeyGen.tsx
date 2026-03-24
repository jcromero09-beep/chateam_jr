import { useState, useEffect, useCallback, type ReactNode } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  Chip,
  CircularProgress,
  Alert,
  FormControl,
  FormLabel,
  Textarea,
  Select,
  Option,
  IconButton,
} from '@mui/joy'
import {
  Video,
  RefreshCw,
  X,
  User,
  Clapperboard,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Coins,
  Send,
} from 'lucide-react'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args) }
const devError = (...args: unknown[]) => { if (isDev) console.error(...args) }

// --- Types ---
type VideoStatus = 'pending' | 'processing' | 'completed' | 'failed'
type Language = 'es' | 'en' | 'pt'

interface Avatar {
  avatarId: string
  name: string
  language: string
  previewUrl?: string
}

interface GeneratedVideo {
  id: number | string
  title: string
  status: VideoStatus
  duration: number | null
  createdAt: string
  thumbnailUrl?: string
  avatarId?: string
}

interface HeyGenStats {
  totalAvatars: number
  totalVideos: number
  remainingCredits: number
}

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: 'es', label: 'Espanol' },
  { value: 'en', label: 'Ingles' },
  { value: 'pt', label: 'Portugues' },
]

const VIDEO_STATUS_CONFIG: Record<VideoStatus, { label: string; color: 'neutral' | 'primary' | 'success' | 'danger'; icon: ReactNode }> = {
  pending: { label: 'Pendiente', color: 'neutral', icon: <Clock size={12} /> },
  processing: { label: 'Procesando', color: 'primary', icon: <Loader2 size={12} /> },
  completed: { label: 'Completado', color: 'success', icon: <CheckCircle2 size={12} /> },
  failed: { label: 'Fallido', color: 'danger', icon: <AlertCircle size={12} /> },
}

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return dateStr }
}

const formatDuration = (seconds: number | null) => {
  if (seconds === null) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// --- Pagina Principal ---
export default function AIHeyGen() {
  const [avatars, setAvatars] = useState<Avatar[]>([])
  const [videos, setVideos] = useState<GeneratedVideo[]>([])
  const [stats, setStats] = useState<HeyGenStats>({ totalAvatars: 0, totalVideos: 0, remainingCredits: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Formulario de generacion
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>('')
  const [script, setScript] = useState('')
  const [language, setLanguage] = useState<Language>('es')
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [generateSuccess, setGenerateSuccess] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      devLog('[AIHeyGen] Cargando avatares y videos...')

      const [avatarsResult, videosResult] = await Promise.allSettled([
        api.get('/ai/heygen/avatars'),
        api.get('/ai/heygen/videos'),
      ])

      let loadedAvatars: Avatar[] = []
      let loadedVideos: GeneratedVideo[] = []

      if (avatarsResult.status === 'fulfilled') {
        const raw = avatarsResult.value.data
        loadedAvatars = (raw as unknown as { data?: Avatar[] }).data ?? (raw as unknown as Avatar[]) ?? []
        setAvatars(loadedAvatars)
      } else {
        devError('[AIHeyGen] Error al cargar avatares:', avatarsResult.reason)
      }

      if (videosResult.status === 'fulfilled') {
        const raw = videosResult.value.data
        loadedVideos = (raw as unknown as { data?: GeneratedVideo[] }).data ?? (raw as unknown as GeneratedVideo[]) ?? []
        setVideos(loadedVideos)
      } else {
        devError('[AIHeyGen] Error al cargar videos:', videosResult.reason)
      }

      // Calcular stats desde los datos cargados
      if (avatarsResult.status === 'fulfilled') {
        const statsFromData = (avatarsResult.value.data as unknown as { stats?: HeyGenStats })
        if (statsFromData && typeof statsFromData === 'object' && 'stats' in statsFromData && statsFromData.stats) {
          setStats(statsFromData.stats)
        } else {
          setStats({
            totalAvatars: loadedAvatars.length,
            totalVideos: loadedVideos.length,
            remainingCredits: 0,
          })
        }
      } else {
        setStats({
          totalAvatars: loadedAvatars.length,
          totalVideos: loadedVideos.length,
          remainingCredits: 0,
        })
      }

      if (avatarsResult.status === 'rejected' && videosResult.status === 'rejected') {
        setError('Error al cargar los datos de HeyGen. Verifica la configuracion de la integracion.')
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      devError('[AIHeyGen] Error general:', err)
      setError(e.response?.data?.message || 'Error inesperado al cargar los datos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleGenerate = async () => {
    if (!selectedAvatarId) { setGenerateError('Selecciona un avatar'); return }
    if (!script.trim()) { setGenerateError('El guion es requerido'); return }
    try {
      setGenerating(true)
      setGenerateError(null)
      setGenerateSuccess(null)
      devLog('[AIHeyGen] Generando video con avatar:', selectedAvatarId)

      await api.post('/ai/heygen/generate', {
        avatarId: selectedAvatarId,
        script: script.trim(),
        language,
      })

      setGenerateSuccess('Video enviado a generar. Aparecera en el historial cuando este listo.')
      setScript('')
      // Refrescar videos despues de generar
      setTimeout(() => {
        fetchData()
        setGenerateSuccess(null)
      }, 2500)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      devError('[AIHeyGen] Error al generar video:', err)
      setGenerateError(e.response?.data?.message || 'Error al generar el video')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress size="lg" />
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography level="h2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Video size={28} />
            HeyGen — Avatares de Video
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary', mt: 0.5 }}>
            Genera videos con avatares de IA usando la integracion de HeyGen
          </Typography>
        </Box>
        <Button variant="outlined" startDecorator={<RefreshCw size={16} />} onClick={fetchData}>
          Actualizar
        </Button>
      </Box>

      {/* Error global */}
      {error && (
        <Alert color="danger" sx={{ mb: 3 }} endDecorator={
          <IconButton size="sm" variant="plain" color="danger" onClick={() => setError(null)}><X size={16} /></IconButton>
        }>
          {error}
        </Alert>
      )}

      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <User size={18} style={{ opacity: 0.6 }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Avatares Disponibles</Typography>
              </Box>
              <Typography level="h3">{stats.totalAvatars || avatars.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Clapperboard size={18} style={{ opacity: 0.6 }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Videos Generados</Typography>
              </Box>
              <Typography level="h3" sx={{ color: 'primary.500' }}>{stats.totalVideos || videos.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Coins size={18} style={{ opacity: 0.6 }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Creditos Restantes</Typography>
              </Box>
              <Typography level="h3" sx={{ color: 'warning.500' }}>
                {stats.remainingCredits.toLocaleString('es-ES')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Seccion 1: Grid de Avatares */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography level="title-lg" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <User size={20} />
            Avatares Disponibles
          </Typography>
          {avatars.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <User size={40} style={{ opacity: 0.3, marginBottom: 8 }} />
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                No hay avatares disponibles. Verifica la configuracion de HeyGen.
              </Typography>
            </Box>
          ) : (
            <Grid container spacing={2}>
              {avatars.map((avatar) => (
                <Grid key={avatar.avatarId} xs={12} sm={6} md={4} lg={3}>
                  <Card
                    variant={selectedAvatarId === avatar.avatarId ? 'solid' : 'outlined'}
                    color={selectedAvatarId === avatar.avatarId ? 'primary' : 'neutral'}
                    sx={{ cursor: 'pointer', transition: 'all 0.15s' }}
                    onClick={() => setSelectedAvatarId(avatar.avatarId)}
                  >
                    <CardContent>
                      {/* Placeholder de imagen de preview */}
                      <Box
                        sx={{
                          width: '100%',
                          height: 100,
                          borderRadius: 'sm',
                          bgcolor: selectedAvatarId === avatar.avatarId ? 'primary.700' : 'background.level2',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          mb: 1,
                          overflow: 'hidden',
                        }}
                      >
                        {avatar.previewUrl ? (
                          <img
                            src={avatar.previewUrl}
                            alt={avatar.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <User
                            size={36}
                            style={{ opacity: selectedAvatarId === avatar.avatarId ? 0.8 : 0.3 }}
                          />
                        )}
                      </Box>
                      <Typography
                        level="body-sm"
                        fontWeight="lg"
                        sx={{ color: selectedAvatarId === avatar.avatarId ? 'primary.50' : 'text.primary' }}
                      >
                        {avatar.name}
                      </Typography>
                      <Typography
                        level="body-xs"
                        sx={{ color: selectedAvatarId === avatar.avatarId ? 'primary.200' : 'text.tertiary' }}
                      >
                        {avatar.language}
                      </Typography>
                      <Typography
                        level="body-xs"
                        sx={{ color: selectedAvatarId === avatar.avatarId ? 'primary.200' : 'text.tertiary', fontFamily: 'monospace' }}
                      >
                        ID: {avatar.avatarId.length > 16 ? avatar.avatarId.substring(0, 16) + '...' : avatar.avatarId}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </CardContent>
      </Card>

      {/* Seccion 2: Formulario de Generacion */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography level="title-lg" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Clapperboard size={20} />
            Generar Video
          </Typography>

          {generateError && (
            <Alert color="danger" sx={{ mb: 2 }} endDecorator={
              <IconButton size="sm" variant="plain" color="danger" onClick={() => setGenerateError(null)}>
                <X size={16} />
              </IconButton>
            }>
              {generateError}
            </Alert>
          )}

          {generateSuccess && (
            <Alert color="success" sx={{ mb: 2 }} endDecorator={
              <IconButton size="sm" variant="plain" color="success" onClick={() => setGenerateSuccess(null)}>
                <X size={16} />
              </IconButton>
            }>
              {generateSuccess}
            </Alert>
          )}

          <Grid container spacing={2}>
            <Grid xs={12} sm={6}>
              <FormControl required>
                <FormLabel>Avatar Seleccionado</FormLabel>
                <Select
                  value={selectedAvatarId}
                  onChange={(_, val) => { if (val) setSelectedAvatarId(val as string) }}
                  placeholder="Selecciona un avatar"
                >
                  {avatars.map((av) => (
                    <Option key={av.avatarId} value={av.avatarId}>{av.name}</Option>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid xs={12} sm={6}>
              <FormControl required>
                <FormLabel>Idioma</FormLabel>
                <Select
                  value={language}
                  onChange={(_, val) => { if (val) setLanguage(val as Language) }}
                >
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid xs={12}>
              <FormControl required>
                <FormLabel>Guion del Video</FormLabel>
                <Textarea
                  placeholder="Escribe el guion que el avatar narrara en el video..."
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  minRows={4}
                />
                <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                  {script.length} caracteres
                </Typography>
              </FormControl>
            </Grid>
            <Grid xs={12}>
              <Button
                onClick={handleGenerate}
                loading={generating}
                startDecorator={<Send size={16} />}
                disabled={!selectedAvatarId || !script.trim()}
              >
                Generar Video
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Seccion 3: Historial de Videos */}
      <Card>
        <CardContent>
          <Typography level="title-lg" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Video size={20} />
            Historial de Videos
          </Typography>

          {videos.length === 0 ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <Video size={48} style={{ opacity: 0.3, marginBottom: 8 }} />
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                No hay videos generados aun. Crea tu primer video con un avatar.
              </Typography>
            </Box>
          ) : (
            <Grid container spacing={2}>
              {videos.map((video) => {
                const statusConf = VIDEO_STATUS_CONFIG[video.status] ?? VIDEO_STATUS_CONFIG.pending
                return (
                  <Grid key={video.id} xs={12} sm={6} md={4}>
                    <Card variant="outlined">
                      <CardContent>
                        {/* Thumbnail placeholder */}
                        <Box
                          sx={{
                            width: '100%',
                            height: 120,
                            borderRadius: 'sm',
                            bgcolor: 'background.level2',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            mb: 1.5,
                            overflow: 'hidden',
                          }}
                        >
                          {video.thumbnailUrl ? (
                            <img
                              src={video.thumbnailUrl}
                              alt={video.title}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <Clapperboard size={36} style={{ opacity: 0.3 }} />
                          )}
                        </Box>

                        <Typography level="body-sm" fontWeight="lg" sx={{ mb: 0.5 }}>
                          {video.title}
                        </Typography>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                          <Chip size="sm" color={statusConf.color} startDecorator={statusConf.icon}>
                            {statusConf.label}
                          </Chip>
                          {video.duration !== null && (
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                              {formatDuration(video.duration)}
                            </Typography>
                          )}
                        </Box>

                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          {formatDate(video.createdAt)}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                )
              })}
            </Grid>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}
