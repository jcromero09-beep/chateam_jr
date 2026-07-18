import crypto from "crypto";
import { Op, Transaction } from "sequelize";
import logger from "../../utils/logger";
import AppError from "../../errors/AppError";
import sequelize from "../../database/index";
import * as AIClientService from "../AIClientService";
import ToolRegistry, { ToolContext } from "./ToolRegistry";
import ToolExecutor from "./ToolExecutor";
import {
  registerMetaAdsTools,
  META_ADS_AGENT_TYPE,
  META_ADS_TOOL_NAMES
} from "./MetaAdsToolset";
import AIAgentConfig from "../../models/AIAgentConfig";
import MetaAgentPlan, { ProposedAction, MetaAgentPlanStatus } from "../../models/MetaAgentPlan";
import MetaAgentActionLog from "../../models/MetaAgentActionLog";
import Whatsapp from "../../models/Whatsapp";
import * as MetaMarketingService from "../MetaMarketingService";
import {
  chargeAgentExecution,
  chargeCampaignAnalysis
} from "../AICreditServices/AIUsagePricingService";

/**
 * MetaAdsAgentService — Orquestador del agente "meta_ads_optimizer".
 *
 * Modo plan:
 *  1. Resuelve credenciales Meta vía MetaMarketingService.getCompanyMetaConfig
 *     (filtra siempre por companyId; defensa multi-tenant ya implementada).
 *  2. Cobra `campaign_analysis` fail-closed (no llama OpenAI sin créditos).
 *  3. Llama OpenAI con tools en modo dryRun: las tools 'write' se interceptan
 *     y se acumulan como proposedActions[]. Las 'read' se ejecutan.
 *  4. Persiste MetaAgentPlan con snapshot de credenciales + proposedActions.
 *
 * Modo execute:
 *  1. Carga el plan con LOCK.UPDATE (anti-doble-click).
 *  2. Re-resuelve credenciales y compara contra snapshot → STALE_CREDENTIALS si cambiaron.
 *  3. Re-aplica guardrails y ejecuta las acciones via MetaMarketingService.
 *  4. Cobra `agent_execution` por la totalidad ejecutada.
 *  5. Marca plan executed/partial.
 *
 * Multi-tenancy: companyId siempre desde req.user (controller). Si llega whatsappId,
 * MetaMarketingService valida ownership (Whatsapp.findOne({id, companyId})).
 */

// Asegurar registro idempotente al cargar el módulo
registerMetaAdsTools();

const PLAN_TTL_MINUTES = 15;
const MAX_AGENT_ITERATIONS = 4; // hard limit para evitar loops infinitos
const MAX_ACTIONS_PER_PLAN = 5;
const FEATURE_FLAG_ENV = "META_AGENT_EXECUTE_ENABLED";

export interface PlanRequest {
  companyId: number;
  userId: number;
  prompt: string;
  whatsappId?: number;
}

export interface PlanResponse {
  planId: number;
  summary: string;
  proposedActions: ProposedAction[];
  requiresConfirmation: boolean;
  expiresAt: string;
  account: {
    adAccountId: string | null;
    whatsappId: number | null;
    whatsappName: string | null;
    mode: string | null;
  };
}

export interface ExecuteRequest {
  companyId: number;
  userId: number;
  planId: number;
  confirmActionIds?: string[]; // Si se omite, ejecuta todas las acciones del plan
}

export interface ExecuteResponse {
  planId: number;
  status: MetaAgentPlanStatus;
  alreadyExecuted: boolean;
  executedActions: Array<{
    id: string;
    action: string;
    success: boolean;
    errorMessage?: string;
  }>;
  skippedActions: string[];
}

// ============================================================================
// PLAN ACTION
// ============================================================================

