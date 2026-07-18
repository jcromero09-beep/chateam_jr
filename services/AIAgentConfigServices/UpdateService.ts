import AIAgentConfig from "../../models/AIAgentConfig";
import AppError from "../../errors/AppError";

interface Request {
  id: number;
  name?: string;
  description?: string;
  modelKey?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: string[];
  guardrails?: Record<string, unknown>;
  confidenceThreshold?: number;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}

const UpdateService = async ({ id, ...data }: Request): Promise<AIAgentConfig> => {
  const config = await AIAgentConfig.findByPk(id);

  if (!config) {
    throw new AppError("ERR_AI_AGENT_CONFIG_NOT_FOUND", 404);
  }

  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.modelKey !== undefined) updateData.modelKey = data.modelKey;
  if (data.systemPrompt !== undefined) updateData.systemPrompt = data.systemPrompt;
  if (data.temperature !== undefined) updateData.temperature = data.temperature;
  if (data.maxTokens !== undefined) updateData.maxTokens = data.maxTokens;
  if (data.tools !== undefined) updateData.tools = data.tools;
  if (data.guardrails !== undefined) updateData.guardrails = data.guardrails;
  if (data.confidenceThreshold !== undefined) updateData.confidenceThreshold = data.confidenceThreshold;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.metadata !== undefined) updateData.metadata = data.metadata;

  await config.update(updateData);
  await config.reload();

  return config;
};

export default UpdateService;
