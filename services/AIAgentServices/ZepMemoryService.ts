import axios from "axios";
import logger from "../../utils/logger";

const PREFIX = "[ZepMemory]";
const DEFAULT_API_URL = "https://api.getzep.com";
const MAX_MESSAGE_CHARS = 4096;

interface ZepConfig {
  apiKey: string;
  apiUrl: string;
  enabled: boolean;
  contextEnabled: boolean;
  timeoutMs: number;
  templateId?: string;
}

export interface ZepTurnInput {
  companyId: number;
  ticketId: number;
  contactId?: number | null;
  contactName?: string | null;
  contactEmail?: string | null;
  channel?: string | null;
  userMessage?: string | null;
  assistantMessage?: string | null;
  agentUsed?: string | null;
  intent?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ZepContextInput {
  companyId: number;
  ticketId: number;
  contactId?: number | null;
}

const truthy = (value?: string): boolean =>
  ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());

const getConfig = (): ZepConfig => ({
  apiKey: process.env.ZEP_API_KEY || "",
  apiUrl: (process.env.ZEP_API_URL || DEFAULT_API_URL).replace(/\/+$/, ""),
  enabled: truthy(process.env.ZEP_ENABLED) || truthy(process.env.ZEP_SHADOW_MODE),
  contextEnabled: truthy(process.env.ZEP_CONTEXT_ENABLED),
  timeoutMs: Number(process.env.ZEP_TIMEOUT_MS || 3500),
  templateId: process.env.ZEP_CONTEXT_TEMPLATE_ID || undefined
});

const cleanId = (value: string): string =>
  value.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 480);

export const buildZepIds = ({ companyId, ticketId, contactId }: ZepContextInput) => ({
  userId: cleanId("chateam:company:" + companyId + ":contact:" + (contactId || ("ticket:" + ticketId))),
  threadId: cleanId("chateam:company:" + companyId + ":ticket:" + ticketId)
});

const headers = (config: ZepConfig) => ({
  Authorization: "Api-Key " + config.apiKey,
  "Content-Type": "application/json"
});

const clip = (value?: string | null): string =>
  String(value || "").slice(0, MAX_MESSAGE_CHARS);

const isAlreadyExistsError = (error: any): boolean => {
  const status = error?.response?.status;
  const msg = JSON.stringify(error?.response?.data || error?.message || "").toLowerCase();
  return status === 409 || (status === 400 && (msg.includes("exist") || msg.includes("duplicate")));
};

const createUserIfNeeded = async (
  config: ZepConfig,
  userId: string,
  input: ZepTurnInput
): Promise<void> => {
  try {
    await axios.post(
      config.apiUrl + "/api/v2/users",
      {
        user_id: userId,
        first_name: input.contactName || undefined,
        email: input.contactEmail || undefined,
        metadata: {
          companyId: input.companyId,
          contactId: input.contactId || null,
          source: "chateam"
        }
      },
      { headers: headers(config), timeout: config.timeoutMs }
    );
  } catch (error: any) {
    if (isAlreadyExistsError(error)) return;
    logger.warn(
      PREFIX + " no se pudo crear/validar user user=" + userId +
      " status=" + (error?.response?.status || "N/A") +
      " message=" + (error?.message || error)
    );
  }
};

const createThreadIfNeeded = async (
  config: ZepConfig,
  threadId: string,
  userId: string
): Promise<void> => {
  try {
    await axios.post(
      config.apiUrl + "/api/v2/threads",
      { thread_id: threadId, user_id: userId },
      { headers: headers(config), timeout: config.timeoutMs }
    );
  } catch (error: any) {
    if (isAlreadyExistsError(error)) return;
    logger.warn(
      PREFIX + " no se pudo crear/validar thread thread=" + threadId +
      " status=" + (error?.response?.status || "N/A") +
      " message=" + (error?.message || error)
    );
  }
};

const ensureThread = async (config: ZepConfig, input: ZepTurnInput): Promise<{ userId: string; threadId: string }> => {
  const ids = buildZepIds(input);
  await createUserIfNeeded(config, ids.userId, input);
  await createThreadIfNeeded(config, ids.threadId, ids.userId);
  return ids;
};

export const addConversationTurn = async (input: ZepTurnInput): Promise<void> => {
  const config = getConfig();
  if (!config.enabled || !config.apiKey) return;

  const userContent = clip(input.userMessage);
  const assistantContent = clip(input.assistantMessage);
  if (!userContent && !assistantContent) return;

  const { threadId } = await ensureThread(config, input);
  const now = new Date().toISOString();
  const baseMetadata = {
    companyId: input.companyId,
    ticketId: input.ticketId,
    contactId: input.contactId || null,
    channel: input.channel || null,
    agentUsed: input.agentUsed || null,
    intent: input.intent || null,
    source: "chateam_orchestrator",
    ...(input.metadata || {})
  };

  const messages: Array<Record<string, unknown>> = [];
  if (userContent) {
    messages.push({
      name: input.contactName || "Cliente",
      role: "user",
      content: userContent,
      created_at: now,
      metadata: { ...baseMetadata, messageSide: "customer" }
    });
  }
  if (assistantContent) {
    messages.push({
      name: "ChatEAM",
      role: "assistant",
      content: assistantContent,
      created_at: now,
      metadata: { ...baseMetadata, messageSide: "assistant" }
    });
  }

  try {
    await axios.post(
      config.apiUrl + "/api/v2/threads/" + encodeURIComponent(threadId) + "/messages",
      { messages, return_context: false },
      { headers: headers(config), timeout: config.timeoutMs }
    );
    logger.info(
      PREFIX + " turno enviado a Zep thread=" + threadId +
      " company=" + input.companyId + " ticket=" + input.ticketId +
      " messages=" + messages.length
    );
  } catch (error: any) {
    logger.warn(
      PREFIX + " error agregando mensajes thread=" + threadId +
      " status=" + (error?.response?.status || "N/A") +
      " message=" + (error?.message || error)
    );
  }
};

export const addConversationTurnAsync = (input: ZepTurnInput): void => {
  setImmediate(() => {
    addConversationTurn(input).catch((error: any) => {
      logger.warn(PREFIX + " error async ticket=" + input.ticketId + ": " + (error?.message || error));
    });
  });
};

export const getContext = async (input: ZepContextInput): Promise<string | null> => {
  const config = getConfig();
  if (!config.contextEnabled || !config.apiKey) return null;

  const { threadId } = buildZepIds(input);
  const params: Record<string, string> = {};
  if (config.templateId) params.template_id = config.templateId;

  try {
    const response = await axios.get(
      config.apiUrl + "/api/v2/threads/" + encodeURIComponent(threadId) + "/context",
      { headers: headers(config), params, timeout: config.timeoutMs }
    );
    const context = String(response.data?.context || "").trim();
    return context || null;
  } catch (error: any) {
    if (error?.response?.status !== 404) {
      logger.warn(
        PREFIX + " no se pudo obtener contexto thread=" + threadId +
        " status=" + (error?.response?.status || "N/A") +
        " message=" + (error?.message || error)
      );
    }
    return null;
  }
};

export const buildSupervisorBlock = async (input: ZepContextInput): Promise<string> => {
  const context = await getContext(input);
  if (!context) return "";
  return "## MEMORIA ZEP DEL CLIENTE\n" + context;
};

export default {
  addConversationTurn,
  addConversationTurnAsync,
  buildSupervisorBlock,
  getContext,
  buildZepIds
};
