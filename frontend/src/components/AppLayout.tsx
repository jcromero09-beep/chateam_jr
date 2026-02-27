import { ReactNode, useState } from 'react'
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
  Close as CloseIcon,
  LightMode as LightModeIcon,
  DarkMode as DarkModeIcon,
  ExpandMore as ExpandMoreIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  TrendingUp as TrendingUpIcon,
  Attribution as AttributionIcon,
  SmartToy as SmartToyIcon,
  Groups as _GroupsIcon,
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
  Announcement as AnnouncementIcon,
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
  Notifications as _NotificationsIcon,
  ChatBubble as ChatBubbleIcon,
  History as HistoryIcon,
  EventNote as EventNoteIcon,
  MedicalServices as ServicesIcon,
  Schedule as ScheduleIcon,
  EventAvailable as EventAvailableIcon,
  NotificationsActive as RemindersIcon,
  Assessment as ReportsIcon,
  WhatsApp as WhatsAppIcon,
  Phone as PhoneIcon,
  Message as MessageIcon,
  SendToMobile as SendIcon,
  Webhook as WebhookIcon,
  Science as ScienceIcon,
  CloudSync as CloudSyncIcon,
  LocalShipping as ShippingIcon,
  FindInPage as LogsIcon,
  Build as BuildIcon,
  AutoAwesome as AIIcon,
  DataObject as DataIcon,
  AdminPanelSettings as PermissionsIcon,
  Security as SecurityIcon,
  Image as ImageIcon,
  Videocam as VideocamIcon,
  CreditCard as CreditCardIcon,
  Facebook as FacebookIcon,
} from '@mui/icons-material'
import { useAuth } from '../hooks/useAuth'
import { usePermissions } from '../hooks/usePermissions'
import { usePlanFeatures, PlanFeature } from '../hooks/usePlanFeatures'
import { Module } from '../utils/permissions'

interface MenuItem {
  path: string
  label: string
  icon: ReactNode
  badge?: number
  children?: MenuItem[]
  module?: Module
  planFeature?: PlanFeature // Característica del plan requerida
  roles?: string[] // Roles permitidos para ver este item
}

