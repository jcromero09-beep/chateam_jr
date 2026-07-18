import { useState, useEffect, useCallback } from 'react'
// [Reskin] CircularProgress se CONSERVA como MUI a propósito (no hay equivalente en el DS).
import { CircularProgress } from '@mui/joy'
import {
  Gear,
  Palette,
  ChatCircleText,
  Code,
  FloppyDisk,
  Plus,
  Trash,
  Copy,
  SquaresFour,
  WhatsappLogo,
  TelegramLogo,
  FacebookLogo,
  InstagramLogo,
  Lightbulb,
  Info,
  X,
} from '@phosphor-icons/react'
import { toast } from 'react-toastify'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { cn } from '@/lib/utils'
import api from '../services/api'

interface Widget {
  id: number
  name: string
  whatsappId: number | null
  channel: string
  primaryColor: string
  secondaryColor: string
  position: string
  size: string
  borderRadius: number
  welcomeMessage: string
  offlineMessage: string
  placeholderText: string
  autoOpen: boolean
  autoOpenDelay: number
  showAvatar: boolean
  showAgentName: boolean
  enableSound: boolean
  enableFileUpload: boolean
  workingHoursEnabled: boolean
  workingHours: string
  timezone: string
  allowedDomains: string
  queueId: number | null
  customCSS: string
  status: boolean
  apiKey: string
  createdAt: string
  updatedAt: string
  whatsapp?: {
    id: number
    name: string
    status: string
    channel: string
  }
  queue?: {
    id: number
    name: string
    color: string
  }
}

interface Connection {
  id: number
  name: string
  status: string
  channel: string
  type: 'whatsapp' | 'telegram' | 'facebook' | 'instagram'
}

interface Queue {
  id: number
  name: string
  color: string
}

interface WidgetSettings {
  name: string
  whatsappId: number | null
  channel: string
  primaryColor: string
  secondaryColor: string
  position: string
  size: string
  borderRadius: number
  welcomeMessage: string
  offlineMessage: string
  placeholderText: string
  autoOpen: boolean
  autoOpenDelay: number
  showAvatar: boolean
  showAgentName: boolean
  enableSound: boolean
  enableFileUpload: boolean
  workingHoursEnabled: boolean
  workingHours: string
  timezone: string
  allowedDomains: string[]
  queueId: number | null
  customCSS: string
  status: boolean
}

const defaultSettings: WidgetSettings = {
  name: 'Nuevo Widget',
  whatsappId: null,
  channel: 'whatsapp',
  primaryColor: '#2196F3',
  secondaryColor: '#FFC107',
  position: 'bottom-right',
  size: 'medium',
  borderRadius: 16,
  welcomeMessage: '¡Hola! ¿En qué podemos ayudarte hoy?',
  offlineMessage: 'Lo sentimos, estamos fuera de línea. Déjanos un mensaje y te responderemos pronto.',
  placeholderText: 'Escribe tu mensaje...',
  autoOpen: false,
  autoOpenDelay: 3,
  showAvatar: true,
  showAgentName: true,
  enableSound: true,
  enableFileUpload: true,
  workingHoursEnabled: true,
  workingHours: 'Lun-Vie: 9:00-18:00',
  timezone: 'America/Santiago',
  allowedDomains: [],
  queueId: null,
  customCSS: '',
  status: true,
}

// Sentinela: Radix Select no admite items con value="" (colisiona con "sin selección").
const NO_QUEUE = 'none'

// Estilo compartido para inputs/textareas (mismo look que el Input del design system)
const inputClass =
  'h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-55'

const textareaClass =
  'w-full rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'

const hintClass = 'text-xs text-muted-foreground'

const cardClass =
  'rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]'

// Toggle accesible (role=switch) con tokens del DS — no hay wrapper Switch en @/components/ui.
function Toggle({
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
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-0 p-0 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
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

// Fila "título + descripción + toggle" reutilizada en General/Comportamiento.
function SettingRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string
  description: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  )
}

