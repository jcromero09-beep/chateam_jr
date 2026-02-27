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
  Chip,
  Table,
  IconButton,
  Modal,
  ModalDialog,
  ModalClose,
  FormControl,
  FormLabel,
  Input,
  Select,
  Option,
  CircularProgress,
  Divider,
  Alert,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Switch,
  Checkbox
} from '@mui/joy'
import {
  Inventory as PlansIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  Search as SearchIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  Refresh as RefreshIcon,
  Warning as WarningIcon,
  Payment as PaymentIcon,
  People as PeopleIcon,
  Link as ConnectionIcon,
  Queue as QueueIcon,
  Public as PublicIcon,
  Science as TrialIcon
} from '@mui/icons-material'
import api from '../services/api'

interface Plan {
  id: number
  name: string
  users: number
  connections: number
  queues: number
  amount: string
  useWhatsapp: boolean
  useFacebook: boolean
  useInstagram: boolean
  useCampaigns: boolean
  useSchedules: boolean
  useInternalChat: boolean
  useExternalApi: boolean
  useKanban: boolean
  useOpenAi: boolean
  useIntegrations: boolean
  useMarketing: boolean
  useLeads: boolean
  isPublic: boolean
  trial: boolean
  trialDays: number
  recurrence: string
  stripePriceId: string
  createdAt: string
  updatedAt: string
}

interface FormData {
  name: string
  users: number
  connections: number
  queues: number
  amount: string
  recurrence: string
  useWhatsapp: boolean
  useFacebook: boolean
  useInstagram: boolean
  useCampaigns: boolean
  useSchedules: boolean
  useInternalChat: boolean
  useExternalApi: boolean
  useKanban: boolean
  useOpenAi: boolean
  useIntegrations: boolean
  useMarketing: boolean
  useLeads: boolean
  isPublic: boolean
  trial: boolean
  trialDays: number
}

const RECURRENCE_OPTIONS = [
  { value: 'Day', label: 'Diario' },
  { value: 'MENSUAL', label: 'Mensual' },
  { value: 'BIMESTRAL', label: 'Bimestral' },
  { value: 'TRIMESTRAL', label: 'Trimestral' },
  { value: 'SEMESTRAL', label: 'Semestral' },
  { value: 'ANUAL', label: 'Anual' }
]

const initialFormData: FormData = {
  name: '',
  users: 3,
  connections: 1,
  queues: 3,
  amount: '0',
  recurrence: 'MENSUAL',
  useWhatsapp: true,
  useFacebook: false,
  useInstagram: false,
  useCampaigns: true,
  useSchedules: true,
  useInternalChat: true,
  useExternalApi: false,
  useKanban: true,
  useOpenAi: true,
  useIntegrations: true,
  useMarketing: true,
  useLeads: true,
  isPublic: true,
  trial: false,
  trialDays: 7
}

