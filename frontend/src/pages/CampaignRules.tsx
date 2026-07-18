/**
 * CampaignRules.tsx
 *
 * Motor de Reglas Automatizadas para Meta Ads.
 * Permite crear, gestionar y monitorear reglas que evalúan
 * métricas de campañas y ejecutan acciones automáticas.
 */

import { useState, useEffect, useCallback, forwardRef } from 'react'
// [Re-skin Tailwind v4] Sólo se conserva de MUI Joy el indicador de progreso
// (CircularProgress), que no tiene equivalente en el design system.
import { CircularProgress } from '@mui/joy'
import {
  Sparkle,
  Plus,
  PencilSimple,
  Trash,
  ArrowClockwise,
  X,
  Play,
  Pause,
  ClockCounterClockwise,
  Bug,
  WarningCircle,
  BellRinging,
} from '@phosphor-icons/react'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import api from '../services/api'

// ============================================================
// TIPOS
// ============================================================

interface RuleCondition {
  metric: string
  operator: string
  value: number
  value2?: number
  timeRange: string
  logic?: 'AND' | 'OR'
}

interface RuleAction {
  type: string
  params?: {
    direction?: 'increase' | 'decrease'
    amount?: number
    unit?: 'percent' | 'absolute'
    message?: string
  }
}

interface CampaignRule {
  id: number
  name: string
  description: string
  scope: 'account' | 'campaign' | 'adset' | 'ad'
  scopeIds: string[] | null
  conditions: RuleCondition[]
  actions: RuleAction[]
  notificationPhones: string[] | null
  frequency: string
  cooldownMinutes: number
  status: 'active' | 'paused' | 'error'
  lastExecutedAt: string | null
  lastTriggeredAt: string | null
  executionCount: number
  triggerCount: number
  consecutiveErrors: number
  createdAt: string
}

interface RuleLog {
  id: number
  campaignId: string
  campaignName: string
  conditionsMet: boolean
  metricsSnapshot: Record<string, number>
  actionsTaken: Array<{ type: string; result: string; details?: string }>
  result: 'success' | 'failed' | 'skipped' | 'cooldown'
  error: string | null
  notificationsSent: number
  executedAt: string
}

interface MetricOption { key: string; label: string; unit: string }
interface OperatorOption { key: string; label: string }
interface TimeRangeOption { key: string; label: string }
interface Template {
  id: string
  name: string
  description: string
  conditions: RuleCondition[]
  actions: RuleAction[]
  scope: string
  frequency: string
  cooldownMinutes: number
}

// ============================================================
// HELPERS
// ============================================================

const FREQUENCY_LABELS: Record<string, string> = {
  every_15min: 'Cada 15 min',
  every_30min: 'Cada 30 min',
  hourly: 'Cada hora',
  every_6h: 'Cada 6 horas',
  daily: 'Diario',
}

const SCOPE_LABELS: Record<string, string> = {
  account: 'Cuenta',
  campaign: 'Campaña',
  adset: 'Conjunto de anuncios',
  ad: 'Anuncio',
}

const STATUS_CONFIG: Record<string, { variant: BadgeProps['variant']; label: string }> = {
  active: { variant: 'success', label: 'Activa' },
  paused: { variant: 'warning', label: 'Pausada' },
  error: { variant: 'destructive', label: 'Error' },
}

const RESULT_CONFIG: Record<string, { variant: BadgeProps['variant']; icon: string }> = {
  success: { variant: 'success', icon: '✅' },
  failed: { variant: 'destructive', icon: '❌' },
  skipped: { variant: 'neutral', icon: '⏭️' },
  cooldown: { variant: 'warning', icon: '⏱️' },
}

const ACTION_LABELS: Record<string, string> = {
  pause: 'Pausar campaña',
  activate: 'Activar campaña',
  adjust_budget: 'Ajustar presupuesto',
  notify_whatsapp: 'Notificar WhatsApp',
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Nunca'
  const d = new Date(dateStr)
  return d.toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `hace ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours}h`
  return `hace ${Math.floor(hours / 24)}d`
}

// ============================================================
// PRIMITIVAS LOCALES DEL DESIGN SYSTEM
// ============================================================

const inputCls =
  'h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'
const rowInputCls =
  'h-9 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'

// Toggle accesible (role=switch) con tokens del design system — no hay wrapper Switch en @/components/ui.
function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: () => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-55',
        checked ? 'bg-primary' : 'bg-input',
      )}
    >
      <span
        className={cn(
          'inline-block size-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
        aria-hidden
      />
    </button>
  )
}

