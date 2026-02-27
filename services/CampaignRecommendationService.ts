import OpenAI from "openai";
import { Op } from "sequelize";
import CampaignRecommendation from "../models/CampaignRecommendation";
import AiTokenTransaction from "../models/AiTokenTransaction";
import AISubplan from "../models/AISubplan";
import AppError from "../errors/AppError";
import { MarketingCache } from "./MetaMarketingService/MarketingCache";
import AIProviderConfig from "../models/AIProviderConfig";
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
}

export class CampaignRecommendationService {
  private openai: OpenAI | null = null;
  private provider: any = null; // Store provider config
  private companyId: number = 1; // SuperAdmin company ID

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

  /**
   * Genera recomendaciones usando OpenAI
   */
  async generateRecommendations(
    companyId: number,
    period: string = "last_30_days",
    campaignsData?: any[] // Nuevo parámetro opcional
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
      frequency: c.frequency || c.insights?.frequency || 0
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

    // Llamar a OpenAI para generar recomendaciones
    const aiResponse = await this.callOpenAIForRecommendations(campaignDataForAI);

    // Guardar recomendaciones en la base de datos
    const savedRecommendations: CampaignRecommendation[] = [];
    for (const rec of aiResponse.recommendations) {
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
    recommendations: any[];
    tokensUsed: number;
  }> {
    const prompt = `Eres un experto en Meta Ads con 10+ anos de experiencia.
Analiza los datos de estas campanas de Facebook/Instagram y genera UNA recomendacion especifica para CADA campana.

Datos de campanas:
${JSON.stringify(campaigns, null, 2)}

Para CADA campana, genera una recomendacion con esta estructura JSON:
{
  "campaignId": "ID de la campana",
  "campaignName": "nombre de la campana",
  "type": "optimization" | "warning" | "opportunity" | "insight",
  "priority": "critical" | "high" | "medium" | "low",
  "category": "timing" | "content" | "segmentation" | "budget" | "channel",
  "title": "Titulo corto y accionable (max 100 caracteres)",
  "description": "Explicacion detallada de la recomendacion",
  "impact": "Impacto esperado (ej: 'Aumento de 15% en CTR')",
  "effort": "bajo" | "medio" | "alto",
  "potentialGain": "Ganancia potencial estimada",
  "actionData": { datos estructurados para implementar la recomendacion }
}

Criterios para type:
- "warning": Problema urgente que requiere atencion inmediata (CPL muy alto, CTR muy bajo)
- "optimization": Mejora que puede incrementar rendimiento
- "opportunity": Potencial sin explotar
- "insight": Observacion importante sin accion inmediata

Criterios para priority:
- "critical": Afecta significativamente el ROI (>20% del presupuesto en riesgo)
- "high": Mejora importante (10-20% mejora potencial)
- "medium": Mejora moderada (5-10% mejora potencial)
- "low": Mejora menor (<5% mejora potencial)

Responde SOLO con un JSON valido con esta estructura:
{
  "recommendations": [ array de recomendaciones, una por campana ]
}`;

    // Inicializar OpenAI si no está inicializado
    await this.initializeOpenAI();

    if (!this.openai) {
      throw new AppError("No se pudo inicializar el cliente de OpenAI", 500);
    }

    // Obtener modelo del provider o usar default que soporte JSON mode
    const model = this.provider?.settings?.defaultModel || "gpt-4o";

    // Modelos que soportan JSON mode
    const jsonModeModels = ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo-1106", "gpt-4-turbo-preview", "gpt-4-turbo"];
    const supportsJsonMode = jsonModeModels.some(m => model.includes(m));

    // 🔍 LOG: Request a OpenAI
    logger.info({
      model,
      campaignCount: campaigns.length,
      promptLength: prompt.length,
      supportsJsonMode
    }, '[CampaignRecommendation] Calling OpenAI API for recommendations');

    const completion = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "Eres un experto en publicidad digital y Meta Ads. Responde SOLO con JSON valido." },
        { role: "user", content: prompt }
      ],
      ...(supportsJsonMode && { response_format: { type: "json_object" } }),
      temperature: 0.3,
      max_tokens: 4000
    });

    const content = completion.choices[0].message.content;
    const tokensUsed = completion.usage?.total_tokens || 0;

    // 🔍 LOG: Response de OpenAI
    logger.info({
      tokensUsed,
      tokensPrompt: completion.usage?.prompt_tokens || 0,
      tokensCompletion: completion.usage?.completion_tokens || 0,
      model,
      responseLength: content?.length || 0
    }, '[CampaignRecommendation] OpenAI API response received');

    try {
      const parsed = JSON.parse(content || "{}");

      // 🔍 LOG: Recomendaciones generadas
      logger.info({
        recommendationsGenerated: parsed.recommendations?.length || 0,
        tokensUsed
      }, '[CampaignRecommendation] AI recommendations parsed successfully');

      // 🔍 LOG: Sample de recomendación
      if (parsed.recommendations && parsed.recommendations.length > 0) {
        logger.debug({
          sampleRecommendation: parsed.recommendations[0]
        }, '[CampaignRecommendation] Sample generated recommendation');
      }

      return {
        recommendations: parsed.recommendations || [],
        tokensUsed
      };
    } catch (error: any) {
      logger.error({
        error: error.message,
        rawContent: content?.substring(0, 500), // Primeros 500 caracteres
        contentLength: content?.length
      }, '[CampaignRecommendation] Error parsing OpenAI response');
      throw new AppError("Error procesando respuesta de IA", 500);
    }
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
