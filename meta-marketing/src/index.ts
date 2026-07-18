export { MetaClient } from './client';
export { CampaignManager } from './campaigns';
export { InsightsManager } from './insights';
export { ConversionsAPI } from './conversions';
export * from './types';

import { MetaClient } from './client';
import { CampaignManager } from './campaigns';
import { InsightsManager } from './insights';
import { ConversionsAPI } from './conversions';
import { MetaConfig } from './types';

export class MetaMarketing {
  public client: MetaClient;
  public campaigns: CampaignManager;
  public insights: InsightsManager;
  public conversions: ConversionsAPI;

  constructor(config: MetaConfig) {
    this.client = new MetaClient(config);
    this.campaigns = new CampaignManager(this.client);
    this.insights = new InsightsManager(this.client);
    this.conversions = new ConversionsAPI(this.client);
  }

  async validateConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/me') as { id?: string; name?: string };
      // /me returns { id, name } directly, not { data: [...] }
      // So we check for response.id instead of response.data
      console.log('🔍 validateConnection response:', JSON.stringify(response));
      return !!(response && (response.id || response.name));
    } catch (error) {
      console.error('❌ Error validating Meta API connection:', error);
      return false;
    }
  }

  async getAccountInfo(accountId: string): Promise<any> {
    return this.client.get(`/act_${accountId}`, {
      fields: 'id,name,account_status,currency,timezone_name,business,funding_source_details'
    });
  }

  async getAccounts(): Promise<any[]> {
    return this.client.getAllPages('/me/adaccounts', {
      fields: 'id,name,account_status,currency,timezone_name,business'
    });
  }

  getRateLimitStatus(): any {
    return this.client.getRateLimitStatus();
  }

  updateRateLimit(settings: { minTime?: number; maxConcurrent?: number; reservoir?: number }): void {
    this.client.updateRateLimit(settings);
  }
}

export default MetaMarketing;