import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Box, CssVarsProvider } from '@mui/joy'
import CssBaseline from '@mui/joy/CssBaseline'
import { Toaster } from 'sonner'
import { useThemeColors } from './context/ThemeContext'
import { useAuth } from './hooks/useAuth'
import api from './services/api'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import SignUp from './pages/SignUp'

// Gestión
import Dashboard from './pages/Dashboard'
import Reports from './pages/Reports'
import RealtimeChats from './pages/RealtimeChats'

// Operativo
import Tickets from './pages/Tickets'
import QuickReplies from './pages/QuickReplies'
import Kanban from './pages/Kanban'
import Contacts from './pages/Contacts'
import Schedules from './pages/Schedules'
import Tags from './pages/Tags'
import TagsKanban from './pages/TagsKanban'
import InternalChats from './pages/InternalChats'
import CustomerOrigins from './pages/CustomerOrigins'
import CustomerOriginReports from './pages/CustomerOriginReports'

// Administración - Campañas
import Campaigns from './pages/Campaigns'
import CampaignsContacts from './pages/CampaignsContacts'
import CampaignsSettings from './pages/CampaignsSettings'
import CampaignsInsights from './pages/CampaignsInsights'
import CampaignsAttribution from './pages/CampaignsAttribution'
import CampaignsAudit from './pages/CampaignsAudit'
import FacebookConversions from './pages/FacebookConversions'

// Administración - Flowbuilder
import Flowbuilder from './pages/Flowbuilder'
import FlowbuilderCampaign from './pages/FlowbuilderCampaign'
import FlowbuilderConversation from './pages/FlowbuilderConversation'
import FlowbuilderEditor from './pages/FlowbuilderEditor'

// Administración - Otros
import Announcements from './pages/Announcements'
import ApiMessages from './pages/ApiMessages'
import Users from './pages/Users'
import Queues from './pages/Queues'
import Prompts from './pages/Prompts'
import QueueIntegrations from './pages/QueueIntegrations'
import Connections from './pages/Connections'
import AllConnections from './pages/AllConnections'
import Invoices from './pages/Invoices'
import Files from './pages/Files'
import Financial from './pages/Financial'
import Settings from './pages/Settings'
import Terms from './pages/Terms'
import Companies from './pages/Companies'
import Plans from './pages/Plans'

// General
import Analytics from './pages/Analytics'
import Leads from './pages/Leads'
import Billing from './pages/Billing'
import Checkout from './pages/Checkout'
import Company from './pages/Company'
import Profile from './pages/Profile'
import Notifications from './pages/Notifications'
import Help from './pages/Help'
import Feedback from './pages/Feedback'

// Módulos Avanzados (Día 9)
import Integrations from './pages/Integrations'
import EmailMarketing from './pages/EmailMarketing'

// Módulo Email Marketing - Día 11
import EmailMarketingCampaigns from './pages/EmailMarketingCampaigns'
import EmailMarketingAnalytics from './pages/EmailMarketingAnalytics'
import EmailMarketingTemplates from './pages/EmailMarketingTemplates'
import EmailMarketingPlantillas from './pages/EmailMarketingPlantillas'

// Módulo WebChat - Día 11
import WebChatSettings from './pages/WebChatSettings'
import WebChatChats from './pages/WebChatChats'
import WebChatAnalytics from './pages/WebChatAnalytics'
import WebChatHistory from './pages/WebChatHistory'

// Módulo de Citas (Día 10 + Día 11 Extendido)
import Appointments from './pages/Appointments'
import AppointmentsCalendar from './pages/AppointmentsCalendar'
import AppointmentsDashboard from './pages/AppointmentsDashboard'
import AppointmentsServices from './pages/AppointmentsServices'
import AppointmentsAvailability from './pages/AppointmentsAvailability'
import AppointmentsBookings from './pages/AppointmentsBookings'
import AppointmentsReminders from './pages/AppointmentsReminders'
import AppointmentsReports from './pages/AppointmentsReports'

