import axios, { AxiosInstance, AxiosResponse } from 'axios';

interface ApiConfig {
  baseURL: string;
  timeout: number;
  tenantId?: string;
  authToken?: string;
}

interface CampaignMetrics {
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  ctr: number;
  cpc: number;
  cpm: number;
  roas: number;
  reach: number;
  frequency: number;
}

interface Campaign {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'ended';
  objective: string;
  budget: number;
  platform: 'facebook' | 'google' | 'linkedin' | 'other';
  startDate: string;
  endDate?: string;
  metrics: CampaignMetrics;
  insights?: AiInsight[];
}

interface AiInsight {
  id: string;
  type: 'optimization' | 'alert' | 'opportunity' | 'recommendation';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: string;
  confidence: number;
  actionItems: string[];
  relatedCampaigns: string[];
  timestamp: string;
}

interface AttributionData {
  source: string;
  medium: string;
  campaign: string;
  leads: number;
  conversions: number;
  revenue: number;
  attribution_method: string;
  confidence: number;
}

interface DashboardMetrics {
  overview: {
    totalSpend: number;
    totalLeads: number;
    totalRevenue: number;
    averageRoas: number;
    activeCampaigns: number;
    topPerformingPlatform: string;
  };
  performance: {
    daily: Array<{
      date: string;
      spend: number;
      leads: number;
      revenue: number;
      roas: number;
    }>;
    byPlatform: Array<{
      platform: string;
      spend: number;
      leads: number;
      roas: number;
      share: number;
    }>;
    byCampaign: Campaign[];
  };
  attribution: AttributionData[];
  insights: AiInsight[];
  alerts: Array<{
    id: string;
    type: 'budget' | 'performance' | 'attribution' | 'system';
    severity: 'critical' | 'warning' | 'info';
    message: string;
    timestamp: string;
    actionRequired: boolean;
  }>;
}

interface AuditRequest {
  accountId: string;
  campaignIds?: string[];
  timeRange: {
    since: string;
    until: string;
  };
  analysisType: 'performance' | 'optimization' | 'attribution' | 'comprehensive';
}

interface AuditResult {
  id: string;
  summary: string;
  performanceScore: number;
  insights: AiInsight[];
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low';
    category: string;
    title: string;
    description: string;
    expectedImpact: string;
  }>;
  riskFactors: Array<{
    type: string;
    severity: 'high' | 'medium' | 'low';
    description: string;
    mitigation: string[];
  }>;
  opportunities: Array<{
    type: string;
    potential: 'high' | 'medium' | 'low';
    description: string;
    estimatedImpact: string;
  }>;
}

export class MarketingApiService {
  private api: AxiosInstance;
  private config: ApiConfig;

