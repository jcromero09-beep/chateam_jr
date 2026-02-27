console.log("🛣️ [0] Starting routes/index.ts...");
import { Router } from "express";
console.log("🛣️ [0] ✅ Router OK");

console.log("🛣️ [1] userRoutes...");
import userRoutes from "./userRoutes";
console.log("🛣️ [1] ✅ userRoutes OK");

console.log("🛣️ [2] authRoutes...");
import authRoutes from "./authRoutes";
console.log("🛣️ [2] ✅ authRoutes OK");

console.log("🛣️ [3] settingRoutes...");
import settingRoutes from "./settingRoutes";
console.log("🛣️ [3] ✅ settingRoutes OK");

console.log("🛣️ [4] contactRoutes...");
import contactRoutes from "./contactRoutes";
console.log("🛣️ [4] ✅ contactRoutes OK");

console.log("🛣️ [5] ticketRoutes...");
import ticketRoutes from "./ticketRoutes";
console.log("🛣️ [5] ✅ ticketRoutes OK");

console.log("🛣️ [6] whatsappRoutes...");
import whatsappRoutes from "./whatsappRoutes";
console.log("🛣️ [6] ✅ whatsappRoutes OK");

console.log("🛣️ [7] messageRoutes...");
import messageRoutes from "./messageRoutes";
console.log("🛣️ [7] ✅ messageRoutes OK");

console.log("🛣️ [8] whatsappSessionRoutes...");
import whatsappSessionRoutes from "./whatsappSessionRoutes";
console.log("🛣️ [8] ✅ whatsappSessionRoutes OK");

console.log("🛣️ [9] telegramRoutes...");
import telegramRoutes from "./telegramRoutes";
console.log("🛣️ [9] ✅ telegramRoutes OK");

console.log("🛣️ [10] queueRoutes...");
import queueRoutes from "./queueRoutes";
console.log("🛣️ [10] ✅ queueRoutes OK");

console.log("🛣️ [11] companyRoutes...");
import companyRoutes from "./companyRoutes";
console.log("🛣️ [11] ✅ companyRoutes OK");

console.log("🛣️ [12] planRoutes...");
import planRoutes from "./planRoutes";
console.log("🛣️ [12] ✅ planRoutes OK");

console.log("🛣️ [13] ticketNoteRoutes...");
import ticketNoteRoutes from "./ticketNoteRoutes";
console.log("🛣️ [13] ✅ ticketNoteRoutes OK");

console.log("🛣️ [14] quickMessageRoutes...");
import quickMessageRoutes from "./quickMessageRoutes";
console.log("🛣️ [14] ✅ quickMessageRoutes OK");

console.log("🛣️ [15] helpRoutes...");
import helpRoutes from "./helpRoutes";
console.log("🛣️ [15] ✅ helpRoutes OK");

console.log("🛣️ [16] dashboardRoutes...");
import dashboardRoutes from "./dashboardRoutes";
console.log("🛣️ [16] ✅ dashboardRoutes OK");

console.log("🛣️ [17] scheduleRoutes...");
import scheduleRoutes from "./scheduleRoutes";
console.log("🛣️ [17] ✅ scheduleRoutes OK");

console.log("🛣️ [18] tagRoutes...");
import tagRoutes from "./tagRoutes";
console.log("🛣️ [18] ✅ tagRoutes OK");

console.log("🛣️ [19] contactListRoutes...");
import contactListRoutes from "./contactListRoutes";
console.log("🛣️ [19] ✅ contactListRoutes OK");

console.log("🛣️ [20] contactListItemRoutes...");
import contactListItemRoutes from "./contactListItemRoutes";
console.log("🛣️ [20] ✅ contactListItemRoutes OK");

console.log("🛣️ [21] campaignRoutes...");
import campaignRoutes from "./campaignRoutes";
console.log("🛣️ [21] ✅ campaignRoutes OK");

console.log("🛣️ [22] campaignSettingRoutes...");
import campaignSettingRoutes from "./campaignSettingRoutes";
console.log("🛣️ [22] ✅ campaignSettingRoutes OK");

console.log("🛣️ [23] announcementRoutes...");
import announcementRoutes from "./announcementRoutes";
console.log("🛣️ [23] ✅ announcementRoutes OK");

console.log("🛣️ [24] chatRoutes...");
import chatRoutes from "./chatRoutes";
console.log("🛣️ [24] ✅ chatRoutes OK");

