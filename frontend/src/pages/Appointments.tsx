import { useState, useEffect } from 'react'
import api from '../services/api'
import {
  Container,
  Typography,
  Box,
  Stack,
  Card,
  CardContent,
  Grid,
  Button,
  Chip,
  Sheet,
  Table,
  Input,
  Select,
  Option,
  Modal,
  ModalDialog,
  ModalClose,
  FormControl,
  FormLabel,
  Textarea,
  LinearProgress,
  IconButton,
  Tooltip,
  Tabs,
  TabList,
  Tab,
  TabPanel,
} from '@mui/joy'
import {
  CalendarToday as CalendarIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  Event as EventIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  Schedule as ScheduleIcon,
  Person as PersonIcon,
  Phone as PhoneIcon,
  Email as _EmailIcon,
  LocationOn as LocationIcon,
  VideoCall as VideoCallIcon,
  SmartToy as AiIcon,
  Send as SendIcon,
  NotificationsActive as NotificationIcon,
} from '@mui/icons-material'

interface Appointment {
  id: number
  title: string
  client: {
    name: string
    phone: string
    email: string
  }
  date: string
  time: string
  duration: number
  type: 'presencial' | 'virtual' | 'telefonica'
  status: 'confirmed' | 'pending' | 'completed' | 'cancelled'
  service: string
  notes?: string
  assignedTo: string
  location?: string
  meetingLink?: string
  reminders: {
    whatsapp: boolean
    email: boolean
    sms: boolean
  }
  createdAt: string
}

interface Service {
  id: number
  name: string
  duration: number
  price: number
  color: string
}

