console.log("🔄 Loading database/index.ts...");
import { Sequelize } from "sequelize-typescript";
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

// Customer Origin (Origen de Cliente)
import CustomerOrigin from "../models/CustomerOrigin";

// Email Marketing Models (Acelle Mail)
import EmailCampaign from "../models/EmailMarketing/EmailCampaign";
import EmailCampaignRecipient from "../models/EmailMarketing/EmailCampaignRecipient";
import EmailTemplate from "../models/EmailMarketing/EmailTemplate";
import EmailTrackingEvent from "../models/EmailMarketing/EmailTrackingEvent";
import EmailProviderConfig from "../models/EmailMarketing/EmailProviderConfig";

// Attribution & Conversion Models
import AttributionTouchpoint from "../models/AttributionTouchpoint";
import ConversionDetection from "../models/ConversionDetection";
import AttributionConversion from "../models/AttributionConversion";
import ConversionItem from "../models/ConversionItem";
import Product from "../models/Product";
import AttributionResult from "../models/AttributionResult";
import AttributionChannelAggregate from "../models/AttributionChannelAggregate";

const sequelize = new Sequelize(dbConfig);

const models = [
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
  // Customer Origin (Origen de Cliente)
  CustomerOrigin,
  // Email Marketing Models (Acelle Mail)
  EmailCampaign,
  EmailCampaignRecipient,
  EmailTemplate,
  EmailTrackingEvent,
  EmailProviderConfig
];

console.log("🔄 Adding models to sequelize...");
sequelize.addModels(models);
console.log("✅ Database models loaded successfully");

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
