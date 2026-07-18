import logger from "../../utils/logger";
import AppError from "../../errors/AppError";
import ToolRegistry, { ToolContext, ToolDefinition, ToolResult } from "./ToolRegistry";
import * as MetaMarketingService from "../MetaMarketingService";

/**
 * MetaAdsToolset — Whitelist de herramientas que el agente "meta_ads_optimizer"
 * puede invocar via OpenAI function calling.
 *
 * Reglas de seguridad inmutables:
 *  - companyId, whatsappId y adAccountId vienen del CONTEXT (inyectado por
 *    MetaAdsAgentService desde req.user.companyId). NUNCA aceptamos esos
 *    valores desde los args del modelo: previene prompt-injection cross-tenant.
 *  - Tools tipo write se interceptan con dryRun en modo plan, ver ToolExecutor.
 *  - Whitelist estricta: si OpenAI alucina un tool fuera de la lista,
 *    ToolExecutor lo rechaza con "Herramienta no disponible".
 *
 * Las acciones bloqueadas explícitamente (delete_campaign, activate_*) NO
 * están registradas, así que el modelo NUNCA las puede invocar.
 */

const AGENT_TYPE = "meta_ads_optimizer";

const MAX_BUDGET_INCREASE_PERCENT = 20;
const ALLOWED_OBJECTIVES = [
  "OUTCOME_TRAFFIC",
  "OUTCOME_AWARENESS",
  "OUTCOME_ENGAGEMENT",
  "OUTCOME_LEADS",
  "OUTCOME_SALES",
  "OUTCOME_APP_PROMOTION"
];
const ALLOWED_DATE_PRESETS = [
  "today",
  "yesterday",
  "last_3d",
  "last_7d",
  "last_14d",
  "last_28d",
  "last_30d",
  "last_90d"
];

function requireContext(context: ToolContext): { companyId: number; whatsappId?: number } {
  if (!context || !context.companyId) {
    throw new AppError(
      "ERR_TOOL_CONTEXT_MISSING: companyId no presente en contexto.",
      500
    );
  }
  return { companyId: context.companyId, whatsappId: context.whatsappId };
}

// ============================================================================
// READ TOOLS — siempre se ejecutan, también en modo dryRun
// ============================================================================

const listCampaignsTool: ToolDefinition = {
  name: "list_campaigns",
  description:
    "Lista las campañas Meta Ads de la empresa con métricas básicas (impresiones, clics, gasto, CPL, CTR). Usa esto cuando el usuario pida ver, listar, comparar o analizar campañas. NO invoques campos como companyId/accessToken — el sistema los inyecta automáticamente.",
  parameters: {
    type: "object",
    properties: {
      status: {
        type: "string",
        description: "Filtrar por estado (ACTIVE, PAUSED, ARCHIVED). Si se omite, devuelve todas.",
        enum: ["ACTIVE", "PAUSED", "ARCHIVED", "DELETED"]
      },
      limit: {
        type: "string",
        description: "Máximo de campañas a devolver. Por defecto 25, máximo 100."
      },
      include_insights: {
        type: "string",
        description: "Si 'true' incluye métricas de los últimos 30 días. Default true."
      }
    },
    required: []
  },
  allowedAgents: [AGENT_TYPE],
  kind: "read",
  handler: async (args, context): Promise<ToolResult> => {
    const { companyId, whatsappId } = requireContext(context);
    const limit = Math.min(Number(args.limit) || 25, 100);
    const includeInsights = String(args.include_insights ?? "true") === "true";
    try {
      const campaigns = await MetaMarketingService.getCampaigns(
        companyId,
        {
          status: args.status,
          includeInsights
        } as any,
        whatsappId
      );
      const trimmed = campaigns.slice(0, limit);
      return {
        success: true,
        data: trimmed,
        message: `${trimmed.length} campañas encontradas (de ${campaigns.length} totales)`
      };
    } catch (e: any) {
      logger.error(`[MetaAdsToolset.list_campaigns] ${e.message}`);
      return {
        success: false,
        data: null,
        message: `No pude listar campañas: ${e.message}`
      };
    }
  }
};

