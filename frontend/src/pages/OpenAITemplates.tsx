import { useState, useEffect, useCallback } from 'react'
import {
  Sparkle,
  Plus,
  MagnifyingGlass,
  Copy,
  PencilSimple,
  Trash,
  Play,
  Star,
  Code,
  ArrowClockwise,
  X,
} from '@phosphor-icons/react'
import { CircularProgress } from '@mui/joy'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge, type BadgeProps } from '@/components/ui/badge'
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

// Estilo compartido para textareas (mismo look que el Input del design system)
const textareaClass =
  'w-full rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'

// Botón de acción compacto para las tarjetas
const cardActionClass =
  'flex size-9 shrink-0 items-center justify-center rounded-md border border-input bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground'

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

  const getCategoryVariant = (category: string): BadgeProps['variant'] => {
    const variants: Record<string, BadgeProps['variant']> = {
      analysis: 'primary',
      generation: 'success',
      summary: 'warning',
      classification: 'accent',
      extraction: 'destructive',
      translation: 'neutral',
      other: 'neutral',
    }
    return variants[category] || 'neutral'
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
              <Sparkle className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Plantillas de IA
              </h1>
              <p className="text-sm text-muted-foreground">
                Plantillas pre-configuradas listas para usar en tus flujos de trabajo
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchTemplates}>
              <ArrowClockwise className="size-4" aria-hidden />
              Recargar
            </Button>
            <Button size="sm" onClick={handleCreate}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nueva Plantilla
            </Button>
          </div>
        </div>

        {/* Alertas */}
        {error && (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/12 px-4 py-3 text-sm text-destructive-text">
            <span>{error}</span>
            <button
              type="button"
              aria-label="Cerrar alerta"
              onClick={() => setError(null)}
              className="shrink-0 rounded-md p-0.5 text-destructive-text/80 transition-colors hover:bg-destructive/12 hover:text-destructive-text"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        {success && (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-success/30 bg-success/14 px-4 py-3 text-sm text-success-text">
            <span>{success}</span>
            <button
              type="button"
              aria-label="Cerrar alerta"
              onClick={() => setSuccess(null)}
              className="shrink-0 rounded-md p-0.5 text-success-text/80 transition-colors hover:bg-success/14 hover:text-success-text"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[240px] flex-1">
            <Input
              placeholder="Buscar plantillas..."
              aria-label="Buscar plantillas"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              leftIcon={<MagnifyingGlass aria-hidden />}
            />
          </div>
          <div className="w-56">
            <Select value={filterCategory} onValueChange={(val) => setFilterCategory(val)}>
              <SelectTrigger aria-label="Filtrar por categoria" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorias</SelectItem>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="neutral">Total: {filteredTemplates.length}</Badge>
            <Badge variant="warning">
              <Star className="size-3" weight="fill" aria-hidden />
              Favoritas: {templates.filter((t) => t.isFavorite).length}
            </Badge>
          </div>
        </div>

        {/* Grid de Templates */}
        {filteredTemplates.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center shadow-sm shadow-black/[0.02]">
            <p className="mb-4 text-sm text-muted-foreground">
              {searchTerm || filterCategory !== 'all'
                ? 'No se encontraron plantillas con los filtros aplicados'
                : 'No hay plantillas configuradas'}
            </p>
            <Button size="sm" onClick={handleCreate}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Crear Primera Plantilla
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredTemplates.map((template) => (
              <div
                key={template.id}
                className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]"
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <h2 className="text-base font-semibold text-foreground">{template.name}</h2>
                  <button
                    type="button"
                    aria-label={template.isFavorite ? 'Quitar de favoritas' : 'Marcar como favorita'}
                    onClick={() => handleToggleFavorite(template)}
                    className={
                      'flex size-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent ' +
                      (template.isFavorite ? 'text-warning-text' : 'text-muted-foreground')
                    }
                  >
                    <Star className="size-5" weight={template.isFavorite ? 'fill' : 'regular'} aria-hidden />
                  </button>
                </div>

                <p className="mb-3 min-h-10 text-sm text-muted-foreground">
                  {template.description || 'Sin descripcion'}
                </p>

                <div className="mb-3 flex flex-wrap gap-1.5">
                  <Badge variant={getCategoryVariant(template.category)}>
                    {CATEGORY_LABELS[template.category] || template.category}
                  </Badge>
                  {template.tags?.slice(0, 3).map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                  {template.tags?.length > 3 && (
                    <Badge variant="outline">+{template.tags.length - 3}</Badge>
                  )}
                </div>

                <div className="mb-3 space-y-0.5 text-xs text-muted-foreground">
                  <p>Modelo: {template.modelConfig?.model || 'gpt-4o'}</p>
                  <p>
                    Temperature: {template.modelConfig?.temperature || 0.7} | Max Tokens:{' '}
                    {template.modelConfig?.maxTokens || 2000}
                  </p>
                  {template.usageCount > 0 && (
                    <p>Usado {template.usageCount.toLocaleString()} veces</p>
                  )}
                </div>

                {template.variables && template.variables.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {template.variables.map((variable) => (
                      <Badge key={variable.name} variant="accent">
                        <Code className="size-3" aria-hidden />
                        {variable.name}
                      </Badge>
                    ))}
                  </div>
                )}

                <pre className="mb-4 max-h-[100px] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/60 p-3 font-mono text-xs text-foreground">
                  {(template.userPromptTemplate || template.systemPrompt || '').substring(0, 150)}
                  {(template.userPromptTemplate || template.systemPrompt || '').length > 150 && '...'}
                </pre>

                <div className="mt-auto flex items-center gap-2">
                  <Button size="sm" className="flex-1" onClick={() => handleCopy(template)}>
                    <Play className="size-4" weight="fill" aria-hidden />
                    Usar
                  </Button>
                  <button
                    type="button"
                    aria-label="Copiar plantilla"
                    title="Copiar"
                    onClick={() => handleCopy(template)}
                    className={cardActionClass}
                  >
                    <Copy className="size-[18px]" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="Editar plantilla"
                    title="Editar"
                    onClick={() => handleEdit(template)}
                    className={cardActionClass}
                  >
                    <PencilSimple className="size-[18px]" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="Eliminar plantilla"
                    title="Eliminar"
                    onClick={() => setDeleteConfirm(template.id)}
                    className={cardActionClass + ' hover:bg-destructive/10 hover:text-destructive-text'}
                  >
                    <Trash className="size-[18px]" aria-hidden />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Crear/Editar */}
      <Dialog open={openModal} onOpenChange={(o) => !o && setOpenModal(false)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'Editar Plantilla' : 'Crear Nueva Plantilla'}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="tpl-name">Nombre de la Plantilla</Label>
                <Input
                  id="tpl-name"
                  placeholder="Ej: Analisis de Sentimiento"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-category">Categoria</Label>
                <Select
                  value={formData.category}
                  onValueChange={(val) => setFormData({ ...formData, category: val })}
                >
                  <SelectTrigger id="tpl-category" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tpl-description">Descripcion</Label>
              <Input
                id="tpl-description"
                placeholder="Describe brevemente para que sirve esta plantilla"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tpl-system">System Prompt</Label>
              <textarea
                id="tpl-system"
                rows={3}
                className={textareaClass}
                placeholder="Define el rol y comportamiento del asistente..."
                value={formData.systemPrompt}
                onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Define el contexto y personalidad del asistente de IA
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tpl-user">Plantilla de Prompt del Usuario</Label>
              <textarea
                id="tpl-user"
                rows={6}
                className={textareaClass}
                placeholder="Escribe el prompt aqui. Usa {variable} para variables dinamicas..."
                value={formData.userPromptTemplate}
                onChange={(e) => setFormData({ ...formData, userPromptTemplate: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Usa llaves para definir variables: {'{variable}'}, {'{contexto}'}, {'{mensaje}'}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-vars">Variables (separadas por coma)</Label>
                <Input
                  id="tpl-vars"
                  placeholder="mensaje, contexto, tono"
                  value={formData.variables}
                  onChange={(e) => setFormData({ ...formData, variables: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-tags">Tags (separados por coma)</Label>
                <Input
                  id="tpl-tags"
                  placeholder="analisis, sentimiento, soporte"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                />
              </div>
            </div>

            <div className="border-t border-border" />
            <h3 className="text-sm font-semibold text-foreground">Configuracion del Modelo</h3>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-model">Modelo</Label>
                <Select
                  value={formData.modelConfig.model}
                  onValueChange={(val) =>
                    setFormData({
                      ...formData,
                      modelConfig: { ...formData.modelConfig, model: val },
                    })
                  }
                >
                  <SelectTrigger id="tpl-model" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                    <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                    <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                    <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                    <SelectItem value="claude-3-5-sonnet">Claude 3.5 Sonnet</SelectItem>
                    <SelectItem value="gemini-pro">Gemini Pro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-temp">Temperature: {formData.modelConfig.temperature}</Label>
                <input
                  id="tpl-temp"
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={formData.modelConfig.temperature}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      modelConfig: {
                        ...formData.modelConfig,
                        temperature: parseFloat(e.target.value),
                      },
                    })
                  }
                  className="h-11 w-full cursor-pointer accent-primary"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-tokens">Max Tokens</Label>
                <Input
                  id="tpl-tokens"
                  type="number"
                  value={formData.modelConfig.maxTokens}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      modelConfig: {
                        ...formData.modelConfig,
                        maxTokens: parseInt(e.target.value) || 2000,
                      },
                    })
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpenModal(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} loading={saving}>
              {editingTemplate ? 'Guardar Cambios' : 'Crear Plantilla'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmar Eliminacion */}
      <Dialog open={deleteConfirm !== null} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Eliminacion</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Estas seguro de que deseas eliminar esta plantilla? Esta accion no se puede deshacer.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
