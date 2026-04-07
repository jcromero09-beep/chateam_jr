// console.log("🛣️ [0] Starting routes/index.ts...");
import { Router, Request, Response } from "express";
import isAuth from "../middleware/isAuth";
// console.log("🛣️ [0] ✅ Router OK");

// console.log("🛣️ [1] userRoutes...");
import userRoutes from "./userRoutes";
// console.log("🛣️ [1] ✅ userRoutes OK");

// console.log("🛣️ [2] authRoutes...");
import authRoutes from "./authRoutes";
// console.log("🛣️ [2] ✅ authRoutes OK");

// console.log("🛣️ [3] settingRoutes...");
import settingRoutes from "./settingRoutes";
// console.log("🛣️ [3] ✅ settingRoutes OK");

// console.log("🛣️ [4] contactRoutes...");
import contactRoutes from "./contactRoutes";
// console.log("🛣️ [4] ✅ contactRoutes OK");

// console.log("🛣️ [5] ticketRoutes...");
import ticketRoutes from "./ticketRoutes";
// console.log("🛣️ [5] ✅ ticketRoutes OK");

// console.log("🛣️ [6] whatsappRoutes...");
import whatsappRoutes from "./whatsappRoutes";
// console.log("🛣️ [6] ✅ whatsappRoutes OK");

// console.log("🛣️ [7] messageRoutes...");
import messageRoutes from "./messageRoutes";
// console.log("🛣️ [7] ✅ messageRoutes OK");

// console.log("🛣️ [8] whatsappSessionRoutes...");
import whatsappSessionRoutes from "./whatsappSessionRoutes";
// console.log("🛣️ [8] ✅ whatsappSessionRoutes OK");

// console.log("🛣️ [9] telegramRoutes...");
import telegramRoutes from "./telegramRoutes";
// console.log("🛣️ [9] ✅ telegramRoutes OK");

// console.log("🛣️ [9.1] tiktokRoutes...");
import tiktokRoutes from "./tiktokRoutes";
// console.log("🛣️ [9.1] ✅ tiktokRoutes OK");

// console.log("🛣️ [10] queueRoutes...");
import queueRoutes from "./queueRoutes";
// console.log("🛣️ [10] ✅ queueRoutes OK");

// console.log("🛣️ [11] companyRoutes...");
import companyRoutes from "./companyRoutes";
// console.log("🛣️ [11] ✅ companyRoutes OK");

// console.log("🛣️ [12] planRoutes...");
import planRoutes from "./planRoutes";
// console.log("🛣️ [12] ✅ planRoutes OK");

// console.log("🛣️ [13] ticketNoteRoutes...");
import ticketNoteRoutes from "./ticketNoteRoutes";
// console.log("🛣️ [13] ✅ ticketNoteRoutes OK");

// console.log("🛣️ [14] quickMessageRoutes...");
import quickMessageRoutes from "./quickMessageRoutes";
// console.log("🛣️ [14] ✅ quickMessageRoutes OK");

// console.log("🛣️ [15] helpRoutes...");
import helpRoutes from "./helpRoutes";
// console.log("🛣️ [15] ✅ helpRoutes OK");

// console.log("🛣️ [16] dashboardRoutes...");
import dashboardRoutes from "./dashboardRoutes";
// console.log("🛣️ [16] ✅ dashboardRoutes OK");

// console.log("🛣️ [17] scheduleRoutes...");
import scheduleRoutes from "./scheduleRoutes";
// console.log("🛣️ [17] ✅ scheduleRoutes OK");

// console.log("🛣️ [18] tagRoutes...");
import tagRoutes from "./tagRoutes";
// console.log("🛣️ [18] ✅ tagRoutes OK");

// console.log("🛣️ [19] contactListRoutes...");
import contactListRoutes from "./contactListRoutes";
// console.log("🛣️ [19] ✅ contactListRoutes OK");

// console.log("🛣️ [20] contactListItemRoutes...");
import contactListItemRoutes from "./contactListItemRoutes";
// console.log("🛣️ [20] ✅ contactListItemRoutes OK");

// console.log("🛣️ [21] campaignRoutes...");
import campaignRoutes from "./campaignRoutes";
// console.log("🛣️ [21] ✅ campaignRoutes OK");

