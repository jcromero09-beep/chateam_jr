import { useState, useEffect, useCallback, type ReactNode } from 'react'
import {
  Box, Typography, Card, CardContent, Grid, Button, Chip, Table, Sheet,
  CircularProgress, Alert, Modal, ModalDialog, ModalClose,
  FormControl, FormLabel, Input, Textarea, IconButton, Snackbar, Tooltip
} from '@mui/joy'
import {
  Plus, RefreshCw, CheckCircle2, XCircle, PauseCircle, Clock,
  Copy, Search, Edit, ToggleLeft, ToggleRight
} from 'lucide-react'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args) }

type ProgramStatus = 'active' | 'inactive' | 'pending_approval' | 'suspended' | 'rejected'

interface Program {
  id: number
  name: string
  description: string
  commissionRate: number
  minimumWithdrawal: number
  status: ProgramStatus
  referralCode: string
  referralsCount: number
  totalEarnings: number
  pendingEarnings: number
  createdAt: string
  tier?: { name: string; level: number } | null
  wallet?: { availableBalance: number; pendingBalance: number } | null
}

const STATUS_CONFIG: Record<string, { label: string; color: 'success' | 'neutral' | 'warning' | 'primary' | 'danger'; icon: ReactNode }> = {
  active: { label: 'Activo', color: 'success', icon: <CheckCircle2 size={12} /> },
  inactive: { label: 'Inactivo', color: 'neutral', icon: <XCircle size={12} /> },
  suspended: { label: 'Suspendido', color: 'warning', icon: <PauseCircle size={12} /> },
  pending_approval: { label: 'Pendiente', color: 'primary', icon: <Clock size={12} /> },
  rejected: { label: 'Rechazado', color: 'danger', icon: <XCircle size={12} /> },
}

// --- Modal Crear/Editar ---
interface ProgramModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  program?: Program | null
}

function ProgramModal({ open, onClose, onSuccess, program }: ProgramModalProps) {
  const [name, setName] = useState(program?.name || '')
  const [description, setDescription] = useState(program?.description || '')
  const [commissionRate, setCommissionRate] = useState(program?.commissionRate || 10)
  const [minimumWithdrawal, setMinimumWithdrawal] = useState(program?.minimumWithdrawal || 50)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (program) {
      setName(program.name)
      setDescription(program.description || '')
      setCommissionRate(program.commissionRate)
      setMinimumWithdrawal(program.minimumWithdrawal)
    } else {
      setName('')
      setDescription('')
      setCommissionRate(10)
      setMinimumWithdrawal(50)
    }
  }, [program, open])

  const handleSubmit = async () => {
    if (!name.trim()) { setError('El nombre es requerido'); return }
    if (commissionRate <= 0 || commissionRate > 100) { setError('La comisión debe estar entre 0 y 100'); return }
    setSaving(true)
    setError(null)
    try {
      if (program) {
        await api.put(`/affiliates/programs/${program.id}`, { name, description, commissionRate, minimumWithdrawal })
      } else {
        await api.post('/affiliates/programs', { name, description, commissionRate })
      }
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ maxWidth: 500, width: '100%' }}>
        <ModalClose />
        <Typography level="title-lg">{program ? 'Editar Programa' : 'Crear Programa'}</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          {error && <Alert color="danger" size="sm">{error}</Alert>}
          <FormControl required>
            <FormLabel>Nombre</FormLabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi Programa de Afiliados" />
          </FormControl>
          <FormControl>
            <FormLabel>Descripción</FormLabel>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} minRows={2} placeholder="Descripción del programa..." />
          </FormControl>
          <Grid container spacing={2}>
            <Grid xs={6}>
              <FormControl required>
                <FormLabel>Comisión (%)</FormLabel>
                <Input type="number" value={commissionRate} onChange={(e) => setCommissionRate(Number(e.target.value))} slotProps={{ input: { min: 0, max: 100, step: 0.5 } }} />
              </FormControl>
            </Grid>
            <Grid xs={6}>
              <FormControl>
                <FormLabel>Retiro Mínimo ($)</FormLabel>
                <Input type="number" value={minimumWithdrawal} onChange={(e) => setMinimumWithdrawal(Number(e.target.value))} slotProps={{ input: { min: 0, step: 5 } }} />
              </FormControl>
            </Grid>
          </Grid>
          <Button loading={saving} onClick={handleSubmit} sx={{ mt: 1 }}>
            {program ? 'Guardar Cambios' : 'Crear Programa'}
          </Button>
        </Box>
      </ModalDialog>
    </Modal>
  )
}

