import { useState, useEffect, useCallback } from 'react'
// [Fase2·G] CircularProgress se mantiene en MUI Joy a propósito (no hay equivalente
// en el design system Tailwind/Radix). El resto de la pantalla ya está migrado.
import { CircularProgress } from '@mui/joy'
import {
  Package,
  Plus,
  PencilSimple,
  Trash,
  ArrowClockwise,
  FloppyDisk,
  Coins,
  CurrencyDollar,
  Globe,
  Robot,
  X,
} from '@phosphor-icons/react'
import { StatTile } from '@/components/ui/stat-tile'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import api from '../services/api'
import { AxiosResponse } from 'axios'
import { i18n } from "../translate/i18n" // P3.47: i18n support

// P3.44: Helper for development-only logging
const isDev = import.meta.env.DEV;
const devLog = (...args: any[]) => {
  if (isDev) console.log(...args);
};
const devError = (...args: any[]) => {
  if (isDev) console.error(...args);
};

// ─── Switch (toggle accesible con tokens del design system) ────────────────────

function Toggle({
  checked,
  onCheckedChange,
  disabled,
  ariaLabel,
  id,
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  disabled?: boolean
  ariaLabel: string
  id?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer appearance-none items-center rounded-full border-0 p-0 outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-55',
        checked ? 'bg-primary' : 'bg-input',
      )}
    >
      <span
        className={cn(
          'inline-block size-5 transform rounded-full bg-card shadow-sm transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
        aria-hidden
      />
    </button>
  )
}

// Botón de acción de fila (mismo look que RowAction del prototipo, con onClick)
function ActionBtn({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  )
}

const textareaClass =
  'w-full rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'

// COMENTADO: Subplanes ya no están ligados a un proveedor específico
// interface AIProviderConfig {
//   id: number
//   name: string
//   provider: string
//   textGenerationEnabled: boolean
//   translationEnabled: boolean
//   imageGenerationEnabled: boolean
//   imageAnalysisEnabled: boolean
//   speechToTextEnabled: boolean
//   textGenerationPricing: number
//   translationPricing: number
//   imageGenerationPricing: { [key: string]: number }
//   imageAnalysisPricing: number
//   speechToTextPricing: number
// }

interface AISubplan {
  id: number
  companyId: number
  // COMENTADO: aiProviderConfigId: number
  name: string
  description: string
  tokens: number
  maxAgents: number  // Límite de agentes IA para este subplan
  priceUsd: number
  tokensConsumed: number  // Tokens consumidos del subplan
  isActive: boolean
  isPublic: boolean
  stripeProductId?: string
  stripePriceId?: string
  paypalProductId?: string
  paypalPriceId?: string
  createdAt: string
  updatedAt: string
  // COMENTADO: aiProviderConfig?: AIProviderConfig
}

interface FormData {
  // COMENTADO: aiProviderConfigId: number | ''
  name: string
  description: string
  tokens: number
  maxAgents: number
  priceUsd: number
  isActive: boolean
  isPublic: boolean
}

const initialFormData: FormData = {
  // COMENTADO: aiProviderConfigId: '',
  name: '',
  description: '',
  tokens: 10000,
  maxAgents: 3,
  priceUsd: 5,
  isActive: true,
  isPublic: false,
}

