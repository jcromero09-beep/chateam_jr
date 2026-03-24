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
  Domain as CompaniesIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  Search as SearchIcon,
  CheckCircle as ActiveIcon,
  Cancel as InactiveIcon,
  Schedule as ScheduleIcon,
  Refresh as RefreshIcon,
  Business as BusinessIcon,
  Person as PersonIcon,
  CalendarMonth as CalendarIcon,
  Payment as PaymentIcon,
  Warning as WarningIcon
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
  trial: boolean
  trialDays: number
  recurrence: string
}

interface AISubplan {
  id: number
  name: string
  description: string
  tokens: number
  priceUsd: number
  isActive: boolean
  isPublic: boolean
  companyId: number
}

interface EmailPlan {
  id: number
  name: string
  description: string
  emailCreditsPerCycle: number
  maxEmailSendsPerDay: number
  maxTemplates: number
  price: string
  recurrence: string
  isActive: boolean
  isPublic: boolean
}

interface Company {
  id: number
  name: string
  phone: string
  email: string
  document: string
  paymentMethod: string
  status: boolean
  dueDate: string
  recurrence: string
  planId: number
  plan?: Plan
  aiTokenBalance?: number
  activeAISubplanId?: number | null
  activeAISubplan?: AISubplan
  emailCreditsTotal?: number
  activeEmailPlanId?: number | null
  activeEmailPlan?: EmailPlan
  createdAt: string
  updatedAt: string
  users?: { id: number; name: string; email: string; profile: string }[]
}

interface FormData {
  name: string
  email: string
  phone: string
  document: string
  paymentMethod: string
  status: boolean
  planId: number
  dueDate: string
  recurrence: string
  password: string
  companyUserName: string
  aiTokenBalance: number
  activeAISubplanId: number | null
  emailCreditsTotal: number
  activeEmailPlanId: number | null
}

const RECURRENCE_OPTIONS = [
  { value: 'MENSUAL', label: 'Mensual (30 días)', days: 30 },
  { value: 'BIMESTRAL', label: 'Bimestral (60 días)', days: 60 },
  { value: 'TRIMESTRAL', label: 'Trimestral (90 días)', days: 90 },
  { value: 'SEMESTRAL', label: 'Semestral (180 días)', days: 180 },
  { value: 'ANUAL', label: 'Anual (365 días)', days: 365 }
]

const initialFormData: FormData = {
  name: '',
  email: '',
  phone: '',
  document: '',
  paymentMethod: '',
  status: true,
  planId: 1,
  dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  recurrence: 'MENSUAL',
  password: '',
  companyUserName: '',
  aiTokenBalance: 0,
  activeAISubplanId: null,
  emailCreditsTotal: 0,
  activeEmailPlanId: null
}

