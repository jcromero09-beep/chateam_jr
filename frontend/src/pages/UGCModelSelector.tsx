import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
// [migración] Solo se conserva CircularProgress de MUI Joy (sin equivalente Radix).
import { CircularProgress } from '@mui/joy'
import { Check } from '@phosphor-icons/react'
import { toast } from 'react-toastify'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import ModelGalleryGrid from '../components/UGCModelSelector/ModelGalleryGrid'
import ModelDetailModal from '../components/UGCModelSelector/ModelDetailModal'
import PipelineModeSelector from '../components/UGCModelSelector/PipelineModeSelector'
import PipelineSummary from '../components/UGCModelSelector/PipelineSummary'
import {
  listFalModels,
  getCampaign,
  savePipelineSelection,
  type FalCatalogEntry,
  type FalModelCategory,
  type UGCCampaignModelSelection,
  type ValidationIssue,
  type PipelineMode,
  type SavePipelineSelectionPayload
} from '../services/ugcModelSelectorService'

type SlotName = 'image' | 'video' | 'voice' | 'lipsync'

interface SlotChoice {
  model: FalCatalogEntry
  defaults: Record<string, unknown>
}

/**
 * Categorías permitidas por (pipelineMode, slot). Espejo del MATRIX del
 * backend en ValidatePipelineSelection.ts — duplicado intencional para
 * pre-validar en cliente y evitar tocar el backend por errores triviales.
 */
function expectedCategories(
  mode: PipelineMode,
  slot: SlotName
): FalModelCategory[] {
  if (slot === 'image') {
    return mode === 'text-to-video-direct' ? [] : ['text-to-image']
  }
  if (slot === 'video') {
    if (mode === 'text-to-video-direct') return ['text-to-video']
    if (mode === 'lipsync-talking-head') return ['image-to-video']
    return ['image-to-video', 'video-to-video']
  }
  if (slot === 'voice') {
    return ['text-to-speech']
  }
  // lipsync
  return mode === 'lipsync-talking-head' ? ['lipsync'] : []
}

interface WizardStep {
  key: 'mode' | SlotName | 'summary'
  label: string
  isApplicable: (mode: PipelineMode | null) => boolean
}

const STEPS: WizardStep[] = [
  { key: 'mode', label: 'Modo', isApplicable: () => true },
  {
    key: 'image',
    label: 'Imagen',
    isApplicable: m => m !== null && m !== 'text-to-video-direct'
  },
  { key: 'video', label: 'Video', isApplicable: m => m !== null },
  {
    key: 'voice',
    label: 'Voz',
    isApplicable: m => m !== null
  },
  {
    key: 'lipsync',
    label: 'Lipsync',
    isApplicable: m => m === 'lipsync-talking-head'
  },
  { key: 'summary', label: 'Resumen', isApplicable: m => m !== null }
]

const CATEGORY_LABELS: Record<FalModelCategory, string> = {
  'text-to-image': 'Texto a imagen',
  'image-to-image': 'Edición de imagen',
  'text-to-video': 'Texto a video',
  'image-to-video': 'Imagen a video',
  'video-to-video': 'Video a video',
  'text-to-speech': 'Texto a voz',
  lipsync: 'Lipsync'
}

const SHOWCASE_CATEGORY_ORDER: FalModelCategory[] = [
  'text-to-image',
  'image-to-image',
  'text-to-video',
  'image-to-video',
  'video-to-video',
  'text-to-speech',
  'lipsync'
]

