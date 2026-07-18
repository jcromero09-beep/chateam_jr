import { useState, useEffect } from 'react'
import { CircularProgress } from '@mui/joy'
import {
  Plus,
  Trash,
  Copy,
  Clock,
  CalendarX,
  CalendarBlank,
  FloppyDisk,
} from '@phosphor-icons/react'
import { toast } from 'react-toastify'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import api from '../services/api'
import appointmentService, { AppointmentServiceType } from '../services/appointmentService'

interface TimeSlot {
  start: string
  end: string
  enabled: boolean
}

interface DaySchedule {
  dayOfWeek: number
  dayName: string
  enabled: boolean
  slots: TimeSlot[]
}

interface Exception {
  id: number
  title: string
  startTime: string
  endTime: string
  reason: string
  isRecurring: boolean
}

interface User {
  id: number
  name: string
  email: string
  profile?: string
}

const inputClass =
  'h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-55'

/** Switch accesible (role=switch) con tokens del design system. */
function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: () => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-0 p-0 outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-55',
        checked ? 'bg-primary' : 'bg-input',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none block size-5 rounded-full bg-card shadow-sm transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

/** Botón de acción de fila con onClick (mismo look que RowAction). */
function ActionBtn({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex size-8 items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  )
}

const defaultDaySchedule: DaySchedule[] = [
  {
    dayOfWeek: 1,
    dayName: 'Lunes',
    enabled: true,
    slots: [
      { start: '09:00', end: '13:00', enabled: true },
      { start: '14:00', end: '18:00', enabled: true },
    ],
  },
  {
    dayOfWeek: 2,
    dayName: 'Martes',
    enabled: true,
    slots: [
      { start: '09:00', end: '13:00', enabled: true },
      { start: '14:00', end: '18:00', enabled: true },
    ],
  },
  {
    dayOfWeek: 3,
    dayName: 'Miércoles',
    enabled: true,
    slots: [
      { start: '09:00', end: '13:00', enabled: true },
      { start: '14:00', end: '18:00', enabled: true },
    ],
  },
  {
    dayOfWeek: 4,
    dayName: 'Jueves',
    enabled: true,
    slots: [
      { start: '09:00', end: '13:00', enabled: true },
      { start: '14:00', end: '18:00', enabled: true },
    ],
  },
  {
    dayOfWeek: 5,
    dayName: 'Viernes',
    enabled: true,
    slots: [
      { start: '09:00', end: '13:00', enabled: true },
      { start: '14:00', end: '17:00', enabled: true },
    ],
  },
  {
    dayOfWeek: 6,
    dayName: 'Sábado',
    enabled: true,
    slots: [{ start: '09:00', end: '13:00', enabled: true }],
  },
  {
    dayOfWeek: 0,
    dayName: 'Domingo',
    enabled: false,
    slots: [],
  },
]

const createEmptySchedule = (): DaySchedule[] =>
  defaultDaySchedule.map((day) => ({
    ...day,
    enabled: false,
    slots: [],
  }))

const mapAvailabilityToSchedule = (
  data: Array<{ dayOfWeek: number; startTime: string; endTime: string; isAvailable: boolean }>
): DaySchedule[] => {
  const groupedByDay = new Map<number, Array<{ startTime: string; endTime: string; isAvailable: boolean }>>()

  data.forEach((record) => {
    const dayRecords = groupedByDay.get(record.dayOfWeek) || []
    dayRecords.push({
      startTime: record.startTime,
      endTime: record.endTime,
      isAvailable: record.isAvailable
    })
    groupedByDay.set(record.dayOfWeek, dayRecords)
  })

  return createEmptySchedule().map((day) => {
    const dayRecords = groupedByDay.get(day.dayOfWeek)
    if (dayRecords && dayRecords.length > 0) {
      return {
        ...day,
        enabled: dayRecords.some((record) => record.isAvailable),
        slots: dayRecords.map((record) => ({
          start: record.startTime,
          end: record.endTime,
          enabled: record.isAvailable
        }))
      }
    }

    return day
  })
}

