import { useState, useEffect } from 'react'
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
} from '@mui/icons-material'
import api from '../services/api'

interface Contact {
  id: number
  name: string
  number: string
}

interface Schedule {
  id: number
  body: string
  sendAt: string
  sentAt?: string
  contactId: number
  ticketId?: number
  userId: number
  companyId: number
  status: string
  mediaPath?: string
  mediaName?: string
  createdAt: string
}

export default function Schedules() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [openModal, setOpenModal] = useState(false)
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null)
  const [formData, setFormData] = useState({
    body: '',
    sendAt: '',
    contactId: 0,
  })

  // Contact search states
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [contactSearch, setContactSearch] = useState('')
  const [loadingContacts, setLoadingContacts] = useState(false)

  useEffect(() => {
    fetchSchedules()
  }, [])

  // Buscar contactos cuando el usuario escribe 2+ caracteres
  useEffect(() => {
    if (contactSearch.length >= 2) {
      searchContacts(contactSearch)
    } else {
      setContacts([])
    }
  }, [contactSearch])

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

  const fetchSchedules = async () => {
    try {
      setLoading(true)
      const response = await api.get('/schedules')
      setSchedules(response.data.schedules || response.data)
    } catch (error) {
      console.error('Error fetching schedules:', error)
      // Fallback data
      setSchedules([
        {
          id: 1,
          body: 'Recordatorio: Reunión con el equipo de ventas a las 10:00 AM',
          sendAt: '2025-01-15T10:00:00',
          status: 'pending',
          contactId: 1,
          userId: 1,
          companyId: 1,
          createdAt: '2025-01-10T00:00:00',
        },
        {
          id: 2,
          body: 'Seguimiento: ¿Recibiste la cotización que te enviamos?',
          sendAt: '2025-01-16T14:30:00',
          status: 'pending',
          contactId: 2,
          userId: 1,
          companyId: 1,
          createdAt: '2025-01-10T00:00:00',
        },
        {
          id: 3,
          body: 'Recordatorio de pago: Tu factura vence mañana',
          sendAt: '2025-01-14T09:00:00',
          sentAt: '2025-01-14T09:00:15',
          status: 'sent',
          contactId: 3,
          userId: 1,
          companyId: 1,
          createdAt: '2025-01-09T00:00:00',
        },
        {
          id: 4,
          body: 'Feliz cumpleaños! Te deseamos un excelente día',
          sendAt: '2025-01-17T08:00:00',
          status: 'pending',
          contactId: 4,
          userId: 1,
          companyId: 1,
          createdAt: '2025-01-10T00:00:00',
        },
        {
          id: 5,
          body: 'Promoción especial: 20% de descuento en todos nuestros productos',
          sendAt: '2025-01-13T12:00:00',
          sentAt: '2025-01-13T12:00:08',
          status: 'sent',
          contactId: 5,
          userId: 1,
          companyId: 1,
          createdAt: '2025-01-08T00:00:00',
        },
        {
          id: 6,
          body: 'Encuesta de satisfacción: ¿Cómo fue tu experiencia con nosotros?',
          sendAt: '2025-01-18T16:00:00',
          status: 'pending',
          contactId: 6,
          userId: 1,
          companyId: 1,
          createdAt: '2025-01-10T00:00:00',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    try {
      await api.post('/schedules', formData)
      fetchSchedules()
      setOpenModal(false)
      resetForm()
    } catch (error) {
      console.error('Error creating schedule:', error)
    }
  }

  const handleUpdate = async () => {
    if (!selectedSchedule) return
    try {
      await api.put(`/schedules/${selectedSchedule.id}`, formData)
      fetchSchedules()
      setOpenModal(false)
      resetForm()
    } catch (error) {
      console.error('Error updating schedule:', error)
    }
  }

  const handleDelete = async (scheduleId: number) => {
    if (confirm('¿Estás seguro de eliminar este mensaje programado?')) {
      try {
        await api.delete(`/schedules/${scheduleId}`)
        fetchSchedules()
      } catch (error) {
        console.error('Error deleting schedule:', error)
      }
    }
  }

  const openEditModal = async (schedule: Schedule) => {
    setSelectedSchedule(schedule)
    setFormData({
      body: schedule.body,
      sendAt: schedule.sendAt,
      contactId: schedule.contactId,
    })
    // Cargar datos del contacto para mostrar nombre en el autocomplete
    if (schedule.contactId) {
      try {
        const response = await api.get(`/contacts/${schedule.contactId}`)
        const contact = response.data
        setSelectedContact({ id: contact.id, name: contact.name, number: contact.number })
        setContactSearch(contact.name)
      } catch {
        setSelectedContact(null)
        setContactSearch('')
      }
    }
    setOpenModal(true)
  }

  const openCreateModal = () => {
    setSelectedSchedule(null)
    resetForm()
    setOpenModal(true)
  }

  const resetForm = () => {
    setFormData({
      body: '',
      sendAt: '',
      contactId: 0,
    })
    setSelectedContact(null)
    setContactSearch('')
    setContacts([])
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent':
        return 'success'
      case 'pending':
        return 'warning'
      case 'cancelled':
        return 'danger'
      default:
        return 'neutral'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'sent':
        return 'Enviado'
      case 'pending':
        return 'Pendiente'
      case 'cancelled':
        return 'Cancelado'
      default:
        return status
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return <CheckIcon />
      case 'pending':
        return <ScheduleIcon />
      case 'cancelled':
        return <CancelIcon />
      default:
        return null
    }
  }

  const filteredSchedules = schedules.filter((schedule) => {
    const matchesSearch = schedule.body.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || schedule.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const stats = {
    total: schedules.length,
    pending: schedules.filter((s) => s.status === 'pending').length,
    sent: schedules.filter((s) => s.status === 'sent').length,
    today: schedules.filter(
      (s) =>
        new Date(s.sendAt).toDateString() === new Date().toDateString() &&
        s.status === 'pending'
    ).length,
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
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
            <IconButton variant="outlined" color="neutral" onClick={fetchSchedules}>
              <RefreshIcon />
            </IconButton>
            <Button startDecorator={<AddIcon />} color="primary" onClick={openCreateModal}>
              Nuevo Mensaje
            </Button>
          </Stack>
        </Stack>

        {/* Stats */}
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Total Programados
                </Typography>
                <Typography level="h2">{stats.total}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Pendientes
                </Typography>
                <Typography level="h2" sx={{ color: 'warning.main' }}>
                  {stats.pending}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Enviados
                </Typography>
                <Typography level="h2" sx={{ color: 'success.main' }}>
                  {stats.sent}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Hoy
                </Typography>
                <Typography level="h2">{stats.today}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Filters */}
        <Card>
          <CardContent>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Input
                placeholder="Buscar mensajes programados..."
                startDecorator={<SearchIcon />}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                sx={{ flexGrow: 1 }}
              />
              <Select
                value={statusFilter}
                onChange={(_, value) => setStatusFilter(value as string)}
                sx={{ minWidth: 180 }}
              >
                <Option value="all">Todos los estados</Option>
                <Option value="pending">Pendientes</Option>
                <Option value="sent">Enviados</Option>
                <Option value="cancelled">Cancelados</Option>
              </Select>
            </Stack>
          </CardContent>
        </Card>

        {/* Schedules Table */}
        <Card>
          <Sheet sx={{ overflow: 'auto' }}>
            <Table stickyHeader>
              <thead>
                <tr>
                  <th style={{ width: 80 }}>Estado</th>
                  <th>Mensaje</th>
                  <th style={{ width: 180 }}>Envío Programado</th>
                  <th style={{ width: 180 }}>Enviado</th>
                  <th style={{ width: 180 }}>Fecha Creación</th>
                  <th style={{ width: 150 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>Cargando mensajes programados...</Typography>
                    </td>
                  </tr>
                ) : filteredSchedules.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>No se encontraron mensajes programados</Typography>
                    </td>
                  </tr>
                ) : (
                  filteredSchedules.map((schedule) => (
                    <tr key={schedule.id}>
                      <td>
                        <Chip
                          size="sm"
                          color={getStatusColor(schedule.status)}
                          startDecorator={getStatusIcon(schedule.status)}
                        >
                          {getStatusLabel(schedule.status)}
                        </Chip>
                      </td>
                      <td>
                        <Typography level="body-sm" noWrap sx={{ maxWidth: 400 }}>
                          {schedule.body}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-sm">
                          {new Date(schedule.sendAt).toLocaleString('es-ES', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          {schedule.sentAt
                            ? new Date(schedule.sentAt).toLocaleString('es-ES', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })
                            : '-'}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-xs">
                          {new Date(schedule.createdAt).toLocaleDateString('es-ES')}
                        </Typography>
                      </td>
                      <td>
                        <Stack direction="row" spacing={0.5}>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="primary"
                            onClick={() => openEditModal(schedule)}
                            disabled={schedule.status === 'sent'}
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="danger"
                            onClick={() => handleDelete(schedule.id)}
                            disabled={schedule.status === 'sent'}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Stack>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </Sheet>
        </Card>

        {/* Modal Create/Edit */}
        <Modal open={openModal} onClose={() => setOpenModal(false)}>
          <ModalDialog sx={{ minWidth: 600 }}>
            <ModalClose />
            <Typography level="h4" sx={{ mb: 2 }}>
              {selectedSchedule ? 'Editar Mensaje Programado' : 'Nuevo Mensaje Programado'}
            </Typography>
            <Stack spacing={2}>
              <FormControl>
                <FormLabel>Mensaje</FormLabel>
                <Textarea
                  value={formData.body}
                  onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                  placeholder="Escribe el mensaje a enviar..."
                  minRows={4}
                  maxRows={8}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Fecha y Hora de Envío</FormLabel>
                <Input
                  type="datetime-local"
                  value={formData.sendAt}
                  onChange={(e) => setFormData({ ...formData, sendAt: e.target.value })}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Contacto</FormLabel>
                <Autocomplete
                  placeholder="Buscar por nombre o número..."
                  options={contacts}
                  value={selectedContact}
                  onChange={(_event, value) => {
                    setSelectedContact(value)
                    setFormData({ ...formData, contactId: value?.id || 0 })
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
                  noOptionsText={
                    contactSearch.length < 2
                      ? 'Escribe al menos 2 caracteres'
                      : 'No se encontraron contactos'
                  }
                />
              </FormControl>
              <Box
                sx={{
                  display: 'flex',
                  gap: 1,
                  alignItems: 'center',
                  p: 2,
                  bgcolor: 'background.level1',
                  borderRadius: 'sm',
                }}
              >
                <Typography level="body-sm" sx={{ flex: 1 }}>
                  <strong>Vista Previa:</strong>
                  <br />
                  {selectedContact
                    ? `Para: ${selectedContact.name} (${selectedContact.number})`
                    : 'Contacto: no seleccionado'}
                  <br />
                  Se enviará el mensaje a las{' '}
                  {formData.sendAt
                    ? new Date(formData.sendAt).toLocaleString('es-ES')
                    : 'fecha no especificada'}
                </Typography>
              </Box>
              <Button color="primary" onClick={selectedSchedule ? handleUpdate : handleCreate}>
                {selectedSchedule ? 'Actualizar' : 'Programar'} Mensaje
              </Button>
            </Stack>
          </ModalDialog>
        </Modal>
      </Stack>
    </Container>
  )
}
