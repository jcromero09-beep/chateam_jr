import { useState, useEffect, useCallback } from 'react'
import { CircularProgress, LinearProgress } from '@mui/joy'
import {
  Brain,
  Plus,
  ArrowClockwise,
  X,
  Database,
  CheckCircle,
  Clock,
  WarningCircle,
  CircleNotch,
  Flask,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { StatTile } from '@/components/ui/stat-tile'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args) }
const devError = (...args: unknown[]) => { if (isDev) console.error(...args) }

// --- Types ---
interface FineTuningJob {
  id: number
  name: string
  baseModel: string
  dataSourceId: number
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  createdAt: string
}

interface DataSource {
  id: number
  name: string
  recordCount: number
  createdAt: string
}

interface ApiResponse<T> {
  data?: T
  success?: boolean
}

// --- Helpers ---
const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

// Color Joy para LinearProgress (conservado como MUI, ver regla 3)
const getStatusColor = (status: FineTuningJob['status']) => {
  const map: Record<FineTuningJob['status'], 'warning' | 'primary' | 'success' | 'danger'> = {
    pending: 'warning',
    running: 'primary',
    completed: 'success',
    failed: 'danger',
  }
  return map[status]
}

// Variant del Badge del design system
const getStatusBadgeVariant = (status: FineTuningJob['status']): BadgeProps['variant'] => {
  const map: Record<FineTuningJob['status'], BadgeProps['variant']> = {
    pending: 'warning',
    running: 'primary',
    completed: 'success',
    failed: 'destructive',
  }
  return map[status]
}

const getStatusLabel = (status: FineTuningJob['status']) => {
  const map: Record<FineTuningJob['status'], string> = {
    pending: 'Pendiente',
    running: 'En progreso',
    completed: 'Completado',
    failed: 'Fallido',
  }
  return map[status]
}

const getStatusIcon = (status: FineTuningJob['status']) => {
  const cls = 'size-3.5'
  if (status === 'pending') return <Clock className={cls} aria-hidden />
  if (status === 'running') return <CircleNotch className={`${cls} animate-spin`} aria-hidden />
  if (status === 'completed') return <CheckCircle className={cls} aria-hidden />
  return <WarningCircle className={cls} aria-hidden />
}

// --- Modal de creacion ---
interface CreateJobModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  dataSources: DataSource[]
}

