import { useState, useEffect } from 'react'
import {
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
  Stack,
  FormControl,
  FormLabel,
  Input,
  Select,
  Option,
  Textarea,
  Button,
  Autocomplete,
  Box,
  Chip,
  CircularProgress,
  Grid,
  Card,
} from '@mui/joy'
import {
  Add as AddIcon,
  Person as PersonIcon,
  Search as SearchIcon,
  AccessTime as TimeIcon,
  EventBusy as BusyIcon,
  Check as CheckIcon,
  Schedule as RescheduleIcon,
  Event as EventIcon,
  Notifications as NotificationsIcon,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
import api from '../../services/api'
import appointmentService, { AppointmentServiceType, CreateAppointmentData } from '../../services/appointmentService'

interface Contact {
  id: number
  name: string
  number: string
  email?: string
  profilePicUrl?: string
  urlPicture?: string
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
  bookedByAppointmentId?: number
  userId?: number
  userName?: string
}

interface ExistingAppointment {
  id: number
  title: string
  startTime: string
  endTime: string
  status: string
  serviceId: number
  userId?: number
  service?: {
    id: number
    name: string
    color: string
    duration: number
  }
  user?: {
    id: number
    name: string
  }
}

interface ReminderTemplate {
  id: number
  name: string
  channel: 'email' | 'whatsapp'
  timing: number
  isActive: boolean
}

interface CreateAppointmentModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  preselectedContact?: Contact | null
  lockContact?: boolean
  existingAppointment?: ExistingAppointment | null
  mode?: 'create' | 'reschedule'
}

