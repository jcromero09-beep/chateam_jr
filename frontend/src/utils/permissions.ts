// Sistema de Permisos RBAC para JR Chateam v6.0.0
// Modificado para soportar permisos por Plan (no por Rol)

export type UserRole = 'super' | 'admin' | 'supervisor' | 'user'

export type Permission = 'read' | 'write' | 'delete' | 'admin'

// Tipo para permisos: true = acceso completo, false = sin acceso, 'read' = solo lectura
export type PermissionLevel = boolean | 'read'

// Tipo para permisos de interfaz almacenados en Plan
export type InterfacePermissions = {
  [key in Module]?: PermissionLevel
}

export type Module =
  // Gestión
  | 'dashboard'
  | 'reports'
  | 'realtime_chats'
  // Operativo
  | 'tickets'
  | 'quick_replies'
  | 'kanban'
  | 'contacts'
  | 'schedules'
  | 'tags'
  | 'customer_origins'
  | 'customer_origins_reports'
  | 'internal_chats'
  // Administración - Campañas
  | 'campaigns'
  | 'campaigns_contacts'
  | 'campaigns_settings'
  | 'campaigns_insights'
  | 'campaigns_attribution'
  | 'campaigns_audit'
  // Marketing
  | 'marketing'
  | 'marketing_insights'
  | 'marketing_attribution'
  | 'marketing_audit'
  // Administración - Flowbuilder
  | 'flowbuilder'
  | 'flowbuilder_campaign'
  | 'flowbuilder_conversation'
  // Administración - Otros
  | 'announcements'
  | 'api_messages'
  | 'users'
  | 'queues'
  | 'prompts'
  | 'queue_integrations'
  | 'connections'
  | 'all_connections'
  | 'invoices'
  | 'files'
  | 'financial'
  | 'settings'
  | 'terms'
  | 'companies'
  | 'plans'
  // General
  | 'analytics'
  | 'leads'
  | 'billing'
  | 'company'
  | 'profile'
  | 'notifications'
  | 'help'
  | 'feedback'
  | 'email_marketing'
  | 'email_marketing_campaigns'
  | 'email_marketing_analytics'
  | 'email_marketing_templates'
  | 'webchat'
  | 'webchat_settings'
  | 'webchat_chats'
  | 'webchat_analytics'
  | 'webchat_history'
  | 'integrations'
  | 'appointments'
  | 'appointments_dashboard'
  | 'appointments_calendar'
  | 'appointments_services'
  | 'appointments_availability'
  | 'appointments_bookings'
  | 'appointments_reminders'
  | 'appointments_reports'
  | 'whatsapp_dashboard'
  | 'whatsapp_numbers'
  | 'whatsapp_templates'
  | 'whatsapp_campaigns'
  | 'whatsapp_webhooks'
  | 'whatsapp_analytics'
  | 'whatsapp_settings'
  | 'whatsapp_tester'
  | 'whatsapp_monitor'
  | 'integrations_dashboard'
  | 'integrations_billie'
  | 'integrations_aria_lite'
  | 'integrations_smarttrack'
  | 'integrations_sgr'
  | 'integrations_webhooks'
  | 'integrations_logs'
  | 'integrations_settings'
  | 'integrations_testing'
  | 'openai_dashboard'
  | 'openai_prompts'
  | 'openai_models'
  | 'openai_analytics'
  | 'openai_testing'
  | 'openai_templates'
  | 'openai_settings'
  | 'openai_history'
  | 'ai_image_generation'
  | 'ai_subplans'
  | 'permissions_manager'
  | 'facebook_conversions'

// Matriz de permisos por rol y módulo (legacy, se mantiene para compatibilidad)
// true = acceso completo, false = sin acceso, 'read' = solo lectura

type PermissionsMatrix = {
  [key in UserRole]: {
    [key in Module]: PermissionLevel
  }
}

