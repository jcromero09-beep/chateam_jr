import {
  ChangeEvent,
  KeyboardEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Sheet,
  Tooltip,
  Typography,
} from '@mui/joy'
import {
  AddPhotoAlternate,
  AlternateEmail,
  Check,
  Image as ImageIcon,
  KeyboardArrowDown,
  Remove,
  Add,
  Videocam,
  VolumeOff,
  VolumeUp,
} from '@mui/icons-material'
import api from '../../services/api'

export type GenerationMode = 'image' | 'video'

export type GenerationPayload = {
  mode: GenerationMode
  prompt: string
  model: string
  count: number
  references: string[]
  mentions: string[]
  resolution: '720p' | '1080p' | '2K' | '4K' | string
  camera?: string
  motion?: string
  styleMode?: string
  duration?: number
  audio?: boolean
  aspectRatio?: string
  estimatedCost?: number
}

export type GenerationPrefill = {
  /** Cambia en cada "Reusar" para forzar la recarga aunque sea la misma campaña */
  nonce: number
  mode: GenerationMode
  prompt: string
  model?: string
  count?: number
  resolution?: string
  duration?: number
  aspectRatio?: string
  mentions?: string[]
  audio?: boolean
}

export type GenerationModelOption = {
  id: string
  label: string
  description?: string
  resolutions: string[]
  durations?: number[]
  badges?: string[]
  costMultiplier?: number
  /** El modelo admite imagen de referencia como input (image-to-video, image-edit, etc.) */
  acceptsImage?: boolean
}

type Choice = {
  value: string
  label: string
  description?: string
  badge?: string
}

type GenerationState = Omit<GenerationPayload, 'estimatedCost'>

const SAMPLE_VIDEO_MODELS: GenerationModelOption[] = [
  {
    id: 'cinema-studio-35',
    label: 'Cinema Studio 3.5',
    description: 'Camera movements with start frame',
    resolutions: ['720p', '1080p'],
    durations: [4, 6, 8, 10],
    costMultiplier: 1.1,
    acceptsImage: true,
  },
  {
    id: 'seedance-20-mini',
    label: 'Seedance 2.0 Mini',
    description: 'Fast social video',
    resolutions: ['720p'],
    durations: [4, 6, 8, 10, 15],
    badges: ['NEW', 'EXCLUSIVE'],
    costMultiplier: 0.85,
    acceptsImage: false,
  },
  {
    id: 'kling-30',
    label: 'Kling 3.0',
    description: 'High-detail cinematic motion',
    resolutions: ['720p', '1080p', '4K'],
    durations: [4, 6, 8, 10, 15],
    costMultiplier: 1.5,
    acceptsImage: true,
  },
]

const SAMPLE_IMAGE_MODELS: GenerationModelOption[] = [
  {
    id: 'soul-cinema',
    label: 'Soul Cinema',
    description: 'Cinematic UGC stills',
    resolutions: ['1K', '2K', '4K'],
    costMultiplier: 1,
    acceptsImage: false,
  },
]

const CAMERA_OPTIONS: Choice[] = [
  { value: '35mm', label: '35mm' },
  { value: '50mm', label: '50mm' },
  { value: '75mm', label: '75mm' },
  { value: '100mm', label: '100mm' },
]

const MOTION_OPTIONS: Choice[] = [
  { value: 'low-decay', label: 'Low Decay' },
  { value: 'medium-decay', label: 'Medium Decay' },
  { value: 'high-decay', label: 'High Decay' },
]

const STYLE_MODE_OPTIONS: Choice[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'natural', label: 'Natural' },
]

const IMAGE_RATIOS: Choice[] = [
  { value: '3:4', label: '3:4' },
  { value: '2:3', label: '2:3' },
  { value: '9:16', label: '9:16' },
  { value: '3:2', label: '3:2' },
  { value: '4:3', label: '4:3' },
  { value: '16:9', label: '16:9', badge: 'Cinematic' },
  { value: '21:9', label: '21:9', badge: 'Cinematic' },
]

const IMAGE_RESOLUTIONS = ['1K', '2K', '4K']

function clampCount(value: number): number {
  return Math.max(1, Math.min(4, value))
}

