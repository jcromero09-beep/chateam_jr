import { useState, useEffect } from 'react'
import {
  CalendarBlank,
  ArrowClockwise,
  Plus,
  CaretLeft,
  CaretRight,
  CalendarCheck,
  CalendarDot,
  Clock,
  User,
  ClockCounterClockwise,
  XCircle,
  GoogleLogo,
  Sparkle,
  CircleNotch,
  X,
} from '@phosphor-icons/react'
import { toast } from 'react-toastify'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatTile } from '@/components/ui/stat-tile'
import { RowAction } from '@/components/ui/row-action'
import { cn } from '@/lib/utils'
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

type StatusVariant = 'success' | 'warning' | 'primary' | 'destructive' | 'neutral'

const statusConfig: Record<string, { variant: StatusVariant; label: string }> = {
  confirmed: { variant: 'success', label: 'Confirmada' },
  pending: { variant: 'warning', label: 'Pendiente' },
  completed: { variant: 'primary', label: 'Completada' },
  cancelled: { variant: 'destructive', label: 'Cancelada' },
  rescheduled: { variant: 'neutral', label: 'Reagendada' },
}

const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const dayColumns = ['Hora', 'Servicio', 'Cliente', 'Asignado a', 'Estado', '']

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

  const getStatusBadge = (status: string) => {
    const config = statusConfig[status] || { variant: 'neutral' as StatusVariant, label: status }
    return <Badge variant={config.variant} dot>{config.label}</Badge>
  }

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  }

  // Stats derivadas de datos reales
  const totalMonthAppointments = appointmentDates.reduce((sum, d) => sum + (d.count || 0), 0)
  const daysWithAppointments = appointmentDates.length
  const now = new Date()
  const todayCount =
    currentDate.getMonth() === now.getMonth() && currentDate.getFullYear() === now.getFullYear()
      ? getAppointmentCountForDay(now.getDate())
      : 0

  const renderMonthView = () => {
    const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentDate)
    const cells: React.ReactNode[] = []

    // Celdas vacías antes del primer día
    for (let i = 0; i < startingDayOfWeek; i++) {
      cells.push(
        <div
          key={`empty-${i}`}
          className="min-h-[72px] border border-border bg-muted/30 sm:min-h-[92px]"
          aria-hidden
        />
      )
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const appointmentCount = getAppointmentCountForDay(day)
      const hasAppointments = appointmentCount > 0
      const isToday =
        day === now.getDate() &&
        currentDate.getMonth() === now.getMonth() &&
        currentDate.getFullYear() === now.getFullYear()

      cells.push(
        <button
          key={day}
          type="button"
          onClick={() => handleDayClick(day)}
          disabled={!hasAppointments}
          aria-label={`Día ${day}${hasAppointments ? `, ${appointmentCount} cita(s)` : ''}`}
          className={cn(
            'flex min-h-[72px] flex-col items-center gap-1.5 border p-1.5 text-left transition-colors sm:min-h-[92px] sm:p-2',
            hasAppointments
              ? 'cursor-pointer border-brand-teal/30 bg-brand-teal/[0.06] hover:bg-brand-teal/[0.12]'
              : 'cursor-default border-border bg-card hover:bg-accent/40',
          )}
        >
          <span
            className={cn(
              'flex size-7 items-center justify-center rounded-full text-sm tabular-nums',
              isToday
                ? 'bg-primary font-semibold text-primary-foreground'
                : hasAppointments
                  ? 'font-medium text-brand-teal'
                  : 'text-foreground',
            )}
          >
            {day}
          </span>
          {hasAppointments && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-teal px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">
              <CalendarDot className="size-3" weight="fill" aria-hidden />
              {appointmentCount}
            </span>
          )}
        </button>
      )
    }

    return (
      <div>
        <div className="grid grid-cols-7">
          {weekDays.map((wd) => (
            <div
              key={wd}
              className="border-b-2 border-border bg-muted/40 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {wd}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">{cells}</div>
        {loadingDates && (
          <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
            <CircleNotch className="size-4 animate-spin" aria-hidden />
            Cargando citas...
          </div>
        )}
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
                Calendario de Citas
              </h1>
              <p className="text-sm text-muted-foreground">
                Haz clic en los días con citas para ver detalles
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar"
              className="text-muted-foreground"
              onClick={fetchAppointmentDates}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            {googleConnected ? (
              <Button
                variant="whatsapp"
                size="sm"
                onClick={handleDisconnectGoogle}
                title={`Conectado: ${googleCalendarName || 'Google Calendar'}`}
              >
                <GoogleLogo className="size-4" weight="bold" aria-hidden />
                {googleCalendarName ? `Google: ${googleCalendarName}` : 'Google Calendar'}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleConnectGoogle}
                disabled={loadingGoogleSync}
              >
                {loadingGoogleSync ? (
                  <CircleNotch className="size-4 animate-spin" aria-hidden />
                ) : (
                  <GoogleLogo className="size-4" weight="bold" aria-hidden />
                )}
                Conectar Google Calendar
              </Button>
            )}
            <Button variant="outline" size="sm">
              <Sparkle className="size-4" aria-hidden />
              Sugerir Horarios
            </Button>
            <Button size="sm" onClick={() => setOpenNewModal(true)}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nueva Cita
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatTile label="Citas este mes" value={String(totalMonthAppointments)} tone="primary" />
          <StatTile label="Días con citas" value={String(daysWithAppointments)} />
          <StatTile label="Hoy" value={String(todayCount)} tone={todayCount > 0 ? 'success' : 'neutral'} />
        </div>

        {/* Calendar card */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" aria-label="Mes anterior" onClick={handlePrevMonth}>
                <CaretLeft className="size-5" aria-hidden />
              </Button>
              <span className="min-w-[160px] text-center text-lg font-semibold capitalize text-foreground">
                {currentDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
              </span>
              <Button variant="ghost" size="icon" aria-label="Mes siguiente" onClick={handleNextMonth}>
                <CaretRight className="size-5" aria-hidden />
              </Button>
              <Button variant="outline" size="sm" onClick={handleToday}>
                <CalendarCheck className="size-4" aria-hidden />
                Hoy
              </Button>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant={view === 'month' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setView('month')}
              >
                Mes
              </Button>
              <Button
                variant={view === 'week' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setView('week')}
              >
                Semana
              </Button>
            </div>
          </div>

          {/* Calendar body */}
          <div className="p-3 sm:p-4">
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                {view === 'month' && renderMonthView()}
                {view === 'week' && (
                  <div className="py-16 text-center text-muted-foreground">
                    Vista semanal - Próximamente
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Day Appointments Modal */}
      {openDayModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenDayModal(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border p-5">
              <div className="flex items-center gap-2">
                <CalendarBlank className="size-5 text-brand-teal" weight="fill" aria-hidden />
                <h2 className="text-lg font-semibold capitalize text-foreground">
                  Citas del{' '}
                  {selectedDay?.toLocaleDateString('es-ES', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </h2>
              </div>
              <RowAction label="Cerrar">
                <button
                  type="button"
                  aria-label="Cerrar"
                  onClick={() => setOpenDayModal(false)}
                  className="flex size-full items-center justify-center"
                >
                  <X className="size-[18px]" aria-hidden />
                </button>
              </RowAction>
            </div>

            <div className="overflow-y-auto">
              {loadingDayAppointments ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                  <CircleNotch className="size-5 animate-spin" aria-hidden />
                  Cargando citas...
                </div>
              ) : dayAppointments.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  No hay citas para este día
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left">
                        {dayColumns.map((c, i) => (
                          <th
                            key={i}
                            className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                          >
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {dayAppointments.map((apt) => {
                        const isLocked = apt.status === 'cancelled' || apt.status === 'completed'
                        return (
                          <tr key={apt.id} className="transition-colors hover:bg-accent/40">
                            <td className="whitespace-nowrap px-4 py-3">
                              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                                <Clock className="size-4 text-muted-foreground" aria-hidden />
                                {formatTime(apt.startTime)} - {formatTime(apt.endTime)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-foreground">
                              {apt.service?.name || apt.title}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                              <span className="inline-flex items-center gap-1.5">
                                <User className="size-4" aria-hidden />
                                {apt.contact?.name || 'Sin cliente'}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                              {apt.assignedUser?.name || '-'}
                            </td>
                            <td className="px-4 py-3">{getStatusBadge(apt.status)}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-0.5">
                                <button
                                  type="button"
                                  aria-label="Reagendar"
                                  title="Reagendar"
                                  onClick={() => handleOpenReschedule(apt)}
                                  disabled={isLocked}
                                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <ClockCounterClockwise className="size-[18px]" aria-hidden />
                                </button>
                                <button
                                  type="button"
                                  aria-label="Cancelar"
                                  title="Cancelar"
                                  onClick={() => handleCancelAppointment(apt.id)}
                                  disabled={isLocked}
                                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive-text disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <XCircle className="size-[18px]" aria-hidden />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
    </div>
  )
}
