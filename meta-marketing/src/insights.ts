import moment from 'moment';
import { createObjectCsvWriter } from 'csv-writer';
import { MetaClient } from './client';
import {
  InsightsQuery,
  CampaignInsights,
  AdSetInsights,
  AdInsights,
  ExportOptions,
  MetaApiResponse
} from './types';

export class InsightsManager {
  constructor(private client: MetaClient) {}

  async getCampaignInsights(
    campaignId: string,
    query: Partial<InsightsQuery> = {}
  ): Promise<CampaignInsights[]> {
    const defaultFields = [
      'impressions', 'clicks', 'spend', 'reach', 'frequency',
      'ctr', 'cpc', 'cpm', 'cpp', 'date_start', 'date_stop'
    ];

    const insightsQuery: InsightsQuery = {
      level: 'campaign',
      fields: query.fields || defaultFields,
      time_range: query.time_range || { time_preset: 'last_30_days' },
      ...query.breakdowns && { breakdowns: query.breakdowns },
      ...query.action_breakdowns && { action_breakdowns: query.action_breakdowns },
      ...query.filtering && { filtering: query.filtering },
      ...query.sort && { sort: query.sort },
      limit: query.limit || 100,
    };

    const params = this.buildInsightsParams(insightsQuery);
    const insights = await this.client.getAllPages<CampaignInsights>(
      `/${campaignId}/insights`,
      params
    );

    return this.processInsightsData(insights);
  }

  async getAdSetInsights(
    adsetId: string,
    query: Partial<InsightsQuery> = {}
  ): Promise<AdSetInsights[]> {
    const defaultFields = [
      'adset_id', 'adset_name', 'impressions', 'clicks', 'spend',
      'reach', 'frequency', 'ctr', 'cpc', 'cpm', 'date_start', 'date_stop'
    ];

    const insightsQuery: InsightsQuery = {
      level: 'adset',
      fields: query.fields || defaultFields,
      time_range: query.time_range || { time_preset: 'last_30_days' },
      ...query.breakdowns && { breakdowns: query.breakdowns },
      ...query.action_breakdowns && { action_breakdowns: query.action_breakdowns },
      ...query.filtering && { filtering: query.filtering },
      limit: query.limit || 100,
    };

    const params = this.buildInsightsParams(insightsQuery);
    const insights = await this.client.getAllPages<AdSetInsights>(
      `/${adsetId}/insights`,
      params
    );

    return this.processInsightsData(insights);
  }

  async getAdInsights(
    adId: string,
    query: Partial<InsightsQuery> = {}
  ): Promise<AdInsights[]> {
    const defaultFields = [
      'ad_id', 'ad_name', 'adset_id', 'adset_name', 'impressions',
      'clicks', 'spend', 'reach', 'frequency', 'ctr', 'cpc', 'cpm',
      'date_start', 'date_stop'
    ];

    const insightsQuery: InsightsQuery = {
      level: 'ad',
      fields: query.fields || defaultFields,
      time_range: query.time_range || { time_preset: 'last_30_days' },
      ...query.breakdowns && { breakdowns: query.breakdowns },
      ...query.action_breakdowns && { action_breakdowns: query.action_breakdowns },
      ...query.filtering && { filtering: query.filtering },
      limit: query.limit || 100,
    };

    const params = this.buildInsightsParams(insightsQuery);
    const insights = await this.client.getAllPages<AdInsights>(
      `/${adId}/insights`,
      params
    );

    return this.processInsightsData(insights);
  }

  async getAccountInsights(
    accountId: string,
    query: Partial<InsightsQuery> = {}
  ): Promise<CampaignInsights[]> {
    const defaultFields = [
      'account_id', 'account_name', 'impressions', 'clicks', 'spend',
      'reach', 'frequency', 'ctr', 'cpc', 'cpm', 'date_start', 'date_stop'
    ];

    const insightsQuery: InsightsQuery = {
      level: query.level || 'account',
      fields: query.fields || defaultFields,
      time_range: query.time_range || { time_preset: 'last_30_days' },
      ...query.breakdowns && { breakdowns: query.breakdowns },
      ...query.action_breakdowns && { action_breakdowns: query.action_breakdowns },
      ...query.filtering && { filtering: query.filtering },
      limit: query.limit || 1000,
    };

    const params = this.buildInsightsParams(insightsQuery);
    const insights = await this.client.getAllPages<CampaignInsights>(
      `/act_${accountId}/insights`,
      params
    );

    return this.processInsightsData(insights);
  }