export default function WebChatSettings() {
  const [widgets, setWidgets] = useState<Widget[]>([])
  const [selectedWidget, setSelectedWidget] = useState<Widget | null>(null)
  const [settings, setSettings] = useState<WidgetSettings>(defaultSettings)
  const [connections, setConnections] = useState<Connection[]>([])
  const [queues, setQueues] = useState<Queue[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedTab, setSelectedTab] = useState(0)
  const [showPreview, setShowPreview] = useState(true)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [newDomain, setNewDomain] = useState('')

  // Cargar datos iniciales
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [widgetsRes, whatsappsRes, queuesRes] = await Promise.all([
        api.get('/webchat/widgets'),
        api.get('/whatsapp'),
        api.get('/queue'),
      ])

      setWidgets(widgetsRes.data)

      // Mapear conexiones disponibles
      const mappedConnections: Connection[] = whatsappsRes.data.map((w: any) => ({
        id: w.id,
        name: w.name,
        status: w.status,
        channel: w.channel || 'whatsapp',
        type: (w.channel || 'whatsapp') as any,
      }))
      setConnections(mappedConnections)
      setQueues(queuesRes.data)

      // Seleccionar primer widget si existe
      if (widgetsRes.data.length > 0) {
        selectWidget(widgetsRes.data[0])
      }
    } catch (error) {
      console.error('Error loading data:', error)
      toast.error('Error al cargar los datos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Seleccionar un widget existente
  const selectWidget = (widget: Widget) => {
    setSelectedWidget(widget)
    let allowedDomains: string[] = []
    try {
      if (widget.allowedDomains && typeof widget.allowedDomains === 'string') {
        const parsed = JSON.parse(widget.allowedDomains)
        allowedDomains = Array.isArray(parsed) ? parsed : []
      } else if (Array.isArray(widget.allowedDomains)) {
        allowedDomains = widget.allowedDomains as unknown as string[]
      }
    } catch {
      allowedDomains = []
    }

    setSettings({
      name: widget.name,
      whatsappId: widget.whatsappId,
      channel: widget.channel,
      primaryColor: widget.primaryColor,
      secondaryColor: widget.secondaryColor,
      position: widget.position,
      size: widget.size,
      borderRadius: widget.borderRadius,
      welcomeMessage: widget.welcomeMessage,
      offlineMessage: widget.offlineMessage,
      placeholderText: widget.placeholderText,
      autoOpen: widget.autoOpen,
      autoOpenDelay: widget.autoOpenDelay,
      showAvatar: widget.showAvatar,
      showAgentName: widget.showAgentName,
      enableSound: widget.enableSound,
      enableFileUpload: widget.enableFileUpload,
      workingHoursEnabled: widget.workingHoursEnabled,
      workingHours: widget.workingHours || '',
      timezone: widget.timezone,
      allowedDomains,
      queueId: widget.queueId,
      customCSS: widget.customCSS || '',
      status: widget.status,
    })
  }

  // Crear nuevo widget
  const handleCreateNew = () => {
    setSelectedWidget(null)
    setSettings(defaultSettings)
  }

  // Guardar widget
  const handleSave = async () => {
    if (!settings.name.trim()) {
      toast.error('El nombre del widget es requerido')
      return
    }

    if (!settings.whatsappId) {
      toast.error('Debes seleccionar una conexión')
      return
    }

    setSaving(true)
    try {
      const payload = {
        ...settings,
        allowedDomains: JSON.stringify(settings.allowedDomains),
      }

      if (selectedWidget) {
        // Actualizar
        const { data } = await api.put(`/webchat/widgets/${selectedWidget.id}`, payload)
        setWidgets(widgets.map(w => w.id === data.id ? data : w))
        setSelectedWidget(data)
        toast.success('Widget actualizado correctamente')
      } else {
        // Crear
        const { data } = await api.post('/webchat/widgets', payload)
        setWidgets([...widgets, data])
        setSelectedWidget(data)
        toast.success('Widget creado correctamente')
      }
    } catch (error: any) {
      console.error('Error saving widget:', error)
      toast.error(error.response?.data?.error || 'Error al guardar el widget')
    } finally {
      setSaving(false)
    }
  }

  // Eliminar widget
  const handleDelete = async () => {
    if (!selectedWidget) return

    try {
      await api.delete(`/webchat/widgets/${selectedWidget.id}`)
      setWidgets(widgets.filter(w => w.id !== selectedWidget.id))
      setDeleteModalOpen(false)

      // Seleccionar otro widget o limpiar
      if (widgets.length > 1) {
        const remaining = widgets.filter(w => w.id !== selectedWidget.id)
        selectWidget(remaining[0])
      } else {
        handleCreateNew()
      }

      toast.success('Widget eliminado correctamente')
    } catch (error) {
      console.error('Error deleting widget:', error)
      toast.error('Error al eliminar el widget')
    }
  }

  // Agregar dominio
  const handleAddDomain = () => {
    if (!newDomain.trim()) return
    const domain = newDomain.trim().toLowerCase()
    if (settings.allowedDomains.includes(domain)) {
      toast.warning('El dominio ya está en la lista')
      return
    }
    setSettings({
      ...settings,
      allowedDomains: [...settings.allowedDomains, domain],
    })
    setNewDomain('')
  }

  // Eliminar dominio
  const handleRemoveDomain = (domain: string) => {
    setSettings({
      ...settings,
      allowedDomains: settings.allowedDomains.filter(d => d !== domain),
    })
  }

  // Generar código embed
  const generateEmbedCode = () => {
    const apiKey = selectedWidget?.apiKey || 'YOUR_API_KEY'
    const widgetUrl = window.location.origin
    const backendUrl = (import.meta.env.VITE_API_URL || 'https://appro.chateam.ws').replace(/\/$/, '')

    return `<!-- Widget de WebChat de JR Chateam -->
<script>
  (function(w,d,s,o,f,js,fjs){
    w['ChatWidget']=o;w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};
    js=d.createElement(s),fjs=d.getElementsByTagName(s)[0];
    js.id=o;js.src=f;js.async=1;fjs.parentNode.insertBefore(js,fjs);
  }(window,document,'script','cw','${widgetUrl}/webchat-widget.js'));
  cw('init', {
    apiKey: '${apiKey}',
    backendUrl: '${backendUrl}'
  });
</script>`
  }

  // Copiar código al portapapeles
  const handleCopyCode = () => {
    navigator.clipboard.writeText(generateEmbedCode())
    toast.success('Código copiado al portapapeles')
  }

  // Obtener icono de canal
  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'whatsapp':
        return <WhatsappLogo className="size-5 shrink-0 text-wa" weight="fill" aria-hidden />
      case 'telegram':
        return <TelegramLogo className="size-5 shrink-0 text-[#0088cc]" weight="fill" aria-hidden />
      case 'facebook':
        return <FacebookLogo className="size-5 shrink-0 text-[#1877f2]" weight="fill" aria-hidden />
      case 'instagram':
        return <InstagramLogo className="size-5 shrink-0 text-[#e4405f]" weight="fill" aria-hidden />
      default:
        return <WhatsappLogo className="size-5 shrink-0 text-wa" weight="fill" aria-hidden />
    }
  }

  const getPositionLabel = (position: string) => {
    switch (position) {
      case 'bottom-right': return 'Abajo Derecha'
      case 'bottom-left': return 'Abajo Izquierda'
      case 'top-right': return 'Arriba Derecha'
      case 'top-left': return 'Arriba Izquierda'
      default: return position
    }
  }

  const getSizeLabel = (size: string) => {
    switch (size) {
      case 'small': return 'Pequeño'
      case 'medium': return 'Mediano'
      case 'large': return 'Grande'
      default: return size
    }
  }

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <CircularProgress />
      </div>
    )
  }

  // Estilos de la simulación del widget: dependen de datos del usuario
  // (color/posición/tamaño elegidos), por eso van inline y no como tokens.
  const [posY, posX] = settings.position.split('-')
  const previewWidgetStyle = {
    [posY]: 16,
    [posX]: 16,
    width: settings.size === 'small' ? 280 : settings.size === 'large' ? 380 : 320,
    height: settings.size === 'small' ? 360 : settings.size === 'large' ? 500 : 420,
    borderRadius: `${settings.borderRadius}px`,
  } as React.CSSProperties

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Gear className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Configuración del WebChat
              </h1>
              <p className="text-sm text-muted-foreground">
                Crea y personaliza widgets embebibles para tu sitio web
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCreateNew}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nuevo Widget
            </Button>
            {selectedWidget && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
                onClick={() => setDeleteModalOpen(true)}
              >
                <Trash className="size-4" aria-hidden />
                Eliminar
              </Button>
            )}
            <Button size="sm" onClick={handleSave} loading={saving}>
              {!saving && <FloppyDisk className="size-4" weight="fill" aria-hidden />}
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
          {/* Lista de Widgets */}
          <div className="md:col-span-3">
            <div className={cardClass}>
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                Mis Widgets ({widgets.length})
              </h2>
              <ul className="m-0 list-none space-y-1 p-0">
                {widgets.map((widget) => {
                  const isSelected = selectedWidget?.id === widget.id
                  return (
                    <li key={widget.id}>
                      <button
                        type="button"
                        aria-current={isSelected || undefined}
                        onClick={() => selectWidget(widget)}
                        className={cn(
                          'flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 px-2.5 py-2 text-left [font-family:inherit] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          isSelected
                            ? 'bg-accent text-accent-foreground'
                            : 'bg-transparent hover:bg-accent/40',
                        )}
                      >
                        {getChannelIcon(widget.channel)}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {widget.name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {widget.whatsapp?.name || 'Sin conexión'}
                          </span>
                        </span>
                        <Badge variant={widget.status ? 'success' : 'neutral'}>
                          {widget.status ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </button>
                    </li>
                  )
                })}
                {widgets.length === 0 && (
                  <li className="px-2.5 py-6 text-center text-sm text-muted-foreground">
                    No hay widgets creados
                  </li>
                )}
              </ul>
            </div>
          </div>

          {/* Configuración */}
          <div className={showPreview ? 'md:col-span-5' : 'md:col-span-9'}>
            <div className={cardClass}>
              <Tabs
                value={String(selectedTab)}
                onValueChange={(value) => setSelectedTab(Number(value))}
              >
                {/* flex-nowrap + scroll horizontal: con 5 tabs no siempre caben. */}
                <TabsList className="flex max-w-full flex-nowrap overflow-x-auto">
                  <TabsTrigger value="0">
                    <SquaresFour className="size-4" aria-hidden />
                    General
                  </TabsTrigger>
                  <TabsTrigger value="1">
                    <Palette className="size-4" aria-hidden />
                    Apariencia
                  </TabsTrigger>
                  <TabsTrigger value="2">
                    <ChatCircleText className="size-4" aria-hidden />
                    Mensajes
                  </TabsTrigger>
                  <TabsTrigger value="3">
                    <Gear className="size-4" aria-hidden />
                    Comportamiento
                  </TabsTrigger>
                  <TabsTrigger value="4">
                    <Code className="size-4" aria-hidden />
                    Código
                  </TabsTrigger>
                </TabsList>

                {/* Tab General */}
                <TabsContent value="0" className="mt-5 space-y-5">
                  <h3 className="text-base font-semibold text-foreground">
                    Configuración General
                  </h3>

                  <div className="space-y-1.5">
                    <Label htmlFor="widget-name">Nombre del Widget</Label>
                    <input
                      id="widget-name"
                      value={settings.name}
                      onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                      placeholder="Mi Widget Principal"
                      className={inputClass}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="widget-connection">Conexión a Usar</Label>
                    <Select
                      value={settings.whatsappId?.toString() || ''}
                      onValueChange={(value) => {
                        const connId = value ? parseInt(value, 10) : null
                        const conn = connections.find(c => c.id === connId)
                        setSettings({
                          ...settings,
                          whatsappId: connId,
                          channel: conn?.channel || 'whatsapp',
                        })
                      }}
                    >
                      <SelectTrigger id="widget-connection" className="h-11">
                        <SelectValue placeholder="Selecciona una conexión" />
                      </SelectTrigger>
                      <SelectContent>
                        {connections.map((conn) => (
                          <SelectItem key={conn.id} value={conn.id.toString()}>
                            <span className="flex items-center gap-2">
                              {getChannelIcon(conn.channel)}
                              <span>{conn.name}</span>
                              <Badge variant={conn.status === 'CONNECTED' ? 'success' : 'warning'}>
                                {conn.status}
                              </Badge>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className={hintClass}>
                      El widget usará esta conexión para crear tickets
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="widget-queue">Cola por Defecto</Label>
                    <Select
                      value={settings.queueId?.toString() || NO_QUEUE}
                      onValueChange={(value) =>
                        setSettings({
                          ...settings,
                          queueId: value === NO_QUEUE ? null : parseInt(value, 10),
                        })
                      }
                    >
                      <SelectTrigger id="widget-queue" className="h-11">
                        <SelectValue placeholder="Sin cola específica" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_QUEUE}>Sin cola específica</SelectItem>
                        {queues.map((queue) => (
                          <SelectItem key={queue.id} value={queue.id.toString()}>
                            <span className="flex items-center gap-2">
                              <span
                                className="size-3 shrink-0 rounded-full"
                                style={{ backgroundColor: queue.color }}
                                aria-hidden
                              />
                              <span>{queue.name}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className={hintClass}>
                      Los tickets del widget se asignarán a esta cola
                    </p>
                  </div>

                  <SettingRow
                    title="Estado del Widget"
                    description="Activa o desactiva el widget sin eliminarlo"
                    checked={settings.status}
                    onChange={() => setSettings({ ...settings, status: !settings.status })}
                  />

                  {selectedWidget && (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/50 p-3">
                      <p className="min-w-0 text-sm text-foreground">
                        <span className="font-semibold">API Key:</span>{' '}
                        <span className="break-all font-mono">{selectedWidget.apiKey}</span>
                      </p>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Copiar API Key"
                        className="size-8 shrink-0"
                        onClick={() => {
                          navigator.clipboard.writeText(selectedWidget.apiKey)
                          toast.success('API Key copiada')
                        }}
                      >
                        <Copy className="size-4" aria-hidden />
                      </Button>
                    </div>
                  )}
                </TabsContent>

                {/* Tab Apariencia */}
                <TabsContent value="1" className="mt-5 space-y-5">
                  <h3 className="text-base font-semibold text-foreground">
                    Personalización Visual
                  </h3>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="widget-primary-color">Color Primario</Label>
                      <input
                        id="widget-primary-color"
                        type="color"
                        value={settings.primaryColor}
                        onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                        className="h-11 w-full cursor-pointer rounded-md border border-input bg-card p-1"
                      />
                      <p className={hintClass}>Color del encabezado y botones</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="widget-secondary-color">Color Secundario</Label>
                      <input
                        id="widget-secondary-color"
                        type="color"
                        value={settings.secondaryColor}
                        onChange={(e) => setSettings({ ...settings, secondaryColor: e.target.value })}
                        className="h-11 w-full cursor-pointer rounded-md border border-input bg-card p-1"
                      />
                      <p className={hintClass}>Color de acentos y efectos hover</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="widget-position">Posición en Pantalla</Label>
                      <Select
                        value={settings.position}
                        onValueChange={(value) => setSettings({ ...settings, position: value })}
                      >
                        <SelectTrigger id="widget-position" className="h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bottom-right">Abajo Derecha</SelectItem>
                          <SelectItem value="bottom-left">Abajo Izquierda</SelectItem>
                          <SelectItem value="top-right">Arriba Derecha</SelectItem>
                          <SelectItem value="top-left">Arriba Izquierda</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="widget-size">Tamaño del Widget</Label>
                      <Select
                        value={settings.size}
                        onValueChange={(value) => setSettings({ ...settings, size: value })}
                      >
                        <SelectTrigger id="widget-size" className="h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="small">Pequeño</SelectItem>
                          <SelectItem value="medium">Mediano</SelectItem>
                          <SelectItem value="large">Grande</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="widget-radius">
                        Radio del Borde: {settings.borderRadius}px
                      </Label>
                      <input
                        id="widget-radius"
                        type="range"
                        min={0}
                        max={32}
                        value={settings.borderRadius}
                        onChange={(e) =>
                          setSettings({ ...settings, borderRadius: Number(e.target.value) })
                        }
                        className="h-11 w-full cursor-pointer accent-primary"
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* Tab Mensajes */}
                <TabsContent value="2" className="mt-5 space-y-5">
                  <h3 className="text-base font-semibold text-foreground">
                    Mensajes del Widget
                  </h3>

                  <div className="space-y-1.5">
                    <Label htmlFor="widget-welcome">Mensaje de Bienvenida</Label>
                    <textarea
                      id="widget-welcome"
                      value={settings.welcomeMessage}
                      onChange={(e) => setSettings({ ...settings, welcomeMessage: e.target.value })}
                      rows={2}
                      placeholder="¡Hola! ¿En qué podemos ayudarte?"
                      className={textareaClass}
                    />
                    <p className={hintClass}>Primer mensaje que verá el usuario</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="widget-offline">Mensaje Fuera de Línea</Label>
                    <textarea
                      id="widget-offline"
                      value={settings.offlineMessage}
                      onChange={(e) => setSettings({ ...settings, offlineMessage: e.target.value })}
                      rows={2}
                      placeholder="Lo sentimos, no hay agentes disponibles..."
                      className={textareaClass}
                    />
                    <p className={hintClass}>Mensaje cuando no hay agentes conectados</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="widget-placeholder">Texto del Placeholder</Label>
                    <input
                      id="widget-placeholder"
                      value={settings.placeholderText}
                      onChange={(e) => setSettings({ ...settings, placeholderText: e.target.value })}
                      placeholder="Escribe tu mensaje..."
                      className={inputClass}
                    />
                  </div>

                  <div className="flex items-start gap-2 rounded-lg bg-primary/10 p-4">
                    <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" weight="fill" aria-hidden />
                    <p className="text-sm text-foreground">
                      Tip: Usa un lenguaje amigable y cercano para aumentar el engagement
                    </p>
                  </div>
                </TabsContent>

                {/* Tab Comportamiento */}
                <TabsContent value="3" className="mt-5 space-y-5">
                  <h3 className="text-base font-semibold text-foreground">
                    Opciones de Comportamiento
                  </h3>

                  <SettingRow
                    title="Abrir Automáticamente"
                    description="El widget se abrirá automáticamente después de un tiempo"
                    checked={settings.autoOpen}
                    onChange={() => setSettings({ ...settings, autoOpen: !settings.autoOpen })}
                  />

                  {settings.autoOpen && (
                    <div className="space-y-1.5">
                      <Label htmlFor="widget-autoopen-delay">
                        Delay de Apertura (segundos): {settings.autoOpenDelay}s
                      </Label>
                      <input
                        id="widget-autoopen-delay"
                        type="range"
                        min={1}
                        max={10}
                        value={settings.autoOpenDelay}
                        onChange={(e) =>
                          setSettings({ ...settings, autoOpenDelay: Number(e.target.value) })
                        }
                        className="h-11 w-full cursor-pointer accent-primary"
                      />
                    </div>
                  )}

                  <div className="border-t border-border" />

                  <SettingRow
                    title="Mostrar Avatar del Agente"
                    description="Muestra la foto del agente en los mensajes"
                    checked={settings.showAvatar}
                    onChange={() => setSettings({ ...settings, showAvatar: !settings.showAvatar })}
                  />

                  <SettingRow
                    title="Mostrar Nombre del Agente"
                    description="Muestra el nombre del agente que responde"
                    checked={settings.showAgentName}
                    onChange={() => setSettings({ ...settings, showAgentName: !settings.showAgentName })}
                  />

                  <SettingRow
                    title="Sonido de Notificación"
                    description="Reproduce un sonido al recibir mensajes"
                    checked={settings.enableSound}
                    onChange={() => setSettings({ ...settings, enableSound: !settings.enableSound })}
                  />

                  <SettingRow
                    title="Permitir Subir Archivos"
                    description="Los usuarios pueden enviar imágenes y documentos"
                    checked={settings.enableFileUpload}
                    onChange={() => setSettings({ ...settings, enableFileUpload: !settings.enableFileUpload })}
                  />

                  <div className="border-t border-border" />

                  <SettingRow
                    title="Horario de Atención"
                    description="Muestra mensaje offline fuera del horario"
                    checked={settings.workingHoursEnabled}
                    onChange={() =>
                      setSettings({ ...settings, workingHoursEnabled: !settings.workingHoursEnabled })
                    }
                  />

                  {settings.workingHoursEnabled && (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor="widget-hours">Horario</Label>
                        <input
                          id="widget-hours"
                          value={settings.workingHours}
                          onChange={(e) => setSettings({ ...settings, workingHours: e.target.value })}
                          placeholder="Lun-Vie: 9:00-18:00"
                          className={inputClass}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="widget-timezone">Zona Horaria</Label>
                        <Select
                          value={settings.timezone}
                          onValueChange={(value) => setSettings({ ...settings, timezone: value })}
                        >
                          <SelectTrigger id="widget-timezone" className="h-11">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="America/Santiago">Santiago (GMT-3)</SelectItem>
                            <SelectItem value="America/Mexico_City">Ciudad de México (GMT-6)</SelectItem>
                            <SelectItem value="America/Buenos_Aires">Buenos Aires (GMT-3)</SelectItem>
                            <SelectItem value="America/Sao_Paulo">São Paulo (GMT-3)</SelectItem>
                            <SelectItem value="Europe/Madrid">Madrid (GMT+1)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                </TabsContent>

                {/* Tab Código */}
                <TabsContent value="4" className="mt-5 space-y-5">
                  <h3 className="text-base font-semibold text-foreground">
                    Código de Instalación
                  </h3>

                  {!selectedWidget ? (
                    <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/16 p-3">
                      <Info className="mt-0.5 size-4 shrink-0 text-warning-text" weight="fill" aria-hidden />
                      <p className="text-sm text-warning-text">
                        Guarda el widget primero para obtener el código de instalación
                      </p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <p className="mb-2 text-sm text-foreground">
                          Copia y pega este código antes del cierre de la etiqueta{' '}
                          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                            &lt;/body&gt;
                          </code>{' '}
                          en tu sitio web:
                        </p>
                        <div className="max-h-[300px] overflow-auto rounded-md border border-border bg-muted p-4">
                          <pre className="m-0 whitespace-pre-wrap break-all font-mono text-xs text-foreground">
                            {generateEmbedCode()}
                          </pre>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3 w-full"
                          onClick={handleCopyCode}
                        >
                          <Copy className="size-4" aria-hidden />
                          Copiar Código
                        </Button>
                      </div>

                      <div className="border-t border-border" />

                      <div className="space-y-1.5">
                        <Label htmlFor="widget-domain">Dominios Permitidos</Label>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {settings.allowedDomains.map((domain) => (
                            <span
                              key={domain}
                              className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pl-2.5 pr-1 text-xs font-medium text-foreground"
                            >
                              {domain}
                              <button
                                type="button"
                                aria-label={`Quitar dominio ${domain}`}
                                title={`Quitar dominio ${domain}`}
                                onClick={() => handleRemoveDomain(domain)}
                                className="flex size-6 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive-text focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <X className="size-3" weight="bold" aria-hidden />
                              </button>
                            </span>
                          ))}
                          {settings.allowedDomains.length === 0 && (
                            <p className={hintClass}>
                              Sin restricciones (funciona en cualquier dominio)
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            id="widget-domain"
                            placeholder="ejemplo.com"
                            value={newDomain}
                            onChange={(e) => setNewDomain(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddDomain()}
                            className={cn(inputClass, 'h-9 flex-1')}
                          />
                          <Button size="sm" onClick={handleAddDomain}>
                            Agregar
                          </Button>
                        </div>
                        <p className={hintClass}>
                          El widget solo funcionará en estos dominios (dejar vacío para sin restricciones)
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="widget-css">CSS Personalizado (Opcional)</Label>
                        <textarea
                          id="widget-css"
                          value={settings.customCSS}
                          onChange={(e) => setSettings({ ...settings, customCSS: e.target.value })}
                          rows={6}
                          placeholder=".webchat-widget { ... }"
                          className={cn(textareaClass, 'font-mono')}
                        />
                      </div>
                    </>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </div>

          {/* Vista Previa */}
          {showPreview && (
            <div className="md:col-span-4">
              <div className={cn(cardClass, 'sticky top-4')}>
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-foreground">Vista Previa</h2>
                  <Button variant="ghost" size="sm" onClick={() => setShowPreview(false)}>
                    Ocultar
                  </Button>
                </div>

                <div className="relative h-[450px] overflow-hidden rounded-lg border border-border bg-background">
                  {/* Simulación del widget */}
                  <div
                    className="absolute flex flex-col overflow-hidden bg-card shadow-lg"
                    style={previewWidgetStyle}
                  >
                    {/* Header */}
                    <div
                      className="p-4"
                      style={{
                        backgroundColor: settings.primaryColor,
                        borderRadius: `${settings.borderRadius}px ${settings.borderRadius}px 0 0`,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {getChannelIcon(settings.channel)}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-white">
                            {settings.name || 'Chat de Soporte'}
                          </p>
                          <p className="text-xs text-white/80">En línea</p>
                        </div>
                      </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-auto p-4">
                      <div className="mb-2 max-w-[85%] rounded-lg bg-muted p-3">
                        <p className="text-sm text-foreground">{settings.welcomeMessage}</p>
                      </div>
                    </div>

                    {/* Input */}
                    <div className="border-t border-border p-4">
                      <input
                        placeholder={settings.placeholderText}
                        disabled
                        aria-label="Vista previa del campo de mensaje"
                        className={cn(inputClass, 'h-9')}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-col items-start gap-1.5">
                  <Badge variant="primary">
                    Posición: {getPositionLabel(settings.position)}
                  </Badge>
                  <Badge variant="neutral">Tamaño: {getSizeLabel(settings.size)}</Badge>
                  <Badge variant={settings.status ? 'success' : 'warning'}>
                    Estado: {settings.status ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>
              </div>
            </div>
          )}

          {!showPreview && (
            <div className="md:col-span-12">
              <Button variant="outline" className="w-full" onClick={() => setShowPreview(true)}>
                Mostrar Vista Previa
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Modal de confirmación de eliminación */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar Widget</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar el widget "{selectedWidget?.name}"? Esta acción no
              se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteModalOpen(false)}>
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
  )
}