export const PERMISSIONS_MATRIX: PermissionsMatrix = {
  // Super Admin: Acceso completo a todo
  super: {
    // Gestión
    dashboard: true,
    reports: true,
    realtime_chats: true,
    // Operativo
    tickets: true,
    quick_replies: true,
    kanban: true,
    contacts: true,
    schedules: true,
    tags: true,
    customer_origins: true,
    customer_origins_reports: true,
    internal_chats: true,
    // Administración - Campañas
    campaigns: true,
    campaigns_contacts: true,
    campaigns_settings: true,
    campaigns_insights: true,
    campaigns_attribution: true,
    campaigns_audit: true,
    // Marketing
    marketing: true,
    marketing_insights: true,
    marketing_attribution: true,
    marketing_audit: true,
    // Administración - Flowbuilder
    flowbuilder: true,
    flowbuilder_campaign: true,
    flowbuilder_conversation: true,
    // Administración - Otros
    announcements: true,
    api_messages: true,
    users: true,
    queues: true,
    prompts: true,
    queue_integrations: true,
    connections: true,
    all_connections: true,
    invoices: true,
    files: true,
    financial: true,
    settings: true,
    terms: true,
    companies: true,
    plans: true,
    // General
    analytics: true,
    leads: true,
    billing: true,
    company: true,
    profile: true,
    notifications: true,
    help: true,
    feedback: true,
    email_marketing: true,
    email_marketing_campaigns: true,
    email_marketing_analytics: true,
    email_marketing_templates: true,
    webchat: true,
    webchat_settings: true,
    webchat_chats: true,
    webchat_analytics: true,
    webchat_history: true,
    integrations: true,
    appointments: true,
    appointments_dashboard: true,
    appointments_calendar: true,
    appointments_services: true,
    appointments_availability: true,
    appointments_bookings: true,
    appointments_reminders: true,
    appointments_reports: true,
    whatsapp_dashboard: true,
    whatsapp_numbers: true,
    whatsapp_templates: true,
    whatsapp_campaigns: true,
    whatsapp_webhooks: true,
    whatsapp_analytics: true,
    whatsapp_settings: true,
    whatsapp_tester: true,
    whatsapp_monitor: true,
    integrations_dashboard: true,
    integrations_billie: true,
    integrations_aria_lite: true,
    integrations_smarttrack: true,
    integrations_sgr: true,
    integrations_webhooks: true,
    integrations_logs: true,
    integrations_settings: true,
    integrations_testing: true,
    openai_dashboard: true,
    openai_prompts: true,
    openai_models: true,
    openai_analytics: true,
    openai_testing: true,
    openai_templates: true,
    openai_settings: true,
    openai_history: true,
    ai_image_generation: true,
    ai_subplans: true,
    permissions_manager: true,
    facebook_conversions: true,
  },
  // Admin: Gestión completa de empresa (sin algunas configuraciones globales)
  admin: {
    // Gestión
    dashboard: true,
    reports: true,
    realtime_chats: true,
    // Operativo
    tickets: true,
    quick_replies: true,
    kanban: true,
    contacts: true,
    schedules: true,
    tags: true,
    customer_origins: true,
    customer_origins_reports: true,
    internal_chats: true,
    // Administración - Campañas
    campaigns: true,
    campaigns_contacts: true,
    campaigns_settings: true,
    campaigns_insights: true,
    campaigns_attribution: true,
    campaigns_audit: true,
    // Marketing
    marketing: true,
    marketing_insights: true,
    marketing_attribution: true,
    marketing_audit: true,
    // Administración - Flowbuilder
    flowbuilder: true,
    flowbuilder_campaign: true,
    flowbuilder_conversation: true,
    // Administración - Otros
    announcements: true,
    api_messages: true,
    users: true,
    queues: true,
    prompts: true,
    queue_integrations: true,
    connections: true,
    all_connections: false, // Solo super puede ver todas las conexiones
    invoices: false, // Solo super puede ver todos los recibos
    files: true,
    financial: false, // Solo super puede ver dashboard financiero global
    settings: true,
    terms: 'read', // Solo lectura de términos
    companies: false, // Solo super puede gestionar empresas
    plans: false, // Solo super puede gestionar planes
    // General
    analytics: true,
    leads: true,
    billing: true,
    company: true,
    profile: true,
    notifications: true,
    help: true,
    feedback: true,
    email_marketing: true,
    email_marketing_campaigns: true,
    email_marketing_analytics: true,
    email_marketing_templates: true,
    webchat: true,
    webchat_settings: true,
    webchat_chats: true,
    webchat_analytics: true,
    webchat_history: true,
    integrations: true,
    appointments: true,
    appointments_dashboard: true,
    appointments_calendar: true,
    appointments_services: true,
    appointments_availability: true,
    appointments_bookings: true,
    appointments_reminders: true,
    appointments_reports: true,
    whatsapp_dashboard: true,
    whatsapp_numbers: true,
    whatsapp_templates: true,
    whatsapp_campaigns: true,
    whatsapp_webhooks: true,
    whatsapp_analytics: true,
    whatsapp_settings: true,
    whatsapp_tester: true,
    whatsapp_monitor: true,
    integrations_dashboard: true,
    integrations_billie: true,
    integrations_aria_lite: true,
    integrations_smarttrack: true,
    integrations_sgr: true,
    integrations_webhooks: true,
    integrations_logs: true,
    integrations_settings: true,
    integrations_testing: true,
    openai_dashboard: true,
    openai_prompts: true,
    openai_models: true,
    openai_analytics: true,
    openai_testing: true,
    openai_templates: true,
    openai_settings: true,
    openai_history: true,
    ai_image_generation: true,
    ai_subplans: true,
    permissions_manager: true,
    facebook_conversions: true,
  },


  // User: Acceso básico operativo
  user: {
    // Gestión
    dashboard: 'read', // Solo lectura
    reports: 'read', // Solo lectura de reportes
    realtime_chats: 'read', // Solo lectura de chats
    // Operativo
    tickets: true, // Puede trabajar con tickets
    quick_replies: true, // Puede usar mensajes rápidos
    kanban: 'read', // Solo lectura del kanban
    contacts: true, // Puede trabajar con contactos
    schedules: 'read', // Solo lectura de agendas
    tags: 'read', // Solo lectura de etiquetas
    internal_chats: true, // Puede usar chats internos
    // Administración - Campañas
    campaigns: false, // Sin acceso a campañas
    campaigns_contacts: false,
    campaigns_settings: false,
    campaigns_insights: false,
    campaigns_attribution: false,
    campaigns_audit: false,
    // Marketing
    marketing: false,
    marketing_insights: false,
    marketing_attribution: false,
    marketing_audit: false,
    // Administración - Flowbuilder
    flowbuilder: false, // Sin acceso
    flowbuilder_campaign: false,
    flowbuilder_conversation: false,
    // Administración - Otros
    announcements: 'read', // Solo lectura de anuncios
    api_messages: false, // Sin acceso a API
    users: false, // Sin acceso a usuarios
    queues: 'read', // Solo lectura de colas
    prompts: false, // Sin acceso a prompts
    queue_integrations: false, // Sin acceso
    connections: false, // Sin acceso
    all_connections: false, // Sin acceso
    invoices: false, // Sin acceso
    files: 'read', // Solo lectura de archivos
    financial: false, // Sin acceso
    settings: false, // Sin acceso a configuración
    terms: 'read', // Solo lectura
    companies: false, // Sin acceso
    plans: false, // Sin acceso
    // General
    analytics: 'read', // Solo lectura
    leads: 'read', // Solo lectura
    billing: false, // Sin acceso a facturación
    company: false, // Sin acceso a empresa
    profile: true, // Puede editar su perfil
    notifications: true, // Puede ver notificaciones
    help: true, // Puede acceder a ayuda
    feedback: true, // Puede enviar feedback
    email_marketing: false, // Sin acceso a email marketing
    email_marketing_campaigns: false,
    email_marketing_analytics: false,
    email_marketing_templates: false,
    webchat: false, // Sin acceso a WebChat
    webchat_settings: false,
    webchat_chats: false,
    webchat_analytics: false,
    webchat_history: false,
    integrations: false, // Sin acceso a integraciones
    appointments: 'read', // Solo lectura de citas
    appointments_dashboard: 'read', // Solo lectura de dashboard
    appointments_calendar: 'read', // Solo lectura de calendario
    appointments_services: false, // Sin acceso a servicios
    appointments_availability: false, // Sin acceso a disponibilidad
    appointments_bookings: 'read', // Solo lectura de reservas
    appointments_reminders: false, // Sin acceso a recordatorios
    appointments_reports: false, // Sin acceso a reportes
    whatsapp_dashboard: 'read', // Solo lectura de dashboard
    whatsapp_numbers: false, // Sin acceso a gestión de números
    whatsapp_templates: 'read', // Solo lectura de templates
    whatsapp_campaigns: false, // Sin acceso a campañas
    whatsapp_webhooks: false, // Sin acceso a webhooks
    whatsapp_analytics: 'read', // Solo lectura de analytics
    whatsapp_settings: false, // Sin acceso a configuración
    whatsapp_tester: false, // Sin acceso a testing
    whatsapp_monitor: 'read', // Solo lectura del dashboard de monitoreo
    integrations_dashboard: 'read', // Solo lectura
    integrations_billie: false, // Sin acceso
    integrations_aria_lite: false, // Sin acceso
    integrations_smarttrack: false, // Sin acceso
    integrations_sgr: false, // Sin acceso
    integrations_webhooks: false, // Sin acceso
    integrations_logs: 'read', // Solo lectura de logs
    integrations_settings: false, // Sin acceso
    integrations_testing: false, // Sin acceso
    openai_dashboard: 'read', // Solo lectura de dashboard
    openai_prompts: false, // Sin acceso a prompts
    openai_models: false, // Sin acceso a modelos
    openai_analytics: 'read', // Solo lectura de analytics
    openai_testing: false, // Sin acceso a testing
    openai_templates: 'read', // Solo lectura de templates
    openai_settings: false, // Sin acceso a configuración
    openai_history: 'read', // Solo lectura de historial
    ai_image_generation: 'read', // Solo lectura de generación de imágenes
    ai_subplans: false, // Sin acceso a subplanes
    permissions_manager: false, // Sin acceso a gestión de permisos
    facebook_conversions: false, // Sin acceso a conversiones de Facebook
  },
}

