import { Request, Response } from "express";
import MetaMarketingService from "../services/MetaMarketingService";
import logger from "../utils/logger";

// Test connection to Facebook Marketing API
export const testConnection = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = (req as any).user;
  const { whatsappId } = req.query;

  logger.info(`[Controller:testConnection] 🚀 REQUEST - companyId: ${companyId}, whatsappId: ${whatsappId || "N/A"}`);

  try {
    const result = await MetaMarketingService.testConnection(
      companyId,
      whatsappId ? Number(whatsappId) : undefined
    );

    if (!result.success) {
      logger.warn(`[Controller:testConnection] ⚠️ Conexion fallida: ${result.message}`);
      return res.status(400).json(result);
    }

    logger.info(`[Controller:testConnection] ✅ Conexion exitosa`);
    return res.status(200).json(result);
  } catch (error: any) {
    logger.error(`[Controller:testConnection] ❌ ERROR: ${error.message}`);
    logger.error(`[Controller:testConnection] ❌ Stack: ${error.stack}`);
    return res.status(500).json({
      success: false,
      message: error.message || "Error testing connection"
    });
  }
};

// Get ad accounts available for the user
export const getAdAccounts = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = (req as any).user;

    const accounts = await MetaMarketingService.getAdAccounts(companyId);

    return res.status(200).json({
      success: true,
      accounts
    });
  } catch (error: any) {
    console.error("Error in getAdAccounts:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error getting ad accounts"
    });
  }
};

// Get campaigns with insights
export const getCampaigns = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = (req as any).user;
  const { period = '30days', status, whatsappId } = req.query;

  logger.info(`[Controller:getCampaigns] 🚀 REQUEST - companyId: ${companyId}, whatsappId: ${whatsappId || "N/A"}, period: ${period}`);

  try {
    const statusArray = status ? (status as string).split(',') : undefined;

    const campaigns = await MetaMarketingService.getCampaigns(
      companyId,
      {
        status: statusArray,
        includeInsights: true,
        timeRange: undefined // Will use period to calculate
      },
      whatsappId ? Number(whatsappId) : undefined
    );

    logger.info(`[Controller:getCampaigns] ✅ Devolviendo ${campaigns.length} campañas`);
    return res.status(200).json({
      success: true,
      campaigns,
      period
    });
  } catch (error: any) {
    logger.error(`[Controller:getCampaigns] ❌ ERROR: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message || "Error getting campaigns"
    });
  }
};

// Get single campaign details
export const getCampaignById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = (req as any).user;
    const { id } = req.params;
    const { period = '30days' } = req.query;

    const campaign = await MetaMarketingService.getCampaignById(companyId, id);

    return res.status(200).json({
      success: true,
      campaign,
      period
    });
  } catch (error: any) {
    console.error("Error in getCampaignById:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error getting campaign"
    });
  }
};

// Get ads with insights
export const getAds = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = (req as any).user;
  const { period = '30days', campaignId, status, whatsappId } = req.query;

  logger.info(`[Controller:getAds] 🚀 REQUEST - companyId: ${companyId}, whatsappId: ${whatsappId || "N/A"}, period: ${period}`);

  try {
    const ads = await MetaMarketingService.getAds(
      companyId,
      {
        campaignId: campaignId as string | undefined,
        status: status ? (status as string).split(',') : undefined
      },
      whatsappId ? Number(whatsappId) : undefined
    );

    logger.info(`[Controller:getAds] ✅ Devolviendo ${ads.length} anuncios`);
    return res.status(200).json({
      success: true,
      ads,
      period
    });
  } catch (error: any) {
    logger.error(`[Controller:getAds] ❌ ERROR: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message || "Error getting ads"
    });
  }
};

// Get ads for a specific campaign
export const getAdsByCampaign = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = (req as any).user;
    const { id } = req.params;
    const { period = '30days', whatsappId } = req.query;

    const ads = await MetaMarketingService.getAds(
      companyId,
      { campaignId: id },
      whatsappId ? Number(whatsappId) : undefined
    );

    return res.status(200).json({
      success: true,
      ads,
      campaignId: id,
      period
    });
  } catch (error: any) {
    console.error("Error in getAdsByCampaign:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error getting campaign ads"
    });
  }
};

