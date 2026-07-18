import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Box, Card, Chip, Stack, Typography, AspectRatio } from '@mui/joy'
import StarRoundedIcon from '@mui/icons-material/StarRounded'
import PlayCircleFilledRoundedIcon from '@mui/icons-material/PlayCircleFilledRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import ImageRoundedIcon from '@mui/icons-material/ImageRounded'
import MovieCreationRoundedIcon from '@mui/icons-material/MovieCreationRounded'
import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded'
import RecordVoiceOverRoundedIcon from '@mui/icons-material/RecordVoiceOverRounded'
import {
  formatIOLine,
  type FalCatalogEntry
} from '../../services/ugcModelSelectorService'
import { formatFalPricingAsTokens } from '../../utils/falTokenPricing'

interface ModelCardProps {
  model: FalCatalogEntry
  selected: boolean
  onClick: () => void
}

/**
 * Tarjeta de modelo con autoplay del video preview en hover (sin gastar
 * créditos — los previews son assets públicos de fal-public-storage).
 * Para image-edit muestra un fade before/after en lugar del video.
 */
function ModelCard({ model, selected, onClick }: ModelCardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [hovered, setHovered] = useState(false)

  const isImageEdit = model.type === 'image-edit'
  const hasVideoPreview = Boolean(model.previewVideoUrl)
  const hasImagePreview = Boolean(
    model.previewImageUrl ||
      model.previewImageBeforeUrl ||
      model.previewImageAfterUrl
  )
  const hasAudioPreview = Boolean(model.previewAudioUrl)

  const handleMouseEnter = (): void => {
    setHovered(true)
    if (videoRef.current) {
      // play() puede rechazar si el navegador bloquea — ignorar silenciosamente
      const p = videoRef.current.play()
      if (p && typeof p.catch === 'function') p.catch(() => undefined)
    }
  }

  const handleMouseLeave = (): void => {
    setHovered(false)
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
    }
  }

  const typeLabel: Record<FalCatalogEntry['type'], string> = {
    'image-to-video': 'I2V',
    'motion-control': 'Motion',
    'image-edit': 'Image Edit',
    'text-to-image': 'T2I',
    'text-to-video': 'T2V',
    'text-to-speech': 'TTS',
    lipsync: 'Lipsync'
  }

  const fallbackConfig: Record<
    FalCatalogEntry['category'],
    {
      title: string
      subtitle: string
      icon: ReactNode
      bg: string
    }
  > = {
    'text-to-image': {
      title: 'Texto a imagen',
      subtitle: 'Genera imagen base',
      icon: <ImageRoundedIcon sx={{ fontSize: 42 }} />,
      bg: 'linear-gradient(135deg, #0f766e, #164e63)'
    },
    'image-to-image': {
      title: 'Edición de imagen',
      subtitle: 'Transforma una imagen',
      icon: <AutoAwesomeRoundedIcon sx={{ fontSize: 42 }} />,
      bg: 'linear-gradient(135deg, #7c3aed, #0f766e)'
    },
    'text-to-video': {
      title: 'Texto a video',
      subtitle: 'Genera video desde prompt',
      icon: <MovieCreationRoundedIcon sx={{ fontSize: 42 }} />,
      bg: 'linear-gradient(135deg, #1d4ed8, #7c2d12)'
    },
    'image-to-video': {
      title: 'Imagen a video',
      subtitle: 'Anima una imagen base',
      icon: <MovieCreationRoundedIcon sx={{ fontSize: 42 }} />,
      bg: 'linear-gradient(135deg, #065f46, #1e40af)'
    },
    'video-to-video': {
      title: 'Video a video',
      subtitle: 'Transfiere movimiento',
      icon: <MovieCreationRoundedIcon sx={{ fontSize: 42 }} />,
      bg: 'linear-gradient(135deg, #7c2d12, #334155)'
    },
    'text-to-speech': {
      title: 'Texto a voz',
      subtitle: 'Genera audio narrado',
      icon: <RecordVoiceOverRoundedIcon sx={{ fontSize: 42 }} />,
      bg: 'linear-gradient(135deg, #0e7490, #7c2d12)'
    },
    lipsync: {
      title: 'Lipsync',
      subtitle: 'Sincroniza voz y video',
      icon: <GraphicEqRoundedIcon sx={{ fontSize: 42 }} />,
      bg: 'linear-gradient(135deg, #4338ca, #9f1239)'
    }
  }

  const fallback = fallbackConfig[model.category]

  return (
    <Card
      variant={selected ? 'solid' : 'outlined'}
      color={selected ? 'primary' : 'neutral'}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      sx={{
        cursor: 'pointer',
        p: 0,
        overflow: 'hidden',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
        boxShadow: hovered ? 'lg' : 'sm',
        transform: hovered ? 'scale(1.02)' : 'scale(1)',
        border: selected ? '2px solid' : '1px solid',
        borderColor: selected ? 'primary.500' : 'neutral.outlinedBorder'
      }}
    >
      {/* Media */}
      <AspectRatio ratio="16/10" sx={{ position: 'relative', m: 0 }}>
        {isImageEdit && hasImagePreview ? (
          <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
            <Box
              component="img"
              src={
                model.previewImageBeforeUrl ||
                model.previewImageUrl ||
                undefined
              }
              alt={`${model.displayName} before`}
              loading="lazy"
              sx={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity: hovered ? 0 : 1,
                transition: 'opacity 0.4s ease'
              }}
            />
            <Box
              component="img"
              src={
                model.previewImageAfterUrl ||
                model.previewImageUrl ||
                undefined
              }
              alt={`${model.displayName} after`}
              loading="lazy"
              sx={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity: hovered ? 1 : 0,
                transition: 'opacity 0.4s ease'
              }}
            />
          </Box>
        ) : hasVideoPreview ? (
          <Box
            component="video"
            ref={videoRef}
            src={model.previewVideoUrl ?? undefined}
            poster={model.previewImageUrl ?? undefined}
            muted
            loop
            playsInline
            preload="metadata"
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              backgroundColor: 'neutral.900'
            }}
          />
        ) : hasImagePreview ? (
          <Box
            component="img"
            src={
              model.previewImageAfterUrl ||
              model.previewImageUrl ||
              model.previewImageBeforeUrl ||
              undefined
            }
            alt={model.displayName}
            loading="lazy"
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              backgroundColor: 'neutral.900'
            }}
          />
        ) : (
          <Box
            sx={{
              width: '100%',
              height: '100%',
              background: fallback.bg,
              color: '#fff',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              px: 2
            }}
          >
            {fallback.icon}
            <Typography level="title-md" sx={{ color: '#fff', mt: 1, fontWeight: 700 }}>
              {fallback.title}
            </Typography>
            <Typography level="body-xs" sx={{ color: 'rgba(255,255,255,0.82)' }}>
              {fallback.subtitle}
            </Typography>
            {hasAudioPreview && (
              <Box
                component="audio"
                src={model.previewAudioUrl ?? undefined}
                controls
                onClick={event => event.stopPropagation()}
                sx={{ width: '90%', mt: 1.5 }}
              />
            )}
          </Box>
        )}

        {/* Badges flotantes */}
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            left: 8,
            display: 'flex',
            gap: 0.5
          }}
        >
          <Chip
            size="sm"
            variant="solid"
            color="neutral"
            sx={{ backgroundColor: 'rgba(15,23,42,0.78)', color: '#fff' }}
          >
            {typeLabel[model.type]}
          </Chip>
          {model.recommended && (
            <Chip
              size="sm"
              variant="solid"
              color="warning"
              startDecorator={<StarRoundedIcon sx={{ fontSize: 14 }} />}
            >
              Recomendado
            </Chip>
          )}
        </Box>

        {/* Play hint sobre el video cuando no hay hover */}
        {hasVideoPreview && !hovered && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none'
            }}
          >
            <PlayCircleFilledRoundedIcon
              sx={{ fontSize: 56, color: 'rgba(255,255,255,0.85)' }}
            />
          </Box>
        )}
      </AspectRatio>

      {/* Footer card */}
      <Stack spacing={0.5} sx={{ p: 1.5 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography
            level="title-md"
            sx={{
              fontWeight: 600,
              color: selected ? 'common.white' : 'text.primary'
            }}
          >
            {model.displayName}
          </Typography>
          <Chip
            size="sm"
            variant="soft"
            color={selected ? 'primary' : 'neutral'}
          >
            {formatFalPricingAsTokens(model.pricing)}
          </Chip>
        </Stack>
        <Typography
          level="body-sm"
          sx={{
            color: selected ? 'rgba(255,255,255,0.85)' : 'text.tertiary'
          }}
        >
          {model.vendor}
        </Typography>
        {/* Línea visual I/O — PR #2 */}
        <Typography
          level="body-xs"
          sx={{
            color: selected ? 'rgba(255,255,255,0.78)' : 'primary.500',
            fontWeight: 600,
            mt: 0.25
          }}
        >
          {formatIOLine(model)}
        </Typography>
      </Stack>
    </Card>
  )
}

export default ModelCard