/**
 * Verifica si un usuario tiene acceso a un módulo específico
 */
export function hasAccess(role: UserRole, module: Module): boolean {
  const permission = PERMISSIONS_MATRIX[role]?.[module]
  return permission === true || permission === 'read'
}

/**
 * Verifica si un usuario tiene acceso de escritura a un módulo
 */
export function hasWriteAccess(role: UserRole, module: Module): boolean {
  const permission = PERMISSIONS_MATRIX[role]?.[module]
  return permission === true
}

/**
 * Verifica si un usuario tiene solo acceso de lectura a un módulo
 */
export function hasReadOnlyAccess(role: UserRole, module: Module): boolean {
  const permission = PERMISSIONS_MATRIX[role]?.[module]
  return permission === 'read'
}

/**
 * Obtiene el nivel de permiso de un usuario para un módulo
 */
export function getPermissionLevel(
  role: UserRole,
  module: Module
): PermissionLevel {
  return PERMISSIONS_MATRIX[role]?.[module] || false
}

/**
 * Filtra los módulos a los que un usuario tiene acceso
 */
export function getAccessibleModules(role: UserRole): Module[] {
  const modules = Object.keys(PERMISSIONS_MATRIX[role]) as Module[]
  return modules.filter((module) => hasAccess(role, module))
}

