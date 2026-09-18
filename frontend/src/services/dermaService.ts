/**
 * dermaService — cliente HTTP del módulo Derma (análisis facial profesional).
 * Endpoints backend: routes/dermaRoutes.ts
 */
import api from './api'

export type DermaMetricKind = 'score' | 'classification'

export interface DermaCatalogMetric {
  key: string
  label: string
  kind: DermaMetricKind
}

export interface DermaCatalog {
  metrics: DermaCatalogMetric[]
  basicAnalysisCost: number
  clinicalAnalysisCost: number
}

export interface DermaCredits {
  creditTypeKey: string
  configured: boolean
  totalCredits: number
  usedCredits: number
  remaining: number
  basicAnalysisCost: number
  clinicalAnalysisCost: number
  basicAnalysesAvailable: number
  clinicalAnalysesAvailable: number
}

export interface DermaPatient {
  id: number
  name: string
  email: string | null
  phone: string | null
  birthDate: string | null
  age: number | null
  gender: string | null
  notes: string | null
  lastScore: number | null
  lastAnalysisAt: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface DermaPatientInput {
  name: string
  email?: string | null
  phone?: string | null
  birthDate?: string | null
  gender?: string | null
  notes?: string | null
}

export type DermaSeverity = 'ninguna' | 'leve' | 'moderada' | 'alta' | null

export interface DermaMetricResult {
  key: string
  label: string
  score: number | null
  severity: DermaSeverity
  findings: string
  zones: string[]
  recommendation: string
  value?: string
}

export interface DermaRecommendation {
  title: string
  detail: string
  priority: 'alta' | 'media' | 'baja'
}

export interface DermaClinicalDetail {
  observations: string
  suggestedTreatments: Array<{ name: string; rationale: string; sessions?: string }>
  homeCare: { morning: string[]; night: string[] }
  cautions: string[]
  followUpWeeks: number | null
}

export interface DermaAnalysisResultData {
  globalScore: number
  skinType: string
  skinAge: number | null
  summary: string
  metrics: DermaMetricResult[]
  recommendations: DermaRecommendation[]
  clinicalDetail: DermaClinicalDetail | null
  imageQuality: { ok: boolean; notes: string }
}

export type DermaAnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface DermaAnalysis {
  id: number
  patientId: number
  status: DermaAnalysisStatus
  selectedMetrics: string[]
  clinicalDetail: boolean
  globalScore: number | null
  skinType: string | null
  skinAge: number | null
  summary: string | null
  creditsUsed: number
  provider: string | null
  model: string | null
  latencyMs: number | null
  errorMessage: string | null
  hasImage: boolean
  metricsCount: number
  createdAt: string
  result?: DermaAnalysisResultData | null
  patient?: { id: number; name: string; age: number | null }
  user?: { id: number; name: string }
}

export interface PatientsPage {
  patients: DermaPatient[]
  count: number
  hasMore: boolean
}

export interface AnalysesPage {
  analyses: DermaAnalysis[]
  count: number
  hasMore: boolean
}

export const dermaService = {
  getCatalog: async () => (await api.get<DermaCatalog>('/derma/catalog')).data,
  getCredits: async () => (await api.get<DermaCredits>('/derma/credits')).data,

  listPatients: async (params: { searchParam?: string; pageNumber?: number; rowsPerPage?: number }) =>
    (await api.get<PatientsPage>('/derma/patients', { params })).data,
  getPatient: async (id: number) =>
    (await api.get<DermaPatient & { analyses: DermaAnalysis[]; analysesCount: number }>(`/derma/patients/${id}`)).data,
  createPatient: async (data: DermaPatientInput) => (await api.post<DermaPatient>('/derma/patients', data)).data,
  updatePatient: async (id: number, data: DermaPatientInput) =>
    (await api.put<DermaPatient>(`/derma/patients/${id}`, data)).data,
  deletePatient: async (id: number) => {
    await api.delete(`/derma/patients/${id}`)
  },

  listAnalyses: async (params: { patientId?: number; pageNumber?: number; rowsPerPage?: number; status?: string }) =>
    (await api.get<AnalysesPage>('/derma/analyses', { params })).data,
  getAnalysis: async (id: number) => (await api.get<DermaAnalysis>(`/derma/analyses/${id}`)).data,
  deleteAnalysis: async (id: number) => {
    await api.delete(`/derma/analyses/${id}`)
  },

  /** Lanza el análisis: multipart con la foto, métricas y flag de detalle clínico. */
  analyze: async (patientId: number, image: File, metrics: string[], clinicalDetail: boolean) => {
    const formData = new FormData()
    formData.append('image', image)
    formData.append('metrics', metrics.join(','))
    formData.append('clinicalDetail', clinicalDetail ? 'true' : 'false')
    return (await api.post<DermaAnalysis>(`/derma/patients/${patientId}/analyses`, formData)).data
  },

  /** La foto está protegida por sesión: se descarga como blob y se muestra vía object URL. */
  getAnalysisImageUrl: async (id: number): Promise<string> => {
    const res = await api.get(`/derma/analyses/${id}/image`, { responseType: 'blob' })
    return URL.createObjectURL(res.data as Blob)
  },

  downloadReportPdf: async (id: number, fileName = `derma-analisis-${id}.pdf`) => {
    const res = await api.get(`/derma/analyses/${id}/report.pdf`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  },

  openReportHtml: async (id: number) => {
    const res = await api.get(`/derma/analyses/${id}/report.html`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  },
}

export const scoreTone = (score: number | null): 'success' | 'warning' | 'destructive' | 'neutral' => {
  if (score === null || score === undefined) return 'neutral'
  if (score >= 70) return 'success'
  if (score >= 45) return 'warning'
  return 'destructive'
}

export const severityLabel = (s: DermaSeverity): string => {
  switch (s) {
    case 'ninguna':
      return 'Sin hallazgos'
    case 'leve':
      return 'Leve'
    case 'moderada':
      return 'Moderada'
    case 'alta':
      return 'Alta'
    default:
      return '—'
  }
}

export const formatDate = (iso?: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}

export const formatDateTime = (iso?: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export default dermaService