export async function planAction(req: PlanRequest): Promise<PlanResponse> {
  const { companyId, userId, prompt, whatsappId } = req;

  if (!prompt || prompt.trim().length === 0) {
    throw new AppError("ERR_PROMPT_REQUIRED: el prompt no puede estar vacío.", 400);
  }
  if (prompt.length > 4000) {
    throw new AppError("ERR_PROMPT_TOO_LONG: máximo 4000 caracteres.", 400);
  }

  // 1. Resolver credenciales Meta — filtra companyId, lanza AppError si no hay config
  let metaConfig: { token: string; accountId: string; mode: string };
  try {
    metaConfig = await MetaMarketingService.getCompanyMetaConfig(companyId, whatsappId);
  } catch (e: any) {
    logger.error(`[MetaAdsAgent.plan] No hay config Meta para company ${companyId}: ${e.message}`);
    throw new AppError(
      "ERR_META_NOT_CONFIGURED: la empresa no tiene credenciales Meta. Conecta primero desde Coexistencia o Configuración.",
      412
    );
  }

  // 2. Cobrar análisis (fail-closed — no llama OpenAI si no hay créditos)
  await chargeCampaignAnalysis({
    companyId,
    userId,
    source: "meta_ads_agent_plan",
    units: 1,
    sourceId: `meta_agent_plan_pending`,
    metadata: { prompt: prompt.substring(0, 200), whatsappId }
  });

  // 3. Cargar agente
  const agentConfig = await AIAgentConfig.findOne({
    where: { slug: "meta-ads-optimizer", isActive: true }
  });
  if (!agentConfig) {
    throw new AppError("ERR_AGENT_NOT_FOUND: agente meta-ads-optimizer no instalado o inactivo.", 500);
  }

  // 4. Construir tools whitelist (formato OpenAI)
  const tools = META_ADS_TOOL_NAMES
    .map((name) => ToolRegistry.getTool(name))
    .filter((t): t is NonNullable<typeof t> => !!t)
    .map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));

  // 5. Resolver datos del Whatsapp (si aplica) para mostrar al usuario
  let whatsappName: string | null = null;
  if (whatsappId) {
    const wa = await Whatsapp.findOne({
      where: { id: whatsappId, companyId },
      attributes: ["id", "name"]
    });
    whatsappName = wa?.name || null;
  }

  const resolvedAdAccountId = metaConfig.accountId;
  const resolvedMode: "whatsapp" | "company_settings" = whatsappId ? "whatsapp" : "company_settings";

  // 6. Loop de orquestación: read tools se ejecutan, write se capturan como proposedActions
  const messages: Array<any> = [
    {
      role: "system",
      content:
        agentConfig.systemPrompt +
        `\n\nContexto inyectado por el sistema (NUNCA solicites estos datos al usuario):` +
        `\n- Cuenta Meta Ads: act_${resolvedAdAccountId}` +
        (whatsappName ? `\n- Conexión WhatsApp asociada: "${whatsappName}" (id ${whatsappId})` : "") +
        `\n\nReglas del modo plan:` +
        `\n- Las tools de escritura (pause_*, update_*, duplicate_*, create_*) NO se ejecutan ahora; el sistema las captura como propuesta. El usuario las confirma después.` +
        `\n- Devuelve un summary final claro de lo que recomiendas y por qué. Cita números reales de las tools de lectura.` +
        `\n- Máximo ${MAX_ACTIONS_PER_PLAN} acciones por plan.`
    },
    { role: "user", content: prompt }
  ];

  const toolContext: ToolContext = {
    companyId,
    userId,
    whatsappId,
    adAccountId: resolvedAdAccountId,
    metaWhatsappName: whatsappName || undefined
  };

  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let modelUsed = agentConfig.modelKey;
  const proposedActions: ProposedAction[] = [];
  const seenWriteCallIds = new Set<string>();
  let summary = "";

  for (let iter = 0; iter < MAX_AGENT_ITERATIONS; iter += 1) {
    const llmResponse = await AIClientService.chatCompletionWithTools({
      messages,
      model: agentConfig.modelKey || "gpt-5.5",
      maxTokens: agentConfig.maxTokens || 1500,
      temperature: Number(agentConfig.temperature) || 0.2,
      companyId,
      module: "chat",
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? "auto" : undefined
    });

    totalTokensIn += llmResponse.usage?.prompt_tokens || llmResponse.usage?.input_tokens || 0;
    totalTokensOut += llmResponse.usage?.completion_tokens || llmResponse.usage?.output_tokens || 0;
    modelUsed = llmResponse.model || modelUsed;

    if (!llmResponse.toolCalls || llmResponse.toolCalls.length === 0) {
      summary = llmResponse.content?.trim() || "";
      break;
    }

    // Ejecutar tools en modo dryRun (writes se interceptan)
    const toolResults = await ToolExecutor.executeToolCalls(
      llmResponse.toolCalls,
      toolContext,
      META_ADS_AGENT_TYPE,
      { dryRun: true }
    );

    // Capturar acciones propuestas
    for (const r of toolResults) {
      const data: any = r.result?.data;
      if (data && data.proposedOnly === true) {
        if (proposedActions.length >= MAX_ACTIONS_PER_PLAN) {
          logger.warn(
            `[MetaAdsAgent.plan] Límite de ${MAX_ACTIONS_PER_PLAN} acciones alcanzado, ignorando propuestas extra`
          );
          break;
        }
        if (seenWriteCallIds.has(r.toolCallId)) continue;
        seenWriteCallIds.add(r.toolCallId);
        proposedActions.push({
          id: crypto.randomUUID(),
          action: data.action,
          params: data.params || {},
          reason: (data.params && data.params.reason) || "(sin motivo explícito)",
          riskLevel: inferRiskLevel(data.action, data.params),
          estimatedImpact: undefined
        });
      }
    }

    // Append toolCalls + tool results al historial para que el modelo termine el flujo
    messages.push({
      role: "assistant",
      content: llmResponse.content || null,
      tool_calls: llmResponse.toolCalls
    });
    for (const r of toolResults) {
      messages.push({
        role: "tool",
        tool_call_id: r.toolCallId,
        content: JSON.stringify({
          success: r.result.success,
          data: r.result.data,
          message: r.result.message
        })
      });
    }
  }

  if (!summary) {
    summary =
      proposedActions.length > 0
        ? `Plan generado con ${proposedActions.length} acciones propuestas. Revisa y confirma para ejecutar.`
        : "El agente no propuso acciones. Revisa el prompt o pide más contexto.";
  }

  // 7. Persistir plan
  const expiresAt = new Date(Date.now() + PLAN_TTL_MINUTES * 60 * 1000);
  const plan = await MetaAgentPlan.create({
    companyId,
    userId,
    whatsappId: whatsappId || null,
    resolvedAdAccountId,
    resolvedMode,
    prompt,
    summary,
    proposedActions,
    status: "pending",
    expiresAt,
    openaiUsage: {
      promptTokens: totalTokensIn,
      completionTokens: totalTokensOut,
      totalTokens: totalTokensIn + totalTokensOut,
      model: modelUsed
    }
  } as any);

  return {
    planId: plan.id,
    summary,
    proposedActions,
    requiresConfirmation: proposedActions.length > 0,
    expiresAt: plan.expiresAt.toISOString(),
    account: {
      adAccountId: `act_${resolvedAdAccountId}`,
      whatsappId: whatsappId || null,
      whatsappName,
      mode: resolvedMode
    }
  };
}

