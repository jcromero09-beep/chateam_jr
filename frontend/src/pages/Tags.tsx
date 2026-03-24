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
} from '@mui/joy'
import {
  Label as TagIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
import api from '../services/api'

interface Tag {
  id: number
  name: string
  color: string
  uses?: number
  createdAt: string
  description?: string
}

export default function Tags() {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [openModal, setOpenModal] = useState(false)
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    color: '#3b82f6',
    kanban: 0,
    description: '',
  })

  useEffect(() => {
    fetchTags()
  }, [])

  const fetchTags = async () => {
    try {
      setLoading(true)
      const response = await api.get('/tags')
      console.log('Tags API response:', response.data)

      // Backend returns { tags, count, hasMore }
      const tagsData = Array.isArray(response.data)
        ? response.data
        : (response.data.tags || [])

      setTags(tagsData)

      if (tagsData.length === 0) {
        console.log('No tags found in database')
      }
    } catch (error) {
      console.error('Error fetching tags:', error)
      // Show empty array on error to see real state
      setTags([])
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    try {
      await api.post('/tags', formData)
      fetchTags()
      setOpenModal(false)
      resetForm()
    } catch (error) {
      console.error('Error creating tag:', error)
    }
  }

  const handleUpdate = async () => {
    if (!selectedTag) return
    try {
      await api.put(`/tags/${selectedTag.id}`, formData)
      fetchTags()
      setOpenModal(false)
      resetForm()
    } catch (error) {
      console.error('Error updating tag:', error)
    }
  }

  const handleDelete = async (tagId: number) => {
    if (confirm('¿Estás seguro de eliminar esta etiqueta?')) {
      try {
        await api.delete(`/tags/${tagId}`)
        fetchTags()
      } catch (error) {
        console.error('Error deleting tag:', error)
      }
    }
  }

  const openEditModal = (tag: Tag) => {
    setSelectedTag(tag)
    setFormData({
      name: tag.name,
      color: tag.color,
      kanban: 0,
      description: (tag as any).description || '',
    })
    setOpenModal(true)
  }

  const openCreateModal = () => {
    setSelectedTag(null)
    resetForm()
    setOpenModal(true)
  }

  const resetForm = () => {
    setFormData({
      name: '',
      color: '#3b82f6',
      kanban: 0,
      description: '',
    })
  }

  const filteredTags = tags.filter((tag) =>
    tag.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const stats = {
    total: tags.length,
    used: tags.reduce((sum, tag) => sum + (tag.uses || 0), 0),
    mostUsed: tags.sort((a, b) => (b.uses || 0) - (a.uses || 0))[0]?.name || '-',
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <TagIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Etiquetas</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Gestión de etiquetas para clasificación
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <IconButton variant="outlined" color="neutral" onClick={fetchTags}>
              <RefreshIcon />
            </IconButton>
            <Button startDecorator={<AddIcon />} color="primary" onClick={openCreateModal}>
              Nueva Etiqueta
            </Button>
          </Stack>
        </Stack>

        {/* Stats */}
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Total Etiquetas
                </Typography>
                <Typography level="h2">{stats.total}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Más Usada
                </Typography>
                <Typography level="body-sm" fontWeight="bold">
                  {stats.mostUsed}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Usos Totales
                </Typography>
                <Typography level="h2">{stats.used}</Typography>
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
                  {stats.total}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Search */}
        <Card>
          <CardContent>
            <Input
              placeholder="Buscar etiquetas..."
              startDecorator={<SearchIcon />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </CardContent>
        </Card>

        {/* Tags Table */}
        <Card>
          <Sheet sx={{ overflow: 'auto' }}>
            <Table stickyHeader>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Color</th>
                  <th style={{ width: 200 }}>Etiqueta</th>
                  <th style={{ width: 100 }}>Usos</th>
                  <th style={{ width: 180 }}>Fecha Creación</th>
                  <th style={{ width: 150 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>Cargando etiquetas...</Typography>
                    </td>
                  </tr>
                ) : filteredTags.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>No se encontraron etiquetas</Typography>
                    </td>
                  </tr>
                ) : (
                  filteredTags.map((tag) => (
                    <tr key={tag.id}>
                      <td>
                        <Box
                          sx={{
                            width: 32,
                            height: 32,
                            bgcolor: tag.color,
                            borderRadius: 'sm',
                            border: '1px solid',
                            borderColor: 'divider',
                          }}
                        />
                      </td>
                      <td>
                        <Chip size="sm" sx={{ bgcolor: tag.color, color: 'white' }}>
                          {tag.name}
                        </Chip>
                      </td>
                      <td>
                        <Typography level="body-sm">{tag.uses || 0}</Typography>
                      </td>
                      <td>
                        <Typography level="body-xs">
                          {new Date(tag.createdAt).toLocaleDateString('es-ES')}
                        </Typography>
                      </td>
                      <td>
                        <Stack direction="row" spacing={0.5}>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="primary"
                            onClick={() => openEditModal(tag)}
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="danger"
                            onClick={() => handleDelete(tag.id)}
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
              {selectedTag ? 'Editar Etiqueta' : 'Nueva Etiqueta'}
            </Typography>
            <Stack spacing={2}>
              <FormControl>
                <FormLabel>Nombre</FormLabel>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: VIP"
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
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Typography level="body-sm">Vista Previa:</Typography>
                <Chip size="sm" sx={{ bgcolor: formData.color, color: 'white' }}>
                  {formData.name || 'Etiqueta'}
                </Chip>
              </Box>
              <FormControl>
                <FormLabel>Descripción</FormLabel>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descripción de la etiqueta (opcional)"
                />
              </FormControl>
              <Button color="primary" onClick={selectedTag ? handleUpdate : handleCreate}>
                {selectedTag ? 'Actualizar' : 'Crear'} Etiqueta
              </Button>
            </Stack>
          </ModalDialog>
        </Modal>
      </Stack>
    </Container>
  )
}
