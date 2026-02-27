import { Router } from "express";
import * as MetaMarketingController from "../controllers/MetaMarketingController";
import isAuth from "../middleware/isAuth";

const router = Router();

// Test connection to Facebook Marketing API
router.get(
  "/meta-marketing/test-connection",
  isAuth,
  MetaMarketingController.testConnection
);

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

export default router;