export default function Appointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(false)
  const [openModal, setOpenModal] = useState(false)
  const [selectedTab, setSelectedTab] = useState(0)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterDate, setFilterDate] = useState('today')

  useEffect(() => {
    fetchAppointments()
    fetchServices()
  }, [])

  const fetchAppointments = async () => {
    setLoading(true)
    try {
      const response = await api.get('/appointments')
      setAppointments(response.data ?? [])
    } catch {
      setAppointments([])
    } finally {
      setLoading(false)
    }
  }

  const fetchServices = async () => {
    try {
      const response = await api.get('/appointments/services')
      setServices(response.data ?? [])
    } catch {
      setServices([])
    }
  }

  const stats = {
    total: appointments.length,
    confirmed: appointments.filter((a) => a.status === 'confirmed').length,
    pending: appointments.filter((a) => a.status === 'pending').length,
    completed: appointments.filter((a) => a.status === 'completed').length,
    cancelled: appointments.filter((a) => a.status === 'cancelled').length,
    today: appointments.filter((a) => a.date === new Date().toISOString().split('T')[0]).length,
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'success'
      case 'pending':
        return 'warning'
      case 'completed':
        return 'primary'
      case 'cancelled':
        return 'danger'
      default:
        return 'neutral'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'Confirmada'
      case 'pending':
        return 'Pendiente'
      case 'completed':
        return 'Completada'
      case 'cancelled':
        return 'Cancelada'
      default:
        return status
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'presencial':
        return <LocationIcon />
      case 'virtual':
        return <VideoCallIcon />
      case 'telefonica':
        return <PhoneIcon />
      default:
        return <EventIcon />
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'presencial':
        return 'Presencial'
      case 'virtual':
        return 'Virtual'
      case 'telefonica':
        return 'Telefónica'
      default:
        return type
    }
  }

  const filteredAppointments = appointments.filter((a) => {
    const statusMatch = filterStatus === 'all' || a.status === filterStatus
    const dateMatch =
      filterDate === 'all' ||
      (filterDate === 'today' && a.date === new Date().toISOString().split('T')[0]) ||
      (filterDate === 'week' &&
        new Date(a.date) >= new Date() &&
        new Date(a.date) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
    return statusMatch && dateMatch
  })

  const deleteAppointment = (id: number) => {
    if (confirm('¿Estás seguro de eliminar esta cita?')) {
      setAppointments(appointments.filter((a) => a.id !== id))
    }
  }

  const sendReminder = (id: number) => {
    alert(`Recordatorio enviado para la cita #${id}`)
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <CalendarIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Gestión de Citas</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Agendamiento multicanal con IA (Google Calendar / Outlook sync)
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" color="neutral" startDecorator={<AiIcon />}>
              Sugerir Horarios IA
            </Button>
            <Button startDecorator={<AddIcon />} color="primary" onClick={() => setOpenModal(true)}>
              Nueva Cita
            </Button>
          </Stack>
        </Stack>

        {loading && <LinearProgress />}

        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Stack spacing={1}>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Total Citas
                  </Typography>
                  <Typography level="h2">{stats.total}</Typography>
                  <Chip size="sm" color="neutral" variant="soft">
                    Hoy: {stats.today}
                  </Chip>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Stack spacing={1}>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Confirmadas
                  </Typography>
                  <Typography level="h2" sx={{ color: 'success.main' }}>
                    {stats.confirmed}
                  </Typography>
                  <Chip size="sm" color="success" variant="soft" startDecorator={<CheckIcon />}>
                    Activas
                  </Chip>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Stack spacing={1}>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Pendientes
                  </Typography>
                  <Typography level="h2" sx={{ color: 'warning.main' }}>
                    {stats.pending}
                  </Typography>
                  <Chip size="sm" color="warning" variant="soft" startDecorator={<ScheduleIcon />}>
                    Por confirmar
                  </Chip>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Stack spacing={1}>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Completadas
                  </Typography>
                  <Typography level="h2" sx={{ color: 'primary.main' }}>
                    {stats.completed}
                  </Typography>
                  <Chip size="sm" color="primary" variant="soft">
                    Finalizadas
                  </Chip>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Stack spacing={1}>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Canceladas
                  </Typography>
                  <Typography level="h2" sx={{ color: 'danger.main' }}>
                    {stats.cancelled}
                  </Typography>
                  <Chip size="sm" color="danger" variant="soft" startDecorator={<CancelIcon />}>
                    No asistió
                  </Chip>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Tabs value={selectedTab} onChange={(_, value) => setSelectedTab(value as number)}>
          <TabList>
            <Tab>
              <EventIcon sx={{ mr: 1 }} />
              Lista de Citas
            </Tab>
            <Tab>
              <PersonIcon sx={{ mr: 1 }} />
              Servicios ({services.length})
            </Tab>
            <Tab>
              <NotificationIcon sx={{ mr: 1 }} />
              Recordatorios
            </Tab>
          </TabList>

          <TabPanel value={0}>
            <Stack spacing={2}>
              <Card>
                <CardContent>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Select
                      value={filterStatus}
                      onChange={(_, value) => setFilterStatus(value as string)}
                      size="sm"
                      sx={{ minWidth: 150 }}
                    >
                      <Option value="all">Todos los estados</Option>
                      <Option value="confirmed">Confirmadas</Option>
                      <Option value="pending">Pendientes</Option>
                      <Option value="completed">Completadas</Option>
                      <Option value="cancelled">Canceladas</Option>
                    </Select>
                    <Select
                      value={filterDate}
                      onChange={(_, value) => setFilterDate(value as string)}
                      size="sm"
                      sx={{ minWidth: 150 }}
                    >
                      <Option value="all">Todas las fechas</Option>
                      <Option value="today">Hoy</Option>
                      <Option value="week">Esta semana</Option>
                    </Select>
                  </Stack>
                </CardContent>
              </Card>

              <Card>
                <Sheet sx={{ overflow: 'auto' }}>
                  <Table stickyHeader>
                    <thead>
                      <tr>
                        <th style={{ width: 250 }}>Cliente</th>
                        <th style={{ width: 200 }}>Servicio</th>
                        <th style={{ width: 150 }}>Fecha & Hora</th>
                        <th style={{ width: 100 }}>Tipo</th>
                        <th style={{ width: 120 }}>Estado</th>
                        <th style={{ width: 150 }}>Asignado a</th>
                        <th style={{ width: 250 }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAppointments.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>
                            <Typography>
                              {appointments.length === 0
                                ? 'No hay citas programadas. Crea tu primera cita para comenzar.'
                                : 'No hay citas con los filtros aplicados.'}
                            </Typography>
                          </td>
                        </tr>
                      ) : (
                        filteredAppointments.map((appointment) => (
                          <tr key={appointment.id}>
                            <td>
                              <Stack spacing={0.5}>
                                <Typography level="body-sm" fontWeight="bold">
                                  {appointment.client.name}
                                </Typography>
                                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                  {appointment.client.phone}
                                </Typography>
                              </Stack>
                            </td>
                            <td>
                              <Typography level="body-sm">{appointment.service}</Typography>
                            </td>
                            <td>
                              <Stack spacing={0.5}>
                                <Typography level="body-sm">
                                  {new Date(appointment.date).toLocaleDateString('es-ES')}
                                </Typography>
                                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                  {appointment.time} ({appointment.duration} min)
                                </Typography>
                              </Stack>
                            </td>
                            <td>
                              <Chip
                                size="sm"
                                variant="soft"
                                color="neutral"
                                startDecorator={getTypeIcon(appointment.type)}
                              >
                                {getTypeLabel(appointment.type)}
                              </Chip>
                            </td>
                            <td>
                              <Chip
                                size="sm"
                                color={getStatusColor(appointment.status)}
                                variant="soft"
                              >
                                {getStatusLabel(appointment.status)}
                              </Chip>
                            </td>
                            <td>
                              <Typography level="body-sm">{appointment.assignedTo}</Typography>
                            </td>
                            <td>
                              <Stack direction="row" spacing={0.5}>
                                <Tooltip title="Ver detalles">
                                  <IconButton size="sm" variant="plain" color="primary">
                                    <ViewIcon />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Editar">
                                  <IconButton size="sm" variant="plain" color="neutral">
                                    <EditIcon />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Enviar recordatorio">
                                  <IconButton
                                    size="sm"
                                    variant="plain"
                                    color="success"
                                    onClick={() => sendReminder(appointment.id)}
                                  >
                                    <SendIcon />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Eliminar">
                                  <IconButton
                                    size="sm"
                                    variant="plain"
                                    color="danger"
                                    onClick={() => deleteAppointment(appointment.id)}
                                  >
                                    <DeleteIcon />
                                  </IconButton>
                                </Tooltip>
                              </Stack>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </Table>
                </Sheet>
              </Card>
            </Stack>
          </TabPanel>

          <TabPanel value={1}>
            <Grid container spacing={2}>
              {services.map((service) => (
                <Grid key={service.id} xs={12} sm={6} md={4}>
                  <Card variant="outlined">
                    <CardContent>
                      <Stack spacing={2}>
                        <Box
                          sx={{
                            width: 40,
                            height: 40,
                            borderRadius: 'sm',
                            bgcolor: service.color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <EventIcon sx={{ color: 'white' }} />
                        </Box>
                        <Typography level="title-md">{service.name}</Typography>
                        <Stack direction="row" spacing={2}>
                          <Chip size="sm" variant="soft">
                            {service.duration} min
                          </Chip>
                          <Chip size="sm" variant="soft" color="success">
                            ${service.price}
                          </Chip>
                        </Stack>
                        <Stack direction="row" spacing={1}>
                          <Button size="sm" variant="outlined" fullWidth>
                            Editar
                          </Button>
                          <Button size="sm" variant="soft" color="danger" fullWidth>
                            Eliminar
                          </Button>
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
              <Grid xs={12} sm={6} md={4}>
                <Card
                  variant="outlined"
                  sx={{
                    borderStyle: 'dashed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 200,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'background.level1' },
                  }}
                >
                  <Stack alignItems="center" spacing={1}>
                    <AddIcon sx={{ fontSize: 48, opacity: 0.3 }} />
                    <Typography level="body-sm">Agregar Servicio</Typography>
                  </Stack>
                </Card>
              </Grid>
            </Grid>
          </TabPanel>

          <TabPanel value={2}>
            <Card>
              <CardContent>
                <Stack spacing={2}>
                  <Typography level="title-md">Configuración de Recordatorios</Typography>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Los recordatorios se envían automáticamente 24 horas antes de la cita.
                  </Typography>
                  <Stack spacing={2}>
                    <FormControl>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Chip color="success" variant="soft">
                          WhatsApp
                        </Chip>
                        <Typography level="body-sm">Activado para todas las citas</Typography>
                      </Stack>
                    </FormControl>
                    <FormControl>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Chip color="primary" variant="soft">
                          Email
                        </Chip>
                        <Typography level="body-sm">Activado para todas las citas</Typography>
                      </Stack>
                    </FormControl>
                    <FormControl>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Chip color="warning" variant="soft">
                          SMS
                        </Chip>
                        <Typography level="body-sm">Opcional por cita</Typography>
                      </Stack>
                    </FormControl>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </TabPanel>
        </Tabs>

        <Modal open={openModal} onClose={() => setOpenModal(false)}>
          <ModalDialog sx={{ minWidth: 600 }}>
            <ModalClose />
            <Typography level="h4" sx={{ mb: 2 }}>
              Nueva Cita
            </Typography>
            <Stack spacing={2}>
              <FormControl>
                <FormLabel>Cliente</FormLabel>
                <Input placeholder="Buscar o crear cliente..." />
              </FormControl>
              <Stack direction="row" spacing={2}>
                <FormControl sx={{ flex: 1 }}>
                  <FormLabel>Servicio</FormLabel>
                  <Select defaultValue="">
                    {services.length === 0 ? (
                      <Option value="" disabled>
                        Configura servicios primero en la sección de configuración.
                      </Option>
                    ) : (
                      services.map((service) => (
                        <Option key={service.id} value={service.id.toString()}>
                          {service.name} ({service.duration} min)
                        </Option>
                      ))
                    )}
                  </Select>
                </FormControl>
                <FormControl sx={{ flex: 1 }}>
                  <FormLabel>Asignar a</FormLabel>
                  <Select defaultValue="1">
                    <Option value="1">Dr. García</Option>
                    <Option value="2">Lic. Martínez</Option>
                    <Option value="3">Ing. López</Option>
                  </Select>
                </FormControl>
              </Stack>
              <Stack direction="row" spacing={2}>
                <FormControl sx={{ flex: 1 }}>
                  <FormLabel>Fecha</FormLabel>
                  <Input type="date" />
                </FormControl>
                <FormControl sx={{ flex: 1 }}>
                  <FormLabel>Hora</FormLabel>
                  <Input type="time" />
                </FormControl>
              </Stack>
              <FormControl>
                <FormLabel>Tipo de Cita</FormLabel>
                <Select defaultValue="presencial">
                  <Option value="presencial">Presencial</Option>
                  <Option value="virtual">Virtual</Option>
                  <Option value="telefonica">Telefónica</Option>
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Notas (opcional)</FormLabel>
                <Textarea placeholder="Agregar notas sobre la cita..." minRows={3} />
              </FormControl>
              <Stack direction="row" spacing={1}>
                <Button fullWidth variant="outlined" color="neutral" startDecorator={<AiIcon />}>
                  Sugerir Horario IA
                </Button>
                <Button fullWidth color="primary" startDecorator={<AddIcon />}>
                  Crear Cita
                </Button>
              </Stack>
            </Stack>
          </ModalDialog>
        </Modal>
      </Stack>
    </Container>
  )
}
