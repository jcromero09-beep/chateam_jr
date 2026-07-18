import { Request, Response } from 'express';
import AttributionDashboardService from '../services/AttributionServices/AttributionDashboardService';
import logger, { logError, logInfo, logWarn, logDebug } from '../utils/logger';

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    companyId: number;
    profile?: string;
  };
}

/**
 * GET /attribution/dashboard
 * Main attribution dashboard data
 */
export const getDashboardData = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = req.user?.companyId;

    if (!companyId) {
      return res.status(401).json({ error: 'Company ID not found' });
    }

    const {
      period = '30days',
      model = 'time_decay',
      startDate,
      endDate
    } = req.query;

    const customDateRange = startDate && endDate
      ? { startDate: new Date(startDate as string), endDate: new Date(endDate as string) }
      : undefined;

    const data = await AttributionDashboardService.getDashboardData(
      companyId,
      period as '7days' | '30days' | '90days' | 'custom',
      model as any,
      customDateRange
    );

    return res.json(data);
  } catch (error: any) {
    logError('Error in getDashboardData:', error);
    return res.status(500).json({
      error: 'Failed to fetch dashboard data',
      message: error.message
    });
  }
};

/**
 * GET /attribution/channels
 * Channel-level attribution metrics
 */
export const getChannelAttribution = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = req.user?.companyId;

    if (!companyId) {
      return res.status(401).json({ error: 'Company ID not found' });
    }

    const {
      period = '30days',
      model = 'time_decay',
      startDate,
      endDate
    } = req.query;

    const dateRange = startDate && endDate
      ? { startDate: new Date(startDate as string), endDate: new Date(endDate as string) }
      : AttributionDashboardService.getDateRange(period as '7days' | '30days' | '90days' | 'custom');

    const channels = await AttributionDashboardService.getChannelAttribution(
      companyId,
      dateRange,
      model as any
    );

    return res.json({ channels });
  } catch (error: any) {
    logError('Error in getChannelAttribution:', error);
    return res.status(500).json({
      error: 'Failed to fetch channel attribution',
      message: error.message
    });
  }
};

/**
 * GET /attribution/journeys
 * Customer journey data
 */
export const getCustomerJourneys = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = req.user?.companyId;

    if (!companyId) {
      return res.status(401).json({ error: 'Company ID not found' });
    }

    const {
      period = '30days',
      limit = '50',
      offset = '0',
      converted,
      startDate,
      endDate
    } = req.query;

    const dateRange = startDate && endDate
      ? { startDate: new Date(startDate as string), endDate: new Date(endDate as string) }
      : AttributionDashboardService.getDateRange(period as '7days' | '30days' | '90days' | 'custom');

    const journeys = await AttributionDashboardService.getCustomerJourneys(
      companyId,
      dateRange,
      {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        converted: converted === 'true' ? true : converted === 'false' ? false : undefined
      }
    );

    return res.json({ journeys });
  } catch (error: any) {
    logError('Error in getCustomerJourneys:', error);
    return res.status(500).json({
      error: 'Failed to fetch customer journeys',
      message: error.message
    });
  }
};

/**
 * GET /attribution/metrics
 * Aggregated metrics
 */
export const getAggregatedMetrics = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = req.user?.companyId;

    if (!companyId) {
      return res.status(401).json({ error: 'Company ID not found' });
    }

    const {
      period = '30days',
      startDate,
      endDate
    } = req.query;

    const dateRange = startDate && endDate
      ? { startDate: new Date(startDate as string), endDate: new Date(endDate as string) }
      : AttributionDashboardService.getDateRange(period as '7days' | '30days' | '90days' | 'custom');

    const metrics = await AttributionDashboardService.getAggregatedMetrics(
      companyId,
      dateRange
    );

    return res.json({ metrics });
  } catch (error: any) {
    logError('Error in getAggregatedMetrics:', error);
    return res.status(500).json({
      error: 'Failed to fetch metrics',
      message: error.message
    });
  }
};

/**
 * GET /attribution/journey/:journeyId
 * Detailed journey view
 */
export const getJourneyDetail = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = req.user?.companyId;
    const { journeyId } = req.params;

    if (!companyId) {
      return res.status(401).json({ error: 'Company ID not found' });
    }

    if (!journeyId) {
      return res.status(400).json({ error: 'Journey ID is required' });
    }

    // Get touchpoints for this journey
    const AttributionTouchpoint = (await import('../models/AttributionTouchpoint')).default;
    const AttributionConversion = (await import('../models/AttributionConversion')).default;

    const touchpoints = await AttributionTouchpoint.findAll({
      where: {
        journeyId,
        companyId
      },
      order: [['touchpointTimestamp', 'ASC']]
    });

    const conversion = await AttributionConversion.findOne({
      where: {
        journeyId,
        companyId
      }
    });

    return res.json({
      journeyId,
      touchpoints,
      conversion,
      totalTouchpoints: touchpoints.length,
      converted: !!conversion
    });
  } catch (error: any) {
    logError('Error in getJourneyDetail:', error);
    return res.status(500).json({
      error: 'Failed to fetch journey detail',
      message: error.message
    });
  }
};

