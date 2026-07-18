import api from './api'

// ---------------------------------------------------------------------------
// Tipos NEUTRALES (mirror de services/Generation/types.ts)
// ---------------------------------------------------------------------------
export type MediaType = 'image' | 'video'
export type ProviderId = 'higgsfield' | 'fal'
export type ModelBadge = 'NEW' | 'EXCLUSIVE' | 'CINEMA' | 'BETA'

export interface ModelPreview {
  thumbnailUrl: string
  exampleUrl: string
  mediaType: MediaType
}

export interface ModelCapabilities {
  resolutions: string[]
  durations?: number[]
  aspectRatios?: string[]
  supportsAudio?: boolean
  supportsStartFrame?: boolean
  supportsCharacters?: boolean
  maxCount?: number
}

export interface StylePreset {
  id: string
  label: string
  category?: string
  previewUrl: string
  description?: string
  params: Record<string, unknown>
}

export interface ParamEnumValue {
  value: string
  label: string
  previewUrl?: string
}

export interface ParamSpec {
  name: string
  type: 'string' | 'number' | 'enum' | 'boolean' | 'media'
  label: string
  required: boolean
  default?: unknown
  enumValues?: ParamEnumValue[]
  min?: number
  max?: number
  step?: number
  description?: string
}

export interface NormalizedModel {
  id: string
  provider: ProviderId
  name: string
  mediaType: MediaType
  description?: string
  badges?: ModelBadge[]
  previews: ModelPreview[]
  capabilities: ModelCapabilities
  styles?: StylePreset[]
  pricingLabel?: string
}

export interface NormalizedModelDetail extends NormalizedModel {
  params: ParamSpec[]
}

export interface CostEstimate {
  providerCostUsd: number
  markup: number
  credits: number
  creditTypeKey: string
  displayLabel: string
}

export interface GenerationRequestBody {
  mediaType: MediaType
  modelId: string
  prompt: string
  styleId?: string
  resolution?: string
  aspectRatio?: string
  duration?: number
  audio?: boolean
  references?: string[]
  characterIds?: string[]
  count?: number
  params?: Record<string, unknown>
  idempotencyKey?: string
}

export interface JobResultOutput {
  url: string
  mediaType: MediaType
  mimeType?: string
  fileName?: string
  thumbnailUrl?: string
}

export interface GenerationJob {
  jobId: number
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  stage?: string
  progress?: number
  provider?: string
  mediaType?: MediaType
  modelKey?: string
  styleId?: string
  prompt?: string
  error?: string
  outputs?: JobResultOutput[]
}

interface ApiEnvelope<T> {
  success: boolean
  message: string
  data: T
  errors: string[] | null
}

// ---------------------------------------------------------------------------
// API clients
// ---------------------------------------------------------------------------

export async function listModels(params?: {
  type?: MediaType
  provider?: ProviderId
}): Promise<NormalizedModel[]> {
  const { data } = await api.get<ApiEnvelope<NormalizedModel[]>>(
    '/api/generation/models',
    { params }
  )
  return data.data || []
}

export async function getModelDetail(
  modelId: string
): Promise<NormalizedModelDetail> {
  const { data } = await api.get<ApiEnvelope<NormalizedModelDetail>>(
    `/api/generation/models/${encodeURIComponent(modelId)}`
  )
  return data.data
}

export async function estimateCost(
  body: GenerationRequestBody
): Promise<CostEstimate> {
  const { data } = await api.post<ApiEnvelope<CostEstimate>>(
    '/api/generation/cost',
    body
  )
  return data.data
}

export async function createJob(
  body: GenerationRequestBody
): Promise<{ jobId: number; status: string; credits: number }> {
  const payload: GenerationRequestBody = {
    ...body,
    idempotencyKey: body.idempotencyKey || generateIdempotencyKey()
  }
  const { data } = await api.post<
    ApiEnvelope<{ jobId: number; status: string; credits: number }>
  >('/api/generation/jobs', payload)
  return data.data
}

export async function getJob(jobId: number): Promise<GenerationJob> {
  const { data } = await api.get<ApiEnvelope<GenerationJob>>(
    `/api/generation/jobs/${jobId}`
  )
  return data.data
}

export async function uploadReference(
  file: File,
  provider: ProviderId = 'higgsfield'
): Promise<{ id: string; url?: string }> {
  const form = new FormData()
  form.append('file', file)
  form.append('provider', provider)
  const { data } = await api.post<ApiEnvelope<{ id: string; url?: string }>>(
    '/api/generation/uploads',
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  )
  return data.data
}

export async function listCharacters(
  provider: ProviderId = 'higgsfield'
): Promise<Array<{ id: string; name: string; previewUrl?: string }>> {
  const { data } = await api.get<
    ApiEnvelope<Array<{ id: string; name: string; previewUrl?: string }>>
  >('/api/generation/characters', { params: { provider } })
  return data.data || []
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clave de idempotencia única por intento de generación. */
export function generateIdempotencyKey(): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `gen_${Date.now()}_${rnd}`
}

/** Agrupa estilos por categoría para renderizar secciones (Mood, Genre…). */
export function groupStylesByCategory(
  styles?: StylePreset[]
): Record<string, StylePreset[]> {
  const grouped: Record<string, StylePreset[]> = {}
  for (const style of styles || []) {
    const cat = style.category || 'Otros'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(style)
  }
  return grouped
}

/**
 * Polling de un job hasta completed/failed.
 * onUpdate se llama en cada tick para refrescar la UI.
 */
export async function pollJob(
  jobId: number,
  onUpdate: (job: GenerationJob) => void,
  opts: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<GenerationJob> {
  const intervalMs = opts.intervalMs ?? 4000
  const timeoutMs = opts.timeoutMs ?? 6 * 60 * 1000
  const start = Date.now()

  return new Promise<GenerationJob>((resolve, reject) => {
    const tick = async () => {
      try {
        const job = await getJob(jobId)
        onUpdate(job)
        if (job.status === 'completed' || job.status === 'failed') {
          resolve(job)
          return
        }
        if (Date.now() - start > timeoutMs) {
          reject(new Error('Tiempo de espera agotado'))
          return
        }
        setTimeout(tick, intervalMs)
      } catch (err) {
        reject(err)
      }
    }
    setTimeout(tick, intervalMs)
  })
}
