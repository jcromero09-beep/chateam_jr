/**
 * MetaAdsAgentController — Endpoints HTTP del agente IA "Meta Ads Optimizer".
 *
 * - POST /meta-marketing/agent/plan         → genera plan read-only (acciones propuestas)
 * - POST /meta-marketing/agent/execute      → ejecuta plan confirmado (gated por feature flag)
 * - GET  /meta-marketing/agent/plans        → historial de planes de la company
 * - GET  /meta-marketing/agent/plans/:id    → detalle de un plan + action logs
 * - GET  /meta-marketing/agent/connections  → conexiones Meta disponibles para selector UI
 *
 * Multi-tenant: companyId siempre desde req.user (middleware isAuth lo provee).
 *               El service filtra por companyId en cada operación.
 */
import { Request, Response } from "express";
import logger from "../utils/logger";
import AppError from "../errors/AppError";
import MetaAdsAgentService from "../services/AIAgentServices/MetaAdsAgentService";
import MetaOfficialMCPService from "../services/AIAgentServices/MetaOfficialMCPService";
import MetaAdsAgentChatService from "../services/AIAgentServices/MetaAdsAgentChatService";

const extractError = (error: unknown): { msg: string; statusCode: number } => {
  if (error instanceof AppError) {
    return { msg: error.message, statusCode: error.statusCode };
  }
  if (error instanceof Error) {
    const msg = error.message;
    const statusCode = msg.includes("NOT_FOUND")
      ? 404
      : msg.includes("ERR_") || msg.includes("EXCEEDED") || msg.includes("INVALID")
      ? 400
      : 500;
    return { msg, statusCode };
  }
  return { msg: String(error), statusCode: 500 };
};

interface AuthUser {
  id: number;
  companyId: number;
  profile?: string;
}

const getUser = (req: Request): AuthUser => {
  const u = req.user;
  if (!u || !u.id || !u.companyId) {
    throw new AppError("ERR_UNAUTHENTICATED", 401);
  }
  return u;
};

// ============================================================================
// POST /meta-marketing/agent/plan
// ============================================================================
export const planAction = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id: userId, companyId } = getUser(req);
    const { prompt, whatsappId } = req.body || {};

    if (!prompt || typeof prompt !== "string") {
      throw new AppError("ERR_PROMPT_REQUIRED", 400);
    }

    const result = await MetaAdsAgentService.planAction({
      companyId,
      userId,
      prompt: String(prompt),
      whatsappId: whatsappId ? Number(whatsappId) : undefined
    });

    return res.json({ success: true, data: result });
  } catch (err) {
    logger.error(`[MetaAdsAgentController.planAction] ${(err as Error).message}`);
    const { msg, statusCode } = extractError(err);
    return res.status(statusCode).json({ success: false, error: msg });
  }
};

// ============================================================================
// POST /meta-marketing/agent/execute
// ============================================================================
export const executePlan = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id: userId, companyId } = getUser(req);
    const { planId, confirmActionIds } = req.body || {};

    if (!planId || Number.isNaN(Number(planId))) {
      throw new AppError("ERR_INVALID_PLAN_ID", 400);
    }
    if (confirmActionIds !== undefined && !Array.isArray(confirmActionIds)) {
      throw new AppError("ERR_INVALID_CONFIRM_IDS", 400);
    }

    const result = await MetaAdsAgentService.executePlan({
      companyId,
      userId,
      planId: Number(planId),
      confirmActionIds: confirmActionIds as string[] | undefined
    });

    return res.json({ success: true, data: result });
  } catch (err) {
    logger.error(`[MetaAdsAgentController.executePlan] ${(err as Error).message}`);
    const { msg, statusCode } = extractError(err);
    return res.status(statusCode).json({ success: false, error: msg });
  }
};

// ============================================================================
// GET /meta-marketing/agent/plans
// ============================================================================
export const listPlans = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = getUser(req);
    const { pageNumber, pageSize, status } = req.query as Record<string, string>;

    const result = await MetaAdsAgentService.listPlans({
      companyId,
      pageNumber: pageNumber ? Number(pageNumber) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
      status: status as any
    });

    return res.json({ success: true, ...result });
  } catch (err) {
    logger.error(`[MetaAdsAgentController.listPlans] ${(err as Error).message}`);
    const { msg, statusCode } = extractError(err);
    return res.status(statusCode).json({ success: false, error: msg });
  }
};