// Get insights trends for charts
export const getInsightsTrend = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = (req as any).user;
  const { period = '30days', whatsappId } = req.query;

  logger.info(`[Controller:getInsightsTrend] 🚀 REQUEST - companyId: ${companyId}, whatsappId: ${whatsappId || "N/A"}, period: ${period}`);

  try {
    const trends = await MetaMarketingService.getInsightsTrend(
      companyId,
      period as string,
      whatsappId ? Number(whatsappId) : undefined
    );

    logger.info(`[Controller:getInsightsTrend] ✅ Devolviendo ${trends.length} días de tendencias`);
    return res.status(200).json({
      success: true,
      trends,
      period
    });
  } catch (error: any) {
    logger.error(`[Controller:getInsightsTrend] ❌ ERROR: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message || "Error getting insights trend"
    });
  }
};

// Get aggregated insights (totals)
export const getAggregatedInsights = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = (req as any).user;
  const { period = '30days', whatsappId } = req.query;

  logger.info(`[Controller:getAggregatedInsights] 🚀 REQUEST - companyId: ${companyId}, whatsappId: ${whatsappId || "N/A"}, period: ${period}`);

  try {
    const insights = await MetaMarketingService.getAggregatedInsights(
      companyId,
      period as string,
      whatsappId ? Number(whatsappId) : undefined
    );

    logger.info(`[Controller:getAggregatedInsights] ✅ Métricas obtenidas - Gasto: $${insights.spend}, Impresiones: ${insights.impressions}`);
    return res.status(200).json({
      success: true,
      insights,
      period
    });
  } catch (error: any) {
    logger.error(`[Controller:getAggregatedInsights] ❌ ERROR: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message || "Error getting aggregated insights"
    });
  }
};

// Combined endpoint for dashboard (campaigns + trends + totals)
export const getDashboardData = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = (req as any).user;
  const { period: periodParam, whatsappId, status, since, until } = req.query;
  const wpId = whatsappId ? Number(whatsappId) : undefined;
  const statusArray = status ? (status as string).split(',') : undefined;

  // If since and until are provided, use custom date range
  // Otherwise fall back to period preset
  let period: string;
  let timeRange: { since: string; until: string } | undefined;

  if (since && until) {
    period = `${since}_${until}`;
    timeRange = { since: since as string, until: until as string };
  } else {
    period = (periodParam as string) || '30days';
  }

  logger.info(`[Controller:getDashboardData] 🚀 REQUEST - companyId: ${companyId}, whatsappId: ${wpId || "N/A"}, period: ${period}, status: ${status || "all"}`);
  logger.info(`[Controller:getDashboardData] 📡 Iniciando carga de datos del dashboard...`);

  try {
    logger.info(`[Controller:getDashboardData] 📡 Ejecutando 4 consultas en paralelo...`);
    const startTime = Date.now();

    const [campaigns, trends, totals, ads] = await Promise.all([
      MetaMarketingService.getCampaigns(companyId, { includeInsights: true, status: statusArray, timeRange }, wpId),
      MetaMarketingService.getInsightsTrend(companyId, period, wpId),
      MetaMarketingService.getAggregatedInsights(companyId, period, wpId),
      MetaMarketingService.getAds(companyId, { timeRange }, wpId)
    ]);

    const elapsedTime = Date.now() - startTime;
    logger.info(`[Controller:getDashboardData] ✅ COMPLETADO en ${elapsedTime}ms`);
    logger.info(`[Controller:getDashboardData] 📊 Resultados: ${campaigns.length} campañas, ${ads.length} anuncios, ${trends.length} días de tendencias`);

    return res.status(200).json({
      success: true,
      campaigns,
      trends,
      totals,
      ads,
      period
    });
  } catch (error: any) {
    logger.error(`[Controller:getDashboardData] ❌ ERROR: ${error.message}`);
    logger.error(`[Controller:getDashboardData] ❌ Stack: ${error.stack}`);
    return res.status(500).json({
      success: false,
      message: error.message || "Error getting dashboard data"
    });
  }
};