// console.log("🛣️ [22] campaignSettingRoutes...");
import campaignSettingRoutes from "./campaignSettingRoutes";
// console.log("🛣️ [22] ✅ campaignSettingRoutes OK");

// console.log("🛣️ [23] announcementRoutes...");
import announcementRoutes from "./announcementRoutes";
// console.log("🛣️ [23] ✅ announcementRoutes OK");

// console.log("🛣️ [24] chatRoutes...");
import chatRoutes from "./chatRoutes";
// console.log("🛣️ [24] ✅ chatRoutes OK");

// console.log("🛣️ [25] queueIntegrationRoutes...");
import queueIntegrationRoutes from "./queueIntegrationRoutes";
// console.log("🛣️ [25] ✅ queueIntegrationRoutes OK");

// console.log("🛣️ [26] chatBotRoutes...");
import chatBotRoutes from "./chatBotRoutes";
// console.log("🛣️ [26] ✅ chatBotRoutes OK");

// console.log("🛣️ [27] webHookRoutes...");
import webHookRoutes from "./webHookRoutes";
// console.log("🛣️ [27] ✅ webHookRoutes OK");

// console.log("🛣️ [28] subScriptionRoutes...");
import subScriptionRoutes from "./subScriptionRoutes";
// console.log("🛣️ [28] ✅ subScriptionRoutes OK");

// console.log("🛣️ [29] invoiceRoutes...");
import invoiceRoutes from "./invoicesRoutes";
// console.log("🛣️ [29] ✅ invoiceRoutes OK");

// console.log("🛣️ [30] apiRoutes...");
import apiRoutes from "./apiRoutes";
// console.log("🛣️ [30] ✅ apiRoutes OK");

// console.log("🛣️ [31] versionRouter...");
import versionRouter from "./versionRoutes";
// console.log("🛣️ [31] ✅ versionRouter OK");

// console.log("🛣️ [32] filesRoutes...");
import filesRoutes from "./filesRoutes";
// console.log("🛣️ [32] ✅ filesRoutes OK");

// console.log("🛣️ [33] queueOptionRoutes...");
import queueOptionRoutes from "./queueOptionRoutes";
// console.log("🛣️ [33] ✅ queueOptionRoutes OK");

// console.log("🛣️ [34] ticketTagRoutes...");
import ticketTagRoutes from "./ticketTagRoutes";
// console.log("🛣️ [34] ✅ ticketTagRoutes OK");

// console.log("🛣️ [35] apiCompanyRoutes...");
import apiCompanyRoutes from "./api/apiCompanyRoutes";
// console.log("🛣️ [35] ✅ apiCompanyRoutes OK");

// console.log("🛣️ [36] apiContactRoutes...");
import apiContactRoutes from "./api/apiContactRoutes";
// console.log("🛣️ [36] ✅ apiContactRoutes OK");

// console.log("🛣️ [37] apiMessageRoutes...");
import apiMessageRoutes from "./api/apiMessageRoutes";
// console.log("🛣️ [37] ✅ apiMessageRoutes OK");

// console.log("🛣️ [38] companySettingsRoutes...");
import companySettingsRoutes from "./companySettingsRoutes";
// console.log("🛣️ [38] ✅ companySettingsRoutes OK");

// console.log("🛣️ [39] receiptsRoutes...");
import receiptsRoutes from "./recepts";
// console.log("🛣️ [39] ✅ receiptsRoutes OK");

// console.log("🛣️ [40] promptRoutes...");
import promptRoutes from "./promptRouter";
// console.log("🛣️ [40] ✅ promptRoutes OK");

// console.log("🛣️ [41] statisticsRoutes...");
import statisticsRoutes from "./statisticsRoutes";
// console.log("🛣️ [41] ✅ statisticsRoutes OK");

// console.log("🛣️ [42] scheduleMessageRoutes...");
import scheduleMessageRoutes from "./ScheduledMessagesRoutes";
// console.log("🛣️ [42] ✅ scheduleMessageRoutes OK");

// console.log("🛣️ [43] flowDefaultRoutes...");
import flowDefaultRoutes from "./flowDefaultRoutes";
// console.log("🛣️ [43] ✅ flowDefaultRoutes OK");

// console.log("🛣️ [44] flowBuilder...");
import flowBuilder from "./flowBuilderRoutes";
// console.log("🛣️ [44] ✅ flowBuilder OK");

