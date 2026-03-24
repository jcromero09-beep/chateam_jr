import { useState, useEffect, useCallback } from 'react'
import {
  Box, Typography, Table, Sheet, Chip, CircularProgress, Alert, Button,
  Select, Option, Modal, ModalDialog, ModalClose, FormControl, FormLabel,
  Textarea, Snackbar
} from '@mui/joy'
import {
  ArrowUpCircle, CheckCircle2, XCircle, Clock, AlertCircle, Ban
} from 'lucide-react'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args) }

interface Withdrawal {
  id: number
  amount: number
  fee: number
  netAmount: number
  paymentMethod: string
  status: string
  requestedAt: string
  processedAt: string | null
  rejectionReason: string | null
  transactionRef: string | null
}

const STATUS_MAP: Record<string, { label: string; color: 'success' | 'warning' | 'danger' | 'primary' | 'neutral' }> = {
  requested: { label: 'Solicitado', color: 'warning' },
  approved: { label: 'Aprobado', color: 'primary' },
  processing: { label: 'Procesando', color: 'primary' },
  completed: { label: 'Completado', color: 'success' },
  rejected: { label: 'Rechazado', color: 'danger' },
  failed: { label: 'Fallido', color: 'danger' },
}

const PAYMENT_LABELS: Record<string, string> = {
  bank_transfer: 'Transferencia',
  paypal: 'PayPal',
  crypto: 'Cripto',
}

// --- Modal Rechazo ---
function RejectModal({ open, onClose, onConfirm, loading: saving }: {
  open: boolean; onClose: () => void; onConfirm: (reason: string) => void; loading: boolean
}) {
  const [reason, setReason] = useState('')

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ maxWidth: 400 }}>
        <ModalClose />
        <Typography level="title-lg">Rechazar Retiro</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          <FormControl required>
            <FormLabel>Motivo del rechazo</FormLabel>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minRows={3}
              placeholder="Explica el motivo del rechazo..."
            />
          </FormControl>
          <Button
            loading={saving}
            color="danger"
            onClick={() => { if (reason.trim()) onConfirm(reason) }}
            disabled={!reason.trim()}
          >
            Confirmar Rechazo
          </Button>
        </Box>
      </ModalDialog>
    </Modal>
  )
}

export default function AffiliateWithdrawals() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [rejectId, setRejectId] = useState<number | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [snackMsg, setSnackMsg] = useState<string | null>(null)

  const fetchWithdrawals = useCallback(async () => {
    try {
      setLoading(true)
      const params: Record<string, string | number> = { limit: 20 }
      if (statusFilter) params.status = statusFilter
      const { data: res } = await api.get('/affiliates/withdrawals', { params })
      if (res.success) {
        setWithdrawals(res.data.rows || [])
        setCount(res.data.count || 0)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar'
      setError(msg)
      devLog('[AffiliateWithdrawals] Error:', err)
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { fetchWithdrawals() }, [fetchWithdrawals])

  const handleApprove = async (id: number) => {
    try {
      setActionLoading(true)
      await api.post(`/affiliates/withdrawals/${id}/approve`)
      setSnackMsg('Retiro aprobado exitosamente')
      fetchWithdrawals()
    } catch (err: unknown) {
      devLog('[AffiliateWithdrawals] Approve error:', err)
      setSnackMsg('Error al aprobar retiro')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async (reason: string) => {
    if (!rejectId) return
    try {
      setActionLoading(true)
      await api.post(`/affiliates/withdrawals/${rejectId}/reject`, { rejectionReason: reason })
      setSnackMsg('Retiro rechazado')
      setRejectId(null)
      fetchWithdrawals()
    } catch (err: unknown) {
      devLog('[AffiliateWithdrawals] Reject error:', err)
      setSnackMsg('Error al rechazar retiro')
    } finally {
      setActionLoading(false)
    }
  }

  const formatCurrency = (val: number) => `$${Number(val || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography level="h3" sx={{ fontWeight: 700 }}>
            <ArrowUpCircle size={22} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Retiros
          </Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.500' }}>{count} retiros en total</Typography>
        </Box>
        <Select
          size="sm" placeholder="Estado" value={statusFilter}
          onChange={(_, v) => setStatusFilter(v || '')}
          sx={{ minWidth: 140 }}
        >
          <Option value="">Todos</Option>
          <Option value="requested">Solicitado</Option>
          <Option value="completed">Completado</Option>
          <Option value="rejected">Rechazado</Option>
        </Select>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress size="lg" /></Box>
      ) : error ? (
        <Alert color="danger" startDecorator={<AlertCircle size={18} />}>{error}</Alert>
      ) : withdrawals.length === 0 ? (
        <Alert color="neutral">Sin retiros registrados</Alert>
      ) : (
        <Sheet variant="outlined" sx={{ borderRadius: 'md', overflow: 'auto' }}>
          <Table stickyHeader hoverRow sx={{ '& th': { bgcolor: 'background.level1' } }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Monto</th>
                <th>Neto</th>
                <th>Metodo</th>
                <th>Estado</th>
                <th>Solicitado</th>
                <th>Procesado</th>
                <th style={{ width: 140 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((w) => {
                const sc = STATUS_MAP[w.status] || STATUS_MAP.requested
                return (
                  <tr key={w.id}>
                    <td><Typography level="body-xs">#{w.id}</Typography></td>
                    <td><Typography level="body-sm" sx={{ fontWeight: 600 }}>{formatCurrency(w.amount)}</Typography></td>
                    <td><Typography level="body-sm">{formatCurrency(w.netAmount)}</Typography></td>
                    <td><Chip size="sm" variant="outlined">{PAYMENT_LABELS[w.paymentMethod] || w.paymentMethod}</Chip></td>
                    <td><Chip size="sm" variant="soft" color={sc.color}>{sc.label}</Chip></td>
                    <td><Typography level="body-xs">{formatDate(w.requestedAt)}</Typography></td>
                    <td>
                      <Typography level="body-xs">{formatDate(w.processedAt)}</Typography>
                      {w.rejectionReason && (
                        <Typography level="body-xs" sx={{ color: 'danger.500', fontSize: '0.7rem' }}>
                          {w.rejectionReason}
                        </Typography>
                      )}
                    </td>
                    <td>
                      {w.status === 'requested' && (
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Button
                            size="sm" variant="soft" color="success"
                            startDecorator={<CheckCircle2 size={14} />}
                            loading={actionLoading}
                            onClick={() => handleApprove(w.id)}
                          >
                            Aprobar
                          </Button>
                          <Button
                            size="sm" variant="soft" color="danger"
                            startDecorator={<Ban size={14} />}
                            onClick={() => setRejectId(w.id)}
                          >
                            Rechazar
                          </Button>
                        </Box>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </Sheet>
      )}

      <RejectModal
        open={rejectId !== null}
        onClose={() => setRejectId(null)}
        onConfirm={handleReject}
        loading={actionLoading}
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
