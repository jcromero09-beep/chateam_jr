// [Fase3·N2.0] Catálogo compartido de módulos: categoría por módulo + nombres + formateador.
// Extraído de PermissionsManager para reusarlo en el editor de matriz de permisos por rol.
import type { Module } from './permissions'

export type ModuleCategory =
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

export const moduleCategories: Record<Module, ModuleCategory> = {
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

export const categoryNames: Record<ModuleCategory, string> = {
  gestion: 'Gestión',
  operativo: 'Operativo',
  campanas: 'Campañas',
  flowbuilder: 'Flowbuilder',
  administracion: 'Administración',
  email: 'Email Marketing',
  webchat: 'WebChat',
  appointments: 'Citas',
  whatsapp: 'WhatsApp Cloud API',
  integraciones: 'Integraciones Internas',
  afiliados: 'Afiliados',
  openai: 'OpenAI Integration',
  general: 'General',
}

// Convierte 'ugc_video_studio' -> 'Ugc Video Studio'.
export const formatModuleName = (module: string): string =>
  module.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

// Orden estable de categorías para la UI.
export const CATEGORY_ORDER: ModuleCategory[] = [
  'operativo', 'gestion', 'campanas', 'email', 'webchat', 'appointments',
  'whatsapp', 'flowbuilder', 'openai', 'integraciones', 'afiliados',
  'administracion', 'general',
]
