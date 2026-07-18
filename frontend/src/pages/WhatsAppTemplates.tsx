import { useState, useEffect } from 'react'
// [migración Tailwind] CircularProgress se conserva en MUI Joy a propósito
// (no hay equivalente en el design system; ver reglas de migración).
import { CircularProgress } from '@mui/joy'
import {
  FileText,
  Plus,
  PencilSimple,
  Trash,
  PaperPlaneTilt,
  CheckCircle,
  WarningCircle,
  Clock,
  ArrowClockwise,
  ArrowsClockwise,
  CloudArrowUp,
  HandTap,
  Link as LinkIcon,
  Phone,
  Copy,
} from '@phosphor-icons/react'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

// Interfaces
interface TemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE'
  text: string
  url?: string
  phoneNumber?: string
}

interface Template {
  id: number
  name: string
  metaTemplateId?: string
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  language: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED'
  rejectedReason?: string
  headerType: 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'
  headerContent?: string
  bodyContent: string
  footerContent?: string
  buttons?: TemplateButton[]
  variablesCount: number
  variableExamples?: string[]
  usageCount: number
  lastUsedAt?: string
  isActive: boolean
  companyId: number
  whatsappId?: number
  createdAt: string
  updatedAt: string
}

interface WhatsAppConnection {
  id: number
  name: string
  number: string
  status: string
  channel: string
}

interface FormData {
  name: string
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  language: string
  headerType: 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'
  headerContent: string
  bodyContent: string
  footerContent: string
  variableExamples: string[]
  whatsappId?: number
  buttons?: TemplateButton[]
}

interface MetaErrorInfo {
  show: boolean
  title: string
  message: string
  userTitle?: string
  userMessage?: string
  code?: number
  subcode?: number
}

const initialFormData: FormData = {
  name: '',
  category: 'UTILITY',
  language: 'es',
  headerType: 'NONE',
  headerContent: '',
  bodyContent: '',
  footerContent: '',
  variableExamples: [],
  buttons: [],
}

const columns = [
  'Nombre',
  'Estado',
  'Categoría',
  'Idioma',
  'Variables',
  'Uso',
  'Último uso',
  '',
]

const TEXTAREA_CLS =
  'min-h-[7rem] w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'

