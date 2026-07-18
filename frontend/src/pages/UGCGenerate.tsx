import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react'
// [Migración DS] CircularProgress se CONSERVA como MUI Joy (no hay equivalente en el
// design system Tailwind/Radix). El resto de la UI usa tokens + componentes @/components/ui.
import { CircularProgress } from '@mui/joy'
import {
  VideoCamera as Film,
  Image as ImageIcon,
  Plus,
  Minus,
  Sparkle as Sparkles,
  Diamond as Gem,
  MonitorPlay,
  Clock,
  Rectangle as RectangleHorizontal,
  SpeakerHigh as Volume2,
  SpeakerX as VolumeX,
  Palette,
  FilmSlate as Clapperboard,
  Camera,
  Sun,
  DownloadSimple as Download,
  MagicWand as Wand2,
  CaretDown as ChevronDown,
  Sliders as Settings2,
  ImageSquare as ImagePlus,
  X,
  Lightbulb,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  listModels,
  getModelDetail,
  estimateCost,
  createJob,
  pollJob,
  uploadReference,
  groupStylesByCategory,
  type NormalizedModel,
  type NormalizedModelDetail,
  type StylePreset,
  type CostEstimate,
  type GenerationJob,
  type MediaType,
  type GenerationRequestBody
} from '../services/generationService'

/**
 * UGCGenerate — Cinema Studio. Experiencia tipo higgsfield.ai/generate migrada al
 * design system (Tailwind v4 + tokens + shadcn/Radix):
 *   • Píldoras superiores (Mood / Genre / Camera…) que abren un picker (Dialog) con
 *     preview grande. Se generan de las categorías de `model.styles`.
 *   • Barra única: toggle Image/Video, +/@, prompt, modelo, resolución,
 *     duración, formato, cantidad, audio, y el botón GENERATE con el costo.
 *
 * Toda la lógica y el contrato con `generationService` se mantienen intactos.
 */

// Params que ya tienen su propio control en la barra (no se duplican como chip extra).
const STANDARD_PARAMS = ['resolution', 'aspectRatio', 'duration', 'count', 'audio', 'startImage', 'prompt']

type Selection = {
  resolution?: string
  aspectRatio?: string
  duration?: number
  audio?: boolean
  count: number
}

function isVideoUrl(url?: string): boolean {
  return !!url && /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url)
}

/** Icono según el nombre de la categoría de estilo. */
function categoryIcon(category: string, size = 15): ReactNode {
  const c = category.toLowerCase()
  if (c.includes('mood')) return <Palette size={size} />
  if (c.includes('gen')) return <Clapperboard size={size} />
  if (c.includes('cam')) return <Camera size={size} />
  if (c.includes('light') || c.includes('luz')) return <Sun size={size} />
  return <Sparkles size={size} />
}

/** Render robusto de imagen/video con fallback elegante. */
function MediaPreview({
  url,
  poster,
  mediaType,
  alt,
  hoverPlay = false,
  round = false
}: {
  url?: string
  poster?: string
  mediaType?: MediaType
  alt: string
  hoverPlay?: boolean
  round?: boolean
}) {
  const [errored, setErrored] = useState(false)
  // Decidir por la EXTENSIÓN real: muchos previews "de video" (motions) son
  // imágenes .webp, así que solo usamos <video> para URLs realmente de video.
  const isImageUrl = /\.(jpe?g|png|webp|gif|avif)(\?.*)?$/i.test(url || '')
  const showVideo = !!url && (isVideoUrl(url) || (mediaType === 'video' && !isImageUrl))
  const noMedia = !url || errored || /placeholder/i.test(url)
  const rounded = round ? 'rounded-full' : ''

  // Fallback con icono (nunca imagen rota).
  if (noMedia) {
    return (
      <div
        className={cn('flex size-full items-center justify-center bg-muted text-muted-foreground', rounded)}
        aria-label={`${alt} (sin ejemplo)`}
      >
        {mediaType === 'image' ? <ImageIcon size={26} /> : <Film size={26} />}
      </div>
    )
  }
  if (showVideo) {
    return (
      <video
        src={url}
        poster={poster}
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={alt}
        onError={() => setErrored(true)}
        onMouseOver={hoverPlay ? e => void (e.currentTarget as HTMLVideoElement).play() : undefined}
        onMouseOut={hoverPlay ? e => (e.currentTarget as HTMLVideoElement).pause() : undefined}
        className={cn('size-full object-cover', rounded)}
      />
    )
  }
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      onError={() => setErrored(true)}
      className={cn('size-full object-cover', rounded)}
    />
  )
}

