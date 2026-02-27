import { PromptTemplate, GPTAnalysisRequest, GPTAnalysisResponse, CampaignData, AuditInsight, Recommendation } from '../types';

export class PromptService {
  private templates: Map<string, PromptTemplate> = new Map();

  constructor() {
    this.initializeTemplates();
  }

  private initializeTemplates(): void {
    // Template para análisis de rendimiento
    this.templates.set('performance_analysis', {
      name: 'Análisis de Rendimiento',
      system: `Eres un experto en marketing digital especializado en Meta Ads (Facebook/Instagram).
      Tu tarea es analizar datos de campañas y proporcionar insights accionables y recomendaciones específicas.

      INSTRUCCIONES:
      1. Analiza los datos de manera objetiva y basada en métricas
      2. Identifica patrones, tendencias y anomalías
      3. Proporciona recomendaciones específicas y accionables
      4. Asigna niveles de prioridad y confianza a tus insights
      5. Usa un lenguaje profesional pero accesible
      6. Enfócate en ROI y optimización de presupuesto`,

      user: `Analiza los siguientes datos de campañas de Meta Ads:

      DATOS DE CAMPAÑAS:
      {campaignData}

      PERÍODO: {timeRange}

      Por favor proporciona:
      1. RESUMEN EJECUTIVO (2-3 puntos clave)
      2. ANÁLISIS DE RENDIMIENTO (métricas principales)
      3. INSIGHTS PRINCIPALES (3-5 insights con nivel de confianza)
      4. RECOMENDACIONES PRIORITARIAS (3-5 acciones específicas)
      5. OPORTUNIDADES DE OPTIMIZACIÓN
      6. RIESGOS IDENTIFICADOS

      Formato de respuesta en JSON con esta estructura:
      {
        "summary": "string",
        "insights": [
          {
            "category": "performance|targeting|creative|budget",
            "type": "positive|negative|warning|neutral",
            "title": "string",
            "description": "string",
            "impact": "high|medium|low",
            "confidence": 0.1-1.0
          }
        ],
        "recommendations": [
          {
            "priority": "high|medium|low",
            "category": "budget|targeting|creative|optimization",
            "title": "string",
            "description": "string",
            "rationale": "string",
            "expectedImpact": {
              "metric": "string",
              "improvement": "string",
              "confidence": 0.1-1.0
            }
          }
        ]
      }`,
      variables: ['campaignData', 'timeRange']
    });

    // Template para análisis de atribución
    this.templates.set('attribution_analysis', {
      name: 'Análisis de Atribución',
      system: `Eres un especialista en atribución y analytics de marketing digital.
      Tu expertise está en identificar brechas en el tracking, problemas de atribución y oportunidades para mejorar la medición.`,

      user: `Analiza los datos de atribución y campañas:

      DATOS DE CAMPAÑAS: {campaignData}
      DATOS DE ATRIBUCIÓN: {attributionData}

      Identifica:
      1. Brechas en la atribución
      2. Campañas sub-atribuidas o sobre-atribuidas
      3. Problemas de tracking
      4. Oportunidades de mejora en medición
      5. Recomendaciones para optimizar atribución`,
      variables: ['campaignData', 'attributionData']
    });

    // Template para análisis de creativos
    this.templates.set('creative_analysis', {
      name: 'Análisis de Creativos',
      system: `Eres un experto en análisis de creativos publicitarios y copy.
      Tu especialidad es identificar qué elementos creativos funcionan mejor y por qué.`,

      user: `Analiza el rendimiento de estos creativos:

      DATOS DE ADS: {adData}

      Evalúa:
      1. Rendimiento por tipo de creativo
      2. Elementos que más impactan en CTR y conversiones
      3. Fatiga de creativos
      4. Oportunidades de optimización
      5. Recomendaciones para nuevos creativos`,
      variables: ['adData']
    });

    // Template para análisis de targeting
    this.templates.set('targeting_analysis', {
      name: 'Análisis de Targeting',
      system: `Eres un especialista en audience targeting y segmentación de Meta Ads.
      Tu expertise está en optimizar audiencias para maximizar eficiencia y alcance.`,

      user: `Analiza el targeting de estas campañas:

      DATOS DE ADSETS: {adsetData}

      Evalúa:
      1. Eficiencia de audiencias actuales
      2. Superposición entre audiencias
      3. Oportunidades de expansión o refinamiento
      4. Recomendaciones de nuevas audiencias
      5. Optimización de bid strategies`,
      variables: ['adsetData']
    });

    // Template para reporte ejecutivo
    this.templates.set('executive_summary', {
      name: 'Resumen Ejecutivo',
      system: `Eres un consultor senior especializado en presentar insights complejos de marketing digital de manera clara y ejecutiva.
      Tu audiencia son tomadores de decisiones que necesitan información accionable y estratégica.`,

      user: `Basándote en este análisis completo:

      INSIGHTS: {insights}
      RECOMENDACIONES: {recommendations}
      MÉTRICAS: {metrics}

      Crea un resumen ejecutivo que incluya:
      1. Situación actual (2-3 puntos clave)
      2. Principales oportunidades identificadas
      3. Recomendaciones prioritarias con impacto esperado
      4. Próximos pasos sugeridos
      5. ROI estimado de las optimizaciones`,
      variables: ['insights', 'recommendations', 'metrics']
    });
  }