// ============================================================================
// GET /meta-marketing/agent/plans/:id
// ============================================================================
export const getPlanById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = getUser(req);
    const planId = Number(req.params.id);
    if (!planId) throw new AppError("ERR_INVALID_PLAN_ID", 400);

    const plan = await MetaAdsAgentService.getPlan({ companyId, planId });
    return res.json({ success: true, data: plan });
  } catch (err) {
    logger.error(`[MetaAdsAgentController.getPlanById] ${(err as Error).message}`);
    const { msg, statusCode } = extractError(err);
    return res.status(statusCode).json({ success: false, error: msg });
  }
};

// ============================================================================
// GET /meta-marketing/agent/connections
// ============================================================================
export const listConnections = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = getUser(req);
    const data = await MetaAdsAgentService.listMetaConnections({ companyId });
    return res.json({ success: true, data });
  } catch (err) {
    logger.error(`[MetaAdsAgentController.listConnections] ${(err as Error).message}`);
    const { msg, statusCode } = extractError(err);
    return res.status(statusCode).json({ success: false, error: msg });
  }
};

// ============================================================================
// POST /meta-marketing/agent/chat
// ============================================================================
export const chat = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id: userId, companyId } = getUser(req);
    const { message, whatsappId, lastPlanId, requestedProvider } = req.body || {};

    if (!message || typeof message !== "string") {
      throw new AppError("ERR_MESSAGE_REQUIRED", 400);
    }

    // Validación estricta del provider — solo dos valores aceptados
    let provider: "meta_official_mcp" | "meta_graph_internal" | undefined;
    if (requestedProvider !== undefined && requestedProvider !== null) {
      if (
        requestedProvider !== "meta_official_mcp" &&
        requestedProvider !== "meta_graph_internal"
      ) {
        throw new AppError(
          "ERR_INVALID_PROVIDER: requestedProvider debe ser 'meta_official_mcp' o 'meta_graph_internal'",
          400
        );
      }
      provider = requestedProvider;
    }

    const data = await MetaAdsAgentChatService.chat({
      companyId,
      userId,
      message: String(message),
      whatsappId: whatsappId ? Number(whatsappId) : undefined,
      lastPlanId: lastPlanId ? Number(lastPlanId) : undefined,
      requestedProvider: provider
    });

    return res.json({ success: true, data });
  } catch (err) {
    logger.error(`[MetaAdsAgentController.chat] ${(err as Error).message}`);
    const { msg, statusCode } = extractError(err);
    return res.status(statusCode).json({ success: false, error: msg });
  }
};

// ============================================================================
// GET /meta-marketing/agent/mcp/status
// ============================================================================
export const getMcpStatus = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = getUser(req);
    const data = await MetaOfficialMCPService.getStatus(companyId);
    return res.json({ success: true, data });
  } catch (err) {
    logger.error(`[MetaAdsAgentController.getMcpStatus] ${(err as Error).message}`);
    const { msg, statusCode } = extractError(err);
    return res.status(statusCode).json({ success: false, error: msg });
  }
};

// ============================================================================
// GET /meta-marketing/agent/mcp/diagnostics
// ============================================================================
export const getMcpDiagnostics = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = getUser(req);
    const data = await MetaOfficialMCPService.getDiagnostics(companyId);
    return res.json({ success: true, data });
  } catch (err) {
    logger.error(`[MetaAdsAgentController.getMcpDiagnostics] ${(err as Error).message}`);
    const { msg, statusCode } = extractError(err);
    return res.status(statusCode).json({ success: false, error: msg });
  }
};

// ============================================================================
// POST /meta-marketing/agent/mcp/connect
// ============================================================================
export const startMcpConnection = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = getUser(req);
    const data = await MetaOfficialMCPService.startConnection(companyId);
    return res.json({ success: true, data });
  } catch (err) {
    logger.error(`[MetaAdsAgentController.startMcpConnection] ${(err as Error).message}`);
    const { msg, statusCode } = extractError(err);
    return res.status(statusCode).json({ success: false, error: msg });
  }
};