function UGCModelSelector() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const campaignId = id ? Number(id) : null
  const isCampaignMode = campaignId !== null

  const [loading, setLoading] = useState<boolean>(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [models, setModels] = useState<FalCatalogEntry[]>([])
  const [campaign, setCampaign] = useState<UGCCampaignModelSelection | null>(
    null
  )

  const [pipelineMode, setPipelineMode] = useState<PipelineMode | null>(null)
  const [imageSlot, setImageSlot] = useState<SlotChoice | null>(null)
  const [videoSlot, setVideoSlot] = useState<SlotChoice | null>(null)
  const [voiceSlot, setVoiceSlot] = useState<SlotChoice | null>(null)
  const [lipsyncSlot, setLipsyncSlot] = useState<SlotChoice | null>(null)
  const [motionReferenceUrl, setMotionReferenceUrl] = useState<string | null>(
    null
  )

  const [activeStepIdx, setActiveStepIdx] = useState<number>(0)
  const [detailModel, setDetailModel] = useState<FalCatalogEntry | null>(null)
  const [saving, setSaving] = useState<boolean>(false)

  // -----------------------------------------------------------------------
  // Cargar catálogo + campaña
  // -----------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      setLoading(true)
      setLoadError(null)
      try {
        const modelsResp = await listFalModels()
        if (cancelled) return

        const available = modelsResp.filter(m => m.available !== false)
        setModels(available)
        if (!isCampaignMode) {
          setCampaign(null)
          return
        }

        if (!Number.isFinite(campaignId) || campaignId <= 0) {
          throw new Error('ID de campaña inválido')
        }

        const campaignResp = await getCampaign(campaignId)
        if (cancelled) return

        setCampaign(campaignResp)
        setPipelineMode(campaignResp.pipelineMode ?? 'image-then-video')

        const findById = (k?: string | null): FalCatalogEntry | undefined =>
          k ? available.find(m => m.key === k) : undefined

        const i = findById(campaignResp.imageModelKey)
        if (i) {
          setImageSlot({
            model: i,
            defaults:
              (campaignResp.imageModelDefaults as Record<string, unknown>) ||
              i.defaults
          })
        }
        const v = findById(campaignResp.videoModelKey)
        if (v) {
          setVideoSlot({
            model: v,
            defaults:
              (campaignResp.videoModelDefaults as Record<string, unknown>) ||
              v.defaults
          })
        }
        const vo = findById(campaignResp.voiceModelKey)
        if (vo) {
          setVoiceSlot({
            model: vo,
            defaults:
              (campaignResp.voiceModelDefaults as Record<string, unknown>) ||
              vo.defaults
          })
        }
        const ls = findById(campaignResp.lipsyncModelKey)
        if (ls) {
          setLipsyncSlot({
            model: ls,
            defaults:
              (campaignResp.lipsyncModelDefaults as Record<string, unknown>) ||
              ls.defaults
          })
        }
        setMotionReferenceUrl(
          campaignResp.videoModelMotionReferenceUrl ?? null
        )
      } catch (err: unknown) {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Error desconocido')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [campaignId, isCampaignMode])

  // -----------------------------------------------------------------------
  // Steps visibles según pipelineMode
  // -----------------------------------------------------------------------
  const visibleSteps = useMemo(
    () => STEPS.filter(s => s.isApplicable(pipelineMode)),
    [pipelineMode]
  )

  // Cuando cambia el modo, reset slots inválidos para el nuevo modo
  useEffect(() => {
    if (!pipelineMode) return
    if (pipelineMode === 'text-to-video-direct') {
      setImageSlot(null)
      setLipsyncSlot(null)
    }
    if (pipelineMode === 'image-then-video') {
      setLipsyncSlot(null)
    }
    // si el videoSlot actual no encaja con el nuevo modo, limpiarlo
    if (videoSlot) {
      const ok = expectedCategories(pipelineMode, 'video').includes(
        videoSlot.model.category
      )
      if (!ok) setVideoSlot(null)
    }
  }, [pipelineMode, videoSlot])

  // -----------------------------------------------------------------------
  // Selección de modelo desde el modal
  // -----------------------------------------------------------------------
  const handleConfirmFromModal = useCallback(
    (params: {
      model: FalCatalogEntry
      defaults: Record<string, unknown>
      motionReferenceUrl: string | null
    }): void => {
      const { model, defaults, motionReferenceUrl: motionUrl } = params
      const cat = model.category
      if (cat === 'text-to-image') {
        setImageSlot({ model, defaults })
      } else if (
        cat === 'image-to-video' ||
        cat === 'text-to-video' ||
        cat === 'video-to-video'
      ) {
        setVideoSlot({ model, defaults })
        setMotionReferenceUrl(motionUrl)
      } else if (cat === 'text-to-speech') {
        setVoiceSlot({ model, defaults })
      } else if (cat === 'lipsync') {
        setLipsyncSlot({ model, defaults })
      } else if (cat === 'image-to-image') {
        // image-edit lo tratamos como imageSlot opcional (PR #1 retrocompat)
        setImageSlot({ model, defaults })
      }
      setDetailModel(null)
      toast.success(`"${model.displayName}" añadido al pipeline`)
    },
    []
  )

  // -----------------------------------------------------------------------
  // Guardar
  // -----------------------------------------------------------------------
  const handleSave = useCallback(async (): Promise<void> => {
    if (!pipelineMode || campaignId === null) return
    setSaving(true)
    try {
      const payload: SavePipelineSelectionPayload = {
        pipelineMode,
        slots: {
          image: imageSlot
            ? { modelKey: imageSlot.model.key, defaults: imageSlot.defaults }
            : null,
          video: videoSlot
            ? { modelKey: videoSlot.model.key, defaults: videoSlot.defaults }
            : null,
          voice: voiceSlot
            ? { modelKey: voiceSlot.model.key, defaults: voiceSlot.defaults }
            : null,
          lipsync: lipsyncSlot
            ? {
                modelKey: lipsyncSlot.model.key,
                defaults: lipsyncSlot.defaults
              }
            : null
        },
        videoModelMotionReferenceUrl: motionReferenceUrl
      }

      await savePipelineSelection(campaignId, payload)
      toast.success('Pipeline guardado')
      navigate('/ugc/campaigns')
    } catch (err: unknown) {
      const e = err as { issues?: ValidationIssue[]; message?: string }
      if (e?.issues?.length) {
        toast.error(
          `Validación: ${e.issues
            .map(i => `${i.field}: ${i.message}`)
            .join(' · ')}`
        )
      } else {
        toast.error(e?.message || 'Error al guardar el pipeline')
      }
    } finally {
      setSaving(false)
    }
  }, [
    pipelineMode,
    imageSlot,
    videoSlot,
    voiceSlot,
    lipsyncSlot,
    motionReferenceUrl,
    campaignId,
    navigate
  ])

  const canSave = useMemo((): boolean => {
    if (!pipelineMode || !videoSlot) return false
    if (pipelineMode === 'image-then-video' && !imageSlot) return false
    if (pipelineMode === 'lipsync-talking-head') {
      if (!imageSlot || !voiceSlot || !lipsyncSlot) return false
    }
    return true
  }, [pipelineMode, imageSlot, videoSlot, voiceSlot, lipsyncSlot])

  const showcaseGroups = useMemo(
    () =>
      SHOWCASE_CATEGORY_ORDER.map(category => ({
        category,
        label: CATEGORY_LABELS[category],
        models: models.filter(model => model.category === category)
      })).filter(group => group.models.length > 0),
    [models]
  )

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <CircularProgress />
      </div>
    )
  }
  if (loadError) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-destructive/30 bg-destructive/12 px-4 py-3 text-sm text-destructive-text">
          {loadError}
        </div>
      </div>
    )
  }

  const currentStep = visibleSteps[activeStepIdx] ?? visibleSteps[0]

  if (!isCampaignMode) {
    return (
      <div className="min-h-screen bg-background px-4 py-6 md:px-8">
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex items-center gap-1.5 text-sm">
            <li>
              <button
                type="button"
                onClick={() => navigate('/ugc/campaigns')}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                UGC
              </button>
            </li>
            <li aria-hidden className="text-muted-foreground">
              ›
            </li>
            <li className="text-muted-foreground">Modelos disponibles</li>
          </ol>
        </nav>

        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Modelos UGC disponibles
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Revisa previews, entradas, salidas y costos estimados antes de
              crear una campaña.
            </p>
          </div>
          <Button onClick={() => navigate('/ugc/campaigns')}>
            Crear campaña
          </Button>
        </div>

        <div className="space-y-6">
          {showcaseGroups.map(group => (
            <section key={group.category}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">
                  {group.label}
                </h2>
                <Badge variant="neutral">
                  {group.models.length} modelo
                  {group.models.length !== 1 ? 's' : ''}
                </Badge>
              </div>
              <ModelGalleryGrid
                models={group.models}
                selectedKey={null}
                onSelect={m => setDetailModel(m)}
              />
            </section>
          ))}
        </div>

        <ModelDetailModal
          open={Boolean(detailModel)}
          model={detailModel}
          selectable={false}
          onClose={() => setDetailModel(null)}
          onConfirm={handleConfirmFromModal}
        />
      </div>
    )
  }

  const slotForCurrentStep = (): SlotChoice | null => {
    if (currentStep.key === 'image') return imageSlot
    if (currentStep.key === 'video') return videoSlot
    if (currentStep.key === 'voice') return voiceSlot
    if (currentStep.key === 'lipsync') return lipsyncSlot
    return null
  }

  const visibleModelsForStep = (): FalCatalogEntry[] => {
    if (
      !pipelineMode ||
      currentStep.key === 'mode' ||
      currentStep.key === 'summary'
    )
      return []
    const cats = expectedCategories(
      pipelineMode,
      currentStep.key as SlotName
    )
    return models.filter(m => cats.includes(m.category))
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-4 py-6 md:px-8">
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm">
            <li>
              <button
                type="button"
                onClick={() => navigate('/ugc/campaigns')}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Campañas UGC
              </button>
            </li>
            <li aria-hidden className="text-muted-foreground">
              ›
            </li>
            <li className="text-muted-foreground">
              {campaign?.name ?? 'Campaña'}
            </li>
            <li aria-hidden className="text-muted-foreground">
              ›
            </li>
            <li className="text-muted-foreground">Pipeline</li>
          </ol>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Configurar pipeline de generación
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Define qué modelos ejecuta cada paso del UGC. No se gastan créditos
          al previsualizar.
        </p>

        {/* Stepper */}
        <ol className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-3">
          {visibleSteps.map((step, idx) => {
            const isCompleted =
              (step.key === 'mode' && pipelineMode !== null) ||
              (step.key === 'image' && imageSlot !== null) ||
              (step.key === 'video' && videoSlot !== null) ||
              (step.key === 'voice' && voiceSlot !== null) ||
              (step.key === 'lipsync' && lipsyncSlot !== null) ||
              (step.key === 'summary' && false)
            const isActive = idx === activeStepIdx
            return (
              <li key={step.key} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveStepIdx(idx)}
                  aria-current={isActive ? 'step' : undefined}
                  className="flex items-center gap-2 rounded-md p-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={cn(
                      'flex size-8 items-center justify-center rounded-full text-sm font-semibold',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : isCompleted
                          ? 'bg-success/15 text-success-text'
                          : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {isCompleted && !isActive ? (
                      <Check className="size-4" weight="bold" aria-hidden />
                    ) : (
                      idx + 1
                    )}
                  </span>
                  <span
                    className={cn(
                      'text-sm',
                      isActive
                        ? 'font-semibold text-foreground'
                        : 'text-muted-foreground'
                    )}
                  >
                    {step.label}
                  </span>
                </button>
                {idx < visibleSteps.length - 1 && (
                  <span aria-hidden className="h-px w-6 bg-border" />
                )}
              </li>
            )
          })}
        </ol>
      </div>

      {/* Body */}
      <div className="flex-1 px-4 py-6 md:px-8">
        {currentStep.key === 'mode' && (
          <PipelineModeSelector
            value={pipelineMode}
            onChange={mode => {
              setPipelineMode(mode)
              setActiveStepIdx(1)
            }}
          />
        )}

        {(currentStep.key === 'image' ||
          currentStep.key === 'video' ||
          currentStep.key === 'voice' ||
          currentStep.key === 'lipsync') && (
          <>
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Paso {activeStepIdx + 1}: {currentStep.label}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Elige el modelo que ejecutará este paso. Hover para preview;
                  click para configurar.
                </p>
              </div>
              {slotForCurrentStep() && (
                <Badge variant="success">
                  <Check className="size-3.5" weight="bold" aria-hidden />
                  {slotForCurrentStep()?.model.displayName}
                </Badge>
              )}
            </div>

            {visibleModelsForStep().length === 0 ? (
              <div className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                No hay modelos disponibles para este paso en el modo
                seleccionado.
              </div>
            ) : (
              <ModelGalleryGrid
                models={visibleModelsForStep()}
                selectedKey={slotForCurrentStep()?.model.key ?? null}
                onSelect={m => setDetailModel(m)}
              />
            )}
          </>
        )}

        {currentStep.key === 'summary' && pipelineMode && (
          <PipelineSummary
            pipelineMode={pipelineMode}
            imageSlot={imageSlot}
            videoSlot={videoSlot}
            voiceSlot={voiceSlot}
            lipsyncSlot={lipsyncSlot}
          />
        )}
      </div>

      {/* Footer sticky */}
      <div className="sticky bottom-0 z-10 border-t border-border bg-card px-4 py-3 md:px-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Pipeline:</span>
            <SlotChip
              label="Imagen"
              slot={imageSlot}
              mode={pipelineMode}
              slotName="image"
            />
            <SlotChip
              label="Video"
              slot={videoSlot}
              mode={pipelineMode}
              slotName="video"
            />
            <SlotChip
              label="Voz"
              slot={voiceSlot}
              mode={pipelineMode}
              slotName="voice"
            />
            <SlotChip
              label="Lipsync"
              slot={lipsyncSlot}
              mode={pipelineMode}
              slotName="lipsync"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={activeStepIdx === 0}
              onClick={() => setActiveStepIdx(activeStepIdx - 1)}
            >
              Atrás
            </Button>
            {currentStep.key !== 'summary' ? (
              <Button
                size="sm"
                onClick={() =>
                  setActiveStepIdx(
                    Math.min(activeStepIdx + 1, visibleSteps.length - 1)
                  )
                }
                disabled={activeStepIdx === 0 && !pipelineMode}
              >
                Siguiente
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleSave}
                loading={saving}
                disabled={!canSave}
              >
                Guardar pipeline
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Modal de detalle */}
      <ModelDetailModal
        open={Boolean(detailModel)}
        model={detailModel}
        initialDefaults={
          detailModel
            ? detailModel.category === 'text-to-image'
              ? imageSlot?.defaults
              : detailModel.category === 'text-to-speech'
                ? voiceSlot?.defaults
                : detailModel.category === 'lipsync'
                  ? lipsyncSlot?.defaults
                  : videoSlot?.defaults
            : undefined
        }
        initialMotionReferenceUrl={motionReferenceUrl}
        onClose={() => setDetailModel(null)}
        onConfirm={handleConfirmFromModal}
      />
    </div>
  )
}

/** Chip pequeño del footer mostrando estado de un slot. */
function SlotChip({
  label,
  slot,
  mode,
  slotName
}: {
  label: string
  slot: SlotChoice | null
  mode: PipelineMode | null
  slotName: SlotName
}) {
  const applies =
    mode !== null && expectedCategories(mode, slotName).length > 0
  if (!applies) {
    return <Badge variant="outline">{label}: —</Badge>
  }
  return (
    <Badge variant={slot ? 'primary' : 'warning'}>
      {slot && <Check className="size-3.5" weight="bold" aria-hidden />}
      {label}: {slot ? slot.model.displayName : 'pendiente'}
    </Badge>
  )
}

export default UGCModelSelector
