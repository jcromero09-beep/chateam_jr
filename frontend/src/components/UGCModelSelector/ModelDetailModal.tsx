import { useEffect, useMemo, useState } from 'react'
import {
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
  Stack,
  Box,
  Button,
  Chip,
  Select,
  Option,
  Switch,
  Input,
  Slider,
  Divider,
  Sheet,
  Alert,
  AspectRatio
} from '@mui/joy'
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import ImageRoundedIcon from '@mui/icons-material/ImageRounded'
import MovieCreationRoundedIcon from '@mui/icons-material/MovieCreationRounded'
import RecordVoiceOverRoundedIcon from '@mui/icons-material/RecordVoiceOverRounded'
import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded'
import type {
  FalCatalogEntry,
  FalConfigurableField,
  FalIOType
} from '../../services/ugcModelSelectorService'
import { formatFalPricingAsTokens } from '../../utils/falTokenPricing'

const IO_LABEL: Record<FalIOType, string> = {
  text: 'Texto',
  image: 'Imagen',
  video: 'Video',
  audio: 'Audio'
}

function IOChip({
  io,
  color = 'primary'
}: {
  io: FalIOType
  color?: 'primary' | 'success' | 'neutral'
}) {
  return (
    <Chip size="sm" variant="soft" color={color}>
      {IO_LABEL[io]}
    </Chip>
  )
}

interface ModelDetailModalProps {
  open: boolean
  model: FalCatalogEntry | null
  initialDefaults?: Record<string, unknown> | null
  initialMotionReferenceUrl?: string | null
  selectable?: boolean
  onClose: () => void
  /** Confirmar selección — guarda en estado del padre, NO genera */
  onConfirm: (params: {
    model: FalCatalogEntry
    defaults: Record<string, unknown>
    motionReferenceUrl: string | null
  }) => void
}

/**
 * Modal de detalle con descripción, configuración de defaults y
 * acción "Seleccionar para esta campaña" (NUNCA "Generar").
 * El botón secundario abre el playground de fal.ai en nueva pestaña.
 */
