import { useState, useEffect } from 'react'
// [Fase2·G] Conservado como MUI a propósito: no hay equivalente Radix para el
// indicador de progreso circular en el design system.
import { CircularProgress } from '@mui/joy'
import {
  CalendarCheck,
  MagnifyingGlass,
  FunnelSimple,
  DownloadSimple,
  Plus,
  PencilSimple,
  Trash,
  CheckCircle,
  Clock,
  Phone,
  Envelope,
  WhatsappLogo,
  Eye,
} from '@phosphor-icons/react'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
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

const columns = ['Cliente', 'Servicio', 'Agente', 'Fecha/Hora', 'Estado', 'Precio', 'Acciones']

// Botón de acción de fila (mismo look que RowAction del prototipo, con onClick)
function ActionBtn({
  label,
  onClick,
  className,
  children,
}: {
  label: string
  onClick: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
        className,
      )}
    >
      {children}
    </button>
  )
}

// Campo de solo lectura del modal de detalle
function DetailField({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn('text-sm text-foreground', strong && 'font-medium')}>{value}</p>
    </div>
  )
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

  const getStatusColor = (status: string): BadgeProps['variant'] => {
    switch (status) {
      case 'scheduled':
        return 'warning'
      case 'confirmed':
        return 'success'
      case 'pending':
        return 'warning'
      case 'cancelled':
        return 'destructive'
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
      case 'scheduled':
        return 'Programada'
      case 'confirmed':
        return 'Confirmada'
      case 'pending':
        return 'Pendiente'
      case 'cancelled':
        return 'Cancelada'
      case 'completed':
        return 'Completada'
      case 'rescheduled':
        return 'Reprogramada'
      case 'no-show':
        return 'No asistió'
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
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <CalendarCheck className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Gestión de Reservas
              </h1>
              <p className="text-sm text-muted-foreground">
                Administra todas las citas agendadas
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <DownloadSimple className="size-4" aria-hidden />
              Exportar
            </Button>
            <Button size="sm" onClick={() => setOpenNewModal(true)}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nueva Cita
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Total" value={String(stats.total)} />
          <StatTile label="Confirmadas" value={String(stats.confirmed)} tone="success" />
          <StatTile label="Programadas" value={String(stats.scheduled)} tone="warning" />
          <StatTile label="Completadas" value={String(stats.completed)} tone="primary" />
          <StatTile label="Canceladas" value={String(stats.cancelled)} tone="destructive" />
          <StatTile label="No Show" value={String(stats.noShow)} />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[280px] flex-1">
            <MagnifyingGlass
              className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              placeholder="Buscar por nombre, email o servicio..."
              aria-label="Buscar reservas"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 w-[190px]" aria-label="Filtrar por estado">
              <span className="flex items-center gap-2 truncate">
                <FunnelSimple className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="scheduled">Programadas</SelectItem>
              <SelectItem value="confirmed">Confirmadas</SelectItem>
              <SelectItem value="pending">Pendientes</SelectItem>
              <SelectItem value="completed">Completadas</SelectItem>
              <SelectItem value="cancelled">Canceladas</SelectItem>
              <SelectItem value="no-show">No Show</SelectItem>
            </SelectContent>
          </Select>

          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="h-10 w-[180px]" aria-label="Filtrar por fecha">
              <span className="flex items-center gap-2 truncate">
                <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las fechas</SelectItem>
              <SelectItem value="today">Hoy</SelectItem>
              <SelectItem value="upcoming">Próximas</SelectItem>
              <SelectItem value="past">Pasadas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Bookings Table */}
          <div className="lg:col-span-2">
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left">
                      {columns.map((c, i) => (
                        <th
                          key={i}
                          className={cn(
                            'whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                            i === columns.length - 1 && 'w-[180px] text-right',
                          )}
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center">
                          <div className="flex items-center justify-center">
                            <CircularProgress />
                          </div>
                        </td>
                      </tr>
                    ) : filteredBookings.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                          No se encontraron reservas
                        </td>
                      </tr>
                    ) : (
                      filteredBookings.map((appointment) => {
                        const clientName =
                          appointment.attendeeName || appointment.contact?.name || 'Sin nombre'
                        const simultaneous =
                          simultaneousCounts[new Date(appointment.startTime).toISOString()]
                        return (
                          <tr key={appointment.id} className="transition-colors hover:bg-accent/40">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Avatar name={clientName} size="sm" />
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-foreground">
                                    {clientName}
                                  </p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {appointment.attendeePhone || appointment.contact?.phone || 'Sin teléfono'}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {appointment.service?.name || 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {appointment.assignedUser?.name || 'N/A'}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div>
                                  <p className="whitespace-nowrap text-foreground">
                                    {new Date(appointment.startTime).toLocaleDateString('es-ES', {
                                      day: '2-digit',
                                      month: 'short',
                                    })}
                                  </p>
                                  <p className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                                    {new Date(appointment.startTime).toLocaleTimeString('es-ES', {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })} ({appointment.duration}min)
                                  </p>
                                </div>
                                {simultaneous > 1 && (
                                  <Badge
                                    variant="warning"
                                    title={`${simultaneous} citas simultáneas`}
                                  >
                                    {simultaneous}
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={getStatusColor(appointment.status)} dot>
                                {getStatusLabel(appointment.status)}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 font-medium tabular-nums text-foreground">
                              ${appointment.service?.price || 0}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-0.5">
                                <ActionBtn
                                  label="Ver detalles"
                                  onClick={() => handleViewBooking(appointment)}
                                  className="hover:bg-primary/10 hover:text-primary"
                                >
                                  <Eye className="size-[18px]" aria-hidden />
                                </ActionBtn>
                                <ActionBtn label="Editar" onClick={() => handleEditBooking(appointment)}>
                                  <PencilSimple className="size-[18px]" aria-hidden />
                                </ActionBtn>
                                {appointment.status === 'scheduled' && (
                                  <ActionBtn
                                    label="Confirmar cita"
                                    onClick={() => handleStatusChange(appointment.id, 'confirmed')}
                                    className="text-success-text hover:bg-success/10 hover:text-success-text"
                                  >
                                    <CheckCircle className="size-[18px]" aria-hidden />
                                  </ActionBtn>
                                )}
                                <ActionBtn
                                  label="Eliminar"
                                  onClick={() => handleDeleteBooking(appointment.id)}
                                  className="hover:bg-destructive/10 hover:text-destructive-text"
                                >
                                  <Trash className="size-[18px]" aria-hidden />
                                </ActionBtn>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Upcoming Bookings Sidebar */}
          <div>
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <h2 className="mb-4 text-base font-semibold text-foreground">Próximas Citas</h2>
              <div className="flex flex-col gap-3">
                {upcomingBookings.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No hay citas próximas
                  </p>
                ) : (
                  upcomingBookings.slice(0, 5).map((appointment) => {
                    const clientName =
                      appointment.attendeeName || appointment.contact?.name || 'Sin nombre'
                    return (
                      <div
                        key={appointment.id}
                        className="rounded-lg border border-border p-3 transition-colors hover:bg-accent/40"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <Avatar name={clientName} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {clientName}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {appointment.service?.name || 'N/A'}
                            </p>
                          </div>
                        </div>
                        <div className="my-2 border-t border-border" />
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {new Date(appointment.startTime).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} {new Date(appointment.startTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <Badge variant={getStatusColor(appointment.status)}>
                            {getStatusLabel(appointment.status)}
                          </Badge>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* View Booking Modal */}
      <Dialog open={openViewModal} onOpenChange={setOpenViewModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalles de la Cita</DialogTitle>
          </DialogHeader>

          {selectedAppointment && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Avatar
                  name={selectedAppointment.attendeeName || selectedAppointment.contact?.name || 'Sin nombre'}
                  size="lg"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-foreground">
                    {selectedAppointment.attendeeName || selectedAppointment.contact?.name || 'Sin nombre'}
                  </p>
                  <Badge variant={getStatusColor(selectedAppointment.status)} dot className="mt-1">
                    {getStatusLabel(selectedAppointment.status)}
                  </Badge>
                </div>
              </div>

              <div className="border-t border-border" />

              <div className="grid grid-cols-2 gap-4">
                <DetailField
                  label="Email"
                  value={selectedAppointment.attendeeEmail || selectedAppointment.contact?.email || 'N/A'}
                />
                <DetailField
                  label="Teléfono"
                  value={selectedAppointment.attendeePhone || selectedAppointment.contact?.phone || 'N/A'}
                />
                <DetailField label="Servicio" value={selectedAppointment.service?.name || 'N/A'} />
                <DetailField label="Agente" value={selectedAppointment.assignedUser?.name || 'N/A'} />
                <DetailField
                  label="Fecha"
                  value={new Date(selectedAppointment.startTime).toLocaleDateString('es-ES', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                />
                <DetailField
                  label="Hora"
                  value={`${new Date(selectedAppointment.startTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} (${selectedAppointment.duration} min)`}
                />
                <DetailField
                  label="Precio"
                  value={`$${selectedAppointment.service?.price || 0}`}
                  strong
                />
                <DetailField
                  label="Creada"
                  value={new Date(selectedAppointment.createdAt).toLocaleDateString('es-ES')}
                />
              </div>

              <div className="border-t border-border" />

              <div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">Notas</h3>

                {/* Notas públicas */}
                <div className="mb-3 rounded-lg bg-muted/50 p-3">
                  <p className="mb-1 text-sm font-medium text-primary">📝 Notas públicas</p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {selectedAppointment.notes || 'Sin notas públicas'}
                  </p>
                </div>

                {/* Notas internas */}
                {selectedAppointment.internalNotes && (
                  <div className="rounded-lg bg-warning/12 p-3">
                    <p className="mb-1 text-sm font-medium text-warning-text">
                      🔒 Notas internas (privadas)
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-foreground">
                      {selectedAppointment.internalNotes}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={selectedAppointment.confirmationSent ? 'success' : 'outline'}>
                  {selectedAppointment.confirmationSent ? 'Confirmación enviada' : 'Sin confirmar'}
                </Badge>
                <Badge variant={selectedAppointment.reminderSent ? 'success' : 'outline'}>
                  {selectedAppointment.reminderSent ? 'Recordatorio enviado' : 'Sin recordatorio'}
                </Badge>
              </div>

              {/* Historial de Cambios */}
              {appointmentHistory && appointmentHistory.timeline && appointmentHistory.timeline.length > 0 && (
                <>
                  <div className="border-t border-border" />
                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-foreground">
                      📅 Historial de Cambios
                    </h3>

                    <div className="flex flex-col gap-2">
                      {appointmentHistory.timeline.map((event: any, idx: number) => {
                        const eventVariants: { [key: string]: BadgeProps['variant'] } = {
                          created: 'primary',
                          confirmed: 'success',
                          rescheduled: 'warning',
                          cancelled: 'destructive',
                          completed: 'primary'
                        };

                        const eventDots: { [key: string]: string } = {
                          created: 'bg-primary',
                          confirmed: 'bg-success',
                          rescheduled: 'bg-warning',
                          cancelled: 'bg-destructive',
                          completed: 'bg-primary'
                        };

                        const eventLabels: { [key: string]: string } = {
                          created: 'Creada',
                          confirmed: 'Confirmada',
                          rescheduled: 'Reagendada',
                          cancelled: 'Cancelada',
                          completed: 'Completada'
                        };

                        return (
                          <div
                            key={idx}
                            className="flex items-start gap-3 rounded-lg border border-border p-3"
                          >
                            <span
                              className={cn(
                                'mt-1.5 size-2 shrink-0 rounded-full',
                                eventDots[event.type] || 'bg-muted-foreground',
                              )}
                              aria-hidden
                            />

                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-foreground">
                                {event.details}
                              </p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {new Date(event.timestamp).toLocaleString('es-ES', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                            </div>

                            <Badge variant={eventVariants[event.type] || 'neutral'}>
                              {eventLabels[event.type] || event.type}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* Loading state para historial */}
              {appointmentHistory === null && (
                <>
                  <div className="border-t border-border" />
                  <div className="flex items-center justify-center gap-3 py-2">
                    <CircularProgress size="sm" />
                    <span className="text-sm text-muted-foreground">Cargando historial...</span>
                  </div>
                </>
              )}

              <div className="border-t border-border" />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSendReminder(selectedAppointment.id, 'whatsapp')}
                  >
                    <WhatsappLogo className="size-4" weight="fill" aria-hidden />
                    WhatsApp
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSendReminder(selectedAppointment.id, 'email')}
                  >
                    <Envelope className="size-4" aria-hidden />
                    Email
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSendReminder(selectedAppointment.id, 'sms')}
                  >
                    <Phone className="size-4" aria-hidden />
                    SMS
                  </Button>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setOpenViewModal(false)}>
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
    </div>
  )
}