  async getBulkInsights(
    accountId: string,
    query: Partial<InsightsQuery> = {}
  ): Promise<{
    campaigns: CampaignInsights[];
    adsets: AdSetInsights[];
    ads: AdInsights[];
  }> {
    const [campaigns, adsets, ads] = await Promise.all([
      this.getAccountInsights(accountId, { ...query, level: 'campaign' }),
      this.getAccountInsights(accountId, { ...query, level: 'adset' }) as Promise<AdSetInsights[]>,
      this.getAccountInsights(accountId, { ...query, level: 'ad' }) as Promise<AdInsights[]>,
    ]);

    return { campaigns, adsets, ads };
  }

  async getInsightsWithBreakdowns(
    entityId: string,
    level: 'campaign' | 'adset' | 'ad',
    breakdowns: string[],
    query: Partial<InsightsQuery> = {}
  ): Promise<any[]> {
    const insightsQuery: InsightsQuery = {
      level,
      fields: query.fields || [
        'impressions', 'clicks', 'spend', 'reach', 'frequency',
        'ctr', 'cpc', 'cpm', 'date_start', 'date_stop'
      ],
      time_range: query.time_range || { time_preset: 'last_30_days' },
      breakdowns,
      ...query.action_breakdowns && { action_breakdowns: query.action_breakdowns },
      ...query.filtering && { filtering: query.filtering },
      limit: query.limit || 1000,
    };

    const params = this.buildInsightsParams(insightsQuery);
    const endpoint = level === 'campaign' || level === 'adset' || level === 'ad'
      ? `/${entityId}/insights`
      : `/act_${entityId}/insights`;

    return this.client.getAllPages(endpoint, params);
  }

  async getConversionInsights(
    entityId: string,
    level: 'campaign' | 'adset' | 'ad' | 'account',
    query: Partial<InsightsQuery> = {}
  ): Promise<any[]> {
    const conversionFields = [
      'conversions', 'conversion_rate_ranking', 'cost_per_conversion',
      'conversions_value', 'cost_per_unique_conversion', 'unique_conversions',
      'website_ctr', 'website_purchase_roas', 'actions', 'action_values'
    ];

    const insightsQuery: InsightsQuery = {
      level,
      fields: [...(query.fields || []), ...conversionFields],
      time_range: query.time_range || { time_preset: 'last_30_days' },
      action_breakdowns: ['action_type'],
      ...query.breakdowns && { breakdowns: query.breakdowns },
      ...query.filtering && { filtering: query.filtering },
      limit: query.limit || 1000,
    };

    const params = this.buildInsightsParams(insightsQuery);
    const endpoint = level === 'account'
      ? `/act_${entityId}/insights`
      : `/${entityId}/insights`;

    return this.client.getAllPages(endpoint, params);
  }

  async getVideoInsights(
    entityId: string,
    level: 'campaign' | 'adset' | 'ad',
    query: Partial<InsightsQuery> = {}
  ): Promise<any[]> {
    const videoFields = [
      'video_avg_time_watched_actions', 'video_p25_watched_actions',
      'video_p50_watched_actions', 'video_p75_watched_actions',
      'video_p95_watched_actions', 'video_p100_watched_actions',
      'video_play_actions', 'video_thruplay_watched_actions'
    ];

    const insightsQuery: InsightsQuery = {
      level,
      fields: [...(query.fields || []), ...videoFields],
      time_range: query.time_range || { time_preset: 'last_30_days' },
      action_breakdowns: ['action_type'],
      ...query.breakdowns && { breakdowns: query.breakdowns },
      ...query.filtering && { filtering: query.filtering },
      limit: query.limit || 1000,
    };

    const params = this.buildInsightsParams(insightsQuery);
    return this.client.getAllPages(`/${entityId}/insights`, params);
  }