console.log("🛣️ [25] queueIntegrationRoutes...");
import queueIntegrationRoutes from "./queueIntegrationRoutes";
console.log("🛣️ [25] ✅ queueIntegrationRoutes OK");

console.log("🛣️ [26] chatBotRoutes...");
import chatBotRoutes from "./chatBotRoutes";
console.log("🛣️ [26] ✅ chatBotRoutes OK");

console.log("🛣️ [27] webHookRoutes...");
import webHookRoutes from "./webHookRoutes";
console.log("🛣️ [27] ✅ webHookRoutes OK");

console.log("🛣️ [28] subScriptionRoutes...");
import subScriptionRoutes from "./subScriptionRoutes";
console.log("🛣️ [28] ✅ subScriptionRoutes OK");

console.log("🛣️ [29] invoiceRoutes...");
import invoiceRoutes from "./invoicesRoutes";
console.log("🛣️ [29] ✅ invoiceRoutes OK");

console.log("🛣️ [30] apiRoutes...");
import apiRoutes from "./apiRoutes";
console.log("🛣️ [30] ✅ apiRoutes OK");

console.log("🛣️ [31] versionRouter...");
import versionRouter from "./versionRoutes";
console.log("🛣️ [31] ✅ versionRouter OK");

console.log("🛣️ [32] filesRoutes...");
import filesRoutes from "./filesRoutes";
console.log("🛣️ [32] ✅ filesRoutes OK");

console.log("🛣️ [33] queueOptionRoutes...");
import queueOptionRoutes from "./queueOptionRoutes";
console.log("🛣️ [33] ✅ queueOptionRoutes OK");

console.log("🛣️ [34] ticketTagRoutes...");
import ticketTagRoutes from "./ticketTagRoutes";
console.log("🛣️ [34] ✅ ticketTagRoutes OK");

console.log("🛣️ [35] apiCompanyRoutes...");
import apiCompanyRoutes from "./api/apiCompanyRoutes";
console.log("🛣️ [35] ✅ apiCompanyRoutes OK");

console.log("🛣️ [36] apiContactRoutes...");
import apiContactRoutes from "./api/apiContactRoutes";
console.log("🛣️ [36] ✅ apiContactRoutes OK");

console.log("🛣️ [37] apiMessageRoutes...");
import apiMessageRoutes from "./api/apiMessageRoutes";
console.log("🛣️ [37] ✅ apiMessageRoutes OK");

console.log("🛣️ [38] companySettingsRoutes...");
import companySettingsRoutes from "./companySettingsRoutes";
console.log("🛣️ [38] ✅ companySettingsRoutes OK");

console.log("🛣️ [39] receiptsRoutes...");
import receiptsRoutes from "./recepts";
console.log("🛣️ [39] ✅ receiptsRoutes OK");

console.log("🛣️ [40] promptRoutes...");
import promptRoutes from "./promptRouter";
console.log("🛣️ [40] ✅ promptRoutes OK");

console.log("🛣️ [41] statisticsRoutes...");
import statisticsRoutes from "./statisticsRoutes";
console.log("🛣️ [41] ✅ statisticsRoutes OK");

console.log("🛣️ [42] scheduleMessageRoutes...");
import scheduleMessageRoutes from "./ScheduledMessagesRoutes";
console.log("🛣️ [42] ✅ scheduleMessageRoutes OK");

console.log("🛣️ [43] flowDefaultRoutes...");
import flowDefaultRoutes from "./flowDefaultRoutes";
console.log("🛣️ [43] ✅ flowDefaultRoutes OK");

console.log("🛣️ [44] flowBuilder...");
import flowBuilder from "./flowBuilderRoutes";
console.log("🛣️ [44] ✅ flowBuilder OK");

console.log("🛣️ [45] flowCampaignRoutes...");
import flowCampaignRoutes from "./flowCampaignRoutes";
console.log("🛣️ [45] ✅ flowCampaignRoutes OK");

console.log("🛣️ [46] whatsappMonitorRoutes...");
import whatsappMonitorRoutes from "./whatsappMonitorRoutes";
console.log("🛣️ [46] ✅ whatsappMonitorRoutes OK");

console.log("🛣️ [47] whatsappMetaDashboardRoutes...");
import whatsappMetaDashboardRoutes from "./whatsappMetaDashboardRoutes";
console.log("🛣️ [47] ✅ whatsappMetaDashboardRoutes OK");

