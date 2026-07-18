import { useState, useEffect } from 'react'
// [Fase2·G] Se conserva CircularProgress de MUI Joy a propósito (no hay equivalente
// en el design system Tailwind/Radix). El resto de la pantalla ya está migrado.
import { CircularProgress } from '@mui/joy'
import {
  Buildings,
  Plus,
  PencilSimple,
  Trash,
  Eye,
  MagnifyingGlass,
  CheckCircle,
  XCircle,
  Clock,
  ArrowClockwise,
  User as UserIcon,
  CalendarBlank,
  CreditCard,
  Warning,
  Robot,
  EnvelopeSimple,
  SignIn,
  Prohibit,
  Power,
} from '@phosphor-icons/react'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import api from '../services/api'
import { enterCompany } from '../services/impersonation'

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
  trial: boolean
  trialDays: number
  recurrence: string
}

interface AISubplan {
  id: number
  name: string
  description: string
  tokens: number
  priceUsd: number
  isActive: boolean
  isPublic: boolean
  companyId: number
}

interface EmailPlan {
  id: number
  name: string
  description: string
  emailCreditsPerCycle: number
  maxEmailSendsPerDay: number
  maxTemplates: number
  price: string
  recurrence: string
  isActive: boolean
  isPublic: boolean
}

interface Company {
  id: number
  name: string
  phone: string
  email: string
  document: string
  paymentMethod: string
  status: boolean
  dueDate: string
  recurrence: string
  planId: number
  plan?: Plan
  aiTokenBalance?: number
  activeAISubplanId?: number | null
  activeAISubplan?: AISubplan
  emailCreditsTotal?: number
  activeEmailPlanId?: number | null
  activeEmailPlan?: EmailPlan
  createdAt: string
  updatedAt: string
  users?: { id: number; name: string; email: string; profile: string }[]
}

interface FormData {
  name: string
  email: string
  phone: string
  document: string
  paymentMethod: string
  status: boolean
  planId: number
  dueDate: string
  recurrence: string
  password: string
  companyUserName: string
  aiTokenBalance: number
  activeAISubplanId: number | null
  emailCreditsTotal: number
  activeEmailPlanId: number | null
}

const RECURRENCE_OPTIONS = [
  { value: 'MENSUAL', label: 'Mensual (30 días)', days: 30 },
  { value: 'BIMESTRAL', label: 'Bimestral (60 días)', days: 60 },
  { value: 'TRIMESTRAL', label: 'Trimestral (90 días)', days: 90 },
  { value: 'SEMESTRAL', label: 'Semestral (180 días)', days: 180 },
  { value: 'ANUAL', label: 'Anual (365 días)', days: 365 },
]

const initialFormData: FormData = {
  name: '',
  email: '',
  phone: '',
  document: '',
  paymentMethod: '',
  status: true,
  planId: 1,
  dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  recurrence: 'MENSUAL',
  password: '',
  companyUserName: '',
  aiTokenBalance: 0,
  activeAISubplanId: null,
  emailCreditsTotal: 0,
  activeEmailPlanId: null,
}

// Radix Select no admite value="" ni undefined en un SelectItem: usamos un
// centinela para representar "sin selección" y lo mapeamos a ''/null al guardar.
const NONE = '__none__'

const inputCls =
  'h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'

// Input con icono decorativo a la izquierda (equivalente a startDecorator de Joy).
function DecoratedInput({
  icon,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { icon: React.ReactNode }) {
  return (
    <div className="relative">
      <span
        className="pointer-events-none absolute left-3 top-1/2 flex size-[18px] -translate-y-1/2 items-center justify-center text-muted-foreground"
        aria-hidden
      >
        {icon}
      </span>
      <input className={cn(inputCls, 'pl-10', className)} {...props} />
    </div>
  )
}

// Botón de acción de fila (mismo look que RowAction, con onClick).
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

// Campo etiqueta/valor para el modal de detalle.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm text-foreground">{children}</div>
    </div>
  )
}

