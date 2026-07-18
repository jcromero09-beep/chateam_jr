import { useState, useEffect, type ReactNode } from 'react'
import api from '../services/api'
// [migración G] Progreso indeterminado: se conserva MUI Joy (no hay equivalente en el DS).
import { LinearProgress } from '@mui/joy'
import {
  CalendarBlank,
  Plus,
  PencilSimple,
  Trash,
  Eye,
  CalendarDots,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Phone,
  MapPin,
  VideoCamera,
  Robot,
  PaperPlaneTilt,
  BellRinging,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

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

const columns = [
  'Cliente',
  'Servicio',
  'Fecha & Hora',
  'Tipo',
  'Estado',
  'Asignado a',
  '',
]

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'destructive'

// [a11y] El texto de estado usa los tokens *-text (no los de superficie).
const valueTone: Record<Tone, string> = {
  neutral: 'text-foreground',
  primary: 'text-primary',
  success: 'text-success-text',
  warning: 'text-warning-text',
  destructive: 'text-destructive-text',
}

/** Tarjeta de métrica con badge de apoyo (mismo look que StatTile del DS). */
function StatCard({
  label,
  value,
  tone = 'neutral',
  children,
}: {
  label: string
  value: string
  tone?: Tone
  children: ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1.5 text-3xl font-semibold tracking-tight tabular-nums',
          valueTone[tone],
        )}
      >
        {value}
      </p>
      <div className="mt-2.5">{children}</div>
    </div>
  )
}

