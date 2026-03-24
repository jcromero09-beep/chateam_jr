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
  Switch
} from '@mui/joy'
import {
  Email as EmailIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  Search as SearchIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  Refresh as RefreshIcon,
  Warning as WarningIcon,
  CreditCard as CreditIcon
} from '@mui/icons-material'
import api from '../services/api'

interface EmailPlan {
  id: number
  name: string
  description: string
  emailCreditsPerCycle: number
  maxEmailSendsPerDay: number
  maxTemplates: number
  price: string
  recurrence: string
  stripePriceId: string
  isPublic: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface FormData {
  name: string
  description: string
  emailCreditsPerCycle: number
  maxEmailSendsPerDay: number
  maxTemplates: number
  price: string
  recurrence: string
  isPublic: boolean
  isActive: boolean
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
  description: '',
  emailCreditsPerCycle: 100,
  maxEmailSendsPerDay: 50,
  maxTemplates: 10,
  price: '9.99',
  recurrence: 'MENSUAL',
  isPublic: true,
  isActive: true
}

export default function EmailPlans() {
  const [plans, setPlans] = useState<EmailPlan[]>([])
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
  const [selectedPlan, setSelectedPlan] = useState<EmailPlan | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchPlans()
  }, [searchParam, pageNumber])

  const fetchPlans = async () => {
    setLoading(true)
    try {
      const response = await api.get('/email-plans', {
        params: { includePrivate: true }
      })
      console.log('Email Plans response:', response.data)
      const { data } = response.data
      setPlans(Array.isArray(data) ? data : [])
      setCount(Array.isArray(data) ? data.length : 0)
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

    if (!formData.price || parseFloat(formData.price) <= 0) {
      setError('El precio debe ser mayor a 0')
      return
    }

    setSaving(true)
    setError('')
    try {
      await api.post('/email-plans', formData)
      setCreateModalOpen(false)
      setFormData(initialFormData)
      fetchPlans()
    } catch (err: any) {
      console.error('Error creating plan:', err)
      setError(err.response?.data?.error || err.response?.data?.errors?.[0] || 'Error al crear el plan')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async () => {
    if (!selectedPlan) return

    setSaving(true)
    setError('')
    try {
      await api.put(`/email-plans/${selectedPlan.id}`, formData)
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
      await api.delete(`/email-plans/${selectedPlan.id}`)
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

  const openEditModal = (plan: EmailPlan) => {
    setSelectedPlan(plan)
    setFormData({
      name: plan.name || '',
      description: plan.description || '',
      emailCreditsPerCycle: plan.emailCreditsPerCycle || 100,
      maxEmailSendsPerDay: plan.maxEmailSendsPerDay || 50,
      maxTemplates: plan.maxTemplates || 10,
      price: plan.price || '0',
      recurrence: plan.recurrence || 'MENSUAL',
      isPublic: plan.isPublic ?? true,
      isActive: plan.isActive ?? true
    })
    setEditModalOpen(true)
  }

  const openViewModal = (plan: EmailPlan) => {
    setSelectedPlan(plan)
    setViewModalOpen(true)
  }

  const openDeleteModal = (plan: EmailPlan) => {
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
            <EmailIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Planes de Email</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Gestión de planes de envío de emails con créditos
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
                <Typography level="body-sm" sx={{ mb: 1 }}>Activos</Typography>
                <Typography level="h2" sx={{ color: 'primary.main' }}>
                  {plans.filter(p => p.isActive).length}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>Con Stripe</Typography>
                <Typography level="h2" sx={{ color: 'warning.main' }}>
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
                <Typography level="body-lg">No hay planes de email registrados</Typography>
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
                      <th style={{ width: 120 }}>Créditos</th>
                      <th style={{ width: 120 }}>Límites</th>
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
                          </Stack>
                        </td>
                        <td>
                          <Typography level="title-sm" color="primary" fontWeight="lg">
                            {formatCurrency(plan.price)}
                          </Typography>
                        </td>
                        <td>
                          <Stack spacing={0.5}>
                            <Typography level="body-xs">
                              <strong>{plan.emailCreditsPerCycle}</strong> créditos
                            </Typography>
                            <Typography level="body-xs" color="neutral">
                              {plan.recurrence || 'MENSUAL'}
                            </Typography>
                          </Stack>
                        </td>
                        <td>
                          <Stack spacing={0.5}>
                            <Typography level="body-xs">
                              <strong>{plan.maxEmailSendsPerDay}</strong> envíos/día
                            </Typography>
                            <Typography level="body-xs">
                              <strong>{plan.maxTemplates}</strong> plantillas
                            </Typography>
                          </Stack>
                        </td>
                        <td>
                          {plan.isActive ? (
                            <Chip size="sm" color="success">
                              Activo
                            </Chip>
                          ) : (
                            <Chip size="sm" color="neutral">
                              Inactivo
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
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Create Modal */}
        <Modal open={createModalOpen} onClose={() => { setCreateModalOpen(false); setError(''); }}>
          <ModalDialog sx={{ maxWidth: 700, maxHeight: '90vh', overflow: 'auto' }}>
            <ModalClose />
            <Typography level="h4" startDecorator={<AddIcon />}>Nuevo Plan de Email</Typography>

            <Alert color="primary" sx={{ mb: 2 }}>
              Define los límites y créditos para tu plan de email.
            </Alert>

            {error && <Alert color="danger" sx={{ mb: 2 }}>{error}</Alert>}

            <Tabs defaultValue={0}>
              <TabList>
                <Tab>Información</Tab>
                <Tab>Límites</Tab>
                <Tab>Opciones</Tab>
              </TabList>

              <TabPanel value={0}>
                <Stack spacing={2}>
                  <FormControl required>
                    <FormLabel>Nombre del Plan</FormLabel>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ej: Plan Básico Email, Plan Pro Email"
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>Descripción</FormLabel>
                    <Input
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Descripción del plan..."
                    />
                  </FormControl>

                  <Grid container spacing={2}>
                    <Grid xs={6}>
                      <FormControl required>
                        <FormLabel>Precio (USD)</FormLabel>
                        <Input
                          type="number"
                          value={formData.price}
                          onChange={(e) => setFormData({ ...formData, price: e.target.value })}
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
                </Stack>
              </TabPanel>

              <TabPanel value={1}>
                <Stack spacing={2}>
                  <Grid container spacing={2}>
                    <Grid xs={6}>
                      <FormControl>
                        <FormLabel>Créditos por Ciclo</FormLabel>
                        <Input
                          type="number"
                          value={formData.emailCreditsPerCycle}
                          onChange={(e) => setFormData({ ...formData, emailCreditsPerCycle: parseInt(e.target.value) || 0 })}
                          startDecorator={<CreditIcon />}
                          slotProps={{ input: { min: 0 } }}
                        />
                      </FormControl>
                    </Grid>
                    <Grid xs={6}>
                      <FormControl>
                        <FormLabel>Máx. Envíos/Día</FormLabel>
                        <Input
                          type="number"
                          value={formData.maxEmailSendsPerDay}
                          onChange={(e) => setFormData({ ...formData, maxEmailSendsPerDay: parseInt(e.target.value) || 0 })}
                          slotProps={{ input: { min: 0 } }}
                        />
                      </FormControl>
                    </Grid>
                  </Grid>

                  <FormControl>
                    <FormLabel>Máx. Plantillas</FormLabel>
                    <Input
                      type="number"
                      value={formData.maxTemplates}
                      onChange={(e) => setFormData({ ...formData, maxTemplates: parseInt(e.target.value) || 0 })}
                      slotProps={{ input: { min: 0 } }}
                    />
                  </FormControl>
                </Stack>
              </TabPanel>

              <TabPanel value={2}>
                <Stack spacing={2}>
                  <FeatureSwitch
                    label="Plan Público (visible para companies)"
                    checked={formData.isPublic}
                    onChange={(v) => setFormData({ ...formData, isPublic: v })}
                  />

                  <Divider />

                  <FeatureSwitch
                    label="Plan Activo"
                    checked={formData.isActive}
                    onChange={(v) => setFormData({ ...formData, isActive: v })}
                  />
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
            <Typography level="h4" startDecorator={<EditIcon />}>Editar Plan de Email</Typography>

            {error && <Alert color="danger" sx={{ mb: 2 }}>{error}</Alert>}

            <Tabs defaultValue={0}>
              <TabList>
                <Tab>Información</Tab>
                <Tab>Límites</Tab>
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

                  <FormControl>
                    <FormLabel>Descripción</FormLabel>
                    <Input
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </FormControl>

                  <Grid container spacing={2}>
                    <Grid xs={6}>
                      <FormControl required>
                        <FormLabel>Precio (USD)</FormLabel>
                        <Input
                          type="number"
                          value={formData.price}
                          onChange={(e) => setFormData({ ...formData, price: e.target.value })}
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
                </Stack>
              </TabPanel>

              <TabPanel value={1}>
                <Stack spacing={2}>
                  <Grid container spacing={2}>
                    <Grid xs={6}>
                      <FormControl>
                        <FormLabel>Créditos por Ciclo</FormLabel>
                        <Input
                          type="number"
                          value={formData.emailCreditsPerCycle}
                          onChange={(e) => setFormData({ ...formData, emailCreditsPerCycle: parseInt(e.target.value) || 0 })}
                          startDecorator={<CreditIcon />}
                          slotProps={{ input: { min: 0 } }}
                        />
                      </FormControl>
                    </Grid>
                    <Grid xs={6}>
                      <FormControl>
                        <FormLabel>Máx. Envíos/Día</FormLabel>
                        <Input
                          type="number"
                          value={formData.maxEmailSendsPerDay}
                          onChange={(e) => setFormData({ ...formData, maxEmailSendsPerDay: parseInt(e.target.value) || 0 })}
                          slotProps={{ input: { min: 0 } }}
                        />
                      </FormControl>
                    </Grid>
                  </Grid>

                  <FormControl>
                    <FormLabel>Máx. Plantillas</FormLabel>
                    <Input
                      type="number"
                      value={formData.maxTemplates}
                      onChange={(e) => setFormData({ ...formData, maxTemplates: parseInt(e.target.value) || 0 })}
                      slotProps={{ input: { min: 0 } }}
                    />
                  </FormControl>
                </Stack>
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
                    label="Plan Activo"
                    checked={formData.isActive}
                    onChange={(v) => setFormData({ ...formData, isActive: v })}
                  />
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
            <Typography level="h4" startDecorator={<EmailIcon />}>
              Detalles del Plan de Email
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
                        {selectedPlan.isActive ? (
                          <Chip size="sm" color="success">Activo</Chip>
                        ) : (
                          <Chip size="sm" color="neutral">Inactivo</Chip>
                        )}
                      </Grid>
                      <Grid xs={12}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Nombre</Typography>
                        <Typography level="h3">{selectedPlan.name}</Typography>
                      </Grid>
                      <Grid xs={6}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Precio</Typography>
                        <Typography level="h4" color="primary">{formatCurrency(selectedPlan.price)}</Typography>
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
                    <Typography level="title-md" sx={{ mb: 2 }}>Créditos y Límites</Typography>
                    <Grid container spacing={2}>
                      <Grid xs={6}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Créditos/Ciclo</Typography>
                        <Typography level="h4">{selectedPlan.emailCreditsPerCycle}</Typography>
                      </Grid>
                      <Grid xs={6}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Envíos/Día</Typography>
                        <Typography level="h4">{selectedPlan.maxEmailSendsPerDay}</Typography>
                      </Grid>
                      <Grid xs={6}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Plantillas</Typography>
                        <Typography level="h4">{selectedPlan.maxTemplates}</Typography>
                      </Grid>
                      <Grid xs={6}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Visibilidad</Typography>
                        {selectedPlan.isPublic ? (
                          <Chip size="sm" color="success">Público</Chip>
                        ) : (
                          <Chip size="sm" color="neutral">Privado</Chip>
                        )}
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>

                {selectedPlan.stripePriceId && (
                  <Card variant="outlined" color="primary">
                    <CardContent>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <CreditIcon color="primary" />
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
              ¿Estás seguro de que deseas eliminar el plan de email <strong>{selectedPlan?.name}</strong>?
            </Typography>
            <Alert color="danger" sx={{ mb: 2 }}>
              Esta acción no se puede deshacer.
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
