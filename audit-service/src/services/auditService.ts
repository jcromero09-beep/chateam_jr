import OpenAI from 'openai';
import axios from 'axios';
import moment from 'moment';
import {
  AuditRequest,
  AuditResult,
  CampaignData,
  GPTAnalysisRequest,
  GPTAnalysisResponse,
  AuditInsight,
  Recommendation,
  RiskFactor,
  Opportunity
} from '../types';
import { PromptService } from './promptService';
import logger from '../utils/logger';

export class AuditService {
  private openai: OpenAI;
  private promptService: PromptService;
  private metaApiUrl: string;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });
    this.promptService = new PromptService();
    this.metaApiUrl = process.env.META_API_URL || 'http://localhost:3000/api';
  }

  async performAudit(request: AuditRequest): Promise<AuditResult> {
    const startTime = Date.now();
    logger.info('🚀 Iniciando auditoría IA', {
      accountId: request.accountId,
      analysisType: request.analysisType
    });

    try {
      // 1. Obtener datos de campañas
      const campaignData = await this.fetchCampaignData(request);
      logger.info('📊 Datos de campañas obtenidos', {
        campaignsCount: campaignData.length
      });

      // 2. Realizar análisis según el tipo
      let insights: AuditInsight[] = [];
      let recommendations: Recommendation[] = [];

      switch (request.analysisType) {
        case 'performance':
          const perfAnalysis = await this.performanceAnalysis(campaignData, request.timeRange);
          insights = perfAnalysis.insights;
          recommendations = perfAnalysis.recommendations;
          break;

        case 'optimization':
          const optAnalysis = await this.optimizationAnalysis(campaignData);
          insights = optAnalysis.insights;
          recommendations = optAnalysis.recommendations;
          break;

        case 'attribution':
          const attrAnalysis = await this.attributionAnalysis(campaignData, request);
          insights = attrAnalysis.insights;
          recommendations = attrAnalysis.recommendations;
          break;

        case 'comprehensive':
          const compAnalysis = await this.comprehensiveAnalysis(campaignData, request);
          insights = compAnalysis.insights;
          recommendations = compAnalysis.recommendations;
          break;
      }

      // 3. Calcular métricas de resumen
      const summary = this.calculateSummary(campaignData);

      // 4. Identificar riesgos y oportunidades
      const riskFactors = this.identifyRiskFactors(campaignData, insights);
      const opportunities = this.identifyOpportunities(campaignData, insights);

      // 5. Calcular score de performance
      const performanceScore = this.calculatePerformanceScore(campaignData, insights);

      const result: AuditResult = {
        id: this.generateAuditId(),
        accountId: request.accountId,
        timestamp: new Date().toISOString(),
        analysisType: request.analysisType,
        summary,
        insights,
        recommendations,
        performanceScore,
        riskFactors,
        opportunities
      };

      const processingTime = Date.now() - startTime;
      logger.info('✅ Auditoría completada', {
        auditId: result.id,
        processingTime: `${processingTime}ms`,
        insightsCount: insights.length,
        recommendationsCount: recommendations.length,
        performanceScore
      });

      return result;

    } catch (error) {
      logger.error('❌ Error en auditoría:', error);
      throw new Error(`Error performing audit: ${error.message}`);
    }
  }

  private async fetchCampaignData(request: AuditRequest): Promise<CampaignData[]> {
    try {
      // Si se especifican campañas específicas
      if (request.campaignIds && request.campaignIds.length > 0) {
        const campaigns = await Promise.all(
          request.campaignIds.map(id => this.fetchSingleCampaign(id, request.timeRange))
        );
        return campaigns.filter(c => c !== null);
      }

      // Obtener todas las campañas de la cuenta
      const response = await axios.get(`${this.metaApiUrl}/campaigns`, {
        params: {
          accountId: request.accountId,
          timeRange: request.timeRange,
          includeInsights: true,
          includeAdSets: true,
          includeAds: true
        }
      });

      return response.data.campaigns || [];

    } catch (error) {
      logger.error('Error fetching campaign data:', error);
      throw new Error('Failed to fetch campaign data');
    }
  }

  private async fetchSingleCampaign(campaignId: string, timeRange: any): Promise<CampaignData | null> {
    try {
      const response = await axios.get(`${this.metaApiUrl}/campaigns/${campaignId}`, {
        params: {
          timeRange,
          includeInsights: true,
          includeAdSets: true,
          includeAds: true
        }
      });

      return response.data;
    } catch (error) {
      logger.warn(`Error fetching campaign ${campaignId}:`, error.message);
      return null;
    }
  }

  private async performanceAnalysis(
    campaigns: CampaignData[],
    timeRange: any
  ): Promise<GPTAnalysisResponse> {
    const request = this.promptService.generatePerformancePrompt(campaigns, timeRange);
    return this.callGPTAnalysis(request);
  }

  private async optimizationAnalysis(campaigns: CampaignData[]): Promise<GPTAnalysisResponse> {
    // Análisis combinado de creativos y targeting
    const [creativeAnalysis, targetingAnalysis] = await Promise.all([
      this.callGPTAnalysis(this.promptService.generateCreativePrompt(campaigns)),
      this.callGPTAnalysis(this.promptService.generateTargetingPrompt(campaigns))
    ]);

    return {
      analysis: `${creativeAnalysis.analysis}\n\n${targetingAnalysis.analysis}`,
      confidence: (creativeAnalysis.confidence + targetingAnalysis.confidence) / 2,
      insights: [...creativeAnalysis.insights, ...targetingAnalysis.insights],
      recommendations: [...creativeAnalysis.recommendations, ...targetingAnalysis.recommendations],
      metadata: {
        model: creativeAnalysis.metadata.model,
        tokensUsed: creativeAnalysis.metadata.tokensUsed + targetingAnalysis.metadata.tokensUsed,
        processingTime: creativeAnalysis.metadata.processingTime + targetingAnalysis.metadata.processingTime
      }
    };
  }

  private async attributionAnalysis(
    campaigns: CampaignData[],
    request: AuditRequest
  ): Promise<GPTAnalysisResponse> {
    // Obtener datos de atribución del CRM
    const attributionData = await this.fetchAttributionData(request.accountId, request.timeRange);
    const gptRequest = this.promptService.generateAttributionPrompt(campaigns, attributionData);
    return this.callGPTAnalysis(gptRequest);
  }

  private async comprehensiveAnalysis(
    campaigns: CampaignData[],
    request: AuditRequest
  ): Promise<GPTAnalysisResponse> {
    // Ejecutar todos los análisis en paralelo
    const [performance, optimization, attribution] = await Promise.all([
      this.performanceAnalysis(campaigns, request.timeRange),
      this.optimizationAnalysis(campaigns),
      this.attributionAnalysis(campaigns, request)
    ]);

    // Generar resumen ejecutivo
    const allInsights = [...performance.insights, ...optimization.insights, ...attribution.insights];
    const allRecommendations = [...performance.recommendations, ...optimization.recommendations, ...attribution.recommendations];

    const summary = this.calculateSummary(campaigns);
    const executiveRequest = this.promptService.generateExecutiveSummary(allInsights, allRecommendations, summary);
    const executive = await this.callGPTAnalysis(executiveRequest);

    return {
      analysis: executive.analysis,
      confidence: (performance.confidence + optimization.confidence + attribution.confidence) / 3,
      insights: allInsights,
      recommendations: this.prioritizeRecommendations(allRecommendations),
      metadata: {
        model: 'gpt-4-turbo',
        tokensUsed: performance.metadata.tokensUsed + optimization.metadata.tokensUsed + attribution.metadata.tokensUsed,
        processingTime: performance.metadata.processingTime + optimization.metadata.processingTime + attribution.metadata.processingTime
      }
    };
  }

  private async callGPTAnalysis(request: GPTAnalysisRequest): Promise<GPTAnalysisResponse> {
    const startTime = Date.now();

    try {
      const completion = await this.openai.chat.completions.create({
        model: request.model || 'gpt-4-turbo',
        messages: [
          {
            role: 'user',
            content: request.prompt
          }
        ],
        temperature: request.temperature || 0.3,
        max_tokens: request.maxTokens || 4000,
        response_format: { type: 'json_object' }
      });

      const response = completion.choices[0].message.content;
      const parsedResponse = JSON.parse(response || '{}');

      const processingTime = Date.now() - startTime;

      return {
        analysis: parsedResponse.summary || '',
        confidence: 0.85, // Default confidence
        insights: this.parseInsights(parsedResponse.insights || []),
        recommendations: this.parseRecommendations(parsedResponse.recommendations || []),
        metadata: {
          model: request.model || 'gpt-4-turbo',
          tokensUsed: completion.usage?.total_tokens || 0,
          processingTime
        }
      };

    } catch (error) {
      logger.error('Error calling GPT API:', error);
      throw new Error(`GPT analysis failed: ${error.message}`);
    }
  }

  private async fetchAttributionData(accountId: string, timeRange: any): Promise<any[]> {
    try {
      const response = await axios.get(`${this.metaApiUrl}/attribution`, {
        params: { accountId, timeRange }
      });
      return response.data.attribution || [];
    } catch (error) {
      logger.warn('No attribution data available, using campaign data only');
      return [];
    }
  }

  private calculateSummary(campaigns: CampaignData[]): any {
    const totals = campaigns.reduce((acc, campaign) => {
      const insights = campaign.insights;
      return {
        totalCampaigns: acc.totalCampaigns + 1,
        totalSpend: acc.totalSpend + insights.spend,
        totalImpressions: acc.totalImpressions + insights.impressions,
        totalClicks: acc.totalClicks + insights.clicks,
        totalReach: acc.totalReach + insights.reach
      };
    }, {
      totalCampaigns: 0,
      totalSpend: 0,
      totalImpressions: 0,
      totalClicks: 0,
      totalReach: 0
    });

    return {
      ...totals,
      averageCTR: totals.totalImpressions > 0 ? (totals.totalClicks / totals.totalImpressions) * 100 : 0,
      averageCPC: totals.totalClicks > 0 ? totals.totalSpend / totals.totalClicks : 0,
      averageCPM: totals.totalImpressions > 0 ? (totals.totalSpend / totals.totalImpressions) * 1000 : 0
    };
  }

  private identifyRiskFactors(campaigns: CampaignData[], insights: AuditInsight[]): RiskFactor[] {
    const risks: RiskFactor[] = [];

    // Identificar campañas con rendimiento bajo
    const poorPerformingCampaigns = campaigns.filter(c => c.insights.ctr < 1.0 || c.insights.cpc > 2.0);
    if (poorPerformingCampaigns.length > 0) {
      risks.push({
        type: 'poor_performance',
        severity: poorPerformingCampaigns.length > campaigns.length / 2 ? 'high' : 'medium',
        description: `${poorPerformingCampaigns.length} campañas con rendimiento sub-óptimo detectadas`,
        affectedCampaigns: poorPerformingCampaigns.map(c => c.campaign.id),
        potentialImpact: 'Desperdicio de presupuesto y menor ROI',
        mitigation: ['Revisar targeting', 'Optimizar creativos', 'Ajustar pujas']
      });
    }

    // Identificar sobre-gasto
    const overspendingCampaigns = campaigns.filter(c => c.campaign.spend > c.campaign.budget * 0.9);
    if (overspendingCampaigns.length > 0) {
      risks.push({
        type: 'budget_overspend',
        severity: 'high',
        description: `${overspendingCampaigns.length} campañas cerca del límite de presupuesto`,
        affectedCampaigns: overspendingCampaigns.map(c => c.campaign.id),
        potentialImpact: 'Agotamiento prematuro del presupuesto',
        mitigation: ['Ajustar presupuestos diarios', 'Pausar campañas poco eficientes']
      });
    }

    return risks;
  }

  private identifyOpportunities(campaigns: CampaignData[], insights: AuditInsight[]): Opportunity[] {
    const opportunities: Opportunity[] = [];

    // Identificar campañas ganadoras para escalar
    const winningCampaigns = campaigns.filter(c =>
      c.insights.ctr > 2.0 &&
      c.insights.cpc < 1.0 &&
      c.campaign.spend < c.campaign.budget * 0.7
    );

    if (winningCampaigns.length > 0) {
      opportunities.push({
        type: 'scale_winning_campaigns',
        potential: 'high',
        description: `${winningCampaigns.length} campañas con alto rendimiento listas para escalar`,
        estimatedImpact: {
          metric: 'ROI',
          value: '+25-40%'
        },
        requiredActions: [
          'Incrementar presupuesto diario',
          'Expandir audiencias similares',
          'Duplicar campañas exitosas'
        ],
        campaigns: winningCampaigns.map(c => c.campaign.id)
      });
    }

    return opportunities;
  }

  private calculatePerformanceScore(campaigns: CampaignData[], insights: AuditInsight[]): number {
    const weights = {
      ctr: 0.25,
      cpc: 0.25,
      roas: 0.30,
      reach: 0.20
    };

    const scores = campaigns.map(campaign => {
      const c = campaign.insights;
      return (
        Math.min(c.ctr / 2.0, 1) * weights.ctr +
        Math.max(1 - c.cpc / 2.0, 0) * weights.cpc +
        Math.min((c.roas || 1) / 3.0, 1) * weights.roas +
        Math.min(c.reach / 10000, 1) * weights.reach
      ) * 100;
    });

    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  private parseInsights(rawInsights: any[]): AuditInsight[] {
    return rawInsights.map(insight => ({
      category: insight.category || 'performance',
      type: insight.type || 'neutral',
      title: insight.title || '',
      description: insight.description || '',
      impact: insight.impact || 'medium',
      confidence: insight.confidence || 0.8,
      data: insight.data || {},
      recommendations: insight.recommendations || []
    }));
  }

  private parseRecommendations(rawRecommendations: any[]): Recommendation[] {
    return rawRecommendations.map((rec, index) => ({
      id: `rec_${Date.now()}_${index}`,
      priority: rec.priority || 'medium',
      category: rec.category || 'optimization',
      title: rec.title || '',
      description: rec.description || '',
      rationale: rec.rationale || '',
      expectedImpact: rec.expectedImpact || {
        metric: 'ROI',
        improvement: 'TBD',
        confidence: 0.7
      },
      implementation: rec.implementation || {
        difficulty: 'medium',
        timeRequired: '1-2 weeks',
        steps: []
      },
      relatedCampaigns: rec.relatedCampaigns || []
    }));
  }

  private prioritizeRecommendations(recommendations: Recommendation[]): Recommendation[] {
    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  private generateAuditId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}