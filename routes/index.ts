import { Router, Request, Response } from "express";
import isAuth from "../middleware/isAuth";

import userRoutes from "./userRoutes";
import roleRoutes from "./roleRoutes"; // [Fase3·N2.0]
import notificationRoutes from "./notificationRoutes";
import falWebhookRoutes from "./falWebhookRoutes";

import authRoutes from "./authRoutes";

import settingRoutes from "./settingRoutes";

import contactRoutes from "./contactRoutes";

import ticketRoutes from "./ticketRoutes";

import whatsappRoutes from "./whatsappRoutes";

import messageRoutes from "./messageRoutes";

import whatsappSessionRoutes from "./whatsappSessionRoutes";

import telegramRoutes from "./telegramRoutes";

import tiktokRoutes from "./tiktokRoutes";

import queueRoutes from "./queueRoutes";

import companyRoutes from "./companyRoutes";

import planRoutes from "./planRoutes";

import ticketNoteRoutes from "./ticketNoteRoutes";

import quickMessageRoutes from "./quickMessageRoutes";

import helpRoutes from "./helpRoutes";

import dashboardRoutes from "./dashboardRoutes";

import scheduleRoutes from "./scheduleRoutes";

import tagRoutes from "./tagRoutes";

import contactListRoutes from "./contactListRoutes";

import contactListItemRoutes from "./contactListItemRoutes";

import campaignRoutes from "./campaignRoutes";

import campaignSettingRoutes from "./campaignSettingRoutes";

import announcementRoutes from "./announcementRoutes";

import chatRoutes from "./chatRoutes";

import queueIntegrationRoutes from "./queueIntegrationRoutes";

import chatBotRoutes from "./chatBotRoutes";

import webHookRoutes from "./webHookRoutes";

import subScriptionRoutes from "./subScriptionRoutes";

import invoiceRoutes from "./invoicesRoutes";

import apiRoutes from "./apiRoutes";

import versionRouter from "./versionRoutes";

import filesRoutes from "./filesRoutes";

import queueOptionRoutes from "./queueOptionRoutes";
import aiAnalyticsRoutes from "./aiAnalyticsRoutes"; // [Fase2·D2.1]
import statsRoutes from "./statsRoutes"; // [Fase2·Ola D]
import campaignApprovalRoutes from "./campaignApprovalRoutes"; // [Fase2·Ola F]
import commentModerationRoutes from "./commentModerationRoutes"; // [Fase2·Ola H]
import lopdpRoutes from "./lopdpRoutes"; // [Fase2·N3]

import ticketTagRoutes from "./ticketTagRoutes";

import apiCompanyRoutes from "./api/apiCompanyRoutes";

import apiContactRoutes from "./api/apiContactRoutes";

import apiMessageRoutes from "./api/apiMessageRoutes";

import companySettingsRoutes from "./companySettingsRoutes";

import receiptsRoutes from "./recepts";

import promptRoutes from "./promptRouter";

import statisticsRoutes from "./statisticsRoutes";
import automationRuleRoutes from "./automationRuleRoutes"; // [Fase E]

import scheduleMessageRoutes from "./ScheduledMessagesRoutes";

import flowDefaultRoutes from "./flowDefaultRoutes";

import flowBuilder from "./flowBuilderRoutes";

import flowCampaignRoutes from "./flowCampaignRoutes";

import whatsappMonitorRoutes from "./whatsappMonitorRoutes";

import whatsappMetaDashboardRoutes from "./whatsappMetaDashboardRoutes";

import whatsappCoexistenceRoutes from "./whatsappCoexistenceRoutes";

// FASE 4 Coexistencia — dispatch unificado + routing preview
import coexistenceDispatchRoutes from "./coexistenceDispatchRoutes";

import whatsappTemplateRoutes from "./whatsappTemplateRoutes";

import aiConfigRoutes from "./aiConfigRoutes";

import aiImageGenerationRoutes from "./aiImageGenerationRoutes";

import aiVideoGenerationRoutes from "./aiVideoGenerationRoutes";

import aiSubplanRoutes from "./aiSubplanRoutes";

import aiSubplanPurchaseRoutes from "./aiSubplanPurchaseRoutes";

import aiCreditRoutes from "./aiCreditRoutes";
import aiTokenUsageAdminRoutes from "./aiTokenUsageAdminRoutes";

import aiCostRoutes from "./aiCostRoutes";

import aiAgentRoutes from "./aiAgentRoutes";

import aiAgentAssignmentRoutes from "./aiAgentAssignmentRoutes";

import agentIdentityRoutes from "./agentIdentityRoutes";

