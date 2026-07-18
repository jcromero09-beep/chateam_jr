import { useState, useMemo, useEffect } from 'react'
// [Conservado como MUI por regla del design system] CircularProgress no tiene
// equivalente en el DS (spinner); se deja su import de @mui/joy intacto.
import { CircularProgress } from '@mui/joy'
import {
  FloppyDisk,
  ArrowClockwise,
  ShieldCheck,
  MagnifyingGlass,
  CheckCircle,
  Warning,
  Prohibit,
  Info,
  Buildings,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectSeparator,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toast } from 'react-toastify'
import api from '../services/api'
import { usePermissions } from '../hooks/usePermissions'
import { useAuth } from '../hooks/useAuth'
import {
  Module,
  InterfacePermissions,
  PermissionLevel,
  DEFAULT_PLAN_PERMISSIONS,
  PLAN_MANAGED_MODULES,
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
  social_comments: 'openai',

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
  // Sprint 1 (2026-05-20) — Panel de revisión humana de correcciones IA
  ai_correction_review: 'openai',

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
  const { isSuperAdmin } = usePermissions()
  // useAuth usa useState por-componente (no Context): al montar, `user` puede estar
  // aún en null mientras carga /auth/me → isSuperAdmin=false transitorio. Se espera
  // a que auth termine de cargar antes de decidir el acceso (evita toast falso).
  const { loading: authLoading, user } = useAuth()

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

  // Verificar acceso - Solo superadmin puede acceder. Se espera a que auth cargue
  // y a que exista `user` para no disparar el toast durante el estado transitorio.
  useEffect(() => {
    if (!authLoading && user && !isSuperAdmin) {
      toast.error('Solo el superadmin puede acceder a esta seccion')
    }
  }, [authLoading, user, isSuperAdmin])

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
    let filtered = PLAN_MANAGED_MODULES

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
    const total = PLAN_MANAGED_MODULES.length
    const full = PLAN_MANAGED_MODULES.filter(m => modifiedPermissions[m] === true).length
    const read = PLAN_MANAGED_MODULES.filter(m => modifiedPermissions[m] === 'read').length
    const denied = PLAN_MANAGED_MODULES.filter(m => modifiedPermissions[m] === false).length

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
      for (const module of PLAN_MANAGED_MODULES) {
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

  // Cambiar permiso desde el valor string del <Select>
  const handleSelectPermission = (module: Module, value: string) => {
    if (value === 'true') handleChangePermission(module, true)
    else if (value === 'read') handleChangePermission(module, 'read')
    else handleChangePermission(module, false)
  }

  // Renderizar badge de permiso
  const renderPermissionBadge = (permission: PermissionLevel) => {
    if (permission === true) {
      return (
        <Badge variant="success">
          <CheckCircle className="size-3.5" aria-hidden />
          Completo
        </Badge>
      )
    }
    if (permission === 'read') {
      return (
        <Badge variant="warning">
          <Warning className="size-3.5" aria-hidden />
          Solo Lectura
        </Badge>
      )
    }
    return (
      <Badge variant="destructive">
        <Prohibit className="size-3.5" aria-hidden />
        Sin Acceso
      </Badge>
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
      <div className="p-5 sm:p-6 lg:p-8">
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/12 p-4 text-destructive-text">
          <Prohibit className="size-5 shrink-0" aria-hidden />
          <div>
            <p className="text-sm font-semibold">Acceso Denegado</p>
            <p className="text-sm">
              Solo el superadmin puede acceder a la gestion de permisos de interfaz.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-5 sm:p-6 lg:p-8">
        <CircularProgress />
      </div>
    )
  }

  // Fila de un modulo para las tablas (reutilizable en ambas pestañas)
  const renderModuleRow = (
    module: Module,
    index: number | null,
    variant: 'full' | 'compact',
  ) => {
    const currentPermission = modifiedPermissions[module] ?? false
    const category = moduleCategories[module]

    return (
      <tr key={module} className="transition-colors hover:bg-accent/40">
        {index !== null && (
          <td className="px-4 py-3 tabular-nums text-muted-foreground">{index + 1}</td>
        )}
        <td className="px-4 py-3">
          <p className="text-sm font-medium text-foreground">{formatModuleName(module)}</p>
          {variant === 'full' && (
            <p className="text-xs text-muted-foreground">{module}</p>
          )}
        </td>
        {variant === 'full' && (
          <td className="px-4 py-3">
            <Badge variant="outline">{categoryNames[category]}</Badge>
          </td>
        )}
        <td className="px-4 py-3">{renderPermissionBadge(currentPermission)}</td>
        <td className="px-4 py-3">
          <Select
            value={String(currentPermission)}
            onValueChange={value => handleSelectPermission(module, value)}
          >
            <SelectTrigger className="h-8 min-w-[150px]" aria-label={`Cambiar permiso de ${formatModuleName(module)}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">
                {variant === 'full' ? 'Acceso Completo' : 'Completo'}
              </SelectItem>
              <SelectItem value="read">
                {variant === 'full' ? 'Solo Lectura' : 'Lectura'}
              </SelectItem>
              <SelectItem value="false">
                {variant === 'full' ? 'Sin Acceso' : 'Sin acceso'}
              </SelectItem>
            </SelectContent>
          </Select>
        </td>
      </tr>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <ShieldCheck className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Gestion de Permisos de Interfaz
              </h1>
              <p className="text-sm text-muted-foreground">
                Control de acceso por Plan - Solo Superadmin
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={!hasChanges || saving}
            >
              <ArrowClockwise className="size-4" aria-hidden />
              Resetear
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!hasChanges || saving}
              loading={saving}
            >
              <FloppyDisk className="size-4" aria-hidden />
              Guardar Cambios
            </Button>
          </div>
        </div>

        {/* Alerta de cambios pendientes */}
        {hasChanges && (
          <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/16 p-4 text-warning-text">
            <Info className="size-5 shrink-0" aria-hidden />
            <div>
              <p className="text-sm font-semibold">Cambios sin guardar</p>
              <p className="text-sm">
                Tienes modificaciones pendientes. Asegurate de guardar antes de salir.
              </p>
            </div>
          </div>
        )}

        {/* Selector de plan y estadisticas */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Selector de plan */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] md:col-span-1">
            <div className="mb-2 flex items-center gap-2 text-primary">
              <Buildings className="size-5" aria-hidden />
              <h2 className="text-sm font-semibold text-foreground">Plan a Configurar</h2>
            </div>
            <Select
              value={selectedPlanId ? String(selectedPlanId) : undefined}
              onValueChange={value => setSelectedPlanId(Number(value))}
            >
              <SelectTrigger aria-label="Plan a configurar">
                <SelectValue placeholder="Selecciona un plan" />
              </SelectTrigger>
              <SelectContent>
                {plans.map(plan => (
                  <SelectItem key={plan.id} value={String(plan.id)}>
                    {plan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPlan && (
              <p className="mt-2 text-xs text-muted-foreground">
                Los permisos configurados aqui aplicaran a todas las empresas con este plan.
              </p>
            )}
          </div>

          {/* Estadisticas */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] md:col-span-2">
            <h2 className="mb-4 text-sm font-semibold text-foreground">
              Resumen de Permisos para {selectedPlan?.name || 'Plan'}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="text-center">
                <p className="text-3xl font-semibold tabular-nums text-success-text">{stats.full}</p>
                <p className="text-sm text-foreground">Acceso Completo</p>
                <p className="text-xs text-muted-foreground">{stats.fullPercent}% del total</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-semibold tabular-nums text-warning-text">{stats.read}</p>
                <p className="text-sm text-foreground">Solo Lectura</p>
                <p className="text-xs text-muted-foreground">{stats.readPercent}% del total</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-semibold tabular-nums text-destructive-text">{stats.denied}</p>
                <p className="text-sm text-foreground">Sin Acceso</p>
                <p className="text-xs text-muted-foreground">{stats.deniedPercent}% del total</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <div className="flex flex-wrap items-center gap-3">
            {/* Busqueda */}
            <div className="relative min-w-[200px] flex-1">
              <MagnifyingGlass
                className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                placeholder="Buscar modulo..."
                aria-label="Buscar modulo"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>

            {/* Filtro por categoria */}
            <Select
              value={selectedCategory}
              onValueChange={value => setSelectedCategory(value as ModuleCategory | 'all')}
            >
              <SelectTrigger className="min-w-[200px]" aria-label="Filtrar por categoria">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorias</SelectItem>
                <SelectSeparator className="my-1 h-px bg-border" />
                {Object.entries(categoryNames).map(([key, name]) => (
                  <SelectItem key={key} value={key}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tabla de permisos con tabs por categoria */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">Todos ({filteredModules.length})</TabsTrigger>
              <TabsTrigger value="category">Por Categoria</TabsTrigger>
            </TabsList>

            {/* Tab 1: Todos los modulos */}
            <TabsContent value="all">
              <div className="max-h-[600px] overflow-auto rounded-lg border border-border">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-border bg-muted/60 text-left">
                      <th className="w-[5%] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">#</th>
                      <th className="w-[35%] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Modulo</th>
                      <th className="w-[15%] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categoria</th>
                      <th className="w-[20%] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Permiso Actual</th>
                      <th className="w-[25%] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cambiar Permiso</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredModules.map((module, index) => renderModuleRow(module, index, 'full'))}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* Tab 2: Por categoria */}
            <TabsContent value="category">
              <div className="max-h-[600px] space-y-6 overflow-auto">
                {Object.entries(categoryNames).map(([categoryKey, categoryName]) => {
                  const categoryModules = PLAN_MANAGED_MODULES.filter(
                    m => moduleCategories[m] === categoryKey
                  )

                  return (
                    <div key={categoryKey}>
                      <h3 className="mb-2 text-base font-semibold text-foreground">
                        {categoryName} ({categoryModules.length} modulos)
                      </h3>
                      <div className="overflow-auto rounded-lg border border-border">
                        <table className="w-full min-w-[520px] text-sm">
                          <thead>
                            <tr className="border-b border-border bg-muted/60 text-left">
                              <th className="w-[40%] whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Modulo</th>
                              <th className="w-[30%] whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Permiso Actual</th>
                              <th className="w-[30%] whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cambiar</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {categoryModules.map(module => renderModuleRow(module, null, 'compact'))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer informativo */}
        <div className="rounded-xl border border-border bg-muted/40 p-5">
          <h2 className="mb-1 text-sm font-semibold text-foreground">
            Informacion del Sistema de Permisos por Plan
          </h2>
          <p className="text-sm text-muted-foreground">
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
          </p>
        </div>
      </div>
    </div>
  )
}

export default PermissionsManager
