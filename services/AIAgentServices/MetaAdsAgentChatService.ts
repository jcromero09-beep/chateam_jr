import { Op } from "sequelize";
import logger from "../../utils/logger";
import AppError from "../../errors/AppError";
import AIAgentConfig from "../../models/AIAgentConfig";
import * as AIClientService from "../AIClientService";
import * as MetaMarketingService from "../MetaMarketingService";
import MetaAdsAgentService from "./MetaAdsAgentService";
import MetaOfficialMCPClient from "./MetaOfficialMCPClientService";

// ============================================================================
// PROVIDER ROUTING
// ============================================================================

export type AgentProvider = "meta_official_mcp" | "meta_graph_internal";

/**
 * Heurística para detectar provider explícito en el texto del usuario.
 * Si no detecta nada, devuelve null (caller decide default).
 */
function detectProviderFromText(text: string): AgentProvider | null {
  const t = (text || "").toLowerCase();
  if (
    t.includes("mcp oficial") ||
    t.includes("mcp.facebook.com/ads") ||
    t.includes("mcp.facebook") ||
    t.includes("connector de meta") ||
    t.includes("conector de meta") ||
    t.includes("conectar mcp") ||
    t.includes("usar mcp") ||
    t.includes("via mcp") ||
    t.includes("vía mcp")
  ) {
    return "meta_official_mcp";
  }
  if (
    t.includes("adaptador interno") ||
    t.includes("usa graph api") ||
    t.includes("usar graph api") ||
    t.includes("graph api") ||
    t.includes("integracion actual") ||
    t.includes("integración actual")
  ) {
    return "meta_graph_internal";
  }
  return null;
}

async function ensureMcpOfficialReady(companyId: number): Promise<void> {
  const ok = await MetaOfficialMCPClient.isReallyConnected(companyId);
  if (!ok) {
    logger.warn(
      { code: "MCP_OFFICIAL_TOOLS_LIST_FAILED", companyId },
      "[MetaAdsAgentChatService] Provider meta_official_mcp solicitado pero MCP no está conectado"
    );
    throw new AppError(
      "MCP_OFFICIAL_NOT_CONNECTED: MCP oficial de Meta no está conectado todavía. " +
        "El adaptador interno Graph API sí está disponible, pero es otro camino. " +
        "Conéctate primero desde POST /meta-marketing/agent/mcp/connect.",
      409
    );
  }
}

type ChatIntent =
  | "list_campaigns"
  | "campaign_report"
  | "campaign_recommendation"
  | "create_modification_plan"
  | "execute_existing_plan"
  | "general_question";

interface EnrichedRequest {
  intent: ChatIntent;
  entities: {
    campaignName?: string;
    campaignId?: string;
    status?: "ACTIVE" | "PAUSED" | "ARCHIVED" | "ALL";
    datePreset?: "today" | "yesterday" | "last_7d" | "last_30d" | "last_90d";
    metrics?: string[];
    action?: string;
    amount?: number;
  };
  dataNeeds: string[];
  safety: {
    readOnly: boolean;
    requiresConfirmation: boolean;
    riskLevel: "low" | "medium" | "high";
  };
  userFacingTask: string;
}

interface ChatRequest {
  companyId: number;
  userId: number;
  message: string;
  whatsappId?: number;
  lastPlanId?: number;
  /**
   * Provider solicitado explícitamente por el caller.
   * - "meta_official_mcp" → SOLO usa el MCP oficial; si no hay conexión real, lanza error.
   * - "meta_graph_internal" → usa el adaptador interno (MetaMarketingService).
   * - undefined → si el mensaje del usuario menciona "MCP oficial" enruta allí; sino, internal.
   */
  requestedProvider?: AgentProvider;
}

interface ChatResponse {
  type: "answer" | "plan" | "clarification";
  message: string;
  enrichment: EnrichedRequest;
  data?: Record<string, unknown>;
  plan?: unknown;
  model: string;
  /**
   * Provider del LLM (openai, anthropic, etc). Para datos del backend, ver `dataProvider`.
   */
  provider: string;
  /**
   * Provider efectivo usado para resolver datos / acciones de Meta.
   * "meta_official_mcp" o "meta_graph_internal".
   */
  dataProvider: AgentProvider;
}

async function getAgentConfig(): Promise<AIAgentConfig> {
  const agent = await AIAgentConfig.findOne({
    where: {
      slug: "meta-ads-optimizer",
      isActive: true,
      [Op.or]: [{ companyId: null as any }, { companyId: { [Op.is]: null } }] as any
    },
    order: [["companyId", "DESC"]]
  });

  if (!agent) {
    throw new AppError("ERR_AGENT_NOT_FOUND: agente meta-ads-optimizer no instalado o inactivo.", 500);
  }

  return agent;
}

function stripJsonFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function safeParseEnrichment(raw: string): EnrichedRequest {
  try {
    const parsed = JSON.parse(stripJsonFences(raw));
    return {
      intent: parsed.intent || "general_question",
      entities: parsed.entities || {},
      dataNeeds: Array.isArray(parsed.dataNeeds) ? parsed.dataNeeds : [],
      safety: {
        readOnly: parsed.safety?.readOnly !== false,
        requiresConfirmation: !!parsed.safety?.requiresConfirmation,
        riskLevel: parsed.safety?.riskLevel || "low"
      },
      userFacingTask: parsed.userFacingTask || "Responder la solicitud del usuario."
    };
  } catch {
    return {
      intent: "general_question",
      entities: {},
      dataNeeds: [],
      safety: { readOnly: true, requiresConfirmation: false, riskLevel: "low" },
      userFacingTask: "Responder la solicitud del usuario."
    };
  }
}

async function enrichRequest(params: {
  agent: AIAgentConfig;
  companyId: number;
  message: string;
}): Promise<{ enrichment: EnrichedRequest; model: string; provider: string }> {
  const result = await AIClientService.chatCompletion({
    companyId: params.companyId,
    model: params.agent.modelKey,
    temperature: 0,
    maxTokens: 900,
    module: "classification",
    messages: [
      {
        role: "system",
        content:
          "Eres un enriquecedor de solicitudes para un agente Meta Ads. No respondas al usuario. " +
          "Devuelve SOLO JSON valido, sin markdown. Clasifica la intencion, extrae entidades y marca seguridad. " +
          "Nunca incluyas access tokens, companyId ni adAccountId en entities."
      },
      {
        role: "user",
        content:
          `Solicitud: ${params.message}\n\n` +
          `Schema esperado:\n` +
          `{"intent":"list_campaigns|campaign_report|campaign_recommendation|create_modification_plan|execute_existing_plan|general_question",` +
          `"entities":{"campaignName":"string opcional","campaignId":"string opcional","status":"ACTIVE|PAUSED|ARCHIVED|ALL","datePreset":"today|yesterday|last_7d|last_30d|last_90d","metrics":["spend","ctr"],"action":"string opcional","amount":10},` +
          `"dataNeeds":["list_campaigns","campaign_insights","ads_by_campaign"],` +
          `"safety":{"readOnly":true,"requiresConfirmation":false,"riskLevel":"low|medium|high"},` +
          `"userFacingTask":"descripcion breve"}`
      }
    ]
  });

  return {
    enrichment: safeParseEnrichment(result.content),
    model: result.model,
    provider: result.provider
  };
}

function normalizeStatus(status?: string): string[] | undefined {
  if (!status || status === "ALL") return undefined;
  return [status];
}

function findCampaign(campaigns: any[], enrichment: EnrichedRequest) {
  const campaignId = enrichment.entities.campaignId?.trim();
  if (campaignId) {
    const byId = campaigns.find((c) => String(c.id) === campaignId);
    if (byId) return byId;
  }

  const name = enrichment.entities.campaignName?.trim().toLowerCase();
  if (!name) return null;

  return (
    campaigns.find((c) => String(c.name || "").toLowerCase() === name) ||
    campaigns.find((c) => String(c.name || "").toLowerCase().includes(name)) ||
    null
  );
}

async function collectData(params: {
  companyId: number;
  whatsappId?: number;
  enrichment: EnrichedRequest;
}) {
  const { companyId, whatsappId, enrichment } = params;

  const campaigns = await MetaMarketingService.getCampaigns(
    companyId,
    {
      status: normalizeStatus(enrichment.entities.status),
      includeInsights: true
    } as any,
    whatsappId
  );

  if (enrichment.intent === "list_campaigns") {
    return { campaigns: campaigns.slice(0, 30), count: campaigns.length };
  }

  if (
    enrichment.intent === "campaign_report" ||
    enrichment.intent === "campaign_recommendation"
  ) {
    const selectedCampaign = findCampaign(campaigns, enrichment);
    return {
      selectedCampaign,
      candidateCampaigns: selectedCampaign
        ? []
        : campaigns.slice(0, 10).map((c: any) => ({ id: c.id, name: c.name, status: c.status || c.effective_status })),
      campaignsCount: campaigns.length
    };
  }

  return { campaigns: campaigns.slice(0, 10), count: campaigns.length };
}

async function composeAnswer(params: {
  agent: AIAgentConfig;
  companyId: number;
  userMessage: string;
  enrichment: EnrichedRequest;
  data: Record<string, unknown>;
}): Promise<{ message: string; model: string; provider: string }> {
  const result = await AIClientService.chatCompletion({
    companyId: params.companyId,
    model: params.agent.modelKey,
    temperature: Number(params.agent.temperature ?? 0.4),
    maxTokens: Number(params.agent.maxTokens ?? 1200),
    module: "chat",
    messages: [
      {
        role: "system",
        content:
          params.agent.systemPrompt +
          "\n\nModo chat informativo: responde solo con base en los datos reales entregados por el backend. " +
          "Si falta un dato, dilo claramente. No inventes metricas, IDs, nombres de campana ni resultados. " +
          "No propongas ejecucion directa; si hay acciones, deben ser planificadas y confirmadas."
      },
      {
        role: "user",
        content:
          `Pregunta original: ${params.userMessage}\n\n` +
          `Solicitud enriquecida: ${JSON.stringify(params.enrichment)}\n\n` +
          `Datos reales disponibles: ${JSON.stringify(params.data).slice(0, 30000)}`
      }
    ]
  });

  return { message: result.content, model: result.model, provider: result.provider };
}

