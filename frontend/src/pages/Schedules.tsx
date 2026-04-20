import { useEffect, useMemo, useState } from 'react'
import {
  Typography,
  Stack,
  Container,
  Card,
  CardContent,
  Box,
  Grid,
  Button,
  Table,
  Sheet,
  Chip,
  IconButton,
  Input,
  Modal,
  ModalDialog,
  ModalClose,
  FormControl,
  FormLabel,
  Textarea,
  Select,
  Option,
  Autocomplete,
  CircularProgress,
  Switch,
} from '@mui/joy'
import {
  CalendarToday as CalendarIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckIcon,
  Schedule as ScheduleIcon,
  Cancel as CancelIcon,
  ErrorOutline as ErrorIcon,
  AttachFile as AttachFileIcon,
  UploadFile as UploadFileIcon,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import getApiErrorMessage from '../utils/getApiErrorMessage'

interface Contact {
  id: number
  name: string
  number: string
}

interface UserOption {
  id: number
  name: string
}

interface QueueOption {
  id: number
  name: string
  color?: string
}

interface WhatsappOption {
  id: number
  name: string
  channel?: string
}

interface Schedule {
  id: number
  body: string
  sendAt: string
  sentAt?: string | null
  contactId: number
  ticketId?: number
  userId: number
  companyId: number
  status: string
  mediaPath?: string | null
  mediaName?: string | null
  createdAt: string
  updatedAt?: string
  ticketUserId?: number | null
  queueId?: number | null
  statusTicket?: string
  openTicket?: string
  whatsappId?: number | null
  intervalo?: number | null
  valorIntervalo?: number | null
  enviarQuantasVezes?: number | null
  tipoDias?: number | null
  contadorEnvio?: number | null
  assinar?: boolean
  contact?: Contact
  user?: UserOption
  ticketUser?: UserOption
  queue?: QueueOption
  whatsapp?: WhatsappOption
}

interface ScheduleFormData {
  body: string
  sendAt: string
  contactId: number
  whatsappId: number | null
  openTicket: string
  statusTicket: string
  ticketUserId: number | null
  queueId: number | null
  intervalo: number
  valorIntervalo: number
  enviarQuantasVezes: number
  tipoDias: number
  contadorEnvio: number
  assinar: boolean
}

const intervalOptions = [
  { value: 1, label: 'Días' },
  { value: 2, label: 'Semanas' },
  { value: 3, label: 'Meses' },
  { value: 4, label: 'Minutos' },
]

const businessDayOptions = [
  { value: 4, label: 'Enviar normalmente en días no laborables' },
  { value: 5, label: 'Enviar un día laborable antes' },
  { value: 6, label: 'Enviar un día laborable después' },
]

const getDefaultFormData = (): ScheduleFormData => ({
  body: '',
  sendAt: '',
  contactId: 0,
  whatsappId: null,
  openTicket: 'disabled',
  statusTicket: 'closed',
  ticketUserId: null,
  queueId: null,
  intervalo: 1,
  valorIntervalo: 0,
  enviarQuantasVezes: 1,
  tipoDias: 4,
  contadorEnvio: 0,
  assinar: false,
})

const toDateTimeLocal = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day}T${hours}:${minutes}`
}

const normalizeScheduleStatus = (status?: string) => {
  const normalized = (status || '').toLowerCase()

  if (normalized === 'sent' || normalized === 'enviada') return 'sent'
  if (normalized === 'erro' || normalized === 'error' || normalized === 'failed') return 'error'
  if (normalized === 'cancelled' || normalized === 'cancelado') return 'cancelled'
  return 'pending'
}

const getStatusColor = (status?: string) => {
  switch (normalizeScheduleStatus(status)) {
    case 'sent':
      return 'success'
    case 'error':
      return 'danger'
    case 'cancelled':
      return 'neutral'
    default:
      return 'warning'
  }
}

const getStatusLabel = (status?: string) => {
  switch (normalizeScheduleStatus(status)) {
    case 'sent':
      return 'Enviado'
    case 'error':
      return 'Error'
    case 'cancelled':
      return 'Cancelado'
    default:
      return 'Pendiente'
  }
}

const getStatusIcon = (status?: string) => {
  switch (normalizeScheduleStatus(status)) {
    case 'sent':
      return <CheckIcon />
    case 'error':
      return <ErrorIcon />
    case 'cancelled':
      return <CancelIcon />
    default:
      return <ScheduleIcon />
  }
}

const getRecurrenceSummary = (schedule: Pick<Schedule, 'intervalo' | 'valorIntervalo' | 'enviarQuantasVezes' | 'tipoDias'>) => {
  const intervalo = schedule.intervalo ?? 1
  const valorIntervalo = schedule.valorIntervalo ?? 0
  const enviarQuantasVezes = schedule.enviarQuantasVezes ?? 1
  const tipoDias = schedule.tipoDias ?? 4

  if (valorIntervalo <= 0 || enviarQuantasVezes <= 1) {
    return 'Envío único'
  }

  const intervalLabel = intervalOptions.find(item => item.value === intervalo)?.label.toLowerCase() || 'días'
  const dayModeLabel = businessDayOptions.find(item => item.value === tipoDias)?.label

  return `Cada ${valorIntervalo} ${intervalLabel} · ${enviarQuantasVezes} veces · ${dayModeLabel}`
}

export default function Schedules() {
  const { user } = useAuth()

  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [openModal, setOpenModal] = useState(false)
  const [modalLoading, setModalLoading] = useState(false)
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null)
  const [formData, setFormData] = useState<ScheduleFormData>(getDefaultFormData())

  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [contactSearch, setContactSearch] = useState('')
  const [loadingContacts, setLoadingContacts] = useState(false)

  const [users, setUsers] = useState<UserOption[]>([])
  const [queues, setQueues] = useState<QueueOption[]>([])
  const [whatsapps, setWhatsapps] = useState<WhatsappOption[]>([])

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [existingMedia, setExistingMedia] = useState<{ name: string; path: string } | null>(null)
  const [removeExistingMedia, setRemoveExistingMedia] = useState(false)

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    if (contactSearch.length >= 2) {
      searchContacts(contactSearch)
    } else if (!selectedContact) {
      setContacts([])
    }
  }, [contactSearch, selectedContact])

  const loadInitialData = async () => {
    setLoading(true)
    try {
      await Promise.all([fetchSchedules(), fetchFormOptions()])
    } finally {
      setLoading(false)
    }
  }

  const fetchSchedules = async () => {
    try {
      const response = await api.get('/schedules')
      setSchedules(response.data.schedules || response.data || [])
    } catch (error) {
      console.error('Error fetching schedules:', error)
      setSchedules([])
      toast.error('No se pudieron cargar las agendas')
    }
  }

  const fetchFormOptions = async () => {
    try {
      const [usersRes, queuesRes, whatsappsRes] = await Promise.all([
        api.get('/users'),
        api.get('/queues'),
        api.get('/whatsapps'),
      ])

      setUsers(usersRes.data.users || usersRes.data || [])
      setQueues(queuesRes.data.queues || queuesRes.data || [])
      setWhatsapps(whatsappsRes.data.whatsapps || whatsappsRes.data || [])
    } catch (error) {
      console.error('Error fetching schedule form options:', error)
      toast.error('No se pudieron cargar usuarios, colas o conexiones')
    }
  }

  const searchContacts = async (query: string) => {
    try {
      setLoadingContacts(true)
      const response = await api.get('/contacts', {
        params: { searchParam: query, pageNumber: 1 },
      })
      setContacts(response.data.contacts || response.data || [])
    } catch (error) {
      console.error('Error searching contacts:', error)
    } finally {
      setLoadingContacts(false)
    }
  }

  const syncScheduleMedia = async (scheduleId: number) => {
    if (removeExistingMedia && existingMedia?.path) {
      await api.delete(`/schedules/${scheduleId}/media-upload`)
    }

    if (selectedFile) {
      const uploadData = new FormData()
      uploadData.append('file', selectedFile)
      await api.post(`/schedules/${scheduleId}/media-upload`, uploadData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
    }
  }

  const buildPayload = () => ({
    body: formData.body.trim(),
    sendAt: formData.sendAt,
    contactId: formData.contactId,
    userId: user?.id,
    whatsappId: formData.whatsappId || undefined,
    openTicket: formData.openTicket,
    statusTicket: formData.statusTicket,
    ticketUserId: formData.openTicket === 'enabled' ? formData.ticketUserId || undefined : undefined,
    queueId: formData.openTicket === 'enabled' ? formData.queueId || undefined : undefined,
    intervalo: formData.intervalo,
    valorIntervalo: Math.max(0, formData.valorIntervalo),
    enviarQuantasVezes: Math.max(1, formData.enviarQuantasVezes),
    tipoDias: formData.tipoDias,
    contadorEnvio: formData.contadorEnvio,
    assinar: formData.assinar,
  })

  const validateForm = () => {
    if (!formData.body.trim()) {
      toast.error('Escribe el mensaje a programar')
      return false
    }

    if (!formData.sendAt) {
      toast.error('Selecciona la fecha y hora de envío')
      return false
    }

    if (!formData.contactId) {
      toast.error('Selecciona un contacto')
      return false
    }

    if (!formData.whatsappId) {
      toast.error('Selecciona una conexión')
      return false
    }

    if (formData.valorIntervalo > 0 && formData.enviarQuantasVezes < 2) {
      toast.error('Si configuras recurrencia, la cantidad de envíos debe ser al menos 2')
      return false
    }

    return true
  }

  const handleCreate = async () => {
    if (!validateForm()) return

    try {
      setModalLoading(true)
      const { data } = await api.post('/schedules', buildPayload())
      await syncScheduleMedia(data.id)
      toast.success('Mensaje programado correctamente')
      await fetchSchedules()
      setOpenModal(false)
      resetForm()
    } catch (error) {
      console.error('Error creating schedule:', error)
      toast.error(getApiErrorMessage(error, 'Error al crear el mensaje programado'))
    } finally {
      setModalLoading(false)
    }
  }

  const handleUpdate = async () => {
    if (!selectedSchedule || !validateForm()) return

    try {
      setModalLoading(true)
      await api.put(`/schedules/${selectedSchedule.id}`, buildPayload())
      await syncScheduleMedia(selectedSchedule.id)
      toast.success('Mensaje programado actualizado')
      await fetchSchedules()
      setOpenModal(false)
      resetForm()
    } catch (error) {
      console.error('Error updating schedule:', error)
      toast.error(getApiErrorMessage(error, 'Error al actualizar el mensaje programado'))
    } finally {
      setModalLoading(false)
    }
  }

  const handleDelete = async (scheduleId: number) => {
    if (!window.confirm('¿Estás seguro de eliminar este mensaje programado?')) return

    try {
      await api.delete(`/schedules/${scheduleId}`)
      toast.success('Mensaje programado eliminado')
      fetchSchedules()
    } catch (error) {
      console.error('Error deleting schedule:', error)
      toast.error('Error al eliminar el mensaje programado')
    }
  }

  const openEditModal = async (schedule: Schedule) => {
    try {
      setModalLoading(true)
      const response = await api.get(`/schedules/${schedule.id}`)
      const fullSchedule: Schedule = response.data

      setSelectedSchedule(fullSchedule)
      setFormData({
        body: fullSchedule.body || '',
        sendAt: toDateTimeLocal(fullSchedule.sendAt),
        contactId: fullSchedule.contactId || 0,
        whatsappId: fullSchedule.whatsappId || null,
        openTicket: fullSchedule.openTicket || 'disabled',
        statusTicket: fullSchedule.statusTicket || 'closed',
        ticketUserId: fullSchedule.ticketUserId || null,
        queueId: fullSchedule.queueId || null,
        intervalo: fullSchedule.intervalo || 1,
        valorIntervalo: fullSchedule.valorIntervalo || 0,
        enviarQuantasVezes: fullSchedule.enviarQuantasVezes || 1,
        tipoDias: fullSchedule.tipoDias || 4,
        contadorEnvio: fullSchedule.contadorEnvio || 0,
        assinar: Boolean(fullSchedule.assinar),
      })

      if (fullSchedule.contact) {
        setSelectedContact(fullSchedule.contact)
        setContactSearch(fullSchedule.contact.name)
        setContacts(prev => {
          const withoutDuplicated = prev.filter(item => item.id !== fullSchedule.contact?.id)
          return fullSchedule.contact ? [fullSchedule.contact, ...withoutDuplicated] : withoutDuplicated
        })
      } else if (fullSchedule.contactId) {
        const contactResponse = await api.get(`/contacts/${fullSchedule.contactId}`)
        const contact = contactResponse.data
        setSelectedContact({ id: contact.id, name: contact.name, number: contact.number })
        setContactSearch(contact.name)
      } else {
        setSelectedContact(null)
        setContactSearch('')
      }

      setExistingMedia(
        fullSchedule.mediaPath && fullSchedule.mediaName
          ? { path: fullSchedule.mediaPath, name: fullSchedule.mediaName }
          : null
      )
      setSelectedFile(null)
      setRemoveExistingMedia(false)
      setOpenModal(true)
    } catch (error) {
      console.error('Error loading schedule details:', error)
      toast.error('No se pudo abrir la agenda para edición')
    } finally {
      setModalLoading(false)
    }
  }

  const openCreateModal = () => {
    setSelectedSchedule(null)
    resetForm()
    setOpenModal(true)
  }

  const resetForm = () => {
    setFormData(getDefaultFormData())
    setSelectedContact(null)
    setContactSearch('')
    setContacts([])
    setSelectedFile(null)
    setExistingMedia(null)
    setRemoveExistingMedia(false)
    setModalLoading(false)
  }

  const filteredSchedules = useMemo(() => {
    return schedules.filter((schedule) => {
      const normalizedStatus = normalizeScheduleStatus(schedule.status)
      const matchesSearch =
        schedule.body.toLowerCase().includes(searchTerm.toLowerCase()) ||
        schedule.contact?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        schedule.whatsapp?.name?.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesStatus = statusFilter === 'all' || normalizedStatus === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [schedules, searchTerm, statusFilter])

  const stats = useMemo(() => {
    return {
      total: schedules.length,
      pending: schedules.filter((item) => normalizeScheduleStatus(item.status) === 'pending').length,
      sent: schedules.filter((item) => normalizeScheduleStatus(item.status) === 'sent').length,
      errors: schedules.filter((item) => normalizeScheduleStatus(item.status) === 'error').length,
      today: schedules.filter(
        (item) =>
          new Date(item.sendAt).toDateString() === new Date().toDateString() &&
          normalizeScheduleStatus(item.status) === 'pending'
      ).length,
    }
  }, [schedules])

  const selectedWhatsapp = whatsapps.find(item => item.id === formData.whatsappId)
  const selectedQueue = queues.find(item => item.id === formData.queueId)
  const selectedTicketUser = users.find(item => item.id === formData.ticketUserId)

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <CalendarIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Agendas</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Mensajes programados para envío automático
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <IconButton variant="outlined" color="neutral" onClick={loadInitialData}>
              <RefreshIcon />
            </IconButton>
            <Button startDecorator={<AddIcon />} color="primary" onClick={openCreateModal}>
              Nuevo Mensaje
            </Button>
          </Stack>
        </Stack>

        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={4} lg={2}>
            <Card><CardContent><Typography level="body-sm">Total Programados</Typography><Typography level="h2">{stats.total}</Typography></CardContent></Card>
          </Grid>
          <Grid xs={12} sm={6} md={4} lg={2}>
            <Card><CardContent><Typography level="body-sm">Pendientes</Typography><Typography level="h2" sx={{ color: 'warning.main' }}>{stats.pending}</Typography></CardContent></Card>
          </Grid>
          <Grid xs={12} sm={6} md={4} lg={2}>
            <Card><CardContent><Typography level="body-sm">Enviados</Typography><Typography level="h2" sx={{ color: 'success.main' }}>{stats.sent}</Typography></CardContent></Card>
          </Grid>
          <Grid xs={12} sm={6} md={6} lg={3}>
            <Card><CardContent><Typography level="body-sm">Con Error</Typography><Typography level="h2" sx={{ color: 'danger.main' }}>{stats.errors}</Typography></CardContent></Card>
          </Grid>
          <Grid xs={12} sm={6} md={6} lg={3}>
            <Card><CardContent><Typography level="body-sm">Hoy</Typography><Typography level="h2">{stats.today}</Typography></CardContent></Card>
          </Grid>
        </Grid>

        <Card>
          <CardContent>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Input
                placeholder="Buscar mensajes, contactos o conexiones..."
                startDecorator={<SearchIcon />}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                sx={{ flexGrow: 1 }}
              />
              <Select value={statusFilter} onChange={(_, value) => setStatusFilter((value as string) || 'all')} sx={{ minWidth: 180 }}>
                <Option value="all">Todos los estados</Option>
                <Option value="pending">Pendientes</Option>
                <Option value="sent">Enviados</Option>
                <Option value="error">Con error</Option>
              </Select>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <Sheet sx={{ overflow: 'auto' }}>
            <Table stickyHeader>
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Estado</th>
                  <th>Mensaje</th>
                  <th style={{ width: 180 }}>Contacto</th>
                  <th style={{ width: 160 }}>Conexión</th>
                  <th style={{ width: 240 }}>Recurrencia</th>
                  <th style={{ width: 120 }}>Progreso</th>
                  <th style={{ width: 180 }}>Envío Programado</th>
                  <th style={{ width: 150 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>Cargando mensajes programados...</Typography>
                    </td>
                  </tr>
                ) : filteredSchedules.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>No se encontraron mensajes programados</Typography>
                    </td>
                  </tr>
                ) : (
                  filteredSchedules.map((schedule) => {
                    const normalizedStatus = normalizeScheduleStatus(schedule.status)
                    const isLocked = normalizedStatus === 'sent'

                    return (
                      <tr key={schedule.id}>
                        <td>
                          <Chip size="sm" color={getStatusColor(schedule.status)} startDecorator={getStatusIcon(schedule.status)}>
                            {getStatusLabel(schedule.status)}
                          </Chip>
                        </td>
                        <td>
                          <Stack spacing={0.5}>
                            <Typography level="body-sm" noWrap sx={{ maxWidth: 320 }}>
                              {schedule.body}
                            </Typography>
                            {schedule.mediaName && (
                              <Chip size="sm" variant="soft" startDecorator={<AttachFileIcon />}>
                                {schedule.mediaName}
                              </Chip>
                            )}
                          </Stack>
                        </td>
                        <td>
                          <Typography level="body-sm">
                            {schedule.contact?.name || `#${schedule.contactId}`}
                          </Typography>
                        </td>
                        <td>
                          <Typography level="body-sm">
                            {schedule.whatsapp?.name || (schedule.whatsappId ? `#${schedule.whatsappId}` : '-')}
                          </Typography>
                        </td>
                        <td>
                          <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                            {getRecurrenceSummary(schedule)}
                          </Typography>
                        </td>
                        <td>
                          <Chip size="sm" variant="soft">
                            {(schedule.contadorEnvio || 0)}/{schedule.enviarQuantasVezes || 1}
                          </Chip>
                        </td>
                        <td>
                          <Stack spacing={0.25}>
                            <Typography level="body-sm">
                              {new Date(schedule.sendAt).toLocaleString('es-ES', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })}
                            </Typography>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                              {schedule.sentAt
                                ? `Último envío: ${new Date(schedule.sentAt).toLocaleString('es-ES', {
                                    dateStyle: 'short',
                                    timeStyle: 'short',
                                  })}`
                                : 'Aún no enviado'}
                            </Typography>
                          </Stack>
                        </td>
                        <td>
                          <Stack direction="row" spacing={0.5}>
                            <IconButton size="sm" variant="plain" color="primary" onClick={() => openEditModal(schedule)} disabled={isLocked}>
                              <EditIcon />
                            </IconButton>
                            <IconButton size="sm" variant="plain" color="danger" onClick={() => handleDelete(schedule.id)} disabled={isLocked}>
                              <DeleteIcon />
                            </IconButton>
                          </Stack>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </Table>
          </Sheet>
        </Card>

        <Modal open={openModal} onClose={() => setOpenModal(false)}>
          <ModalDialog sx={{ width: 'min(920px, calc(100vw - 32px))', maxHeight: '90vh', overflowY: 'auto' }}>
            <ModalClose />
            <Typography level="h4" sx={{ mb: 2 }}>
              {selectedSchedule ? 'Editar Mensaje Programado' : 'Nuevo Mensaje Programado'}
            </Typography>

            <Stack spacing={2}>
              <FormControl>
                <FormLabel>Mensaje</FormLabel>
                <Textarea
                  value={formData.body}
                  onChange={(e) => setFormData(prev => ({ ...prev, body: e.target.value }))}
                  placeholder="Escribe el mensaje a enviar..."
                  minRows={4}
                  maxRows={8}
                />
              </FormControl>

              <Grid container spacing={2}>
                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Contacto</FormLabel>
                    <Autocomplete
                      placeholder="Buscar por nombre o número..."
                      options={contacts}
                      value={selectedContact}
                      onChange={(_event, value) => {
                        setSelectedContact(value)
                        setFormData(prev => ({ ...prev, contactId: value?.id || 0 }))
                      }}
                      inputValue={contactSearch}
                      onInputChange={(_event, value) => setContactSearch(value)}
                      getOptionLabel={(option) => `${option.name} - ${option.number}`}
                      isOptionEqualToValue={(option, value) => option.id === value.id}
                      loading={loadingContacts}
                      startDecorator={<SearchIcon />}
                      endDecorator={loadingContacts ? <CircularProgress size="sm" /> : null}
                      renderOption={(props, option) => (
                        <Box component="li" {...props} key={option.id}>
                          <Stack>
                            <Typography level="body-sm" fontWeight="bold">
                              {option.name}
                            </Typography>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                              {option.number}
                            </Typography>
                          </Stack>
                        </Box>
                      )}
                      noOptionsText={contactSearch.length < 2 ? 'Escribe al menos 2 caracteres' : 'No se encontraron contactos'}
                    />
                  </FormControl>
                </Grid>
                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Fecha y Hora de Envío</FormLabel>
                    <Input type="datetime-local" value={formData.sendAt} onChange={(e) => setFormData(prev => ({ ...prev, sendAt: e.target.value }))} />
                  </FormControl>
                </Grid>
              </Grid>

              <Grid container spacing={2}>
                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Conexión</FormLabel>
                    <Select value={formData.whatsappId ?? 0} onChange={(_, value) => setFormData(prev => ({ ...prev, whatsappId: Number(value) > 0 ? Number(value) : null }))}>
                      <Option value={0}>Sin seleccionar</Option>
                      {whatsapps.map((item) => (
                        <Option key={item.id} value={item.id}>
                          {item.name}
                        </Option>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Abrir ticket</FormLabel>
                    <Select
                      value={formData.openTicket}
                      onChange={(_, value) => setFormData(prev => ({ ...prev, openTicket: (value as string) || 'disabled' }))}
                    >
                      <Option value="enabled">Activado</Option>
                      <Option value="disabled">Desactivado</Option>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              <Grid container spacing={2}>
                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Usuario asignado al ticket</FormLabel>
                    <Select
                      value={formData.ticketUserId ?? 0}
                      disabled={formData.openTicket !== 'enabled'}
                      onChange={(_, value) => setFormData(prev => ({ ...prev, ticketUserId: Number(value) > 0 ? Number(value) : null }))}
                    >
                      <Option value={0}>Sin asignar</Option>
                      {users.map((item) => (
                        <Option key={item.id} value={item.id}>
                          {item.name}
                        </Option>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Transferir para departamentos</FormLabel>
                    <Select
                      value={formData.queueId ?? 0}
                      disabled={formData.openTicket !== 'enabled'}
                      onChange={(_, value) => setFormData(prev => ({ ...prev, queueId: Number(value) > 0 ? Number(value) : null }))}
                    >
                      <Option value={0}>Sin departamento</Option>
                      {queues.map((item) => (
                        <Option key={item.id} value={item.id}>
                          {item.name}
                        </Option>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              <Grid container spacing={2}>
                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Status del ticket</FormLabel>
                    <Select
                      value={formData.statusTicket}
                      disabled={formData.openTicket !== 'enabled'}
                      onChange={(_, value) => setFormData(prev => ({ ...prev, statusTicket: (value as string) || 'closed' }))}
                    >
                      <Option value="open">Abierto</Option>
                      <Option value="closed">Cerrado</Option>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Adjunto</FormLabel>
                    <Input
                      type="file"
                      startDecorator={<UploadFileIcon />}
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null
                        setSelectedFile(file)
                        if (file) {
                          setRemoveExistingMedia(false)
                        }
                      }}
                    />
                  </FormControl>
                </Grid>
              </Grid>

              {(existingMedia || selectedFile) && (
                <Box sx={{ p: 1.5, bgcolor: 'background.level1', borderRadius: 'sm' }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
                    <Typography level="body-sm">
                      Archivo actual: {selectedFile?.name || existingMedia?.name}
                    </Typography>
                    {existingMedia && !selectedFile && (
                      <Button size="sm" variant="soft" color="danger" onClick={() => setRemoveExistingMedia(true)}>
                        Quitar archivo actual
                      </Button>
                    )}
                  </Stack>
                  {removeExistingMedia && (
                    <Typography level="body-xs" sx={{ mt: 1, color: 'danger.main' }}>
                      El archivo actual se eliminará al guardar.
                    </Typography>
                  )}
                </Box>
              )}

              <Stack direction="row" spacing={1.5} alignItems="center">
                <Switch checked={formData.assinar} onChange={(e) => setFormData(prev => ({ ...prev, assinar: e.target.checked }))} />
                <Box>
                  <Typography level="body-sm">Enviar firma</Typography>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                    Usa la opción de firma del backend al momento del envío.
                  </Typography>
                </Box>
              </Stack>

              <Box sx={{ p: 2, borderRadius: 'sm', bgcolor: 'background.level1' }}>
                <Typography level="title-sm" sx={{ mb: 0.5 }}>
                  Recurrencia
                </Typography>
                <Typography level="body-sm" sx={{ color: 'text.secondary', mb: 1.5 }}>
                  Si no quieres recurrencia, deja el valor del intervalo en 0 y la cantidad de envíos en 1.
                </Typography>
                <Grid container spacing={2}>
                  <Grid xs={12} md={3}>
                    <FormControl>
                      <FormLabel>Intervalo</FormLabel>
                      <Select value={formData.intervalo} onChange={(_, value) => setFormData(prev => ({ ...prev, intervalo: Number(value) || 1 }))}>
                        {intervalOptions.map((item) => (
                          <Option key={item.value} value={item.value}>
                            {item.label}
                          </Option>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid xs={12} md={3}>
                    <FormControl>
                      <FormLabel>Rango valor</FormLabel>
                      <Input
                        type="number"
                        value={formData.valorIntervalo}
                        onChange={(e) => setFormData(prev => ({ ...prev, valorIntervalo: Math.max(0, Number(e.target.value) || 0) }))}
                      />
                    </FormControl>
                  </Grid>
                  <Grid xs={12} md={3}>
                    <FormControl>
                      <FormLabel>Enviar cuántas veces</FormLabel>
                      <Input
                        type="number"
                        value={formData.enviarQuantasVezes}
                        onChange={(e) => setFormData(prev => ({ ...prev, enviarQuantasVezes: Math.max(1, Number(e.target.value) || 1) }))}
                      />
                    </FormControl>
                  </Grid>
                  <Grid xs={12} md={3}>
                    <FormControl>
                      <FormLabel>Contador actual</FormLabel>
                      <Input type="number" value={formData.contadorEnvio} disabled />
                    </FormControl>
                  </Grid>
                  <Grid xs={12}>
                    <FormControl>
                      <FormLabel>Comportamiento en días no laborables</FormLabel>
                      <Select value={formData.tipoDias} onChange={(_, value) => setFormData(prev => ({ ...prev, tipoDias: Number(value) || 4 }))}>
                        {businessDayOptions.map((item) => (
                          <Option key={item.value} value={item.value}>
                            {item.label}
                          </Option>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
              </Box>

              <Box sx={{ p: 2, bgcolor: 'background.level1', borderRadius: 'sm' }}>
                <Typography level="body-sm" sx={{ flex: 1 }}>
                  <strong>Vista previa:</strong>
                  <br />
                  {selectedContact ? `Contacto: ${selectedContact.name} (${selectedContact.number})` : 'Contacto: no seleccionado'}
                  <br />
                  {selectedWhatsapp ? `Conexión: ${selectedWhatsapp.name}` : 'Conexión: no seleccionada'}
                  <br />
                  Ticket: {formData.openTicket === 'enabled' ? `se abrirá en estado ${formData.statusTicket === 'open' ? 'abierto' : 'cerrado'}` : 'no se abrirá automáticamente'}
                  <br />
                  Responsable: {selectedTicketUser?.name || 'sin usuario asignado'}
                  {selectedQueue ? ` · Departamento: ${selectedQueue.name}` : ''}
                  <br />
                  Recurrencia: {getRecurrenceSummary(formData)}
                </Typography>
              </Box>

              <Button color="primary" loading={modalLoading} onClick={selectedSchedule ? handleUpdate : handleCreate}>
                {selectedSchedule ? 'Actualizar' : 'Programar'} Mensaje
              </Button>
            </Stack>
          </ModalDialog>
        </Modal>
      </Stack>
    </Container>
  )
}
