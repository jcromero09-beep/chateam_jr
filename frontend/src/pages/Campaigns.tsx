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
  LinearProgress as _LinearProgress,
} from '@mui/joy'
import {
  Campaign as CampaignIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Stop as _StopIcon,
  Visibility as ViewIcon,
  AttachFile as AttachFileIcon,
  Send as SendIcon,
} from '@mui/icons-material'
import api from '../services/api'

interface Campaign {
  id: number
  name: string
  message1?: string
  message2?: string
  message3?: string
  confirmation?: boolean
  scheduledAt?: string
  companyId: number
  contactListId?: number
  whatsappId?: number
  status?: string
  sessionId?: number
  mediaPath?: string
  mediaName?: string
  createdAt: string
}

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [openModal, setOpenModal] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    message1: '',
    message2: '',
    message3: '',
    confirmation: false,
    scheduledAt: '',
    contactListId: 0,
    whatsappId: 0,
  })

  useEffect(() => {
    fetchCampaigns()
  }, [])

  const fetchCampaigns = async () => {
    try {
      setLoading(true)
      const response = await api.get('/campaigns')
      setCampaigns(response.data.campaigns || response.data)
    } catch (error) {
      console.error('Error fetching campaigns:', error)
      // Fallback data
      setCampaigns([
        {
          id: 1,
          name: 'Lanzamiento Producto Verano 2025',
          message1: '¡Hola! Te presentamos nuestro nuevo producto para el verano.',
          message2: 'Características principales: diseño innovador, calidad premium.',
          message3: '¡Aprovecha nuestro descuento de lanzamiento del 20%!',
          confirmation: true,
          scheduledAt: '2025-01-15T10:00:00',
          status: 'PENDING',
          companyId: 1,
          contactListId: 1,
          whatsappId: 1,
          createdAt: '2025-01-10T00:00:00',
        },
        {
          id: 2,
          name: 'Newsletter Enero - Ofertas Especiales',
          message1: 'Hola {{name}}, tenemos ofertas exclusivas para ti.',
          message2: 'Descuentos de hasta 50% en productos seleccionados.',
          status: 'INPROGRESS',
          companyId: 1,
          contactListId: 2,
          whatsappId: 1,
          createdAt: '2025-01-09T00:00:00',
        },
        {
          id: 3,
          name: 'Recordatorio Eventos Febrero',
          message1: 'Te recordamos los próximos eventos programados.',
          status: 'FINISHED',
          companyId: 1,
          contactListId: 3,
          whatsappId: 1,
          createdAt: '2025-01-08T00:00:00',
        },
        {
          id: 4,
          name: 'Black Friday 2024',
          message1: '¡Black Friday! Descuentos increíbles solo por hoy.',
          message2: 'No te pierdas esta oportunidad única.',
          status: 'CANCELED',
          companyId: 1,
          contactListId: 4,
          whatsappId: 1,
          createdAt: '2024-11-20T00:00:00',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    try {
      await api.post('/campaigns', formData)
      fetchCampaigns()
      setOpenModal(false)
      resetForm()
    } catch (error) {
      console.error('Error creating campaign:', error)
    }
  }

  const handleUpdate = async () => {
    if (!selectedCampaign) return
    try {
      await api.put(`/campaigns/${selectedCampaign.id}`, formData)
      fetchCampaigns()
      setOpenModal(false)
      resetForm()
    } catch (error) {
      console.error('Error updating campaign:', error)
    }
  }

  const handleDelete = async (campaignId: number) => {
    if (confirm('¿Estás seguro de eliminar esta campaña?')) {
      try {
        await api.delete(`/campaigns/${campaignId}`)
        fetchCampaigns()
      } catch (error) {
        console.error('Error deleting campaign:', error)
      }
    }
  }

  const handleCancel = async (campaignId: number) => {
    if (confirm('¿Estás seguro de cancelar esta campaña?')) {
      try {
        await api.post(`/campaigns/${campaignId}/cancel`)
        fetchCampaigns()
      } catch (error) {
        console.error('Error canceling campaign:', error)
      }
    }
  }

  const handleRestart = async (campaignId: number) => {
    if (confirm('¿Estás seguro de reiniciar esta campaña?')) {
      try {
        await api.post(`/campaigns/${campaignId}/restart`)
        fetchCampaigns()
      } catch (error) {
        console.error('Error restarting campaign:', error)
      }
    }
  }

  const openEditModal = (campaign: Campaign) => {
    setSelectedCampaign(campaign)
    setFormData({
      name: campaign.name,
      message1: campaign.message1 || '',
      message2: campaign.message2 || '',
      message3: campaign.message3 || '',
      confirmation: campaign.confirmation || false,
      scheduledAt: campaign.scheduledAt || '',
      contactListId: campaign.contactListId || 0,
      whatsappId: campaign.whatsappId || 0,
    })
    setOpenModal(true)
  }

  const openCreateModal = () => {
    setSelectedCampaign(null)
    resetForm()
    setOpenModal(true)
  }

  const resetForm = () => {
    setFormData({
      name: '',
      message1: '',
      message2: '',
      message3: '',
      confirmation: false,
      scheduledAt: '',
      contactListId: 0,
      whatsappId: 0,
    })
  }

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'INPROGRESS':
        return 'success'
      case 'PENDING':
        return 'warning'
      case 'FINISHED':
        return 'neutral'
      case 'CANCELED':
        return 'danger'
      default:
        return 'primary'
    }
  }

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case 'INPROGRESS':
        return 'En Progreso'
      case 'PENDING':
        return 'Pendiente'
      case 'FINISHED':
        return 'Finalizada'
      case 'CANCELED':
        return 'Cancelada'
      default:
        return status || 'Borrador'
    }
  }

  const filteredCampaigns = campaigns.filter((campaign) => {
    const matchesSearch = campaign.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || campaign.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const stats = {
    total: campaigns.length,
    pending: campaigns.filter((c) => c.status === 'PENDING').length,
    inProgress: campaigns.filter((c) => c.status === 'INPROGRESS').length,
    finished: campaigns.filter((c) => c.status === 'FINISHED').length,
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <CampaignIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Campañas</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Gestión de campañas de marketing masivo
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <IconButton variant="outlined" color="neutral" onClick={fetchCampaigns}>
              <RefreshIcon />
            </IconButton>
            <Button startDecorator={<AddIcon />} color="primary" onClick={openCreateModal}>
              Nueva Campaña
            </Button>
          </Stack>
        </Stack>

        {/* Stats */}
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Total Campañas
                </Typography>
                <Typography level="h2">{stats.total}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Pendientes
                </Typography>
                <Typography level="h2" sx={{ color: 'warning.main' }}>
                  {stats.pending}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  En Progreso
                </Typography>
                <Typography level="h2" sx={{ color: 'success.main' }}>
                  {stats.inProgress}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Finalizadas
                </Typography>
                <Typography level="h2">{stats.finished}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Filters */}
        <Card>
          <CardContent>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Input
                placeholder="Buscar campañas..."
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
                <Option value="all">Todos los estados</Option>
                <Option value="PENDING">Pendientes</Option>
                <Option value="INPROGRESS">En Progreso</Option>
                <Option value="FINISHED">Finalizadas</Option>
                <Option value="CANCELED">Canceladas</Option>
              </Select>
            </Stack>
          </CardContent>
        </Card>

        {/* Campaigns Table */}
        <Card>
          <Sheet sx={{ overflow: 'auto' }}>
            <Table stickyHeader>
              <thead>
                <tr>
                  <th style={{ width: 250 }}>Nombre</th>
                  <th>Mensaje</th>
                  <th style={{ width: 120 }}>Estado</th>
                  <th style={{ width: 100 }}>Confirmación</th>
                  <th style={{ width: 100 }}>Archivos</th>
                  <th style={{ width: 180 }}>Programada</th>
                  <th style={{ width: 180 }}>Fecha Creación</th>
                  <th style={{ width: 220 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>Cargando campañas...</Typography>
                    </td>
                  </tr>
                ) : filteredCampaigns.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>No se encontraron campañas</Typography>
                    </td>
                  </tr>
                ) : (
                  filteredCampaigns.map((campaign) => (
                    <tr key={campaign.id}>
                      <td>
                        <Typography level="body-sm" fontWeight="bold">
                          {campaign.name}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-sm" noWrap sx={{ maxWidth: 300 }}>
                          {campaign.message1}
                        </Typography>
                      </td>
                      <td>
                        <Chip size="sm" color={getStatusColor(campaign.status)}>
                          {getStatusLabel(campaign.status)}
                        </Chip>
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          color={campaign.confirmation ? 'success' : 'neutral'}
                          variant="soft"
                        >
                          {campaign.confirmation ? 'Sí' : 'No'}
                        </Chip>
                      </td>
                      <td>
                        {campaign.mediaPath ? (
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
                          {campaign.scheduledAt
                            ? new Date(campaign.scheduledAt).toLocaleString('es-ES', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })
                            : '-'}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-xs">
                          {new Date(campaign.createdAt).toLocaleDateString('es-ES')}
                        </Typography>
                      </td>
                      <td>
                        <Stack direction="row" spacing={0.5}>
                          {campaign.status === 'PENDING' && (
                            <IconButton
                              size="sm"
                              variant="plain"
                              color="success"
                              title="Iniciar"
                              onClick={() => handleRestart(campaign.id)}
                            >
                              <PlayIcon />
                            </IconButton>
                          )}
                          {campaign.status === 'INPROGRESS' && (
                            <IconButton
                              size="sm"
                              variant="plain"
                              color="warning"
                              title="Pausar"
                              onClick={() => handleCancel(campaign.id)}
                            >
                              <PauseIcon />
                            </IconButton>
                          )}
                          {(campaign.status === 'FINISHED' || campaign.status === 'CANCELED') && (
                            <IconButton
                              size="sm"
                              variant="plain"
                              color="primary"
                              title="Reiniciar"
                              onClick={() => handleRestart(campaign.id)}
                            >
                              <PlayIcon />
                            </IconButton>
                          )}
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="neutral"
                            title="Ver detalles"
                          >
                            <ViewIcon />
                          </IconButton>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="primary"
                            onClick={() => openEditModal(campaign)}
                            title="Editar"
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="danger"
                            onClick={() => handleDelete(campaign.id)}
                            title="Eliminar"
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
          <ModalDialog sx={{ minWidth: 700, maxWidth: 800 }}>
            <ModalClose />
            <Typography level="h4" sx={{ mb: 2 }}>
              {selectedCampaign ? 'Editar Campaña' : 'Nueva Campaña'}
            </Typography>
            <Stack spacing={2}>
              <FormControl>
                <FormLabel>Nombre de la Campaña</FormLabel>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Lanzamiento Producto 2025"
                />
              </FormControl>
              <FormControl>
                <FormLabel>Mensaje 1</FormLabel>
                <Textarea
                  value={formData.message1}
                  onChange={(e) => setFormData({ ...formData, message1: e.target.value })}
                  placeholder="Primer mensaje de la campaña..."
                  minRows={2}
                  maxRows={4}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Mensaje 2 (Opcional)</FormLabel>
                <Textarea
                  value={formData.message2}
                  onChange={(e) => setFormData({ ...formData, message2: e.target.value })}
                  placeholder="Segundo mensaje (opcional)..."
                  minRows={2}
                  maxRows={4}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Mensaje 3 (Opcional)</FormLabel>
                <Textarea
                  value={formData.message3}
                  onChange={(e) => setFormData({ ...formData, message3: e.target.value })}
                  placeholder="Tercer mensaje (opcional)..."
                  minRows={2}
                  maxRows={4}
                />
              </FormControl>
              <Grid container spacing={2}>
                <Grid xs={6}>
                  <FormControl>
                    <FormLabel>ID Lista de Contactos</FormLabel>
                    <Input
                      type="number"
                      value={formData.contactListId || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          contactListId: parseInt(e.target.value) || 0,
                        })
                      }
                    />
                  </FormControl>
                </Grid>
                <Grid xs={6}>
                  <FormControl>
                    <FormLabel>ID WhatsApp</FormLabel>
                    <Input
                      type="number"
                      value={formData.whatsappId || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, whatsappId: parseInt(e.target.value) || 0 })
                      }
                    />
                  </FormControl>
                </Grid>
              </Grid>
              <FormControl>
                <FormLabel>Fecha y Hora Programada (Opcional)</FormLabel>
                <Input
                  type="datetime-local"
                  value={formData.scheduledAt}
                  onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
                />
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
                  <strong>{formData.name || 'Nombre de campaña'}</strong>
                  <br />
                  {formData.message1 || 'Mensaje de campaña...'}
                  {formData.scheduledAt && (
                    <>
                      <br />
                      <strong>Programada:</strong>{' '}
                      {new Date(formData.scheduledAt).toLocaleString('es-ES')}
                    </>
                  )}
                </Typography>
              </Box>
              <Button
                color="primary"
                onClick={selectedCampaign ? handleUpdate : handleCreate}
                startDecorator={<SendIcon />}
              >
                {selectedCampaign ? 'Actualizar' : 'Crear'} Campaña
              </Button>
            </Stack>
          </ModalDialog>
        </Modal>
      </Stack>
    </Container>
  )
}
