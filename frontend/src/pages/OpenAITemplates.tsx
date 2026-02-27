import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  Input,
  Textarea,
  Chip,
  IconButton,
  Select,
  Option,
  Modal,
  ModalDialog,
  ModalClose,
  FormControl,
  FormLabel,
  CircularProgress,
  Alert,
  Divider,
  Slider,
} from '@mui/joy'
import {
  Add as AddIcon,
  Search as SearchIcon,
  ContentCopy as CopyIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as UseIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  Code as CodeIcon,
  Refresh as RefreshIcon,
  Close as CloseIcon,
} from '@mui/icons-material'
import api from '../services/api'

interface PromptVariable {
  name: string
  description: string
  required: boolean
  defaultValue: string
}

interface PromptTemplate {
  id: number
  name: string
  description: string
  category: string
  systemPrompt: string
  userPromptTemplate: string
  variables: PromptVariable[]
  tags: string[]
  modelConfig: {
    model: string
    temperature: number
    maxTokens: number
  }
  isActive: boolean
  isFavorite: boolean
  usageCount: number
  createdAt: string
  updatedAt: string
}

interface FormData {
  name: string
  description: string
  category: string
  systemPrompt: string
  userPromptTemplate: string
  variables: string
  tags: string
  modelConfig: {
    model: string
    temperature: number
    maxTokens: number
  }
  isActive: boolean
  isFavorite: boolean
}

const CATEGORIES = [
  'analysis',
  'generation',
  'summary',
  'classification',
  'extraction',
  'translation',
  'other',
]

const CATEGORY_LABELS: Record<string, string> = {
  analysis: 'Analisis',
  generation: 'Generacion',
  summary: 'Resumen',
  classification: 'Clasificacion',
  extraction: 'Extraccion',
  translation: 'Traduccion',
  other: 'Otro',
}

const initialFormData: FormData = {
  name: '',
  description: '',
  category: 'generation',
  systemPrompt: '',
  userPromptTemplate: '',
  variables: '',
  tags: '',
  modelConfig: {
    model: 'gpt-4o',
    temperature: 0.7,
    maxTokens: 2000,
  },
  isActive: true,
  isFavorite: false,
}

