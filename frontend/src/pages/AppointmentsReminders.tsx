import { useState, useEffect } from 'react'
// [Fase2·G] Conservados como MUI Joy a propósito: no hay equivalente en el DS.
import { CircularProgress, LinearProgress } from '@mui/joy'
import {
  Bell,
  Plus,
  PencilSimple,
  Trash,
  Clock,
  WhatsappLogo,
  EnvelopeSimple,
  WarningCircle,
  ArrowClockwise,
} from '@phosphor-icons/react'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { toast } from 'react-toastify'
import api from '../services/api'

interface ReminderTemplate {
  id: number
  name: string
  channel: 'email' | 'whatsapp'
  subject?: string
  messageCreated: string  // Mensaje inmediato al crear la cita
  messageConfirm: string  // Mensaje para pedir confirmación
  messageReminder: string // Mensaje de recordatorio cuando ya confirmó
  timing: number // hours before appointment
  isActive: boolean
  sentCount: number
  deliveryRate: number
}

interface ReminderLog {
  id: number
  appointmentId: number
  clientName: string
  clientEmail?: string
  clientPhone?: string
  channel: 'email' | 'whatsapp'
  status: 'sent' | 'delivered' | 'failed' | 'pending' | 'cancelled'
  sentAt: string
  deliveredAt?: string
  errorMessage?: string
  appointmentDate: string
  serviceName?: string
  agentName?: string
}

interface ReminderStats {
  totalSent: number
  delivered: number
  failed: number
  pending: number
  deliveryRate: number
  byChannel: { channel: string; count: number }[]
}

const historyColumns = [
  'Cliente',
  'Canal',
  'Estado',
  'Enviado',
  'Entregado',
  'Cita',
  'Servicio',
  'Error',
]

// Switch accesible del DS (mismo patrón que AutomationRules): no hay wrapper en
// components/ui, se resuelve con role="switch" + tokens.
function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
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