// console.log("🛣️ [45] flowCampaignRoutes...");
import flowCampaignRoutes from "./flowCampaignRoutes";
// console.log("🛣️ [45] ✅ flowCampaignRoutes OK");

// console.log("🛣️ [46] whatsappMonitorRoutes...");
import whatsappMonitorRoutes from "./whatsappMonitorRoutes";
// console.log("🛣️ [46] ✅ whatsappMonitorRoutes OK");

// console.log("🛣️ [47] whatsappMetaDashboardRoutes...");
import whatsappMetaDashboardRoutes from "./whatsappMetaDashboardRoutes";
// console.log("🛣️ [47] ✅ whatsappMetaDashboardRoutes OK");

// console.log("🛣️ [47.5] whatsappCoexistenceRoutes...");
import whatsappCoexistenceRoutes from "./whatsappCoexistenceRoutes";
// console.log("🛣️ [47.5] ✅ whatsappCoexistenceRoutes OK");

// console.log("🛣️ [48] whatsappTemplateRoutes...");
import whatsappTemplateRoutes from "./whatsappTemplateRoutes";
// console.log("🛣️ [48] ✅ whatsappTemplateRoutes OK");

// console.log("🛣️ [49] aiConfigRoutes...");
import aiConfigRoutes from "./aiConfigRoutes";
// console.log("🛣️ [49] ✅ aiConfigRoutes OK");

// console.log("🛣️ [50] aiImageGenerationRoutes...");
import aiImageGenerationRoutes from "./aiImageGenerationRoutes";
// console.log("🛣️ [50] ✅ aiImageGenerationRoutes OK");

// console.log("🛣️ [50b] aiVideoGenerationRoutes...");
import aiVideoGenerationRoutes from "./aiVideoGenerationRoutes";
// console.log("🛣️ [50b] ✅ aiVideoGenerationRoutes OK");

// console.log("🛣️ [51] aiSubplanRoutes...");
import aiSubplanRoutes from "./aiSubplanRoutes";
// console.log("🛣️ [51] ✅ aiSubplanRoutes OK");

// console.log("🛣️ [51.1] aiSubplanPurchaseRoutes...");
import aiSubplanPurchaseRoutes from "./aiSubplanPurchaseRoutes";
// console.log("🛣️ [51.1] ✅ aiSubplanPurchaseRoutes OK");

// console.log("🛣️ [51.2] aiCreditRoutes...");
import aiCreditRoutes from "./aiCreditRoutes";
// console.log("🛣️ [51.2] ✅ aiCreditRoutes OK");

// console.log("🛣️ [51.3] aiCostRoutes...");
import aiCostRoutes from "./aiCostRoutes";
// console.log("🛣️ [51.3] ✅ aiCostRoutes OK");

// console.log("🛣️ [51.4] aiAgentRoutes...");
import aiAgentRoutes from "./aiAgentRoutes";
// console.log("🛣️ [51.4] ✅ aiAgentRoutes OK");

// console.log("🛣️ [51.5] aiAgentAssignmentRoutes...");
import aiAgentAssignmentRoutes from "./aiAgentAssignmentRoutes";
// console.log("🛣️ [51.5] ✅ aiAgentAssignmentRoutes OK");

// console.log("🛣️ [51.55] agentIdentityRoutes...");
import agentIdentityRoutes from "./agentIdentityRoutes";
// console.log("🛣️ [51.55] ✅ agentIdentityRoutes OK");

// console.log("🛣️ [51.6] ugcCampaignRoutes...");
import ugcCampaignRoutes from "./ugcCampaignRoutes";
// console.log("🛣️ [51.6] ✅ ugcCampaignRoutes OK");

// console.log("🛣️ [51.7] ugcCreatorRoutes...");
import ugcCreatorRoutes from "./ugcCreatorRoutes";
// console.log("🛣️ [51.7] ✅ ugcCreatorRoutes OK");

// console.log("🛣️ [51.8] ugcVideoRoutes...");
import ugcVideoRoutes from "./ugcVideoRoutes";
// console.log("🛣️ [51.8] ✅ ugcVideoRoutes OK");

