// console.log("🔄 Loading database/index.ts...");
import { Sequelize } from "sequelize-typescript";
import { installTenantScopeHooks } from "../helpers/tenantScope";
import User from "../models/User";
import Setting from "../models/Setting";
import Contact from "../models/Contact";
import Ticket from "../models/Ticket";
import Whatsapp from "../models/Whatsapp";
import Telegram from "../models/Telegram";
import TelegramQueue from "../models/TelegramQueue";
import ContactCustomField from "../models/ContactCustomField";
import Message from "../models/Message";
import Queue from "../models/Queue";
import WhatsappQueue from "../models/WhatsappQueue";
import UserQueue from "../models/UserQueue";
import Company from "../models/Company";
import Plan from "../models/Plan";
import TicketNote from "../models/TicketNote";
import QuickMessage from "../models/QuickMessage";
import Help from "../models/Help";
import TicketTraking from "../models/TicketTraking";
import UserRating from "../models/UserRating";
import Schedule from "../models/Schedule";
import Tag from "../models/Tag";
import TicketTag from "../models/TicketTag";
import ContactList from "../models/ContactList";
import ContactListItem from "../models/ContactListItem";
import Campaign from "../models/Campaign";
import CampaignSetting from "../models/CampaignSetting";
import Baileys from "../models/Baileys";
import CampaignShipping from "../models/CampaignShipping";
import Announcement from "../models/Announcement";
import Chat from "../models/Chat";
import ChatUser from "../models/ChatUser";
import ChatMessage from "../models/ChatMessage";
import Chatbot from "../models/Chatbot";
import DialogChatBots from "../models/DialogChatBots";
import QueueIntegrations from "../models/QueueIntegrations";
import Invoices from "../models/Invoices";
import Subscriptions from "../models/Subscriptions";
import ApiUsages from "../models/ApiUsages";
import ApiFailedMessage from "../models/ApiFailedMessage";
import Files from "../models/Files";
import FilesOptions from "../models/FilesOptions";
import ContactTag from "../models/ContactTag";
import CompaniesSettings from "../models/CompaniesSettings";
import LogTicket from "../models/LogTicket";
import Prompt from "../models/Prompt";
import PromptQueue from "../models/PromptQueue";
import Partner from "../models/Partner";
import ContactWallet from "../models/ContactWallet";
import ScheduledMessages from "../models/ScheduledMessages";
import ScheduledMessagesEnvio from "../models/ScheduledMessagesEnvio";
import Versions from "../models/Versions";
import { FlowDefaultModel } from "../models/FlowDefault";
import { FlowBuilderModel } from "../models/FlowBuilder";
import { FlowAudioModel } from "../models/FlowAudio";
import { FlowCampaignModel } from "../models/FlowCampaign";
import { FlowImgModel } from "../models/FlowImg";
import { WebhookModel } from "../models/Webhook";
import Receipt from "../models/Receipt";
// eslint-disable-next-line
import dbConfig from "../config/database";
import CompanyTokenUsage from "../models/CompanyTokenUsage";
import Session from "../models/Session";
import AIProviderConfig from "../models/AIProviderConfig";
import AIPromptTemplate from "../models/AIPromptTemplate";
import WebChatWidget from "../models/WebChatWidget";
import WebChatConversation from "../models/WebChatConversation";
import WebChatConversationMessage from "../models/WebChatConversationMessage";
import WhatsAppTemplate from "../models/WhatsAppTemplate";

// Appointment Models
import Appointment from "../models/Appointments/Appointment";
import AppointmentServiceModel from "../models/AppointmentService";
import AppointmentAvailability from "../models/Appointments/AppointmentAvailability";
import AppointmentReminder from "../models/Appointments/AppointmentReminder";
import AppointmentBlock from "../models/Appointments/AppointmentBlock";
import AppointmentCalendarSync from "../models/Appointments/AppointmentCalendarSync";
import AppointmentAISuggestion from "../models/Appointments/AppointmentAISuggestion";
import AppointmentAnalytics from "../models/Appointments/AppointmentAnalytics";
import ReminderTemplate from "../models/Appointments/ReminderTemplate";

// Facebook Conversions API Models
import FacebookDataset from "../models/FacebookDataset";
import FacebookConversionEvent from "../models/FacebookConversionEvent";
import KanbanLeadConversionEvent from "../models/KanbanLeadConversionEvent";
import CompanyMetaConversionSetting from "../models/CompanyMetaConversionSetting";