const columns = ['ID', 'Nombre', 'Email', 'Plan', 'Recurrencia', 'Vencimiento', 'Estado', 'Acciones']

export default function Companies() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [aiSubplans, setAiSubplans] = useState<AISubplan[]>([])
  const [emailPlans, setEmailPlans] = useState<EmailPlan[]>([])
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
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Statistics
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    trial: 0,
    expired: 0,
  })

  useEffect(() => {
    fetchCompanies()
    fetchPlans()
    fetchAISubplans()
    fetchEmailPlans()
  }, [searchParam, pageNumber])

  const fetchCompanies = async () => {
    setLoading(true)
    try {
      const response = await api.get('/companies', {
        params: { searchParam, pageNumber },
      })
      console.log('Companies response:', response.data)
      const { companies: companiesData, count: totalCount, hasMore: more } = response.data
      setCompanies(companiesData || [])
      setCount(totalCount || 0)
      setHasMore(more || false)

      // Calculate stats
      const active = companiesData?.filter((c: Company) => c.status === true).length || 0
      const inactive = companiesData?.filter((c: Company) => c.status === false).length || 0
      const today = new Date()
      const expired = companiesData?.filter((c: Company) => {
        if (!c.dueDate) return false
        return new Date(c.dueDate) < today
      }).length || 0
      const trial = companiesData?.filter((c: Company) => c.plan?.trial).length || 0

      setStats({
        total: totalCount || companiesData?.length || 0,
        active,
        inactive,
        trial,
        expired,
      })
    } catch (err) {
      console.error('Error fetching companies:', err)
      setError('Error al cargar las empresas')
    } finally {
      setLoading(false)
    }
  }

  const fetchPlans = async () => {
    try {
      const response = await api.get('/plans')
      console.log('Plans response:', response.data)
      // La respuesta es { plans, count, hasMore }
      const plansData = response.data?.plans || response.data || []
      setPlans(Array.isArray(plansData) ? plansData : [])
    } catch (err) {
      console.error('Error fetching plans:', err)
    }
  }

  const fetchAISubplans = async () => {
    try {
      const response = await api.get('/ai/subplans')
      console.log('AI Subplans response:', response.data)
      const subplansData = response.data?.data || []
      setAiSubplans(Array.isArray(subplansData) ? subplansData : [])
    } catch (err) {
      console.error('Error fetching AI subplans:', err)
    }
  }

  const fetchEmailPlans = async () => {
    try {
      const response = await api.get('/email-plans')
      console.log('Email Plans response:', response.data)
      const plansData = response.data?.data || []
      setEmailPlans(Array.isArray(plansData) ? plansData : [])
    } catch (err) {
      console.error('Error fetching email plans:', err)
    }
  }

  const handleCreate = async () => {
    if (!formData.name || !formData.email || !formData.password) {
      setError('Nombre, email y contraseña son requeridos')
      return
    }

    setSaving(true)
    setError('')
    try {
      const payload = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        document: formData.document,
        paymentMethod: formData.paymentMethod,
        status: formData.status,
        planId: formData.planId,
        dueDate: formData.dueDate,
        recurrence: formData.recurrence,
        password: formData.password,
        companyUserName: formData.companyUserName || formData.name,
      }
      // payload incluye la contraseña del admin de la empresa: no loguear.
      await api.post('/companies', payload)
      setCreateModalOpen(false)
      setFormData(initialFormData)
      fetchCompanies()
    } catch (err: any) {
      console.error('Error creating company:', err)
      setError(err.response?.data?.error || 'Error al crear la empresa')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async () => {
    if (!selectedCompany) return

    setSaving(true)
    setError('')
    try {
      const payload = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        document: formData.document,
        paymentMethod: formData.paymentMethod,
        status: formData.status,
        planId: formData.planId,
        dueDate: formData.dueDate,
        recurrence: formData.recurrence,
        aiTokenBalance: formData.aiTokenBalance,
        activeAISubplanId: formData.activeAISubplanId,
        emailCreditsTotal: formData.emailCreditsTotal,
        activeEmailPlanId: formData.activeEmailPlanId,
      }
      console.log('Updating company:', selectedCompany.id, payload)
      await api.put(`/companies/${selectedCompany.id}`, payload)
      setEditModalOpen(false)
      setSelectedCompany(null)
      setFormData(initialFormData)
      fetchCompanies()
    } catch (err: any) {
      console.error('Error updating company:', err)
      setError(err.response?.data?.error || 'Error al actualizar la empresa')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedCompany) return

    setSaving(true)
    try {
      await api.delete(`/companies/${selectedCompany.id}`)
      setDeleteModalOpen(false)
      setSelectedCompany(null)
      fetchCompanies()
    } catch (err: any) {
      console.error('Error deleting company:', err)
      setError(err.response?.data?.error || 'Error al eliminar la empresa')
    } finally {
      setSaving(false)
    }
  }

  // Suspender / reactivar empresa: PUT parcial de status (el servicio solo
  // actualiza los campos enviados, no pisa el resto).
  const handleToggleStatus = async (company: Company) => {
    try {
      const newStatus = !company.status
      await api.put(`/companies/${company.id}`, { status: newStatus })
      // Reflejar el cambio en el modal de detalle si está abierto sobre la misma empresa.
      setSelectedCompany((prev) =>
        prev && prev.id === company.id ? { ...prev, status: newStatus } : prev,
      )
      fetchCompanies()
    } catch (err: any) {
      console.error('Error toggling company status:', err)
      setError(err.response?.data?.error || 'Error al cambiar el estado de la empresa')
    }
  }

  // Entrar a la empresa (impersonación auditada): swap de token + recarga en el
  // contexto operativo de la empresa. El super vuelve con el banner "Salir".
  const [entering, setEntering] = useState<number | null>(null)
  const handleEnter = async (company: Company) => {
    setEntering(company.id)
    try {
      await enterCompany(company.id)
      // enterCompany recarga la página; no hace falta limpiar el estado.
    } catch (err: any) {
      console.error('Error entering company:', err)
      setError(err.response?.data?.error || 'No se pudo entrar a la empresa')
      setEntering(null)
    }
  }

  const openEditModal = (company: Company) => {
    setSelectedCompany(company)
    setFormData({
      name: company.name || '',
      email: company.email || '',
      phone: company.phone || '',
      document: company.document || '',
      paymentMethod: company.paymentMethod || '',
      status: company.status ?? true,
      planId: company.planId || 1,
      dueDate: company.dueDate?.split('T')[0] || '',
      recurrence: company.recurrence || 'MENSUAL',
      password: '',
      companyUserName: '',
      aiTokenBalance: company.aiTokenBalance || 0,
      activeAISubplanId: company.activeAISubplanId || null,
      emailCreditsTotal: company.emailCreditsTotal || 0,
      activeEmailPlanId: company.activeEmailPlanId || null,
    })
    setEditModalOpen(true)
  }

  const openViewModal = async (company: Company) => {
    try {
      const response = await api.get(`/companies/${company.id}`)
      console.log('Company details:', response.data)
      setSelectedCompany(response.data)
      setViewModalOpen(true)
    } catch (err) {
      console.error('Error fetching company details:', err)
      setSelectedCompany(company)
      setViewModalOpen(true)
    }
  }

  const openDeleteModal = (company: Company) => {
    setSelectedCompany(company)
    setDeleteModalOpen(true)
  }

  const getDaysUntilExpiration = (dueDate: string) => {
    if (!dueDate) return null
    const due = new Date(dueDate)
    const today = new Date()
    const diffTime = due.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  const getExpirationVariant = (dueDate: string): BadgeProps['variant'] => {
    const days = getDaysUntilExpiration(dueDate)
    if (days === null) return 'neutral'
    if (days < 0) return 'destructive'
    if (days <= 7) return 'warning'
    return 'success'
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString('es-ES')
  }

  // Bloques de formulario compartidos entre los modales de crear y editar.
  const planSelect = (
    <div className="space-y-1.5">
      <Label htmlFor="company-plan">Plan</Label>
      <Select
        value={String(formData.planId)}
        onValueChange={(value) => setFormData({ ...formData, planId: Number(value) })}
      >
        <SelectTrigger id="company-plan" className="h-11">
          <SelectValue placeholder="Selecciona un plan" />
        </SelectTrigger>
        <SelectContent>
          {plans.map((plan) => (
            <SelectItem key={plan.id} value={String(plan.id)}>
              {plan.name} - {plan.users} usuarios, {plan.connections} conexiones - ${plan.amount}
            </SelectItem>
          ))}
          {plans.length === 0 && <SelectItem value="1">Plan Básico</SelectItem>}
        </SelectContent>
      </Select>
    </div>
  )

  const recurrenceSelect = (
    <div className="space-y-1.5">
      <Label htmlFor="company-recurrence">Recurrencia</Label>
      <Select
        value={formData.recurrence}
        onValueChange={(value) => setFormData({ ...formData, recurrence: value })}
      >
        <SelectTrigger id="company-recurrence" className="h-11">
          <span className="flex items-center gap-2 truncate">
            <Clock className="size-[18px] shrink-0 text-muted-foreground" aria-hidden />
            <SelectValue placeholder="Selecciona recurrencia" />
          </span>
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
  )

  const dueDateInput = (
    <div className="space-y-1.5">
      <Label htmlFor="company-duedate">Fecha de Vencimiento</Label>
      <DecoratedInput
        id="company-duedate"
        type="date"
        icon={<CalendarBlank className="size-[18px]" />}
        value={formData.dueDate}
        onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
      />
    </div>
  )

  const paymentSelect = (
    <div className="space-y-1.5">
      <Label htmlFor="company-payment">Método de Pago</Label>
      <Select
        value={formData.paymentMethod === '' ? NONE : formData.paymentMethod}
        onValueChange={(value) =>
          setFormData({ ...formData, paymentMethod: value === NONE ? '' : value })
        }
      >
        <SelectTrigger id="company-payment" className="h-11">
          <span className="flex items-center gap-2 truncate">
            <CreditCard className="size-[18px] shrink-0 text-muted-foreground" aria-hidden />
            <SelectValue placeholder="Sin definir" />
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Sin definir</SelectItem>
          <SelectItem value="stripe">Stripe</SelectItem>
          <SelectItem value="paypal">PayPal</SelectItem>
          <SelectItem value="transfer">Transferencia</SelectItem>
          <SelectItem value="cash">Efectivo</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )

  const statusToggle = (
    <div className="flex items-center gap-3">
      <Checkbox
        id="company-status"
        checked={formData.status}
        onCheckedChange={(checked) => setFormData({ ...formData, status: checked })}
      />
      <Label htmlFor="company-status">Estado Activo</Label>
    </div>
  )

  const nameInput = (
    <div className="space-y-1.5">
      <Label htmlFor="company-name">
        Nombre de la Empresa <span className="text-destructive-text">*</span>
      </Label>
      <DecoratedInput
        id="company-name"
        icon={<Buildings className="size-[18px]" />}
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
      />
    </div>
  )

  const emailInput = (
    <div className="space-y-1.5">
      <Label htmlFor="company-email">
        Email <span className="text-destructive-text">*</span>
      </Label>
      <input
        id="company-email"
        type="email"
        className={inputCls}
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
      />
    </div>
  )

  const phoneDocRow = (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <Label htmlFor="company-phone">Teléfono</Label>
        <input
          id="company-phone"
          className={inputCls}
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="company-document">Documento/NIF</Label>
        <input
          id="company-document"
          className={inputCls}
          value={formData.document}
          onChange={(e) => setFormData({ ...formData, document: e.target.value })}
        />
      </div>
    </div>
  )

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Buildings className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Empresas</h1>
              <p className="text-sm text-muted-foreground">
                Gestión de empresas del sistema (Solo Super Admin)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar"
              className="text-muted-foreground"
              onClick={fetchCompanies}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            <Button size="sm" onClick={() => setCreateModalOpen(true)}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nueva Empresa
            </Button>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatTile label="Total Empresas" value={String(stats.total)} />
          <StatTile label="Activas" value={String(stats.active)} tone="success" />
          <StatTile label="Inactivas" value={String(stats.inactive)} tone="neutral" />
          <StatTile label="En Trial" value={String(stats.trial)} tone="warning" />
          <StatTile label="Expiradas" value={String(stats.expired)} tone="destructive" />
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
              aria-label="Buscar empresas por nombre"
              value={searchParam}
              onChange={(e) => setSearchParam(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>
          <p className="text-sm text-muted-foreground">{count} empresas encontradas</p>
        </div>

        {/* Companies Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          {loading ? (
            <div className="flex justify-center py-10">
              <CircularProgress />
            </div>
          ) : companies.length === 0 ? (
            <div className="px-4 py-10 text-center text-muted-foreground">
              No hay empresas registradas
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
                    {companies.map((company) => {
                      const daysLeft = getDaysUntilExpiration(company.dueDate)
                      return (
                        <tr key={company.id} className="transition-colors hover:bg-accent/40">
                          <td className="px-4 py-3 tabular-nums text-muted-foreground">
                            {company.id}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Buildings className="size-5 shrink-0 text-primary" aria-hidden />
                              <span className="font-medium text-foreground">{company.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{company.email || '-'}</td>
                          <td className="px-4 py-3">
                            <Badge variant="primary">
                              {company.plan?.name || `Plan ${company.planId}`}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline">{company.recurrence || 'MENSUAL'}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant={getExpirationVariant(company.dueDate)}>
                                <CalendarBlank className="size-3.5" aria-hidden />
                                {formatDate(company.dueDate)}
                              </Badge>
                              {daysLeft !== null && (
                                <span
                                  className={cn(
                                    'text-xs',
                                    daysLeft < 0
                                      ? 'text-destructive-text'
                                      : daysLeft <= 7
                                        ? 'text-warning-text'
                                        : 'text-success-text',
                                  )}
                                >
                                  {daysLeft < 0
                                    ? `(${Math.abs(daysLeft)}d vencido)`
                                    : `(${daysLeft}d)`}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {company.status ? (
                              <Badge variant="success">
                                <CheckCircle className="size-3.5" weight="fill" aria-hidden />
                                Activa
                              </Badge>
                            ) : (
                              <Badge variant="destructive">
                                <XCircle className="size-3.5" weight="fill" aria-hidden />
                                Inactiva
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-0.5">
                              <ActionBtn
                                label="Ver detalles"
                                onClick={() => openViewModal(company)}
                                className="hover:bg-primary/10 hover:text-primary"
                              >
                                <Eye className="size-[18px]" aria-hidden />
                              </ActionBtn>
                              <ActionBtn
                                label="Editar"
                                onClick={() => openEditModal(company)}
                                className="hover:bg-warning/10 hover:text-warning-text"
                              >
                                <PencilSimple className="size-[18px]" aria-hidden />
                              </ActionBtn>
                              <ActionBtn
                                label={company.status ? 'Suspender' : 'Activar'}
                                onClick={() => handleToggleStatus(company)}
                                className={cn(
                                  company.status
                                    ? 'hover:bg-warning/10 hover:text-warning-text'
                                    : 'hover:bg-success/10 hover:text-success-text',
                                )}
                              >
                                {company.status ? (
                                  <Prohibit className="size-[18px]" aria-hidden />
                                ) : (
                                  <Power className="size-[18px]" aria-hidden />
                                )}
                              </ActionBtn>
                              <ActionBtn
                                label="Entrar a la empresa"
                                onClick={() => handleEnter(company)}
                                className={cn(
                                  'hover:bg-brand-teal/10 hover:text-brand-teal',
                                  entering === company.id && 'pointer-events-none opacity-50',
                                )}
                              >
                                <SignIn className="size-[18px]" aria-hidden />
                              </ActionBtn>
                              <ActionBtn
                                label="Eliminar"
                                onClick={() => openDeleteModal(company)}
                                className="hover:bg-destructive/10 hover:text-destructive-text"
                              >
                                <Trash className="size-[18px]" aria-hidden />
                              </ActionBtn>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
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
              Nueva Empresa
            </DialogTitle>
            <DialogDescription>
              Al crear una empresa se generarán automáticamente: usuario admin, configuraciones,
              colas, tags del kanban, conexión demo de WhatsApp y flujo demo.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div
              role="alert"
              className="rounded-md bg-destructive/12 px-3 py-2 text-sm text-destructive-text"
            >
              {error}
            </div>
          )}

          <Tabs defaultValue="basic">
            <TabsList>
              <TabsTrigger value="basic">Datos Básicos</TabsTrigger>
              <TabsTrigger value="plan">Plan y Facturación</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              {nameInput}

              <div className="space-y-1.5">
                <Label htmlFor="company-username">Nombre del Usuario Admin</Label>
                <DecoratedInput
                  id="company-username"
                  icon={<UserIcon className="size-[18px]" />}
                  value={formData.companyUserName}
                  onChange={(e) => setFormData({ ...formData, companyUserName: e.target.value })}
                  placeholder={formData.name || 'Mismo que nombre de empresa'}
                />
              </div>

              {emailInput}

              <div className="space-y-1.5">
                <Label htmlFor="company-password">
                  Contraseña (para usuario admin) <span className="text-destructive-text">*</span>
                </Label>
                <input
                  id="company-password"
                  type="password"
                  className={inputCls}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Mínimo 5 caracteres"
                />
              </div>

              {phoneDocRow}
              {statusToggle}
            </TabsContent>

            <TabsContent value="plan" className="space-y-4">
              {planSelect}
              {recurrenceSelect}
              {dueDateInput}
              {paymentSelect}
            </TabsContent>
          </Tabs>

          <div className="border-t border-border" />

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
              Crear Empresa
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
              Editar Empresa
            </DialogTitle>
          </DialogHeader>

          {error && (
            <div
              role="alert"
              className="rounded-md bg-destructive/12 px-3 py-2 text-sm text-destructive-text"
            >
              {error}
            </div>
          )}

          <Tabs defaultValue="basic">
            <TabsList>
              <TabsTrigger value="basic">Datos Básicos</TabsTrigger>
              <TabsTrigger value="plan">Plan y Facturación</TabsTrigger>
              <TabsTrigger value="ai">IA y Tokens</TabsTrigger>
              <TabsTrigger value="email">Email Marketing</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              {nameInput}
              {emailInput}
              {phoneDocRow}
              {statusToggle}
            </TabsContent>

            <TabsContent value="plan" className="space-y-4">
              {planSelect}
              {recurrenceSelect}
              {dueDateInput}
              {paymentSelect}
            </TabsContent>

            <TabsContent value="ai" className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="company-ai-tokens">Balance de Tokens de IA</Label>
                <DecoratedInput
                  id="company-ai-tokens"
                  type="number"
                  min={0}
                  icon={<Robot className="size-[18px]" />}
                  value={formData.aiTokenBalance}
                  onChange={(e) =>
                    setFormData({ ...formData, aiTokenBalance: parseInt(e.target.value) || 0 })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="company-ai-subplan">Subplan de IA Activo</Label>
                <div className="flex items-center gap-2">
                  <Select
                    value={
                      formData.activeAISubplanId === null ? NONE : String(formData.activeAISubplanId)
                    }
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        activeAISubplanId: value === NONE ? null : Number(value),
                      })
                    }
                  >
                    <SelectTrigger id="company-ai-subplan" className="h-11 flex-1">
                      <SelectValue placeholder="Sin subplan activo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sin subplan activo</SelectItem>
                      {aiSubplans.map((subplan) => (
                        <SelectItem key={subplan.id} value={String(subplan.id)}>
                          {subplan.name} - {subplan.tokens.toLocaleString()} tokens - $
                          {subplan.priceUsd}
                          {!subplan.isActive && ' (Inactivo)'}
                        </SelectItem>
                      ))}
                      {aiSubplans.length === 0 && (
                        <p className="px-2 py-1.5 text-sm text-muted-foreground">
                          No hay subplanes disponibles
                        </p>
                      )}
                    </SelectContent>
                  </Select>
                  {formData.activeAISubplanId && (
                    <Button
                      variant="outline"
                      onClick={() => setFormData({ ...formData, activeAISubplanId: null })}
                    >
                      Limpiar
                    </Button>
                  )}
                </div>
              </div>

              {formData.activeAISubplanId && (
                <div className="rounded-md bg-primary/12 px-3 py-2 text-sm text-primary">
                  El subplan seleccionado proporcionará tokens adicionales a esta empresa.
                </div>
              )}
            </TabsContent>

            <TabsContent value="email" className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="company-email-credits">Créditos de Email</Label>
                <DecoratedInput
                  id="company-email-credits"
                  type="number"
                  min={0}
                  icon={<EnvelopeSimple className="size-[18px]" />}
                  value={formData.emailCreditsTotal}
                  onChange={(e) =>
                    setFormData({ ...formData, emailCreditsTotal: parseInt(e.target.value) || 0 })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="company-email-plan">Plan de Email Activo</Label>
                <div className="flex items-center gap-2">
                  <Select
                    value={
                      formData.activeEmailPlanId === null ? NONE : String(formData.activeEmailPlanId)
                    }
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        activeEmailPlanId: value === NONE ? null : Number(value),
                      })
                    }
                  >
                    <SelectTrigger id="company-email-plan" className="h-11 flex-1">
                      <SelectValue placeholder="Sin plan de email activo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sin plan de email activo</SelectItem>
                      {emailPlans.map((plan) => (
                        <SelectItem key={plan.id} value={String(plan.id)}>
                          {plan.name} - {plan.emailCreditsPerCycle} créditos - ${plan.price}
                          {!plan.isActive && ' (Inactivo)'}
                        </SelectItem>
                      ))}
                      {emailPlans.length === 0 && (
                        <p className="px-2 py-1.5 text-sm text-muted-foreground">
                          No hay planes de email disponibles
                        </p>
                      )}
                    </SelectContent>
                  </Select>
                  {formData.activeEmailPlanId && (
                    <Button
                      variant="outline"
                      onClick={() => setFormData({ ...formData, activeEmailPlanId: null })}
                    >
                      Limpiar
                    </Button>
                  )}
                </div>
              </div>

              {formData.activeEmailPlanId && (
                <div className="rounded-md bg-success/14 px-3 py-2 text-sm text-success-text">
                  El plan de email seleccionado proporcionará créditos adicionales a esta empresa.
                </div>
              )}
            </TabsContent>
          </Tabs>

          <div className="border-t border-border" />

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
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Buildings className="size-5" weight="fill" aria-hidden />
              Detalles de Empresa
            </DialogTitle>
          </DialogHeader>

          {selectedCompany && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-5">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="ID">{selectedCompany.id}</Field>
                  <Field label="Estado">
                    {selectedCompany.status ? (
                      <Badge variant="success">Activa</Badge>
                    ) : (
                      <Badge variant="destructive">Inactiva</Badge>
                    )}
                  </Field>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Nombre</p>
                    <p className="mt-0.5 text-lg font-semibold text-foreground">
                      {selectedCompany.name}
                    </p>
                  </div>
                  <Field label="Email">{selectedCompany.email || '-'}</Field>
                  <Field label="Teléfono">{selectedCompany.phone || '-'}</Field>
                  <Field label="Documento">{selectedCompany.document || '-'}</Field>
                  <Field label="Método de Pago">{selectedCompany.paymentMethod || '-'}</Field>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-5">
                <h3 className="mb-3 text-sm font-semibold text-foreground">Plan y Facturación</h3>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Plan">
                    <Badge variant="primary">
                      {selectedCompany.plan?.name || `Plan ${selectedCompany.planId}`}
                    </Badge>
                  </Field>
                  <Field label="Recurrencia">{selectedCompany.recurrence || 'MENSUAL'}</Field>
                  <Field label="Vencimiento">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={getExpirationVariant(selectedCompany.dueDate)}>
                        {formatDate(selectedCompany.dueDate)}
                      </Badge>
                      {getDaysUntilExpiration(selectedCompany.dueDate) !== null && (
                        <span className="text-xs text-muted-foreground">
                          ({getDaysUntilExpiration(selectedCompany.dueDate)} días)
                        </span>
                      )}
                    </div>
                  </Field>
                  {selectedCompany.plan && (
                    <>
                      <Field label="Usuarios">{selectedCompany.plan.users}</Field>
                      <Field label="Conexiones">{selectedCompany.plan.connections}</Field>
                      <Field label="Colas">{selectedCompany.plan.queues}</Field>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-5">
                <h3 className="mb-3 text-sm font-semibold text-foreground">Fechas</h3>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Creada">{formatDate(selectedCompany.createdAt)}</Field>
                  <Field label="Última actualización">
                    {formatDate(selectedCompany.updatedAt)}
                  </Field>
                </div>
              </div>

              <DialogFooter className="flex-wrap gap-2">
                <Button variant="outline" onClick={() => setViewModalOpen(false)}>
                  Cerrar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleToggleStatus(selectedCompany)}
                  className={cn(
                    selectedCompany.status
                      ? 'border-warning/40 text-warning-text hover:bg-warning/10'
                      : 'border-success/40 text-success-text hover:bg-success/10',
                  )}
                >
                  {selectedCompany.status ? (
                    <>
                      <Prohibit className="size-4" aria-hidden />
                      Suspender
                    </>
                  ) : (
                    <>
                      <Power className="size-4" aria-hidden />
                      Activar
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => {
                    setViewModalOpen(false)
                    openEditModal(selectedCompany)
                  }}
                >
                  <PencilSimple className="size-4" aria-hidden />
                  Editar
                </Button>
                <Button
                  onClick={() => handleEnter(selectedCompany)}
                  loading={entering === selectedCompany.id}
                  className="bg-brand-teal text-white hover:bg-brand-teal/90"
                >
                  <SignIn className="size-4" aria-hidden />
                  Entrar a la empresa
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteModalOpen} onOpenChange={(open) => !open && setDeleteModalOpen(false)}>
        <DialogContent role="alertdialog" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Warning className="size-5 text-warning-text" weight="fill" aria-hidden />
              Confirmar Eliminación
            </DialogTitle>
          </DialogHeader>

          <div className="border-t border-border" />

          <p className="text-sm text-foreground">
            ¿Estás seguro de que deseas eliminar la empresa{' '}
            <strong className="font-semibold">{selectedCompany?.name}</strong>?
          </p>

          <div
            role="alert"
            className="rounded-md bg-destructive/12 px-3 py-2 text-sm text-destructive-text"
          >
            Esta acción eliminará permanentemente todos los datos asociados: usuarios, tickets,
            contactos, mensajes, conexiones, etc.
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>
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
