import { useCallback, useEffect, useMemo, useState } from 'react'
// [Migración] Autocomplete y CircularProgress se CONSERVAN como MUI Joy
// (no hay equivalente en el design system). El resto de la pantalla migra a
// Tailwind v4 + shadcn/Radix. El listbox del Autocomplete usa `disablePortal`
// para poder vivir dentro del Dialog de Radix (el portal a <body> queda fuera
// del focus trap / RemoveScroll y no sería clicable).
import { Autocomplete, CircularProgress } from '@mui/joy'
import {
  CalendarBlank,
  Plus,
  PencilSimple,
  Trash,
  MagnifyingGlass,
  ArrowClockwise,
  CheckCircle,
  Clock,
  XCircle,
  WarningCircle,
  Paperclip,
  UploadSimple,
} from '@phosphor-icons/react'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
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
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import getApiErrorMessage from '../utils/getApiErrorMessage'

// Clases compartidas para inputs (mismo look que Tags/Connections/Prompts)
const inputClass =
  'h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-55'

// Botón de acción de fila (mismo look que RowAction del design system, con onClick)
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
        'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  )
}

interface Contact {
  id: number
  name: string
  number: string
}

interface UserOption {
  id: number
  name: string
}

interface QueueOption {
  id: number
  name: string
  color?: string
}

interface WhatsappOption {
  id: number
  name: string
  channel?: string
}

interface Schedule {
  id: number
  body: string
  sendAt: string
  sentAt?: string | null
  contactId: number
  ticketId?: number
  userId: number
  companyId: number
  status: string
  mediaPath?: string | null
  mediaName?: string | null
  createdAt: string
  updatedAt?: string
  ticketUserId?: number | null
  queueId?: number | null
  statusTicket?: string
  openTicket?: string
  whatsappId?: number | null
  intervalo?: number | null
  valorIntervalo?: number | null
  enviarQuantasVezes?: number | null
  tipoDias?: number | null
  contadorEnvio?: number | null
  assinar?: boolean
  contact?: Contact
  user?: UserOption
  ticketUser?: UserOption
  queue?: QueueOption
  whatsapp?: WhatsappOption
}

interface ScheduleFormData {
  body: string
  sendAt: string
  contactId: number
  whatsappId: number | null
  openTicket: string
  statusTicket: string
  ticketUserId: number | null
  queueId: number | null
  intervalo: number
  valorIntervalo: number
  enviarQuantasVezes: number
  tipoDias: number
  contadorEnvio: number
  assinar: boolean
}

const columns = [
  'Estado',
  'Mensaje',
  'Contacto',
  'Conexión',
  'Recurrencia',
  'Progreso',
  'Envío programado',
  '',
]

const intervalOptions = [
  { value: 1, label: 'Días' },
  { value: 2, label: 'Semanas' },
  { value: 3, label: 'Meses' },
  { value: 4, label: 'Minutos' },
]

const businessDayOptions = [
  { value: 4, label: 'Enviar normalmente en días no laborables' },
  { value: 5, label: 'Enviar un día laborable antes' },
  { value: 6, label: 'Enviar un día laborable después' },
]

const getDefaultFormData = (): ScheduleFormData => ({
  body: '',
  sendAt: '',
  contactId: 0,
  whatsappId: null,
  openTicket: 'disabled',
  statusTicket: 'closed',
  ticketUserId: null,
  queueId: null,
  intervalo: 1,
  valorIntervalo: 0,
  enviarQuantasVezes: 1,
  tipoDias: 4,
  contadorEnvio: 0,
  assinar: false,
})