// AI Image Generation Models
import AIImageGeneration from "../models/AIImageGeneration";
import AIImageGenerationItem from "../models/AIImageGenerationItem";
import AIImageCreditTransaction from "../models/AIImageCreditTransaction";

// AI Video Generation Models
import AIVideoGeneration from "../models/AIVideoGeneration";
import AIVideoGenerationItem from "../models/AIVideoGenerationItem";
import AIVideoCreditTransaction from "../models/AIVideoCreditTransaction";

// AI Subplans (Paquetes de Tokens)
import AISubplan from "../models/AISubplan";
import AiTokenPlan from "../models/AiTokenPlan";
import AiTokenTransaction from "../models/AiTokenTransaction";

// Campaign Recommendations (IA Audit)
import CampaignRecommendation from "../models/CampaignRecommendation";

// Campaign Messages (mensajes de anuncios de Facebook/Meta)
import CampaignMessage from "../models/CampaignMessage";
import InsightsDaily from "../models/InsightsDaily"; // [Fase2·D5.1]

// Customer Origin (Origen de Cliente)
import CustomerOrigin from "../models/CustomerOrigin";

// Email Marketing Models (Acelle Mail)
import EmailCampaign from "../models/EmailMarketing/EmailCampaign";
import EmailCampaignRecipient from "../models/EmailMarketing/EmailCampaignRecipient";
import EmailTemplate from "../models/EmailMarketing/EmailTemplate";
import EmailTrackingEvent from "../models/EmailMarketing/EmailTrackingEvent";
import EmailProviderConfig from "../models/EmailMarketing/EmailProviderConfig";
import EmailAutomation from "../models/EmailMarketing/EmailAutomation";
import EmailAbTest from "../models/EmailMarketing/EmailAbTest";

// Attribution & Conversion Models
import AttributionTouchpoint from "../models/AttributionTouchpoint";
import ConversionDetection from "../models/ConversionDetection";
import AttributionConversion from "../models/AttributionConversion";
import ConversionItem from "../models/ConversionItem";
import Product from "../models/Product";
import AttributionResult from "../models/AttributionResult";
import AttributionChannelAggregate from "../models/AttributionChannelAggregate";

// Kanban Movement Log
import KanbanMovementLog from "../models/KanbanMovementLog";

// Comment Auto-Reply
import CommentAutoReplyCampaign from "../models/CommentAutoReplyCampaign";
import CommentAutoReplyLog from "../models/CommentAutoReplyLog";
// Módulo Comentarios Sociales (SocialComments) — settings de modo de respuesta
import CommentResponseSettings from "../models/CommentResponseSettings";

// AI Credit System (Tipos, Balances, Asignaciones, Transacciones)
import AICreditType from "../models/AICreditType";
import AICreditBalance from "../models/AICreditBalance";
import PlanCreditAllocation from "../models/PlanCreditAllocation";
import AICreditTransaction from "../models/AICreditTransaction";

// Email Plans System
import EmailPlan from "../models/EmailPlan";
import CompanyEmailPlan from "../models/CompanyEmailPlan";

// AI Affiliates & MLM
import AIAffiliateProgram from "../models/AIAffiliateProgram";
import AIAffiliateReferral from "../models/AIAffiliateReferral";
import AffiliateTier from "../models/AffiliateTier";
import AffiliateWallet from "../models/AffiliateWallet";
import AffiliateTransaction from "../models/AffiliateTransaction";
import AffiliateWithdrawal from "../models/AffiliateWithdrawal";
import AffiliateLink from "../models/AffiliateLink";
// Meta Ads Agent Models
import MetaAgentPlan from "../models/MetaAgentPlan";
import MetaAgentActionLog from "../models/MetaAgentActionLog";
import MetaOfficialMcpConnection from "../models/MetaOfficialMcpConnection";
// UGC Models
import UGCCampaign from "../models/UGCCampaign";
import UGCVideoJob from "../models/UGCVideoJob";
import UGCVideoAsset from "../models/UGCVideoAsset";
import UGCCreator from "../models/UGCCreator";
import UGCCreatorAssignment from "../models/UGCCreatorAssignment";
import UGCCreatorPayment from "../models/UGCCreatorPayment";
import UGCSocialAccount from "../models/UGCSocialAccount";
import UGCSocialPost from "../models/UGCSocialPost";
import UGCCreativeLearning from "../models/UGCCreativeLearning";
import UGCCreativeVariant from "../models/UGCCreativeVariant";
import UGCCampaignMetric from "../models/UGCCampaignMetric";
import UGCPostComment from "../models/UGCPostComment";