export function computeCost(params: GenerationPayload | GenerationState): number {
  const isVideo = params.mode === 'video'
  const duration = isVideo ? Number(params.duration || 4) : 1
  const resolutionMultiplier: Record<string, number> = {
    '720p': 1,
    '1080p': 1.35,
    '1K': 1,
    '2K': 1.5,
    '4K': 2.4,
  }
  const base = isVideo ? 12 : 8
  const audioCost = isVideo && params.audio ? 4 : 0
  const multiplier = resolutionMultiplier[params.resolution] || 1
  return Math.ceil((base * duration * multiplier + audioCost) * params.count)
}

function firstValid<T>(list: T[], fallback: T): T {
  return list.length > 0 ? list[0] : fallback
}

function useOnClickOutside<T extends HTMLElement>(
  ref: { current: T | null },
  handler: () => void
) {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return
      handler()
    }
    document.addEventListener('mousedown', listener)
    document.addEventListener('touchstart', listener)
    return () => {
      document.removeEventListener('mousedown', listener)
      document.removeEventListener('touchstart', listener)
    }
  }, [ref, handler])
}

function getModelOptions(
  mode: GenerationMode,
  videoModels: GenerationModelOption[],
  imageModels: GenerationModelOption[]
): GenerationModelOption[] {
  return mode === 'video' ? videoModels : imageModels
}

function normalizeForModel(
  state: GenerationState,
  videoModels: GenerationModelOption[],
  imageModels: GenerationModelOption[]
): GenerationState {
  const models = getModelOptions(state.mode, videoModels, imageModels)
  const selectedModel = models.find(model => model.id === state.model) || models[0]
  const resolution = selectedModel.resolutions.includes(state.resolution)
    ? state.resolution
    : firstValid(selectedModel.resolutions, state.resolution)
  const durations = selectedModel.durations || [4]
  // Duración LIBRE: se respeta cualquier valor positivo que escriba el usuario;
  // los `durations` del modelo solo se usan como recomendación / valor inicial.
  const duration = state.mode === 'video'
    ? (Number.isFinite(Number(state.duration)) && Number(state.duration) > 0
        ? Number(state.duration)
        : (durations[0] || 4))
    : undefined
  // Imagen de referencia: solo se conserva si el modelo seleccionado admite imagen.
  const acceptsImage = selectedModel?.acceptsImage ?? false
  const references = acceptsImage ? state.references : []

  return {
    ...state,
    model: selectedModel.id,
    resolution,
    duration,
    references,
    aspectRatio: state.mode === 'image' ? state.aspectRatio || '16:9' : undefined,
    camera: state.mode === 'video' ? state.camera || '75mm' : undefined,
    motion: state.mode === 'video' ? state.motion || 'medium-decay' : undefined,
    styleMode: state.mode === 'video' ? state.styleMode || 'auto' : undefined,
    audio: state.mode === 'video' ? state.audio ?? true : undefined,
    mentions: state.mode === 'video' ? state.mentions : [],
  }
}

function optionLabel(options: Choice[], value?: string): string {
  return options.find(option => option.value === value)?.label || value || ''
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: GenerationMode
  onChange: (mode: GenerationMode) => void
}) {
  const modes: Array<{ mode: GenerationMode; label: string; icon: ReactNode }> = [
    { mode: 'image', label: 'Imagen', icon: <ImageIcon sx={{ fontSize: 16 }} /> },
    { mode: 'video', label: 'Video', icon: <Videocam sx={{ fontSize: 16 }} /> },
  ]

  return (
    <Box
      sx={{
        display: 'inline-flex',
        gap: 0.375,
        p: 0.375,
        borderRadius: 'lg',
        bgcolor: 'background.level2',
        flexShrink: 0,
      }}
    >
      {modes.map(item => {
        const active = item.mode === mode
        return (
          <Button
            key={item.mode}
            type="button"
            size="sm"
            variant={active ? 'solid' : 'plain'}
            color={active ? 'primary' : 'neutral'}
            onClick={() => onChange(item.mode)}
            startDecorator={item.icon}
            sx={{
              minHeight: 34,
              px: 1.25,
              borderRadius: 'md',
              fontWeight: 700,
              ...(active ? {} : { color: 'text.secondary' }),
            }}
          >
            {item.label}
          </Button>
        )
      })}
    </Box>
  )
}

