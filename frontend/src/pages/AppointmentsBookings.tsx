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
  Input,
  Select,
  Option,
  Table,
  Avatar,
  Modal,
  ModalDialog,
  ModalClose,
  Divider,
  CircularProgress,
} from '@mui/joy'
import {
  Search as SearchIcon,
  FilterList as FilterIcon,
  Download as DownloadIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as _CancelIcon,
  Schedule as ScheduleIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  WhatsApp as WhatsAppIcon,
  Visibility as VisibilityIcon,
  EventNote as _EventNoteIcon,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
import appointmentService, { Appointment, AppointmentServiceType } from '../services/appointmentService'
import NewAppointmentModal from '../components/NewAppointmentModal'
import EditAppointmentModal from '../components/EditAppointmentModal'

interface User {
  id: number
  name: string
}

interface Contact {
  id: number
  name: string
  email: string
  phone: string
}

export default function AppointmentsBookings() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [services, setServices] = useState<AppointmentServiceType[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<string>('all')
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [openViewModal, setOpenViewModal] = useState(false)
  const [openNewModal, setOpenNewModal] = useState(false)
  const [openEditModal, setOpenEditModal] = useState(false)
  const [_activeTab, _setActiveTab] = useState(0)
  const [simultaneousCounts, setSimultaneousCounts] = useState<{ [key: string]: number }>({})
  const [appointmentHistory, setAppointmentHistory] = useState<any>(null)

  // Load data on component mount
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      // Load appointments for 3 months range (past month + current + next month)
      const startDate = new Date()
      startDate.setMonth(startDate.getMonth() - 1)
      startDate.setDate(1) // First day of past month
      const endDate = new Date()
      endDate.setMonth(endDate.getMonth() + 2, 0) // Last day of next month

      // Load appointments and services in parallel
      const [appointmentsResponse, servicesData] = await Promise.all([
        appointmentService.getAppointments({
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0]
        }),
        appointmentService.getServices(true)
      ])

      // El backend devuelve { appointments: [], total, totalPages, page }
      const appointmentsData = Array.isArray(appointmentsResponse)
        ? appointmentsResponse
        : (appointmentsResponse as any).appointments || []
      setAppointments(appointmentsData)
      setServices(servicesData)

      // Load simultaneous counts
      try {
        const counts = await appointmentService.getSimultaneousCounts({
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0]
        });
        setSimultaneousCounts(counts);
      } catch (error) {
        console.error('Error loading simultaneous counts:', error);
      }

      // TODO: Load users and contacts from their respective services
      setUsers([])
      setContacts([])
    } catch (error) {
      console.error('Error loading data:', error)
      toast.error('Error al cargar los datos')
    } finally {
      setLoading(false)
    }
  }

  const filteredBookings = appointments.filter((appointment) => {
    const matchesSearch =
      (appointment.attendeeName?.toLowerCase().includes(searchQuery.toLowerCase()) || false) ||
      (appointment.attendeeEmail?.toLowerCase().includes(searchQuery.toLowerCase()) || false) ||
      (appointment.service?.name.toLowerCase().includes(searchQuery.toLowerCase()) || false) ||
      (appointment.title.toLowerCase().includes(searchQuery.toLowerCase()) || false)

    const matchesStatus = statusFilter === 'all' || appointment.status === statusFilter

    let matchesDate = true
    const appointmentDate = new Date(appointment.startTime).toISOString().split('T')[0]
    if (dateFilter === 'today') {
      matchesDate = appointmentDate === new Date().toISOString().split('T')[0]
    } else if (dateFilter === 'upcoming') {
      matchesDate = new Date(appointment.startTime) >= new Date()
    } else if (dateFilter === 'past') {
      matchesDate = new Date(appointment.startTime) < new Date()
    }

    return matchesSearch && matchesStatus && matchesDate
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'success'
      case 'pending':
        return 'warning'
      case 'cancelled':
        return 'danger'
      case 'completed':
        return 'primary'
      case 'no-show':
        return 'neutral'
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
      case 'cancelled':
        return 'Cancelada'
      case 'completed':
        return 'Completada'
      case 'no-show':
        return 'No Show'
      default:
        return status
    }
  }

  const handleViewBooking = async (appointment: Appointment) => {
    setSelectedAppointment(appointment)
    setOpenViewModal(true)
    setAppointmentHistory(null) // Reset previous history

    // Load history
    try {
      const history = await appointmentService.getAppointmentHistory(appointment.id)
      setAppointmentHistory(history)
    } catch (error) {
      console.error('Error loading history:', error)
    }
  }

  const handleEditBooking = (appointment: Appointment) => {
    setSelectedAppointment(appointment)
    setOpenEditModal(true)
  }

  const handleStatusChange = async (appointmentId: number, newStatus: Appointment['status']) => {
    try {
      if (newStatus === 'confirmed') {
        await appointmentService.confirmAppointment(appointmentId)
      } else if (newStatus === 'cancelled') {
        await appointmentService.cancelAppointment(appointmentId, 'Cancelado por administrador')
      } else if (newStatus === 'completed') {
        await appointmentService.completeAppointment(appointmentId)
      }
      // Reload data
      await loadData()
      toast.success('Estado actualizado exitosamente')
    } catch (error) {
      console.error('Error updating status:', error)
      toast.error('Error al actualizar el estado')
    }
  }

  const handleDeleteBooking = async (appointmentId: number) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar esta cita?')) {
      try {
        await appointmentService.deleteAppointment(appointmentId)
        await loadData()
        toast.success('Cita eliminada exitosamente')
      } catch (error) {
        console.error('Error deleting appointment:', error)
        toast.error('Error al eliminar la cita')
      }
    }
  }

  const handleSendReminder = (appointmentId: number, channel: 'email' | 'whatsapp' | 'sms') => {
    // TODO: Implement reminder sending
    alert(`Recordatorio enviado por ${channel}`)
    toast.info(`Recordatorio enviado por ${channel}`)
  }

  const stats = {
    total: appointments.length,
    confirmed: appointments.filter((b) => b.status === 'confirmed').length,
    scheduled: appointments.filter((b) => b.status === 'scheduled').length,
    completed: appointments.filter((b) => b.status === 'completed').length,
    cancelled: appointments.filter((b) => b.status === 'cancelled').length,
    noShow: appointments.filter((b) => b.status === 'no-show').length,
  }

  const upcomingBookings = appointments.filter((b) => new Date(b.startTime) >= new Date() && b.status !== 'cancelled')

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography level="h2" sx={{ mb: 0.5 }}>
            Gestión de Reservas
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Administra todas las citas agendadas
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startDecorator={<DownloadIcon />}>
            Exportar
          </Button>
          <Button startDecorator={<AddIcon />} onClick={() => setOpenNewModal(true)}>Nueva Cita</Button>
        </Box>
      </Box>

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={2}>
          <Card variant="soft" color="neutral">
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography level="h3">{stats.total}</Typography>
              <Typography level="body-sm">Total</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={2}>
          <Card variant="soft" color="success">
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography level="h3">{stats.confirmed}</Typography>
              <Typography level="body-sm">Confirmadas</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={2}>
          <Card variant="soft" color="warning">
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography level="h3">{stats.scheduled}</Typography>
              <Typography level="body-sm">Programadas</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={2}>
          <Card variant="soft" color="primary">
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography level="h3">{stats.completed}</Typography>
              <Typography level="body-sm">Completadas</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={2}>
          <Card variant="soft" color="danger">
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography level="h3">{stats.cancelled}</Typography>
              <Typography level="body-sm">Canceladas</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={2}>
          <Card variant="soft" color="neutral">
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography level="h3">{stats.noShow}</Typography>
              <Typography level="body-sm">No Show</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Input
              placeholder="Buscar por nombre, email o servicio..."
              startDecorator={<SearchIcon />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{ minWidth: 300, flexGrow: 1 }}
            />
            <Select
              value={statusFilter}
              onChange={(_, value) => setStatusFilter(value as string)}
              sx={{ minWidth: 150 }}
              startDecorator={<FilterIcon />}
            >
              <Option value="all">Todos los estados</Option>
              <Option value="confirmed">Confirmadas</Option>
              <Option value="pending">Pendientes</Option>
              <Option value="completed">Completadas</Option>
              <Option value="cancelled">Canceladas</Option>
              <Option value="no-show">No Show</Option>
            </Select>
            <Select
              value={dateFilter}
              onChange={(_, value) => setDateFilter(value as string)}
              sx={{ minWidth: 150 }}
              startDecorator={<ScheduleIcon />}
            >
              <Option value="all">Todas las fechas</Option>
              <Option value="today">Hoy</Option>
              <Option value="upcoming">Próximas</Option>
              <Option value="past">Pasadas</Option>
            </Select>
          </Box>
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        {/* Bookings Table */}
        <Grid xs={12} md={8}>
          <Card>
            <Sheet sx={{ overflow: 'auto' }}>
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : (
                <Table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Servicio</th>
                    <th>Agente</th>
                    <th>Fecha/Hora</th>
                    <th>Estado</th>
                    <th>Precio</th>
                    <th style={{ width: 180 }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBookings.map((appointment) => (
                    <tr key={appointment.id}>
                      <td>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Avatar size="sm" />
                          <Box>
                            <Typography level="body-sm" fontWeight="md">
                              {appointment.attendeeName || appointment.contact?.name || 'Sin nombre'}
                            </Typography>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                              {appointment.attendeePhone || appointment.contact?.phone || 'Sin teléfono'}
                            </Typography>
                          </Box>
                        </Box>
                      </td>
                      <td>
                        <Typography level="body-sm">{appointment.service?.name || 'N/A'}</Typography>
                      </td>
                      <td>
                        <Typography level="body-sm">{appointment.assignedUser?.name || 'N/A'}</Typography>
                      </td>
                      <td>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box>
                            <Typography level="body-sm">
                              {new Date(appointment.startTime).toLocaleDateString('es-ES', {
                                day: '2-digit',
                                month: 'short',
                              })}
                            </Typography>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                              {new Date(appointment.startTime).toLocaleTimeString('es-ES', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })} ({appointment.duration}min)
                            </Typography>
                          </Box>
                          {simultaneousCounts[new Date(appointment.startTime).toISOString()] > 1 && (
                            <Chip
                              size="sm"
                              color="warning"
                              variant="soft"
                              sx={{ minWidth: 32 }}
                              title={`${simultaneousCounts[new Date(appointment.startTime).toISOString()]} citas simultáneas`}
                            >
                              {simultaneousCounts[new Date(appointment.startTime).toISOString()]}
                            </Chip>
                          )}
                        </Box>
                      </td>
                      <td>
                        <Chip size="sm" color={getStatusColor(appointment.status)}>
                          {getStatusLabel(appointment.status)}
                        </Chip>
                      </td>
                      <td>
                        <Typography level="body-sm" fontWeight="md">
                          ${appointment.service?.price || 0}
                        </Typography>
                      </td>
                      <td>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <IconButton size="sm" variant="soft" color="primary" onClick={() => handleViewBooking(appointment)}>
                            <VisibilityIcon />
                          </IconButton>
                          <IconButton size="sm" variant="soft" color="neutral" onClick={() => handleEditBooking(appointment)}>
                            <EditIcon />
                          </IconButton>
                          {appointment.status === 'scheduled' && (
                            <IconButton
                              size="sm"
                              variant="soft"
                              color="success"
                              onClick={() => handleStatusChange(appointment.id, 'confirmed')}
                            >
                              <CheckCircleIcon />
                            </IconButton>
                          )}
                          <IconButton
                            size="sm"
                            variant="soft"
                            color="danger"
                            onClick={() => handleDeleteBooking(appointment.id)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Box>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              )}
            </Sheet>
          </Card>
        </Grid>

        {/* Upcoming Bookings Sidebar */}
        <Grid xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 2 }}>
                Próximas Citas
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {upcomingBookings.slice(0, 5).map((appointment) => (
                  <Card key={appointment.id} variant="outlined">
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Avatar size="sm" />
                        <Box sx={{ flexGrow: 1 }}>
                          <Typography level="body-sm" fontWeight="md">
                            {appointment.attendeeName || appointment.contact?.name || 'Sin nombre'}
                          </Typography>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            {appointment.service?.name || 'N/A'}
                          </Typography>
                        </Box>
                      </Box>
                      <Divider sx={{ my: 1 }} />
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography level="body-xs">
                          {new Date(appointment.startTime).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} {new Date(appointment.startTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                        <Chip size="sm" color={getStatusColor(appointment.status)} variant="soft">
                          {getStatusLabel(appointment.status)}
                        </Chip>
                      </Box>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* View Booking Modal */}
      <Modal open={openViewModal} onClose={() => setOpenViewModal(false)}>
        <ModalDialog sx={{ minWidth: 600 }}>
          <ModalClose />
          <Typography level="h4" sx={{ mb: 2 }}>
            Detalles de la Cita
          </Typography>

          {selectedAppointment && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar size="lg" />
                <Box sx={{ flexGrow: 1 }}>
                  <Typography level="title-lg">{selectedAppointment.attendeeName || selectedAppointment.contact?.name || 'Sin nombre'}</Typography>
                  <Chip size="sm" color={getStatusColor(selectedAppointment.status)}>
                    {getStatusLabel(selectedAppointment.status)}
                  </Chip>
                </Box>
              </Box>

              <Divider />

              <Grid container spacing={2}>
                <Grid xs={6}>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Email
                  </Typography>
                  <Typography level="body-md">{selectedAppointment.attendeeEmail || selectedAppointment.contact?.email || 'N/A'}</Typography>
                </Grid>
                <Grid xs={6}>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Teléfono
                  </Typography>
                  <Typography level="body-md">{selectedAppointment.attendeePhone || selectedAppointment.contact?.phone || 'N/A'}</Typography>
                </Grid>
                <Grid xs={6}>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Servicio
                  </Typography>
                  <Typography level="body-md">{selectedAppointment.service?.name || 'N/A'}</Typography>
                </Grid>
                <Grid xs={6}>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Agente
                  </Typography>
                  <Typography level="body-md">{selectedAppointment.assignedUser?.name || 'N/A'}</Typography>
                </Grid>
                <Grid xs={6}>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Fecha
                  </Typography>
                  <Typography level="body-md">
                    {new Date(selectedAppointment.startTime).toLocaleDateString('es-ES', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </Typography>
                </Grid>
                <Grid xs={6}>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Hora
                  </Typography>
                  <Typography level="body-md">
                    {new Date(selectedAppointment.startTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} ({selectedAppointment.duration} min)
                  </Typography>
                </Grid>
                <Grid xs={6}>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Precio
                  </Typography>
                  <Typography level="body-md" fontWeight="md">
                    ${selectedAppointment.service?.price || 0}
                  </Typography>
                </Grid>
                <Grid xs={6}>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Creada
                  </Typography>
                  <Typography level="body-md">
                    {new Date(selectedAppointment.createdAt).toLocaleDateString('es-ES')}
                  </Typography>
                </Grid>
              </Grid>

              <Divider />

              <Box>
                <Typography level="title-md" sx={{ mb: 1 }}>
                  Notas
                </Typography>

                {/* Notas públicas */}
                <Card variant="soft" sx={{ mb: 2 }}>
                  <CardContent>
                    <Typography level="body-sm" sx={{ mb: 1, fontWeight: 'md', color: 'primary.plainColor' }}>
                      📝 Notas públicas
                    </Typography>
                    <Typography level="body-sm" sx={{ whiteSpace: 'pre-wrap' }}>
                      {selectedAppointment.notes || 'Sin notas públicas'}
                    </Typography>
                  </CardContent>
                </Card>

                {/* Notas internas */}
                {selectedAppointment.internalNotes && (
                  <Card variant="soft" color="warning">
                    <CardContent>
                      <Typography level="body-sm" sx={{ mb: 1, fontWeight: 'md' }}>
                        🔒 Notas internas (privadas)
                      </Typography>
                      <Typography level="body-sm" sx={{ whiteSpace: 'pre-wrap' }}>
                        {selectedAppointment.internalNotes}
                      </Typography>
                    </CardContent>
                  </Card>
                )}
              </Box>

              <Box sx={{ display: 'flex', gap: 1 }}>
                <Chip size="sm" variant="outlined" color={selectedAppointment.confirmationSent ? 'success' : 'neutral'}>
                  {selectedAppointment.confirmationSent ? 'Confirmación enviada' : 'Sin confirmar'}
                </Chip>
                <Chip size="sm" variant="outlined" color={selectedAppointment.reminderSent ? 'success' : 'neutral'}>
                  {selectedAppointment.reminderSent ? 'Recordatorio enviado' : 'Sin recordatorio'}
                </Chip>
              </Box>

              {/* Historial de Cambios */}
              {appointmentHistory && appointmentHistory.timeline && appointmentHistory.timeline.length > 0 && (
                <>
                  <Divider />
                  <Box>
                    <Typography level="title-md" sx={{ mb: 2 }}>
                      📅 Historial de Cambios
                    </Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      {appointmentHistory.timeline.map((event: any, idx: number) => {
                        const eventColors: { [key: string]: any } = {
                          created: 'primary',
                          confirmed: 'success',
                          rescheduled: 'warning',
                          cancelled: 'danger',
                          completed: 'primary'
                        };

                        const eventLabels: { [key: string]: string } = {
                          created: 'Creada',
                          confirmed: 'Confirmada',
                          rescheduled: 'Reagendada',
                          cancelled: 'Cancelada',
                          completed: 'Completada'
                        };

                        return (
                          <Card key={idx} variant="outlined" size="sm">
                            <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                              <Box sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                bgcolor: `${eventColors[event.type] || 'neutral'}.500`,
                                mt: 0.5,
                                flexShrink: 0
                              }} />

                              <Box sx={{ flexGrow: 1 }}>
                                <Typography level="body-sm" fontWeight="md">
                                  {event.details}
                                </Typography>
                                <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                                  {new Date(event.timestamp).toLocaleString('es-ES', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </Typography>
                              </Box>

                              <Chip
                                size="sm"
                                color={eventColors[event.type] || 'neutral'}
                                variant="soft"
                              >
                                {eventLabels[event.type] || event.type}
                              </Chip>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </Box>
                  </Box>
                </>
              )}

              {/* Loading state para historial */}
              {appointmentHistory === null && (
                <>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                    <CircularProgress size="sm" />
                    <Typography level="body-sm" sx={{ ml: 2 }}>
                      Cargando historial...
                    </Typography>
                  </Box>
                </>
              )}

              <Divider />

              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    size="sm"
                    variant="outlined"
                    startDecorator={<WhatsAppIcon />}
                    onClick={() => handleSendReminder(selectedAppointment.id, 'whatsapp')}
                  >
                    WhatsApp
                  </Button>
                  <Button
                    size="sm"
                    variant="outlined"
                    startDecorator={<EmailIcon />}
                    onClick={() => handleSendReminder(selectedAppointment.id, 'email')}
                  >
                    Email
                  </Button>
                  <Button
                    size="sm"
                    variant="outlined"
                    startDecorator={<PhoneIcon />}
                    onClick={() => handleSendReminder(selectedAppointment.id, 'sms')}
                  >
                    SMS
                  </Button>
                </Box>
                <Button variant="soft" onClick={() => setOpenViewModal(false)}>
                  Cerrar
                </Button>
              </Box>
            </Box>
          )}
        </ModalDialog>
      </Modal>

      {/* New Appointment Modal */}
      <NewAppointmentModal
        open={openNewModal}
        onClose={() => setOpenNewModal(false)}
        onSuccess={() => {
          loadData()
          setOpenNewModal(false)
        }}
        services={services}
        users={users}
        contacts={contacts}
      />

      {/* Edit Appointment Modal */}
      <EditAppointmentModal
        open={openEditModal}
        onClose={() => setOpenEditModal(false)}
        onSuccess={() => {
          loadData()
          setOpenEditModal(false)
        }}
        appointment={selectedAppointment}
        services={services}
        users={users}
        contacts={contacts}
      />
    </Container>
  )
}
