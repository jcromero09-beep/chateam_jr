import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  Chip,
  Table,
  Sheet,
  CircularProgress,
  Alert,
  Modal,
  ModalDialog,
  ModalClose,
  FormControl,
  FormLabel,
  Input,
  Select,
  Option,
  IconButton,
  Switch,
} from '@mui/joy'
import {
  CalendarClock,
  Plus,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  Activity,
  ToggleLeft,
} from 'lucide-react'
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

const LAST_RESULT_CONFIG: Record<LastResult, { label: string; color: 'success' | 'danger' | 'neutral' }> = {
  success: { label: 'Exitoso', color: 'success' },
  error: { label: 'Error', color: 'danger' },
  pending: { label: 'Pendiente', color: 'neutral' },
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
    <Modal open={open} onClose={handleClose}>
      <ModalDialog sx={{ minWidth: 480 }}>
        <ModalClose />
        <Typography level="h4" sx={{ mb: 2 }}>Crear Tarea Programada</Typography>
        {error && (
          <Alert color="danger" sx={{ mb: 2 }} endDecorator={
            <IconButton size="sm" variant="plain" color="danger" onClick={() => setError(null)}><X size={16} /></IconButton>
          }>{error}</Alert>
        )}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <FormControl required>
            <FormLabel>Nombre</FormLabel>
            <Input
              placeholder="ej. Reset creditos mensual"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormControl>
          <FormControl required>
            <FormLabel>Tipo de Tarea</FormLabel>
            <Select
              value={taskType}
              onChange={(_, val) => { if (val) setTaskType(val as TaskType) }}
            >
              {(Object.entries(TASK_TYPE_LABELS) as [TaskType, string][]).map(([key, label]) => (
                <Option key={key} value={key}>{label}</Option>
              ))}
            </Select>
          </FormControl>
          <FormControl required>
            <FormLabel>Expresion Cron</FormLabel>
            <Input
              placeholder="0 0 * * *"
              value={cronExpression}
              onChange={(e) => setCronExpression(e.target.value)}
            />
            <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
              Formato: minuto hora dia mes diasemana. Ej: <code>0 0 * * *</code> = cada dia a medianoche
            </Typography>
          </FormControl>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
            <Button variant="outlined" onClick={handleClose} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSubmit} loading={saving} startDecorator={<CalendarClock size={16} />}>
              Crear Tarea
            </Button>
          </Box>
        </Box>
      </ModalDialog>
    </Modal>
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
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress size="lg" />
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography level="h2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CalendarClock size={28} />
            Tareas Programadas de IA
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary', mt: 0.5 }}>
            Administra las tareas automatizadas y sus programaciones
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startDecorator={<RefreshCw size={16} />} onClick={fetchData}>
            Actualizar
          </Button>
          <Button startDecorator={<Plus size={16} />} onClick={() => setModalOpen(true)}>
            Crear Tarea
          </Button>
        </Box>
      </Box>

      {/* Error */}
      {error && (
        <Alert color="danger" sx={{ mb: 3 }} endDecorator={
          <IconButton size="sm" variant="plain" color="danger" onClick={() => setError(null)}><X size={16} /></IconButton>
        }>
          {error}
        </Alert>
      )}

      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <CalendarClock size={18} style={{ opacity: 0.6 }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Total Tareas</Typography>
              </Box>
              <Typography level="h3">{totalTareas}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <ToggleLeft size={18} style={{ opacity: 0.6 }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Activas</Typography>
              </Box>
              <Typography level="h3" sx={{ color: 'success.500' }}>{activas}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Activity size={18} style={{ opacity: 0.6 }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Ejecutadas Hoy</Typography>
              </Box>
              <Typography level="h3" sx={{ color: 'primary.500' }}>{ejecutadasHoy}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <AlertCircle size={18} style={{ opacity: 0.6 }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Fallidas</Typography>
              </Box>
              <Typography level="h3" sx={{ color: fallidas > 0 ? 'danger.500' : 'neutral.500' }}>{fallidas}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabla de Tareas */}
      <Card>
        <CardContent>
          <Typography level="title-lg" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Clock size={20} />
            Tareas Configuradas
          </Typography>

          {tasks.length === 0 ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <CalendarClock size={48} style={{ opacity: 0.3, marginBottom: 8 }} />
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 2 }}>
                No hay tareas programadas configuradas
              </Typography>
              <Button startDecorator={<Plus size={16} />} onClick={() => setModalOpen(true)}>
                Crear primera tarea
              </Button>
            </Box>
          ) : (
            <Sheet sx={{ overflow: 'auto' }}>
              <Table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 160 }}>Nombre</th>
                    <th style={{ minWidth: 200 }}>Tipo</th>
                    <th style={{ minWidth: 160 }}>Expresion Cron</th>
                    <th style={{ minWidth: 180 }}>Proxima Ejecucion</th>
                    <th style={{ minWidth: 120 }}>Ultimo Resultado</th>
                    <th style={{ minWidth: 100, textAlign: 'center' }}>Activa</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => {
                    const resultConfig = LAST_RESULT_CONFIG[task.lastResult] ?? LAST_RESULT_CONFIG.pending
                    return (
                      <tr key={task.id}>
                        <td>
                          <Typography level="body-sm" fontWeight="lg">{task.name}</Typography>
                        </td>
                        <td>
                          <Typography level="body-sm">
                            {TASK_TYPE_LABELS[task.taskType] ?? task.taskType}
                          </Typography>
                        </td>
                        <td>
                          <Chip size="sm" variant="outlined" sx={{ fontFamily: 'monospace' }}>
                            {task.cronExpression}
                          </Chip>
                        </td>
                        <td>
                          <Typography level="body-xs">{formatDate(task.nextRunAt)}</Typography>
                        </td>
                        <td>
                          <Chip
                            size="sm"
                            color={resultConfig.color}
                            startDecorator={
                              task.lastResult === 'success' ? <CheckCircle2 size={12} /> :
                              task.lastResult === 'error' ? <AlertCircle size={12} /> :
                              <Clock size={12} />
                            }
                          >
                            {resultConfig.label}
                          </Chip>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {togglingId === task.id ? (
                            <CircularProgress size="sm" />
                          ) : (
                            <Switch
                              checked={task.isActive}
                              onChange={() => handleToggleActive(task)}
                              color={task.isActive ? 'success' : 'neutral'}
                              size="sm"
                            />
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </Sheet>
          )}
        </CardContent>
      </Card>

      {/* Modal */}
      <CreateTaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={fetchData}
      />
    </Box>
  )
}