const getCampaignInsightsTool: ToolDefinition = {
  name: "get_campaign_insights",
  description:
    "Obtiene insights detallados (gasto, impresiones, clics, conversiones, CPC, CPM, CTR) para una campaña específica o todas las campañas en un rango de tiempo. Útil para diagnósticos profundos.",
  parameters: {
    type: "object",
    properties: {
      campaign_id: {
        type: "string",
        description: "ID de la campaña Meta. Si se omite, agrega insights de toda la cuenta."
      },
      date_preset: {
        type: "string",
        description:
          "Rango temporal predefinido. Whitelist: today, yesterday, last_3d, last_7d, last_14d, last_28d, last_30d, last_90d.",
        enum: ALLOWED_DATE_PRESETS
      }
    },
    required: ["date_preset"]
  },
  allowedAgents: [AGENT_TYPE],
  kind: "read",
  handler: async (args, context): Promise<ToolResult> => {
    const { companyId, whatsappId } = requireContext(context);
    if (!ALLOWED_DATE_PRESETS.includes(args.date_preset)) {
      return {
        success: false,
        data: null,
        message: `date_preset inválido. Permitidos: ${ALLOWED_DATE_PRESETS.join(", ")}`
      };
    }
    try {
      const insights = await MetaMarketingService.getAggregatedInsights(
        companyId,
        {
          datePreset: args.date_preset,
          campaignId: args.campaign_id
        } as any,
        whatsappId
      );
      return {
        success: true,
        data: insights,
        message: `Insights ${args.date_preset}${args.campaign_id ? " para campaña " + args.campaign_id : " agregados de la cuenta"}`
      };
    } catch (e: any) {
      logger.error(`[MetaAdsToolset.get_campaign_insights] ${e.message}`);
      return { success: false, data: null, message: `No pude obtener insights: ${e.message}` };
    }
  }
};

const getAdsByCampaignTool: ToolDefinition = {
  name: "get_ads_by_campaign",
  description:
    "Lista los anuncios (creatividades) de una campaña específica con sus métricas. Usa cuando el usuario quiera ver qué creatividades están funcionando dentro de una campaña.",
  parameters: {
    type: "object",
    properties: {
      campaign_id: {
        type: "string",
        description: "ID de la campaña Meta cuyos anuncios queremos listar."
      }
    },
    required: ["campaign_id"]
  },
  allowedAgents: [AGENT_TYPE],
  kind: "read",
  handler: async (args, context): Promise<ToolResult> => {
    const { companyId, whatsappId } = requireContext(context);
    try {
      const ads = await MetaMarketingService.getAds(
        companyId,
        { campaignId: args.campaign_id, includeInsights: true } as any,
        whatsappId
      );
      return {
        success: true,
        data: ads,
        message: `${ads.length} anuncios en campaña ${args.campaign_id}`
      };
    } catch (e: any) {
      logger.error(`[MetaAdsToolset.get_ads_by_campaign] ${e.message}`);
      return { success: false, data: null, message: `No pude listar anuncios: ${e.message}` };
    }
  }
};

// ============================================================================
// WRITE TOOLS — en modo dryRun se interceptan como proposedAction
// ============================================================================

const pauseCampaignTool: ToolDefinition = {
  name: "pause_campaign",
  description:
    "Pausa una campaña Meta (status → PAUSED). Detiene gasto inmediatamente. Útil cuando el rendimiento es malo o se quiere optimizar antes de seguir.",
  parameters: {
    type: "object",
    properties: {
      campaign_id: {
        type: "string",
        description: "ID de la campaña Meta a pausar."
      },
      reason: {
        type: "string",
        description: "Motivo de la pausa (mostrado al usuario en la confirmación). Ej: 'CPL > $5 sin conversiones'."
      }
    },
    required: ["campaign_id", "reason"]
  },
  allowedAgents: [AGENT_TYPE],
  kind: "write",
  handler: async (args, context): Promise<ToolResult> => {
    const { companyId, whatsappId } = requireContext(context);
    try {
      await MetaMarketingService.pauseAllInCampaign(
        companyId,
        String(args.campaign_id),
        whatsappId
      );
      return {
        success: true,
        data: { campaignId: args.campaign_id, action: "paused" },
        message: `Campaña ${args.campaign_id} pausada`
      };
    } catch (e: any) {
      logger.error(`[MetaAdsToolset.pause_campaign] ${e.message}`);
      return { success: false, data: null, message: `No pude pausar: ${e.message}` };
    }
  }
};