// Botón de acción de fila (mismo look que RowAction del DS, con onClick).
// forwardRef + ...props: <Tooltip> (Radix, asChild) inyecta ref y handlers en el
// hijo; si no se propagan, el tooltip no se ancla ni se abre.
const ActionBtn = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }
>(({ label, className, children, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-label={label}
    className={cn(
      'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
      className,
    )}
    {...props}
  >
    {children}
  </button>
))
ActionBtn.displayName = 'ActionBtn'

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export default function CampaignRules() {
  // Estados principales
  const [rules, setRules] = useState<CampaignRule[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Metadata de métricas y operadores (cargados desde /templates)
  const [metrics, setMetrics] = useState<MetricOption[]>([])
  const [operators, setOperators] = useState<OperatorOption[]>([])
  const [timeRanges, setTimeRanges] = useState<TimeRangeOption[]>([])
  const [templates, setTemplates] = useState<Template[]>([])

  // Modales
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showLogsModal, setShowLogsModal] = useState(false)
  const [showTemplatesPanel, setShowTemplatesPanel] = useState(false)
  const [showTestModal, setShowTestModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  // Regla seleccionada
  const [selectedRule, setSelectedRule] = useState<CampaignRule | null>(null)

  // Logs
  const [logs, setLogs] = useState<RuleLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  // Test/dry run
  const [testResults, setTestResults] = useState<{
    results: Array<{
      campaignId: string
      campaignName: string
      metrics: Record<string, number>
      conditionsMet: boolean
      wouldExecute: RuleAction[]
    }>
  } | null>(null)
  const [testLoading, setTestLoading] = useState(false)

  // Formulario de creación/edición
  const [form, setForm] = useState({
    name: '',
    description: '',
    scope: 'campaign',
    frequency: 'hourly',
    cooldownMinutes: 60,
    conditions: [{ metric: 'spend', operator: '>', value: 0, timeRange: 'last_7_days', logic: 'AND' as const }] as RuleCondition[],
    actions: [{ type: 'notify_whatsapp', params: { message: '⚡ Regla activada en {{campaignName}}' } }] as RuleAction[],
    notificationPhones: [] as string[],
    newPhone: '',
  })
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  // ---- Carga inicial ----
  const loadRules = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await api.get('/meta-marketing/rules')
      const data = res.data.data
      setRules(data.rules || [])
      setTotal(data.total || 0)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error cargando reglas')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadTemplates = useCallback(async () => {
    try {
      const res = await api.get('/meta-marketing/rules/templates')
      const data = res.data.data
      setTemplates(data.templates || [])
      setMetrics(data.metrics || [])
      setOperators(data.operators || [])
      setTimeRanges(data.timeRanges || [])
    } catch (err: any) {
      console.error('Error cargando templates:', err.message)
    }
  }, [])

  useEffect(() => {
    loadRules()
    loadTemplates()
  }, [loadRules, loadTemplates])

  // ---- Acciones ----
  const handleToggleStatus = async (rule: CampaignRule) => {
    try {
      const endpoint = rule.status === 'active'
        ? `/meta-marketing/rules/${rule.id}/pause`
        : `/meta-marketing/rules/${rule.id}/activate`
      await api.put(endpoint)
      await loadRules()
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error cambiando estado')
    }
  }

  const handleDelete = async () => {
    if (!selectedRule) return
    try {
      await api.delete(`/meta-marketing/rules/${selectedRule.id}`)
      setShowDeleteModal(false)
      setSelectedRule(null)
      await loadRules()
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error eliminando regla')
    }
  }

  const handleOpenLogs = async (rule: CampaignRule) => {
    setSelectedRule(rule)
    setShowLogsModal(true)
    setLogsLoading(true)
    try {
      const res = await api.get(`/meta-marketing/rules/${rule.id}/logs`)
      setLogs(res.data.data.logs || [])
    } catch (err: any) {
      setLogs([])
    } finally {
      setLogsLoading(false)
    }
  }

  const handleTest = async (rule: CampaignRule) => {
    setSelectedRule(rule)
    setShowTestModal(true)
    setTestLoading(true)
    setTestResults(null)
    try {
      const res = await api.post(`/meta-marketing/rules/${rule.id}/test`)
      setTestResults(res.data.data)
    } catch (err: any) {
      setTestResults(null)
    } finally {
      setTestLoading(false)
    }
  }

  const handleEdit = (rule: CampaignRule) => {
    setSelectedRule(rule)
    setIsEditing(true)
    setForm({
      name: rule.name,
      description: rule.description || '',
      scope: rule.scope,
      frequency: rule.frequency,
      cooldownMinutes: rule.cooldownMinutes,
      conditions: [...rule.conditions],
      actions: [...rule.actions],
      notificationPhones: rule.notificationPhones ? [...rule.notificationPhones] : [],
      newPhone: '',
    })
    setFormError(null)
    setShowCreateModal(true)
  }

  const handleOpenCreate = () => {
    setSelectedRule(null)
    setIsEditing(false)
    setForm({
      name: '',
      description: '',
      scope: 'campaign',
      frequency: 'hourly',
      cooldownMinutes: 60,
      conditions: [{ metric: 'spend', operator: '>', value: 0, timeRange: 'last_7_days', logic: 'AND' }],
      actions: [{ type: 'notify_whatsapp', params: { message: '⚡ Regla activada en {{campaignName}}' } }],
      notificationPhones: [],
      newPhone: '',
    })
    setFormError(null)
    setShowCreateModal(true)
  }

  const handleUseTemplate = (template: Template) => {
    setForm({
      name: template.name,
      description: template.description,
      scope: template.scope,
      frequency: template.frequency,
      cooldownMinutes: template.cooldownMinutes,
      conditions: [...template.conditions],
      actions: [...template.actions],
      notificationPhones: [],
      newPhone: '',
    })
    setIsEditing(false)
    setSelectedRule(null)
    setFormError(null)
    setShowTemplatesPanel(false)
    setShowCreateModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError('El nombre es obligatorio')
      return
    }
    if (form.conditions.length === 0) {
      setFormError('Agrega al menos una condición')
      return
    }
    if (form.actions.length === 0) {
      setFormError('Agrega al menos una acción')
      return
    }

    setFormLoading(true)
    setFormError(null)
    try {
      const payload = {
        name: form.name,
        description: form.description,
        scope: form.scope,
        frequency: form.frequency,
        cooldownMinutes: Number(form.cooldownMinutes),
        conditions: form.conditions,
        actions: form.actions,
        notificationPhones: form.notificationPhones.length > 0 ? form.notificationPhones : null,
      }

      if (isEditing && selectedRule) {
        await api.put(`/meta-marketing/rules/${selectedRule.id}`, payload)
      } else {
        await api.post('/meta-marketing/rules', payload)
      }

      setShowCreateModal(false)
      await loadRules()
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Error guardando regla')
    } finally {
      setFormLoading(false)
    }
  }

  // ---- Manejo de condiciones ----
  const addCondition = () => {
    setForm(f => ({
      ...f,
      conditions: [...f.conditions, { metric: 'spend', operator: '>', value: 0, timeRange: 'last_7_days', logic: 'AND' }]
    }))
  }

  const removeCondition = (idx: number) => {
    setForm(f => ({ ...f, conditions: f.conditions.filter((_, i) => i !== idx) }))
  }

  const updateCondition = (idx: number, field: string, value: unknown) => {
    setForm(f => ({
      ...f,
      conditions: f.conditions.map((c, i) => i === idx ? { ...c, [field]: value } : c)
    }))
  }

  // ---- Manejo de acciones ----
  const addAction = () => {
    setForm(f => ({
      ...f,
      actions: [...f.actions, { type: 'notify_whatsapp', params: { message: '' } }]
    }))
  }

  const removeAction = (idx: number) => {
    setForm(f => ({ ...f, actions: f.actions.filter((_, i) => i !== idx) }))
  }

  const updateAction = (idx: number, field: string, value: unknown) => {
    setForm(f => ({
      ...f,
      actions: f.actions.map((a, i) => {
        if (i !== idx) return a
        if (field === 'type') return { type: value as string, params: {} }
        if (field.startsWith('params.')) {
          const paramKey = field.replace('params.', '')
          return { ...a, params: { ...(a.params || {}), [paramKey]: value } }
        }
        return { ...a, [field]: value }
      })
    }))
  }

  // ---- Manejo de teléfonos ----
  const addPhone = () => {
    const phone = form.newPhone.trim()
    if (!phone) return
    setForm(f => ({ ...f, notificationPhones: [...f.notificationPhones, phone], newPhone: '' }))
  }

  const removePhone = (idx: number) => {
    setForm(f => ({ ...f, notificationPhones: f.notificationPhones.filter((_, i) => i !== idx) }))
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <TooltipProvider>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
                <Sparkle className="size-6" weight="fill" aria-hidden />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Reglas Automatizadas
                </h1>
                <p className="text-sm text-muted-foreground">
                  Automatiza acciones en tus campañas Meta Ads según métricas de rendimiento
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowTemplatesPanel(true)}>
                <Sparkle className="size-4" aria-hidden />
                Templates
              </Button>
              <Button size="sm" onClick={handleOpenCreate}>
                <Plus className="size-4" weight="bold" aria-hidden />
                Crear Regla
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Actualizar"
                className="text-muted-foreground"
                onClick={loadRules}
                disabled={loading}
              >
                <ArrowClockwise className={cn('size-5', loading && 'animate-spin')} aria-hidden />
              </Button>
            </div>
          </div>

          {/* Error global */}
          {error && (
            <div
              role="alert"
              className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text"
            >
              <span className="flex items-center gap-2">
                <WarningCircle className="size-[18px] shrink-0" aria-hidden />
                {error}
              </span>
              <button
                type="button"
                aria-label="Cerrar alerta"
                onClick={() => setError(null)}
                className="flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-destructive/15"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          )}

          {/* Tabla de reglas */}
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
            {loading ? (
              <div className="flex justify-center py-10">
                <CircularProgress />
              </div>
            ) : rules.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Sparkle className="mx-auto size-12 text-muted-foreground" aria-hidden />
                <h2 className="mt-3 text-lg font-semibold text-foreground">Sin reglas configuradas</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Crea tu primera regla o usa un template pre-configurado
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  <Button size="sm" onClick={handleOpenCreate}>
                    <Plus className="size-4" weight="bold" aria-hidden />
                    Crear Regla
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowTemplatesPanel(true)}>
                    <Sparkle className="size-4" aria-hidden />
                    Ver Templates
                  </Button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left">
                      <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nombre</th>
                      <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scope</th>
                      <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Frecuencia</th>
                      <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado</th>
                      <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Último trigger</th>
                      <th className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Triggers</th>
                      <th className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rules.map(rule => (
                      <tr key={rule.id} className="transition-colors hover:bg-accent/40">
                        <td className="px-4 py-3 align-top">
                          <div className="max-w-[220px] space-y-1">
                            <p className="font-medium text-foreground">{rule.name}</p>
                            {rule.description && (
                              <p className="truncate text-xs text-muted-foreground">
                                {rule.description}
                              </p>
                            )}
                            {rule.status === 'error' && (
                              <Badge variant="destructive">
                                <WarningCircle className="size-3" aria-hidden />
                                {rule.consecutiveErrors} errores
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <Badge variant="neutral">
                            {SCOPE_LABELS[rule.scope] || rule.scope}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top text-muted-foreground">
                          {FREQUENCY_LABELS[rule.frequency] || rule.frequency}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-center gap-2">
                            <Badge variant={STATUS_CONFIG[rule.status]?.variant || 'neutral'}>
                              {STATUS_CONFIG[rule.status]?.label || rule.status}
                            </Badge>
                            <Toggle
                              checked={rule.status === 'active'}
                              onChange={() => handleToggleStatus(rule)}
                              disabled={rule.status === 'error'}
                              label={rule.status === 'active' ? 'Pausar regla' : 'Activar regla'}
                            />
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top">
                          <Tooltip title={formatDate(rule.lastTriggeredAt)}>
                            <span className="text-xs text-muted-foreground">
                              {formatRelative(rule.lastTriggeredAt)}
                            </span>
                          </Tooltip>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
                            <BellRinging className="size-[18px]" aria-hidden />
                            <span className="tabular-nums text-xs font-medium">
                              {rule.triggerCount > 999 ? '999+' : rule.triggerCount}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-center justify-center gap-0.5">
                            <Tooltip title="Editar">
                              <ActionBtn label="Editar" onClick={() => handleEdit(rule)}>
                                <PencilSimple className="size-[18px]" aria-hidden />
                              </ActionBtn>
                            </Tooltip>
                            <Tooltip title="Simular (dry run)">
                              <ActionBtn label="Simular (dry run)" onClick={() => handleTest(rule)}>
                                <Bug className="size-[18px]" aria-hidden />
                              </ActionBtn>
                            </Tooltip>
                            <Tooltip title="Ver historial">
                              <ActionBtn label="Ver historial" onClick={() => handleOpenLogs(rule)}>
                                <ClockCounterClockwise className="size-[18px]" aria-hidden />
                              </ActionBtn>
                            </Tooltip>
                            <Tooltip title={rule.status === 'active' ? 'Pausar' : 'Activar'}>
                              <ActionBtn
                                label={rule.status === 'active' ? 'Pausar' : 'Activar'}
                                onClick={() => handleToggleStatus(rule)}
                                className={
                                  rule.status === 'active'
                                    ? 'text-warning-text hover:bg-warning/10 hover:text-warning-text'
                                    : 'text-success-text hover:bg-success/10 hover:text-success-text'
                                }
                              >
                                {rule.status === 'active'
                                  ? <Pause className="size-[18px]" aria-hidden />
                                  : <Play className="size-[18px]" aria-hidden />}
                              </ActionBtn>
                            </Tooltip>
                            <Tooltip title="Eliminar">
                              <ActionBtn
                                label="Eliminar"
                                onClick={() => { setSelectedRule(rule); setShowDeleteModal(true) }}
                                className="hover:bg-destructive/10 hover:text-destructive-text"
                              >
                                <Trash className="size-[18px]" aria-hidden />
                              </ActionBtn>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {total > 0 && (
            <p className="text-xs text-muted-foreground">
              Total: {total} regla{total !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* ============================================================
            MODAL: Crear / Editar Regla
            ============================================================ */}
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent className="max-w-[720px]">
            <DialogHeader>
              <DialogTitle>
                {isEditing ? '✏️ Editar Regla' : '➕ Nueva Regla Automatizada'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {formError && (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text"
                >
                  {formError}
                </div>
              )}

              {/* Datos básicos */}
              <div className="space-y-1.5">
                <Label htmlFor="rule-name">Nombre</Label>
                <input
                  id="rule-name"
                  required
                  placeholder="Ej: Pausar campaña con CPA alto"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className={inputCls}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rule-description">Descripción</Label>
                <textarea
                  id="rule-description"
                  rows={2}
                  placeholder="Descripción opcional de la regla..."
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className={cn(inputCls, 'h-auto py-2.5 leading-relaxed')}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="rule-scope">Scope</Label>
                  <Select
                    value={form.scope}
                    onValueChange={v => setForm(f => ({ ...f, scope: v }))}
                  >
                    <SelectTrigger id="rule-scope" className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="campaign">Campaña</SelectItem>
                      <SelectItem value="adset">Conjunto de anuncios</SelectItem>
                      <SelectItem value="ad">Anuncio</SelectItem>
                      <SelectItem value="account">Cuenta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="rule-frequency">Frecuencia de evaluación</Label>
                  <Select
                    value={form.frequency}
                    onValueChange={v => setForm(f => ({ ...f, frequency: v }))}
                  >
                    <SelectTrigger id="rule-frequency" className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="every_15min">Cada 15 minutos</SelectItem>
                      <SelectItem value="every_30min">Cada 30 minutos</SelectItem>
                      <SelectItem value="hourly">Cada hora</SelectItem>
                      <SelectItem value="every_6h">Cada 6 horas</SelectItem>
                      <SelectItem value="daily">Diario</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 sm:col-span-1">
                  <Label htmlFor="rule-cooldown">Cooldown (min)</Label>
                  <input
                    id="rule-cooldown"
                    type="number"
                    min={1}
                    value={form.cooldownMinutes}
                    onChange={e => setForm(f => ({ ...f, cooldownMinutes: Number(e.target.value) }))}
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="border-t border-border" />

              {/* Condiciones */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">🔍 Condiciones</h3>
                  <Button variant="outline" size="sm" onClick={addCondition}>
                    <Plus className="size-4" weight="bold" aria-hidden />
                    Agregar condición
                  </Button>
                </div>

                <div className="space-y-2">
                  {form.conditions.map((cond, idx) => (
                    <div key={idx} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {idx > 0 && (
                          <Select
                            value={cond.logic || 'AND'}
                            onValueChange={v => updateCondition(idx, 'logic', v)}
                          >
                            <SelectTrigger className="w-[70px] flex-none" aria-label="Operador lógico">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="AND">Y</SelectItem>
                              <SelectItem value="OR">O</SelectItem>
                            </SelectContent>
                          </Select>
                        )}

                        <Select
                          value={cond.metric}
                          onValueChange={v => updateCondition(idx, 'metric', v)}
                        >
                          <SelectTrigger className="min-w-[160px] flex-[2]" aria-label="Métrica">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {metrics.length > 0 ? metrics.map(m => (
                              <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                            )) : (
                              <>
                                <SelectItem value="spend">Gasto (Spend)</SelectItem>
                                <SelectItem value="ctr">CTR (%)</SelectItem>
                                <SelectItem value="cpc">CPC ($)</SelectItem>
                                <SelectItem value="cpm">CPM ($)</SelectItem>
                                <SelectItem value="roas">ROAS</SelectItem>
                                <SelectItem value="frequency">Frecuencia</SelectItem>
                                <SelectItem value="impressions">Impresiones</SelectItem>
                                <SelectItem value="conversions">Conversiones</SelectItem>
                                <SelectItem value="cost_per_conversion">CPA ($)</SelectItem>
                                <SelectItem value="reach">Alcance</SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>

                        <Select
                          value={cond.operator}
                          onValueChange={v => updateCondition(idx, 'operator', v)}
                        >
                          <SelectTrigger className="w-[130px] flex-none" aria-label="Operador">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {operators.length > 0 ? operators.map(o => (
                              <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                            )) : (
                              <>
                                <SelectItem value=">">Mayor que</SelectItem>
                                <SelectItem value="<">Menor que</SelectItem>
                                <SelectItem value=">=">Mayor o igual</SelectItem>
                                <SelectItem value="<=">Menor o igual</SelectItem>
                                <SelectItem value="=">Igual a</SelectItem>
                                <SelectItem value="!=">Diferente de</SelectItem>
                                <SelectItem value="between">Entre</SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>

                        <input
                          type="number"
                          value={cond.value}
                          onChange={e => updateCondition(idx, 'value', Number(e.target.value))}
                          placeholder="Valor"
                          aria-label="Valor"
                          className={cn(rowInputCls, 'w-20 flex-none')}
                        />

                        {cond.operator === 'between' && (
                          <input
                            type="number"
                            value={cond.value2 || ''}
                            onChange={e => updateCondition(idx, 'value2', Number(e.target.value))}
                            placeholder="Hasta"
                            aria-label="Valor hasta"
                            className={cn(rowInputCls, 'w-20 flex-none')}
                          />
                        )}

                        <Select
                          value={cond.timeRange}
                          onValueChange={v => updateCondition(idx, 'timeRange', v)}
                        >
                          <SelectTrigger className="min-w-[120px] flex-1" aria-label="Rango de tiempo">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {timeRanges.length > 0 ? timeRanges.map(t => (
                              <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                            )) : (
                              <>
                                <SelectItem value="last_1_day">Último día</SelectItem>
                                <SelectItem value="last_3_days">Últimos 3 días</SelectItem>
                                <SelectItem value="last_7_days">Últimos 7 días</SelectItem>
                                <SelectItem value="last_14_days">Últimos 14 días</SelectItem>
                                <SelectItem value="last_30_days">Últimos 30 días</SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>

                        {form.conditions.length > 1 && (
                          <button
                            type="button"
                            aria-label="Quitar condición"
                            title="Quitar condición"
                            onClick={() => removeCondition(idx)}
                            className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive-text"
                          >
                            <Trash className="size-[18px]" aria-hidden />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-border" />

              {/* Acciones */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">⚡ Acciones</h3>
                  <Button variant="outline" size="sm" onClick={addAction}>
                    <Plus className="size-4" weight="bold" aria-hidden />
                    Agregar acción
                  </Button>
                </div>

                <div className="space-y-2">
                  {form.actions.map((action, idx) => (
                    <div key={idx} className="space-y-2 rounded-lg border border-border p-3">
                      <div className="flex items-center gap-2">
                        <Select
                          value={action.type}
                          onValueChange={v => updateAction(idx, 'type', v)}
                        >
                          <SelectTrigger className="flex-1" aria-label="Tipo de acción">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pause">⏸️ Pausar campaña</SelectItem>
                            <SelectItem value="activate">▶️ Activar campaña</SelectItem>
                            <SelectItem value="adjust_budget">💰 Ajustar presupuesto</SelectItem>
                            <SelectItem value="notify_whatsapp">📱 Notificar por WhatsApp</SelectItem>
                          </SelectContent>
                        </Select>
                        {form.actions.length > 1 && (
                          <button
                            type="button"
                            aria-label="Quitar acción"
                            title="Quitar acción"
                            onClick={() => removeAction(idx)}
                            className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive-text"
                          >
                            <Trash className="size-[18px]" aria-hidden />
                          </button>
                        )}
                      </div>

                      {/* Parámetros de adjust_budget */}
                      {action.type === 'adjust_budget' && (
                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            value={action.params?.direction || 'increase'}
                            onValueChange={v => updateAction(idx, 'params.direction', v)}
                          >
                            <SelectTrigger className="min-w-[120px] flex-1" aria-label="Dirección del ajuste">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="increase">Aumentar</SelectItem>
                              <SelectItem value="decrease">Disminuir</SelectItem>
                            </SelectContent>
                          </Select>
                          <input
                            type="number"
                            value={action.params?.amount || ''}
                            onChange={e => updateAction(idx, 'params.amount', Number(e.target.value))}
                            placeholder="Monto"
                            aria-label="Monto"
                            className={cn(rowInputCls, 'w-20 flex-none')}
                          />
                          <Select
                            value={action.params?.unit || 'percent'}
                            onValueChange={v => updateAction(idx, 'params.unit', v)}
                          >
                            <SelectTrigger className="w-[140px] flex-none" aria-label="Unidad">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="percent">Porcentaje (%)</SelectItem>
                              <SelectItem value="absolute">Monto fijo ($)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* Parámetros de notify_whatsapp */}
                      {action.type === 'notify_whatsapp' && (
                        <textarea
                          rows={2}
                          placeholder="Mensaje de notificación... Usa {{campaignName}}, {{spend}}, {{ctr}}, etc."
                          aria-label="Mensaje de notificación"
                          value={action.params?.message || ''}
                          onChange={e => updateAction(idx, 'params.message', e.target.value)}
                          className={cn(rowInputCls, 'h-auto py-2 leading-relaxed')}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-border" />

              {/* Números de notificación */}
              <div>
                <h3 className="mb-1 text-sm font-semibold text-foreground">
                  📱 Números de WhatsApp para notificaciones
                </h3>
                <p className="mb-2 text-xs text-muted-foreground">
                  Ingresa los números que recibirán alertas (con código de país, sin +). Ej: 5215512345678
                </p>

                <div className="mb-2 flex items-center gap-2">
                  <input
                    placeholder="Ej: 5215512345678"
                    aria-label="Número de WhatsApp"
                    value={form.newPhone}
                    onChange={e => setForm(f => ({ ...f, newPhone: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') addPhone() }}
                    className={cn(rowInputCls, 'flex-1')}
                  />
                  <Button variant="outline" size="sm" onClick={addPhone}>
                    <Plus className="size-4" weight="bold" aria-hidden />
                    Agregar
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {form.notificationPhones.map((phone, idx) => (
                    <Badge key={idx} variant="primary" className="pr-1">
                      +{phone}
                      <button
                        type="button"
                        aria-label={`Quitar número +${phone}`}
                        onClick={() => removePhone(idx)}
                        className="ml-0.5 flex size-4 items-center justify-center rounded-full transition-colors hover:bg-primary/20"
                      >
                        <X className="size-3" aria-hidden />
                      </button>
                    </Badge>
                  ))}
                  {form.notificationPhones.length === 0 && (
                    <p className="text-xs text-muted-foreground">Sin números configurados</p>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowCreateModal(false)}>
                Cancelar
              </Button>
              <Button size="sm" loading={formLoading} onClick={handleSave}>
                {isEditing ? 'Guardar cambios' : 'Crear Regla'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ============================================================
            MODAL: Historial de Logs
            ============================================================ */}
        <Dialog open={showLogsModal} onOpenChange={setShowLogsModal}>
          <DialogContent className="max-w-[800px]">
            <DialogHeader>
              <DialogTitle>📋 Historial — {selectedRule?.name}</DialogTitle>
            </DialogHeader>

            {logsLoading ? (
              <div className="flex justify-center py-10">
                <CircularProgress />
              </div>
            ) : logs.length === 0 ? (
              <div className="py-10 text-center">
                <ClockCounterClockwise className="mx-auto size-10 text-muted-foreground" aria-hidden />
                <p className="mt-2 text-sm text-muted-foreground">Sin registros de ejecución</p>
              </div>
            ) : (
              <div className="space-y-2">
                {logs.map(log => (
                  <div key={log.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-foreground">
                            {RESULT_CONFIG[log.result]?.icon || '•'}{' '}
                            <strong>{log.campaignName || 'General'}</strong>
                          </span>
                          <Badge variant={RESULT_CONFIG[log.result]?.variant || 'neutral'}>
                            {log.result}
                          </Badge>
                          {log.conditionsMet && <Badge variant="success">Condiciones ✓</Badge>}
                          {log.notificationsSent > 0 && (
                            <Badge variant="primary">
                              <BellRinging className="size-3" aria-hidden />
                              {log.notificationsSent} env.
                            </Badge>
                          )}
                        </div>
                        {log.actionsTaken && log.actionsTaken.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Acciones: {log.actionsTaken.map(a => `${ACTION_LABELS[a.type] || a.type} (${a.result})`).join(', ')}
                          </p>
                        )}
                        {log.error && (
                          <p className="text-xs text-destructive-text">⚠️ {log.error}</p>
                        )}
                        {log.metricsSnapshot && Object.keys(log.metricsSnapshot).length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Métricas: {Object.entries(log.metricsSnapshot)
                              .filter(([, v]) => v > 0)
                              .slice(0, 4)
                              .map(([k, v]) => `${k}: ${typeof v === 'number' ? v.toFixed(2) : v}`)
                              .join(' | ')}
                          </p>
                        )}
                      </div>
                      <span className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(log.executedAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowLogsModal(false)}>
                Cerrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ============================================================
            MODAL: Dry Run (Test)
            ============================================================ */}
        <Dialog open={showTestModal} onOpenChange={setShowTestModal}>
          <DialogContent className="max-w-[720px]">
            <DialogHeader>
              <DialogTitle>🧪 Simulación — {selectedRule?.name}</DialogTitle>
            </DialogHeader>

            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              Esta simulación evalúa las condiciones con datos reales de Meta Ads{' '}
              <strong className="text-foreground">sin ejecutar ninguna acción</strong>.
            </div>

            {testLoading ? (
              <div className="flex justify-center py-10">
                <CircularProgress />
              </div>
            ) : !testResults ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No se pudo obtener datos de simulación
              </p>
            ) : testResults.results.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No hay campañas activas para evaluar
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {testResults.results.filter(r => r.conditionsMet).length} de {testResults.results.length} campañas dispararían la regla
                </p>
                {testResults.results.map((r, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'rounded-lg border p-3',
                      r.conditionsMet ? 'border-success' : 'border-border',
                    )}
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{r.campaignName}</p>
                        {r.conditionsMet
                          ? <Badge variant="success">✅ Dispararía</Badge>
                          : <Badge variant="neutral">❌ No dispara</Badge>}
                      </div>
                      {r.conditionsMet && r.wouldExecute.length > 0 && (
                        <p className="text-xs text-success-text">
                          Ejecutaría: {r.wouldExecute.map(a => ACTION_LABELS[a.type] || a.type).join(', ')}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {Object.entries(r.metrics)
                          .filter(([, v]) => v > 0)
                          .slice(0, 5)
                          .map(([k, v]) => `${k}: ${typeof v === 'number' ? v.toFixed(2) : v}`)
                          .join(' | ')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowTestModal(false)}>
                Cerrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ============================================================
            MODAL: Templates
            ============================================================ */}
        <Dialog open={showTemplatesPanel} onOpenChange={setShowTemplatesPanel}>
          <DialogContent className="max-w-[700px]">
            <DialogHeader>
              <DialogTitle>✨ Templates Pre-configurados</DialogTitle>
            </DialogHeader>

            <p className="text-sm text-muted-foreground">
              Selecciona un template para crear una regla con configuración optimizada. Podrás personalizar los valores.
            </p>

            <div className="space-y-3">
              {templates.map(template => (
                <div key={template.id} className="rounded-lg border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-semibold text-foreground">{template.name}</p>
                      <p className="text-sm text-muted-foreground">{template.description}</p>
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <Badge variant="neutral">
                          {SCOPE_LABELS[template.scope] || template.scope}
                        </Badge>
                        <Badge variant="neutral">
                          {FREQUENCY_LABELS[template.frequency] || template.frequency}
                        </Badge>
                        <Badge variant="neutral">
                          {template.conditions.length} condición{template.conditions.length !== 1 ? 'es' : ''}
                        </Badge>
                        <Badge variant="neutral">
                          {template.actions.map(a => ACTION_LABELS[a.type] || a.type).join(', ')}
                        </Badge>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="shrink-0"
                      onClick={() => handleUseTemplate(template)}
                    >
                      Usar template
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowTemplatesPanel(false)}>
                Cerrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ============================================================
            MODAL: Confirmar Eliminación
            ============================================================ */}
        <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>🗑️ Eliminar Regla</DialogTitle>
            </DialogHeader>

            <p className="text-sm text-muted-foreground">
              ¿Estás seguro de eliminar la regla{' '}
              <strong className="text-foreground">"{selectedRule?.name}"</strong>?
              Esta acción eliminará también todo el historial de ejecuciones.
            </p>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowDeleteModal(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleDelete}
              >
                Eliminar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