console.log("🛣️ [48] whatsappTemplateRoutes...");
import whatsappTemplateRoutes from "./whatsappTemplateRoutes";
console.log("🛣️ [48] ✅ whatsappTemplateRoutes OK");

console.log("🛣️ [49] aiConfigRoutes...");
import aiConfigRoutes from "./aiConfigRoutes";
console.log("🛣️ [49] ✅ aiConfigRoutes OK");

console.log("🛣️ [50] aiImageGenerationRoutes...");
import aiImageGenerationRoutes from "./aiImageGenerationRoutes";
console.log("🛣️ [50] ✅ aiImageGenerationRoutes OK");

console.log("🛣️ [50b] aiVideoGenerationRoutes...");
import aiVideoGenerationRoutes from "./aiVideoGenerationRoutes";
console.log("🛣️ [50b] ✅ aiVideoGenerationRoutes OK");

console.log("🛣️ [51] aiSubplanRoutes...");
import aiSubplanRoutes from "./aiSubplanRoutes";
console.log("🛣️ [51] ✅ aiSubplanRoutes OK");

console.log("🛣️ [51.1] aiSubplanPurchaseRoutes...");
import aiSubplanPurchaseRoutes from "./aiSubplanPurchaseRoutes";
console.log("🛣️ [51.1] ✅ aiSubplanPurchaseRoutes OK");

console.log("🛣️ [52] webChatWidgetRoutes...");
import webChatWidgetRoutes from "./webChatWidgetRoutes";
console.log("🛣️ [52] ✅ webChatWidgetRoutes OK");

console.log("🛣️ [53] appointmentRoutes...");
import appointmentRoutes from "./appointmentRoutes";
console.log("🛣️ [53] ✅ appointmentRoutes OK");

console.log("🛣️ [54] paypalRoutes...");
import paypalRoutes from "./paypalRoutes";
console.log("🛣️ [54] ✅ paypalRoutes OK");

console.log("🛣️ [55] financialRoutes...");
import financialRoutes from "./financialRoutes";
console.log("🛣️ [55] ✅ financialRoutes OK");

console.log("🛣️ [56] facebookConversionRoutes...");
import facebookConversionRoutes from "./facebookConversionRoutes";
console.log("🛣️ [56] ✅ facebookConversionRoutes OK");

console.log("🛣️ [57] attributionRoutes...");
import attributionRoutes from "./attributionRoutes";
console.log("🛣️ [57] ✅ attributionRoutes OK");

console.log("🛣️ [58] metaMarketingRoutes...");
import metaMarketingRoutes from "./metaMarketingRoutes";
console.log("🛣️ [58] ✅ metaMarketingRoutes OK");

console.log("🛣️ [59] campaignAuditRoutes...");
import campaignAuditRoutes from "./campaignAuditRoutes";
console.log("🛣️ [59] ✅ campaignAuditRoutes OK");

console.log("🛣️ [60] campaignMessageRoutes...");
import campaignMessageRoutes from "./campaignMessageRoutes";
console.log("🛣️ [60] ✅ campaignMessageRoutes OK");

console.log("🛣️ [61] customerOriginRoutes...");
import customerOriginRoutes from "./customerOriginRoutes";
console.log("🛣️ [61] ✅ customerOriginRoutes OK");

console.log("🛣️ [62] emailCampaignRoutes...");
import emailCampaignRoutes from "./emailCampaignRoutes";
console.log("🛣️ [62] ✅ emailCampaignRoutes OK");

console.log("🛣️ ✅✅✅ ALL 62 ROUTES IMPORTED! ✅✅✅");

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
routes.use("/whatsapp-templates", whatsappTemplateRoutes);

// AI Configuration & OpenAI Management
routes.use("/ai", aiConfigRoutes);
routes.use("/ai", aiSubplanRoutes);
routes.use("/ai/subplan-purchase", aiSubplanPurchaseRoutes);
routes.use("/api/ai-image-generation", aiImageGenerationRoutes);
routes.use("/api/ai-video-generation", aiVideoGenerationRoutes);

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

// Email Campaigns (Acelle Mail)
routes.use(emailCampaignRoutes);

console.log("🛣️ ✅✅✅ ALL ROUTES REGISTERED! ✅✅✅");

export default routes;
