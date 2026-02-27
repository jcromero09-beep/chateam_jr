export interface AuditRequest {
  accountId: string;
  campaignIds?: string[];
  timeRange: {
    since: string;
    until: string;
  };
  analysisType: 'performance' | 'optimization' | 'attribution' | 'comprehensive';
  includeRecommendations?: boolean;
  language?: 'es' | 'en';
}

export interface CampaignData {
  campaign: {
    id: string;
    name: string;
    objective: string;
    status: string;
    budget: number;
    spend: number;
    start_time: string;
    stop_time?: string;
  };
  insights: {
    impressions: number;
    clicks: number;
    spend: number;
    reach: number;
    frequency: number;
    ctr: number;
    cpc: number;
    cpm: number;
    conversions?: number;
    roas?: number;
  };
  adsets?: AdSetData[];
  ads?: AdData[];
}

export interface AdSetData {
  id: string;
  name: string;
  status: string;
  targeting: any;
  optimization_goal: string;
  insights: {
    impressions: number;
    clicks: number;
    spend: number;
    ctr: number;
    cpc: number;
    cpm: number;
  };
}

export interface AdData {
  id: string;
  name: string;
  status: string;
  creative: {
    title?: string;
    body?: string;
    image_url?: string;
  };
  insights: {
    impressions: number;
    clicks: number;
    spend: number;
    ctr: number;
    cpc: number;
    cpm: number;
  };
}

export interface AuditResult {
  id: string;
  accountId: string;
  timestamp: string;
  analysisType: string;
  summary: {
    totalCampaigns: number;
    totalSpend: number;
    totalImpressions: number;
    totalClicks: number;
    averageCTR: number;
    averageCPC: number;
    averageCPM: number;
  };
  insights: AuditInsight[];
  recommendations: Recommendation[];
  performanceScore: number;
  riskFactors: RiskFactor[];
  opportunities: Opportunity[];
  report?: {
    url: string;
    format: 'pdf' | 'html';
  };
}

export interface AuditInsight {
  category: 'performance' | 'targeting' | 'creative' | 'budget' | 'attribution';
  type: 'positive' | 'negative' | 'neutral' | 'warning';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  confidence: number;
  data: any;
  recommendations?: string[];
}

export interface Recommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: 'budget' | 'targeting' | 'creative' | 'optimization' | 'attribution';
  title: string;
  description: string;
  rationale: string;
  expectedImpact: {
    metric: string;
    improvement: string;
    confidence: number;
  };
  implementation: {
    difficulty: 'easy' | 'medium' | 'hard';
    timeRequired: string;
    steps: string[];
  };
  relatedCampaigns: string[];
}

export interface RiskFactor {
  type: 'budget_overspend' | 'poor_performance' | 'targeting_issues' | 'creative_fatigue' | 'attribution_gaps';
  severity: 'high' | 'medium' | 'low';
  description: string;
  affectedCampaigns: string[];
  potentialImpact: string;
  mitigation: string[];
}

export interface Opportunity {
  type: 'scale_winning_campaigns' | 'improve_targeting' | 'optimize_creatives' | 'budget_reallocation';
  potential: 'high' | 'medium' | 'low';
  description: string;
  estimatedImpact: {
    metric: string;
    value: string;
  };
  requiredActions: string[];
  campaigns: string[];
}

export interface PromptTemplate {
  name: string;
  system: string;
  user: string;
  variables: string[];
}

export interface AttributionData {
  leadId: string;
  source: string;
  medium: string;
  campaign: string;
  adGroup: string;
  ad: string;
  timestamp: string;
  conversionValue?: number;
  customerId?: string;
}

export interface GPTAnalysisRequest {
  prompt: string;
  data: any;
  model?: 'gpt-4' | 'gpt-4-turbo' | 'gpt-3.5-turbo';
  temperature?: number;
  maxTokens?: number;
}

export interface GPTAnalysisResponse {
  analysis: string;
  confidence: number;
  insights: AuditInsight[];
  recommendations: Recommendation[];
  metadata: {
    model: string;
    tokensUsed: number;
    processingTime: number;
  };
}