/**
 * Mapeo de perfiles de backend a roles del frontend
 */
export function mapProfileToRole(profile: string): UserRole {
  const profileLower = profile.toLowerCase()

  if (profileLower.includes('super') || profileLower === 'super') {
    return 'super'
  }
  if (profileLower.includes('admin') || profileLower === 'admin') {
    return 'admin'
  }
  if (profileLower.includes('supervisor') || profileLower === 'supervisor') {
    return 'supervisor'
  }

  // Por defecto, usuario normal
  return 'user'
}

// ============================================================================
// SISTEMA DE PERMISOS POR PLAN
// ============================================================================

/**
 * Permisos por defecto cuando un plan no tiene permisos configurados
 * Basado en el rol 'admin' para dar acceso razonable
 */
export const DEFAULT_PLAN_PERMISSIONS: InterfacePermissions = {
  // Gestión
  dashboard: true,
  reports: true,
  realtime_chats: true,
  // Operativo
  tickets: true,
  quick_replies: true,
  kanban: true,
  contacts: true,
  schedules: true,
  tags: true,
  internal_chats: true,
  // Administración - Campañas
  campaigns: true,
  campaigns_contacts: true,
  campaigns_settings: true,
  campaigns_insights: true,
  campaigns_attribution: true,
  campaigns_audit: true,
  // Marketing
  marketing: true,
  marketing_insights: true,
  marketing_attribution: true,
  marketing_audit: true,
  // Administración - Flowbuilder
  flowbuilder: true,
  flowbuilder_campaign: true,
  flowbuilder_conversation: true,
  // Administración - Otros
  announcements: true,
  api_messages: true,
  users: true,
  queues: true,
  prompts: true,
  queue_integrations: true,
  connections: true,
  all_connections: false, // Solo superadmin
  invoices: false, // Solo superadmin
  files: true,
  financial: false, // Solo superadmin - Dashboard financiero global
  settings: true,
  terms: 'read',
  companies: false, // Solo superadmin
  plans: false, // Solo superadmin
  // General
  analytics: true,
  leads: true,
  billing: true,
  company: true,
  profile: true,
  notifications: true,
  help: true,
  feedback: true,
  email_marketing: true,
  email_marketing_campaigns: true,
  email_marketing_analytics: true,
  email_marketing_templates: true,
  webchat: true,
  webchat_settings: true,
  webchat_chats: true,
  webchat_analytics: true,
  webchat_history: true,
  integrations: true,
  appointments: true,
  appointments_dashboard: true,
  appointments_calendar: true,
  appointments_services: true,
  appointments_availability: true,
  appointments_bookings: true,
  appointments_reminders: true,
  appointments_reports: true,
  whatsapp_dashboard: true,
  whatsapp_numbers: true,
  whatsapp_templates: true,
  whatsapp_campaigns: true,
  whatsapp_webhooks: true,
  whatsapp_analytics: true,
  whatsapp_settings: true,
  whatsapp_tester: true,
  whatsapp_monitor: true,
  integrations_dashboard: true,
  integrations_billie: true,
  integrations_aria_lite: true,
  integrations_smarttrack: true,
  integrations_sgr: true,
  integrations_webhooks: true,
  integrations_logs: true,
  integrations_settings: true,
  integrations_testing: true,
  openai_dashboard: true,
  openai_prompts: true,
  openai_models: true,
  openai_analytics: true,
  openai_testing: true,
  openai_templates: true,
  openai_settings: true,
  openai_history: true,
  ai_image_generation: true,
  ai_subplans: true,
  permissions_manager: false, // Solo superadmin
  facebook_conversions: true, // Conversiones de Facebook
}