function ParamChip({
  label,
  value,
  open,
  onClick,
}: {
  label: string
  value: string
  open?: boolean
  onClick: () => void
}) {
  return (
    <Chip
      component="button"
      type="button"
      size="sm"
      variant={open ? 'solid' : 'outlined'}
      color={open ? 'primary' : 'neutral'}
      onClick={onClick}
      endDecorator={<KeyboardArrowDown sx={{ fontSize: 15 }} />}
      sx={{
        borderRadius: 999,
        cursor: 'pointer',
        fontWeight: 600,
        maxWidth: 200,
        flexShrink: 0,
        '& .MuiChip-label': {
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        },
      }}
    >
      <Box component="span" sx={{ opacity: 0.6, mr: 0.25 }}>{label}:</Box>{value}
    </Chip>
  )
}

function Dropdown({
  open,
  children,
  wide = false,
}: {
  open: boolean
  children: ReactNode
  wide?: boolean
}) {
  if (!open) return null

  return (
    <Sheet
      variant="outlined"
      sx={{
        position: 'absolute',
        zIndex: 20,
        bottom: 'calc(100% + 10px)',
        left: 0,
        minWidth: wide ? 340 : 240,
        maxWidth: { xs: 'calc(100vw - 32px)', sm: wide ? 460 : 360 },
        maxHeight: 360,
        overflowY: 'auto',
        p: 1,
        borderRadius: 'lg',
        bgcolor: 'background.surface',
        borderColor: 'divider',
        boxShadow: 'lg',
      }}
      role="listbox"
    >
      {children}
    </Sheet>
  )
}

function ChoiceList({
  options,
  value,
  onSelect,
}: {
  options: Choice[]
  value?: string
  onSelect: (value: string) => void
}) {
  return (
    <Box sx={{ display: 'grid', gap: 0.5 }}>
      {options.map(option => {
        const selected = option.value === value
        return (
          <Button
            key={option.value}
            type="button"
            role="option"
            aria-selected={selected}
            variant={selected ? 'soft' : 'plain'}
            color={selected ? 'primary' : 'neutral'}
            onClick={() => onSelect(option.value)}
            sx={{
              justifyContent: 'flex-start',
              alignItems: 'flex-start',
              textAlign: 'left',
              minHeight: 40,
              py: 0.875,
              gap: 1,
            }}
            startDecorator={
              <Box sx={{ mt: 0.25, display: 'flex' }}>
                {selected ? <Check sx={{ fontSize: 16 }} /> : <Box sx={{ width: 16 }} />}
              </Box>
            }
            endDecorator={option.badge ? (
              <Chip size="sm" variant="soft" color="primary" sx={{ mt: 0.25, flexShrink: 0 }}>{option.badge}</Chip>
            ) : null}
          >
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography level="body-sm" sx={{ color: 'inherit', fontWeight: 600, whiteSpace: 'normal' }}>
                {option.label}
              </Typography>
              {option.description && (
                <Typography level="body-xs" sx={{ color: 'text.tertiary', whiteSpace: 'normal', lineHeight: 1.4, mt: 0.25 }}>
                  {option.description}
                </Typography>
              )}
            </Box>
          </Button>
        )
      })}
    </Box>
  )
}

function Stepper({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 0.5,
        py: 0.25,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 999,
        bgcolor: 'background.level1',
      }}
      aria-label="Cantidad"
    >
      <IconButton
        type="button"
        size="sm"
        variant="plain"
        color="neutral"
        onClick={() => onChange(clampCount(value - 1))}
        disabled={value <= 1}
      >
        <Remove sx={{ fontSize: 16 }} />
      </IconButton>
      <Typography level="body-sm" sx={{ fontWeight: 700, minWidth: 28, textAlign: 'center' }}>
        {value}/4
      </Typography>
      <IconButton
        type="button"
        size="sm"
        variant="plain"
        color="neutral"
        onClick={() => onChange(clampCount(value + 1))}
        disabled={value >= 4}
      >
        <Add sx={{ fontSize: 16 }} />
      </IconButton>
    </Box>
  )
}

function GenerateButton({
  cost,
  disabled,
  loading,
  onClick,
}: {
  cost: number
  disabled: boolean
  loading?: boolean
  onClick: () => void
}) {
  const originalCost = Math.ceil(cost * 1.2)

  return (
    <Button
      type="button"
      color="primary"
      variant="solid"
      onClick={onClick}
      disabled={disabled || loading}
      sx={{
        minWidth: 108,
        minHeight: 48,
        flexDirection: 'column',
        gap: 0,
        borderRadius: 'lg',
        fontWeight: 800,
      }}
    >
      {loading ? <CircularProgress size="sm" /> : 'Generar'}
      {!loading && (
        <Typography level="body-xs" sx={{ color: 'inherit', opacity: 0.9, fontWeight: 700 }}>
          <Box component="span" sx={{ textDecoration: 'line-through', opacity: 0.6, mr: 0.5 }}>
            {originalCost}
          </Box>
          {cost}
        </Typography>
      )}
    </Button>
  )
}

