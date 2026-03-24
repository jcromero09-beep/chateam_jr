import { useState, useMemo, useEffect } from 'react'
import {
  Box,
  Typography,
  Table,
  Select,
  Option,
  Chip,
  Button,
  Alert,
  Card,
  CardContent,
  Sheet,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Stack,
  Input,
  Grid,
  Divider,
  CircularProgress,
} from '@mui/joy'
import {
  Save as SaveIcon,
  Refresh as RefreshIcon,
  Security as SecurityIcon,
  Search as SearchIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Block as BlockIcon,
  Info as InfoIcon,
  Business as BusinessIcon,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { usePermissions } from '../hooks/usePermissions'
import {
  Module,
  InterfacePermissions,
  PermissionLevel,
  DEFAULT_PLAN_PERMISSIONS,
  ALL_MODULES,
  getEffectivePlanPermissions,
} from '../utils/permissions'

// Tipo de Plan con permisos
interface PlanWithPermissions {
  id: number
  name: string
  interfacePermissions: string | null
}

// Tipos de categorias de modulos
type ModuleCategory =
  | 'gestion'
  | 'operativo'
  | 'campanas'
  | 'flowbuilder'
  | 'administracion'
  | 'email'
  | 'webchat'
  | 'appointments'
  | 'whatsapp'
  | 'integraciones'
  | 'afiliados'
  | 'openai'
  | 'general'

// Mapeo de modulos a categorias
const moduleCategories: Record<Module, ModuleCategory> = {
  // Gestion
  dashboard: 'gestion',
  reports: 'gestion',
  realtime_chats: 'gestion',
  analytics: 'gestion',
  superadmin: 'administracion',

  // Operativo
  tickets: 'operativo',
  quick_replies: 'operativo',
  kanban: 'operativo',
  contacts: 'operativo',
  schedules: 'operativo',
  tags: 'operativo',
  internal_chats: 'operativo',

  // Campanas
  campaigns: 'campanas',
  campaigns_contacts: 'campanas',
  campaigns_settings: 'campanas',
  campaigns_insights: 'campanas',
  campaigns_attribution: 'campanas',
  campaigns_audit: 'campanas',

  // Marketing
  marketing: 'campanas',
  marketing_insights: 'campanas',
  marketing_attribution: 'campanas',
  marketing_audit: 'campanas',

  // Flowbuilder
  flowbuilder: 'flowbuilder',
  flowbuilder_campaign: 'flowbuilder',
  flowbuilder_conversation: 'flowbuilder',

  // Administracion
  announcements: 'administracion',
  api_messages: 'administracion',
  users: 'administracion',
  queues: 'administracion',
  prompts: 'administracion',
  queue_integrations: 'administracion',
  connections: 'administracion',
  all_connections: 'administracion',
  invoices: 'administracion',
  files: 'administracion',
  financial: 'administracion',
  settings: 'administracion',
  terms: 'administracion',
  companies: 'administracion',
  plans: 'administracion',

  // Email Marketing
  email_marketing: 'email',
  email_marketing_campaigns: 'email',
  email_marketing_analytics: 'email',
  email_marketing_templates: 'email',

  // WebChat
  webchat: 'webchat',
  webchat_settings: 'webchat',
  webchat_chats: 'webchat',
  webchat_analytics: 'webchat',
  webchat_history: 'webchat',

  // Appointments
  appointments: 'appointments',
  appointments_dashboard: 'appointments',
  appointments_calendar: 'appointments',
  appointments_services: 'appointments',
  appointments_availability: 'appointments',
  appointments_bookings: 'appointments',
  appointments_reminders: 'appointments',
  appointments_reports: 'appointments',

  // WhatsApp Cloud API
  whatsapp_dashboard: 'whatsapp',
  whatsapp_numbers: 'whatsapp',
  whatsapp_templates: 'whatsapp',
  whatsapp_campaigns: 'whatsapp',
  whatsapp_webhooks: 'whatsapp',
  whatsapp_analytics: 'whatsapp',
  whatsapp_settings: 'whatsapp',
  whatsapp_tester: 'whatsapp',
  whatsapp_monitor: 'whatsapp',

  // Integraciones Internas
  integrations_dashboard: 'integraciones',
  integrations_billie: 'integraciones',
  integrations_aria_lite: 'integraciones',
  integrations_smarttrack: 'integraciones',
  integrations_sgr: 'integraciones',
  integrations_webhooks: 'integraciones',
  integrations_logs: 'integraciones',
  integrations_settings: 'integraciones',
  integrations_testing: 'integraciones',

  // OpenAI Integration
  openai_dashboard: 'openai',
  openai_prompts: 'openai',
  openai_models: 'openai',
  openai_analytics: 'openai',
  openai_testing: 'openai',
  openai_templates: 'openai',
  openai_settings: 'openai',
  openai_history: 'openai',

  // General
  integrations: 'general',
  leads: 'general',
  billing: 'general',
  company: 'general',
  profile: 'general',
  notifications: 'general',
  help: 'general',
  feedback: 'general',
  permissions_manager: 'administracion',

  // IA Features
  ai_image_generation: 'openai',
  ai_video_generation: 'openai',
  ai_subplans: 'openai',
  facebook_conversions: 'campanas',
  comment_autoreply: 'openai',
  comment_autoreply_campaigns: 'openai',

  // Customer Origins
  customer_origins: 'operativo',
  customer_origins_reports: 'operativo',

  // Plataforma IA
  ai_platform: 'openai',
  ai_agents: 'openai',
  ai_knowledge_base: 'openai',
  ai_chatbot_builder: 'openai',
  ai_writer: 'openai',
  ai_audio: 'openai',
  ai_multimodal: 'openai',
  ai_credits: 'openai',
  ai_scheduler: 'openai',
  ai_observability: 'openai',
  ai_fine_tuning: 'openai',
  ai_heygen: 'openai',
  ai_ab_testing: 'openai',
  ai_affiliates: 'openai',

  // Agentes IA
  agent_comments: 'openai',
  agent_devices: 'openai',
  agent_identity: 'openai',

  // Coexistencia & Migración
  coexistence: 'administracion',
  migration: 'administracion',

  // UGC
  ugc_dashboard: 'campanas',
  ugc_campaigns: 'campanas',
  ugc_creators: 'campanas',
  ugc_analytics: 'campanas',
  ugc_optimization: 'campanas',
  ugc_settings: 'campanas',
  ugc_social_accounts: 'campanas',
  ugc_social_posts: 'campanas',
  ugc_video_studio: 'campanas',

  // Campañas extras
  campaigns_ai: 'campanas',
  campaigns_rules: 'campanas',

  // Afiliados
  affiliates: 'afiliados',
  affiliate_programs: 'afiliados',
  affiliate_referrals: 'afiliados',
  affiliate_wallet: 'afiliados',
  affiliate_withdrawals: 'afiliados',
  affiliate_links: 'afiliados',
  affiliate_tiers: 'afiliados',

  // Email extras
  email_provider_settings: 'email',
  email_credit_packs: 'email',
}

// Nombres de las categorias
const categoryNames: Record<ModuleCategory, string> = {
  gestion: 'Gestion',
  operativo: 'Operativo',
  campanas: 'Campanas',
  flowbuilder: 'Flowbuilder',
  administracion: 'Administracion',
  email: 'Email Marketing',
  webchat: 'WebChat',
  appointments: 'Citas',
  whatsapp: 'WhatsApp Cloud API',
  integraciones: 'Integraciones Internas',
  afiliados: 'Afiliados',
  openai: 'OpenAI Integration',
  general: 'General',
}

const PermissionsManager = () => {
  const { user } = useAuth()
  const { isSuperAdmin } = usePermissions()

  // Estados
  const [plans, setPlans] = useState<PlanWithPermissions[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null)
  const [modifiedPermissions, setModifiedPermissions] = useState<InterfacePermissions>({})
  const [originalPermissions, setOriginalPermissions] = useState<InterfacePermissions>({})
  const [hasChanges, setHasChanges] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<ModuleCategory | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Verificar acceso - Solo superadmin puede acceder
  useEffect(() => {
    if (!isSuperAdmin) {
      toast.error('Solo el superadmin puede acceder a esta seccion')
    }
  }, [isSuperAdmin])

  // Cargar planes
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setLoading(true)
        const response = await api.get('/plans/all')
        setPlans(response.data)

        // Seleccionar el primer plan por defecto
        if (response.data.length > 0 && !selectedPlanId) {
          setSelectedPlanId(response.data[0].id)
        }
      } catch (error) {
        console.error('Error fetching plans:', error)
        toast.error('Error al cargar los planes')
      } finally {
        setLoading(false)
      }
    }

    if (isSuperAdmin) {
      fetchPlans()
    }
  }, [isSuperAdmin])

  // Cargar permisos del plan seleccionado
  useEffect(() => {
    const fetchPlanPermissions = async () => {
      if (!selectedPlanId) return

      try {
        const response = await api.get(`/plans/${selectedPlanId}/permissions`)
        const permissions = response.data.permissions || {}

        // Combinar con defaults para tener todos los modulos
        const effectivePermissions = getEffectivePlanPermissions(permissions)

        setModifiedPermissions(effectivePermissions)
        setOriginalPermissions(permissions)
        setHasChanges(false)
      } catch (error) {
        console.error('Error fetching plan permissions:', error)
        // Si hay error, usar defaults
        setModifiedPermissions({ ...DEFAULT_PLAN_PERMISSIONS })
        setOriginalPermissions({})
        setHasChanges(false)
      }
    }

    if (selectedPlanId && isSuperAdmin) {
      fetchPlanPermissions()
    }
  }, [selectedPlanId, isSuperAdmin])

  // Plan seleccionado
  const selectedPlan = useMemo(() => {
    return plans.find(p => p.id === selectedPlanId)
  }, [plans, selectedPlanId])

  // Filtrar modulos por busqueda y categoria
  const filteredModules = useMemo(() => {
    let filtered = ALL_MODULES

    // Filtrar por busqueda
    if (searchQuery) {
      filtered = filtered.filter(module =>
        module.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    // Filtrar por categoria
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(module => moduleCategories[module] === selectedCategory)
    }

    return filtered
  }, [searchQuery, selectedCategory])

  // Calcular estadisticas de permisos
  const stats = useMemo(() => {
    const total = ALL_MODULES.length
    const full = ALL_MODULES.filter(m => modifiedPermissions[m] === true).length
    const read = ALL_MODULES.filter(m => modifiedPermissions[m] === 'read').length
    const denied = ALL_MODULES.filter(m => modifiedPermissions[m] === false).length

    return {
      total,
      full,
      read,
      denied,
      fullPercent: ((full / total) * 100).toFixed(1),
      readPercent: ((read / total) * 100).toFixed(1),
      deniedPercent: ((denied / total) * 100).toFixed(1),
    }
  }, [modifiedPermissions])

  // Cambiar permiso de un modulo
  const handleChangePermission = (module: Module, newPermission: PermissionLevel) => {
    setModifiedPermissions(prev => ({
      ...prev,
      [module]: newPermission,
    }))
    setHasChanges(true)
  }

  // Guardar cambios
  const handleSave = async () => {
    if (!selectedPlanId) return

    try {
      setSaving(true)

      // Solo enviar los permisos que son diferentes a los defaults
      const permissionsToSave: InterfacePermissions = {}
      for (const module of ALL_MODULES) {
        const currentValue = modifiedPermissions[module]
        const defaultValue = DEFAULT_PLAN_PERMISSIONS[module]
        if (currentValue !== defaultValue) {
          permissionsToSave[module] = currentValue
        }
      }

      await api.put(`/plans/${selectedPlanId}/permissions`, {
        permissions: permissionsToSave
      })

      setOriginalPermissions(permissionsToSave)
      setHasChanges(false)
      toast.success('Permisos actualizados correctamente')
    } catch (error) {
      console.error('Error saving permissions:', error)
      toast.error('Error al guardar los permisos')
    } finally {
      setSaving(false)
    }
  }

  // Resetear cambios
  const handleReset = () => {
    if (window.confirm('Estas seguro de resetear todos los cambios?')) {
      const effectivePermissions = getEffectivePlanPermissions(originalPermissions)
      setModifiedPermissions(effectivePermissions)
      setHasChanges(false)
    }
  }

  // Renderizar badge de permiso
  const renderPermissionBadge = (permission: PermissionLevel) => {
    if (permission === true) {
      return (
        <Chip color="success" variant="soft" startDecorator={<CheckCircleIcon />} size="sm">
          Completo
        </Chip>
      )
    }
    if (permission === 'read') {
      return (
        <Chip color="warning" variant="soft" startDecorator={<WarningIcon />} size="sm">
          Solo Lectura
        </Chip>
      )
    }
    return (
      <Chip color="danger" variant="soft" startDecorator={<BlockIcon />} size="sm">
        Sin Acceso
      </Chip>
    )
  }

  // Renderizar nombre del modulo (convertir guiones bajos a espacios y capitalizar)
  const formatModuleName = (module: Module): string => {
    return module
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  // Si no es superadmin, mostrar mensaje de acceso denegado
  if (!isSuperAdmin) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert color="danger" startDecorator={<BlockIcon />}>
          <Box>
            <Typography level="title-md">Acceso Denegado</Typography>
            <Typography level="body-sm">
              Solo el superadmin puede acceder a la gestion de permisos de interfaz.
            </Typography>
          </Box>
        </Alert>
      </Box>
    )
  }

  if (loading) {
    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box
        sx={{
          mb: 3,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <SecurityIcon sx={{ fontSize: 40, color: 'primary.500' }} />
          <Box>
            <Typography level="h1">Gestion de Permisos de Interfaz</Typography>
            <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
              Control de acceso por Plan - Solo Superadmin
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            onClick={handleReset}
            disabled={!hasChanges || saving}
            startDecorator={<RefreshIcon />}
          >
            Resetear
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            loading={saving}
            startDecorator={<SaveIcon />}
            color="primary"
          >
            Guardar Cambios
          </Button>
        </Box>
      </Box>

      {/* Alerta de cambios pendientes */}
      {hasChanges && (
        <Alert color="warning" sx={{ mb: 3 }} startDecorator={<InfoIcon />}>
          <Box>
            <Typography level="title-sm">Cambios sin guardar</Typography>
            <Typography level="body-sm">
              Tienes modificaciones pendientes. Asegurate de guardar antes de salir.
            </Typography>
          </Box>
        </Alert>
      )}

      {/* Selector de plan y estadisticas */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* Selector de plan */}
        <Grid xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <BusinessIcon color="primary" />
                <Typography level="title-sm">
                  Plan a Configurar
                </Typography>
              </Box>
              <Select
                value={selectedPlanId}
                onChange={(_, value) => value && setSelectedPlanId(value)}
                sx={{ width: '100%' }}
                placeholder="Selecciona un plan"
              >
                {plans.map(plan => (
                  <Option key={plan.id} value={plan.id}>
                    {plan.name}
                  </Option>
                ))}
              </Select>
              {selectedPlan && (
                <Typography level="body-xs" sx={{ mt: 1, color: 'text.secondary' }}>
                  Los permisos configurados aqui aplicaran a todas las empresas con este plan.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Estadisticas */}
        <Grid xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography level="title-sm" sx={{ mb: 2 }}>
                Resumen de Permisos para {selectedPlan?.name || 'Plan'}
              </Typography>
              <Grid container spacing={2}>
                <Grid xs={12} sm={4}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography level="h2" sx={{ color: 'success.500' }}>
                      {stats.full}
                    </Typography>
                    <Typography level="body-sm">Acceso Completo</Typography>
                    <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                      {stats.fullPercent}% del total
                    </Typography>
                  </Box>
                </Grid>
                <Grid xs={12} sm={4}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography level="h2" sx={{ color: 'warning.500' }}>
                      {stats.read}
                    </Typography>
                    <Typography level="body-sm">Solo Lectura</Typography>
                    <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                      {stats.readPercent}% del total
                    </Typography>
                  </Box>
                </Grid>
                <Grid xs={12} sm={4}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography level="h2" sx={{ color: 'danger.500' }}>
                      {stats.denied}
                    </Typography>
                    <Typography level="body-sm">Sin Acceso</Typography>
                    <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                      {stats.deniedPercent}% del total
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filtros */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={2} flexWrap="wrap">
            {/* Busqueda */}
            <Input
              placeholder="Buscar modulo..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              startDecorator={<SearchIcon />}
              sx={{ flex: 1, minWidth: 200 }}
            />

            {/* Filtro por categoria */}
            <Select
              value={selectedCategory}
              onChange={(_, value) => value && setSelectedCategory(value as ModuleCategory | 'all')}
              sx={{ minWidth: 200 }}
            >
              <Option value="all">Todas las categorias</Option>
              <Divider />
              {Object.entries(categoryNames).map(([key, name]) => (
                <Option key={key} value={key}>
                  {name}
                </Option>
              ))}
            </Select>
          </Stack>
        </CardContent>
      </Card>

      {/* Tabla de permisos con tabs por categoria */}
      <Card>
        <Tabs
          defaultValue={0}
          sx={{ bgcolor: 'background.surface' }}
        >
          <TabList>
            <Tab>Todos ({filteredModules.length})</Tab>
            <Tab>Por Categoria</Tab>
          </TabList>

          {/* Tab 1: Todos los modulos */}
          <TabPanel value={0}>
            <Sheet sx={{ overflow: 'auto', maxHeight: 600 }}>
              <Table stickyHeader>
                <thead>
                  <tr>
                    <th style={{ width: '5%' }}>#</th>
                    <th style={{ width: '35%' }}>Modulo</th>
                    <th style={{ width: '15%' }}>Categoria</th>
                    <th style={{ width: '20%' }}>Permiso Actual</th>
                    <th style={{ width: '25%' }}>Cambiar Permiso</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredModules.map((module, index) => {
                    const currentPermission = modifiedPermissions[module] ?? false
                    const category = moduleCategories[module]

                    return (
                      <tr key={module}>
                        <td>{index + 1}</td>
                        <td>
                          <Typography level="body-sm" fontWeight="md">
                            {formatModuleName(module)}
                          </Typography>
                          <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                            {module}
                          </Typography>
                        </td>
                        <td>
                          <Chip size="sm" variant="outlined">
                            {categoryNames[category]}
                          </Chip>
                        </td>
                        <td>{renderPermissionBadge(currentPermission)}</td>
                        <td>
                          <Select
                            value={String(currentPermission)}
                            onChange={(_, value) => {
                              if (value === 'true') handleChangePermission(module, true)
                              else if (value === 'read') handleChangePermission(module, 'read')
                              else handleChangePermission(module, false)
                            }}
                            size="sm"
                          >
                            <Option value="true">Acceso Completo</Option>
                            <Option value="read">Solo Lectura</Option>
                            <Option value="false">Sin Acceso</Option>
                          </Select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </Sheet>
          </TabPanel>

          {/* Tab 2: Por categoria */}
          <TabPanel value={1}>
            <Stack spacing={3} sx={{ maxHeight: 600, overflow: 'auto' }}>
              {Object.entries(categoryNames).map(([categoryKey, categoryName]) => {
                const categoryModules = ALL_MODULES.filter(
                  m => moduleCategories[m] === categoryKey
                )

                return (
                  <Box key={categoryKey}>
                    <Typography level="title-md" sx={{ mb: 2 }}>
                      {categoryName} ({categoryModules.length} modulos)
                    </Typography>
                    <Sheet sx={{ overflow: 'auto' }}>
                      <Table size="sm">
                        <thead>
                          <tr>
                            <th style={{ width: '40%' }}>Modulo</th>
                            <th style={{ width: '30%' }}>Permiso Actual</th>
                            <th style={{ width: '30%' }}>Cambiar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {categoryModules.map(module => {
                            const currentPermission = modifiedPermissions[module] ?? false

                            return (
                              <tr key={module}>
                                <td>
                                  <Typography level="body-sm" fontWeight="md">
                                    {formatModuleName(module)}
                                  </Typography>
                                </td>
                                <td>{renderPermissionBadge(currentPermission)}</td>
                                <td>
                                  <Select
                                    value={String(currentPermission)}
                                    onChange={(_, value) => {
                                      if (value === 'true') handleChangePermission(module, true)
                                      else if (value === 'read')
                                        handleChangePermission(module, 'read')
                                      else handleChangePermission(module, false)
                                    }}
                                    size="sm"
                                  >
                                    <Option value="true">Completo</Option>
                                    <Option value="read">Lectura</Option>
                                    <Option value="false">Sin acceso</Option>
                                  </Select>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </Table>
                    </Sheet>
                  </Box>
                )
              })}
            </Stack>
          </TabPanel>
        </Tabs>
      </Card>

      {/* Footer informativo */}
      <Card sx={{ mt: 3, bgcolor: 'neutral.softBg' }}>
        <CardContent>
          <Typography level="title-sm" sx={{ mb: 1 }}>
            Informacion del Sistema de Permisos por Plan
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
            * <strong>Acceso Completo</strong>: Los usuarios con este plan pueden ver, crear, editar y eliminar
            recursos en el modulo.
            <br />
            * <strong>Solo Lectura</strong>: Los usuarios solo pueden visualizar informacion, sin
            posibilidad de modificar.
            <br />
            * <strong>Sin Acceso</strong>: Los usuarios no tienen ningun acceso al modulo, ni siquiera
            visualizacion.
            <br />
            * <strong>Superadmin</strong>: Los usuarios con super=true siempre tienen acceso completo a todo,
            independientemente del plan.
            <br />* Los cambios se aplican inmediatamente despues de guardar. Se recomienda que los
            usuarios afectados cierren sesion y vuelvan a entrar.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  )
}

export default PermissionsManager
