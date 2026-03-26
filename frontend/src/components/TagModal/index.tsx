import { useState, useEffect } from 'react'
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
import api from '../../services/api'
import { toast } from 'react-toastify'

interface TagData {
  id?: number
  name: string
  color: string
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
  const [formData, setFormData] = useState<TagData>({
    name: '',
    color: '#3b82f6',
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
    })
  }

  const handleChange = (field: keyof TagData, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async () => {
    if (!formData.name || formData.name.trim().length < 3) {
      toast.error('El nombre debe tener al menos 3 caracteres')
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
          {tagId ? 'Editar Etiqueta Kanban' : 'Nueva Etiqueta Kanban'}
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