export default function AppointmentsReminders() {
  const [templates, setTemplates] = useState<ReminderTemplate[]>([])
  const [logs, setLogs] = useState<ReminderLog[]>([])
  const [stats, setStats] = useState<ReminderStats | null>(null)
  const [openTemplateModal, setOpenTemplateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<ReminderTemplate | null>(null)
  const [templateForm, setTemplateForm] = useState<Partial<ReminderTemplate>>({
    name: '',
    channel: 'whatsapp',
    messageCreated: '',
    messageConfirm: '',
    messageReminder: '',
    timing: 24,
    isActive: true,
  })
  const [activeTab, setActiveTab] = useState(0)
  const [loading, setLoading] = useState(true)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyTotal, setHistoryTotal] = useState(0)

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (activeTab === 1) {
      fetchHistory()
    }
  }, [activeTab, historyPage])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [templatesRes, statsRes] = await Promise.all([
        api.get('/appointments/reminders/templates'),
        api.get('/appointments/reminders/stats')
      ])
      setTemplates(templatesRes.data)
      setStats(statsRes.data)
    } catch (error) {
      console.error('Error fetching data:', error)
      toast.error('Error al cargar los datos')
    } finally {
      setLoading(false)
    }
  }

  const fetchHistory = async () => {
    try {
      const { data } = await api.get('/appointments/reminders/history', {
        params: { page: historyPage, limit: 50 }
      })
      setLogs(data.reminders)
      setHistoryTotal(data.total)
    } catch (error) {
      console.error('Error fetching history:', error)
    }
  }

  const handleOpenTemplateModal = (template?: ReminderTemplate) => {
    if (template) {
      setEditingTemplate(template)
      setTemplateForm(template)
    } else {
      setEditingTemplate(null)
      setTemplateForm({
        name: '',
        channel: 'whatsapp',
        messageCreated: '',
        messageConfirm: '',
        messageReminder: '',
        timing: 24,
        isActive: true,
      })
    }
    setOpenTemplateModal(true)
  }

  const handleSaveTemplate = async () => {
    if (!templateForm.name || !templateForm.messageCreated || !templateForm.messageConfirm || !templateForm.messageReminder || templateForm.timing === undefined) {
      toast.error('Por favor completa los campos requeridos')
      return
    }

    setSavingTemplate(true)
    try {
      if (editingTemplate) {
        await api.put(`/appointments/reminders/templates/${editingTemplate.id}`, templateForm)
        toast.success('Plantilla actualizada')
      } else {
        await api.post('/appointments/reminders/templates', templateForm)
        toast.success('Plantilla creada')
      }
      setOpenTemplateModal(false)
      fetchData()
    } catch (error) {
      console.error('Error saving template:', error)
      toast.error('Error al guardar la plantilla')
    } finally {
      setSavingTemplate(false)
    }
  }

  const handleDeleteTemplate = async (id: number) => {
    if (!window.confirm('¿Estás seguro de eliminar esta plantilla?')) return

    try {
      await api.delete(`/appointments/reminders/templates/${id}`)
      toast.success('Plantilla eliminada')
      fetchData()
    } catch (error) {
      console.error('Error deleting template:', error)
      toast.error('Error al eliminar la plantilla')
    }
  }

  const handleToggleTemplate = async (id: number) => {
    try {
      await api.post(`/appointments/reminders/templates/${id}/toggle`)
      fetchData()
    } catch (error) {
      console.error('Error toggling template:', error)
      toast.error('Error al cambiar el estado')
    }
  }

  const getChannelIcon = (channel: string, className = 'size-4') => {
    switch (channel) {
      case 'whatsapp':
        return <WhatsappLogo className={className} aria-hidden />
      case 'email':
        return <EnvelopeSimple className={className} aria-hidden />
      default:
        return <Bell className={className} aria-hidden />
    }
  }

  const getChannelLabel = (channel: string) =>
    channel === 'whatsapp' ? 'WhatsApp' : 'Email'

  const getChannelVariant = (channel: string): BadgeProps['variant'] => {
    switch (channel) {
      case 'whatsapp':
        return 'success'
      case 'email':
        return 'primary'
      default:
        return 'neutral'
    }
  }

  // Tinte del tile de canal: superficie tenue + texto con token *-text (a11y).
  const getChannelTile = (channel: string) => {
    switch (channel) {
      case 'whatsapp':
        return 'bg-wa/12 text-success-text'
      case 'email':
        return 'bg-primary/12 text-primary'
      default:
        return 'bg-muted text-muted-foreground'
    }
  }

  const getStatusVariant = (status: string): BadgeProps['variant'] => {
    switch (status) {
      case 'delivered':
      case 'sent':
        return 'success'
      case 'failed':
        return 'destructive'
      case 'pending':
        return 'warning'
      case 'cancelled':
        return 'neutral'
      default:
        return 'neutral'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'Entregado'
      case 'sent':
        return 'Enviado'
      case 'failed':
        return 'Fallido'
      case 'pending':
        return 'Pendiente'
      case 'cancelled':
        return 'Cancelado'
      default:
        return status
    }
  }

  const activeTemplates = templates.filter((t) => t.isActive).length

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-8">
        <CircularProgress />
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
              <Bell className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Sistema de Recordatorios
              </h1>
              <p className="text-sm text-muted-foreground">
                Gestiona recordatorios multicanal para citas
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <ArrowClockwise className="size-4" aria-hidden />
              Actualizar
            </Button>
            <Button size="sm" onClick={() => handleOpenTemplateModal()}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nueva Plantilla
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Total Enviados" value={String(stats?.totalSent || 0)} />
          <StatTile
            label="Tasa de Entrega"
            value={`${(stats?.deliveryRate || 0).toFixed(1)}%`}
            tone="success"
          />
          <StatTile
            label="Plantillas Activas"
            value={String(activeTemplates)}
            tone="warning"
          />
          <StatTile
            label="Fallidos"
            value={String(stats?.failed || 0)}
            tone="destructive"
          />
        </div>

        {/* Tabs - Solo Plantillas e Historial */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/[0.02] sm:p-5">
          <Tabs
            value={String(activeTab)}
            onValueChange={(value) => setActiveTab(Number(value))}
          >
            <TabsList>
              <TabsTrigger value="0">Plantillas</TabsTrigger>
              <TabsTrigger value="1">Historial de Envíos</TabsTrigger>
            </TabsList>

            {/* Templates Tab */}
            <TabsContent value="0" className="mt-4">
              {templates.length === 0 ? (
                <div className="py-12 text-center">
                  <Bell
                    className="mx-auto mb-3 size-16 text-muted-foreground/40"
                    aria-hidden
                  />
                  <h2 className="mb-1 text-lg font-semibold text-foreground">
                    No hay plantillas
                  </h2>
                  <p className="mb-5 text-sm text-muted-foreground">
                    Crea tu primera plantilla de recordatorio
                  </p>
                  <Button size="sm" onClick={() => handleOpenTemplateModal()}>
                    <Plus className="size-4" weight="bold" aria-hidden />
                    Nueva Plantilla
                  </Button>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className="rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/[0.02]"
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={cn(
                              'flex size-10 shrink-0 items-center justify-center rounded-full',
                              getChannelTile(template.channel),
                            )}
                          >
                            {getChannelIcon(template.channel, 'size-5')}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {template.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {template.timing}h antes • {template.sentCount} enviados
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Switch
                            checked={template.isActive}
                            onChange={() => handleToggleTemplate(template.id)}
                            label={`Activar plantilla ${template.name}`}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={`Editar plantilla ${template.name}`}
                            title="Editar"
                            onClick={() => handleOpenTemplateModal(template)}
                          >
                            <PencilSimple className="size-[18px]" aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 hover:bg-destructive/10 hover:text-destructive-text"
                            aria-label={`Eliminar plantilla ${template.name}`}
                            title="Eliminar"
                            onClick={() => handleDeleteTemplate(template.id)}
                          >
                            <Trash className="size-[18px]" aria-hidden />
                          </Button>
                        </div>
                      </div>

                      <div className="mb-3 rounded-lg bg-muted/40 p-3">
                        {template.subject && (
                          <p className="mb-2 text-sm font-medium text-foreground">
                            Asunto: {template.subject}
                          </p>
                        )}
                        <p className="mb-0.5 text-xs font-medium text-primary">
                          🗓️ Mensaje de Cita Creada:
                        </p>
                        <p className="mb-2 whitespace-pre-wrap text-sm text-foreground">
                          {template.messageCreated?.substring(0, 80)}
                          {template.messageCreated?.length > 80 && '...'}
                        </p>
                        <p className="mb-0.5 text-xs font-medium text-primary">
                          📩 Mensaje de Confirmación:
                        </p>
                        <p className="mb-2 whitespace-pre-wrap text-sm text-foreground">
                          {template.messageConfirm?.substring(0, 80)}
                          {template.messageConfirm?.length > 80 && '...'}
                        </p>
                        <p className="mb-0.5 text-xs font-medium text-success-text">
                          ✅ Mensaje de Recordatorio:
                        </p>
                        <p className="whitespace-pre-wrap text-sm text-foreground">
                          {template.messageReminder?.substring(0, 80)}
                          {template.messageReminder?.length > 80 && '...'}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Tasa de entrega
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <LinearProgress
                              determinate
                              value={template.deliveryRate}
                              size="sm"
                              color={template.deliveryRate > 90 ? 'success' : 'warning'}
                              sx={{ width: 100 }}
                            />
                            <span className="text-sm font-medium tabular-nums text-foreground">
                              {template.deliveryRate}%
                            </span>
                          </div>
                        </div>
                        <Badge variant={getChannelVariant(template.channel)}>
                          {getChannelLabel(template.channel)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="1" className="mt-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-foreground">
                  Total de envíos: <span className="tabular-nums">{historyTotal}</span>
                </p>
                <Button variant="outline" size="sm" onClick={fetchHistory}>
                  <ArrowClockwise className="size-4" aria-hidden />
                  Actualizar
                </Button>
              </div>

              {logs.length === 0 ? (
                <div className="py-12 text-center">
                  <Clock
                    className="mx-auto mb-3 size-16 text-muted-foreground/40"
                    aria-hidden
                  />
                  <h2 className="mb-1 text-lg font-semibold text-foreground">
                    Sin historial
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    No hay recordatorios enviados aún
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 text-left">
                          {historyColumns.map((c, i) => (
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
                        {logs.map((log) => (
                          <tr
                            key={log.id}
                            className="transition-colors hover:bg-accent/40"
                          >
                            <td className="px-4 py-3">
                              <p className="font-medium text-foreground">
                                {log.clientName}
                              </p>
                              {log.clientEmail && (
                                <p className="text-xs text-muted-foreground">
                                  {log.clientEmail}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={getChannelVariant(log.channel)}>
                                {getChannelIcon(log.channel, 'size-3.5')}
                                {getChannelLabel(log.channel)}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={getStatusVariant(log.status)}>
                                {getStatusLabel(log.status)}
                              </Badge>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                              {log.sentAt ? new Date(log.sentAt).toLocaleString('es-ES', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              }) : '-'}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                              {log.deliveredAt
                                ? new Date(log.deliveredAt).toLocaleString('es-ES', {
                                    day: '2-digit',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : '-'}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                              {log.appointmentDate ? new Date(log.appointmentDate).toLocaleDateString('es-ES', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric'
                              }) : '-'}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {log.serviceName || '-'}
                            </td>
                            <td className="px-4 py-3">
                              {log.errorMessage ? (
                                <Badge variant="destructive">
                                  <WarningCircle className="size-3.5" aria-hidden />
                                  {log.errorMessage.length > 30 ? log.errorMessage.substring(0, 30) + '...' : log.errorMessage}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Pagination */}
              {historyTotal > 50 && (
                <div className="mt-4 flex items-center justify-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={historyPage === 1}
                    onClick={() => setHistoryPage(p => p - 1)}
                  >
                    Anterior
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Página {historyPage} de {Math.ceil(historyTotal / 50)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={historyPage >= Math.ceil(historyTotal / 50)}
                    onClick={() => setHistoryPage(p => p + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Template Modal */}
      <Dialog open={openTemplateModal} onOpenChange={setOpenTemplateModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'Editar Plantilla' : 'Nueva Plantilla'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">Nombre de la Plantilla</Label>
              <input
                id="tpl-name"
                required
                value={templateForm.name}
                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                placeholder="Ej: Recordatorio 24h - WhatsApp"
                className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-channel">Canal</Label>
                <Select
                  value={templateForm.channel}
                  onValueChange={(value) => setTemplateForm({ ...templateForm, channel: value as ReminderTemplate['channel'] })}
                >
                  <SelectTrigger id="tpl-channel" className="h-11" aria-label="Canal">
                    <SelectValue placeholder="Selecciona un canal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-timing">Tiempo antes (horas)</Label>
                <input
                  id="tpl-timing"
                  required
                  type="number"
                  min={1}
                  step={1}
                  value={templateForm.timing}
                  onChange={(e) => setTemplateForm({ ...templateForm, timing: parseInt(e.target.value) })}
                  className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>
            </div>

            {templateForm.channel === 'email' && (
              <div className="space-y-1.5">
                <Label htmlFor="tpl-subject">Asunto</Label>
                <input
                  id="tpl-subject"
                  required
                  value={templateForm.subject || ''}
                  onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })}
                  placeholder="Asunto del email"
                  className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="tpl-created">🗓️ Mensaje de Cita Creada</Label>
              <textarea
                id="tpl-created"
                required
                value={templateForm.messageCreated}
                onChange={(e) => setTemplateForm({ ...templateForm, messageCreated: e.target.value })}
                placeholder="Mensaje inmediato al crear la cita... Ej: Hola {{clientName}}, tu cita para {{service}} fue creada para el {{date}} a las {{time}} con {{agent}}."
                rows={4}
                className="w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
              <p className="text-xs text-muted-foreground">
                Este mensaje se envía apenas la cita fue creada.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tpl-confirm">📩 Mensaje de Confirmación</Label>
              <textarea
                id="tpl-confirm"
                required
                value={templateForm.messageConfirm}
                onChange={(e) => setTemplateForm({ ...templateForm, messageConfirm: e.target.value })}
                placeholder="Mensaje para pedir confirmación... Ej: Hola {{clientName}}, ¿confirmas tu cita para el {{date}} a las {{time}}? Responde SÍ para confirmar."
                rows={4}
                className="w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
              <p className="text-xs text-muted-foreground">
                Este mensaje se envía para solicitar confirmación de la cita.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tpl-reminder">✅ Mensaje de Recordatorio</Label>
              <textarea
                id="tpl-reminder"
                required
                value={templateForm.messageReminder}
                onChange={(e) => setTemplateForm({ ...templateForm, messageReminder: e.target.value })}
                placeholder="Mensaje de recordatorio cuando ya confirmó... Ej: Hola {{clientName}}, te recordamos tu cita confirmada para hoy {{date}} a las {{time}} con {{agent}}."
                rows={4}
                className="w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
              <p className="text-xs text-muted-foreground">
                Este mensaje se envía como recordatorio cuando el cliente ya confirmó.
              </p>
            </div>

            <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
              <strong className="text-foreground">Variables disponibles:</strong> {'{{'}clientName{'}}'}, {'{{'}date{'}}'}, {'{{'}time{'}}'}, {'{{'}agent{'}}'}, {'{{'}service{'}}'}
            </p>

            <div className="flex items-center gap-3">
              <Switch
                checked={!!templateForm.isActive}
                onChange={() => setTemplateForm({ ...templateForm, isActive: !templateForm.isActive })}
                label="Plantilla activa"
              />
              <span className="text-sm text-foreground">Plantilla activa</span>
            </div>

            <div className="h-px bg-border" role="separator" />

            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setOpenTemplateModal(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleSaveTemplate}
                disabled={!templateForm.name || !templateForm.messageCreated || !templateForm.messageConfirm || !templateForm.messageReminder}
                loading={savingTemplate}
              >
                {editingTemplate ? 'Guardar Cambios' : 'Crear Plantilla'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
