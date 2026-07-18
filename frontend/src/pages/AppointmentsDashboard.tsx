import { useState, useEffect, useMemo } from 'react'
// [Fase2·G] Migrado a Tailwind v4 + design system. Se conserva CircularProgress de
// MUI Joy (sin equivalente en el DS) según las reglas de migración.
import { CircularProgress } from '@mui/joy'
import {
  CalendarBlank,
  CalendarCheck,
  CalendarX,
  Clock,
  CheckCircle,
  XCircle,
  ArrowClockwise,
  MagnifyingGlass,
  CaretLeft,
  CaretRight,
} from '@phosphor-icons/react'
import { Avatar } from '@/components/ui/avatar'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
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

const formatDateForInput = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const columns: { label: string; width: string }[] = [
  { label: 'Cliente', width: 'w-[25%]' },
  { label: 'Servicio', width: 'w-[20%]' },
  { label: 'Fecha/Hora', width: 'w-[20%]' },
  { label: 'Usuario', width: 'w-[15%]' },
  { label: 'Estado', width: 'w-[10%]' },
  { label: 'Acciones', width: 'w-[10%]' },
]

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
          params: { date: formatDateForInput(new Date()) }
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

  const getStatusVariant = (status: string): BadgeProps['variant'] => {
    switch (status) {
      case 'confirmed':
        return 'primary'
      case 'completed':
        return 'success'
      case 'pending':
      case 'scheduled':
        return 'warning'
      case 'cancelled':
        return 'destructive'
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
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] p-5 sm:p-6 lg:p-8">
          <div className="flex min-h-[400px] items-center justify-center">
            <CircularProgress />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <CalendarBlank className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Dashboard de Citas
              </h1>
              <p className="text-sm text-muted-foreground">
                Metricas y estadisticas de agendamiento
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Actualizar"
            className="text-muted-foreground"
            onClick={fetchInitialData}
          >
            <ArrowClockwise className="size-5" aria-hidden />
          </Button>
        </div>

        {/* KPIs Grid - 5 cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            {
              label: 'Citas Totales',
              value: stats.total,
              icon: <CalendarBlank className="size-5" aria-hidden />,
              tile: 'bg-primary/12 text-primary',
            },
            {
              label: 'Programadas',
              value: stats.scheduled,
              icon: <Clock className="size-5" aria-hidden />,
              tile: 'bg-warning/16 text-warning-text',
            },
            {
              label: 'Atendidas',
              value: stats.completed,
              icon: <CheckCircle className="size-5" aria-hidden />,
              tile: 'bg-success/14 text-success-text',
            },
            {
              label: 'Canceladas',
              value: stats.cancelled,
              icon: <XCircle className="size-5" aria-hidden />,
              tile: 'bg-destructive/12 text-destructive-text',
            },
            {
              label: 'Confirmadas',
              value: stats.confirmed,
              icon: <CalendarCheck className="size-5" aria-hidden />,
              tile: 'bg-brand-cyan/15 text-[color:var(--brand-teal)] dark:text-brand-cyan',
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">{kpi.label}</p>
                  <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                    {kpi.value}
                  </p>
                </div>
                <span
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-md',
                    kpi.tile,
                  )}
                >
                  {kpi.icon}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Upcoming Blocks Carousel - Compact version */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-foreground">
              Proximos Horarios de Hoy
            </h2>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Horarios anteriores"
                onClick={handleCarouselPrev}
                disabled={carouselIndex === 0}
              >
                <CaretLeft className="size-4" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Horarios siguientes"
                onClick={handleCarouselNext}
                disabled={carouselIndex >= upcomingBlocks.length - 5}
              >
                <CaretRight className="size-4" aria-hidden />
              </Button>
            </div>
          </div>

          {upcomingBlocks.length === 0 ? (
            <div className="flex flex-col items-center gap-1 rounded-lg bg-muted/40 py-4 text-center">
              <CalendarX className="size-6 text-muted-foreground/50" aria-hidden />
              <p className="text-xs text-muted-foreground">No hay bloques para hoy</p>
            </div>
          ) : (
            <div className="flex gap-2 overflow-hidden">
              {visibleBlocks.map((block) => (
                <div
                  key={block.id}
                  className={cn(
                    'min-w-[140px] shrink-0 grow-0 basis-[calc(20%-6.4px)] rounded-lg border p-3 transition-colors',
                    block.isBooked
                      ? 'border-border bg-muted/50'
                      : 'border-success/30 bg-success/10',
                  )}
                >
                  <div className="mb-1 flex items-center gap-1.5">
                    <Clock
                      className={cn(
                        'size-3.5',
                        block.isBooked ? 'text-muted-foreground' : 'text-success-text',
                      )}
                      aria-hidden
                    />
                    <span
                      className={cn(
                        'text-sm font-medium',
                        block.isBooked ? 'text-foreground' : 'text-success-text',
                      )}
                    >
                      {formatTime(block.startTime)}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {block.userName || 'Sin asignar'}
                  </p>
                  <Badge
                    variant={block.isBooked ? 'neutral' : 'success'}
                    className="mt-1.5 text-[0.65rem]"
                  >
                    {block.isBooked ? 'Ocupado' : 'Disponible'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Appointments Table with Filters - Full Width */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Citas</h2>

          {/* Filters */}
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-6">
            <div className="relative col-span-2">
              <MagnifyingGlass
                className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                placeholder="Buscar..."
                aria-label="Buscar citas"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>

            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value)
                handleFilterChange()
              }}
            >
              <SelectTrigger aria-label="Filtrar por estado">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Estado</SelectItem>
                <SelectItem value="scheduled">Programadas</SelectItem>
                <SelectItem value="pending">Pendientes</SelectItem>
                <SelectItem value="confirmed">Confirmadas</SelectItem>
                <SelectItem value="completed">Atendidas</SelectItem>
                <SelectItem value="cancelled">Canceladas</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={userFilter}
              onValueChange={(value) => {
                setUserFilter(value)
                handleFilterChange()
              }}
            >
              <SelectTrigger aria-label="Filtrar por usuario">
                <SelectValue placeholder="Usuario" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Usuario</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={String(user.id)}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <input
              type="date"
              aria-label="Filtrar por fecha"
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value)
                handleFilterChange()
              }}
              className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />

            <Button
              variant="outline"
              size="sm"
              className="w-full"
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
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    {columns.map((c) => (
                      <th
                        key={c.label}
                        className={cn(
                          'whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                          c.width,
                        )}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredAppointments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10">
                        <div className="flex flex-col items-center gap-2 text-center">
                          <CalendarBlank
                            className="size-8 text-muted-foreground/40"
                            aria-hidden
                          />
                          <p className="text-sm text-muted-foreground">
                            No se encontraron citas
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredAppointments.map((appointment) => {
                      const displayName =
                        appointment.attendeeName || appointment.contact?.name || '-'
                      const picture =
                        appointment.contact?.urlPicture ||
                        appointment.contact?.profilePicUrl

                      return (
                        <tr
                          key={appointment.id}
                          className="transition-colors hover:bg-accent/40"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {picture ? (
                                <img
                                  src={picture}
                                  alt=""
                                  width={32}
                                  height={32}
                                  className="size-8 shrink-0 rounded-full object-cover"
                                />
                              ) : (
                                <Avatar name={displayName} size="sm" />
                              )}
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-foreground">
                                  {displayName}
                                </p>
                                {appointment.attendeePhone && (
                                  <p className="truncate text-xs tabular-nums text-muted-foreground">
                                    {appointment.attendeePhone}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              {appointment.service?.color && (
                                <span
                                  className="size-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: appointment.service.color }}
                                  aria-hidden
                                />
                              )}
                              <span className="text-foreground">
                                {appointment.service?.name || appointment.title}
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {formatDateTime(appointment.startTime)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {appointment.user?.name || '-'}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={getStatusVariant(appointment.status)}>
                              {getStatusLabel(appointment.status)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Button variant="ghost" size="sm">
                              Ver
                            </Button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer with Pagination */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">
              Mostrando {filteredAppointments.length} de {totalCount} citas
            </p>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="size-9"
                aria-label="Pagina anterior"
                disabled={page === 1}
                onClick={() => handlePageChange(page - 1)}
              >
                <CaretLeft className="size-4" aria-hidden />
              </Button>

              <div className="flex items-center gap-0.5">
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
                      variant={page === pageNum ? 'primary' : 'ghost'}
                      className="min-w-9 px-2 tabular-nums"
                      aria-label={`Pagina ${pageNum}`}
                      aria-current={page === pageNum ? 'page' : undefined}
                      onClick={() => handlePageChange(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  )
                })}
              </div>

              <Button
                variant="outline"
                size="icon"
                className="size-9"
                aria-label="Pagina siguiente"
                disabled={page === totalPages}
                onClick={() => handlePageChange(page + 1)}
              >
                <CaretRight className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
        </div>

        {/* Weekly Trend Chart - Below Table */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            Citas por Dia de la Semana
          </h2>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
            {weeklyTrend.map((day) => {
              const percentage = (day.count / maxWeeklyCount) * 100
              return (
                <div key={day.day} className="text-center">
                  <p className="mb-2 text-sm font-medium text-foreground">
                    {day.dayName}
                  </p>
                  <div className="flex h-[100px] items-end justify-center">
                    <div
                      className={cn(
                        'w-3/5 rounded-md transition-[height] duration-300',
                        day.count === maxWeeklyCount ? 'bg-success' : 'bg-primary',
                      )}
                      style={{ height: `${Math.max(percentage, 5)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-sm tabular-nums text-muted-foreground">
                    {day.count}
                  </p>
                </div>
              )
            })}
          </div>

          {/* Summary Row */}
          <div className="mt-6 flex flex-wrap justify-center gap-8 border-t border-border pt-4">
            <div className="text-center">
              <p className="text-xl font-semibold tabular-nums text-success-text">
                {Math.max(...weeklyTrend.map((d) => d.count))}
              </p>
              <p className="text-xs text-muted-foreground">Maximo diario</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-semibold tabular-nums text-primary">
                {Math.round(weeklyTrend.reduce((a, b) => a + b.count, 0) / 7)}
              </p>
              <p className="text-xs text-muted-foreground">Promedio diario</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-semibold tabular-nums text-foreground">
                {weeklyTrend.reduce((a, b) => a + b.count, 0)}
              </p>
              <p className="text-xs text-muted-foreground">Total semanal</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