  async exportInsightsToCSV(
    insights: any[],
    filename: string,
    options: Partial<ExportOptions> = {}
  ): Promise<string> {
    const csvOptions = {
      format: 'csv',
      includeHeaders: true,
      dateFormat: 'YYYY-MM-DD',
      ...options,
    };

    if (insights.length === 0) {
      throw new Error('No hay datos para exportar');
    }

    const headers = Object.keys(insights[0]).map(key => ({
      id: key,
      title: key.toUpperCase().replace(/_/g, ' '),
    }));

    const csvWriter = createObjectCsvWriter({
      path: filename,
      header: headers,
    });

    const processedData = insights.map(insight => {
      const processed: any = {};
      for (const [key, value] of Object.entries(insight)) {
        if (key.includes('date') && csvOptions.dateFormat) {
          processed[key] = moment(value as string).format(csvOptions.dateFormat);
        } else if (typeof value === 'number') {
          processed[key] = Number(value).toFixed(2);
        } else {
          processed[key] = value;
        }
      }
      return processed;
    });

    await csvWriter.writeRecords(processedData);
    return filename;
  }

  async getInsightsComparison(
    entityId: string,
    level: 'campaign' | 'adset' | 'ad',
    currentPeriod: { since: string; until: string },
    previousPeriod: { since: string; until: string },
    fields?: string[]
  ): Promise<{
    current: any[];
    previous: any[];
    comparison: any[];
  }> {
    const defaultFields = ['impressions', 'clicks', 'spend', 'reach', 'ctr', 'cpc', 'cpm'];

    const [current, previous] = await Promise.all([
      this.getInsightsByLevel(entityId, level, {
        fields: fields || defaultFields,
        time_range: currentPeriod,
      }),
      this.getInsightsByLevel(entityId, level, {
        fields: fields || defaultFields,
        time_range: previousPeriod,
      }),
    ]);

    const comparison = this.calculateComparison(current, previous, fields || defaultFields);

    return { current, previous, comparison };
  }

  private async getInsightsByLevel(
    entityId: string,
    level: 'campaign' | 'adset' | 'ad',
    query: Partial<InsightsQuery>
  ): Promise<any[]> {
    switch (level) {
      case 'campaign':
        return this.getCampaignInsights(entityId, query);
      case 'adset':
        return this.getAdSetInsights(entityId, query);
      case 'ad':
        return this.getAdInsights(entityId, query);
      default:
        throw new Error(`Nivel no soportado: ${level}`);
    }
  }

  private calculateComparison(current: any[], previous: any[], fields: string[]): any[] {
    if (current.length === 0 || previous.length === 0) {
      return [];
    }

    const currentData = current[0];
    const previousData = previous[0];

    return fields.map(field => {
      const currentValue = Number(currentData[field]) || 0;
      const previousValue = Number(previousData[field]) || 0;
      const change = currentValue - previousValue;
      const changePercent = previousValue > 0 ? (change / previousValue) * 100 : 0;

      return {
        metric: field,
        current: currentValue,
        previous: previousValue,
        change,
        changePercent: Number(changePercent.toFixed(2)),
        trend: change > 0 ? 'up' : change < 0 ? 'down' : 'stable',
      };
    });
  }

  private buildInsightsParams(query: InsightsQuery): any {
    const params: any = {
      level: query.level,
      fields: query.fields.join(','),
      limit: query.limit || 100,
    };

    if (query.time_range) {
      if ('time_preset' in query.time_range) {
        params.date_preset = query.time_range.time_preset;
      } else {
        params.time_range = JSON.stringify(query.time_range);
      }
    }

    if (query.time_increment) {
      params.time_increment = query.time_increment;
    }

    if (query.breakdowns && query.breakdowns.length > 0) {
      params.breakdowns = query.breakdowns.join(',');
    }

    if (query.action_breakdowns && query.action_breakdowns.length > 0) {
      params.action_breakdowns = query.action_breakdowns.join(',');
    }

    if (query.filtering && query.filtering.length > 0) {
      params.filtering = JSON.stringify(query.filtering);
    }

    if (query.sort && query.sort.length > 0) {
      params.sort = query.sort.join(',');
    }

    return params;
  }

  private processInsightsData(insights: any[]): any[] {
    return insights.map(insight => {
      const processed = { ...insight };

      for (const [key, value] of Object.entries(processed)) {
        if (typeof value === 'string' && !isNaN(Number(value))) {
          processed[key] = Number(value);
        }
      }

      if (processed.clicks && processed.impressions) {
        processed.ctr = Number(((processed.clicks / processed.impressions) * 100).toFixed(4));
      }

      if (processed.spend && processed.clicks) {
        processed.cpc = Number((processed.spend / processed.clicks).toFixed(4));
      }

      if (processed.spend && processed.impressions) {
        processed.cpm = Number(((processed.spend / processed.impressions) * 1000).toFixed(4));
      }

      return processed;
    });
  }
}