import api from './api'

// ---------------------------------------------------------------------------
// Tipos del catálogo (mirror de services/UGCProviders/fal/catalog.ts)
// ---------------------------------------------------------------------------
export type FalModelType =
  | 'image-to-video'
  | 'motion-control'
  | 'image-edit'
  | 'text-to-image'
  | 'text-to-video'
  | 'text-to-speech'
  | 'lipsync'

export type FalModelCategory =
  | 'text-to-image'
  | 'image-to-image'
  | 'text-to-video'
  | 'image-to-video'
  | 'video-to-video'
  | 'text-to-speech'
  | 'lipsync'

export type FalIOType = 'text' | 'image' | 'video' | 'audio'

export type FalCampaignAsset =
  | 'characterImage'
  | 'motionReferenceVideo'
  | 'endImage'
  | 'audioReference'

export interface FalConfigurableField {
  name: string
  type: 'enum' | 'string' | 'boolean' | 'integer' | 'number'
  default: string | number | boolean
  options?: ReadonlyArray<string>
  min?: number
  max?: number
  step?: number
  description?: string
}

export interface FalCatalogEntry {
  key: string
  displayName: string
  vendor: string
  modelId: string
  type: FalModelType
  category: FalModelCategory
  inputs: ReadonlyArray<FalIOType>
  outputs: ReadonlyArray<FalIOType>
  available: boolean
  description: string
  previewVideoUrl: string | null
  previewImageUrl: string | null
  previewImageBeforeUrl?: string
  previewImageAfterUrl?: string
  previewAudioUrl?: string | null
  exampleInputUrls?: Record<string, string>
  pricing: {
    unit: 'second' | 'image' | 'character'
    estimateUsd: number
    displayLabel: string
  }
  configurableFields: ReadonlyArray<FalConfigurableField>
  defaults: Record<string, unknown>
  recommended: boolean
  tags: ReadonlyArray<string>
  playgroundUrl: string
  requiresCampaignAssets: ReadonlyArray<FalCampaignAsset>
}

export interface FalModelsResponse {
  success: boolean
  message: string
  data: {
    version: string
    models: FalCatalogEntry[]
  }
  errors: null
}

export type PipelineMode =
  | 'image-then-video'
  | 'text-to-video-direct'
  | 'lipsync-talking-head'

export interface UGCCampaignModelSelection {
  id: number
  name?: string
  pipelineMode?: PipelineMode
  videoModelKey?: string | null
  videoModelId?: string | null
  videoModelDefaults?: Record<string, unknown> | null
  videoModelMotionReferenceUrl?: string | null
  imageModelKey?: string | null
  imageModelId?: string | null
  imageModelDefaults?: Record<string, unknown> | null
  voiceModelKey?: string | null
  voiceModelDefaults?: Record<string, unknown> | null
  lipsyncModelKey?: string | null
  lipsyncModelDefaults?: Record<string, unknown> | null
  modelSelectedAt?: string | null
  modelSelectedBy?: number | null
}

export interface PipelineSlot {
  modelKey: string
  defaults?: Record<string, unknown>
}

export interface SavePipelineSelectionPayload {
  pipelineMode: PipelineMode
  slots: {
    image: PipelineSlot | null
    video: PipelineSlot | null
    voice: PipelineSlot | null
    lipsync: PipelineSlot | null
  }
  videoModelMotionReferenceUrl?: string | null
}

export interface ValidationIssue {
  field: string
  message: string
}

// ---------------------------------------------------------------------------
// API clients
// ---------------------------------------------------------------------------

export async function listFalModels(): Promise<FalCatalogEntry[]> {
  const { data } = await api.get<FalModelsResponse>('/ugc/fal-models')
  return data.data.models
}

export async function getCampaign(
  campaignId: number
): Promise<UGCCampaignModelSelection> {
  const { data } = await api.get(`/ugc/campaigns/${campaignId}`)
  return (data?.data ?? data) as UGCCampaignModelSelection
}

/**
 * Guarda la selección de pipeline (PR #2 shape). El backend acepta tanto
 * el body flat del PR #1 como el body con `slots`; aquí usamos siempre el
 * shape nuevo. Re-lanza con `issues` enriquecidas en 422.
 */
export async function savePipelineSelection(
  campaignId: number,
  payload: SavePipelineSelectionPayload
): Promise<UGCCampaignModelSelection> {
  try {
    const { data } = await api.patch(
      `/ugc/campaigns/${campaignId}/model-selection`,
      payload
    )
    return data.data as UGCCampaignModelSelection
  } catch (err: unknown) {
    const axiosErr = err as {
      response?: {
        status?: number
        data?: { message?: string; errors?: ValidationIssue[] }
      }
    }
    if (axiosErr?.response?.status === 422) {
      const issues = axiosErr.response.data?.errors ?? []
      const e = new Error(
        axiosErr.response.data?.message || 'Validación falló'
      ) as Error & { issues: ValidationIssue[]; status: number }
      e.issues = issues
      e.status = 422
      throw e
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Helpers de UI
// ---------------------------------------------------------------------------

const IO_LABEL: Record<FalIOType, string> = {
  text: 'Texto',
  image: 'Imagen',
  video: 'Video',
  audio: 'Audio'
}

export function formatIOLine(model: FalCatalogEntry): string {
  const ins = model.inputs.map(i => IO_LABEL[i]).join(' + ')
  const outs = model.outputs.map(o => IO_LABEL[o]).join(' + ')
  return `${ins} → ${outs}`
}

export const PIPELINE_MODES: Array<{
  mode: PipelineMode
  title: string
  subtitle: string
  description: string
  iconHint: 'image-to-video' | 'text-to-video' | 'talking-head'
}> = [
  {
    mode: 'image-then-video',
    title: 'Imagen → Video',
    subtitle: 'Genera imagen y luego anímala',
    description:
      'Mejor consistencia del personaje. Recomendado para UGC con producto.',
    iconHint: 'image-to-video'
  },
  {
    mode: 'text-to-video-direct',
    title: 'Texto → Video',
    subtitle: 'Genera video directo del brief',
    description: 'Más rápido y económico. Ideal para variaciones rápidas.',
    iconHint: 'text-to-video'
  },
  {
    mode: 'lipsync-talking-head',
    title: 'Talking Head',
    subtitle: 'Personaje hablando con script',
    description:
      'Imagen + voz + lipsync. Para testimonio profesional grabado.',
    iconHint: 'talking-head'
  }
]