// ============================================================================
// EXECUTE PLAN
// ============================================================================

export async function executePlan(req: ExecuteRequest): Promise<ExecuteResponse> {
  const { companyId, userId, planId, confirmActionIds } = req;

  // Feature flag — bloquea execute en producción hasta que la limpieza de seguridad termine
  if (process.env[FEATURE_FLAG_ENV] !== "true") {
    throw new AppError(
      `ERR_META_AGENT_EXECUTE_DISABLED: el modo execute está deshabilitado por configuración (${FEATURE_FLAG_ENV}=false).`,
      503
    );
  }

  if (!planId || planId <= 0) {
    throw new AppError("ERR_INVALID_PLAN_ID", 400);
  }

  const result = await sequelize.transaction(async (t: Transaction) => {
    const plan = await MetaAgentPlan.findOne({
      where: { id: planId, companyId },
      lock: t.LOCK.UPDATE,
      transaction: t
    });

    if (!plan) {
      throw new AppError("ERR_PLAN_NOT_FOUND", 404);
    }

    // Idempotencia
    if (plan.status === "executed" || plan.status === "partial") {
      const logs = await MetaAgentActionLog.findAll({
        where: { planId: plan.id, companyId },
        attributes: ["action", "success", "errorMessage", "params"],
        transaction: t
      });
      return {
        planId: plan.id,
        status: plan.status,
        alreadyExecuted: true,
        executedActions: logs.map((l) => ({
          id: ((l.params as any)?.__planActionId as string) || "",
          action: l.action,
          success: l.success,
          errorMessage: l.errorMessage || undefined
        })),
        skippedActions: []
      } as ExecuteResponse;
    }

    if (plan.status === "expired" || plan.status === "rejected") {
      throw new AppError(`ERR_PLAN_${plan.status.toUpperCase()}`, 422);
    }

    if (plan.expiresAt.getTime() < Date.now()) {
      plan.status = "expired";
      await plan.save({ transaction: t });
      throw new AppError("ERR_PLAN_EXPIRED", 422);
    }

    // Re-resolver credenciales y comparar con snapshot
    let currentConfig: { accountId: string };
    try {
      currentConfig = await MetaMarketingService.getCompanyMetaConfig(companyId, plan.whatsappId || undefined);
    } catch (e: any) {
      throw new AppError(`ERR_META_NOT_CONFIGURED: ${e.message}`, 412);
    }
    if (plan.resolvedAdAccountId && plan.resolvedAdAccountId !== currentConfig.accountId) {
      throw new AppError(
        `ERR_STALE_CREDENTIALS: las credenciales Meta cambiaron entre plan y execute (snapshot=${plan.resolvedAdAccountId}, actual=${currentConfig.accountId}). Genera un plan nuevo.`,
        409
      );
    }

    // Filtrar acciones a ejecutar
    const proposedActions = (plan.proposedActions || []) as ProposedAction[];
    const targetActions = Array.isArray(confirmActionIds) && confirmActionIds.length > 0
      ? proposedActions.filter((a) => confirmActionIds.includes(a.id))
      : proposedActions;

    if (targetActions.length === 0) {
      throw new AppError("ERR_NO_ACTIONS_SELECTED", 400);
    }
    if (targetActions.length > MAX_ACTIONS_PER_PLAN) {
      throw new AppError(`ERR_TOO_MANY_ACTIONS: máximo ${MAX_ACTIONS_PER_PLAN} por ejecución.`, 400);
    }

    const skippedActions = proposedActions
      .filter((a) => !targetActions.some((t) => t.id === a.id))
      .map((a) => a.id);

    // Ejecutar una a una
    const executedActions: ExecuteResponse["executedActions"] = [];
    let anyFailed = false;
    let anySucceeded = false;

    for (const a of targetActions) {
      const tool = ToolRegistry.getTool(a.action);
      const log: any = {
        planId: plan.id,
        companyId,
        action: a.action,
        params: { ...a.params, __planActionId: a.id },
        success: false,
        errorMessage: null,
        metaResponse: null,
        executedAt: new Date()
      };

      if (!tool) {
        log.errorMessage = `Tool ${a.action} no existe en el registry`;
        await MetaAgentActionLog.create(log, { transaction: t });
        executedActions.push({ id: a.id, action: a.action, success: false, errorMessage: log.errorMessage });
        anyFailed = true;
        continue;
      }
      if (tool.kind !== "write") {
        log.errorMessage = `Tool ${a.action} no es de escritura — no se ejecuta en execute()`;
        await MetaAgentActionLog.create(log, { transaction: t });
        executedActions.push({ id: a.id, action: a.action, success: false, errorMessage: log.errorMessage });
        anyFailed = true;
        continue;
      }

      try {
        const toolContext: ToolContext = {
          companyId,
          userId,
          whatsappId: plan.whatsappId || undefined,
          adAccountId: plan.resolvedAdAccountId || undefined
        };
        const r = await tool.handler(a.params as any, toolContext);
        log.success = !!r.success;
        log.errorMessage = r.success ? null : r.message;
        log.metaResponse = r.data || null;
        await MetaAgentActionLog.create(log, { transaction: t });
        executedActions.push({
          id: a.id,
          action: a.action,
          success: !!r.success,
          errorMessage: r.success ? undefined : r.message
        });
        if (r.success) anySucceeded = true;
        else anyFailed = true;
      } catch (e: any) {
        logger.error(`[MetaAdsAgent.execute] ${a.action} falló: ${e.message}`);
        log.errorMessage = e.message;
        await MetaAgentActionLog.create(log, { transaction: t });
        executedActions.push({ id: a.id, action: a.action, success: false, errorMessage: e.message });
        anyFailed = true;
      }
    }

    // Marcar estado del plan
    if (anySucceeded && !anyFailed) plan.status = "executed";
    else if (anySucceeded && anyFailed) plan.status = "partial";
    else plan.status = "partial"; // todas fallaron pero la ejecución ya ocurrió
    plan.executedAt = new Date();
    await plan.save({ transaction: t });

    return {
      planId: plan.id,
      status: plan.status,
      alreadyExecuted: false,
      executedActions,
      skippedActions
    } as ExecuteResponse;
  });

  // Cobro fuera de la transacción para evitar bloquear escritura si AICredits falla
  if (!result.alreadyExecuted) {
    const successCount = result.executedActions.filter((a) => a.success).length;
    if (successCount > 0) {
      try {
        await chargeAgentExecution({
          companyId,
          userId,
          source: "meta_ads_agent_execute",
          units: successCount,
          sourceId: `meta_agent_plan_${planId}`,
          metadata: { planId, executedCount: successCount }
        });
      } catch (e: any) {
        logger.warn(
          `[MetaAdsAgent.execute] Cobro de agent_execution falló para plan ${planId}: ${e.message}`
        );
      }
    }
  }

  return result;
}

