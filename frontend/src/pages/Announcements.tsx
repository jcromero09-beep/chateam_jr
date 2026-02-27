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
  Select,
  Option,
  Switch,
} from '@mui/joy'
import {
  Announcement as AnnouncementIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Visibility as VisibilityIcon,
  AttachFile as AttachFileIcon,
} from '@mui/icons-material'
import api from '../services/api'

interface Announcement {
  id: number
  title: string
  text: string
  priority: number
  status: boolean
  mediaPath?: string
  mediaName?: string
  companyId: number
  createdAt: string
}

export default function Announcements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [openModal, setOpenModal] = useState(false)
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    text: '',
    priority: 1,
    status: true,
  })

  useEffect(() => {
    fetchAnnouncements()
  }, [])

  const fetchAnnouncements = async () => {
    try {
      setLoading(true)
      const response = await api.get('/announcements')
      console.log('Announcements API response:', response.data)

      // Backend returns { announcements, count, hasMore } or similar
      const announcementsData = Array.isArray(response.data)
        ? response.data
        : (response.data.announcements || response.data.records || [])

      setAnnouncements(announcementsData)
    } catch (error) {
      console.error('Error fetching announcements:', error)
      // Set empty array on error instead of mock data
      setAnnouncements([])
      /*
      // Mock data removed - use real API data only
      setAnnouncements([
        {
          id: 1,
          title: 'Nueva Funcionalidad: Chat en Tiempo Real',
          text: 'Ahora puedes ver todos los chats activos en tiempo real desde el panel de control.',
          priority: 1,
          status: true,
          companyId: 1,
          createdAt: '2025-01-10T00:00:00',
        },
        {
          id: 2,
          title: 'Mantenimiento Programado',
          text: 'El sistema estará en mantenimiento el próximo sábado de 2:00 AM a 6:00 AM.',
          priority: 2,
          status: true,
          companyId: 1,
          createdAt: '2025-01-09T00:00:00',
        },
        {
          id: 3,
          title: 'Actualización de Seguridad',
          text: 'Hemos implementado nuevas medidas de seguridad para proteger tus datos.',
          priority: 1,
          status: true,
          companyId: 1,
          createdAt: '2025-01-08T00:00:00',
        },
        {
          id: 4,
          title: 'Nuevo Módulo: Campañas de Marketing',
          text: 'Ya está disponible el módulo de campañas para enviar mensajes masivos.',
          priority: 3,
          status: false,
          companyId: 1,
          createdAt: '2025-01-07T00:00:00',
        },
        {
          id: 5,
          title: 'Integración con WhatsApp Business API',
          text: 'Ahora puedes conectar múltiples números de WhatsApp Business.',
          priority: 1,
          status: true,
          companyId: 1,
          createdAt: '2025-01-06T00:00:00',
        },
      ])
      */
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    try {
      await api.post('/announcements', formData)
      fetchAnnouncements()
      setOpenModal(false)
      resetForm()
    } catch (error) {
      console.error('Error creating announcement:', error)
    }
  }

  const handleUpdate = async () => {
    if (!selectedAnnouncement) return
    try {
      await api.put(`/announcements/${selectedAnnouncement.id}`, formData)
      fetchAnnouncements()
      setOpenModal(false)
      resetForm()
    } catch (error) {
      console.error('Error updating announcement:', error)
    }
  }

  const handleDelete = async (announcementId: number) => {
    if (confirm('¿Estás seguro de eliminar este anuncio?')) {
      try {
        await api.delete(`/announcements/${announcementId}`)
        fetchAnnouncements()
      } catch (error) {
        console.error('Error deleting announcement:', error)
      }
    }
  }

  const handleToggleStatus = async (announcement: Announcement) => {
    try {
      await api.put(`/announcements/${announcement.id}`, {
        ...announcement,
        status: !announcement.status,
      })
      fetchAnnouncements()
    } catch (error) {
      console.error('Error toggling announcement status:', error)
    }
  }

  const openEditModal = (announcement: Announcement) => {
    setSelectedAnnouncement(announcement)
    setFormData({
      title: announcement.title,
      text: announcement.text,
      priority: announcement.priority,
      status: announcement.status,
    })
    setOpenModal(true)
  }

  const openCreateModal = () => {
    setSelectedAnnouncement(null)
    resetForm()
    setOpenModal(true)
  }

  const resetForm = () => {
    setFormData({
      title: '',
      text: '',
      priority: 1,
      status: true,
    })
  }

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 1:
        return 'danger'
      case 2:
        return 'warning'
      case 3:
        return 'primary'
      default:
        return 'neutral'
    }
  }

  const getPriorityLabel = (priority: number) => {
    switch (priority) {
      case 1:
        return 'Alta'
      case 2:
        return 'Media'
      case 3:
        return 'Baja'
      default:
        return 'Normal'
    }
  }

  const filteredAnnouncements = announcements.filter((announcement) => {
    const matchesSearch =
      announcement.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      announcement.text.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && announcement.status) ||
      (statusFilter === 'inactive' && !announcement.status)

    return matchesSearch && matchesStatus
  })

  const stats = {
    total: announcements.length,
    active: announcements.filter((a) => a.status).length,
    inactive: announcements.filter((a) => !a.status).length,
    highPriority: announcements.filter((a) => a.priority === 1 && a.status).length,
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <AnnouncementIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Anuncios</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Gestión de anuncios del sistema
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <IconButton variant="outlined" color="neutral" onClick={fetchAnnouncements}>
              <RefreshIcon />
            </IconButton>
            <Button startDecorator={<AddIcon />} color="primary" onClick={openCreateModal}>
              Nuevo Anuncio
            </Button>
          </Stack>
        </Stack>

        {/* Stats */}
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Total Anuncios
                </Typography>
                <Typography level="h2">{stats.total}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
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
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Inactivos
                </Typography>
                <Typography level="h2" sx={{ color: 'neutral.main' }}>
                  {stats.inactive}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Prioridad Alta
                </Typography>
                <Typography level="h2" sx={{ color: 'danger.main' }}>
                  {stats.highPriority}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Filters */}
        <Card>
          <CardContent>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Input
                placeholder="Buscar anuncios..."
                startDecorator={<SearchIcon />}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                sx={{ flexGrow: 1 }}
              />
              <Select
                value={statusFilter}
                onChange={(_, value) => setStatusFilter(value as string)}
                sx={{ minWidth: 180 }}
              >
                <Option value="all">Todos</Option>
                <Option value="active">Activos</Option>
                <Option value="inactive">Inactivos</Option>
              </Select>
            </Stack>
          </CardContent>
        </Card>

        {/* Announcements Table */}
        <Card>
          <Sheet sx={{ overflow: 'auto' }}>
            <Table stickyHeader>
              <thead>
                <tr>
                  <th style={{ width: 80 }}>Estado</th>
                  <th style={{ width: 250 }}>Título</th>
                  <th>Contenido</th>
                  <th style={{ width: 100 }}>Prioridad</th>
                  <th style={{ width: 100 }}>Archivos</th>
                  <th style={{ width: 180 }}>Fecha Creación</th>
                  <th style={{ width: 180 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>Cargando anuncios...</Typography>
                    </td>
                  </tr>
                ) : filteredAnnouncements.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>No se encontraron anuncios</Typography>
                    </td>
                  </tr>
                ) : (
                  filteredAnnouncements.map((announcement) => (
                    <tr key={announcement.id}>
                      <td>
                        <Switch
                          checked={announcement.status}
                          onChange={() => handleToggleStatus(announcement)}
                          size="sm"
                        />
                      </td>
                      <td>
                        <Typography level="body-sm" fontWeight="bold">
                          {announcement.title}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-sm" noWrap sx={{ maxWidth: 400 }}>
                          {announcement.text}
                        </Typography>
                      </td>
                      <td>
                        <Chip size="sm" color={getPriorityColor(announcement.priority)}>
                          {getPriorityLabel(announcement.priority)}
                        </Chip>
                      </td>
                      <td>
                        {announcement.mediaPath ? (
                          <IconButton size="sm" variant="soft" color="primary">
                            <AttachFileIcon />
                          </IconButton>
                        ) : (
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            -
                          </Typography>
                        )}
                      </td>
                      <td>
                        <Typography level="body-xs">
                          {new Date(announcement.createdAt).toLocaleDateString('es-ES')}
                        </Typography>
                      </td>
                      <td>
                        <Stack direction="row" spacing={0.5}>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="neutral"
                            title="Ver detalles"
                          >
                            <VisibilityIcon />
                          </IconButton>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="primary"
                            onClick={() => openEditModal(announcement)}
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="danger"
                            onClick={() => handleDelete(announcement.id)}
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
              {selectedAnnouncement ? 'Editar Anuncio' : 'Nuevo Anuncio'}
            </Typography>
            <Stack spacing={2}>
              <FormControl>
                <FormLabel>Título</FormLabel>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Título del anuncio"
                />
              </FormControl>
              <FormControl>
                <FormLabel>Contenido</FormLabel>
                <Textarea
                  value={formData.text}
                  onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                  placeholder="Escribe el contenido del anuncio..."
                  minRows={4}
                  maxRows={8}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Prioridad</FormLabel>
                <Select
                  value={formData.priority}
                  onChange={(_, value) => setFormData({ ...formData, priority: value as number })}
                >
                  <Option value={1}>Alta</Option>
                  <Option value={2}>Media</Option>
                  <Option value={3}>Baja</Option>
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Estado</FormLabel>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Switch
                    checked={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.checked })}
                  />
                  <Typography level="body-sm">
                    {formData.status ? 'Activo (visible para usuarios)' : 'Inactivo (oculto)'}
                  </Typography>
                </Stack>
              </FormControl>
              <Box
                sx={{
                  display: 'flex',
                  gap: 1,
                  alignItems: 'center',
                  p: 2,
                  bgcolor: 'background.level1',
                  borderRadius: 'sm',
                }}
              >
                <Typography level="body-sm" sx={{ flex: 1 }}>
                  <strong>Vista Previa:</strong>
                  <br />
                  <strong>{formData.title || 'Título del anuncio'}</strong>
                  <br />
                  {formData.text || 'Contenido del anuncio...'}
                </Typography>
              </Box>
              <Button color="primary" onClick={selectedAnnouncement ? handleUpdate : handleCreate}>
                {selectedAnnouncement ? 'Actualizar' : 'Crear'} Anuncio
              </Button>
            </Stack>
          </ModalDialog>
        </Modal>
      </Stack>
    </Container>
  )
}
