import { useState, useEffect, useCallback } from 'react'
import { CircularProgress } from '@mui/joy'
import {
  CalendarCheck,
  Plus,
  ArrowClockwise,
  X,
  CheckCircle,
  WarningCircle,
  Clock,
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
import { cn } from '@/lib/utils'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args) }
const devError = (...args: unknown[]) => { if (isDev) console.error(...args) }

// --- Types ---
type TaskType = 'credit_reset' | 'report_generation' | 'cache_cleanup' | 'model_health_check'
type LastResult = 'success' | 'error' | 'pending'

interface SchedulerTask {
  id: number
  name: string
  taskType: TaskType
  cronExpression: string
  nextRunAt: string | null
  lastResult: LastResult
  isActive: boolean
  createdAt: string
}

interface ApiResponse<T> {
  data?: T
}

// --- Label maps ---
const TASK_TYPE_LABELS: Record<TaskType, string> = {
  credit_reset: 'Restablecimiento de creditos',
  report_generation: 'Generacion de reportes',
  cache_cleanup: 'Limpieza de cache',
  model_health_check: 'Salud del modelo',
}

const LAST_RESULT_CONFIG: Record<LastResult, { label: string; variant: BadgeProps['variant'] }> = {
  success: { label: 'Exitoso', variant: 'success' },
  error: { label: 'Error', variant: 'destructive' },
  pending: { label: 'Pendiente', variant: 'neutral' },
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

// --- Toggle accesible (no hay wrapper Switch en el design system) ---
function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        checked ? 'bg-success' : 'bg-input',
      )}
    >
      <span
        className={cn(
          'inline-block size-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
        aria-hidden
      />
    </button>
  )
}

// --- Alerta de error reutilizable ---
function ErrorAlert({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive-text"
    >
      <span>{message}</span>
      <button
        type="button"
        aria-label="Descartar error"
        onClick={onDismiss}
        className="flex size-6 shrink-0 items-center justify-center rounded-md text-destructive-text transition-colors hover:bg-destructive/15"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  )
}

// --- Modal Crear Tarea ---
interface CreateTaskModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