/** Contenedor con relación de aspecto por CSS. */
function Frame({
  ratio = '1 / 1',
  className,
  children
}: {
  ratio?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'relative w-full overflow-hidden bg-muted [&>*]:absolute [&>*]:inset-0 [&>*]:size-full',
        className
      )}
      style={{ aspectRatio: ratio }}
    >
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Modal-picker estilo "Genre": preview grande + lista                 */
/* ------------------------------------------------------------------ */
function StylePickerModal({
  open,
  title,
  options,
  selectedId,
  onSelect,
  onClose
}: {
  open: boolean
  title: string
  options: StylePreset[]
  selectedId?: string
  onSelect: (id?: string) => void
  onClose: () => void
}) {
  const [hoverId, setHoverId] = useState<string | undefined>(selectedId)
  useEffect(() => setHoverId(selectedId), [selectedId, open])
  const highlighted = options.find(o => o.id === hoverId) || options.find(o => o.id === selectedId)

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-[min(920px,94vw)] gap-0 overflow-hidden p-0">
        <div className="flex items-center gap-2 px-6 py-4">
          <span className="text-primary">{categoryIcon(title, 18)}</span>
          <DialogTitle className="flex-1">{title}</DialogTitle>
        </div>
        <div className="grid grid-cols-1 gap-6 p-6 pt-0 sm:grid-cols-[1.1fr_1fr]">
          {/* Preview grande del resaltado */}
          <div>
            <Frame ratio="1 / 1" className="rounded-2xl shadow-lg">
              <MediaPreview url={highlighted?.previewUrl} alt={highlighted?.label || title} />
            </Frame>
            <p className="mt-3 text-base font-semibold text-foreground">
              {highlighted?.label || 'Auto'}
            </p>
            {highlighted?.description && (
              <p className="mt-0.5 text-sm text-muted-foreground">{highlighted.description}</p>
            )}
          </div>

          {/* Lista scrollable de opciones */}
          <div className="flex max-h-[380px] flex-col gap-1 overflow-y-auto pr-1">
            <OptionRow
              label="Auto"
              previewUrl={undefined}
              active={!selectedId}
              onMouseEnter={() => setHoverId(undefined)}
              onClick={() => { onSelect(undefined); onClose() }}
            />
            {options.map(o => (
              <OptionRow
                key={o.id}
                label={o.label}
                previewUrl={o.previewUrl}
                active={selectedId === o.id}
                onMouseEnter={() => setHoverId(o.id)}
                onClick={() => { onSelect(o.id); onClose() }}
              />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function OptionRow({
  label,
  previewUrl,
  active,
  onMouseEnter,
  onClick
}: {
  label: string
  previewUrl?: string
  active: boolean
  onMouseEnter: () => void
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-xl border p-1.5 pr-3 text-left transition-colors',
        active ? 'border-primary bg-primary/12' : 'border-transparent hover:bg-accent'
      )}
    >
      <span className="block size-11 shrink-0 overflow-hidden rounded-lg">
        <MediaPreview url={previewUrl} alt={label} />
      </span>
      <span className={cn('text-sm', active ? 'font-bold text-foreground' : 'font-medium text-muted-foreground')}>
        {label}
      </span>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Modal-picker de modelos                                             */
/* ------------------------------------------------------------------ */
function ModelPickerModal({
  open,
  models,
  selectedId,
  onSelect,
  onClose
}: {
  open: boolean
  models: NormalizedModel[]
  selectedId?: string
  onSelect: (m: NormalizedModel) => void
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-[min(760px,94vw)]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Gem size={18} className="text-primary" />
            <DialogTitle className="flex-1">Modelos</DialogTitle>
          </div>
        </DialogHeader>
        <div className="grid max-h-[470px] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
          {models.map(m => {
            const active = selectedId === m.id
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => { onSelect(m); onClose() }}
                className={cn(
                  'overflow-hidden rounded-2xl border bg-card text-left transition-transform hover:-translate-y-0.5',
                  active ? 'border-primary' : 'border-border'
                )}
              >
                <Frame ratio="16 / 9">
                  <MediaPreview
                    url={m.previews?.[0]?.exampleUrl ?? m.previews?.[0]?.thumbnailUrl}
                    poster={m.previews?.[0]?.thumbnailUrl}
                    mediaType={m.previews?.[0]?.mediaType}
                    alt={m.name}
                    hoverPlay
                  />
                </Frame>
                <div className="p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold text-foreground">{m.name}</span>
                    {m.badges?.map(b => (
                      <Badge key={b} variant="primary">{b}</Badge>
                    ))}
                  </div>
                  {m.pricingLabel && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{m.pricingLabel}</p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Chip-control redondeado de la barra                                 */
/* ------------------------------------------------------------------ */
function BarControl({
  children,
  onClick,
  active,
  title
}: {
  children: ReactNode
  onClick?: () => void
  active?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-semibold leading-none transition-colors',
        active
          ? 'border-primary bg-primary/12 text-primary'
          : 'border-border bg-card text-foreground hover:bg-accent',
        !onClick && 'cursor-default'
      )}
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Componente principal                                                */
/* ------------------------------------------------------------------ */
export default function UGCGenerate() {
  const [mediaType, setMediaType] = useState<MediaType>('video')
  const [models, setModels] = useState<NormalizedModel[]>([])
  const [loadingModels, setLoadingModels] = useState(true)
  const [modelsError, setModelsError] = useState<string | null>(null)

  const [selectedModel, setSelectedModel] = useState<NormalizedModelDetail | null>(null)

  const [styleByCategory, setStyleByCategory] = useState<Record<string, string>>({})
  const [openCategory, setOpenCategory] = useState<string | null>(null)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)

  const [prompt, setPrompt] = useState('')
  const [selection, setSelection] = useState<Selection>({ count: 1 })
  // Parámetros enum extra del modelo (ej. DoP "model": lite/turbo/standard).
  const [extraParams, setExtraParams] = useState<Record<string, string>>({})
  // Imágenes de referencia subidas (input_images para DoP, image_reference para Soul).
  const [references, setReferences] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  // enhance_prompt (recomendado) — mejora el prompt automáticamente.
  const [enhance, setEnhance] = useState(true)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [cost, setCost] = useState<CostEstimate | null>(null)
  const [estimating, setEstimating] = useState(false)

  const [generating, setGenerating] = useState(false)
  const [job, setJob] = useState<GenerationJob | null>(null)
  const [genError, setGenError] = useState<string | null>(null)

  const costTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const styleGroups = useMemo(() => groupStylesByCategory(selectedModel?.styles), [selectedModel])
  const maxCount = selectedModel?.capabilities.maxCount ?? 4

  // --- Cargar catálogo + auto-seleccionar primer modelo ---
  useEffect(() => {
    let active = true
    setLoadingModels(true)
    setModelsError(null)
    setSelectedModel(null)
    setStyleByCategory({})
    setCost(null)
    listModels({ type: mediaType })
      .then(async list => {
        if (!active) return
        setModels(list)
        if (list[0]) {
          const detail = await getModelDetail(list[0].id)
          if (active) applyModelDefaults(detail)
        }
      })
      .catch(err => active && setModelsError(err?.message || 'Error cargando modelos'))
      .finally(() => active && setLoadingModels(false))
    return () => { active = false }
  }, [mediaType])

  function applyModelDefaults(detail: NormalizedModelDetail) {
    setSelectedModel(detail)
    setStyleByCategory({})
    const defaults: Selection = { count: 1 }
    for (const p of detail.params) {
      if (p.name === 'resolution' && typeof p.default === 'string') defaults.resolution = p.default
      if (p.name === 'aspectRatio' && typeof p.default === 'string') defaults.aspectRatio = p.default
      if (p.name === 'duration' && p.default != null) defaults.duration = Number(p.default)
      if (p.name === 'audio' && typeof p.default === 'boolean') defaults.audio = p.default
      if (p.name === 'count' && p.default != null) defaults.count = Number(p.default)
    }
    if (!defaults.resolution) defaults.resolution = detail.capabilities.resolutions[0]
    if (!defaults.duration && detail.capabilities.durations) defaults.duration = detail.capabilities.durations[0]
    if (!defaults.aspectRatio && detail.capabilities.aspectRatios) defaults.aspectRatio = detail.capabilities.aspectRatios[0]
    setSelection(defaults)
    // Inicializar params enum extra (los que NO son chips estándar).
    const extra: Record<string, string> = {}
    for (const p of detail.params) {
      if (p.type === 'enum' && !STANDARD_PARAMS.includes(p.name)) {
        const def = p.default != null ? String(p.default) : p.enumValues?.[0]?.value
        if (def) extra[p.name] = def
      }
    }
    setExtraParams(extra)
    setReferences([])
    setEnhance(true)
  }

  // --- Subir imagen de referencia (botón +) ---
  const handlePickFile = useCallback(() => fileInputRef.current?.click(), [])
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setGenError(null)
    try {
      const { url, id } = await uploadReference(file, 'higgsfield')
      const ref = url || id
      if (ref) setReferences(prev => [...prev, ref])
    } catch (err) {
      setGenError((err as Error)?.message || 'No se pudo subir la imagen')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [])
  const removeReference = useCallback((url: string) => {
    setReferences(prev => prev.filter(r => r !== url))
  }, [])

  const handleSelectModel = useCallback(async (model: NormalizedModel) => {
    setGenError(null)
    try {
      const detail = await getModelDetail(model.id)
      applyModelDefaults(detail)
    } catch (err) {
      setGenError((err as Error)?.message || 'Error cargando el modelo')
    }
  }, [])

  const selectedStyleIds = Object.values(styleByCategory)
  const selectedStyles = (selectedModel?.styles || []).filter(s => selectedStyleIds.includes(s.id))
  const primaryStyleId = selectedStyleIds[0]

  // --- Costo (debounced) ---
  useEffect(() => {
    if (!selectedModel || !prompt.trim()) { setCost(null); return }
    if (costTimer.current) clearTimeout(costTimer.current)
    costTimer.current = setTimeout(() => {
      setEstimating(true)
      estimateCost({
        mediaType,
        modelId: selectedModel.id,
        prompt: prompt.trim(),
        styleId: primaryStyleId,
        resolution: selection.resolution,
        aspectRatio: selection.aspectRatio,
        duration: selection.duration,
        audio: selection.audio,
        count: selection.count
      })
        .then(setCost)
        .catch(() => setCost(null))
        .finally(() => setEstimating(false))
    }, 600)
    return () => { if (costTimer.current) clearTimeout(costTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModel, prompt, JSON.stringify(styleByCategory), JSON.stringify(selection), mediaType])

  // --- Generar ---
  const handleGenerate = useCallback(async () => {
    if (!selectedModel || !prompt.trim()) return
    setGenerating(true)
    setGenError(null)
    setJob(null)
    try {
      // Merge: params de estilos/motions seleccionados + params enum extra (Motor…) + enhance.
      const mergedParams = Object.assign(
        {},
        ...selectedStyles.map(s => s.params),
        extraParams,
        { enhance_prompt: enhance }
      )
      const body: GenerationRequestBody = {
        mediaType,
        modelId: selectedModel.id,
        prompt: prompt.trim(),
        styleId: primaryStyleId,
        resolution: selection.resolution,
        aspectRatio: selection.aspectRatio,
        duration: selection.duration,
        audio: selection.audio,
        count: selection.count,
        references: references.length ? references : undefined,
        params: Object.keys(mergedParams).length ? mergedParams : undefined
      }
      const created = await createJob(body)
      const finalJob = await pollJob(created.jobId, setJob)
      setJob(finalJob)
      if (finalJob.status === 'failed') setGenError(finalJob.error || 'La generación falló')
    } catch (err) {
      setGenError((err as Error)?.message || 'Error al generar')
    } finally {
      setGenerating(false)
    }
  }, [selectedModel, prompt, selectedStyles, primaryStyleId, selection, extraParams, references, enhance, mediaType])

  const canGenerate = !!selectedModel && !!prompt.trim() && !generating
  const cap = selectedModel?.capabilities

  // helper: ciclar valor de un select-chip
  const cycle = <T,>(arr: T[] | undefined, cur: T | undefined, set: (v: T) => void) => {
    if (!arr?.length) return
    const i = arr.findIndex(x => x === cur)
    set(arr[(i + 1) % arr.length])
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="flex min-h-full flex-col items-center px-4 pb-16">
        {/* Hero */}
        <div className="mb-10 mt-14 text-center">
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-primary">
            <Sparkles size={14} />
            <span className="text-xs font-bold tracking-wide">CINEMA STUDIO · HIGGSFIELD</span>
          </div>
          <h1 className="text-3xl font-extrabold leading-tight text-foreground md:text-[44px]">
            Crea tu primer proyecto
          </h1>
          <p className="text-3xl font-extrabold leading-tight text-primary md:text-[44px]">
            Genera lo imposible
          </p>
        </div>

        {modelsError && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/12 px-4 py-3 text-sm text-destructive-text">
            {modelsError}
          </div>
        )}
        {loadingModels && (
          <CircularProgress sx={{ my: 4, '--CircularProgress-progressColor': 'var(--primary)' }} />
        )}

        {/* Píldoras superiores: categorías de estilos */}
        {selectedModel && Object.keys(styleGroups).length > 0 && (
          <div className="mb-6 flex max-w-[1040px] flex-wrap justify-center gap-2">
            {Object.entries(styleGroups).map(([category, styles]) => {
              const selId = styleByCategory[category]
              const sel = styles.find(s => s.id === selId)
              const isOn = !!sel
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setOpenCategory(category)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border py-1 pl-1.5 pr-3.5 transition-colors',
                    isOn ? 'border-primary bg-primary/12' : 'border-border bg-card hover:bg-accent'
                  )}
                >
                  <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-primary">
                    {sel?.previewUrl ? <MediaPreview url={sel.previewUrl} alt={category} round /> : categoryIcon(category)}
                  </span>
                  <span className="text-xs text-muted-foreground">{category}</span>
                  <span className="text-sm font-bold text-foreground">{sel?.label || 'Auto'}</span>
                  <ChevronDown size={14} className="text-muted-foreground" />
                </button>
              )
            })}
          </div>
        )}

        {/* === BARRA ÚNICA === */}
        {selectedModel && (
          <div className="flex w-full max-w-[1040px] items-stretch gap-3 rounded-3xl border border-border bg-card p-3 shadow-lg">
            {/* Toggle Image/Video */}
            <div className="flex flex-col gap-1 rounded-2xl bg-muted p-1">
              {(['video', 'image'] as MediaType[]).map(t => {
                const on = mediaType === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setMediaType(t)}
                    aria-pressed={on}
                    className={cn(
                      'flex h-12 w-16 flex-col items-center justify-center gap-0.5 rounded-xl border transition-colors',
                      on
                        ? 'border-primary bg-primary/12 text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {t === 'image' ? <ImageIcon size={18} /> : <Film size={18} />}
                    <span className="text-xs font-semibold">{t === 'image' ? 'Imagen' : 'Video'}</span>
                  </button>
                )
              })}
            </div>

            {/* Centro: prompt + chips */}
            <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">
              <textarea
                rows={2}
                placeholder={mediaType === 'video'
                  ? 'Describe tu escena — usa @ para añadir personajes y locaciones'
                  : 'Describe la imagen que quieres crear…'}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                className="max-h-24 min-h-[40px] w-full resize-none bg-transparent px-1 text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
              />
              {/* Miniaturas de imágenes de referencia subidas */}
              {references.length > 0 && (
                <div className="mb-0.5 flex flex-wrap gap-2">
                  {references.map(url => (
                    <div key={url} className="relative size-11 overflow-hidden rounded-lg border border-border">
                      <img src={url} alt="ref" className="size-full object-cover" />
                      <button
                        type="button"
                        aria-label="Quitar imagen de referencia"
                        onClick={() => removeReference(url)}
                        className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-black/60 text-white"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {/* Subir imagen de referencia */}
                <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFileChange} />
                <BarControl onClick={uploading ? undefined : handlePickFile} title="Subir imagen de referencia">
                  {uploading
                    ? <CircularProgress size="sm" sx={{ '--CircularProgress-size': '15px', '--CircularProgress-progressColor': 'var(--primary)' }} />
                    : <ImagePlus size={15} />}
                  {mediaType === 'video' ? 'Imagen inicio' : 'Referencia'}
                </BarControl>

                {/* Mejorar prompt (recomendado) */}
                <BarControl onClick={() => setEnhance(v => !v)} active={enhance} title="Mejorar prompt automáticamente (recomendado)">
                  <Sparkles size={15} /> Mejorar
                </BarControl>

                {/* Modelo */}
                <BarControl onClick={() => setModelPickerOpen(true)} active title="Elegir modelo">
                  <Gem size={15} className="text-primary" /> {selectedModel.name}
                </BarControl>

                {/* Resolución */}
                {cap?.resolutions?.length ? (
                  <BarControl onClick={() => cycle(cap.resolutions, selection.resolution, v => setSelection(s => ({ ...s, resolution: v })))} title="Resolución">
                    <MonitorPlay size={15} /> {selection.resolution}
                  </BarControl>
                ) : null}

                {/* Duración (video) */}
                {mediaType === 'video' && cap?.durations?.length ? (
                  <BarControl onClick={() => cycle(cap.durations, selection.duration, v => setSelection(s => ({ ...s, duration: v })))} title="Duración">
                    <Clock size={15} /> {selection.duration}s
                  </BarControl>
                ) : null}

                {/* Formato / aspect ratio (imagen y video) */}
                {cap?.aspectRatios?.length ? (
                  <BarControl onClick={() => cycle(cap.aspectRatios, selection.aspectRatio, v => setSelection(s => ({ ...s, aspectRatio: v })))} title="Formato">
                    <RectangleHorizontal size={15} /> {selection.aspectRatio}
                  </BarControl>
                ) : null}

                {/* Params enum extra del modelo (ej. DoP Motor: Lite/Turbo/Standard) */}
                {(selectedModel.params || [])
                  .filter(p => p.type === 'enum' && !STANDARD_PARAMS.includes(p.name) && (p.enumValues?.length || 0) > 0)
                  .map(p => {
                    const vals = p.enumValues!.map(e => e.value)
                    const cur = extraParams[p.name] ?? vals[0]
                    const curLabel = p.enumValues!.find(e => e.value === cur)?.label ?? cur
                    return (
                      <BarControl
                        key={p.name}
                        title={p.label}
                        onClick={() => {
                          const i = vals.findIndex(v => v === cur)
                          const next = vals[(i + 1) % vals.length]
                          setExtraParams(prev => ({ ...prev, [p.name]: next }))
                        }}
                      >
                        <Settings2 size={15} /> {curLabel}
                      </BarControl>
                    )
                  })}

                {/* Stepper cantidad (solo si el modelo permite >1) */}
                {maxCount > 1 && (
                  <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-card px-1">
                    <Button variant="ghost" size="icon" aria-label="Menos cantidad" className="size-7 rounded-full" onClick={() => setSelection(s => ({ ...s, count: Math.max(1, s.count - 1) }))}>
                      <Minus size={14} />
                    </Button>
                    <span className="min-w-[30px] text-center text-sm font-semibold text-foreground">{selection.count}/{maxCount}</span>
                    <Button variant="ghost" size="icon" aria-label="Más cantidad" className="size-7 rounded-full" onClick={() => setSelection(s => ({ ...s, count: Math.min(maxCount, s.count + 1) }))}>
                      <Plus size={14} />
                    </Button>
                  </div>
                )}

                {/* Audio (video) */}
                {mediaType === 'video' && cap?.supportsAudio && (
                  <BarControl onClick={() => setSelection(s => ({ ...s, audio: !(s.audio ?? true) }))} active={selection.audio ?? true} title="Audio nativo">
                    {(selection.audio ?? true) ? <Volume2 size={15} /> : <VolumeX size={15} />}
                    {(selection.audio ?? true) ? 'Audio' : 'Mudo'}
                  </BarControl>
                )}
              </div>
            </div>

            {/* Generate */}
            <div className="flex items-center">
              <Button
                onClick={handleGenerate}
                loading={generating}
                disabled={!canGenerate}
                className="h-full min-h-[76px] min-w-[132px] flex-col gap-0.5 rounded-2xl text-[15px] font-extrabold"
              >
                {!generating && <Wand2 size={18} />}
                Generar
                <span className="text-xs font-bold opacity-90">
                  {estimating ? '…' : cost ? cost.displayLabel : ''}
                </span>
              </Button>
            </div>
          </div>
        )}

        {/* Recomendación del estilo/cámara seleccionado */}
        {selectedModel && selectedStyles.length > 0 && selectedStyles[0]?.description && (
          <div className="mt-4 flex w-full max-w-[1040px] items-start gap-2 px-1">
            <Lightbulb size={16} className="mt-0.5 shrink-0 text-primary" />
            <p className="text-sm text-muted-foreground">
              <b className="text-foreground">{selectedStyles[0].label}:</b> {selectedStyles[0].description}
            </p>
          </div>
        )}

        {/* Aviso: DoP necesita imagen de inicio */}
        {selectedModel && mediaType === 'video' && selectedModel.capabilities.supportsStartFrame && references.length === 0 && (
          <div className="mt-2 flex w-full max-w-[1040px] items-center gap-2 px-1">
            <ImagePlus size={15} className="text-warning-text" />
            <p className="text-xs text-warning-text">
              Este modelo anima una imagen: sube una con “Imagen inicio” para mejores resultados.
            </p>
          </div>
        )}

        {/* Errores */}
        {genError && (
          <div className="mt-4 w-full max-w-[1040px] rounded-lg border border-destructive/30 bg-destructive/12 px-4 py-3 text-sm text-destructive-text">
            {genError}
          </div>
        )}

        {/* Resultado */}
        {job && (
          <div className="mt-6 w-full max-w-[1040px] rounded-2xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles size={18} className="text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Resultado</h2>
              <Badge variant="primary">{job.status}</Badge>
            </div>
            {(job.status === 'pending' || job.status === 'processing') && (
              <div className="flex items-center gap-4">
                <CircularProgress
                  determinate={typeof job.progress === 'number'}
                  value={job.progress ?? 0}
                  sx={{ '--CircularProgress-progressColor': 'var(--primary)' }}
                />
                <p className="text-sm text-muted-foreground">Generando… {job.progress ?? 0}%</p>
              </div>
            )}
            {job.status === 'completed' && job.outputs?.length ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {job.outputs.map((out, i) => (
                  <div key={i} className="overflow-hidden rounded-xl border border-border bg-card">
                    <Frame ratio="16 / 9">
                      {out.mediaType === 'video'
                        ? <video src={out.url} controls className="size-full" />
                        : <img src={out.url} alt={`output-${i}`} className="size-full object-cover" />}
                    </Frame>
                    <div className="p-2">
                      <a
                        href={out.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-3.5 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
                      >
                        <Download size={15} /> Descargar
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {/* Modales */}
        {openCategory && (
          <StylePickerModal
            open={!!openCategory}
            title={openCategory}
            options={styleGroups[openCategory] || []}
            selectedId={styleByCategory[openCategory]}
            onSelect={id =>
              setStyleByCategory(prev => {
                const next = { ...prev }
                if (id) next[openCategory] = id
                else delete next[openCategory]
                return next
              })
            }
            onClose={() => setOpenCategory(null)}
          />
        )}

        <ModelPickerModal
          open={modelPickerOpen}
          models={models}
          selectedId={selectedModel?.id}
          onSelect={handleSelectModel}
          onClose={() => setModelPickerOpen(false)}
        />
      </div>
    </div>
  )
}
