import OpenAI from "openai";
import { Op } from "sequelize";
import CampaignRecommendation from "../models/CampaignRecommendation";
import AiTokenTransaction from "../models/AiTokenTransaction";
import AISubplan from "../models/AISubplan";
import AppError from "../errors/AppError";
import { MarketingCache } from "./MetaMarketingService/MarketingCache";
import AIProviderConfig from "../models/AIProviderConfig";
import CampaignMessage from "../models/CampaignMessage";
import FacebookConversionEvent from "../models/FacebookConversionEvent";
import CampaignAuditConversationService, {
  CampaignConversationContext
} from "./CampaignAuditConversationService";
import crypto from "crypto";
import logger from "../utils/logger";

// Fallback si la empresa no tiene un AISubplan activo
const DEFAULT_TOKEN_LIMIT = 10000;

interface TokenStatus {
  available: boolean;
  used: number;
  limit: number;
  remaining: number;
}

interface GenerateRecommendationsResult {
  success: boolean;
  generated: number;
  tokensUsed: number;
  recommendations: CampaignRecommendation[];
}

interface GenerateRecommendationOptions {
  selectedCampaignId?: string;
  whatsappId?: number;
}

interface CampaignData {
  id: string;
  name: string;
  status: string;
  effective_status?: string; // Estado REAL de entrega (como Ads Manager)
  objective?: string;
  // Presupuesto
  daily_budget?: number;
  lifetime_budget?: number;
  budget_remaining?: number;
  // Métricas de performance
  spend?: number;
  impressions?: number;
  clicks?: number;
  ctr?: number;
  cpc?: number;
  conversions?: number;
  reach?: number;
  frequency?: number;
  // Triggers semánticos de conversaciones
  conversations?: ConversationStats;
}

interface ConversationStats {
  totalContacts: number;
  totalMessages: number;
  confirmedPurchases: number;
  interestedNoPurchase: number;
  noResponse: number;
  purchaseEvents: number;
  leadEvents: number;
  checkoutEvents: number;
  addToCartEvents: number;
}

interface TicketConversationSummary {
  ticketId: number;
  contactName: string;
  intent: string;
  funnelStage: "discovery" | "interested" | "pricing" | "objection" | "purchase" | "support" | "lost" | "unknown";
  outcome: string;
  blockers: string[];
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  purchaseSignal: "high" | "medium" | "low" | "none";
  agentPerformance: "good" | "mixed" | "poor" | "unknown";
  summary: string;
  recommendationHint: string;
}

interface RecommendationPayload {
  campaignId: string;
  campaignName: string;
  type: "optimization" | "warning" | "opportunity" | "insight";
  priority: "critical" | "high" | "medium" | "low";
  category: "timing" | "content" | "segmentation" | "budget" | "channel";
  title: string;
  description: string;
  impact: string;
  effort: string;
  potentialGain: string;
  actionData?: any;
}

export class CampaignRecommendationService {
  private openai: OpenAI | null = null;
  private provider: any = null; // Store provider config
  private companyId: number = 1; // SuperAdmin company ID
  private readonly conversationAuditService = new CampaignAuditConversationService();

  constructor() {
    // OpenAI client will be initialized lazily when needed
  }

  /**
   * Inicializa el cliente de OpenAI usando el provider configurado
   */
  private async initializeOpenAI(): Promise<void> {
    if (this.openai) return; // Ya inicializado

    try {
      // Buscar provider de OpenAI activo para text generation
      this.provider = await AIProviderConfig.findOne({
        where: {
          companyId: this.companyId,
          provider: 'openai',
          isActive: true,
          textGenerationEnabled: true
        },
        order: [['isDefaultForText', 'DESC'], ['id', 'DESC']]
      });

      if (!this.provider) {
        // Fallback a variable de entorno si no hay provider configurado
        if (!process.env.OPENAI_API_KEY) {
          throw new AppError("No se encontró un proveedor de OpenAI configurado ni OPENAI_API_KEY en variables de entorno", 500);
        }
        logger.warn("[CampaignRecommendation] Using fallback OPENAI_API_KEY from environment");
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        return;
      }

      // Desencriptar API key
      const apiKey = this.decryptApiKey(this.provider.apiKey);

      this.openai = new OpenAI({
        apiKey,
        baseURL: this.provider.baseUrl || undefined
      });

      logger.info(`[CampaignRecommendation] Using OpenAI provider: ${this.provider.name}`);
    } catch (error: any) {
      logger.error({ error: error.message }, "[CampaignRecommendation] Error initializing OpenAI");
      throw new AppError("Error al inicializar proveedor de IA", 500);
    }
  }

