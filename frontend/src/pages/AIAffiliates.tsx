import { useState, useEffect, useCallback, type ReactNode } from 'react'
// [Fase2·G] Conservado como MUI Joy (sin equivalente en el design system): spinner.
import { CircularProgress } from '@mui/joy'
import {
  Users,
  Plus,
  ArrowClockwise,
  X,
  CheckCircle,
  PauseCircle,
  XCircle,
  Percent,
  Copy,
  Clock,
} from '@phosphor-icons/react'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
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

const STATUS_CONFIG: Record<string, { label: string; variant: BadgeProps['variant']; icon: ReactNode }> = {
  active: { label: 'Activo', variant: 'success', icon: <CheckCircle className="size-3" aria-hidden /> },
  inactive: { label: 'Inactivo', variant: 'neutral', icon: <XCircle className="size-3" aria-hidden /> },
  suspended: { label: 'Suspendido', variant: 'warning', icon: <PauseCircle className="size-3" aria-hidden /> },
  pending_approval: { label: 'Pendiente', variant: 'primary', icon: <Clock className="size-3" aria-hidden /> },
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
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Crear Programa de Afiliados</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="flex items-start justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/12 px-3 py-2.5 text-sm text-destructive-text">
            <span>{error}</span>
            <button
              type="button"
              aria-label="Descartar error"
              onClick={() => setError(null)}
              className="shrink-0 rounded p-0.5 transition-colors hover:bg-destructive/15"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="prog-name">Nombre del Programa</Label>
            <Input
              id="prog-name"
              placeholder="ej. Programa Premium 2025"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prog-rate">Tasa de Comision (%)</Label>
            <Input
              id="prog-rate"
              type="number"
              placeholder="10"
              value={commissionRate}
              onChange={(e) => setCommissionRate(parseFloat(e.target.value) || 0)}
              leftIcon={<Percent aria-hidden />}
              min={0}
              max={100}
              step={0.1}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prog-desc">Descripcion</Label>
            <textarea
              id="prog-desc"
              placeholder="Describe el programa de afiliados..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleClose} disabled={saving}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSubmit} loading={saving}>
            <Plus className="size-4" weight="bold" aria-hidden />
            Crear Programa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

  // Auto-ocultar la notificacion tras 3s (presentacion; reemplaza autoHideDuration del Snackbar).
  useEffect(() => {
    if (!snackbar) return
    const t = setTimeout(() => setSnackbar(null), 3000)
    return () => clearTimeout(t)
  }, [snackbar])

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
      <div className="flex min-h-[60vh] items-center justify-center">
        <CircularProgress size="lg" />
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
                <Users className="size-6" weight="fill" aria-hidden />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Programa de Afiliados
                </h1>
                <p className="text-sm text-muted-foreground">
                  Gestiona programas de referidos y tasas de comision
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
                Crear Programa
              </Button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/12 px-4 py-3 text-sm text-destructive-text">
              <span>{error}</span>
              <button
                type="button"
                aria-label="Descartar error"
                onClick={() => setError(null)}
                className="shrink-0 rounded p-0.5 transition-colors hover:bg-destructive/15"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Total Programas" value={String(totalProgramas)} />
            <StatTile label="Activos" value={String(activos)} tone="success" />
            <StatTile label="Referidos Totales" value={totalReferidos.toLocaleString('es-ES')} />
            <StatTile label="Comisiones Totales" value={`$${totalComisiones.toFixed(2)}`} tone="warning" />
          </div>

          {/* Info pendientes */}
          {totalPendiente > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/16 px-4 py-3 text-sm text-warning-text">
              <Clock className="size-[18px] shrink-0" aria-hidden />
              <span>
                Tienes <strong>${totalPendiente.toFixed(2)}</strong> en comisiones pendientes de pago
              </span>
            </div>
          )}

          {/* Tabla de Programas */}
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Users className="size-5" aria-hidden />
              Programas de Afiliados
            </h2>

            {programs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-6 py-12 text-center shadow-sm shadow-black/[0.02]">
                <Users className="size-12 text-muted-foreground/40" aria-hidden />
                <p className="text-sm text-muted-foreground">
                  No hay programas de afiliados creados aun
                </p>
                <Button size="sm" className="mt-2" onClick={() => setModalOpen(true)}>
                  <Plus className="size-4" weight="bold" aria-hidden />
                  Crear primer programa
                </Button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left">
                        <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nombre</th>
                        <th className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Link de Referido</th>
                        <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comision (%)</th>
                        <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado</th>
                        <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Referidos</th>
                        <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ganado ($)</th>
                        <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pendiente ($)</th>
                        <th className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {programs.map((prog) => {
                        const statusConf = STATUS_CONFIG[prog.status] ?? STATUS_CONFIG.inactive
                        const isLoading = actionLoadingId === prog.id
                        return (
                          <tr key={prog.id} className="transition-colors hover:bg-accent/40">
                            <td className="px-4 py-3">
                              <div>
                                <p className="font-medium text-foreground">{prog.name}</p>
                                {prog.description && (
                                  <p className="text-xs text-muted-foreground">
                                    {prog.description.length > 60
                                      ? prog.description.substring(0, 60) + '...'
                                      : prog.description}
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Tooltip title="Click para copiar link de referido">
                                <button
                                  type="button"
                                  onClick={() => copyReferralLink(prog.referralCode)}
                                  aria-label={`Copiar link de referido ${prog.referralCode}`}
                                  className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-transparent bg-primary/12 px-2 py-0.5 text-xs font-medium leading-none text-primary transition-colors hover:bg-primary/20"
                                >
                                  {prog.referralCode}
                                  <Copy className="size-3" aria-hidden />
                                </button>
                              </Tooltip>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="font-medium text-primary">
                                {Number(prog.commissionRate)}%
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={statusConf.variant}>
                                {statusConf.icon}
                                {statusConf.label}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                              {(Number(prog.referralsCount) || 0).toLocaleString('es-ES')}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-success-text">
                              ${(Number(prog.totalEarnings) || 0).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-warning-text">
                              ${(Number(prog.pendingEarnings) || 0).toFixed(2)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-1">
                                {prog.status !== 'active' ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    loading={isLoading}
                                    onClick={() => handleActivate(prog.id)}
                                    className="text-success-text hover:bg-success/10 hover:text-success-text"
                                  >
                                    {!isLoading && <CheckCircle className="size-3.5" aria-hidden />}
                                    Activar
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    loading={isLoading}
                                    onClick={() => handleDeactivate(prog.id)}
                                  >
                                    {!isLoading && <XCircle className="size-3.5" aria-hidden />}
                                    Desactivar
                                  </Button>
                                )}
                              </div>
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
        </div>

        {/* Modal Crear */}
        <CreateProgramModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSuccess={fetchData}
        />

        {/* Notificacion (reemplaza el Snackbar de MUI) */}
        {snackbar && (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-6 left-1/2 z-50 flex max-w-[90vw] -translate-x-1/2 items-center gap-2 rounded-lg border border-success/30 bg-success/14 px-4 py-3 text-sm text-success-text shadow-lg"
          >
            <CheckCircle className="size-[18px] shrink-0" aria-hidden />
            <span className="truncate">{snackbar}</span>
            <button
              type="button"
              aria-label="Cerrar notificacion"
              onClick={() => setSnackbar(null)}
              className="shrink-0 rounded p-0.5 transition-colors hover:bg-success/20"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
