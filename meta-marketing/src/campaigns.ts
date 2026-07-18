import { MetaClient } from './client';
import { Campaign, AdSet, Ad, MetaApiResponse } from './types';

export class CampaignManager {
  constructor(private client: MetaClient) {}

  async getCampaigns(accountId: string, options?: {
    fields?: string[];
    status?: string[];
    limit?: number;
    includeAdSets?: boolean;
    includeAds?: boolean;
  }): Promise<Campaign[]> {
    // 🔥 IMPORTANTE: effective_status es el estado REAL de entrega (como Ads Manager)
    // status = configuración manual (ACTIVE/PAUSED/DELETED)
    // effective_status = estado operativo real (ACTIVE/PAUSED/COMPLETED/ARCHIVED/etc.)
    const defaultFields = [
      'id', 'name', 'objective', 'status', 'effective_status',
      'created_time', 'updated_time', 'start_time', 'stop_time',
      'daily_budget', 'lifetime_budget', 'budget_remaining', 'account_id'
    ];

    const fields = options?.fields || defaultFields;
    const params: any = {
      fields: fields.join(','),
      limit: options?.limit || 100,
    };

    if (options?.status && options.status.length > 0) {
      params.filtering = [{
        field: 'status',
        operator: 'IN',
        value: options.status,
      }];
    }

    const campaigns = await this.client.getAllPages<Campaign>(
      `/act_${accountId}/campaigns`,
      params
    );

    if (options?.includeAdSets) {
      for (const campaign of campaigns) {
        campaign.adsets = await this.getAdSetsByCampaign(campaign.id, {
          includeAds: options.includeAds,
        });
      }
    }

    return campaigns;
  }

  async getCampaign(campaignId: string, fields?: string[]): Promise<Campaign> {
    const defaultFields = [
      'id', 'name', 'objective', 'status', 'effective_status',
      'created_time', 'updated_time', 'start_time', 'stop_time',
      'daily_budget', 'lifetime_budget', 'budget_remaining', 'account_id'
    ];

    const response = await this.client.get<Campaign>(`/${campaignId}`, {
      fields: (fields || defaultFields).join(','),
    });

    return (response as any)?.data?.[0] ?? (response as any);
  }

  // OJO: los POST de creacion devuelven {"id":"..."} directamente, no {data:[...]}.
  // Acceder con response.data[0] lanza TypeError *despues* de que Meta ya creo el
  // objeto => queda huerfano en la cuenta. Siempre acceso opcional aqui.
  async createCampaign(accountId: string, campaignData: {
    name: string;
    objective: string;
    status?: 'ACTIVE' | 'PAUSED';
    special_ad_categories?: string[];
    daily_budget?: number;
    lifetime_budget?: number;
    start_time?: string;
    stop_time?: string;
    bid_strategy?: string;
  }): Promise<Campaign> {
    const data = {
      name: campaignData.name,
      objective: campaignData.objective,
      status: campaignData.status || 'PAUSED',
      special_ad_categories: campaignData.special_ad_categories || [],
      ...campaignData.daily_budget && { daily_budget: campaignData.daily_budget },
      ...campaignData.lifetime_budget && { lifetime_budget: campaignData.lifetime_budget },
      ...campaignData.start_time && { start_time: campaignData.start_time },
      ...campaignData.stop_time && { stop_time: campaignData.stop_time },
      ...campaignData.bid_strategy && { bid_strategy: campaignData.bid_strategy },
    };

    const response = await this.client.post<{ id: string }>(`/act_${accountId}/campaigns`, data);
    const campaignId = (response as any)?.data?.[0]?.id || (response as any)?.id;

    if (!campaignId) {
      throw new Error('Failed to create campaign: no ID returned from API');
    }

    return this.getCampaign(campaignId);
  }

  async updateCampaign(campaignId: string, updates: {
    name?: string;
    status?: 'ACTIVE' | 'PAUSED';
    daily_budget?: number;
    lifetime_budget?: number;
    start_time?: string;
    stop_time?: string;
  }): Promise<Campaign> {
    await this.client.post(`/${campaignId}`, updates);
    return this.getCampaign(campaignId);
  }

  async deleteCampaign(campaignId: string): Promise<boolean> {
    const response = await this.client.delete(`/${campaignId}`);
    return response.success || false;
  }

