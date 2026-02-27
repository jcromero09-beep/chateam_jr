import { Router } from 'express';
import * as AttributionController from '../controllers/AttributionController';
import isAuth from '../middleware/isAuth';

const attributionRoutes = Router();

/**
 * GET /attribution/dashboard
 * Main attribution dashboard data
 * Query params: period (7days, 30days, 90days, custom), model, startDate, endDate
 */
attributionRoutes.get(
  '/attribution/dashboard',
  isAuth,
  AttributionController.getDashboardData
);

/**
 * GET /attribution/channels
 * Channel-level attribution metrics
 * Query params: period, model, channels (filter)
 */
attributionRoutes.get(
  '/attribution/channels',
  isAuth,
  AttributionController.getChannelAttribution
);

/**
 * GET /attribution/journeys
 * Customer journey data (for frontend table)
 * Query params: limit, offset, converted (true/false), minRevenue
 */
attributionRoutes.get(
  '/attribution/journeys',
  isAuth,
  AttributionController.getCustomerJourneys
);

/**
 * GET /attribution/journey/:journeyId
 * Detailed journey view
 */
attributionRoutes.get(
  '/attribution/journey/:journeyId',
  isAuth,
  AttributionController.getJourneyDetail
);

/**
 * GET /attribution/metrics
 * Aggregated metrics (avg touchpoints, multi-touch %, avg time)
 */
attributionRoutes.get(
  '/attribution/metrics',
  isAuth,
  AttributionController.getAggregatedMetrics
);

export default attributionRoutes;