// ============================================================================
// MCP OFICIAL — recolección de datos vía tools/list + tools/call REAL
// ============================================================================

async function collectDataViaMcpOfficial(params: {
  companyId: number;
  enrichment: EnrichedRequest;
}): Promise<Record<string, unknown>> {
  const { companyId, enrichment } = params;
  // Pedimos tools/list para conocer las capacidades reales del servidor MCP.
  const tools = await MetaOfficialMCPClient.listTools(companyId);
  const toolNames = (tools || []).map((t: any) => t?.name).filter(Boolean);

  logger.info(
    { code: "MCP_OFFICIAL_TOOLS_LIST_OK", companyId, toolCount: toolNames.length },
    `[MetaAdsAgentChatService] tools disponibles del MCP oficial: ${toolNames.join(", ")}`
  );

  // Estrategia conservadora V1: NO inventamos nombres de tools. Devolvemos
  // el listado al modelo y le decimos que solo cite lo que recibió.
  // Cuando el usuario pida una acción concreta vía MCP oficial, el modelo
  // tendrá que pedir explícitamente con tools/call (que va por endpoint dedicado).
  return {
    via: "meta_official_mcp",
    intent: enrichment.intent,
    availableTools: tools,
    toolNames
  };
}

export async function chat(params: ChatRequest): Promise<ChatResponse> {
  if (!params.message || !params.message.trim()) {
    throw new AppError("ERR_MESSAGE_REQUIRED", 400);
  }

  // 1) Resolver provider efectivo
  const explicit = params.requestedProvider || detectProviderFromText(params.message);
  const effectiveProvider: AgentProvider = explicit || "meta_graph_internal";

  // 2) Si pide MCP oficial, NO se permite fallback automático
  if (effectiveProvider === "meta_official_mcp") {
    await ensureMcpOfficialReady(params.companyId);
  } else {
    logger.info(
      { code: "GRAPH_INTERNAL_USED", companyId: params.companyId, explicit: !!explicit },
      "[MetaAdsAgentChatService] Provider efectivo: meta_graph_internal"
    );
  }

  const agent = await getAgentConfig();
  const { enrichment, model, provider } = await enrichRequest({
    agent,
    companyId: params.companyId,
    message: params.message.trim()
  });

  // 3) Modificaciones / planes — siempre van por el agente interno (single-tenant
  //    con guardrails, audit, créditos). Si el usuario pidió MCP oficial,
  //    informamos que la creación de plan se hará igual con el agente interno
  //    pero la EJECUCIÓN puede usar el MCP oficial vía /agent/mcp/tools/call.
  if (!enrichment.safety.readOnly || enrichment.intent === "create_modification_plan") {
    if (effectiveProvider === "meta_official_mcp") {
      // El MCP oficial NO se usa para "planes" (eso es lógica nuestra).
      // Pero como pidió MCP oficial, le devolvemos guía clara.
      return {
        type: "clarification",
        message:
          "Pediste el MCP oficial de Meta. Las acciones reales contra el MCP oficial " +
          "se ejecutan vía POST /meta-marketing/agent/mcp/tools/call con el nombre exacto " +
          "de la tool del servidor. La construcción de planes con guardrails y cobro de créditos " +
          "vive en el adaptador interno (provider meta_graph_internal). Indícame por cuál camino quieres seguir.",
        enrichment,
        model,
        provider,
        dataProvider: effectiveProvider
      };
    }
    const plan = await MetaAdsAgentService.planAction({
      companyId: params.companyId,
      userId: params.userId,
      prompt: params.message.trim(),
      whatsappId: params.whatsappId
    });
    return {
      type: "plan",
      message: plan.summary || "Prepare un plan para que lo revises antes de ejecutar.",
      enrichment,
      plan,
      model,
      provider,
      dataProvider: "meta_graph_internal"
    };
  }

  if (enrichment.intent === "execute_existing_plan") {
    return {
      type: "clarification",
      message:
        "Para ejecutar cambios necesito que selecciones y confirmes un plan pendiente. " +
        "No ejecuto acciones directamente desde el chat.",
      enrichment,
      model,
      provider,
      dataProvider: effectiveProvider
    };
  }

  // 4) Recolección de datos según provider efectivo
  let data: Record<string, unknown>;
  if (effectiveProvider === "meta_official_mcp") {
    data = await collectDataViaMcpOfficial({
      companyId: params.companyId,
      enrichment
    });
  } else {
    data = (await collectData({
      companyId: params.companyId,
      whatsappId: params.whatsappId,
      enrichment
    })) as Record<string, unknown>;
  }

  const composed = await composeAnswer({
    agent,
    companyId: params.companyId,
    userMessage: params.message.trim(),
    enrichment,
    data
  });

  return {
    type: "answer",
    message: composed.message,
    enrichment,
    data,
    model: composed.model,
    provider: composed.provider,
    dataProvider: effectiveProvider
  };
}

export default { chat };