import ugcCampaignRoutes from "./ugcCampaignRoutes";

import ugcCreatorRoutes from "./ugcCreatorRoutes";

import ugcVideoRoutes from "./ugcVideoRoutes";

import ugcSocialRoutes from "./ugcSocialRoutes";

import ugcOptimizationRoutes from "./ugcOptimizationRoutes";

import ugcSettingsRoutes from "./ugcSettingsRoutes";
import falModelsRoutes from "./falModelsRoutes";
// Generación neutral de imagen/video (Higgsfield + futuros proveedores)
import generationRoutes from "./generationRoutes";

import webChatWidgetRoutes from "./webChatWidgetRoutes";

import appointmentRoutes from "./appointmentRoutes";

import paypalRoutes from "./paypalRoutes";

import financialRoutes from "./financialRoutes";

import facebookConversionRoutes from "./facebookConversionRoutes";

// Kanban Lead Conversions (Meta CAPI por etiquetas Kanban)
import kanbanLeadConversionRoutes from "./kanbanLeadConversionRoutes";

import attributionRoutes from "./attributionRoutes";

import campaignRuleRoutes from "./campaignRuleRoutes";

import metaMarketingRoutes from "./metaMarketingRoutes";

import campaignAuditRoutes from "./campaignAuditRoutes";

import campaignMessageRoutes from "./campaignMessageRoutes";

import customerOriginRoutes from "./customerOriginRoutes";

import emailCampaignRoutes from "./emailCampaignRoutes";

import emailProviderConfigRoutes from "./emailProviderConfigRoutes";

import emailTrackingRoutes from "./emailTrackingRoutes";

import emailAnalyticsRoutes from "./emailAnalyticsRoutes";

import emailAutomationRoutes from "./emailAutomationRoutes";

import aiAffiliateRoutes from "./aiAffiliateRoutes";

import affiliateRoutes from "./affiliateRoutes";

import commentAutoReplyRoutes from "./commentAutoReplyRoutes";

import socialCommentRoutes from "./socialCommentRoutes";

// ── BATCH: Rutas AI faltantes ──
import aiChatbotRoutes from "./aiChatbotRoutes";

import aiChatbotDomainRoutes from "./aiChatbotDomainRoutes";

import aiObservabilityRoutes from "./aiObservabilityRoutes";

import aiSchedulerRoutes from "./aiSchedulerRoutes";

import aiGraphRAGRoutes from "./aiGraphRAGRoutes";

import aiMultimodalRoutes from "./aiMultimodalRoutes";

import aiWriterRoutes from "./aiWriterRoutes";

import aiDashboardRoutes from "./aiDashboardRoutes";

import aiEntityRoutes from "./aiEntityRoutes";

import aiExtensionRoutes from "./aiExtensionRoutes";

import aiABTestRoutes from "./aiABTestRoutes";

import aiFineTuningRoutes from "./aiFineTuningRoutes";

import aiHeygenRoutes from "./aiHeygenRoutes";

import aiRealtimeAudioRoutes from "./aiRealtimeAudioRoutes";

import aiEmailTemplateRoutes from "./aiEmailTemplateRoutes";

import aiTeamRoutes from "./aiTeamRoutes";

// MercadoPago RETIRADO 2026-07-29 — ver el comentario del mount más abajo.
// import aiMercadoPagoRoutes from "./aiMercadoPagoRoutes";
import aiCorrectionRoutes from "./aiCorrectionRoutes";
// Sprint 1 (2026-05-20) — Panel de revisión humana de correcciones
import aiCorrectionReviewRoutes from "./aiCorrectionReviewRoutes";

// ── BATCH: Rutas UGC/Agent faltantes ──
import agentDeviceRoutes from "./agentDeviceRoutes";

import agentInteractionRoutes from "./agentInteractionRoutes";

import integrationRoutes from "./integrationRoutes";


const routes = Router();

routes.use(falWebhookRoutes);

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
routes.use(roleRoutes); // [Fase3·N2.0]
routes.use(notificationRoutes);
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
routes.use(automationRuleRoutes); // [Fase E]
routes.use(companySettingsRoutes);
routes.use(scheduleMessageRoutes);

// WhatsApp Monitoring & Hybrid System
routes.use("/whatsapp-monitor", whatsappMonitorRoutes);
routes.use("/whatsapp-meta", whatsappMetaDashboardRoutes);
routes.use("/whatsapp", whatsappCoexistenceRoutes);        // Coexistencia + Migración
routes.use("/webhook/meta", whatsappCoexistenceRoutes);     // Embedded Signup callback
// FASE 4 Coexistencia — dispatch unificado + routing preview
routes.use(coexistenceDispatchRoutes);
routes.use("/whatsapp-templates", whatsappTemplateRoutes);

