import { useState, useEffect, useCallback } from 'react'
import {
  Typography, Stack, Container, Card, CardContent, Box, Button, Table, Sheet,
  Chip, IconButton, Modal, ModalDialog, FormControl, FormLabel, Input, Select,
  Option, Tooltip, CircularProgress, Switch,
} from '@mui/joy'
import {
  Campaign as CampaignIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  TextFields as PhraseIcon,
  WhatsApp as WhatsAppIcon,
  AccountTree as FlowIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
import api from '../services/api'
import { toast } from 'react-toastify'

interface FlowCampaign {
  id: number
  name: string
  phrase: string
  flowId: number
  whatsappId: number
  status: boolean
  companyId: number
  createdAt: string
}

interface FlowOption {
  id: number
  name: string
}

interface WhatsappOption {
  id: number
  name: string
}

export default function FlowbuilderCampaign() {
  const [campaigns, setCampaigns] = useState<FlowCampaign[]>([])
  const [flows, setFlows] = useState<FlowOption[]>([])
  const [whatsapps, setWhatsapps] = useState<WhatsappOption[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // Modal
  const [openModal, setOpenModal] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    phrase: '',
    flowId: '',
    whatsappId: '',
  })
  const [saving, setSaving] = useState(false)

  const fetchCampaigns = useCallback(async () => {
    try {
      setLoading(true)
      const { data } = await api.get('/flowcampaign')
      setCampaigns(data.flow || data || [])
    } catch (error) {
      console.error('Error cargando palabras clave:', error)
      toast.error('Error al cargar las palabras clave')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchFlows = useCallback(async () => {
    try {
      const { data } = await api.get('/flowbuilder')
      const flowList = (data.flows || data || []).map((f: any) => ({
        id: f.id,
        name: f.name,
      }))
      setFlows(flowList)
    } catch (error) {
      console.error('Error cargando flujos:', error)
    }
  }, [])

  const fetchWhatsapps = useCallback(async () => {
    try {
      const { data } = await api.get('/whatsapp')
      const list = (data || []).map((w: any) => ({
        id: w.id,
        name: w.name,
      }))
      setWhatsapps(list)
    } catch (error) {
      console.error('Error cargando conexiones:', error)
    }
  }, [])

  useEffect(() => {
    fetchCampaigns()
    fetchFlows()
    fetchWhatsapps()
  }, [fetchCampaigns, fetchFlows, fetchWhatsapps])

  const resetForm = () => {
    setFormData({ name: '', phrase: '', flowId: '', whatsappId: '' })
    setEditingId(null)
  }

  const handleOpenCreate = () => {
    resetForm()
    setOpenModal(true)
  }

  const handleOpenEdit = (campaign: FlowCampaign) => {
    setEditingId(campaign.id)
    setFormData({
      name: campaign.name,
      phrase: campaign.phrase,
      flowId: campaign.flowId?.toString() || '',
      whatsappId: campaign.whatsappId?.toString() || '',
    })
    setOpenModal(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) return toast.error('El nombre es obligatorio')
    if (!formData.phrase.trim()) return toast.error('La palabra clave es obligatoria')
    if (!formData.flowId) return toast.error('Selecciona un flujo')
    if (!formData.whatsappId) return toast.error('Selecciona una conexion')

    try {
      setSaving(true)
      if (editingId) {
        await api.put('/flowcampaign', {
          id: editingId,
          name: formData.name,
          phrase: formData.phrase,
          flowId: Number(formData.flowId),
          whatsappId: formData.whatsappId,
        })
        toast.success('Palabra clave actualizada')
      } else {
        await api.post('/flowcampaign', {
          name: formData.name,
          phrase: formData.phrase,
          flowId: Number(formData.flowId),
          whatsappId: formData.whatsappId,
        })
        toast.success('Palabra clave creada')
      }
      setOpenModal(false)
      resetForm()
      fetchCampaigns()
    } catch (error: any) {
      console.error('Error guardando:', error)
      toast.error(error.response?.data?.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('Eliminar esta palabra clave?')) return
    try {
      await api.delete(`/flowcampaign/${id}`)
      toast.success('Palabra clave eliminada')
      fetchCampaigns()
    } catch (error) {
      toast.error('Error al eliminar')
    }
  }

  const handleToggleStatus = async (campaign: FlowCampaign) => {
    try {
      await api.put('/flowcampaign', {
        id: campaign.id,
        name: campaign.name,
        phrase: campaign.phrase,
        flowId: campaign.flowId,
        whatsappId: campaign.whatsappId.toString(),
        status: !campaign.status,
      })
      fetchCampaigns()
    } catch (error) {
      toast.error('Error al cambiar estado')
    }
  }

  const getFlowName = (id: number) => flows.find(f => f.id === id)?.name || `#${id}`
  const getWhatsappName = (id: number) => whatsapps.find(w => w.id === id)?.name || `#${id}`

  const filtered = campaigns.filter(c =>
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phrase?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <Box sx={{
              width: 48, height: 48, borderRadius: '12px',
              bgcolor: '#5BC2D2', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <PhraseIcon sx={{ color: '#fff', fontSize: 28 }} />
            </Box>
            <Box>
              <Typography level="h2">Palabras Clave</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Configura palabras que disparan flujos automaticamente
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <Tooltip title="Actualizar">
              <IconButton variant="outlined" color="neutral" onClick={fetchCampaigns}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <Button
              startDecorator={<AddIcon />}
              onClick={handleOpenCreate}
              sx={{ bgcolor: '#5BC2D2', '&:hover': { bgcolor: '#4AA8B8' } }}
            >
              Nueva Palabra Clave
            </Button>
          </Stack>
        </Stack>

        {/* Info */}
        <Card variant="soft" color="primary" sx={{ bgcolor: '#EFF6FF', border: '1px solid #BFDBFE' }}>
          <CardContent>
            <Typography level="body-sm" sx={{ color: '#1e40af' }}>
              Cuando un cliente envia un mensaje que contenga la palabra clave configurada,
              se ejecutara automaticamente el flujo asignado en la conexion seleccionada.
              La comparacion ignora mayusculas, tildes y espacios extra.
            </Typography>
          </CardContent>
        </Card>

        {/* Search */}
        <Input
          placeholder="Buscar por nombre o palabra clave..."
          startDecorator={<SearchIcon />}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          sx={{ maxWidth: 400 }}
        />

        {/* Table */}
        <Card>
          <CardContent sx={{ p: 0 }}>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress size="lg" />
              </Box>
            ) : filtered.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <PhraseIcon sx={{ fontSize: 48, color: 'text.tertiary', mb: 1 }} />
                <Typography level="body-lg" sx={{ color: 'text.secondary' }}>
                  {searchTerm ? 'Sin resultados' : 'No hay palabras clave configuradas'}
                </Typography>
                <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 2 }}>
                  {searchTerm ? 'Intenta con otro termino' : 'Crea tu primera palabra clave para disparar flujos'}
                </Typography>
                {!searchTerm && (
                  <Button startDecorator={<AddIcon />} onClick={handleOpenCreate} variant="outlined">
                    Crear primera palabra clave
                  </Button>
                )}
              </Box>
            ) : (
              <Sheet sx={{ overflow: 'auto' }}>
                <Table
                  stripe="odd"
                  hoverRow
                  sx={{
                    '& th': { fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', color: 'text.tertiary' },
                    '& td': { py: 1.5 },
                  }}
                >
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Palabra Clave</th>
                      <th>Flujo</th>
                      <th>Conexion</th>
                      <th style={{ width: 80 }}>Estado</th>
                      <th style={{ width: 100 }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((campaign) => (
                      <tr key={campaign.id}>
                        <td>
                          <Typography level="body-sm" fontWeight={600}>
                            {campaign.name}
                          </Typography>
                        </td>
                        <td>
                          <Chip
                            variant="soft"
                            color="primary"
                            size="sm"
                            startDecorator={<PhraseIcon sx={{ fontSize: 14 }} />}
                          >
                            {campaign.phrase}
                          </Chip>
                        </td>
                        <td>
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <FlowIcon sx={{ fontSize: 16, color: '#5BC2D2' }} />
                            <Typography level="body-sm">{getFlowName(campaign.flowId)}</Typography>
                          </Stack>
                        </td>
                        <td>
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <WhatsAppIcon sx={{ fontSize: 16, color: '#25D366' }} />
                            <Typography level="body-sm">{getWhatsappName(campaign.whatsappId)}</Typography>
                          </Stack>
                        </td>
                        <td>
                          <Switch
                            checked={campaign.status !== false}
                            onChange={() => handleToggleStatus(campaign)}
                            size="sm"
                            color={campaign.status !== false ? 'success' : 'neutral'}
                          />
                        </td>
                        <td>
                          <Stack direction="row" spacing={0.5}>
                            <Tooltip title="Editar">
                              <IconButton size="sm" variant="plain" color="neutral" onClick={() => handleOpenEdit(campaign)}>
                                <EditIcon sx={{ fontSize: 18 }} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Eliminar">
                              <IconButton size="sm" variant="plain" color="danger" onClick={() => handleDelete(campaign.id)}>
                                <DeleteIcon sx={{ fontSize: 18 }} />
                              </IconButton>
                            </Tooltip>
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

        {/* Stats */}
        {campaigns.length > 0 && (
          <Stack direction="row" spacing={2}>
            <Chip variant="outlined" size="sm">
              Total: {campaigns.length}
            </Chip>
            <Chip variant="outlined" size="sm" color="success">
              Activas: {campaigns.filter(c => c.status !== false).length}
            </Chip>
            <Chip variant="outlined" size="sm" color="neutral">
              Inactivas: {campaigns.filter(c => c.status === false).length}
            </Chip>
          </Stack>
        )}
      </Stack>

      {/* Modal Crear/Editar */}
      <Modal open={openModal} onClose={() => { setOpenModal(false); resetForm() }}>
        <ModalDialog sx={{ minWidth: 440, maxWidth: 500 }}>
          <Typography level="title-lg" sx={{ mb: 0.5 }}>
            {editingId ? 'Editar Palabra Clave' : 'Nueva Palabra Clave'}
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.secondary', mb: 3 }}>
            {editingId
              ? 'Modifica la configuracion de esta palabra clave'
              : 'Cuando un cliente envie un mensaje con esta palabra, se ejecutara el flujo seleccionado'
            }
          </Typography>

          <Stack spacing={2.5}>
            <FormControl required>
              <FormLabel>Nombre</FormLabel>
              <Input
                placeholder="Ej: Saludo inicial, Soporte..."
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </FormControl>

            <FormControl required>
              <FormLabel>Palabra Clave</FormLabel>
              <Input
                placeholder="Ej: hola, menu, soporte, precios..."
                startDecorator={<PhraseIcon sx={{ fontSize: 18 }} />}
                value={formData.phrase}
                onChange={(e) => setFormData(prev => ({ ...prev, phrase: e.target.value }))}
              />
              <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                Se activara cuando el mensaje del cliente CONTENGA esta palabra (sin importar mayusculas o tildes)
              </Typography>
            </FormControl>

            <FormControl required>
              <FormLabel>Flujo a ejecutar</FormLabel>
              <Select
                placeholder="Selecciona un flujo..."
                startDecorator={<FlowIcon sx={{ fontSize: 18 }} />}
                value={formData.flowId}
                onChange={(_, value) => setFormData(prev => ({ ...prev, flowId: value as string }))}
              >
                {flows.map(f => (
                  <Option key={f.id} value={f.id.toString()}>{f.name}</Option>
                ))}
              </Select>
            </FormControl>

            <FormControl required>
              <FormLabel>Conexion</FormLabel>
              <Select
                placeholder="Selecciona una conexion..."
                startDecorator={<WhatsAppIcon sx={{ fontSize: 18, color: '#25D366' }} />}
                value={formData.whatsappId}
                onChange={(_, value) => setFormData(prev => ({ ...prev, whatsappId: value as string }))}
              >
                {whatsapps.map(w => (
                  <Option key={w.id} value={w.id.toString()}>{w.name}</Option>
                ))}
              </Select>
              <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                La palabra clave solo se detectara en mensajes de esta conexion
              </Typography>
            </FormControl>
          </Stack>

          <Stack direction="row" spacing={2} justifyContent="flex-end" sx={{ mt: 3 }}>
            <Button variant="outlined" color="neutral" onClick={() => { setOpenModal(false); resetForm() }}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              loading={saving}
              sx={{ bgcolor: '#5BC2D2', '&:hover': { bgcolor: '#4AA8B8' } }}
            >
              {editingId ? 'Guardar Cambios' : 'Crear Palabra Clave'}
            </Button>
          </Stack>
        </ModalDialog>
      </Modal>
    </Container>
  )
}
