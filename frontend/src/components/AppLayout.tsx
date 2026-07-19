import { ReactNode, useState, useEffect, type MouseEvent as ReactMouseEvent } from 'react'
import { useNavigate, useLocation, Link as RouterLink } from 'react-router-dom'
import AnnouncementBanner from './AnnouncementBanner'
// [Re-skin Tailwind v4] Del design system de Joy sólo se conserva `useColorScheme`
// (fuente de verdad del modo claro/oscuro compartida con el resto de pantallas MUI).
// Toda la capa visual del shell es ahora Tailwind + tokens del design system.
import { useColorScheme } from '@mui/joy'
import {
  Dashboard as DashboardIcon,
  Close as CloseIcon,
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
  // Sprint 1 (2026-05-20) — icono del panel de revisión de correcciones IA
  VerifiedUser as CorrectionReviewIcon,
  AccountCircle as ProfileIcon,
  Notifications as NotificationsIcon,
  AccountCircle as _AccountCircleIcon,
  MusicNote as MusicNoteIcon,

} from '@mui/icons-material'
import { useAuth } from '../hooks/useAuth'
import { usePermissions } from '../hooks/usePermissions'
import NotificationBell from './NotificationBell'
import { usePlanFeatures, PlanFeature } from '../hooks/usePlanFeatures'
import { Module } from '../utils/permissions'
import socketService from '../services/socket'
import api from '../services/api'
import logger from '../utils/logger'
import { exitCompany, switchCompany } from '../services/impersonation'
// ── Design system (Tailwind v4) ───────────────────────────────────────────────
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { CommandPalette, type Command } from './CommandPalette'

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

// Paleta de marca ChatEAM — ahora vive en los tokens del design system
// (`--brand-teal`, `--brand-cyan`, `--brand-coral` en src/tailwind.css). Aquí sólo
// quedan las medidas del sidebar, que se reflejan en las clases `w-[260px]` /
// `md:w-[68px]` del <nav> (Tailwind no admite clases dinámicas).
const SIDEBAR_WIDTH_EXPANDED = 260 // px — sidebar expandido (y drawer móvil)
const SIDEBAR_WIDTH_COLLAPSED = 68 // px — sidebar colapsado (sólo desktop)

// [Sin preflight] tailwind.css se importa sin el reset de Tailwind para coexistir
// con MUI Joy, así que <button>/<a> conservan los estilos por defecto del navegador.
// Estas dos constantes los neutralizan allí donde reemplazamos componentes MUI.
const BTN_RESET =
  'm-0 cursor-pointer appearance-none border-0 bg-transparent p-0 text-left [font-family:inherit] [color:inherit]'