interface AppLayoutProps {
  children: ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout, user } = useAuth()
  const { canAccess } = usePermissions()
  const { hasFeature } = usePlanFeatures()
  const { mode, setMode } = useColorScheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [expandedMenus, setExpandedMenus] = useState<string[]>([])
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebarCollapsed') === 'true' } catch { return false }
  })

  const sidebarWidth = collapsed ? 68 : 280

  const toggleSidebar = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('sidebarCollapsed', String(next))
  }

  const allMenuItems: MenuItem[] = [
    // GESTIÓN (Submenú)
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
        // {
        //   path: '/reports',
        //   label: 'Reportes',
        //   icon: <ReportIcon />,
        //   module: 'reports',
        // },
        // {
        //   path: '/realtime-chats',
        //   label: 'Chats en Tiempo Real',
        //   icon: <ChatIcon />,
        //   module: 'realtime_chats',
        // },
      ],
    },

    // OPERATIVO
    {
      path: '/tickets',
      label: 'Tickets',
      icon: <TicketIcon />,
      module: 'tickets',
    },
    {
      path: '/quick-replies',
      label: 'Mensajes Rápidos',
      icon: <QuickRepliesIcon />,
      module: 'quick_replies',
    },
    {
      path: '/kanban',
      label: 'Funnel de Ventas (Kanban)',
      icon: <KanbanIcon />,
      module: 'kanban',
      planFeature: 'kanban',
    },
    {
      path: '/contacts',
      label: 'Contactos',
      icon: <ContactsIcon />,
      module: 'contacts',
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
    {
      path: '/internal-chats',
      label: 'Chats Internos',
      icon: <InternalChatIcon />,
      module: 'internal_chats',
      planFeature: 'internalChat',
    },

    // ADMINISTRACIÓN (Requiere permisos)
    {
      path: '/campaigns',
      label: 'Campañas',
      icon: <CampaignIcon />,
      module: 'campaigns',
      planFeature: 'campaigns',
      children: [
        {
          path: '/campaigns',
          label: 'Lista',
          icon: <CampaignIcon />,
          module: 'campaigns',
        },
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
      ],
    },
    {
      path: '/marketing',
      label: 'Marketing',
      icon: <TrendingUpIcon />,
      module: 'marketing',
      planFeature: 'marketing',
      children: [
        {
          path: '/campaigns/insights',
          label: 'Insights & Analytics',
          icon: <TrendingUpIcon />,
          module: 'marketing_insights',
        },
        {
          path: '/campaigns/attribution',
          label: 'Atribución',
          icon: <AttributionIcon />,
          module: 'marketing_attribution',
        },
        {
          path: '/campaigns/audit',
          label: 'Auditoría IA',
          icon: <SmartToyIcon />,
          module: 'marketing_audit',
        },
        {
          path: '/facebook-conversions',
          label: 'Conversiones Facebook',
          icon: <FacebookIcon />,
          module: 'facebook_conversions',
        },
      ],
    },
    {
      path: '/email-marketing',
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
          label: 'Listas de Email',
          icon: <FolderIcon />,
          module: 'email_marketing_templates',
        },
        {
          path: '/email-marketing/plantillas',
          label: 'Plantillas',
          icon: <TermsIcon />,
          module: 'email_marketing_templates',
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
    {
      path: '/integrations',
      label: 'Integraciones',
      icon: <IntegrationsIcon />,
      module: 'integrations',
      planFeature: 'integrations',
    },
    {
      path: '/appointments',
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
          path: '/appointments',
          label: 'Gestión de Citas',
          icon: <CalendarIcon />,
          module: 'appointments',
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
          path: '/appointments/bookings',
          label: 'Reservas',
          icon: <EventAvailableIcon />,
          module: 'appointments_bookings',
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
        // {
        //   path: '/whatsapp/numbers',
        //   label: 'Números de Teléfono',
        //   icon: <PhoneIcon />,
        //   module: 'whatsapp_numbers',
        // },
        {
          path: '/whatsapp/templates',
          label: 'Plantillas de Mensajes',
          icon: <MessageIcon />,
          module: 'whatsapp_templates',
        },
        // {
        //   path: '/whatsapp/campaigns',
        //   label: 'Envío Masivo',
        //   icon: <SendIcon />,
        //   module: 'whatsapp_campaigns',
        // },
        // {
        //   path: '/whatsapp/webhooks',
        //   label: 'Webhooks',
        //   icon: <WebhookIcon />,
        //   module: 'whatsapp_webhooks',
        // },
        // {
        //   path: '/whatsapp/analytics',
        //   label: 'Analytics',
        //   icon: <AnalyticsIcon />,
        //   module: 'whatsapp_analytics',
        // },
        // {
        //   path: '/whatsapp/settings',
        //   label: 'Configuración API',
        //   icon: <SettingsIcon />,
        //   module: 'whatsapp_settings',
        // },
        // {
        //   path: '/whatsapp/tester',
        //   label: 'Testing',
        //   icon: <ScienceIcon />,
        //   module: 'whatsapp_tester',
        // },
        // {
        //   path: '/whatsapp/monitor',
        //   label: 'Sistema Anti-Bloqueos',
        //   icon: <SecurityIcon />,
        //   module: 'whatsapp_monitor',
        // },
      ],
    },
    {
      path: '/integrations-internal',
      label: 'Integraciones Internas',
      icon: <IntegrationsIcon />,
      module: 'integrations_dashboard',
      planFeature: 'integrations',
      children: [
        {
          path: '/integrations-internal/dashboard',
          label: 'Dashboard',
          icon: <DashboardIcon />,
          module: 'integrations_dashboard',
        },
        {
          path: '/integrations-internal/billie',
          label: 'Billie ERP',
          icon: <BusinessIcon />,
          module: 'integrations_billie',
        },
        {
          path: '/integrations-internal/aria-lite',
          label: 'Aria Lite CRM',
          icon: <CloudSyncIcon />,
          module: 'integrations_aria_lite',
        },
        {
          path: '/integrations-internal/smarttrack',
          label: 'SmartTrack',
          icon: <ShippingIcon />,
          module: 'integrations_smarttrack',
        },
        {
          path: '/integrations-internal/sgr',
          label: 'SGR Reclamos',
          icon: <ReportIcon />,
          module: 'integrations_sgr',
        },
        {
          path: '/integrations-internal/webhooks',
          label: 'Webhooks',
          icon: <WebhookIcon />,
          module: 'integrations_webhooks',
        },
        {
          path: '/integrations-internal/logs',
          label: 'Logs',
          icon: <LogsIcon />,
          module: 'integrations_logs',
        },
        {
          path: '/integrations-internal/settings',
          label: 'Configuración',
          icon: <SettingsIcon />,
          module: 'integrations_settings',
        },
        {
          path: '/integrations-internal/testing',
          label: 'Testing',
          icon: <BuildIcon />,
          module: 'integrations_testing',
        },
      ],
    },
    {
      path: '/openai',
      label: 'OpenAI Integration',
      icon: <AIIcon />,
      module: 'openai_dashboard',
      planFeature: 'openai',
      children: [
        {
          path: '/openai/dashboard',
          label: 'Dashboard',
          icon: <DashboardIcon />,
          module: 'openai_dashboard',
        },
        // {
        //   path: '/openai/prompts',
        //   label: 'Gestión de Prompts',
        //   icon: <PromptsIcon />,
        //   module: 'openai_prompts',
        // },
        {
          path: '/prompts',
          label: 'Prompts (OpenAI)',
          icon: <PromptsIcon />,
          module: 'prompts',
        },
        {
          path: '/openai/models',
          label: 'Configuración de Modelos',
          icon: <DataIcon />,
          module: 'openai_models',
          roles: ['super'], // Solo superadmin
        },
        // {
        //   path: '/openai/analytics',
        //   label: 'Analytics de IA',
        //   icon: <AnalyticsIcon />,
        //   module: 'openai_analytics',
        // },
        // {
        //   path: '/openai/testing',
        //   label: 'Testing de Prompts',
        //   icon: <ScienceIcon />,
        //   module: 'openai_testing',
        // },
        // {
        //   path: '/openai/templates',
        //   label: 'Templates de IA',
        //   icon: <FolderIcon />,
        //   module: 'openai_templates',
        // },
        {
          path: '/openai/settings',
          label: 'Configuración IA',
          icon: <SettingsIcon />,
          module: 'openai_settings',
          roles: ['super'], // Solo superadmin
        },
        {
          path: '/openai/history',
          label: 'Historial de Uso',
          icon: <HistoryIcon />,
          module: 'openai_history',
        },
        {
          path: '/ai-image-generation',
          label: 'Generación de Imágenes',
          icon: <ImageIcon />,
          module: 'ai_image_generation',
        },
        {
          path: '/ai-video-generation',
          label: 'Generación de Videos',
          icon: <VideocamIcon />,
          module: 'ai_video_generation',
        },
        {
          path: '/ai/subplans',
          label: 'Paquetes de Tokens',
          icon: <CreditCardIcon />,
          module: 'ai_subplans',
          roles: ['super'], // Solo superadmin
        },
        {
          path: '/permissions-manager',
          label: 'Gestión de Permisos',
          icon: <PermissionsIcon />,
          module: 'permissions_manager',
        },
      ],
    },
    {
      path: '/analytics',
      label: 'Analítica',
      icon: <AnalyticsIcon />,
      module: 'analytics',
    },
    {
      path: '/flowbuilder',
      label: 'Flowbuilder',
      icon: <FlowbuilderIcon />,
      module: 'flowbuilder',
      children: [
        {
          path: '/flowbuilder/campaign',
          label: 'Flujo de Campaña',
          icon: <CampaignIcon />,
          module: 'flowbuilder_campaign',
        },
        {
          path: '/flowbuilder/conversation',
          label: 'Flujo de Conversación',
          icon: <ChatIcon />,
          module: 'flowbuilder_conversation',
        },
      ],
    },
    {
      path: '/announcements',
      label: 'Anuncios',
      icon: <AnnouncementIcon />,
      module: 'announcements',
    },
    {
      path: '/api-messages',
      label: 'API de Mensajes',
      icon: <ApiIcon />,
      module: 'api_messages',
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

    {
      path: '/queue-integrations',
      label: 'Integraciones de Cola',
      icon: <IntegrationsIcon />,
      module: 'queue_integrations',
    },
    {
      path: '/connections',
      label: 'Conexiones',
      icon: <ConnectionsIcon />,
      module: 'connections',
    },
    {
      path: '/all-connections',
      label: 'Todas las Conexiones',
      icon: <ConnectionsIcon />,
      module: 'all_connections',
    },
    {
      path: '/invoices',
      label: 'Recibos',
      icon: <ReceiptIcon />,
      module: 'invoices',
    },
    {
      path: '/files',
      label: 'Archivos',
      icon: <FolderIcon />,
      module: 'files',
    },
    {
      path: '/financial',
      label: 'Financiero',
      icon: <FinancialIcon />,
      module: 'financial',
    },
    {
      path: '/billing',
      label: 'Facturación',
      icon: <ReceiptIcon />,
      module: 'billing',
    },
    {
      path: '/settings',
      label: 'Configuración',
      icon: <SettingsIcon />,
      module: 'settings',
    },
    {
      path: '/terms',
      label: 'Términos y Condiciones',
      icon: <TermsIcon />,
      module: 'terms',
    },
    {
      path: '/companies',
      label: 'Empresas',
      icon: <CompaniesIcon />,
      module: 'companies',
    },
    {
      path: '/plans',
      label: 'Planes',
      icon: <PlansIcon />,
      module: 'plans',
    },
  ]

  // Filtrar menú basado en permisos del usuario Y características del plan
  const menuItems = allMenuItems.filter((item) => {
    // Verificar rol del usuario
    if (item.roles) {
      // Si el rol requiere 'super', verificar el campo user.super
      if (item.roles.includes('super') && !user?.super) {
        return false
      }
      // Para otros roles, verificar contra user.profile
      const otherRoles = item.roles.filter(role => role !== 'super')
      if (otherRoles.length > 0 && user?.profile && !otherRoles.includes(user.profile)) {
        return false
      }
    }

    // Verificar permiso de módulo
    if (item.module && !canAccess(item.module)) return false

    // Verificar característica del plan
    if (item.planFeature && !hasFeature(item.planFeature)) return false

    // Si tiene hijos, filtrar también los hijos
    if (item.children) {
      item.children = item.children.filter((child) => {
        // Verificar rol en hijos también
        if (child.roles) {
          // Si el rol requiere 'super', verificar el campo user.super
          if (child.roles.includes('super') && !user?.super) {
            return false
          }
          // Para otros roles, verificar contra user.profile
          const otherRoles = child.roles.filter(role => role !== 'super')
          if (otherRoles.length > 0 && user?.profile && !otherRoles.includes(user.profile)) {
            return false
          }
        }
        if (child.module && !canAccess(child.module)) return false
        if (child.planFeature && !hasFeature(child.planFeature)) return false
        return true
      })
    }

    return true
  })

  const toggleMenu = (path: string) => {
    setExpandedMenus((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    )
  }

  const handleNavigate = (path: string) => {
    navigate(path)
    if (mobileOpen) setMobileOpen(false)
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const toggleTheme = () => {
    setMode(mode === 'light' ? 'dark' : 'light')
  }

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  const renderMenuItem = (item: MenuItem, depth = 0) => {
    const hasChildren = item.children && item.children.length > 0
    const isExpanded = expandedMenus.includes(item.path)
    const active = isActive(item.path)

    const button = (
      <ListItemButton
        selected={active && !hasChildren}
        onClick={() => {
          if (hasChildren) {
            if (collapsed) {
              // In collapsed mode, navigate to first child
              handleNavigate(item.children![0].path)
            } else {
              toggleMenu(item.path)
            }
          } else {
            handleNavigate(item.path)
          }
        }}
        sx={{
          pl: collapsed ? 0 : (depth > 0 ? 4 : 2),
          justifyContent: collapsed ? 'center' : 'flex-start',
          borderRadius: 'lg',
          minHeight: 40,
          transition: 'all 0.2s ease-in-out',
          '&.Mui-selected': {
            bgcolor: 'primary.500',
            color: 'white',
            '&:hover': {
              bgcolor: 'primary.600',
            },
            '& .MuiTypography-root': {
              color: 'white',
            },
            '& .MuiSvgIcon-root': {
              color: 'white',
            },
          },
        }}
      >
        <Box sx={{
          mr: collapsed ? 0 : 2,
          display: 'flex',
          alignItems: 'center',
          fontSize: 20,
        }}>
          {item.icon}
        </Box>
        {!collapsed && (
          <>
            <ListItemContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography level="body-sm">{item.label}</Typography>
                {item.badge && (
                  <Chip size="sm" color="danger" variant="solid">
                    {item.badge}
                  </Chip>
                )}
              </Box>
            </ListItemContent>
            {hasChildren && (
              <Box sx={{
                ml: 'auto',
                display: 'flex',
                transition: 'transform 0.3s ease-in-out',
                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              }}>
                <ExpandMoreIcon />
              </Box>
            )}
          </>
        )}
      </ListItemButton>
    )

    return (
      <Box key={item.path}>
        <ListItem>
          {collapsed ? (
            <Tooltip title={item.label} placement="right" arrow>
              {button}
            </Tooltip>
          ) : button}
        </ListItem>

        {!collapsed && hasChildren && (
          <Box
            sx={{
              maxHeight: isExpanded ? '500px' : '0px',
              opacity: isExpanded ? 1 : 0,
              overflow: 'hidden',
              transition: 'max-height 0.3s ease-in-out, opacity 0.25s ease-in-out',
            }}
          >
            <List sx={{ pl: 2 }}>
              {item.children!.map((child) => renderMenuItem(child, depth + 1))}
            </List>
          </Box>
        )}
      </Box>
    )
  }

  const sidebarContent = (
    <>
      <Box sx={{
        p: collapsed ? 1 : 2,
        display: 'flex',
        alignItems: 'center',
        gap: collapsed ? 0 : 2,
        justifyContent: collapsed ? 'center' : 'flex-start',
      }}>
        {collapsed ? (
          <Tooltip title="Expandir menú" placement="right" arrow>
            <IconButton
              size="sm"
              variant="plain"
              onClick={toggleSidebar}
            >
              <ChevronRightIcon />
            </IconButton>
          </Tooltip>
        ) : (
          <>
            <Avatar
              src={user?.profileImage}
              alt={user?.name}
              size="md"
            >
              {user?.name?.charAt(0) || 'U'}
            </Avatar>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography level="title-md" noWrap>
                JR Chateam
              </Typography>
              <Typography level="body-xs" noWrap sx={{ color: 'text.tertiary' }}>
                {user?.name || 'Usuario'}
              </Typography>
            </Box>
            <IconButton
              size="sm"
              variant="plain"
              onClick={toggleTheme}
            >
              {mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
            </IconButton>
            <Tooltip title="Colapsar menú" placement="bottom" arrow>
              <IconButton
                size="sm"
                variant="plain"
                onClick={toggleSidebar}
              >
                <ChevronLeftIcon />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Box>

      <Divider />

      <List sx={{ flexGrow: 1, gap: 0.5, p: collapsed ? 0.5 : 2, overflow: 'auto' }}>
        {menuItems.map((item) => renderMenuItem(item))}
      </List>

      <Divider />

      <Box sx={{ p: collapsed ? 0.5 : 2 }}>
        <Dropdown>
          <MenuButton
            variant="plain"
            size="sm"
            sx={{
              width: '100%',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: collapsed ? 0 : 2,
              p: collapsed ? 0.5 : 1.5,
              minWidth: 0,
            }}
          >
            <Avatar size="sm" src={user?.profileImage}>
              {user?.name?.charAt(0) || 'U'}
            </Avatar>
            {!collapsed && (
              <Box sx={{ flexGrow: 1, textAlign: 'left', minWidth: 0 }}>
                <Typography level="body-sm" noWrap>{user?.name || 'Usuario'}</Typography>
                <Typography level="body-xs" noWrap sx={{ color: 'text.tertiary' }}>
                  {user?.email || 'email@example.com'}
                </Typography>
              </Box>
            )}
          </MenuButton>
          <Menu placement="top-start">
            <MenuItem onClick={() => handleNavigate('/profile')}>
              Mi Perfil
            </MenuItem>
            <MenuItem onClick={() => handleNavigate('/notifications')}>
              Notificaciones
            </MenuItem>
            <MenuItem onClick={toggleTheme}>
              {mode === 'light' ? 'Modo Oscuro' : 'Modo Claro'}
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => handleNavigate('/help')}>
              <HelpIcon sx={{ mr: 1 }} />
              Ayuda
            </MenuItem>
            <MenuItem onClick={() => handleNavigate('/feedback')}>
              <FeedbackIcon sx={{ mr: 1 }} />
              Feedback
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout} color="danger">
              <LogoutIcon sx={{ mr: 1 }} />
              Cerrar Sesión
            </MenuItem>
          </Menu>
        </Dropdown>
      </Box>
    </>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Mobile Menu Button */}
      <IconButton
        variant="outlined"
        color="neutral"
        onClick={() => setMobileOpen(!mobileOpen)}
        sx={{
          display: { xs: 'flex', md: 'none' },
          position: 'fixed',
          top: 16,
          left: 16,
          zIndex: 1200,
        }}
      >
        {mobileOpen ? <CloseIcon /> : <MenuIcon />}
      </IconButton>

      {/* Desktop Sidebar */}
      <Sheet
        sx={{
          width: sidebarWidth,
          flexShrink: 0,
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          borderRight: '1px solid',
          borderColor: 'divider',
          height: '100vh',
          position: 'sticky',
          top: 0,
          transition: 'width 0.25s ease-in-out',
          overflow: 'hidden',
        }}
      >
        {sidebarContent}
      </Sheet>

      {/* Mobile Sidebar */}
      {mobileOpen && (
        <Sheet
          sx={{
            width: 280,
            flexShrink: 0,
            display: { xs: 'flex', md: 'none' },
            flexDirection: 'column',
            borderRight: '1px solid',
            borderColor: 'divider',
            height: '100vh',
            position: 'fixed',
            top: 0,
            left: 0,
            zIndex: 1100,
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
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bgcolor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
          }}
        />
      )}

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3 },
          bgcolor: 'background.level1',
          minHeight: '100vh',
          width: { xs: '100%', md: `calc(100% - ${sidebarWidth}px)` },
          transition: 'width 0.25s ease-in-out',
        }}
      >
        {children}
      </Box>
    </Box>
  )
}
