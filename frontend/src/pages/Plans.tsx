import {
  useState,
  useEffect,
  useId,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
// [Fase2·G] Conservado a propósito: no hay equivalente Radix para el spinner.
import { CircularProgress } from '@mui/joy'
import {
  Package,
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
  Users,
  LinkSimple,
  Queue,
  Flask,
  CurrencyDollar,
} from '@phosphor-icons/react'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import api from '../services/api'

interface Plan {
  id: number
  name: string
  users: number
  connections: number
  queues: number
  amount: string
  useWhatsapp: boolean
  useFacebook: boolean
  useInstagram: boolean
  useCampaigns: boolean
  useSchedules: boolean
  useInternalChat: boolean
  useExternalApi: boolean
  useKanban: boolean
  useOpenAi: boolean
  useIntegrations: boolean
  useMarketing: boolean
  useLeads: boolean
  isPublic: boolean
  trial: boolean
  trialDays: number
  recurrence: string
  stripePriceId: string
  allowRecurringPayments: boolean
  createdAt: string
  updatedAt: string
}

interface FormData {
  name: string
  users: number
  connections: number
  queues: number
  amount: string
  recurrence: string
  allowRecurringPayments: boolean
  useWhatsapp: boolean
  useFacebook: boolean
  useInstagram: boolean
  useCampaigns: boolean
  useSchedules: boolean
  useInternalChat: boolean
  useExternalApi: boolean
  useKanban: boolean
  useOpenAi: boolean
  useIntegrations: boolean
  useMarketing: boolean
  useLeads: boolean
  isPublic: boolean
  trial: boolean
  trialDays: number
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
  users: 3,
  connections: 1,
  queues: 3,
  amount: '0',
  recurrence: 'MENSUAL',
  allowRecurringPayments: false,
  useWhatsapp: true,
  useFacebook: false,
  useInstagram: false,
  useCampaigns: true,
  useSchedules: true,
  useInternalChat: true,
  useExternalApi: false,
  useKanban: true,
  useOpenAi: true,
  useIntegrations: true,
  useMarketing: true,
  useLeads: true,
  isPublic: true,
  trial: false,
  trialDays: 7
}

const columns = ['ID', 'Nombre', 'Precio', 'Recurrencia', 'Límites', 'Estado', 'Cobro', '']

/* -------------------------------------------------------------------------- */
/* Presentational helpers (design system)                                      */
/* -------------------------------------------------------------------------- */

/** Botón de acción de fila (mismo look que RowAction del prototipo, con onClick). */
function ActionBtn({
  label,
  onClick,
  className,
  children,
}: {
  label: string
  onClick: () => void
  className?: string
  children: ReactNode
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

type NoticeTone = 'primary' | 'warning' | 'destructive' | 'neutral'

const noticeTone: Record<NoticeTone, string> = {
  primary: 'border-primary/25 bg-primary/10 text-foreground',
  warning: 'border-warning/30 bg-warning/12 text-foreground',
  destructive: 'border-destructive/30 bg-destructive/10 text-destructive-text',
  neutral: 'border-border bg-muted text-muted-foreground',
}

/** Reemplazo del <Alert> de Joy con tokens del design system. */
function Notice({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: NoticeTone
  className?: string
  children: ReactNode
}) {
  return (
    <div
      role={tone === 'destructive' ? 'alert' : undefined}
      className={cn(
        'rounded-md border px-3.5 py-2.5 text-sm leading-relaxed',
        noticeTone[tone],
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Separador opcionalmente etiquetado (reemplazo del <Divider> de Joy). */
function SectionDivider({ label }: { label?: string }) {
  if (!label) return <div className="border-t border-border" aria-hidden />
  return (
    <div className="flex items-center gap-3" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-border" aria-hidden />
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  )
}

/** Chip de característica habilitada/deshabilitada. */
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

/**
 * Toggle de característica. El <Switch> de Joy no tiene equivalente en el
 * design system: se usa el Checkbox accesible (role=checkbox) del wrapper.
 */
function FeatureToggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="cursor-pointer">
        {label}
      </Label>
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

/** Campo etiquetado. */
function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="ml-0.5 text-destructive-text" aria-hidden>
            *
          </span>
        )}
      </Label>
      {children}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Formulario compartido por los modales Crear / Editar                        */
/* -------------------------------------------------------------------------- */

function PlanFormTabs({
  idPrefix,
  formData,
  setFormData,
  namePlaceholder,
  featuresHint,
  publicLabel,
}: {
  idPrefix: string
  formData: FormData
  setFormData: Dispatch<SetStateAction<FormData>>
  namePlaceholder?: string
  featuresHint?: string
  publicLabel: string
}) {
  return (
    <Tabs defaultValue="basica">
      <TabsList>
        <TabsTrigger value="basica">Información Básica</TabsTrigger>
        <TabsTrigger value="features">Características</TabsTrigger>
        <TabsTrigger value="opciones">Opciones</TabsTrigger>
      </TabsList>

      <TabsContent value="basica">
        <div className="space-y-4 pt-2">
          <Field label="Nombre del Plan" htmlFor={`${idPrefix}-name`} required>
            <Input
              id={`${idPrefix}-name`}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={namePlaceholder}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Precio (USD)" htmlFor={`${idPrefix}-amount`} required>
              <Input
                id={`${idPrefix}-amount`}
                type="number"
                min={0}
                step={0.01}
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                leftIcon={<CurrencyDollar aria-hidden />}
              />
            </Field>
            <Field label="Recurrencia" htmlFor={`${idPrefix}-recurrence`}>
              <Select
                value={formData.recurrence}
                onValueChange={(value) => setFormData({ ...formData, recurrence: value })}
              >
                <SelectTrigger id={`${idPrefix}-recurrence`} className="h-11">
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
            </Field>
          </div>

          <FeatureToggle
            label="Activar pagos recurrentes para este plan"
            checked={formData.allowRecurringPayments}
            onChange={(v) => setFormData({ ...formData, allowRecurringPayments: v })}
          />

          <Notice tone={formData.allowRecurringPayments ? 'primary' : 'neutral'}>
            {formData.allowRecurringPayments
              ? 'Stripe y PayPal crearán suscripciones. Cada renovación pagada generará una nueva factura y extenderá el vencimiento.'
              : 'Los pagos de este plan serán pagos únicos. No se crearán suscripciones automáticas.'}
          </Notice>

          <SectionDivider label="Límites del Plan" />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Usuarios" htmlFor={`${idPrefix}-users`}>
              <Input
                id={`${idPrefix}-users`}
                type="number"
                min={1}
                value={formData.users}
                onChange={(e) =>
                  setFormData({ ...formData, users: parseInt(e.target.value) || 0 })
                }
                leftIcon={<Users aria-hidden />}
              />
            </Field>
            <Field label="Conexiones" htmlFor={`${idPrefix}-connections`}>
              <Input
                id={`${idPrefix}-connections`}
                type="number"
                min={1}
                value={formData.connections}
                onChange={(e) =>
                  setFormData({ ...formData, connections: parseInt(e.target.value) || 0 })
                }
                leftIcon={<LinkSimple aria-hidden />}
              />
            </Field>
            <Field label="Colas" htmlFor={`${idPrefix}-queues`}>
              <Input
                id={`${idPrefix}-queues`}
                type="number"
                min={1}
                value={formData.queues}
                onChange={(e) =>
                  setFormData({ ...formData, queues: parseInt(e.target.value) || 0 })
                }
                leftIcon={<Queue aria-hidden />}
              />
            </Field>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="features">
        <div className="space-y-4 pt-2">
          {featuresHint && <p className="text-sm text-muted-foreground">{featuresHint}</p>}
          <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            <FeatureToggle
              label="WhatsApp"
              checked={formData.useWhatsapp}
              onChange={(v) => setFormData({ ...formData, useWhatsapp: v })}
            />
            <FeatureToggle
              label="API Externa"
              checked={formData.useExternalApi}
              onChange={(v) => setFormData({ ...formData, useExternalApi: v })}
            />
            <FeatureToggle
              label="Facebook"
              checked={formData.useFacebook}
              onChange={(v) => setFormData({ ...formData, useFacebook: v })}
            />
            <FeatureToggle
              label="Kanban"
              checked={formData.useKanban}
              onChange={(v) => setFormData({ ...formData, useKanban: v })}
            />
            <FeatureToggle
              label="Instagram"
              checked={formData.useInstagram}
              onChange={(v) => setFormData({ ...formData, useInstagram: v })}
            />
            <FeatureToggle
              label="OpenAI"
              checked={formData.useOpenAi}
              onChange={(v) => setFormData({ ...formData, useOpenAi: v })}
            />
            <FeatureToggle
              label="Campañas"
              checked={formData.useCampaigns}
              onChange={(v) => setFormData({ ...formData, useCampaigns: v })}
            />
            <FeatureToggle
              label="Integraciones"
              checked={formData.useIntegrations}
              onChange={(v) => setFormData({ ...formData, useIntegrations: v })}
            />
            <FeatureToggle
              label="Horarios"
              checked={formData.useSchedules}
              onChange={(v) => setFormData({ ...formData, useSchedules: v })}
            />
            <FeatureToggle
              label="Marketing"
              checked={formData.useMarketing}
              onChange={(v) => setFormData({ ...formData, useMarketing: v })}
            />
            <FeatureToggle
              label="Chat Interno"
              checked={formData.useInternalChat}
              onChange={(v) => setFormData({ ...formData, useInternalChat: v })}
            />
            <FeatureToggle
              label="Leads"
              checked={formData.useLeads}
              onChange={(v) => setFormData({ ...formData, useLeads: v })}
            />
          </div>
        </div>
      </TabsContent>

      <TabsContent value="opciones">
        <div className="space-y-4 pt-2">
          <FeatureToggle
            label={publicLabel}
            checked={formData.isPublic}
            onChange={(v) => setFormData({ ...formData, isPublic: v })}
          />

          <SectionDivider />

          <FeatureToggle
            label="Habilitar período de prueba (Trial)"
            checked={formData.trial}
            onChange={(v) => setFormData({ ...formData, trial: v })}
          />

          {formData.trial && (
            <Field label="Días de prueba" htmlFor={`${idPrefix}-trial-days`}>
              <Input
                id={`${idPrefix}-trial-days`}
                type="number"
                min={1}
                max={90}
                value={formData.trialDays}
                onChange={(e) =>
                  setFormData({ ...formData, trialDays: parseInt(e.target.value) || 7 })
                }
              />
            </Field>
          )}
        </div>
      </TabsContent>
    </Tabs>
  )
}

/* -------------------------------------------------------------------------- */

export default function Plans() {
  const [plans, setPlans] = useState<Plan[]>([])
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
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchPlans()
  }, [searchParam, pageNumber])

  const fetchPlans = async () => {
    setLoading(true)
    try {
      const response = await api.get('/plans', {
        params: { searchParam, pageNumber }
      })
      console.log('Plans response:', response.data)
      const { plans: plansData, count: totalCount, hasMore: more } = response.data
      setPlans(Array.isArray(plansData) ? plansData : [])
      setCount(totalCount || 0)
      setHasMore(more || false)
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

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setError('El precio debe ser mayor a 0')
      return
    }

    setSaving(true)
    setError('')
    try {
      const payload = { ...formData }
      console.log('Creating plan with:', payload)
      await api.post('/plans', payload)
      setCreateModalOpen(false)
      setFormData(initialFormData)
      fetchPlans()
    } catch (err: any) {
      console.error('Error creating plan:', err)
      setError(err.response?.data?.error || 'Error al crear el plan. Verifica que Stripe esté configurado.')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async () => {
    if (!selectedPlan) return

    setSaving(true)
    setError('')
    try {
      const payload = { ...formData, id: selectedPlan.id }
      console.log('Updating plan:', selectedPlan.id, payload)
      await api.put(`/plans/${selectedPlan.id}`, payload)
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
      await api.delete(`/plans/${selectedPlan.id}`)
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

  const openEditModal = (plan: Plan) => {
    setSelectedPlan(plan)
    setFormData({
      name: plan.name || '',
      users: plan.users || 3,
      connections: plan.connections || 1,
      queues: plan.queues || 3,
      amount: plan.amount || '0',
      recurrence: plan.recurrence || 'MENSUAL',
      allowRecurringPayments: plan.allowRecurringPayments ?? false,
      useWhatsapp: plan.useWhatsapp ?? true,
      useFacebook: plan.useFacebook ?? false,
      useInstagram: plan.useInstagram ?? false,
      useCampaigns: plan.useCampaigns ?? true,
      useSchedules: plan.useSchedules ?? true,
      useInternalChat: plan.useInternalChat ?? true,
      useExternalApi: plan.useExternalApi ?? false,
      useKanban: plan.useKanban ?? true,
      useOpenAi: plan.useOpenAi ?? true,
      useIntegrations: plan.useIntegrations ?? true,
      useMarketing: plan.useMarketing ?? true,
      useLeads: plan.useLeads ?? true,
      isPublic: plan.isPublic ?? true,
      trial: plan.trial ?? false,
      trialDays: plan.trialDays || 7
    })
    setEditModalOpen(true)
  }

  const openViewModal = (plan: Plan) => {
    setSelectedPlan(plan)
    setViewModalOpen(true)
  }

  const openDeleteModal = (plan: Plan) => {
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
              <Package className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Planes
              </h1>
              <p className="text-sm text-muted-foreground">
                Gestión de planes de suscripción con integración Stripe y PayPal
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
            label="Con Trial"
            value={String(plans.filter((p) => p.trial).length)}
            tone="warning"
          />
          <StatTile
            label="Recurrentes"
            value={String(plans.filter((p) => p.allowRecurringPayments).length)}
            tone="primary"
          />
        </div>

        {/* Search */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative max-w-md flex-1">
            <MagnifyingGlass
              className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              placeholder="Buscar por nombre..."
              aria-label="Buscar planes por nombre"
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
            <div className="flex justify-center py-10">
              <CircularProgress />
            </div>
          ) : plans.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-12">
              <p className="text-muted-foreground">No hay planes registrados</p>
              <Button size="sm" onClick={() => setCreateModalOpen(true)}>
                <Plus className="size-4" weight="bold" aria-hidden />
                Crear primer plan
              </Button>
            </div>
          ) : (
            <>
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
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-1">
                            <span className="font-medium text-foreground">{plan.name}</span>
                            {plan.trial && (
                              <Badge variant="warning">Trial {plan.trialDays}d</Badge>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-primary">
                          {formatCurrency(plan.amount)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{plan.recurrence || 'MENSUAL'}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                            <span>
                              <strong className="text-foreground">{plan.users}</strong> usuarios
                            </span>
                            <span>
                              <strong className="text-foreground">{plan.connections}</strong>{' '}
                              conexiones
                            </span>
                            <span>
                              <strong className="text-foreground">{plan.queues}</strong> colas
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={plan.isPublic ? 'success' : 'neutral'} dot>
                            {plan.isPublic ? 'Público' : 'Privado'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={plan.allowRecurringPayments ? 'primary' : 'neutral'}>
                            {plan.allowRecurringPayments ? 'Recurrente' : 'Único'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-0.5">
                            <ActionBtn
                              label="Ver detalles"
                              onClick={() => openViewModal(plan)}
                              className="hover:bg-primary/10 hover:text-primary"
                            >
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

              {/* Pagination */}
              <div className="flex items-center justify-center gap-4 border-t border-border px-4 py-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pageNumber === 1}
                  onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground">Página {pageNumber}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hasMore}
                  onClick={() => setPageNumber((p) => p + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </>
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
              Nuevo Plan
            </DialogTitle>
          </DialogHeader>

          <Notice tone="primary">
            Al crear un plan se generará automáticamente un producto y precio en Stripe.
            Asegúrate de tener configurada la clave privada de Stripe en Configuraciones.
          </Notice>

          {error && <Notice tone="destructive">{error}</Notice>}

          <PlanFormTabs
            idPrefix="create-plan"
            formData={formData}
            setFormData={setFormData}
            namePlaceholder="Ej: Plan Básico, Plan Pro, Plan Enterprise"
            featuresHint="Selecciona las características incluidas en este plan"
            publicLabel="Plan Público (visible para nuevos registros)"
          />

          <SectionDivider />

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateModalOpen(false)
                setError('')
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreate} loading={saving}>
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
              Editar Plan
            </DialogTitle>
          </DialogHeader>

          <Notice tone="warning">
            Los cambios de precio no se reflejarán en Stripe automáticamente.
            El precio en Stripe quedará fijo con el valor original.
          </Notice>

          {error && <Notice tone="destructive">{error}</Notice>}

          <PlanFormTabs
            idPrefix="edit-plan"
            formData={formData}
            setFormData={setFormData}
            publicLabel="Plan Público"
          />

          <SectionDivider />

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditModalOpen(false)
                setError('')
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleUpdate} loading={saving}>
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
              <Package className="size-5" weight="fill" aria-hidden />
              Detalles del Plan
            </DialogTitle>
          </DialogHeader>

          {selectedPlan && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">ID</p>
                    <p className="tabular-nums text-foreground">{selectedPlan.id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Estado</p>
                    <div className="mt-0.5">
                      <Badge variant={selectedPlan.isPublic ? 'success' : 'neutral'} dot>
                        {selectedPlan.isPublic ? 'Público' : 'Privado'}
                      </Badge>
                    </div>
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
                      {formatCurrency(selectedPlan.amount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Recurrencia</p>
                    <p className="text-foreground">{selectedPlan.recurrence || 'MENSUAL'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Cobro</p>
                    <div className="mt-0.5">
                      <Badge variant={selectedPlan.allowRecurringPayments ? 'primary' : 'neutral'}>
                        {selectedPlan.allowRecurringPayments ? 'Recurrente' : 'Pago único'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border p-4">
                <h3 className="mb-3 font-medium text-foreground">Límites</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Usuarios</p>
                    <p className="text-lg font-semibold tabular-nums text-foreground">
                      {selectedPlan.users}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Conexiones</p>
                    <p className="text-lg font-semibold tabular-nums text-foreground">
                      {selectedPlan.connections}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Colas</p>
                    <p className="text-lg font-semibold tabular-nums text-foreground">
                      {selectedPlan.queues}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border p-4">
                <h3 className="mb-3 font-medium text-foreground">Características</h3>
                <div className="flex flex-wrap gap-2">
                  <FeatureChip enabled={selectedPlan.useWhatsapp} label="WhatsApp" />
                  <FeatureChip enabled={selectedPlan.useFacebook} label="Facebook" />
                  <FeatureChip enabled={selectedPlan.useInstagram} label="Instagram" />
                  <FeatureChip enabled={selectedPlan.useCampaigns} label="Campañas" />
                  <FeatureChip enabled={selectedPlan.useSchedules} label="Horarios" />
                  <FeatureChip enabled={selectedPlan.useInternalChat} label="Chat Interno" />
                  <FeatureChip enabled={selectedPlan.useExternalApi} label="API Externa" />
                  <FeatureChip enabled={selectedPlan.useKanban} label="Kanban" />
                  <FeatureChip enabled={selectedPlan.useOpenAi} label="OpenAI" />
                  <FeatureChip enabled={selectedPlan.useIntegrations} label="Integraciones" />
                  <FeatureChip enabled={selectedPlan.useMarketing} label="Marketing" />
                  <FeatureChip enabled={selectedPlan.useLeads} label="Leads" />
                </div>
              </div>

              {selectedPlan.trial && (
                <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4">
                  <Flask className="size-6 shrink-0 text-warning-text" weight="fill" aria-hidden />
                  <div>
                    <p className="font-medium text-foreground">Período de Prueba Habilitado</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedPlan.trialDays} días de prueba gratis
                    </p>
                  </div>
                </div>
              )}

              {selectedPlan.stripePriceId && (
                <div className="flex items-center gap-3 rounded-lg border border-primary/25 bg-primary/10 p-4">
                  <CreditCard className="size-6 shrink-0 text-primary" weight="fill" aria-hidden />
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">Stripe ID</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {selectedPlan.stripePriceId}
                    </p>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setViewModalOpen(false)}>
                  Cerrar
                </Button>
                <Button
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
        <DialogContent role="alertdialog" hideClose className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Warning className="size-5 text-warning-text" weight="fill" aria-hidden />
              Confirmar Eliminación
            </DialogTitle>
          </DialogHeader>

          <SectionDivider />

          <p className="text-sm text-foreground">
            ¿Estás seguro de que deseas eliminar el plan{' '}
            <strong className="font-semibold">{selectedPlan?.name}</strong>?
          </p>

          {selectedPlan?.stripePriceId && (
            <Notice tone="warning">
              Este plan tiene un precio vinculado en Stripe ({selectedPlan.stripePriceId}).
              El precio será desactivado en Stripe automáticamente.
            </Notice>
          )}

          <Notice tone="destructive">
            Esta acción no se puede deshacer. Las empresas con este plan asignado
            podrían quedar sin plan válido.
          </Notice>

          {error && <Notice tone="destructive">{error}</Notice>}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteModalOpen(false)
                setError('')
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleDelete}
              loading={saving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