export default function AppointmentsAvailability() {
  const [schedule, setSchedule] = useState<DaySchedule[]>(createEmptySchedule)
  const [exceptions, setExceptions] = useState<Exception[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [services, setServices] = useState<AppointmentServiceType[]>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [selectedService, setSelectedService] = useState<AppointmentServiceType | null>(null)
  const [openExceptionModal, setOpenExceptionModal] = useState(false)
  const [exceptionForm, setExceptionForm] = useState({
    title: '',
    date: '',
    reason: '',
    isRecurring: false,
  })
  const [activeTab, setActiveTab] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingServices, setLoadingServices] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingException, setSavingException] = useState(false)

  // Cargar servicios y excepciones
  useEffect(() => {
    fetchUsers()
    fetchServices()
    fetchExceptions()
  }, [])

  useEffect(() => {
    if (!selectedUser || !selectedService) {
      setSchedule(createEmptySchedule())
      setLoading(false)
      return
    }

    fetchAvailability(selectedUser.id, selectedService.id)
  }, [selectedUser, selectedService])

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true)
      const response = await api.get('/users')
      const availableUsers = response.data.users || response.data || []
      setUsers(availableUsers)

      const userStr = localStorage.getItem('user')
      const currentUser = userStr ? JSON.parse(userStr) : null
      const matchingUser = availableUsers.find((user: User) => user.id === currentUser?.id)
      if (matchingUser) {
        setSelectedUser(matchingUser)
      }
    } catch (error) {
      console.error('Error fetching users:', error)
      toast.error('Error al cargar los usuarios')
    } finally {
      setLoadingUsers(false)
    }
  }

  const fetchServices = async () => {
    try {
      setLoadingServices(true)
      const data = await appointmentService.getServices(true)
      setServices(data || [])
    } catch (error) {
      console.error('Error fetching services:', error)
      toast.error('Error al cargar los servicios')
    } finally {
      setLoadingServices(false)
    }
  }

  const fetchAvailability = async (userId: number, serviceId: number) => {
    setLoading(true)
    try {
      const { data } = await api.get(`/appointments/availability/user/${userId}`, {
        params: { serviceId }
      })

      if (data && data.length > 0) {
        setSchedule(mapAvailabilityToSchedule(data))
      } else {
        setSchedule(createEmptySchedule())
      }
    } catch (error) {
      console.error('Error fetching availability:', error)
      setSchedule(createEmptySchedule())
    } finally {
      setLoading(false)
    }
  }

  const fetchExceptions = async () => {
    try {
      const { data } = await api.get('/appointments/availability/blocks')
      setExceptions(data.map((block: any) => ({
        id: block.id,
        title: block.title,
        startTime: block.startTime,
        endTime: block.endTime,
        reason: block.reason || '',
        isRecurring: block.isRecurring || false
      })))
    } catch (error) {
      console.error('Error fetching exceptions:', error)
    }
  }

  const handleToggleDay = (dayIndex: number) => {
    const newSchedule = [...schedule]
    newSchedule[dayIndex].enabled = !newSchedule[dayIndex].enabled
    // Si se habilita el día y no tiene slots, agregar uno por defecto
    if (newSchedule[dayIndex].enabled && newSchedule[dayIndex].slots.length === 0) {
      newSchedule[dayIndex].slots = [{ start: '09:00', end: '18:00', enabled: true }]
    }
    setSchedule(newSchedule)
  }

  const handleToggleSlot = (dayIndex: number, slotIndex: number) => {
    const newSchedule = [...schedule]
    newSchedule[dayIndex].slots[slotIndex].enabled = !newSchedule[dayIndex].slots[slotIndex].enabled
    setSchedule(newSchedule)
  }

  const handleAddSlot = (dayIndex: number) => {
    const newSchedule = [...schedule]
    const lastSlot = newSchedule[dayIndex].slots[newSchedule[dayIndex].slots.length - 1]
    const newStart = lastSlot ? lastSlot.end : '09:00'
    newSchedule[dayIndex].slots.push({
      start: newStart,
      end: '18:00',
      enabled: true,
    })
    setSchedule(newSchedule)
  }

  const handleRemoveSlot = (dayIndex: number, slotIndex: number) => {
    const newSchedule = [...schedule]
    newSchedule[dayIndex].slots.splice(slotIndex, 1)
    setSchedule(newSchedule)
  }

  const handleUpdateSlot = (dayIndex: number, slotIndex: number, field: 'start' | 'end', value: string) => {
    const newSchedule = [...schedule]
    newSchedule[dayIndex].slots[slotIndex][field] = value
    setSchedule(newSchedule)
  }

  const handleCopySchedule = (sourceDayIndex: number) => {
    const sourceDay = schedule[sourceDayIndex]
    const newSchedule = schedule.map((day, index) =>
      index !== sourceDayIndex
        ? {
            ...day,
            enabled: sourceDay.enabled,
            slots: sourceDay.slots.map((slot) => ({ ...slot })),
          }
        : day
    )
    setSchedule(newSchedule)
  }

  const handleSaveSchedule = async () => {
    if (!selectedUser) {
      toast.error('Selecciona un usuario primero')
      return
    }

    if (!selectedService) {
      toast.error('Selecciona un servicio primero')
      return
    }

    setSaving(true)
    try {
      const payload = {
        userId: selectedUser.id,
        serviceId: selectedService.id,
        schedule: schedule.map(day => ({
          dayOfWeek: day.dayOfWeek,
          enabled: day.enabled,
          slots: day.slots
        })),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
      console.log('Saving availability:', payload)

      const result = await api.post('/appointments/availability/bulk', payload)
      await fetchAvailability(selectedUser.id, selectedService.id)

      console.log('Save result:', result.data)
      toast.success(`Disponibilidad de ${selectedService.name} guardada para ${selectedUser.name}: ${result.data.saved} bloques`)
    } catch (error: any) {
      console.error('Error saving availability:', error)
      const errorMsg = error.response?.data?.error || error.response?.data?.details || error.message || 'Error al guardar la disponibilidad'
      toast.error(errorMsg)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveException = async () => {
    if (!exceptionForm.date || !exceptionForm.title) {
      toast.error('Por favor completa los campos requeridos')
      return
    }

    setSavingException(true)
    try {
      // Crear un bloqueo de todo el día
      const startTime = new Date(exceptionForm.date)
      startTime.setHours(0, 0, 0, 0)

      const endTime = new Date(exceptionForm.date)
      endTime.setHours(23, 59, 59, 999)

      const payload = {
        title: exceptionForm.title,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        reason: exceptionForm.reason,
        isRecurring: exceptionForm.isRecurring
      }
      console.log('Saving exception:', payload)

      const result = await api.post('/appointments/availability/blocks', payload)
      console.log('Exception save result:', result.data)

      toast.success('Excepción agregada correctamente')
      setOpenExceptionModal(false)
      setExceptionForm({
        title: '',
        date: '',
        reason: '',
        isRecurring: false,
      })
      fetchExceptions()
    } catch (error: any) {
      console.error('Error saving exception:', error)
      const errorMsg = error.response?.data?.error || error.response?.data?.details || error.message || 'Error al guardar la excepción'
      toast.error(errorMsg)
    } finally {
      setSavingException(false)
    }
  }

  const handleDeleteException = async (id: number) => {
    if (!window.confirm('¿Estás seguro de eliminar esta excepción?')) return

    try {
      await api.delete(`/appointments/availability/blocks/${id}`)
      toast.success('Excepción eliminada')
      fetchExceptions()
    } catch (error) {
      console.error('Error deleting exception:', error)
      toast.error('Error al eliminar la excepción')
    }
  }

  const formatExceptionDate = (startTime: string) => {
    const date = new Date(startTime)
    return date.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const totalHoursPerWeek = schedule.reduce((total, day) => {
    if (!day.enabled) return total
    const dayHours = day.slots.reduce((dayTotal, slot) => {
      if (!slot.enabled) return dayTotal
      const [startH, startM] = slot.start.split(':').map(Number)
      const [endH, endM] = slot.end.split(':').map(Number)
      const hours = endH - startH + (endM - startM) / 60
      return dayTotal + hours
    }, 0)
    return total + dayHours
  }, 0)

  if (loading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto flex min-h-[400px] max-w-[1400px] items-center justify-center p-5 sm:p-6 lg:p-8">
          <CircularProgress />
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
              <Clock className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Configuración de Disponibilidad
              </h1>
              <p className="text-sm text-muted-foreground">
                Define los horarios disponibles para agendar citas
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleSaveSchedule}
              loading={saving}
              disabled={!selectedUser || !selectedService}
            >
              <FloppyDisk className="size-4" weight="bold" aria-hidden />
              Guardar Cambios
            </Button>
          </div>
        </div>

        {/* Selectores usuario / servicio */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="space-y-1.5">
              <Label htmlFor="availability-user">Usuario / Profesional</Label>
              <div className="flex items-center gap-2">
                <Select
                  value={selectedUser ? String(selectedUser.id) : ''}
                  onValueChange={(value) => {
                    const user = users.find((item) => String(item.id) === value)
                    setSelectedUser(user || null)
                  }}
                  disabled={loadingUsers}
                >
                  <SelectTrigger id="availability-user" className="h-10">
                    <SelectValue placeholder="Selecciona el usuario que quieres configurar" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={String(user.id)}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {loadingUsers && <CircularProgress size="sm" />}
              </div>
              <p className="text-xs text-muted-foreground">
                La disponibilidad se guarda por usuario y servicio.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="space-y-1.5">
              <Label htmlFor="availability-service">Servicio</Label>
              <div className="flex items-center gap-2">
                <Select
                  value={selectedService ? String(selectedService.id) : ''}
                  onValueChange={(value) => {
                    const service = services.find((item) => String(item.id) === value)
                    setSelectedService(service || null)
                  }}
                  disabled={loadingServices}
                >
                  <SelectTrigger id="availability-service" className="h-10">
                    <SelectValue placeholder="Selecciona el servicio que quieres configurar" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((service) => (
                      <SelectItem key={service.id} value={String(service.id)}>
                        {service.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {loadingServices && <CircularProgress size="sm" />}
              </div>
              <p className="text-xs text-muted-foreground">
                La disponibilidad se guarda por servicio. Primero eliges el servicio y luego defines sus turnos.
              </p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Horas/Semana" value={`${totalHoursPerWeek.toFixed(1)}h`} />
          <StatTile
            label="Días Activos"
            value={String(schedule.filter((d) => d.enabled).length)}
            tone="success"
          />
          <StatTile
            label="Bloques Horarios"
            value={String(
              schedule.reduce((sum, d) => sum + (d.enabled ? d.slots.filter((s) => s.enabled).length : 0), 0)
            )}
            tone="warning"
          />
          <StatTile label="Excepciones" value={String(exceptions.length)} tone="destructive" />
        </div>

        {/* Tabs */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <Tabs value={String(activeTab)} onValueChange={(value) => setActiveTab(Number(value))}>
            <TabsList>
              <TabsTrigger value="0">Horario Semanal</TabsTrigger>
              <TabsTrigger value="1">Excepciones / Días No Disponibles</TabsTrigger>
            </TabsList>

            {/* Weekly Schedule Tab */}
            <TabsContent value="0" className="mt-4">
              {!selectedUser || !selectedService ? (
                <div className="rounded-lg bg-muted/40 p-8 text-center">
                  <p className="mb-1 text-base font-medium text-foreground">
                    Selecciona un usuario y un servicio para editar sus turnos
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Cada servicio puede tener horarios propios, incluso en la misma hora que otros servicios.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {schedule.map((day, dayIndex) => (
                    <div
                      key={day.dayOfWeek}
                      className="rounded-lg border border-border bg-card p-4"
                    >
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <Toggle
                            checked={day.enabled}
                            onChange={() => handleToggleDay(dayIndex)}
                            label={`Activar ${day.dayName}`}
                          />
                          <span
                            className={cn(
                              'text-base font-medium text-foreground',
                              !day.enabled && 'opacity-50',
                            )}
                          >
                            {day.dayName}
                          </span>
                          {day.enabled && (
                            <Badge variant="primary">
                              {day.slots.filter((s) => s.enabled).length} bloques
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCopySchedule(dayIndex)}
                            disabled={!day.enabled}
                          >
                            <Copy className="size-4" aria-hidden />
                            Copiar a todos
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAddSlot(dayIndex)}
                            disabled={!day.enabled}
                          >
                            <Plus className="size-4" weight="bold" aria-hidden />
                            Añadir Bloque
                          </Button>
                        </div>
                      </div>

                      {day.enabled && (
                        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                          {day.slots.map((slot, slotIndex) => (
                            <div
                              key={slotIndex}
                              className={cn(
                                'rounded-lg border p-4 transition-colors',
                                slot.enabled
                                  ? 'border-primary/30 bg-primary/5'
                                  : 'border-border bg-muted/40',
                              )}
                            >
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="text-sm font-medium text-foreground">
                                  Bloque {slotIndex + 1}
                                </span>
                                <div className="flex items-center gap-1">
                                  <Toggle
                                    checked={slot.enabled}
                                    onChange={() => handleToggleSlot(dayIndex, slotIndex)}
                                    label={`Activar bloque ${slotIndex + 1} de ${day.dayName}`}
                                  />
                                  <ActionBtn
                                    label={`Eliminar bloque ${slotIndex + 1} de ${day.dayName}`}
                                    onClick={() => handleRemoveSlot(dayIndex, slotIndex)}
                                    disabled={day.slots.length === 1}
                                    className="hover:bg-destructive/10 hover:text-destructive-text"
                                  >
                                    <Trash className="size-[18px]" aria-hidden />
                                  </ActionBtn>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="time"
                                  aria-label={`Hora de inicio del bloque ${slotIndex + 1} de ${day.dayName}`}
                                  value={slot.start}
                                  onChange={(e) => handleUpdateSlot(dayIndex, slotIndex, 'start', e.target.value)}
                                  disabled={!slot.enabled}
                                  className={inputClass}
                                />
                                <span className="text-sm text-muted-foreground" aria-hidden>
                                  -
                                </span>
                                <input
                                  type="time"
                                  aria-label={`Hora de fin del bloque ${slotIndex + 1} de ${day.dayName}`}
                                  value={slot.end}
                                  onChange={(e) => handleUpdateSlot(dayIndex, slotIndex, 'end', e.target.value)}
                                  disabled={!slot.enabled}
                                  className={inputClass}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {!day.enabled && (
                        <p className="py-2 text-center text-sm text-muted-foreground">
                          Día no disponible
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Exceptions Tab */}
            <TabsContent value="1" className="mt-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Gestiona días no disponibles (vacaciones, festivos, etc.)
                </p>
                <Button size="sm" onClick={() => setOpenExceptionModal(true)}>
                  <Plus className="size-4" weight="bold" aria-hidden />
                  Nueva Excepción
                </Button>
              </div>

              {exceptions.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <CalendarX className="size-12 text-muted-foreground/40" aria-hidden />
                  <p className="text-sm text-muted-foreground">No hay excepciones configuradas</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                  {exceptions.map((exception) => (
                    <div
                      key={exception.id}
                      className="rounded-lg border border-border border-l-4 border-l-destructive bg-card p-4"
                    >
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <p className="text-base font-medium text-foreground">{exception.title}</p>
                        <ActionBtn
                          label={`Eliminar excepción ${exception.title}`}
                          onClick={() => handleDeleteException(exception.id)}
                          className="shrink-0 hover:bg-destructive/10 hover:text-destructive-text"
                        >
                          <Trash className="size-[18px]" aria-hidden />
                        </ActionBtn>
                      </div>
                      <p className="mb-1 text-sm text-muted-foreground">
                        {formatExceptionDate(exception.startTime)}
                      </p>
                      {exception.reason && (
                        <p className="mb-2 text-sm text-foreground">{exception.reason}</p>
                      )}
                      {exception.isRecurring && (
                        <Badge variant="outline">
                          <CalendarBlank className="size-3.5" aria-hidden />
                          Recurrente
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Exception Modal */}
      <Dialog open={openExceptionModal} onOpenChange={setOpenExceptionModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva Excepción / Día No Disponible</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="exception-title">Título</Label>
              <input
                id="exception-title"
                value={exceptionForm.title}
                onChange={(e) => setExceptionForm({ ...exceptionForm, title: e.target.value })}
                placeholder="Ej: Vacaciones, Día festivo..."
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exception-date">Fecha</Label>
              <input
                id="exception-date"
                type="date"
                value={exceptionForm.date}
                onChange={(e) => setExceptionForm({ ...exceptionForm, date: e.target.value })}
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exception-reason">Motivo (opcional)</Label>
              <input
                id="exception-reason"
                value={exceptionForm.reason}
                onChange={(e) => setExceptionForm({ ...exceptionForm, reason: e.target.value })}
                placeholder="Describe el motivo..."
                className={inputClass}
              />
            </div>

            <div className="flex items-center gap-3">
              <Toggle
                checked={exceptionForm.isRecurring}
                onChange={() =>
                  setExceptionForm({ ...exceptionForm, isRecurring: !exceptionForm.isRecurring })
                }
                label="Excepción recurrente"
              />
              <div>
                <p className="text-sm font-medium text-foreground">Excepción recurrente</p>
                <p className="text-xs text-muted-foreground">
                  Se repetirá todos los años en esta fecha
                </p>
              </div>
            </div>

            <div className="border-t border-border" />

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setOpenExceptionModal(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleSaveException}
                disabled={!exceptionForm.date || !exceptionForm.title}
                loading={savingException}
              >
                Guardar Excepción
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