// Invalidate cache to force fresh data
export const invalidateCache = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = (req as any).user;

    await MetaMarketingService.invalidateCache(companyId);

    return res.status(200).json({
      success: true,
      message: "Cache invalidated successfully"
    });
  } catch (error: any) {
    console.error("Error in invalidateCache:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error invalidating cache"
    });
  }
};

// Get API usage statistics (for audit)
export const getUsageStats = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = (req as any).user;
    const { hours = 24 } = req.query;

    const stats = MetaMarketingService.getUsageStats(companyId, Number(hours));

    return res.status(200).json({
      success: true,
      stats,
      hours: Number(hours)
    });
  } catch (error: any) {
    console.error("Error in getUsageStats:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error getting usage stats"
    });
  }
};

// Get token status (for monitoring)
export const getTokenStatus = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = (req as any).user;

    const tokenStatus = await MetaMarketingService.getTokenStatus(companyId);

    return res.status(200).json({
      success: true,
      tokenStatus
    });
  } catch (error: any) {
    console.error("Error in getTokenStatus:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error getting token status"
    });
  }
};

// ============================================================
// CRUD — CAMPAIGNS
// ============================================================

// Create a new campaign
export const createCampaign = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = (req as any).user;
  const { whatsappId } = req.query;
  const { name, objective, status, special_ad_categories, daily_budget, lifetime_budget, start_time, stop_time, bid_strategy } = req.body;

  logger.info(`[Controller:createCampaign] 🚀 REQUEST - companyId: ${companyId}, name: "${name}"`);

  try {
    if (!name || !objective) {
      return res.status(400).json({
        success: false,
        message: "Los campos 'name' y 'objective' son requeridos"
      });
    }

    if (daily_budget !== undefined && daily_budget <= 0) {
      return res.status(400).json({
        success: false,
        message: "El presupuesto diario debe ser mayor a 0"
      });
    }

    if (lifetime_budget !== undefined && lifetime_budget <= 0) {
      return res.status(400).json({
        success: false,
        message: "El presupuesto total debe ser mayor a 0"
      });
    }

    if (start_time && stop_time && new Date(stop_time) <= new Date(start_time)) {
      return res.status(400).json({
        success: false,
        message: "La fecha de fin debe ser posterior a la fecha de inicio"
      });
    }

    const campaign = await MetaMarketingService.createCampaign(
      companyId,
      { name, objective, status, special_ad_categories, daily_budget, lifetime_budget, start_time, stop_time, bid_strategy },
      whatsappId ? Number(whatsappId) : undefined
    );

    logger.info(`[Controller:createCampaign] ✅ Campaña creada: ${campaign.id}`);
    return res.status(201).json({ success: true, campaign });
  } catch (error: any) {
    logger.error(`[Controller:createCampaign] ❌ ERROR: ${error.message}`);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Error al crear campaña"
    });
  }
};

// Update an existing campaign
export const updateCampaign = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = (req as any).user;
  const { id } = req.params;
  const { whatsappId } = req.query;
  const updates = req.body;

  logger.info(`[Controller:updateCampaign] 🚀 REQUEST - companyId: ${companyId}, campaignId: ${id}`);

  try {
    if (!id) {
      return res.status(400).json({ success: false, message: "campaignId es requerido" });
    }

    if (updates.daily_budget !== undefined && updates.daily_budget <= 0) {
      return res.status(400).json({ success: false, message: "El presupuesto diario debe ser mayor a 0" });
    }

    const campaign = await MetaMarketingService.updateCampaign(
      companyId,
      id,
      updates,
      whatsappId ? Number(whatsappId) : undefined
    );

    logger.info(`[Controller:updateCampaign] ✅ Campaña actualizada: ${id}`);
    return res.status(200).json({ success: true, campaign });
  } catch (error: any) {
    logger.error(`[Controller:updateCampaign] ❌ ERROR: ${error.message}`);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Error al actualizar campaña"
    });
  }
};

