import { ReactNode, useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Box,
  Sheet,
  List,
  ListItem,
  ListItemButton,
  ListItemContent,
  Typography,
  IconButton,
  Avatar,
  Chip,
  useColorScheme,
  Dropdown,
  Menu,
  MenuButton,
  MenuItem,
  Divider,
  Tooltip,
} from '@mui/joy'
import {
  Dashboard as DashboardIcon,
  ConfirmationNumber as TicketIcon,
  Contacts as ContactsIcon,
  Campaign as CampaignIcon,
  BarChart as AnalyticsIcon,
  Settings as SettingsIcon,
  Logout as LogoutIcon,
  Menu as MenuIcon,
  LightMode as LightModeIcon,
  DarkMode as DarkModeIcon,
  ExpandMore as ExpandMoreIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  TrendingUp as TrendingUpIcon,
  Attribution as AttributionIcon,
  SmartToy as SmartToyIcon,
  Business as BusinessIcon,
  Receipt as ReceiptIcon,
  Folder as FolderIcon,
  HelpOutline as HelpIcon,
  Feedback as FeedbackIcon,
  Assessment as ReportIcon,
  Chat as ChatIcon,
  Speed as QuickRepliesIcon,
  ViewKanban as KanbanIcon,
  CalendarToday as CalendarIcon,
  Label as TagIcon,
  Source as SourceIcon,
  Forum as InternalChatIcon,
  AccountTree as FlowbuilderIcon,
  TextFields as PhraseIcon,
  Api as ApiIcon,
  People as UsersIcon,
  QueueMusic as QueueIcon,
  Psychology as PromptsIcon,
  IntegrationInstructions as IntegrationsIcon,
  Cable as ConnectionsIcon,
  AttachMoney as FinancialIcon,
  Description as TermsIcon,
  Domain as CompaniesIcon,
  Inventory as PlansIcon,
  Email as EmailIcon,
  ChatBubble as ChatBubbleIcon,
  History as HistoryIcon,
  EventNote as EventNoteIcon,
  MedicalServices as ServicesIcon,
  Schedule as ScheduleIcon,
  EventAvailable as EventAvailableIcon,
  NotificationsActive as RemindersIcon,
  Assessment as ReportsIcon,
  WhatsApp as WhatsAppIcon,
  Message as MessageIcon,
  Webhook as WebhookIcon,
  FindInPage as LogsIcon,
  Build as BuildIcon,
  AutoAwesome as AIIcon,
  DataObject as DataIcon,
  AdminPanelSettings as PermissionsIcon,
  Image as ImageIcon,
  Videocam as VideocamIcon,
  CreditCard as CreditCardIcon,
  Facebook as FacebookIcon,
  School as SchoolIcon,
  Android as ChatbotIcon,
  Edit as WriterIcon,
  Headphones as AudioIcon,
  ViewInAr as MultimodalIcon,
  Visibility as ObservabilityIcon,
  Tune as FineTuningIcon,
  Theaters as HeyGenIcon,
  Splitscreen as ABTestingIcon,
  SupervisedUserCircle as AffiliatesIcon,
  SwapHoriz as MigrationIcon,
  Hub as CoexistenceIcon,
  VideoLibrary as VideoLibraryIcon,
  Diversity3 as CreatorNetworkIcon,
  QueryStats as OptimizeIcon,
  AccountBox as IdentityIcon,
  PhoneAndroid as DeviceFarmIcon,
  CommentBank as CommentsInboxIcon,
  QuestionAnswer as AutoReplyIcon,
  AutoAwesomeMotion as UGCIcon,
  RocketLaunch as CampaignAIIcon,
  Rule as CampaignRulesIcon,
  ManageAccounts as EmailProviderIcon,
  Engineering as SystemIcon,
  Savings as CreditPacksIcon,
  AccountCircle as ProfileIcon,
  Notifications as NotificationsIcon,
  AccountCircle as _AccountCircleIcon,
  MusicNote as MusicNoteIcon,

} from '@mui/icons-material'
import { useAuth } from '../hooks/useAuth'
import { usePermissions } from '../hooks/usePermissions'
import { usePlanFeatures, PlanFeature } from '../hooks/usePlanFeatures'
import { Module } from '../utils/permissions'
import socketService from '../services/socket'
import api from '../services/api'

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface MenuItemDef {
  path: string
  label: string
  icon: ReactNode
  badge?: number
  children?: MenuItemDef[]
  module?: Module
  planFeature?: PlanFeature
  roles?: string[]
}

interface MenuSection {
  key: string
  title: string
  items: MenuItemDef[]
}