export default function Plans() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [searchParam, setSearchParam] = useState('')
  const [pageNumber, setPageNumber] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [count, setCount] = useState(0)

  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchPlans()
  }, [searchParam, pageNumber])

  const fetchPlans = async () => {
    setLoading(true)
    try {
      const response = await api.get('/plans', {
        params: { searchParam, pageNumber }
      })
      console.log('Plans response:', response.data)
      const { plans: plansData, count: totalCount, hasMore: more } = response.data
      setPlans(Array.isArray(plansData) ? plansData : [])
      setCount(totalCount || 0)
      setHasMore(more || false)
    } catch (err) {
      console.error('Error fetching plans:', err)
      setError('Error al cargar los planes')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!formData.name) {
      setError('El nombre del plan es requerido')
      return
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setError('El precio debe ser mayor a 0')
      return
    }

    setSaving(true)
    setError('')
    try {
      const payload = { ...formData }
      console.log('Creating plan with:', payload)
      await api.post('/plans', payload)
      setCreateModalOpen(false)
      setFormData(initialFormData)
      fetchPlans()
    } catch (err: any) {
      console.error('Error creating plan:', err)
      setError(err.response?.data?.error || 'Error al crear el plan. Verifica que Stripe esté configurado.')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async () => {
    if (!selectedPlan) return

    setSaving(true)
    setError('')
    try {
      const payload = { ...formData, id: selectedPlan.id }
      console.log('Updating plan:', selectedPlan.id, payload)
      await api.put(`/plans/${selectedPlan.id}`, payload)
      setEditModalOpen(false)
      setSelectedPlan(null)
      setFormData(initialFormData)
      fetchPlans()
    } catch (err: any) {
      console.error('Error updating plan:', err)
      setError(err.response?.data?.error || 'Error al actualizar el plan')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedPlan) return

    setSaving(true)
    setError('')
    try {
      await api.delete(`/plans/${selectedPlan.id}`)
      setDeleteModalOpen(false)
      setSelectedPlan(null)
      fetchPlans()
    } catch (err: any) {
      console.error('Error deleting plan:', err)
      setError(err.response?.data?.error || 'Error al eliminar el plan')
    } finally {
      setSaving(false)
    }
  }

  const openEditModal = (plan: Plan) => {
    setSelectedPlan(plan)
    setFormData({
      name: plan.name || '',
      users: plan.users || 3,
      connections: plan.connections || 1,
      queues: plan.queues || 3,
      amount: plan.amount || '0',
      recurrence: plan.recurrence || 'MENSUAL',
      useWhatsapp: plan.useWhatsapp ?? true,
      useFacebook: plan.useFacebook ?? false,
      useInstagram: plan.useInstagram ?? false,
      useCampaigns: plan.useCampaigns ?? true,
      useSchedules: plan.useSchedules ?? true,
      useInternalChat: plan.useInternalChat ?? true,
      useExternalApi: plan.useExternalApi ?? false,
      useKanban: plan.useKanban ?? true,
      useOpenAi: plan.useOpenAi ?? true,
      useIntegrations: plan.useIntegrations ?? true,
      useMarketing: plan.useMarketing ?? true,
      useLeads: plan.useLeads ?? true,
      isPublic: plan.isPublic ?? true,
      trial: plan.trial ?? false,
      trialDays: plan.trialDays || 7
    })
    setEditModalOpen(true)
  }

  const openViewModal = (plan: Plan) => {
    setSelectedPlan(plan)
    setViewModalOpen(true)
  }

  const openDeleteModal = (plan: Plan) => {
    setSelectedPlan(plan)
    setDeleteModalOpen(true)
  }

  const formatCurrency = (amount: string) => {
    const num = parseFloat(amount)
    return isNaN(num) ? '$0.00' : `$${num.toFixed(2)}`
  }

  const FeatureChip = ({ enabled, label }: { enabled: boolean; label: string }) => (
    <Chip
      size="sm"
      variant="soft"
      color={enabled ? 'success' : 'neutral'}
      startDecorator={enabled ? <CheckIcon sx={{ fontSize: 14 }} /> : <CancelIcon sx={{ fontSize: 14 }} />}
    >
      {label}
    </Chip>
  )

  const FeatureSwitch = ({
    label,
    checked,
    onChange
  }: {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void
  }) => (
    <FormControl>
      <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
        <FormLabel>{label}</FormLabel>
        <Switch checked={checked} onChange={(e) => onChange(e.target.checked)} />
      </Stack>
    </FormControl>
  )

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <PlansIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Planes</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Gestión de planes de suscripción con integración Stripe
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <IconButton variant="outlined" onClick={fetchPlans}>
              <RefreshIcon />
            </IconButton>
            <Button startDecorator={<AddIcon />} color="primary" onClick={() => setCreateModalOpen(true)}>
              Nuevo Plan
            </Button>
          </Stack>
        </Stack>

        {/* Statistics Cards */}
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>Total Planes</Typography>
                <Typography level="h2">{count}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>Públicos</Typography>
                <Typography level="h2" sx={{ color: 'success.main' }}>
                  {plans.filter(p => p.isPublic).length}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>Con Trial</Typography>
                <Typography level="h2" sx={{ color: 'warning.main' }}>
                  {plans.filter(p => p.trial).length}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>Con Stripe</Typography>
                <Typography level="h2" sx={{ color: 'primary.main' }}>
                  {plans.filter(p => p.stripePriceId).length}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Search */}
        <Card>
          <CardContent>
            <Stack direction="row" spacing={2} alignItems="center">
              <Input
                placeholder="Buscar por nombre..."
                startDecorator={<SearchIcon />}
                value={searchParam}
                onChange={(e) => setSearchParam(e.target.value)}
                sx={{ minWidth: 300 }}
              />
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                {count} planes encontrados
              </Typography>
            </Stack>
          </CardContent>
        </Card>

        {/* Plans Table */}
        <Card>
          <CardContent>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : plans.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography level="body-lg">No hay planes registrados</Typography>
                <Button
                  startDecorator={<AddIcon />}
                  sx={{ mt: 2 }}
                  onClick={() => setCreateModalOpen(true)}
                >
                  Crear primer plan
                </Button>
              </Box>
            ) : (
              <Box sx={{ overflowX: 'auto' }}>
                <Table
                  hoverRow
                  sx={{
                    tableLayout: 'fixed',
                    minWidth: 900,
                    '& th, & td': {
                      py: 1.5,
                      px: 1,
                      verticalAlign: 'middle'
                    },
                    '& th': {
                      fontWeight: 600,
                      backgroundColor: 'background.level1'
                    }
                  }}
                >
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}>ID</th>
                      <th style={{ width: 180 }}>Nombre</th>
                      <th style={{ width: 100 }}>Precio</th>
                      <th style={{ width: 110 }}>Recurrencia</th>
                      <th style={{ width: 180 }}>Límites</th>
                      <th style={{ width: 90 }}>Estado</th>
                      <th style={{ width: 100 }}>Stripe</th>
                      <th style={{ width: 100 }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((plan) => (
                      <tr key={plan.id}>
                        <td>
                          <Typography level="body-sm">{plan.id}</Typography>
                        </td>
                        <td>
                          <Stack spacing={0.5}>
                            <Typography level="body-sm" fontWeight="lg" noWrap>{plan.name}</Typography>
                            {plan.trial && (
                              <Chip size="sm" color="warning" variant="soft">
                                Trial {plan.trialDays}d
                              </Chip>
                            )}
                          </Stack>
                        </td>
                        <td>
                          <Typography level="title-sm" color="primary" fontWeight="lg">
                            {formatCurrency(plan.amount)}
                          </Typography>
                        </td>
                        <td>
                          <Chip size="sm" variant="outlined">
                            {plan.recurrence || 'MENSUAL'}
                          </Chip>
                        </td>
                        <td>
                          <Stack spacing={0.5}>
                            <Typography level="body-xs">
                              <strong>{plan.users}</strong> usuarios
                            </Typography>
                            <Typography level="body-xs">
                              <strong>{plan.connections}</strong> conexiones
                            </Typography>
                            <Typography level="body-xs">
                              <strong>{plan.queues}</strong> colas
                            </Typography>
                          </Stack>
                        </td>
                        <td>
                          {plan.isPublic ? (
                            <Chip size="sm" color="success">
                              Público
                            </Chip>
                          ) : (
                            <Chip size="sm" color="neutral">
                              Privado
                            </Chip>
                          )}
                        </td>
                        <td>
                          {plan.stripePriceId ? (
                            <Chip size="sm" color="primary" variant="soft">
                              Vinculado
                            </Chip>
                          ) : (
                            <Chip size="sm" color="warning" variant="soft">
                              Pendiente
                            </Chip>
                          )}
                        </td>
                        <td>
                          <Stack direction="row" spacing={0.5}>
                            <IconButton size="sm" variant="plain" color="primary" onClick={() => openViewModal(plan)} title="Ver detalles">
                              <ViewIcon />
                            </IconButton>
                            <IconButton size="sm" variant="plain" color="warning" onClick={() => openEditModal(plan)} title="Editar">
                              <EditIcon />
                            </IconButton>
                            <IconButton size="sm" variant="plain" color="danger" onClick={() => openDeleteModal(plan)}>
                              <DeleteIcon />
                            </IconButton>
                          </Stack>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>

                {/* Pagination */}
                <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 2 }}>
                  <Button
                    variant="outlined"
                    size="sm"
                    disabled={pageNumber === 1}
                    onClick={() => setPageNumber(p => Math.max(1, p - 1))}
                  >
                    Anterior
                  </Button>
                  <Typography level="body-sm" sx={{ alignSelf: 'center' }}>
                    Página {pageNumber}
                  </Typography>
                  <Button
                    variant="outlined"
                    size="sm"
                    disabled={!hasMore}
                    onClick={() => setPageNumber(p => p + 1)}
                  >
                    Siguiente
                  </Button>
                </Stack>
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Create Modal */}
        <Modal open={createModalOpen} onClose={() => { setCreateModalOpen(false); setError(''); }}>
          <ModalDialog sx={{ maxWidth: 700, maxHeight: '90vh', overflow: 'auto' }}>
            <ModalClose />
            <Typography level="h4" startDecorator={<AddIcon />}>Nuevo Plan</Typography>

            <Alert color="primary" sx={{ mb: 2 }}>
              Al crear un plan se generará automáticamente un producto y precio en Stripe.
              Asegúrate de tener configurada la clave privada de Stripe en Configuraciones.
            </Alert>

            {error && <Alert color="danger" sx={{ mb: 2 }}>{error}</Alert>}

            <Tabs defaultValue={0}>
              <TabList>
                <Tab>Información Básica</Tab>
                <Tab>Características</Tab>
                <Tab>Opciones</Tab>
              </TabList>

              <TabPanel value={0}>
                <Stack spacing={2}>
                  <FormControl required>
                    <FormLabel>Nombre del Plan</FormLabel>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ej: Plan Básico, Plan Pro, Plan Enterprise"
                    />
                  </FormControl>

                  <Grid container spacing={2}>
                    <Grid xs={6}>
                      <FormControl required>
                        <FormLabel>Precio (USD)</FormLabel>
                        <Input
                          type="number"
                          value={formData.amount}
                          onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                          startDecorator="$"
                          slotProps={{ input: { min: 0, step: 0.01 } }}
                        />
                      </FormControl>
                    </Grid>
                    <Grid xs={6}>
                      <FormControl>
                        <FormLabel>Recurrencia</FormLabel>
                        <Select
                          value={formData.recurrence}
                          onChange={(_, value) => setFormData({ ...formData, recurrence: value as string })}
                        >
                          {RECURRENCE_OPTIONS.map((opt) => (
                            <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>

                  <Divider>Límites del Plan</Divider>

                  <Grid container spacing={2}>
                    <Grid xs={4}>
                      <FormControl>
                        <FormLabel>Usuarios</FormLabel>
                        <Input
                          type="number"
                          value={formData.users}
                          onChange={(e) => setFormData({ ...formData, users: parseInt(e.target.value) || 0 })}
                          startDecorator={<PeopleIcon />}
                          slotProps={{ input: { min: 1 } }}
                        />
                      </FormControl>
                    </Grid>
                    <Grid xs={4}>
                      <FormControl>
                        <FormLabel>Conexiones</FormLabel>
                        <Input
                          type="number"
                          value={formData.connections}
                          onChange={(e) => setFormData({ ...formData, connections: parseInt(e.target.value) || 0 })}
                          startDecorator={<ConnectionIcon />}
                          slotProps={{ input: { min: 1 } }}
                        />
                      </FormControl>
                    </Grid>
                    <Grid xs={4}>
                      <FormControl>
                        <FormLabel>Colas</FormLabel>
                        <Input
                          type="number"
                          value={formData.queues}
                          onChange={(e) => setFormData({ ...formData, queues: parseInt(e.target.value) || 0 })}
                          startDecorator={<QueueIcon />}
                          slotProps={{ input: { min: 1 } }}
                        />
                      </FormControl>
                    </Grid>
                  </Grid>
                </Stack>
              </TabPanel>

              <TabPanel value={1}>
                <Typography level="body-sm" sx={{ mb: 2, color: 'text.tertiary' }}>
                  Selecciona las características incluidas en este plan
                </Typography>
                <Grid container spacing={2}>
                  <Grid xs={6}>
                    <Stack spacing={1.5}>
                      <FeatureSwitch label="WhatsApp" checked={formData.useWhatsapp} onChange={(v) => setFormData({ ...formData, useWhatsapp: v })} />
                      <FeatureSwitch label="Facebook" checked={formData.useFacebook} onChange={(v) => setFormData({ ...formData, useFacebook: v })} />
                      <FeatureSwitch label="Instagram" checked={formData.useInstagram} onChange={(v) => setFormData({ ...formData, useInstagram: v })} />
                      <FeatureSwitch label="Campañas" checked={formData.useCampaigns} onChange={(v) => setFormData({ ...formData, useCampaigns: v })} />
                      <FeatureSwitch label="Horarios" checked={formData.useSchedules} onChange={(v) => setFormData({ ...formData, useSchedules: v })} />
                      <FeatureSwitch label="Chat Interno" checked={formData.useInternalChat} onChange={(v) => setFormData({ ...formData, useInternalChat: v })} />
                    </Stack>
                  </Grid>
                  <Grid xs={6}>
                    <Stack spacing={1.5}>
                      <FeatureSwitch label="API Externa" checked={formData.useExternalApi} onChange={(v) => setFormData({ ...formData, useExternalApi: v })} />
                      <FeatureSwitch label="Kanban" checked={formData.useKanban} onChange={(v) => setFormData({ ...formData, useKanban: v })} />
                      <FeatureSwitch label="OpenAI" checked={formData.useOpenAi} onChange={(v) => setFormData({ ...formData, useOpenAi: v })} />
                      <FeatureSwitch label="Integraciones" checked={formData.useIntegrations} onChange={(v) => setFormData({ ...formData, useIntegrations: v })} />
                      <FeatureSwitch label="Marketing" checked={formData.useMarketing} onChange={(v) => setFormData({ ...formData, useMarketing: v })} />
                      <FeatureSwitch label="Leads" checked={formData.useLeads} onChange={(v) => setFormData({ ...formData, useLeads: v })} />
                    </Stack>
                  </Grid>
                </Grid>
              </TabPanel>

              <TabPanel value={2}>
                <Stack spacing={2}>
                  <FeatureSwitch
                    label="Plan Público (visible para nuevos registros)"
                    checked={formData.isPublic}
                    onChange={(v) => setFormData({ ...formData, isPublic: v })}
                  />

                  <Divider />

                  <FeatureSwitch
                    label="Habilitar período de prueba (Trial)"
                    checked={formData.trial}
                    onChange={(v) => setFormData({ ...formData, trial: v })}
                  />

                  {formData.trial && (
                    <FormControl>
                      <FormLabel>Días de prueba</FormLabel>
                      <Input
                        type="number"
                        value={formData.trialDays}
                        onChange={(e) => setFormData({ ...formData, trialDays: parseInt(e.target.value) || 7 })}
                        slotProps={{ input: { min: 1, max: 90 } }}
                      />
                    </FormControl>
                  )}
                </Stack>
              </TabPanel>
            </Tabs>

            <Divider sx={{ my: 2 }} />

            <Stack direction="row" spacing={2} justifyContent="flex-end">
              <Button variant="outlined" color="neutral" onClick={() => { setCreateModalOpen(false); setError(''); }}>
                Cancelar
              </Button>
              <Button color="primary" onClick={handleCreate} loading={saving}>
                Crear Plan
              </Button>
            </Stack>
          </ModalDialog>
        </Modal>

        {/* Edit Modal */}
        <Modal open={editModalOpen} onClose={() => { setEditModalOpen(false); setError(''); }}>
          <ModalDialog sx={{ maxWidth: 700, maxHeight: '90vh', overflow: 'auto' }}>
            <ModalClose />
            <Typography level="h4" startDecorator={<EditIcon />}>Editar Plan</Typography>

            <Alert color="warning" sx={{ mb: 2 }}>
              Los cambios de precio no se reflejarán en Stripe automáticamente.
              El precio en Stripe quedará fijo con el valor original.
            </Alert>

            {error && <Alert color="danger" sx={{ mb: 2 }}>{error}</Alert>}

            <Tabs defaultValue={0}>
              <TabList>
                <Tab>Información Básica</Tab>
                <Tab>Características</Tab>
                <Tab>Opciones</Tab>
              </TabList>

              <TabPanel value={0}>
                <Stack spacing={2}>
                  <FormControl required>
                    <FormLabel>Nombre del Plan</FormLabel>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </FormControl>

                  <Grid container spacing={2}>
                    <Grid xs={6}>
                      <FormControl required>
                        <FormLabel>Precio (USD)</FormLabel>
                        <Input
                          type="number"
                          value={formData.amount}
                          onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                          startDecorator="$"
                          slotProps={{ input: { min: 0, step: 0.01 } }}
                        />
                      </FormControl>
                    </Grid>
                    <Grid xs={6}>
                      <FormControl>
                        <FormLabel>Recurrencia</FormLabel>
                        <Select
                          value={formData.recurrence}
                          onChange={(_, value) => setFormData({ ...formData, recurrence: value as string })}
                        >
                          {RECURRENCE_OPTIONS.map((opt) => (
                            <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>

                  <Divider>Límites del Plan</Divider>

                  <Grid container spacing={2}>
                    <Grid xs={4}>
                      <FormControl>
                        <FormLabel>Usuarios</FormLabel>
                        <Input
                          type="number"
                          value={formData.users}
                          onChange={(e) => setFormData({ ...formData, users: parseInt(e.target.value) || 0 })}
                          startDecorator={<PeopleIcon />}
                          slotProps={{ input: { min: 1 } }}
                        />
                      </FormControl>
                    </Grid>
                    <Grid xs={4}>
                      <FormControl>
                        <FormLabel>Conexiones</FormLabel>
                        <Input
                          type="number"
                          value={formData.connections}
                          onChange={(e) => setFormData({ ...formData, connections: parseInt(e.target.value) || 0 })}
                          startDecorator={<ConnectionIcon />}
                          slotProps={{ input: { min: 1 } }}
                        />
                      </FormControl>
                    </Grid>
                    <Grid xs={4}>
                      <FormControl>
                        <FormLabel>Colas</FormLabel>
                        <Input
                          type="number"
                          value={formData.queues}
                          onChange={(e) => setFormData({ ...formData, queues: parseInt(e.target.value) || 0 })}
                          startDecorator={<QueueIcon />}
                          slotProps={{ input: { min: 1 } }}
                        />
                      </FormControl>
                    </Grid>
                  </Grid>
                </Stack>
              </TabPanel>

              <TabPanel value={1}>
                <Grid container spacing={2}>
                  <Grid xs={6}>
                    <Stack spacing={1.5}>
                      <FeatureSwitch label="WhatsApp" checked={formData.useWhatsapp} onChange={(v) => setFormData({ ...formData, useWhatsapp: v })} />
                      <FeatureSwitch label="Facebook" checked={formData.useFacebook} onChange={(v) => setFormData({ ...formData, useFacebook: v })} />
                      <FeatureSwitch label="Instagram" checked={formData.useInstagram} onChange={(v) => setFormData({ ...formData, useInstagram: v })} />
                      <FeatureSwitch label="Campañas" checked={formData.useCampaigns} onChange={(v) => setFormData({ ...formData, useCampaigns: v })} />
                      <FeatureSwitch label="Horarios" checked={formData.useSchedules} onChange={(v) => setFormData({ ...formData, useSchedules: v })} />
                      <FeatureSwitch label="Chat Interno" checked={formData.useInternalChat} onChange={(v) => setFormData({ ...formData, useInternalChat: v })} />
                    </Stack>
                  </Grid>
                  <Grid xs={6}>
                    <Stack spacing={1.5}>
                      <FeatureSwitch label="API Externa" checked={formData.useExternalApi} onChange={(v) => setFormData({ ...formData, useExternalApi: v })} />
                      <FeatureSwitch label="Kanban" checked={formData.useKanban} onChange={(v) => setFormData({ ...formData, useKanban: v })} />
                      <FeatureSwitch label="OpenAI" checked={formData.useOpenAi} onChange={(v) => setFormData({ ...formData, useOpenAi: v })} />
                      <FeatureSwitch label="Integraciones" checked={formData.useIntegrations} onChange={(v) => setFormData({ ...formData, useIntegrations: v })} />
                      <FeatureSwitch label="Marketing" checked={formData.useMarketing} onChange={(v) => setFormData({ ...formData, useMarketing: v })} />
                      <FeatureSwitch label="Leads" checked={formData.useLeads} onChange={(v) => setFormData({ ...formData, useLeads: v })} />
                    </Stack>
                  </Grid>
                </Grid>
              </TabPanel>

              <TabPanel value={2}>
                <Stack spacing={2}>
                  <FeatureSwitch
                    label="Plan Público"
                    checked={formData.isPublic}
                    onChange={(v) => setFormData({ ...formData, isPublic: v })}
                  />

                  <Divider />

                  <FeatureSwitch
                    label="Habilitar período de prueba (Trial)"
                    checked={formData.trial}
                    onChange={(v) => setFormData({ ...formData, trial: v })}
                  />

                  {formData.trial && (
                    <FormControl>
                      <FormLabel>Días de prueba</FormLabel>
                      <Input
                        type="number"
                        value={formData.trialDays}
                        onChange={(e) => setFormData({ ...formData, trialDays: parseInt(e.target.value) || 7 })}
                        slotProps={{ input: { min: 1, max: 90 } }}
                      />
                    </FormControl>
                  )}
                </Stack>
              </TabPanel>
            </Tabs>

            <Divider sx={{ my: 2 }} />

            <Stack direction="row" spacing={2} justifyContent="flex-end">
              <Button variant="outlined" color="neutral" onClick={() => { setEditModalOpen(false); setError(''); }}>
                Cancelar
              </Button>
              <Button color="primary" onClick={handleUpdate} loading={saving}>
                Guardar Cambios
              </Button>
            </Stack>
          </ModalDialog>
        </Modal>

        {/* View Modal */}
        <Modal open={viewModalOpen} onClose={() => setViewModalOpen(false)}>
          <ModalDialog sx={{ maxWidth: 600, maxHeight: '90vh', overflow: 'auto' }}>
            <ModalClose />
            <Typography level="h4" startDecorator={<PlansIcon />}>
              Detalles del Plan
            </Typography>

            {selectedPlan && (
              <Stack spacing={3}>
                <Card variant="soft">
                  <CardContent>
                    <Grid container spacing={2}>
                      <Grid xs={6}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>ID</Typography>
                        <Typography level="body-md">{selectedPlan.id}</Typography>
                      </Grid>
                      <Grid xs={6}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Estado</Typography>
                        {selectedPlan.isPublic ? (
                          <Chip size="sm" color="success">Público</Chip>
                        ) : (
                          <Chip size="sm" color="neutral">Privado</Chip>
                        )}
                      </Grid>
                      <Grid xs={12}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Nombre</Typography>
                        <Typography level="h3">{selectedPlan.name}</Typography>
                      </Grid>
                      <Grid xs={6}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Precio</Typography>
                        <Typography level="h4" color="primary">{formatCurrency(selectedPlan.amount)}</Typography>
                      </Grid>
                      <Grid xs={6}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Recurrencia</Typography>
                        <Typography level="body-md">{selectedPlan.recurrence || 'MENSUAL'}</Typography>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>

                <Card variant="outlined">
                  <CardContent>
                    <Typography level="title-md" sx={{ mb: 2 }}>Límites</Typography>
                    <Grid container spacing={2}>
                      <Grid xs={4}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Usuarios</Typography>
                        <Typography level="h4">{selectedPlan.users}</Typography>
                      </Grid>
                      <Grid xs={4}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Conexiones</Typography>
                        <Typography level="h4">{selectedPlan.connections}</Typography>
                      </Grid>
                      <Grid xs={4}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Colas</Typography>
                        <Typography level="h4">{selectedPlan.queues}</Typography>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>

                <Card variant="outlined">
                  <CardContent>
                    <Typography level="title-md" sx={{ mb: 2 }}>Características</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      <FeatureChip enabled={selectedPlan.useWhatsapp} label="WhatsApp" />
                      <FeatureChip enabled={selectedPlan.useFacebook} label="Facebook" />
                      <FeatureChip enabled={selectedPlan.useInstagram} label="Instagram" />
                      <FeatureChip enabled={selectedPlan.useCampaigns} label="Campañas" />
                      <FeatureChip enabled={selectedPlan.useSchedules} label="Horarios" />
                      <FeatureChip enabled={selectedPlan.useInternalChat} label="Chat Interno" />
                      <FeatureChip enabled={selectedPlan.useExternalApi} label="API Externa" />
                      <FeatureChip enabled={selectedPlan.useKanban} label="Kanban" />
                      <FeatureChip enabled={selectedPlan.useOpenAi} label="OpenAI" />
                      <FeatureChip enabled={selectedPlan.useIntegrations} label="Integraciones" />
                      <FeatureChip enabled={selectedPlan.useMarketing} label="Marketing" />
                      <FeatureChip enabled={selectedPlan.useLeads} label="Leads" />
                    </Box>
                  </CardContent>
                </Card>

                {selectedPlan.trial && (
                  <Card variant="outlined" color="warning">
                    <CardContent>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <TrialIcon color="warning" />
                        <Box>
                          <Typography level="title-md">Período de Prueba Habilitado</Typography>
                          <Typography level="body-sm">{selectedPlan.trialDays} días de prueba gratis</Typography>
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>
                )}

                {selectedPlan.stripePriceId && (
                  <Card variant="outlined" color="primary">
                    <CardContent>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <PaymentIcon color="primary" />
                        <Box>
                          <Typography level="title-md">Stripe ID</Typography>
                          <Typography level="body-xs" sx={{ fontFamily: 'monospace' }}>
                            {selectedPlan.stripePriceId}
                          </Typography>
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>
                )}

                <Stack direction="row" spacing={2} justifyContent="flex-end">
                  <Button variant="outlined" onClick={() => setViewModalOpen(false)}>Cerrar</Button>
                  <Button
                    color="warning"
                    startDecorator={<EditIcon />}
                    onClick={() => {
                      setViewModalOpen(false)
                      openEditModal(selectedPlan)
                    }}
                  >
                    Editar
                  </Button>
                </Stack>
              </Stack>
            )}
          </ModalDialog>
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal open={deleteModalOpen} onClose={() => setDeleteModalOpen(false)}>
          <ModalDialog variant="outlined" role="alertdialog">
            <Typography level="h4" startDecorator={<WarningIcon color="warning" />}>
              Confirmar Eliminación
            </Typography>
            <Divider />
            <Typography sx={{ my: 2 }}>
              ¿Estás seguro de que deseas eliminar el plan <strong>{selectedPlan?.name}</strong>?
            </Typography>
            {selectedPlan?.stripePriceId && (
              <Alert color="warning" sx={{ mb: 2 }}>
                Este plan tiene un precio vinculado en Stripe ({selectedPlan.stripePriceId}).
                El precio será desactivado en Stripe automáticamente.
              </Alert>
            )}
            <Alert color="danger" sx={{ mb: 2 }}>
              Esta acción no se puede deshacer. Las empresas con este plan asignado
              podrían quedar sin plan válido.
            </Alert>
            {error && <Alert color="danger" sx={{ mb: 2 }}>{error}</Alert>}
            <Stack direction="row" spacing={2} justifyContent="flex-end">
              <Button variant="outlined" color="neutral" onClick={() => { setDeleteModalOpen(false); setError(''); }}>
                Cancelar
              </Button>
              <Button color="danger" onClick={handleDelete} loading={saving}>
                Eliminar
              </Button>
            </Stack>
          </ModalDialog>
        </Modal>
      </Stack>
    </Container>
  )
}