// Agent Models (Identity, Memory, ProfilePhoto)
import AgentIdentity from "../models/AgentIdentity";
import AgentMemory from "../models/AgentMemory";
import AgentProfilePhoto from "../models/AgentProfilePhoto";
// Contact Memory (Aprendizaje de conversaciones)
import ContactMemory from "../models/ContactMemory";

// Integration Models
import IntegrationProvider from "../models/Integrations/IntegrationProvider";
import IntegrationConnection from "../models/Integrations/IntegrationConnection";
import IntegrationSyncLog from "../models/Integrations/IntegrationSyncLog";
import IntegrationWebhookEvent from "../models/Integrations/IntegrationWebhookEvent";
import IntegrationEntityMapping from "../models/Integrations/IntegrationEntityMapping";
import IntegrationApiRequest from "../models/Integrations/IntegrationApiRequest";
import AISupportCorrection from "../models/AISupportCorrection";
import AIHistoricalQA from "../models/AIHistoricalQA";
// Sprint 1 (2026-05-20) — Loop de Aprendizaje desde Correcciones Humanas
import AICorrectionReviewQueue from "../models/AICorrectionReviewQueue";
import AICorrectionLearned from "../models/AICorrectionLearned";
// FASE 2 Coexistencia WhatsApp — ledger de eventos inbound para dedupe e idempotencia
import InboundEventLedger from "../models/InboundEventLedger";
// FASE 3 Coexistencia WhatsApp — identidad unificada
import UnifiedConversation from "../models/UnifiedConversation";
import ContactBinding from "../models/ContactBinding";
// FASE 6 Coexistencia WhatsApp — auditoría de dispatches salientes
import OutboundDispatch from "../models/OutboundDispatch";

// Notifications (centro de notificaciones in-app)
import Notification from "../models/Notification";
// [Barrido] Modelos VIVOS que nunca se registraron => sus servicios reventaban con
// "Model not initialized". Medido en produccion: /queue-options daba 500 y la tabla
// CampaignAlerts llevaba 0 filas porque createAlert fallaba SIEMPRE.
import QueueOption from "../models/QueueOption";
import CampaignAlert from "../models/CampaignAlert";
import CampaignRule from "../models/CampaignRule";
import CampaignRuleLog from "../models/CampaignRuleLog";
import AgentDevice from "../models/AgentDevice";
import AgentInteraction from "../models/AgentInteraction";
import SmartPlug from "../models/SmartPlug"; // [Smart Plug · Ola A]
import ContactTemperature from "../models/ContactTemperature";
import RecommendationRun from "../models/RecommendationRun"; // [Ola D · G0]
import CampaignApproval from "../models/CampaignApproval"; // [Ola F · F2.1]
import SensitiveCategory from "../models/SensitiveCategory"; // [Ola H · H.1]
import CommentModerationAudit from "../models/CommentModerationAudit"; // [Ola H · H.5]
import MetaAuditLog from "../models/MetaAuditLog"; // [N5]
import ImpersonationAudit from "../models/ImpersonationAudit"; // [Super]
import CompanyUser from "../models/CompanyUser"; // [Multi-empresa] membresías usuario↔empresa
import CompanyUserQueue from "../models/CompanyUserQueue"; // [Multi-empresa] colas por membresía

// AI Platform Models (batch)
import AIDocument from "../models/AIDocument";
import AIChunk from "../models/AIChunk";
import AISemanticCache from "../models/AISemanticCache";
import AIEntity from "../models/AIEntity";
import AIAgentConfig from "../models/AIAgentConfig";
import AIAgentAssignment from "../models/AIAgentAssignment";
import AIAgentLog from "../models/AIAgentLog";
import AITeam from "../models/AITeam";
import AITeamMember from "../models/AITeamMember";
import AIChatbotConfig from "../models/AIChatbotConfig";
import AIChatbotDataSource from "../models/AIChatbotDataSource";
import AIChatbotDomain from "../models/AIChatbotDomain";
import AIExtension from "../models/AIExtension";
import AICompanyExtension from "../models/AICompanyExtension";
import AIEmailTemplate from "../models/AIEmailTemplate";
import AIScheduledTask from "../models/AIScheduledTask";
import AIFineTuningJob from "../models/AIFineTuningJob";
import AIABTest from "../models/AIABTest";
import AIABTestVariant from "../models/AIABTestVariant";
import AITrace from "../models/AITrace";
import AISpan from "../models/AISpan";
import AIUsageMetric from "../models/AIUsageMetric";
import AITurnEvent from "../models/AITurnEvent";
import UserTermsAcceptance from "../models/UserTermsAcceptance"; // [Fase A] faltaba registrar -> /settings/terms/stats daba 500
import AutomationRule from "../models/AutomationRule"; // [Fase E] motor de reglas de ticket
import Role from "../models/Role"; // [Fase3·N2.0] roles configurables por empresa

