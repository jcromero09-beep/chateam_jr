import { useState, useEffect } from 'react'
// [Fase2·G] Conservado como MUI a propósito: no hay equivalente de spinner en el DS.
import { CircularProgress } from '@mui/joy'
import {
  EnvelopeSimple,
  Plus,
  PencilSimple,
  Trash,
  Eye,
  MagnifyingGlass,
  CheckCircle,
  XCircle,
  ArrowClockwise,
  Warning,
  CreditCard,
} from '@phosphor-icons/react'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import api from '../services/api'
import CheckoutPage from '../components/CheckoutPage'
import { toast } from 'sonner'

interface EmailPlan {
  id: number
  name: string
  description: string
  emailCreditsPerCycle: number
  maxEmailSendsPerDay: number
  maxTemplates: number
  price: string
  recurrence: string
  stripePriceId: string
  isPublic: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface FormData {
  name: string
  description: string
  emailCreditsPerCycle: number
  maxEmailSendsPerDay: number
  maxTemplates: number
  price: string
  recurrence: string
  isPublic: boolean
  isActive: boolean
}

// Estructura mínima de factura para el checkout (compatible con CheckoutPage)
interface Invoice {
  id: number
  detail: string
  value: number
  dueDate: string
  status: 'paid' | 'open' | 'proceso'
  users: number
  connections: number
  queues: number
  planId?: number
  recurrence?: string
}

const RECURRENCE_OPTIONS = [
  { value: 'Day', label: 'Diario' },
  { value: 'MENSUAL', label: 'Mensual' },
  { value: 'BIMESTRAL', label: 'Bimestral' },
  { value: 'TRIMESTRAL', label: 'Trimestral' },
  { value: 'SEMESTRAL', label: 'Semestral' },
  { value: 'ANUAL', label: 'Anual' }
]

const initialFormData: FormData = {
  name: '',
  description: '',
  emailCreditsPerCycle: 100,
  maxEmailSendsPerDay: 50,
  maxTemplates: 10,
  price: '9.99',
  recurrence: 'MENSUAL',
  isPublic: true,
  isActive: true
}

const columns = ['ID', 'Nombre', 'Precio', 'Créditos', 'Límites', 'Estado', 'Stripe', '']

// Botón de acción de fila (mismo look que RowAction del prototipo, con onClick)
function ActionBtn({
  label,
  onClick,
  className,
  children,
}: {
  label: string
  onClick: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
        className,
      )}
    >
      {children}
    </button>
  )
}

function FeatureChip({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <Badge variant={enabled ? 'success' : 'neutral'}>
      {enabled ? (
        <CheckCircle className="size-3.5" weight="fill" aria-hidden />
      ) : (
        <XCircle className="size-3.5" weight="fill" aria-hidden />
      )}
      {label}
    </Badge>
  )
}

function FeatureSwitch({
  id,
  label,
  checked,
  onChange
}: {
  id: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={id}>{label}</Label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer appearance-none items-center rounded-full border-0 p-0 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          checked ? 'bg-primary' : 'bg-input',
        )}
      >
        <span
          className={cn(
            'inline-block size-5 rounded-full bg-card shadow transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
          aria-hidden
        />
      </button>
    </div>
  )
}