export default function CreateAppointmentModal({
  open,
  onClose,
  onSuccess,
  preselectedContact,
  lockContact = false,
  existingAppointment,
  mode = 'create',
}: CreateAppointmentModalProps) {
  const isReschedule = mode === 'reschedule' && !!existingAppointment
  const [saving, setSaving] = useState(false)

  // Data lists
  const [contacts, setContacts] = useState<Contact[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [services, setServices] = useState<AppointmentServiceType[]>([])
  const [availableBlocks, setAvailableBlocks] = useState<AvailabilityBlock[]>([])
  const [reminderTemplates, setReminderTemplates] = useState<ReminderTemplate[]>([])
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [loadingServices, setLoadingServices] = useState(false)
  const [loadingBlocks, setLoadingBlocks] = useState(false)
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  // Form state
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [selectedService, setSelectedService] = useState<AppointmentServiceType | null>(null)
  const [selectedBlock, setSelectedBlock] = useState<AvailabilityBlock | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<ReminderTemplate | null>(null)
  const [contactSearch, setContactSearch] = useState('')
  const [date, setDate] = useState('')
  const [locationType, setLocationType] = useState<'presencial' | 'virtual' | 'telefonica'>('presencial')
  const [notes, setNotes] = useState('')
  const [title, setTitle] = useState('')

  // Initialize with preselected contact
  useEffect(() => {
    if (open && preselectedContact) {
      setSelectedContact(preselectedContact)
    }
  }, [open, preselectedContact])

  // Load data on open
  useEffect(() => {
    if (open) {
      fetchUsers()
      fetchServices()
      fetchReminderTemplates()

      // Si es reagendamiento, inicializar con datos de la cita existente
      if (isReschedule && existingAppointment) {
        // Establecer fecha de la cita actual como default
        const appointmentDate = existingAppointment.startTime.split('T')[0]
        setDate(appointmentDate)
        setTitle(existingAppointment.title)
      } else {
        // Set default date to today
        const today = new Date().toISOString().split('T')[0]
        setDate(today)
      }
    }
  }, [open, isReschedule, existingAppointment])

  // Pre-seleccionar servicio cuando se cargan los servicios en modo reagendar
  useEffect(() => {
    if (isReschedule && existingAppointment && services.length > 0) {
      const existingService = services.find(s => s.id === existingAppointment.serviceId)
      if (existingService) {
        setSelectedService(existingService)
      }
    }
  }, [isReschedule, existingAppointment, services])

  // Pre-seleccionar usuario cuando se cargan los usuarios en modo reagendar
  useEffect(() => {
    if (isReschedule && existingAppointment?.userId && users.length > 0) {
      const existingUser = users.find(u => u.id === existingAppointment.userId)
      if (existingUser) {
        setSelectedUser(existingUser)
      }
    }
  }, [isReschedule, existingAppointment, users])

  // Load blocks when date or user changes
  useEffect(() => {
    if (date) {
      fetchAvailableBlocks()
    }
  }, [date, selectedUser])

  // Search contacts
  useEffect(() => {
    if (contactSearch.length >= 2 && !lockContact) {
      searchContacts(contactSearch)
    }
  }, [contactSearch, lockContact])

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true)
      const response = await api.get('/users')
      setUsers(response.data.users || response.data || [])
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setLoadingUsers(false)
    }
  }

  const fetchServices = async () => {
    try {
      setLoadingServices(true)
      const data = await appointmentService.getServices(true)
      setServices(data)
    } catch (error) {
      console.error('Error fetching services:', error)
    } finally {
      setLoadingServices(false)
    }
  }

  const fetchReminderTemplates = async () => {
    try {
      setLoadingTemplates(true)
      const response = await api.get('/appointments/reminders/templates')
      const templates = response.data || []
      // Solo mostrar plantillas activas
      setReminderTemplates(templates.filter((t: ReminderTemplate) => t.isActive))
    } catch (error) {
      console.error('Error fetching reminder templates:', error)
    } finally {
      setLoadingTemplates(false)
    }
  }

  const fetchAvailableBlocks = async () => {
    try {
      setLoadingBlocks(true)
      setSelectedBlock(null)

      const params: any = { date }
      if (selectedUser) {
        params.userId = selectedUser.id
      }
      if (selectedService) {
        params.serviceId = selectedService.id
      }

      const response = await api.get('/appointments/availability/blocks-for-date', { params })
      setAvailableBlocks(response.data || [])
    } catch (error) {
      console.error('Error fetching available blocks:', error)
      setAvailableBlocks([])
    } finally {
      setLoadingBlocks(false)
    }
  }

  const searchContacts = async (query: string) => {
    try {
      setLoadingContacts(true)
      const response = await api.get('/contacts', {
        params: { searchParam: query, pageNumber: 1 }
      })
      setContacts(response.data.contacts || response.data || [])
    } catch (error) {
      console.error('Error searching contacts:', error)
    } finally {
      setLoadingContacts(false)
    }
  }

  const handleServiceChange = (_event: React.SyntheticEvent | null, value: string | null) => {
    const service = services.find(s => String(s.id) === value)
    setSelectedService(service || null)
    if (service) {
      setTitle(service.name)
    }
    // Refetch blocks when service changes
    if (date) {
      fetchAvailableBlocks()
    }
  }

  const handleUserChange = (_event: React.SyntheticEvent | null, value: string | null) => {
    const user = users.find(u => String(u.id) === value)
    setSelectedUser(user || null)
  }

  const handleTemplateChange = (_event: React.SyntheticEvent | null, value: string | null) => {
    const template = reminderTemplates.find(t => String(t.id) === value)
    setSelectedTemplate(template || null)
  }

  const handleBlockSelect = (block: AvailabilityBlock) => {
    if (!block.isBooked) {
      setSelectedBlock(block)
    }
  }

  const calculateEndTime = () => {
    if (!selectedBlock || !selectedService) return selectedBlock?.endTime || ''

    // Parse start time
    const [hours, minutes] = selectedBlock.startTime.split(':').map(Number)
    const startMinutes = hours * 60 + minutes
    const endMinutes = startMinutes + selectedService.duration
    const endHours = Math.floor(endMinutes / 60)
    const endMins = endMinutes % 60
    return `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`
  }

  const handleSubmit = async () => {
    // Validations
    if (!selectedContact) {
      toast.error('Selecciona un contacto')
      return
    }
    if (!selectedService) {
      toast.error('Selecciona un servicio')
      return
    }
    if (!date) {
      toast.error('Selecciona una fecha')
      return
    }
    if (!selectedBlock) {
      toast.error('Selecciona un bloque de horario')
      return
    }

    try {
      setSaving(true)

      // Formatear hora correctamente (asegurar formato HH:mm)
      const formatTimeForISO = (time: string) => {
        const parts = time.split(':')
        const hours = parts[0].padStart(2, '0')
        const minutes = (parts[1] || '00').padStart(2, '0')
        return `${hours}:${minutes}`
      }

      const formattedStartTime = formatTimeForISO(selectedBlock.startTime)
      const startTime = `${date}T${formattedStartTime}:00`

      // Modo reagendamiento
      if (isReschedule && existingAppointment) {
        await api.post(`/appointments/appointments/${existingAppointment.id}/reschedule`, {
          newStartTime: startTime
        })

        // Liberar bloque anterior y marcar nuevo como reservado
        try {
          await api.post(`/appointments/availability/release/${existingAppointment.id}`)
          await api.post('/appointments/availability/mark-booked', {
            blockId: selectedBlock.id,
            appointmentId: existingAppointment.id
          })
        } catch (blockError) {
          console.warn('Could not update block status:', blockError)
        }

        toast.success('Cita reagendada exitosamente')
      } else {
        // Modo creación normal
        const formattedEndTime = formatTimeForISO(calculateEndTime())
        const endTime = `${date}T${formattedEndTime}:00`

        const appointmentData: CreateAppointmentData = {
          serviceId: selectedService.id,
          userId: selectedUser?.id,
          contactId: selectedContact.id,
          reminderTemplateId: selectedTemplate?.id,
          title: title || selectedService.name,
          description: notes,
          startTime,
          endTime,
          attendeeName: selectedContact.name,
          attendeePhone: selectedContact.number,
          attendeeEmail: selectedContact.email,
          locationType,
          notes,
        }

        const newAppointment = await appointmentService.createAppointment(appointmentData)

        // Mark the block as booked
        try {
          await api.post('/appointments/availability/mark-booked', {
            blockId: selectedBlock.id,
            appointmentId: newAppointment.id
          })
        } catch (markError) {
          console.warn('Could not mark block as booked:', markError)
        }

        toast.success('Cita creada exitosamente')
      }

      handleClose()
      onSuccess?.()
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.response?.data?.error || (isReschedule ? 'Error al reagendar la cita' : 'Error al crear la cita'))
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    // Reset form
    if (!lockContact) {
      setSelectedContact(null)
    }
    setSelectedUser(null)
    setSelectedService(null)
    setSelectedBlock(null)
    setSelectedTemplate(null)
    setContactSearch('')
    setDate('')
    setLocationType('presencial')
    setNotes('')
    setTitle('')
    setAvailableBlocks([])
    onClose()
  }

  const formatTime = (time: string) => {
    if (!time) return ''
    const [hours, minutes] = time.split(':')
    const hour = parseInt(hours)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const hour12 = hour % 12 || 12
    return `${hour12}:${minutes} ${ampm}`
  }

  return (
    <Modal open={open} onClose={handleClose}>
      <ModalDialog sx={{ minWidth: 600, maxWidth: 700, maxHeight: '90vh', overflow: 'auto' }}>
        <ModalClose />
        <Typography level="h4" sx={{ mb: 2 }}>
          {isReschedule ? 'Reagendar Cita' : 'Nueva Cita'}
        </Typography>

        <Stack spacing={2}>
          {/* Info de cita existente en modo reagendar */}
          {isReschedule && existingAppointment && (
            <Box
              sx={{
                p: 2,
                bgcolor: 'warning.softBg',
                borderRadius: 'sm',
                border: '1px solid',
                borderColor: 'warning.outlinedBorder',
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <EventIcon sx={{ color: 'warning.600' }} />
                <Typography level="title-sm" sx={{ color: 'warning.800' }}>
                  Cita Actual
                </Typography>
              </Stack>
              <Typography level="body-sm">
                <strong>Servicio:</strong> {existingAppointment.service?.name || existingAppointment.title}
              </Typography>
              <Typography level="body-sm">
                <strong>Fecha:</strong> {new Date(existingAppointment.startTime).toLocaleDateString('es-ES', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </Typography>
              {existingAppointment.user && (
                <Typography level="body-sm">
                  <strong>Asignado a:</strong> {existingAppointment.user.name}
                </Typography>
              )}
            </Box>
          )}

          {/* Contact Selection */}
          <FormControl required>
            <FormLabel>Cliente / Contacto</FormLabel>
            {lockContact && selectedContact ? (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  p: 1.5,
                  border: '1px solid',
                  borderColor: 'neutral.outlinedBorder',
                  borderRadius: 'sm',
                  bgcolor: 'background.level1',
                }}
              >
                <PersonIcon sx={{ color: 'primary.main' }} />
                <Box>
                  <Typography level="body-sm" fontWeight="md">
                    {selectedContact.name}
                  </Typography>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                    {selectedContact.number}
                  </Typography>
                </Box>
              </Box>
            ) : (
              <Autocomplete
                placeholder="Buscar contacto..."
                options={contacts}
                value={selectedContact}
                onChange={(_event, value) => setSelectedContact(value)}
                inputValue={contactSearch}
                onInputChange={(_event, value) => setContactSearch(value)}
                getOptionLabel={(option) => option.name}
                loading={loadingContacts}
                startDecorator={<SearchIcon />}
                renderOption={(props, option) => (
                  <Box component="li" {...props} key={option.id}>
                    <Stack>
                      <Typography level="body-sm">{option.name}</Typography>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        {option.number}
                      </Typography>
                    </Stack>
                  </Box>
                )}
                noOptionsText={
                  contactSearch.length < 2
                    ? 'Escribe al menos 2 caracteres'
                    : 'No se encontraron contactos'
                }
              />
            )}
          </FormControl>

          {/* Service Selection */}
          <FormControl required>
            <FormLabel>Servicio</FormLabel>
            <Select
              placeholder="Seleccionar servicio"
              value={selectedService ? String(selectedService.id) : ''}
              onChange={handleServiceChange}
              disabled={loadingServices || isReschedule}
              startDecorator={loadingServices ? <CircularProgress size="sm" /> : null}
            >
              {services.map((service) => (
                <Option key={service.id} value={String(service.id)}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        bgcolor: service.color || '#3b82f6',
                      }}
                    />
                    <span>{service.name}</span>
                    <Chip size="sm" variant="soft">
                      {service.duration} min
                    </Chip>
                    {service.price && (
                      <Chip size="sm" variant="outlined">
                        ${service.price}
                      </Chip>
                    )}
                  </Box>
                </Option>
              ))}
            </Select>
          </FormControl>

          {/* User Assignment */}
          <FormControl>
            <FormLabel>Asignar a</FormLabel>
            <Select
              placeholder="Seleccionar usuario"
              value={selectedUser ? String(selectedUser.id) : ''}
              onChange={handleUserChange}
              disabled={loadingUsers}
              startDecorator={loadingUsers ? <CircularProgress size="sm" /> : null}
            >
              {users.map((user) => (
                <Option key={user.id} value={String(user.id)}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PersonIcon sx={{ fontSize: 18 }} />
                    <span>{user.name}</span>
                    {user.profile && (
                      <Chip size="sm" variant="soft" color="neutral">
                        {user.profile}
                      </Chip>
                    )}
                  </Box>
                </Option>
              ))}
            </Select>
          </FormControl>

          {/* Date Selection */}
          <FormControl required>
            <FormLabel>Fecha</FormLabel>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              slotProps={{
                input: {
                  min: new Date().toISOString().split('T')[0],
                },
              }}
            />
          </FormControl>

          {/* Time Blocks Selection */}
          <FormControl required>
            <FormLabel>Horario disponible</FormLabel>
            {loadingBlocks ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <CircularProgress size="sm" />
              </Box>
            ) : availableBlocks.length === 0 ? (
              <Box sx={{ p: 2, textAlign: 'center', bgcolor: 'background.level1', borderRadius: 'sm' }}>
                <BusyIcon sx={{ fontSize: 40, opacity: 0.3, mb: 1 }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  {date ? 'No hay bloques de disponibilidad para esta fecha' : 'Selecciona una fecha primero'}
                </Typography>
              </Box>
            ) : (
              <Grid container spacing={1}>
                {availableBlocks.map((block) => (
                  <Grid key={block.id} xs={6} sm={4}>
                    <Card
                      variant={selectedBlock?.id === block.id ? 'solid' : 'outlined'}
                      color={selectedBlock?.id === block.id ? 'primary' : block.isBooked ? 'danger' : 'neutral'}
                      sx={{
                        p: 1.5,
                        cursor: block.isBooked ? 'not-allowed' : 'pointer',
                        opacity: block.isBooked ? 0.5 : 1,
                        transition: 'all 0.2s',
                        '&:hover': block.isBooked ? {} : {
                          borderColor: 'primary.main',
                          transform: 'scale(1.02)',
                        },
                      }}
                      onClick={() => handleBlockSelect(block)}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {block.isBooked ? (
                            <BusyIcon sx={{ fontSize: 16 }} />
                          ) : selectedBlock?.id === block.id ? (
                            <CheckIcon sx={{ fontSize: 16 }} />
                          ) : (
                            <TimeIcon sx={{ fontSize: 16 }} />
                          )}
                          <Typography
                            level="body-sm"
                            fontWeight="md"
                            sx={{
                              color: selectedBlock?.id === block.id ? 'white' : 'inherit',
                            }}
                          >
                            {formatTime(block.startTime)}
                          </Typography>
                        </Box>
                      </Box>
                      <Typography
                        level="body-xs"
                        sx={{
                          color: selectedBlock?.id === block.id ? 'white' : 'text.tertiary',
                          mt: 0.5,
                        }}
                      >
                        {block.isBooked ? 'Reservado' : `hasta ${formatTime(block.endTime)}`}
                      </Typography>
                      {block.userName && (
                        <Typography
                          level="body-xs"
                          sx={{
                            color: selectedBlock?.id === block.id ? 'white' : 'text.tertiary',
                          }}
                        >
                          {block.userName}
                        </Typography>
                      )}
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </FormControl>

          {/* Show duration info */}
          {selectedService && selectedBlock && (
            <Box sx={{ p: 1.5, bgcolor: 'primary.softBg', borderRadius: 'sm' }}>
              <Typography level="body-sm">
                Duracion: {selectedService.duration} minutos
                {` (${formatTime(selectedBlock.startTime)} - ${formatTime(calculateEndTime())})`}
              </Typography>
            </Box>
          )}

          {/* Reminder Template Selection */}
          <FormControl>
            <FormLabel>Plantilla de Recordatorio</FormLabel>
            <Select
              placeholder="Seleccionar plantilla (opcional)"
              value={selectedTemplate ? String(selectedTemplate.id) : ''}
              onChange={handleTemplateChange}
              disabled={loadingTemplates}
              startDecorator={loadingTemplates ? <CircularProgress size="sm" /> : <NotificationsIcon sx={{ fontSize: 18 }} />}
            >
              <Option value="">Sin recordatorio</Option>
              {reminderTemplates.map((template) => (
                <Option key={template.id} value={String(template.id)}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                      size="sm"
                      variant="soft"
                      color={template.channel === 'whatsapp' ? 'success' : 'primary'}
                    >
                      {template.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}
                    </Chip>
                    <span>{template.name}</span>
                    <Chip size="sm" variant="outlined" color="neutral">
                      {template.timing}h antes
                    </Chip>
                  </Box>
                </Option>
              ))}
            </Select>
          </FormControl>

          {/* Location Type */}
          <FormControl>
            <FormLabel>Tipo de Cita</FormLabel>
            <Select
              value={locationType}
              onChange={(_event, value) => value && setLocationType(value as 'presencial' | 'virtual' | 'telefonica')}
            >
              <Option value="presencial">Presencial</Option>
              <Option value="virtual">Virtual</Option>
              <Option value="telefonica">Telefonica</Option>
            </Select>
          </FormControl>

          {/* Title (optional override) */}
          <FormControl>
            <FormLabel>Titulo (opcional)</FormLabel>
            <Input
              placeholder={selectedService?.name || 'Titulo de la cita'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </FormControl>

          {/* Notes */}
          <FormControl>
            <FormLabel>Notas (opcional)</FormLabel>
            <Textarea
              placeholder="Agregar notas sobre la cita..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              minRows={2}
              maxRows={4}
            />
          </FormControl>

          {/* Actions */}
          <Stack direction="row" spacing={1} sx={{ pt: 1 }}>
            <Button
              fullWidth
              variant="outlined"
              color="neutral"
              onClick={handleClose}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              fullWidth
              color={isReschedule ? 'warning' : 'primary'}
              startDecorator={saving ? <CircularProgress size="sm" /> : isReschedule ? <RescheduleIcon /> : <AddIcon />}
              onClick={handleSubmit}
              disabled={saving || !selectedContact || !selectedService || !date || !selectedBlock}
              loading={saving}
            >
              {isReschedule ? 'Reagendar Cita' : 'Crear Cita'}
            </Button>
          </Stack>
        </Stack>
      </ModalDialog>
    </Modal>
  )
}