  async duplicateCampaign(campaignId: string, newName: string): Promise<Campaign> {
    const originalCampaign = await this.getCampaign(campaignId);

    const accountId = originalCampaign.account_id;
    const newCampaign = await this.createCampaign(accountId, {
      name: newName,
      objective: originalCampaign.objective,
      status: 'PAUSED',
      daily_budget: originalCampaign.daily_budget,
      lifetime_budget: originalCampaign.lifetime_budget,
    });

    return newCampaign;
  }

  async getAdSetsByCampaign(campaignId: string, options?: {
    fields?: string[];
    status?: string[];
    includeAds?: boolean;
  }): Promise<AdSet[]> {
    const defaultFields = [
      'id', 'name', 'campaign_id', 'status', 'created_time', 'updated_time',
      'start_time', 'end_time', 'daily_budget', 'lifetime_budget',
      'optimization_goal', 'billing_event', 'targeting',
      // [Fase2·D3.1] Sin estos, graduar un ganador CTWA lo clonaba como trafico
      // normal (destination_type se perdia): la campaña de escalado no abriria WhatsApp.
      'destination_type', 'promoted_object'
    ];

    const fields = options?.fields || defaultFields;
    const params: any = {
      fields: fields.join(','),
    };

    if (options?.status && options.status.length > 0) {
      params.filtering = [{
        field: 'status',
        operator: 'IN',
        value: options.status,
      }];
    }

    const adsets = await this.client.getAllPages<AdSet>(
      `/${campaignId}/adsets`,
      params
    );

    if (options?.includeAds) {
      for (const adset of adsets) {
        adset.ads = await this.getAdsByAdSet(adset.id);
      }
    }

    return adsets;
  }

  async createAdSet(campaignId: string, adsetData: {
    name: string;
    optimization_goal: string;
    billing_event: string;
    bid_amount?: number;
    daily_budget?: number;
    lifetime_budget?: number;
    start_time?: string;
    end_time?: string;
    targeting: any;
    status?: 'ACTIVE' | 'PAUSED';
    // [Fase2·D1.1] Necesarios para Click-to-WhatsApp: sin destination_type=WHATSAPP
    // y promoted_object.page_id, Meta rechaza el adset o lo crea como trafico normal.
    destination_type?: string;
    promoted_object?: { page_id?: string; whatsapp_phone_number?: string; [k: string]: any };
  }): Promise<AdSet> {
    const data = {
      name: adsetData.name,
      campaign_id: campaignId,
      optimization_goal: adsetData.optimization_goal,
      billing_event: adsetData.billing_event,
      targeting: adsetData.targeting,
      status: adsetData.status || 'PAUSED',
      ...adsetData.bid_amount && { bid_amount: adsetData.bid_amount },
      ...adsetData.daily_budget && { daily_budget: adsetData.daily_budget },
      ...adsetData.lifetime_budget && { lifetime_budget: adsetData.lifetime_budget },
      ...adsetData.start_time && { start_time: adsetData.start_time },
      ...adsetData.end_time && { end_time: adsetData.end_time },
      ...adsetData.destination_type && { destination_type: adsetData.destination_type },
      ...adsetData.promoted_object && { promoted_object: adsetData.promoted_object },
    };

    const campaign = await this.getCampaign(campaignId);
    const accountId = campaign.account_id;

    const response = await this.client.post<{ id: string }>(`/act_${accountId}/adsets`, data);
    const adsetId = (response as any)?.data?.[0]?.id || (response as any)?.id;

    if (!adsetId) {
      throw new Error('Failed to create ad set: no ID returned from API');
    }

    return this.getAdSet(adsetId);
  }

  async getAdSet(adsetId: string, fields?: string[]): Promise<AdSet> {
    const defaultFields = [
      'id', 'name', 'campaign_id', 'status', 'created_time', 'updated_time',
      'start_time', 'end_time', 'daily_budget', 'lifetime_budget',
      'optimization_goal', 'billing_event', 'targeting',
      // [Fase2·D1.1] Sin estos campos no se puede distinguir un adset CTWA de uno
      // de trafico normal: son lo unico que diferencia "abre WhatsApp" de "abre un link".
      'destination_type', 'promoted_object',
      // [Fase2·D4.1] learning_stage_info lo reporta la PROPIA Meta: status
      // (LEARNING / SUCCESS / LEARNING_LIMITED) y last_sig_edit_ts, la marca de la
      // ultima edicion significativa (la que reinicia el aprendizaje). Sin esto
      // habria que adivinar la fase; con esto se pregunta a la fuente.
      'learning_stage_info'
    ];

    const response = await this.client.get<AdSet>(`/${adsetId}`, {
      fields: (fields || defaultFields).join(','),
    });

    return (response as any)?.data?.[0] ?? (response as any);
  }

