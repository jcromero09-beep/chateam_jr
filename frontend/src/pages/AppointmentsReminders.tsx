import { useState, useEffect } from 'react'
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Grid,
  Sheet,
  Chip,
  Button,
  IconButton,
  Switch,
  Select,
  Option,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  Divider,
  Table,
  Avatar,
  Modal,
  ModalDialog,
  ModalClose,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  LinearProgress,
  CircularProgress,
} from '@mui/joy'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Send as SendIcon,
  Schedule as ScheduleIcon,
  WhatsApp as WhatsAppIcon,
  Email as EmailIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Notifications as NotificationsIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
import api from '../services/api'

interface ReminderTemplate {
  id: number
  name: string
  channel: 'email' | 'whatsapp'
  subject?: string
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

export default function AppointmentsReminders() {
  const [templates, setTemplates] = useState<ReminderTemplate[]>([])
  const [logs, setLogs] = useState<ReminderLog[]>([])
  const [stats, setStats] = useState<ReminderStats | null>(null)
  const [openTemplateModal, setOpenTemplateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<ReminderTemplate | null>(null)
  const [templateForm, setTemplateForm] = useState<Partial<ReminderTemplate>>({
    name: '',
    channel: 'whatsapp',
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
        messageConfirm: '',
        messageReminder: '',
        timing: 24,
        isActive: true,
      })
    }
    setOpenTemplateModal(true)
  }

  const handleSaveTemplate = async () => {
    if (!templateForm.name || !templateForm.messageConfirm || !templateForm.messageReminder || templateForm.timing === undefined) {
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

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'whatsapp':
        return <WhatsAppIcon />
      case 'email':
        return <EmailIcon />
      default:
        return <NotificationsIcon />
    }
  }

  const getChannelColor = (channel: string): 'success' | 'primary' | 'neutral' => {
    switch (channel) {
      case 'whatsapp':
        return 'success'
      case 'email':
        return 'primary'
      default:
        return 'neutral'
    }
  }