/** Botón de acción de fila (patrón RowAction + onClick, igual que Connections). */
function ActionBtn({
  label,
  onClick,
  className,
  children,
}: {
  label: string
  onClick?: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <Tooltip title={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={cn(
          'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
          className,
        )}
      >
        {children}
      </button>
    </Tooltip>
  )
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

  const getStatusColor = (status: string): BadgeProps['variant'] => {
    switch (status) {
      case 'scheduled':
        return 'warning'
      case 'confirmed':
        return 'success'
      case 'pending':
        return 'warning'
      case 'completed':
        return 'primary'
      case 'cancelled':
        return 'destructive'
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
      case 'completed':
        return 'Completada'
      case 'rescheduled':
        return 'Reprogramada'
      case 'cancelled':
        return 'Cancelada'
      case 'no-show':
        return 'No asistió'
      default:
        return status
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'presencial':
        return <MapPin className="size-3.5" aria-hidden />
      case 'virtual':
        return <VideoCamera className="size-3.5" aria-hidden />
      case 'telefonica':
        return <Phone className="size-3.5" aria-hidden />
      default:
        return <CalendarDots className="size-3.5" aria-hidden />
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
    <TooltipProvider>
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
                  Gestión de Citas
                </h1>
                <p className="text-sm text-muted-foreground">
                  Agendamiento multicanal con IA (Google Calendar / Outlook sync)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <Robot className="size-4" aria-hidden />
                Sugerir Horarios IA
              </Button>
              <Button size="sm" onClick={() => setOpenModal(true)}>
                <Plus className="size-4" weight="bold" aria-hidden />
                Nueva Cita
              </Button>
            </div>
          </div>

          {loading && <LinearProgress />}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Total Citas" value={String(stats.total)}>
              <Badge variant="neutral">Hoy: {stats.today}</Badge>
            </StatCard>

            <StatCard label="Confirmadas" value={String(stats.confirmed)} tone="success">
              <Badge variant="success">
                <CheckCircle className="size-3.5" aria-hidden />
                Activas
              </Badge>
            </StatCard>

            <StatCard label="Pendientes" value={String(stats.pending)} tone="warning">
              <Badge variant="warning">
                <Clock className="size-3.5" aria-hidden />
                Por confirmar
              </Badge>
            </StatCard>

            <StatCard label="Completadas" value={String(stats.completed)} tone="primary">
              <Badge variant="primary">Finalizadas</Badge>
            </StatCard>

            <StatCard label="Canceladas" value={String(stats.cancelled)} tone="destructive">
              <Badge variant="destructive">
                <XCircle className="size-3.5" aria-hidden />
                No asistió
              </Badge>
            </StatCard>
          </div>

          {/* Tabs */}
          <Tabs
            value={String(selectedTab)}
            onValueChange={(value) => setSelectedTab(Number(value))}
          >
            <TabsList>
              <TabsTrigger value="0">
                <CalendarDots className="size-4" aria-hidden />
                Lista de Citas
              </TabsTrigger>
              <TabsTrigger value="1">
                <User className="size-4" aria-hidden />
                Servicios ({services.length})
              </TabsTrigger>
              <TabsTrigger value="2">
                <BellRinging className="size-4" aria-hidden />
                Recordatorios
              </TabsTrigger>
            </TabsList>

            {/* Lista de Citas */}
            <TabsContent value="0" className="space-y-4">
              {/* Filtros */}
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/[0.02]">
                <div className="w-[180px]">
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger aria-label="Filtrar por estado">
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los estados</SelectItem>
                      <SelectItem value="confirmed">Confirmadas</SelectItem>
                      <SelectItem value="pending">Pendientes</SelectItem>
                      <SelectItem value="completed">Completadas</SelectItem>
                      <SelectItem value="cancelled">Canceladas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-[180px]">
                  <Select value={filterDate} onValueChange={setFilterDate}>
                    <SelectTrigger aria-label="Filtrar por fecha">
                      <SelectValue placeholder="Fecha" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las fechas</SelectItem>
                      <SelectItem value="today">Hoy</SelectItem>
                      <SelectItem value="week">Esta semana</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Tabla */}
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left">
                        {columns.map((c, i) => (
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
                      {filteredAppointments.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-4 py-10 text-center text-muted-foreground"
                          >
                            {appointments.length === 0
                              ? 'No hay citas programadas. Crea tu primera cita para comenzar.'
                              : 'No hay citas con los filtros aplicados.'}
                          </td>
                        </tr>
                      ) : (
                        filteredAppointments.map((appointment) => (
                          <tr
                            key={appointment.id}
                            className="transition-colors hover:bg-accent/40"
                          >
                            <td className="px-4 py-3">
                              <span className="block font-medium text-foreground">
                                {appointment.client.name}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {appointment.client.phone}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-foreground">
                              {appointment.service}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <span className="block text-foreground">
                                {new Date(appointment.date).toLocaleDateString('es-ES')}
                              </span>
                              <span className="block text-xs tabular-nums text-muted-foreground">
                                {appointment.time} ({appointment.duration} min)
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="neutral">
                                {getTypeIcon(appointment.type)}
                                {getTypeLabel(appointment.type)}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={getStatusColor(appointment.status)}>
                                {getStatusLabel(appointment.status)}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {appointment.assignedTo}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-0.5">
                                <ActionBtn
                                  label="Ver detalles"
                                  className="hover:bg-primary/10 hover:text-primary"
                                >
                                  <Eye className="size-[18px]" aria-hidden />
                                </ActionBtn>
                                <ActionBtn label="Editar">
                                  <PencilSimple className="size-[18px]" aria-hidden />
                                </ActionBtn>
                                <ActionBtn
                                  label="Enviar recordatorio"
                                  onClick={() => sendReminder(appointment.id)}
                                  className="hover:bg-success/10 hover:text-success-text"
                                >
                                  <PaperPlaneTilt className="size-[18px]" aria-hidden />
                                </ActionBtn>
                                <ActionBtn
                                  label="Eliminar"
                                  onClick={() => deleteAppointment(appointment.id)}
                                  className="hover:bg-destructive/10 hover:text-destructive-text"
                                >
                                  <Trash className="size-[18px]" aria-hidden />
                                </ActionBtn>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            {/* Servicios */}
            <TabsContent value="1">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {services.map((service) => (
                  <div
                    key={service.id}
                    className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]"
                  >
                    <span
                      className="flex size-10 items-center justify-center rounded-md ring-1 ring-inset ring-black/10"
                      style={{ backgroundColor: service.color }}
                      aria-hidden
                    >
                      <CalendarDots className="size-5 text-white" weight="fill" />
                    </span>
                    <p className="font-medium text-foreground">{service.name}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="neutral">{service.duration} min</Badge>
                      <Badge variant="success">${service.price}</Badge>
                    </div>
                    <div className="mt-auto flex items-center gap-2 pt-1">
                      <Button variant="outline" size="sm" className="flex-1">
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-destructive/40 text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
                      >
                        Eliminar
                      </Button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  className="flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card text-muted-foreground transition-colors hover:bg-accent/40 hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="size-10 opacity-40" aria-hidden />
                  <span className="text-sm">Agregar Servicio</span>
                </button>
              </div>
            </TabsContent>

            {/* Recordatorios */}
            <TabsContent value="2">
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
                <h2 className="font-medium text-foreground">
                  Configuración de Recordatorios
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Los recordatorios se envían automáticamente 24 horas antes de la cita.
                </p>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Badge variant="success">WhatsApp</Badge>
                    <span className="text-sm text-muted-foreground">
                      Activado para todas las citas
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="primary">Email</Badge>
                    <span className="text-sm text-muted-foreground">
                      Activado para todas las citas
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="warning">SMS</Badge>
                    <span className="text-sm text-muted-foreground">Opcional por cita</span>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Modal Nueva Cita */}
        <Dialog open={openModal} onOpenChange={setOpenModal}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Nueva Cita</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="appt-client">Cliente</Label>
                <Input id="appt-client" placeholder="Buscar o crear cliente..." />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="appt-service">Servicio</Label>
                  <Select>
                    <SelectTrigger id="appt-service" className="h-11">
                      <SelectValue placeholder="Selecciona un servicio" />
                    </SelectTrigger>
                    <SelectContent>
                      {services.length === 0 ? (
                        <SelectItem value="__none" disabled>
                          Configura servicios primero en la sección de configuración.
                        </SelectItem>
                      ) : (
                        services.map((service) => (
                          <SelectItem key={service.id} value={service.id.toString()}>
                            {service.name} ({service.duration} min)
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="appt-assignee">Asignar a</Label>
                  <Select defaultValue="1">
                    <SelectTrigger id="appt-assignee" className="h-11">
                      <SelectValue placeholder="Selecciona responsable" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Dr. García</SelectItem>
                      <SelectItem value="2">Lic. Martínez</SelectItem>
                      <SelectItem value="3">Ing. López</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="appt-date">Fecha</Label>
                  <Input id="appt-date" type="date" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="appt-time">Hora</Label>
                  <Input id="appt-time" type="time" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="appt-type">Tipo de Cita</Label>
                <Select defaultValue="presencial">
                  <SelectTrigger id="appt-type" className="h-11">
                    <SelectValue placeholder="Selecciona el tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="presencial">Presencial</SelectItem>
                    <SelectItem value="virtual">Virtual</SelectItem>
                    <SelectItem value="telefonica">Telefónica</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="appt-notes">Notas (opcional)</Label>
                <textarea
                  id="appt-notes"
                  rows={3}
                  placeholder="Agregar notas sobre la cita..."
                  className="w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row">
                <Button variant="outline" className="flex-1">
                  <Robot className="size-4" aria-hidden />
                  Sugerir Horario IA
                </Button>
                <Button className="flex-1">
                  <Plus className="size-4" weight="bold" aria-hidden />
                  Crear Cita
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