// ============================================================================
// GET /meta-marketing/agent/mcp/callback
//
// SIN isAuth — viene desde Meta tras autorización OAuth. La validación es
// por (state) que se generó en /connect y vive sólo en BD.
// ============================================================================
export const mcpCallback = async (req: Request, res: Response): Promise<void> => {
  const frontend = process.env.FRONTEND_URL || "https://chat.chateam.ws";
  const buildRedirect = (params: Record<string, string>): string => {
    const u = new URL(`${frontend.replace(/\/+$/, "")}/campaigns/audit`);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    return u.toString();
  };

  try {
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    const oauthError = req.query.error ? String(req.query.error) : null;
    const oauthErrorDescription = req.query.error_description
      ? String(req.query.error_description)
      : null;

    if (oauthError) {
      logger.warn(
        { code: "MCP_OFFICIAL_OAUTH_DENIED", oauthError, oauthErrorDescription },
        "[MetaAdsAgentController.mcpCallback] OAuth rechazado por el usuario o Meta"
      );
      const url = buildRedirect({ mcp_oauth: "error", reason: oauthError });
      logger.warn(
        { code: "MCP_OFFICIAL_REDIRECT_ERROR", target: url },
        "[MetaAdsAgentController.mcpCallback] Redirigiendo con error"
      );
      res.redirect(url);
      return;
    }

    if (!code || !state) {
      throw new AppError("MCP_OFFICIAL_CALLBACK_INVALID: faltan code o state", 400);
    }

    await MetaOfficialMCPService.handleCallback({ code, state });

    const successUrl = buildRedirect({ mcp_oauth: "success" });
    logger.info(
      { code: "MCP_OFFICIAL_REDIRECT_SUCCESS", target: successUrl },
      "[MetaAdsAgentController.mcpCallback] OAuth + tools/list OK, redirigiendo al frontend"
    );
    res.redirect(successUrl);
  } catch (err) {
    logger.error(
      { code: "MCP_OFFICIAL_REDIRECT_ERROR", err: (err as Error).message },
      `[MetaAdsAgentController.mcpCallback] ${(err as Error).message}`
    );
    const { msg } = extractError(err);
    res.redirect(buildRedirect({ mcp_oauth: "error", reason: msg }));
  }
};

// ============================================================================
// POST /meta-marketing/agent/mcp/disconnect
// ============================================================================
export const disconnectMcp = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = getUser(req);
    const data = await MetaOfficialMCPService.disconnect(companyId);
    return res.json({ success: true, data });
  } catch (err) {
    logger.error(`[MetaAdsAgentController.disconnectMcp] ${(err as Error).message}`);
    const { msg, statusCode } = extractError(err);
    return res.status(statusCode).json({ success: false, error: msg });
  }
};

// ============================================================================
// GET /meta-marketing/agent/mcp/tools — tools/list real
// ============================================================================
export const listMcpTools = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = getUser(req);
    const tools = await MetaOfficialMCPService.listTools(companyId);
    return res.json({ success: true, data: { provider: "meta_official_mcp", tools } });
  } catch (err) {
    logger.error(`[MetaAdsAgentController.listMcpTools] ${(err as Error).message}`);
    const { msg, statusCode } = extractError(err);
    return res.status(statusCode).json({ success: false, error: msg });
  }
};

// ============================================================================
// POST /meta-marketing/agent/mcp/tools/call — tools/call real
// ============================================================================
export const callMcpTool = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = getUser(req);
    const { name, arguments: toolArgs } = req.body || {};
    if (!name || typeof name !== "string") {
      throw new AppError("MCP_OFFICIAL_INVALID_TOOL_NAME", 400);
    }
    const result = await MetaOfficialMCPService.callTool(
      companyId,
      String(name),
      (toolArgs || {}) as Record<string, unknown>
    );
    return res.json({ success: true, data: { provider: "meta_official_mcp", result } });
  } catch (err) {
    logger.error(`[MetaAdsAgentController.callMcpTool] ${(err as Error).message}`);
    const { msg, statusCode } = extractError(err);
    return res.status(statusCode).json({ success: false, error: msg });
  }
};

// ============================================================================
// DEPRECATED — POST /meta-marketing/agent/mcp/mark-connected
//
// Bloqueado a propósito (era un bypass). El service lanza MCP_OFFICIAL_BYPASS_DENIED.
// Mantener este wrapper sólo para devolver un 403 explícito a quien lo invoque.
// ============================================================================
export const markMcpConnected = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = getUser(req);
    await MetaOfficialMCPService.markConnected(companyId);
    return res.status(403).json({
      success: false,
      error:
        "MCP_OFFICIAL_BYPASS_DENIED: este endpoint fue eliminado. Usa /agent/mcp/connect → OAuth → /agent/mcp/callback."
    });
  } catch (err) {
    logger.warn(
      { code: "MCP_OFFICIAL_MARK_CONNECTED_ATTEMPT" },
      `[MetaAdsAgentController.markMcpConnected] ${(err as Error).message}`
    );
    const { msg, statusCode } = extractError(err);
    return res.status(statusCode === 500 ? 403 : statusCode).json({
      success: false,
      error: msg
    });
  }
};
