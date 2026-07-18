import { useState, useEffect } from 'react'
// [Fase2·G] CONSERVADOS como MUI Joy: no hay equivalente en el design system
// (progreso lineal/circular). El resto de la pantalla usa Tailwind v4 + tokens.
import { LinearProgress, CircularProgress } from '@mui/joy'
import {
  Plus,
  PaperPlaneRight,
  Pause,
  Play,
  Trash,
  Eye,
  Megaphone,
  Clock,
  WhatsappLogo,
  X,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'

// ========================================
// TIPOS
// ========================================

interface Campaign {
  id: number
  name: string
  templateName: string
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'paused' | 'failed'
  recipientsTotal: number
  sent: number
  delivered: number
  read: number
  failed: number
  scheduledDate?: string
  createdAt: string
  completedAt?: string
  deliveryRate: number
  readRate: number
  useTemplate?: boolean
  whatsappId?: number
  contactListId?: number
}

interface WhatsAppConnection {
  id: number
  name: string
  number: string
  channel: 'baileys' | 'meta' | 'cloud_api' | 'history' | 'business_app'
  status: string
}

interface WhatsAppTemplate {
  id: number
  name: string
  category: string
  language: string
  status: string
  variablesCount: number
  bodyContent: string
  headerType: string
}

interface ContactList {
  id: number
  name: string
  contactsCount?: number
}

const columns = [
  'Campaña',
  'Estado',
  'Progreso',
  'Destinatarios',
  'Enviados',
  'Entregados',
  'Fecha Programada',
  'Acciones',
]

// ========================================
// COMPONENTE PRINCIPAL
// ========================================

export default function WhatsAppCampaigns() {
  // Estado para datos del backend
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [connections, setConnections] = useState<WhatsAppConnection[]>([])
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [contactLists, setContactLists] = useState<ContactList[]>([])
  const [loading, setLoading] = useState(true)

  // Estado del modal
  const [openModal, setOpenModal] = useState(false)
  const [modalLoading, setModalLoading] = useState(false)

  // Estado del formulario
  const [formData, setFormData] = useState({
    name: '',
    whatsappId: null as number | null,
    contactListId: null as number | null,
    useTemplate: false,
    whastsAppTemplateId: null as number | null,
    templateParams: '{}',
    message1: '',
    scheduledAt: '',
    scheduledTime: '09:00',
    statusTicket: 'open',
    sendNow: false,
  })

  // Cargar datos iniciales
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      // Cargar campañas
      const campaignsRes = await fetch('/campaigns', {
        headers: { 'Content-Type': 'application/json' }
      })
      const campaignsData = await campaignsRes.json()
      setCampaigns(campaignsData.campaigns || campaignsData || [])

      // Cargar conexiones
      const connectionsRes = await fetch('/whatsapp', {
        headers: { 'Content-Type': 'application/json' }
      })
      const connectionsData = await connectionsRes.json()
      setConnections(connectionsData.whatsapps || connectionsData || [])

      // Cargar listas de contactos
      const contactListsRes = await fetch('/contact-lists', {
        headers: { 'Content-Type': 'application/json' }
      })
      const contactListsData = await contactListsRes.json()
      setContactLists(contactListsData.contactLists || contactListsData || [])

      // Cargar plantillas (solo las aprobadas)
      const templatesRes = await fetch('/whatsapp-templates?status=APPROVED', {
        headers: { 'Content-Type': 'application/json' }
      })
      const templatesData = await templatesRes.json()
      setTemplates(templatesData.templates || templatesData || [])

    } catch (error) {
      console.error('Error cargando datos:', error)
      toast.error('Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }

  // Obtener la conexión seleccionada
  const selectedConnection = connections.find(c => c.id === formData.whatsappId)
  const isMetaConnection = selectedConnection?.channel === 'meta' || selectedConnection?.channel === 'cloud_api'

  // Obtener plantilla seleccionada
  const selectedTemplate = templates.find(t => t.id === formData.whastsAppTemplateId)

  // Manejar cambio de conexión
  const handleConnectionChange = (whatsappId: number | null) => {
    const conn = connections.find(c => c.id === whatsappId)
    const isMeta = conn?.channel === 'meta' || conn?.channel === 'cloud_api'

    setFormData(prev => ({
      ...prev,
      whatsappId,
      // Si cambia a conexión Meta, habilitar modo plantilla
      useTemplate: isMeta ? true : prev.useTemplate,
      // Si cambia a no-Meta, limpiar plantilla
      whastsAppTemplateId: isMeta ? prev.whastsAppTemplateId : null,
    }))
  }

  // Enviar campaña
  const handleSubmit = async (sendNow: boolean) => {
    if (!formData.name || !formData.whatsappId || !formData.contactListId) {
      toast.error('Por favor completa todos los campos requeridos')
      return
    }

    // Validar que si es Meta, tenga plantilla seleccionada
    if (isMetaConnection && !formData.whastsAppTemplateId) {
      toast.error('Selecciona una plantilla de Meta para continuar')
      return
    }

    // Validar que si es Baileys, tenga mensaje
    if (!isMetaConnection && !formData.message1) {
      toast.error('Escribe un mensaje para la campaña')
      return
    }

    setModalLoading(true)
    try {
      const payload = {
        name: formData.name,
        whatsappId: formData.whatsappId,
        contactListId: formData.contactListId,
        useTemplate: formData.useTemplate,
        whastsAppTemplateId: formData.whastsAppTemplateId,
        templateParams: JSON.parse(formData.templateParams || '{}'),
        message1: formData.message1,
        statusTicket: formData.statusTicket,
        // Si es envío inmediato, no programar
        scheduledAt: sendNow ? null : formData.scheduledAt ? `${formData.scheduledAt} ${formData.scheduledTime}` : null,
      }

      const res = await fetch('/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al crear campaña')
      }

      toast.success(sendNow ? 'Campaña iniciada correctamente' : 'Campaña programada correctamente')
      setOpenModal(false)
      loadData()
      resetForm()

    } catch (error: any) {
      toast.error(error.message || 'Error al crear campaña')
    } finally {
      setModalLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      whatsappId: null,
      contactListId: null,
      useTemplate: false,
      whastsAppTemplateId: null,
      templateParams: '{}',
      message1: '',
      scheduledAt: '',
      scheduledTime: '09:00',
      statusTicket: 'open',
      sendNow: false,
    })
  }

  const closeModal = () => {
    setOpenModal(false)
    resetForm()
  }

  // ========================================
  // HELPERS DE PRESENTACIÓN
  // ========================================

  // Color Joy para LinearProgress (componente MUI conservado)
  const getStatusColor = (status: Campaign['status']) => {
    switch (status) {
      case 'completed': return 'success'
      case 'sending': return 'primary'
      case 'scheduled': return 'warning'
      case 'paused': return 'neutral'
      case 'failed': return 'danger'
      default: return 'neutral'
    }
  }

  // Variante del Badge del design system
  const getStatusVariant = (status: Campaign['status']): BadgeProps['variant'] => {
    switch (status) {
      case 'completed': return 'success'
      case 'sending': return 'primary'
      case 'scheduled': return 'warning'
      case 'paused': return 'neutral'
      case 'failed': return 'destructive'
      default: return 'neutral'
    }
  }

  const getStatusText = (status: Campaign['status']) => {
    switch (status) {
      case 'draft': return 'Borrador'
      case 'scheduled': return 'Programada'
      case 'sending': return 'Enviando'
      case 'completed': return 'Completada'
      case 'paused': return 'Pausada'
      case 'failed': return 'Fallida'
      default: return status
    }
  }

  const calculateProgress = (campaign: Campaign) => {
    if (campaign.recipientsTotal === 0) return 0
    return (campaign.sent / campaign.recipientsTotal) * 100
  }

  // ========================================
  // RENDER
  // ========================================

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-6">
        <CircularProgress />
      </div>
    )
  }

  const inputClass =
    'h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'
  const actionBtnClass =
    'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors'

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Megaphone className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Campañas de Broadcasting WhatsApp
              </h1>
              <p className="text-sm text-muted-foreground">
                Envío masivo de mensajes con plantillas Meta o texto libre
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => setOpenModal(true)}>
            <Plus className="size-4" weight="bold" aria-hidden />
            Nueva Campaña
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Total Campañas" value={String(campaigns.length)} />
          <StatTile
            label="Activas"
            value={String(
              campaigns.filter((c) => c.status === 'sending' || c.status === 'scheduled').length
            )}
          />
          <StatTile
            label="Mensajes Enviados"
            value={campaigns.reduce((acc, c) => acc + c.sent, 0).toLocaleString()}
            tone="success"
          />
          <StatTile
            label="Tasa Entrega"
            value={`${
              campaigns.length > 0
                ? (campaigns.reduce((acc, c) => acc + c.deliveryRate, 0) / campaigns.length).toFixed(1)
                : '0.0'
            }%`}
            tone="warning"
          />
        </div>

        {/* Tabla */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
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
                {campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-10 text-center text-muted-foreground">
                      No se encontraron campañas
                    </td>
                  </tr>
                ) : (
                  campaigns.map((campaign) => (
                    <tr key={campaign.id} className="transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{campaign.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {campaign.useTemplate ? `Template: ${campaign.templateName}` : 'Mensaje libre'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={getStatusVariant(campaign.status)}>
                          {getStatusText(campaign.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="min-w-[160px]">
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">
                              {campaign.sent} / {campaign.recipientsTotal}
                            </span>
                            <span className="text-xs font-semibold text-foreground">
                              {calculateProgress(campaign).toFixed(1)}%
                            </span>
                          </div>
                          <LinearProgress
                            determinate
                            value={calculateProgress(campaign)}
                            color={getStatusColor(campaign.status)}
                            size="sm"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {campaign.recipientsTotal.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums text-foreground">
                        {campaign.sent.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold tabular-nums text-foreground">
                          {campaign.delivered.toLocaleString()}
                        </div>
                        <div className="text-xs text-success-text">
                          {campaign.deliveryRate.toFixed(1)}%
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {campaign.scheduledDate || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-0.5">
                          {campaign.status === 'sending' && (
                            <button
                              type="button"
                              aria-label="Pausar campaña"
                              title="Pausar campaña"
                              className={`${actionBtnClass} text-warning-text hover:bg-warning/10 hover:text-warning-text`}
                            >
                              <Pause className="size-[18px]" aria-hidden />
                            </button>
                          )}
                          {campaign.status === 'paused' && (
                            <button
                              type="button"
                              aria-label="Reanudar campaña"
                              title="Reanudar campaña"
                              className={`${actionBtnClass} text-success-text hover:bg-success/10 hover:text-success-text`}
                            >
                              <Play className="size-[18px]" aria-hidden />
                            </button>
                          )}
                          {campaign.status === 'draft' && (
                            <button
                              type="button"
                              aria-label="Enviar campaña"
                              title="Enviar campaña"
                              className={`${actionBtnClass} text-primary hover:bg-primary/10 hover:text-primary`}
                            >
                              <PaperPlaneRight className="size-[18px]" aria-hidden />
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label="Ver campaña"
                            title="Ver campaña"
                            className={`${actionBtnClass} hover:bg-accent hover:text-accent-foreground`}
                          >
                            <Eye className="size-[18px]" aria-hidden />
                          </button>
                          <button
                            type="button"
                            aria-label="Eliminar campaña"
                            title="Eliminar campaña"
                            className={`${actionBtnClass} hover:bg-destructive/10 hover:text-destructive-text`}
                          >
                            <Trash className="size-[18px]" aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal Nueva Campaña */}
      {openModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={closeModal}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                Nueva Campaña de Broadcasting
              </h2>
              <button
                type="button"
                aria-label="Cerrar"
                title="Cerrar"
                onClick={closeModal}
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <X className="size-[18px]" aria-hidden />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Nombre */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="campaign-name">Nombre de la Campaña</Label>
                <input
                  id="campaign-name"
                  placeholder="Ej: Promoción Black Friday"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className={inputClass}
                />
              </div>

              {/* Conexión WhatsApp */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Conexión WhatsApp</Label>
                <Select
                  value={formData.whatsappId != null ? String(formData.whatsappId) : undefined}
                  onValueChange={(value) => handleConnectionChange(Number(value))}
                >
                  <SelectTrigger aria-label="Conexión WhatsApp">
                    <span className="flex items-center gap-2 truncate">
                      <WhatsappLogo className="size-4 shrink-0 text-wa" weight="fill" aria-hidden />
                      <SelectValue placeholder="Selecciona una conexión" />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {connections.map((conn) => {
                      const isMeta = conn.channel === 'meta' || conn.channel === 'cloud_api'
                      return (
                        <SelectItem key={conn.id} value={String(conn.id)}>
                          <span className="flex items-center gap-2">
                            <Badge variant={isMeta ? 'success' : 'neutral'}>
                              {isMeta ? 'Meta' : 'Baileys'}
                            </Badge>
                            {conn.name} - {conn.number}
                          </span>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* SI ES CONEXIÓN META: Selector de Plantilla */}
              {isMetaConnection && (
                <div className="space-y-3 sm:col-span-2">
                  <div className="rounded-lg border border-border bg-muted/50 px-3.5 py-2.5 text-sm text-muted-foreground">
                    Las campañas con Meta usan <strong className="text-foreground">plantillas aprobadas</strong>. No es posible escribir texto libre.
                  </div>

                  <div className="space-y-1.5">
                    <Label>Plantilla de Meta</Label>
                    <Select
                      value={formData.whastsAppTemplateId != null ? String(formData.whastsAppTemplateId) : undefined}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, whastsAppTemplateId: Number(value) }))}
                    >
                      <SelectTrigger aria-label="Plantilla de Meta">
                        <SelectValue placeholder="Selecciona una plantilla aprobada" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.filter(t => t.status === 'APPROVED').map((template) => (
                          <SelectItem key={template.id} value={String(template.id)}>
                            <span className="flex flex-col">
                              <span className="text-sm text-foreground">{template.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {template.variablesCount > 0 ? `${template.variablesCount} variable(s)` : 'Sin variables'} | {template.language}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Variables de la plantilla */}
                  {selectedTemplate && selectedTemplate.variablesCount > 0 && (
                    <div className="space-y-1.5">
                      <Label htmlFor="template-params">Parámetros de la Plantilla</Label>
                      <textarea
                        id="template-params"
                        placeholder={'{"1": "Cliente", "2": "Valor"}'}
                        value={formData.templateParams}
                        onChange={(e) => setFormData(prev => ({ ...prev, templateParams: e.target.value }))}
                        rows={2}
                        className={`${inputClass} h-auto resize-y py-2.5`}
                      />
                      <p className="text-xs text-muted-foreground">
                        Usa {'{{1}}'}, {'{{2}}'}, etc. en el mensaje de la plantilla. Ej: {'{"1": "Juan", "2": "50%"}'}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* SI ES CONEXIÓN BAILEYS: Mensaje de texto libre */}
              {!isMetaConnection && formData.whatsappId && (
                <div className="space-y-3 sm:col-span-2">
                  <div className="rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-sm text-warning-text">
                    Las campañas con Baileys usan <strong>mensajes de texto libre</strong>.
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="campaign-message">Mensaje</Label>
                    <textarea
                      id="campaign-message"
                      placeholder="Escribe tu mensaje aquí...&#10;Puedes usar variables: {nome}, {email}, {numero}"
                      value={formData.message1}
                      onChange={(e) => setFormData(prev => ({ ...prev, message1: e.target.value }))}
                      rows={4}
                      className={`${inputClass} h-auto resize-y py-2.5`}
                    />
                  </div>
                </div>
              )}

              {/* Estado del Ticket */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Estado del Ticket al responder</Label>
                <Select
                  value={formData.statusTicket}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, statusTicket: value }))}
                >
                  <SelectTrigger aria-label="Estado del Ticket al responder">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">
                      <span className="flex items-center gap-2">
                        <Badge variant="success">Abierto</Badge>
                        El ticket se crea en estado "abierto"
                      </span>
                    </SelectItem>
                    <SelectItem value="closed">
                      <span className="flex items-center gap-2">
                        <Badge variant="neutral">Cerrado</Badge>
                        El ticket se crea en estado "cerrado"
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Lista de Destinatarios */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Lista de Destinatarios</Label>
                <Select
                  value={formData.contactListId != null ? String(formData.contactListId) : undefined}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, contactListId: Number(value) }))}
                >
                  <SelectTrigger aria-label="Lista de Destinatarios">
                    <SelectValue placeholder="Selecciona una lista" />
                  </SelectTrigger>
                  <SelectContent>
                    {contactLists.map((list) => (
                      <SelectItem key={list.id} value={String(list.id)}>
                        {list.name} {list.contactsCount ? `(${list.contactsCount} contactos)` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Fecha y Hora */}
              <div className="space-y-1.5">
                <Label htmlFor="scheduled-date">Fecha de Envío</Label>
                <input
                  id="scheduled-date"
                  type="date"
                  value={formData.scheduledAt}
                  onChange={(e) => setFormData(prev => ({ ...prev, scheduledAt: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scheduled-time">Hora de Envío</Label>
                <input
                  id="scheduled-time"
                  type="time"
                  value={formData.scheduledTime}
                  onChange={(e) => setFormData(prev => ({ ...prev, scheduledTime: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Botones */}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={closeModal}>
                Cancelar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSubmit(false)}
                disabled={modalLoading}
              >
                <Clock className="size-4" aria-hidden />
                Programar
              </Button>
              <Button
                size="sm"
                onClick={() => handleSubmit(true)}
                disabled={modalLoading}
                loading={modalLoading}
              >
                <PaperPlaneRight className="size-4" aria-hidden />
                Enviar Ahora
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
