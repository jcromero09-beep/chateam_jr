import { useState, useEffect, useCallback } from 'react'
import {
  FileHtml,
  Plus,
  Trash,
  PencilSimple,
  MagnifyingGlass,
  ArrowClockwise,
  Code,
  Eye,
  Copy,
} from '@phosphor-icons/react'
// [Fase2·G] CircularProgress se conserva como MUI (design system sin equivalente Radix).
import { CircularProgress } from '@mui/joy'
import { StatTile } from '@/components/ui/stat-tile'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import * as emailService from '../services/emailCampaignService'
import { sanitizeTemplateHtml } from '../utils/sanitizeHtml'

interface EmailTemplate {
  id: number
  name: string
  subject: string
  htmlContent: string
  category: string
  status: string
  createdAt: string
}

interface TemplateForm {
  name: string
  subject: string
  htmlContent: string
  category: string
}

const EMPTY_FORM: TemplateForm = {
  name: '',
  subject: '',
  htmlContent: '',
  category: 'general',
}

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'promotional', label: 'Promocional' },
  { value: 'transactional', label: 'Transaccional' },
  { value: 'welcome', label: 'Bienvenida' },
  { value: 'notification', label: 'Notificación' },
]

const columns = ['Nombre', 'Asunto', 'Categoría', 'Fecha', 'Acciones']

