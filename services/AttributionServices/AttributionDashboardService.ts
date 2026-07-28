import { Op, fn, col, literal } from 'sequelize';
import AttributionTouchpoint from '../../models/AttributionTouchpoint';
import AttributionConversion from '../../models/AttributionConversion';
import AttributionResult from '../../models/AttributionResult';
import AttributionChannelAggregate from '../../models/AttributionChannelAggregate';
import Contact from '../../models/Contact';
import sequelize from '../../database';
import logger, { logError, logInfo, logWarn, logDebug } from '../../utils/logger';

interface ChannelAttribution {
  channel: string;
  firstTouch: number;
  lastTouch: number;
  linear: number;
  timeDecay: number;
  positionBased: number;
  datadriven: number;
  conversions: number;
  revenue: number;
}

interface TouchPoint {
  id: number;
  channel: string;
  campaign: string;
  timestamp: string;
  action: string;
  position: number;
}

interface CustomerJourney {
  id: number;
  customerId: string;
  customerName: string;
  touchPoints: TouchPoint[];
  converted: boolean;
  revenue: number;
  duration: number;
}

interface AttributionMetrics {
  avgTouchpoints: number;
  multiTouchPercentage: number;
  avgConversionTimeHours: number;
  totalConversions: number;
  totalRevenue: number;
}

interface DateRange {
  startDate: Date;
  endDate: Date;
}

type AttributionModel = 'first_touch' | 'last_touch' | 'linear' | 'time_decay' | 'position_based' | 'data_driven';

export class AttributionDashboardService {

  /**
   * Get complete dashboard data including channels, journeys, and metrics
   */
  async getDashboardData(
    companyId: number,
    period: '7days' | '30days' | '90days' | 'custom' = '30days',
    model: AttributionModel = 'time_decay',
    customDateRange?: DateRange
  ): Promise<{
    channels: ChannelAttribution[];
    journeys: CustomerJourney[];
    metrics: AttributionMetrics;
    dateRange: DateRange;
  }> {
    const dateRange = this.getDateRange(period, customDateRange);

    logInfo('📊 Fetching attribution dashboard data', {
      companyId,
      period,
      model,
      dateRange
    });

    try {
      const [channels, journeys, metrics] = await Promise.all([
        this.getChannelAttribution(companyId, dateRange, model),
        this.getCustomerJourneys(companyId, dateRange, { limit: 10 }),
        this.getAggregatedMetrics(companyId, dateRange)
      ]);

      return {
        channels,
        journeys,
        metrics,
        dateRange
      };
    } catch (error) {
      logError('Error fetching dashboard data:', error);

      // [W1-DATA] Estado honesto: en error se devuelve vacio real, NO datos de
      // muestra fabricados ($86.700 etc.) que el usuario veria como suyos.
      return {
        channels: [],
        journeys: [],
        metrics: {
          avgTouchpoints: 0,
          multiTouchPercentage: 0,
          avgConversionTimeHours: 0,
          totalConversions: 0,
          totalRevenue: 0
        },
        dateRange
      };
    }
  }

  /**
   * Get channel attribution data with all models
   */
  async getChannelAttribution(
    companyId: number,
    dateRange: DateRange,
    primaryModel: AttributionModel = 'time_decay'
  ): Promise<ChannelAttribution[]> {
    try {
      // Try to get from aggregates table first (cached data)
      const aggregates = await AttributionChannelAggregate.findAll({
        where: {
          companyId,
          periodStart: { [Op.gte]: dateRange.startDate },
          periodEnd: { [Op.lte]: dateRange.endDate }
        }
      });

      if (aggregates.length > 0) {
        return this.formatAggregatesAsChannelAttribution(aggregates);
      }

      // Calculate from raw data if no aggregates
      return this.calculateChannelAttributionFromRaw(companyId, dateRange);
    } catch (error) {
      logError('Error getting channel attribution:', error);
      // [W1-DATA] vacio honesto en error, no datos de muestra fabricados.
      return [];
    }
  }

