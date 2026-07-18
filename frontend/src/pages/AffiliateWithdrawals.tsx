import { useState, useEffect, useCallback } from 'react'
import CircularProgress from '@mui/joy/CircularProgress'
import {
  ArrowCircleUp,
  CheckCircle,
  WarningCircle,
  Prohibit,
} from '@phosphor-icons/react'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

const STATUS_MAP: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
  requested: { label: 'Solicitado', variant: 'warning' },
  approved: { label: 'Aprobado', variant: 'primary' },
  processing: { label: 'Procesando', variant: 'primary' },
  completed: { label: 'Completado', variant: 'success' },
  rejected: { label: 'Rechazado', variant: 'destructive' },
  failed: { label: 'Fallido', variant: 'destructive' },
}

const PAYMENT_LABELS: Record<string, string> = {
  bank_transfer: 'Transferencia',
  paypal: 'PayPal',
  crypto: 'Cripto',
}

const columns = ['ID', 'Monto', 'Neto', 'Método', 'Estado', 'Solicitado', 'Procesado', 'Acciones']

// Botón de acción con color semántico (aprobar / rechazar)
const dangerActionClass =
  'border-destructive/30 bg-destructive/10 text-destructive-text hover:bg-destructive/16 hover:text-destructive-text'
const successActionClass =
  'border-success/30 bg-success/10 text-success-text hover:bg-success/16 hover:text-success-text'

// --- Modal Rechazo ---
function RejectModal({ open, onClose, onConfirm, loading: saving }: {
  open: boolean; onClose: () => void; onConfirm: (reason: string) => void; loading: boolean
}) {
  const [reason, setReason] = useState('')

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rechazar Retiro</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="reject-reason">
            Motivo del rechazo <span className="text-destructive-text">*</span>
          </Label>
          <textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            required
            placeholder="Explica el motivo del rechazo..."
            className="w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            size="sm"
            variant="outline"
            loading={saving}
            className={dangerActionClass}
            onClick={() => { if (reason.trim()) onConfirm(reason) }}
            disabled={!reason.trim()}
          >
            Confirmar Rechazo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

  // Auto-oculta el aviso (equivalente a autoHideDuration del Snackbar migrado)
  useEffect(() => {
    if (!snackMsg) return
    const t = setTimeout(() => setSnackMsg(null), 3000)
    return () => clearTimeout(t)
  }, [snackMsg])

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
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <ArrowCircleUp className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Retiros
              </h1>
              <p className="text-sm text-muted-foreground">{count} retiros en total</p>
            </div>
          </div>
          <Select
            value={statusFilter || 'all'}
            onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}
          >
            <SelectTrigger className="h-9 w-[160px]" aria-label="Filtrar por estado">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="requested">Solicitado</SelectItem>
              <SelectItem value="completed">Completado</SelectItem>
              <SelectItem value="rejected">Rechazado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <CircularProgress size="lg" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text">
            <WarningCircle className="size-[18px] shrink-0" aria-hidden />
            {error}
          </div>
        ) : withdrawals.length === 0 ? (
          <div className="rounded-lg border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            Sin retiros registrados
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    {columns.map((c, i) => (
                      <th
                        key={i}
                        className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {withdrawals.map((w) => {
                    const sc = STATUS_MAP[w.status] || STATUS_MAP.requested
                    return (
                      <tr key={w.id} className="transition-colors hover:bg-accent/40">
                        <td className="px-4 py-3 text-xs text-muted-foreground">#{w.id}</td>
                        <td className="px-4 py-3 font-semibold tabular-nums text-foreground">
                          {formatCurrency(w.amount)}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-foreground">
                          {formatCurrency(w.netAmount)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">
                            {PAYMENT_LABELS[w.paymentMethod] || w.paymentMethod}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={sc.variant}>{sc.label}</Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                          {formatDate(w.requestedAt)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="block whitespace-nowrap text-xs text-muted-foreground">
                            {formatDate(w.processedAt)}
                          </span>
                          {w.rejectionReason && (
                            <span className="mt-0.5 block text-[0.7rem] text-destructive-text">
                              {w.rejectionReason}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {w.status === 'requested' && (
                            <div className="flex items-center gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className={successActionClass}
                                loading={actionLoading}
                                onClick={() => handleApprove(w.id)}
                              >
                                <CheckCircle className="size-4" aria-hidden />
                                Aprobar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className={dangerActionClass}
                                onClick={() => setRejectId(w.id)}
                              >
                                <Prohibit className="size-4" aria-hidden />
                                Rechazar
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <RejectModal
        open={rejectId !== null}
        onClose={() => setRejectId(null)}
        onConfirm={handleReject}
        loading={actionLoading}
      />

      {/* Aviso (migrado de Snackbar) */}
      {snackMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-success/30 bg-card px-4 py-3 text-sm font-medium text-foreground shadow-lg"
        >
          {snackMsg}
        </div>
      )}
    </div>
  )
}