const sequelize = new Sequelize(dbConfig);

const models = [
  UserTermsAcceptance,
  AutomationRule,
  Role,
  Company,
  User,
  Contact,
  ContactTag,
  Ticket,
  Message,
  Whatsapp,
  Telegram,
  TelegramQueue,
  ContactCustomField,
  Setting,
  Queue,
  WhatsappQueue,
  UserQueue,
  Plan,
  TicketNote,
  QuickMessage,
  Help,
  TicketTraking,
  UserRating,
  Schedule,
  Tag,
  TicketTag,
  ContactList,
  ContactListItem,
  Campaign,
  CampaignSetting,
  Baileys,
  CampaignShipping,
  Announcement,
  Chat,
  ChatUser,
  ChatMessage,
  Chatbot,
  DialogChatBots,
  QueueIntegrations,
  Invoices,
  Subscriptions,
  ApiUsages,
  ApiFailedMessage,
  Files,
  FilesOptions,
  CompaniesSettings,
  LogTicket,
  Prompt,
  PromptQueue,
  Partner,
  ContactWallet,
  ScheduledMessages,
  ScheduledMessagesEnvio,
  Versions,
  FlowDefaultModel,
  FlowBuilderModel,
  FlowAudioModel,
  FlowCampaignModel,
  FlowImgModel,
  WebhookModel,
  Receipt,
  CompanyTokenUsage,
  Session,
  AIProviderConfig,
  AIPromptTemplate,
  WebChatWidget,
  WebChatConversation,
  WebChatConversationMessage,
  WhatsAppTemplate,
  // Appointment Models
  AppointmentServiceModel,
  Appointment,
  AppointmentAvailability,
  AppointmentReminder,
  AppointmentBlock,
  AppointmentCalendarSync,
  AppointmentAISuggestion,
  AppointmentAnalytics,
  ReminderTemplate,
  // Facebook Conversions API Models
  FacebookDataset,
  FacebookConversionEvent,
  KanbanLeadConversionEvent,
  CompanyMetaConversionSetting,
  // AI Image Generation Models
  AIImageGeneration,
  AIImageGenerationItem,
  AIImageCreditTransaction,
  // AI Video Generation Models
  AIVideoGeneration,
  AIVideoGenerationItem,
  AIVideoCreditTransaction,
  // AI Subplans (Paquetes de Tokens)
  AISubplan,
  AiTokenPlan,
  AiTokenTransaction,
  // Attribution & Conversion Models
  AttributionTouchpoint,
  ConversionDetection,
  AttributionConversion,
  ConversionItem,
  Product,
  AttributionResult,
  AttributionChannelAggregate,
  // Campaign Recommendations (IA Audit)
  CampaignRecommendation,
  // Campaign Messages (mensajes de anuncios de Facebook/Meta)
  CampaignMessage,
  InsightsDaily,
  // Customer Origin (Origen de Cliente)
  CustomerOrigin,
  // Email Marketing Models (Acelle Mail)
  EmailCampaign,
  EmailCampaignRecipient,
  EmailTemplate,
  EmailTrackingEvent,
  EmailProviderConfig,
  // Email Marketing Phase 4 (Automation + A/B Testing)
  EmailAutomation,
  EmailAbTest,
  // Kanban Movement Log
  KanbanMovementLog,
  // AI Affiliates & MLM
  AIAffiliateProgram,
  AIAffiliateReferral,
  AffiliateTier,
  AffiliateWallet,
  AffiliateTransaction,
  AffiliateWithdrawal,
  AffiliateLink,
  // Meta Ads Agent
  MetaAgentPlan,
  MetaAgentActionLog,
  MetaOfficialMcpConnection,
  // Comment Auto-Reply
  CommentAutoReplyCampaign,
  CommentAutoReplyLog,
  // Módulo Comentarios Sociales (SocialComments) — settings de modo de respuesta
  CommentResponseSettings,
  // AI Credit System (Tipos, Balances, Asignaciones, Transacciones)
  AICreditType,
  AICreditBalance,
  PlanCreditAllocation,
  AICreditTransaction,
  // Email Plans System
  EmailPlan,
  CompanyEmailPlan,
  // AI Platform Models (batch)
  AIDocument,
  AIChunk,
  AISemanticCache,
  AIEntity,
  AIAgentConfig,
  AIAgentAssignment,
  AIAgentLog,
  AITeam,
  AITeamMember,
  AIChatbotConfig,
  AIChatbotDataSource,
  AIChatbotDomain,
  AIExtension,
  AICompanyExtension,
  AIEmailTemplate,
  AIScheduledTask,
  AIFineTuningJob,
  AIABTest,
  AIABTestVariant,
  AITrace,
  AISpan,
  AIUsageMetric,
  AITurnEvent,
  // UGC Models
  UGCCampaign,
  UGCVideoJob,
  UGCVideoAsset,
  UGCCreator,
  UGCCreatorAssignment,
  UGCCreatorPayment,
  UGCSocialAccount,
  UGCSocialPost,
  UGCCreativeLearning,
  UGCCreativeVariant,
  UGCCampaignMetric,
  UGCPostComment,
  // Agent Models (Identity, Memory, ProfilePhoto)
  AgentIdentity,
  AgentMemory,
  AgentProfilePhoto,
  // Contact Memory (Aprendizaje de conversaciones)
  ContactMemory,
  // Integration Models
  IntegrationProvider,
  IntegrationConnection,
  IntegrationSyncLog,
  IntegrationWebhookEvent,
  IntegrationEntityMapping,
  IntegrationApiRequest,
  AISupportCorrection,
  AIHistoricalQA,
  // Sprint 1 (2026-05-20) — Loop de Aprendizaje desde Correcciones Humanas
  AICorrectionReviewQueue,
  AICorrectionLearned,
  // FASE 2 Coexistencia WhatsApp
  InboundEventLedger,
  // FASE 3 Coexistencia WhatsApp
  UnifiedConversation,
  ContactBinding,
  // FASE 6 Coexistencia WhatsApp
  OutboundDispatch,
  // Notifications (centro de notificaciones in-app)
  Notification,
  // [Barrido] Registro de los modelos vivos que faltaban (ver imports arriba).
  QueueOption,
  CampaignAlert,
  CampaignRule,
  CampaignRuleLog,
  AgentDevice,
  AgentInteraction,
  SmartPlug,
  ContactTemperature,
  RecommendationRun,
  CampaignApproval,
  SensitiveCategory,
  CommentModerationAudit,
  MetaAuditLog,
  ImpersonationAudit,
  CompanyUser,
  CompanyUserQueue,
];