  constructor(config: Partial<ApiConfig> = {}) {
    this.config = {
      baseURL: process.env.REACT_APP_API_BASE_URL || 'http://localhost:3000/api',
      timeout: 30000,
      ...config,
    };

    this.api = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.tenantId && { 'X-Tenant-ID': this.config.tenantId }),
        ...(this.config.authToken && { 'Authorization': `Bearer ${this.config.authToken}` }),
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.api.interceptors.request.use(
      (config) => {
        console.log(`📤 API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('❌ Request error:', error);
        return Promise.reject(error);
      }
    );

    this.api.interceptors.response.use(
      (response) => {
        console.log(`📥 API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        console.error('❌ Response error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  // Dashboard Methods
  async getDashboardMetrics(timeRange: { since: string; until: string }): Promise<DashboardMetrics> {
    try {
      const response: AxiosResponse<DashboardMetrics> = await this.api.get('/marketing/dashboard', {
        params: timeRange,
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching dashboard metrics:', error);
      // Return mock data for demo
      return this.getMockDashboardMetrics();
    }
  }

  // Campaign Methods
  async getCampaigns(filters?: {
    platform?: string;
    status?: string;
    timeRange?: { since: string; until: string };
  }): Promise<Campaign[]> {
    try {
      const response: AxiosResponse<{ campaigns: Campaign[] }> = await this.api.get('/marketing/campaigns', {
        params: filters,
      });
      return response.data.campaigns;
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      return this.getMockCampaigns();
    }
  }

  async getCampaign(campaignId: string): Promise<Campaign> {
    try {
      const response: AxiosResponse<Campaign> = await this.api.get(`/marketing/campaigns/${campaignId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching campaign:', error);
      throw error;
    }
  }

  async updateCampaign(campaignId: string, updates: Partial<Campaign>): Promise<Campaign> {
    try {
      const response: AxiosResponse<Campaign> = await this.api.patch(`/marketing/campaigns/${campaignId}`, updates);
      return response.data;
    } catch (error) {
      console.error('Error updating campaign:', error);
      throw error;
    }
  }

  // AI Audit Methods
  async requestAudit(request: AuditRequest): Promise<{ auditId: string }> {
    try {
      const response: AxiosResponse<{ auditId: string }> = await this.api.post('/audit-campaigns', request);
      return response.data;
    } catch (error) {
      console.error('Error requesting audit:', error);
      throw error;
    }
  }

  async getAuditResult(auditId: string): Promise<AuditResult> {
    try {
      const response: AxiosResponse<{ audit: AuditResult }> = await this.api.get(`/audit/${auditId}`);
      return response.data.audit;
    } catch (error) {
      console.error('Error fetching audit result:', error);
      throw error;
    }
  }

  async getQuickAudit(timeRange: { since: string; until: string }): Promise<{
    performanceScore: number;
    summary: any;
    keyInsights: AiInsight[];
    riskCount: number;
    opportunityCount: number;
  }> {
    try {
      const response = await this.api.post('/audit/quick', {
        accountId: 'current',
        timeRange,
      });
      return response.data.quickAudit;
    } catch (error) {
      console.error('Error fetching quick audit:', error);
      return this.getMockQuickAudit();
    }
  }

  // Attribution Methods
  async getAttributionData(timeRange: { since: string; until: string }): Promise<AttributionData[]> {
    try {
      const response: AxiosResponse<{ attribution: AttributionData[] }> = await this.api.get('/attribution', {
        params: timeRange,
      });
      return response.data.attribution;
    } catch (error) {
      console.error('Error fetching attribution data:', error);
      return this.getMockAttributionData();
    }
  }

  // Insights Methods
  async getInsights(filters?: {
    type?: string;
    priority?: string;
    limit?: number;
  }): Promise<AiInsight[]> {
    try {
      const response: AxiosResponse<{ insights: AiInsight[] }> = await this.api.get('/marketing/insights', {
        params: filters,
      });
      return response.data.insights;
    } catch (error) {
      console.error('Error fetching insights:', error);
      return this.getMockInsights();
    }
  }

  async markInsightAsRead(insightId: string): Promise<void> {
    try {
      await this.api.post(`/marketing/insights/${insightId}/read`);
    } catch (error) {
      console.error('Error marking insight as read:', error);
    }
  }

  // Export Methods
  async exportDashboardData(format: 'csv' | 'pdf' | 'excel', timeRange: { since: string; until: string }): Promise<Blob> {
    try {
      const response = await this.api.post('/marketing/export', {
        format,
        timeRange,
      }, {
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      console.error('Error exporting data:', error);
      throw error;
    }
  }

  // Mock Data Methods (for demo purposes)
  private getMockDashboardMetrics(): DashboardMetrics {
    const today = new Date();
    const dailyData = Array.from({ length: 30 }, (_, i) => {
      const date = new Date(today);
      date.setDate(date.getDate() - (29 - i));
      return {
        date: date.toISOString().split('T')[0],
        spend: Math.random() * 1000 + 500,
        leads: Math.floor(Math.random() * 50 + 20),
        revenue: Math.random() * 5000 + 2000,
        roas: Math.random() * 3 + 1,
      };
    });

    return {
      overview: {
        totalSpend: 25000,
        totalLeads: 850,
        totalRevenue: 125000,
        averageRoas: 4.2,
        activeCampaigns: 12,
        topPerformingPlatform: 'Facebook',
      },
      performance: {
        daily: dailyData,
        byPlatform: [
          { platform: 'Facebook', spend: 12000, leads: 420, roas: 4.5, share: 48 },
          { platform: 'Google', spend: 8000, leads: 280, roas: 3.8, share: 32 },
          { platform: 'LinkedIn', spend: 5000, leads: 150, roas: 3.2, share: 20 },
        ],
        byCampaign: this.getMockCampaigns(),
      },
      attribution: this.getMockAttributionData(),
      insights: this.getMockInsights(),
      alerts: [
        {
          id: '1',
          type: 'budget',
          severity: 'warning',
          message: 'Campaña "Lead Gen Q4" cerca del límite de presupuesto (85% usado)',
          timestamp: new Date().toISOString(),
          actionRequired: true,
        },
        {
          id: '2',
          type: 'performance',
          severity: 'critical',
          message: 'CTR bajo detectado en 3 campañas de Facebook',
          timestamp: new Date().toISOString(),
          actionRequired: true,
        },
      ],
    };
  }

  private getMockCampaigns(): Campaign[] {
    return [
      {
        id: '1',
        name: 'Lead Gen Q4 2024',
        status: 'active',
        objective: 'lead_generation',
        budget: 5000,
        platform: 'facebook',
        startDate: '2024-10-01',
        endDate: '2024-12-31',
        metrics: {
          impressions: 125000,
          clicks: 2500,
          spend: 3750,
          conversions: 85,
          ctr: 2.0,
          cpc: 1.5,
          cpm: 30,
          roas: 4.2,
          reach: 45000,
          frequency: 2.8,
        },
      },
      {
        id: '2',
        name: 'Brand Awareness Campaign',
        status: 'active',
        objective: 'brand_awareness',
        budget: 3000,
        platform: 'google',
        startDate: '2024-09-15',
        endDate: '2024-11-15',
        metrics: {
          impressions: 200000,
          clicks: 3000,
          spend: 2100,
          conversions: 45,
          ctr: 1.5,
          cpc: 0.7,
          cpm: 10.5,
          roas: 3.1,
          reach: 85000,
          frequency: 2.4,
        },
      },
    ];
  }

  private getMockInsights(): AiInsight[] {
    return [
      {
        id: '1',
        type: 'optimization',
        priority: 'high',
        title: 'Oportunidad de Optimización CTR',
        description: 'Tus anuncios de Facebook tienen un CTR 35% por debajo del promedio de la industria',
        impact: 'Potencial aumento del 25% en leads con mismo presupuesto',
        confidence: 0.89,
        actionItems: [
          'Actualizar creativos con copy más directo',
          'Probar headlines con urgencia',
          'Optimizar targeting para audiencias más específicas',
        ],
        relatedCampaigns: ['1'],
        timestamp: new Date().toISOString(),
      },
      {
        id: '2',
        type: 'opportunity',
        priority: 'medium',
        title: 'Escalar Campaña Exitosa',
        description: 'La campaña "Brand Awareness" tiene ROAS excepcional y presupuesto subutilizado',
        impact: 'Posible incremento de 40% en conversiones',
        confidence: 0.92,
        actionItems: [
          'Incrementar presupuesto diario en 50%',
          'Expandir audiencias similares',
          'Duplicar para otras regiones',
        ],
        relatedCampaigns: ['2'],
        timestamp: new Date().toISOString(),
      },
    ];
  }

  private getMockAttributionData(): AttributionData[] {
    return [
      {
        source: 'facebook',
        medium: 'cpc',
        campaign: 'Lead Gen Q4 2024',
        leads: 85,
        conversions: 68,
        revenue: 15000,
        attribution_method: 'last_touch',
        confidence: 0.92,
      },
      {
        source: 'google',
        medium: 'cpc',
        campaign: 'Brand Awareness Campaign',
        leads: 45,
        conversions: 32,
        revenue: 8500,
        attribution_method: 'last_touch',
        confidence: 0.87,
      },
      {
        source: 'organic',
        medium: 'search',
        campaign: '(organic)',
        leads: 25,
        conversions: 20,
        revenue: 4200,
        attribution_method: 'first_touch',
        confidence: 0.75,
      },
    ];
  }

  private getMockQuickAudit() {
    return {
      performanceScore: 78,
      summary: {
        totalCampaigns: 12,
        totalSpend: 25000,
        totalImpressions: 450000,
        totalClicks: 8500,
        averageCTR: 1.89,
        averageCPC: 2.94,
      },
      keyInsights: this.getMockInsights().slice(0, 3),
      riskCount: 2,
      opportunityCount: 4,
    };
  }

  // Utility Methods
  updateConfig(newConfig: Partial<ApiConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Update headers
    this.api.defaults.headers.common = {
      ...this.api.defaults.headers.common,
      ...(this.config.tenantId && { 'X-Tenant-ID': this.config.tenantId }),
      ...(this.config.authToken && { 'Authorization': `Bearer ${this.config.authToken}` }),
    };
  }

  getConfig(): ApiConfig {
    return { ...this.config };
  }
}

// Singleton instance
export const marketingApi = new MarketingApiService();

export default marketingApi;