const updateCampaignBudgetTool: ToolDefinition = {
  name: "update_campaign_budget",
  description:
    "Actualiza el daily_budget de una campaña Meta. RESTRICCIÓN: el delta absoluto no puede ser mayor a +20% del presupuesto actual (guardrail del sistema). Para reducir presupuesto no hay restricción de delta.",
  parameters: {
    type: "object",
    properties: {
      campaign_id: {
        type: "string",
        description: "ID de la campaña Meta."
      },
      new_daily_budget_cents: {
        type: "string",
        description:
          "Nuevo presupuesto diario en céntimos de la moneda de la cuenta (ej: 500000 = $5000.00). NO en moneda local."
      },
      reason: {
        type: "string",
        description: "Motivo del cambio de presupuesto."
      }
    },
    required: ["campaign_id", "new_daily_budget_cents", "reason"]
  },
  allowedAgents: [AGENT_TYPE],
  kind: "write",
  handler: async (args, context): Promise<ToolResult> => {
    const { companyId, whatsappId } = requireContext(context);
    const newBudget = Number(args.new_daily_budget_cents);
    if (!Number.isFinite(newBudget) || newBudget <= 0) {
      return {
        success: false,
        data: null,
        message: "new_daily_budget_cents debe ser un entero positivo en céntimos."
      };
    }
    try {
      // Verificar el budget actual y aplicar guardrail +20%
      let currentBudget = 0;
      try {
        const current = await MetaMarketingService.getCampaignById(
          companyId,
          String(args.campaign_id),
          undefined,
          whatsappId
        );
        currentBudget = Number(current?.daily_budget) || 0;
      } catch (probeErr: any) {
        logger.warn(
          `[update_campaign_budget] No pude leer budget actual de ${args.campaign_id}: ${probeErr.message}. Aplicando guardrail conservador.`
        );
      }
      if (currentBudget > 0) {
        const maxAllowed = Math.floor(currentBudget * (1 + MAX_BUDGET_INCREASE_PERCENT / 100));
        if (newBudget > maxAllowed) {
          return {
            success: false,
            data: { currentBudget, maxAllowed, requested: newBudget },
            message: `BUDGET_LIMIT_EXCEEDED: el nuevo presupuesto ${newBudget} supera el máximo permitido ${maxAllowed} (actual ${currentBudget} + ${MAX_BUDGET_INCREASE_PERCENT}%).`
          };
        }
      }
      const updated = await MetaMarketingService.updateCampaign(
        companyId,
        String(args.campaign_id),
        { daily_budget: newBudget },
        whatsappId
      );
      return {
        success: true,
        data: updated,
        message: `Presupuesto actualizado en campaña ${args.campaign_id}: ${newBudget}`
      };
    } catch (e: any) {
      logger.error(`[MetaAdsToolset.update_campaign_budget] ${e.message}`);
      return { success: false, data: null, message: `No pude actualizar presupuesto: ${e.message}` };
    }
  }
};

const duplicateCampaignTool: ToolDefinition = {
  name: "duplicate_campaign",
  description:
    "Duplica una campaña Meta. La copia siempre queda en status PAUSED, sin importar el estado original (el usuario la activará manualmente tras revisarla).",
  parameters: {
    type: "object",
    properties: {
      campaign_id: {
        type: "string",
        description: "ID de la campaña a duplicar."
      },
      new_name: {
        type: "string",
        description: "Nombre de la nueva campaña duplicada (se sugiere agregar sufijo identificativo)."
      },
      reason: {
        type: "string",
        description: "Motivo de la duplicación."
      }
    },
    required: ["campaign_id", "new_name", "reason"]
  },
  allowedAgents: [AGENT_TYPE],
  kind: "write",
  handler: async (args, context): Promise<ToolResult> => {
    const { companyId, whatsappId } = requireContext(context);
    try {
      const dup = await MetaMarketingService.duplicateCampaign(
        companyId,
        String(args.campaign_id),
        String(args.new_name),
        whatsappId
      );
      // Forzar PAUSED por seguridad
      if (dup?.id) {
        try {
          await MetaMarketingService.updateCampaign(
            companyId,
            String(dup.id),
            { status: "PAUSED" },
            whatsappId
          );
        } catch (e: any) {
          logger.warn(`[duplicate_campaign] No pude forzar PAUSED en ${dup.id}: ${e.message}`);
        }
      }
      return {
        success: true,
        data: dup,
        message: `Campaña duplicada como "${args.new_name}" (estado PAUSED)`
      };
    } catch (e: any) {
      logger.error(`[MetaAdsToolset.duplicate_campaign] ${e.message}`);
      return { success: false, data: null, message: `No pude duplicar: ${e.message}` };
    }
  }
};