// console.log("🛣️ [51.9] ugcSocialRoutes...");
import ugcSocialRoutes from "./ugcSocialRoutes";
// console.log("🛣️ [51.9] ✅ ugcSocialRoutes OK");

// console.log("🛣️ [51.10] ugcOptimizationRoutes...");
import ugcOptimizationRoutes from "./ugcOptimizationRoutes";
// console.log("🛣️ [51.10] ✅ ugcOptimizationRoutes OK");

// console.log("🛣️ [52] webChatWidgetRoutes...");
import webChatWidgetRoutes from "./webChatWidgetRoutes";
// console.log("🛣️ [52] ✅ webChatWidgetRoutes OK");

// console.log("🛣️ [53] appointmentRoutes...");
import appointmentRoutes from "./appointmentRoutes";
// console.log("🛣️ [53] ✅ appointmentRoutes OK");

// console.log("🛣️ [54] paypalRoutes...");
import paypalRoutes from "./paypalRoutes";
// console.log("🛣️ [54] ✅ paypalRoutes OK");

// console.log("🛣️ [55] financialRoutes...");
import financialRoutes from "./financialRoutes";
// console.log("🛣️ [55] ✅ financialRoutes OK");

// console.log("🛣️ [56] facebookConversionRoutes...");
import facebookConversionRoutes from "./facebookConversionRoutes";
// console.log("🛣️ [56] ✅ facebookConversionRoutes OK");

// console.log("🛣️ [57] attributionRoutes...");
import attributionRoutes from "./attributionRoutes";
// console.log("🛣️ [57] ✅ attributionRoutes OK");

// console.log("🛣️ [57.5] campaignRuleRoutes...");
import campaignRuleRoutes from "./campaignRuleRoutes";
// console.log("🛣️ [57.5] ✅ campaignRuleRoutes OK");

// console.log("🛣️ [58] metaMarketingRoutes...");
import metaMarketingRoutes from "./metaMarketingRoutes";
// console.log("🛣️ [58] ✅ metaMarketingRoutes OK");

// console.log("🛣️ [59] campaignAuditRoutes...");
import campaignAuditRoutes from "./campaignAuditRoutes";
// console.log("🛣️ [59] ✅ campaignAuditRoutes OK");

// console.log("🛣️ [60] campaignMessageRoutes...");
import campaignMessageRoutes from "./campaignMessageRoutes";
// console.log("🛣️ [60] ✅ campaignMessageRoutes OK");

// console.log("🛣️ [61] customerOriginRoutes...");
import customerOriginRoutes from "./customerOriginRoutes";
// console.log("🛣️ [61] ✅ customerOriginRoutes OK");

// console.log("🛣️ [62] emailCampaignRoutes...");
import emailCampaignRoutes from "./emailCampaignRoutes";
// console.log("🛣️ [62] ✅ emailCampaignRoutes OK");

// console.log("🛣️ [63] emailProviderConfigRoutes...");
import emailProviderConfigRoutes from "./emailProviderConfigRoutes";
// console.log("🛣️ [63] ✅ emailProviderConfigRoutes OK");

// console.log("🛣️ [64] emailTrackingRoutes...");
import emailTrackingRoutes from "./emailTrackingRoutes";
// console.log("🛣️ [64] ✅ emailTrackingRoutes OK");

// console.log("🛣️ [65] emailAnalyticsRoutes...");
import emailAnalyticsRoutes from "./emailAnalyticsRoutes";
// console.log("🛣️ [65] ✅ emailAnalyticsRoutes OK");

// console.log("🛣️ [66] emailAutomationRoutes...");
import emailAutomationRoutes from "./emailAutomationRoutes";
// console.log("🛣️ [66] ✅ emailAutomationRoutes OK");

// console.log("🛣️ [67] aiAffiliateRoutes...");
import aiAffiliateRoutes from "./aiAffiliateRoutes";
// console.log("🛣️ [67] ✅ aiAffiliateRoutes OK");

// console.log("🛣️ [68] affiliateRoutes...");
import affiliateRoutes from "./affiliateRoutes";
// console.log("🛣️ [68] ✅ affiliateRoutes OK");

// console.log("🛣️ [69] commentAutoReplyRoutes...");
import commentAutoReplyRoutes from "./commentAutoReplyRoutes";
// console.log("🛣️ [69] ✅ commentAutoReplyRoutes OK");

