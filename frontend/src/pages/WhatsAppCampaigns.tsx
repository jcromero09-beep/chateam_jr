import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Table,
  Sheet,
  Chip,
  IconButton,
  Modal,
  ModalDialog,
  Input,
  FormControl,
  FormLabel,
  Select,
  Option,
  Textarea,
  Grid,
  LinearProgress,
  Alert,
  CircularProgress,
} from '@mui/joy'
import {
  Add as AddIcon,
  Send as SendIcon,
  Pause as PauseIcon,
  PlayArrow as PlayArrowIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  Campaign as CampaignIcon,
  Schedule as ScheduleIcon,
  WhatsApp as WhatsAppIcon,
} from '@mui/icons-material'
import { format, formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

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

  // ========================================
  // RENDER
  // ========================================

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

  if (loading) {
    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography level="h2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <CampaignIcon sx={{ fontSize: 32 }} />
            Campañas de Broadcasting WhatsApp
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Envío masivo de mensajes con plantillas Meta o texto libre
          </Typography>
        </Box>
        <Button startDecorator={<AddIcon />} onClick={() => setOpenModal(true)}>
          Nueva Campaña
        </Button>
      </Box>

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Total Campañas
              </Typography>
              <Typography level="h3">{campaigns.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Activas
              </Typography>
              <Typography level="h3" sx={{ color: 'primary.500' }}>
                {campaigns.filter((c) => c.status === 'sending' || c.status === 'scheduled').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Mensajes Enviados
              </Typography>
              <Typography level="h3" sx={{ color: 'success.500' }}>
                {campaigns.reduce((acc, c) => acc + c.sent, 0).toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Tasa Entrega
              </Typography>
              <Typography level="h3" sx={{ color: 'warning.500' }}>
                {campaigns.length > 0 ? (
                  (campaigns.reduce((acc, c) => acc + c.deliveryRate, 0) / campaigns.length).toFixed(1)
                ) : '0.0'}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabla */}
      <Card>
        <CardContent>
          <Sheet sx={{ overflow: 'auto' }}>
            <Table>
              <thead>
                <tr>
                  <th style={{ width: 220 }}>Campaña</th>
                  <th style={{ width: 120 }}>Estado</th>
                  <th style={{ width: 200 }}>Progreso</th>
                  <th style={{ width: 100 }}>Destinatarios</th>
                  <th style={{ width: 100 }}>Enviados</th>
                  <th style={{ width: 100 }}>Entregados</th>
                  <th style={{ width: 150 }}>Fecha Programada</th>
                  <th style={{ width: 140, textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id}>
                    <td>
                      <Box>
                        <Typography level="body-sm" fontWeight="lg">
                          {campaign.name}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          {campaign.useTemplate ? `Template: ${campaign.templateName}` : 'Mensaje libre'}
                        </Typography>
                      </Box>
                    </td>
                    <td>
                      <Chip size="sm" color={getStatusColor(campaign.status)}>
                        {getStatusText(campaign.status)}
                      </Chip>
                    </td>
                    <td>
                      <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography level="body-xs">
                            {campaign.sent} / {campaign.recipientsTotal}
                          </Typography>
                          <Typography level="body-xs" fontWeight="lg">
                            {calculateProgress(campaign).toFixed(1)}%
                          </Typography>
                        </Box>
                        <LinearProgress
                          determinate
                          value={calculateProgress(campaign)}
                          color={getStatusColor(campaign.status)}
                          size="sm"
                        />
                      </Box>
                    </td>
                    <td>
                      <Typography level="body-sm">
                        {campaign.recipientsTotal.toLocaleString()}
                      </Typography>
                    </td>
                    <td>
                      <Typography level="body-sm" fontWeight="lg">
                        {campaign.sent.toLocaleString()}
                      </Typography>
                    </td>
                    <td>
                      <Box>
                        <Typography level="body-sm" fontWeight="lg">
                          {campaign.delivered.toLocaleString()}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: 'success.500' }}>
                          {campaign.deliveryRate.toFixed(1)}%
                        </Typography>
                      </Box>
                    </td>
                    <td>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        {campaign.scheduledDate || '-'}
                      </Typography>
                    </td>
                    <td>
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                        {campaign.status === 'sending' && (
                          <IconButton size="sm" variant="plain" color="warning">
                            <PauseIcon />
                          </IconButton>
                        )}
                        {campaign.status === 'paused' && (
                          <IconButton size="sm" variant="plain" color="success">
                            <PlayArrowIcon />
                          </IconButton>
                        )}
                        {campaign.status === 'draft' && (
                          <IconButton size="sm" variant="plain" color="primary">
                            <SendIcon />
                          </IconButton>
                        )}
                        <IconButton size="sm" variant="plain" color="neutral">
                          <VisibilityIcon />
                        </IconButton>
                        <IconButton size="sm" variant="plain" color="danger">
                          <DeleteIcon />
                        </IconButton>
                      </Box>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Sheet>
        </CardContent>
      </Card>

      {/* Modal Nueva Campaña */}
      <Modal open={openModal} onClose={() => { setOpenModal(false); resetForm() }}>
        <ModalDialog sx={{ minWidth: 650, maxWidth: 700 }}>
          <Typography level="h4" sx={{ mb: 3 }}>
            Nueva Campaña de Broadcasting
          </Typography>

          <Grid container spacing={2}>
            {/* Nombre */}
            <Grid xs={12}>
              <FormControl required>
                <FormLabel>Nombre de la Campaña</FormLabel>
                <Input
                  placeholder="Ej: Promoción Black Friday"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                />
              </FormControl>
            </Grid>

            {/* Conexión WhatsApp */}
            <Grid xs={12}>
              <FormControl required>
                <FormLabel>Conexión WhatsApp</FormLabel>
                <Select
                  placeholder="Selecciona una conexión"
                  value={formData.whatsappId}
                  onChange={(_, value) => handleConnectionChange(value as number)}
                  startDecorator={<WhatsAppIcon />}
                >
                  {connections.map((conn) => (
                    <Option key={conn.id} value={conn.id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                          size="sm"
                          color={conn.channel === 'meta' || conn.channel === 'cloud_api' ? 'success' : 'neutral'}
                          variant="soft"
                        >
                          {conn.channel === 'meta' || conn.channel === 'cloud_api' ? 'Meta' : 'Baileys'}
                        </Chip>
                        {conn.name} - {conn.number}
                      </Box>
                    </Option>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* SI ES CONEXIÓN META: Selector de Plantilla */}
            {isMetaConnection && (
              <Grid xs={12}>
                <Alert color="info" sx={{ mb: 2 }}>
                  <Typography level="body-sm">
                    Las campañas con Meta usan <strong>plantillas aprobadas</strong>. No es posible escribir texto libre.
                  </Typography>
                </Alert>

                <FormControl required>
                  <FormLabel>Plantilla de Meta</FormLabel>
                  <Select
                    placeholder="Selecciona una plantilla aprobada"
                    value={formData.whastsAppTemplateId}
                    onChange={(_, value) => setFormData(prev => ({ ...prev, whastsAppTemplateId: value as number }))}
                  >
                    {templates.filter(t => t.status === 'APPROVED').map((template) => (
                      <Option key={template.id} value={template.id}>
                        <Box>
                          <Typography level="body-sm">
                            {template.name}
                          </Typography>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            {template.variablesCount > 0 ? `${template.variablesCount} variable(s)` : 'Sin variables'} | {template.language}
                          </Typography>
                        </Box>
                      </Option>
                    ))}
                  </Select>
                </FormControl>

                {/* Variables de la plantilla */}
                {selectedTemplate && selectedTemplate.variablesCount > 0 && (
                  <FormControl sx={{ mt: 2 }}>
                    <FormLabel>Parámetros de la Plantilla</FormLabel>
                    <Textarea
                      placeholder={'{"1": "Cliente", "2": "Valor"}'}
                      value={formData.templateParams}
                      onChange={(e) => setFormData(prev => ({ ...prev, templateParams: e.target.value }))}
                      minRows={2}
                    />
                    <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                      Usa {"{{1}}"}, {"{{2}}"}, etc. en el mensaje de la plantilla. Ej: {"{"}1": "Juan", "2": "50%{"} }
                    </Typography>
                  </FormControl>
                )}
              </Grid>
            )}

            {/* SI ES CONEXIÓN BAILEYS: Mensaje de texto libre */}
            {!isMetaConnection && formData.whatsappId && (
              <Grid xs={12}>
                <Alert color="warning" sx={{ mb: 2 }}>
                  <Typography level="body-sm">
                    Las campañas con Baileys usan <strong>mensajes de texto libre</strong>.
                  </Typography>
                </Alert>

                <FormControl required>
                  <FormLabel>Mensaje</FormLabel>
                  <Textarea
                    placeholder="Escribe tu mensaje aquí...&#10;Puedes usar variables: {nome}, {email}, {numero}"
                    value={formData.message1}
                    onChange={(e) => setFormData(prev => ({ ...prev, message1: e.target.value }))}
                    minRows={4}
                  />
                </FormControl>
              </Grid>
            )}

            {/* Estado del Ticket */}
            <Grid xs={12}>
              <FormControl>
                <FormLabel>Estado del Ticket al responder</FormLabel>
                <Select
                  value={formData.statusTicket}
                  onChange={(_, value) => setFormData(prev => ({ ...prev, statusTicket: value as string }))}
                >
                  <Option value="open">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip size="sm" color="success">Abierto</Chip>
                      El ticket se crea en estado "abierto"
                    </Box>
                  </Option>
                  <Option value="closed">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip size="sm" color="neutral">Cerrado</Chip>
                      El ticket se crea en estado "cerrado"
                    </Box>
                  </Option>
                </Select>
              </FormControl>
            </Grid>

            {/* Lista de Destinatarios */}
            <Grid xs={12}>
              <FormControl required>
                <FormLabel>Lista de Destinatarios</FormLabel>
                <Select
                  placeholder="Selecciona una lista"
                  value={formData.contactListId}
                  onChange={(_, value) => setFormData(prev => ({ ...prev, contactListId: value as number }))}
                >
                  {contactLists.map((list) => (
                    <Option key={list.id} value={list.id}>
                      {list.name} {list.contactsCount ? `(${list.contactsCount} contactos)` : ''}
                    </Option>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Fecha y Hora */}
            <Grid xs={6}>
              <FormControl>
                <FormLabel>Fecha de Envío</FormLabel>
                <Input
                  type="date"
                  value={formData.scheduledAt}
                  onChange={(e) => setFormData(prev => ({ ...prev, scheduledAt: e.target.value }))}
                />
              </FormControl>
            </Grid>
            <Grid xs={6}>
              <FormControl>
                <FormLabel>Hora de Envío</FormLabel>
                <Input
                  type="time"
                  value={formData.scheduledTime}
                  onChange={(e) => setFormData(prev => ({ ...prev, scheduledTime: e.target.value }))}
                />
              </FormControl>
            </Grid>
          </Grid>

          {/* Botones */}
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 3 }}>
            <Button
              variant="outlined"
              color="neutral"
              onClick={() => { setOpenModal(false); resetForm() }}
            >
              Cancelar
            </Button>
            <Button
              variant="outlined"
              startDecorator={<ScheduleIcon />}
              onClick={() => handleSubmit(false)}
              disabled={modalLoading}
            >
              Programar
            </Button>
            <Button
              startDecorator={<SendIcon />}
              onClick={() => handleSubmit(true)}
              disabled={modalLoading}
            >
              Enviar Ahora
            </Button>
          </Box>
        </ModalDialog>
      </Modal>
    </Box>
  )
}
