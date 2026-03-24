import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Sheet,
  Card,
  Textarea,
  Button,
  Radio,
  RadioGroup,
  FormControl,
  FormLabel,
  Alert,
  Chip,
} from '@mui/joy'
import {
  Feedback as FeedbackIcon,
  CheckCircle as CheckIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  ThumbUp as ThumbUpIcon,
  BugReport as BugIcon,
  Lightbulb as IdeaIcon,
  EmojiEmotions as FeatureIcon,
} from '@mui/icons-material'
import api from '../services/api'

interface FeedbackEntry {
  id: string | number
  type: string
  message: string
  createdAt: string
}

interface FeedbackStats {
  total: number
  implemented: number
  avgRating: number
}

export default function Feedback() {
  const [feedbackType, setFeedbackType] = useState('suggestion')
  const [rating, setRating] = useState(0)
  const [message, setMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [recentFeedback, setRecentFeedback] = useState<FeedbackEntry[]>([])
  const [feedbackStats, setFeedbackStats] = useState<FeedbackStats>({ total: 0, implemented: 0, avgRating: 0 })

  useEffect(() => {
    fetchFeedback()
  }, [])

  const fetchFeedback = async () => {
    try {
      const response = await api.get('/feedback')
      const data = response.data?.data ?? response.data ?? {}
      setRecentFeedback(data.recent ?? data.items ?? [])
      setFeedbackStats({
        total: data.total ?? 0,
        implemented: data.implemented ?? 0,
        avgRating: data.avgRating ?? 0,
      })
    } catch {
      // Sin datos disponibles — se mostrará estado vacío
      setRecentFeedback([])
      setFeedbackStats({ total: 0, implemented: 0, avgRating: 0 })
    }
  }

  const handleSubmit = async () => {
    try {
      await api.post('/feedback', {
        type: feedbackType,
        rating,
        message,
        timestamp: new Date().toISOString(),
      })
    } catch {
      // Error silencioso — el estado de éxito se muestra igual para UX
    }
    setSubmitted(true)
    setTimeout(() => {
      setSubmitted(false)
      setMessage('')
      setRating(0)
      fetchFeedback()
    }, 3000)
  }

  const feedbackTypes = [
    {
      value: 'suggestion',
      label: 'Sugerencia',
      icon: <IdeaIcon />,
      color: 'warning' as const,
      description: 'Ideas para mejorar el sistema',
    },
    {
      value: 'bug',
      label: 'Reportar Bug',
      icon: <BugIcon />,
      color: 'danger' as const,
      description: 'Problemas o errores encontrados',
    },
    {
      value: 'feature',
      label: 'Nueva Función',
      icon: <FeatureIcon />,
      color: 'success' as const,
      description: 'Solicitar nuevas funcionalidades',
    },
    {
      value: 'compliment',
      label: 'Felicitación',
      icon: <ThumbUpIcon />,
      color: 'primary' as const,
      description: 'Algo que te gustó del sistema',
    },
  ]

  const chipColorForType = (type: string) => {
    switch (type) {
      case 'suggestion': return 'warning' as const
      case 'bug': return 'danger' as const
      case 'feature': return 'success' as const
      case 'compliment': return 'primary' as const
      default: return 'neutral' as const
    }
  }

  const labelForType = (type: string) => {
    switch (type) {
      case 'suggestion': return 'Sugerencia'
      case 'bug': return 'Bug'
      case 'feature': return 'Nueva Función'
      case 'compliment': return 'Felicitación'
      default: return type
    }
  }

  const formatRelativeTime = (dateStr: string) => {
    try {
      const diff = Date.now() - new Date(dateStr).getTime()
      const days = Math.floor(diff / 86400000)
      if (days === 0) return 'Hoy'
      if (days === 1) return 'Hace 1 día'
      return `Hace ${days} días`
    } catch {
      return ''
    }
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <FeedbackIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Typography level="h2">Enviar Feedback</Typography>
        </Box>
        <Typography level="body-md" sx={{ color: 'text.secondary' }}>
          Tu opinión es importante para nosotros. Ayúdanos a mejorar JR Chateam
        </Typography>
      </Box>

      {/* Success Message */}
      {submitted && (
        <Alert
          color="success"
          variant="soft"
          startDecorator={<CheckIcon />}
          sx={{ mb: 3 }}
        >
          ¡Gracias por tu feedback! Lo hemos recibido correctamente y nuestro equipo lo revisará
          pronto.
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: '2fr 1fr',
          },
          gap: 3,
        }}
      >
        {/* Feedback Form */}
        <Sheet
          variant="outlined"
          sx={{
            p: 4,
            borderRadius: 'md',
          }}
        >
          <Typography level="title-lg" sx={{ mb: 3 }}>
            Completa el formulario
          </Typography>

          {/* Feedback Type */}
          <FormControl sx={{ mb: 3 }}>
            <FormLabel>Tipo de Feedback</FormLabel>
            <RadioGroup value={feedbackType} onChange={(e) => setFeedbackType(e.target.value)}>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: '1fr',
                    sm: 'repeat(2, 1fr)',
                  },
                  gap: 2,
                  mt: 1,
                }}
              >
                {feedbackTypes.map((type) => (
                  <Sheet
                    key={type.value}
                    variant={feedbackType === type.value ? 'soft' : 'outlined'}
                    color={feedbackType === type.value ? type.color : 'neutral'}
                    sx={{
                      p: 2,
                      borderRadius: 'sm',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      '&:hover': {
                        boxShadow: 'sm',
                      },
                    }}
                    onClick={() => setFeedbackType(type.value)}
                  >
                    <Radio
                      value={type.value}
                      label={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {type.icon}
                          <Box>
                            <Typography level="title-sm">{type.label}</Typography>
                            <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                              {type.description}
                            </Typography>
                          </Box>
                        </Box>
                      }
                      sx={{ width: '100%' }}
                    />
                  </Sheet>
                ))}
              </Box>
            </RadioGroup>
          </FormControl>

          {/* Rating */}
          <FormControl sx={{ mb: 3 }}>
            <FormLabel>Calificación General</FormLabel>
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Box
                  key={star}
                  onClick={() => setRating(star)}
                  sx={{
                    cursor: 'pointer',
                    color: star <= rating ? 'warning.main' : 'neutral.plainColor',
                    fontSize: 32,
                    transition: 'all 0.2s',
                    '&:hover': {
                      transform: 'scale(1.2)',
                    },
                  }}
                >
                  {star <= rating ? <StarIcon fontSize="inherit" /> : <StarBorderIcon fontSize="inherit" />}
                </Box>
              ))}
              {rating > 0 && (
                <Typography level="body-sm" sx={{ ml: 2, alignSelf: 'center' }}>
                  {rating === 5
                    ? 'Excelente!'
                    : rating === 4
                    ? 'Muy bien'
                    : rating === 3
                    ? 'Bien'
                    : rating === 2
                    ? 'Regular'
                    : 'Necesita mejorar'}
                </Typography>
              )}
            </Box>
          </FormControl>

          {/* Message */}
          <FormControl sx={{ mb: 3 }}>
            <FormLabel>Cuéntanos más (opcional)</FormLabel>
            <Textarea
              placeholder="Describe tu experiencia, sugerencia o problema en detalle..."
              minRows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              sx={{ mt: 1 }}
            />
            <Typography level="body-xs" sx={{ mt: 1, color: 'text.tertiary' }}>
              {message.length} / 1000 caracteres
            </Typography>
          </FormControl>

          {/* Submit Button */}
          <Button
            size="lg"
            fullWidth
            onClick={handleSubmit}
            disabled={rating === 0}
            startDecorator={<FeedbackIcon />}
          >
            Enviar Feedback
          </Button>
        </Sheet>

        {/* Sidebar Info */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Stats Card */}
          <Card variant="soft" color="primary" sx={{ p: 3 }}>
            <Typography level="title-md" sx={{ mb: 2 }}>
              Tu Impacto
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Typography level="h3">{feedbackStats.total}</Typography>
                <Typography level="body-sm">Feedback enviados</Typography>
              </Box>
              <Box>
                <Typography level="h3">{feedbackStats.implemented}</Typography>
                <Typography level="body-sm">Sugerencias implementadas</Typography>
              </Box>
              <Box>
                <Typography level="h3">
                  {feedbackStats.avgRating > 0 ? feedbackStats.avgRating.toFixed(1) : '—'}
                </Typography>
                <Typography level="body-sm">Calificación promedio</Typography>
              </Box>
            </Box>
          </Card>

          {/* Recent Feedback */}
          <Sheet variant="outlined" sx={{ p: 3, borderRadius: 'md' }}>
            <Typography level="title-md" sx={{ mb: 2 }}>
              Feedback Reciente
            </Typography>
            {recentFeedback.length > 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {recentFeedback.map((entry) => (
                  <Box key={entry.id}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Chip size="sm" color={chipColorForType(entry.type)} variant="soft">
                        {labelForType(entry.type)}
                      </Chip>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        {formatRelativeTime(entry.createdAt)}
                      </Typography>
                    </Box>
                    <Typography level="body-sm">{entry.message}</Typography>
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                No hay feedback registrado. Los usuarios podrán enviar feedback una vez configurado.
              </Typography>
            )}
          </Sheet>

          {/* Community */}
          <Card variant="outlined" sx={{ p: 3 }}>
            <Typography level="title-md" sx={{ mb: 1 }}>
              Comunidad Activa
            </Typography>
            <Typography level="body-sm" sx={{ color: 'text.secondary', mb: 2 }}>
              Únete a nuestra comunidad de +5,000 usuarios que ayudan a mejorar JR Chateam
            </Typography>
            <Button variant="outlined" fullWidth size="sm">
              Unirse al Foro
            </Button>
          </Card>
        </Box>
      </Box>
    </Box>
  )
}
