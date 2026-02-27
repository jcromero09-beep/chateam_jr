import { useState, useEffect, useCallback } from 'react'
import {
  Container,
  Typography,
  Box,
  Stack,
  Card,
  CardContent,
  Grid,
  Button,
  Input,
  Select,
  Option,
  FormControl,
  FormLabel,
  Switch,
  Textarea,
  Chip,
  Divider,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Slider,
  IconButton,
  Modal,
  ModalDialog,
  ModalClose,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemButton,
  ListItemContent,
  ListItemDecorator,
} from '@mui/joy'
import {
  Settings as SettingsIcon,
  Palette as PaletteIcon,
  Message as MessageIcon,
  Code as CodeIcon,
  Save as SaveIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  ContentCopy as CopyIcon,
  Widgets as WidgetIcon,
  WhatsApp as WhatsAppIcon,
  Telegram as TelegramIcon,
  Facebook as FacebookIcon,
  Instagram as InstagramIcon,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
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
    const backendUrl = window.location.origin.replace(':3000', ':8080') // Ajustar para producción

    return `<!-- Widget de WebChat de JR Chateam -->
<script>
  (function(w,d,s,o,f,js,fjs){
    w['ChatWidget']=o;w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};
    js=d.createElement(s),fjs=d.getElementsByTagName(s)[0];
    js.id=o;js.src=f;js.async=1;fjs.parentNode.insertBefore(js,fjs);
  }(window,document,'script','cw','${backendUrl}/webchat-widget.js'));
  cw('init', {
    apiKey: '${apiKey}'
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
        return <WhatsAppIcon sx={{ color: '#25D366' }} />
      case 'telegram':
        return <TelegramIcon sx={{ color: '#0088cc' }} />
      case 'facebook':
        return <FacebookIcon sx={{ color: '#1877F2' }} />
      case 'instagram':
        return <InstagramIcon sx={{ color: '#E4405F' }} />
      default:
        return <WhatsAppIcon />
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
      <Container maxWidth="xl">
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
          <CircularProgress />
        </Box>
      </Container>
    )
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <SettingsIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Configuración del WebChat</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Crea y personaliza widgets embebibles para tu sitio web
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              color="neutral"
              startDecorator={<AddIcon />}
              onClick={handleCreateNew}
            >
              Nuevo Widget
            </Button>
            {selectedWidget && (
              <Button
                variant="outlined"
                color="danger"
                startDecorator={<DeleteIcon />}
                onClick={() => setDeleteModalOpen(true)}
              >
                Eliminar
              </Button>
            )}
            <Button
              variant="solid"
              color="primary"
              startDecorator={saving ? <CircularProgress size="sm" /> : <SaveIcon />}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </Stack>
        </Stack>

        <Grid container spacing={3}>
          {/* Lista de Widgets */}
          <Grid xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography level="title-md" sx={{ mb: 2 }}>
                  Mis Widgets ({widgets.length})
                </Typography>
                <List>
                  {widgets.map((widget) => (
                    <ListItem key={widget.id}>
                      <ListItemButton
                        selected={selectedWidget?.id === widget.id}
                        onClick={() => selectWidget(widget)}
                      >
                        <ListItemDecorator>
                          {getChannelIcon(widget.channel)}
                        </ListItemDecorator>
                        <ListItemContent>
                          <Typography level="body-sm" fontWeight="md">
                            {widget.name}
                          </Typography>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            {widget.whatsapp?.name || 'Sin conexión'}
                          </Typography>
                        </ListItemContent>
                        <Chip
                          size="sm"
                          variant="soft"
                          color={widget.status ? 'success' : 'neutral'}
                        >
                          {widget.status ? 'Activo' : 'Inactivo'}
                        </Chip>
                      </ListItemButton>
                    </ListItem>
                  ))}
                  {widgets.length === 0 && (
                    <ListItem>
                      <ListItemContent>
                        <Typography level="body-sm" sx={{ color: 'text.tertiary', textAlign: 'center' }}>
                          No hay widgets creados
                        </Typography>
                      </ListItemContent>
                    </ListItem>
                  )}
                </List>
              </CardContent>
            </Card>
          </Grid>

          {/* Configuración */}
          <Grid xs={12} md={showPreview ? 5 : 9}>
            <Card>
              <Tabs value={selectedTab} onChange={(_, value) => setSelectedTab(value as number)}>
                <TabList>
                  <Tab>
                    <WidgetIcon sx={{ mr: 1 }} />
                    General
                  </Tab>
                  <Tab>
                    <PaletteIcon sx={{ mr: 1 }} />
                    Apariencia
                  </Tab>
                  <Tab>
                    <MessageIcon sx={{ mr: 1 }} />
                    Mensajes
                  </Tab>
                  <Tab>
                    <SettingsIcon sx={{ mr: 1 }} />
                    Comportamiento
                  </Tab>
                  <Tab>
                    <CodeIcon sx={{ mr: 1 }} />
                    Código
                  </Tab>
                </TabList>

                {/* Tab General */}
                <TabPanel value={0}>
                  <Stack spacing={3}>
                    <Typography level="h4">Configuración General</Typography>

                    <FormControl>
                      <FormLabel>Nombre del Widget</FormLabel>
                      <Input
                        value={settings.name}
                        onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                        placeholder="Mi Widget Principal"
                      />
                    </FormControl>

                    <FormControl>
                      <FormLabel>Conexión a Usar</FormLabel>
                      <Select
                        value={settings.whatsappId?.toString() || ''}
                        onChange={(_, value) => {
                          const connId = value ? parseInt(value as string, 10) : null
                          const conn = connections.find(c => c.id === connId)
                          setSettings({
                            ...settings,
                            whatsappId: connId,
                            channel: conn?.channel || 'whatsapp',
                          })
                        }}
                        placeholder="Selecciona una conexión"
                      >
                        {connections.map((conn) => (
                          <Option key={conn.id} value={conn.id.toString()}>
                            <Stack direction="row" spacing={1} alignItems="center">
                              {getChannelIcon(conn.channel)}
                              <span>{conn.name}</span>
                              <Chip size="sm" variant="soft" color={conn.status === 'CONNECTED' ? 'success' : 'warning'}>
                                {conn.status}
                              </Chip>
                            </Stack>
                          </Option>
                        ))}
                      </Select>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                        El widget usará esta conexión para crear tickets
                      </Typography>
                    </FormControl>

                    <FormControl>
                      <FormLabel>Cola por Defecto</FormLabel>
                      <Select
                        value={settings.queueId?.toString() || ''}
                        onChange={(_, value) => setSettings({ ...settings, queueId: value ? parseInt(value as string, 10) : null })}
                        placeholder="Sin cola específica"
                      >
                        <Option value="">Sin cola específica</Option>
                        {queues.map((queue) => (
                          <Option key={queue.id} value={queue.id.toString()}>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: queue.color }} />
                              <span>{queue.name}</span>
                            </Stack>
                          </Option>
                        ))}
                      </Select>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                        Los tickets del widget se asignarán a esta cola
                      </Typography>
                    </FormControl>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography level="body-md" fontWeight="bold">
                          Estado del Widget
                        </Typography>
                        <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                          Activa o desactiva el widget sin eliminarlo
                        </Typography>
                      </Box>
                      <Switch
                        checked={settings.status}
                        onChange={(e) => setSettings({ ...settings, status: e.target.checked })}
                        color={settings.status ? 'success' : 'neutral'}
                      />
                    </Box>

                    {selectedWidget && (
                      <Alert color="neutral" variant="soft">
                        <Typography level="body-sm">
                          <strong>API Key:</strong> {selectedWidget.apiKey}
                        </Typography>
                        <IconButton
                          size="sm"
                          variant="plain"
                          onClick={() => {
                            navigator.clipboard.writeText(selectedWidget.apiKey)
                            toast.success('API Key copiada')
                          }}
                        >
                          <CopyIcon fontSize="small" />
                        </IconButton>
                      </Alert>
                    )}
                  </Stack>
                </TabPanel>

                {/* Tab Apariencia */}
                <TabPanel value={1}>
                  <Stack spacing={3}>
                    <Typography level="h4">Personalización Visual</Typography>

                    <Grid container spacing={2}>
                      <Grid xs={12} sm={6}>
                        <FormControl>
                          <FormLabel>Color Primario</FormLabel>
                          <Input
                            type="color"
                            value={settings.primaryColor}
                            onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                          />
                          <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                            Color del encabezado y botones
                          </Typography>
                        </FormControl>
                      </Grid>

                      <Grid xs={12} sm={6}>
                        <FormControl>
                          <FormLabel>Color Secundario</FormLabel>
                          <Input
                            type="color"
                            value={settings.secondaryColor}
                            onChange={(e) => setSettings({ ...settings, secondaryColor: e.target.value })}
                          />
                          <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                            Color de acentos y efectos hover
                          </Typography>
                        </FormControl>
                      </Grid>

                      <Grid xs={12} sm={6}>
                        <FormControl>
                          <FormLabel>Posición en Pantalla</FormLabel>
                          <Select
                            value={settings.position}
                            onChange={(_, value) => setSettings({ ...settings, position: value as string })}
                          >
                            <Option value="bottom-right">Abajo Derecha</Option>
                            <Option value="bottom-left">Abajo Izquierda</Option>
                            <Option value="top-right">Arriba Derecha</Option>
                            <Option value="top-left">Arriba Izquierda</Option>
                          </Select>
                        </FormControl>
                      </Grid>

                      <Grid xs={12} sm={6}>
                        <FormControl>
                          <FormLabel>Tamaño del Widget</FormLabel>
                          <Select
                            value={settings.size}
                            onChange={(_, value) => setSettings({ ...settings, size: value as string })}
                          >
                            <Option value="small">Pequeño</Option>
                            <Option value="medium">Mediano</Option>
                            <Option value="large">Grande</Option>
                          </Select>
                        </FormControl>
                      </Grid>

                      <Grid xs={12}>
                        <FormControl>
                          <FormLabel>Radio del Borde: {settings.borderRadius}px</FormLabel>
                          <Slider
                            min={0}
                            max={32}
                            value={settings.borderRadius}
                            onChange={(_e, value) => setSettings({ ...settings, borderRadius: value as number })}
                          />
                        </FormControl>
                      </Grid>
                    </Grid>
                  </Stack>
                </TabPanel>

                {/* Tab Mensajes */}
                <TabPanel value={2}>
                  <Stack spacing={3}>
                    <Typography level="h4">Mensajes del Widget</Typography>

                    <FormControl>
                      <FormLabel>Mensaje de Bienvenida</FormLabel>
                      <Textarea
                        value={settings.welcomeMessage}
                        onChange={(e) => setSettings({ ...settings, welcomeMessage: e.target.value })}
                        minRows={2}
                        placeholder="¡Hola! ¿En qué podemos ayudarte?"
                      />
                      <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                        Primer mensaje que verá el usuario
                      </Typography>
                    </FormControl>

                    <FormControl>
                      <FormLabel>Mensaje Fuera de Línea</FormLabel>
                      <Textarea
                        value={settings.offlineMessage}
                        onChange={(e) => setSettings({ ...settings, offlineMessage: e.target.value })}
                        minRows={2}
                        placeholder="Lo sentimos, no hay agentes disponibles..."
                      />
                      <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                        Mensaje cuando no hay agentes conectados
                      </Typography>
                    </FormControl>

                    <FormControl>
                      <FormLabel>Texto del Placeholder</FormLabel>
                      <Input
                        value={settings.placeholderText}
                        onChange={(e) => setSettings({ ...settings, placeholderText: e.target.value })}
                        placeholder="Escribe tu mensaje..."
                      />
                    </FormControl>

                    <Box sx={{ p: 2, bgcolor: 'primary.softBg', borderRadius: 'sm' }}>
                      <Typography level="body-sm">
                        💡 Tip: Usa un lenguaje amigable y cercano para aumentar el engagement
                      </Typography>
                    </Box>
                  </Stack>
                </TabPanel>

                {/* Tab Comportamiento */}
                <TabPanel value={3}>
                  <Stack spacing={3}>
                    <Typography level="h4">Opciones de Comportamiento</Typography>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography level="body-md" fontWeight="bold">
                          Abrir Automáticamente
                        </Typography>
                        <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                          El widget se abrirá automáticamente después de un tiempo
                        </Typography>
                      </Box>
                      <Switch
                        checked={settings.autoOpen}
                        onChange={(e) => setSettings({ ...settings, autoOpen: e.target.checked })}
                      />
                    </Box>

                    {settings.autoOpen && (
                      <FormControl>
                        <FormLabel>Delay de Apertura (segundos): {settings.autoOpenDelay}s</FormLabel>
                        <Slider
                          min={1}
                          max={10}
                          value={settings.autoOpenDelay}
                          onChange={(_e, value) => setSettings({ ...settings, autoOpenDelay: value as number })}
                        />
                      </FormControl>
                    )}

                    <Divider />

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography level="body-md" fontWeight="bold">
                          Mostrar Avatar del Agente
                        </Typography>
                        <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                          Muestra la foto del agente en los mensajes
                        </Typography>
                      </Box>
                      <Switch
                        checked={settings.showAvatar}
                        onChange={(e) => setSettings({ ...settings, showAvatar: e.target.checked })}
                      />
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography level="body-md" fontWeight="bold">
                          Mostrar Nombre del Agente
                        </Typography>
                        <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                          Muestra el nombre del agente que responde
                        </Typography>
                      </Box>
                      <Switch
                        checked={settings.showAgentName}
                        onChange={(e) => setSettings({ ...settings, showAgentName: e.target.checked })}
                      />
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography level="body-md" fontWeight="bold">
                          Sonido de Notificación
                        </Typography>
                        <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                          Reproduce un sonido al recibir mensajes
                        </Typography>
                      </Box>
                      <Switch
                        checked={settings.enableSound}
                        onChange={(e) => setSettings({ ...settings, enableSound: e.target.checked })}
                      />
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography level="body-md" fontWeight="bold">
                          Permitir Subir Archivos
                        </Typography>
                        <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                          Los usuarios pueden enviar imágenes y documentos
                        </Typography>
                      </Box>
                      <Switch
                        checked={settings.enableFileUpload}
                        onChange={(e) => setSettings({ ...settings, enableFileUpload: e.target.checked })}
                      />
                    </Box>

                    <Divider />

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography level="body-md" fontWeight="bold">
                          Horario de Atención
                        </Typography>
                        <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                          Muestra mensaje offline fuera del horario
                        </Typography>
                      </Box>
                      <Switch
                        checked={settings.workingHoursEnabled}
                        onChange={(e) => setSettings({ ...settings, workingHoursEnabled: e.target.checked })}
                      />
                    </Box>

                    {settings.workingHoursEnabled && (
                      <>
                        <FormControl>
                          <FormLabel>Horario</FormLabel>
                          <Input
                            value={settings.workingHours}
                            onChange={(e) => setSettings({ ...settings, workingHours: e.target.value })}
                            placeholder="Lun-Vie: 9:00-18:00"
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel>Zona Horaria</FormLabel>
                          <Select
                            value={settings.timezone}
                            onChange={(_, value) => setSettings({ ...settings, timezone: value as string })}
                          >
                            <Option value="America/Santiago">Santiago (GMT-3)</Option>
                            <Option value="America/Mexico_City">Ciudad de México (GMT-6)</Option>
                            <Option value="America/Buenos_Aires">Buenos Aires (GMT-3)</Option>
                            <Option value="America/Sao_Paulo">São Paulo (GMT-3)</Option>
                            <Option value="Europe/Madrid">Madrid (GMT+1)</Option>
                          </Select>
                        </FormControl>
                      </>
                    )}
                  </Stack>
                </TabPanel>

                {/* Tab Código */}
                <TabPanel value={4}>
                  <Stack spacing={3}>
                    <Typography level="h4">Código de Instalación</Typography>

                    {!selectedWidget ? (
                      <Alert color="warning" variant="soft">
                        Guarda el widget primero para obtener el código de instalación
                      </Alert>
                    ) : (
                      <>
                        <Box>
                          <Typography level="body-sm" sx={{ mb: 1 }}>
                            Copia y pega este código antes del cierre de la etiqueta <code>&lt;/body&gt;</code> en tu sitio web:
                          </Typography>
                          <Box
                            sx={{
                              p: 2,
                              bgcolor: 'neutral.softBg',
                              borderRadius: 'sm',
                              fontFamily: 'monospace',
                              fontSize: 'xs',
                              overflow: 'auto',
                              maxHeight: 300,
                            }}
                          >
                            <pre style={{ margin: 0 }}>{generateEmbedCode()}</pre>
                          </Box>
                          <Button
                            fullWidth
                            variant="outlined"
                            startDecorator={<CopyIcon />}
                            sx={{ mt: 2 }}
                            onClick={handleCopyCode}
                          >
                            Copiar Código
                          </Button>
                        </Box>

                        <Divider />

                        <FormControl>
                          <FormLabel>Dominios Permitidos</FormLabel>
                          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1 }}>
                            {settings.allowedDomains.map((domain) => (
                              <Chip
                                key={domain}
                                variant="soft"
                                endDecorator={
                                  <IconButton
                                    size="sm"
                                    variant="plain"
                                    color="neutral"
                                    onClick={() => handleRemoveDomain(domain)}
                                  >
                                    ×
                                  </IconButton>
                                }
                              >
                                {domain}
                              </Chip>
                            ))}
                            {settings.allowedDomains.length === 0 && (
                              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                Sin restricciones (funciona en cualquier dominio)
                              </Typography>
                            )}
                          </Stack>
                          <Stack direction="row" spacing={1}>
                            <Input
                              size="sm"
                              placeholder="ejemplo.com"
                              value={newDomain}
                              onChange={(e) => setNewDomain(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleAddDomain()}
                              sx={{ flex: 1 }}
                            />
                            <Button size="sm" onClick={handleAddDomain}>
                              Agregar
                            </Button>
                          </Stack>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                            El widget solo funcionará en estos dominios (dejar vacío para sin restricciones)
                          </Typography>
                        </FormControl>

                        <FormControl>
                          <FormLabel>CSS Personalizado (Opcional)</FormLabel>
                          <Textarea
                            value={settings.customCSS}
                            onChange={(e) => setSettings({ ...settings, customCSS: e.target.value })}
                            minRows={6}
                            placeholder=".webchat-widget { ... }"
                            sx={{ fontFamily: 'monospace', fontSize: 'sm' }}
                          />
                        </FormControl>
                      </>
                    )}
                  </Stack>
                </TabPanel>
              </Tabs>
            </Card>
          </Grid>

          {/* Vista Previa */}
          {showPreview && (
            <Grid xs={12} md={4}>
              <Card sx={{ position: 'sticky', top: 16 }}>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography level="h4">Vista Previa</Typography>
                    <Button
                      size="sm"
                      variant="plain"
                      onClick={() => setShowPreview(false)}
                    >
                      Ocultar
                    </Button>
                  </Stack>

                  <Box
                    sx={{
                      height: 450,
                      bgcolor: 'background.level1',
                      borderRadius: 'sm',
                      position: 'relative',
                      border: '1px solid',
                      borderColor: 'divider',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Simulación del widget */}
                    <Box
                      sx={{
                        position: 'absolute',
                        [settings.position.split('-')[0]]: 16,
                        [settings.position.split('-')[1]]: 16,
                        width: settings.size === 'small' ? 280 : settings.size === 'large' ? 380 : 320,
                        height: settings.size === 'small' ? 360 : settings.size === 'large' ? 500 : 420,
                        bgcolor: 'background.surface',
                        borderRadius: `${settings.borderRadius}px`,
                        boxShadow: 'lg',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      {/* Header */}
                      <Box
                        sx={{
                          p: 2,
                          bgcolor: settings.primaryColor,
                          color: 'white',
                          borderRadius: `${settings.borderRadius}px ${settings.borderRadius}px 0 0`,
                        }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center">
                          {getChannelIcon(settings.channel)}
                          <Box>
                            <Typography level="body-md" fontWeight="bold" sx={{ color: 'white' }}>
                              {settings.name || 'Chat de Soporte'}
                            </Typography>
                            <Typography level="body-xs" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                              En línea
                            </Typography>
                          </Box>
                        </Stack>
                      </Box>

                      {/* Messages */}
                      <Box sx={{ flexGrow: 1, p: 2, overflow: 'auto' }}>
                        <Box
                          sx={{
                            p: 1.5,
                            bgcolor: 'neutral.softBg',
                            borderRadius: 'sm',
                            mb: 1,
                            maxWidth: '85%',
                          }}
                        >
                          <Typography level="body-sm">{settings.welcomeMessage}</Typography>
                        </Box>
                      </Box>

                      {/* Input */}
                      <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                        <Input placeholder={settings.placeholderText} disabled size="sm" />
                      </Box>
                    </Box>
                  </Box>

                  <Stack spacing={1} sx={{ mt: 2 }}>
                    <Chip size="sm" variant="soft" color="primary">
                      Posición: {getPositionLabel(settings.position)}
                    </Chip>
                    <Chip size="sm" variant="soft" color="neutral">
                      Tamaño: {getSizeLabel(settings.size)}
                    </Chip>
                    <Chip size="sm" variant="soft" color={settings.status ? 'success' : 'warning'}>
                      Estado: {settings.status ? 'Activo' : 'Inactivo'}
                    </Chip>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          )}

          {!showPreview && (
            <Grid xs={12}>
              <Button
                variant="plain"
                onClick={() => setShowPreview(true)}
                sx={{ width: '100%' }}
              >
                Mostrar Vista Previa
              </Button>
            </Grid>
          )}
        </Grid>
      </Stack>

      {/* Modal de confirmación de eliminación */}
      <Modal open={deleteModalOpen} onClose={() => setDeleteModalOpen(false)}>
        <ModalDialog variant="outlined" role="alertdialog">
          <ModalClose />
          <Typography level="h4">Eliminar Widget</Typography>
          <Typography level="body-md">
            ¿Estás seguro de que deseas eliminar el widget "{selectedWidget?.name}"? Esta acción no se puede deshacer.
          </Typography>
          <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
            <Button variant="plain" color="neutral" onClick={() => setDeleteModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="solid" color="danger" onClick={handleDelete}>
              Eliminar
            </Button>
          </Stack>
        </ModalDialog>
      </Modal>
    </Container>
  )
}
