import { useEffect, lazy, Suspense } from 'react'
import ChunkErrorBoundary from './components/ChunkErrorBoundary'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Box, CssVarsProvider } from '@mui/joy'
import CssBaseline from '@mui/joy/CssBaseline'
import {
  CssVarsProvider as MaterialCssVarsProvider,
  THEME_ID as MATERIAL_THEME_ID,
} from '@mui/material/styles'
import materialTheme from './theme/materialTheme'
import { Toaster } from 'sonner'
import { useThemeColors } from './context/ThemeContext'
import { useAuth } from './hooks/useAuth'
import api from './services/api'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import SignUp from './pages/SignUp'

// Gestión
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Reports = lazy(() => import('./pages/Reports'))

// Operativo
const Tickets = lazy(() => import('./pages/Tickets'))
const QuickReplies = lazy(() => import('./pages/QuickReplies'))
const Kanban = lazy(() => import('./pages/Kanban'))
const FunnelBoard = lazy(() => import('./pages/FunnelBoard'))
const Contacts = lazy(() => import('./pages/Contacts'))
const Schedules = lazy(() => import('./pages/Schedules'))
const Tags = lazy(() => import('./pages/Tags'))
const TagsKanban = lazy(() => import('./pages/TagsKanban'))
const AutomationRules = lazy(() => import('./pages/AutomationRules'))
const InternalChats = lazy(() => import('./pages/InternalChats'))
const CustomerOriginsHub = lazy(() => import('./pages/CustomerOriginsHub'))

// Administración - Campañas
const Campaigns = lazy(() => import('./pages/Campaigns'))
const CampaignsContacts = lazy(() => import('./pages/CampaignsContacts'))
const CampaignsSettings = lazy(() => import('./pages/CampaignsSettings'))
const CampaignsInsights = lazy(() => import('./pages/CampaignsInsights'))
const CampaignsAttribution = lazy(() => import('./pages/CampaignsAttribution'))
const CampaignsAudit = lazy(() => import('./pages/CampaignsAudit'))
const FacebookConversions = lazy(() => import('./pages/FacebookConversions'))
const KanbanLeadConversions = lazy(() => import('./pages/KanbanLeadConversions'))

// Administración - Flowbuilder
const Flowbuilder = lazy(() => import('./pages/Flowbuilder'))
const FlowbuilderCampaign = lazy(() => import('./pages/FlowbuilderCampaign'))
const FlowbuilderConversation = lazy(() => import('./pages/FlowbuilderConversation'))
const FlowbuilderEditor = lazy(() => import('./pages/FlowbuilderEditor'))

// Administración - Otros
const Announcements = lazy(() => import('./pages/Announcements'))
const ApiMessages = lazy(() => import('./pages/ApiMessages'))
const Users = lazy(() => import('./pages/Users'))
const RolesManagement = lazy(() => import('./pages/RolesManagement'))
const Queues = lazy(() => import('./pages/Queues'))
const Prompts = lazy(() => import('./pages/Prompts'))
const QueueIntegrations = lazy(() => import('./pages/QueueIntegrations'))
const Connections = lazy(() => import('./pages/Connections'))
const AllConnections = lazy(() => import('./pages/AllConnections'))
const Invoices = lazy(() => import('./pages/Invoices'))
const Files = lazy(() => import('./pages/Files'))
const Financial = lazy(() => import('./pages/Financial'))
const Settings = lazy(() => import('./pages/Settings'))
const Terms = lazy(() => import('./pages/Terms'))
const Companies = lazy(() => import('./pages/Companies'))
const Plans = lazy(() => import('./pages/Plans'))
const EmailPlans = lazy(() => import('./pages/EmailPlans'))
const EmailCreditsDashboard = lazy(() => import('./pages/EmailCreditsDashboard'))

// General
const Analytics = lazy(() => import('./pages/Analytics'))
const Leads = lazy(() => import('./pages/Leads'))
const Billing = lazy(() => import('./pages/Billing'))
const Checkout = lazy(() => import('./pages/Checkout'))
const Company = lazy(() => import('./pages/Company'))
const Profile = lazy(() => import('./pages/Profile'))
const Notifications = lazy(() => import('./pages/Notifications'))
const Help = lazy(() => import('./pages/Help'))
const Feedback = lazy(() => import('./pages/Feedback'))

// Módulos Avanzados (Día 9)
const Integrations = lazy(() => import('./pages/Integrations'))
const EmailMarketing = lazy(() => import('./pages/EmailMarketing'))

// Módulo Email Marketing - Día 11
const EmailMarketingCampaigns = lazy(() => import('./pages/EmailMarketingCampaigns'))
const EmailMarketingAnalytics = lazy(() => import('./pages/EmailMarketingAnalytics'))
const EmailMarketingTemplates = lazy(() => import('./pages/EmailMarketingTemplates'))
const EmailMarketingPlantillas = lazy(() => import('./pages/EmailMarketingPlantillas'))
const EmailTemplatesEditor = lazy(() => import('./pages/EmailTemplatesEditor'))
const EmailCampaignWizard = lazy(() => import('./pages/EmailCampaignWizard'))
const EmailMarketingDashboard = lazy(() => import('./pages/EmailMarketingDashboard'))

