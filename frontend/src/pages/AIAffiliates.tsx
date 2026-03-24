import { useState, useEffect, useCallback, type ReactNode } from 'react'
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
  Textarea,
  IconButton,
  Snackbar,
  Tooltip,
} from '@mui/joy'
import {
  Users,
  Plus,
  RefreshCw,
  X,
  CheckCircle2,
  PauseCircle,
  XCircle,
  DollarSign,
  BadgePercent,
  Link2,
  Copy,
  Clock,
} from 'lucide-react'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args) }
const devError = (...args: unknown[]) => { if (isDev) console.error(...args) }

// --- Types ---
type AffiliateStatus = 'active' | 'inactive' | 'pending_approval' | 'suspended'

interface AffiliateProgram {
  id: number
  name: string
  commissionRate: number
  status: AffiliateStatus
  referralCode: string
  referralsCount: number
  activeReferrals: number
  totalEarnings: number
  pendingEarnings: number
  withdrawnEarnings: number
  minimumWithdrawal: number
  description?: string
  createdAt: string
}

const STATUS_CONFIG: Record<string, { label: string; color: 'success' | 'neutral' | 'warning' | 'primary'; icon: ReactNode }> = {
  active: { label: 'Activo', color: 'success', icon: <CheckCircle2 size={12} /> },
  inactive: { label: 'Inactivo', color: 'neutral', icon: <XCircle size={12} /> },
  suspended: { label: 'Suspendido', color: 'warning', icon: <PauseCircle size={12} /> },
  pending_approval: { label: 'Pendiente', color: 'primary', icon: <Clock size={12} /> },
}

// --- Modal Crear Programa ---
interface CreateProgramModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

function CreateProgramModal({ open, onClose, onSuccess }: CreateProgramModalProps) {
  const [name, setName] = useState('')
  const [commissionRate, setCommissionRate] = useState<number>(10)
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!name.trim()) { setError('El nombre es requerido'); return }
    if (commissionRate <= 0 || commissionRate > 100) {
      setError('La comision debe estar entre 0 y 100')
      return
    }
    try {
      setSaving(true)
      setError(null)
      await api.post('/ai/affiliates/programs', {
        name: name.trim(),
        commissionRate,
        description: description.trim(),
      })
      setName('')
      setCommissionRate(10)
      setDescription('')
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      devError('[AIAffiliates] Error al crear programa:', err)
      setError(e.response?.data?.message || 'Error al crear el programa de afiliados')
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
        <Typography level="h4" sx={{ mb: 2 }}>Crear Programa de Afiliados</Typography>
        {error && (
          <Alert color="danger" sx={{ mb: 2 }} endDecorator={
            <IconButton size="sm" variant="plain" color="danger" onClick={() => setError(null)}><X size={16} /></IconButton>
          }>{error}</Alert>
        )}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <FormControl required>
            <FormLabel>Nombre del Programa</FormLabel>
            <Input
              placeholder="ej. Programa Premium 2025"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormControl>
          <FormControl required>
            <FormLabel>Tasa de Comision (%)</FormLabel>
            <Input
              type="number"
              placeholder="10"
              value={commissionRate}
              onChange={(e) => setCommissionRate(parseFloat(e.target.value) || 0)}
              startDecorator={<BadgePercent size={16} />}
              slotProps={{ input: { min: 0, max: 100, step: 0.1 } }}
            />
          </FormControl>
          <FormControl>
            <FormLabel>Descripcion</FormLabel>
            <Textarea
              placeholder="Describe el programa de afiliados..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              minRows={2}
            />
          </FormControl>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
            <Button variant="outlined" onClick={handleClose} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSubmit} loading={saving} startDecorator={<Plus size={16} />}>
              Crear Programa
            </Button>
          </Box>
        </Box>
      </ModalDialog>
    </Modal>
  )
}

