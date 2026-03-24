import * as Yup from "yup";
import AIEntity from "../../models/AIEntity";
import { AIProviderEngine, AIEntityType } from "../../models/AIEntity";
import AppError from "../../errors/AppError";

interface Request {
  key: string;
  title: string;
  engine: AIProviderEngine;
  type: AIEntityType;
  inputPrice?: number;
  outputPrice?: number;
  maxTokens?: number;
  capabilities?: string[];
  status?: string;
  isSelected?: boolean;
  metadata?: Record<string, unknown>;
}

const CreateService = async (data: Request): Promise<AIEntity> => {
  const schema = Yup.object().shape({
    key: Yup.string().required("El key es obligatorio"),
    title: Yup.string().required("El título es obligatorio").min(2),
    engine: Yup.string()
      .required("El motor/proveedor es obligatorio")
      .oneOf(
        ["openai", "anthropic", "google", "azure", "cohere", "mistral", "deepseek", "meta", "local"],
        "Motor no válido"
      ),
    type: Yup.string()
      .required("El tipo es obligatorio")
      .oneOf(
        ["chat", "completion", "embedding", "image", "audio", "video", "multimodal", "code", "moderation"],
        "Tipo no válido"
      )
  });

  try {
    await schema.validate(data, { abortEarly: false });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  // Verificar duplicados por key
  const existing = await AIEntity.findOne({
    where: { key: data.key }
  });

  if (existing) {
    throw new AppError("ERR_AI_ENTITY_DUPLICATE_KEY", 409);
  }

  const entity = await AIEntity.create({
    key: data.key,
    title: data.title,
    engine: data.engine,
    type: data.type,
    inputPrice: data.inputPrice || 0,
    outputPrice: data.outputPrice || 0,
    maxTokens: data.maxTokens || 4096,
    capabilities: data.capabilities || [],
    status: data.status || "active",
    isSelected: data.isSelected || false,
    metadata: data.metadata || {}
  } as any);

  await entity.reload();
  return entity;
};

export default CreateService;