  /**
   * Desencripta una API key
   */
  private decryptApiKey(encryptedKey: string): string {
    try {
      const algorithm = "aes-256-cbc";
      const secretKey = process.env.ENCRYPTION_KEY;

      if (!secretKey) {
        throw new Error("ENCRYPTION_KEY environment variable is required");
      }

      if (secretKey.length !== 32) {
        throw new Error("ENCRYPTION_KEY must be exactly 32 characters long");
      }

      const [ivHex, encrypted] = encryptedKey.split(":");
      if (!ivHex || !encrypted) {
        // Key not encrypted (legacy format)
        logger.warn("[CampaignRecommendation] API key is not encrypted");
        return encryptedKey;
      }

      const iv = Buffer.from(ivHex, "hex");
      const decipher = crypto.createDecipheriv(algorithm, Buffer.from(secretKey), iv);
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch (error: any) {
      logger.error({ error: error.message }, "[CampaignRecommendation] Decryption error");
      throw error;
    }
  }

  /**
   * Verifica el limite de tokens disponibles para el mes actual
   * Obtiene el limite del AISubplan activo de la empresa (fallback: DEFAULT_TOKEN_LIMIT)
   */
  async checkTokenLimit(companyId: number): Promise<TokenStatus> {
    // Obtener limite desde AISubplan de la empresa
    let tokenLimit = DEFAULT_TOKEN_LIMIT;
    try {
      const aiSubplan = await AISubplan.findOne({
        where: { companyId, isActive: true },
        order: [["id", "DESC"]]
      });
      if (aiSubplan && aiSubplan.tokens > 0) {
        tokenLimit = Number(aiSubplan.tokens);
        logger.info(`[CampaignRecommendation] 📋 Token limit from AISubplan: ${tokenLimit} (plan: "${aiSubplan.name}")`);
      } else {
        logger.info(`[CampaignRecommendation] 📋 No active AISubplan found, using default: ${DEFAULT_TOKEN_LIMIT}`);
      }
    } catch (err: any) {
      logger.warn(`[CampaignRecommendation] ⚠️ Error reading AISubplan, using default: ${err.message}`);
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const transactions = await AiTokenTransaction.findAll({
      where: {
        companyId,
        module: "campaigns_audit",
        type: "usage",
        createdAt: { [Op.gte]: startOfMonth }
      }
    });

    const totalUsed = transactions.reduce((sum, t) => sum + Math.abs(t.tokens), 0);
    const remaining = Math.max(0, tokenLimit - totalUsed);

    return {
      available: remaining > 0,
      used: totalUsed,
      limit: tokenLimit,
      remaining
    };
  }

  /**
   * Registra el consumo de tokens
   */
  private async recordTokenUsage(
    companyId: number,
    tokensUsed: number,
    referenceId: string
  ): Promise<void> {
    const tokenStatus = await this.checkTokenLimit(companyId);

    await AiTokenTransaction.create({
      companyId,
      type: "usage",
      tokens: -Math.abs(tokensUsed),
      module: "campaigns_audit",
      referenceId,
      balanceAfter: tokenStatus.remaining - tokensUsed,
      description: `Generacion de recomendaciones de campanas`
    });
  }

  private getCompletionModel(): string {
    return this.provider?.settings?.defaultModel || "gpt-5.5";
  }

  private supportsJsonMode(model: string): boolean {
    const jsonModeModels = [
      "gpt-5.5",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-3.5-turbo-1106",
      "gpt-4-turbo-preview",
      "gpt-4-turbo"
    ];

    return jsonModeModels.some((candidate) => model.includes(candidate));
  }

  private async runJsonCompletion<T>(
    systemPrompt: string,
    userPrompt: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      logLabel?: string;
    }
  ): Promise<{ data: T; tokensUsed: number; model: string }> {
    await this.initializeOpenAI();

    if (!this.openai) {
      throw new AppError("No se pudo inicializar el cliente de OpenAI", 500);
    }

    const model = this.getCompletionModel();
    const supportsJsonMode = this.supportsJsonMode(model);

    logger.info({
      model,
      supportsJsonMode,
      promptLength: userPrompt.length,
      logLabel: options?.logLabel || "json_completion"
    }, "[CampaignRecommendation] Calling OpenAI JSON completion");

    const completion = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      ...(supportsJsonMode ? { response_format: { type: "json_object" } } : {}),
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 4000
    });

    const content = completion.choices[0].message.content;
    const tokensUsed = completion.usage?.total_tokens || 0;

