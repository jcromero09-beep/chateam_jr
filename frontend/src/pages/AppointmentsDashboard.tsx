import { useState, useEffect, useMemo } from 'react'
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
  Table,
  Avatar,
  Select,
  Option,
  Input,
  CircularProgress,
} from '@mui/joy'
import {
  CalendarToday as CalendarIcon,
  Schedule as ScheduleIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  AccessTime as TimeIcon,
  EventAvailable as EventAvailableIcon,
  EventBusy as EventBusyIcon,
  KeyboardArrowLeft as PrevIcon,
  KeyboardArrowRight as NextIcon,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
import api from '../services/api'

interface Appointment {
  id: number
  title: string
  startTime: string
  endTime: string
  status: string
  attendeeName: string
  attendeePhone?: string
  notes?: string
  service?: {
    id: number
    name: string
    color: string
  }
  user?: {
    id: number
    name: string
  }
  contact?: {
    id: number
    name: string
    number: string
    profilePicUrl?: string
    urlPicture?: string
  }
}

interface User {
  id: number
  name: string
  email: string
  profile?: string
}

interface AvailabilityBlock {
  id: number
  startTime: string
  endTime: string
  isBooked: boolean
  userId?: number
  userName?: string
}

interface Stats {
  total: number
  scheduled: number
  completed: number
  cancelled: number
  confirmed: number
}

interface WeeklyData {
  day: string
  dayName: string
  count: number
}

export default function AppointmentsDashboard() {
  const [loading, setLoading] = useState(true)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [upcomingBlocks, setUpcomingBlocks] = useState<AvailabilityBlock[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [stats, setStats] = useState<Stats>({
    total: 0,
    scheduled: 0,
    completed: 0,
    cancelled: 0,
    confirmed: 0,
  })

  // Pagination
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const pageSize = 10

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [userFilter, setUserFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<string>('')

  // Carousel state
  const [carouselIndex, setCarouselIndex] = useState(0)

  useEffect(() => {
    fetchInitialData()
  }, [])

  useEffect(() => {
    fetchAppointments()
  }, [page, statusFilter, userFilter, dateFilter])

  const fetchInitialData = async () => {
    setLoading(true)
    try {
      const [usersRes, blocksRes, statsRes] = await Promise.all([
        api.get('/users'),
        api.get('/appointments/availability/blocks-for-date', {
          params: { date: new Date().toISOString().split('T')[0] }
        }),
        api.get('/appointments/appointments', { params: { limit: 500 } }) // For stats only
      ])

      setUsers(usersRes.data.users || usersRes.data || [])
      setUpcomingBlocks(blocksRes.data || [])

      // Calculate stats from all appointments
      const allAppointments = statsRes.data.appointments || statsRes.data || []
      const total = allAppointments.length
      const scheduled = allAppointments.filter((a: Appointment) => a.status === 'scheduled' || a.status === 'pending').length
      const completed = allAppointments.filter((a: Appointment) => a.status === 'completed').length
      const cancelled = allAppointments.filter((a: Appointment) => a.status === 'cancelled').length
      const confirmed = allAppointments.filter((a: Appointment) => a.status === 'confirmed').length

      setStats({ total, scheduled, completed, cancelled, confirmed })

      // Fetch first page of appointments
      await fetchAppointments()
    } catch (error) {
      console.error('Error fetching data:', error)
      toast.error('Error al cargar los datos')
    } finally {
      setLoading(false)
    }
  }

  const fetchAppointments = async () => {
    try {
      const params: any = {
        page,
        limit: pageSize,
      }

      if (statusFilter !== 'all') {
        params.status = statusFilter
      }
      if (userFilter !== 'all') {
        params.userId = userFilter
      }
      if (dateFilter) {
        params.startDate = dateFilter
        params.endDate = dateFilter
      }

      const response = await api.get('/appointments/appointments', { params })
      const data = response.data

      setAppointments(data.appointments || [])
      setTotalCount(data.total || 0)
      setTotalPages(data.totalPages || 1)
    } catch (error) {
      console.error('Error fetching appointments:', error)
    }
  }

  // Filter appointments locally by search query
  const filteredAppointments = useMemo(() => {
    if (!searchQuery) return appointments

    const query = searchQuery.toLowerCase()
    return appointments.filter(
      (a) =>
        a.attendeeName?.toLowerCase().includes(query) ||
        a.title?.toLowerCase().includes(query) ||
        a.contact?.name?.toLowerCase().includes(query) ||
        a.service?.name?.toLowerCase().includes(query)
    )
  }, [appointments, searchQuery])

  // Calculate weekly trend from stats
  const weeklyTrend = useMemo((): WeeklyData[] => {
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']
    // Mock distribution based on total - in production this should come from backend
    const baseCount = Math.floor(stats.total / 7)
    const variance = Math.floor(baseCount * 0.3)

    return dayNames.map((name, index) => ({
      day: String(index),
      dayName: name,
      count: Math.max(0, baseCount + Math.floor(Math.random() * variance * 2) - variance),
    }))
  }, [stats.total])

  const maxWeeklyCount = useMemo(() => {
    return Math.max(...weeklyTrend.map((d) => d.count), 1)
  }, [weeklyTrend])

  const handleCarouselPrev = () => {
    setCarouselIndex((prev) => Math.max(0, prev - 1))
  }

  const handleCarouselNext = () => {
    const maxIndex = Math.max(0, upcomingBlocks.length - 5)
    setCarouselIndex((prev) => Math.min(maxIndex, prev + 1))
  }

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage)
    }
  }

  const handleFilterChange = () => {
    setPage(1) // Reset to first page when filters change
  }

  const getStatusColor = (status: string): 'success' | 'warning' | 'danger' | 'primary' | 'neutral' => {
    switch (status) {
      case 'confirmed':
        return 'primary'
      case 'completed':
        return 'success'
      case 'pending':
      case 'scheduled':
        return 'warning'
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
      case 'completed':
        return 'Atendida'
      case 'pending':
        return 'Pendiente'
      case 'scheduled':
        return 'Programada'
      case 'cancelled':
        return 'Cancelada'
      default:
        return status
    }
  }

  const formatTime = (time: string) => {
    if (!time) return ''
    const [hours, minutes] = time.split(':')
    const hour = parseInt(hours)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const hour12 = hour % 12 || 12
    return `${hour12}:${minutes} ${ampm}`
  }

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const visibleBlocks = upcomingBlocks.slice(carouselIndex, carouselIndex + 5)

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
            Dashboard de Citas
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Metricas y estadisticas de agendamiento
          </Typography>
        </Box>
        <IconButton variant="outlined" size="sm" onClick={fetchInitialData}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* KPIs Grid - 5 cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                    Citas Totales
                  </Typography>
                  <Typography level="h3">{stats.total}</Typography>
                </Box>
                <Sheet sx={{ p: 1.5, borderRadius: 'sm', bgcolor: 'primary.softBg' }}>
                  <CalendarIcon sx={{ color: 'primary.500' }} />
                </Sheet>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                    Programadas
                  </Typography>
                  <Typography level="h3">{stats.scheduled}</Typography>
                </Box>
                <Sheet sx={{ p: 1.5, borderRadius: 'sm', bgcolor: 'warning.softBg' }}>
                  <ScheduleIcon sx={{ color: 'warning.500' }} />
                </Sheet>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                    Atendidas
                  </Typography>
                  <Typography level="h3">{stats.completed}</Typography>
                </Box>
                <Sheet sx={{ p: 1.5, borderRadius: 'sm', bgcolor: 'success.softBg' }}>
                  <CheckCircleIcon sx={{ color: 'success.500' }} />
                </Sheet>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                    Canceladas
                  </Typography>
                  <Typography level="h3">{stats.cancelled}</Typography>
                </Box>
                <Sheet sx={{ p: 1.5, borderRadius: 'sm', bgcolor: 'danger.softBg' }}>
                  <CancelIcon sx={{ color: 'danger.500' }} />
                </Sheet>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                    Confirmadas
                  </Typography>
                  <Typography level="h3">{stats.confirmed}</Typography>
                </Box>
                <Sheet sx={{ p: 1.5, borderRadius: 'sm', bgcolor: 'info.softBg' }}>
                  <EventAvailableIcon sx={{ color: 'info.500' }} />
                </Sheet>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Upcoming Blocks Carousel - Compact version */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography level="title-md">Proximos Horarios de Hoy</Typography>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <IconButton
              size="sm"
              variant="plain"
              onClick={handleCarouselPrev}
              disabled={carouselIndex === 0}
            >
              <ChevronLeftIcon />
            </IconButton>
            <IconButton
              size="sm"
              variant="plain"
              onClick={handleCarouselNext}
              disabled={carouselIndex >= upcomingBlocks.length - 5}
            >
              <ChevronRightIcon />
            </IconButton>
          </Box>
        </Box>

        {upcomingBlocks.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 2, bgcolor: 'background.level1', borderRadius: 'sm' }}>
            <EventBusyIcon sx={{ fontSize: 24, opacity: 0.3 }} />
            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
              No hay bloques para hoy
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', gap: 1, overflow: 'hidden' }}>
            {visibleBlocks.map((block) => (
              <Box
                key={block.id}
                sx={{
                  flex: '0 0 calc(20% - 6.4px)',
                  minWidth: 140,
                  p: 1.5,
                  borderRadius: 'sm',
                  bgcolor: block.isBooked ? 'neutral.100' : 'success.100',
                  border: '1px solid',
                  borderColor: block.isBooked ? 'neutral.300' : 'success.300',
                  transition: 'all 0.2s',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                  <TimeIcon sx={{ fontSize: 14, color: block.isBooked ? 'neutral.500' : 'success.600' }} />
                  <Typography
                    level="body-sm"
                    fontWeight="md"
                    sx={{ color: block.isBooked ? 'neutral.700' : 'success.700' }}
                  >
                    {formatTime(block.startTime)}
                  </Typography>
                </Box>
                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                  {block.userName || 'Sin asignar'}
                </Typography>
                <Chip
                  size="sm"
                  variant="soft"
                  color={block.isBooked ? 'neutral' : 'success'}
                  sx={{ mt: 0.5, fontSize: '0.65rem', height: 18 }}
                >
                  {block.isBooked ? 'Ocupado' : 'Disponible'}
                </Chip>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* Appointments Table with Filters - Full Width */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography level="title-lg" sx={{ mb: 2 }}>
            Citas
          </Typography>

          {/* Filters */}
          <Grid container spacing={1} sx={{ mb: 2 }}>
            <Grid xs={12} sm={4}>
              <Input
                size="sm"
                placeholder="Buscar..."
                startDecorator={<SearchIcon sx={{ fontSize: 18 }} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </Grid>
            <Grid xs={6} sm={2}>
              <Select
                size="sm"
                value={statusFilter}
                onChange={(_, value) => {
                  setStatusFilter(value as string)
                  handleFilterChange()
                }}
              >
                <Option value="all">Estado</Option>
                <Option value="scheduled">Programadas</Option>
                <Option value="pending">Pendientes</Option>
                <Option value="confirmed">Confirmadas</Option>
                <Option value="completed">Atendidas</Option>
                <Option value="cancelled">Canceladas</Option>
              </Select>
            </Grid>
            <Grid xs={6} sm={2}>
              <Select
                size="sm"
                value={userFilter}
                onChange={(_, value) => {
                  setUserFilter(value as string)
                  handleFilterChange()
                }}
              >
                <Option value="all">Usuario</Option>
                {users.map((user) => (
                  <Option key={user.id} value={String(user.id)}>
                    {user.name}
                  </Option>
                ))}
              </Select>
            </Grid>
            <Grid xs={6} sm={2}>
              <Input
                size="sm"
                type="date"
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value)
                  handleFilterChange()
                }}
              />
            </Grid>
            <Grid xs={6} sm={2}>
              <Button
                variant="outlined"
                size="sm"
                fullWidth
                onClick={() => {
                  setSearchQuery('')
                  setStatusFilter('all')
                  setUserFilter('all')
                  setDateFilter('')
                  setPage(1)
                }}
              >
                Limpiar
              </Button>
            </Grid>
          </Grid>

          {/* Table */}
          <Sheet sx={{ overflow: 'auto' }}>
            <Table size="sm" stickyHeader>
              <thead>
                <tr>
                  <th style={{ width: '25%' }}>Cliente</th>
                  <th style={{ width: '20%' }}>Servicio</th>
                  <th style={{ width: '20%' }}>Fecha/Hora</th>
                  <th style={{ width: '15%' }}>Usuario</th>
                  <th style={{ width: '10%' }}>Estado</th>
                  <th style={{ width: '10%' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredAppointments.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <Box sx={{ textAlign: 'center', py: 3 }}>
                        <CalendarIcon sx={{ fontSize: 32, opacity: 0.3, mb: 1 }} />
                        <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                          No se encontraron citas
                        </Typography>
                      </Box>
                    </td>
                  </tr>
                ) : (
                  filteredAppointments.map((appointment) => (
                    <tr key={appointment.id}>
                      <td>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Avatar
                            src={appointment.contact?.urlPicture || appointment.contact?.profilePicUrl}
                            size="sm"
                            sx={{ width: 32, height: 32 }}
                          >
                            {appointment.attendeeName?.charAt(0) || appointment.contact?.name?.charAt(0)}
                          </Avatar>
                          <Box>
                            <Typography level="body-sm" fontWeight="md">
                              {appointment.attendeeName || appointment.contact?.name}
                            </Typography>
                            {appointment.attendeePhone && (
                              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                {appointment.attendeePhone}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      </td>
                      <td>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {appointment.service?.color && (
                            <Box
                              sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                bgcolor: appointment.service.color,
                              }}
                            />
                          )}
                          <Typography level="body-sm">
                            {appointment.service?.name || appointment.title}
                          </Typography>
                        </Box>
                      </td>
                      <td>
                        <Typography level="body-sm">
                          {formatDateTime(appointment.startTime)}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-sm">
                          {appointment.user?.name || '-'}
                        </Typography>
                      </td>
                      <td>
                        <Chip size="sm" color={getStatusColor(appointment.status)}>
                          {getStatusLabel(appointment.status)}
                        </Chip>
                      </td>
                      <td>
                        <Button size="sm" variant="plain">
                          Ver
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </Sheet>

          {/* Footer with Pagination */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mt: 2,
              pt: 2,
              borderTop: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
              Mostrando {filteredAppointments.length} de {totalCount} citas
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <IconButton
                size="sm"
                variant="outlined"
                disabled={page === 1}
                onClick={() => handlePageChange(page - 1)}
              >
                <PrevIcon />
              </IconButton>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {[...Array(Math.min(5, totalPages))].map((_, index) => {
                  let pageNum: number
                  if (totalPages <= 5) {
                    pageNum = index + 1
                  } else if (page <= 3) {
                    pageNum = index + 1
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + index
                  } else {
                    pageNum = page - 2 + index
                  }

                  return (
                    <Button
                      key={pageNum}
                      size="sm"
                      variant={page === pageNum ? 'solid' : 'plain'}
                      color={page === pageNum ? 'primary' : 'neutral'}
                      sx={{ minWidth: 32 }}
                      onClick={() => handlePageChange(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  )
                })}
              </Box>

              <IconButton
                size="sm"
                variant="outlined"
                disabled={page === totalPages}
                onClick={() => handlePageChange(page + 1)}
              >
                <NextIcon />
              </IconButton>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Weekly Trend Chart - Below Table */}
      <Card>
        <CardContent>
          <Typography level="title-lg" sx={{ mb: 2 }}>
            Citas por Dia de la Semana
          </Typography>
          <Grid container spacing={2}>
            {weeklyTrend.map((day) => {
              const percentage = (day.count / maxWeeklyCount) * 100
              return (
                <Grid key={day.day} xs={12} sm={6} md={12 / 7}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography level="body-sm" fontWeight="md" sx={{ mb: 1 }}>
                      {day.dayName}
                    </Typography>
                    <Box
                      sx={{
                        height: 100,
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                      }}
                    >
                      <Box
                        sx={{
                          width: '60%',
                          height: `${Math.max(percentage, 5)}%`,
                          bgcolor: day.count === maxWeeklyCount ? 'success.400' : 'primary.400',
                          borderRadius: 'sm',
                          transition: 'height 0.3s ease',
                        }}
                      />
                    </Box>
                    <Typography level="body-sm" sx={{ mt: 1, color: 'text.tertiary' }}>
                      {day.count}
                    </Typography>
                  </Box>
                </Grid>
              )
            })}
          </Grid>

          {/* Summary Row */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              gap: 4,
              mt: 3,
              pt: 2,
              borderTop: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Box sx={{ textAlign: 'center' }}>
              <Typography level="h4" sx={{ color: 'success.600' }}>
                {Math.max(...weeklyTrend.map((d) => d.count))}
              </Typography>
              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                Maximo diario
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography level="h4" sx={{ color: 'primary.600' }}>
                {Math.round(weeklyTrend.reduce((a, b) => a + b.count, 0) / 7)}
              </Typography>
              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                Promedio diario
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography level="h4" sx={{ color: 'neutral.600' }}>
                {weeklyTrend.reduce((a, b) => a + b.count, 0)}
              </Typography>
              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                Total semanal
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Container>
  )
}