export default function Companies() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [aiSubplans, setAiSubplans] = useState<AISubplan[]>([])
  const [emailPlans, setEmailPlans] = useState<EmailPlan[]>([])
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
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Statistics
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    trial: 0,
    expired: 0
  })

  useEffect(() => {
    fetchCompanies()
    fetchPlans()
    fetchAISubplans()
    fetchEmailPlans()
  }, [searchParam, pageNumber])

  const fetchCompanies = async () => {
    setLoading(true)
    try {
      const response = await api.get('/companies', {
        params: { searchParam, pageNumber }
      })
      console.log('Companies response:', response.data)
      const { companies: companiesData, count: totalCount, hasMore: more } = response.data
      setCompanies(companiesData || [])
      setCount(totalCount || 0)
      setHasMore(more || false)

      // Calculate stats
      const active = companiesData?.filter((c: Company) => c.status === true).length || 0
      const inactive = companiesData?.filter((c: Company) => c.status === false).length || 0
      const today = new Date()
      const expired = companiesData?.filter((c: Company) => {
        if (!c.dueDate) return false
        return new Date(c.dueDate) < today
      }).length || 0
      const trial = companiesData?.filter((c: Company) => c.plan?.trial).length || 0

      setStats({
        total: totalCount || companiesData?.length || 0,
        active,
        inactive,
        trial,
        expired
      })
    } catch (err) {
      console.error('Error fetching companies:', err)
      setError('Error al cargar las empresas')
    } finally {
      setLoading(false)
    }
  }

  const fetchPlans = async () => {
    try {
      const response = await api.get('/plans')
      console.log('Plans response:', response.data)
      // La respuesta es { plans, count, hasMore }
      const plansData = response.data?.plans || response.data || []
      setPlans(Array.isArray(plansData) ? plansData : [])
    } catch (err) {
      console.error('Error fetching plans:', err)
    }
  }

  const fetchAISubplans = async () => {
    try {
      const response = await api.get('/ai/subplans')
      console.log('AI Subplans response:', response.data)
      const subplansData = response.data?.data || []
      setAiSubplans(Array.isArray(subplansData) ? subplansData : [])
    } catch (err) {
      console.error('Error fetching AI subplans:', err)
    }
  }

  const fetchEmailPlans = async () => {
    try {
      const response = await api.get('/email-plans')
      console.log('Email Plans response:', response.data)
      const plansData = response.data?.data || []
      setEmailPlans(Array.isArray(plansData) ? plansData : [])
    } catch (err) {
      console.error('Error fetching email plans:', err)
    }
  }

  const handleCreate = async () => {
    if (!formData.name || !formData.email || !formData.password) {
      setError('Nombre, email y contraseña son requeridos')
      return
    }

    setSaving(true)
    setError('')
    try {
      const payload = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        document: formData.document,
        paymentMethod: formData.paymentMethod,
        status: formData.status,
        planId: formData.planId,
        dueDate: formData.dueDate,
        recurrence: formData.recurrence,
        password: formData.password,
        companyUserName: formData.companyUserName || formData.name
      }
      console.log('Creating company with:', payload)
      await api.post('/companies', payload)
      setCreateModalOpen(false)
      setFormData(initialFormData)
      fetchCompanies()
    } catch (err: any) {
      console.error('Error creating company:', err)
      setError(err.response?.data?.error || 'Error al crear la empresa')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async () => {
    if (!selectedCompany) return

    setSaving(true)
    setError('')
    try {
      const payload = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        document: formData.document,
        paymentMethod: formData.paymentMethod,
        status: formData.status,
        planId: formData.planId,
        dueDate: formData.dueDate,
        recurrence: formData.recurrence,
        aiTokenBalance: formData.aiTokenBalance,
        activeAISubplanId: formData.activeAISubplanId,
        emailCreditsTotal: formData.emailCreditsTotal,
        activeEmailPlanId: formData.activeEmailPlanId
      }
      console.log('Updating company:', selectedCompany.id, payload)
      await api.put(`/companies/${selectedCompany.id}`, payload)
      setEditModalOpen(false)
      setSelectedCompany(null)
      setFormData(initialFormData)
      fetchCompanies()
    } catch (err: any) {
      console.error('Error updating company:', err)
      setError(err.response?.data?.error || 'Error al actualizar la empresa')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedCompany) return

    setSaving(true)
    try {
      await api.delete(`/companies/${selectedCompany.id}`)
      setDeleteModalOpen(false)
      setSelectedCompany(null)
      fetchCompanies()
    } catch (err: any) {
      console.error('Error deleting company:', err)
      setError(err.response?.data?.error || 'Error al eliminar la empresa')
    } finally {
      setSaving(false)
    }
  }

  const openEditModal = (company: Company) => {
    setSelectedCompany(company)
    setFormData({
      name: company.name || '',
      email: company.email || '',
      phone: company.phone || '',
      document: company.document || '',
      paymentMethod: company.paymentMethod || '',
      status: company.status ?? true,
      planId: company.planId || 1,
      dueDate: company.dueDate?.split('T')[0] || '',
      recurrence: company.recurrence || 'MENSUAL',
      password: '',
      companyUserName: '',
      aiTokenBalance: company.aiTokenBalance || 0,
      activeAISubplanId: company.activeAISubplanId || null,
      emailCreditsTotal: company.emailCreditsTotal || 0,
      activeEmailPlanId: company.activeEmailPlanId || null
    })
    setEditModalOpen(true)
  }

  const openViewModal = async (company: Company) => {
    try {
      const response = await api.get(`/companies/${company.id}`)
      console.log('Company details:', response.data)
      setSelectedCompany(response.data)
      setViewModalOpen(true)
    } catch (err) {
      console.error('Error fetching company details:', err)
      setSelectedCompany(company)
      setViewModalOpen(true)
    }
  }

  const openDeleteModal = (company: Company) => {
    setSelectedCompany(company)
    setDeleteModalOpen(true)
  }

  const getDaysUntilExpiration = (dueDate: string) => {
    if (!dueDate) return null
    const due = new Date(dueDate)
    const today = new Date()
    const diffTime = due.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  const getExpirationColor = (dueDate: string) => {
    const days = getDaysUntilExpiration(dueDate)
    if (days === null) return 'neutral'
    if (days < 0) return 'danger'
    if (days <= 7) return 'warning'
    return 'success'
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString('es-ES')
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <CompaniesIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Empresas</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Gestión de empresas del sistema (Solo Super Admin)
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <IconButton variant="outlined" onClick={fetchCompanies}>
              <RefreshIcon />
            </IconButton>
            <Button startDecorator={<AddIcon />} color="primary" onClick={() => setCreateModalOpen(true)}>
              Nueva Empresa
            </Button>
          </Stack>
        </Stack>

        {/* Statistics Cards */}
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>Total Empresas</Typography>
                <Typography level="h2">{stats.total}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>Activas</Typography>
                <Typography level="h2" sx={{ color: 'success.main' }}>{stats.active}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>Inactivas</Typography>
                <Typography level="h2" sx={{ color: 'neutral.main' }}>{stats.inactive}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>En Trial</Typography>
                <Typography level="h2" sx={{ color: 'warning.main' }}>{stats.trial}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>Expiradas</Typography>
                <Typography level="h2" sx={{ color: 'danger.main' }}>{stats.expired}</Typography>
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
                {count} empresas encontradas
              </Typography>
            </Stack>
          </CardContent>
        </Card>

        {/* Companies Table */}
        <Card>
          <CardContent>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : companies.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography level="body-lg">No hay empresas registradas</Typography>
              </Box>
            ) : (
              <>
                <Table hoverRow>
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>ID</th>
                      <th>Nombre</th>
                      <th>Email</th>
                      <th>Plan</th>
                      <th>Recurrencia</th>
                      <th>Vencimiento</th>
                      <th>Estado</th>
                      <th style={{ width: 140 }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companies.map((company) => {
                      const daysLeft = getDaysUntilExpiration(company.dueDate)
                      return (
                        <tr key={company.id}>
                          <td>{company.id}</td>
                          <td>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <BusinessIcon sx={{ fontSize: 20, color: 'primary.main' }} />
                              <Typography level="body-sm" fontWeight="lg">{company.name}</Typography>
                            </Stack>
                          </td>
                          <td>{company.email || '-'}</td>
                          <td>
                            <Chip size="sm" variant="soft" color="primary">
                              {company.plan?.name || `Plan ${company.planId}`}
                            </Chip>
                          </td>
                          <td>
                            <Chip size="sm" variant="outlined">
                              {company.recurrence || 'MENSUAL'}
                            </Chip>
                          </td>
                          <td>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Chip
                                size="sm"
                                color={getExpirationColor(company.dueDate)}
                                startDecorator={<CalendarIcon sx={{ fontSize: 14 }} />}
                              >
                                {formatDate(company.dueDate)}
                              </Chip>
                              {daysLeft !== null && (
                                <Typography
                                  level="body-xs"
                                  sx={{ color: daysLeft < 0 ? 'danger.main' : daysLeft <= 7 ? 'warning.main' : 'success.main' }}
                                >
                                  {daysLeft < 0 ? `(${Math.abs(daysLeft)}d vencido)` : `(${daysLeft}d)`}
                                </Typography>
                              )}
                            </Stack>
                          </td>
                          <td>
                            {company.status ? (
                              <Chip size="sm" color="success" startDecorator={<ActiveIcon sx={{ fontSize: 14 }} />}>
                                Activa
                              </Chip>
                            ) : (
                              <Chip size="sm" color="danger" startDecorator={<InactiveIcon sx={{ fontSize: 14 }} />}>
                                Inactiva
                              </Chip>
                            )}
                          </td>
                          <td>
                            <Stack direction="row" spacing={0.5}>
                              <IconButton
                                size="sm"
                                variant="plain"
                                color="primary"
                                onClick={() => openViewModal(company)}
                              >
                                <ViewIcon />
                              </IconButton>
                              <IconButton
                                size="sm"
                                variant="plain"
                                color="warning"
                                onClick={() => openEditModal(company)}
                              >
                                <EditIcon />
                              </IconButton>
                              <IconButton
                                size="sm"
                                variant="plain"
                                color="danger"
                                onClick={() => openDeleteModal(company)}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Stack>
                          </td>
                        </tr>
                      )
                    })}
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
              </>
            )}
          </CardContent>
        </Card>

        {/* Create Modal */}
        <Modal open={createModalOpen} onClose={() => { setCreateModalOpen(false); setError(''); }}>
          <ModalDialog sx={{ maxWidth: 600, overflow: 'auto' }}>
            <ModalClose />
            <Typography level="h4" startDecorator={<AddIcon />}>Nueva Empresa</Typography>
            <Typography level="body-sm" sx={{ mb: 2, color: 'text.tertiary' }}>
              Al crear una empresa se generarán automáticamente: usuario admin, configuraciones, colas, tags del kanban, conexión demo de WhatsApp y flujo demo.
            </Typography>

            {error && <Alert color="danger" sx={{ mb: 2 }}>{error}</Alert>}

            <Tabs defaultValue={0}>
              <TabList>
                <Tab>Datos Básicos</Tab>
                <Tab>Plan y Facturación</Tab>
              </TabList>

              <TabPanel value={0}>
                <Stack spacing={2}>
                  <FormControl required>
                    <FormLabel>Nombre de la Empresa</FormLabel>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      startDecorator={<BusinessIcon />}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>Nombre del Usuario Admin</FormLabel>
                    <Input
                      value={formData.companyUserName}
                      onChange={(e) => setFormData({ ...formData, companyUserName: e.target.value })}
                      placeholder={formData.name || 'Mismo que nombre de empresa'}
                      startDecorator={<PersonIcon />}
                    />
                  </FormControl>

                  <FormControl required>
                    <FormLabel>Email</FormLabel>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </FormControl>

                  <FormControl required>
                    <FormLabel>Contraseña (para usuario admin)</FormLabel>
                    <Input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="Mínimo 5 caracteres"
                    />
                  </FormControl>

                  <Grid container spacing={2}>
                    <Grid xs={6}>
                      <FormControl>
                        <FormLabel>Teléfono</FormLabel>
                        <Input
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        />
                      </FormControl>
                    </Grid>
                    <Grid xs={6}>
                      <FormControl>
                        <FormLabel>Documento/NIF</FormLabel>
                        <Input
                          value={formData.document}
                          onChange={(e) => setFormData({ ...formData, document: e.target.value })}
                        />
                      </FormControl>
                    </Grid>
                  </Grid>

                  <FormControl>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <FormLabel>Estado Activo</FormLabel>
                      <Switch
                        checked={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.checked })}
                      />
                    </Stack>
                  </FormControl>
                </Stack>
              </TabPanel>

              <TabPanel value={1}>
                <Stack spacing={2}>
                  <FormControl>
                    <FormLabel>Plan</FormLabel>
                    <Select
                      value={formData.planId}
                      onChange={(_, value) => setFormData({ ...formData, planId: value as number })}
                    >
                      {plans.map((plan) => (
                        <Option key={plan.id} value={plan.id}>
                          {plan.name} - {plan.users} usuarios, {plan.connections} conexiones - ${plan.amount}
                        </Option>
                      ))}
                      {plans.length === 0 && <Option value={1}>Plan Básico</Option>}
                    </Select>
                  </FormControl>

                  <FormControl>
                    <FormLabel>Recurrencia</FormLabel>
                    <Select
                      value={formData.recurrence}
                      onChange={(_, value) => setFormData({ ...formData, recurrence: value as string })}
                      startDecorator={<ScheduleIcon />}
                    >
                      {RECURRENCE_OPTIONS.map((opt) => (
                        <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl>
                    <FormLabel>Fecha de Vencimiento</FormLabel>
                    <Input
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                      startDecorator={<CalendarIcon />}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>Método de Pago</FormLabel>
                    <Select
                      value={formData.paymentMethod}
                      onChange={(_, value) => setFormData({ ...formData, paymentMethod: value as string })}
                      startDecorator={<PaymentIcon />}
                    >
                      <Option value="">Sin definir</Option>
                      <Option value="stripe">Stripe</Option>
                      <Option value="paypal">PayPal</Option>
                      <Option value="transfer">Transferencia</Option>
                      <Option value="cash">Efectivo</Option>
                    </Select>
                  </FormControl>
                </Stack>
              </TabPanel>
            </Tabs>

            <Divider sx={{ my: 2 }} />

            <Stack direction="row" spacing={2} justifyContent="flex-end">
              <Button variant="outlined" color="neutral" onClick={() => { setCreateModalOpen(false); setError(''); }}>
                Cancelar
              </Button>
              <Button color="primary" onClick={handleCreate} loading={saving}>
                Crear Empresa
              </Button>
            </Stack>
          </ModalDialog>
        </Modal>

        {/* Edit Modal */}
        <Modal open={editModalOpen} onClose={() => { setEditModalOpen(false); setError(''); }}>
          <ModalDialog sx={{ maxWidth: 600, overflow: 'auto' }}>
            <ModalClose />
            <Typography level="h4" startDecorator={<EditIcon />}>Editar Empresa</Typography>

            {error && <Alert color="danger" sx={{ mb: 2 }}>{error}</Alert>}

            <Tabs defaultValue={0}>
              <TabList>
                <Tab>Datos Básicos</Tab>
                <Tab>Plan y Facturación</Tab>
                <Tab>IA y Tokens</Tab>
                <Tab>Email Marketing</Tab>
              </TabList>

              <TabPanel value={0}>
                <Stack spacing={2}>
                  <FormControl required>
                    <FormLabel>Nombre de la Empresa</FormLabel>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      startDecorator={<BusinessIcon />}
                    />
                  </FormControl>

                  <FormControl required>
                    <FormLabel>Email</FormLabel>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </FormControl>

                  <Grid container spacing={2}>
                    <Grid xs={6}>
                      <FormControl>
                        <FormLabel>Teléfono</FormLabel>
                        <Input
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        />
                      </FormControl>
                    </Grid>
                    <Grid xs={6}>
                      <FormControl>
                        <FormLabel>Documento/NIF</FormLabel>
                        <Input
                          value={formData.document}
                          onChange={(e) => setFormData({ ...formData, document: e.target.value })}
                        />
                      </FormControl>
                    </Grid>
                  </Grid>

                  <FormControl>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <FormLabel>Estado Activo</FormLabel>
                      <Switch
                        checked={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.checked })}
                      />
                    </Stack>
                  </FormControl>
                </Stack>
              </TabPanel>

              <TabPanel value={1}>
                <Stack spacing={2}>
                  <FormControl>
                    <FormLabel>Plan</FormLabel>
                    <Select
                      value={formData.planId}
                      onChange={(_, value) => setFormData({ ...formData, planId: value as number })}
                    >
                      {plans.map((plan) => (
                        <Option key={plan.id} value={plan.id}>
                          {plan.name} - {plan.users} usuarios, {plan.connections} conexiones - ${plan.amount}
                        </Option>
                      ))}
                      {plans.length === 0 && <Option value={1}>Plan Básico</Option>}
                    </Select>
                  </FormControl>

                  <FormControl>
                    <FormLabel>Recurrencia</FormLabel>
                    <Select
                      value={formData.recurrence}
                      onChange={(_, value) => setFormData({ ...formData, recurrence: value as string })}
                      startDecorator={<ScheduleIcon />}
                    >
                      {RECURRENCE_OPTIONS.map((opt) => (
                        <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl>
                    <FormLabel>Fecha de Vencimiento</FormLabel>
                    <Input
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                      startDecorator={<CalendarIcon />}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>Método de Pago</FormLabel>
                    <Select
                      value={formData.paymentMethod}
                      onChange={(_, value) => setFormData({ ...formData, paymentMethod: value as string })}
                      startDecorator={<PaymentIcon />}
                    >
                      <Option value="">Sin definir</Option>
                      <Option value="stripe">Stripe</Option>
                      <Option value="paypal">PayPal</Option>
                      <Option value="transfer">Transferencia</Option>
                      <Option value="cash">Efectivo</Option>
                    </Select>
                  </FormControl>
                </Stack>
              </TabPanel>

              <TabPanel value={2}>
                <Stack spacing={2}>
                  <FormControl>
                    <FormLabel>Balance de Tokens de IA</FormLabel>
                    <Input
                      type="number"
                      value={formData.aiTokenBalance}
                      onChange={(e) => setFormData({ ...formData, aiTokenBalance: parseInt(e.target.value) || 0 })}
                      startDecorator={<span>🤖</span>}
                      slotProps={{
                        input: {
                          min: 0,
                        },
                      }}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>Subplan de IA Activo</FormLabel>
                    <Stack direction="row" spacing={1}>
                      <Select
                        value={formData.activeAISubplanId ?? undefined}
                        onChange={(_, value) => setFormData({ ...formData, activeAISubplanId: value === undefined ? null : value as number })}
                        placeholder="Sin subplan activo"
                        sx={{ flex: 1 }}
                      >
                        {aiSubplans.map((subplan) => (
                          <Option key={subplan.id} value={subplan.id}>
                            {subplan.name} - {subplan.tokens.toLocaleString()} tokens - ${subplan.priceUsd}
                            {!subplan.isActive && ' (Inactivo)'}
                          </Option>
                        ))}
                        {aiSubplans.length === 0 && (
                          <Option value={undefined} disabled>
                            No hay subplanes disponibles
                          </Option>
                        )}
                      </Select>
                      {formData.activeAISubplanId && (
                        <Button
                          variant="outlined"
                          color="neutral"
                          onClick={() => setFormData({ ...formData, activeAISubplanId: null })}
                        >
                          Limpiar
                        </Button>
                      )}
                    </Stack>
                  </FormControl>

                  {formData.activeAISubplanId && (
                    <Alert color="primary" variant="soft">
                      El subplan seleccionado proporcionará tokens adicionales a esta empresa.
                    </Alert>
                  )}
                </Stack>
              </TabPanel>

              <TabPanel value={3}>
                <Stack spacing={2}>
                  <FormControl>
                    <FormLabel>Créditos de Email</FormLabel>
                    <Input
                      type="number"
                      value={formData.emailCreditsTotal}
                      onChange={(e) => setFormData({ ...formData, emailCreditsTotal: parseInt(e.target.value) || 0 })}
                      startDecorator={<span>📧</span>}
                      slotProps={{
                        input: {
                          min: 0,
                        },
                      }}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>Plan de Email Activo</FormLabel>
                    <Stack direction="row" spacing={1}>
                      <Select
                        value={formData.activeEmailPlanId ?? undefined}
                        onChange={(_, value) => setFormData({ ...formData, activeEmailPlanId: value === undefined ? null : value as number })}
                        placeholder="Sin plan de email activo"
                        sx={{ flex: 1 }}
                      >
                        {emailPlans.map((plan) => (
                          <Option key={plan.id} value={plan.id}>
                            {plan.name} - {plan.emailCreditsPerCycle} créditos - ${plan.price}
                            {!plan.isActive && ' (Inactivo)'}
                          </Option>
                        ))}
                        {emailPlans.length === 0 && (
                          <Option value={undefined} disabled>
                            No hay planes de email disponibles
                          </Option>
                        )}
                      </Select>
                      {formData.activeEmailPlanId && (
                        <Button
                          variant="outlined"
                          color="neutral"
                          onClick={() => setFormData({ ...formData, activeEmailPlanId: null })}
                        >
                          Limpiar
                        </Button>
                      )}
                    </Stack>
                  </FormControl>

                  {formData.activeEmailPlanId && (
                    <Alert color="success" variant="soft">
                      El plan de email seleccionado proporcionará créditos adicionales a esta empresa.
                    </Alert>
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
          <ModalDialog sx={{ maxWidth: 700, maxHeight: '90vh', overflow: 'auto' }}>
            <ModalClose />
            <Typography level="h4" startDecorator={<BusinessIcon />}>
              Detalles de Empresa
            </Typography>

            {selectedCompany && (
              <Stack spacing={3}>
                <Card variant="soft">
                  <CardContent>
                    <Grid container spacing={2}>
                      <Grid xs={6}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>ID</Typography>
                        <Typography level="body-md">{selectedCompany.id}</Typography>
                      </Grid>
                      <Grid xs={6}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Estado</Typography>
                        {selectedCompany.status ? (
                          <Chip size="sm" color="success">Activa</Chip>
                        ) : (
                          <Chip size="sm" color="danger">Inactiva</Chip>
                        )}
                      </Grid>
                      <Grid xs={12}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Nombre</Typography>
                        <Typography level="h4">{selectedCompany.name}</Typography>
                      </Grid>
                      <Grid xs={6}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Email</Typography>
                        <Typography level="body-md">{selectedCompany.email || '-'}</Typography>
                      </Grid>
                      <Grid xs={6}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Teléfono</Typography>
                        <Typography level="body-md">{selectedCompany.phone || '-'}</Typography>
                      </Grid>
                      <Grid xs={6}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Documento</Typography>
                        <Typography level="body-md">{selectedCompany.document || '-'}</Typography>
                      </Grid>
                      <Grid xs={6}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Método de Pago</Typography>
                        <Typography level="body-md">{selectedCompany.paymentMethod || '-'}</Typography>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>

                <Card variant="outlined">
                  <CardContent>
                    <Typography level="title-md" sx={{ mb: 2 }}>Plan y Facturación</Typography>
                    <Grid container spacing={2}>
                      <Grid xs={6}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Plan</Typography>
                        <Chip size="sm" color="primary">{selectedCompany.plan?.name || `Plan ${selectedCompany.planId}`}</Chip>
                      </Grid>
                      <Grid xs={6}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Recurrencia</Typography>
                        <Typography level="body-md">{selectedCompany.recurrence || 'MENSUAL'}</Typography>
                      </Grid>
                      <Grid xs={6}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Vencimiento</Typography>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip size="sm" color={getExpirationColor(selectedCompany.dueDate)}>
                            {formatDate(selectedCompany.dueDate)}
                          </Chip>
                          {getDaysUntilExpiration(selectedCompany.dueDate) !== null && (
                            <Typography level="body-xs">
                              ({getDaysUntilExpiration(selectedCompany.dueDate)} días)
                            </Typography>
                          )}
                        </Stack>
                      </Grid>
                      {selectedCompany.plan && (
                        <>
                          <Grid xs={4}>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Usuarios</Typography>
                            <Typography level="body-md">{selectedCompany.plan.users}</Typography>
                          </Grid>
                          <Grid xs={4}>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Conexiones</Typography>
                            <Typography level="body-md">{selectedCompany.plan.connections}</Typography>
                          </Grid>
                          <Grid xs={4}>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Colas</Typography>
                            <Typography level="body-md">{selectedCompany.plan.queues}</Typography>
                          </Grid>
                        </>
                      )}
                    </Grid>
                  </CardContent>
                </Card>

                <Card variant="outlined">
                  <CardContent>
                    <Typography level="title-md" sx={{ mb: 2 }}>Fechas</Typography>
                    <Grid container spacing={2}>
                      <Grid xs={6}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Creada</Typography>
                        <Typography level="body-md">{formatDate(selectedCompany.createdAt)}</Typography>
                      </Grid>
                      <Grid xs={6}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Última actualización</Typography>
                        <Typography level="body-md">{formatDate(selectedCompany.updatedAt)}</Typography>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>

                <Stack direction="row" spacing={2} justifyContent="flex-end">
                  <Button variant="outlined" onClick={() => setViewModalOpen(false)}>Cerrar</Button>
                  <Button
                    color="warning"
                    startDecorator={<EditIcon />}
                    onClick={() => {
                      setViewModalOpen(false)
                      openEditModal(selectedCompany)
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
              ¿Estás seguro de que deseas eliminar la empresa <strong>{selectedCompany?.name}</strong>?
            </Typography>
            <Alert color="danger" sx={{ mb: 2 }}>
              Esta acción eliminará permanentemente todos los datos asociados: usuarios, tickets, contactos, mensajes, conexiones, etc.
            </Alert>
            <Stack direction="row" spacing={2} justifyContent="flex-end">
              <Button variant="outlined" color="neutral" onClick={() => setDeleteModalOpen(false)}>
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
