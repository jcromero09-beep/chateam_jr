import OpenAI from "openai";
import { TenantManager } from "../helpers/TenantManager";
import AppError from "../errors/AppError";

export interface AuditRequest {
  campaignId: string;
  companyId: number;
  timeWindow: {
    since: string;
    until: string;
    compareSince?: string;
    compareUntil?: string;
  };
  level: 'campaign' | 'adset' | 'ad';
  kpiTargets: {
    cplTarget: number;
    cpaTarget: number;
    cpConvoTarget: number;
    roasTarget: number;
  };
}

export interface AuditResult {
  overallScore: number;
  scores: {
    rendimientoBasico: number;
    engagement: number;
    conversiones: number;
    video: number;
    costosEficiencia: number;
    segmentacion: number;
    ventasSeguimientoCrm: number;
  };
  highlights: string[];
  budgetPlan: {
    currency: string;
    recommendations: Array<{
      entityLevel: string;
      id: string;
      action: string;
      changePct: number;
      newDailyBudget: number;
      rationale: string;
      expectedImpact: string;
    }>;
  };
  optimizations: {
    quickWins: Array<{
      title: string;
      why: string;
      howTo: string;
      kpiImpact: string;
      priority: string;
    }>;
    experimentsAb: Array<{
      name: string;
      hypothesis: string;
      variantChanges: string[];
      sampleSizeRule: string;
      durationDays: number;
      successMetric: string;
      promotionRule: string;
    }>;
    targetingTweaks: Array<{
      dimension: string;
      recommendation: string;
      reason: string;
    }>;
    creativeTweaks: Array<{
      format: string;
      recommendation: string;
      reason: string;
      assetsNeeded: string[];
    }>;
    measurement: Array<{
      gap: string;
      fix: string;
    }>;
  };
  attributionReport: {
    mappingSummary: {
      totalLeads: number;
      mappedByIdsPct: number;
      mappedByUtmPct: number;
      unmatchedPct: number;
    };
    unmatchedSamples: Array<{
      leadId: string;
      reason: string;
      fix: string;
    }>;
    routingRules: string[];
  };
  salesProcessFeedback: {
    slaResponseMinutesP50: number;
    followupCadence: string;
    scriptsObservations: string[];
    coachingTips: Array<{
      theme: string;
      tip: string;
    }>;
    scoreVentas: number;
  };
  alerts: Array<{
    type: string;
    message: string;
    severity: string;
  }>;
  nextStepsChecklist: string[];
}

export class AuditService {
  private openai: OpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new AppError("OPENAI_API_KEY is required", 500);
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  /**
   * Genera auditoría completa de una campaña
   */
  async generateAudit(request: AuditRequest): Promise<AuditResult> {
    try {
      // Obtener datos de Meta
      const metaData = await this.getMetaInsightsData(request);

      // Obtener datos de CRM
      const crmData = await this.getCRMData(request);

      // Preparar payload para GPT-5
      const payload = {
        account: {
          currency: "USD",
          timezone: "America/Guayaquil",
          business_goals: ["ventas", "leads"],
          kpi_targets: request.kpiTargets
        },
        time_window: request.timeWindow,
        meta_insights: metaData,
        crm_chateam: crmData,
        constraints: {
          min_daily_budget: 5,
          max_changes_per_campaign: 3,
          ab_horizon_days: 14
        }
      };

      // Llamar a GPT-5
      const analysis = await this.callGPT5ForAudit(payload);

      // Generar CSVs para descarga
      const csvUrls = await this.generateCsvExports(request, metaData);

      // Combinar resultados
      const result: AuditResult = {
        ...analysis,
        csv: csvUrls
      };

      return result;
    } catch (error) {
      console.error("Error generating audit:", error);
      throw new AppError("Failed to generate audit", 500);
    }
  }

  /**
   * Obtiene datos de insights de Meta
   */
  private async getMetaInsightsData(request: AuditRequest): Promise<any> {
    // Aquí se integraría con el SDK de Meta Marketing
    // Por ahora retorna datos de ejemplo
    return {
      aggregate: [
        {
          campaign_id: request.campaignId,
          impressions: 10000,
          reach: 8000,
          clicks: 240,
          spend: 150.50,
          ctr: 2.4,
          cpc: 0.63,
          conversions: 12,
          purchase_value: 450.00
        }
      ],
      breakdowns: {
        country: [
          { country: "EC", impressions: 8000, clicks: 192, spend: 120.00 },
          { country: "CO", impressions: 2000, clicks: 48, spend: 30.50 }
        ]
      },
      action_breakdowns: {
        action_type: [
          { action_type: "link_click", actions: 180 },
          { action_type: "post_engagement", actions: 60 }
        ]
      }
    };
  }

  /**
   * Obtiene datos de CRM (leads y chats)
   */
  private async getCRMData(request: AuditRequest): Promise<any> {
    // Aquí se obtendrían datos reales de la base de datos
    return {
      leads: [
        {
          lead_id: "L-1001",
          created_at: "2025-09-02T14:21:00Z",
          source: {
            campaign_id: request.campaignId,
            utm_campaign: "CAMP_EC_SEP"
          },
          funnel: {
            stage: "qualified",
            status: "won"
          }
        }
      ],
      chat_samples: [
        {
          lead_id: "L-1001",
          messages: [
            { from: "lead", at: "2025-09-02T14:21:30Z", text: "Hola" },
            { from: "agent", at: "2025-09-02T14:22:00Z", text: "¡Bienvenido!" }
          ]
        }
      ]
    };
  }