// Módulo WhatsApp Cloud API - Día 11
import WhatsAppDashboard from './pages/WhatsAppDashboard'
import WhatsAppNumbers from './pages/WhatsAppNumbers'
import WhatsAppTemplates from './pages/WhatsAppTemplates'
import WhatsAppCampaigns from './pages/WhatsAppCampaigns'
import WhatsAppWebhooks from './pages/WhatsAppWebhooks'
import WhatsAppAnalytics from './pages/WhatsAppAnalytics'
import WhatsAppSettings from './pages/WhatsAppSettings'
import WhatsAppTester from './pages/WhatsAppTester'
import WhatsAppMonitorDashboard from './pages/WhatsAppMonitorDashboard'

// Módulo Integraciones Internas - Día 11
import IntegrationsDashboard from './pages/IntegrationsDashboard'
import IntegrationBillie from './pages/IntegrationBillie'
import IntegrationAriaLite from './pages/IntegrationAriaLite'
import IntegrationSmartTrack from './pages/IntegrationSmartTrack'
import IntegrationSGR from './pages/IntegrationSGR'
import IntegrationsWebhooks from './pages/IntegrationsWebhooks'
import IntegrationsLogs from './pages/IntegrationsLogs'
import IntegrationsSettings from './pages/IntegrationsSettings'
import IntegrationsTesting from './pages/IntegrationsTesting'

// Módulo OpenAI Integration - Día 11
import OpenAIDashboard from './pages/OpenAIDashboard'
import OpenAIPrompts from './pages/OpenAIPrompts'
import OpenAIModels from './pages/OpenAIModels'
import OpenAIAnalytics from './pages/OpenAIAnalytics'
import OpenAITesting from './pages/OpenAITesting'
import OpenAITemplates from './pages/OpenAITemplates'
import OpenAISettings from './pages/OpenAISettings'
import OpenAIHistory from './pages/OpenAIHistory'

// Módulo AI Image Generation
import AIImageGeneration from './pages/AIImageGeneration'

// Módulo AI Video Generation
import AIVideoGeneration from './pages/AIVideoGeneration'

// Módulo AI Subplans (Paquetes de Tokens)
import AISubplans from './pages/AISubplans'

