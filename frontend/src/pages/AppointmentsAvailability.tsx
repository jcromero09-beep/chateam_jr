import { useState, useEffect } from 'react'
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Button,
  IconButton,
  Switch,
  FormControl,
  FormLabel,
  Input,
  Divider,
  Modal,
  ModalDialog,
  ModalClose,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  CircularProgress,
} from '@mui/joy'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ContentCopy as CopyIcon,
  Schedule as ScheduleIcon,
  EventBusy as EventBusyIcon,
  CalendarMonth as CalendarIcon,
  AccessTime as TimeIcon,
  Save as SaveIcon,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
import api from '../services/api'

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

export default function AppointmentsAvailability() {
  const [schedule, setSchedule] = useState<DaySchedule[]>(defaultDaySchedule)
  const [exceptions, setExceptions] = useState<Exception[]>([])
  const [openExceptionModal, setOpenExceptionModal] = useState(false)
  const [exceptionForm, setExceptionForm] = useState({
    title: '',
    date: '',
    reason: '',
    isRecurring: false,
  })
  const [activeTab, setActiveTab] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingException, setSavingException] = useState(false)

  // Cargar disponibilidad existente
  useEffect(() => {
    fetchAvailability()
    fetchExceptions()
  }, [])

  const fetchAvailability = async () => {
    setLoading(true)
    try {
      const userStr = localStorage.getItem('user')
      const user = userStr ? JSON.parse(userStr) : null
      const userId = user?.id || 1

      const { data } = await api.get(`/appointments/availability/user/${userId}`)

      if (data && data.length > 0) {
        // Agrupar los datos por día de la semana
        const groupedByDay = new Map<number, Array<{ startTime: string; endTime: string; isAvailable: boolean }>>()

        data.forEach((record: any) => {
          const dayRecords = groupedByDay.get(record.dayOfWeek) || []
          dayRecords.push({
            startTime: record.startTime,
            endTime: record.endTime,
            isAvailable: record.isAvailable
          })
          groupedByDay.set(record.dayOfWeek, dayRecords)
        })

        // Mapear los datos del backend al formato del frontend
        const mappedSchedule = defaultDaySchedule.map(day => {
          const dayRecords = groupedByDay.get(day.dayOfWeek)
          if (dayRecords && dayRecords.length > 0) {
            return {
              ...day,
              enabled: dayRecords.some(r => r.isAvailable),
              slots: dayRecords.map(r => ({
                start: r.startTime,
                end: r.endTime,
                enabled: r.isAvailable
              }))
            }
          }
          return day
        })
        setSchedule(mappedSchedule)
      }
    } catch (error) {
      console.error('Error fetching availability:', error)
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
    setSaving(true)
    try {
      const payload = {
        schedule: schedule.map(day => ({
          dayOfWeek: day.dayOfWeek,
          enabled: day.enabled,
          slots: day.slots
        })),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
      console.log('Saving availability:', payload)

      const result = await api.post('/appointments/availability/bulk', payload)

      console.log('Save result:', result.data)
      toast.success(`Disponibilidad guardada: ${result.data.saved} bloques guardados`)
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
            Configuración de Disponibilidad
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Define los horarios disponibles para agendar citas
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="solid"
            color="primary"
            startDecorator={<SaveIcon />}
            onClick={handleSaveSchedule}
            loading={saving}
          >
            Guardar Cambios
          </Button>
        </Box>
      </Box>

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={3}>
          <Card variant="soft" color="primary">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <ScheduleIcon sx={{ fontSize: 32 }} />
                <Box>
                  <Typography level="body-sm">Horas/Semana</Typography>
                  <Typography level="h4">{totalHoursPerWeek.toFixed(1)}h</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card variant="soft" color="success">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <CalendarIcon sx={{ fontSize: 32 }} />
                <Box>
                  <Typography level="body-sm">Días Activos</Typography>
                  <Typography level="h4">{schedule.filter((d) => d.enabled).length}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card variant="soft" color="warning">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <TimeIcon sx={{ fontSize: 32 }} />
                <Box>
                  <Typography level="body-sm">Bloques Horarios</Typography>
                  <Typography level="h4">{schedule.reduce((sum, d) => sum + (d.enabled ? d.slots.filter(s => s.enabled).length : 0), 0)}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card variant="soft" color="danger">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <EventBusyIcon sx={{ fontSize: 32 }} />
                <Box>
                  <Typography level="body-sm">Excepciones</Typography>
                  <Typography level="h4">{exceptions.length}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Card>
        <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value as number)}>
          <TabList>
            <Tab>Horario Semanal</Tab>
            <Tab>Excepciones / Días No Disponibles</Tab>
          </TabList>

          {/* Weekly Schedule Tab */}
          <TabPanel value={0}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {schedule.map((day, dayIndex) => (
                <Card key={day.dayOfWeek} variant="outlined">
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Switch checked={day.enabled} onChange={() => handleToggleDay(dayIndex)} />
                        <Typography level="title-md" sx={{ opacity: day.enabled ? 1 : 0.5 }}>
                          {day.dayName}
                        </Typography>
                        {day.enabled && (
                          <Chip size="sm" variant="soft" color="primary">
                            {day.slots.filter((s) => s.enabled).length} bloques
                          </Chip>
                        )}
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          size="sm"
                          variant="outlined"
                          startDecorator={<CopyIcon />}
                          onClick={() => handleCopySchedule(dayIndex)}
                          disabled={!day.enabled}
                        >
                          Copiar a todos
                        </Button>
                        <Button
                          size="sm"
                          variant="outlined"
                          startDecorator={<AddIcon />}
                          onClick={() => handleAddSlot(dayIndex)}
                          disabled={!day.enabled}
                        >
                          Añadir Bloque
                        </Button>
                      </Box>
                    </Box>

                    {day.enabled && (
                      <Grid container spacing={2}>
                        {day.slots.map((slot, slotIndex) => (
                          <Grid key={slotIndex} xs={12} sm={6} md={4}>
                            <Card variant="soft" color={slot.enabled ? 'primary' : 'neutral'}>
                              <CardContent>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                  <Typography level="body-sm" fontWeight="md">
                                    Bloque {slotIndex + 1}
                                  </Typography>
                                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                                    <Switch
                                      size="sm"
                                      checked={slot.enabled}
                                      onChange={() => handleToggleSlot(dayIndex, slotIndex)}
                                    />
                                    <IconButton
                                      size="sm"
                                      variant="plain"
                                      color="danger"
                                      onClick={() => handleRemoveSlot(dayIndex, slotIndex)}
                                      disabled={day.slots.length === 1}
                                    >
                                      <DeleteIcon />
                                    </IconButton>
                                  </Box>
                                </Box>
                                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                  <Input
                                    type="time"
                                    value={slot.start}
                                    onChange={(e) => handleUpdateSlot(dayIndex, slotIndex, 'start', e.target.value)}
                                    disabled={!slot.enabled}
                                    size="sm"
                                  />
                                  <Typography level="body-sm">-</Typography>
                                  <Input
                                    type="time"
                                    value={slot.end}
                                    onChange={(e) => handleUpdateSlot(dayIndex, slotIndex, 'end', e.target.value)}
                                    disabled={!slot.enabled}
                                    size="sm"
                                  />
                                </Box>
                              </CardContent>
                            </Card>
                          </Grid>
                        ))}
                      </Grid>
                    )}

                    {!day.enabled && (
                      <Box sx={{ textAlign: 'center', py: 2, opacity: 0.5 }}>
                        <Typography level="body-sm">Día no disponible</Typography>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              ))}
            </Box>
          </TabPanel>

          {/* Exceptions Tab */}
          <TabPanel value={1}>
            <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between' }}>
              <Typography level="body-md">Gestiona días no disponibles (vacaciones, festivos, etc.)</Typography>
              <Button startDecorator={<AddIcon />} onClick={() => setOpenExceptionModal(true)}>
                Nueva Excepción
              </Button>
            </Box>

            <Grid container spacing={2}>
              {exceptions.length === 0 ? (
                <Grid xs={12}>
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <EventBusyIcon sx={{ fontSize: 48, opacity: 0.3, mb: 2 }} />
                    <Typography level="body-md" sx={{ opacity: 0.7 }}>
                      No hay excepciones configuradas
                    </Typography>
                  </Box>
                </Grid>
              ) : (
                exceptions.map((exception) => (
                  <Grid key={exception.id} xs={12} sm={6} md={4}>
                    <Card variant="outlined" sx={{ borderLeft: '4px solid var(--joy-palette-danger-500)' }}>
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                          <Typography level="title-md">{exception.title}</Typography>
                          <IconButton size="sm" variant="plain" color="danger" onClick={() => handleDeleteException(exception.id)}>
                            <DeleteIcon />
                          </IconButton>
                        </Box>
                        <Typography level="body-sm" sx={{ mb: 1, color: 'text.secondary' }}>
                          {formatExceptionDate(exception.startTime)}
                        </Typography>
                        {exception.reason && (
                          <Typography level="body-sm" sx={{ mb: 1 }}>
                            {exception.reason}
                          </Typography>
                        )}
                        {exception.isRecurring && (
                          <Chip size="sm" variant="outlined" startDecorator={<CalendarIcon />}>
                            Recurrente
                          </Chip>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                ))
              )}
            </Grid>
          </TabPanel>
        </Tabs>
      </Card>

      {/* Exception Modal */}
      <Modal open={openExceptionModal} onClose={() => setOpenExceptionModal(false)}>
        <ModalDialog sx={{ minWidth: 500 }}>
          <ModalClose />
          <Typography level="h4" sx={{ mb: 2 }}>
            Nueva Excepción / Día No Disponible
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl required>
              <FormLabel>Título</FormLabel>
              <Input
                value={exceptionForm.title}
                onChange={(e) => setExceptionForm({ ...exceptionForm, title: e.target.value })}
                placeholder="Ej: Vacaciones, Día festivo..."
              />
            </FormControl>

            <FormControl required>
              <FormLabel>Fecha</FormLabel>
              <Input
                type="date"
                value={exceptionForm.date}
                onChange={(e) => setExceptionForm({ ...exceptionForm, date: e.target.value })}
              />
            </FormControl>

            <FormControl>
              <FormLabel>Motivo (opcional)</FormLabel>
              <Input
                value={exceptionForm.reason}
                onChange={(e) => setExceptionForm({ ...exceptionForm, reason: e.target.value })}
                placeholder="Describe el motivo..."
              />
            </FormControl>

            <FormControl>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Switch
                  checked={exceptionForm.isRecurring}
                  onChange={(e) => setExceptionForm({ ...exceptionForm, isRecurring: e.target.checked })}
                />
                <Box>
                  <Typography level="body-sm" fontWeight="md">
                    Excepción recurrente
                  </Typography>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                    Se repetirá todos los años en esta fecha
                  </Typography>
                </Box>
              </Box>
            </FormControl>

            <Divider />

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
              <Button variant="plain" color="neutral" onClick={() => setOpenExceptionModal(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleSaveException}
                disabled={!exceptionForm.date || !exceptionForm.title}
                loading={savingException}
              >
                Guardar Excepción
              </Button>
            </Box>
          </Box>
        </ModalDialog>
      </Modal>
    </Container>
  )
}