function CreateTaskModal({ open, onClose, onSuccess }: CreateTaskModalProps) {
  const [name, setName] = useState('')
  const [taskType, setTaskType] = useState<TaskType>('credit_reset')
  const [cronExpression, setCronExpression] = useState('0 0 * * *')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!name.trim()) { setError('El nombre es requerido'); return }
    if (!cronExpression.trim()) { setError('La expresion cron es requerida'); return }
    try {
      setSaving(true)
      setError(null)
      await api.post('/ai/scheduler/tasks', {
        name: name.trim(),
        taskType,
        cronExpression: cronExpression.trim(),
      })
      setName('')
      setTaskType('credit_reset')
      setCronExpression('0 0 * * *')
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      devError('[AIScheduler] Error al crear tarea:', err)
      setError(e.response?.data?.message || 'Error al crear la tarea')
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crear Tarea Programada</DialogTitle>
        </DialogHeader>

        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        <div className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-name">Nombre</Label>
            <input
              id="task-name"
              placeholder="ej. Reset creditos mensual"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-type">Tipo de Tarea</Label>
            <Select value={taskType} onValueChange={(val) => setTaskType(val as TaskType)}>
              <SelectTrigger id="task-type" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(TASK_TYPE_LABELS) as [TaskType, string][]).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-cron">Expresion Cron</Label>
            <input
              id="task-cron"
              placeholder="0 0 * * *"
              value={cronExpression}
              onChange={(e) => setCronExpression(e.target.value)}
              className="h-11 w-full rounded-md border border-input bg-card px-3.5 font-mono text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            <p className="text-xs text-muted-foreground">
              Formato: minuto hora dia mes diasemana. Ej:{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono">0 0 * * *</code> = cada dia a medianoche
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleClose} disabled={saving}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSubmit} loading={saving}>
            <CalendarCheck className="size-4" aria-hidden />
            Crear Tarea
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// --- Pagina Principal ---
export default function AIScheduler() {
  const [tasks, setTasks] = useState<SchedulerTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [togglingId, setTogglingId] = useState<number | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      devLog('[AIScheduler] Cargando tareas...')

      const [result] = await Promise.allSettled([
        api.get<ApiResponse<SchedulerTask[]>>('/ai/scheduler/tasks'),
      ])

      if (result.status === 'fulfilled') {
        const raw = result.value.data
        setTasks((raw as unknown as { data?: SchedulerTask[] }).data ?? (raw as unknown as SchedulerTask[]) ?? [])
      } else {
        devError('[AIScheduler] Error al cargar tareas:', result.reason)
        const e = result.reason as { response?: { data?: { message?: string } } }
        setError(e.response?.data?.message || 'Error al cargar las tareas')
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      devError('[AIScheduler] Error general:', err)
      setError(e.response?.data?.message || 'Error inesperado al cargar los datos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleToggleActive = async (task: SchedulerTask) => {
    try {
      setTogglingId(task.id)
      devLog('[AIScheduler] Toggling tarea:', task.id, 'a', !task.isActive)
      await api.put(`/ai/scheduler/tasks/${task.id}`, { isActive: !task.isActive })
      setTasks((prev) => prev.map((t) =>
        t.id === task.id ? { ...t, isActive: !t.isActive } : t
      ))
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      devError('[AIScheduler] Error al cambiar estado:', err)
      setError(e.response?.data?.message || 'Error al actualizar el estado de la tarea')
    } finally {
      setTogglingId(null)
    }
  }

  const totalTareas = tasks.length
  const activas = tasks.filter((t) => t.isActive).length

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const ejecutadasHoy = tasks.filter((t) => {
    if (!t.nextRunAt) return false
    return new Date(t.nextRunAt) >= startOfToday && new Date(t.nextRunAt) <= now
  }).length

  const fallidas = tasks.filter((t) => t.lastResult === 'error').length

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
              <CalendarCheck className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Tareas Programadas de IA
              </h1>
              <p className="text-sm text-muted-foreground">
                Administra las tareas automatizadas y sus programaciones
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
              Crear Tarea
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Total Tareas" value={String(totalTareas)} />
          <StatTile label="Activas" value={String(activas)} tone="success" />
          <StatTile label="Ejecutadas Hoy" value={String(ejecutadasHoy)} />
          <StatTile
            label="Fallidas"
            value={String(fallidas)}
            tone={fallidas > 0 ? 'destructive' : 'neutral'}
          />
        </div>

        {/* Tabla de Tareas */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3.5">
            <Clock className="size-5 text-muted-foreground" aria-hidden />
            <h2 className="text-base font-semibold text-foreground">Tareas Configuradas</h2>
          </div>

          {tasks.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
              <CalendarCheck className="size-12 text-muted-foreground/40" aria-hidden />
              <p className="text-sm text-muted-foreground">
                No hay tareas programadas configuradas
              </p>
              <Button size="sm" onClick={() => setModalOpen(true)}>
                <Plus className="size-4" weight="bold" aria-hidden />
                Crear primera tarea
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nombre</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipo</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expresion Cron</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Proxima Ejecucion</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ultimo Resultado</th>
                    <th className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tasks.map((task) => {
                    const resultConfig = LAST_RESULT_CONFIG[task.lastResult] ?? LAST_RESULT_CONFIG.pending
                    return (
                      <tr key={task.id} className="transition-colors hover:bg-accent/40">
                        <td className="px-4 py-3 font-medium text-foreground">{task.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {TASK_TYPE_LABELS[task.taskType] ?? task.taskType}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="font-mono">
                            {task.cronExpression}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                          {formatDate(task.nextRunAt)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={resultConfig.variant}>
                            {task.lastResult === 'success' ? (
                              <CheckCircle className="size-3.5" aria-hidden />
                            ) : task.lastResult === 'error' ? (
                              <WarningCircle className="size-3.5" aria-hidden />
                            ) : (
                              <Clock className="size-3.5" aria-hidden />
                            )}
                            {resultConfig.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center">
                            {togglingId === task.id ? (
                              <CircularProgress size="sm" />
                            ) : (
                              <ToggleSwitch
                                checked={task.isActive}
                                onChange={() => handleToggleActive(task)}
                                label={task.isActive ? 'Desactivar tarea' : 'Activar tarea'}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      <CreateTaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={fetchData}
      />
    </div>
  )
}