export default function AISubplans() {
  const [subplans, setSubplans] = useState<AISubplan[]>([])
  // COMENTADO: Ya no se cargan proveedores
  // const [providers, setProviders] = useState<AIProviderConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false) // P1.19: Loading state for delete
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // P2.25: Pagination state
  const [pageNumber, setPageNumber] = useState(1)
  const [pageSize] = useState(20)
  const [totalPages, setTotalPages] = useState(1)
  const [totalSubplans, setTotalSubplans] = useState(0)

  const [openModal, setOpenModal] = useState(false)
  const [editingSubplan, setEditingSubplan] = useState<AISubplan | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      devLog('[AISubplans] Fetching data...')

      // P2.25: Solo cargar subplanes con paginación
      const subplansRes = await api.get('/ai/subplans', {
        params: { pageNumber, pageSize }
      })
      // COMENTADO: const providersRes = await api.get('/ai/providers')

      // P2.25: Handle paginated response
      if (subplansRes.data.data) {
        devLog('[AISubplans] Subplans loaded:', subplansRes.data.data.length, 'of', subplansRes.data.pagination.total)
        setSubplans(subplansRes.data.data)
        setTotalPages(subplansRes.data.pagination.totalPages)
        setTotalSubplans(subplansRes.data.pagination.total)
      } else {
        // Fallback for non-paginated response
        devLog('[AISubplans] Subplans loaded (no pagination):', subplansRes.data.length)
        setSubplans(subplansRes.data)
      }
      // COMENTADO: setProviders(providersRes.data)
    } catch (err: any) {
      devError('[AISubplans] Error fetching data:', err)
      setError(err.response?.data?.error || i18n.t("aiModules.subplans.toasts.errorLoading"))
    } finally {
      setLoading(false)
    }
  }, [pageNumber, pageSize])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleCreate = () => {
    setEditingSubplan(null)
    setFormData(initialFormData)
    setOpenModal(true)
  }

  const handleEdit = (subplan: AISubplan) => {
    devLog('[AISubplans] Editing subplan:', subplan.id)
    setEditingSubplan(subplan)
    setFormData({
      // COMENTADO: aiProviderConfigId: subplan.aiProviderConfigId,
      name: subplan.name,
      description: subplan.description || '',
      tokens: subplan.tokens,
      maxAgents: subplan.maxAgents || 1,
      priceUsd: subplan.priceUsd,
      isActive: subplan.isActive,
      isPublic: subplan.isPublic,
    })
    setOpenModal(true)
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)

      // Validación comprehensiva
      // 1. Validar nombre
      if (!formData.name || formData.name.trim().length === 0) {
        setError(i18n.t("aiModules.subplans.validation.nameRequired"))
        setSaving(false)
        return
      }

      if (formData.name.length > 100) {
        setError(i18n.t("aiModules.subplans.validation.nameLength"))
        setSaving(false)
        return
      }

      // 2. Validar descripción (opcional pero con límite)
      if (formData.description && formData.description.length > 500) {
        setError(i18n.t("aiModules.subplans.validation.descriptionLength"))
        setSaving(false)
        return
      }

      // 3. Validar tokens
      if (!formData.tokens && formData.tokens !== 0) {
        setError(i18n.t("aiModules.subplans.validation.tokensRequired"))
        setSaving(false)
        return
      }

      const tokensNum = Number(formData.tokens)
      if (isNaN(tokensNum) || !Number.isInteger(tokensNum)) {
        setError(i18n.t("aiModules.subplans.validation.tokensInvalid"))
        setSaving(false)
        return
      }

      if (tokensNum < 0) {
        setError(i18n.t("aiModules.subplans.validation.tokensMin"))
        setSaving(false)
        return
      }

      if (tokensNum > 1000000) {
        setError(i18n.t("aiModules.subplans.validation.tokensMax"))
        setSaving(false)
        return
      }

      // 4. Validar precio
      const priceNum = Number(formData.priceUsd)
      if (isNaN(priceNum)) {
        setError(i18n.t("aiModules.subplans.validation.priceInvalid"))
        setSaving(false)
        return
      }

      if (priceNum < 0) {
        setError(i18n.t("aiModules.subplans.validation.priceMin"))
        setSaving(false)
        return
      }

      if (priceNum > 100000) {
        setError(i18n.t("aiModules.subplans.validation.priceMax"))
        setSaving(false)
        return
      }

      // Validar decimales del precio (máximo 2 decimales)
      if (!Number.isInteger(priceNum * 100)) {
        setError(i18n.t("aiModules.subplans.validation.priceDecimals"))
        setSaving(false)
        return
      }

      const payload = {
        ...formData,
        tokens: Number(formData.tokens),
        maxAgents: Number(formData.maxAgents),
        priceUsd: Number(formData.priceUsd),
      }

      let response: AxiosResponse<AISubplan>
      if (editingSubplan) {
        devLog('[AISubplans] Updating subplan:', editingSubplan.id)
        response = await api.put(`/ai/subplans/${editingSubplan.id}`, payload)
        setSuccess(i18n.t("aiModules.subplans.toasts.updateSuccess"))

        // P2.24 + P2.25: Update state with response instead of refetching
        setSubplans(prev => prev.map(s => s.id === editingSubplan.id ? response.data : s))
      } else {
        devLog('[AISubplans] Creating new subplan')
        response = await api.post('/ai/subplans', payload)
        setSuccess(i18n.t("aiModules.subplans.toasts.createSuccess"))

        // P2.25: For new items, go to page 1 and refetch (new items appear first)
        if (pageNumber !== 1) {
          setPageNumber(1)
        } else {
          // Already on page 1, just refetch
          fetchData()
        }
      }

      setOpenModal(false)
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      devError('[AISubplans] Error saving subplan:', err)
      setError(err.response?.data?.error || i18n.t("aiModules.subplans.toasts.errorSaving"))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      setDeleting(true) // P1.19: Set loading state
      devLog('[AISubplans] Deleting subplan:', id)
      await api.delete(`/ai/subplans/${id}`)
      setSuccess(i18n.t("aiModules.subplans.toasts.deleteSuccess"))
      setDeleteConfirm(null)
      fetchData()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      devError('[AISubplans] Error deleting subplan:', err)
      setError(err.response?.data?.error || i18n.t("aiModules.subplans.toasts.errorDeleting"))
    } finally {
      setDeleting(false) // P1.19: Clear loading state
    }
  }

  // COMENTADO: Ya no se usa proveedor seleccionado
  // const selectedProvider = providers.find(p => p.id === formData.aiProviderConfigId)

  // COMENTADO: Ya no se calcula capacidad basada en proveedor
  // const calculateCapacity = (tokens: number, provider?: AIProviderConfig) => { ... }

  const formatNumber = (num: number | string) => {
    return Number(num).toLocaleString()
  }

  const formatCurrency = (num: number | string) => {
    return `$${Number(num).toFixed(2)}`
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <CircularProgress size="lg" />
      </div>
    )
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
                {i18n.t("aiModules.subplans.title")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {i18n.t("aiModules.subplans.description")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <ArrowClockwise className="size-4" aria-hidden />
              {i18n.t("aiModules.subplans.buttons.reload")}
            </Button>
            <Button size="sm" onClick={handleCreate}>
              <Plus className="size-4" weight="bold" aria-hidden />
              {i18n.t("aiModules.subplans.buttons.new")}
            </Button>
          </div>
        </div>

        {/* Alertas */}
        {error && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/12 px-4 py-3 text-sm text-destructive-text"
          >
            <span>{error}</span>
            <ActionBtn
              label={i18n.t("aiModules.subplans.buttons.cancel")}
              onClick={() => setError(null)}
              className="-my-0.5 shrink-0 text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
            >
              <X className="size-4" aria-hidden />
            </ActionBtn>
          </div>
        )}

        {success && (
          <div
            role="status"
            className="flex items-start justify-between gap-3 rounded-lg border border-success/30 bg-success/14 px-4 py-3 text-sm text-success-text"
          >
            <span>{success}</span>
            <ActionBtn
              label={i18n.t("aiModules.subplans.buttons.cancel")}
              onClick={() => setSuccess(null)}
              className="-my-0.5 shrink-0 text-success-text hover:bg-success/10 hover:text-success-text"
            >
              <X className="size-4" aria-hidden />
            </ActionBtn>
          </div>
        )}

        {/* Resumen */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            label={i18n.t("aiModules.subplans.stats.total")}
            value={String(subplans.length)}
          />
          <StatTile
            label={i18n.t("aiModules.subplans.stats.active")}
            value={String(subplans.filter(s => s.isActive).length)}
            tone="success"
          />
          <StatTile
            label={i18n.t("aiModules.subplans.stats.public")}
            value={String(subplans.filter(s => s.isPublic).length)}
            tone="primary"
          />
          <StatTile
            label={i18n.t("aiModules.subplans.stats.totalTokens")}
            value={formatNumber(subplans.reduce((acc, s) => acc + Number(s.tokens || 0), 0))}
          />
        </div>

        {/* Lista de Subplanes */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3.5">
            <Coins className="size-5 text-muted-foreground" aria-hidden />
            <h2 className="text-base font-semibold text-foreground">
              {i18n.t("aiModules.subplans.table.title")}
            </h2>
          </div>

          {/* COMENTADO: Ya no se requiere validación de proveedores */}

          {subplans.length === 0 ? (
            <div className="flex flex-col items-center gap-4 px-4 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                {i18n.t("aiModules.subplans.table.empty")}
              </p>
              <Button size="sm" onClick={handleCreate}>
                <Plus className="size-4" weight="bold" aria-hidden />
                {i18n.t("aiModules.subplans.buttons.createFirst")}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    <th className="w-[200px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {i18n.t("aiModules.subplans.table.name")}
                    </th>
                    {/* COMENTADO: <th>Proveedor</th> */}
                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {i18n.t("aiModules.subplans.table.tokens")}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Agentes
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {i18n.t("aiModules.subplans.table.used")}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {i18n.t("aiModules.subplans.table.remaining")}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {i18n.t("aiModules.subplans.table.price")}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {i18n.t("aiModules.subplans.table.active")}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {i18n.t("aiModules.subplans.table.public")}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {i18n.t("aiModules.subplans.table.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {subplans.map((subplan) => (
                    <tr key={subplan.id} className="transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-foreground">{subplan.name}</p>
                          {subplan.description && (
                            <p className="text-xs text-muted-foreground">
                              {subplan.description.substring(0, 50)}{subplan.description.length > 50 ? '...' : ''}
                            </p>
                          )}
                        </div>
                      </td>
                      {/* COMENTADO: Columna de proveedor */}
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
                        {formatNumber(subplan.tokens)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Badge variant="primary">{subplan.maxAgents || 1}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatNumber(subplan.tokensConsumed || 0)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-success-text">
                        {formatNumber((subplan.tokens || 0) - (subplan.tokensConsumed || 0))}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-success-text">
                        {formatCurrency(subplan.priceUsd)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={subplan.isActive ? 'success' : 'neutral'} dot>
                          {subplan.isActive ? i18n.t("aiModules.subplans.table.yes") : i18n.t("aiModules.subplans.table.no")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={subplan.isPublic ? 'primary' : 'neutral'}>
                          {subplan.isPublic && <Globe className="size-3.5" aria-hidden />}
                          {subplan.isPublic ? i18n.t("aiModules.subplans.table.yes") : i18n.t("aiModules.subplans.table.no")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-0.5">
                          <ActionBtn label="Editar" onClick={() => handleEdit(subplan)}>
                            <PencilSimple className="size-[18px]" aria-hidden />
                          </ActionBtn>
                          <ActionBtn
                            label="Eliminar"
                            onClick={() => setDeleteConfirm(subplan.id)}
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

          {/* P2.25: Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
              <p className="text-sm text-muted-foreground">
                {i18n.t("aiModules.subplans.pagination.showing", { current: subplans.length, total: totalSubplans })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pageNumber === 1}
                  onClick={() => setPageNumber(prev => Math.max(1, prev - 1))}
                >
                  {i18n.t("aiModules.subplans.pagination.previous")}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {i18n.t("aiModules.subplans.pagination.page", { current: pageNumber, total: totalPages })}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pageNumber >= totalPages}
                  onClick={() => setPageNumber(prev => Math.min(totalPages, prev + 1))}
                >
                  {i18n.t("aiModules.subplans.pagination.next")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Crear/Editar */}
      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingSubplan ? i18n.t("aiModules.subplans.modal.titleEdit") : i18n.t("aiModules.subplans.modal.titleCreate")}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {/* COMENTADO: Ya no se selecciona proveedor en el subplan */}

            <div className="space-y-1.5">
              <Label htmlFor="subplan-name">{i18n.t("aiModules.subplans.modal.nameLabel")}</Label>
              <Input
                id="subplan-name"
                required
                placeholder={i18n.t("aiModules.subplans.modal.namePlaceholder")}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="subplan-description">{i18n.t("aiModules.subplans.modal.descriptionLabel")}</Label>
              <textarea
                id="subplan-description"
                placeholder={i18n.t("aiModules.subplans.modal.descriptionPlaceholder")}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
                className={textareaClass}
              />
            </div>

            <div className="border-t border-border" />
            <h3 className="text-sm font-semibold text-foreground">
              {i18n.t("aiModules.subplans.modal.tokensSection")}
            </h3>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="subplan-tokens">{i18n.t("aiModules.subplans.modal.tokensLabel")}</Label>
                <Input
                  id="subplan-tokens"
                  required
                  type="number"
                  min={0}
                  leftIcon={<Coins aria-hidden />}
                  value={formData.tokens}
                  onChange={(e) => setFormData({ ...formData, tokens: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="subplan-max-agents">
                  {i18n.t("aiModules.subplans.modal.maxAgentsLabel") || "Límite de Agentes IA"}
                </Label>
                <Input
                  id="subplan-max-agents"
                  required
                  type="number"
                  min={1}
                  max={100}
                  leftIcon={<Robot aria-hidden />}
                  value={formData.maxAgents}
                  onChange={(e) => setFormData({ ...formData, maxAgents: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="subplan-price">{i18n.t("aiModules.subplans.modal.priceLabel")}</Label>
                <Input
                  id="subplan-price"
                  required
                  type="number"
                  min={0}
                  step={0.01}
                  leftIcon={<CurrencyDollar aria-hidden />}
                  value={formData.priceUsd}
                  onChange={(e) => setFormData({ ...formData, priceUsd: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            {/* COMENTADO: Ya no se calcula capacidad basada en proveedor */}

            <div className="border-t border-border" />
            <h3 className="text-sm font-semibold text-foreground">
              {i18n.t("aiModules.subplans.modal.optionsSection")}
            </h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div>
                  <Label htmlFor="subplan-active">{i18n.t("aiModules.subplans.modal.activeLabel")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {i18n.t("aiModules.subplans.modal.activeHelper")}
                  </p>
                </div>
                <Toggle
                  id="subplan-active"
                  ariaLabel={i18n.t("aiModules.subplans.modal.activeLabel")}
                  checked={formData.isActive}
                  onCheckedChange={(v) => setFormData({ ...formData, isActive: v })}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div>
                  <Label htmlFor="subplan-public">{i18n.t("aiModules.subplans.modal.publicLabel")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {i18n.t("aiModules.subplans.modal.publicHelper")}
                  </p>
                </div>
                <Toggle
                  id="subplan-public"
                  ariaLabel={i18n.t("aiModules.subplans.modal.publicLabel")}
                  checked={formData.isPublic}
                  onCheckedChange={(v) => setFormData({ ...formData, isPublic: v })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpenModal(false)}>
              {i18n.t("aiModules.subplans.buttons.cancel")}
            </Button>
            <Button size="sm" onClick={handleSave} loading={saving}>
              {!saving && <FloppyDisk className="size-4" aria-hidden />}
              {editingSubplan ? i18n.t("aiModules.subplans.buttons.save") : i18n.t("aiModules.subplans.buttons.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmar Eliminacion */}
      <Dialog open={deleteConfirm !== null} onOpenChange={(open) => { if (!open) setDeleteConfirm(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{i18n.t("aiModules.subplans.delete.title")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {i18n.t("aiModules.subplans.delete.message")}
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteConfirm(null)}
              disabled={deleting}
            >
              {i18n.t("aiModules.subplans.buttons.cancel")}
            </Button>
            <Button
              size="sm"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              loading={deleting}
              disabled={deleting}
            >
              <Trash className="size-4" aria-hidden />
              {i18n.t("aiModules.subplans.buttons.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
