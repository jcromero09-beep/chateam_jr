import { Router } from "express";
import multer from "multer";
import uploadConfig from "../config/upload";
import * as MetaMarketingController from "../controllers/MetaMarketingController";
import * as MetaAdsAgentController from "../controllers/MetaAdsAgentController";
import isAuth from "../middleware/isAuth";

const router = Router();

// Test connection to Facebook Marketing API
router.get(
  "/meta-marketing/test-connection",
  isAuth,
  MetaMarketingController.testConnection
);

// [Fase2·E4.1] ROAS + CPA reales por campaña
router.get("/meta-marketing/roas", isAuth, MetaMarketingController.getRoas);

// Get ad accounts
router.get(
  "/meta-marketing/ad-accounts",
  isAuth,
  MetaMarketingController.getAdAccounts
);

// Get all campaigns with insights
router.get(
  "/meta-marketing/campaigns",
  isAuth,
  MetaMarketingController.getCampaigns
);

// Get single campaign by ID
router.get(
  "/meta-marketing/campaigns/:id",
  isAuth,
  MetaMarketingController.getCampaignById
);

// Get ads for a specific campaign
router.get(
  "/meta-marketing/campaigns/:id/ads",
  isAuth,
  MetaMarketingController.getAdsByCampaign
);

// Get all ads
router.get(
  "/meta-marketing/ads",
  isAuth,
  MetaMarketingController.getAds
);

// Get all ad sets
router.get(
  "/meta-marketing/adsets",
  isAuth,
  MetaMarketingController.getAdSets
);

// Get insights trend for charts
router.get(
  "/meta-marketing/insights/trend",
  isAuth,
  MetaMarketingController.getInsightsTrend
);

// Get aggregated insights (totals)
router.get(
  "/meta-marketing/insights",
  isAuth,
  MetaMarketingController.getAggregatedInsights
);

// Get complete dashboard data (campaigns + trends + totals + ads)
router.get(
  "/meta-marketing/dashboard",
  isAuth,
  MetaMarketingController.getDashboardData
);

// Invalidate cache to force fresh data
router.post(
  "/meta-marketing/invalidate-cache",
  isAuth,
  MetaMarketingController.invalidateCache
);

// Get API usage statistics (for audit/monitoring)
router.get(
  "/meta-marketing/usage-stats",
  isAuth,
  MetaMarketingController.getUsageStats
);

// Get token status (for monitoring expiration)
router.get(
  "/meta-marketing/token-status",
  isAuth,
  MetaMarketingController.getTokenStatus
);

// ============================================================
// CRUD — CAMPAIGNS
// ============================================================

// Create a new campaign
router.post(
  "/meta-marketing/campaigns",
  isAuth,
  MetaMarketingController.createCampaign
);

// Update an existing campaign
router.put(
  "/meta-marketing/campaigns/:id",
  isAuth,
  MetaMarketingController.updateCampaign
);

// Delete a campaign
router.delete(
  "/meta-marketing/campaigns/:id",
  isAuth,
  MetaMarketingController.deleteCampaign
);

// Duplicate a campaign
router.post(
  "/meta-marketing/campaigns/:id/duplicate",
  isAuth,
  MetaMarketingController.duplicateCampaign
);

// Pause campaign + all ads/adsets
router.post(
  "/meta-marketing/campaigns/:id/pause-all",
  isAuth,
  MetaMarketingController.pauseAllInCampaign
);

// Activate campaign + all ads/adsets
router.post(
  "/meta-marketing/campaigns/:id/activate-all",
  isAuth,
  MetaMarketingController.activateAllInCampaign
);

// ============================================================
// CRUD — AD SETS
// ============================================================

// Create a new ad set
router.post(
  "/meta-marketing/adsets",
  isAuth,
  MetaMarketingController.createAdSet
);

// Update an existing ad set
router.put(
  "/meta-marketing/adsets/:id",
  isAuth,
  MetaMarketingController.updateAdSet
);

// ============================================================
// CRUD — ADS
// ============================================================

// Create a new ad
router.post(
  "/meta-marketing/ads",
  isAuth,
  MetaMarketingController.createAd
);

// Update an existing ad
router.put(
  "/meta-marketing/ads/:id",
  isAuth,
  MetaMarketingController.updateAd
);

// ============================================================================
// AGENT ROUTES — Meta Ads Optimizer (plan + execute con cinturón de seguridad)
// ============================================================================

// Listar conexiones Meta disponibles para esta company (selector UI del agente)
router.get(
  "/meta-marketing/agent/connections",
  isAuth,
  MetaAdsAgentController.listConnections
);