const createCampaignPausedTool: ToolDefinition = {
  name: "create_campaign_paused",
  description:
    "Crea una nueva campaña Meta SIEMPRE en estado PAUSED (el usuario la activa manualmente tras revisarla). Solo se permiten objetivos del whitelist del sistema.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Nombre de la nueva campaña."
      },
      objective: {
        type: "string",
        description:
          "Objetivo Meta. Whitelist: OUTCOME_TRAFFIC, OUTCOME_AWARENESS, OUTCOME_ENGAGEMENT, OUTCOME_LEADS, OUTCOME_SALES, OUTCOME_APP_PROMOTION.",
        enum: ALLOWED_OBJECTIVES
      },
      daily_budget_cents: {
        type: "string",
        description: "Presupuesto diario inicial en céntimos."
      },
      reason: {
        type: "string",
        description: "Motivo de la creación."
      }
    },
    required: ["name", "objective", "daily_budget_cents", "reason"]
  },
  allowedAgents: [AGENT_TYPE],
  kind: "write",
  handler: async (args, context): Promise<ToolResult> => {
    const { companyId, whatsappId } = requireContext(context);
    if (!ALLOWED_OBJECTIVES.includes(args.objective)) {
      return {
        success: false,
        data: null,
        message: `Objetivo "${args.objective}" no permitido. Whitelist: ${ALLOWED_OBJECTIVES.join(", ")}`
      };
    }
    const dailyBudget = Number(args.daily_budget_cents);
    if (!Number.isFinite(dailyBudget) || dailyBudget <= 0) {
      return {
        success: false,
        data: null,
        message: "daily_budget_cents debe ser un entero positivo."
      };
    }
    try {
      const created = await MetaMarketingService.createCampaign(
        companyId,
        {
          name: String(args.name),
          objective: String(args.objective),
          status: "PAUSED",
          daily_budget: dailyBudget,
          special_ad_categories: []
        },
        whatsappId
      );
      return {
        success: true,
        data: created,
        message: `Campaña "${args.name}" creada en PAUSED (id ${created?.id})`
      };
    } catch (e: any) {
      logger.error(`[MetaAdsToolset.create_campaign_paused] ${e.message}`);
      return { success: false, data: null, message: `No pude crear campaña: ${e.message}` };
    }
  }
};

// ============================================================================
// REGISTRO IDEMPOTENTE
// ============================================================================

let registered = false;

export function registerMetaAdsTools(): void {
  if (registered) return;
  ToolRegistry.registerTool(listCampaignsTool);
  ToolRegistry.registerTool(getCampaignInsightsTool);
  ToolRegistry.registerTool(getAdsByCampaignTool);
  ToolRegistry.registerTool(pauseCampaignTool);
  ToolRegistry.registerTool(updateCampaignBudgetTool);
  ToolRegistry.registerTool(duplicateCampaignTool);
  ToolRegistry.registerTool(createCampaignPausedTool);
  registered = true;
  logger.info(`[MetaAdsToolset] ✅ 7 herramientas registradas para agente '${AGENT_TYPE}'`);
}

export const META_ADS_TOOL_NAMES = [
  "list_campaigns",
  "get_campaign_insights",
  "get_ads_by_campaign",
  "pause_campaign",
  "update_campaign_budget",
  "duplicate_campaign",
  "create_campaign_paused"
] as const;

export type MetaAdsToolName = (typeof META_ADS_TOOL_NAMES)[number];

export const META_ADS_AGENT_TYPE = AGENT_TYPE;