export default function EmailPlans() {
  const [plans, setPlans] = useState<EmailPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [searchParam, setSearchParam] = useState('')
  const [pageNumber, setPageNumber] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [count, setCount] = useState(0)

  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<EmailPlan | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Pago / suscripción a un plan de email (reutiliza el checkout de 3 métodos)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [invoiceForPayment, setInvoiceForPayment] = useState<Invoice | null>(null)

  const handlePayPlan = async (plan: EmailPlan) => {
    try {
      // Factura temporal: users/connections/queues en 0 para que el
      // checkout la trate como plan de email (mismo patrón que "Mis Créditos").
      const { data } = await api.post('/invoices', {
        detail: `Plan de Email: ${plan.name}`,
        value: 0,
        users: 0,
        connections: 0,
        queues: 0
      })
      setInvoiceForPayment(data)
      setPaymentModalOpen(true)
    } catch {
      toast.error('No se pudo iniciar el pago del plan de email')
    }
  }

  const handlePaymentSuccess = () => {
    setPaymentModalOpen(false)
    setInvoiceForPayment(null)
    toast.success('¡Plan de email adquirido exitosamente!')
    fetchPlans()
  }

  useEffect(() => {
    fetchPlans()
  }, [searchParam, pageNumber])

  const fetchPlans = async () => {
    setLoading(true)
    try {
      const response = await api.get('/email-plans', {
        params: { includePrivate: true }
      })
      console.log('Email Plans response:', response.data)
      const { data } = response.data
      setPlans(Array.isArray(data) ? data : [])
      setCount(Array.isArray(data) ? data.length : 0)
    } catch (err) {
      console.error('Error fetching plans:', err)
      setError('Error al cargar los planes')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!formData.name) {
      setError('El nombre del plan es requerido')
      return
    }

    if (!formData.price || parseFloat(formData.price) <= 0) {
      setError('El precio debe ser mayor a 0')
      return
    }

    setSaving(true)
    setError('')
    try {
      await api.post('/email-plans', formData)
      setCreateModalOpen(false)
      setFormData(initialFormData)
      fetchPlans()
    } catch (err: any) {
      console.error('Error creating plan:', err)
      setError(err.response?.data?.error || err.response?.data?.errors?.[0] || 'Error al crear el plan')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async () => {
    if (!selectedPlan) return

    setSaving(true)
    setError('')
    try {
      await api.put(`/email-plans/${selectedPlan.id}`, formData)
      setEditModalOpen(false)
      setSelectedPlan(null)
      setFormData(initialFormData)
      fetchPlans()
    } catch (err: any) {
      console.error('Error updating plan:', err)
      setError(err.response?.data?.error || 'Error al actualizar el plan')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedPlan) return

    setSaving(true)
    setError('')
    try {
      await api.delete(`/email-plans/${selectedPlan.id}`)
      setDeleteModalOpen(false)
      setSelectedPlan(null)
      fetchPlans()
    } catch (err: any) {
      console.error('Error deleting plan:', err)
      setError(err.response?.data?.error || 'Error al eliminar el plan')
    } finally {
      setSaving(false)
    }
  }

  const openEditModal = (plan: EmailPlan) => {
    setSelectedPlan(plan)
    setFormData({
      name: plan.name || '',
      description: plan.description || '',
      emailCreditsPerCycle: plan.emailCreditsPerCycle || 100,
      maxEmailSendsPerDay: plan.maxEmailSendsPerDay || 50,
      maxTemplates: plan.maxTemplates || 10,
      price: plan.price || '0',
      recurrence: plan.recurrence || 'MENSUAL',
      isPublic: plan.isPublic ?? true,
      isActive: plan.isActive ?? true
    })
    setEditModalOpen(true)
  }

  const openViewModal = (plan: EmailPlan) => {
    setSelectedPlan(plan)
    setViewModalOpen(true)
  }

  const openDeleteModal = (plan: EmailPlan) => {
    setSelectedPlan(plan)
    setDeleteModalOpen(true)
  }

  const formatCurrency = (amount: string) => {
    const num = parseFloat(amount)
    return isNaN(num) ? '$0.00' : `$${num.toFixed(2)}`
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <EnvelopeSimple className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Planes de Email
              </h1>
              <p className="text-sm text-muted-foreground">
                Gestión de planes de envío de emails con créditos
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar"
              className="text-muted-foreground"
              onClick={fetchPlans}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            <Button size="sm" onClick={() => setCreateModalOpen(true)}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nuevo Plan
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Total Planes" value={String(count)} />
          <StatTile
            label="Públicos"
            value={String(plans.filter((p) => p.isPublic).length)}
            tone="success"
          />
          <StatTile
            label="Activos"
            value={String(plans.filter((p) => p.isActive).length)}
            tone="primary"
          />
          <StatTile
            label="Con Stripe"
            value={String(plans.filter((p) => p.stripePriceId).length)}
            tone="warning"
          />
        </div>

        {/* Search */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-md flex-1">
            <MagnifyingGlass
              className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              placeholder="Buscar por nombre..."
              aria-label="Buscar planes de email"
              value={searchParam}
              onChange={(e) => setSearchParam(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>
          <p className="text-sm text-muted-foreground">{count} planes encontrados</p>
        </div>

        {/* Plans Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          {loading ? (
            <div className="flex justify-center py-12">
              <CircularProgress />
            </div>
          ) : plans.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <p className="text-base text-muted-foreground">
                No hay planes de email registrados
              </p>
              <Button size="sm" onClick={() => setCreateModalOpen(true)}>
                <Plus className="size-4" weight="bold" aria-hidden />
                Crear primer plan
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
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
                  {plans.map((plan) => (
                    <tr key={plan.id} className="transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {plan.id}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        <span className="block truncate">{plan.name}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-primary">
                        {formatCurrency(plan.price)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="block text-xs text-foreground">
                          <strong>{plan.emailCreditsPerCycle}</strong> créditos
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {plan.recurrence || 'MENSUAL'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block text-xs text-foreground">
                          <strong>{plan.maxEmailSendsPerDay}</strong> envíos/día
                        </span>
                        <span className="block text-xs text-foreground">
                          <strong>{plan.maxTemplates}</strong> plantillas
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={plan.isActive ? 'success' : 'neutral'} dot>
                          {plan.isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={plan.stripePriceId ? 'primary' : 'warning'}>
                          {plan.stripePriceId ? 'Vinculado' : 'Pendiente'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          <ActionBtn
                            label="Pagar / Suscribir"
                            onClick={() => handlePayPlan(plan)}
                            className="text-success-text hover:bg-success/10 hover:text-success-text"
                          >
                            <CreditCard className="size-[18px]" aria-hidden />
                          </ActionBtn>
                          <ActionBtn label="Ver detalles" onClick={() => openViewModal(plan)}>
                            <Eye className="size-[18px]" aria-hidden />
                          </ActionBtn>
                          <ActionBtn
                            label="Editar"
                            onClick={() => openEditModal(plan)}
                            className="hover:bg-warning/10 hover:text-warning-text"
                          >
                            <PencilSimple className="size-[18px]" aria-hidden />
                          </ActionBtn>
                          <ActionBtn
                            label="Eliminar"
                            onClick={() => openDeleteModal(plan)}
                            className="hover:bg-destructive/10 hover:text-destructive-text"
                          >
                            <Trash className="size-[18px]" aria-hidden />
                          </ActionBtn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      <Dialog
        open={createModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCreateModalOpen(false)
            setError('')
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="size-5" weight="bold" aria-hidden />
              Nuevo Plan de Email
            </DialogTitle>
          </DialogHeader>

          <div className="rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-sm text-foreground">
            Define los límites y créditos para tu plan de email.
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive-text"
            >
              {error}
            </div>
          )}

          <Tabs defaultValue="info">
            <TabsList>
              <TabsTrigger value="info">Información</TabsTrigger>
              <TabsTrigger value="limits">Límites</TabsTrigger>
              <TabsTrigger value="options">Opciones</TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="create-name">Nombre del Plan</Label>
                <Input
                  id="create-name"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Plan Básico Email, Plan Pro Email"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="create-description">Descripción</Label>
                <Input
                  id="create-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descripción del plan..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="create-price">Precio (USD)</Label>
                  <Input
                    id="create-price"
                    required
                    type="number"
                    min={0}
                    step={0.01}
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    leftIcon={<span className="text-sm">$</span>}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="create-recurrence">Recurrencia</Label>
                  <Select
                    value={formData.recurrence}
                    onValueChange={(value) => setFormData({ ...formData, recurrence: value })}
                  >
                    <SelectTrigger id="create-recurrence" className="h-11">
                      <SelectValue placeholder="Selecciona recurrencia" />
                    </SelectTrigger>
                    <SelectContent>
                      {RECURRENCE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="limits" className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="create-credits">Créditos por Ciclo</Label>
                  <Input
                    id="create-credits"
                    type="number"
                    min={0}
                    value={formData.emailCreditsPerCycle}
                    onChange={(e) =>
                      setFormData({ ...formData, emailCreditsPerCycle: parseInt(e.target.value) || 0 })
                    }
                    leftIcon={<CreditCard aria-hidden />}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="create-sends">Máx. Envíos/Día</Label>
                  <Input
                    id="create-sends"
                    type="number"
                    min={0}
                    value={formData.maxEmailSendsPerDay}
                    onChange={(e) =>
                      setFormData({ ...formData, maxEmailSendsPerDay: parseInt(e.target.value) || 0 })
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="create-templates">Máx. Plantillas</Label>
                <Input
                  id="create-templates"
                  type="number"
                  min={0}
                  value={formData.maxTemplates}
                  onChange={(e) =>
                    setFormData({ ...formData, maxTemplates: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
            </TabsContent>

            <TabsContent value="options" className="space-y-4 pt-2">
              <FeatureSwitch
                id="create-is-public"
                label="Plan Público (visible para companies)"
                checked={formData.isPublic}
                onChange={(v) => setFormData({ ...formData, isPublic: v })}
              />

              <div className="border-t border-border" />

              <FeatureSwitch
                id="create-is-active"
                label="Plan Activo"
                checked={formData.isActive}
                onChange={(v) => setFormData({ ...formData, isActive: v })}
              />
            </TabsContent>
          </Tabs>

          <div className="border-t border-border" />

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCreateModalOpen(false)
                setError('')
              }}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={handleCreate} loading={saving}>
              Crear Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog
        open={editModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditModalOpen(false)
            setError('')
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PencilSimple className="size-5" aria-hidden />
              Editar Plan de Email
            </DialogTitle>
          </DialogHeader>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive-text"
            >
              {error}
            </div>
          )}

          <Tabs defaultValue="info">
            <TabsList>
              <TabsTrigger value="info">Información</TabsTrigger>
              <TabsTrigger value="limits">Límites</TabsTrigger>
              <TabsTrigger value="options">Opciones</TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-name">Nombre del Plan</Label>
                <Input
                  id="edit-name"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-description">Descripción</Label>
                <Input
                  id="edit-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-price">Precio (USD)</Label>
                  <Input
                    id="edit-price"
                    required
                    type="number"
                    min={0}
                    step={0.01}
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    leftIcon={<span className="text-sm">$</span>}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-recurrence">Recurrencia</Label>
                  <Select
                    value={formData.recurrence}
                    onValueChange={(value) => setFormData({ ...formData, recurrence: value })}
                  >
                    <SelectTrigger id="edit-recurrence" className="h-11">
                      <SelectValue placeholder="Selecciona recurrencia" />
                    </SelectTrigger>
                    <SelectContent>
                      {RECURRENCE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="limits" className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-credits">Créditos por Ciclo</Label>
                  <Input
                    id="edit-credits"
                    type="number"
                    min={0}
                    value={formData.emailCreditsPerCycle}
                    onChange={(e) =>
                      setFormData({ ...formData, emailCreditsPerCycle: parseInt(e.target.value) || 0 })
                    }
                    leftIcon={<CreditCard aria-hidden />}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-sends">Máx. Envíos/Día</Label>
                  <Input
                    id="edit-sends"
                    type="number"
                    min={0}
                    value={formData.maxEmailSendsPerDay}
                    onChange={(e) =>
                      setFormData({ ...formData, maxEmailSendsPerDay: parseInt(e.target.value) || 0 })
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-templates">Máx. Plantillas</Label>
                <Input
                  id="edit-templates"
                  type="number"
                  min={0}
                  value={formData.maxTemplates}
                  onChange={(e) =>
                    setFormData({ ...formData, maxTemplates: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
            </TabsContent>

            <TabsContent value="options" className="space-y-4 pt-2">
              <FeatureSwitch
                id="edit-is-public"
                label="Plan Público"
                checked={formData.isPublic}
                onChange={(v) => setFormData({ ...formData, isPublic: v })}
              />

              <div className="border-t border-border" />

              <FeatureSwitch
                id="edit-is-active"
                label="Plan Activo"
                checked={formData.isActive}
                onChange={(v) => setFormData({ ...formData, isActive: v })}
              />
            </TabsContent>
          </Tabs>

          <div className="border-t border-border" />

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditModalOpen(false)
                setError('')
              }}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={handleUpdate} loading={saving}>
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Modal */}
      <Dialog open={viewModalOpen} onOpenChange={(open) => !open && setViewModalOpen(false)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <EnvelopeSimple className="size-5" weight="fill" aria-hidden />
              Detalles del Plan de Email
            </DialogTitle>
          </DialogHeader>

          {selectedPlan && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-muted/40 p-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">ID</p>
                    <p className="text-sm text-foreground">{selectedPlan.id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Estado</p>
                    <Badge variant={selectedPlan.isActive ? 'success' : 'neutral'} dot>
                      {selectedPlan.isActive ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Nombre</p>
                    <p className="text-xl font-semibold tracking-tight text-foreground">
                      {selectedPlan.name}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Precio</p>
                    <p className="text-lg font-semibold tabular-nums text-primary">
                      {formatCurrency(selectedPlan.price)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Recurrencia</p>
                    <p className="text-sm text-foreground">{selectedPlan.recurrence || 'MENSUAL'}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-5">
                <p className="mb-4 text-sm font-semibold text-foreground">Créditos y Límites</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Créditos/Ciclo</p>
                    <p className="text-lg font-semibold tabular-nums text-foreground">
                      {selectedPlan.emailCreditsPerCycle}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Envíos/Día</p>
                    <p className="text-lg font-semibold tabular-nums text-foreground">
                      {selectedPlan.maxEmailSendsPerDay}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Plantillas</p>
                    <p className="text-lg font-semibold tabular-nums text-foreground">
                      {selectedPlan.maxTemplates}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Visibilidad</p>
                    <FeatureChip
                      enabled={selectedPlan.isPublic}
                      label={selectedPlan.isPublic ? 'Público' : 'Privado'}
                    />
                  </div>
                </div>
              </div>

              {selectedPlan.stripePriceId && (
                <div className="rounded-xl border border-primary/25 bg-primary/10 p-5">
                  <div className="flex items-center gap-3">
                    <CreditCard className="size-5 shrink-0 text-primary" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">Stripe ID</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {selectedPlan.stripePriceId}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setViewModalOpen(false)}>
                  Cerrar
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setViewModalOpen(false)
                    openEditModal(selectedPlan)
                  }}
                >
                  <PencilSimple className="size-4" aria-hidden />
                  Editar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog
        open={deleteModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteModalOpen(false)
            setError('')
          }
        }}
      >
        <DialogContent className="max-w-md" role="alertdialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Warning className="size-5 text-warning-text" weight="fill" aria-hidden />
              Confirmar Eliminación
            </DialogTitle>
          </DialogHeader>

          <div className="border-t border-border" />

          <p className="text-sm text-foreground">
            ¿Estás seguro de que deseas eliminar el plan de email{' '}
            <strong>{selectedPlan?.name}</strong>?
          </p>

          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive-text"
          >
            Esta acción no se puede deshacer.
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive-text"
            >
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDeleteModalOpen(false)
                setError('')
              }}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleDelete}
              loading={saving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Pago — reutiliza el checkout de 3 métodos (Stripe / PayPal / Comprobante) */}
      <Dialog open={paymentModalOpen} onOpenChange={(open) => !open && setPaymentModalOpen(false)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Pago del plan de email</DialogTitle>
          </DialogHeader>
          {invoiceForPayment && (
            <CheckoutPage
              invoice={invoiceForPayment}
              onClose={() => setPaymentModalOpen(false)}
              onSuccess={handlePaymentSuccess}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