// ============================================================================
// MCP OFICIAL DE META ADS — endpoints reales (sin bypass)
// ============================================================================

// GET /agent/mcp/status — connected=true SOLO si tools/list real responde OK
router.get(
  "/meta-marketing/agent/mcp/status",
  isAuth,
  MetaAdsAgentController.getMcpStatus
);

// GET /agent/mcp/diagnostics — muestra client_id resuelto, redirect_uri esperado y scopes (sin secretos)
router.get(
  "/meta-marketing/agent/mcp/diagnostics",
  isAuth,
  MetaAdsAgentController.getMcpDiagnostics
);

// POST /agent/mcp/connect — devuelve URL OAuth real (Authorization Code + PKCE S256)
router.post(
  "/meta-marketing/agent/mcp/connect",
  isAuth,
  MetaAdsAgentController.startMcpConnection
);

// GET /agent/mcp/callback — recibe code+state desde Meta. SIN isAuth (viene de meta).
//                          Se valida con state generado en /connect.
router.get(
  "/meta-marketing/agent/mcp/callback",
  MetaAdsAgentController.mcpCallback
);

// POST /agent/mcp/disconnect — limpia tokens de la company
router.post(
  "/meta-marketing/agent/mcp/disconnect",
  isAuth,
  MetaAdsAgentController.disconnectMcp
);

// GET /agent/mcp/tools — tools/list MCP REAL contra mcp.facebook.com/ads
router.get(
  "/meta-marketing/agent/mcp/tools",
  isAuth,
  MetaAdsAgentController.listMcpTools
);

// POST /agent/mcp/tools/call — tools/call MCP REAL
router.post(
  "/meta-marketing/agent/mcp/tools/call",
  isAuth,
  MetaAdsAgentController.callMcpTool
);

// DEPRECATED — POST /agent/mcp/mark-connected (devuelve 403 a propósito)
router.post(
  "/meta-marketing/agent/mcp/mark-connected",
  isAuth,
  MetaAdsAgentController.markMcpConnected
);

// Chat conversacional con enriquecedor + proveedor IA configurado
router.post(
  "/meta-marketing/agent/chat",
  isAuth,
  MetaAdsAgentController.chat
);

// Generar plan read-only a partir de un prompt natural
router.post(
  "/meta-marketing/agent/plan",
  isAuth,
  MetaAdsAgentController.planAction
);

// Ejecutar plan confirmado (gated por META_AGENT_EXECUTE_ENABLED=true)
router.post(
  "/meta-marketing/agent/execute",
  isAuth,
  MetaAdsAgentController.executePlan
);

// Listar planes históricos
router.get(
  "/meta-marketing/agent/plans",
  isAuth,
  MetaAdsAgentController.listPlans
);

// Detalle de un plan + action logs
router.get(
  "/meta-marketing/agent/plans/:id",
  isAuth,
  MetaAdsAgentController.getPlanById
);

// [Fase2·D1.1] Campanas Click-to-WhatsApp
router.post(
  "/meta-marketing/ctwa-campaigns",
  isAuth,
  MetaMarketingController.createCtwaCampaignHandler
);
router.get(
  "/meta-marketing/ctwa-presets",
  isAuth,
  MetaMarketingController.getCtwaPresets
);

// [Fase2·D2.1] Portafolio creativo
const upload = multer(uploadConfig);
router.post(
  "/meta-marketing/creatives/images",
  isAuth,
  upload.single("file"),
  MetaMarketingController.uploadCreativeImage
);
router.get("/meta-marketing/creatives/images", isAuth, MetaMarketingController.listCreativeImages);
router.post("/meta-marketing/creatives/preview", isAuth, MetaMarketingController.previewCreative);
router.post("/meta-marketing/creatives/carousel", isAuth, MetaMarketingController.buildCarousel);

router.get("/meta-marketing/adsets/:id", isAuth, MetaMarketingController.getAdSetById);

router.get("/meta-marketing/campaign-signals", isAuth, MetaMarketingController.getCampaignSignals);

router.get("/meta-marketing/pixel/snippet", isAuth, MetaMarketingController.getPixelSnippet);
router.post("/meta-marketing/pixel/validate", isAuth, MetaMarketingController.validatePixel);

router.get("/meta-marketing/winners", isAuth, MetaMarketingController.getWinners);
router.post("/meta-marketing/graduate", isAuth, MetaMarketingController.graduateWinnerHandler);

export default router;