    try {
      const data = JSON.parse(content || "{}") as T;

      return {
        data,
        tokensUsed,
        model
      };
    } catch (error: any) {
      logger.error({
        error: error.message,
        rawContent: content?.substring(0, 500),
        contentLength: content?.length,
        logLabel: options?.logLabel || "json_completion"
      }, "[CampaignRecommendation] Error parsing JSON completion");
      throw new AppError("Error procesando respuesta JSON de IA", 500);
    }
  }

  private async saveRecommendations(
    companyId: number,
    recommendations: RecommendationPayload[]
  ): Promise<CampaignRecommendation[]> {
    const savedRecommendations: CampaignRecommendation[] = [];

    for (const rec of recommendations) {
      const recommendation = await CampaignRecommendation.create({
        companyId,
        campaignId: rec.campaignId,
        campaignName: rec.campaignName,
        type: rec.type,
        priority: rec.priority,
        category: rec.category,
        title: rec.title,
        description: rec.description,
        impact: rec.impact,
        effort: rec.effort,
        potentialGain: rec.potentialGain,
        actionData: rec.actionData || null,
        status: "active"
      });

      savedRecommendations.push(recommendation);
    }

    return savedRecommendations;
  }

  /**
   * Obtiene estadísticas de conversaciones por campaña
   * Vinculación: FacebookConversionEvent.campaignId → ctwaClid → CampaignMessage.ctwaClid
   */
  private async getCampaignConversations(
    companyId: number,
    campaignIds: string[],
    dateSince?: string,
    dateUntil?: string
  ): Promise<Map<string, ConversationStats>> {
    const stats: Map<string, ConversationStats> = new Map();

    // Inicializar stats vacías para todas las campañas
    for (const campaignId of campaignIds) {
      stats.set(campaignId, {
        totalContacts: 0,
        totalMessages: 0,
        confirmedPurchases: 0,
        interestedNoPurchase: 0,
        noResponse: 0,
        purchaseEvents: 0,
        leadEvents: 0,
        checkoutEvents: 0,
        addToCartEvents: 0
      });
    }

    if (campaignIds.length === 0) {
      return stats;
    }

    // Construir condición de fecha
    const dateCondition: any = {};
    if (dateSince) {
      dateCondition[Op.gte] = new Date(dateSince + 'T00:00:00.000Z');
    }
    if (dateUntil) {
      dateCondition[Op.lte] = new Date(dateUntil + 'T23:59:59.999Z');
    }

    // 1. Obtener ctwaClid por campaignId desde FacebookConversionEvent
    const conversionWhere: any = {
      companyId,
      campaignId: { [Op.in]: campaignIds }
    };
    if (dateSince || dateUntil) {
      conversionWhere.createdAt = dateCondition;
    }

    const conversionEvents = await FacebookConversionEvent.findAll({
      where: conversionWhere,
      attributes: ['campaignId', 'ctwaClid', 'eventName', 'contactId']
    });

    logger.info(`[CampaignRecommendation] 📊 Conversiones encontradas: ${conversionEvents.length} para ${campaignIds.length} campañas`);

    // 2. Agrupar ctwaClid por campaignId
    const ctwaClidMap: Map<string, Set<string>> = new Map();
    for (const campaignId of campaignIds) {
      ctwaClidMap.set(campaignId, new Set());
    }

    // Contadores por campaignId
    const purchaseEvents: Map<string, number> = new Map();
    const leadEvents: Map<string, number> = new Map();
    const checkoutEvents: Map<string, number> = new Map();
    const addToCartEvents: Map<string, number> = new Map();

    for (const event of conversionEvents) {
      if (event.ctwaClid) {
        const clids = ctwaClidMap.get(String(event.campaignId));
        if (clids) clids.add(event.ctwaClid);
      }

      const campId = String(event.campaignId);
      const eventName = event.eventName?.toLowerCase() || '';

      if (eventName === 'purchase') {
        purchaseEvents.set(campId, (purchaseEvents.get(campId) || 0) + 1);
      } else if (eventName === 'lead') {
        leadEvents.set(campId, (leadEvents.get(campId) || 0) + 1);
      } else if (eventName === 'initiatecheckout') {
        checkoutEvents.set(campId, (checkoutEvents.get(campId) || 0) + 1);
      } else if (eventName === 'addtocart') {
        addToCartEvents.set(campId, (addToCartEvents.get(campId) || 0) + 1);
      }
    }

    // 3. Obtener CampaignMessage por ctwaClid
    const allCtwaClids = new Set<string>();
    for (const clids of Array.from(ctwaClidMap.values())) {
      for (const clid of Array.from(clids)) {
        allCtwaClids.add(clid);
      }
    }

    let campaignMessages: any[] = [];
    if (allCtwaClids.size > 0) {
      const messageWhere: any = {
        companyId,
        ctwaClid: { [Op.in]: Array.from(allCtwaClids) }
      };
      if (dateSince || dateUntil) {
        messageWhere.createdAt = dateCondition;
      }

      campaignMessages = await CampaignMessage.findAll({
        where: messageWhere,
        attributes: ['ctwaClid', 'contactId']
      });
    }

    logger.info(`[CampaignRecommendation] 💬 Mensajes de campaña encontrados: ${campaignMessages.length}`);

    // 4. Construir stats por campaignId
    for (const campaignId of campaignIds) {
      const clids = ctwaClidMap.get(campaignId) || new Set();
      const msgsForCampaign = campaignMessages.filter(m => clids.has(m.ctwaClid));
      const totalContacts = new Set(msgsForCampaign.map(m => m.contactId)).size;
      const totalMessages = msgsForCampaign.length;

      // Conversiones confirmadas = Purchase
      const confirmedPurchases = purchaseEvents.get(campaignId) || 0;
      // Leads interesados = Lead + InitiateCheckout + AddToCart
      const interestedLeads = (leadEvents.get(campaignId) || 0) +
                            (checkoutEvents.get(campaignId) || 0) +
                            (addToCartEvents.get(campaignId) || 0);
      // Sin conversión = contactos que escribieron pero no convirtieron
      const noResponse = Math.max(0, totalContacts - confirmedPurchases - interestedLeads);

      stats.set(campaignId, {
        totalContacts,
        totalMessages,
        confirmedPurchases,
        interestedNoPurchase: interestedLeads,
        noResponse,
        purchaseEvents: purchaseEvents.get(campaignId) || 0,
        leadEvents: leadEvents.get(campaignId) || 0,
        checkoutEvents: checkoutEvents.get(campaignId) || 0,
        addToCartEvents: addToCartEvents.get(campaignId) || 0
      });
    }

    // Log de stats
    for (const [campaignId, stat] of Array.from(stats.entries())) {
      logger.info(`[CampaignRecommendation] 📋 Campaña ${campaignId}: ${stat.totalContacts} contactos, ${stat.confirmedPurchases} compras, ${stat.interestedNoPurchase} leads, ${stat.noResponse} sin respuesta`);
    }

    return stats;
  }

  private async generateTicketSummaries(
    campaign: CampaignData,
    context: CampaignConversationContext
  ): Promise<{ summaries: TicketConversationSummary[]; tokensUsed: number }> {
    const batchSize = 4;
    let tokensUsed = 0;
    const summaries: TicketConversationSummary[] = [];

    for (let index = 0; index < context.tickets.length; index += batchSize) {
      const batch = context.tickets.slice(index, index + batchSize);
      const userPrompt = `Analiza estos tickets atribuidos a una campaña de Meta Ads y resume cada conversación de forma operativa.

Campaña:
${JSON.stringify({
  campaignId: campaign.id,
  campaignName: campaign.name,
  objective: campaign.objective
}, null, 2)}

Tickets:
${JSON.stringify(batch, null, 2)}

Responde SOLO con un JSON válido usando esta estructura:
{
  "summaries": [
    {
      "ticketId": 123,
      "contactName": "Cliente",
      "intent": "Motivo principal de la conversación",
      "funnelStage": "discovery | interested | pricing | objection | purchase | support | lost | unknown",
      "outcome": "Resultado real del ticket",
      "blockers": ["máximo 3 bloqueos"],
      "sentiment": "positive | neutral | negative | mixed",
      "purchaseSignal": "high | medium | low | none",
      "agentPerformance": "good | mixed | poor | unknown",
      "summary": "Resumen corto y preciso de lo que entendiste del ticket",
      "recommendationHint": "Sugerencia concreta para mejorar este tipo de conversación"
    }
  ]
}

Reglas:
- No inventes datos que no estén en la conversación.
- Usa "unknown" si no se puede concluir algo con seguridad.
- "summary" debe ser breve y accionable.
- Si detectas demora, falta de respuesta, objeciones repetidas o mala clasificación del lead, refléjalo en blockers o recommendationHint.`;

      const result = await this.runJsonCompletion<{ summaries: TicketConversationSummary[] }>(
        "Eres un analista senior de conversaciones de ventas y soporte por WhatsApp. Responde SOLO con JSON válido.",
        userPrompt,
        {
          maxTokens: 2200,
          logLabel: "ticket_summaries"
        }
      );

      tokensUsed += result.tokensUsed;
      summaries.push(...(result.data.summaries || []));
    }

    return {
      summaries,
      tokensUsed
    };
  }

  private async generateConversationRecommendation(
    campaign: CampaignData,
    context: CampaignConversationContext,
    ticketSummaries: TicketConversationSummary[]
  ): Promise<{ recommendation: RecommendationPayload; tokensUsed: number }> {
    const recommendationContext = {
      campaign,
      conversationCoverage: {
        matchedAds: context.matchedAds,
        matchedCampaignMessages: context.matchedCampaignMessages,
        analyzedTickets: context.analyzedTickets,
        omittedTickets: context.omittedTickets
      },
      ticketSummaries
    };

    const userPrompt = `Analiza una campaña de Meta Ads usando métricas y resúmenes de tickets atribuidos.

Contexto:
${JSON.stringify(recommendationContext, null, 2)}

Genera UNA sola recomendación principal para esta campaña.

Responde SOLO con un JSON válido usando esta estructura:
{
  "recommendation": {
    "campaignId": "${campaign.id}",
    "campaignName": "${campaign.name}",
    "type": "optimization | warning | opportunity | insight",
    "priority": "critical | high | medium | low",
    "category": "timing | content | segmentation | budget | channel",
    "title": "Titulo corto y accionable",
    "description": "Explica el hallazgo principal usando los patrones observados en las conversaciones",
    "impact": "Impacto esperado",
    "effort": "bajo | medio | alto",
    "potentialGain": "Ganancia potencial",
    "actionData": {
      "mainPattern": "patrón dominante",
      "topBlockers": ["bloqueos principales"],
      "nextSteps": ["pasos concretos"]
    }
  }
}

Reglas:
- Usa los resúmenes de tickets como fuente principal para detectar el cuello de botella.
- Si el problema está en la atención humana o en el cierre, prioriza category=channel o timing antes que budget.
- Si detectas objeciones repetidas o desalineación del mensaje, considera content o segmentation.
- Sé conservador si la muestra es pequeña.
- No generes más de una recomendación.`;

    const result = await this.runJsonCompletion<{ recommendation: RecommendationPayload }>(
      "Eres un estratega senior de Meta Ads y operaciones de ventas por WhatsApp. Responde SOLO con JSON válido.",
      userPrompt,
      {
        maxTokens: 2000,
        logLabel: "campaign_conversation_recommendation"
      }
    );

    return {
      recommendation: result.data.recommendation,
      tokensUsed: result.tokensUsed
    };
  }

  private async generateSelectedCampaignRecommendation(
    companyId: number,
    campaign: CampaignData,
    options?: GenerateRecommendationOptions & {
      messageDateSince?: string;
      messageDateUntil?: string;
    }
  ): Promise<{ recommendations: RecommendationPayload[]; tokensUsed: number }> {
    const conversationContext = await this.conversationAuditService.buildCampaignContext({
      companyId,
      campaignId: campaign.id,
      whatsappId: options?.whatsappId,
      dateSince: options?.messageDateSince,
      dateUntil: options?.messageDateUntil
    });

    if (conversationContext.analyzedTickets === 0) {
      logger.warn({
        campaignId: campaign.id,
        campaignName: campaign.name
      }, "[CampaignRecommendation] No hay tickets atribuidos para la campaña seleccionada, usando fallback por métricas");

      const fallback = await this.callOpenAIForRecommendations([campaign]);

      return {
        recommendations: fallback.recommendations.map((recommendation) => ({
          ...recommendation,
          actionData: {
            ...(recommendation.actionData || {}),
            analysisMode: "performance_fallback",
            conversationCoverage: {
              analyzedTickets: 0,
              matchedCampaignMessages: 0,
              matchedAds: conversationContext.matchedAds
            }
          }
        })),
        tokensUsed: fallback.tokensUsed
      };
    }

    const summaryResult = await this.generateTicketSummaries(campaign, conversationContext);
    const recommendationResult = await this.generateConversationRecommendation(
      campaign,
      conversationContext,
      summaryResult.summaries
    );

    return {
      recommendations: [
        {
          ...recommendationResult.recommendation,
          actionData: {
            ...(recommendationResult.recommendation.actionData || {}),
            analysisMode: "conversation_pipeline",
            conversationCoverage: {
              matchedAds: conversationContext.matchedAds,
              matchedCampaignMessages: conversationContext.matchedCampaignMessages,
              analyzedTickets: conversationContext.analyzedTickets,
              omittedTickets: conversationContext.omittedTickets
            },
            sampleTickets: summaryResult.summaries.slice(0, 10).map((summary) => ({
              ticketId: summary.ticketId,
              contactName: summary.contactName,
              funnelStage: summary.funnelStage,
              outcome: summary.outcome,
              blockers: summary.blockers,
              recommendationHint: summary.recommendationHint
            }))
          }
        }
      ],
      tokensUsed: summaryResult.tokensUsed + recommendationResult.tokensUsed
    };
  }

  /**
   * Genera recomendaciones usando OpenAI
   */
  async generateRecommendations(
    companyId: number,
    period: string = "last_30_days",
    campaignsData?: any[],
    messageDateSince?: string,
    messageDateUntil?: string,
    options: GenerateRecommendationOptions = {}
  ): Promise<GenerateRecommendationsResult> {
    // Verificar tokens disponibles
    const tokenStatus = await this.checkTokenLimit(companyId);
    if (!tokenStatus.available) {
      throw new AppError(
        `Limite de tokens alcanzado. Usado: ${tokenStatus.used}/${tokenStatus.limit}`,
        429
      );
    }

    // NUEVO: Usar datos pasados o buscar en cache como fallback
    let campaigns: any[] = [];

    if (campaignsData && campaignsData.length > 0) {
      logger.info(`[CampaignRecommendation] Using ${campaignsData.length} campaigns received from frontend`);
      campaigns = campaignsData;
    } else {
      logger.warn(`[CampaignRecommendation] No campaign data received, attempting Redis cache...`);
      campaigns = await MarketingCache.getCampaigns(companyId, period);

      if (!campaigns || campaigns.length === 0) {
        throw new AppError(
          "No hay datos de campañas disponibles. Por favor, intente cargar los datos primero.",
          400
        );
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🔥 FILTRO PRO: Usa DeliveryState igual que el frontend (CampaignsInsights.tsx)
    // ═══════════════════════════════════════════════════════════════════════════
    // DeliveryState = 'ACTIVA' | 'NO_HAY_ANUNCIOS' | 'COMPLETADA' | 'DESACTIVADA'
    //
    // IMPORTANTE: Meta NO cambia effective_status aunque no haya anuncios activos
    // Por eso validamos también las métricas de entrega (impresiones)
    // ═══════════════════════════════════════════════════════════════════════════

    type DeliveryState = 'ACTIVA' | 'NO_HAY_ANUNCIOS' | 'COMPLETADA' | 'DESACTIVADA';

    const now = new Date();

    // Helper: Clasificar el estado de entrega de una campaña
    // Combina status, effective_status, fechas, presupuesto e insights
    const classifyCampaignDelivery = (campaign: any): {
      state: DeliveryState;
      reason: string;
    } => {
      const status = campaign.status;
      const effectiveStatus = campaign.effective_status || campaign.effectiveStatus;
      const stopTime = campaign.stop_time;
      const budgetRemaining = Number(campaign.budget_remaining) || 0;
      const impressions = campaign.insights?.impressions || 0;

      // 1. DESACTIVADA: Si el usuario pausó manualmente la campaña
      if (status === 'PAUSED') {
        return { state: 'DESACTIVADA', reason: 'status=PAUSED (pausada manualmente)' };
      }

      // 2. COMPLETADA: Si la fecha de fin ya pasó
      if (stopTime && new Date(stopTime) < now) {
        return { state: 'COMPLETADA', reason: `stop_time expirado (${stopTime})` };
      }

      // 3. COMPLETADA: Si el presupuesto se agotó
      if (campaign.lifetime_budget && budgetRemaining <= 0) {
        return { state: 'COMPLETADA', reason: `budget_remaining=${budgetRemaining} (agotado)` };
      }

      // 4. Si effective_status indica completada o archivada
      if (effectiveStatus === 'COMPLETED' || effectiveStatus === 'CAMPAIGN_PAUSED') {
        return { state: 'COMPLETADA', reason: `effective_status=${effectiveStatus}` };
      }

      if (effectiveStatus === 'ARCHIVED') {
        return { state: 'COMPLETADA', reason: 'effective_status=ARCHIVED' };
      }

      // 5. VALIDACIÓN CRÍTICA: Si la campaña está "activa" pero tiene 0 impresiones
      //    significa que NO tiene anuncios activos entregando
      //    Meta reporta status=ACTIVE y effective_status=ACTIVE pero sin entrega real
      if (status === 'ACTIVE' && (effectiveStatus === 'ACTIVE' || !effectiveStatus)) {
        // Si tiene 0 impresiones = no hay anuncios activos entregando
        if (impressions === 0) {
          return { state: 'NO_HAY_ANUNCIOS', reason: 'status=ACTIVE pero impressions=0 (sin anuncios entregando)' };
        }
        // Si tiene impresiones = está entregando correctamente
        return { state: 'ACTIVA', reason: `status=ACTIVE + effective_status=ACTIVE + impressions=${impressions}` };
      }

      // Default: cualquier otro caso
      return { state: 'DESACTIVADA', reason: `No cumple condiciones (status=${status}, effective_status=${effectiveStatus})` };
    };

    // Clasificar todas las campañas
    const campaignStates = campaigns.map((c: any) => ({
      campaign: c,
      ...classifyCampaignDelivery(c)
    }));

    // Log detallado de clasificación
    logger.info(`[CampaignRecommendation] ╔══════════════════════════════════════════════════════════════╗`);
    logger.info(`[CampaignRecommendation] ║     CLASIFICACIÓN DE CAMPAÑAS (DeliveryState Frontend)      ║`);
    logger.info(`[CampaignRecommendation] ╚══════════════════════════════════════════════════════════════╝`);

    const stateGroups = {
      ACTIVA: campaignStates.filter(s => s.state === 'ACTIVA'),
      NO_HAY_ANUNCIOS: campaignStates.filter(s => s.state === 'NO_HAY_ANUNCIOS'),
      COMPLETADA: campaignStates.filter(s => s.state === 'COMPLETADA'),
      DESACTIVADA: campaignStates.filter(s => s.state === 'DESACTIVADA')
    };

    logger.info(`[CampaignRecommendation] 📊 RESUMEN:`);
    logger.info(`[CampaignRecommendation]   🟢 ACTIVA (entregando con impresiones): ${stateGroups.ACTIVA.length}`);
    logger.info(`[CampaignRecommendation]   ⚠️  NO_HAY_ANUNCIOS (0 impresiones): ${stateGroups.NO_HAY_ANUNCIOS.length}`);
    logger.info(`[CampaignRecommendation]   ⚪ COMPLETADA: ${stateGroups.COMPLETADA.length}`);
    logger.info(`[CampaignRecommendation]   🔴 DESACTIVADA: ${stateGroups.DESACTIVADA.length}`);

    // Log de campañas NO activas con detalle
    const nonActiveCampaigns = campaignStates.filter(s => s.state !== 'ACTIVA');
    if (nonActiveCampaigns.length > 0) {
      logger.warn({
        count: nonActiveCampaigns.length,
        campaigns: nonActiveCampaigns.map((s: any) => ({
          name: s.campaign.name?.substring(0, 50),
          status: s.campaign.status,
          effective_status: s.campaign.effective_status || s.campaign.effectiveStatus,
          impressions: s.campaign.insights?.impressions || 0,
          stop_time: s.campaign.stop_time,
          budget_remaining: s.campaign.budget_remaining,
          deliveryState: s.state,
          reason: s.reason
        }))
      }, '[CampaignRecommendation] Campañas EXCLUIDAS del análisis de IA');
    }

    // Solo campañas ACTIVA (realmente entregando con impresiones > 0)
    const activeCampaigns = stateGroups.ACTIVA.map(s => s.campaign);

    if (activeCampaigns.length === 0) {
      throw new AppError(
        `No hay campañas ACTIVAS entregando. De ${campaigns.length} campañas: ` +
        `${stateGroups.COMPLETADA.length} completadas, ${stateGroups.DESACTIVADA.length} desactivadas, ` +
        `${stateGroups.NO_HAY_ANUNCIOS.length} sin anuncios activos. ` +
        `La IA solo analiza campañas con impresiones > 0. Verifica en Ads Manager.`,
        400
      );
    }

    // 🔍 LOG 1: Resumen de campañas que SÍ se analizarán
    logger.info(`[CampaignRecommendation] ✅ La IA analizará ${activeCampaigns.length} campañas ACTIVA de ${campaigns.length} totales`);

    // Alias para compatibilidad con código existente
    const campaignsWithInsights = activeCampaigns;

    // 🔍 LOG 2: Estructura cruda de primera campaña (para verificar mapeo)
    if (campaignsWithInsights.length > 0) {
      const sampleCampaign = campaignsWithInsights[0];
      logger.debug({
        campaignId: sampleCampaign.id,
        campaignName: sampleCampaign.name,
        rawStructure: sampleCampaign
      }, '[CampaignRecommendation] Sample raw campaign structure from Meta API');

      logger.debug({
        availableFields: Object.keys(sampleCampaign),
        insightsFields: sampleCampaign.insights ? Object.keys(sampleCampaign.insights) : 'No insights'
      }, '[CampaignRecommendation] Available fields in raw campaign data');
    }

    // ================================================================
    // 🔥 TRIGGERS SEMÁNTICOS: Obtener conversaciones de campañas
    // ================================================================
    const campaignIds = campaignsWithInsights.map((c: any) => String(c.id));
    const conversationStats = await this.getCampaignConversations(
      companyId,
      campaignIds,
      messageDateSince,
      messageDateUntil
    );

    // Preparar datos para OpenAI (SOLO campañas activas entregando)
    const campaignDataForAI: CampaignData[] = campaignsWithInsights.map((c: any) => ({
      id: String(c.id),
      name: c.name,
      status: c.status,
      effective_status: c.effective_status || c.effectiveStatus || c.status,
      objective: c.objective,
      // Datos de presupuesto (para contexto de AI)
      daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : undefined, // Meta devuelve en centavos
      lifetime_budget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : undefined,
      budget_remaining: c.budget_remaining ? Number(c.budget_remaining) / 100 : undefined,
      // Métricas de performance
      spend: c.spend || c.insights?.spend || 0,
      impressions: c.impressions || c.insights?.impressions || 0,
      clicks: c.clicks || c.insights?.clicks || 0,
      ctr: c.ctr || c.insights?.ctr || 0,
      cpc: c.cpc || c.insights?.cpc || 0,
      conversions: c.conversions || c.insights?.conversions || 0,
      reach: c.reach || c.insights?.reach || 0,
      frequency: c.frequency || c.insights?.frequency || 0,
      // Triggers semánticos de conversaciones
      conversations: conversationStats.get(String(c.id)) || {
        totalContacts: 0,
        totalMessages: 0,
        confirmedPurchases: 0,
        interestedNoPurchase: 0,
        noResponse: 0,
        purchaseEvents: 0,
        leadEvents: 0,
        checkoutEvents: 0,
        addToCartEvents: 0
      }
    }));

    // 🔍 LOG 4: Datos mapeados (verificar mapeo correcto)
    logger.debug({
      mappedCount: campaignDataForAI.length,
      sampleMapped: campaignDataForAI[0]
    }, '[CampaignRecommendation] Mapped campaign data for AI');

    // 🔍 LOG 5: Campañas con gasto cero (posibles problemas de datos)
    const zeroSpendCampaigns = campaignDataForAI.filter((c: any) => (c.spend || 0) === 0);
    if (zeroSpendCampaigns.length > 0) {
      logger.warn({
        count: zeroSpendCampaigns.length,
        campaigns: zeroSpendCampaigns.map(c => ({ id: c.id, name: c.name }))
      }, '[CampaignRecommendation] Campaigns with zero spend detected');
    }

    const aiResponse = options.selectedCampaignId
      ? await this.generateSelectedCampaignRecommendation(companyId, (() => {
          const selectedCampaign = campaignDataForAI.find(
            (campaign) => campaign.id === String(options.selectedCampaignId)
          );

          if (!selectedCampaign) {
            throw new AppError(
              "La campaña seleccionada no se encontró dentro de las campañas cargadas para auditoría",
              400
            );
          }

          return selectedCampaign;
        })(), {
          ...options,
          messageDateSince,
          messageDateUntil
        })
      : await this.callOpenAIForRecommendations(campaignDataForAI);

    const savedRecommendations = await this.saveRecommendations(
      companyId,
      aiResponse.recommendations as RecommendationPayload[]
    );

    // Registrar consumo de tokens
    await this.recordTokenUsage(
      companyId,
      aiResponse.tokensUsed,
      `audit_${Date.now()}`
    );

    return {
      success: true,
      generated: savedRecommendations.length,
      tokensUsed: aiResponse.tokensUsed,
      recommendations: savedRecommendations
    };
  }

  /**
   * Llama a OpenAI para generar recomendaciones
   */
  private async callOpenAIForRecommendations(campaigns: CampaignData[]): Promise<{
    recommendations: RecommendationPayload[];
    tokensUsed: number;
  }> {
    const prompt = `Eres un experto en Meta Ads y WhatsApp Business con 10+ anos de experiencia.
Analiza los datos de estas campanas de Facebook/Instagram y genera UNA recomendacion especifica para CADA campana.

Datos de campanas:
${JSON.stringify(campaigns, null, 2)}

Cada campana incluye metricas de Meta Ads Y datos de conversaciones en WhatsApp:

METRICAS DE META ADS:
- spend: gasto total en USD
- impressions: impresiones totales
- clicks: clics totales
- ctr: tasa de clics (%)
- cpc: costo por clic (USD)
- conversions: conversiones reportadas por Meta
- reach: alcance total
- frequency: frecuencia promedio

DATOS DE CONVERSACIONES (Triggers Semanticos):
- conversations.totalContacts: numero de personas que escribieron desde WhatsApp
- conversations.totalMessages: numero total de mensajes intercambiados
- conversations.confirmedPurchases: personas que COMPRARON (evento Purchase enviado a Meta)
- conversations.interestedNoPurchase: personas INTERESADAS sin compra (Lead, InitiateCheckout, AddToCart)
- conversations.noResponse: personas que escribieron pero NO recibieron respuesta del agente

EJEMPLO DE CONTEXTO SEMANTICO:
Si una campana tiene:
- 10 totalContacts, 3 confirmedPurchases, 6 interestedNoPurchase, 1 noResponse
Significa:
- 10 personas interesadas escribieron
- 3 SI compraron (conversion enviada a Meta)
- 6 estuvieron interesadas pero NO compraron (preguntaron, interactuaron)
- 1 escribio pero NO hubo respuesta de un agente

ANALISIS DEL EMBUDO:
1. Si interestedNoPurchase > confirmedPurchases: La campana atrae bien pero hay friccion en la conversion
2. Si noResponse > 0: Hay perdidas por falta de atencion del agente
3. Si confirmedPurchases es bajo: Revisar calidad del lead o propuesta de valor

Para CADA campana, genera UNA recomendacion con esta estructura JSON:
{
  "campaignId": "ID de la campana",
  "campaignName": "nombre de la campana",
  "type": "optimization" | "warning" | "opportunity" | "insight",
  "priority": "critical" | "high" | "medium" | "low",
  "category": "timing" | "content" | "segmentation" | "budget" | "channel",
  "title": "Titulo corto y accionable (max 100 caracteres)",
  "description": "Explicacion detallada de la recomendacion, incluyendo analisis del comportamiento de los leads en WhatsApp",
  "impact": "Impacto esperado (ej: 'Aumento de 15% en CTR')",
  "effort": "bajo" | "medio" | "alto",
  "potentialGain": "Ganancia potencial estimada",
  "actionData": { datos estructurados para implementar la recomendacion }
}

Criterios para type:
- "warning": Problema urgente que requiere atencion inmediata (noResponse > 0, CPL muy alto, CTR muy bajo)
- "optimization": Mejora que puede incrementar rendimiento (interestedNoPurchase alto, velocidad de respuesta)
- "opportunity": Potencial sin explotar (interestedNoPurchase > confirmedPurchases)
- "insight": Observacion importante sin accion inmediata

Criterios para priority:
- "critical": Afecta significativamente el ROI (>20% del presupuesto en riesgo) o hay noResponse > 0
- "high": Mejora importante (10-20% mejora potencial)
- "medium": Mejora moderada (5-10% mejora potencial)
- "low": Mejora menor (<5% mejora potencial)

Responde SOLO con un JSON valido con esta estructura:
{
  "recommendations": [ array de recomendaciones, una por campana ]
}`;

    const result = await this.runJsonCompletion<{ recommendations: RecommendationPayload[] }>(
      "Eres un experto en publicidad digital y Meta Ads. Responde SOLO con JSON valido.",
      prompt,
      {
        maxTokens: 4000,
        logLabel: "campaign_recommendations"
      }
    );

    logger.info({
      recommendationsGenerated: result.data.recommendations?.length || 0,
      tokensUsed: result.tokensUsed,
      model: result.model
    }, "[CampaignRecommendation] AI recommendations parsed successfully");

    if (result.data.recommendations && result.data.recommendations.length > 0) {
      logger.debug({
        sampleRecommendation: result.data.recommendations[0]
      }, "[CampaignRecommendation] Sample generated recommendation");
    }

    return {
      recommendations: result.data.recommendations || [],
      tokensUsed: result.tokensUsed
    };
  }

  /**
   * Obtiene recomendaciones de una empresa
   */
  async getRecommendations(
    companyId: number,
    filters?: {
      status?: string;
      campaignId?: string;
      priority?: string;
      category?: string;
      campaignStatus?: string;  // NEW: Filter by campaign delivery status
      dateFrom?: string;         // NEW: Date range start
      dateTo?: string;           // NEW: Date range end
    }
  ): Promise<{ recommendations: CampaignRecommendation[]; tokenStatus: TokenStatus }> {
    const where: any = { companyId };

    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.campaignId) {
      where.campaignId = filters.campaignId;
    }
    if (filters?.priority) {
      where.priority = filters.priority as "critical" | "high" | "medium" | "low";
    }
    if (filters?.category) {
      where.category = filters.category;
    }

    // NEW: Date range filtering on recommendation createdAt
    if (filters?.dateFrom || filters?.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) {
        where.createdAt[Op.gte] = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        // Add one day to include the entire end date
        const endDate = new Date(filters.dateTo);
        endDate.setDate(endDate.getDate() + 1);
        where.createdAt[Op.lt] = endDate;
      }
    }

    // Fetch recommendations from database
    let recommendations = await CampaignRecommendation.findAll({
      where,
      order: [
        ["priority", "ASC"], // critical primero
        ["createdAt", "DESC"]
      ]
    });

    // NEW: Filter by campaign delivery status
    if (filters?.campaignStatus && recommendations.length > 0) {
      try {
        // Fetch campaign data from cache
        const campaignsData = await MarketingCache.getCampaigns(companyId, 'last_30_days');

        if (campaignsData && campaignsData.length > 0) {
          // Create status map: campaignId -> status
          const campaignStatusMap = new Map<string, string>();
          campaignsData.forEach((campaign: any) => {
            campaignStatusMap.set(String(campaign.id), campaign.status);
          });

          // Filter recommendations by campaign status
          recommendations = recommendations.filter(rec => {
            const campaignStatus = campaignStatusMap.get(rec.campaignId);
            return campaignStatus === filters.campaignStatus;
          });
        }
      } catch (error: any) {
        logger.error({ error: error.message }, '[CampaignRecommendationService] Error filtering by campaign status');
        // Continue without campaign status filtering on error
      }
    }

    const tokenStatus = await this.checkTokenLimit(companyId);

    return { recommendations, tokenStatus };
  }

  /**
   * Obtiene una recomendacion por ID
   */
  async getRecommendationById(
    id: number,
    companyId: number
  ): Promise<CampaignRecommendation | null> {
    return CampaignRecommendation.findOne({
      where: { id, companyId }
    });
  }

  /**
   * Actualiza una recomendacion
   */
  async updateRecommendation(
    id: number,
    companyId: number,
    data: {
      title?: string;
      description?: string;
      impact?: string;
      effort?: string;
      potentialGain?: string;
      priority?: "critical" | "high" | "medium" | "low";
      category?: "timing" | "content" | "segmentation" | "budget" | "channel";
      actionData?: any;
    }
  ): Promise<CampaignRecommendation> {
    const recommendation = await CampaignRecommendation.findOne({
      where: { id, companyId }
    });

    if (!recommendation) {
      throw new AppError("Recomendacion no encontrada", 404);
    }

    await recommendation.update(data);
    return recommendation;
  }

  /**
   * Aplica una recomendacion (marca como aplicada)
   */
  async applyRecommendation(
    id: number,
    companyId: number,
    userId: number
  ): Promise<CampaignRecommendation> {
    const recommendation = await CampaignRecommendation.findOne({
      where: { id, companyId }
    });

    if (!recommendation) {
      throw new AppError("Recomendacion no encontrada", 404);
    }

    await recommendation.update({
      status: "applied",
      appliedAt: new Date(),
      appliedBy: userId
    });

    return recommendation;
  }

  /**
   * Descarta una recomendacion (DELETE permanente)
   */
  async dismissRecommendation(
    id: number,
    companyId: number
  ): Promise<boolean> {
    const recommendation = await CampaignRecommendation.findOne({
      where: { id, companyId }
    });

    if (!recommendation) {
      throw new AppError("Recomendacion no encontrada", 404);
    }

    await recommendation.destroy();
    return true;
  }

  /**
   * Obtiene scores de campanas (desde cache, no se guardan)
   */
  async getCampaignScores(
    companyId: number,
    period: string = "last_30_days",
    campaignsData?: any[] // Nuevo parámetro opcional
  ): Promise<any[]> {
    // Obtener datos de campañas
    let campaigns: any[] = [];

    if (campaignsData && campaignsData.length > 0) {
      campaigns = campaignsData;
    } else {
      campaigns = await MarketingCache.getCampaigns(companyId, period);
      if (!campaigns || campaigns.length === 0) {
        return []; // Retornar array vacío en lugar de error
      }
    }

    // Calcular scores basados en metricas
    return Promise.all(campaigns.map(async (campaign: any) => {
      const spend = campaign.spend || campaign.insights?.spend || 0;
      const impressions = campaign.impressions || campaign.insights?.impressions || 0;
      const clicks = campaign.clicks || campaign.insights?.clicks || 0;
      const conversions = campaign.conversions || campaign.insights?.conversions || 0;
      const ctr = campaign.ctr || campaign.insights?.ctr || 0;
      const frequency = campaign.frequency || campaign.insights?.frequency || 1;

      // Calcular scores individuales (0-100)
      const contentScore = Math.min(100, ctr * 20); // CTR benchmark ~5%
      // [Fase2·E5.1] La frecuencia es un proxy pobre de fatiga: hay campañas con
      // frecuencia 1.5 quemadas y con 6 rindiendo. La señal real (CTR cayendo +
      // CPA subiendo) la calcula CampaignFatigueService sobre InsightsDaily y se
      // publica como alerta. Aquí la frecuencia se queda solo como indicador de
      // saturación de alcance, que es lo único que mide de verdad.
      const timingScore = frequency < 3 ? 80 : frequency < 5 ? 60 : 40;
      const audienceScore = impressions > 0 ? Math.min(100, (clicks / impressions) * 1000) : 0;
      const budgetScore = spend > 0 && conversions > 0 ? Math.min(100, 100 - (spend / conversions / 10)) : 50;
      const performanceScore = (contentScore + timingScore + audienceScore + budgetScore) / 4;

      // Contar recomendaciones activas para esta campaña desde BD
      let recCount = 0;
      try {
        recCount = await CampaignRecommendation.count({
          where: {
            campaignId: String(campaign.id),
            companyId,
            status: { [Op.ne]: "dismissed" }
          }
        });
      } catch (err: any) {
        logger.warn(`[CampaignRecommendation] ⚠️ Error contando recomendaciones para campaña ${campaign.id}: ${err.message}`);
      }

      return {
        campaignId: String(campaign.id),
        campaignName: campaign.name,
        channel: campaign.objective || "CONVERSIONS",
        overallScore: Math.round(performanceScore),
        contentScore: Math.round(contentScore),
        timingScore: Math.round(timingScore),
        audienceScore: Math.round(audienceScore),
        budgetScore: Math.round(budgetScore),
        performanceScore: Math.round(performanceScore),
        recommendations: recCount
      };
    }));
  }
}

export default CampaignRecommendationService;