/**
 * Parsea los permisos de interfaz de un plan
 * @param interfacePermissionsJson - String JSON con los permisos
 * @returns Objeto con los permisos parseados
 */
export function parseInterfacePermissions(interfacePermissionsJson: string | null | undefined): InterfacePermissions {
  if (!interfacePermissionsJson) {
    return {}
  }
  try {
    return JSON.parse(interfacePermissionsJson) as InterfacePermissions
  } catch (e) {
    console.error('Error parsing interface permissions:', e)
    return {}
  }
}

/**
 * Obtiene los permisos efectivos de un plan, combinando los permisos guardados con los defaults
 * @param planPermissions - Permisos del plan (puede ser null si no hay)
 * @returns Objeto completo de permisos
 */
export function getEffectivePlanPermissions(planPermissions: InterfacePermissions | null): InterfacePermissions {
  // Combinar defaults con permisos del plan (plan permissions override defaults)
  return {
    ...DEFAULT_PLAN_PERMISSIONS,
    ...(planPermissions || {})
  }
}

/**
 * Verifica si un usuario tiene acceso a un módulo basado en permisos de su plan
 * @param planPermissions - Permisos del plan
 * @param module - Módulo a verificar
 * @param isSuperAdmin - Si el usuario es superadmin
 * @returns true si tiene acceso (completo o lectura)
 */