const LINK_RESET = 'no-underline [color:inherit]'

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AppLayout({ children }: AppLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout, user } = useAuth()
  const { canAccess } = usePermissions()
  const { hasFeature } = usePlanFeatures()
  const { mode, systemMode, setMode } = useColorScheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false)
  const [switchingCompany, setSwitchingCompany] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [expandedMenus, setExpandedMenus] = useState<string[]>([])
  const [chatUnreads, setChatUnreads] = useState(0)
  const [tokenBalance, setTokenBalance] = useState<number | null>(null)
  const [activeSubplan, setActiveSubplan] = useState<{
    id: number
    name: string
    tokens: number
    tokensConsumed: number
    priceUsd: string | number
  } | null>(null)
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebarCollapsed') === 'true' } catch { return false }
  })

  const toggleSidebar = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('sidebarCollapsed', String(next))
  }

  // ─── Puente de tema Joy → Tailwind ──────────────────────────────────────────
  // El design system activa su paleta oscura con la clase `.dark` en <html>
  // (@custom-variant dark en tailwind.css), mientras que MUI Joy usa
  // data-joy-color-scheme. Espejamos el modo de Joy para que ambas capas
  // (shell Tailwind + pantallas MUI) cambien de tema a la vez.
  useEffect(() => {
    const resolved = mode === 'system' ? systemMode : mode
    document.documentElement.classList.toggle('dark', resolved === 'dark')
  }, [mode, systemMode])

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

  // ─── Tokens IA: balance + subplan activo (Company.aiTokenBalance + activeAISubplan)
  useEffect(() => {
    if (!user?.companyId) return

    const fetchTokens = async () => {
      try {
        const res = await api.get('/ai/subplan-purchase/token-info')
        const balance = Number(res.data?.tokenBalance ?? 0)
        setTokenBalance(Number.isFinite(balance) ? balance : 0)
        setActiveSubplan(res.data?.activeSubplan || null)
      } catch { /* silent — la app sigue funcionando sin chip visible */ }
    }

    fetchTokens()
    // Refresca cada 60s para reflejar consumo casi en tiempo real
    const interval = setInterval(fetchTokens, 60000)
    return () => clearInterval(interval)
  }, [user?.companyId])

  // Refresca tokens al recibir un evento de pago concluido (renueva ciclo)
  useEffect(() => {
    if (!user?.companyId) return
    const socket = socketService.getSocket()
    if (!socket) return
    const channel = `company-${user.companyId}-payment`
    const handler = () => {
      api.get('/ai/subplan-purchase/token-info')
        .then(res => {
          setTokenBalance(Number(res.data?.tokenBalance ?? 0))
          setActiveSubplan(res.data?.activeSubplan || null)
        })
        // Refresco de badge en segundo plano: no interrumpe al usuario, pero deja rastro en dev.
        .catch((err) => logger.warn('[AppLayout] no se pudo refrescar el saldo de tokens', err))
    }
    socket.on(channel, handler)
    return () => { socket.off(channel, handler) }
  }, [user?.companyId])

  useEffect(() => {
    if (!user?.companyId) return
    const socket = socketService.getSocket()
    if (!socket) return

    const channel = `company-${user.companyId}-chat`
    const handleUpdate = () => {
      api.get('/chats-total-unreads')
        .then(res => setChatUnreads(res.data.total || 0))
        .catch((err) => logger.warn('[AppLayout] no se pudo refrescar el contador de chats', err))
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
          .catch((err) => logger.warn('[AppLayout] no se pudo refrescar el contador de chats', err))
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
              path: '/kanban-lead-conversions',
              label: 'Leads Kanban',
              icon: <ReportIcon />,
              module: 'facebook_conversions',
            },
          ],
        },
        // {
        //   path: '/analytics',
        //   label: 'Analítica',
        //   icon: <AnalyticsIcon />,
        //   module: 'analytics',
        // },
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
          path: '/webchat/chats',
          label: 'Conversaciones Web',
          icon: <ChatBubbleIcon />,
          module: 'webchat_chats',
        },
        {
          path: '/schedules',
          label: 'Mensajes Programados',
          icon: <CalendarIcon />,
          module: 'schedules',
          planFeature: 'schedules',
        },

      ],
    },
    {
      key: 'clasificacion',
      title: 'ORGANIZACIÓN',
      items: [
        {
          path: '/customer-origins',
          label: 'Origen de Clientes',
          icon: <SourceIcon />,
          module: 'customer_origins',
        },
        {
          path: '/queues',
          label: 'Colas',
          icon: <QueueIcon />,
          module: 'queues',
        },
        {
          path: '/tags',
          label: 'Etiquetas',
          icon: <TagIcon />,
          module: 'tags',
        },
        {
          path: '/automation-rules',
          label: 'Automatizaciones',
          icon: <AIIcon />,
          module: 'settings',
        },
        {
          path: '/funnel',
          label: 'Funnel de Ventas',
          icon: <KanbanIcon />,
          module: 'kanban',
          planFeature: 'kanban',
        },
        // {
        //   path: '/kanban-dashboard',
        //   label: 'Dashboard Kanban',
        //   icon: <ReportIcon />,
        //   module: 'kanban',
        //   planFeature: 'kanban',
        // },
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
              path: '/whatsapp/templates',
              label: 'Plantillas',
              icon: <MessageIcon />,
              module: 'whatsapp_templates',
            },
            // {
            //   path: '/migration',
            //   label: 'Migrar a Meta',
            //   icon: <MigrationIcon />,
            //   module: 'migration',
            // },
            // {
            //   path: '/tiktok-connections',
            //   label: 'TikTok Comments',
            //   icon: <MusicNoteIcon />,
            //   module: 'connections',
            // },
          ],
        },
        {
          path: '/social-comments-group',
          label: 'Comentarios FB/IG',
          icon: <CommentsInboxIcon />,
          module: 'social_comments' as Module,
          children: [
            {
              path: '/social-comments',
              label: 'Bandeja',
              icon: <CommentsInboxIcon />,
              module: 'social_comments' as Module,
            },
            {
              path: '/moderation',
              label: 'Moderación',
              icon: <CommentsInboxIcon />,
              module: 'social_comments' as Module,
            },
            {
              path: '/social-comments/settings',
              label: 'Configuracion',
              icon: <SettingsIcon />,
              module: 'social_comments' as Module,
            },
          ],
        },
        /* Sección "WhatsApp API" OCULTA (2026-07-07, a pedido). "Plantillas" se movió
           a Conexiones (arriba). Las rutas siguen activas en App.tsx; para reactivar
           el menú, descomentar este bloque.
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
        */
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
            /* "Conversaciones" movido a OPERATIVO como "Conversaciones Web".
               "Analytics" e "Historial" ocultos (2026-07-07, a pedido). Las rutas
               siguen activas en App.tsx; para reactivar en el menú, descomentar.
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
            */
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
            // {
            //   path: '/campaigns/ai',
            //   label: 'IA de Campañas',
            //   icon: <CampaignAIIcon />,
            //   module: 'campaigns_ai',
            // },
            // {
            //   path: '/campaigns/rules',
            //   label: 'Reglas',
            //   icon: <CampaignRulesIcon />,
            //   module: 'campaigns_rules',
            // },
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
              path: '/ugc/model-selector',
              label: 'Elegir Modelos',
              icon: <AIIcon />,
              module: 'ugc_campaigns',
            },
            {
              path: '/ugc/generate',
              label: 'Cinema Studio',
              icon: <AIIcon />,
              module: 'ugc_video_studio',
            },
            {
              path: '/ugc/video-studio',
              label: 'Video Studio',
              icon: <VideoLibraryIcon />,
              module: 'ugc_video_studio',
            },
            {
              path: '/ugc/optimization',
              label: 'Optimización IA',
              icon: <OptimizeIcon />,
              module: 'ugc_optimization',
              roles: ['super'],
            },
            {
              path: '/ugc/settings',
              label: 'Configuración',
              icon: <SettingsIcon />,
              module: 'ugc_settings',
              roles: ['super'],
            },
            {
              path: '/ugc/social-posts',
              label: 'Posts Programados',
              icon: <CampaignIcon />,
              module: 'ugc_social_posts',
              roles: ['super'],
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
      title: 'CITAS Y FLUJOS',
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
            // {
            //   path: '/flowbuilder',
            //   label: 'Editor',
            //   icon: <FlowbuilderIcon />,
            //   module: 'flowbuilder',
            // },
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
        // {
        //   path: '/integrations',
        //   label: 'Integraciones',
        //   icon: <IntegrationsIcon />,
        //   module: 'integrations',
        //   planFeature: 'integrations',
        // },
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
              roles: ['super'],
            },
            {
              path: '/affiliates/programs',
              label: 'Programas',
              icon: <AffiliatesIcon />,
              module: 'affiliate_programs' as Module,
              roles: ['super'],
            },
            {
              path: '/affiliates/referrals',
              label: 'Referidos',
              icon: <AffiliatesIcon />,
              module: 'affiliate_referrals' as Module,
            },
            {
              path: '/affiliates/links',
              label: 'Links',
              icon: <ConnectionsIcon />,
              module: 'affiliate_links' as Module,
            },
            {
              path: '/affiliates/wallet',
              label: 'Recompensas',
              icon: <FinancialIcon />,
              module: 'affiliate_wallet' as Module,
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
              path: '/stats/recommendations',
              label: 'Recomendaciones',
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
            // {
            //   path: '/ai/chatbot-builder',
            //   label: 'Chatbot Builder',
            //   icon: <ChatbotIcon />,
            //   module: 'ai_chatbot_builder',
            // },
            // {
            //   path: '/ai/scheduler',
            //   label: 'Pipeline con Agentes IA',
            //   icon: <DataIcon />,
            //   module: 'ai_scheduler',
            // },
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
            // {
            //   path: '/ai-image-generation',
            //   label: 'Generar Imágenes',
            //   icon: <ImageIcon />,
            //   module: 'ai_image_generation',
            // },
            // {
            //   path: '/ai-video-generation',
            //   label: 'Generar Videos',
            //   icon: <VideocamIcon />,
            //   module: 'ai_video_generation',
            // },
            // {
            //   path: '/ai/audio',
            //   label: 'Audio IA',
            //   icon: <AudioIcon />,
            //   module: 'ai_audio',
            // },
            // {
            //   path: '/ai/multimodal',
            //   label: 'Multimodal',
            //   icon: <MultimodalIcon />,
            //   module: 'ai_multimodal',
            // },
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
            // {
            //   path: '/ai/ab-testing',
            //   label: 'A/B Testing',
            //   icon: <ABTestingIcon />,
            //   module: 'ai_ab_testing',
            // },
            // {
            //   path: '/ai/observability',
            //   label: 'Observabilidad',
            //   icon: <ObservabilityIcon />,
            //   module: 'ai_observability',
            // },
            // {
            //   path: '/ai/fine-tuning',
            //   label: 'Fine-tuning',
            //   icon: <FineTuningIcon />,
            //   module: 'ai_fine_tuning',
            // },
            {
              path: '/ai/credits',
              label: 'Paquetes Créditos',
              icon: <CreditPacksIcon />,
              module: 'ai_credits',
            },
            // {
            //   path: '/prompts',
            //   label: 'Prompts',
            //   icon: <PromptsIcon />,
            //   module: 'prompts',
            // },
            // {
            //   path: '/ai/heygen',
            //   label: 'HeyGen Video',
            //   icon: <HeyGenIcon />,
            //   module: 'ai_heygen',
            // },
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
              // Sprint 1 (2026-05-20) — Revisión humana de correcciones
              path: '/ai/correction-review',
              label: 'Revisión Correcciones',
              icon: <CorrectionReviewIcon />,
              module: 'ai_correction_review',
            },
            // {
            //   path: '/ai-usage',
            //   label: 'Mi Consumo IA',
            //   icon: <CreditPacksIcon />,
            //   module: 'openai_dashboard',
            // },
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
          path: '/roles-management',
          label: 'Roles y Usuarios',
          icon: <UsersIcon />,
          module: 'users',
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
      ],
    },
    {
      key: 'sistema',
      title: 'PLATAFORMA',
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
              path: '/permissions-manager',
              label: 'Permisos',
              icon: <PermissionsIcon />,
              module: 'permissions_manager',
              roles: ['super'],
            },
            {
              // Pantalla super de aprobación de pagos offline (Invoices.tsx / GET /recepts).
              // Existía la página + backend isSuper, pero faltaba el ítem en el menú (huérfano).
              path: '/invoices',
              label: 'Comprobantes de Pago',
              icon: <ReceiptIcon />,
              // Sin `module` (patrón de ai-token-usage): el módulo 'invoices' está en false para
              // no-super, y canAccess lo gatearía. roles:['super'] basta; backend enforcea isSuper.
              roles: ['super'],
            },
            {
              path: '/admin/ai-token-usage',
              label: 'Consumo Tokens IA',
              icon: <DataIcon />,
              roles: ['super'],
            },
            {
              // Comunicados masivos del super (banner in-app a todas/una empresa).
              path: '/admin/comunicados',
              label: 'Comunicados',
              icon: <CampaignIcon />,
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
      const profile = user?.profile?.toLowerCase()
      const allowedBySuper = item.roles.includes('super') && user?.super === true
      const nonSuperRoles = item.roles.filter((role) => role !== 'super')
      const allowedByProfile = profile ? nonSuperRoles.includes(profile) : false
      if (!allowedBySuper && !allowedByProfile) return null
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

  const rawSections: MenuSection[] = menuSections
    .map((section) => ({
      ...section,
      items: section.items.map(filterItem).filter((i): i is MenuItemDef => i !== null),
    }))
    .filter((section) => section.items.length > 0)

  // ─── Vista según rol/impersonación ──────────────────────────────────────────
  // - Super (fuera de impersonación): menú COMPLETO (PLATAFORMA + operación).
  //   Como es super, hasFeature() bypassa el plan y ve todas las secciones.
  // - Super dentro de una empresa (impersonando): vista operativa limpia, sin
  //   la sección PLATAFORMA (no se gestionan otras empresas desde adentro).
  // - Resto de perfiles: su menú normal.
  const isImpersonatingView = user?.impersonating === true
  const visibleSections: MenuSection[] =
    user?.super === true && !isImpersonatingView
      ? rawSections.filter((s) => s.title === 'PLATAFORMA')
      : isImpersonatingView
        ? rawSections.filter((s) => s.title !== 'PLATAFORMA')
        : rawSections

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

  // ─── Command palette (⌘K) — N2.3: válvula de escape sobre TODAS las rutas visibles ──────
  const commands: Command[] = visibleSections.flatMap((section) =>
    section.items.flatMap((item): Command[] => {
      const self = item.path ? [{ label: item.label, path: item.path, section: section.title }] : []
      const kids = (item.children || []).map((c) => ({
        label: c.label,
        path: c.path,
        section: section.title,
      }))
      return [...self, ...kids]
    }),
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    // Coincidencia exacta o por segmento completo (evita que /tagsKanban
    // active /tags, o /campaigns-x active /campaigns).
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }
  // ─── Render Menu Item ────────────────────────────────────────────────────────
  //
  // El colapso es CSS-only (`md:` + `collapsed`) en vez de renderizado
  // condicional: así el drawer móvil siempre muestra las etiquetas aunque el
  // sidebar de desktop esté colapsado, y el ancho anima sin desmontar el árbol.

  const renderMenuItemDef = (item: MenuItemDef, depth = 0) => {
    const hasChildren = item.children && item.children.length > 0
    const isExpanded = expandedMenus.includes(item.path)
    const active = isActive(item.path) && !hasChildren

    // Destino del enlace: para padres expandibles apunta al primer hijo
    // (coherente con el modo colapsado), para hojas a su propia ruta.
    const linkTo = hasChildren ? item.children![0].path : item.path

    return (
      <div key={item.path} className="mb-0.5">
        <RouterLink
          to={linkTo}
          title={collapsed ? item.label : undefined}
          aria-current={active ? 'page' : undefined}
          aria-expanded={hasChildren && !collapsed ? isExpanded : undefined}
          onClick={(e: ReactMouseEvent<HTMLAnchorElement>) => {
            // Ctrl/Cmd/Shift → dejar que el navegador abra en una pestaña nueva
            if (e.metaKey || e.ctrlKey || e.shiftKey) return
            if (hasChildren && !collapsed) {
              // Padre expandible: no navegar, sólo alternar el submenú
              e.preventDefault()
              toggleMenu(item.path)
              return
            }
            // Navegación SPA la realiza RouterLink; sólo cerramos el menú en móvil
            if (mobileOpen) setMobileOpen(false)
          }}
          className={cn(
            LINK_RESET,
            'group relative flex w-full items-center rounded-md transition-colors duration-150 outline-none',
            'focus-visible:ring-2 focus-visible:ring-brand-cyan/60',
            depth > 0
              ? 'min-h-9 pr-3 pl-7 text-[clamp(0.75rem,0.72rem+0.12vw,0.8125rem)]'
              : 'min-h-10 px-3 text-[clamp(0.8125rem,0.78rem+0.15vw,0.875rem)]',
            collapsed && 'md:justify-center md:px-0',
            active
              ? "bg-white/10 font-semibold text-brand-cyan before:absolute before:top-1/2 before:left-0 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r-full before:bg-brand-cyan before:content-['']"
              : 'font-normal text-white/70 hover:bg-white/5 hover:text-white',
          )}
        >
          {/* Icono (@mui/icons-material). `!` fuerza el tamaño sobre los estilos
              sin capa de emotion, que de otro modo ganarían a las utilidades. */}
          <span
            className={cn(
              'flex shrink-0 items-center transition-colors',
              collapsed ? 'mr-3 md:mr-0' : 'mr-3',
              depth > 0 ? '[&>svg]:text-[18px]!' : '[&>svg]:text-[20px]!',
              active ? 'text-brand-cyan' : 'text-white/50 group-hover:text-white',
            )}
          >
            {item.icon}
          </span>

          <span
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2',
              collapsed && 'md:hidden',
            )}
          >
            <span className="truncate">{item.label}</span>
            {item.badge !== undefined && (
              <span className="shrink-0 rounded-full bg-brand-coral px-1.5 py-0.5 text-[10px] leading-none font-bold text-white tabular-nums">
                {item.badge}
              </span>
            )}
          </span>

          {hasChildren && (
            <span
              className={cn(
                'ml-auto flex shrink-0 items-center text-white/40 transition-transform duration-200 [&>svg]:text-[18px]!',
                isExpanded && 'rotate-180',
                collapsed && 'md:hidden',
              )}
            >
              <ExpandMoreIcon />
            </span>
          )}
        </RouterLink>

        {hasChildren && (
          <div
            className={cn(
              'overflow-hidden pl-1 transition-[max-height,opacity] duration-300 ease-in-out',
              isExpanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0',
              collapsed && 'md:hidden',
            )}
          >
            {item.children!.map((child) => renderMenuItemDef(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  // ─── Sidebar Content ─────────────────────────────────────────────────────────

  const sidebarContent = (
    <>
      {/* ── Header ── */}
      <div
        className={cn(
          'flex h-16 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4',
          collapsed && 'md:justify-center md:px-2',
        )}
      >
        {/* Logo completo — siempre en móvil; en desktop se oculta al colapsar */}
        <div className={cn('flex min-w-0 flex-1 items-center', collapsed && 'md:hidden')}>
          <div className="flex w-full items-center justify-center rounded-md bg-white px-3 py-1.5 shadow-[0_1px_4px_rgba(0,0,0,0.18)]">
            <img
              src="/logo-chateam.svg"
              alt="ChatEAM"
              className="block h-[clamp(1.75rem,2.5vw,2.25rem)] w-full max-w-[180px] object-contain"
            />
          </div>
        </div>

        {/* Logo compacto = botón "expandir" (sólo desktop colapsado) */}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Expandir menú"
          aria-pressed={collapsed}
          title="Expandir menú"
          className={cn(
            BTN_RESET,
            'hidden size-9 items-center justify-center rounded-md transition-colors hover:bg-white/10',
            'focus-visible:ring-2 focus-visible:ring-brand-cyan/60',
            collapsed && 'md:flex',
          )}
        >
          <img src="/logo.png" alt="ChatEAM" className="size-8 rounded-full" />
        </button>

        {/* Colapsar (sólo desktop expandido) */}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Colapsar menú"
          aria-pressed={collapsed}
          title="Colapsar menú"
          className={cn(
            BTN_RESET,
            'hidden size-8 shrink-0 items-center justify-center rounded-md bg-black/20 text-white/80 transition-colors hover:bg-black/35 hover:text-white md:flex',
            'focus-visible:ring-2 focus-visible:ring-brand-cyan/60 [&>svg]:text-[18px]!',
            collapsed && 'md:hidden',
          )}
        >
          <ChevronLeftIcon />
        </button>

        {/* Cerrar drawer (sólo móvil) */}
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Cerrar menú"
          className={cn(
            BTN_RESET,
            'flex size-8 shrink-0 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white md:hidden',
            'focus-visible:ring-2 focus-visible:ring-brand-cyan/60 [&>svg]:text-[20px]!',
          )}
        >
          <CloseIcon />
        </button>
      </div>

      {/* ── Menu Sections ── */}
      <div
        className={cn(
          'flex-1 overflow-x-hidden overflow-y-auto px-3 pt-1 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          collapsed && 'md:px-2',
        )}
      >
        {visibleSections.map((section, sectionIdx) => (
          <div key={section.key} className="mt-4 mb-1 first:mt-1">
            {/* Separador — sustituye al título cuando el sidebar está colapsado */}
            {sectionIdx > 0 && (
              <div
                className={cn('hidden h-px bg-white/10', collapsed && 'md:my-2 md:block')}
                aria-hidden
              />
            )}
            <p
              className={cn(
                // [a11y] /35 daba contraste 2.43 sobre el teal (#005166) — WCAG AA pide 4.5.
                'm-0 px-3 pb-1.5 text-[10px] font-bold tracking-[0.14em] text-white/70 uppercase',
                collapsed && 'md:hidden',
              )}
            >
              {section.title}
            </p>
            <div>{section.items.map((item) => renderMenuItemDef(item))}</div>
          </div>
        ))}
      </div>

      {/* Footer eliminado — usuario ya visible en TopBar */}
    </>
  )

  // ─── Top Header Bar ──────────────────────────────────────────────────────────

  const iconBtnClass = cn(
    BTN_RESET,
    'relative flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
    'focus-visible:ring-2 focus-visible:ring-ring',
  )

  const topBar = (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-[#D3F8F8] px-[clamp(0.75rem,2vw,1.5rem)] text-foreground dark:bg-card">
      {/* Hamburger — mobile only */}
      <button
        type="button"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Abrir menú"
        aria-expanded={mobileOpen}
        className={cn(iconBtnClass, '[&>svg]:text-[22px]! md:hidden')}
      >
        <MenuIcon />
      </button>

      {/* [Multi-empresa] Selector de empresa activa — solo si el usuario tiene
          >1 membresía y NO está impersonando (ahí manda el banner de impersonación). */}
      {!isImpersonatingView && (user?.memberships?.length ?? 0) > 1 && (() => {
        const current = user!.memberships!.find((m) => m.isCurrent)
        const currentName = current?.companyName || user?.company?.name || 'Empresa'
        return (
          <div className="relative">
            <button
              type="button"
              onClick={() => setCompanyMenuOpen((o) => !o)}
              aria-haspopup="true"
              aria-expanded={companyMenuOpen}
              title="Cambiar de empresa"
              className={cn(
                BTN_RESET,
                'flex h-9 items-center gap-2 rounded-md border border-border bg-card/70 px-3 text-sm font-medium transition-colors hover:bg-accent',
              )}
            >
              <BusinessIcon fontSize="small" className="text-primary" />
              <span className="max-w-[160px] truncate">{currentName}</span>
              <ExpandMoreIcon
                fontSize="small"
                className={cn('transition-transform', companyMenuOpen && 'rotate-180')}
              />
            </button>
            {companyMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setCompanyMenuOpen(false)} />
                <div className="absolute left-0 top-full z-50 mt-1 min-w-[240px] rounded-md border border-border bg-card p-1 shadow-lg">
                  <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Cambiar de empresa
                  </p>
                  {user!.memberships!.map((m) => (
                    <button
                      key={m.companyId}
                      type="button"
                      disabled={m.isCurrent || switchingCompany}
                      onClick={async () => {
                        if (m.isCurrent) return
                        setSwitchingCompany(true)
                        try {
                          await switchCompany(m.companyId)
                        } catch {
                          setSwitchingCompany(false)
                        }
                      }}
                      className={cn(
                        BTN_RESET,
                        'flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent disabled:cursor-default',
                        m.isCurrent && 'bg-accent/50',
                      )}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <BusinessIcon fontSize="small" className="shrink-0 text-muted-foreground" />
                        <span className="truncate">{m.companyName || `Empresa ${m.companyId}`}</span>
                      </span>
                      {m.isCurrent ? (
                        <span className="shrink-0 text-xs font-medium text-primary">Actual</span>
                      ) : (
                        <span className="shrink-0 text-xs capitalize text-muted-foreground">
                          {m.profile}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )
      })()}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Plan contratado por la company */}
      {user?.company?.plan?.name && (() => {
        const plan = user.company.plan as any
        const recurrence = (user.company as any).recurrence
        const tooltipTitle = plan.amount
          ? `$${Number(plan.amount).toFixed(2)}${recurrence ? ` (${recurrence})` : ''}`
          : user.company.plan.name
        return (
          <Badge
            variant="primary"
            title={tooltipTitle}
            className="hidden h-8 max-w-[220px] gap-1.5 px-3 font-semibold md:inline-flex"
          >
            <span className="text-foreground/90">Plan:</span>
            <span className="truncate">{user.company.plan.name}</span>
          </Badge>
        )
      })()}

      {/* Subplan IA activo + balance de tokens (Company.aiTokenBalance + activeAISubplan) */}
      {tokenBalance !== null && (() => {
        const remaining = tokenBalance
        // Total de referencia para color: tokens del subplan activo si existe; si no, sin ratio
        const subplanTotal = activeSubplan?.tokens ? Number(activeSubplan.tokens) : 0
        const ratio = subplanTotal > 0 ? remaining / subplanTotal : 1
        let chipColor: 'danger' | 'warning' | 'success' = 'success'
        if (remaining <= 0) chipColor = 'danger'
        else if (subplanTotal > 0 && ratio < 0.15) chipColor = 'warning'
        const fmt = (n: number) => Number(n).toLocaleString('es-ES')
        const tooltipMsg = subplanTotal > 0
          ? `${fmt(remaining)} de ${fmt(subplanTotal)} tokens disponibles${activeSubplan?.name ? ` · Subplan: ${activeSubplan.name}` : ''}`
          : `${fmt(remaining)} tokens IA disponibles${activeSubplan?.name ? ` · Subplan: ${activeSubplan.name}` : ' · Sin subplan activo'}`
        return (
          <button
            type="button"
            onClick={() => navigate('/ai/subplans')}
            title={tooltipMsg}
            aria-label={tooltipMsg}
            className={cn(
              BTN_RESET,
              'hidden rounded-full focus-visible:ring-2 focus-visible:ring-ring md:block',
            )}
          >
            <Badge
              variant={chipColor === 'danger' ? 'destructive' : chipColor}
              className="h-8 gap-1.5 px-3 font-semibold"
            >
              <span className="text-muted-foreground">Tokens IA:</span>
              <span className="tabular-nums">{fmt(remaining)}</span>
            </Badge>
          </button>
        )
      })()}

      {/* Fecha de vencimiento de la company (dueDate) */}
      {user?.company?.dueDate && (() => {
        const due = new Date(user.company.dueDate)
        if (isNaN(due.getTime())) return null
        const today = new Date()
        const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        let chipColor: 'danger' | 'warning' | 'success' = 'success'
        if (diffDays < 0) chipColor = 'danger'
        else if (diffDays <= 7) chipColor = 'warning'
        const fechaFmt = due.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
        const tooltipMsg = diffDays < 0
          ? `Vencido hace ${Math.abs(diffDays)} día${Math.abs(diffDays) === 1 ? '' : 's'}`
          : diffDays === 0
            ? 'Vence hoy'
            : `Vence en ${diffDays} día${diffDays === 1 ? '' : 's'}`
        return (
          <Badge
            variant={chipColor === 'danger' ? 'destructive' : chipColor}
            title={tooltipMsg}
            className="hidden h-8 gap-1.5 px-3 font-semibold lg:inline-flex"
          >
            <span className="text-muted-foreground">Vencimiento:</span>
            <span className="tabular-nums">{fechaFmt}</span>
          </Badge>
        )
      })()}

      {/* Notifications bell con badge realtime */}
      <NotificationBell />

      {/* Dark mode toggle */}
      <button
        type="button"
        onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
        aria-label={mode === 'light' ? 'Modo oscuro' : 'Modo claro'}
        title={mode === 'light' ? 'Modo oscuro' : 'Modo claro'}
        className={cn(iconBtnClass, '[&>svg]:text-[20px]!')}
      >
        {mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
      </button>

      {/* User dropdown */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setUserMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={userMenuOpen}
          aria-label="Menú de usuario"
          className={cn(
            BTN_RESET,
            'flex items-center gap-2 rounded-full py-1 pr-2 pl-1 transition-colors hover:bg-accent',
            'focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          {user?.profileImage ? (
            <img
              src={user.profileImage}
              alt=""
              className="size-8 shrink-0 rounded-full object-cover"
            />
          ) : (
            <Avatar name={user?.name || 'Administrador'} size="sm" />
          )}
          <span className="hidden text-left leading-tight sm:block">
            <span className="block truncate text-sm font-semibold text-foreground">
              {user?.name || 'Administrador'}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {user?.profile || 'admin'}
            </span>
          </span>
          <span
            className={cn(
              'hidden text-muted-foreground transition-transform sm:flex [&>svg]:text-[16px]!',
              userMenuOpen && 'rotate-180',
            )}
          >
            <ExpandMoreIcon />
          </span>
        </button>

        {userMenuOpen && (
          <>
            {/* Click-outside catcher */}
            <div
              aria-hidden
              onClick={() => setUserMenuOpen(false)}
              className="fixed inset-0 z-40 cursor-default"
            />
            <div
              role="menu"
              className="absolute top-[calc(100%+8px)] right-0 z-50 min-w-[220px] overflow-hidden rounded-lg border border-border bg-popover py-1.5 shadow-lg shadow-black/5"
            >
              {[
                { label: 'Mi Perfil', icon: <ProfileIcon />, path: '/profile' },
                { label: 'Notificaciones', icon: <NotificationsIcon />, path: '/notifications' },
              ].map((mi) => (
                <button
                  key={mi.path}
                  role="menuitem"
                  type="button"
                  onClick={() => { setUserMenuOpen(false); handleNavigate(mi.path) }}
                  className={cn(
                    BTN_RESET,
                    'flex w-full items-center gap-3 px-3.5 py-2 text-sm text-popover-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
                    '[&>svg]:text-[18px]! [&>svg]:text-muted-foreground',
                  )}
                >
                  {mi.icon}
                  {mi.label}
                </button>
              ))}
              <div className="my-1 h-px bg-border" aria-hidden />
              {[
                { label: 'Ayuda', icon: <HelpIcon />, path: '/help' },
                { label: 'Feedback', icon: <FeedbackIcon />, path: '/feedback' },
              ].map((mi) => (
                <button
                  key={mi.path}
                  role="menuitem"
                  type="button"
                  onClick={() => { setUserMenuOpen(false); handleNavigate(mi.path) }}
                  className={cn(
                    BTN_RESET,
                    'flex w-full items-center gap-3 px-3.5 py-2 text-sm text-popover-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
                    '[&>svg]:text-[18px]! [&>svg]:text-muted-foreground',
                  )}
                >
                  {mi.icon}
                  {mi.label}
                </button>
              ))}
              <div className="my-1 h-px bg-border" aria-hidden />
              <button
                role="menuitem"
                type="button"
                onClick={() => { setUserMenuOpen(false); handleLogout() }}
                className={cn(
                  BTN_RESET,
                  'flex w-full items-center gap-3 px-3.5 py-2 text-sm text-destructive-text transition-colors hover:bg-destructive/10',
                  '[&>svg]:text-[18px]!',
                )}
              >
                <LogoutIcon />
                Cerrar Sesión
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )

  // ─── Layout ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background text-foreground">
      {/* [Fase C a11y] Skip link (WCAG 2.4.1 Bypass Blocks) — primer focusable, salta al contenido */}
      <a
        href="#main-content"
        className={cn(
          LINK_RESET,
          'fixed top-2 left-2 z-[9999] -translate-y-[200%] rounded-md bg-primary px-4 py-2 text-primary-foreground transition-transform duration-150 focus:translate-y-0',
        )}
      >
        Saltar al contenido
      </a>

      {/* Backdrop del drawer móvil */}
      <div
        aria-hidden
        onClick={() => setMobileOpen(false)}
        className={cn(
          'fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 md:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      {/* Sidebar — off-canvas en móvil (cerrado por defecto), estático y colapsable en desktop.
          Anchos: SIDEBAR_WIDTH_EXPANDED (260) / SIDEBAR_WIDTH_COLLAPSED (68). */}
      <nav
        aria-label="Navegación principal"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[260px] shrink-0 flex-col overflow-hidden bg-brand-teal text-white shadow-[2px_0_8px_rgba(0,0,0,0.15)]',
          'transition-[transform,width] duration-200 ease-in-out md:static md:z-auto md:h-full md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          collapsed && 'md:w-[68px]',
        )}
      >
        {sidebarContent}
      </nav>

      {/* Right Column: TopBar + Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {topBar}

        {/* Banner de impersonación: el super está operando DENTRO de una empresa.
            Visible en todas las vistas mientras dure la sesión de impersonación. */}
        {isImpersonatingView && (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-amber-300 bg-amber-100 px-[clamp(0.75rem,2vw,1.5rem)] py-2 text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ObservabilityIcon fontSize="small" />
              <span>
                Estás dentro de{' '}
                <strong>{user?.impersonatedCompanyName || 'la empresa'}</strong>{' '}
                en modo administrador (impersonación).
              </span>
            </div>
            <button
              type="button"
              onClick={() => exitCompany()}
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1"
            >
              <LogoutIcon fontSize="small" />
              Salir de la empresa
            </button>
          </div>
        )}

        <main
          id="main-content"
          tabIndex={-1}
          className="@container min-h-0 flex-1 overflow-y-auto bg-background p-[clamp(0.75rem,1.5vw,1.5rem)] outline-none"
        >
          <AnnouncementBanner />
          {children}
        </main>
      </div>

      {/* ⌘K / Ctrl+K — válvula de escape universal sobre las rutas visibles (N2.3) */}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        commands={commands}
        onSelect={handleNavigate}
      />
    </div>
  )
}
