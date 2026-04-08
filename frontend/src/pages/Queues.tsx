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
  Textarea,
} from '@mui/joy'
import {
  QueueMusic as QueueIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
import api from '../services/api'
import { toast } from 'react-toastify'

interface Queue {
  id: number
  name: string
  color: string
  greetingMessage?: string
  outOfHoursMessage?: string
  promptAI?: string
  orderQueue?: number
  isActive?: boolean
  createdAt: string
}

export default function Queues() {
  const [queues, setQueues] = useState<Queue[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [openModal, setOpenModal] = useState(false)
  const [selectedQueue, setSelectedQueue] = useState<Queue | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    color: '#3b82f6',
    greetingMessage: '',
    outOfHoursMessage: '',
    promptAI: '',
    orderQueue: 0,
  })

  useEffect(() => {
    fetchQueues()
  }, [])

  const fetchQueues = async () => {
    try {
      setLoading(true)
      const response = await api.get('/queue')
      setQueues(response.data.queues || response.data)
    } catch (error) {
      console.error('Error fetching queues:', error)
      setQueues([
        {
          id: 1,
          name: 'Soporte Técnico',
          color: '#3b82f6',
          greetingMessage: 'Bienvenido al soporte técnico',
          isActive: true,
          orderQueue: 1,
          createdAt: '2025-01-01T00:00:00',
        },
        {
          id: 2,
          name: 'Ventas',
          color: '#10b981',
          greetingMessage: 'Bienvenido al departamento de ventas',
          isActive: true,
          orderQueue: 2,
          createdAt: '2025-01-02T00:00:00',
        },
        {
          id: 3,
          name: 'Facturación',
          color: '#f59e0b',
          greetingMessage: 'Bienvenido a facturación',
          isActive: false,
          orderQueue: 3,
          createdAt: '2025-01-03T00:00:00',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    try {
      await api.post('/queue', formData)
      fetchQueues()
      setOpenModal(false)
      resetForm()
    } catch (error: any) {
      console.error('Error creating queue:', error)
      const msg = error.response?.data?.message || error.response?.data?.error || 'Error al crear la cola'
      toast.error(msg)
    }
  }

  const handleUpdate = async () => {
    if (!selectedQueue) return
    try {
      await api.put(`/queue/${selectedQueue.id}`, formData)
      fetchQueues()
      setOpenModal(false)
      resetForm()
    } catch (error: any) {
      console.error('Error updating queue:', error)
      const msg = error.response?.data?.message || error.response?.data?.error || 'Error al actualizar la cola'
      toast.error(msg)
    }
  }

  const handleDelete = async (queueId: number) => {
    if (confirm('¿Estás seguro de eliminar esta cola?')) {
      try {
        await api.delete(`/queue/${queueId}`)
        fetchQueues()
      } catch (error: any) {
        console.error('Error deleting queue:', error)
        const msg = error.response?.data?.message || error.response?.data?.error || 'Error al eliminar la cola'
        toast.error(msg)
      }
    }
  }

  const openEditModal = (queue: Queue) => {
    setSelectedQueue(queue)
    setFormData({
      name: queue.name,
      color: queue.color,
      greetingMessage: queue.greetingMessage || '',
      outOfHoursMessage: queue.outOfHoursMessage || '',
      promptAI: queue.promptAI || '',
      orderQueue: queue.orderQueue || 0,
    })
    setOpenModal(true)
  }

  const openCreateModal = () => {
    setSelectedQueue(null)
    resetForm()
    setOpenModal(true)
  }

  const resetForm = () => {
    setFormData({
      name: '',
      color: '#3b82f6',
      greetingMessage: '',
      outOfHoursMessage: '',
      promptAI: '',
      orderQueue: 0,
    })
  }

  const filteredQueues = queues.filter((queue) =>
    queue.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const stats = {
    total: queues.length,
    active: queues.filter((q) => q.isActive !== false).length,
    inactive: queues.filter((q) => q.isActive === false).length,
    tickets: 245,
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <QueueIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Colas</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Gestión de colas de atención
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <IconButton variant="outlined" color="neutral" onClick={fetchQueues}>
              <RefreshIcon />
            </IconButton>
            <Button startDecorator={<AddIcon />} color="primary" onClick={openCreateModal}>
              Nueva Cola
            </Button>
          </Stack>
        </Stack>

        {/* Stats */}
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Total Colas
                </Typography>
                <Typography level="h2">{stats.total}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Activas
                </Typography>
                <Typography level="h2" sx={{ color: 'success.main' }}>
                  {stats.active}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  En Espera
                </Typography>
                <Typography level="h2" sx={{ color: 'warning.main' }}>
                  34
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Atendidos Hoy
                </Typography>
                <Typography level="h2">{stats.tickets}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Search */}
        <Card>
          <CardContent>
            <Input
              placeholder="Buscar colas..."
              startDecorator={<SearchIcon />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </CardContent>
        </Card>

        {/* Queues Table */}
        <Card>
          <Sheet sx={{ overflow: 'auto' }}>
            <Table stickyHeader>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Color</th>
                  <th style={{ width: 200 }}>Nombre</th>
                  <th>Mensaje de Saludo</th>
                  <th style={{ width: 100 }}>Orden</th>
                  <th style={{ width: 100 }}>Estado</th>
                  <th style={{ width: 180 }}>Fecha Creación</th>
                  <th style={{ width: 150 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>Cargando colas...</Typography>
                    </td>
                  </tr>
                ) : filteredQueues.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>No se encontraron colas</Typography>
                    </td>
                  </tr>
                ) : (
                  filteredQueues.map((queue) => (
                    <tr key={queue.id}>
                      <td>
                        <Box
                          sx={{
                            width: 32,
                            height: 32,
                            bgcolor: queue.color,
                            borderRadius: 'sm',
                            border: '1px solid',
                            borderColor: 'divider',
                          }}
                        />
                      </td>
                      <td>
                        <Typography level="body-sm" fontWeight="bold">
                          {queue.name}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-xs" noWrap sx={{ maxWidth: 300 }}>
                          {queue.greetingMessage || '-'}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-sm">{queue.orderQueue}</Typography>
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          color={queue.isActive !== false ? 'success' : 'neutral'}
                        >
                          {queue.isActive !== false ? 'Activa' : 'Inactiva'}
                        </Chip>
                      </td>
                      <td>
                        <Typography level="body-xs">
                          {new Date(queue.createdAt).toLocaleDateString('es-ES')}
                        </Typography>
                      </td>
                      <td>
                        <Stack direction="row" spacing={0.5}>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="primary"
                            onClick={() => openEditModal(queue)}
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="danger"
                            onClick={() => handleDelete(queue.id)}
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
          <ModalDialog sx={{ minWidth: 600 }}>
            <ModalClose />
            <Typography level="h4" sx={{ mb: 2 }}>
              {selectedQueue ? 'Editar Cola' : 'Nueva Cola'}
            </Typography>
            <Stack spacing={2}>
              <FormControl>
                <FormLabel>Nombre</FormLabel>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Soporte Técnico"
                />
              </FormControl>
              <FormControl>
                <FormLabel>Color</FormLabel>
                <Input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Orden</FormLabel>
                <Input
                  type="number"
                  value={formData.orderQueue}
                  onChange={(e) =>
                    setFormData({ ...formData, orderQueue: parseInt(e.target.value) })
                  }
                />
              </FormControl>
              <FormControl>
                <FormLabel>Mensaje de Saludo</FormLabel>
                <Textarea
                  value={formData.greetingMessage}
                  onChange={(e) =>
                    setFormData({ ...formData, greetingMessage: e.target.value })
                  }
                  placeholder="Mensaje que se muestra al iniciar conversación"
                  minRows={3}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Mensaje Fuera de Horario</FormLabel>
                <Textarea
                  value={formData.outOfHoursMessage}
                  onChange={(e) =>
                    setFormData({ ...formData, outOfHoursMessage: e.target.value })
                  }
                  placeholder="Mensaje fuera del horario de atención"
                  minRows={3}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Prompt para IA</FormLabel>
                <Textarea
                  value={formData.promptAI}
                  onChange={(e) =>
                    setFormData({ ...formData, promptAI: e.target.value })
                  }
                  placeholder="Instrucciones para la IA cuando atienda esta cola. Ej: Eres un asistente de soporte técnico especializado en..."
                  minRows={4}
                />
              </FormControl>
              <Button color="primary" onClick={selectedQueue ? handleUpdate : handleCreate}>
                {selectedQueue ? 'Actualizar' : 'Crear'} Cola
              </Button>
            </Stack>
          </ModalDialog>
        </Modal>
      </Stack>
    </Container>
  )
}