// FASE 4: Sistema de Permisos - Día 12
import PermissionsManager from './pages/PermissionsManager'

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
    <CssVarsProvider theme={chateamTheme} defaultMode="light">
      <CssBaseline />
      <Toaster position="top-right" expand={true} richColors />
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.body' }}>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />

          {/* Protected routes with AppLayout and RBAC permissions */}

          {/* Gestión */}
          <Route path="/" element={<ProtectedRoute module="dashboard"><Dashboard /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute module="reports"><Reports /></ProtectedRoute>} />
          <Route path="/realtime-chats" element={<ProtectedRoute module="realtime_chats"><RealtimeChats /></ProtectedRoute>} />

          {/* Operativo */}
          <Route path="/tickets" element={<ProtectedRoute module="tickets"><Tickets /></ProtectedRoute>} />
          <Route path="/quick-replies" element={<ProtectedRoute module="quick_replies"><QuickReplies /></ProtectedRoute>} />
          <Route path="/kanban" element={<ProtectedRoute module="kanban"><Kanban /></ProtectedRoute>} />
          <Route path="/contacts" element={<ProtectedRoute module="contacts"><Contacts /></ProtectedRoute>} />
          <Route path="/schedules" element={<ProtectedRoute module="schedules"><Schedules /></ProtectedRoute>} />
          <Route path="/tags" element={<ProtectedRoute module="tags"><Tags /></ProtectedRoute>} />
          <Route path="/tagsKanban" element={<ProtectedRoute module="tags"><TagsKanban /></ProtectedRoute>} />
          <Route path="/customer-origins" element={<ProtectedRoute module="customer_origins"><CustomerOrigins /></ProtectedRoute>} />
          <Route path="/customer-origins/reports" element={<ProtectedRoute module="customer_origins_reports"><CustomerOriginReports /></ProtectedRoute>} />
          <Route path="/internal-chats" element={<ProtectedRoute module="internal_chats"><InternalChats /></ProtectedRoute>} />

          {/* Administración - Campañas */}
          <Route path="/campaigns" element={<ProtectedRoute module="campaigns"><Campaigns /></ProtectedRoute>} />
          <Route path="/campaigns/contacts" element={<ProtectedRoute module="campaigns_contacts"><CampaignsContacts /></ProtectedRoute>} />
          <Route path="/campaigns/settings" element={<ProtectedRoute module="campaigns_settings"><CampaignsSettings /></ProtectedRoute>} />
          <Route path="/campaigns/insights" element={<ProtectedRoute module="campaigns_insights"><CampaignsInsights /></ProtectedRoute>} />
          <Route path="/campaigns/attribution" element={<ProtectedRoute module="campaigns_attribution"><CampaignsAttribution /></ProtectedRoute>} />
          <Route path="/campaigns/audit" element={<ProtectedRoute module="campaigns_audit"><CampaignsAudit /></ProtectedRoute>} />
          <Route path="/facebook-conversions" element={<ProtectedRoute module="facebook_conversions"><FacebookConversions /></ProtectedRoute>} />

          {/* Administración - Flowbuilder */}
          <Route path="/flowbuilder" element={<ProtectedRoute module="flowbuilder"><Flowbuilder /></ProtectedRoute>} />
          <Route path="/flowbuilder/campaign" element={<ProtectedRoute module="flowbuilder_campaign"><FlowbuilderCampaign /></ProtectedRoute>} />
          <Route path="/flowbuilder/conversation" element={<ProtectedRoute module="flowbuilder_conversation"><FlowbuilderConversation /></ProtectedRoute>} />
          <Route path="/flowbuilder/editor/:flowId" element={<ProtectedRoute module="flowbuilder_conversation"><FlowbuilderEditor /></ProtectedRoute>} />

          {/* Administración - Otros */}
          <Route path="/announcements" element={<ProtectedRoute module="announcements"><Announcements /></ProtectedRoute>} />
          <Route path="/api-messages" element={<ProtectedRoute module="api_messages"><ApiMessages /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute module="users"><Users /></ProtectedRoute>} />
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
          <Route path="/whatsapp/campaigns" element={<ProtectedRoute module="whatsapp_campaigns"><WhatsAppCampaigns /></ProtectedRoute>} />
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
          <Route path="/openai/prompts" element={<ProtectedRoute module="openai_prompts"><OpenAIPrompts /></ProtectedRoute>} />
          <Route path="/openai/models" element={<ProtectedRoute module="openai_models"><OpenAIModels /></ProtectedRoute>} />
          <Route path="/openai/analytics" element={<ProtectedRoute module="openai_analytics"><OpenAIAnalytics /></ProtectedRoute>} />
          <Route path="/openai/testing" element={<ProtectedRoute module="openai_testing"><OpenAITesting /></ProtectedRoute>} />
          <Route path="/openai/templates" element={<ProtectedRoute module="openai_templates"><OpenAITemplates /></ProtectedRoute>} />
          <Route path="/openai/settings" element={<ProtectedRoute module="openai_settings"><OpenAISettings /></ProtectedRoute>} />
          <Route path="/openai/history" element={<ProtectedRoute module="openai_history"><OpenAIHistory /></ProtectedRoute>} />

          {/* Módulo AI Image Generation */}
          <Route path="/ai-image-generation" element={<ProtectedRoute module="ai_image_generation"><AIImageGeneration /></ProtectedRoute>} />

          {/* Módulo AI Video Generation */}
          <Route path="/ai-video-generation" element={<ProtectedRoute module="ai_video_generation"><AIVideoGeneration /></ProtectedRoute>} />

          {/* Módulo AI Subplans (Paquetes de Tokens) */}
          <Route path="/ai/subplans" element={<ProtectedRoute module="ai_subplans"><AISubplans /></ProtectedRoute>} />

          {/* FASE 4: Sistema de Permisos (Día 12) */}
          <Route path="/permissions-manager" element={<ProtectedRoute module="permissions_manager"><PermissionsManager /></ProtectedRoute>} />

          {/* 404 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Box>
    </CssVarsProvider>
  )
}

export default App
