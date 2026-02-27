import { useState, useEffect } from 'react'
import {
  Typography,
  Stack,
  Container,
  Card,
  CardContent,
  Box,
  Grid,
  Button,
  Table,
  Sheet,
  Chip,
  IconButton,
  Input,
  Modal,
  ModalDialog,
  ModalClose,
  FormControl,
  FormLabel,
  Switch,
  Textarea,
} from '@mui/joy'
import {
  Source as SourceIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  CheckCircle as ActiveIcon,
  Cancel as InactiveIcon,
} from '@mui/icons-material'
import api from '../services/api'
import { toast } from 'react-toastify'

interface CustomerOrigin {
  id: number
  name: string
  description: string | null
  color: string
  isActive: boolean
  companyId: number
  createdAt: string
  updatedAt: string
}

export default function CustomerOrigins() {
  const [origins, setOrigins] = useState<CustomerOrigin[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAll, setShowAll] = useState(true) // Mostrar activos e inactivos
  const [openModal, setOpenModal] = useState(false)
  const [selectedOrigin, setSelectedOrigin] = useState<CustomerOrigin | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#6366F1',
    isActive: true,
  })

  useEffect(() => {
    fetchOrigins()
  }, [showAll])

  const fetchOrigins = async () => {
    try {
      setLoading(true)
      const response = await api.get('/customer-origins', {
        params: { showAll: showAll.toString() }
      })
      console.log('CustomerOrigins API response:', response.data)

      const originsData = response.data.records || []
      setOrigins(originsData)
    } catch (error) {
      console.error('Error fetching customer origins:', error)
      toast.error('Error al cargar orígenes de cliente')
      setOrigins([])
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }

    try {
      await api.post('/customer-origins', formData)
      toast.success('Origen creado correctamente')
      fetchOrigins()
      setOpenModal(false)
      resetForm()
    } catch (error: any) {
      console.error('Error creating origin:', error)
      toast.error(error.response?.data?.message || 'Error al crear origen')
    }
  }

  const handleUpdate = async () => {
    if (!selectedOrigin) return
    if (!formData.name.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }

    try {
      await api.put(`/customer-origins/${selectedOrigin.id}`, formData)
      toast.success('Origen actualizado correctamente')
      fetchOrigins()
      setOpenModal(false)
      resetForm()
    } catch (error: any) {
      console.error('Error updating origin:', error)
      toast.error(error.response?.data?.message || 'Error al actualizar origen')
    }
  }

  const handleDelete = async (originId: number) => {
    if (confirm('¿Estás seguro de eliminar este origen? Esta acción no se puede deshacer.')) {
      try {
        await api.delete(`/customer-origins/${originId}`)
        toast.success('Origen eliminado correctamente')
        fetchOrigins()
      } catch (error: any) {
        console.error('Error deleting origin:', error)
        toast.error(error.response?.data?.message || 'Error al eliminar origen')
      }
    }
  }

  const handleToggleActive = async (origin: CustomerOrigin) => {
    try {
      await api.put(`/customer-origins/${origin.id}`, {
        isActive: !origin.isActive
      })
      toast.success(`Origen ${!origin.isActive ? 'activado' : 'desactivado'}`)
      fetchOrigins()
    } catch (error: any) {
      console.error('Error toggling origin status:', error)
      toast.error(error.response?.data?.message || 'Error al cambiar estado')
    }
  }

  const openEditModal = (origin: CustomerOrigin) => {
    setSelectedOrigin(origin)
    setFormData({
      name: origin.name,
      description: origin.description || '',
      color: origin.color,
      isActive: origin.isActive,
    })
    setOpenModal(true)
  }

  const openCreateModal = () => {
    setSelectedOrigin(null)
    resetForm()
    setOpenModal(true)
  }

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      color: '#6366F1',
      isActive: true,
    })
    setSelectedOrigin(null)
  }

  const filteredOrigins = origins.filter((origin) =>
    origin.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (origin.description && origin.description.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const stats = {
    total: origins.length,
    active: origins.filter(o => o.isActive).length,
    inactive: origins.filter(o => !o.isActive).length,
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <SourceIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Origen de Cliente</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Gestiona los orígenes de tus clientes para reportes y seguimiento
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <IconButton variant="outlined" color="neutral" onClick={fetchOrigins}>
              <RefreshIcon />
            </IconButton>
            <Button startDecorator={<AddIcon />} color="primary" onClick={openCreateModal}>
              Nuevo Origen
            </Button>
          </Stack>
        </Stack>

        {/* Stats */}
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={4}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Total Orígenes
                </Typography>
                <Typography level="h2">{stats.total}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={4}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Activos
                </Typography>
                <Typography level="h2" sx={{ color: 'success.main' }}>
                  {stats.active}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={4}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Inactivos
                </Typography>
                <Typography level="h2" sx={{ color: 'neutral.500' }}>
                  {stats.inactive}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Search and Filters */}
        <Card>
          <CardContent>
            <Stack direction="row" spacing={2} alignItems="center">
              <Input
                placeholder="Buscar orígenes..."
                startDecorator={<SearchIcon />}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                sx={{ flex: 1 }}
              />
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography level="body-sm">Mostrar inactivos</Typography>
                <Switch
                  checked={showAll}
                  onChange={(e) => setShowAll(e.target.checked)}
                />
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        {/* Origins Table */}
        <Card>
          <Sheet sx={{ overflow: 'auto' }}>
            <Table stickyHeader>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Color</th>
                  <th style={{ width: 200 }}>Nombre</th>
                  <th>Descripción</th>
                  <th style={{ width: 100 }}>Estado</th>
                  <th style={{ width: 180 }}>Fecha Creación</th>
                  <th style={{ width: 150 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>Cargando orígenes...</Typography>
                    </td>
                  </tr>
                ) : filteredOrigins.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>No se encontraron orígenes</Typography>
                      <Typography level="body-sm" sx={{ mt: 1 }}>
                        Crea tu primer origen haciendo clic en "Nuevo Origen"
                      </Typography>
                    </td>
                  </tr>
                ) : (
                  filteredOrigins.map((origin) => (
                    <tr key={origin.id} style={{ opacity: origin.isActive ? 1 : 0.6 }}>
                      <td>
                        <Box
                          sx={{
                            width: 32,
                            height: 32,
                            bgcolor: origin.color,
                            borderRadius: 'sm',
                            border: '1px solid',
                            borderColor: 'divider',
                          }}
                        />
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          sx={{
                            bgcolor: origin.color,
                            color: 'white',
                            fontWeight: 'bold'
                          }}
                        >
                          {origin.name}
                        </Chip>
                      </td>
                      <td>
                        <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                          {origin.description || '-'}
                        </Typography>
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          variant="soft"
                          color={origin.isActive ? 'success' : 'neutral'}
                          startDecorator={origin.isActive ? <ActiveIcon /> : <InactiveIcon />}
                          onClick={() => handleToggleActive(origin)}
                          sx={{ cursor: 'pointer' }}
                        >
                          {origin.isActive ? 'Activo' : 'Inactivo'}
                        </Chip>
                      </td>
                      <td>
                        <Typography level="body-xs">
                          {new Date(origin.createdAt).toLocaleDateString('es-ES')}
                        </Typography>
                      </td>
                      <td>
                        <Stack direction="row" spacing={0.5}>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="primary"
                            onClick={() => openEditModal(origin)}
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="danger"
                            onClick={() => handleDelete(origin.id)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Stack>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </Sheet>
        </Card>

        {/* Modal Create/Edit */}
        <Modal open={openModal} onClose={() => setOpenModal(false)}>
          <ModalDialog sx={{ minWidth: 500 }}>
            <ModalClose />
            <Typography level="h4" sx={{ mb: 2 }}>
              {selectedOrigin ? 'Editar Origen' : 'Nuevo Origen'}
            </Typography>
            <Stack spacing={2}>
              <FormControl required>
                <FormLabel>Nombre</FormLabel>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Referido, Instagram, Facebook Ads"
                />
              </FormControl>
              <FormControl>
                <FormLabel>Descripción</FormLabel>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descripción opcional del origen"
                  minRows={2}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Color</FormLabel>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Input
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    sx={{ width: 80, height: 40 }}
                  />
                  <Input
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    placeholder="#6366F1"
                    sx={{ width: 120 }}
                  />
                </Stack>
              </FormControl>
              <FormControl orientation="horizontal" sx={{ justifyContent: 'space-between' }}>
                <FormLabel>Activo</FormLabel>
                <Switch
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
              </FormControl>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Typography level="body-sm">Vista Previa:</Typography>
                <Chip
                  size="sm"
                  sx={{
                    bgcolor: formData.color,
                    color: 'white',
                    fontWeight: 'bold'
                  }}
                >
                  {formData.name || 'Origen'}
                </Chip>
              </Box>
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button variant="plain" color="neutral" onClick={() => setOpenModal(false)}>
                  Cancelar
                </Button>
                <Button color="primary" onClick={selectedOrigin ? handleUpdate : handleCreate}>
                  {selectedOrigin ? 'Actualizar' : 'Crear'}
                </Button>
              </Stack>
            </Stack>
          </ModalDialog>
        </Modal>
      </Stack>
    </Container>
  )
}
