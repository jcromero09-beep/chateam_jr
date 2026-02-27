import { useState, useEffect } from 'react'
import {
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
  Box,
  Grid,
  FormControl,
  FormLabel,
  Input,
  Select,
  Option,
  Textarea,
  Button,
  Alert,
  CircularProgress,
} from '@mui/joy'
import { toast } from 'react-toastify'
import appointmentService, { CreateAppointmentData } from '../services/appointmentService'

interface Service {
  id: number
  name: string
  duration: number
  price?: number
}

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

interface NewAppointmentModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  services: Service[]
  users: User[]
  contacts: Contact[]
}

export default function NewAppointmentModal({
  open,
  onClose,
  onSuccess,
  services,
  users,
  contacts
}: NewAppointmentModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState<CreateAppointmentData>({
    serviceId: 0,
    title: '',
    description: '',
    startTime: '',
    endTime: '',
    timezone: 'America/Guayaquil',
    attendeeName: '',
    attendeeEmail: '',
    attendeePhone: '',
    attendeeCount: 1,
    location: '',
    locationType: 'in_person',
    meetingUrl: '',
    meetingPlatform: '',
    notes: '',
    sendReminders: true
  })

  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedStartTime, setSelectedStartTime] = useState<string>('')
  const [selectedEndTime, setSelectedEndTime] = useState<string>('')

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setFormData({
        serviceId: 0,
        title: '',
        description: '',
        startTime: '',
        endTime: '',
        timezone: 'America/Guayaquil',
        attendeeName: '',
        attendeeEmail: '',
        attendeePhone: '',
        attendeeCount: 1,
        location: '',
        locationType: 'in_person',
        meetingUrl: '',
        meetingPlatform: '',
        notes: '',
        sendReminders: true
      })
      setSelectedDate('')
      setSelectedStartTime('')
      setSelectedEndTime('')
      setError(null)
    }
  }, [open])

  // Auto-fill end time when service is selected
  useEffect(() => {
    if (formData.serviceId && selectedStartTime && selectedDate) {
      const service = services.find(s => s.id === formData.serviceId)
      if (service && selectedStartTime) {
        const [hours, minutes] = selectedStartTime.split(':').map(Number)
        const startDateTime = new Date(selectedDate + 'T' + selectedStartTime)
        const endDateTime = new Date(startDateTime.getTime() + service.duration * 60000)
        const endTimeStr = endDateTime.toTimeString().slice(0, 5)
        setSelectedEndTime(endTimeStr)
      }
    }
  }, [formData.serviceId, selectedStartTime, selectedDate, services])

  // Update form data when date/time changes
  useEffect(() => {
    if (selectedDate && selectedStartTime && selectedEndTime) {
      const startDateTime = new Date(selectedDate + 'T' + selectedStartTime)
      const endDateTime = new Date(selectedDate + 'T' + selectedEndTime)

      setFormData(prev => ({
        ...prev,
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString()
      }))
    }
  }, [selectedDate, selectedStartTime, selectedEndTime])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.serviceId || !formData.title || !formData.startTime || !formData.endTime) {
      setError('Por favor complete todos los campos requeridos')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await appointmentService.createAppointment(formData)
      toast.success('Cita creada exitosamente')
      onSuccess()
      onClose()
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Error al crear la cita'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: keyof CreateAppointmentData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ minWidth: 600, maxWidth: 800 }}>
        <ModalClose />
        <Typography level="h4" sx={{ mb: 2 }}>
          Nueva Cita
        </Typography>

          <Box component="form" onSubmit={handleSubmit}>
            {error && (
              <Alert color="danger" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Grid container spacing={2}>
              {/* Service Selection */}
              <Grid xs={12} md={6}>
                <FormControl required>
                  <FormLabel>Servicio</FormLabel>
                  <Select
                    value={formData.serviceId ? formData.serviceId.toString() : ''}
                    onChange={(_, value) => handleInputChange('serviceId', value ? parseInt(value) : 0)}
                    placeholder="Seleccionar servicio"
                  >
                    {services.map((service) => (
                      <Option key={service.id} value={service.id.toString()}>
                        {service.name} - ${service.price} ({service.duration}min)
                      </Option>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              {/* Assigned User */}
              <Grid xs={12} md={6}>
                <FormControl>
                  <FormLabel>Usuario Asignado</FormLabel>
                  <Select
                    value={formData.userId ? formData.userId.toString() : ''}
                    onChange={(_, value) => handleInputChange('userId', value ? parseInt(value) : undefined)}
                    placeholder="Seleccionar usuario"
                  >
                    {users.map((user) => (
                      <Option key={user.id} value={user.id.toString()}>
                        {user.name}
                      </Option>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              {/* Title */}
              <Grid xs={12}>
                <FormControl required>
                  <FormLabel>Título</FormLabel>
                  <Input
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    placeholder="Título de la cita"
                  />
                </FormControl>
              </Grid>

              {/* Date */}
              <Grid xs={12} md={4}>
                <FormControl required>
                  <FormLabel>Fecha</FormLabel>
                  <Input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                  />
                </FormControl>
              </Grid>

              {/* Start Time */}
              <Grid xs={12} md={4}>
                <FormControl required>
                  <FormLabel>Hora Inicio</FormLabel>
                  <Input
                    type="time"
                    value={selectedStartTime}
                    onChange={(e) => setSelectedStartTime(e.target.value)}
                  />
                </FormControl>
              </Grid>

              {/* End Time */}
              <Grid xs={12} md={4}>
                <FormControl required>
                  <FormLabel>Hora Fin</FormLabel>
                  <Input
                    type="time"
                    value={selectedEndTime}
                    onChange={(e) => setSelectedEndTime(e.target.value)}
                  />
                </FormControl>
              </Grid>

              {/* Contact */}
              <Grid xs={12} md={6}>
                <FormControl>
                  <FormLabel>Contacto</FormLabel>
                  <Select
                    value={formData.contactId ? formData.contactId.toString() : ''}
                    onChange={(_, value) => handleInputChange('contactId', value ? parseInt(value) : undefined)}
                    placeholder="Seleccionar contacto"
                  >
                    {contacts.map((contact) => (
                      <Option key={contact.id} value={contact.id.toString()}>
                        {contact.name} - {contact.phone}
                      </Option>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              {/* Attendee Count */}
              <Grid xs={12} md={6}>
                <FormControl>
                  <FormLabel>Número de Asistentes</FormLabel>
                  <Input
                    type="number"
                    value={formData.attendeeCount || 1}
                    onChange={(e) => handleInputChange('attendeeCount', parseInt(e.target.value))}
                    slotProps={{
                      input: {
                        min: 1
                      }
                    }}
                  />
                </FormControl>
              </Grid>

              {/* Attendee Name */}
              <Grid xs={12} md={4}>
                <FormControl>
                  <FormLabel>Nombre del Asistente</FormLabel>
                  <Input
                    value={formData.attendeeName || ''}
                    onChange={(e) => handleInputChange('attendeeName', e.target.value)}
                    placeholder="Nombre completo"
                  />
                </FormControl>
              </Grid>

              {/* Attendee Email */}
              <Grid xs={12} md={4}>
                <FormControl>
                  <FormLabel>Email del Asistente</FormLabel>
                  <Input
                    type="email"
                    value={formData.attendeeEmail || ''}
                    onChange={(e) => handleInputChange('attendeeEmail', e.target.value)}
                    placeholder="email@ejemplo.com"
                  />
                </FormControl>
              </Grid>

              {/* Attendee Phone */}
              <Grid xs={12} md={4}>
                <FormControl>
                  <FormLabel>Teléfono del Asistente</FormLabel>
                  <Input
                    value={formData.attendeePhone || ''}
                    onChange={(e) => handleInputChange('attendeePhone', e.target.value)}
                    placeholder="+593 99 123 4567"
                  />
                </FormControl>
              </Grid>

              {/* Location Type */}
              <Grid xs={12} md={6}>
                <FormControl>
                  <FormLabel>Tipo de Ubicación</FormLabel>
                  <Select
                    value={formData.locationType || 'in_person'}
                    onChange={(_, value) => handleInputChange('locationType', value)}
                  >
                    <Option value="in_person">Presencial</Option>
                    <Option value="remote">Remoto</Option>
                    <Option value="phone">Teléfono</Option>
                  </Select>
                </FormControl>
              </Grid>

              {/* Location */}
              <Grid xs={12} md={6}>
                <FormControl>
                  <FormLabel>Ubicación</FormLabel>
                  <Input
                    value={formData.location || ''}
                    onChange={(e) => handleInputChange('location', e.target.value)}
                    placeholder="Dirección o ubicación"
                  />
                </FormControl>
              </Grid>

              {/* Meeting URL */}
              {(formData.locationType === 'remote' || formData.locationType === 'phone') && (
                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>URL de Reunión / Número</FormLabel>
                    <Input
                      value={formData.meetingUrl || ''}
                      onChange={(e) => handleInputChange('meetingUrl', e.target.value)}
                      placeholder="https://meet.google.com/... o +593..."
                    />
                  </FormControl>
                </Grid>
              )}

              {/* Meeting Platform */}
              {formData.locationType === 'remote' && (
                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Plataforma</FormLabel>
                    <Select
                      value={formData.meetingPlatform || ''}
                      onChange={(_, value) => handleInputChange('meetingPlatform', value)}
                      placeholder="Seleccionar plataforma"
                    >
                      <Option value="google_meet">Google Meet</Option>
                      <Option value="zoom">Zoom</Option>
                      <Option value="teams">Microsoft Teams</Option>
                      <Option value="whatsapp">WhatsApp</Option>
                      <Option value="other">Otro</Option>
                    </Select>
                  </FormControl>
                </Grid>
              )}

              {/* Description */}
              <Grid xs={12}>
                <FormControl>
                  <FormLabel>Descripción</FormLabel>
                  <Textarea
                    value={formData.description || ''}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    placeholder="Descripción detallada de la cita"
                    minRows={2}
                  />
                </FormControl>
              </Grid>

              {/* Notes */}
              <Grid xs={12}>
                <FormControl>
                  <FormLabel>Notas Internas</FormLabel>
                  <Textarea
                    value={formData.notes || ''}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    placeholder="Notas internas (no visibles para el cliente)"
                    minRows={2}
                  />
                </FormControl>
              </Grid>
            </Grid>

            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 3 }}>
              <Button variant="outlined" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                type="submit"
                loading={loading}
                disabled={loading}
              >
                {loading ? <CircularProgress size="sm" /> : 'Crear Cita'}
              </Button>
            </Box>
          </Box>
        </ModalDialog>
      </Modal>
  )
}