  getTemplate(name: string): PromptTemplate | undefined {
    return this.templates.get(name);
  }

  buildPrompt(templateName: string, variables: Record<string, any>): string {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Template '${templateName}' no encontrado`);
    }

    let prompt = template.user;

    // Reemplazar variables en el prompt
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{${key}}`;
      let replacement: string;

      if (typeof value === 'object') {
        replacement = JSON.stringify(value, null, 2);
      } else {
        replacement = String(value);
      }

      prompt = prompt.replace(new RegExp(placeholder, 'g'), replacement);
    }

    return prompt;
  }

  generatePerformancePrompt(campaigns: CampaignData[], timeRange: any): GPTAnalysisRequest {
    const campaignSummary = campaigns.map(c => ({
      name: c.campaign.name,
      objective: c.campaign.objective,
      spend: c.campaign.spend,
      insights: c.insights
    }));

    const prompt = this.buildPrompt('performance_analysis', {
      campaignData: campaignSummary,
      timeRange: `${timeRange.since} to ${timeRange.until}`
    });

    const template = this.getTemplate('performance_analysis')!;

    return {
      prompt: `${template.system}\n\n${prompt}`,
      data: { campaigns, timeRange },
      model: 'gpt-4-turbo',
      temperature: 0.3,
      maxTokens: 4000
    };
  }

  generateAttributionPrompt(campaigns: CampaignData[], attributionData: any[]): GPTAnalysisRequest {
    const prompt = this.buildPrompt('attribution_analysis', {
      campaignData: campaigns,
      attributionData
    });

    const template = this.getTemplate('attribution_analysis')!;

    return {
      prompt: `${template.system}\n\n${prompt}`,
      data: { campaigns, attributionData },
      model: 'gpt-4-turbo',
      temperature: 0.2,
      maxTokens: 3000
    };
  }

  generateCreativePrompt(campaigns: CampaignData[]): GPTAnalysisRequest {
    const adData = campaigns.flatMap(c => c.ads || []);

    const prompt = this.buildPrompt('creative_analysis', {
      adData
    });

    const template = this.getTemplate('creative_analysis')!;

    return {
      prompt: `${template.system}\n\n${prompt}`,
      data: { adData },
      model: 'gpt-4-turbo',
      temperature: 0.4,
      maxTokens: 3500
    };
  }

  generateTargetingPrompt(campaigns: CampaignData[]): GPTAnalysisRequest {
    const adsetData = campaigns.flatMap(c => c.adsets || []);

    const prompt = this.buildPrompt('targeting_analysis', {
      adsetData
    });

    const template = this.getTemplate('targeting_analysis')!;

    return {
      prompt: `${template.system}\n\n${prompt}`,
      data: { adsetData },
      model: 'gpt-4-turbo',
      temperature: 0.3,
      maxTokens: 3500
    };
  }

  generateExecutiveSummary(
    insights: AuditInsight[],
    recommendations: Recommendation[],
    metrics: any
  ): GPTAnalysisRequest {
    const prompt = this.buildPrompt('executive_summary', {
      insights,
      recommendations,
      metrics
    });

    const template = this.getTemplate('executive_summary')!;

    return {
      prompt: `${template.system}\n\n${prompt}`,
      data: { insights, recommendations, metrics },
      model: 'gpt-4-turbo',
      temperature: 0.2,
      maxTokens: 2000
    };
  }

  addCustomTemplate(name: string, template: PromptTemplate): void {
    this.templates.set(name, template);
  }

  listTemplates(): string[] {
    return Array.from(this.templates.keys());
  }

  validateTemplate(template: PromptTemplate): boolean {
    const requiredFields = ['name', 'system', 'user', 'variables'];
    return requiredFields.every(field => field in template);
  }

  optimizePromptForModel(prompt: string, model: string): string {
    // Optimizaciones específicas por modelo
    switch (model) {
      case 'gpt-4-turbo':
        return `${prompt}\n\nPor favor, sé conciso pero completo en tu análisis. Prioriza insights accionables.`;

      case 'gpt-4':
        return `${prompt}\n\nProporciona un análisis detallado con justificaciones claras.`;

      case 'gpt-3.5-turbo':
        return `${prompt}\n\nEnfócate en los puntos más importantes y sé directo en las recomendaciones.`;

      default:
        return prompt;
    }
  }
}