// AI Configuration & OpenAI Management
routes.use("/ai", aiConfigRoutes);
routes.use("/ai", aiSubplanRoutes);
routes.use("/ai/subplan-purchase", aiSubplanPurchaseRoutes);
routes.use(aiCreditRoutes); // AI Credits: balances, transactions, analytics
routes.use(aiTokenUsageAdminRoutes); // Auditoria global de tokens, solo superadmin
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
routes.use(ugcSettingsRoutes);
routes.use(falModelsRoutes);
routes.use(generationRoutes); // /api/generation/* + /api/webhooks/higgsfield

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

// Kanban Lead Conversions (Meta CAPI por etiquetas Kanban)
routes.use(kanbanLeadConversionRoutes);

// Campaign Rules (Motor de Reglas Automatizadas Meta Ads)
routes.use(campaignRuleRoutes);

// Meta Marketing API (Ads, Campaigns, Insights)
routes.use(metaMarketingRoutes);
routes.use(aiAnalyticsRoutes);
routes.use(statsRoutes);
routes.use(campaignApprovalRoutes);
routes.use(commentModerationRoutes);
routes.use(lopdpRoutes);

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

// PRIMERA OLA (2026-05-07) — TicketFlow + Seguimientos + Omnichannel
import ticketFlowRoutes from "./ticketFlowRoutes";
routes.use(ticketFlowRoutes);

// Email Plan Routes
import emailPlanRoutes from "./emailPlanRoutes";
routes.use(emailPlanRoutes);

// Payment Config Routes (Stripe/PayPal keys from SuperAdmin)
import paymentConfigRoutes from "./paymentConfigRoutes";
routes.use(paymentConfigRoutes);

// Comment Auto-Reply (Facebook/Instagram)
routes.use(commentAutoReplyRoutes);

// Comentarios Sociales FB/IG — inbox estilo TikTok (/social-comments)
routes.use(socialCommentRoutes);

// Google Drive Backup (legacy — se mantiene por retrocompatibilidad)
import driveBackupRoutes from './driveBackupRoutes';
routes.use(driveBackupRoutes);

// Media Backup (flujo nuevo: archivado + envío por Listmonk)
import mediaBackupRoutes from './mediaBackupRoutes';
routes.use(mediaBackupRoutes);

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
// ============================================================================
// MercadoPago — RETIRADO 2026-07-29
//
// Decisión de JC: las vías de cobro reales son PayPal y Stripe. MercadoPago no
// aplica. Se retira el CABLEADO, no el código: routes/aiMercadoPagoRoutes.ts,
// controllers/AIMercadoPagoController.ts y services/AIMercadoPagoServices/
// siguen en el repo; volver a montarlo es descomentar esta línea y su import.
//
// Por qué retirarlo: `/ai/mercadopago/webhook` es público (sin isAuth) y
// `createPreference` dispara llamadas salientes con nuestro access token. Una
// superficie de pago que nadie usa es riesgo sin contrapartida.
//
// Nota para quien lo reactive: la validación de firma se construyó contra la
// DOCUMENTACIÓN de MercadoPago, nunca contra un webhook real recibido. Si el
// manifiesto (`id:…;request-id:…;ts:…;`) estuviera mal, el endpoint rechazaría
// el 100% del tráfico legítimo. Probar con un webhook real ANTES de confiar.
// ============================================================================
// routes.use(aiMercadoPagoRoutes);     // /ai/mercado-pago
routes.use(aiCorrectionRoutes);      // /ai/corrections + /ai/memories
routes.use(aiCorrectionReviewRoutes); // Sprint 1 — /ai/correction-review

// ── BATCH: UGC Agent extras ──
routes.use(agentDeviceRoutes);       // /ugc/devices
routes.use(agentInteractionRoutes);  // /ugc/interactions

// Integrations (CRM, ERP, etc.)
routes.use("/integrations", integrationRoutes);

// ── INTERNAL: Rutas para comunicación entre nodos (Redis MessageRegistry) ──
import internalRoutes from "./internal";
routes.use(internalRoutes);  // /internal/* - Solo accesible desde localhost

// [W6-INFRA-01 · NFR-015] Observabilidad: monta /metrics (prom-client), /ready, /live.
// healthRoutes NO estaba montado → /metrics daba 404. Se monta al final: el /health
// inline de arriba se registra antes y sigue ganando (comportamiento de /health sin cambio).
import healthRoutes from "./healthRoutes";
routes.use(healthRoutes);


export default routes;
