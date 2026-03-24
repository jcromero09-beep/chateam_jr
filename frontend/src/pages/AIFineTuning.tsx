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
  LinearProgress,
} from '@mui/joy'
import {
  BrainCircuit,
  Plus,
  RefreshCw,
  X,
  Database,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  FlaskConical,
} from 'lucide-react'
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

const getStatusColor = (status: FineTuningJob['status']) => {
  const map: Record<FineTuningJob['status'], 'warning' | 'primary' | 'success' | 'danger'> = {
    pending: 'warning',
    running: 'primary',
    completed: 'success',
    failed: 'danger',
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
  const size = 14
  if (status === 'pending') return <Clock size={size} />
  if (status === 'running') return <Loader2 size={size} />
  if (status === 'completed') return <CheckCircle2 size={size} />
  return <AlertCircle size={size} />
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
    <Modal open={open} onClose={handleClose}>
      <ModalDialog sx={{ minWidth: 480 }}>
        <ModalClose />
        <Typography level="h4" sx={{ mb: 2 }}>Crear Job de Fine-Tuning</Typography>
        {error && (
          <Alert color="danger" sx={{ mb: 2 }} endDecorator={
            <IconButton size="sm" variant="plain" color="danger" onClick={() => setError(null)}><X size={16} /></IconButton>
          }>{error}</Alert>
        )}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <FormControl required>
            <FormLabel>Nombre del Job</FormLabel>
            <Input
              placeholder="ej. fine-tune-soporte-v1"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormControl>
          <FormControl required>
            <FormLabel>Modelo Base</FormLabel>
            <Select
              value={baseModel}
              onChange={(_, val) => { if (val) setBaseModel(val) }}
            >
              <Option value="gpt-4o-mini">gpt-4o-mini</Option>
              <Option value="gpt-3.5-turbo">gpt-3.5-turbo</Option>
            </Select>
          </FormControl>
          <FormControl required>
            <FormLabel>Fuente de Datos</FormLabel>
            <Select
              value={dataSourceId}
              onChange={(_, val) => setDataSourceId(val as number)}
              placeholder="Selecciona una fuente"
            >
              {dataSources.map((ds) => (
                <Option key={ds.id} value={ds.id}>
                  {ds.name} ({ds.recordCount?.toLocaleString('es-ES') ?? 0} registros)
                </Option>
              ))}
            </Select>
          </FormControl>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
            <Button variant="outlined" onClick={handleClose} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSubmit} loading={saving} startDecorator={<FlaskConical size={16} />}>
              Crear Job
            </Button>
          </Box>
        </Box>
      </ModalDialog>
    </Modal>
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
            <BrainCircuit size={28} />
            Fine-Tuning de Modelos
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary', mt: 0.5 }}>
            Gestiona y monitorea los jobs de fine-tuning de tus modelos de IA
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startDecorator={<RefreshCw size={16} />} onClick={fetchData}>
            Actualizar
          </Button>
          <Button startDecorator={<Plus size={16} />} onClick={() => setModalOpen(true)}>
            Crear Job
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
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>Total Jobs</Typography>
              <Typography level="h3">{totalJobs}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>En Progreso</Typography>
              <Typography level="h3" sx={{ color: 'primary.500' }}>{enProgreso}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>Completados</Typography>
              <Typography level="h3" sx={{ color: 'success.500' }}>{completados}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>Data Sources</Typography>
              <Typography level="h3" sx={{ color: 'warning.500' }}>{dataSources.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabla de Jobs */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography level="title-lg" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <FlaskConical size={20} />
            Jobs de Fine-Tuning
          </Typography>
          {jobs.length === 0 ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <BrainCircuit size={48} style={{ opacity: 0.3, marginBottom: 8 }} />
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 2 }}>
                No hay jobs de fine-tuning registrados aun
              </Typography>
              <Button startDecorator={<Plus size={16} />} onClick={() => setModalOpen(true)}>
                Crear primer Job
              </Button>
            </Box>
          ) : (
            <Sheet sx={{ overflow: 'auto' }}>
              <Table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 160 }}>Nombre</th>
                    <th style={{ minWidth: 140 }}>Modelo Base</th>
                    <th style={{ minWidth: 120 }}>Estado</th>
                    <th style={{ minWidth: 160 }}>Progreso</th>
                    <th style={{ minWidth: 160 }}>Creado</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id}>
                      <td>
                        <Typography level="body-sm" fontWeight="lg">{job.name}</Typography>
                      </td>
                      <td>
                        <Chip size="sm" variant="outlined">{job.baseModel}</Chip>
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          color={getStatusColor(job.status)}
                          startDecorator={getStatusIcon(job.status)}
                        >
                          {getStatusLabel(job.status)}
                        </Chip>
                      </td>
                      <td>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 130 }}>
                          <LinearProgress
                            determinate
                            value={job.progress ?? 0}
                            color={getStatusColor(job.status)}
                            sx={{ flex: 1 }}
                          />
                          <Typography level="body-xs" sx={{ minWidth: 35 }}>
                            {job.progress ?? 0}%
                          </Typography>
                        </Box>
                      </td>
                      <td>
                        <Typography level="body-xs">{formatDate(job.createdAt)}</Typography>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Sheet>
          )}
        </CardContent>
      </Card>

      {/* Data Sources */}
      <Card>
        <CardContent>
          <Typography level="title-lg" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Database size={20} />
            Fuentes de Datos Disponibles
          </Typography>
          {dataSources.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                No hay fuentes de datos disponibles
              </Typography>
            </Box>
          ) : (
            <Grid container spacing={2}>
              {dataSources.map((ds) => (
                <Grid key={ds.id} xs={12} sm={6} md={4}>
                  <Card variant="outlined">
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Database size={16} />
                        <Typography level="body-sm" fontWeight="lg">{ds.name}</Typography>
                      </Box>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        {ds.recordCount?.toLocaleString('es-ES') ?? 0} registros
                      </Typography>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        Creado: {formatDate(ds.createdAt)}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </CardContent>
      </Card>

      {/* Modal */}
      <CreateJobModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={fetchData}
        dataSources={dataSources}
      />
    </Box>
  )
}