export default function GenerationBar({
  onGenerate,
  videoModels = SAMPLE_VIDEO_MODELS,
  imageModels = SAMPLE_IMAGE_MODELS,
  loading = false,
  disabled = false,
  error,
  prefill = null,
}: {
  onGenerate: (payload: GenerationPayload) => void
  videoModels?: GenerationModelOption[]
  imageModels?: GenerationModelOption[]
  loading?: boolean
  disabled?: boolean
  error?: string | null
  prefill?: GenerationPrefill | null
}) {
  const effectiveVideoModels = videoModels.length > 0 ? videoModels : SAMPLE_VIDEO_MODELS
  const effectiveImageModels = imageModels.length > 0 ? imageModels : SAMPLE_IMAGE_MODELS
  const rootRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const appliedPrefillRef = useRef<number | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [mentionDraft, setMentionDraft] = useState('')
  const [uploadingReferences, setUploadingReferences] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [state, setState] = useState<GenerationState>(() => normalizeForModel({
    mode: 'video',
    prompt: '',
    model: effectiveVideoModels[0]?.id || SAMPLE_VIDEO_MODELS[0].id,
    count: 1,
    references: [],
    mentions: [],
    resolution: effectiveVideoModels[0]?.resolutions[0] || '720p',
    camera: '75mm',
    motion: 'medium-decay',
    styleMode: 'auto',
    duration: effectiveVideoModels[0]?.durations?.[0] || 4,
    audio: true,
  }, effectiveVideoModels, effectiveImageModels))

  useOnClickOutside(rootRef, () => setOpen(null))

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    setState(prev => normalizeForModel(prev, effectiveVideoModels, effectiveImageModels))
  }, [effectiveVideoModels, effectiveImageModels])

  // Aplica los datos de "Reusar" (una sola vez por nonce)
  useEffect(() => {
    if (!prefill || prefill.nonce === appliedPrefillRef.current) return
    appliedPrefillRef.current = prefill.nonce
    setOpen(null)
    const nextModels = getModelOptions(prefill.mode, effectiveVideoModels, effectiveImageModels)
    const modelExists = prefill.model && nextModels.some(model => model.id === prefill.model)
    setState(prev => normalizeForModel({
      ...prev,
      mode: prefill.mode,
      prompt: prefill.prompt,
      model: modelExists ? (prefill.model as string) : (nextModels[0]?.id || prev.model),
      count: clampCount(prefill.count || prev.count),
      resolution: prefill.resolution || prev.resolution,
      duration: prefill.mode === 'video' ? (prefill.duration || prev.duration) : undefined,
      aspectRatio: prefill.mode === 'image' ? (prefill.aspectRatio || prev.aspectRatio || '16:9') : undefined,
      mentions: prefill.mode === 'video' ? (prefill.mentions || []) : [],
      audio: prefill.mode === 'video' ? (prefill.audio ?? true) : undefined,
    }, effectiveVideoModels, effectiveImageModels))
  }, [prefill, effectiveVideoModels, effectiveImageModels])

  const models = getModelOptions(state.mode, effectiveVideoModels, effectiveImageModels)
  const selectedModel = models.find(model => model.id === state.model) || models[0]
  const modelChoices: Choice[] = models.map(model => ({
    value: model.id,
    label: model.label,
    description: [
      model.description,
      model.resolutions.length ? model.resolutions.join(', ') : null,
      model.durations?.length ? `${model.durations[0]}s-${model.durations[model.durations.length - 1]}s` : null,
    ].filter(Boolean).join(' · '),
    badge: model.badges?.[0],
  }))
  const resolutionChoices: Choice[] = (selectedModel?.resolutions || []).map(value => ({ value, label: value }))
  const durationChoices: Choice[] = (selectedModel?.durations || []).map(value => ({ value: String(value), label: `${value}s` }))
  const cost = useMemo(() => computeCost(state), [state])
  const canGenerate = Boolean(state.prompt.trim()) && models.length > 0 && !disabled && !uploadingReferences
  const modelAcceptsImage = selectedModel?.acceptsImage ?? false

  const patch = (next: Partial<GenerationState>) => {
    setState(prev => normalizeForModel({ ...prev, ...next }, effectiveVideoModels, effectiveImageModels))
  }

  const switchMode = (mode: GenerationMode) => {
    const nextModels = getModelOptions(mode, effectiveVideoModels, effectiveImageModels)
    const firstModel = nextModels[0]
    setOpen(null)
    setState(prev => normalizeForModel({
      ...prev,
      mode,
      model: firstModel?.id || prev.model,
      resolution: firstModel?.resolutions[0] || prev.resolution,
      duration: mode === 'video' ? firstModel?.durations?.[0] || 4 : undefined,
    }, effectiveVideoModels, effectiveImageModels))
  }

  const selectChoice = (key: string, value: string) => {
    if (key === 'model') {
      const model = models.find(item => item.id === value)
      patch({
        model: value,
        resolution: model?.resolutions[0] || state.resolution,
        duration: state.mode === 'video' ? model?.durations?.[0] || state.duration : undefined,
      })
    } else if (key === 'resolution') {
      patch({ resolution: value })
    } else if (key === 'duration') {
      patch({ duration: Number(value) })
    } else if (key === 'camera') {
      patch({ camera: value })
    } else if (key === 'motion') {
      patch({ motion: value })
    } else if (key === 'style') {
      patch({ styleMode: value })
    } else if (key === 'ratio') {
      patch({ aspectRatio: value })
    }
    setOpen(null)
  }

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).slice(0, 4)
    if (files.length === 0) return

    setUploadingReferences(true)
    setUploadError(null)

    try {
      const uploadedUrls = await Promise.all(files.map(async file => {
        const formData = new FormData()
        formData.append('file', file)
        const { data } = await api.post('/ugc/assets/reference', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        const url = data?.data?.url || data?.url
        if (!url || typeof url !== 'string') {
          throw new Error('El backend no devolvió la URL de la referencia.')
        }
        return url
      }))
      patch({ references: [...state.references, ...uploadedUrls].slice(0, 4) })
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.message ||
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (err instanceof Error ? err.message : 'No se pudo subir la referencia.')
      setUploadError(message)
    } finally {
      setUploadingReferences(false)
      event.target.value = ''
    }
  }

  const addMention = () => {
    const mention = mentionDraft.trim().replace(/^@/, '')
    if (!mention) return
    patch({ mentions: [...state.mentions, mention].slice(0, 8) })
    setMentionDraft('')
  }

  const onMentionKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      addMention()
    }
  }

  const emitGenerate = () => {
    if (!canGenerate || loading) return
    onGenerate({
      ...state,
      prompt: state.prompt.trim(),
      estimatedCost: cost,
    })
  }

  return (
    <Box
      ref={rootRef}
      sx={{
        position: 'fixed',
        left: { xs: 12, md: 'calc(var(--SideNav-width) + 24px)' },
        right: { xs: 12, md: 24 },
        bottom: 18,
        zIndex: 1000,
        pointerEvents: 'none',
      }}
    >
      {(error || uploadError) && (
        <Sheet
          color="danger"
          variant="soft"
          sx={{ mb: 1, p: 1.25, borderRadius: 'md', pointerEvents: 'auto' }}
        >
          <Typography level="body-sm" color="danger">{error || uploadError}</Typography>
        </Sheet>
      )}
      <Sheet
        variant="outlined"
        sx={{
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'stretch',
          gap: 1,
          p: 1,
          borderRadius: 'xl',
          bgcolor: 'background.surface',
          borderColor: 'divider',
          boxShadow: 'lg',
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0, flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <ModeToggle mode={state.mode} onChange={switchMode} />
            <Box sx={{ width: '1px', alignSelf: 'stretch', bgcolor: 'divider', mx: 0.25, display: { xs: 'none', sm: 'block' } }} />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={onFileChange}
            />
            <Tooltip
              title={modelAcceptsImage
                ? 'Subir imagen de referencia (texto + imagen)'
                : 'Este modelo solo admite texto'}
              arrow
            >
              <Box component="span" sx={{ display: 'inline-flex' }}>
                <IconButton
                  type="button"
                  color={state.references.length > 0 ? 'primary' : 'neutral'}
                  variant="soft"
                  size="sm"
                  disabled={!modelAcceptsImage || uploadingReferences}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadingReferences ? <CircularProgress size="sm" /> : <AddPhotoAlternate />}
                </IconButton>
              </Box>
            </Tooltip>
            {state.mode === 'video' && (
              <Box sx={{ position: 'relative' }}>
                <Tooltip title="Mencionar personajes o locaciones" arrow>
                  <IconButton
                    type="button"
                    color={open === 'mentions' ? 'primary' : 'neutral'}
                    variant="soft"
                    size="sm"
                    onClick={() => setOpen(open === 'mentions' ? null : 'mentions')}
                  >
                    <AlternateEmail />
                  </IconButton>
                </Tooltip>
                <Dropdown open={open === 'mentions'}>
                  <Box sx={{ display: 'grid', gap: 0.75 }}>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary', px: 0.5 }}>
                      Personajes / locaciones
                    </Typography>
                    <Box
                      component="input"
                      value={mentionDraft}
                      onChange={event => setMentionDraft(event.target.value)}
                      onKeyDown={onMentionKeyDown}
                      placeholder="@creador, @producto, @estudio"
                      sx={{
                        width: '100%',
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: '8px',
                        bgcolor: 'background.level1',
                        color: 'text.primary',
                        px: 1,
                        py: 0.75,
                        font: 'inherit',
                        outline: 'none',
                      }}
                    />
                    <Button size="sm" onClick={addMention}>Agregar</Button>
                    {state.mentions.length > 0 && (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {state.mentions.map(mention => (
                          <Chip
                            key={mention}
                            size="sm"
                            color="primary"
                            variant="soft"
                            onClick={() => patch({ mentions: state.mentions.filter(item => item !== mention) })}
                            sx={{ cursor: 'pointer' }}
                          >
                            @{mention}
                          </Chip>
                        ))}
                      </Box>
                    )}
                  </Box>
                </Dropdown>
              </Box>
            )}
            <Box
              component="textarea"
              value={state.prompt}
              onChange={event => patch({ prompt: event.target.value })}
              placeholder={state.mode === 'video'
                ? 'Describe la escena que quieres generar…'
                : 'Describe la imagen que quieres crear…'}
              rows={1}
              sx={{
                flex: 1,
                minWidth: 0,
                minHeight: 40,
                maxHeight: 96,
                resize: 'none',
                border: 'none',
                outline: 'none',
                bgcolor: 'transparent',
                color: 'text.primary',
                font: 'inherit',
                fontSize: 15,
                lineHeight: 1.35,
                px: 1,
                py: 0.75,
                '&::placeholder': { color: 'text.tertiary' },
              }}
            />
          </Box>

          <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap', minHeight: 34, alignContent: 'center' }}>
            <Box sx={{ position: 'relative' }}>
              <ParamChip
                label="Modelo"
                value={selectedModel?.label || 'Modelo'}
                open={open === 'model'}
                onClick={() => setOpen(open === 'model' ? null : 'model')}
              />
              <Dropdown open={open === 'model'} wide>
                <Typography level="body-xs" sx={{ color: 'text.tertiary', px: 0.75, pb: 0.5 }}>
                  Modelo de generación
                </Typography>
                <ChoiceList options={modelChoices} value={state.model} onSelect={value => selectChoice('model', value)} />
              </Dropdown>
            </Box>

            {state.mode === 'video' ? (
              <>
                <Box sx={{ position: 'relative' }}>
                  <ParamChip label="Camera" value={optionLabel(CAMERA_OPTIONS, state.camera)} open={open === 'camera'} onClick={() => setOpen(open === 'camera' ? null : 'camera')} />
                  <Dropdown open={open === 'camera'}><ChoiceList options={CAMERA_OPTIONS} value={state.camera} onSelect={value => selectChoice('camera', value)} /></Dropdown>
                </Box>
                <Box sx={{ position: 'relative' }}>
                  <ParamChip label="Motion" value={optionLabel(MOTION_OPTIONS, state.motion)} open={open === 'motion'} onClick={() => setOpen(open === 'motion' ? null : 'motion')} />
                  <Dropdown open={open === 'motion'}><ChoiceList options={MOTION_OPTIONS} value={state.motion} onSelect={value => selectChoice('motion', value)} /></Dropdown>
                </Box>
                <Box sx={{ position: 'relative' }}>
                  <ParamChip label="Auto" value={optionLabel(STYLE_MODE_OPTIONS, state.styleMode)} open={open === 'style'} onClick={() => setOpen(open === 'style' ? null : 'style')} />
                  <Dropdown open={open === 'style'}><ChoiceList options={STYLE_MODE_OPTIONS} value={state.styleMode} onSelect={value => selectChoice('style', value)} /></Dropdown>
                </Box>
              </>
            ) : (
              <Box sx={{ position: 'relative' }}>
                <ParamChip label="Ratio" value={state.aspectRatio || '16:9'} open={open === 'ratio'} onClick={() => setOpen(open === 'ratio' ? null : 'ratio')} />
                <Dropdown open={open === 'ratio'}><ChoiceList options={IMAGE_RATIOS} value={state.aspectRatio} onSelect={value => selectChoice('ratio', value)} /></Dropdown>
              </Box>
            )}

            <Box sx={{ position: 'relative' }}>
              <ParamChip label="Resolución" value={state.resolution} open={open === 'resolution'} onClick={() => setOpen(open === 'resolution' ? null : 'resolution')} />
              <Dropdown open={open === 'resolution'}><ChoiceList options={state.mode === 'image' && resolutionChoices.length === 0 ? IMAGE_RESOLUTIONS.map(value => ({ value, label: value })) : resolutionChoices} value={state.resolution} onSelect={value => selectChoice('resolution', value)} /></Dropdown>
            </Box>

            {state.mode === 'video' && (
              <>
                <Box sx={{ position: 'relative' }}>
                  <ParamChip label="Duración" value={`${state.duration || 4}s`} open={open === 'duration'} onClick={() => setOpen(open === 'duration' ? null : 'duration')} />
                  <Dropdown open={open === 'duration'}>
                    <Box sx={{ display: 'grid', gap: 0.75, minWidth: 220 }}>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary', px: 0.5 }}>
                        Duración en segundos (escribe el valor)
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box
                          component="input"
                          type="number"
                          min={1}
                          value={state.duration ?? ''}
                          onChange={event => patch({ duration: Number(event.target.value) })}
                          sx={{
                            width: '100%',
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: '8px',
                            bgcolor: 'background.level1',
                            color: 'text.primary',
                            px: 1,
                            py: 0.75,
                            font: 'inherit',
                            outline: 'none',
                          }}
                        />
                        <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>seg</Typography>
                      </Box>
                      {durationChoices.length > 0 && (
                        <>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary', px: 0.5 }}>
                            Recomendado para {selectedModel?.label}
                          </Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {durationChoices.map(choice => {
                              const active = String(state.duration) === choice.value
                              return (
                                <Chip
                                  key={choice.value}
                                  size="sm"
                                  variant={active ? 'solid' : 'soft'}
                                  color="primary"
                                  onClick={() => patch({ duration: Number(choice.value) })}
                                  sx={{ cursor: 'pointer' }}
                                >
                                  {choice.label}
                                </Chip>
                              )
                            })}
                          </Box>
                        </>
                      )}
                    </Box>
                  </Dropdown>
                </Box>
                <Tooltip title="Agrega voz/locución IA al video" arrow>
                  <Chip
                    component="button"
                    type="button"
                    size="sm"
                    variant={state.audio ? 'solid' : 'outlined'}
                    color={state.audio ? 'primary' : 'neutral'}
                    onClick={() => patch({ audio: !state.audio })}
                    startDecorator={state.audio ? <VolumeUp sx={{ fontSize: 15 }} /> : <VolumeOff sx={{ fontSize: 15 }} />}
                    sx={{ borderRadius: 999, cursor: 'pointer', fontWeight: 700, flexShrink: 0 }}
                  >
                    Voz {state.audio ? 'On' : 'Off'}
                  </Chip>
                </Tooltip>
              </>
            )}

            {state.references.length > 0 && (
              <Chip size="sm" variant="soft" color="primary">
                {state.references.length} ref
              </Chip>
            )}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: { xs: 0, md: 0.5 }, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
          <Stepper value={state.count} onChange={count => patch({ count })} />
          <GenerateButton
            cost={cost}
            disabled={!canGenerate}
            loading={loading}
            onClick={emitGenerate}
          />
        </Box>
      </Sheet>
    </Box>
  )
}