  /**
   * Llama a GPT-5 para análisis
   */
  private async callGPT5ForAudit(payload: any): Promise<any> {
    const prompt = `
Eres un experto en Meta Ads con 10+ años de experiencia y analista de CRM especializado en atribución.
Analiza estos datos y proporciona un análisis completo en formato JSON.

Datos de entrada:
${JSON.stringify(payload, null, 2)}

Responde ÚNICAMENTE con un JSON válido con esta estructura:
{
  "overall_score_0_100": 78,
  "scores": {
    "rendimiento_basico": 85,
    "engagement": 72,
    "conversiones": 65,
    "video": 0,
    "costos_eficiencia": 80,
    "segmentacion": 75,
    "ventas_seguimiento_crm": 70
  },
  "highlights": [
    "CTR de 2.4% supera el promedio de la industria",
    "CPL de $12.54 está por encima del objetivo de $3.50"
  ],
  "budget_plan": {
    "currency": "USD",
    "recommendations": [
      {
        "entity_level": "campaign",
        "id": "1234567890",
        "action": "increase",
        "change_pct": 15,
        "new_daily_budget": 1800,
        "rationale": "CTR 2.4% > objetivo 2.0%",
        "expected_impact": "Aumento de 10-15% en leads"
      }
    ]
  },
  "optimizations": {
    "quick_wins": [
      {
        "title": "Mejorar targeting de edad",
        "why": "El grupo 18-24 tiene CTR bajo",
        "how_to": "Excluir 18-24 y enfocarse en 25-45",
        "kpi_impact": "CTR +0.5%, CPC -10%",
        "priority": "alta"
      }
    ],
    "experiments_ab": [
      {
        "name": "Headline vs CTA",
        "hypothesis": "CTA más específico genera más clics",
        "variant_changes": ["copy", "hook"],
        "sample_size_rule": "≥3k impresiones/adset",
        "duration_days": 14,
        "success_metric": "CTR, CPC",
        "promotion_rule": "Promover si CTR ≥12% mejor"
      }
    ],
    "targeting_tweaks": [
      {
        "dimension": "placement",
        "recommendation": "Excluir Audience Network",
        "reason": "CTR 0.8% vs 2.4% en Feed"
      }
    ],
    "creative_tweaks": [
      {
        "format": "video",
        "recommendation": "Hook en primeros 3 segundos",
        "reason": "p25 de video es bajo",
        "assets_needed": ["hook de 5s", "subtítulos"]
      }
    ],
    "measurement": [
      {
        "gap": "Sin eventos de conversión en Pixel",
        "fix": "Configurar eventos Lead y Purchase"
      }
    ]
  },
  "attribution_report": {
    "mapping_summary": {
      "total_leads": 45,
      "mapped_by_ids_pct": 63,
      "mapped_by_utm_pct": 24,
      "unmatched_pct": 13
    },
    "unmatched_samples": [
      {
        "lead_id": "L-1005",
        "reason": "Sin utm_campaign ni ad_id",
        "fix": "Agregar UTMs en links de anuncios"
      }
    ],
    "routing_rules": [
      "Si viene ad_id -> mapea directo a anuncio",
      "Si solo hay UTM -> mapea a campaña por nombre"
    ]
  },
  "sales_process_feedback": {
    "sla_response_minutes_p50": 12,
    "followup_cadence": "buena",
    "scripts_observations": [
      "Falta pregunta de calificación (presupuesto/urgencia)",
      "Buen manejo de objeciones de precio"
    ],
    "coaching_tips": [
      {
        "theme": "Calificación",
        "tip": "Preguntar presupuesto en primeros 2 mensajes"
      }
    ],
    "score_ventas_0_100": 75
  },
  "alerts": [
    {
      "type": "performance",
      "message": "CPC 25% por encima del objetivo",
      "severity": "medium"
    }
  ],
  "next_steps_checklist": [
    "[Hoy] Aumentar presupuesto de campaña X en 15%",
    "[72h] Revisar y pausar adsets con CPC >$1.00",
    "[7d] Evaluar resultados de test A/B"
  ]
}
`;

    const completion = await this.openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: JSON.stringify(payload) }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 4000
    });

    return JSON.parse(completion.choices[0].message.content);
  }

  /**
   * Genera URLs de exportación CSV
   */
  private async generateCsvExports(request: AuditRequest, metaData: any): Promise<any> {
    // Aquí se generarían CSVs y se subirían a S3
    // Por ahora retorna URLs de ejemplo
    return {
      aggregate: `https://s3.chateam.com/audits/${request.campaignId}/aggregate.csv`,
      byBreakdown: {
        country: `https://s3.chateam.com/audits/${request.campaignId}/country.csv`,
        placement: `https://s3.chateam.com/audits/${request.campaignId}/placement.csv`
      },
      byActionBreakdown: {
        action_type: `https://s3.chateam.com/audits/${request.campaignId}/action_type.csv`
      }
    };
  }

  /**
   * Guarda el resultado de la auditoría
   */
  async saveAuditResult(
    request: AuditRequest,
    result: AuditResult
  ): Promise<void> {
    // Aquí se guardaría el resultado en la base de datos
    console.log("Saving audit result for campaign:", request.campaignId);
  }

  /**
   * Obtiene historial de auditorías
   */
  async getAuditHistory(
    campaignId: string,
    companyId: number,
    limit: number = 10
  ): Promise<any[]> {
    // Aquí se obtendría el historial de auditorías
    return [];
  }

  /**
   * Obtiene métricas de auditorías
   */
  async getAuditMetrics(companyId: number): Promise<any> {
    // Aquí se obtendrían métricas de todas las auditorías
    return {
      totalAudits: 0,
      averageScore: 0,
      improvementTrend: 0,
      topRecommendations: []
    };
  }
}