// Delete a campaign
export const deleteCampaign = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = (req as any).user;
  const { id } = req.params;
  const { whatsappId } = req.query;

  logger.info(`[Controller:deleteCampaign] 🚀 REQUEST - companyId: ${companyId}, campaignId: ${id}`);

  try {
    if (!id) {
      return res.status(400).json({ success: false, message: "campaignId es requerido" });
    }

    const result = await MetaMarketingService.deleteCampaign(
      companyId,
      id,
      whatsappId ? Number(whatsappId) : undefined
    );

    logger.info(`[Controller:deleteCampaign] ✅ Campaña eliminada: ${id}`);
    return res.status(200).json({ success: true, deleted: result });
  } catch (error: any) {
    logger.error(`[Controller:deleteCampaign] ❌ ERROR: ${error.message}`);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Error al eliminar campaña"
    });
  }
};

// Duplicate a campaign
export const duplicateCampaign = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = (req as any).user;
  const { id } = req.params;
  const { whatsappId } = req.query;
  const { newName } = req.body;

  logger.info(`[Controller:duplicateCampaign] 🚀 REQUEST - companyId: ${companyId}, campaignId: ${id}`);

  try {
    if (!id) {
      return res.status(400).json({ success: false, message: "campaignId es requerido" });
    }

    const name = newName || `Copia - ${new Date().toISOString().split("T")[0]}`;
    const campaign = await MetaMarketingService.duplicateCampaign(
      companyId,
      id,
      name,
      whatsappId ? Number(whatsappId) : undefined
    );

    logger.info(`[Controller:duplicateCampaign] ✅ Campaña duplicada: ${campaign.id}`);
    return res.status(201).json({ success: true, campaign });
  } catch (error: any) {
    logger.error(`[Controller:duplicateCampaign] ❌ ERROR: ${error.message}`);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Error al duplicar campaña"
    });
  }
};

// Pause campaign and all its ads/adsets
export const pauseAllInCampaign = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = (req as any).user;
  const { id } = req.params;
  const { whatsappId } = req.query;

  logger.info(`[Controller:pauseAllInCampaign] 🚀 REQUEST - companyId: ${companyId}, campaignId: ${id}`);

  try {
    if (!id) {
      return res.status(400).json({ success: false, message: "campaignId es requerido" });
    }

    await MetaMarketingService.pauseAllInCampaign(
      companyId,
      id,
      whatsappId ? Number(whatsappId) : undefined
    );

    logger.info(`[Controller:pauseAllInCampaign] ✅ Campaña y ads pausados: ${id}`);
    return res.status(200).json({ success: true, message: "Campaña y todos sus anuncios pausados" });
  } catch (error: any) {
    logger.error(`[Controller:pauseAllInCampaign] ❌ ERROR: ${error.message}`);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Error al pausar campaña"
    });
  }
};

// Activate campaign and all its ads/adsets
export const activateAllInCampaign = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = (req as any).user;
  const { id } = req.params;
  const { whatsappId } = req.query;

  logger.info(`[Controller:activateAllInCampaign] 🚀 REQUEST - companyId: ${companyId}, campaignId: ${id}`);

  try {
    if (!id) {
      return res.status(400).json({ success: false, message: "campaignId es requerido" });
    }

    await MetaMarketingService.activateAllInCampaign(
      companyId,
      id,
      whatsappId ? Number(whatsappId) : undefined
    );

    logger.info(`[Controller:activateAllInCampaign] ✅ Campaña y ads activados: ${id}`);
    return res.status(200).json({ success: true, message: "Campaña y todos sus anuncios activados" });
  } catch (error: any) {
    logger.error(`[Controller:activateAllInCampaign] ❌ ERROR: ${error.message}`);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Error al activar campaña"
    });
  }
};

// ============================================================
// CRUD — AD SETS
// ============================================================