function CreateJobModal({ open, onClose, onSuccess, dataSources }: CreateJobModalProps) {
  const [name, setName] = useState('')
  const [baseModel, setBaseModel] = useState<string>('gpt-4o-mini')
  const [dataSourceId, setDataSourceId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!name.trim()) { setError('El nombre es requerido'); return }
    if (!dataSourceId) { setError('Selecciona una fuente de datos'); return }
    try {
      setSaving(true)
      setError(null)
      await api.post('/ai/fine-tuning/jobs', { name: name.trim(), baseModel, dataSourceId })
      setName('')
      setBaseModel('gpt-4o-mini')
      setDataSourceId(null)
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      devError('[AIFineTuning] Error al crear job:', err)
      setError(e.response?.data?.message || 'Error al crear el job de fine-tuning')
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    setError(null)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Crear Job de Fine-Tuning</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text">
            <span>{error}</span>
            <button
              type="button"
              aria-label="Cerrar aviso"
              onClick={() => setError(null)}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-destructive-text/80 transition-colors hover:bg-destructive/15 hover:text-destructive-text"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="job-name">Nombre del Job</Label>
            <input
              id="job-name"
              placeholder="ej. fine-tune-soporte-v1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="job-base-model">Modelo Base</Label>
            <Select value={baseModel} onValueChange={(val) => setBaseModel(val)}>
              <SelectTrigger id="job-base-model">
                <SelectValue placeholder="Selecciona un modelo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
                <SelectItem value="gpt-3.5-turbo">gpt-3.5-turbo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="job-data-source">Fuente de Datos</Label>
            <Select
              value={dataSourceId != null ? String(dataSourceId) : undefined}
              onValueChange={(val) => setDataSourceId(Number(val))}
            >
              <SelectTrigger id="job-data-source">
                <SelectValue placeholder="Selecciona una fuente" />
              </SelectTrigger>
              <SelectContent>
                {dataSources.map((ds) => (
                  <SelectItem key={ds.id} value={String(ds.id)}>
                    {ds.name} ({ds.recordCount?.toLocaleString('es-ES') ?? 0} registros)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleClose} disabled={saving}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSubmit} loading={saving}>
            <Flask className="size-4" aria-hidden />
            Crear Job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// --- Pagina Principal ---
export default function AIFineTuning() {
  const [jobs, setJobs] = useState<FineTuningJob[]>([])
  const [dataSources, setDataSources] = useState<DataSource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      devLog('[AIFineTuning] Cargando datos...')

      const [jobsResult, dsResult] = await Promise.allSettled([
        api.get<ApiResponse<FineTuningJob[]>>('/ai/fine-tuning/jobs'),
        api.get<ApiResponse<DataSource[]>>('/ai/fine-tuning/data-sources'),
      ])

      if (jobsResult.status === 'fulfilled') {
        const raw = jobsResult.value.data
        setJobs((raw as unknown as { data?: FineTuningJob[] }).data ?? (raw as unknown as FineTuningJob[]) ?? [])
      } else {
        devError('[AIFineTuning] Error al cargar jobs:', jobsResult.reason)
      }

      if (dsResult.status === 'fulfilled') {
        const raw = dsResult.value.data
        setDataSources((raw as unknown as { data?: DataSource[] }).data ?? (raw as unknown as DataSource[]) ?? [])
      } else {
        devError('[AIFineTuning] Error al cargar data sources:', dsResult.reason)
      }

      if (jobsResult.status === 'rejected' && dsResult.status === 'rejected') {
        setError('Error al cargar los datos. Intenta de nuevo.')
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      devError('[AIFineTuning] Error general:', err)
      setError(e.response?.data?.message || 'Error inesperado al cargar los datos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const totalJobs = jobs.length
  const enProgreso = jobs.filter((j) => j.status === 'running').length
  const completados = jobs.filter((j) => j.status === 'completed').length

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <CircularProgress size="lg" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Brain className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Fine-Tuning de Modelos
              </h1>
              <p className="text-sm text-muted-foreground">
                Gestiona y monitorea los jobs de fine-tuning de tus modelos de IA
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <ArrowClockwise className="size-4" aria-hidden />
              Actualizar
            </Button>
            <Button size="sm" onClick={() => setModalOpen(true)}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Crear Job
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text">
            <span>{error}</span>
            <button
              type="button"
              aria-label="Cerrar aviso"
              onClick={() => setError(null)}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-destructive-text/80 transition-colors hover:bg-destructive/15 hover:text-destructive-text"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Total Jobs" value={String(totalJobs)} />
          <StatTile label="En Progreso" value={String(enProgreso)} tone="primary" />
          <StatTile label="Completados" value={String(completados)} tone="success" />
          <StatTile label="Data Sources" value={String(dataSources.length)} tone="warning" />
        </div>

        {/* Tabla de Jobs */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
            <Flask className="size-5 text-muted-foreground" aria-hidden />
            Jobs de Fine-Tuning
          </h2>
          {jobs.length === 0 ? (
            <div className="py-12 text-center">
              <Brain className="mx-auto mb-2 size-12 text-muted-foreground/40" aria-hidden />
              <p className="mb-4 text-sm text-muted-foreground">
                No hay jobs de fine-tuning registrados aun
              </p>
              <Button size="sm" onClick={() => setModalOpen(true)}>
                <Plus className="size-4" weight="bold" aria-hidden />
                Crear primer Job
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[740px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left">
                      <th className="min-w-[160px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nombre</th>
                      <th className="min-w-[140px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Modelo Base</th>
                      <th className="min-w-[120px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado</th>
                      <th className="min-w-[160px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Progreso</th>
                      <th className="min-w-[160px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Creado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {jobs.map((job) => (
                      <tr key={job.id} className="transition-colors hover:bg-accent/40">
                        <td className="px-4 py-3 font-medium text-foreground">{job.name}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{job.baseModel}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={getStatusBadgeVariant(job.status)}>
                            {getStatusIcon(job.status)}
                            {getStatusLabel(job.status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex min-w-[130px] items-center gap-2">
                            <LinearProgress
                              determinate
                              value={job.progress ?? 0}
                              color={getStatusColor(job.status)}
                              sx={{ flex: 1 }}
                            />
                            <span className="min-w-[35px] text-xs tabular-nums text-muted-foreground">
                              {job.progress ?? 0}%
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                          {formatDate(job.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Data Sources */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
            <Database className="size-5 text-muted-foreground" aria-hidden />
            Fuentes de Datos Disponibles
          </h2>
          {dataSources.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No hay fuentes de datos disponibles
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {dataSources.map((ds) => (
                <div key={ds.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="mb-1 flex items-center gap-2">
                    <Database className="size-4 text-muted-foreground" aria-hidden />
                    <span className="text-sm font-medium text-foreground">{ds.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {ds.recordCount?.toLocaleString('es-ES') ?? 0} registros
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Creado: {formatDate(ds.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      <CreateJobModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={fetchData}
        dataSources={dataSources}
      />
    </div>
  )
}