export function hasAccessByPlan(
  planPermissions: InterfacePermissions | null,
  module: Module,
  isSuperAdmin: boolean = false
): boolean {
  // Superadmin siempre tiene acceso a todo
  if (isSuperAdmin) return true

  const effectivePermissions = getEffectivePlanPermissions(planPermissions)
  const permission = effectivePermissions[module]
  return permission === true || permission === 'read'
}

/**
 * Verifica si un usuario tiene acceso de escritura a un módulo basado en permisos de su plan
 * @param planPermissions - Permisos del plan
 * @param module - Módulo a verificar
 * @param isSuperAdmin - Si el usuario es superadmin
 * @returns true si tiene acceso de escritura
 */
export function hasWriteAccessByPlan(
  planPermissions: InterfacePermissions | null,
  module: Module,
  isSuperAdmin: boolean = false
): boolean {
  // Superadmin siempre tiene acceso de escritura
  if (isSuperAdmin) return true

  const effectivePermissions = getEffectivePlanPermissions(planPermissions)
  return effectivePermissions[module] === true
}

/**
 * Verifica si un usuario tiene solo acceso de lectura a un módulo basado en permisos de su plan
 * @param planPermissions - Permisos del plan
 * @param module - Módulo a verificar
 * @param isSuperAdmin - Si el usuario es superadmin
 * @returns true si tiene solo acceso de lectura
 */
export function hasReadOnlyAccessByPlan(
  planPermissions: InterfacePermissions | null,
  module: Module,
  isSuperAdmin: boolean = false
): boolean {
  // Superadmin nunca está limitado a solo lectura
  if (isSuperAdmin) return false

  const effectivePermissions = getEffectivePlanPermissions(planPermissions)
  return effectivePermissions[module] === 'read'
}

/**
 * Obtiene el nivel de permiso para un módulo basado en permisos de plan
 * @param planPermissions - Permisos del plan
 * @param module - Módulo a verificar
 * @param isSuperAdmin - Si el usuario es superadmin
 * @returns Nivel de permiso
 */
export function getPermissionLevelByPlan(
  planPermissions: InterfacePermissions | null,
  module: Module,
  isSuperAdmin: boolean = false
): PermissionLevel {
  // Superadmin siempre tiene acceso completo
  if (isSuperAdmin) return true

  const effectivePermissions = getEffectivePlanPermissions(planPermissions)
  return effectivePermissions[module] ?? false
}

/**
 * Obtiene la lista de módulos accesibles basado en permisos de plan
 * @param planPermissions - Permisos del plan
 * @param isSuperAdmin - Si el usuario es superadmin
 * @returns Array de módulos accesibles
 */
export function getAccessibleModulesByPlan(
  planPermissions: InterfacePermissions | null,
  isSuperAdmin: boolean = false
): Module[] {
  // Superadmin tiene acceso a todos los módulos
  if (isSuperAdmin) {
    return Object.keys(DEFAULT_PLAN_PERMISSIONS) as Module[]
  }

  const effectivePermissions = getEffectivePlanPermissions(planPermissions)
  return (Object.keys(effectivePermissions) as Module[]).filter(
    module => effectivePermissions[module] === true || effectivePermissions[module] === 'read'
  )
}

/**
 * Lista de todos los módulos disponibles
 */
export const ALL_MODULES: Module[] = Object.keys(DEFAULT_PLAN_PERMISSIONS) as Module[]