export default function OpenAITemplates() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')

  const [openModal, setOpenModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      console.log('[OpenAITemplates] Fetching templates...')
      const response = await api.get('/ai/templates', {
        params: {
          category: filterCategory !== 'all' ? filterCategory : undefined,
          search: searchTerm || undefined,
        },
      })
      console.log('[OpenAITemplates] Templates loaded:', response.data)
      setTemplates(response.data)
    } catch (err: any) {
      console.error('[OpenAITemplates] Error fetching templates:', err)
      setError(err.response?.data?.error || 'Error al cargar plantillas')
    } finally {
      setLoading(false)
    }
  }, [filterCategory, searchTerm])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  const handleCreate = () => {
    setEditingTemplate(null)
    setFormData(initialFormData)
    setOpenModal(true)
  }

  const handleEdit = (template: PromptTemplate) => {
    console.log('[OpenAITemplates] Editing template:', template.id)
    setEditingTemplate(template)
    setFormData({
      name: template.name,
      description: template.description || '',
      category: template.category,
      systemPrompt: template.systemPrompt || '',
      userPromptTemplate: template.userPromptTemplate,
      variables: template.variables?.map(v => v.name).join(', ') || '',
      tags: template.tags?.join(', ') || '',
      modelConfig: {
        model: template.modelConfig?.model || 'gpt-4o',
        temperature: template.modelConfig?.temperature || 0.7,
        maxTokens: template.modelConfig?.maxTokens || 2000,
      },
      isActive: template.isActive,
      isFavorite: template.isFavorite,
    })
    setOpenModal(true)
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)

      // Parse variables from comma-separated string
      const variableNames = formData.variables
        .split(',')
        .map(v => v.trim())
        .filter(v => v.length > 0)

      const variables = variableNames.map(name => ({
        name,
        description: '',
        required: true,
        defaultValue: '',
      }))

      // Parse tags from comma-separated string
      const tags = formData.tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0)

      const payload = {
        name: formData.name,
        description: formData.description,
        category: formData.category,
        systemPrompt: formData.systemPrompt,
        userPromptTemplate: formData.userPromptTemplate,
        variables,
        tags,
        modelConfig: formData.modelConfig,
        isActive: formData.isActive,
        isFavorite: formData.isFavorite,
      }

      if (editingTemplate) {
        console.log('[OpenAITemplates] Updating template:', editingTemplate.id)
        await api.put(`/ai/templates/${editingTemplate.id}`, payload)
        setSuccess('Plantilla actualizada correctamente')
      } else {
        console.log('[OpenAITemplates] Creating new template')
        await api.post('/ai/templates', payload)
        setSuccess('Plantilla creada correctamente')
      }

      setOpenModal(false)
      fetchTemplates()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      console.error('[OpenAITemplates] Error saving template:', err)
      setError(err.response?.data?.error || 'Error al guardar plantilla')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      console.log('[OpenAITemplates] Deleting template:', id)
      await api.delete(`/ai/templates/${id}`)
      setSuccess('Plantilla eliminada correctamente')
      setDeleteConfirm(null)
      fetchTemplates()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      console.error('[OpenAITemplates] Error deleting template:', err)
      setError(err.response?.data?.error || 'Error al eliminar plantilla')
    }
  }

  const handleCopy = (template: PromptTemplate) => {
    const content = `System Prompt:\n${template.systemPrompt}\n\nUser Prompt Template:\n${template.userPromptTemplate}`
    navigator.clipboard.writeText(content)
    setSuccess('Plantilla copiada al portapapeles')
    setTimeout(() => setSuccess(null), 2000)
  }

  const handleToggleFavorite = async (template: PromptTemplate) => {
    try {
      await api.put(`/ai/templates/${template.id}`, {
        isFavorite: !template.isFavorite,
      })
      fetchTemplates()
    } catch (err: any) {
      console.error('[OpenAITemplates] Error toggling favorite:', err)
    }
  }

  const getCategoryColor = (category: string) => {
    const colors: Record<string, any> = {
      analysis: 'primary',
      generation: 'success',
      summary: 'warning',
      classification: 'info',
      extraction: 'danger',
      translation: 'neutral',
      other: 'neutral',
    }
    return colors[category] || 'neutral'
  }

  const filteredTemplates = templates.filter((template) => {
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      return (
        template.name.toLowerCase().includes(search) ||
        template.description?.toLowerCase().includes(search) ||
        template.tags?.some(tag => tag.toLowerCase().includes(search))
      )
    }
    return true
  })

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress size="lg" />
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography level="h2" sx={{ mb: 1 }}>
            Plantillas de IA
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Plantillas pre-configuradas listas para usar en tus flujos de trabajo
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startDecorator={<RefreshIcon />} onClick={fetchTemplates}>
            Recargar
          </Button>
          <Button startDecorator={<AddIcon />} onClick={handleCreate}>
            Nueva Plantilla
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert
          color="danger"
          sx={{ mb: 2 }}
          endDecorator={
            <IconButton variant="soft" color="danger" onClick={() => setError(null)}>
              <CloseIcon />
            </IconButton>
          }
        >
          {error}
        </Alert>
      )}

      {success && (
        <Alert
          color="success"
          sx={{ mb: 2 }}
          endDecorator={
            <IconButton variant="soft" color="success" onClick={() => setSuccess(null)}>
              <CloseIcon />
            </IconButton>
          }
        >
          {success}
        </Alert>
      )}

      {/* Filtros */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} md={6}>
          <Input
            placeholder="Buscar plantillas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            startDecorator={<SearchIcon />}
          />
        </Grid>
        <Grid xs={12} md={3}>
          <Select value={filterCategory} onChange={(_, val) => setFilterCategory(val as string)}>
            <Option value="all">Todas las categorias</Option>
            {CATEGORIES.map((cat) => (
              <Option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </Option>
            ))}
          </Select>
        </Grid>
        <Grid xs={12} md={3}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip size="sm">Total: {filteredTemplates.length}</Chip>
            <Chip size="sm" color="warning" startDecorator={<StarIcon />}>
              Favoritas: {templates.filter((t) => t.isFavorite).length}
            </Chip>
          </Box>
        </Grid>
      </Grid>

      {/* Grid de Templates */}
      {filteredTemplates.length === 0 ? (
        <Card>
          <CardContent>
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 2 }}>
                {searchTerm || filterCategory !== 'all'
                  ? 'No se encontraron plantillas con los filtros aplicados'
                  : 'No hay plantillas configuradas'}
              </Typography>
              <Button startDecorator={<AddIcon />} onClick={handleCreate}>
                Crear Primera Plantilla
              </Button>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={3}>
          {filteredTemplates.map((template) => (
            <Grid key={template.id} xs={12} md={6} lg={4}>
              <Card variant="outlined">
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography level="title-lg">{template.name}</Typography>
                    <IconButton
                      size="sm"
                      variant="plain"
                      color={template.isFavorite ? 'warning' : 'neutral'}
                      onClick={() => handleToggleFavorite(template)}
                    >
                      {template.isFavorite ? <StarIcon /> : <StarBorderIcon />}
                    </IconButton>
                  </Box>

                  <Typography level="body-sm" sx={{ mb: 2, minHeight: 40 }}>
                    {template.description || 'Sin descripcion'}
                  </Typography>

                  <Box sx={{ display: 'flex', gap: 0.5, mb: 2, flexWrap: 'wrap' }}>
                    <Chip size="sm" color={getCategoryColor(template.category)}>
                      {CATEGORY_LABELS[template.category] || template.category}
                    </Chip>
                    {template.tags?.slice(0, 3).map((tag) => (
                      <Chip key={tag} size="sm" variant="outlined">
                        {tag}
                      </Chip>
                    ))}
                    {template.tags?.length > 3 && (
                      <Chip size="sm" variant="outlined">
                        +{template.tags.length - 3}
                      </Chip>
                    )}
                  </Box>

                  <Box sx={{ mb: 2 }}>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                      Modelo: {template.modelConfig?.model || 'gpt-4o'}
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                      Temperature: {template.modelConfig?.temperature || 0.7} | Max Tokens: {template.modelConfig?.maxTokens || 2000}
                    </Typography>
                    {template.usageCount > 0 && (
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        Usado {template.usageCount.toLocaleString()} veces
                      </Typography>
                    )}
                  </Box>

                  {template.variables && template.variables.length > 0 && (
                    <Box sx={{ display: 'flex', gap: 0.5, mb: 2, flexWrap: 'wrap' }}>
                      {template.variables.map((variable) => (
                        <Chip key={variable.name} size="sm" variant="soft" startDecorator={<CodeIcon />}>
                          {variable.name}
                        </Chip>
                      ))}
                    </Box>
                  )}

                  <Box
                    sx={{
                      p: 1.5,
                      bgcolor: 'background.level1',
                      borderRadius: 'sm',
                      mb: 2,
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      overflow: 'auto',
                      maxHeight: 100,
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    {(template.userPromptTemplate || template.systemPrompt || '').substring(0, 150)}
                    {((template.userPromptTemplate || template.systemPrompt || '').length > 150) && '...'}
                  </Box>

                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      size="sm"
                      fullWidth
                      startDecorator={<UseIcon />}
                      onClick={() => handleCopy(template)}
                    >
                      Usar
                    </Button>
                    <IconButton size="sm" variant="outlined" onClick={() => handleCopy(template)}>
                      <CopyIcon />
                    </IconButton>
                    <IconButton size="sm" variant="outlined" onClick={() => handleEdit(template)}>
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="sm"
                      variant="outlined"
                      color="danger"
                      onClick={() => setDeleteConfirm(template.id)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Modal Crear/Editar */}
      <Modal open={openModal} onClose={() => setOpenModal(false)}>
        <ModalDialog sx={{ minWidth: 700, maxWidth: 900, maxHeight: '90vh', overflow: 'auto' }}>
          <ModalClose />
          <Typography level="h4" sx={{ mb: 2 }}>
            {editingTemplate ? 'Editar Plantilla' : 'Crear Nueva Plantilla'}
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Grid container spacing={2}>
              <Grid xs={12} md={8}>
                <FormControl required>
                  <FormLabel>Nombre de la Plantilla</FormLabel>
                  <Input
                    placeholder="Ej: Analisis de Sentimiento"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </FormControl>
              </Grid>
              <Grid xs={12} md={4}>
                <FormControl required>
                  <FormLabel>Categoria</FormLabel>
                  <Select
                    value={formData.category}
                    onChange={(_, val) => setFormData({ ...formData, category: val as string })}
                  >
                    {CATEGORIES.map((cat) => (
                      <Option key={cat} value={cat}>
                        {CATEGORY_LABELS[cat]}
                      </Option>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            <FormControl>
              <FormLabel>Descripcion</FormLabel>
              <Input
                placeholder="Describe brevemente para que sirve esta plantilla"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </FormControl>

            <FormControl>
              <FormLabel>System Prompt</FormLabel>
              <Textarea
                minRows={3}
                placeholder="Define el rol y comportamiento del asistente..."
                value={formData.systemPrompt}
                onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
              />
              <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                Define el contexto y personalidad del asistente de IA
              </Typography>
            </FormControl>

            <FormControl required>
              <FormLabel>Plantilla de Prompt del Usuario</FormLabel>
              <Textarea
                minRows={6}
                placeholder="Escribe el prompt aqui. Usa {variable} para variables dinamicas..."
                value={formData.userPromptTemplate}
                onChange={(e) => setFormData({ ...formData, userPromptTemplate: e.target.value })}
              />
              <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                Usa llaves para definir variables: {'{variable}'}, {'{contexto}'}, {'{mensaje}'}
              </Typography>
            </FormControl>

            <Grid container spacing={2}>
              <Grid xs={12} md={6}>
                <FormControl>
                  <FormLabel>Variables (separadas por coma)</FormLabel>
                  <Input
                    placeholder="mensaje, contexto, tono"
                    value={formData.variables}
                    onChange={(e) => setFormData({ ...formData, variables: e.target.value })}
                  />
                </FormControl>
              </Grid>
              <Grid xs={12} md={6}>
                <FormControl>
                  <FormLabel>Tags (separados por coma)</FormLabel>
                  <Input
                    placeholder="analisis, sentimiento, soporte"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  />
                </FormControl>
              </Grid>
            </Grid>

            <Divider />
            <Typography level="title-sm">Configuracion del Modelo</Typography>

            <Grid container spacing={2}>
              <Grid xs={12} md={4}>
                <FormControl>
                  <FormLabel>Modelo</FormLabel>
                  <Select
                    value={formData.modelConfig.model}
                    onChange={(_, val) => setFormData({
                      ...formData,
                      modelConfig: { ...formData.modelConfig, model: val as string }
                    })}
                  >
                    <Option value="gpt-4o">GPT-4o</Option>
                    <Option value="gpt-4o-mini">GPT-4o Mini</Option>
                    <Option value="gpt-4-turbo">GPT-4 Turbo</Option>
                    <Option value="gpt-3.5-turbo">GPT-3.5 Turbo</Option>
                    <Option value="claude-3-5-sonnet">Claude 3.5 Sonnet</Option>
                    <Option value="gemini-pro">Gemini Pro</Option>
                  </Select>
                </FormControl>
              </Grid>
              <Grid xs={12} md={4}>
                <FormControl>
                  <FormLabel>Temperature: {formData.modelConfig.temperature}</FormLabel>
                  <Slider
                    value={formData.modelConfig.temperature}
                    onChange={(_, value) => setFormData({
                      ...formData,
                      modelConfig: { ...formData.modelConfig, temperature: value as number }
                    })}
                    min={0}
                    max={2}
                    step={0.1}
                  />
                </FormControl>
              </Grid>
              <Grid xs={12} md={4}>
                <FormControl>
                  <FormLabel>Max Tokens</FormLabel>
                  <Input
                    type="number"
                    value={formData.modelConfig.maxTokens}
                    onChange={(e) => setFormData({
                      ...formData,
                      modelConfig: { ...formData.modelConfig, maxTokens: parseInt(e.target.value) || 2000 }
                    })}
                  />
                </FormControl>
              </Grid>
            </Grid>

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 2 }}>
              <Button variant="outlined" onClick={() => setOpenModal(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} loading={saving}>
                {editingTemplate ? 'Guardar Cambios' : 'Crear Plantilla'}
              </Button>
            </Box>
          </Box>
        </ModalDialog>
      </Modal>

      {/* Modal Confirmar Eliminacion */}
      <Modal open={deleteConfirm !== null} onClose={() => setDeleteConfirm(null)}>
        <ModalDialog>
          <Typography level="h4" sx={{ mb: 2 }}>
            Confirmar Eliminacion
          </Typography>
          <Typography level="body-md" sx={{ mb: 3 }}>
            ¿Estas seguro de que deseas eliminar esta plantilla? Esta accion no se puede deshacer.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
            <Button variant="outlined" onClick={() => setDeleteConfirm(null)}>
              Cancelar
            </Button>
            <Button
              color="danger"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            >
              Eliminar
            </Button>
          </Box>
        </ModalDialog>
      </Modal>
    </Box>
  )
}
