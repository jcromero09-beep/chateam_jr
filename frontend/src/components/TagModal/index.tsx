import { useState, useEffect, useMemo } from 'react'
import {
  Modal,
  ModalDialog,
  ModalClose,
  Button,
  Typography,
  FormControl,
  FormLabel,
  Select,
  Option,
  Input,
  Textarea,
  Switch,
  Chip,
  Stack,
  Box,
  Divider,
  Tooltip,
  LinearProgress,
  Alert,
} from '@mui/joy'
import DeleteForever from '@mui/icons-material/DeleteForever'
import Add from '@mui/icons-material/Add'
import Edit from '@mui/icons-material/Edit'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import api from '../../services/api'
import { toast } from 'react-toastify'

interface TagData {
  id?: number
  name: string
  color: string
  key?: string
  kanban?: number
  timeLane?: number
  nextLaneId?: number
  greetingMessageLane?: string
  rollbackLaneId?: number
  description?: string
  followupEnabled?: boolean
  followupCount?: number
  followupMessage1?: string
  followupDelay1?: number
  followupMessage2?: string
  followupDelay2?: number
  followupMessage3?: string
  followupDelay3?: number
  followupType?: string
  timeLaneUnit?: string
  aiGuidance1?: string
  aiGuidance2?: string
  aiGuidance3?: string
  // Conversión personalizada Meta
  sendMetaConversion?: boolean
  metaConversionName?: string
  metaEventName?: string
  metaLeadStatus?: string
  metaValue?: number | string | null
  metaCurrency?: string | null
  metaCustomEventType?: string
  metaRule?: string
  metaConversionStatus?: string
  metaLastError?: string
}

interface AIRecommendation {
  followupDelay1: number
  followupDelay2: number
  followupDelay3: number
  aiGuidance1: string
  aiGuidance2: string
  aiGuidance3: string
  reasoning: string
}

interface MetaConversionRecommendation {
  metaConversionName: string
  metaEventName: string
  metaLeadStatus: string
  metaValue: number | string | null
  metaCurrency: string | null
  metaCustomEventType: string
  metaRule: string
  reasoning: string
}

const META_EVENT_TYPES = [
  'CONTACT', 'LEAD', 'SCHEDULE', 'COMPLETE_REGISTRATION', 'START_TRIAL',
  'SUBSCRIBE', 'SUBMIT_APPLICATION', 'PURCHASE', 'ADD_TO_CART',
  'INITIATE_CHECKOUT', 'VIEW_CONTENT', 'SEARCH', 'FIND_LOCATION', 'OTHER',
]

const RULE_HELP = `Meta evalúa esta regla para contar la conversión personalizada.

Si el evento enviado es LeadSubmitted, la regla de Meta debe usar event = Lead.
Para otros eventos, event debe coincidir con el evento base.

lead_status debe coincidir con el valor enviado en el payload.`

const slugLeadStatus = (value?: string) =>
  (value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'lead'

const getRuleEventName = (eventName?: string) => {
  const trimmed = (eventName || '').trim()
  return trimmed === 'LeadSubmitted' ? 'Lead' : trimmed
}

const buildMetaRule = (eventName?: string, leadStatus?: string) =>
  JSON.stringify({
    and: [
      { event: { eq: getRuleEventName(eventName) || 'Lead' } },
      { lead_status: { eq: (leadStatus || '').trim() || 'lead' } },
    ],
  })

const extractRuleEqValues = (rule?: string) => {
  const values: { event?: string; leadStatus?: string; valid: boolean } = { valid: false }
  if (!rule?.trim()) return values

  try {
    const parsed = JSON.parse(rule)
    const visit = (node: unknown) => {
      if (!node || typeof node !== 'object') return
      const record = node as Record<string, unknown>
      const event = record.event as { eq?: unknown } | undefined
      const leadStatus = record.lead_status as { eq?: unknown } | undefined

      if (event && typeof event.eq === 'string') values.event = event.eq
      if (leadStatus && typeof leadStatus.eq === 'string') values.leadStatus = leadStatus.eq

      Object.values(record).forEach(visit)
    }
    visit(parsed)
    values.valid = true
  } catch {
    values.valid = false
  }

  return values
}

const getMetaValidation = (data: TagData) => {
  if (!data.sendMetaConversion) return { errors: [] as string[], warnings: [] as string[] }

  const errors: string[] = []
  const warnings: string[] = []
  const eventName = (data.metaEventName || '').trim()
  const leadStatus = (data.metaLeadStatus || '').trim()
  const rule = (data.metaRule || '').trim()
  const customEventType = (data.metaCustomEventType || '').trim()
  const ruleValues = extractRuleEqValues(rule)
  const expectedEvent = getRuleEventName(eventName)

  if (!eventName) errors.push('Define el evento base de Meta.')
  if (!leadStatus) errors.push('Define el lead status que se enviará.')
  if (!customEventType) errors.push('Selecciona el custom event type.')
  if (!rule) errors.push('Genera o escribe la rule JSON.')
  if (rule && !ruleValues.valid) errors.push('La rule debe ser JSON válido.')

  if (ruleValues.valid && expectedEvent && ruleValues.event && ruleValues.event !== expectedEvent) {
    warnings.push(`La rule usa event=${ruleValues.event}; para este evento se sincronizará como ${expectedEvent}.`)
  }
  if (ruleValues.valid && leadStatus && ruleValues.leadStatus && ruleValues.leadStatus !== leadStatus) {
    errors.push('El lead_status de la rule no coincide con el lead status del payload.')
  }

  return { errors, warnings }
}

interface KanbanTagOption {
  id: number
  name: string
  color: string
}

interface TagModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  tagId?: number
  kanban?: number
}