// ── BATCH: Rutas AI faltantes ──
// console.log("🛣️ [70] aiChatbotRoutes...");
import aiChatbotRoutes from "./aiChatbotRoutes";
// console.log("🛣️ [70] ✅ aiChatbotRoutes OK");

// console.log("🛣️ [71] aiChatbotDomainRoutes...");
import aiChatbotDomainRoutes from "./aiChatbotDomainRoutes";
// console.log("🛣️ [71] ✅ aiChatbotDomainRoutes OK");

// console.log("🛣️ [72] aiObservabilityRoutes...");
import aiObservabilityRoutes from "./aiObservabilityRoutes";
// console.log("🛣️ [72] ✅ aiObservabilityRoutes OK");

// console.log("🛣️ [73] aiSchedulerRoutes...");
import aiSchedulerRoutes from "./aiSchedulerRoutes";
// console.log("🛣️ [73] ✅ aiSchedulerRoutes OK");

// console.log("🛣️ [74] aiGraphRAGRoutes...");
import aiGraphRAGRoutes from "./aiGraphRAGRoutes";
// console.log("🛣️ [74] ✅ aiGraphRAGRoutes OK");

// console.log("🛣️ [75] aiMultimodalRoutes...");
import aiMultimodalRoutes from "./aiMultimodalRoutes";
// console.log("🛣️ [75] ✅ aiMultimodalRoutes OK");

// console.log("🛣️ [76] aiWriterRoutes...");
import aiWriterRoutes from "./aiWriterRoutes";
// console.log("🛣️ [76] ✅ aiWriterRoutes OK");

// console.log("🛣️ [77] aiDashboardRoutes...");
import aiDashboardRoutes from "./aiDashboardRoutes";
// console.log("🛣️ [77] ✅ aiDashboardRoutes OK");

// console.log("🛣️ [78] aiEntityRoutes...");
import aiEntityRoutes from "./aiEntityRoutes";
// console.log("🛣️ [78] ✅ aiEntityRoutes OK");

// console.log("🛣️ [79] aiExtensionRoutes...");
import aiExtensionRoutes from "./aiExtensionRoutes";
// console.log("🛣️ [79] ✅ aiExtensionRoutes OK");

// console.log("🛣️ [80] aiABTestRoutes...");
import aiABTestRoutes from "./aiABTestRoutes";
// console.log("🛣️ [80] ✅ aiABTestRoutes OK");

// console.log("🛣️ [81] aiFineTuningRoutes...");
import aiFineTuningRoutes from "./aiFineTuningRoutes";
// console.log("🛣️ [81] ✅ aiFineTuningRoutes OK");

// console.log("🛣️ [82] aiHeygenRoutes...");
import aiHeygenRoutes from "./aiHeygenRoutes";
// console.log("🛣️ [82] ✅ aiHeygenRoutes OK");

// console.log("🛣️ [83] aiRealtimeAudioRoutes...");
import aiRealtimeAudioRoutes from "./aiRealtimeAudioRoutes";
// console.log("🛣️ [83] ✅ aiRealtimeAudioRoutes OK");

// console.log("🛣️ [84] aiEmailTemplateRoutes...");
import aiEmailTemplateRoutes from "./aiEmailTemplateRoutes";
// console.log("🛣️ [84] ✅ aiEmailTemplateRoutes OK");

// console.log("🛣️ [85] aiTeamRoutes...");
import aiTeamRoutes from "./aiTeamRoutes";
// console.log("🛣️ [85] ✅ aiTeamRoutes OK");

// console.log("🛣️ [86] aiMercadoPagoRoutes...");
import aiMercadoPagoRoutes from "./aiMercadoPagoRoutes";
import aiCorrectionRoutes from "./aiCorrectionRoutes";
// console.log("🛣️ [86] ✅ aiMercadoPagoRoutes OK");

// ── BATCH: Rutas UGC/Agent faltantes ──
// console.log("🛣️ [87] agentDeviceRoutes...");
import agentDeviceRoutes from "./agentDeviceRoutes";
// console.log("🛣️ [87] ✅ agentDeviceRoutes OK");

// console.log("🛣️ [88] agentInteractionRoutes...");
import agentInteractionRoutes from "./agentInteractionRoutes";
// console.log("🛣️ [88] ✅ agentInteractionRoutes OK");

