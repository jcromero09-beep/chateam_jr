import { useState, useEffect } from 'react'
import {
  Typography,
  Stack,
  Container,
  Card,
  CardContent,
  Box,
  Button,
  IconButton,
  Sheet,
  Table,
  Modal,
  ModalDialog,
  ModalClose,
  Input,
  FormControl,
  FormLabel,
  Textarea,
} from '@mui/joy'
import {
  Chat as ChatIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ContentCopy as CopyIcon,
  Refresh as RefreshIcon,
  AccountTree as FlowIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { toast } from 'react-toastify'

interface Flow {
  id: number
  name: string
  description?: string
  nodes: any
  connections: any
  createdAt: string
  updatedAt: string
}

export default function FlowbuilderConversation() {
  const navigate = useNavigate()
  const [flows, setFlows] = useState<Flow[]>([])
  const [loading, setLoading] = useState(true)
  const [openModal, setOpenModal] = useState(false)
  const [editingFlow, setEditingFlow] = useState<Flow | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  })

  useEffect(() => {
    fetchFlows()
  }, [])

  const fetchFlows = async () => {
    try {
      setLoading(true)
      const response = await api.get('/flowbuilder')
      console.log('✅ Flows recibidos:', response.data)
      setFlows(response.data.flows || response.data || [])
    } catch (error) {
      console.error('❌ Error fetching flows:', error)
      toast.error('Error al cargar los flujos')
      setFlows([])
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = (flow?: Flow) => {
    if (flow) {
      setEditingFlow(flow)
      setFormData({
        name: flow.name,
        description: flow.description || '',
      })
    } else {
      setEditingFlow(null)
      setFormData({ name: '', description: '' })
    }
    setOpenModal(true)
  }

  const handleCloseModal = () => {
    setOpenModal(false)
    setEditingFlow(null)
    setFormData({ name: '', description: '' })
  }

  const handleSubmit = async () => {
    try {
      if (!formData.name.trim()) {
        toast.error('El nombre es obligatorio')
        return
      }

      if (editingFlow) {
        // Actualizar flujo existente
        await api.put('/flowbuilder', {
          id: editingFlow.id,
          name: formData.name,
          description: formData.description,
        })
        toast.success('Flujo actualizado correctamente')
      } else {
        // Crear nuevo flujo
        await api.post('/flowbuilder', {
          name: formData.name,
          description: formData.description,
          nodes: [],
          connections: [],
        })
        toast.success('Flujo creado correctamente')
      }

      handleCloseModal()
      fetchFlows()
    } catch (error: any) {
      console.error('Error al guardar flujo:', error)
      toast.error(error.response?.data?.message || 'Error al guardar el flujo')
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Estás seguro de eliminar este flujo?')) return

    try {
      await api.delete(`/flowbuilder/${id}`)
      toast.success('Flujo eliminado correctamente')
      fetchFlows()
    } catch (error: any) {
      console.error('Error al eliminar flujo:', error)
      toast.error(error.response?.data?.message || 'Error al eliminar el flujo')
    }
  }

  const handleDuplicate = async (id: number) => {
    try {
      await api.post('/flowbuilder/duplicate', { idFlow: id })
      toast.success('Flujo duplicado correctamente')
      fetchFlows()
    } catch (error: any) {
      console.error('Error al duplicar flujo:', error)
      toast.error(error.response?.data?.message || 'Error al duplicar el flujo')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <ChatIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Flujos de Conversación</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Gestiona y crea flujos de conversaciones automatizadas
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <IconButton variant="outlined" color="neutral" onClick={fetchFlows}>
              <RefreshIcon />
            </IconButton>
            <Button
              startDecorator={<AddIcon />}
              onClick={() => handleOpenModal()}
              disabled={loading}
            >
              Nuevo Flujo
            </Button>
          </Stack>
        </Stack>

        {/* Flows Table */}
        <Card>
          <CardContent>
            {loading ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography level="body-md">Cargando flujos...</Typography>
              </Box>
            ) : flows.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <ChatIcon sx={{ fontSize: 64, color: 'text.tertiary', mb: 2 }} />
                <Typography level="h4" sx={{ mb: 1 }}>
                  No hay flujos creados
                </Typography>
                <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 3 }}>
                  Crea tu primer flujo de conversación para automatizar respuestas
                </Typography>
                <Button startDecorator={<AddIcon />} onClick={() => handleOpenModal()}>
                  Crear Primer Flujo
                </Button>
              </Box>
            ) : (
              <Sheet sx={{ overflow: 'auto' }}>
                <Table>
                  <thead>
                    <tr>
                      <th style={{ width: '40%' }}>Nombre</th>
                      <th style={{ width: '30%' }}>Descripción</th>
                      <th style={{ width: '15%' }}>Fecha Creación</th>
                      <th style={{ width: '15%', textAlign: 'right' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flows.map((flow) => (
                      <tr key={flow.id}>
                        <td>
                          <Typography level="body-md" fontWeight="md">
                            {flow.name}
                          </Typography>
                        </td>
                        <td>
                          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                            {flow.description || 'Sin descripción'}
                          </Typography>
                        </td>
                        <td>
                          <Typography level="body-sm">
                            {formatDate(flow.createdAt)}
                          </Typography>
                        </td>
                        <td>
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <IconButton
                              size="sm"
                              variant="soft"
                              color="success"
                              onClick={() => navigate(`/flowbuilder/editor/${flow.id}`)}
                              title="Diseñar Flujo"
                            >
                              <FlowIcon />
                            </IconButton>
                            <IconButton
                              size="sm"
                              variant="plain"
                              color="primary"
                              onClick={() => handleOpenModal(flow)}
                              title="Editar Info"
                            >
                              <EditIcon />
                            </IconButton>
                            <IconButton
                              size="sm"
                              variant="plain"
                              color="neutral"
                              onClick={() => handleDuplicate(flow.id)}
                              title="Duplicar"
                            >
                              <CopyIcon />
                            </IconButton>
                            <IconButton
                              size="sm"
                              variant="plain"
                              color="danger"
                              onClick={() => handleDelete(flow.id)}
                              title="Eliminar"
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Stack>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Sheet>
            )}
          </CardContent>
        </Card>
      </Stack>

      {/* Modal para Crear/Editar Flujo */}
      <Modal open={openModal} onClose={handleCloseModal}>
        <ModalDialog>
          <ModalClose />
          <Typography level="h4" sx={{ mb: 2 }}>
            {editingFlow ? 'Editar Flujo' : 'Nuevo Flujo'}
          </Typography>
          <Stack spacing={2}>
            <FormControl>
              <FormLabel>Nombre *</FormLabel>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej: Flujo de Bienvenida"
                autoFocus
              />
            </FormControl>
            <FormControl>
              <FormLabel>Descripción</FormLabel>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe el propósito de este flujo..."
                minRows={3}
              />
            </FormControl>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button variant="plain" color="neutral" onClick={handleCloseModal}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit}>
                {editingFlow ? 'Actualizar' : 'Crear'}
              </Button>
            </Stack>
          </Stack>
        </ModalDialog>
      </Modal>
    </Container>
  )
}