// Módulo WebChat - Día 11
const WebChatSettings = lazy(() => import('./pages/WebChatSettings'))
const WebChatChats = lazy(() => import('./pages/WebChatChats'))
const WebChatAnalytics = lazy(() => import('./pages/WebChatAnalytics'))
const WebChatHistory = lazy(() => import('./pages/WebChatHistory'))

// Módulo de Citas (Día 10 + Día 11 Extendido)
const Appointments = lazy(() => import('./pages/Appointments'))
const AppointmentsCalendar = lazy(() => import('./pages/AppointmentsCalendar'))
const AppointmentsDashboard = lazy(() => import('./pages/AppointmentsDashboard'))
const AppointmentsServices = lazy(() => import('./pages/AppointmentsServices'))
const AppointmentsAvailability = lazy(() => import('./pages/AppointmentsAvailability'))
const AppointmentsBookings = lazy(() => import('./pages/AppointmentsBookings'))
const AppointmentsReminders = lazy(() => import('./pages/AppointmentsReminders'))
const AppointmentsReports = lazy(() => import('./pages/AppointmentsReports'))

// Módulo WhatsApp Cloud API - Día 11
const WhatsAppDashboard = lazy(() => import('./pages/WhatsAppDashboard'))
const WhatsAppNumbers = lazy(() => import('./pages/WhatsAppNumbers'))
const WhatsAppTemplates = lazy(() => import('./pages/WhatsAppTemplates'))
const WhatsAppWebhooks = lazy(() => import('./pages/WhatsAppWebhooks'))
const WhatsAppAnalytics = lazy(() => import('./pages/WhatsAppAnalytics'))
const WhatsAppSettings = lazy(() => import('./pages/WhatsAppSettings'))
const WhatsAppTester = lazy(() => import('./pages/WhatsAppTester'))
const WhatsAppMonitorDashboard = lazy(() => import('./pages/WhatsAppMonitorDashboard'))

// Módulo Integraciones Internas - Día 11
const IntegrationsDashboard = lazy(() => import('./pages/IntegrationsDashboard'))
const IntegrationBillie = lazy(() => import('./pages/IntegrationBillie'))
const IntegrationAriaLite = lazy(() => import('./pages/IntegrationAriaLite'))
const IntegrationSmartTrack = lazy(() => import('./pages/IntegrationSmartTrack'))
const IntegrationSGR = lazy(() => import('./pages/IntegrationSGR'))
const IntegrationsWebhooks = lazy(() => import('./pages/IntegrationsWebhooks'))
const IntegrationsLogs = lazy(() => import('./pages/IntegrationsLogs'))
const IntegrationsSettings = lazy(() => import('./pages/IntegrationsSettings'))
const IntegrationsTesting = lazy(() => import('./pages/IntegrationsTesting'))

// Módulo OpenAI Integration - Día 11
const OpenAIDashboard = lazy(() => import('./pages/OpenAIDashboard'))
const OpenAIModels = lazy(() => import('./pages/OpenAIModels'))
const OpenAIAnalytics = lazy(() => import('./pages/OpenAIAnalytics'))
const OpenAITesting = lazy(() => import('./pages/OpenAITesting'))
const OpenAITemplates = lazy(() => import('./pages/OpenAITemplates'))
const CommentModeration = lazy(() => import('./pages/CommentModeration'))
const StatsRecommendations = lazy(() => import('./pages/StatsRecommendations'))
const OpenAISettings = lazy(() => import('./pages/OpenAISettings'))
const OpenAIHistory = lazy(() => import('./pages/OpenAIHistory'))

// Módulo AI Image Generation
const AIImageGeneration = lazy(() => import('./pages/AIImageGeneration'))

// Módulo AI Video Generation
const AIVideoGeneration = lazy(() => import('./pages/AIVideoGeneration'))

// Módulo AI Subplans (Paquetes de Tokens)
const AISubplans = lazy(() => import('./pages/AISubplans'))

// FASE 4: Sistema de Permisos - Día 12
const PermissionsManager = lazy(() => import('./pages/PermissionsManager'))

// Kanban Dashboard (lazy)
const KanbanDashboard = lazy(() => import("./pages/KanbanDashboard"))

// Plataforma IA (lazy)
const AIPlatform = lazy(() => import("./pages/AIPlatform"))
const AIAgents = lazy(() => import("./pages/AIAgents"))
const AIKnowledgeBase = lazy(() => import("./pages/AIKnowledgeBase"))
const AIChatbotBuilder = lazy(() => import("./pages/AIChatbotBuilder"))
const AIWriter = lazy(() => import("./pages/AIWriter"))
const AIAudio = lazy(() => import("./pages/AIAudio"))
// Sprint 1 (2026-05-20) — Panel de revisión humana de correcciones IA
const AICorrectionReview = lazy(() => import("./pages/AICorrectionReview"))
const AIMultimodal = lazy(() => import("./pages/AIMultimodal"))
const AICredits = lazy(() => import("./pages/AICredits"))
const AITokenUsageAdmin = lazy(() => import("./pages/AITokenUsageAdmin"))
const AIScheduler = lazy(() => import("./pages/AIScheduler"))
const AIObservability = lazy(() => import("./pages/AIObservability"))
const AIFineTuning = lazy(() => import("./pages/AIFineTuning"))
const AIHeyGen = lazy(() => import("./pages/AIHeyGen"))
const AIABTesting = lazy(() => import("./pages/AIABTesting"))
const AIAffiliates = lazy(() => import("./pages/AIAffiliates"))