const toDateTimeLocal = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day}T${hours}:${minutes}`
}

const normalizeScheduleStatus = (status?: string) => {
  const normalized = (status || '').toLowerCase()

  if (normalized === 'sent' || normalized === 'enviada') return 'sent'
  if (normalized === 'erro' || normalized === 'error' || normalized === 'failed') return 'error'
  if (normalized === 'cancelled' || normalized === 'cancelado') return 'cancelled'
  return 'pending'
}

const getStatusVariant = (status?: string): BadgeProps['variant'] => {
  switch (normalizeScheduleStatus(status)) {
    case 'sent':
      return 'success'
    case 'error':
      return 'destructive'
    case 'cancelled':
      return 'neutral'
    default:
      return 'warning'
  }
}

const getStatusLabel = (status?: string) => {
  switch (normalizeScheduleStatus(status)) {
    case 'sent':
      return 'Enviado'
    case 'error':
      return 'Error'
    case 'cancelled':
      return 'Cancelado'
    default:
      return 'Pendiente'
  }
}

const getStatusIcon = (status?: string) => {
  switch (normalizeScheduleStatus(status)) {
    case 'sent':
      return <CheckCircle className="size-3.5" weight="fill" aria-hidden />
    case 'error':
      return <WarningCircle className="size-3.5" weight="fill" aria-hidden />
    case 'cancelled':
      return <XCircle className="size-3.5" weight="fill" aria-hidden />
    default:
      return <Clock className="size-3.5" weight="fill" aria-hidden />
  }
}

const getRecurrenceSummary = (schedule: Pick<Schedule, 'intervalo' | 'valorIntervalo' | 'enviarQuantasVezes' | 'tipoDias'>) => {
  const intervalo = schedule.intervalo ?? 1
  const valorIntervalo = schedule.valorIntervalo ?? 0
  const enviarQuantasVezes = schedule.enviarQuantasVezes ?? 1
  const tipoDias = schedule.tipoDias ?? 4

  if (valorIntervalo <= 0 || enviarQuantasVezes <= 1) {
    return 'Envío único'
  }

  const intervalLabel = intervalOptions.find(item => item.value === intervalo)?.label.toLowerCase() || 'días'
  const dayModeLabel = businessDayOptions.find(item => item.value === tipoDias)?.label

  return `Cada ${valorIntervalo} ${intervalLabel} · ${enviarQuantasVezes} veces · ${dayModeLabel}`
}

export default function Schedules() {
  const { user } = useAuth()

  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [scheduleCount, setScheduleCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [openModal, setOpenModal] = useState(false)
  const [modalLoading, setModalLoading] = useState(false)
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null)
  const [formData, setFormData] = useState<ScheduleFormData>(getDefaultFormData())

  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [contactSearch, setContactSearch] = useState('')
  const [loadingContacts, setLoadingContacts] = useState(false)

  const [users, setUsers] = useState<UserOption[]>([])
  const [queues, setQueues] = useState<QueueOption[]>([])
  const [whatsapps, setWhatsapps] = useState<WhatsappOption[]>([])

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [existingMedia, setExistingMedia] = useState<{ name: string; path: string } | null>(null)
  const [removeExistingMedia, setRemoveExistingMedia] = useState(false)

  const fetchSchedules = useCallback(async (search = '') => {
    try {
      const params: { pageNumber: number; searchParam?: string } = { pageNumber: 1 }
      const trimmedSearch = search.trim()

      if (trimmedSearch) {
        params.searchParam = trimmedSearch
      }

      const response = await api.get('/schedules', { params })
      const list = response.data.schedules || response.data || []
      setSchedules(list)
      setScheduleCount(response.data.count ?? list.length)
    } catch (error) {
      console.error('Error fetching schedules:', error)
      setSchedules([])
      setScheduleCount(0)
      toast.error('No se pudieron cargar las agendas')
    }
  }, [])

  useEffect(() => {
    fetchFormOptions()
  }, [])

  useEffect(() => {
    let isActive = true

    setLoading(true)
    const timeout = window.setTimeout(async () => {
      try {
        await fetchSchedules(searchTerm)
      } finally {
        if (isActive) {
          setLoading(false)
        }
      }
    }, 350)

    return () => {
      isActive = false
      window.clearTimeout(timeout)
    }
  }, [fetchSchedules, searchTerm])

  useEffect(() => {
    if (contactSearch.length >= 2) {
      searchContacts(contactSearch)
    } else if (!selectedContact) {
      setContacts([])
    }
  }, [contactSearch, selectedContact])

  const loadInitialData = async () => {
    setLoading(true)
    try {
      await Promise.all([fetchSchedules(searchTerm), fetchFormOptions()])
    } finally {
      setLoading(false)
    }
  }

  const fetchFormOptions = async () => {
    try {
      const [usersRes, queuesRes, whatsappsRes] = await Promise.all([
        api.get('/users'),
        api.get('/queues'),
        api.get('/whatsapps'),
      ])

      setUsers(usersRes.data.users || usersRes.data || [])
      setQueues(queuesRes.data.queues || queuesRes.data || [])
      setWhatsapps(whatsappsRes.data.whatsapps || whatsappsRes.data || [])
    } catch (error) {
      console.error('Error fetching schedule form options:', error)
      toast.error('No se pudieron cargar usuarios, colas o conexiones')
    }
  }

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

  const syncScheduleMedia = async (scheduleId: number) => {
    if (removeExistingMedia && existingMedia?.path) {
      await api.delete(`/schedules/${scheduleId}/media-upload`)
    }

    if (selectedFile) {
      const uploadData = new FormData()
      uploadData.append('typeArch', 'schedule')
      uploadData.append('file', selectedFile)
      await api.post(`/schedules/${scheduleId}/media-upload`, uploadData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
    }
  }

  const buildPayload = () => ({
    body: formData.body.trim(),
    sendAt: formData.sendAt,
    contactId: formData.contactId,
    userId: user?.id,
    whatsappId: formData.whatsappId || undefined,
    openTicket: formData.openTicket,
    statusTicket: formData.statusTicket,
    ticketUserId: formData.openTicket === 'enabled' ? formData.ticketUserId || undefined : undefined,
    queueId: formData.openTicket === 'enabled' ? formData.queueId || undefined : undefined,
    intervalo: formData.intervalo,
    valorIntervalo: Math.max(0, formData.valorIntervalo),
    enviarQuantasVezes: Math.max(1, formData.enviarQuantasVezes),
    tipoDias: formData.tipoDias,
    contadorEnvio: formData.contadorEnvio,
    assinar: formData.assinar,
  })

  const validateForm = () => {
    if (!formData.body.trim()) {
      toast.error('Escribe el mensaje a programar')
      return false
    }

    if (!formData.sendAt) {
      toast.error('Selecciona la fecha y hora de envío')
      return false
    }

    const sendAtDate = new Date(formData.sendAt)
    if (Number.isNaN(sendAtDate.getTime())) {
      toast.error('La fecha de envío no es válida')
      return false
    }

    if (sendAtDate.getTime() <= Date.now()) {
      toast.error('La fecha debe ser futura')
      return false
    }

    if (!formData.contactId) {
      toast.error('Selecciona un contacto')
      return false
    }

    if (!formData.whatsappId) {
      toast.error('Selecciona una conexión')
      return false
    }

    if (formData.valorIntervalo > 0 && formData.enviarQuantasVezes < 2) {
      toast.error('Si configuras recurrencia, la cantidad de envíos debe ser al menos 2')
      return false
    }

    return true
  }

  const handleCreate = async () => {
    if (!validateForm()) return

    try {
      setModalLoading(true)
      const { data } = await api.post('/schedules', buildPayload())
      await syncScheduleMedia(data.id)
      toast.success('Mensaje programado correctamente')
      await fetchSchedules(searchTerm)
      setOpenModal(false)
      resetForm()
    } catch (error) {
      console.error('Error creating schedule:', error)
      toast.error(getApiErrorMessage(error, 'Error al crear el mensaje programado'))
    } finally {
      setModalLoading(false)
    }
  }

  const handleUpdate = async () => {
    if (!selectedSchedule || !validateForm()) return

    try {
      setModalLoading(true)
      await api.put(`/schedules/${selectedSchedule.id}`, buildPayload())
      await syncScheduleMedia(selectedSchedule.id)
      toast.success('Mensaje programado actualizado')
      await fetchSchedules(searchTerm)
      setOpenModal(false)
      resetForm()
    } catch (error) {
      console.error('Error updating schedule:', error)
      toast.error(getApiErrorMessage(error, 'Error al actualizar el mensaje programado'))
    } finally {
      setModalLoading(false)
    }
  }

  const handleDelete = async (scheduleId: number) => {
    if (!window.confirm('¿Estás seguro de eliminar este mensaje programado?')) return

    try {
      await api.delete(`/schedules/${scheduleId}`)
      toast.success('Mensaje programado eliminado')
      fetchSchedules(searchTerm)
    } catch (error) {
      console.error('Error deleting schedule:', error)
      toast.error('Error al eliminar el mensaje programado')
    }
  }

  const openEditModal = async (schedule: Schedule) => {
    try {
      setModalLoading(true)
      const response = await api.get(`/schedules/${schedule.id}`)
      const fullSchedule: Schedule = response.data

      setSelectedSchedule(fullSchedule)
      setFormData({
        body: fullSchedule.body || '',
        sendAt: toDateTimeLocal(fullSchedule.sendAt),
        contactId: fullSchedule.contactId || 0,
        whatsappId: fullSchedule.whatsappId || null,
        openTicket: fullSchedule.openTicket || 'disabled',
        statusTicket: fullSchedule.statusTicket || 'closed',
        ticketUserId: fullSchedule.ticketUserId || null,
        queueId: fullSchedule.queueId || null,
        intervalo: fullSchedule.intervalo || 1,
        valorIntervalo: fullSchedule.valorIntervalo || 0,
        enviarQuantasVezes: fullSchedule.enviarQuantasVezes || 1,
        tipoDias: fullSchedule.tipoDias || 4,
        contadorEnvio: fullSchedule.contadorEnvio || 0,
        assinar: Boolean(fullSchedule.assinar),
      })

      if (fullSchedule.contact) {
        setSelectedContact(fullSchedule.contact)
        setContactSearch(fullSchedule.contact.name)
        setContacts(prev => {
          const withoutDuplicated = prev.filter(item => item.id !== fullSchedule.contact?.id)
          return fullSchedule.contact ? [fullSchedule.contact, ...withoutDuplicated] : withoutDuplicated
        })
      } else if (fullSchedule.contactId) {
        const contactResponse = await api.get(`/contacts/${fullSchedule.contactId}`)
        const contact = contactResponse.data
        setSelectedContact({ id: contact.id, name: contact.name, number: contact.number })
        setContactSearch(contact.name)
      } else {
        setSelectedContact(null)
        setContactSearch('')
      }

      setExistingMedia(
        fullSchedule.mediaPath && fullSchedule.mediaName
          ? { path: fullSchedule.mediaPath, name: fullSchedule.mediaName }
          : null
      )
      setSelectedFile(null)
      setRemoveExistingMedia(false)
      setOpenModal(true)
    } catch (error) {
      console.error('Error loading schedule details:', error)
      toast.error('No se pudo abrir la agenda para edición')
    } finally {
      setModalLoading(false)
    }
  }

  const openCreateModal = () => {
    setSelectedSchedule(null)
    resetForm()
    setOpenModal(true)
  }

  const resetForm = () => {
    setFormData(getDefaultFormData())
    setSelectedContact(null)
    setContactSearch('')
    setContacts([])
    setSelectedFile(null)
    setExistingMedia(null)
    setRemoveExistingMedia(false)
    setModalLoading(false)
  }

  const filteredSchedules = useMemo(() => {
    return schedules.filter((schedule) => {
      const normalizedStatus = normalizeScheduleStatus(schedule.status)
      const matchesStatus = statusFilter === 'all' || normalizedStatus === statusFilter
      return matchesStatus
    })
  }, [schedules, statusFilter])

  const stats = useMemo(() => {
    return {
      total: scheduleCount,
      pending: schedules.filter((item) => normalizeScheduleStatus(item.status) === 'pending').length,
      sent: schedules.filter((item) => normalizeScheduleStatus(item.status) === 'sent').length,
      errors: schedules.filter((item) => normalizeScheduleStatus(item.status) === 'error').length,
      today: schedules.filter(
        (item) =>
          new Date(item.sendAt).toDateString() === new Date().toDateString() &&
          normalizeScheduleStatus(item.status) === 'pending'
      ).length,
    }
  }, [scheduleCount, schedules])

  const selectedWhatsapp = whatsapps.find(item => item.id === formData.whatsappId)
  const selectedQueue = queues.find(item => item.id === formData.queueId)
  const selectedTicketUser = users.find(item => item.id === formData.ticketUserId)
  const ticketOptionsDisabled = formData.openTicket !== 'enabled'

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
                Agendas
              </h1>
              <p className="text-sm text-muted-foreground">
                Mensajes programados para envío automático
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar"
              className="text-muted-foreground"
              onClick={loadInitialData}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            <Button size="sm" onClick={openCreateModal}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nuevo mensaje
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatTile label="Total programados" value={String(stats.total)} />
          <StatTile label="Pendientes" value={String(stats.pending)} tone="warning" />
          <StatTile label="Enviados" value={String(stats.sent)} tone="success" />
          <StatTile label="Con error" value={String(stats.errors)} tone="destructive" />
          <StatTile label="Hoy" value={String(stats.today)} />
        </div>

        {/* Filtros */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-md">
            <MagnifyingGlass
              className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              placeholder="Buscar mensajes, contactos o conexiones"
              aria-label="Buscar mensajes programados"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value || 'all')}>
            <SelectTrigger aria-label="Filtrar por estado" className="h-10 sm:w-[220px]">
              <SelectValue placeholder="Todos los estados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="pending">Pendientes</SelectItem>
              <SelectItem value="sent">Enviados</SelectItem>
              <SelectItem value="error">Con error</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tabla */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
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
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      Cargando mensajes programados...
                    </td>
                  </tr>
                ) : filteredSchedules.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      No se encontraron mensajes programados
                    </td>
                  </tr>
                ) : (
                  filteredSchedules.map((schedule) => {
                    const normalizedStatus = normalizeScheduleStatus(schedule.status)
                    const isLocked = normalizedStatus === 'sent'

                    return (
                      <tr key={schedule.id} className="transition-colors hover:bg-accent/40">
                        <td className="px-4 py-3">
                          <Badge variant={getStatusVariant(schedule.status)}>
                            {getStatusIcon(schedule.status)}
                            {getStatusLabel(schedule.status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-1">
                            <span className="block max-w-[320px] truncate text-foreground">
                              {schedule.body}
                            </span>
                            {schedule.mediaName && (
                              <Badge variant="neutral" className="max-w-[320px]">
                                <Paperclip className="size-3.5 shrink-0" aria-hidden />
                                <span className="truncate">{schedule.mediaName}</span>
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {schedule.contact?.name || `#${schedule.contactId}`}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {schedule.whatsapp?.name || (schedule.whatsappId ? `#${schedule.whatsappId}` : '-')}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {getRecurrenceSummary(schedule)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="neutral" className="tabular-nums">
                            {(schedule.contadorEnvio || 0)}/{schedule.enviarQuantasVezes || 1}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-foreground">
                              {new Date(schedule.sendAt).toLocaleString('es-ES', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {schedule.sentAt
                                ? `Último envío: ${new Date(schedule.sentAt).toLocaleString('es-ES', {
                                    dateStyle: 'short',
                                    timeStyle: 'short',
                                  })}`
                                : 'Aún no enviado'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-0.5">
                            <ActionBtn
                              label="Editar"
                              onClick={() => openEditModal(schedule)}
                              disabled={isLocked}
                            >
                              <PencilSimple className="size-[18px]" aria-hidden />
                            </ActionBtn>
                            <ActionBtn
                              label="Eliminar"
                              onClick={() => handleDelete(schedule.id)}
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

      {/* Modal Crear/Editar */}
      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {selectedSchedule ? 'Editar mensaje programado' : 'Nuevo mensaje programado'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="schedule-body">Mensaje</Label>
              <textarea
                id="schedule-body"
                value={formData.body}
                onChange={(e) => setFormData(prev => ({ ...prev, body: e.target.value }))}
                placeholder="Escribe el mensaje a enviar..."
                rows={4}
                className="min-h-[7rem] w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Contacto</Label>
                {/* [Migración] Autocomplete CONSERVADO como MUI Joy (sin equivalente Radix).
                    disablePortal en el listbox para que funcione dentro del Dialog de Radix. */}
                <Autocomplete
                  placeholder="Buscar por nombre o número..."
                  options={contacts}
                  value={selectedContact}
                  onChange={(_event, value) => {
                    setSelectedContact(value)
                    setFormData(prev => ({ ...prev, contactId: value?.id || 0 }))
                  }}
                  inputValue={contactSearch}
                  onInputChange={(_event, value) => setContactSearch(value)}
                  getOptionLabel={(option) => `${option.name} - ${option.number}`}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  loading={loadingContacts}
                  slotProps={{ listbox: { disablePortal: true } }}
                  startDecorator={<MagnifyingGlass className="size-[18px]" aria-hidden />}
                  endDecorator={loadingContacts ? <CircularProgress size="sm" /> : null}
                  renderOption={(props, option) => (
                    <li
                      {...props}
                      key={option.id}
                      className="flex cursor-pointer flex-col items-start gap-0.5 rounded-md px-3 py-2 aria-selected:bg-accent [&.Mui-focused]:bg-accent"
                    >
                      <span className="text-sm font-semibold text-foreground">{option.name}</span>
                      <span className="text-xs text-muted-foreground">{option.number}</span>
                    </li>
                  )}
                  noOptionsText={contactSearch.length < 2 ? 'Escribe al menos 2 caracteres' : 'No se encontraron contactos'}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="schedule-sendat">Fecha y hora de envío</Label>
                <input
                  id="schedule-sendat"
                  type="datetime-local"
                  value={formData.sendAt}
                  onChange={(e) => setFormData(prev => ({ ...prev, sendAt: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="schedule-whatsapp">Conexión</Label>
                <Select
                  value={String(formData.whatsappId ?? 0)}
                  onValueChange={(value) =>
                    setFormData(prev => ({ ...prev, whatsappId: Number(value) > 0 ? Number(value) : null }))
                  }
                >
                  <SelectTrigger id="schedule-whatsapp" className="h-11">
                    <SelectValue placeholder="Sin seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Sin seleccionar</SelectItem>
                    {whatsapps.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="schedule-openticket">Abrir ticket</Label>
                <Select
                  value={formData.openTicket}
                  onValueChange={(value) =>
                    setFormData(prev => ({ ...prev, openTicket: value || 'disabled' }))
                  }
                >
                  <SelectTrigger id="schedule-openticket" className="h-11">
                    <SelectValue placeholder="Desactivado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enabled">Activado</SelectItem>
                    <SelectItem value="disabled">Desactivado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="schedule-ticketuser">Usuario asignado al ticket</Label>
                <Select
                  value={String(formData.ticketUserId ?? 0)}
                  disabled={ticketOptionsDisabled}
                  onValueChange={(value) =>
                    setFormData(prev => ({ ...prev, ticketUserId: Number(value) > 0 ? Number(value) : null }))
                  }
                >
                  <SelectTrigger id="schedule-ticketuser" className="h-11">
                    <SelectValue placeholder="Sin asignar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Sin asignar</SelectItem>
                    {users.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="schedule-queue">Transferir para departamentos</Label>
                <Select
                  value={String(formData.queueId ?? 0)}
                  disabled={ticketOptionsDisabled}
                  onValueChange={(value) =>
                    setFormData(prev => ({ ...prev, queueId: Number(value) > 0 ? Number(value) : null }))
                  }
                >
                  <SelectTrigger id="schedule-queue" className="h-11">
                    <SelectValue placeholder="Sin departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Sin departamento</SelectItem>
                    {queues.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="schedule-statusticket">Status del ticket</Label>
                <Select
                  value={formData.statusTicket}
                  disabled={ticketOptionsDisabled}
                  onValueChange={(value) =>
                    setFormData(prev => ({ ...prev, statusTicket: value || 'closed' }))
                  }
                >
                  <SelectTrigger id="schedule-statusticket" className="h-11">
                    <SelectValue placeholder="Cerrado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Abierto</SelectItem>
                    <SelectItem value="closed">Cerrado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="schedule-file">
                  <span className="flex items-center gap-1.5">
                    <UploadSimple className="size-4" aria-hidden />
                    <span>Adjunto</span>
                  </span>
                </Label>
                <input
                  id="schedule-file"
                  type="file"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null
                    setSelectedFile(file)
                    if (file) {
                      setRemoveExistingMedia(false)
                    }
                  }}
                  className={cn(
                    inputClass,
                    'cursor-pointer py-2.5 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-secondary-foreground',
                  )}
                />
              </div>
            </div>

            {(existingMedia || selectedFile) && (
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <span className="flex items-center gap-1.5 text-sm text-foreground">
                    <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    Archivo actual: {selectedFile?.name || existingMedia?.name}
                  </span>
                  {existingMedia && !selectedFile && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
                      onClick={() => setRemoveExistingMedia(true)}
                    >
                      Quitar archivo actual
                    </Button>
                  )}
                </div>
                {removeExistingMedia && (
                  <p className="mt-2 text-xs text-destructive-text">
                    El archivo actual se eliminará al guardar.
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center gap-3">
              <Checkbox
                id="schedule-assinar"
                checked={formData.assinar}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, assinar: checked }))}
              />
              <div>
                <Label htmlFor="schedule-assinar" className="cursor-pointer">
                  Enviar firma
                </Label>
                <p className="text-xs text-muted-foreground">
                  Usa la opción de firma del backend al momento del envío.
                </p>
              </div>
            </div>

            {/* Recurrencia */}
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <h3 className="text-sm font-semibold text-foreground">Recurrencia</h3>
              <p className="mb-3 mt-0.5 text-sm text-muted-foreground">
                Si no quieres recurrencia, deja el valor del intervalo en 0 y la cantidad de envíos en 1.
              </p>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="schedule-intervalo">Intervalo</Label>
                  <Select
                    value={String(formData.intervalo)}
                    onValueChange={(value) =>
                      setFormData(prev => ({ ...prev, intervalo: Number(value) || 1 }))
                    }
                  >
                    <SelectTrigger id="schedule-intervalo" className="h-11">
                      <SelectValue placeholder="Días" />
                    </SelectTrigger>
                    <SelectContent>
                      {intervalOptions.map((item) => (
                        <SelectItem key={item.value} value={String(item.value)}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="schedule-valorintervalo">Rango valor</Label>
                  <input
                    id="schedule-valorintervalo"
                    type="number"
                    value={formData.valorIntervalo}
                    onChange={(e) =>
                      setFormData(prev => ({ ...prev, valorIntervalo: Math.max(0, Number(e.target.value) || 0) }))
                    }
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="schedule-cuantasveces">Enviar cuántas veces</Label>
                  <input
                    id="schedule-cuantasveces"
                    type="number"
                    value={formData.enviarQuantasVezes}
                    onChange={(e) =>
                      setFormData(prev => ({ ...prev, enviarQuantasVezes: Math.max(1, Number(e.target.value) || 1) }))
                    }
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="schedule-contador">Contador actual</Label>
                  <input
                    id="schedule-contador"
                    type="number"
                    value={formData.contadorEnvio}
                    disabled
                    readOnly
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5 md:col-span-4">
                  <Label htmlFor="schedule-tipodias">Comportamiento en días no laborables</Label>
                  <Select
                    value={String(formData.tipoDias)}
                    onValueChange={(value) =>
                      setFormData(prev => ({ ...prev, tipoDias: Number(value) || 4 }))
                    }
                  >
                    <SelectTrigger id="schedule-tipodias" className="h-11">
                      <SelectValue placeholder="Selecciona un comportamiento" />
                    </SelectTrigger>
                    <SelectContent>
                      {businessDayOptions.map((item) => (
                        <SelectItem key={item.value} value={String(item.value)}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Vista previa */}
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              <p className="mb-1 font-semibold text-foreground">Vista previa:</p>
              <p>
                {selectedContact
                  ? `Contacto: ${selectedContact.name} (${selectedContact.number})`
                  : 'Contacto: no seleccionado'}
              </p>
              <p>{selectedWhatsapp ? `Conexión: ${selectedWhatsapp.name}` : 'Conexión: no seleccionada'}</p>
              <p>
                Ticket:{' '}
                {formData.openTicket === 'enabled'
                  ? `se abrirá en estado ${formData.statusTicket === 'open' ? 'abierto' : 'cerrado'}`
                  : 'no se abrirá automáticamente'}
              </p>
              <p>
                Responsable: {selectedTicketUser?.name || 'sin usuario asignado'}
                {selectedQueue ? ` · Departamento: ${selectedQueue.name}` : ''}
              </p>
              <p>Recurrencia: {getRecurrenceSummary(formData)}</p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setOpenModal(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                loading={modalLoading}
                onClick={selectedSchedule ? handleUpdate : handleCreate}
              >
                {selectedSchedule ? 'Actualizar' : 'Programar'} mensaje
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