// console.log("🛣️ [89] integrationRoutes...");
import integrationRoutes from "./integrationRoutes";
// console.log("🛣️ [89] ✅ integrationRoutes OK");

// console.log("🛣️ ✅✅✅ ALL ROUTES IMPORTED! ✅✅✅");

const routes = Router();

// Health check route
routes.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'jrchateam-backend',
    version: '6.0.0'
  });
});

// ============ STUBS — Endpoints pendientes de implementación completa ============

// Analytics general (GET /analytics?period=...)
routes.get('/analytics', isAuth, (_req: Request, res: Response) => {
  return res.json({
    success: true,
    message: "Analytics general",
    data: { stats: {}, trendData: [], channelData: [], agentData: [] }
  });
});

// Email Marketing Packs (POST /email-marketing/packs/purchase)
routes.post('/email-marketing/packs/purchase', isAuth, (_req: Request, res: Response) => {
  return res.json({
    success: true,
    message: "Funcionalidad de packs de envío próximamente disponible",
    data: null
  });
});

// ============ END STUBS ============

routes.use(userRoutes);
routes.use("/api/auth", authRoutes);
routes.use("/api/messages", apiRoutes);
routes.use(settingRoutes);
routes.use(contactRoutes);
routes.use(ticketRoutes);
routes.use(whatsappRoutes);
routes.use(messageRoutes);
routes.use(whatsappSessionRoutes);
routes.use(telegramRoutes);
routes.use(tiktokRoutes);
routes.use(queueRoutes);
routes.use(companyRoutes);
routes.use(planRoutes);
routes.use(ticketNoteRoutes);
routes.use(receiptsRoutes);
routes.use(quickMessageRoutes);
routes.use(helpRoutes);
routes.use(dashboardRoutes);
routes.use(scheduleRoutes);
routes.use(tagRoutes);
routes.use(contactListRoutes);
routes.use(contactListItemRoutes);
routes.use(campaignRoutes);
routes.use(campaignSettingRoutes);
routes.use(announcementRoutes);
routes.use(chatRoutes);
routes.use(chatBotRoutes);
routes.use("/webhook", webHookRoutes);
routes.use(subScriptionRoutes);
routes.use(invoiceRoutes);
routes.use(versionRouter);
routes.use(filesRoutes);
routes.use(queueOptionRoutes);
routes.use(queueIntegrationRoutes);
routes.use(ticketTagRoutes);
routes.use("/api", apiCompanyRoutes);
routes.use("/api", apiContactRoutes);
routes.use("/api", apiMessageRoutes);
routes.use(flowDefaultRoutes);
routes.use(flowBuilder);
routes.use(flowCampaignRoutes);
routes.use(promptRoutes);
routes.use(statisticsRoutes);
routes.use(companySettingsRoutes);
routes.use(scheduleMessageRoutes);

// WhatsApp Monitoring & Hybrid System
routes.use("/whatsapp-monitor", whatsappMonitorRoutes);
routes.use("/whatsapp-meta", whatsappMetaDashboardRoutes);
routes.use("/whatsapp", whatsappCoexistenceRoutes);        // Coexistencia + Migración
routes.use("/webhook/meta", whatsappCoexistenceRoutes);     // Embedded Signup callback
routes.use("/whatsapp-templates", whatsappTemplateRoutes);

// AI Configuration & OpenAI Management
routes.use("/ai", aiConfigRoutes);
routes.use("/ai", aiSubplanRoutes);
routes.use("/ai/subplan-purchase", aiSubplanPurchaseRoutes);
routes.use(aiCreditRoutes); // AI Credits: balances, transactions, analytics
routes.use(aiCostRoutes);   // AI Costs: report, cache-stats, coingate
routes.use(aiAgentRoutes);  // AI Agents: catálogo, configs, métricas, process
routes.use(aiAgentAssignmentRoutes); // AI Agent Assignments: asignaciones a companies
routes.use("/api/ai-image-generation", aiImageGenerationRoutes);
routes.use("/api/ai-video-generation", aiVideoGenerationRoutes);

// UGC — Identidades, Campañas, Creadores, Videos, Social, Optimización
routes.use(agentIdentityRoutes);
routes.use(ugcCampaignRoutes);
routes.use(ugcCreatorRoutes);
routes.use(ugcVideoRoutes);
routes.use(ugcSocialRoutes);
routes.use(ugcOptimizationRoutes);