// ============================================================================
// LISTAR / OBTENER
// ============================================================================

export async function listPlans(params: {
  companyId: number;
  pageNumber?: number;
  pageSize?: number;
  status?: MetaAgentPlanStatus;
}) {
  const { companyId, pageNumber = 1, pageSize = 20, status } = params;
  const limit = Math.min(pageSize, 100);
  const offset = limit * (Math.max(1, pageNumber) - 1);
  const where: any = { companyId };
  if (status) where.status = status;
  const { count, rows } = await MetaAgentPlan.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    attributes: [
      "id",
      "companyId",
      "userId",
      "whatsappId",
      "resolvedAdAccountId",
      "summary",
      "status",
      "expiresAt",
      "executedAt",
      "createdAt"
    ]
  });
  return { records: rows, count, hasMore: count > offset + rows.length };
}

export async function getPlan(params: { companyId: number; planId: number }) {
  const { companyId, planId } = params;
  const plan = await MetaAgentPlan.findOne({
    where: { id: planId, companyId },
    include: [{ model: MetaAgentActionLog, as: "actionLogs" }]
  });
  if (!plan) throw new AppError("ERR_PLAN_NOT_FOUND", 404);
  return plan;
}

// ============================================================================
// LISTAR CONEXIONES META DISPONIBLES (para selector UI)
// ============================================================================