export default function EmailMarketingPlantillas() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [searchParam, setSearchParam] = useState('')
  const [pageNumber, setPageNumber] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [count, setCount] = useState(0)

  // Modal state
  const [openModal, setOpenModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null)
  const [openDeleteModal, setOpenDeleteModal] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [form, setForm] = useState<TemplateForm>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof TemplateForm, string>>>({})

  // Editor tab (0 = code, 1 = preview)
  const [editorTab, setEditorTab] = useState(0)

  // ---- Data fetching ----

  const fetchTemplates = useCallback(
    async (page: number = 1, append: boolean = false) => {
      setLoading(true)
      try {
        const data = await emailService.listEmailTemplates({
          searchParam,
          pageNumber: page,
        })
        const list: EmailTemplate[] = data.records ?? data ?? []
        const total: number = data.count ?? list.length
        const more: boolean = data.hasMore ?? false

        setTemplates((prev) => (append ? [...prev, ...list] : list))
        setCount(total)
        setHasMore(more)
      } catch (error) {
        console.error('Error fetching templates:', error)
      } finally {
        setLoading(false)
      }
    },
    [searchParam]
  )

  useEffect(() => {
    setPageNumber(1)
    fetchTemplates(1, false)
  }, [searchParam])

  const refreshList = () => {
    setPageNumber(1)
    fetchTemplates(1, false)
  }

  const handleLoadMore = () => {
    const next = pageNumber + 1
    setPageNumber(next)
    fetchTemplates(next, true)
  }

  // ---- Form handling ----

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof TemplateForm, string>> = {}
    if (!form.name.trim()) errors.name = 'El nombre es requerido'
    if (!form.subject.trim()) errors.subject = 'El asunto es requerido'
    if (!form.htmlContent.trim()) errors.htmlContent = 'El contenido HTML es requerido'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleFormChange = (field: keyof TemplateForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  const handleOpenCreate = () => {
    setEditingTemplate(null)
    setForm(EMPTY_FORM)
    setFormErrors({})
    setEditorTab(0)
    setOpenModal(true)
  }

  const handleOpenEdit = (template: EmailTemplate) => {
    setEditingTemplate(template)
    setForm({
      name: template.name,
      subject: template.subject,
      htmlContent: template.htmlContent || '',
      category: template.category || 'general',
    })
    setFormErrors({})
    setEditorTab(0)
    setOpenModal(true)
  }

  const handleSubmit = async () => {
    if (!validateForm()) return
    setFormSubmitting(true)
    try {
      if (editingTemplate) {
        await emailService.updateEmailTemplate(editingTemplate.id, {
          name: form.name.trim(),
          subject: form.subject.trim(),
          htmlContent: form.htmlContent,
          category: form.category,
        })
      } else {
        await emailService.createEmailTemplate({
          name: form.name.trim(),
          subject: form.subject.trim(),
          htmlContent: form.htmlContent,
          category: form.category,
        })
      }
      setOpenModal(false)
      setForm(EMPTY_FORM)
      refreshList()
    } catch (error) {
      console.error('Error saving template:', error)
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleCloseModal = () => {
    setOpenModal(false)
    setForm(EMPTY_FORM)
    setFormErrors({})
    setEditingTemplate(null)
  }

  // ---- Delete ----

  const handleDeleteConfirm = async () => {
    if (!selectedTemplate) return
    setDeleteLoading(true)
    try {
      await emailService.deleteEmailTemplate(selectedTemplate.id)
      setOpenDeleteModal(false)
      setSelectedTemplate(null)
      refreshList()
    } catch (error) {
      console.error('Error deleting template:', error)
    } finally {
      setDeleteLoading(false)
    }
  }

  // ---- Copy HTML ----

  const handleCopyHtml = (template: EmailTemplate) => {
    navigator.clipboard.writeText(template.htmlContent || '')
  }

  // ---- Render ----

  return (
    <TooltipProvider>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
                <FileHtml className="size-6" weight="fill" aria-hidden />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Plantillas de Email
                </h1>
                <p className="text-sm text-muted-foreground">
                  {count > 0
                    ? `${count} plantillas guardadas`
                    : 'Crea y edita plantillas HTML para tus campañas'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Tooltip title="Actualizar">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Actualizar"
                  className="text-muted-foreground"
                  onClick={refreshList}
                  disabled={loading}
                >
                  <ArrowClockwise className="size-5" aria-hidden />
                </Button>
              </Tooltip>
              <Button size="sm" onClick={handleOpenCreate}>
                <Plus className="size-4" weight="bold" aria-hidden />
                Nueva Plantilla
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatTile label="Total Plantillas" value={String(count)} />
            <StatTile
              label="Categorías"
              value={String(new Set(templates.map((t) => t.category)).size)}
            />
            <StatTile
              label="Última creada"
              value={
                templates[0]
                  ? new Date(templates[0].createdAt).toLocaleDateString('es-ES')
                  : '--'
              }
            />
          </div>

          {/* Search */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <MagnifyingGlass
                className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                placeholder="Buscar plantillas... (Enter para buscar)"
                aria-label="Buscar plantillas"
                value={searchParam}
                onChange={(e) => setSearchParam(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && refreshList()}
                className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>
            <Button variant="outline" size="sm" onClick={refreshList} disabled={loading}>
              <MagnifyingGlass className="size-4" aria-hidden />
              Buscar
            </Button>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    {columns.map((c, i) => (
                      <th
                        key={i}
                        className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${
                          c === 'Acciones' ? 'text-center' : ''
                        }`}
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading && templates.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center">
                        <div className="flex justify-center">
                          <CircularProgress size="md" />
                        </div>
                      </td>
                    </tr>
                  ) : templates.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <FileHtml className="size-12 text-muted-foreground/50" aria-hidden />
                          <p className="text-sm text-muted-foreground">
                            No hay plantillas creadas
                          </p>
                          <Button size="sm" onClick={handleOpenCreate}>
                            <Plus className="size-4" weight="bold" aria-hidden />
                            Crear primera plantilla
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    templates.map((template) => (
                      <tr key={template.id} className="transition-colors hover:bg-accent/40">
                        <td className="px-4 py-3 font-medium text-foreground">{template.name}</td>
                        <td className="px-4 py-3">
                          <span className="block max-w-[220px] truncate text-muted-foreground">
                            {template.subject || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="neutral">
                            {CATEGORIES.find((c) => c.value === template.category)?.label ??
                              template.category}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {new Date(template.createdAt).toLocaleDateString('es-ES', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-0.5">
                            <Tooltip title="Editar plantilla">
                              <button
                                type="button"
                                aria-label="Editar plantilla"
                                onClick={() => handleOpenEdit(template)}
                                className="flex size-8 items-center justify-center rounded-md text-primary transition-colors hover:bg-primary/10"
                              >
                                <PencilSimple className="size-[18px]" aria-hidden />
                              </button>
                            </Tooltip>
                            <Tooltip title="Copiar HTML">
                              <button
                                type="button"
                                aria-label="Copiar HTML"
                                onClick={() => handleCopyHtml(template)}
                                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                              >
                                <Copy className="size-[18px]" aria-hidden />
                              </button>
                            </Tooltip>
                            <Tooltip title="Eliminar">
                              <button
                                type="button"
                                aria-label="Eliminar"
                                onClick={() => {
                                  setSelectedTemplate(template)
                                  setOpenDeleteModal(true)
                                }}
                                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive-text"
                              >
                                <Trash className="size-[18px]" aria-hidden />
                              </button>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {hasMore && (
              <div className="flex justify-center border-t border-border p-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadMore}
                  loading={loading}
                >
                  Cargar más
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---- Create/Edit Template Modal ---- */}
      <Dialog
        open={openModal}
        onOpenChange={(o) => {
          if (!o) handleCloseModal()
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Code className="size-5 text-primary" aria-hidden />
              {editingTemplate ? 'Editar Plantilla' : 'Nueva Plantilla de Email'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Row: Name + Subject + Category */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
              <div className="space-y-1.5 md:col-span-5">
                <Label htmlFor="tpl-name">
                  Nombre <span className="text-destructive-text">*</span>
                </Label>
                <Input
                  id="tpl-name"
                  placeholder="Ej: Newsletter Mensual"
                  value={form.name}
                  invalid={!!formErrors.name}
                  onChange={(e) => handleFormChange('name', e.target.value)}
                />
                {formErrors.name && (
                  <p className="text-xs text-destructive-text">{formErrors.name}</p>
                )}
              </div>
              <div className="space-y-1.5 md:col-span-4">
                <Label htmlFor="tpl-subject">
                  Asunto <span className="text-destructive-text">*</span>
                </Label>
                <Input
                  id="tpl-subject"
                  placeholder="Asunto del email"
                  value={form.subject}
                  invalid={!!formErrors.subject}
                  onChange={(e) => handleFormChange('subject', e.target.value)}
                />
                {formErrors.subject && (
                  <p className="text-xs text-destructive-text">{formErrors.subject}</p>
                )}
              </div>
              <div className="space-y-1.5 md:col-span-3">
                <Label htmlFor="tpl-category">Categoría</Label>
                <Select
                  value={form.category}
                  onValueChange={(val) => handleFormChange('category', val || 'general')}
                >
                  <SelectTrigger id="tpl-category" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Editor with tabs: Code / Preview */}
            <div className="space-y-1.5">
              <Tabs
                value={editorTab === 0 ? 'code' : 'preview'}
                onValueChange={(val) => setEditorTab(val === 'code' ? 0 : 1)}
              >
                <TabsList>
                  <TabsTrigger value="code">
                    <Code className="size-4" aria-hidden />
                    Código HTML
                  </TabsTrigger>
                  <TabsTrigger value="preview">
                    <Eye className="size-4" aria-hidden />
                    Vista Previa
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="code">
                  <textarea
                    placeholder="Escribe o pega aquí el HTML de tu plantilla de email..."
                    rows={14}
                    value={form.htmlContent}
                    aria-invalid={!!formErrors.htmlContent || undefined}
                    onChange={(e) => handleFormChange('htmlContent', e.target.value)}
                    className="min-h-[300px] w-full resize-y rounded-md border border-input bg-card p-3 font-mono text-xs leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-[invalid=true]:border-destructive"
                  />
                </TabsContent>

                <TabsContent value="preview">
                  <div className="max-h-[450px] min-h-[300px] overflow-auto rounded-md border border-border bg-white">
                    {form.htmlContent ? (
                      // [Ola 2 · XSS] El HTML de la plantilla es contenido no confiable: lo
                      // escribe cualquier agente del tenant y se renderizaba con
                      // dangerouslySetInnerHTML, así que un <script> en la plantilla se
                      // ejecutaba con la sesión de quien la abriera (y el token está en
                      // localStorage → robo de cuenta entre agentes de la misma empresa).
                      //
                      // Dos capas independientes, a propósito:
                      //  1. DOMPurify limpia el HTML (quita <script>, on* handlers, javascript:…).
                      //  2. sandbox="" es el valor MÁS restrictivo: sin allow-scripts (no ejecuta
                      //     JS) y sin allow-same-origin (origen opaco: no alcanza el localStorage
                      //     ni el DOM del padre).
                      // Si una capa falla (bypass de sanitizador / sandbox no soportado), la otra
                      // sigue conteniendo. Además el iframe es más fiel como preview: los clientes
                      // de correo tampoco ejecutan JS.
                      <iframe
                        title="Vista previa de la plantilla"
                        sandbox=""
                        srcDoc={sanitizeTemplateHtml(form.htmlContent)}
                        className="h-[450px] w-full border-0 bg-white"
                      />
                    ) : (
                      <div className="flex h-[300px] items-center justify-center">
                        <p className="text-sm text-muted-foreground">
                          Escribe HTML en la pestaña de código para ver la vista previa aquí
                        </p>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
              {formErrors.htmlContent && (
                <p className="text-xs text-destructive-text">{formErrors.htmlContent}</p>
              )}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCloseModal}
              disabled={formSubmitting}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              loading={formSubmitting}
              disabled={formSubmitting}
            >
              {!formSubmitting &&
                (editingTemplate ? (
                  <PencilSimple className="size-4" aria-hidden />
                ) : (
                  <Plus className="size-4" weight="bold" aria-hidden />
                ))}
              {formSubmitting
                ? 'Guardando...'
                : editingTemplate
                ? 'Guardar Cambios'
                : 'Crear Plantilla'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Delete Modal ---- */}
      <Dialog
        open={openDeleteModal}
        onOpenChange={(o) => {
          if (!o) {
            setOpenDeleteModal(false)
            setSelectedTemplate(null)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash className="size-5 text-destructive-text" aria-hidden />
              Eliminar plantilla
            </DialogTitle>
            <DialogDescription>
              Eliminar la plantilla{' '}
              <span className="font-semibold text-foreground">
                &quot;{selectedTemplate?.name}&quot;
              </span>
              ? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOpenDeleteModal(false)
                setSelectedTemplate(null)
              }}
              disabled={deleteLoading}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleDeleteConfirm}
              loading={deleteLoading}
              disabled={deleteLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {!deleteLoading && <Trash className="size-4" aria-hidden />}
              {deleteLoading ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