// --- Main Page ---
export default function AffiliatePrograms() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editProgram, setEditProgram] = useState<Program | null>(null)
  const [snackMsg, setSnackMsg] = useState<string | null>(null)

  const fetchPrograms = useCallback(async () => {
    try {
      setLoading(true)
      const params: Record<string, string> = {}
      if (search) params.search = search
      const { data: res } = await api.get('/affiliates/programs', { params })
      if (res.success) {
        setPrograms(res.data.rows || [])
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar'
      setError(msg)
      devLog('[AffiliatePrograms] Error:', err)
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { fetchPrograms() }, [fetchPrograms])

  const toggleStatus = async (program: Program) => {
    try {
      const action = program.status === 'active' ? 'deactivate' : 'activate'
      await api.post(`/affiliates/programs/${program.id}/${action}`)
      setSnackMsg(`Programa ${action === 'activate' ? 'activado' : 'desactivado'}`)
      fetchPrograms()
    } catch (err: unknown) {
      devLog('[AffiliatePrograms] Toggle error:', err)
    }
  }

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setSnackMsg('Código copiado al portapapeles')
  }

  const formatCurrency = (val: number) => `$${Number(val || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography level="h3" sx={{ fontWeight: 700 }}>Programas de Afiliados</Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.500' }}>Gestiona tus programas de referidos</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Input
            size="sm" placeholder="Buscar..." startDecorator={<Search size={16} />}
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
          <IconButton variant="outlined" size="sm" onClick={fetchPrograms}><RefreshCw size={16} /></IconButton>
          <Button size="sm" startDecorator={<Plus size={16} />} onClick={() => { setEditProgram(null); setModalOpen(true) }}>
            Nuevo Programa
          </Button>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress size="lg" /></Box>
      ) : error ? (
        <Alert color="danger">{error}</Alert>
      ) : programs.length === 0 ? (
        <Card variant="outlined">
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <Typography level="body-lg" sx={{ mb: 1 }}>Sin programas aún</Typography>
            <Typography level="body-sm" sx={{ color: 'neutral.400', mb: 2 }}>
              Crea tu primer programa de afiliados para empezar a generar referidos.
            </Typography>
            <Button size="sm" startDecorator={<Plus size={16} />} onClick={() => setModalOpen(true)}>
              Crear Programa
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Sheet variant="outlined" sx={{ borderRadius: 'md', overflow: 'auto' }}>
          <Table stickyHeader hoverRow sx={{ '& th': { bgcolor: 'background.level1' } }}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Estado</th>
                <th>Comisión</th>
                <th>Referidos</th>
                <th>Ganancias</th>
                <th>Código</th>
                <th style={{ width: 120 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {programs.map((p) => {
                const sc = STATUS_CONFIG[p.status] || STATUS_CONFIG.inactive
                return (
                  <tr key={p.id}>
                    <td>
                      <Typography level="body-sm" sx={{ fontWeight: 600 }}>{p.name}</Typography>
                      {p.tier && <Typography level="body-xs" sx={{ color: 'neutral.400' }}>Nivel: {p.tier.name}</Typography>}
                    </td>
                    <td>
                      <Chip size="sm" variant="soft" color={sc.color} startDecorator={sc.icon}>{sc.label}</Chip>
                    </td>
                    <td><Typography level="body-sm">{p.commissionRate}%</Typography></td>
                    <td><Typography level="body-sm">{p.referralsCount || 0}</Typography></td>
                    <td>
                      <Typography level="body-sm" sx={{ fontWeight: 600 }}>{formatCurrency(p.totalEarnings)}</Typography>
                      <Typography level="body-xs" sx={{ color: 'neutral.400' }}>Pend: {formatCurrency(p.pendingEarnings)}</Typography>
                    </td>
                    <td>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography level="body-xs" sx={{ fontFamily: 'monospace' }}>{p.referralCode}</Typography>
                        <IconButton size="sm" variant="plain" onClick={() => copyCode(p.referralCode)}>
                          <Copy size={14} />
                        </IconButton>
                      </Box>
                    </td>
                    <td>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="Editar">
                          <IconButton size="sm" variant="plain" onClick={() => { setEditProgram(p); setModalOpen(true) }}>
                            <Edit size={14} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={p.status === 'active' ? 'Desactivar' : 'Activar'}>
                          <IconButton size="sm" variant="plain" color={p.status === 'active' ? 'warning' : 'success'} onClick={() => toggleStatus(p)}>
                            {p.status === 'active' ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </Sheet>
      )}

      <ProgramModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditProgram(null) }}
        onSuccess={fetchPrograms}
        program={editProgram}
      />

      <Snackbar
        open={!!snackMsg}
        autoHideDuration={3000}
        onClose={() => setSnackMsg(null)}
        color="success"
        variant="soft"
      >
        {snackMsg}
      </Snackbar>
    </Box>
  )
}