// Botón de acción de fila (mismo look que RowAction del design system, con onClick)
function ActionBtn({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string
  onClick?: () => void
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

export default function WhatsAppTemplates() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [connections, setConnections] = useState<WhatsAppConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openModal, setOpenModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [tabValue, setTabValue] = useState(0)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [submitting, setSubmitting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [selectedWhatsappId, setSelectedWhatsappId] = useState<number | null>(null)
  const [metaError, setMetaError] = useState<MetaErrorInfo>({
    show: false,
    title: '',
    message: '',
  })

  // Cargar templates y conexiones
  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)

      const [templatesRes, connectionsRes] = await Promise.all([
        api.get('/whatsapp-templates'),
        api.get('/whatsapp-meta/dashboard')
      ])

      setTemplates(templatesRes.data.templates || [])
      setConnections(connectionsRes.data.connections || [])

      // Seleccionar primera conexión por defecto
      if (connectionsRes.data.connections?.length > 0 && !selectedWhatsappId) {
        setSelectedWhatsappId(connectionsRes.data.connections[0].id)
      }
    } catch (err: any) {
      console.error('Error loading templates:', err)
      setError(err.response?.data?.message || 'Error al cargar las plantillas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Contar variables en el contenido
  const countVariables = (content: string): number => {
    const matches = content.match(/\{\{\d+\}\}/g)
    return matches ? matches.length : 0
  }

  // Actualizar ejemplos de variables cuando cambia el contenido
  useEffect(() => {
    const totalVars = countVariables(formData.headerContent) + countVariables(formData.bodyContent)
    if (totalVars !== formData.variableExamples.length) {
      setFormData(prev => ({
        ...prev,
        variableExamples: Array(totalVars).fill('')
      }))
    }
  }, [formData.headerContent, formData.bodyContent])

  const handleAdd = () => {
    setEditingTemplate(null)
    setFormData(initialFormData)
    setOpenModal(true)
  }

  const handleEdit = (template: Template) => {
    setEditingTemplate(template)
    setFormData({
      name: template.name,
      category: template.category,
      language: template.language,
      headerType: template.headerType,
      headerContent: template.headerContent || '',
      bodyContent: template.bodyContent,
      footerContent: template.footerContent || '',
      variableExamples: template.variableExamples || [],
      whatsappId: template.whatsappId,
      buttons: template.buttons || [],
    })
    setOpenModal(true)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar esta plantilla?')) return

    try {
      await api.delete(`/whatsapp-templates/${id}`)
      setTemplates(prev => prev.filter(t => t.id !== id))
    } catch (err: any) {
      setMetaError({
        show: true,
        title: 'Error al eliminar',
        message: err.response?.data?.message || 'No se pudo eliminar la plantilla',
      })
    }
  }

  const handleSubmit = async () => {
    if (!formData.name || !formData.bodyContent) {
      setMetaError({
        show: true,
        title: 'Campos requeridos',
        message: 'El nombre y contenido del mensaje son obligatorios',
      })
      return
    }

    // Validar nombre (solo minúsculas, números y guiones bajos)
    if (!/^[a-z0-9_]+$/.test(formData.name)) {
      setMetaError({
        show: true,
        title: 'Nombre inválido',
        message: 'El nombre solo puede contener letras minúsculas, números y guiones bajos (_)',
      })
      return
    }

    setSubmitting(true)
    try {
      if (editingTemplate) {
        // Actualizar
        const response = await api.put(`/whatsapp-templates/${editingTemplate.id}`, formData)
        setTemplates(prev => prev.map(t => t.id === editingTemplate.id ? response.data : t))
      } else {
        // Crear
        const response = await api.post('/whatsapp-templates', {
          ...formData,
          whatsappId: selectedWhatsappId
        })
        setTemplates(prev => [response.data.template, ...prev])
      }
      setOpenModal(false)
      setFormData(initialFormData)
    } catch (err: any) {
      setMetaError({
        show: true,
        title: 'Error al guardar',
        message: err.response?.data?.message || 'No se pudo guardar la plantilla',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmitToMeta = async (templateId: number) => {
    if (!selectedWhatsappId) {
      setMetaError({
        show: true,
        title: 'Conexión requerida',
        message: 'Selecciona una conexión de WhatsApp primero',
      })
      return
    }

    try {
      setSubmitting(true)
      await api.post(`/whatsapp-templates/${templateId}/submit`, {
        whatsappId: selectedWhatsappId
      })
      setMetaError({
        show: true,
        title: '¡Éxito!',
        message: 'Plantilla enviada a Meta para aprobación. El proceso puede tomar entre 1 minuto y 24 horas.',
      })
      loadData()
    } catch (err: any) {
      const errorData = err.response?.data
      const metaErrorData = errorData?.metaError

      setMetaError({
        show: true,
        title: metaErrorData?.userTitle || 'Error de Meta',
        message: errorData?.message || 'Error al enviar a Meta',
        userTitle: metaErrorData?.userTitle,
        userMessage: metaErrorData?.userMessage,
        code: metaErrorData?.code,
        subcode: metaErrorData?.subcode,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleSyncFromMeta = async () => {
    if (!selectedWhatsappId) {
      setMetaError({
        show: true,
        title: 'Conexión requerida',
        message: 'Selecciona una conexión de WhatsApp primero',
      })
      return
    }

    try {
      setSyncing(true)
      const response = await api.post('/whatsapp-templates/sync', {
        whatsappId: selectedWhatsappId
      })
      setMetaError({
        show: true,
        title: '¡Éxito!',
        message: `Sincronización completada: ${response.data.created} nuevas, ${response.data.updated} actualizadas`,
      })
      loadData()
    } catch (err: any) {
      const errorData = err.response?.data
      const metaErrorData = errorData?.metaError

      setMetaError({
        show: true,
        title: metaErrorData?.userTitle || 'Error de sincronización',
        message: errorData?.message || 'Error al sincronizar con Meta',
        userTitle: metaErrorData?.userTitle,
        userMessage: metaErrorData?.userMessage,
        code: metaErrorData?.code,
        subcode: metaErrorData?.subcode,
      })
    } finally {
      setSyncing(false)
    }
  }

  const getStatusVariant = (status: Template['status']): BadgeProps['variant'] => {
    switch (status) {
      case 'APPROVED': return 'success'
      case 'PENDING': return 'warning'
      case 'REJECTED': return 'destructive'
      case 'PAUSED': return 'neutral'
      case 'DISABLED': return 'neutral'
      default: return 'neutral'
    }
  }

  const getStatusText = (status: Template['status']) => {
    switch (status) {
      case 'APPROVED': return 'Aprobada'
      case 'PENDING': return 'Pendiente'
      case 'REJECTED': return 'Rechazada'
      case 'PAUSED': return 'Pausada'
      case 'DISABLED': return 'Deshabilitada'
      default: return status
    }
  }

  const getCategoryVariant = (category: Template['category']): BadgeProps['variant'] => {
    switch (category) {
      case 'MARKETING': return 'primary'
      case 'UTILITY': return 'success'
      case 'AUTHENTICATION': return 'warning'
      default: return 'neutral'
    }
  }

  const getCategoryText = (category: Template['category']) => {
    switch (category) {
      case 'MARKETING': return 'Marketing'
      case 'UTILITY': return 'Utilidad'
      case 'AUTHENTICATION': return 'Autenticación'
      default: return category
    }
  }

  const filterByCategory = (category?: Template['category']) => {
    if (!category) return templates
    return templates.filter((t) => t.category === category)
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const renderTemplatesList = (templatesList: Template[]) => (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
      {templatesList.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <FileText className="size-12 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            No hay plantillas en esta categoría
          </p>
        </div>
      ) : (
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
              {templatesList.map((template) => (
                <tr key={template.id} className="transition-colors hover:bg-accent/40">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{template.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {template.bodyContent.substring(0, 50)}...
                    </p>
                    {template.rejectedReason && (
                      <p className="mt-0.5 text-xs text-destructive-text">
                        Razón: {template.rejectedReason}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={getStatusVariant(template.status)}>
                      {template.status === 'APPROVED' ? (
                        <CheckCircle className="size-3.5" weight="fill" aria-hidden />
                      ) : template.status === 'PENDING' ? (
                        <Clock className="size-3.5" weight="fill" aria-hidden />
                      ) : (
                        <WarningCircle className="size-3.5" weight="fill" aria-hidden />
                      )}
                      {getStatusText(template.status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={getCategoryVariant(template.category)}>
                      {getCategoryText(template.category)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{template.language.toUpperCase()}</Badge>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">
                    {template.variablesCount}
                  </td>
                  <td className="px-4 py-3 font-medium tabular-nums text-foreground">
                    {template.usageCount.toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {formatDate(template.lastUsedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-0.5">
                      <ActionBtn
                        label="Editar"
                        onClick={() => handleEdit(template)}
                        disabled={template.status === 'APPROVED'}
                      >
                        <PencilSimple className="size-[18px]" aria-hidden />
                      </ActionBtn>
                      {template.status === 'PENDING' && !template.metaTemplateId && (
                        <ActionBtn
                          label="Enviar a Meta"
                          onClick={() => handleSubmitToMeta(template.id)}
                          disabled={submitting}
                          className="text-primary hover:bg-primary/10 hover:text-primary"
                        >
                          <CloudArrowUp className="size-[18px]" aria-hidden />
                        </ActionBtn>
                      )}
                      {template.status === 'APPROVED' && (
                        <ActionBtn
                          label="Usar plantilla"
                          className="text-success-text hover:bg-success/10 hover:text-success-text"
                        >
                          <PaperPlaneTilt className="size-[18px]" aria-hidden />
                        </ActionBtn>
                      )}
                      <ActionBtn
                        label="Eliminar"
                        onClick={() => handleDelete(template.id)}
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
    </div>
  )

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <CircularProgress size="lg" />
      </div>
    )
  }

  const lastButton =
    formData.buttons && formData.buttons.length > 0
      ? formData.buttons[formData.buttons.length - 1]
      : null

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <FileText className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Plantillas de WhatsApp
              </h1>
              <p className="text-sm text-muted-foreground">
                Gestiona las plantillas aprobadas por Meta para envío fuera de la ventana de 24 horas
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {connections.length > 0 && (
              <Select
                value={selectedWhatsappId != null ? String(selectedWhatsappId) : undefined}
                onValueChange={(val) => setSelectedWhatsappId(Number(val))}
              >
                <SelectTrigger className="w-[220px]" aria-label="Conexión de WhatsApp">
                  <SelectValue placeholder="Selecciona una conexión" />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((conn) => (
                    <SelectItem key={conn.id} value={String(conn.id)}>
                      {conn.name} ({conn.number})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant="outline"
              size="sm"
              loading={syncing}
              onClick={handleSyncFromMeta}
              disabled={!selectedWhatsappId}
            >
              {!syncing && <ArrowsClockwise className="size-4" aria-hidden />}
              Sincronizar
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar"
              className="text-muted-foreground"
              onClick={loadData}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            <Button size="sm" onClick={handleAdd}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nueva plantilla
            </Button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/12 px-4 py-3 text-sm text-destructive-text"
          >
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Total plantillas" value={String(templates.length)} />
          <StatTile
            label="Aprobadas"
            value={String(templates.filter((t) => t.status === 'APPROVED').length)}
            tone="success"
          />
          <StatTile
            label="Pendientes"
            value={String(templates.filter((t) => t.status === 'PENDING').length)}
            tone="warning"
          />
          <StatTile
            label="Uso total"
            value={templates.reduce((acc, t) => acc + t.usageCount, 0).toLocaleString()}
            tone="primary"
          />
        </div>

        {/* Tabs por categoría */}
        <Tabs value={String(tabValue)} onValueChange={(val) => setTabValue(Number(val))}>
          <TabsList>
            <TabsTrigger value="0">Todas ({templates.length})</TabsTrigger>
            <TabsTrigger value="1">
              Marketing ({templates.filter((t) => t.category === 'MARKETING').length})
            </TabsTrigger>
            <TabsTrigger value="2">
              Utilidad ({templates.filter((t) => t.category === 'UTILITY').length})
            </TabsTrigger>
            <TabsTrigger value="3">
              Autenticación ({templates.filter((t) => t.category === 'AUTHENTICATION').length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="0" className="mt-4">{renderTemplatesList(templates)}</TabsContent>
          <TabsContent value="1" className="mt-4">{renderTemplatesList(filterByCategory('MARKETING'))}</TabsContent>
          <TabsContent value="2" className="mt-4">{renderTemplatesList(filterByCategory('UTILITY'))}</TabsContent>
          <TabsContent value="3" className="mt-4">{renderTemplatesList(filterByCategory('AUTHENTICATION'))}</TabsContent>
        </Tabs>
      </div>

      {/* Modal Crear/Editar */}
      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'Editar plantilla' : 'Nueva plantilla'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">Nombre del template *</Label>
              <Input
                id="tpl-name"
                placeholder="nombre_template (solo minúsculas, números y _)"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                disabled={!!editingTemplate}
              />
              <p className="text-xs text-muted-foreground">
                Solo letras minúsculas, números y guiones bajos. No se puede cambiar después.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-category">Categoría *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(val) => setFormData(prev => ({ ...prev, category: val as any }))}
                >
                  <SelectTrigger id="tpl-category" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTILITY">Utilidad</SelectItem>
                    <SelectItem value="MARKETING">Marketing</SelectItem>
                    <SelectItem value="AUTHENTICATION">Autenticación</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-language">Idioma *</Label>
                <Select
                  value={formData.language}
                  onValueChange={(val) => setFormData(prev => ({ ...prev, language: val }))}
                >
                  <SelectTrigger id="tpl-language" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="es">Español (es)</SelectItem>
                    <SelectItem value="es_MX">Español México (es_MX)</SelectItem>
                    <SelectItem value="es_AR">Español Argentina (es_AR)</SelectItem>
                    <SelectItem value="en">Inglés (en)</SelectItem>
                    <SelectItem value="en_US">Inglés US (en_US)</SelectItem>
                    <SelectItem value="pt_BR">Portugués Brasil (pt_BR)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t border-border" />

            <div className="space-y-1.5">
              <Label htmlFor="tpl-header-type">Encabezado (opcional)</Label>
              <Select
                value={formData.headerType}
                onValueChange={(val) => setFormData(prev => ({ ...prev, headerType: val as any }))}
              >
                <SelectTrigger id="tpl-header-type" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Sin encabezado</SelectItem>
                  <SelectItem value="TEXT">Texto</SelectItem>
                  <SelectItem value="IMAGE">Imagen</SelectItem>
                  <SelectItem value="VIDEO">Video</SelectItem>
                  <SelectItem value="DOCUMENT">Documento</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.headerType !== 'NONE' && (
              <div className="space-y-1.5">
                <Label htmlFor="tpl-header-content">
                  {formData.headerType === 'TEXT' ? 'Texto del encabezado' : 'URL del archivo'}
                </Label>
                <Input
                  id="tpl-header-content"
                  placeholder={formData.headerType === 'TEXT' ? 'Título del mensaje' : 'https://example.com/imagen.jpg'}
                  value={formData.headerContent}
                  onChange={(e) => setFormData(prev => ({ ...prev, headerContent: e.target.value }))}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="tpl-body">Contenido del mensaje *</Label>
              <textarea
                id="tpl-body"
                rows={4}
                className={TEXTAREA_CLS}
                placeholder="Tu mensaje aquí. Usa {{1}}, {{2}} para variables dinámicas."
                value={formData.bodyContent}
                onChange={(e) => setFormData(prev => ({ ...prev, bodyContent: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Usa {'{{1}}'}, {'{{2}}'}, etc. para variables. Máximo 1024 caracteres.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tpl-footer">Pie de página (opcional)</Label>
              <Input
                id="tpl-footer"
                placeholder="Texto pequeño al final del mensaje"
                value={formData.footerContent}
                onChange={(e) => setFormData(prev => ({ ...prev, footerContent: e.target.value.slice(0, 60) }))}
              />
              <p className="text-xs text-muted-foreground">
                Máximo 60 caracteres. {formData.footerContent.length}/60
              </p>
            </div>

            {/* Ejemplos de variables */}
            {formData.variableExamples.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Ejemplos de variables (requeridos por Meta)
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {formData.variableExamples.map((example, idx) => (
                    <div key={idx} className="space-y-1.5">
                      <Label htmlFor={`tpl-var-${idx}`}>{`{{${idx + 1}}}`}</Label>
                      <Input
                        id={`tpl-var-${idx}`}
                        className="h-9"
                        placeholder={`Ejemplo para variable ${idx + 1}`}
                        value={example}
                        onChange={(e) => {
                          const newExamples = [...formData.variableExamples]
                          newExamples[idx] = e.target.value
                          setFormData(prev => ({ ...prev, variableExamples: newExamples }))
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Botones interactivos */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <HandTap className="size-5 text-muted-foreground" aria-hidden />
                <p className="text-sm font-medium text-foreground">
                  Botones interactivos (opcional)
                </p>
                <Badge variant="outline">{formData.buttons?.length || 0}/10</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Agrega hasta 10 botones para que el usuario interactúe (Aceptar, Rechazar, etc.)
              </p>

              {/* Lista de botones agregados */}
              {formData.buttons && formData.buttons.length > 0 && (
                <div className="space-y-2 rounded-md border border-border p-3">
                  {formData.buttons?.map((btn, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Badge
                        variant={
                          btn.type === 'QUICK_REPLY' ? 'primary' : btn.type === 'URL' ? 'success' : 'warning'
                        }
                      >
                        {btn.type === 'QUICK_REPLY' ? (
                          <HandTap className="size-3.5" aria-hidden />
                        ) : btn.type === 'URL' ? (
                          <LinkIcon className="size-3.5" aria-hidden />
                        ) : btn.type === 'PHONE_NUMBER' ? (
                          <Phone className="size-3.5" aria-hidden />
                        ) : (
                          <Copy className="size-3.5" aria-hidden />
                        )}
                        {btn.type === 'QUICK_REPLY' ? 'Respuesta rápida' :
                         btn.type === 'URL' ? 'Enlace' :
                         btn.type === 'PHONE_NUMBER' ? 'Teléfono' : 'Copiar código'}
                      </Badge>
                      <span className="flex-1 truncate text-sm text-foreground">{btn.text}</span>
                      {btn.type === 'URL' && btn.url && (
                        <span className="max-w-[150px] truncate text-xs text-muted-foreground">
                          {btn.url}
                        </span>
                      )}
                      {btn.type === 'PHONE_NUMBER' && btn.phoneNumber && (
                        <span className="text-xs text-muted-foreground">{btn.phoneNumber}</span>
                      )}
                      <ActionBtn
                        label={`Quitar botón ${idx + 1}`}
                        onClick={() => {
                          const newButtons = [...(formData.buttons || [])]
                          newButtons.splice(idx, 1)
                          setFormData(prev => ({ ...prev, buttons: newButtons }))
                        }}
                        className="hover:bg-destructive/10 hover:text-destructive-text"
                      >
                        <Trash className="size-4" aria-hidden />
                      </ActionBtn>
                    </div>
                  ))}
                </div>
              )}

              {/* Agregar nuevo botón */}
              {(!formData.buttons || formData.buttons.length < 10) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newButton: TemplateButton = {
                      type: 'QUICK_REPLY',
                      text: ''
                    }
                    setFormData(prev => ({
                      ...prev,
                      buttons: [...(prev.buttons || []), newButton]
                    }))
                  }}
                >
                  <Plus className="size-4" weight="bold" aria-hidden />
                  Agregar botón
                </Button>
              )}

              {/* Formulario para editar el último botón */}
              {lastButton && (
                <div className="rounded-md bg-muted p-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="tpl-btn-type">Tipo</Label>
                      <Select
                        value={lastButton.type}
                        onValueChange={(val) => {
                          const newButtons = [...formData.buttons!]
                          newButtons[newButtons.length - 1] = {
                            ...newButtons[newButtons.length - 1],
                            type: val as any,
                            url: val === 'URL' ? '' : undefined,
                            phoneNumber: val === 'PHONE_NUMBER' ? '' : undefined
                          }
                          setFormData(prev => ({ ...prev, buttons: newButtons }))
                        }}
                      >
                        <SelectTrigger id="tpl-btn-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="QUICK_REPLY">💬 Respuesta rápida</SelectItem>
                          <SelectItem value="URL">🔗 Enlace (URL)</SelectItem>
                          <SelectItem value="PHONE_NUMBER">📞 Teléfono</SelectItem>
                          <SelectItem value="COPY_CODE">📋 Copiar código</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div
                      className={cn(
                        'space-y-1.5',
                        lastButton.type === 'QUICK_REPLY' && 'sm:col-span-2',
                      )}
                    >
                      <Label htmlFor="tpl-btn-text">Texto del botón</Label>
                      <Input
                        id="tpl-btn-text"
                        className="h-9"
                        placeholder="Ej: Aceptar, Rechazar, Ver más..."
                        value={lastButton.text}
                        onChange={(e) => {
                          const newButtons = [...formData.buttons!]
                          newButtons[newButtons.length - 1] = {
                            ...newButtons[newButtons.length - 1],
                            text: e.target.value.slice(0, 25)
                          }
                          setFormData(prev => ({ ...prev, buttons: newButtons }))
                        }}
                      />
                    </div>
                    {lastButton.type === 'URL' && (
                      <div className="space-y-1.5">
                        <Label htmlFor="tpl-btn-url">URL</Label>
                        <Input
                          id="tpl-btn-url"
                          className="h-9"
                          placeholder="https://..."
                          value={lastButton.url || ''}
                          onChange={(e) => {
                            const newButtons = [...formData.buttons!]
                            newButtons[newButtons.length - 1] = {
                              ...newButtons[newButtons.length - 1],
                              url: e.target.value
                            }
                            setFormData(prev => ({ ...prev, buttons: newButtons }))
                          }}
                        />
                      </div>
                    )}
                    {lastButton.type === 'PHONE_NUMBER' && (
                      <div className="space-y-1.5">
                        <Label htmlFor="tpl-btn-phone">Teléfono</Label>
                        <Input
                          id="tpl-btn-phone"
                          className="h-9"
                          placeholder="+1234567890"
                          value={lastButton.phoneNumber || ''}
                          onChange={(e) => {
                            const newButtons = [...formData.buttons!]
                            newButtons[newButtons.length - 1] = {
                              ...newButtons[newButtons.length - 1],
                              phoneNumber: e.target.value
                            }
                            setFormData(prev => ({ ...prev, buttons: newButtons }))
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpenModal(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSubmit} loading={submitting}>
              {editingTemplate ? 'Actualizar' : 'Crear plantilla'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Error/Éxito de Meta */}
      <Dialog
        open={metaError.show}
        onOpenChange={(open) => {
          if (!open) setMetaError(prev => ({ ...prev, show: false }))
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {metaError.title === '¡Éxito!' ? (
                <CheckCircle className="size-5 text-success-text" weight="fill" aria-hidden />
              ) : (
                <WarningCircle className="size-5 text-destructive-text" weight="fill" aria-hidden />
              )}
              {metaError.title}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {metaError.userMessage && (
              <div className="rounded-md border border-warning/30 bg-warning/16 px-3 py-2.5 text-sm font-medium text-warning-text">
                {metaError.userMessage}
              </div>
            )}

            <p className="text-sm text-foreground">{metaError.message}</p>

            {metaError.code && (
              <div className="rounded-md bg-muted px-3 py-2.5">
                <p className="font-mono text-xs text-muted-foreground">
                  Código: {metaError.code}
                  {metaError.subcode && ` (${metaError.subcode})`}
                </p>
              </div>
            )}

            {metaError.title !== '¡Éxito!' && metaError.code === 100 && metaError.subcode === 2388299 && (
              <div className="rounded-md border border-border bg-muted px-3 py-2.5 text-xs text-muted-foreground">
                <strong className="text-foreground">Tip:</strong> Las variables {'{{1}}'}, {'{{2}}'}, etc. no pueden estar al inicio ni al final del texto.
                Agrega texto antes y después de las variables.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              size="sm"
              onClick={() => setMetaError(prev => ({ ...prev, show: false }))}
            >
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
