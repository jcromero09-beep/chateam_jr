/**
 * CampaignRules.tsx
 *
 * Motor de Reglas Automatizadas para Meta Ads.
 * Permite crear, gestionar y monitorear reglas que evalúan
 * métricas de campañas y ejecutan acciones automáticas.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Sheet,
  Table,
  Chip,
  IconButton,
  Tooltip,
  Modal,
  ModalDialog,
  ModalClose,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  Select,
  Option,
  Alert,
  CircularProgress,
  Divider,
  Stack,
  Badge,
  Switch,
} from '@mui/joy'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  History as HistoryIcon,
  BugReport as TestIcon,
  AutoAwesome as TemplateIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Schedule as ScheduleIcon,
  NotificationsActive as NotifyIcon,
  Close as CloseIcon,
  Add as PlusIcon,
} from '@mui/icons-material'
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

const STATUS_CONFIG: Record<string, { color: 'success' | 'warning' | 'danger'; label: string }> = {
  active: { color: 'success', label: 'Activa' },
  paused: { color: 'warning', label: 'Pausada' },
  error: { color: 'danger', label: 'Error' },
}

const RESULT_CONFIG: Record<string, { color: 'success' | 'warning' | 'danger' | 'neutral'; icon: string }> = {
  success: { color: 'success', icon: '✅' },
  failed: { color: 'danger', icon: '❌' },
  skipped: { color: 'neutral', icon: '⏭️' },
  cooldown: { color: 'warning', icon: '⏱️' },
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
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography level="h3" startDecorator={<TemplateIcon />}>
            Reglas Automatizadas
          </Typography>
          <Typography level="body-sm" color="neutral">
            Automatiza acciones en tus campañas Meta Ads según métricas de rendimiento
          </Typography>
        </Box>
        <Stack direction="row" gap={1}>
          <Button
            variant="outlined"
            startDecorator={<TemplateIcon />}
            onClick={() => setShowTemplatesPanel(true)}
          >
            Templates
          </Button>
          <Button
            startDecorator={<AddIcon />}
            onClick={handleOpenCreate}
          >
            Crear Regla
          </Button>
          <IconButton variant="outlined" onClick={loadRules} loading={loading}>
            <RefreshIcon />
          </IconButton>
        </Stack>
      </Stack>

      {/* Error global */}
      {error && (
        <Alert color="danger" sx={{ mb: 2 }} endDecorator={
          <IconButton size="sm" color="danger" onClick={() => setError(null)}><CloseIcon /></IconButton>
        }>
          {error}
        </Alert>
      )}

      {/* Tabla de reglas */}
      <Card>
        <CardContent>
          {loading ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress />
            </Box>
          ) : rules.length === 0 ? (
            <Box textAlign="center" py={6}>
              <TemplateIcon sx={{ fontSize: 48, color: 'neutral.400', mb: 2 }} />
              <Typography level="h4" color="neutral">Sin reglas configuradas</Typography>
              <Typography level="body-sm" color="neutral" mb={2}>
                Crea tu primera regla o usa un template pre-configurado
              </Typography>
              <Stack direction="row" gap={1} justifyContent="center">
                <Button onClick={handleOpenCreate} startDecorator={<AddIcon />}>Crear Regla</Button>
                <Button variant="outlined" onClick={() => setShowTemplatesPanel(true)} startDecorator={<TemplateIcon />}>
                  Ver Templates
                </Button>
              </Stack>
            </Box>
          ) : (
            <Sheet variant="outlined" sx={{ borderRadius: 'sm', overflow: 'auto' }}>
              <Table stickyHeader hoverRow>
                <thead>
                  <tr>
                    <th style={{ width: '200px' }}>Nombre</th>
                    <th style={{ width: '100px' }}>Scope</th>
                    <th style={{ width: '120px' }}>Frecuencia</th>
                    <th style={{ width: '100px' }}>Estado</th>
                    <th style={{ width: '130px' }}>Último trigger</th>
                    <th style={{ width: '80px', textAlign: 'center' }}>Triggers</th>
                    <th style={{ width: '140px', textAlign: 'center' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map(rule => (
                    <tr key={rule.id}>
                      <td>
                        <Box>
                          <Typography level="body-sm" fontWeight="bold">{rule.name}</Typography>
                          {rule.description && (
                            <Typography level="body-xs" color="neutral" noWrap sx={{ maxWidth: 180 }}>
                              {rule.description}
                            </Typography>
                          )}
                          {rule.status === 'error' && (
                            <Chip color="danger" size="sm" startDecorator={<ErrorIcon />}>
                              {rule.consecutiveErrors} errores
                            </Chip>
                          )}
                        </Box>
                      </td>
                      <td>
                        <Chip size="sm" variant="soft">
                          {SCOPE_LABELS[rule.scope] || rule.scope}
                        </Chip>
                      </td>
                      <td>
                        <Typography level="body-sm">
                          {FREQUENCY_LABELS[rule.frequency] || rule.frequency}
                        </Typography>
                      </td>
                      <td>
                        <Stack direction="row" gap={1} alignItems="center">
                          <Chip
                            size="sm"
                            color={STATUS_CONFIG[rule.status]?.color || 'neutral'}
                          >
                            {STATUS_CONFIG[rule.status]?.label || rule.status}
                          </Chip>
                          <Switch
                            size="sm"
                            checked={rule.status === 'active'}
                            onChange={() => handleToggleStatus(rule)}
                            disabled={rule.status === 'error'}
                          />
                        </Stack>
                      </td>
                      <td>
                        <Tooltip title={formatDate(rule.lastTriggeredAt)}>
                          <Typography level="body-xs" color="neutral">
                            {formatRelative(rule.lastTriggeredAt)}
                          </Typography>
                        </Tooltip>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <Badge badgeContent={rule.triggerCount} max={999} color="primary">
                          <NotifyIcon sx={{ fontSize: 18, color: 'neutral.400' }} />
                        </Badge>
                      </td>
                      <td>
                        <Stack direction="row" gap={0.5} justifyContent="center">
                          <Tooltip title="Editar">
                            <IconButton size="sm" variant="soft" onClick={() => handleEdit(rule)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Simular (dry run)">
                            <IconButton size="sm" variant="soft" color="neutral" onClick={() => handleTest(rule)}>
                              <TestIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Ver historial">
                            <IconButton size="sm" variant="soft" color="neutral" onClick={() => handleOpenLogs(rule)}>
                              <HistoryIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={rule.status === 'active' ? 'Pausar' : 'Activar'}>
                            <IconButton
                              size="sm"
                              variant="soft"
                              color={rule.status === 'active' ? 'warning' : 'success'}
                              onClick={() => handleToggleStatus(rule)}
                            >
                              {rule.status === 'active' ? <PauseIcon fontSize="small" /> : <PlayIcon fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Eliminar">
                            <IconButton
                              size="sm"
                              variant="soft"
                              color="danger"
                              onClick={() => { setSelectedRule(rule); setShowDeleteModal(true) }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Sheet>
          )}
          {total > 0 && (
            <Typography level="body-xs" color="neutral" mt={1}>
              Total: {total} regla{total !== 1 ? 's' : ''}
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* ============================================================
          MODAL: Crear / Editar Regla
          ============================================================ */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <ModalDialog size="lg" sx={{ maxWidth: 720, width: '95vw', overflow: 'auto', maxHeight: '90vh' }}>
          <ModalClose />
          <DialogTitle>
            {isEditing ? '✏️ Editar Regla' : '➕ Nueva Regla Automatizada'}
          </DialogTitle>
          <DialogContent>
            {formError && (
              <Alert color="danger" sx={{ mb: 2 }}>
                {formError}
              </Alert>
            )}

            {/* Datos básicos */}
            <Stack gap={2} mb={2}>
              <FormControl required>
                <FormLabel>Nombre</FormLabel>
                <Input
                  placeholder="Ej: Pausar campaña con CPA alto"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </FormControl>

              <FormControl>
                <FormLabel>Descripción</FormLabel>
                <Textarea
                  minRows={2}
                  placeholder="Descripción opcional de la regla..."
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </FormControl>

              <Stack direction="row" gap={2}>
                <FormControl sx={{ flex: 1 }}>
                  <FormLabel>Scope</FormLabel>
                  <Select
                    value={form.scope}
                    onChange={(_, v) => setForm(f => ({ ...f, scope: v as string }))}
                  >
                    <Option value="campaign">Campaña</Option>
                    <Option value="adset">Conjunto de anuncios</Option>
                    <Option value="ad">Anuncio</Option>
                    <Option value="account">Cuenta</Option>
                  </Select>
                </FormControl>

                <FormControl sx={{ flex: 1 }}>
                  <FormLabel>Frecuencia de evaluación</FormLabel>
                  <Select
                    value={form.frequency}
                    onChange={(_, v) => setForm(f => ({ ...f, frequency: v as string }))}
                  >
                    <Option value="every_15min">Cada 15 minutos</Option>
                    <Option value="every_30min">Cada 30 minutos</Option>
                    <Option value="hourly">Cada hora</Option>
                    <Option value="every_6h">Cada 6 horas</Option>
                    <Option value="daily">Diario</Option>
                  </Select>
                </FormControl>

                <FormControl sx={{ width: 140 }}>
                  <FormLabel>Cooldown (min)</FormLabel>
                  <Input
                    type="number"
                    value={form.cooldownMinutes}
                    onChange={e => setForm(f => ({ ...f, cooldownMinutes: Number(e.target.value) }))}
                    slotProps={{ input: { min: 1 } }}
                  />
                </FormControl>
              </Stack>
            </Stack>

            <Divider sx={{ my: 2 }} />

            {/* Condiciones */}
            <Box mb={2}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography level="title-md">🔍 Condiciones</Typography>
                <Button size="sm" variant="soft" startDecorator={<PlusIcon />} onClick={addCondition}>
                  Agregar condición
                </Button>
              </Stack>

              <Stack gap={1}>
                {form.conditions.map((cond, idx) => (
                  <Card key={idx} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                      {idx > 0 && (
                        <Select
                          size="sm"
                          value={cond.logic || 'AND'}
                          onChange={(_, v) => updateCondition(idx, 'logic', v)}
                          sx={{ width: 70 }}
                        >
                          <Option value="AND">Y</Option>
                          <Option value="OR">O</Option>
                        </Select>
                      )}

                      <Select
                        size="sm"
                        value={cond.metric}
                        onChange={(_, v) => updateCondition(idx, 'metric', v)}
                        sx={{ flex: 2, minWidth: 160 }}
                      >
                        {metrics.length > 0 ? metrics.map(m => (
                          <Option key={m.key} value={m.key}>{m.label}</Option>
                        )) : (
                          <>
                            <Option value="spend">Gasto (Spend)</Option>
                            <Option value="ctr">CTR (%)</Option>
                            <Option value="cpc">CPC ($)</Option>
                            <Option value="cpm">CPM ($)</Option>
                            <Option value="roas">ROAS</Option>
                            <Option value="frequency">Frecuencia</Option>
                            <Option value="impressions">Impresiones</Option>
                            <Option value="conversions">Conversiones</Option>
                            <Option value="cost_per_conversion">CPA ($)</Option>
                            <Option value="reach">Alcance</Option>
                          </>
                        )}
                      </Select>

                      <Select
                        size="sm"
                        value={cond.operator}
                        onChange={(_, v) => updateCondition(idx, 'operator', v)}
                        sx={{ width: 130 }}
                      >
                        {operators.length > 0 ? operators.map(o => (
                          <Option key={o.key} value={o.key}>{o.label}</Option>
                        )) : (
                          <>
                            <Option value=">">Mayor que</Option>
                            <Option value="<">Menor que</Option>
                            <Option value=">=">Mayor o igual</Option>
                            <Option value="<=">Menor o igual</Option>
                            <Option value="=">Igual a</Option>
                            <Option value="!=">Diferente de</Option>
                            <Option value="between">Entre</Option>
                          </>
                        )}
                      </Select>

                      <Input
                        size="sm"
                        type="number"
                        value={cond.value}
                        onChange={e => updateCondition(idx, 'value', Number(e.target.value))}
                        sx={{ width: 80 }}
                        placeholder="Valor"
                      />

                      {cond.operator === 'between' && (
                        <Input
                          size="sm"
                          type="number"
                          value={cond.value2 || ''}
                          onChange={e => updateCondition(idx, 'value2', Number(e.target.value))}
                          sx={{ width: 80 }}
                          placeholder="Hasta"
                        />
                      )}

                      <Select
                        size="sm"
                        value={cond.timeRange}
                        onChange={(_, v) => updateCondition(idx, 'timeRange', v)}
                        sx={{ flex: 1, minWidth: 120 }}
                      >
                        {timeRanges.length > 0 ? timeRanges.map(t => (
                          <Option key={t.key} value={t.key}>{t.label}</Option>
                        )) : (
                          <>
                            <Option value="last_1_day">Último día</Option>
                            <Option value="last_3_days">Últimos 3 días</Option>
                            <Option value="last_7_days">Últimos 7 días</Option>
                            <Option value="last_14_days">Últimos 14 días</Option>
                            <Option value="last_30_days">Últimos 30 días</Option>
                          </>
                        )}
                      </Select>

                      {form.conditions.length > 1 && (
                        <IconButton size="sm" color="danger" onClick={() => removeCondition(idx)}>
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Stack>
                  </Card>
                ))}
              </Stack>
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Acciones */}
            <Box mb={2}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography level="title-md">⚡ Acciones</Typography>
                <Button size="sm" variant="soft" startDecorator={<PlusIcon />} onClick={addAction}>
                  Agregar acción
                </Button>
              </Stack>

              <Stack gap={1}>
                {form.actions.map((action, idx) => (
                  <Card key={idx} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack gap={1}>
                      <Stack direction="row" gap={1} alignItems="center">
                        <Select
                          size="sm"
                          value={action.type}
                          onChange={(_, v) => updateAction(idx, 'type', v)}
                          sx={{ flex: 1 }}
                        >
                          <Option value="pause">⏸️ Pausar campaña</Option>
                          <Option value="activate">▶️ Activar campaña</Option>
                          <Option value="adjust_budget">💰 Ajustar presupuesto</Option>
                          <Option value="notify_whatsapp">📱 Notificar por WhatsApp</Option>
                        </Select>
                        {form.actions.length > 1 && (
                          <IconButton size="sm" color="danger" onClick={() => removeAction(idx)}>
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Stack>

                      {/* Parámetros de adjust_budget */}
                      {action.type === 'adjust_budget' && (
                        <Stack direction="row" gap={1}>
                          <Select
                            size="sm"
                            value={action.params?.direction || 'increase'}
                            onChange={(_, v) => updateAction(idx, 'params.direction', v)}
                            sx={{ flex: 1 }}
                          >
                            <Option value="increase">Aumentar</Option>
                            <Option value="decrease">Disminuir</Option>
                          </Select>
                          <Input
                            size="sm"
                            type="number"
                            value={action.params?.amount || ''}
                            onChange={e => updateAction(idx, 'params.amount', Number(e.target.value))}
                            sx={{ width: 80 }}
                            placeholder="Monto"
                          />
                          <Select
                            size="sm"
                            value={action.params?.unit || 'percent'}
                            onChange={(_, v) => updateAction(idx, 'params.unit', v)}
                            sx={{ width: 110 }}
                          >
                            <Option value="percent">Porcentaje (%)</Option>
                            <Option value="absolute">Monto fijo ($)</Option>
                          </Select>
                        </Stack>
                      )}

                      {/* Parámetros de notify_whatsapp */}
                      {action.type === 'notify_whatsapp' && (
                        <Textarea
                          size="sm"
                          minRows={2}
                          placeholder="Mensaje de notificación... Usa {{campaignName}}, {{spend}}, {{ctr}}, etc."
                          value={action.params?.message || ''}
                          onChange={e => updateAction(idx, 'params.message', e.target.value)}
                        />
                      )}
                    </Stack>
                  </Card>
                ))}
              </Stack>
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Números de notificación */}
            <Box>
              <Typography level="title-md" mb={1}>📱 Números de WhatsApp para notificaciones</Typography>
              <Typography level="body-xs" color="neutral" mb={1}>
                Ingresa los números que recibirán alertas (con código de país, sin +). Ej: 5215512345678
              </Typography>

              <Stack direction="row" gap={1} mb={1}>
                <Input
                  size="sm"
                  placeholder="Ej: 5215512345678"
                  value={form.newPhone}
                  onChange={e => setForm(f => ({ ...f, newPhone: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') addPhone() }}
                  sx={{ flex: 1 }}
                />
                <Button size="sm" variant="soft" onClick={addPhone} startDecorator={<PlusIcon />}>
                  Agregar
                </Button>
              </Stack>

              <Stack direction="row" gap={0.5} flexWrap="wrap">
                {form.notificationPhones.map((phone, idx) => (
                  <Chip
                    key={idx}
                    size="sm"
                    variant="soft"
                    color="primary"
                    endDecorator={
                      <IconButton size="sm" onClick={() => removePhone(idx)}>
                        <CloseIcon sx={{ fontSize: 12 }} />
                      </IconButton>
                    }
                  >
                    +{phone}
                  </Chip>
                ))}
                {form.notificationPhones.length === 0 && (
                  <Typography level="body-xs" color="neutral">Sin números configurados</Typography>
                )}
              </Stack>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button variant="outlined" onClick={() => setShowCreateModal(false)}>Cancelar</Button>
            <Button loading={formLoading} onClick={handleSave}>
              {isEditing ? 'Guardar cambios' : 'Crear Regla'}
            </Button>
          </DialogActions>
        </ModalDialog>
      </Modal>

      {/* ============================================================
          MODAL: Historial de Logs
          ============================================================ */}
      <Modal open={showLogsModal} onClose={() => setShowLogsModal(false)}>
        <ModalDialog size="lg" sx={{ maxWidth: 800, width: '95vw', overflow: 'auto', maxHeight: '90vh' }}>
          <ModalClose />
          <DialogTitle>
            📋 Historial — {selectedRule?.name}
          </DialogTitle>
          <DialogContent>
            {logsLoading ? (
              <Box display="flex" justifyContent="center" py={4}>
                <CircularProgress />
              </Box>
            ) : logs.length === 0 ? (
              <Box textAlign="center" py={4}>
                <HistoryIcon sx={{ fontSize: 40, color: 'neutral.400' }} />
                <Typography level="body-sm" color="neutral" mt={1}>Sin registros de ejecución</Typography>
              </Box>
            ) : (
              <Stack gap={1}>
                {logs.map(log => (
                  <Card key={log.id} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                      <Box flex={1}>
                        <Stack direction="row" gap={1} alignItems="center" mb={0.5}>
                          <Typography level="body-xs">
                            {RESULT_CONFIG[log.result]?.icon || '•'} {' '}
                            <strong>{log.campaignName || 'General'}</strong>
                          </Typography>
                          <Chip
                            size="sm"
                            color={RESULT_CONFIG[log.result]?.color || 'neutral'}
                          >
                            {log.result}
                          </Chip>
                          {log.conditionsMet && <Chip size="sm" color="success">Condiciones ✓</Chip>}
                          {log.notificationsSent > 0 && (
                            <Chip size="sm" color="primary" startDecorator={<NotifyIcon sx={{ fontSize: 12 }} />}>
                              {log.notificationsSent} env.
                            </Chip>
                          )}
                        </Stack>
                        {log.actionsTaken && log.actionsTaken.length > 0 && (
                          <Typography level="body-xs" color="neutral">
                            Acciones: {log.actionsTaken.map(a => `${ACTION_LABELS[a.type] || a.type} (${a.result})`).join(', ')}
                          </Typography>
                        )}
                        {log.error && (
                          <Typography level="body-xs" color="danger">⚠️ {log.error}</Typography>
                        )}
                        {log.metricsSnapshot && Object.keys(log.metricsSnapshot).length > 0 && (
                          <Typography level="body-xs" color="neutral">
                            Métricas: {Object.entries(log.metricsSnapshot)
                              .filter(([, v]) => v > 0)
                              .slice(0, 4)
                              .map(([k, v]) => `${k}: ${typeof v === 'number' ? v.toFixed(2) : v}`)
                              .join(' | ')}
                          </Typography>
                        )}
                      </Box>
                      <Typography level="body-xs" color="neutral" sx={{ whiteSpace: 'nowrap', ml: 1 }}>
                        {formatDate(log.executedAt)}
                      </Typography>
                    </Stack>
                  </Card>
                ))}
              </Stack>
            )}
          </DialogContent>
          <DialogActions>
            <Button variant="outlined" onClick={() => setShowLogsModal(false)}>Cerrar</Button>
          </DialogActions>
        </ModalDialog>
      </Modal>

      {/* ============================================================
          MODAL: Dry Run (Test)
          ============================================================ */}
      <Modal open={showTestModal} onClose={() => setShowTestModal(false)}>
        <ModalDialog size="lg" sx={{ maxWidth: 720, width: '95vw', overflow: 'auto', maxHeight: '90vh' }}>
          <ModalClose />
          <DialogTitle>🧪 Simulación — {selectedRule?.name}</DialogTitle>
          <DialogContent>
            <Alert color="neutral" sx={{ mb: 2 }}>
              Esta simulación evalúa las condiciones con datos reales de Meta Ads <strong>sin ejecutar ninguna acción</strong>.
            </Alert>
            {testLoading ? (
              <Box display="flex" justifyContent="center" py={4}>
                <CircularProgress />
              </Box>
            ) : !testResults ? (
              <Box textAlign="center" py={4}>
                <Typography color="neutral">No se pudo obtener datos de simulación</Typography>
              </Box>
            ) : testResults.results.length === 0 ? (
              <Box textAlign="center" py={4}>
                <Typography color="neutral">No hay campañas activas para evaluar</Typography>
              </Box>
            ) : (
              <Stack gap={1}>
                <Typography level="body-sm" color="neutral" mb={1}>
                  {testResults.results.filter(r => r.conditionsMet).length} de {testResults.results.length} campañas dispararían la regla
                </Typography>
                {testResults.results.map((r, idx) => (
                  <Card key={idx} variant="outlined" sx={{ p: 1.5, borderColor: r.conditionsMet ? 'success.500' : 'neutral.300' }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                      <Box>
                        <Stack direction="row" gap={1} mb={0.5}>
                          <Typography level="body-sm" fontWeight="bold">{r.campaignName}</Typography>
                          {r.conditionsMet
                            ? <Chip color="success" size="sm">✅ Dispararía</Chip>
                            : <Chip color="neutral" size="sm">❌ No dispara</Chip>
                          }
                        </Stack>
                        {r.conditionsMet && r.wouldExecute.length > 0 && (
                          <Typography level="body-xs" sx={{ color: 'success.600' }}>
                            Ejecutaría: {r.wouldExecute.map(a => ACTION_LABELS[a.type] || a.type).join(', ')}
                          </Typography>
                        )}
                        <Typography level="body-xs" color="neutral">
                          {Object.entries(r.metrics)
                            .filter(([, v]) => v > 0)
                            .slice(0, 5)
                            .map(([k, v]) => `${k}: ${typeof v === 'number' ? v.toFixed(2) : v}`)
                            .join(' | ')}
                        </Typography>
                      </Box>
                    </Stack>
                  </Card>
                ))}
              </Stack>
            )}
          </DialogContent>
          <DialogActions>
            <Button variant="outlined" onClick={() => setShowTestModal(false)}>Cerrar</Button>
          </DialogActions>
        </ModalDialog>
      </Modal>

      {/* ============================================================
          MODAL: Templates
          ============================================================ */}
      <Modal open={showTemplatesPanel} onClose={() => setShowTemplatesPanel(false)}>
        <ModalDialog size="lg" sx={{ maxWidth: 700, width: '95vw', overflow: 'auto', maxHeight: '90vh' }}>
          <ModalClose />
          <DialogTitle>✨ Templates Pre-configurados</DialogTitle>
          <DialogContent>
            <Typography level="body-sm" color="neutral" mb={2}>
              Selecciona un template para crear una regla con configuración optimizada. Podrás personalizar los valores.
            </Typography>
            <Stack gap={2}>
              {templates.map(template => (
                <Card key={template.id} variant="outlined" sx={{ p: 2 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box flex={1}>
                      <Typography level="title-sm" mb={0.5}>{template.name}</Typography>
                      <Typography level="body-sm" color="neutral" mb={1}>{template.description}</Typography>
                      <Stack direction="row" gap={0.5} flexWrap="wrap">
                        <Chip size="sm" variant="soft">
                          {SCOPE_LABELS[template.scope] || template.scope}
                        </Chip>
                        <Chip size="sm" variant="soft">
                          {FREQUENCY_LABELS[template.frequency] || template.frequency}
                        </Chip>
                        <Chip size="sm" variant="soft">
                          {template.conditions.length} condición{template.conditions.length !== 1 ? 'es' : ''}
                        </Chip>
                        <Chip size="sm" variant="soft">
                          {template.actions.map(a => ACTION_LABELS[a.type] || a.type).join(', ')}
                        </Chip>
                      </Stack>
                    </Box>
                    <Button
                      size="sm"
                      variant="soft"
                      color="primary"
                      onClick={() => handleUseTemplate(template)}
                      sx={{ ml: 1, flexShrink: 0 }}
                    >
                      Usar template
                    </Button>
                  </Stack>
                </Card>
              ))}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button variant="outlined" onClick={() => setShowTemplatesPanel(false)}>Cerrar</Button>
          </DialogActions>
        </ModalDialog>
      </Modal>

      {/* ============================================================
          MODAL: Confirmar Eliminación
          ============================================================ */}
      <Modal open={showDeleteModal} onClose={() => setShowDeleteModal(false)}>
        <ModalDialog size="sm">
          <ModalClose />
          <DialogTitle>🗑️ Eliminar Regla</DialogTitle>
          <DialogContent>
            <Typography>
              ¿Estás seguro de eliminar la regla <strong>"{selectedRule?.name}"</strong>?
              Esta acción eliminará también todo el historial de ejecuciones.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button variant="outlined" onClick={() => setShowDeleteModal(false)}>Cancelar</Button>
            <Button color="danger" onClick={handleDelete}>Eliminar</Button>
          </DialogActions>
        </ModalDialog>
      </Modal>
    </Box>
  )
}