  const getStatusColor = (status: string): 'success' | 'primary' | 'danger' | 'warning' | 'neutral' => {
    switch (status) {
      case 'delivered':
      case 'sent':
        return 'success'
      case 'failed':
        return 'danger'
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
      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <CircularProgress />
        </Box>
      </Container>
    )
  }

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography level="h2" sx={{ mb: 0.5 }}>
            Sistema de Recordatorios
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Gestiona recordatorios multicanal para citas
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startDecorator={<RefreshIcon />} onClick={fetchData}>
            Actualizar
          </Button>
          <Button startDecorator={<AddIcon />} onClick={() => handleOpenTemplateModal()}>
            Nueva Plantilla
          </Button>
        </Box>
      </Box>

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={3}>
          <Card variant="soft" color="primary">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <SendIcon sx={{ fontSize: 32 }} />
                <Box>
                  <Typography level="body-sm">Total Enviados</Typography>
                  <Typography level="h4">{stats?.totalSent || 0}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card variant="soft" color="success">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <CheckCircleIcon sx={{ fontSize: 32 }} />
                <Box>
                  <Typography level="body-sm">Tasa de Entrega</Typography>
                  <Typography level="h4">{(stats?.deliveryRate || 0).toFixed(1)}%</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card variant="soft" color="warning">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <NotificationsIcon sx={{ fontSize: 32 }} />
                <Box>
                  <Typography level="body-sm">Plantillas Activas</Typography>
                  <Typography level="h4">{activeTemplates}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card variant="soft" color="danger">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <ErrorIcon sx={{ fontSize: 32 }} />
                <Box>
                  <Typography level="body-sm">Fallidos</Typography>
                  <Typography level="h4">{stats?.failed || 0}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs - Solo Plantillas e Historial */}
      <Card>
        <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value as number)}>
          <TabList>
            <Tab>Plantillas</Tab>
            <Tab>Historial de Envíos</Tab>
          </TabList>

          {/* Templates Tab */}
          <TabPanel value={0}>
            {templates.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <NotificationsIcon sx={{ fontSize: 64, opacity: 0.3, mb: 2 }} />
                <Typography level="h4" sx={{ mb: 1 }}>
                  No hay plantillas
                </Typography>
                <Typography level="body-md" sx={{ mb: 3, color: 'text.tertiary' }}>
                  Crea tu primera plantilla de recordatorio
                </Typography>
                <Button startDecorator={<AddIcon />} onClick={() => handleOpenTemplateModal()}>
                  Nueva Plantilla
                </Button>
              </Box>
            ) : (
              <Grid container spacing={2}>
                {templates.map((template) => (
                  <Grid key={template.id} xs={12} md={6}>
                    <Card variant="outlined">
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Avatar sx={{ bgcolor: `var(--joy-palette-${getChannelColor(template.channel)}-500)` }}>
                              {getChannelIcon(template.channel)}
                            </Avatar>
                            <Box>
                              <Typography level="title-md">{template.name}</Typography>
                              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                {template.timing}h antes • {template.sentCount} enviados
                              </Typography>
                            </Box>
                          </Box>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <Switch size="sm" checked={template.isActive} onChange={() => handleToggleTemplate(template.id)} />
                            <IconButton size="sm" variant="plain" onClick={() => handleOpenTemplateModal(template)}>
                              <EditIcon />
                            </IconButton>
                            <IconButton size="sm" variant="plain" color="danger" onClick={() => handleDeleteTemplate(template.id)}>
                              <DeleteIcon />
                            </IconButton>
                          </Box>
                        </Box>

                        <Box sx={{ mb: 2, p: 2, bgcolor: 'background.level1', borderRadius: 'sm' }}>
                          {template.subject && (
                            <Typography level="body-sm" fontWeight="md" sx={{ mb: 1 }}>
                              Asunto: {template.subject}
                            </Typography>
                          )}
                          <Typography level="body-xs" fontWeight="md" sx={{ color: 'primary.500', mb: 0.5 }}>
                            📩 Mensaje de Confirmación:
                          </Typography>
                          <Typography level="body-sm" sx={{ whiteSpace: 'pre-wrap', mb: 1 }}>
                            {template.messageConfirm?.substring(0, 80)}
                            {template.messageConfirm?.length > 80 && '...'}
                          </Typography>
                          <Typography level="body-xs" fontWeight="md" sx={{ color: 'success.500', mb: 0.5 }}>
                            ✅ Mensaje de Recordatorio:
                          </Typography>
                          <Typography level="body-sm" sx={{ whiteSpace: 'pre-wrap' }}>
                            {template.messageReminder?.substring(0, 80)}
                            {template.messageReminder?.length > 80 && '...'}
                          </Typography>
                        </Box>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Box>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                              Tasa de entrega
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                              <LinearProgress
                                determinate
                                value={template.deliveryRate}
                                size="sm"
                                color={template.deliveryRate > 90 ? 'success' : 'warning'}
                                sx={{ width: 100 }}
                              />
                              <Typography level="body-sm" fontWeight="md">
                                {template.deliveryRate}%
                              </Typography>
                            </Box>
                          </Box>
                          <Chip size="sm" color={getChannelColor(template.channel)} variant="soft">
                            {template.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}
                          </Chip>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </TabPanel>

          {/* History Tab */}
          <TabPanel value={1}>
            <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography level="body-md">
                Total de envíos: {historyTotal}
              </Typography>
              <Button size="sm" variant="outlined" startDecorator={<RefreshIcon />} onClick={fetchHistory}>
                Actualizar
              </Button>
            </Box>

            {logs.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <ScheduleIcon sx={{ fontSize: 64, opacity: 0.3, mb: 2 }} />
                <Typography level="h4" sx={{ mb: 1 }}>
                  Sin historial
                </Typography>
                <Typography level="body-md" sx={{ color: 'text.tertiary' }}>
                  No hay recordatorios enviados aún
                </Typography>
              </Box>
            ) : (
              <Sheet sx={{ overflow: 'auto' }}>
                <Table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Canal</th>
                      <th>Estado</th>
                      <th>Enviado</th>
                      <th>Entregado</th>
                      <th>Cita</th>
                      <th>Servicio</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td>
                          <Box>
                            <Typography level="body-sm" fontWeight="md">{log.clientName}</Typography>
                            {log.clientEmail && (
                              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>{log.clientEmail}</Typography>
                            )}
                          </Box>
                        </td>
                        <td>
                          <Chip size="sm" color={getChannelColor(log.channel)} variant="soft" startDecorator={getChannelIcon(log.channel)}>
                            {log.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}
                          </Chip>
                        </td>
                        <td>
                          <Chip size="sm" color={getStatusColor(log.status)}>
                            {getStatusLabel(log.status)}
                          </Chip>
                        </td>
                        <td>
                          <Typography level="body-sm">
                            {log.sentAt ? new Date(log.sentAt).toLocaleString('es-ES', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            }) : '-'}
                          </Typography>
                        </td>
                        <td>
                          {log.deliveredAt ? (
                            <Typography level="body-sm">
                              {new Date(log.deliveredAt).toLocaleString('es-ES', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </Typography>
                          ) : (
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                              -
                            </Typography>
                          )}
                        </td>
                        <td>
                          <Typography level="body-sm">
                            {log.appointmentDate ? new Date(log.appointmentDate).toLocaleDateString('es-ES', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            }) : '-'}
                          </Typography>
                        </td>
                        <td>
                          <Typography level="body-sm">
                            {log.serviceName || '-'}
                          </Typography>
                        </td>
                        <td>
                          {log.errorMessage ? (
                            <Chip size="sm" color="danger" variant="soft" startDecorator={<ErrorIcon />}>
                              {log.errorMessage.length > 30 ? log.errorMessage.substring(0, 30) + '...' : log.errorMessage}
                            </Chip>
                          ) : (
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                              -
                            </Typography>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Sheet>
            )}

            {/* Pagination */}
            {historyTotal > 50 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 2 }}>
                <Button
                  size="sm"
                  variant="outlined"
                  disabled={historyPage === 1}
                  onClick={() => setHistoryPage(p => p - 1)}
                >
                  Anterior
                </Button>
                <Typography level="body-sm" sx={{ alignSelf: 'center' }}>
                  Página {historyPage} de {Math.ceil(historyTotal / 50)}
                </Typography>
                <Button
                  size="sm"
                  variant="outlined"
                  disabled={historyPage >= Math.ceil(historyTotal / 50)}
                  onClick={() => setHistoryPage(p => p + 1)}
                >
                  Siguiente
                </Button>
              </Box>
            )}
          </TabPanel>
        </Tabs>
      </Card>

      {/* Template Modal */}
      <Modal open={openTemplateModal} onClose={() => setOpenTemplateModal(false)}>
        <ModalDialog sx={{ minWidth: 600, maxWidth: 700 }}>
          <ModalClose />
          <Typography level="h4" sx={{ mb: 2 }}>
            {editingTemplate ? 'Editar Plantilla' : 'Nueva Plantilla'}
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl required>
              <FormLabel>Nombre de la Plantilla</FormLabel>
              <Input
                value={templateForm.name}
                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                placeholder="Ej: Recordatorio 24h - WhatsApp"
              />
            </FormControl>

            <Grid container spacing={2}>
              <Grid xs={6}>
                <FormControl required>
                  <FormLabel>Canal</FormLabel>
                  <Select
                    value={templateForm.channel}
                    onChange={(_, value) => setTemplateForm({ ...templateForm, channel: value as ReminderTemplate['channel'] })}
                  >
                    <Option value="whatsapp">WhatsApp</Option>
                    <Option value="email">Email</Option>
                  </Select>
                </FormControl>
              </Grid>
              <Grid xs={6}>
                <FormControl required>
                  <FormLabel>Tiempo antes (horas)</FormLabel>
                  <Input
                    type="number"
                    value={templateForm.timing}
                    onChange={(e) => setTemplateForm({ ...templateForm, timing: parseInt(e.target.value) })}
                    slotProps={{ input: { min: 1, step: 1 } }}
                  />
                </FormControl>
              </Grid>
            </Grid>

            {templateForm.channel === 'email' && (
              <FormControl required>
                <FormLabel>Asunto</FormLabel>
                <Input
                  value={templateForm.subject || ''}
                  onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })}
                  placeholder="Asunto del email"
                />
              </FormControl>
            )}

            <FormControl required>
              <FormLabel>📩 Mensaje de Confirmación</FormLabel>
              <Textarea
                value={templateForm.messageConfirm}
                onChange={(e) => setTemplateForm({ ...templateForm, messageConfirm: e.target.value })}
                placeholder="Mensaje para pedir confirmación... Ej: Hola {{clientName}}, ¿confirmas tu cita para el {{date}} a las {{time}}? Responde SÍ para confirmar."
                minRows={4}
              />
              <Typography level="body-xs" sx={{ mt: 1, color: 'text.tertiary' }}>
                Este mensaje se envía para solicitar confirmación de la cita.
              </Typography>
            </FormControl>

            <FormControl required>
              <FormLabel>✅ Mensaje de Recordatorio</FormLabel>
              <Textarea
                value={templateForm.messageReminder}
                onChange={(e) => setTemplateForm({ ...templateForm, messageReminder: e.target.value })}
                placeholder="Mensaje de recordatorio cuando ya confirmó... Ej: Hola {{clientName}}, te recordamos tu cita confirmada para hoy {{date}} a las {{time}} con {{agent}}."
                minRows={4}
              />
              <Typography level="body-xs" sx={{ mt: 1, color: 'text.tertiary' }}>
                Este mensaje se envía como recordatorio cuando el cliente ya confirmó.
              </Typography>
            </FormControl>

            <Typography level="body-xs" sx={{ p: 1.5, bgcolor: 'background.level2', borderRadius: 'sm', color: 'text.tertiary' }}>
              <strong>Variables disponibles:</strong> {'{{'}clientName{'}}'}, {'{{'}date{'}}'}, {'{{'}time{'}}'}, {'{{'}agent{'}}'}, {'{{'}service{'}}'}
            </Typography>

            <FormControl>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Switch checked={templateForm.isActive} onChange={(e) => setTemplateForm({ ...templateForm, isActive: e.target.checked })} />
                <Typography level="body-sm">Plantilla activa</Typography>
              </Box>
            </FormControl>

            <Divider />

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
              <Button variant="plain" color="neutral" onClick={() => setOpenTemplateModal(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveTemplate} disabled={!templateForm.name || !templateForm.messageConfirm || !templateForm.messageReminder} loading={savingTemplate}>
                {editingTemplate ? 'Guardar Cambios' : 'Crear Plantilla'}
              </Button>
            </Box>
          </Box>
        </ModalDialog>
      </Modal>
    </Container>
  )
}