// WebChat Widget
routes.use("/webchat", webChatWidgetRoutes);

// Appointments
routes.use("/appointments", appointmentRoutes);

// PayPal
routes.use(paypalRoutes);

// Financial Dashboard
routes.use(financialRoutes);

// Facebook Conversions API
routes.use(facebookConversionRoutes);

// Campaign Rules (Motor de Reglas Automatizadas Meta Ads)
routes.use(campaignRuleRoutes);

// Meta Marketing API (Ads, Campaigns, Insights)
routes.use(metaMarketingRoutes);

// Campaign Audit (IA Recommendations)
routes.use(campaignAuditRoutes);

// Attribution
routes.use(attributionRoutes);

// Campaign Messages (Click-to-WhatsApp Ads tracking)
routes.use(campaignMessageRoutes);

// Customer Origin (Origen de Cliente)
routes.use(customerOriginRoutes);

// Email Campaigns & Marketing
routes.use(emailCampaignRoutes);

// Email Provider Config (SMTP/SendGrid/Mailgun/SES)
routes.use(emailProviderConfigRoutes);

// Email Tracking (público, sin auth) — tracking pixels, clicks, unsubscribe, webhooks
routes.use(emailTrackingRoutes);

// Email Analytics (con auth) — dashboard KPIs y detalle de campañas
routes.use(emailAnalyticsRoutes);

// Email Automations, A/B Tests & Segmentation (Phase 4)
routes.use(emailAutomationRoutes);

// AI Affiliates & MLM (legacy)
routes.use(aiAffiliateRoutes);

// Affiliates Module (independiente)
routes.use(affiliateRoutes);

// Email Plan Routes
import emailPlanRoutes from "./emailPlanRoutes";
routes.use(emailPlanRoutes);

// Payment Config Routes (Stripe/PayPal keys from SuperAdmin)
import paymentConfigRoutes from "./paymentConfigRoutes";
routes.use(paymentConfigRoutes);

// Comment Auto-Reply (Facebook/Instagram)
routes.use(commentAutoReplyRoutes);

// Google Drive Backup
import driveBackupRoutes from './driveBackupRoutes';
routes.use(driveBackupRoutes);

// ── BATCH: AI Platform (17 rutas) ──
routes.use(aiChatbotRoutes);         // /ai/chatbots
routes.use(aiChatbotDomainRoutes);   // /ai/chatbot-domains
routes.use(aiObservabilityRoutes);   // /ai/observability
routes.use(aiSchedulerRoutes);       // /ai/scheduler
routes.use(aiGraphRAGRoutes);        // /ai/graph-rag + /ai/rag
routes.use(aiMultimodalRoutes);      // /ai/multimodal + /ai/vision
routes.use(aiWriterRoutes);          // /ai/writer
routes.use(aiDashboardRoutes);       // /ai/dashboard
routes.use(aiEntityRoutes);          // /ai/entities
routes.use(aiExtensionRoutes);       // /ai/extensions
routes.use(aiABTestRoutes);          // /ai/ab-tests
routes.use(aiFineTuningRoutes);      // /ai/fine-tuning
routes.use(aiHeygenRoutes);          // /ai/heygen
routes.use(aiRealtimeAudioRoutes);   // /ai/realtime-audio
routes.use(aiEmailTemplateRoutes);   // /ai/email-templates
routes.use(aiTeamRoutes);            // /ai/teams
routes.use(aiMercadoPagoRoutes);     // /ai/mercado-pago
routes.use(aiCorrectionRoutes);      // /ai/corrections + /ai/memories

// ── BATCH: UGC Agent extras ──
routes.use(agentDeviceRoutes);       // /ugc/devices
routes.use(agentInteractionRoutes);  // /ugc/interactions

// Integrations (CRM, ERP, etc.)
routes.use("/integrations", integrationRoutes);

// ── INTERNAL: Rutas para comunicación entre nodos (Redis MessageRegistry) ──
import internalRoutes from "./internal";
routes.use(internalRoutes);  // /internal/* - Solo accesible desde localhost

// console.log("🛣️ ✅✅✅ ALL ROUTES REGISTERED! ✅✅✅");

export default routes;