// Social Comments FB/IG (lazy)
const SocialCommentsInbox = lazy(() => import("./pages/SocialCommentsInbox"))
const SocialCommentsSettings = lazy(() => import("./pages/SocialCommentsSettings"))

// Comment Auto-Reply (lazy)
const CommentAutoReplyDashboard = lazy(() => import("./pages/CommentAutoReplyDashboard"))
const CommentAutoReplyCampaigns = lazy(() => import("./pages/CommentAutoReplyCampaigns"))
const CommentAutoReplyLogs = lazy(() => import("./pages/CommentAutoReplyLogs"))
const CommentAutoReplySettings = lazy(() => import("./pages/CommentAutoReplySettings"))

// Afiliados Independiente (lazy)
const AffiliateDashboard = lazy(() => import("./pages/AffiliateDashboard"))
const AIRentabilityDashboard = lazy(() => import("./pages/AIRentabilityDashboard"))
const AIUsageDashboard = lazy(() => import("./pages/AIUsageDashboard"))
const AffiliatePrograms = lazy(() => import("./pages/AffiliatePrograms"))
const AffiliateReferrals = lazy(() => import("./pages/AffiliateReferrals"))
const AffiliateWallet = lazy(() => import("./pages/AffiliateWallet"))
const AffiliateWithdrawals = lazy(() => import("./pages/AffiliateWithdrawals"))
const AffiliateLinks = lazy(() => import("./pages/AffiliateLinks"))
const AffiliateTiers = lazy(() => import("./pages/AffiliateTiers"))

// Agentes IA (lazy)
const AgentCommentsInbox = lazy(() => import("./pages/AgentCommentsInbox"))
const AgentDeviceFarm = lazy(() => import("./pages/AgentDeviceFarm"))
const AgentIdentityDashboard = lazy(() => import("./pages/AgentIdentityDashboard"))

// Coexistencia & Migración (lazy)
const CoexistenceDashboard = lazy(() => import("./pages/CoexistenceDashboard"))
const MigrationWizard = lazy(() => import("./pages/MigrationWizard"))
const TikTokConnections = lazy(() => import("./pages/TikTokConnections"))

// UGC (lazy)
const UGCDashboard = lazy(() => import("./pages/UGCDashboard"))
const UGCCampaigns = lazy(() => import("./pages/UGCCampaigns"))
const UGCCreatorNetwork = lazy(() => import("./pages/UGCCreatorNetwork"))
const UGCAnalytics = lazy(() => import("./pages/UGCAnalytics"))
const UGCOptimization = lazy(() => import("./pages/UGCOptimization"))
const UGCSettings = lazy(() => import("./pages/UGCSettings"))
const UGCSocialAccounts = lazy(() => import("./pages/UGCSocialAccounts"))
const UGCSocialPosts = lazy(() => import("./pages/UGCSocialPosts"))
const UGCVideoStudio = lazy(() => import("./pages/UGCVideoStudio"))
const UGCModelSelector = lazy(() => import("./pages/UGCModelSelector"))
const UGCGenerate = lazy(() => import("./pages/UGCGenerate"))

// Campañas extras (lazy)
const CampaignAI = lazy(() => import("./pages/CampaignAI"))
const CampaignRules = lazy(() => import("./pages/CampaignRules"))

// Email extras (lazy)
const EmailProviderSettings = lazy(() => import("./pages/EmailProviderSettings"))
const EmailCreditPacks = lazy(() => import("./pages/EmailCreditPacks"))

// Auth adicional (lazy)
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"))
const ResetPassword = lazy(() => import("./pages/ResetPassword"))

