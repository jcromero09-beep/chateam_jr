import * as Yup from "yup";
import AIAgentConfig from "../../models/AIAgentConfig";
import AppError from "../../errors/AppError";

interface Request {
  companyId?: number;
  agentType: string;
  name: string;
  description?: string;
  modelKey: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
  tools?: string[];
  guardrails?: Record<string, unknown>;
  confidenceThreshold?: number;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}

const CreateService = async (data: Request): Promise<AIAgentConfig> => {
  const schema = Yup.object().shape({
    agentType: Yup.string()
      .required("El tipo de agente es obligatorio")
      .oneOf(['router', 'rag', 'sales', 'support', 'escalation', 'supervisor',
        'content', 'analytics', 'multimedia', 'security', 'automation', 'research']),
    name: Yup.string().required("El nombre es obligatorio").min(2),
    modelKey: Yup.string().required("El modelo es obligatorio"),
    systemPrompt: Yup.string().required("El system prompt es obligatorio").min(10)
  });

  try {
    await schema.validate(data, { abortEarly: false });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  const config = await AIAgentConfig.create({
    companyId: data.companyId || null,
    agentType: data.agentType,
    name: data.name,
    description: data.description || null,
    modelKey: data.modelKey,
    systemPrompt: data.systemPrompt,
    temperature: data.temperature || 0.7,
    maxTokens: data.maxTokens || 1024,
    tools: data.tools || [],
    guardrails: data.guardrails || {},
    confidenceThreshold: data.confidenceThreshold || 0.7,
    isActive: data.isActive !== undefined ? data.isActive : true,
    metadata: data.metadata || {}
  } as any);

  await config.reload();
  return config;
};

export default CreateService;