interface AppLayoutProps {
  children: ReactNode
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SIDEBAR_BG = '#1e293b'
const SIDEBAR_WIDTH_EXPANDED = 260
const SIDEBAR_WIDTH_COLLAPSED = 68

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AppLayout({ children }: AppLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout, user } = useAuth()
  const { canAccess } = usePermissions()
  const { hasFeature } = usePlanFeatures()
  const { mode, setMode } = useColorScheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [expandedMenus, setExpandedMenus] = useState<string[]>([])
  const [chatUnreads, setChatUnreads] = useState(0)
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebarCollapsed') === 'true' } catch { return false }
  })

  const sidebarWidth = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED

  const toggleSidebar = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('sidebarCollapsed', String(next))
  }

  // ─── Chat Unreads Badge ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return

    const fetchUnreads = async () => {
      try {
        const res = await api.get('/chats-total-unreads')
        setChatUnreads(res.data.total || 0)
      } catch { /* silent */ }
    }

    fetchUnreads()
    const interval = setInterval(fetchUnreads, 30000)
    return () => clearInterval(interval)
  }, [user?.id])

  useEffect(() => {
    if (!user?.companyId) return
    const socket = socketService.getSocket()
    if (!socket) return

    const channel = `company-${user.companyId}-chat`
    const handleUpdate = () => {
      api.get('/chats-total-unreads')
        .then(res => setChatUnreads(res.data.total || 0))
        .catch(() => {})
    }
    socket.on(channel, handleUpdate)
    return () => { socket.off(channel, handleUpdate) }
  }, [user?.companyId])

  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent
      if (custom.detail?.total !== undefined) {
        setChatUnreads(custom.detail.total)
      } else {
        // Refetch on any chatUnreadsChange event
        api.get('/chats-total-unreads')
          .then(res => setChatUnreads(res.data.total || 0))
          .catch(() => {})
      }
    }
    window.addEventListener('chatUnreadsChange', handler)
    return () => window.removeEventListener('chatUnreadsChange', handler)
  }, [])

  // ─── Menu Sections ──────────────────────────────────────────────────────────

  const menuSections: MenuSection[] = [
    {
      key: 'inicio',
      title: 'INICIO',
      items: [
        {
          path: '/dashboard',
          label: 'Gestión',
          icon: <DashboardIcon />,
          module: 'dashboard',
          children: [
            {
              path: '/',
              label: 'Dashboard',
              icon: <DashboardIcon />,
              module: 'dashboard',
            },
            {
              path: '/customer-origins',
              label: 'Origen de Cliente',
              icon: <SourceIcon />,
              module: 'customer_origins',
            },
            {
              path: '/customer-origins/reports',
              label: 'Reportes de Origen',
              icon: <ReportIcon />,
              module: 'customer_origins_reports',
            },
          ],
        },
        {
          path: '/analytics',
          label: 'Analítica',
          icon: <AnalyticsIcon />,
          module: 'analytics',
        },
      ],
    },
    {
      key: 'operativo',
      title: 'OPERATIVO',
      items: [
        {
          path: '/tickets',
          label: 'Tickets',
          icon: <TicketIcon />,
          module: 'tickets',
        },
        {
          path: '/contacts',
          label: 'Contactos',
          icon: <ContactsIcon />,
          module: 'contacts',
        },
        {
          path: '/quick-replies',
          label: 'Mensajes Rápidos',
          icon: <QuickRepliesIcon />,
          module: 'quick_replies',
        },
        {
          path: '/internal-chats',
          label: 'Chats Internos',
          icon: <InternalChatIcon />,
          module: 'internal_chats',
          planFeature: 'internalChat',
          badge: chatUnreads > 0 ? chatUnreads : undefined,
        },
        {
          path: '/kanban',
          label: 'Funnel de Ventas',
          icon: <KanbanIcon />,
          module: 'kanban',
          planFeature: 'kanban',
        },
        {
          path: '/kanban-dashboard',
          label: 'Dashboard Kanban',
          icon: <ReportIcon />,
          module: 'kanban',
          planFeature: 'kanban',
        },
        {
          path: '/schedules',
          label: 'Agendas',
          icon: <CalendarIcon />,
          module: 'schedules',
          planFeature: 'schedules',
        },
        {
          path: '/tags',
          label: 'Etiquetas',
          icon: <TagIcon />,
          module: 'tags',
        },
      ],
    },
    {
      key: 'canales',
      title: 'CANALES',
      items: [
        {
          path: '/connections-group',
          label: 'Conexiones',
          icon: <ConnectionsIcon />,
          module: 'connections',
          children: [
            {
              path: '/connections',
              label: 'Lista',
              icon: <ConnectionsIcon />,
              module: 'connections',
            },
            {
              path: '/coexistence',
              label: 'Coexistencia Meta',
              icon: <CoexistenceIcon />,
              module: 'coexistence',
            },
            {
              path: '/migration',
              label: 'Migrar a Meta',
              icon: <MigrationIcon />,
              module: 'migration',
            },
            {
              path: '/tiktok-connections',
              label: 'TikTok Comments',
              icon: <MusicNoteIcon />,
              module: 'connections',
            },
          ],
        },
        {
          path: '/whatsapp',
          label: 'WhatsApp API',
          icon: <WhatsAppIcon />,
          module: 'whatsapp_dashboard',
          children: [
            {
              path: '/whatsapp/dashboard',
              label: 'Dashboard',
              icon: <WhatsAppIcon />,
              module: 'whatsapp_dashboard',
            },
            {
              path: '/whatsapp/templates',
              label: 'Plantillas',
              icon: <MessageIcon />,
              module: 'whatsapp_templates',
            },
          ],
        },
        {
          path: '/webchat',
          label: 'WebChat',
          icon: <ChatBubbleIcon />,
          module: 'webchat',
          children: [
            {
              path: '/webchat/settings',
              label: 'Configuración',
              icon: <SettingsIcon />,
              module: 'webchat_settings',
            },
            {
              path: '/webchat/chats',
              label: 'Conversaciones',
              icon: <ChatBubbleIcon />,
              module: 'webchat_chats',
            },
            {
              path: '/webchat/analytics',
              label: 'Analytics',
              icon: <AnalyticsIcon />,
              module: 'webchat_analytics',
            },
            {
              path: '/webchat/history',
              label: 'Historial',
              icon: <HistoryIcon />,
              module: 'webchat_history',
            },
          ],
        },
      ],
    },
    {
      key: 'marketing',
      title: 'MARKETING & CAMPAÑAS',
      items: [
        {
          path: '/campaigns-group',
          label: 'Campañas',
          icon: <CampaignIcon />,
          module: 'campaigns',
          planFeature: 'campaigns',
          children: [
            // Principal — pantalla unificada de campañas
            {
              path: '/campaigns',
              label: 'Lista',
              icon: <CampaignIcon />,
              module: 'campaigns',
            },
            // Administración — items secundarios (menor prominencia, van al final)
            {
              path: '/campaigns/contacts',
              label: 'Contactos',
              icon: <ContactsIcon />,
              module: 'campaigns_contacts',
            },
            {
              path: '/campaigns/settings',
              label: 'Configuración',
              icon: <SettingsIcon />,
              module: 'campaigns_settings',
            },
            {
              path: '/campaigns/ai',
              label: 'IA de Campañas',
              icon: <CampaignAIIcon />,
              module: 'campaigns_ai',
            },
            {
              path: '/campaigns/rules',
              label: 'Reglas',
              icon: <CampaignRulesIcon />,
              module: 'campaigns_rules',
            },
          ],
        },
        {
          path: '/ugc-group',
          label: 'UGC & Contenido',
          icon: <UGCIcon />,
          module: 'ugc_dashboard',
          planFeature: 'campaigns',
          children: [
            {
              path: '/ugc/dashboard',
              label: 'Dashboard',
              icon: <UGCIcon />,
              module: 'ugc_dashboard',
            },
            {
              path: '/ugc/campaigns',
              label: 'Campañas UGC',
              icon: <CampaignIcon />,
              module: 'ugc_campaigns',
            },
            {
              path: '/ugc/creators',
              label: 'Creators',
              icon: <CreatorNetworkIcon />,
              module: 'ugc_creators',
            },
            {
              path: '/ugc/social-accounts',
              label: 'Assets',
              icon: <FolderIcon />,
              module: 'ugc_social_accounts',
            },
            {
              path: '/ugc/video-studio',
              label: 'Video Studio',
              icon: <VideoLibraryIcon />,
              module: 'ugc_video_studio',
            },
            {
              path: '/ugc/analytics',
              label: 'Analytics',
              icon: <AnalyticsIcon />,
              module: 'ugc_analytics',
            },
            {
              path: '/ugc/optimization',
              label: 'Optimización IA',
              icon: <OptimizeIcon />,
              module: 'ugc_optimization',
            },
            {
              path: '/ugc/settings',
              label: 'Configuración',
              icon: <SettingsIcon />,
              module: 'ugc_settings',
            },
            {
              path: '/ugc/social-posts',
              label: 'Posts Programados',
              icon: <CampaignIcon />,
              module: 'ugc_social_posts',
            },
          ],
        },
        {
          path: '/marketing-group',
          label: 'Marketing',
          icon: <TrendingUpIcon />,
          module: 'marketing',
          planFeature: 'marketing',
          children: [
            {
              path: '/campaigns/insights',
              label: 'Insights',
              icon: <TrendingUpIcon />,
              module: 'campaigns_insights',
            },
            {
              path: '/campaigns/attribution',
              label: 'Atribución',
              icon: <AttributionIcon />,
              module: 'campaigns_attribution',
            },
            {
              path: '/campaigns/audit',
              label: 'Auditoría',
              icon: <SmartToyIcon />,
              module: 'campaigns_audit',
            },
            {
              path: '/facebook-conversions',
              label: 'Facebook Ads',
              icon: <FacebookIcon />,
              module: 'facebook_conversions',
            },
            // Afiliados movidos a sección independiente "AFILIADOS"
          ],
        },
        {
          path: '/email-marketing-group',
          label: 'Email Marketing',
          icon: <EmailIcon />,
          module: 'email_marketing',
          children: [
            {
              path: '/email-marketing',
              label: 'Dashboard',
              icon: <EmailIcon />,
              module: 'email_marketing',
            },
            {
              path: '/email-marketing/campaigns',
              label: 'Campañas',
              icon: <CampaignIcon />,
              module: 'email_marketing_campaigns',
            },
            {
              path: '/email-marketing/analytics',
              label: 'Analytics',
              icon: <AnalyticsIcon />,
              module: 'email_marketing_analytics',
            },
            {
              path: '/email-marketing/templates',
              label: 'Plantillas',
              icon: <TermsIcon />,
              module: 'email_marketing_templates',
            },
            {
              path: '/email/provider-settings',
              label: 'Proveedores',
              icon: <EmailProviderIcon />,
              module: 'email_provider_settings',
            },
            {
              path: '/email/credit-packs',
              label: 'Packs de Envío',
              icon: <CreditCardIcon />,
              module: 'email_credit_packs',
            },
            {
              path: '/email-plans',
              label: 'Planes de Email',
              icon: <CreditCardIcon />,
              module: 'email_marketing',
            },
            {
              path: '/email/credits-dashboard',
              label: 'Mis Créditos',
              icon: <CreditCardIcon />,
              module: 'email_marketing',
            },
          ],
        },
        {
          path: '/comment-autoreply-group',
          label: 'Auto-Responder',
          icon: <AutoReplyIcon />,
          module: 'comment_autoreply',
          children: [
            {
              path: '/comment-autoreply',
              label: 'Dashboard',
              icon: <DashboardIcon />,
              module: 'comment_autoreply',
            },
            {
              path: '/comment-autoreply/campaigns',
              label: 'Campañas',
              icon: <CampaignIcon />,
              module: 'comment_autoreply_campaigns',
            },
            {
              path: '/comment-autoreply/settings',
              label: 'Configuración',
              icon: <SettingsIcon />,
              module: 'comment_autoreply',
            },
          ],
        },
      ],
    },
    {
      key: 'herramientas',
      title: 'HERRAMIENTAS',
      items: [
        {
          path: '/appointments-group',
          label: 'Citas',
          icon: <CalendarIcon />,
          module: 'appointments',
          children: [
            {
              path: '/appointments/dashboard',
              label: 'Dashboard',
              icon: <EventNoteIcon />,
              module: 'appointments_dashboard',
            },
            {
              path: '/appointments/bookings',
              label: 'Gestión',
              icon: <CalendarIcon />,
              module: 'appointments_bookings',
            },
            {
              path: '/appointments/calendar',
              label: 'Calendario',
              icon: <CalendarIcon />,
              module: 'appointments_calendar',
            },
            {
              path: '/appointments/services',
              label: 'Servicios',
              icon: <ServicesIcon />,
              module: 'appointments_services',
            },
            {
              path: '/appointments/availability',
              label: 'Disponibilidad',
              icon: <ScheduleIcon />,
              module: 'appointments_availability',
            },
            {
              path: '/appointments/reminders',
              label: 'Recordatorios',
              icon: <RemindersIcon />,
              module: 'appointments_reminders',
            },
            {
              path: '/appointments/reports',
              label: 'Reportes',
              icon: <ReportsIcon />,
              module: 'appointments_reports',
            },
          ],
        },
        {
          path: '/flowbuilder-group',
          label: 'Flowbuilder',
          icon: <FlowbuilderIcon />,
          module: 'flowbuilder',
          children: [
            {
              path: '/flowbuilder',
              label: 'Editor',
              icon: <FlowbuilderIcon />,
              module: 'flowbuilder',
            },
            {
              path: '/flowbuilder/conversation',
              label: 'Flujos',
              icon: <ChatIcon />,
              module: 'flowbuilder_conversation',
            },
            {
              path: '/flowbuilder/campaign',
              label: 'Palabras Clave',
              icon: <PhraseIcon />,
              module: 'flowbuilder_campaign',
            },
          ],
        },
        {
          path: '/integrations',
          label: 'Integraciones',
          icon: <IntegrationsIcon />,
          module: 'integrations',
          planFeature: 'integrations',
        },
      ],
    },
    {
      key: 'afiliados',
      title: 'AFILIADOS',
      items: [
        {
          path: '/affiliates-group',
          label: 'Afiliados',
          icon: <AffiliatesIcon />,
          module: 'affiliates' as Module,
          children: [
            {
              path: '/affiliates',
              label: 'Dashboard',
              icon: <AffiliatesIcon />,
              module: 'affiliates' as Module,
            },
            {
              path: '/affiliates/programs',
              label: 'Programas',
              icon: <AffiliatesIcon />,
              module: 'affiliate_programs' as Module,
            },
            {
              path: '/affiliates/referrals',
              label: 'Referidos',
              icon: <AffiliatesIcon />,
              module: 'affiliate_referrals' as Module,
            },
            {
              path: '/affiliates/wallet',
              label: 'Billetera',
              icon: <FinancialIcon />,
              module: 'affiliate_wallet' as Module,
            },
            {
              path: '/affiliates/withdrawals',
              label: 'Retiros',
              icon: <CreditCardIcon />,
              module: 'affiliate_withdrawals' as Module,
            },
            {
              path: '/affiliates/links',
              label: 'Links',
              icon: <ConnectionsIcon />,
              module: 'affiliate_links' as Module,
            },
            {
              path: '/affiliates/tiers',
              label: 'Niveles MLM',
              icon: <SchoolIcon />,
              module: 'affiliate_tiers' as Module,
            },
          ],
        },
      ],
    },
    {
      key: 'ia',
      title: 'INTELIGENCIA ARTIFICIAL',
      items: [
        {
          path: '/ai-platform-group',
          label: 'Plataforma IA',
          icon: <AIIcon />,
          module: 'ai_platform',
          planFeature: 'openai',
          children: [
            {
              path: '/ai/platform',
              label: 'Dashboard IA',
              icon: <DashboardIcon />,
              module: 'ai_platform',
            },
            {
              path: '/ai/knowledge-base',
              label: 'Base de Conocimiento',
              icon: <SchoolIcon />,
              module: 'ai_knowledge_base',
            },
            {
              path: '/ai/agents',
              label: 'Agentes de IA',
              icon: <SmartToyIcon />,
              module: 'ai_agents',
            },
            {
              path: '/ai/chatbot-builder',
              label: 'Chatbot Builder',
              icon: <ChatbotIcon />,
              module: 'ai_chatbot_builder',
            },
            {
              path: '/ai/scheduler',
              label: 'Pipeline con Agentes IA',
              icon: <DataIcon />,
              module: 'ai_scheduler',
            },
          ],
        },
        {
          path: '/ai-content-group',
          label: 'Generación de Contenido',
          icon: <WriterIcon />,
          module: 'ai_writer',
          planFeature: 'openai',
          children: [
            {
              path: '/ai/writer',
              label: 'AI Writer',
              icon: <WriterIcon />,
              module: 'ai_writer',
            },
            {
              path: '/ai-image-generation',
              label: 'Generar Imágenes',
              icon: <ImageIcon />,
              module: 'ai_image_generation',
            },
            {
              path: '/ai-video-generation',
              label: 'Generar Videos',
              icon: <VideocamIcon />,
              module: 'ai_video_generation',
            },
            {
              path: '/ai/audio',
              label: 'Audio IA',
              icon: <AudioIcon />,
              module: 'ai_audio',
            },
            {
              path: '/ai/multimodal',
              label: 'Multimodal',
              icon: <MultimodalIcon />,
              module: 'ai_multimodal',
            },
          ],
        },
        {
          path: '/ai-advanced-group',
          label: 'IA Avanzada',
          icon: <FineTuningIcon />,
          module: 'openai_settings',
          planFeature: 'openai',
          children: [
            {
              path: '/openai/settings',
              label: 'Proveedores IA',
              icon: <SettingsIcon />,
              module: 'openai_settings',
              roles: ['super'],
            },
            {
              path: '/ai/ab-testing',
              label: 'A/B Testing',
              icon: <ABTestingIcon />,
              module: 'ai_ab_testing',
            },
            {
              path: '/ai/observability',
              label: 'Observabilidad',
              icon: <ObservabilityIcon />,
              module: 'ai_observability',
            },
            {
              path: '/ai/fine-tuning',
              label: 'Fine-tuning',
              icon: <FineTuningIcon />,
              module: 'ai_fine_tuning',
            },
            {
              path: '/ai/credits',
              label: 'Paquetes Créditos',
              icon: <CreditPacksIcon />,
              module: 'ai_credits',
            },
            {
              path: '/prompts',
              label: 'Prompts',
              icon: <PromptsIcon />,
              module: 'prompts',
            },
            {
              path: '/ai/heygen',
              label: 'HeyGen Video',
              icon: <HeyGenIcon />,
              module: 'ai_heygen',
            },
            {
              path: '/ai/subplans',
              label: 'Planes y Subscripciones',
              icon: <PlansIcon />,
              module: 'ai_subplans',
            },
            {
              path: '/ai/affiliates',
              label: 'Afiliados IA',
              icon: <AffiliatesIcon />,
              module: 'ai_affiliates',
            },
            {
              path: '/ai-usage',
              label: 'Mi Consumo IA',
              icon: <CreditPacksIcon />,
              module: 'openai_dashboard',
            },
          ],
        },
        {
          path: '/ai-costs-group',
          label: 'Costos IA',
          icon: <FinancialIcon />,
          module: 'openai_dashboard',
          roles: ['super'],
          children: [
            {
              path: '/ai-rentability',
              label: 'Rentabilidad IA',
              icon: <TrendingUpIcon />,
              module: 'openai_dashboard',
              roles: ['super'],
            },
          ],
        },
      ],
    },
    {
      key: 'configuracion',
      title: 'CONFIGURACIÓN',
      items: [
        {
          path: '/settings',
          label: 'Configuración General',
          icon: <SettingsIcon />,
          module: 'settings',
        },
        {
          path: '/users',
          label: 'Usuarios',
          icon: <UsersIcon />,
          module: 'users',
        },
        {
          path: '/queues',
          label: 'Colas',
          icon: <QueueIcon />,
          module: 'queues',
        },
        // {
        //   path: '/queue-integrations',
        //   label: 'Integraciones de Cola',
        //   icon: <IntegrationsIcon />,
        //   module: 'queue_integrations',
        // },
        // {
        //   path: '/connections',
        //   label: 'Conexiones',
        //   icon: <ConnectionsIcon />,
        //   module: 'connections',
        // },
        {
          path: '/billing',
          label: 'Facturación',
          icon: <ReceiptIcon />,
          module: 'billing',
        },
        {
          path: '/permissions-manager',
          label: 'Permisos',
          icon: <PermissionsIcon />,
          module: 'permissions_manager',
        },
      ],
    },
    {
      key: 'sistema',
      title: 'SISTEMA',
      items: [
        {
          path: '/system-admin-group',
          label: 'Administración',
          icon: <SystemIcon />,
          module: 'plans',
          roles: ['super'],
          children: [
            {
              path: '/plans',
              label: 'Planes',
              icon: <PlansIcon />,
              module: 'plans',
              roles: ['super'],
            },
            {
              path: '/companies',
              label: 'Empresas',
              icon: <CompaniesIcon />,
              module: 'companies',
              roles: ['super'],
            },
            {
              path: '/terms',
              label: 'Términos y Condiciones',
              icon: <TermsIcon />,
              module: 'terms',
            },
            {
              path: '/api-messages',
              label: 'API Mensajes',
              icon: <ApiIcon />,
              module: 'api_messages',
              roles: ['admin', 'super'],
            },
            
          ],
        },
        {
          path: '/dev-tools-group',
          label: 'Desarrollo',
          icon: <BuildIcon />,
          module: 'integrations_logs',
          roles: ['super'],
          children: [
            {
              path: '/integrations-internal/logs',
              label: 'Logs',
              icon: <LogsIcon />,
              module: 'integrations_logs',
            },
            {
              path: '/integrations-internal/testing',
              label: 'Herramientas Dev',
              icon: <BuildIcon />,
              module: 'integrations_testing',
              roles: ['super'],
            },
          ],
        },
      ],
    },
  ]

  // ─── Filtering Logic ────────────────────────────────────────────────────────

  const filterItem = (item: MenuItemDef): MenuItemDef | null => {
    // Check roles
    if (item.roles) {
      if (item.roles.includes('super') && !user?.super) return null
      const otherRoles = item.roles.filter((r) => r !== 'super')
      if (otherRoles.length > 0 && user?.profile && !otherRoles.includes(user.profile)) return null
    }
    // Check module permission
    if (item.module && !canAccess(item.module)) return null
    // Check plan feature
    if (item.planFeature && !hasFeature(item.planFeature)) return null

    // Filter children recursively
    if (item.children) {
      const filteredChildren = item.children
        .map(filterItem)
        .filter((c): c is MenuItemDef => c !== null)
      // Si todos los children fueron filtrados, ocultar el parent también
      if (filteredChildren.length === 0) return null
      return { ...item, children: filteredChildren }
    }
    return item
  }

  const visibleSections: MenuSection[] = menuSections
    .map((section) => ({
      ...section,
      items: section.items.map(filterItem).filter((i): i is MenuItemDef => i !== null),
    }))
    .filter((section) => section.items.length > 0)

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const toggleMenu = (path: string) => {
    setExpandedMenus((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    )
  }

  const handleNavigate = (path: string) => {
    navigate(path)
    if (mobileOpen) setMobileOpen(false)
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  // ─── Render Menu Item ────────────────────────────────────────────────────────

  const renderMenuItemDef = (item: MenuItemDef, depth = 0) => {
    const hasChildren = item.children && item.children.length > 0
    const isExpanded = expandedMenus.includes(item.path)
    const active = isActive(item.path) && !hasChildren

    const button = (
      <ListItemButton
        selected={active}
        onClick={() => {
          if (hasChildren) {
            if (collapsed) {
              handleNavigate(item.children![0].path)
            } else {
              toggleMenu(item.path)
            }
          } else {
            handleNavigate(item.path)
          }
        }}
        sx={{
          pl: collapsed ? 0 : depth > 0 ? 3.5 : 1.5,
          pr: collapsed ? 0 : 1.5,
          justifyContent: collapsed ? 'center' : 'flex-start',
          borderRadius: 'md',
          minHeight: depth > 0 ? 36 : 40,
          transition: 'all 0.18s ease',
          color: active ? 'common.white' : 'rgba(255,255,255,0.7)',
          '&:hover': {
            bgcolor: 'rgba(255,255,255,0.08)',
            color: 'common.white',
            '& .menu-icon': { color: 'common.white' },
          },
          '&.Mui-selected': {
            bgcolor: 'primary.500',
            color: 'common.white',
            '&:hover': { bgcolor: 'primary.600' },
            '& .menu-icon': { color: 'common.white' },
          },
        }}
      >
        <Box
          className="menu-icon"
          sx={{
            mr: collapsed ? 0 : 1.5,
            display: 'flex',
            alignItems: 'center',
            fontSize: depth > 0 ? 18 : 20,
            color: active ? 'common.white' : 'rgba(255,255,255,0.5)',
            flexShrink: 0,
          }}
        >
          {item.icon}
        </Box>
        {!collapsed && (
          <>
            <ListItemContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography
                  level={depth > 0 ? 'body-xs' : 'body-sm'}
                  sx={{ color: 'inherit', fontWeight: active ? 600 : 400 }}
                >
                  {item.label}
                </Typography>
                {item.badge !== undefined && (
                  <Chip size="sm" color="danger" variant="solid">
                    {item.badge}
                  </Chip>
                )}
              </Box>
            </ListItemContent>
            {hasChildren && (
              <Box
                sx={{
                  ml: 'auto',
                  display: 'flex',
                  color: 'rgba(255,255,255,0.4)',
                  transition: 'transform 0.25s ease',
                  transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              >
                <ExpandMoreIcon sx={{ fontSize: 18 }} />
              </Box>
            )}
          </>
        )}
      </ListItemButton>
    )

    return (
      <Box key={item.path}>
        <ListItem nested={hasChildren} sx={{ p: 0, mb: 0.25 }}>
          {collapsed ? (
            <Tooltip title={item.label} placement="right" arrow>
              {button}
            </Tooltip>
          ) : (
            button
          )}
        </ListItem>

        {!collapsed && hasChildren && (
          <Box
            sx={{
              maxHeight: isExpanded ? '800px' : '0px',
              opacity: isExpanded ? 1 : 0,
              overflow: 'hidden',
              transition: 'max-height 0.3s ease-in-out, opacity 0.22s ease-in-out',
            }}
          >
            <List sx={{ p: 0, pl: 1 }}>
              {item.children!.map((child) => renderMenuItemDef(child, depth + 1))}
            </List>
          </Box>
        )}
      </Box>
    )
  }

  // ─── Sidebar Content ─────────────────────────────────────────────────────────

  const sidebarContent = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bgcolor: SIDEBAR_BG,
        overflow: 'hidden',
      }}
    >
      {/* ── Header ── */}
      <Box
        sx={{
          px: collapsed ? 1 : 2,
          py: 2,
          display: 'flex',
          alignItems: 'center',
          gap: collapsed ? 0 : 1.5,
          justifyContent: collapsed ? 'center' : 'space-between',
          flexShrink: 0,
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {collapsed ? (
          <Tooltip title="Expandir menú" placement="right" arrow>
            <IconButton
              size="sm"
              variant="plain"
              onClick={toggleSidebar}
              sx={{ color: 'rgba(255,255,255,0.7)', '&:hover': { color: 'common.white', bgcolor: 'rgba(255,255,255,0.08)' } }}
            >
              <Box
                component="img"
                src="/logo.png"
                alt="ChatEAM"
                sx={{ width: 32, height: 32, borderRadius: '50%' }}
              />
            </IconButton>
          </Tooltip>
        ) : (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, flex: 1 }}>
              <Box
                component="img"
                src="/logo.png"
                alt="ChatEAM"
                sx={{ width: 38, height: 38, flexShrink: 0, borderRadius: '50%' }}
              />
              <Box sx={{ minWidth: 0 }}>
                <Box
                  component="img"
                  src="/chateam-logo.png"
                  alt="Chateam"
                  sx={{ height: 18, display: 'block', filter: 'brightness(0) invert(1)', opacity: 0.9 }}
                />
                <Typography
                  level="body-xs"
                  noWrap
                  sx={{ color: 'rgba(255,255,255,0.5)', lineHeight: 1.3 }}
                >
                  {user?.profile || 'Administrador'}
                </Typography>
              </Box>
            </Box>
            <Tooltip title="Colapsar menú" placement="bottom" arrow>
              <IconButton
                size="sm"
                variant="plain"
                onClick={toggleSidebar}
                sx={{
                  flexShrink: 0,
                  color: 'rgba(255,255,255,0.5)',
                  '&:hover': { color: 'common.white', bgcolor: 'rgba(255,255,255,0.08)' },
                }}
              >
                <ChevronLeftIcon />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Box>

      {/* ── Menu Sections ── */}
      <Box
        sx={{
          flexGrow: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          px: collapsed ? 0.5 : 1.5,
          py: 1,
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {visibleSections.map((section, sectionIdx) => (
          <Box key={section.key}>
            {/* Section header — hidden when collapsed */}
            {!collapsed && (
              <Typography
                level="body-xs"
                sx={{
                  px: 1,
                  pt: sectionIdx === 0 ? 0.5 : 1.5,
                  pb: 0.5,
                  color: 'rgba(255,255,255,0.35)',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  fontSize: '0.65rem',
                }}
              >
                {section.title}
              </Typography>
            )}
            {collapsed && sectionIdx > 0 && (
              <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.1)' }} />
            )}
            <List sx={{ p: 0, gap: 0 }}>
              {section.items.map((item) => renderMenuItemDef(item))}
            </List>
          </Box>
        ))}
      </Box>

      {/* Footer eliminado — usuario ya visible en TopBar */}
    </Box>
  )

  // ─── Top Header Bar ──────────────────────────────────────────────────────────

  const topBar = (
    <Box
      component="header"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 900,
        height: 64,
        display: 'flex',
        alignItems: 'center',
        px: { xs: 2, md: 3 },
        gap: 1,
        bgcolor: 'background.surface',
        borderBottom: '1px solid',
        borderColor: 'divider',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        flexShrink: 0,
      }}
    >
      {/* Hamburger — mobile only */}
      <IconButton
        variant="outlined"
        color="neutral"
        size="sm"
        onClick={() => setMobileOpen(!mobileOpen)}
        sx={{ display: { xs: 'flex', md: 'none' } }}
      >
        <MenuIcon />
      </IconButton>

      {/* Spacer */}
      <Box sx={{ flex: 1 }} />

      {/* Dark mode toggle */}
      <Tooltip title={mode === 'light' ? 'Modo oscuro' : 'Modo claro'} arrow>
        <IconButton
          variant="plain"
          color="neutral"
          size="sm"
          onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
        >
          {mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
        </IconButton>
      </Tooltip>

      {/* User dropdown */}
      <Dropdown>
        <MenuButton
          variant="plain"
          color="neutral"
          size="sm"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1,
            borderRadius: 'md',
          }}
        >
          <Avatar size="sm" src={user?.profileImage} sx={{ width: 30, height: 30, fontSize: 13 }}>
            {user?.name?.charAt(0) || 'U'}
          </Avatar>
          <Box sx={{ display: { xs: 'none', sm: 'block' }, textAlign: 'left' }}>
            <Typography level="body-sm" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
              {user?.name || 'Administrador'}
            </Typography>
            <Typography level="body-xs" sx={{ color: 'text.tertiary', lineHeight: 1.2 }}>
              {user?.profile || 'admin'}
            </Typography>
          </Box>
          <ExpandMoreIcon sx={{ fontSize: 16, color: 'text.tertiary', display: { xs: 'none', sm: 'block' } }} />
        </MenuButton>
        <Menu placement="bottom-end" sx={{ minWidth: 200 }}>
          <MenuItem onClick={() => handleNavigate('/profile')}>
            <ProfileIcon sx={{ mr: 1.5, fontSize: 18 }} />
            Mi Perfil
          </MenuItem>
          <MenuItem onClick={() => handleNavigate('/notifications')}>
            <NotificationsIcon sx={{ mr: 1.5, fontSize: 18 }} />
            Notificaciones
          </MenuItem>
          <Divider />
          <MenuItem onClick={() => handleNavigate('/help')}>
            <HelpIcon sx={{ mr: 1.5, fontSize: 18 }} />
            Ayuda
          </MenuItem>
          <MenuItem onClick={() => handleNavigate('/feedback')}>
            <FeedbackIcon sx={{ mr: 1.5, fontSize: 18 }} />
            Feedback
          </MenuItem>
          <Divider />
          <MenuItem color="danger" onClick={handleLogout}>
            <LogoutIcon sx={{ mr: 1.5, fontSize: 18 }} />
            Cerrar Sesión
          </MenuItem>
        </Menu>
      </Dropdown>
    </Box>
  )

  // ─── Layout ──────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Desktop Sidebar */}
      <Sheet
        sx={{
          width: sidebarWidth,
          flexShrink: 0,
          display: { xs: 'none', md: 'block' },
          height: '100vh',
          position: 'sticky',
          top: 0,
          transition: 'width 0.25s ease-in-out',
          overflow: 'hidden',
          bgcolor: SIDEBAR_BG,
          border: 'none',
          boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
          zIndex: 1000,
        }}
      >
        {sidebarContent}
      </Sheet>

      {/* Mobile Sidebar */}
      {mobileOpen && (
        <Sheet
          sx={{
            width: SIDEBAR_WIDTH_EXPANDED,
            flexShrink: 0,
            display: { xs: 'block', md: 'none' },
            height: '100vh',
            position: 'fixed',
            top: 0,
            left: 0,
            zIndex: 1200,
            overflow: 'hidden',
            bgcolor: SIDEBAR_BG,
            border: 'none',
            boxShadow: '4px 0 16px rgba(0,0,0,0.3)',
          }}
        >
          {sidebarContent}
        </Sheet>
      )}

      {/* Mobile Backdrop */}
      {mobileOpen && (
        <Box
          onClick={() => setMobileOpen(false)}
          sx={{
            display: { xs: 'block', md: 'none' },
            position: 'fixed',
            inset: 0,
            bgcolor: 'rgba(0,0,0,0.5)',
            zIndex: 1100,
          }}
        />
      )}

      {/* Right Column: TopBar + Main Content */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          width: { xs: '100%', md: `calc(100% - ${sidebarWidth}px)` },
          transition: 'width 0.25s ease-in-out',
        }}
      >
        {topBar}

        <Box
          component="main"
          sx={{
            flex: 1,
            p: { xs: 2, sm: 3 },
            bgcolor: 'background.level1',
            overflowY: 'auto',
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  )
}