export async function listMetaConnections(params: { companyId: number }) {
  const { companyId } = params;
  const whatsapps = await Whatsapp.findAll({
    where: {
      companyId,
      [Op.or]: [
        { tokenMeta: { [Op.ne]: null as any } },
        { facebookAdAccountId: { [Op.ne]: null as any } }
      ] as any
    },
    attributes: [
      "id",
      "name",
      "number",
      "status",
      "facebookAdAccountId",
      "facebookBusinessId",
      "channel",
      "provider"
    ],
    order: [["id", "ASC"]]
  });
  // Forma esperada por el frontend
  return whatsapps.map((w) => ({
    id: w.id,
    name: w.name,
    number: w.number || null,
    status: w.status || null,
    facebookAdAccountId: (w as any).facebookAdAccountId || null,
    facebookBusinessId: (w as any).facebookBusinessId || null,
    channel: (w as any).channel || null,
    provider: (w as any).provider || null
  }));
}

// ============================================================================
// HELPERS
// ============================================================================

function inferRiskLevel(action: string, params: any): "low" | "medium" | "high" {
  if (action === "pause_campaign") return "low";
  if (action === "duplicate_campaign") return "low";
  if (action === "create_campaign_paused") return "medium";
  if (action === "update_campaign_budget") {
    const newBudget = Number(params?.new_daily_budget_cents || 0);
    if (newBudget > 10_000_00) return "high"; // > $100/día configurable
    return "medium";
  }
  return "medium";
}

export default {
  planAction,
  executePlan,
  listPlans,
  getPlan,
  listMetaConnections
};
