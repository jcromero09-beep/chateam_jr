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
import appointmentService, { Appointment, UpdateAppointmentData } from '../services/appointmentService'

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

interface EditAppointmentModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  appointment: Appointment | null
  services: Service[]
  users: User[]
  contacts: Contact[]
}

export default function EditAppointmentModal({
  open,
  onClose,
  onSuccess,
  appointment,
  services,
  users,
  contacts
}: EditAppointmentModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState<UpdateAppointmentData>({
    title: '',
    description: '',
    attendeeName: '',
    attendeeEmail: '',
    attendeePhone: '',
    attendeeCount: 1,
    location: '',
    locationType: 'in_person',
    meetingUrl: '',
    meetingPlatform: '',
    notes: ''
  })

  // Populate form when appointment changes
  useEffect(() => {
    if (appointment && open) {
      setFormData({
        title: appointment.title,
        description: appointment.description || '',
        attendeeName: appointment.attendeeName || '',
        attendeeEmail: appointment.attendeeEmail || '',
        attendeePhone: appointment.attendeePhone || '',
        attendeeCount: appointment.attendeeCount || 1,
        location: appointment.location || '',
        locationType: appointment.locationType || 'in_person',
        meetingUrl: appointment.meetingUrl || '',
        meetingPlatform: appointment.meetingPlatform || '',
        notes: appointment.notes || ''
      })
      setError(null)
    }
  }, [appointment, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!appointment || !formData.title) {
      setError('Por favor complete todos los campos requeridos')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await appointmentService.updateAppointment(appointment.id, formData)
      toast.success('Cita actualizada exitosamente')
      onSuccess()
      onClose()
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Error al actualizar la cita'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: keyof UpdateAppointmentData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  if (!appointment) return null

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ minWidth: 600, maxWidth: 800 }}>
        <ModalClose />
        <Typography level="h4" sx={{ mb: 2 }}>
          Editar Cita
        </Typography>

        <Box component="form" onSubmit={handleSubmit}>
          {error && (
            <Alert color="danger" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Grid container spacing={2}>
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

            {/* Service (read-only display) */}
            <Grid xs={12} md={6}>
              <FormControl>
                <FormLabel>Servicio</FormLabel>
                <Input
                  value={appointment.service?.name || 'N/A'}
                  disabled
                  sx={{ bgcolor: 'background.level1' }}
                />
              </FormControl>
            </Grid>

            {/* Assigned User (read-only display) */}
            <Grid xs={12} md={6}>
              <FormControl>
                <FormLabel>Usuario Asignado</FormLabel>
                <Input
                  value={appointment.assignedUser?.name || 'N/A'}
                  disabled
                  sx={{ bgcolor: 'background.level1' }}
                />
              </FormControl>
            </Grid>

            {/* Date/Time (read-only display) */}
            <Grid xs={12} md={4}>
              <FormControl>
                <FormLabel>Fecha</FormLabel>
                <Input
                  value={new Date(appointment.startTime).toLocaleDateString('es-ES')}
                  disabled
                  sx={{ bgcolor: 'background.level1' }}
                />
              </FormControl>
            </Grid>

            <Grid xs={12} md={4}>
              <FormControl>
                <FormLabel>Hora Inicio</FormLabel>
                <Input
                  value={new Date(appointment.startTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  disabled
                  sx={{ bgcolor: 'background.level1' }}
                />
              </FormControl>
            </Grid>

            <Grid xs={12} md={4}>
              <FormControl>
                <FormLabel>Hora Fin</FormLabel>
                <Input
                  value={new Date(appointment.endTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  disabled
                  sx={{ bgcolor: 'background.level1' }}
                />
              </FormControl>
            </Grid>

            {/* Contact (read-only display) */}
            <Grid xs={12} md={6}>
              <FormControl>
                <FormLabel>Contacto</FormLabel>
                <Input
                  value={appointment.contact?.name || 'N/A'}
                  disabled
                  sx={{ bgcolor: 'background.level1' }}
                />
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
              {loading ? <CircularProgress size="sm" /> : 'Actualizar Cita'}
            </Button>
          </Box>
        </Box>
      </ModalDialog>
    </Modal>
  )
}