function ModelDetailModal({
  open,
  model,
  initialDefaults,
  initialMotionReferenceUrl,
  selectable = true,
  onClose,
  onConfirm
}: ModelDetailModalProps) {
  const [defaults, setDefaults] = useState<Record<string, unknown>>({})
  const [motionUrl, setMotionUrl] = useState<string>('')

  useEffect(() => {
    if (!model) return
    // Pre-cargar: valores guardados si existen; si no, defaults del modelo
    const initial = { ...(model.defaults || {}), ...(initialDefaults || {}) }
    setDefaults(initial)
    setMotionUrl(initialMotionReferenceUrl ?? '')
  }, [model, initialDefaults, initialMotionReferenceUrl])

  const requiresMotionRef = useMemo(
    () => model?.requiresCampaignAssets?.includes('motionReferenceVideo'),
    [model]
  )

  if (!model) return null

  const updateField = (name: string, value: unknown): void => {
    setDefaults(prev => ({ ...prev, [name]: value }))
  }

  const renderField = (field: FalConfigurableField) => {
    const value = defaults[field.name] ?? field.default

    if (field.type === 'enum' && field.options) {
      return (
        <Select
          key={field.name}
          value={String(value)}
          onChange={(_, val) => updateField(field.name, val)}
          size="sm"
        >
          {field.options.map(opt => (
            <Option key={opt} value={opt}>
              {opt}
            </Option>
          ))}
        </Select>
      )
    }
    if (field.type === 'boolean') {
      return (
        <Switch
          key={field.name}
          checked={Boolean(value)}
          onChange={e => updateField(field.name, e.target.checked)}
        />
      )
    }
    if (field.type === 'number' || field.type === 'integer') {
      const isInt = field.type === 'integer'
      if (
        typeof field.min === 'number' &&
        typeof field.max === 'number' &&
        !isInt
      ) {
        return (
          <Slider
            key={field.name}
            value={Number(value)}
            min={field.min}
            max={field.max}
            step={field.step ?? 0.05}
            onChange={(_, val) => updateField(field.name, val)}
            valueLabelDisplay="auto"
            sx={{ flex: 1 }}
          />
        )
      }
      return (
        <Input
          key={field.name}
          type="number"
          size="sm"
          value={String(value)}
          slotProps={{
            input: {
              min: field.min,
              max: field.max,
              step: field.step ?? (isInt ? 1 : 0.01)
            }
          }}
          onChange={e =>
            updateField(
              field.name,
              isInt ? parseInt(e.target.value, 10) : parseFloat(e.target.value)
            )
          }
        />
      )
    }
    // string fallback
    return (
      <Input
        key={field.name}
        size="sm"
        value={String(value ?? '')}
        onChange={e => updateField(field.name, e.target.value)}
      />
    )
  }

  const canConfirm = !requiresMotionRef || motionUrl.trim().length > 0
  const previewImage =
    model.previewImageAfterUrl ||
    model.previewImageUrl ||
    model.previewImageBeforeUrl ||
    null
  const fallbackIcon =
    model.category === 'text-to-speech' ? (
      <RecordVoiceOverRoundedIcon sx={{ fontSize: 56 }} />
    ) : model.category === 'lipsync' ? (
      <GraphicEqRoundedIcon sx={{ fontSize: 56 }} />
    ) : model.outputs.includes('video') ? (
      <MovieCreationRoundedIcon sx={{ fontSize: 56 }} />
    ) : (
      <ImageRoundedIcon sx={{ fontSize: 56 }} />
    )

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        size="lg"
        sx={{
          maxWidth: 900,
          width: '92vw',
          maxHeight: '90vh',
          overflow: 'auto'
        }}
      >
        <ModalClose />

        <Stack spacing={2}>
          {/* Header */}
          <Box>
            <Typography level="h3">{model.displayName}</Typography>
            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
              {model.vendor} · {formatFalPricingAsTokens(model.pricing)}
            </Typography>
          </Box>

          {/* Preview grande */}
          <AspectRatio
            ratio="16/9"
            sx={{ borderRadius: 'sm', overflow: 'hidden' }}
          >
            {model.previewVideoUrl ? (
              <Box
                component="video"
                src={model.previewVideoUrl ?? undefined}
                poster={model.previewImageUrl ?? undefined}
                controls
                muted
                loop
                playsInline
                sx={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  backgroundColor: 'neutral.900'
                }}
              />
            ) : previewImage ? (
              <Box
                component="img"
                src={previewImage}
                alt={model.displayName}
                sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <Box
                sx={{
                  width: '100%',
                  height: '100%',
                  background:
                    model.category === 'text-to-speech'
                      ? 'linear-gradient(135deg, #0e7490, #7c2d12)'
                      : 'linear-gradient(135deg, #1d4ed8, #7c2d12)',
                  color: '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  p: 3
                }}
              >
                {fallbackIcon}
                <Typography level="h3" sx={{ color: '#fff', mt: 1 }}>
                  Preview no configurado
                </Typography>
                <Typography level="body-sm" sx={{ color: 'rgba(255,255,255,0.82)', maxWidth: 460 }}>
                  El modelo está disponible en fal.ai, pero el catálogo aún no
                  tiene un asset de muestra para esta tarjeta.
                </Typography>
                {model.previewAudioUrl && (
                  <Box
                    component="audio"
                    src={model.previewAudioUrl}
                    controls
                    sx={{ width: '80%', mt: 2 }}
                  />
                )}
              </Box>
            )}
          </AspectRatio>

          <Typography level="body-md">{model.description}</Typography>

          {/* Bloque "Qué necesita / Qué genera" — PR #2 */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' },
              gap: 2,
              p: 2,
              borderRadius: 'sm',
              backgroundColor: 'neutral.softBg'
            }}
          >
            <Box>
              <Typography
                level="body-xs"
                sx={{
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: 'text.tertiary',
                  letterSpacing: 0.5
                }}
              >
                Qué necesita
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 1 }}>
                {model.inputs.map(io => (
                  <IOChip key={io} io={io} />
                ))}
              </Stack>
            </Box>
            <Box>
              <Typography
                level="body-xs"
                sx={{
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: 'text.tertiary',
                  letterSpacing: 0.5
                }}
              >
                Qué genera
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 1 }}>
                {model.outputs.map(io => (
                  <IOChip key={io} io={io} color="success" />
                ))}
              </Stack>
            </Box>
            <Box>
              <Typography
                level="body-xs"
                sx={{
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: 'text.tertiary',
                  letterSpacing: 0.5
                }}
              >
                Tokens estimados
              </Typography>
              <Typography level="title-md" sx={{ mt: 1, fontWeight: 700 }}>
                {formatFalPricingAsTokens(model.pricing)}
              </Typography>
            </Box>
          </Box>

          {/* Tags */}
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {model.tags.map(tag => (
              <Chip key={tag} size="sm" variant="soft" color="neutral">
                {tag}
              </Chip>
            ))}
          </Stack>

          <Divider />

          {/* Motion reference (solo motion-control) */}
          {selectable && requiresMotionRef && (
            <Sheet
              variant="soft"
              color="warning"
              sx={{ p: 2, borderRadius: 'sm' }}
            >
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ mb: 1 }}
              >
                <WarningAmberRoundedIcon />
                <Typography level="title-sm">
                  Video de motion-reference requerido
                </Typography>
              </Stack>
              <Typography level="body-sm" sx={{ mb: 1 }}>
                Este modelo transfiere el movimiento de un video de
                referencia hacia la imagen del personaje. Sube la URL del
                video que aporta el movimiento.
              </Typography>
              <Input
                placeholder="https://..."
                value={motionUrl}
                onChange={e => setMotionUrl(e.target.value)}
              />
            </Sheet>
          )}

          {/* Configuración */}
          {selectable && (
          <Box>
            <Typography level="title-md" sx={{ mb: 1.5 }}>
              Configuración de la campaña
            </Typography>
            <Stack spacing={1.5}>
              {model.configurableFields.map(field => (
                <Stack
                  key={field.name}
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  spacing={2}
                >
                  <Typography level="body-sm" sx={{ minWidth: 160 }}>
                    {field.name}
                  </Typography>
                  <Box sx={{ minWidth: 180, flex: 1 }}>
                    {renderField(field)}
                  </Box>
                </Stack>
              ))}
            </Stack>
          </Box>
          )}

          {selectable && !canConfirm && (
            <Alert variant="soft" color="danger">
              Debes proporcionar la URL del video de motion-reference antes de
              confirmar.
            </Alert>
          )}

          {/* Acciones */}
          <Stack
            direction="row"
            spacing={1}
            justifyContent="flex-end"
            sx={{ pt: 1 }}
          >
            <Button
              variant="outlined"
              color="neutral"
              startDecorator={<OpenInNewRoundedIcon />}
              component="a"
              href={model.playgroundUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Probar en fal.ai Playground
            </Button>
            {selectable && (
              <Button
                variant="solid"
                color="primary"
                disabled={!canConfirm}
                onClick={() =>
                  onConfirm({
                    model,
                    defaults,
                    motionReferenceUrl: requiresMotionRef
                      ? motionUrl.trim()
                      : null
                  })
                }
              >
                Seleccionar para esta campaña
              </Button>
            )}
          </Stack>
        </Stack>
      </ModalDialog>
    </Modal>
  )
}

export default ModelDetailModal