  /**
   * Calculate channel attribution from raw touchpoints and results
   */
  private async calculateChannelAttributionFromRaw(
    companyId: number,
    dateRange: DateRange
  ): Promise<ChannelAttribution[]> {
    const models: AttributionModel[] = [
      'first_touch', 'last_touch', 'linear', 'time_decay', 'position_based', 'data_driven'
    ];

    // Get all results grouped by channel and model
    const results = await AttributionResult.findAll({
      where: {
        companyId,
        periodStart: { [Op.gte]: dateRange.startDate },
        periodEnd: { [Op.lte]: dateRange.endDate }
      },
      include: [{
        model: AttributionTouchpoint,
        as: 'touchpoint',
        attributes: ['channel']
      }],
      attributes: [
        'attributionModel',
        [fn('SUM', col('attributionWeight')), 'totalWeight'],
        [fn('SUM', col('attributedRevenue')), 'totalRevenue'],
        [fn('COUNT', fn('DISTINCT', col('conversionId'))), 'conversionCount']
      ],
      group: ['touchpoint.channel', 'attributionModel']
    });

    // Transform results into channel format
    const channelMap = new Map<string, ChannelAttribution>();
    const defaultChannels = ['whatsapp', 'facebook_ads', 'instagram', 'email', 'direct', 'organic'];

    // Initialize channels
    for (const channel of defaultChannels) {
      channelMap.set(channel, {
        channel,
        firstTouch: 0,
        lastTouch: 0,
        linear: 0,
        timeDecay: 0,
        positionBased: 0,
        datadriven: 0,
        conversions: 0,
        revenue: 0
      });
    }

    // Populate from results
    for (const result of results) {
      const channel = (result as any).touchpoint?.channel || 'direct';
      const model = result.attributionModel;
      const weight = parseFloat((result as any).dataValues?.totalWeight || '0');
      const revenue = parseFloat((result as any).dataValues?.totalRevenue || '0');
      const conversions = parseInt((result as any).dataValues?.conversionCount || '0');

      if (!channelMap.has(channel)) {
        channelMap.set(channel, {
          channel,
          firstTouch: 0,
          lastTouch: 0,
          linear: 0,
          timeDecay: 0,
          positionBased: 0,
          datadriven: 0,
          conversions: 0,
          revenue: 0
        });
      }

      const channelData = channelMap.get(channel)!;

      switch (model) {
        case 'first_touch':
          channelData.firstTouch = weight;
          break;
        case 'last_touch':
          channelData.lastTouch = weight;
          break;
        case 'linear':
          channelData.linear = weight;
          break;
        case 'time_decay':
          channelData.timeDecay = weight;
          break;
        case 'position_based':
          channelData.positionBased = weight;
          break;
        case 'data_driven':
          channelData.datadriven = weight;
          break;
      }

      channelData.conversions = Math.max(channelData.conversions, conversions);
      channelData.revenue = Math.max(channelData.revenue, revenue);
    }

    return Array.from(channelMap.values());
  }

  /**
   * Get customer journeys with touchpoints
   */
  async getCustomerJourneys(
    companyId: number,
    dateRange: DateRange,
    options: { limit?: number; offset?: number; converted?: boolean } = {}
  ): Promise<CustomerJourney[]> {
    const { limit = 50, offset = 0, converted } = options;

    try {
      // Get unique journeys with conversions
      const conversions = await AttributionConversion.findAll({
        where: {
          companyId,
          convertedAt: {
            [Op.between]: [dateRange.startDate, dateRange.endDate]
          },
          ...(converted !== undefined && { status: converted ? 'confirmed' : 'pending' })
        },
        include: [{
          model: Contact,
          as: 'contact',
          attributes: ['id', 'name', 'number']
        }],
        order: [['convertedAt', 'DESC']],
        limit,
        offset
      });

      const journeys: CustomerJourney[] = [];

      for (const conversion of conversions) {
        // Get touchpoints for this journey
        const touchpoints = await AttributionTouchpoint.findAll({
          where: {
            journeyId: conversion.journeyId,
            companyId
          },
          order: [['touchpointTimestamp', 'ASC']]
        });

        const contact = (conversion as any).contact;
        const firstTouch = touchpoints[0];
        const lastTouch = touchpoints[touchpoints.length - 1];

        const durationMs = lastTouch && firstTouch
          ? lastTouch.touchpointTimestamp.getTime() - firstTouch.touchpointTimestamp.getTime()
          : 0;
        const durationDays = durationMs / (1000 * 60 * 60 * 24);

        journeys.push({
          id: conversion.id,
          customerId: String(conversion.contactId),
          customerName: contact?.name || `Cliente ${conversion.contactId}`,
          touchPoints: touchpoints.map((tp, index) => ({
            id: tp.id,
            channel: tp.channel,
            campaign: tp.facebookCampaignId || tp.utmCampaign || 'Direct',
            timestamp: tp.touchpointTimestamp.toISOString(),
            action: tp.touchpointType,
            position: index + 1
          })),
          converted: conversion.status === 'confirmed',
          revenue: parseFloat(String(conversion.totalRevenue)) || 0,
          duration: Math.round(durationDays * 10) / 10
        });
      }

      return journeys;
    } catch (error) {
      logError('Error getting customer journeys:', error);
      return [];
    }
  }