function App() {
  const { chateamTheme, setColors, colors } = useThemeColors()
  const { user, loading: authLoading } = useAuth()

  // Sync theme colors from API after auth resolves
  useEffect(() => {
    if (!authLoading && user?.companyId) {
      api.get(`/companySettings/${user.companyId}`).then(res => {
        if (res.data) {
          const apiColors = {
            primaryLight: res.data.themePrimaryLight || '#5BC2D2',
            primaryDark: res.data.themePrimaryDark || '#6FD4E4',
            secondaryLight: res.data.themeSecondaryLight || '#4caf50',
            secondaryDark: res.data.themeSecondaryDark || '#4caf50',
          }
          if (JSON.stringify(apiColors) !== JSON.stringify(colors)) {
            setColors(apiColors)
          }
        }
      }).catch(() => { /* fallback to cached/defaults */ })
    }
  }, [authLoading, user?.companyId])

  return (
    <MaterialCssVarsProvider theme={{ [MATERIAL_THEME_ID]: materialTheme }} defaultMode="light">
      <CssVarsProvider theme={chateamTheme} defaultMode="light">
      <CssBaseline />
      <Toaster position="top-right" expand={true} richColors />
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.body' }}>
        {/* [Fase D] Boundary único para las páginas lazy (bundle inicial más liviano). */}
        {/* [Barrido UI] ChunkErrorBoundary: Suspense cubre la carga pero NO el rechazo
            del import(); sin boundary, un chunk viejo tras redespliegue = pantalla en
            blanco. Ahora auto-recarga una vez o muestra fallback con botón. */}
        <ChunkErrorBoundary>
        <Suspense fallback={<div style={{ padding: 24, textAlign: 'center' }}>Cargando…</div>}>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />

          {/* Protected routes with AppLayout and RBAC permissions */}

          {/* Gestión */}
          <Route path="/" element={<ProtectedRoute module="dashboard"><Dashboard /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute module="reports"><Reports /></ProtectedRoute>} />

          {/* Operativo */}
          <Route path="/tickets" element={<ProtectedRoute module="tickets"><Tickets /></ProtectedRoute>} />
          <Route path="/quick-replies" element={<ProtectedRoute module="quick_replies"><QuickReplies /></ProtectedRoute>} />
          <Route path="/funnel" element={<ProtectedRoute module="kanban"><Kanban /></ProtectedRoute>} />
          {/* Redirección de la URL antigua /kanban -> /funnel (mantiene marcadores y enlaces existentes) */}
          <Route path="/kanban" element={<Navigate to="/funnel" replace />} />
          <Route path="/kanban-legacy" element={<ProtectedRoute module="kanban"><Kanban /></ProtectedRoute>} />
          <Route path="/kanban-dashboard" element={<Suspense fallback={null}><ProtectedRoute module="kanban"><KanbanDashboard /></ProtectedRoute></Suspense>} />
          <Route path="/contacts" element={<ProtectedRoute module="contacts"><Contacts /></ProtectedRoute>} />
          <Route path="/schedules" element={<ProtectedRoute module="schedules"><Schedules /></ProtectedRoute>} />
          <Route path="/tags" element={<ProtectedRoute module="tags"><Tags /></ProtectedRoute>} />
          <Route path="/automation-rules" element={<ProtectedRoute module="settings"><AutomationRules /></ProtectedRoute>} />
          <Route path="/tagsKanban" element={<ProtectedRoute module="tags"><TagsKanban /></ProtectedRoute>} />
          <Route path="/customer-origins" element={<ProtectedRoute module="customer_origins"><CustomerOriginsHub /></ProtectedRoute>} />
          {/* Retrocompatibilidad: la antigua ruta de reportes redirige al hub unificado (pestaña Análisis) */}
          <Route path="/customer-origins/reports" element={<Navigate to="/customer-origins?tab=analisis" replace />} />
          <Route path="/internal-chats" element={<ProtectedRoute module="internal_chats"><InternalChats /></ProtectedRoute>} />

          {/* Administración - Campañas */}
          <Route path="/campaigns" element={<ProtectedRoute module="campaigns"><Campaigns /></ProtectedRoute>} />
          <Route path="/campaigns/contacts" element={<ProtectedRoute module="campaigns_contacts"><CampaignsContacts /></ProtectedRoute>} />
          <Route path="/campaigns/settings" element={<ProtectedRoute module="campaigns_settings"><CampaignsSettings /></ProtectedRoute>} />
          <Route path="/campaigns/insights" element={<ProtectedRoute module="campaigns_insights"><CampaignsInsights /></ProtectedRoute>} />
          <Route path="/campaigns/attribution" element={<ProtectedRoute module="campaigns_attribution"><CampaignsAttribution /></ProtectedRoute>} />
          <Route path="/campaigns/audit" element={<ProtectedRoute module="campaigns_audit"><CampaignsAudit /></ProtectedRoute>} />
          <Route path="/facebook-conversions" element={<ProtectedRoute module="facebook_conversions"><FacebookConversions /></ProtectedRoute>} />
          <Route path="/kanban-lead-conversions" element={<ProtectedRoute module="facebook_conversions"><KanbanLeadConversions /></ProtectedRoute>} />

          {/* Administración - Flowbuilder */}
          <Route path="/flowbuilder" element={<ProtectedRoute module="flowbuilder"><Flowbuilder /></ProtectedRoute>} />
          <Route path="/flowbuilder/campaign" element={<ProtectedRoute module="flowbuilder_campaign"><FlowbuilderCampaign /></ProtectedRoute>} />
          <Route path="/flowbuilder/conversation" element={<ProtectedRoute module="flowbuilder_conversation"><FlowbuilderConversation /></ProtectedRoute>} />
          <Route path="/flowbuilder/editor/:flowId" element={<ProtectedRoute module="flowbuilder_conversation"><FlowbuilderEditor /></ProtectedRoute>} />

          {/* Administración - Otros */}
          <Route path="/announcements" element={<ProtectedRoute module="announcements"><Announcements /></ProtectedRoute>} />
          <Route path="/api-messages" element={<ProtectedRoute module="api_messages"><ApiMessages /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute module="users"><Users /></ProtectedRoute>} />
          <Route path="/roles-management" element={<ProtectedRoute module="users"><RolesManagement /></ProtectedRoute>} />
          <Route path="/queues" element={<ProtectedRoute module="queues"><Queues /></ProtectedRoute>} />
          <Route path="/prompts" element={<ProtectedRoute module="prompts"><Prompts /></ProtectedRoute>} />
          <Route path="/queue-integrations" element={<ProtectedRoute module="queue_integrations"><QueueIntegrations /></ProtectedRoute>} />
          <Route path="/connections" element={<ProtectedRoute module="connections"><Connections /></ProtectedRoute>} />
          <Route path="/all-connections" element={<ProtectedRoute module="all_connections"><AllConnections /></ProtectedRoute>} />
          <Route path="/invoices" element={<ProtectedRoute module="invoices"><Invoices /></ProtectedRoute>} />
          <Route path="/files" element={<ProtectedRoute module="files"><Files /></ProtectedRoute>} />
          <Route path="/financial" element={<ProtectedRoute module="financial"><Financial /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute module="settings"><Settings /></ProtectedRoute>} />
          <Route path="/terms" element={<ProtectedRoute module="terms"><Terms /></ProtectedRoute>} />
          <Route path="/companies" element={<ProtectedRoute module="companies"><Companies /></ProtectedRoute>} />
          <Route path="/plans" element={<ProtectedRoute module="plans"><Plans /></ProtectedRoute>} />
          <Route path="/email-plans" element={<ProtectedRoute module="plans"><EmailPlans /></ProtectedRoute>} />
          <Route path="/email/credits-dashboard" element={<ProtectedRoute module="email_marketing"><EmailCreditsDashboard /></ProtectedRoute>} />

          {/* General */}
          <Route path="/analytics" element={<ProtectedRoute module="analytics"><Analytics /></ProtectedRoute>} />
          <Route path="/leads" element={<ProtectedRoute module="leads"><Leads /></ProtectedRoute>} />
          <Route path="/billing" element={<ProtectedRoute module="billing"><Billing /></ProtectedRoute>} />
          <Route path="/checkout" element={<ProtectedRoute module="billing"><Checkout /></ProtectedRoute>} />
          <Route path="/company" element={<ProtectedRoute module="company"><Company /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute module="profile"><Profile /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute module="notifications"><Notifications /></ProtectedRoute>} />
          <Route path="/help" element={<ProtectedRoute module="help"><Help /></ProtectedRoute>} />
          <Route path="/feedback" element={<ProtectedRoute module="feedback"><Feedback /></ProtectedRoute>} />

          {/* Módulos Avanzados (Día 9) */}
          <Route path="/integrations" element={<ProtectedRoute module="integrations"><Integrations /></ProtectedRoute>} />
          <Route path="/email-marketing" element={<ProtectedRoute module="email_marketing"><EmailMarketing /></ProtectedRoute>} />

          {/* Módulo Email Marketing Completo - Día 11 */}
          <Route path="/email-marketing/campaigns" element={<ProtectedRoute module="email_marketing_campaigns"><EmailMarketingCampaigns /></ProtectedRoute>} />
          <Route path="/email-marketing/analytics" element={<ProtectedRoute module="email_marketing_analytics"><EmailMarketingAnalytics /></ProtectedRoute>} />
          <Route path="/email-marketing/templates" element={<ProtectedRoute module="email_marketing_templates"><EmailMarketingTemplates /></ProtectedRoute>} />
          <Route path="/email-marketing/plantillas" element={<ProtectedRoute module="email_marketing_templates"><EmailMarketingPlantillas /></ProtectedRoute>} />
          <Route path="/email-marketing/editor" element={<ProtectedRoute module="email_marketing_templates"><EmailTemplatesEditor /></ProtectedRoute>} />
          <Route path="/email-marketing/wizard" element={<ProtectedRoute module="email_marketing_campaigns"><EmailCampaignWizard /></ProtectedRoute>} />
          <Route path="/email-marketing/dashboard" element={<ProtectedRoute module="email_marketing_analytics"><EmailMarketingDashboard /></ProtectedRoute>} />

          {/* Módulo WebChat Completo - Día 11 */}
          <Route path="/webchat/settings" element={<ProtectedRoute module="webchat_settings"><WebChatSettings /></ProtectedRoute>} />
          <Route path="/webchat/chats" element={<ProtectedRoute module="webchat_chats"><WebChatChats /></ProtectedRoute>} />
          <Route path="/webchat/analytics" element={<ProtectedRoute module="webchat_analytics"><WebChatAnalytics /></ProtectedRoute>} />
          <Route path="/webchat/history" element={<ProtectedRoute module="webchat_history"><WebChatHistory /></ProtectedRoute>} />

          {/* Módulo de Citas Completo (Día 10 + Día 11) */}
          <Route path="/appointments" element={<ProtectedRoute module="appointments"><Appointments /></ProtectedRoute>} />
          <Route path="/appointments/dashboard" element={<ProtectedRoute module="appointments_dashboard"><AppointmentsDashboard /></ProtectedRoute>} />
          <Route path="/appointments/calendar" element={<ProtectedRoute module="appointments_calendar"><AppointmentsCalendar /></ProtectedRoute>} />
          <Route path="/appointments/services" element={<ProtectedRoute module="appointments_services"><AppointmentsServices /></ProtectedRoute>} />
          <Route path="/appointments/availability" element={<ProtectedRoute module="appointments_availability"><AppointmentsAvailability /></ProtectedRoute>} />
          <Route path="/appointments/bookings" element={<ProtectedRoute module="appointments_bookings"><AppointmentsBookings /></ProtectedRoute>} />
          <Route path="/appointments/reminders" element={<ProtectedRoute module="appointments_reminders"><AppointmentsReminders /></ProtectedRoute>} />
          <Route path="/appointments/reports" element={<ProtectedRoute module="appointments_reports"><AppointmentsReports /></ProtectedRoute>} />

          {/* Módulo WhatsApp Cloud API Completo (Día 11) */}
          <Route path="/whatsapp/dashboard" element={<ProtectedRoute module="whatsapp_dashboard"><WhatsAppDashboard /></ProtectedRoute>} />
          <Route path="/whatsapp/numbers" element={<ProtectedRoute module="whatsapp_numbers"><WhatsAppNumbers /></ProtectedRoute>} />
          <Route path="/whatsapp/templates" element={<ProtectedRoute module="whatsapp_templates"><WhatsAppTemplates /></ProtectedRoute>} />
          <Route path="/whatsapp/webhooks" element={<ProtectedRoute module="whatsapp_webhooks"><WhatsAppWebhooks /></ProtectedRoute>} />
          <Route path="/whatsapp/analytics" element={<ProtectedRoute module="webchat_analytics"><WhatsAppAnalytics /></ProtectedRoute>} />
          <Route path="/whatsapp/settings" element={<ProtectedRoute module="whatsapp_settings"><WhatsAppSettings /></ProtectedRoute>} />
          <Route path="/whatsapp/tester" element={<ProtectedRoute module="whatsapp_tester"><WhatsAppTester /></ProtectedRoute>} />
          <Route path="/whatsapp/monitor" element={<ProtectedRoute module="whatsapp_monitor"><WhatsAppMonitorDashboard /></ProtectedRoute>} />

          {/* Módulo Integraciones Internas Completo (Día 11) */}
          <Route path="/integrations-internal/dashboard" element={<ProtectedRoute module="integrations_dashboard"><IntegrationsDashboard /></ProtectedRoute>} />
          <Route path="/integrations-internal/billie" element={<ProtectedRoute module="integrations_billie"><IntegrationBillie /></ProtectedRoute>} />
          <Route path="/integrations-internal/aria-lite" element={<ProtectedRoute module="integrations_aria_lite"><IntegrationAriaLite /></ProtectedRoute>} />
          <Route path="/integrations-internal/smarttrack" element={<ProtectedRoute module="integrations_smarttrack"><IntegrationSmartTrack /></ProtectedRoute>} />
          <Route path="/integrations-internal/sgr" element={<ProtectedRoute module="integrations_sgr"><IntegrationSGR /></ProtectedRoute>} />
          <Route path="/integrations-internal/webhooks" element={<ProtectedRoute module="integrations_webhooks"><IntegrationsWebhooks /></ProtectedRoute>} />
          <Route path="/integrations-internal/logs" element={<ProtectedRoute module="integrations_logs"><IntegrationsLogs /></ProtectedRoute>} />
          <Route path="/integrations-internal/settings" element={<ProtectedRoute module="integrations_settings"><IntegrationsSettings /></ProtectedRoute>} />
          <Route path="/integrations-internal/testing" element={<ProtectedRoute module="integrations_testing"><IntegrationsTesting /></ProtectedRoute>} />

          {/* Módulo OpenAI Integration Completo (Día 11) */}
          <Route path="/openai/dashboard" element={<ProtectedRoute module="openai_dashboard"><OpenAIDashboard /></ProtectedRoute>} />
          <Route path="/openai/models" element={<ProtectedRoute module="openai_models"><OpenAIModels /></ProtectedRoute>} />
          <Route path="/openai/analytics" element={<ProtectedRoute module="openai_analytics"><OpenAIAnalytics /></ProtectedRoute>} />
          <Route path="/openai/testing" element={<ProtectedRoute module="openai_testing"><OpenAITesting /></ProtectedRoute>} />
          <Route path="/openai/templates" element={<ProtectedRoute module="openai_templates"><OpenAITemplates /></ProtectedRoute>} />
          <Route path="/moderation" element={<Suspense fallback={null}><ProtectedRoute module="social_comments"><CommentModeration /></ProtectedRoute></Suspense>} />
          <Route path="/stats/recommendations" element={<Suspense fallback={null}><ProtectedRoute module="ai_platform"><StatsRecommendations /></ProtectedRoute></Suspense>} />
          <Route path="/openai/settings" element={<ProtectedRoute module="openai_settings"><OpenAISettings /></ProtectedRoute>} />
          <Route path="/openai/history" element={<ProtectedRoute module="openai_history"><OpenAIHistory /></ProtectedRoute>} />

          {/* Módulo AI Image Generation */}
          <Route path="/ai-image-generation" element={<ProtectedRoute module="ai_image_generation"><AIImageGeneration /></ProtectedRoute>} />

          {/* Módulo AI Video Generation */}
          <Route path="/ai-video-generation" element={<ProtectedRoute module="ai_video_generation"><AIVideoGeneration /></ProtectedRoute>} />

          {/* Módulo AI Subplans (Paquetes de Tokens) */}
          <Route path="/ai/subplans" element={<ProtectedRoute module="ai_subplans"><AISubplans /></ProtectedRoute>} />

          {/* FASE 4: Sistema de Permisos (Día 12) */}
          <Route path="/permissions-manager" element={<ProtectedRoute module="permissions_manager" superOnly><PermissionsManager /></ProtectedRoute>} />

          {/* Plataforma IA */}
          <Route path="/ai/platform" element={<Suspense fallback={null}><ProtectedRoute module="ai_platform"><AIPlatform /></ProtectedRoute></Suspense>} />
          <Route path="/ai/agents" element={<Suspense fallback={null}><ProtectedRoute module="ai_agents"><AIAgents /></ProtectedRoute></Suspense>} />
          <Route path="/ai/knowledge-base" element={<Suspense fallback={null}><ProtectedRoute module="ai_knowledge_base"><AIKnowledgeBase /></ProtectedRoute></Suspense>} />
          <Route path="/ai/chatbot-builder" element={<Suspense fallback={null}><ProtectedRoute module="ai_chatbot_builder"><AIChatbotBuilder /></ProtectedRoute></Suspense>} />
          <Route path="/ai/writer" element={<Suspense fallback={null}><ProtectedRoute module="ai_writer"><AIWriter /></ProtectedRoute></Suspense>} />
          <Route path="/ai/audio" element={<Suspense fallback={null}><ProtectedRoute module="ai_audio"><AIAudio /></ProtectedRoute></Suspense>} />
          <Route path="/ai/multimodal" element={<Suspense fallback={null}><ProtectedRoute module="ai_multimodal"><AIMultimodal /></ProtectedRoute></Suspense>} />
          <Route path="/ai/credits" element={<Suspense fallback={null}><ProtectedRoute module="ai_credits"><AICredits /></ProtectedRoute></Suspense>} />
          <Route path="/admin/ai-token-usage" element={<Suspense fallback={null}><ProtectedRoute superOnly><AITokenUsageAdmin /></ProtectedRoute></Suspense>} />
          <Route path="/ai/scheduler" element={<Suspense fallback={null}><ProtectedRoute module="ai_scheduler"><AIScheduler /></ProtectedRoute></Suspense>} />
          <Route path="/ai/observability" element={<Suspense fallback={null}><ProtectedRoute module="ai_observability"><AIObservability /></ProtectedRoute></Suspense>} />
          <Route path="/ai/fine-tuning" element={<Suspense fallback={null}><ProtectedRoute module="ai_fine_tuning"><AIFineTuning /></ProtectedRoute></Suspense>} />
          <Route path="/ai/heygen" element={<Suspense fallback={null}><ProtectedRoute module="ai_heygen"><AIHeyGen /></ProtectedRoute></Suspense>} />
          <Route path="/ai/ab-testing" element={<Suspense fallback={null}><ProtectedRoute module="ai_ab_testing"><AIABTesting /></ProtectedRoute></Suspense>} />
          <Route path="/ai/affiliates" element={<Suspense fallback={null}><ProtectedRoute module="ai_affiliates"><AIAffiliates /></ProtectedRoute></Suspense>} />
          {/* Sprint 1 (2026-05-20) — Panel de revisión humana de correcciones IA */}
          <Route path="/ai/correction-review" element={<Suspense fallback={null}><ProtectedRoute module="ai_correction_review"><AICorrectionReview /></ProtectedRoute></Suspense>} />

          {/* Afiliados Independiente */}
          <Route path="/affiliates" element={<Suspense fallback={null}><ProtectedRoute module="affiliates"><AffiliateDashboard /></ProtectedRoute></Suspense>} />
          <Route path="/ai-rentability" element={<Suspense fallback={null}><ProtectedRoute module="superadmin" superOnly><AIRentabilityDashboard /></ProtectedRoute></Suspense>} />
          <Route path="/ai-usage" element={<Suspense fallback={null}><ProtectedRoute><AIUsageDashboard /></ProtectedRoute></Suspense>} />
          <Route path="/affiliates/programs" element={<Suspense fallback={null}><ProtectedRoute module="affiliate_programs"><AffiliatePrograms /></ProtectedRoute></Suspense>} />
          <Route path="/affiliates/referrals" element={<Suspense fallback={null}><ProtectedRoute module="affiliate_referrals"><AffiliateReferrals /></ProtectedRoute></Suspense>} />
          <Route path="/affiliates/wallet" element={<Suspense fallback={null}><ProtectedRoute module="affiliate_wallet"><AffiliateWallet /></ProtectedRoute></Suspense>} />
          <Route path="/affiliates/withdrawals" element={<Suspense fallback={null}><ProtectedRoute module="affiliate_withdrawals"><AffiliateWithdrawals /></ProtectedRoute></Suspense>} />
          <Route path="/affiliates/links" element={<Suspense fallback={null}><ProtectedRoute module="affiliate_links"><AffiliateLinks /></ProtectedRoute></Suspense>} />
          <Route path="/affiliates/tiers" element={<Suspense fallback={null}><ProtectedRoute module="affiliate_tiers"><AffiliateTiers /></ProtectedRoute></Suspense>} />

          {/* Agentes IA */}
          <Route path="/agents/comments" element={<Suspense fallback={null}><ProtectedRoute module="agent_comments"><AgentCommentsInbox /></ProtectedRoute></Suspense>} />
          <Route path="/agents/devices" element={<Suspense fallback={null}><ProtectedRoute module="agent_devices"><AgentDeviceFarm /></ProtectedRoute></Suspense>} />
          <Route path="/agents/identity" element={<Suspense fallback={null}><ProtectedRoute module="agent_identity"><AgentIdentityDashboard /></ProtectedRoute></Suspense>} />

          {/* Coexistencia & Migración */}
          <Route path="/coexistence" element={<Suspense fallback={null}><ProtectedRoute module="coexistence"><CoexistenceDashboard /></ProtectedRoute></Suspense>} />
          <Route path="/migration" element={<Suspense fallback={null}><ProtectedRoute module="migration"><MigrationWizard /></ProtectedRoute></Suspense>} />
          <Route path="/tiktok-connections" element={<Suspense fallback={null}><ProtectedRoute module="connections"><TikTokConnections /></ProtectedRoute></Suspense>} />

          {/* UGC */}
          <Route path="/ugc" element={<Navigate to="/ugc/dashboard" replace />} />
          <Route path="/ugc/dashboard" element={<Suspense fallback={null}><ProtectedRoute module="ugc_dashboard"><UGCDashboard /></ProtectedRoute></Suspense>} />
          <Route path="/ugc/campaigns" element={<Suspense fallback={null}><ProtectedRoute module="ugc_campaigns"><UGCCampaigns /></ProtectedRoute></Suspense>} />
          <Route path="/ugc/creators" element={<Suspense fallback={null}><ProtectedRoute module="ugc_creators"><UGCCreatorNetwork /></ProtectedRoute></Suspense>} />
          <Route path="/ugc/analytics" element={<Suspense fallback={null}><ProtectedRoute module="ugc_analytics"><UGCAnalytics /></ProtectedRoute></Suspense>} />
          <Route path="/ugc/optimization" element={<Suspense fallback={null}><ProtectedRoute module="ugc_optimization"><UGCOptimization /></ProtectedRoute></Suspense>} />
          <Route path="/ugc/settings" element={<Suspense fallback={null}><ProtectedRoute module="ugc_settings" superOnly><UGCSettings /></ProtectedRoute></Suspense>} />
          <Route path="/ugc/social-accounts" element={<Suspense fallback={null}><ProtectedRoute module="ugc_social_accounts"><UGCSocialAccounts /></ProtectedRoute></Suspense>} />
          <Route path="/ugc/social-posts" element={<Suspense fallback={null}><ProtectedRoute module="ugc_social_posts"><UGCSocialPosts /></ProtectedRoute></Suspense>} />
          <Route path="/ugc/video-studio" element={<Suspense fallback={null}><ProtectedRoute module="ugc_video_studio"><UGCVideoStudio /></ProtectedRoute></Suspense>} />
          <Route path="/ugc/model-selector" element={<Suspense fallback={null}><ProtectedRoute module="ugc_campaigns"><UGCModelSelector /></ProtectedRoute></Suspense>} />
          <Route path="/ugc/generate" element={<Suspense fallback={null}><ProtectedRoute module="ugc_video_studio"><UGCGenerate /></ProtectedRoute></Suspense>} />
          <Route path="/ugc/campaigns/:id/model-selector" element={<Suspense fallback={null}><ProtectedRoute module="ugc_campaigns"><UGCModelSelector /></ProtectedRoute></Suspense>} />

          {/* Campañas extras */}
          <Route path="/campaigns/ai" element={<Suspense fallback={null}><ProtectedRoute module="campaigns_ai"><CampaignAI /></ProtectedRoute></Suspense>} />
          <Route path="/campaigns/rules" element={<Suspense fallback={null}><ProtectedRoute module="campaigns_rules"><CampaignRules /></ProtectedRoute></Suspense>} />

          {/* Email extras */}
          <Route path="/email/provider-settings" element={<Suspense fallback={null}><ProtectedRoute module="email_provider_settings"><EmailProviderSettings /></ProtectedRoute></Suspense>} />
          <Route path="/email/credit-packs" element={<Suspense fallback={null}><ProtectedRoute module="email_credit_packs"><EmailCreditPacks /></ProtectedRoute></Suspense>} />

          {/* Social Comments FB/IG */}
          <Route path="/social-comments" element={<Suspense fallback={null}><ProtectedRoute module="social_comments"><SocialCommentsInbox /></ProtectedRoute></Suspense>} />
          <Route path="/social-comments/settings" element={<Suspense fallback={null}><ProtectedRoute module="social_comments"><SocialCommentsSettings /></ProtectedRoute></Suspense>} />

          {/* Comment Auto-Reply (Auto-Respondedor de Comentarios) */}
          <Route path="/comment-autoreply" element={<Suspense fallback={null}><ProtectedRoute module="comment_autoreply"><CommentAutoReplyDashboard /></ProtectedRoute></Suspense>} />
          <Route path="/comment-autoreply/campaigns" element={<Suspense fallback={null}><ProtectedRoute module="comment_autoreply_campaigns"><CommentAutoReplyCampaigns /></ProtectedRoute></Suspense>} />
          <Route path="/comment-autoreply/campaigns/:id/logs" element={<Suspense fallback={null}><ProtectedRoute module="comment_autoreply_campaigns"><CommentAutoReplyLogs /></ProtectedRoute></Suspense>} />
          <Route path="/comment-autoreply/settings" element={<Suspense fallback={null}><ProtectedRoute module="comment_autoreply"><CommentAutoReplySettings /></ProtectedRoute></Suspense>} />

          {/* Auth adicional - rutas públicas */}
          <Route path="/forgot-password" element={<Suspense fallback={null}><ForgotPassword /></Suspense>} />
          <Route path="/reset-password" element={<Suspense fallback={null}><ResetPassword /></Suspense>} />

          {/* 404 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        </ChunkErrorBoundary>
      </Box>
      </CssVarsProvider>
    </MaterialCssVarsProvider>
  )
}

export default App