const DELAY_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 12, 24, 48]

const TagModal: React.FC<TagModalProps> = ({ open, onClose, onSaved, tagId, kanban = 1 }) => {
  const [loading, setLoading] = useState(false)
  const [kanbanTags, setKanbanTags] = useState<KanbanTagOption[]>([])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiReasoning, setAiReasoning] = useState<string | null>(null)
  const [metaAiLoading, setMetaAiLoading] = useState(false)
  const [metaAiReasoning, setMetaAiReasoning] = useState<string | null>(null)
  const [formData, setFormData] = useState<TagData>({
    name: '',
    color: '#3b82f6',
    key: '',
    kanban: kanban,
    timeLane: 0,
    nextLaneId: undefined,
    greetingMessageLane: '',
    rollbackLaneId: undefined,
    description: '',
    followupEnabled: false,
    followupCount: 1,
    followupMessage1: '',
    followupDelay1: 1,
    followupMessage2: '',
    followupDelay2: 3,
    followupMessage3: '',
    followupDelay3: 4,
    followupType: 'multiple',
    timeLaneUnit: 'hours',
    aiGuidance1: '',
    aiGuidance2: '',
    aiGuidance3: '',
    sendMetaConversion: false,
    metaConversionName: '',
    metaEventName: '',
    metaLeadStatus: '',
    metaValue: '',
    metaCurrency: '',
    metaCustomEventType: '',
    metaRule: '',
    metaConversionStatus: '',
    metaLastError: '',
  })

  useEffect(() => {
    if (tagId) {
      loadTag()
    } else {
      resetForm()
    }
    loadKanbanTags()
  }, [tagId])

  const loadKanbanTags = async () => {
    try {
      const response = await api.get('/tags/', { params: { kanban: 1 } })
      const tags: KanbanTagOption[] = tagId
        ? response.data.tags.filter((t: KanbanTagOption) => t.id !== tagId)
        : response.data.tags
      setKanbanTags(tags)
    } catch {
      setKanbanTags([])
    }
  }

  const loadTag = async () => {
    if (!tagId) return
    try {
      setLoading(true)
      const response = await api.get(`/tags/${tagId}`)
      const tag = response.data
      setFormData({
        name: tag.name || '',
        color: tag.color || '#3b82f6',
        key: tag.key || '',
        kanban: tag.kanban ?? kanban,
        timeLane: tag.timeLane || 0,
        nextLaneId: tag.nextLaneId || undefined,
        greetingMessageLane: tag.greetingMessageLane || '',
        rollbackLaneId: tag.rollbackLaneId || undefined,
        description: tag.description || '',
        followupEnabled: tag.followupEnabled || false,
        followupCount: tag.followupCount || 1,
        followupMessage1: tag.followupMessage1 || '',
        followupDelay1: tag.followupDelay1 || 1,
        followupMessage2: tag.followupMessage2 || '',
        followupDelay2: tag.followupDelay2 || 3,
        followupMessage3: tag.followupMessage3 || '',
        followupDelay3: tag.followupDelay3 || 4,
        followupType: tag.followupType || 'multiple',
        timeLaneUnit: tag.timeLaneUnit || 'hours',
        aiGuidance1: tag.aiGuidance1 || '',
        aiGuidance2: tag.aiGuidance2 || '',
        aiGuidance3: tag.aiGuidance3 || '',
        sendMetaConversion: tag.sendMetaConversion || false,
        metaConversionName: tag.metaConversionName || '',
        metaEventName: tag.metaEventName || '',
        metaLeadStatus: tag.metaLeadStatus || '',
        metaValue: tag.metaValue ?? '',
        metaCurrency: tag.metaCurrency ?? '',
        metaCustomEventType: tag.metaCustomEventType || '',
        metaRule: tag.metaRule || '',
        metaConversionStatus: tag.metaConversionStatus || '',
        metaLastError: tag.metaLastError || '',
      })
    } catch (error) {
      console.error('Error loading tag:', error)
      toast.error('Error al cargar la etiqueta')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      color: '#3b82f6',
      key: '',
      kanban: kanban,
      timeLane: 0,
      nextLaneId: undefined,
      greetingMessageLane: '',
      rollbackLaneId: undefined,
      description: '',
      followupEnabled: false,
      followupCount: 1,
      followupMessage1: '',
      followupDelay1: 1,
      followupMessage2: '',
      followupDelay2: 3,
      followupMessage3: '',
      followupDelay3: 4,
      followupType: 'multiple',
      timeLaneUnit: 'hours',
      aiGuidance1: '',
      aiGuidance2: '',
      aiGuidance3: '',
      sendMetaConversion: false,
      metaConversionName: '',
      metaEventName: '',
      metaLeadStatus: '',
      metaValue: '',
      metaCurrency: '',
      metaCustomEventType: '',
      metaRule: '',
      metaConversionStatus: '',
      metaLastError: '',
    })
  }

  const handleChange = (field: keyof TagData, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const expectedRule = useMemo(
    () => buildMetaRule(formData.metaEventName || 'LeadSubmitted', formData.metaLeadStatus || slugLeadStatus(formData.name)),
    [formData.metaEventName, formData.metaLeadStatus, formData.name]
  )

  const metaValidation = useMemo(() => getMetaValidation(formData), [formData])

  const reportUrl = useMemo(() => {
    if (!tagId) return ''
    const key = (formData.key || formData.name || '').trim()
    if (!key) return '/kanban-lead-conversions'
    return `/kanban-lead-conversions?kanbanKey=${encodeURIComponent(key)}`
  }, [tagId, formData.key, formData.name])

  const applyLeadPreset = () => {
    const leadStatus = formData.metaLeadStatus?.trim() || slugLeadStatus(formData.name)
    setFormData((prev) => ({
      ...prev,
      metaConversionName: prev.metaConversionName || `Kanban ${prev.name || 'Lead'}`.slice(0, 60),
      metaEventName: 'LeadSubmitted',
      metaLeadStatus: leadStatus,
      metaCustomEventType: 'LEAD',
      metaRule: buildMetaRule('LeadSubmitted', leadStatus),
    }))
  }

  const refreshRule = () => {
    const leadStatus = formData.metaLeadStatus?.trim() || slugLeadStatus(formData.name)
    setFormData((prev) => ({
      ...prev,
      metaLeadStatus: leadStatus,
      metaRule: buildMetaRule(prev.metaEventName || 'LeadSubmitted', leadStatus),
    }))
  }

  const handleSubmit = async () => {
    if (!formData.name || formData.name.trim().length < 3) {
      toast.error('El nombre debe tener al menos 3 caracteres')
      return
    }
    const validation = getMetaValidation(formData)
    if (validation.errors.length > 0) {
      toast.error(validation.errors[0])
      return
    }

    try {
      setLoading(true)
      const data = {
        ...formData,
        timeLane: formData.timeLane || 0,
        nextLaneId: formData.nextLaneId || null,
        greetingMessageLane: formData.greetingMessageLane || '',
        rollbackLaneId: formData.rollbackLaneId || null,
      }

      if (tagId) {
        await api.put(`/tags/${tagId}`, data)
        toast.success('Etiqueta actualizada correctamente')
      } else {
        await api.post('/tags', data)
        toast.success('Etiqueta creada correctamente')
      }
      onSaved()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      console.error('Error saving tag:', error)
      toast.error(err.response?.data?.message || 'Error al guardar la etiqueta')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!tagId) return
    if (!window.confirm('¿Estás seguro de eliminar esta etiqueta?')) return

    try {
      setLoading(true)
      await api.delete(`/tags/${tagId}`)
      toast.success('Etiqueta eliminada correctamente')
      onSaved()
    } catch (error) {
      console.error('Error deleting tag:', error)
      toast.error('Error al eliminar la etiqueta')
    } finally {
      setLoading(false)
    }
  }

  const handleAIRecommend = async () => {
    if (!formData.name || formData.name.trim().length < 2) {
      toast.error('Escribe un nombre de etiqueta (mínimo 2 caracteres) antes de pedir recomendación')
      return
    }

    try {
      setAiLoading(true)
      setAiReasoning(null)
      const response = await api.post<{ success: boolean; data: AIRecommendation }>(
        '/tags/ai-recommend',
        {
          name: formData.name.trim(),
          description: formData.description?.trim() || '',
        }
      )
      const rec = response.data.data

      // Limpiar guidance anterior y mostrar reasoning
      setAiReasoning(rec.reasoning)

      // Actualizar formData con recomendación de IA
      setFormData((prev) => ({
        ...prev,
        followupDelay1: rec.followupDelay1,
        followupDelay2: rec.followupDelay2,
        followupDelay3: rec.followupDelay3,
        aiGuidance1: rec.aiGuidance1 || '',
        aiGuidance2: rec.aiGuidance2 || '',
        aiGuidance3: rec.aiGuidance3 || '',
      }))

      toast.success('Recomendación IA aplicada')
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Error al generar recomendación IA')
    } finally {
      setAiLoading(false)
    }
  }

  const handleMetaAIRecommend = async () => {
    if (!formData.name || formData.name.trim().length < 2) {
      toast.error('Escribe un nombre de etiqueta (mínimo 2 caracteres) antes de pedir sugerencia')
      return
    }

    try {
      setMetaAiLoading(true)
      setMetaAiReasoning(null)
      const response = await api.post<{ success: boolean; data: MetaConversionRecommendation }>(
        '/tags/meta-conversion/ai-recommend',
        {
          name: formData.name.trim(),
          description: formData.description?.trim() || '',
        }
      )
      const rec = response.data.data
      setMetaAiReasoning(rec.reasoning)

      // La IA solo rellena campos sugeridos. El usuario revisa y guarda.
      setFormData((prev) => ({
        ...prev,
        metaConversionName: rec.metaConversionName || '',
        metaEventName: rec.metaEventName || '',
        metaLeadStatus: rec.metaLeadStatus || '',
        metaCustomEventType: rec.metaCustomEventType || '',
        metaRule: rec.metaRule || '',
      }))

      toast.success('Sugerencia IA aplicada. Revisa y guarda.')
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err.response?.data?.message || 'Error al generar sugerencia IA')
    } finally {
      setMetaAiLoading(false)
    }
  }

  const metaStatusChip = () => {
    const status = formData.metaConversionStatus
    if (!status) return null
    const map: Record<string, { color: 'success' | 'danger' | 'warning' | 'neutral'; label: string }> = {
      synced: { color: 'success', label: 'Sincronizado con Meta' },
      failed: { color: 'danger', label: 'Error de sincronización' },
      pending: { color: 'warning', label: 'Pendiente de sincronizar' },
      disabled: { color: 'neutral', label: 'Deshabilitado' },
    }
    const cfg = map[status] || { color: 'neutral' as const, label: status }
    return (
      <Chip size="sm" variant="soft" color={cfg.color}>
        {cfg.label}
      </Chip>
    )
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{
          width: 600,
          maxWidth: '95vw',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <ModalClose variant="plain" sx={{ m: 1 }} />
        <Typography
          level="title-lg"
          fontWeight="lg"
          sx={{ pr: 4, mb: 1 }}
        >
          {tagId ? 'Editar Etiqueta Funnel' : 'Nueva Etiqueta Funnel'}
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, py: 1 }}>

          {/* Nombre + Color + Toggle */}
          <Stack direction="row" spacing={1.5} alignItems="center">
            <FormControl sx={{ flex: 1 }}>
              <FormLabel>Nombre</FormLabel>
              <Input
                placeholder="Nombre de la etapa"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                required
              />
            </FormControl>
            <FormControl sx={{ width: 80 }}>
              <FormLabel>Color</FormLabel>
              <Input
                type="color"
                value={formData.color}
                onChange={(e) => handleChange('color', e.target.value)}
                sx={{ height: 40, p: 0.5 }}
              />
            </FormControl>
            <Box sx={{ pt: 2 }}>
              <Switch
                checked={!!formData.kanban}
                onChange={(e) => handleChange('kanban', e.target.checked ? 1 : 0)}
                size="sm"
                endDecorator={<Typography level="body-xs">Kanban</Typography>}
              />
            </Box>
          </Stack>

          {/* Preview */}
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography level="body-sm" color="neutral">
              Vista previa:
            </Typography>
            <Chip
              size="sm"
              sx={{
                bgcolor: formData.color,
                color: '#fff',
                fontWeight: 600,
              }}
            >
              {formData.name || 'Etiqueta'}
            </Chip>
          </Stack>

          <Divider />

          {/* Configuración de Lane */}
          <Box>
            <Typography level="title-sm" fontWeight="bold" sx={{ mb: 1.5 }}>
              Configuración de Lane
            </Typography>
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <FormControl size="sm" sx={{ width: 130 }}>
                  <FormLabel>Tiempo máximo</FormLabel>
                  <Input
                    type="number"
                    size="sm"
                    value={formData.timeLane || 0}
                    onChange={(e) => handleChange('timeLane', parseInt(e.target.value) || 0)}
                    slotProps={{ input: { min: 0 } }}
                  />
                </FormControl>
                <FormControl size="sm" sx={{ width: 120 }}>
                  <FormLabel>Unidad</FormLabel>
                  <Select
                    size="sm"
                    value={formData.timeLaneUnit || 'hours'}
                    onChange={(_, v) => handleChange('timeLaneUnit', v)}
                  >
                    <Option value="minutes">Minutos</Option>
                    <Option value="hours">Horas</Option>
                    <Option value="days">Días</Option>
                  </Select>
                </FormControl>
                <FormControl size="sm" sx={{ flex: 1 }}>
                  <FormLabel>Etapa siguiente</FormLabel>
                  <Select
                    size="sm"
                    value={formData.nextLaneId != null ? String(formData.nextLaneId) : ''}
                    onChange={(_, v) => handleChange('nextLaneId', v ? Number(v) : undefined)}
                    placeholder="Sin auto-avance"
                  >
                    {kanbanTags.map((t) => (
                      <Option key={t.id} value={String(t.id)}>
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          <Box
                            sx={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              bgcolor: t.color,
                            }}
                          />
                          {t.name}
                        </Stack>
                      </Option>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="sm" sx={{ flex: 1 }}>
                  <FormLabel>Rollback</FormLabel>
                  <Select
                    size="sm"
                    value={formData.rollbackLaneId != null ? String(formData.rollbackLaneId) : ''}
                    onChange={(_, v) => handleChange('rollbackLaneId', v ? Number(v) : undefined)}
                    placeholder="Sin rollback"
                  >
                    {kanbanTags.map((t) => (
                      <Option key={t.id} value={String(t.id)}>
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          <Box
                            sx={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              bgcolor: t.color,
                            }}
                          />
                          {t.name}
                        </Stack>
                      </Option>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
              <FormControl size="sm">
                <FormLabel>Mensaje de bienvenida</FormLabel>
                <Textarea
                  minRows={2}
                  placeholder="Mensaje que se envía al entrar en esta etapa..."
                  value={formData.greetingMessageLane || ''}
                  onChange={(e) => handleChange('greetingMessageLane', e.target.value)}
                  size="sm"
                />
              </FormControl>
            </Stack>
          </Box>

          {/* Descripción */}
          <FormControl size="sm">
            <FormLabel>Descripción</FormLabel>
            <Textarea
              minRows={2}
              placeholder="Descripción de la etapa..."
              value={formData.description || ''}
              onChange={(e) => handleChange('description', e.target.value)}
              size="sm"
            />
          </FormControl>

          <Divider />

          {/* Conversión personalizada Meta */}
          <Box>
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Typography level="title-sm" fontWeight="bold">
                  Conversión personalizada Meta
                </Typography>
                {metaStatusChip()}
              </Stack>
              <Tooltip title="Al caer un ticket en esta etapa, se envía una conversión a Meta según esta configuración">
                <Switch
                  checked={!!formData.sendMetaConversion}
                  onChange={(e) => handleChange('sendMetaConversion', e.target.checked)}
                  size="sm"
                  endDecorator={<Typography level="body-xs">Enviar conversión a Meta</Typography>}
                />
              </Tooltip>
            </Stack>

            {formData.sendMetaConversion && (
              <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  alignItems={{ xs: 'stretch', sm: 'center' }}
                  justifyContent="space-between"
                >
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Button
                      size="sm"
                      variant="solid"
                      color="primary"
                      onClick={applyLeadPreset}
                    >
                      Usar como lead
                    </Button>
                    <Tooltip title="La IA sugiere evento, lead status, tipo y rule. Tú revisas y guardas.">
                      <Button
                        size="sm"
                        variant="outlined"
                        color="primary"
                        startDecorator={metaAiLoading ? undefined : <AutoAwesomeIcon sx={{ fontSize: 14 }} />}
                        onClick={handleMetaAIRecommend}
                        disabled={metaAiLoading || !formData.name?.trim()}
                        sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                      >
                        {metaAiLoading ? 'Analizando...' : 'Rellenar con IA'}
                      </Button>
                    </Tooltip>
                  </Stack>
                  {tagId && reportUrl && (
                    <Button
                      size="sm"
                      variant="plain"
                      color="neutral"
                      component="a"
                      href={reportUrl}
                      target="_blank"
                      rel="noreferrer"
                      startDecorator={<OpenInNewIcon sx={{ fontSize: 15 }} />}
                    >
                      Historial
                    </Button>
                  )}
                </Stack>

                {metaAiReasoning && (
                  <Alert
                    variant="soft"
                    color="primary"
                    sx={{ fontSize: 'xs', py: 0.5 }}
                    startDecorator={<AutoAwesomeIcon sx={{ fontSize: 12 }} />}
                  >
                    {metaAiReasoning}
                  </Alert>
                )}
                {metaAiLoading && <LinearProgress sx={{ mb: 0.5 }} />}

                {/* Estado de error Meta */}
                {formData.metaConversionStatus === 'failed' && formData.metaLastError && (
                  <Alert variant="soft" color="danger" sx={{ fontSize: 'xs', py: 0.5 }}>
                    {formData.metaLastError}
                  </Alert>
                )}

                {metaValidation.errors.length > 0 && (
                  <Alert variant="soft" color="danger" sx={{ fontSize: 'xs', py: 0.5 }}>
                    {metaValidation.errors[0]}
                  </Alert>
                )}
                {metaValidation.errors.length === 0 && metaValidation.warnings.length > 0 && (
                  <Alert variant="soft" color="warning" sx={{ fontSize: 'xs', py: 0.5 }}>
                    {metaValidation.warnings[0]}
                  </Alert>
                )}

                <FormControl size="sm">
                  <FormLabel>Nombre de conversión</FormLabel>
                  <Input
                    size="sm"
                    placeholder="Ej: Kanban Interés"
                    value={formData.metaConversionName || ''}
                    onChange={(e) => handleChange('metaConversionName', e.target.value)}
                  />
                </FormControl>

                <Stack direction="row" spacing={1.5}>
                  <FormControl size="sm" sx={{ flex: 1 }}>
                    <FormLabel>Evento base</FormLabel>
                    <Input
                      size="sm"
                      placeholder="Ej: LeadSubmitted"
                      value={formData.metaEventName || ''}
                      onChange={(e) => handleChange('metaEventName', e.target.value)}
                    />
                  </FormControl>
                  <FormControl size="sm" sx={{ flex: 1 }}>
                    <FormLabel>Lead status</FormLabel>
                    <Input
                      size="sm"
                      placeholder="Ej: interesado"
                      value={formData.metaLeadStatus || ''}
                      onChange={(e) => handleChange('metaLeadStatus', e.target.value)}
                    />
                  </FormControl>
                </Stack>

                {/* [Fase2·B5.1] Valor por etapa. Las columnas existían y el dispatcher ya las
                    enviaba a Meta, pero no había forma de escribirlas => Meta recibía las
                    conversiones SIN valor => ROAS incalculable. Vacío = sin valor (no 0). */}
                <Stack direction="row" spacing={1.5}>
                  <FormControl size="sm" sx={{ flex: 2 }}>
                    <FormLabel>Valor de la etapa (opcional)</FormLabel>
                    <Input
                      size="sm"
                      type="number"
                      slotProps={{ input: { min: 0, step: '0.01' } }}
                      placeholder="Ej: 25.00 — vacío = sin valor"
                      value={formData.metaValue ?? ''}
                      onChange={(e) => handleChange('metaValue', e.target.value)}
                    />
                    <Typography level="body-xs" sx={{ mt: 0.25, color: 'text.tertiary' }}>
                      Lo que vale para tu negocio que un lead llegue a esta etapa. Es lo que Meta usa
                      para calcular el ROAS y optimizar la pauta.
                    </Typography>
                  </FormControl>
                  <FormControl size="sm" sx={{ flex: 1 }}>
                    <FormLabel>Moneda</FormLabel>
                    <Input
                      size="sm"
                      placeholder="USD"
                      value={formData.metaCurrency ?? ''}
                      onChange={(e) => handleChange('metaCurrency', e.target.value.toUpperCase())}
                    />
                  </FormControl>
                </Stack>

                <Box
                  sx={{
                    border: '1px solid',
                    borderColor: 'neutral.outlinedBorder',
                    borderRadius: 6,
                    p: 1.25,
                    bgcolor: 'background.level1',
                  }}
                >
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Typography level="body-xs" fontWeight="lg">
                        Payload al mover un ticket
                      </Typography>
                      <Chip size="sm" variant="soft" color="primary">
                        {formData.metaEventName || 'event_name'}
                      </Chip>
                      <Chip size="sm" variant="soft" color="neutral">
                        {formData.metaLeadStatus || 'lead_status'}
                      </Chip>
                    </Stack>
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                      {[
                        'contact_name',
                        'contact_number',
                        'whatsapp_name',
                        'whatsapp_number',
                        'kanban_tag_name',
                      ].map((field) => (
                        <Chip key={field} size="sm" variant="outlined" color="neutral">
                          {field}
                        </Chip>
                      ))}
                    </Stack>
                  </Stack>
                </Box>

                <FormControl size="sm">
                  <FormLabel>Custom event type</FormLabel>
                  <Select
                    size="sm"
                    value={formData.metaCustomEventType || ''}
                    onChange={(_, v) => handleChange('metaCustomEventType', v || '')}
                    placeholder="Selecciona un tipo"
                  >
                    {META_EVENT_TYPES.map((t) => (
                      <Option key={t} value={t}>{t}</Option>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="sm">
                  <FormLabel>
                    <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="space-between">
                      <span>Rule (JSON)</span>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <Button size="sm" variant="plain" onClick={refreshRule}>
                          Regenerar
                        </Button>
                        <Tooltip
                          variant="soft"
                          placement="top"
                          title={
                            <Typography level="body-xs" sx={{ whiteSpace: 'pre-line', maxWidth: 520 }}>
                              {RULE_HELP}
                            </Typography>
                          }
                        >
                          <HelpOutlineIcon sx={{ fontSize: 15, cursor: 'help', color: 'primary.500' }} />
                        </Tooltip>
                      </Stack>
                    </Stack>
                  </FormLabel>
                  <Textarea
                    size="sm"
                    minRows={3}
                    placeholder={expectedRule}
                    value={formData.metaRule || ''}
                    onChange={(e) => handleChange('metaRule', e.target.value)}
                    sx={{ fontFamily: 'monospace', fontSize: 'xs' }}
                  />
                </FormControl>

                <Box
                  sx={{
                    border: '1px dashed',
                    borderColor: 'neutral.outlinedBorder',
                    borderRadius: 6,
                    p: 1,
                  }}
                >
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip size="sm" variant="soft" color="neutral">
                      Destino automático
                    </Chip>
                    <Chip size="sm" variant="soft" color="neutral">
                      Dedupe: contacto + etapa + evento
                    </Chip>
                    <Chip size="sm" variant="soft" color="neutral">
                      Cambios aplican a futuros movimientos
                    </Chip>
                  </Stack>
                </Box>
              </Box>
            )}
          </Box>

          <Divider />

          {/* Mensajes de Seguimiento */}
          <Box>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              justifyContent="space-between"
            >
              <Typography level="title-sm" fontWeight="bold">
                Mensajes de Seguimiento
              </Typography>
              <Switch
                checked={formData.followupEnabled || false}
                onChange={(e) => handleChange('followupEnabled', e.target.checked)}
                size="sm"
              />
            </Stack>

            {formData.followupEnabled && (
              <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>

                {/* Tipo + Cantidad */}
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <FormControl size="sm">
                    <FormLabel>Cantidad</FormLabel>
                    <Select
                      size="sm"
                      value={String(formData.followupCount || 1)}
                      onChange={(_, v) => handleChange('followupCount', parseInt(String(v)))}
                    >
                      <Option value={1}>1 mensaje</Option>
                      <Option value={2}>2 mensajes</Option>
                      <Option value={3}>3 mensajes</Option>
                    </Select>
                  </FormControl>
                  <FormControl size="sm" sx={{ flex: 1 }}>
                    <FormLabel>Tipo de envío</FormLabel>
                    <Select
                      size="sm"
                      value={formData.followupType || 'multiple'}
                      onChange={(_, v) => handleChange('followupType', v)}
                    >
                      <Option value="single">Mensaje único</Option>
                      <Option value="multiple">Múltiples mensajes</Option>
                    </Select>
                  </FormControl>
                  <Tooltip title="La IA analiza el nombre y descripción de la etapa para sugerir intervalos óptimos y prompts de contexto">
                    <Button
                      size="sm"
                      variant="outlined"
                      color="primary"
                      startDecorator={aiLoading ? undefined : <AutoAwesomeIcon sx={{ fontSize: 14 }} />}
                      onClick={handleAIRecommend}
                      disabled={aiLoading || !formData.name?.trim()}
                      sx={{ mt: 1.5, whiteSpace: 'nowrap', flexShrink: 0 }}
                    >
                      {aiLoading ? 'Analizando...' : '🤖 IA'}
                    </Button>
                  </Tooltip>
                </Stack>

                {/* Razonamiento IA */}
                {aiReasoning && (
                  <Alert
                    variant="soft"
                    color="primary"
                    sx={{ fontSize: 'xs', py: 0.5 }}
                    startDecorator={<AutoAwesomeIcon sx={{ fontSize: 12 }} />}
                  >
                    {aiReasoning}
                  </Alert>
                )}

                {aiLoading && <LinearProgress sx={{ mb: 0.5 }} />}

                {/* Mensaje 1 */}
                {((formData.followupCount ?? 1) >= 1 && (
                  <Box
                    sx={{
                      p: 1.5,
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 'md',
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                      <Chip size="sm" color="primary" variant="solid">1</Chip>
                      <Typography level="body-sm" fontWeight="bold">Mensaje 1</Typography>
                      <Select
                        size="sm"
                        variant="plain"
                        value={formData.followupDelay1 || 1}
                        onChange={(_, v) => handleChange('followupDelay1', Number(v))}
                        sx={{ ml: 'auto', minWidth: 80 }}
                      >
                        {DELAY_OPTIONS.map((h) => (
                          <Option key={h} value={String(h)}>{h}h</Option>
                        ))}
                      </Select>
                    </Stack>
                    <Textarea
                      size="sm"
                      minRows={2}
                      placeholder="Escribe el mensaje de seguimiento..."
                      value={formData.followupMessage1 || ''}
                      onChange={(e) => handleChange('followupMessage1', e.target.value)}
                    />
                    <Textarea
                      size="sm"
                      minRows={1}
                      placeholder="💡 Prompt IA: consejo de contexto para el agente (ej: 'El lead mostró interés en el producto, sé amable yenthsiasta')..."
                      value={formData.aiGuidance1 || ''}
                      onChange={(e) => handleChange('aiGuidance1', e.target.value)}
                      sx={{
                        mt: 0.5,
                        fontSize: 'xs',
                        '& textarea': { color: 'text.secondary' }
                      }}
                    />
                  </Box>
                ))}

                {/* Mensaje 2 */}
                {((formData.followupCount ?? 1) >= 2 && (
                  <Box
                    sx={{
                      p: 1.5,
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 'md',
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                      <Chip size="sm" color="primary" variant="solid">2</Chip>
                      <Typography level="body-sm" fontWeight="bold">Mensaje 2</Typography>
                      <Select
                        size="sm"
                        variant="plain"
                        value={formData.followupDelay2 || 3}
                        onChange={(_, v) => handleChange('followupDelay2', Number(v))}
                        sx={{ ml: 'auto', minWidth: 80 }}
                      >
                        {DELAY_OPTIONS.map((h) => (
                          <Option key={h} value={String(h)}>{h}h</Option>
                        ))}
                      </Select>
                    </Stack>
                    <Textarea
                      size="sm"
                      minRows={2}
                      placeholder="Escribe el segundo mensaje de seguimiento..."
                      value={formData.followupMessage2 || ''}
                      onChange={(e) => handleChange('followupMessage2', e.target.value)}
                    />
                    <Textarea
                      size="sm"
                      minRows={1}
                      placeholder="💡 Prompt IA: consejo de contexto para el agente (ej: 'Lead sin respuesta, ofrece ayuda concreta')..."
                      value={formData.aiGuidance2 || ''}
                      onChange={(e) => handleChange('aiGuidance2', e.target.value)}
                      sx={{
                        mt: 0.5,
                        fontSize: 'xs',
                        '& textarea': { color: 'text.secondary' }
                      }}
                    />
                  </Box>
                ))}

                {/* Mensaje 3 */}
                {((formData.followupCount ?? 1) >= 3 && (
                  <Box
                    sx={{
                      p: 1.5,
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 'md',
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                      <Chip size="sm" color="primary" variant="solid">3</Chip>
                      <Typography level="body-sm" fontWeight="bold">Mensaje 3</Typography>
                      <Select
                        size="sm"
                        variant="plain"
                        value={formData.followupDelay3 || 4}
                        onChange={(_, v) => handleChange('followupDelay3', Number(v))}
                        sx={{ ml: 'auto', minWidth: 80 }}
                      >
                        {DELAY_OPTIONS.map((h) => (
                          <Option key={h} value={String(h)}>{h}h</Option>
                        ))}
                      </Select>
                    </Stack>
                    <Textarea
                      size="sm"
                      minRows={2}
                      placeholder="Escribe el tercer mensaje de seguimiento..."
                      value={formData.followupMessage3 || ''}
                      onChange={(e) => handleChange('followupMessage3', e.target.value)}
                    />
                    <Textarea
                      size="sm"
                      minRows={1}
                      placeholder="💡 Prompt IA: consejo de contexto para el agente (ej: 'Último intento, ofrece incentivo o cierra el ticket')..."
                      value={formData.aiGuidance3 || ''}
                      onChange={(e) => handleChange('aiGuidance3', e.target.value)}
                      sx={{
                        mt: 0.5,
                        fontSize: 'xs',
                        '& textarea': { color: 'text.secondary' }
                      }}
                    />
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>

        {/* Acciones */}
        <Stack
          direction="row"
          spacing={1}
          justifyContent="space-between"
          sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}
        >
          {tagId ? (
            <Tooltip title="Eliminar esta etiqueta">
              <Button
                color="danger"
                variant="soft"
                size="sm"
                startDecorator={<DeleteForever />}
                onClick={handleDelete}
                disabled={loading}
              >
                Eliminar
              </Button>
            </Tooltip>
          ) : (
            <Box />
          )}
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              size="sm"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              variant="solid"
              color="primary"
              size="sm"
              startDecorator={tagId ? <Edit /> : <Add />}
              onClick={handleSubmit}
              disabled={loading || !formData.name?.trim()}
              loading={loading}
            >
              {tagId ? 'Actualizar' : 'Crear'}
            </Button>
          </Stack>
        </Stack>
      </ModalDialog>
    </Modal>
  )
}

export default TagModal
