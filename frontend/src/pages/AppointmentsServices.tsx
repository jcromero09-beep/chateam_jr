import { useState, useEffect } from 'react'
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Grid,
  Sheet,
  Chip,
  Button,
  IconButton,
  Table,
  Input,
  Textarea,
  Modal,
  ModalDialog,
  ModalClose,
  FormControl,
  FormLabel,
  Select,
  Option,
  Switch,
  Divider,
  Avatar,
  CircularProgress,
  Alert,
} from '@mui/joy'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  AccessTime as TimeIcon,
  AttachMoney as MoneyIcon,
  Category as CategoryIcon,
  TrendingUp as TrendingUpIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
import appointmentService, { AppointmentServiceType, CreateServiceData } from '../services/appointmentService'

interface Service extends AppointmentServiceType {
  bookingsCount?: number
  revenue?: number
}

const categories = ['Consulta', 'Evaluacion', 'Seguimiento', 'Especializada', 'Express', 'Otro']

export default function AppointmentsServices() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [showInactive, setShowInactive] = useState(false)
  const [openModal, setOpenModal] = useState(false)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [formData, setFormData] = useState<Partial<CreateServiceData>>({
    name: '',
    description: '',
    duration: 30,
    bufferTime: 0,
    price: 0,
    currency: 'USD',
    color: '#3b82f6',
    isActive: true,
    maxAttendees: 1,
    requiresConfirmation: false,
  })

  // Fetch services on mount
  useEffect(() => {
    fetchServices()
  }, [])

  const fetchServices = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await appointmentService.getServices(false)
      setServices(data.map(s => ({ ...s, bookingsCount: 0, revenue: 0 })))
    } catch (err: any) {
      console.error('Error fetching services:', err)
      setError(err.response?.data?.error || 'Error al cargar los servicios')
      toast.error('Error al cargar los servicios')
    } finally {
      setLoading(false)
    }
  }

  const filteredServices = services.filter((service) => {
    const matchesSearch =
      service.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (service.description || '').toLowerCase().includes(searchQuery.toLowerCase())
    const matchesActive = showInactive || service.isActive
    return matchesSearch && matchesActive
  })

  const handleOpenModal = (service?: Service) => {
    if (service) {
      setEditingService(service)
      setFormData({
        name: service.name,
        description: service.description || '',
        duration: service.duration,
        bufferTime: service.bufferTime || 0,
        price: service.price || 0,
        currency: service.currency || 'USD',
        color: service.color || '#3b82f6',
        isActive: service.isActive,
        maxAttendees: service.maxAttendees || 1,
        requiresConfirmation: service.requiresConfirmation || false,
      })
    } else {
      setEditingService(null)
      setFormData({
        name: '',
        description: '',
        duration: 30,
        bufferTime: 0,
        price: 0,
        currency: 'USD',
        color: '#3b82f6',
        isActive: true,
        maxAttendees: 1,
        requiresConfirmation: false,
      })
    }
    setOpenModal(true)
  }

  const handleCloseModal = () => {
    setOpenModal(false)
    setEditingService(null)
  }

  const handleSave = async () => {
    if (!formData.name || !formData.duration) {
      toast.error('Nombre y duracion son requeridos')
      return
    }

    try {
      setSaving(true)

      if (editingService) {
        // Update existing service
        const updated = await appointmentService.updateService(editingService.id, formData)
        setServices(services.map((s) => (s.id === editingService.id ? { ...updated, bookingsCount: s.bookingsCount, revenue: s.revenue } : s)))
        toast.success('Servicio actualizado exitosamente')
      } else {
        // Create new service
        const created = await appointmentService.createService(formData as CreateServiceData)
        setServices([...services, { ...created, bookingsCount: 0, revenue: 0 }])
        toast.success('Servicio creado exitosamente')
      }
      handleCloseModal()
    } catch (err: any) {
      console.error('Error saving service:', err)
      toast.error(err.response?.data?.error || 'Error al guardar el servicio')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Estas seguro de que quieres eliminar este servicio?')) {
      return
    }

    try {
      await appointmentService.deleteService(id)
      setServices(services.filter((s) => s.id !== id))
      toast.success('Servicio eliminado exitosamente')
    } catch (err: any) {
      console.error('Error deleting service:', err)
      toast.error(err.response?.data?.error || 'Error al eliminar el servicio')
    }
  }

  const handleToggleActive = async (service: Service) => {
    try {
      const updated = await appointmentService.updateService(service.id, { isActive: !service.isActive })
      setServices(services.map((s) => (s.id === service.id ? { ...updated, bookingsCount: s.bookingsCount, revenue: s.revenue } : s)))
      toast.success(updated.isActive ? 'Servicio activado' : 'Servicio desactivado')
    } catch (err: any) {
      console.error('Error toggling service:', err)
      toast.error('Error al cambiar el estado del servicio')
    }
  }

  const totalRevenue = services.reduce((sum, s) => sum + (s.revenue || 0), 0)
  const totalBookings = services.reduce((sum, s) => sum + (s.bookingsCount || 0), 0)
  const activeServices = services.filter((s) => s.isActive).length

  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ py: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <CircularProgress size="lg" />
      </Container>
    )
  }

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography level="h2" sx={{ mb: 0.5 }}>
            Gestion de Servicios
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Administra los servicios disponibles para agendamiento
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startDecorator={<RefreshIcon />} onClick={fetchServices}>
            Actualizar
          </Button>
          <Button startDecorator={<AddIcon />} onClick={() => handleOpenModal()}>
            Nuevo Servicio
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert color="danger" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={3}>
          <Card variant="soft" color="primary">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <CategoryIcon sx={{ fontSize: 32 }} />
                <Box>
                  <Typography level="body-sm">Total Servicios</Typography>
                  <Typography level="h4">{services.length}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card variant="soft" color="success">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <VisibilityIcon sx={{ fontSize: 32 }} />
                <Box>
                  <Typography level="body-sm">Servicios Activos</Typography>
                  <Typography level="h4">{activeServices}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card variant="soft" color="warning">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <TrendingUpIcon sx={{ fontSize: 32 }} />
                <Box>
                  <Typography level="body-sm">Total Reservas</Typography>
                  <Typography level="h4">{totalBookings}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card variant="soft" color="neutral">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <MoneyIcon sx={{ fontSize: 32 }} />
                <Box>
                  <Typography level="body-sm">Ingresos Totales</Typography>
                  <Typography level="h4">${totalRevenue.toLocaleString()}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Input
              placeholder="Buscar servicios..."
              startDecorator={<SearchIcon />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{ minWidth: 300, flexGrow: 1 }}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography level="body-sm">Mostrar inactivos:</Typography>
              <Switch checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Services Table */}
      <Card>
        <Sheet sx={{ overflow: 'auto' }}>
          <Table>
            <thead>
              <tr>
                <th style={{ width: 60 }}>Color</th>
                <th>Nombre</th>
                <th>Duracion</th>
                <th>Buffer</th>
                <th>Precio</th>
                <th>Max. Asistentes</th>
                <th>Estado</th>
                <th style={{ width: 140 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredServices.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                      {services.length === 0 ? 'No hay servicios creados. Crea tu primer servicio.' : 'No se encontraron servicios con los filtros aplicados.'}
                    </Typography>
                  </td>
                </tr>
              ) : (
                filteredServices.map((service) => (
                  <tr key={service.id}>
                    <td>
                      <Avatar
                        sx={{
                          bgcolor: service.color || '#3b82f6',
                          width: 32,
                          height: 32,
                        }}
                      >
                        {' '}
                      </Avatar>
                    </td>
                    <td>
                      <Box>
                        <Typography level="body-sm" fontWeight="md">
                          {service.name}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          {service.description || 'Sin descripcion'}
                        </Typography>
                      </Box>
                    </td>
                    <td>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <TimeIcon sx={{ fontSize: 16, color: 'text.tertiary' }} />
                        <Typography level="body-sm">{service.duration} min</Typography>
                      </Box>
                    </td>
                    <td>
                      <Typography level="body-sm">{service.bufferTime || 0} min</Typography>
                    </td>
                    <td>
                      <Typography level="body-sm" fontWeight="md">
                        ${service.price || 0} {service.currency || 'USD'}
                      </Typography>
                    </td>
                    <td>
                      <Typography level="body-sm">{service.maxAttendees || 1}</Typography>
                    </td>
                    <td>
                      <Chip size="sm" color={service.isActive ? 'success' : 'neutral'}>
                        {service.isActive ? 'Activo' : 'Inactivo'}
                      </Chip>
                    </td>
                    <td>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton
                          size="sm"
                          variant="soft"
                          color={service.isActive ? 'neutral' : 'success'}
                          onClick={() => handleToggleActive(service)}
                        >
                          {service.isActive ? <VisibilityOffIcon /> : <VisibilityIcon />}
                        </IconButton>
                        <IconButton size="sm" variant="soft" color="primary" onClick={() => handleOpenModal(service)}>
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          size="sm"
                          variant="soft"
                          color="danger"
                          onClick={() => handleDelete(service.id)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Box>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Sheet>
      </Card>

      {/* Create/Edit Modal */}
      <Modal open={openModal} onClose={handleCloseModal}>
        <ModalDialog sx={{ minWidth: 600 }}>
          <ModalClose />
          <Typography level="h4" sx={{ mb: 2 }}>
            {editingService ? 'Editar Servicio' : 'Nuevo Servicio'}
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl required>
              <FormLabel>Nombre del Servicio</FormLabel>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej: Consulta General"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Descripcion</FormLabel>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe el servicio..."
                minRows={3}
              />
            </FormControl>

            <Grid container spacing={2}>
              <Grid xs={12} sm={4}>
                <FormControl required>
                  <FormLabel>Duracion (min)</FormLabel>
                  <Input
                    type="number"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 0 })}
                    slotProps={{
                      input: {
                        min: 15,
                        step: 15,
                      },
                    }}
                  />
                </FormControl>
              </Grid>
              <Grid xs={12} sm={4}>
                <FormControl>
                  <FormLabel>Buffer (min)</FormLabel>
                  <Input
                    type="number"
                    value={formData.bufferTime}
                    onChange={(e) => setFormData({ ...formData, bufferTime: parseInt(e.target.value) || 0 })}
                    slotProps={{
                      input: {
                        min: 0,
                        step: 5,
                      },
                    }}
                  />
                </FormControl>
              </Grid>
              <Grid xs={12} sm={4}>
                <FormControl>
                  <FormLabel>Max. Asistentes</FormLabel>
                  <Input
                    type="number"
                    value={formData.maxAttendees}
                    onChange={(e) => setFormData({ ...formData, maxAttendees: parseInt(e.target.value) || 1 })}
                    slotProps={{
                      input: {
                        min: 1,
                      },
                    }}
                  />
                </FormControl>
              </Grid>
            </Grid>

            <Grid container spacing={2}>
              <Grid xs={12} sm={6}>
                <FormControl>
                  <FormLabel>Precio</FormLabel>
                  <Input
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                    startDecorator="$"
                    slotProps={{
                      input: {
                        min: 0,
                        step: 10,
                      },
                    }}
                  />
                </FormControl>
              </Grid>
              <Grid xs={12} sm={6}>
                <FormControl>
                  <FormLabel>Moneda</FormLabel>
                  <Select value={formData.currency} onChange={(_, value) => setFormData({ ...formData, currency: value as string })}>
                    <Option value="USD">USD</Option>
                    <Option value="EUR">EUR</Option>
                    <Option value="MXN">MXN</Option>
                    <Option value="COP">COP</Option>
                    <Option value="ARS">ARS</Option>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            <FormControl>
              <FormLabel>Color</FormLabel>
              <Input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                sx={{ height: 50 }}
              />
            </FormControl>

            <Box sx={{ display: 'flex', gap: 3 }}>
              <FormControl>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Switch checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} />
                  <Typography level="body-sm">Servicio activo</Typography>
                </Box>
              </FormControl>
              <FormControl>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Switch checked={formData.requiresConfirmation} onChange={(e) => setFormData({ ...formData, requiresConfirmation: e.target.checked })} />
                  <Typography level="body-sm">Requiere confirmacion</Typography>
                </Box>
              </FormControl>
            </Box>

            <Divider />

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
              <Button variant="plain" color="neutral" onClick={handleCloseModal} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={!formData.name || !formData.duration || saving} loading={saving}>
                {editingService ? 'Guardar Cambios' : 'Crear Servicio'}
              </Button>
            </Box>
          </Box>
        </ModalDialog>
      </Modal>
    </Container>
  )
}