// Create a new ad set
export const createAdSet = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = (req as any).user;
  const { whatsappId } = req.query;
  const { campaignId, name, optimization_goal, billing_event, bid_amount, daily_budget, lifetime_budget, start_time, end_time, targeting, status } = req.body;

  logger.info(`[Controller:createAdSet] 🚀 REQUEST - companyId: ${companyId}, campaignId: ${campaignId}`);

  try {
    if (!campaignId || !name || !optimization_goal || !billing_event || !targeting) {
      return res.status(400).json({
        success: false,
        message: "Los campos 'campaignId', 'name', 'optimization_goal', 'billing_event' y 'targeting' son requeridos"
      });
    }

    const adset = await MetaMarketingService.createAdSet(
      companyId,
      campaignId,
      { name, optimization_goal, billing_event, bid_amount, daily_budget, lifetime_budget, start_time, end_time, targeting, status },
      whatsappId ? Number(whatsappId) : undefined
    );

    logger.info(`[Controller:createAdSet] ✅ Ad set creado: ${adset.id}`);
    return res.status(201).json({ success: true, adset });
  } catch (error: any) {
    logger.error(`[Controller:createAdSet] ❌ ERROR: ${error.message}`);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Error al crear ad set"
    });
  }
};

// Update an existing ad set
export const updateAdSet = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = (req as any).user;
  const { id } = req.params;
  const { whatsappId } = req.query;
  const updates = req.body;

  logger.info(`[Controller:updateAdSet] 🚀 REQUEST - companyId: ${companyId}, adsetId: ${id}`);

  try {
    if (!id) {
      return res.status(400).json({ success: false, message: "adsetId es requerido" });
    }

    const adset = await MetaMarketingService.updateAdSet(
      companyId,
      id,
      updates,
      whatsappId ? Number(whatsappId) : undefined
    );

    logger.info(`[Controller:updateAdSet] ✅ Ad set actualizado: ${id}`);
    return res.status(200).json({ success: true, adset });
  } catch (error: any) {
    logger.error(`[Controller:updateAdSet] ❌ ERROR: ${error.message}`);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Error al actualizar ad set"
    });
  }
};

// ============================================================
// CRUD — ADS
// ============================================================

// Create a new ad
export const createAd = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = (req as any).user;
  const { whatsappId } = req.query;
  const { adsetId, name, creative, status } = req.body;

  logger.info(`[Controller:createAd] 🚀 REQUEST - companyId: ${companyId}, adsetId: ${adsetId}`);

  try {
    if (!adsetId || !name || !creative) {
      return res.status(400).json({
        success: false,
        message: "Los campos 'adsetId', 'name' y 'creative' son requeridos"
      });
    }

    const ad = await MetaMarketingService.createAd(
      companyId,
      adsetId,
      { name, creative, status },
      whatsappId ? Number(whatsappId) : undefined
    );

    logger.info(`[Controller:createAd] ✅ Ad creado: ${ad.id}`);
    return res.status(201).json({ success: true, ad });
  } catch (error: any) {
    logger.error(`[Controller:createAd] ❌ ERROR: ${error.message}`);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Error al crear ad"
    });
  }
};

// Update an existing ad
export const updateAd = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = (req as any).user;
  const { id } = req.params;
  const { whatsappId } = req.query;
  const updates = req.body;

  logger.info(`[Controller:updateAd] 🚀 REQUEST - companyId: ${companyId}, adId: ${id}`);

  try {
    if (!id) {
      return res.status(400).json({ success: false, message: "adId es requerido" });
    }

    const ad = await MetaMarketingService.updateAd(
      companyId,
      id,
      updates,
      whatsappId ? Number(whatsappId) : undefined
    );

    logger.info(`[Controller:updateAd] ✅ Ad actualizado: ${id}`);
    return res.status(200).json({ success: true, ad });
  } catch (error: any) {
    logger.error(`[Controller:updateAd] ❌ ERROR: ${error.message}`);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Error al actualizar ad"
    });
  }
};

export default {
  testConnection,
  getAdAccounts,
  getCampaigns,
  getCampaignById,
  getAds,
  getAdsByCampaign,
  getInsightsTrend,
  getAggregatedInsights,
  getDashboardData,
  invalidateCache,
  getUsageStats,
  getTokenStatus,
  // CRUD Campaigns
  createCampaign,
  updateCampaign,
  deleteCampaign,
  duplicateCampaign,
  pauseAllInCampaign,
  activateAllInCampaign,
  // CRUD AdSets
  createAdSet,
  updateAdSet,
  // CRUD Ads
  createAd,
  updateAd
};
