import { useState, useEffect } from 'react'
import {
  Container,
  Typography,
  Box,
  Stack,
  Card,
  CardContent,
  Button,
  Chip,
  IconButton,
  Tooltip,
  Modal,
  ModalDialog,
  ModalClose,
  Table,
  CircularProgress,
} from '@mui/joy'
import {
  CalendarToday as CalendarIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Today as TodayIcon,
  ViewWeek as WeekIcon,
  ViewModule as MonthIcon,
  Add as AddIcon,
  Event as EventIcon,
  Cancel as CancelIcon,
  Schedule as RescheduleIcon,
  Person as PersonIcon,
  SmartToy as AiIcon,
  Sync as SyncIcon,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
import api from '../services/api'
import appointmentService from '../services/appointmentService'
import CreateAppointmentModal from '../components/CreateAppointmentModal'

interface AppointmentDate {
  date: string
  count: number
}

interface Appointment {
  id: number
  title: string
  startTime: string
  endTime: string
  status: string
  notes?: string
  contact?: {
    id: number
    name: string
    number: string
  }
  service?: {
    id: number
    name: string
    duration: number
  }
  assignedUser?: {
    id: number
    name: string
    email: string
  }
}

export default function AppointmentsCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<'month' | 'week' | 'day'>('month')
  const [openNewModal, setOpenNewModal] = useState(false)
  const [appointmentDates, setAppointmentDates] = useState<AppointmentDate[]>([])
  const [loadingDates, setLoadingDates] = useState(false)

  // Modal de citas del día
  const [openDayModal, setOpenDayModal] = useState(false)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [dayAppointments, setDayAppointments] = useState<Appointment[]>([])
  const [loadingDayAppointments, setLoadingDayAppointments] = useState(false)

  // Modal de reagendar (reutiliza CreateAppointmentModal en modo reschedule)
  const [openRescheduleModal, setOpenRescheduleModal] = useState(false)
  const [appointmentToReschedule, setAppointmentToReschedule] = useState<Appointment | null>(null)

  // Google Calendar sync state
  const [googleConnected, setGoogleConnected] = useState(false)
  const [googleCalendarName, setGoogleCalendarName] = useState('')
  const [loadingGoogleSync, setLoadingGoogleSync] = useState(false)

  // Cargar fechas con citas del mes actual
  useEffect(() => {
    fetchAppointmentDates()
    fetchCalendarSyncs()
  }, [currentDate])

  // Check for Google Calendar callback result in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const gcResult = params.get('google_calendar')
    if (gcResult === 'connected') {
      toast.success('Google Calendar conectado exitosamente')
      fetchCalendarSyncs()
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    } else if (gcResult === 'error') {
      toast.error('Error al conectar Google Calendar')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const fetchAppointmentDates = async () => {
    setLoadingDates(true)
    try {
      const year = currentDate.getFullYear()
      const month = currentDate.getMonth()
      const startDate = new Date(year, month, 1).toISOString()
      const endDate = new Date(year, month + 1, 0, 23, 59, 59).toISOString()

      const { data } = await api.get('/appointments/calendar/dates', {
        params: { startDate, endDate }
      })
      setAppointmentDates(data)
    } catch (error) {
      console.error('Error fetching appointment dates:', error)
    } finally {
      setLoadingDates(false)
    }
  }

  const fetchDayAppointments = async (date: Date) => {
    setLoadingDayAppointments(true)
    try {
      const { data } = await api.get('/appointments/calendar/day', {
        params: { date: date.toISOString() }
      })
      setDayAppointments(data)
    } catch (error) {
      console.error('Error fetching day appointments:', error)
      toast.error('Error al cargar las citas del día')
    } finally {
      setLoadingDayAppointments(false)
    }
  }

  const fetchCalendarSyncs = async () => {
    try {
      const syncs = await appointmentService.getCalendarSyncs()
      const googleSync = syncs.find((s: any) => s.provider === 'google' && s.syncEnabled)
      setGoogleConnected(!!googleSync)
      setGoogleCalendarName(googleSync?.calendarName || '')
    } catch (error) {
      // Silently fail - sync status is not critical
    }
  }

  const handleConnectGoogle = async () => {
    setLoadingGoogleSync(true)
    try {
      // Build redirect URI for the OAuth callback
      const backendUrl = api.defaults.baseURL?.replace('/api', '') || window.location.origin
      const redirectUri = `${backendUrl}/appointments/calendar/google/callback`
      const frontendUrl = window.location.origin + window.location.pathname

      // Backend generates auth URL with state containing companyId/userId
      const response = await api.get('/appointments/calendar/google/auth-url', {
        params: { redirectUri, frontendUrl }
      })

      if (response.data?.authUrl) {
        // authUrl already contains the state parameter embedded by the backend
        window.location.href = response.data.authUrl
      }
    } catch (error: any) {
      const msg = error?.response?.data?.error || 'Error al conectar Google Calendar'
      toast.error(msg)
    } finally {
      setLoadingGoogleSync(false)
    }
  }

  const handleDisconnectGoogle = async () => {
    try {
      await appointmentService.disableCalendarSync('google')
      setGoogleConnected(false)
      setGoogleCalendarName('')
      toast.success('Google Calendar desconectado')
    } catch (error) {
      toast.error('Error al desconectar Google Calendar')
    }
  }

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()

    return { daysInMonth, startingDayOfWeek, year, month }
  }

  const getAppointmentCountForDay = (day: number): number => {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const found = appointmentDates.find(d => d.date === dateStr)
    return found?.count || 0
  }

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  }

  const handleToday = () => {
    setCurrentDate(new Date())
  }

  const handleDayClick = (day: number) => {
    const count = getAppointmentCountForDay(day)
    if (count > 0) {
      const clickedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day)
      setSelectedDay(clickedDate)
      setOpenDayModal(true)
      fetchDayAppointments(clickedDate)
    }
  }

  const handleCancelAppointment = async (appointmentId: number) => {
    if (!confirm('¿Estás seguro de cancelar esta cita?')) return

    try {
      await api.post(`/appointments/appointments/${appointmentId}/cancel`, {
        reason: 'Cancelado por el usuario'
      })
      toast.success('Cita cancelada exitosamente')
      // Refresh
      if (selectedDay) {
        fetchDayAppointments(selectedDay)
      }
      fetchAppointmentDates()
    } catch (error) {
      console.error('Error cancelling appointment:', error)
      toast.error('Error al cancelar la cita')
    }
  }

  const handleOpenReschedule = (appointment: Appointment) => {
    setAppointmentToReschedule(appointment)
    setOpenRescheduleModal(true)
  }

  const getStatusChip = (status: string) => {
    const statusConfig: Record<string, { color: 'success' | 'warning' | 'primary' | 'danger' | 'neutral'; label: string }> = {
      confirmed: { color: 'success', label: 'Confirmada' },
      pending: { color: 'warning', label: 'Pendiente' },
      completed: { color: 'primary', label: 'Completada' },
      cancelled: { color: 'danger', label: 'Cancelada' },
      rescheduled: { color: 'neutral', label: 'Reagendada' },
    }
    const config = statusConfig[status] || { color: 'neutral', label: status }
    return <Chip size="sm" color={config.color} variant="soft">{config.label}</Chip>
  }

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  }

  const renderMonthView = () => {
    const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentDate)
    const days = []
    const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

    // Add empty cells for days before the month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(
        <Box
          key={`empty-${i}`}
          sx={{
            minHeight: 80,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.level1',
          }}
        />
      )
    }

    // Add cells for each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const appointmentCount = getAppointmentCountForDay(day)
      const isToday =
        day === new Date().getDate() &&
        currentDate.getMonth() === new Date().getMonth() &&
        currentDate.getFullYear() === new Date().getFullYear()
      const hasAppointments = appointmentCount > 0

      days.push(
        <Box
          key={day}
          onClick={() => handleDayClick(day)}
          sx={{
            minHeight: 80,
            border: '1px solid',
            borderColor: hasAppointments ? 'primary.300' : 'divider',
            bgcolor: hasAppointments ? 'primary.50' : 'background.surface',
            p: 1,
            cursor: hasAppointments ? 'pointer' : 'default',
            position: 'relative',
            transition: 'all 0.2s',
            '&:hover': hasAppointments ? {
              bgcolor: 'primary.100',
              transform: 'scale(1.02)',
              boxShadow: 'md',
              zIndex: 1,
            } : { bgcolor: 'background.level1' },
          }}
        >
          <Stack spacing={0.5} alignItems="center">
            <Typography
              level="body-sm"
              fontWeight={isToday ? 'bold' : 'normal'}
              sx={{
                color: isToday ? 'white' : hasAppointments ? 'primary.700' : 'text.primary',
                bgcolor: isToday ? 'primary.500' : 'transparent',
                borderRadius: '50%',
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {day}
            </Typography>
            {hasAppointments && (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <EventIcon sx={{ fontSize: 16, color: 'primary.500' }} />
                <Chip
                  size="sm"
                  color="primary"
                  variant="solid"
                  sx={{ minWidth: 24, height: 20 }}
                >
                  {appointmentCount}
                </Chip>
              </Stack>
            )}
          </Stack>
        </Box>
      )
    }

    return (
      <Box>
        {/* Week day headers */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 0,
            mb: 0,
          }}
        >
          {weekDays.map((day) => (
            <Box
              key={day}
              sx={{
                textAlign: 'center',
                py: 1,
                bgcolor: 'background.level1',
                borderBottom: '2px solid',
                borderColor: 'divider',
                fontWeight: 'bold',
              }}
            >
              <Typography level="body-sm">{day}</Typography>
            </Box>
          ))}
        </Box>
        {/* Calendar grid */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 0,
          }}
        >
          {days}
        </Box>
        {loadingDates && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <CircularProgress size="sm" />
          </Box>
        )}
      </Box>
    )
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <CalendarIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Calendario de Citas</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Haz clic en los días con citas para ver detalles
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            {googleConnected ? (
              <Tooltip title={`Conectado: ${googleCalendarName || 'Google Calendar'}`}>
                <Button
                  variant="soft"
                  color="success"
                  size="sm"
                  startDecorator={<SyncIcon />}
                  onClick={handleDisconnectGoogle}
                >
                  Google Calendar
                </Button>
              </Tooltip>
            ) : (
              <Button
                variant="outlined"
                color="neutral"
                size="sm"
                startDecorator={loadingGoogleSync ? <CircularProgress size="sm" /> : <SyncIcon />}
                onClick={handleConnectGoogle}
                disabled={loadingGoogleSync}
              >
                Conectar Google Calendar
              </Button>
            )}
            <Button variant="outlined" color="neutral" startDecorator={<AiIcon />}>
              Sugerir Horarios
            </Button>
            <Button startDecorator={<AddIcon />} color="primary" onClick={() => setOpenNewModal(true)}>
              Nueva Cita
            </Button>
          </Stack>
        </Stack>

        <Card>
          <CardContent>
            <Stack spacing={2}>
              {/* Calendar Controls */}
              <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                <Stack direction="row" spacing={1} alignItems="center">
                  <IconButton size="sm" onClick={handlePrevMonth}>
                    <ChevronLeftIcon />
                  </IconButton>
                  <Typography level="h4" sx={{ minWidth: 200, textAlign: 'center' }}>
                    {currentDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                  </Typography>
                  <IconButton size="sm" onClick={handleNextMonth}>
                    <ChevronRightIcon />
                  </IconButton>
                  <Button size="sm" variant="outlined" onClick={handleToday} startDecorator={<TodayIcon />}>
                    Hoy
                  </Button>
                </Stack>

                <Stack direction="row" spacing={1}>
                  <Tooltip title="Vista mensual">
                    <IconButton
                      size="sm"
                      variant={view === 'month' ? 'solid' : 'outlined'}
                      onClick={() => setView('month')}
                    >
                      <MonthIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Vista semanal">
                    <IconButton
                      size="sm"
                      variant={view === 'week' ? 'solid' : 'outlined'}
                      onClick={() => setView('week')}
                    >
                      <WeekIcon />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>

              {/* Calendar View */}
              {view === 'month' && renderMonthView()}
              {view === 'week' && (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                  <Typography level="body-lg" sx={{ color: 'text.tertiary' }}>
                    Vista semanal - Próximamente
                  </Typography>
                </Box>
              )}
            </Stack>
          </CardContent>
        </Card>

        {/* Day Appointments Modal */}
        <Modal open={openDayModal} onClose={() => setOpenDayModal(false)}>
          <ModalDialog sx={{ minWidth: 700, maxWidth: 900 }}>
            <ModalClose />
            <Stack spacing={2}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <CalendarIcon color="primary" />
                <Typography level="h4">
                  Citas del {selectedDay?.toLocaleDateString('es-ES', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </Typography>
              </Stack>

              {loadingDayAppointments ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : dayAppointments.length === 0 ? (
                <Typography level="body-md" sx={{ textAlign: 'center', py: 4, color: 'text.tertiary' }}>
                  No hay citas para este día
                </Typography>
              ) : (
                <Table stripe="odd" hoverRow>
                  <thead>
                    <tr>
                      <th style={{ width: '15%' }}>Hora</th>
                      <th style={{ width: '20%' }}>Servicio</th>
                      <th style={{ width: '20%' }}>Cliente</th>
                      <th style={{ width: '15%' }}>Asignado a</th>
                      <th style={{ width: '12%' }}>Estado</th>
                      <th style={{ width: '18%' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayAppointments.map((apt) => (
                      <tr key={apt.id}>
                        <td>
                          <Typography level="body-sm" fontWeight="md">
                            {formatTime(apt.startTime)} - {formatTime(apt.endTime)}
                          </Typography>
                        </td>
                        <td>
                          <Typography level="body-sm">
                            {apt.service?.name || apt.title}
                          </Typography>
                        </td>
                        <td>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <PersonIcon sx={{ fontSize: 16, color: 'text.tertiary' }} />
                            <Typography level="body-sm">
                              {apt.contact?.name || 'Sin cliente'}
                            </Typography>
                          </Stack>
                        </td>
                        <td>
                          <Typography level="body-sm">
                            {apt.assignedUser?.name || '-'}
                          </Typography>
                        </td>
                        <td>{getStatusChip(apt.status)}</td>
                        <td>
                          <Stack direction="row" spacing={0.5}>
                            <Tooltip title="Reagendar">
                              <IconButton
                                size="sm"
                                color="primary"
                                variant="soft"
                                onClick={() => handleOpenReschedule(apt)}
                                disabled={apt.status === 'cancelled' || apt.status === 'completed'}
                              >
                                <RescheduleIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Cancelar">
                              <IconButton
                                size="sm"
                                color="danger"
                                variant="soft"
                                onClick={() => handleCancelAppointment(apt.id)}
                                disabled={apt.status === 'cancelled' || apt.status === 'completed'}
                              >
                                <CancelIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Stack>
          </ModalDialog>
        </Modal>

        {/* Reschedule Modal (reutiliza CreateAppointmentModal en modo reschedule) */}
        {appointmentToReschedule && (
          <CreateAppointmentModal
            open={openRescheduleModal}
            mode="reschedule"
            preselectedContact={
              appointmentToReschedule.contact
                ? {
                    id: appointmentToReschedule.contact.id,
                    name: appointmentToReschedule.contact.name,
                    number: appointmentToReschedule.contact.number,
                  }
                : null
            }
            lockContact={!!appointmentToReschedule.contact}
            existingAppointment={{
              id: appointmentToReschedule.id,
              title: appointmentToReschedule.title,
              startTime: appointmentToReschedule.startTime,
              endTime: appointmentToReschedule.endTime,
              status: appointmentToReschedule.status,
              serviceId: appointmentToReschedule.service?.id ?? 0,
              userId: appointmentToReschedule.assignedUser?.id,
              service: appointmentToReschedule.service
                ? {
                    id: appointmentToReschedule.service.id,
                    name: appointmentToReschedule.service.name,
                    color: '#3b82f6',
                    duration: appointmentToReschedule.service.duration,
                  }
                : undefined,
              user: appointmentToReschedule.assignedUser
                ? {
                    id: appointmentToReschedule.assignedUser.id,
                    name: appointmentToReschedule.assignedUser.name,
                  }
                : undefined,
            }}
            onClose={() => {
              setOpenRescheduleModal(false)
              setAppointmentToReschedule(null)
            }}
            onSuccess={() => {
              if (selectedDay) fetchDayAppointments(selectedDay)
              fetchAppointmentDates()
              setOpenRescheduleModal(false)
              setAppointmentToReschedule(null)
            }}
          />
        )}

        {/* New Appointment Modal */}
        <CreateAppointmentModal
          open={openNewModal}
          onClose={() => setOpenNewModal(false)}
          onSuccess={() => {
            fetchAppointmentDates()
          }}
        />
      </Stack>
    </Container>
  )
}