  /**
   * Get aggregated metrics for the dashboard
   */
  async getAggregatedMetrics(
    companyId: number,
    dateRange: DateRange
  ): Promise<AttributionMetrics> {
    try {
      // Get total conversions and revenue
      const conversionStats = await AttributionConversion.findOne({
        where: {
          companyId,
          convertedAt: {
            [Op.between]: [dateRange.startDate, dateRange.endDate]
          },
          status: 'confirmed'
        },
        attributes: [
          [fn('COUNT', col('id')), 'totalConversions'],
          [fn('SUM', col('totalRevenue')), 'totalRevenue'],
          [fn('AVG', col('conversionDurationHours')), 'avgConversionTime']
        ],
        raw: true
      }) as any;

      // Get touchpoint statistics
      const touchpointStats = await sequelize.query(`
        SELECT
          AVG(touchpoint_count) as avg_touchpoints,
          (COUNT(CASE WHEN touchpoint_count > 1 THEN 1 END) * 100.0 / COUNT(*)) as multi_touch_pct
        FROM (
          SELECT journey_id, COUNT(*) as touchpoint_count
          FROM "AttributionTouchpoints"
          WHERE company_id = :companyId
            AND touchpoint_timestamp BETWEEN :startDate AND :endDate
          GROUP BY journey_id
        ) journey_counts
      `, {
        replacements: {
          companyId,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate
        },
        type: 'SELECT'
      }) as any[];

      const stats = touchpointStats[0] || {};

      return {
        avgTouchpoints: parseFloat(stats.avg_touchpoints) || 2.4,
        multiTouchPercentage: parseFloat(stats.multi_touch_pct) || 35,
        avgConversionTimeHours: parseFloat(conversionStats?.avgConversionTime) || 48,
        totalConversions: parseInt(conversionStats?.totalConversions) || 0,
        totalRevenue: parseFloat(conversionStats?.totalRevenue) || 0
      };
    } catch (error) {
      logError('Error getting aggregated metrics:', error);
      return {
        avgTouchpoints: 2.4,
        multiTouchPercentage: 35,
        avgConversionTimeHours: 48,
        totalConversions: 0,
        totalRevenue: 0
      };
    }
  }

  /**
   * Get date range based on period
   * Public method to allow access from controllers
   */
  public getDateRange(
    period: '7days' | '30days' | '90days' | 'custom',
    customRange?: DateRange
  ): DateRange {
    if (period === 'custom' && customRange) {
      return customRange;
    }

    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
      case '7days':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '90days':
        startDate.setDate(endDate.getDate() - 90);
        break;
      case '30days':
      default:
        startDate.setDate(endDate.getDate() - 30);
    }

    return { startDate, endDate };
  }

  /**
   * Format aggregates as channel attribution
   */
  private formatAggregatesAsChannelAttribution(
    aggregates: AttributionChannelAggregate[]
  ): ChannelAttribution[] {
    const channelMap = new Map<string, ChannelAttribution>();

    for (const agg of aggregates) {
      if (!channelMap.has(agg.channel)) {
        channelMap.set(agg.channel, {
          channel: agg.channel,
          firstTouch: 0,
          lastTouch: 0,
          linear: 0,
          timeDecay: 0,
          positionBased: 0,
          datadriven: 0,
          conversions: agg.totalConversions,
          revenue: parseFloat(String(agg.totalRevenue))
        });
      }

      const data = channelMap.get(agg.channel)!;
      const attributed = parseFloat(String(agg.attributedConversions));

      switch (agg.attributionModel) {
        case 'first_touch':
          data.firstTouch = attributed;
          break;
        case 'last_touch':
          data.lastTouch = attributed;
          break;
        case 'linear':
          data.linear = attributed;
          break;
        case 'time_decay':
          data.timeDecay = attributed;
          break;
        case 'position_based':
          data.positionBased = attributed;
          break;
        case 'data_driven':
          data.datadriven = attributed;
          break;
      }
    }

    return Array.from(channelMap.values());
  }

  /**
   * Get default channels with sample data for empty state
   */
  private getDefaultChannels(): ChannelAttribution[] {
    return [
      {
        channel: 'WhatsApp',
        firstTouch: 45,
        lastTouch: 78,
        linear: 62,
        timeDecay: 68,
        positionBased: 65,
        datadriven: 72,
        conversions: 289,
        revenue: 86700
      },
      {
        channel: 'Facebook Ads',
        firstTouch: 89,
        lastTouch: 45,
        linear: 67,
        timeDecay: 58,
        positionBased: 72,
        datadriven: 65,
        conversions: 234,
        revenue: 70200
      },
      {
        channel: 'Instagram',
        firstTouch: 34,
        lastTouch: 23,
        linear: 29,
        timeDecay: 26,
        positionBased: 30,
        datadriven: 28,
        conversions: 156,
        revenue: 46800
      },
      {
        channel: 'Email',
        firstTouch: 12,
        lastTouch: 34,
        linear: 23,
        timeDecay: 28,
        positionBased: 18,
        datadriven: 25,
        conversions: 98,
        revenue: 29400
      },
      {
        channel: 'Direct',
        firstTouch: 20,
        lastTouch: 20,
        linear: 19,
        timeDecay: 20,
        positionBased: 15,
        datadriven: 10,
        conversions: 67,
        revenue: 20100
      }
    ];
  }
}

export default new AttributionDashboardService();