// --- Pagina Principal ---
export default function AIAffiliates() {
  const [programs, setPrograms] = useState<AffiliateProgram[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null)
  const [snackbar, setSnackbar] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      devLog('[AIAffiliates] Cargando programas...')

      const [result] = await Promise.allSettled([
        api.get('/ai/affiliates/programs'),
      ])

      if (result.status === 'fulfilled') {
        const raw = result.value.data
        // Backend retorna { success: true, data: [...] }
        const list = Array.isArray(raw?.data) ? raw.data : (raw?.data ? [raw.data] : [])
        devLog('[AIAffiliates] Programas cargados:', list.length)
        setPrograms(list)
      } else {
        const e = result.reason as { response?: { data?: { message?: string } } }
        devError('[AIAffiliates] Error al cargar programas:', result.reason)
        setError(e.response?.data?.message || 'Error al cargar los programas')
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      devError('[AIAffiliates] Error general:', err)
      setError(e.response?.data?.message || 'Error inesperado al cargar los datos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleActivate = async (id: number) => {
    try {
      setActionLoadingId(id)
      devLog('[AIAffiliates] Activando programa:', id)
      await api.post(`/ai/affiliates/${id}/activate`)
      setPrograms((prev) => prev.map((p) => p.id === id ? { ...p, status: 'active' } : p))
      setSnackbar('Programa activado exitosamente')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      devError('[AIAffiliates] Error al activar:', err)
      setError(e.response?.data?.message || 'Error al activar el programa')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleDeactivate = async (id: number) => {
    try {
      setActionLoadingId(id)
      devLog('[AIAffiliates] Desactivando programa:', id)
      await api.post(`/ai/affiliates/${id}/deactivate`)
      setPrograms((prev) => prev.map((p) => p.id === id ? { ...p, status: 'inactive' } : p))
      setSnackbar('Programa desactivado')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      devError('[AIAffiliates] Error al desactivar:', err)
      setError(e.response?.data?.message || 'Error al desactivar el programa')
    } finally {
      setActionLoadingId(null)
    }
  }

  const copyReferralLink = (code: string) => {
    const baseUrl = window.location.origin
    const link = `${baseUrl}/signup?ref=${code}`
    navigator.clipboard.writeText(link).then(() => {
      setSnackbar(`Link copiado: ${link}`)
    }).catch(() => {
      setSnackbar(`Codigo: ${code}`)
    })
  }

  const totalProgramas = programs.length
  const activos = programs.filter((p) => p.status === 'active').length
  const totalReferidos = programs.reduce((acc, p) => acc + (Number(p.referralsCount) || 0), 0)
  const totalComisiones = programs.reduce((acc, p) => acc + (Number(p.totalEarnings) || 0), 0)
  const totalPendiente = programs.reduce((acc, p) => acc + (Number(p.pendingEarnings) || 0), 0)

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
            <Users size={28} />
            Programa de Afiliados
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary', mt: 0.5 }}>
            Gestiona programas de referidos y tasas de comision
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startDecorator={<RefreshCw size={16} />} onClick={fetchData}>
            Actualizar
          </Button>
          <Button startDecorator={<Plus size={16} />} onClick={() => setModalOpen(true)}>
            Crear Programa
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
                <Link2 size={18} style={{ opacity: 0.6 }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Total Programas</Typography>
              </Box>
              <Typography level="h3">{totalProgramas}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <CheckCircle2 size={18} style={{ opacity: 0.6 }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Activos</Typography>
              </Box>
              <Typography level="h3" sx={{ color: 'success.500' }}>{activos}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Users size={18} style={{ opacity: 0.6 }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Referidos Totales</Typography>
              </Box>
              <Typography level="h3">{totalReferidos.toLocaleString('es-ES')}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <DollarSign size={18} style={{ opacity: 0.6 }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Comisiones Totales</Typography>
              </Box>
              <Typography level="h3" sx={{ color: 'warning.600' }}>
                ${totalComisiones.toFixed(2)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Info pendientes */}
      {totalPendiente > 0 && (
        <Alert color="warning" sx={{ mb: 3 }} startDecorator={<Clock size={18} />}>
          Tienes <strong>${totalPendiente.toFixed(2)}</strong> en comisiones pendientes de pago
        </Alert>
      )}

      {/* Tabla de Programas */}
      <Card>
        <CardContent>
          <Typography level="title-lg" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Users size={20} />
            Programas de Afiliados
          </Typography>

          {programs.length === 0 ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <Users size={48} style={{ opacity: 0.3, marginBottom: 8 }} />
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 2 }}>
                No hay programas de afiliados creados aun
              </Typography>
              <Button startDecorator={<Plus size={16} />} onClick={() => setModalOpen(true)}>
                Crear primer programa
              </Button>
            </Box>
          ) : (
            <Sheet sx={{ overflow: 'auto' }}>
              <Table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 180 }}>Nombre</th>
                    <th style={{ minWidth: 140, textAlign: 'center' }}>Link de Referido</th>
                    <th style={{ minWidth: 110, textAlign: 'right' }}>Comision (%)</th>
                    <th style={{ minWidth: 100 }}>Estado</th>
                    <th style={{ minWidth: 100, textAlign: 'right' }}>Referidos</th>
                    <th style={{ minWidth: 130, textAlign: 'right' }}>Ganado ($)</th>
                    <th style={{ minWidth: 130, textAlign: 'right' }}>Pendiente ($)</th>
                    <th style={{ minWidth: 150, textAlign: 'center' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {programs.map((prog) => {
                    const statusConf = STATUS_CONFIG[prog.status] ?? STATUS_CONFIG.inactive
                    const isLoading = actionLoadingId === prog.id
                    return (
                      <tr key={prog.id}>
                        <td>
                          <Box>
                            <Typography level="body-sm" fontWeight="lg">{prog.name}</Typography>
                            {prog.description && (
                              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                {prog.description.length > 60
                                  ? prog.description.substring(0, 60) + '...'
                                  : prog.description}
                              </Typography>
                            )}
                          </Box>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <Tooltip title="Click para copiar link de referido" placement="top">
                            <Chip
                              size="sm"
                              variant="soft"
                              color="primary"
                              onClick={() => copyReferralLink(prog.referralCode)}
                              endDecorator={<Copy size={12} />}
                              sx={{ cursor: 'pointer' }}
                            >
                              {prog.referralCode}
                            </Chip>
                          </Tooltip>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Typography level="body-sm" fontWeight="lg" sx={{ color: 'primary.600' }}>
                            {Number(prog.commissionRate)}%
                          </Typography>
                        </td>
                        <td>
                          <Chip size="sm" color={statusConf.color} startDecorator={statusConf.icon}>
                            {statusConf.label}
                          </Chip>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Typography level="body-sm">
                            {(Number(prog.referralsCount) || 0).toLocaleString('es-ES')}
                          </Typography>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Typography level="body-sm" sx={{ color: 'success.600' }}>
                            ${(Number(prog.totalEarnings) || 0).toFixed(2)}
                          </Typography>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Typography level="body-sm" sx={{ color: 'warning.600' }}>
                            ${(Number(prog.pendingEarnings) || 0).toFixed(2)}
                          </Typography>
                        </td>
                        <td>
                          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                            {prog.status !== 'active' ? (
                              <Button
                                size="sm"
                                color="success"
                                variant="outlined"
                                loading={isLoading}
                                onClick={() => handleActivate(prog.id)}
                                startDecorator={<CheckCircle2 size={14} />}
                              >
                                Activar
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                color="neutral"
                                variant="outlined"
                                loading={isLoading}
                                onClick={() => handleDeactivate(prog.id)}
                                startDecorator={<XCircle size={14} />}
                              >
                                Desactivar
                              </Button>
                            )}
                          </Box>
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

      {/* Modal Crear */}
      <CreateProgramModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={fetchData}
      />

      {/* Snackbar para notificaciones */}
      <Snackbar
        open={!!snackbar}
        autoHideDuration={3000}
        onClose={() => setSnackbar(null)}
        color="success"
        variant="soft"
      >
        {snackbar}
      </Snackbar>
    </Box>
  )
}