  async updateAdSet(adsetId: string, updates: {
    name?: string;
    status?: 'ACTIVE' | 'PAUSED';
    daily_budget?: number;
    lifetime_budget?: number;
    targeting?: any;
    bid_amount?: number;
  }): Promise<AdSet> {
    await this.client.post(`/${adsetId}`, updates);
    return this.getAdSet(adsetId);
  }

  async getAdsByAdSet(adsetId: string, fields?: string[]): Promise<Ad[]> {
    const defaultFields = [
      'id', 'name', 'adset_id', 'campaign_id', 'status',
      'created_time', 'updated_time', 'creative'
    ];

    const adFields = fields || defaultFields;
    return this.client.getAllPages<Ad>(`/${adsetId}/ads`, {
      fields: adFields.join(','),
    });
  }

  async createAd(adsetId: string, adData: {
    name: string;
    creative: {
      title?: string;
      body?: string;
      image_hash?: string;
      video_id?: string;
      call_to_action?: any;
      object_story_spec?: any;
    };
    status?: 'ACTIVE' | 'PAUSED';
  }): Promise<Ad> {
    const adset = await this.getAdSet(adsetId);
    const campaign = await this.getCampaign(adset.campaign_id);
    const accountId = campaign.account_id;

    const data = {
      name: adData.name,
      adset_id: adsetId,
      creative: adData.creative,
      status: adData.status || 'PAUSED',
    };

    const response = await this.client.post<{ id: string }>(`/act_${accountId}/ads`, data);
    const adId = (response as any)?.data?.[0]?.id || (response as any)?.id;

    if (!adId) {
      throw new Error('Failed to create ad: no ID returned from API');
    }

    return this.getAd(adId);
  }

  async getAd(adId: string, fields?: string[]): Promise<Ad> {
    const defaultFields = [
      'id', 'name', 'adset_id', 'campaign_id', 'status',
      'created_time', 'updated_time', 'creative'
    ];

    const response = await this.client.get<Ad>(`/${adId}`, {
      fields: (fields || defaultFields).join(','),
    });

    return (response as any)?.data?.[0] ?? (response as any);
  }

  async updateAd(adId: string, updates: {
    name?: string;
    status?: 'ACTIVE' | 'PAUSED';
    creative?: any;
  }): Promise<Ad> {
    await this.client.post(`/${adId}`, updates);
    return this.getAd(adId);
  }

  async getActiveCampaigns(accountId: string): Promise<Campaign[]> {
    return this.getCampaigns(accountId, {
      status: ['ACTIVE'],
      includeAdSets: true,
      includeAds: true,
    });
  }

  async pauseAllInCampaign(campaignId: string): Promise<void> {
    const adsets = await this.getAdSetsByCampaign(campaignId, { includeAds: true });

    for (const adset of adsets) {
      if (adset.status === 'ACTIVE') {
        await this.updateAdSet(adset.id, { status: 'PAUSED' });
      }

      if (adset.ads) {
        for (const ad of adset.ads) {
          if (ad.status === 'ACTIVE') {
            await this.updateAd(ad.id, { status: 'PAUSED' });
          }
        }
      }
    }

    await this.updateCampaign(campaignId, { status: 'PAUSED' });
  }

  async activateAllInCampaign(campaignId: string): Promise<void> {
    await this.updateCampaign(campaignId, { status: 'ACTIVE' });

    const adsets = await this.getAdSetsByCampaign(campaignId, { includeAds: true });

    for (const adset of adsets) {
      await this.updateAdSet(adset.id, { status: 'ACTIVE' });

      if (adset.ads) {
        for (const ad of adset.ads) {
          await this.updateAd(ad.id, { status: 'ACTIVE' });
        }
      }
    }
  }
}