// console.log("🔄 Adding models to sequelize...");
sequelize.addModels(models);
// console.log("✅ Database models loaded successfully");

// [W1-SEC-IDOR] Guard estructural de aislamiento multi-tenant: inyecta companyId
// en toda query ORM de modelos tenant-scoped para requests HTTP autenticados
// no-super. Cierra de forma sistémica el IDOR cross-tenant (jobs/webhooks exentos).
installTenantScopeHooks(models);

// ⚙️ Inicializar hooks después de cargar modelos
// Hook: Cuando se actualiza un provider, actualizar todos sus prompts
AIProviderConfig.addHook('afterUpdate', async (instance) => {
  try {
    // Cast to AIProviderConfig to access typed properties
    const provider = instance as AIProviderConfig;

    console.log(`[AIProviderConfig] Provider ${provider.id} actualizado, sincronizando prompts...`);

    // Obtener todos los prompts que usan este provider
    const prompts = await Prompt.findAll({
      where: {
        aiProviderId: provider.id,
        companyId: provider.companyId
      }
    });

    if (prompts.length === 0) {
      console.log(`[AIProviderConfig] No hay prompts asociados al provider ${provider.id}`);
      return;
    }

    console.log(`[AIProviderConfig] Encontrados ${prompts.length} prompts para sincronizar`);

    // Actualizar cada prompt con los nuevos datos del provider
    const updatePromises = prompts.map(prompt =>
      prompt.update({
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl || provider.settings?.baseUrl,
        capabilities: {
          textGenerationEnabled: provider.textGenerationEnabled,
          translationEnabled: provider.translationEnabled,
          imageGenerationEnabled: provider.imageGenerationEnabled,
          imageAnalysisEnabled: provider.imageAnalysisEnabled,
          speechToTextEnabled: provider.speechToTextEnabled
        }
      })
    );

    await Promise.all(updatePromises);

    console.log(`[AIProviderConfig] ✅ ${prompts.length} prompts sincronizados exitosamente`);
  } catch (error: any) {
    console.error(`[AIProviderConfig] Error sincronizando prompts:`, error.message);
    // No lanzar error para no romper la actualización del provider
  }
});

export default sequelize;
