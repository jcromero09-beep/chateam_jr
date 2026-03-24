/**
 * InterestsManager
 *
 * Gestión de intereses, comportamientos y targeting para Meta Ads.
 * Permite buscar intereses, obtener sugerencias, validar targeting
 * y estimar alcance de audiencias.
 */

import { MetaClient } from './client';

export interface TargetingInterest {
  id: string;
  name: string;
  audience_size: number;
  audience_size_lower_bound?: number;
  audience_size_upper_bound?: number;
  path: string[];
  topic: string;
  description?: string;
}

export interface TargetingBehavior {
  id: string;
  name: string;
  audience_size: number;
  audience_size_lower_bound?: number;
  audience_size_upper_bound?: number;
  description: string;
  platform?: string;
}

export interface TargetingCategory {
  id: string;
  name: string;
  type: string;
  description?: string;
  audience_size?: number;
}

export interface ReachEstimate {
  users: number;
  estimate_ready: boolean;
  bid_estimations?: Array<{
    unsupported: boolean;
    location: number;
    minimum_budget?: number;
  }>;
}

export interface DeliveryEstimate {
  daily_outcomes_curve: Array<{
    spend: number;
    reach: number;
    impressions: number;
    actions: number;
  }>;
  estimate_dau: number;
  estimate_mau: number;
  estimate_ready: boolean;
}

export class InterestsManager {
  constructor(private client: MetaClient) {}

  /**
   * Buscar intereses por keyword
   * Usa la Meta Targeting Search API
   */
  async searchInterests(query: string, locale: string = "es_LA"): Promise<TargetingInterest[]> {
    try {
      const response = await this.client.get('/search', {
        type: 'adinterest',
        q: query,
        locale,
        limit: 50
      });

      return (response.data || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        audience_size: item.audience_size || 0,
        audience_size_lower_bound: item.audience_size_lower_bound,
        audience_size_upper_bound: item.audience_size_upper_bound,
        path: item.path || [],
        topic: item.topic || "",
        description: item.description
      }));
    } catch (error: any) {
      throw new Error(`Error buscando intereses "${query}": ${error.message}`);
    }
  }

  /**
   * Obtener sugerencias de intereses relacionados
   */
  async getSuggestions(interestIds: string[]): Promise<TargetingInterest[]> {
    try {
      const response = await this.client.get('/search', {
        type: 'adinterestsuggestion',
        interest_list: JSON.stringify(interestIds.map(id => ({ id }))),
        limit: 30
      });

      return (response.data || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        audience_size: item.audience_size || 0,
        audience_size_lower_bound: item.audience_size_lower_bound,
        audience_size_upper_bound: item.audience_size_upper_bound,
        path: item.path || [],
        topic: item.topic || "",
        description: item.description
      }));
    } catch (error: any) {
      throw new Error(`Error obteniendo sugerencias: ${error.message}`);
    }
  }

  /**
   * Buscar comportamientos (behaviors)
   */
  async searchBehaviors(query: string): Promise<TargetingBehavior[]> {
    try {
      const response = await this.client.get('/search', {
        type: 'adTargetingCategory',
        class: 'behaviors',
        q: query,
        limit: 30
      });

      return (response.data || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        audience_size: item.audience_size || 0,
        audience_size_lower_bound: item.audience_size_lower_bound,
        audience_size_upper_bound: item.audience_size_upper_bound,
        description: item.description || "",
        platform: item.platform
      }));
    } catch (error: any) {
      throw new Error(`Error buscando comportamientos "${query}": ${error.message}`);
    }
  }

  /**
   * Obtener categorías de targeting disponibles
   */
  async getTargetingCategories(accountId: string): Promise<TargetingCategory[]> {
    try {
      const response = await this.client.get(`/act_${accountId}/targetingbrowse`, {
        limit: 100
      });

      return (response.data || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        type: item.type || "unknown",
        description: item.description,
        audience_size: item.audience_size
      }));
    } catch (error: any) {
      throw new Error(`Error obteniendo categorías de targeting: ${error.message}`);
    }
  }

  /**
   * Obtener estimación de delivery
   */
  async getDeliveryEstimate(
    accountId: string,
    targetingSpec: Record<string, unknown>,
    optimizationGoal: string = "REACH"
  ): Promise<DeliveryEstimate> {
    try {
      const response = await this.client.get(`/act_${accountId}/delivery_estimate`, {
        targeting_spec: JSON.stringify(targetingSpec),
        optimization_goal: optimizationGoal
      });

      const data = response.data?.[0] || response;
      return {
        daily_outcomes_curve: data.daily_outcomes_curve || [],
        estimate_dau: data.estimate_dau || 0,
        estimate_mau: data.estimate_mau || 0,
        estimate_ready: data.estimate_ready !== false
      };
    } catch (error: any) {
      throw new Error(`Error obteniendo delivery estimate: ${error.message}`);
    }
  }

  /**
   * Estimar alcance de una audiencia con targeting_spec
   */
  async estimateReach(
    accountId: string,
    targetingSpec: Record<string, unknown>
  ): Promise<ReachEstimate> {
    try {
      const response = await this.client.get(`/act_${accountId}/reachestimate`, {
        targeting_spec: JSON.stringify(targetingSpec)
      });

      const data = response.data?.[0] || response;
      return {
        users: data.users || data.estimate_mau || 0,
        estimate_ready: data.estimate_ready !== false,
        bid_estimations: data.bid_estimations
      };
    } catch (error: any) {
      throw new Error(`Error estimando alcance: ${error.message}`);
    }
  }

  /**
   * Validar targeting spec completo
   */
  async validateTargeting(
    accountId: string,
    targetingSpec: Record<string, unknown>
  ): Promise<{ valid: boolean; estimate: ReachEstimate | null; error?: string }> {
    try {
      const estimate = await this.estimateReach(accountId, targetingSpec);
      return {
        valid: estimate.users > 0 && estimate.estimate_ready,
        estimate
      };
    } catch (error: any) {
      return {
        valid: false,
        estimate: null,
        error: error.message
      };
    }
  }

  /**
   * Buscar localizaciones para targeting
   */
  async searchLocations(query: string, type: string = "adgeolocation"): Promise<Array<{
    key: string;
    name: string;
    type: string;
    country_code: string;
    region?: string;
    supports_city?: boolean;
  }>> {
    try {
      const response = await this.client.get('/search', {
        type,
        q: query,
        limit: 30
      });

      return (response.data || []).map((item: any) => ({
        key: item.key,
        name: item.name,
        type: item.type,
        country_code: item.country_code || "",
        region: item.region,
        supports_city: item.supports_city
      }));
    } catch (error: any) {
      throw new Error(`Error buscando localizaciones: ${error.message}`);
    }
  }
}
