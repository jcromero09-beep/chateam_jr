import * as Yup from "yup";
import AIEntity from "../../models/AIEntity";
import { AIProviderEngine, AIEntityType } from "../../models/AIEntity";
import AppError from "../../errors/AppError";
import ShowService from "./ShowService";

interface Request {
  id: string | number;
  key?: string;
  title?: string;
  engine?: AIProviderEngine;
  type?: AIEntityType;
  inputPrice?: number;
  outputPrice?: number;
  maxTokens?: number;
  capabilities?: string[];
  status?: string;
  isSelected?: boolean;
  metadata?: Record<string, unknown>;
}

const UpdateService = async ({ id, ...data }: Request): Promise<AIEntity> => {
  const schema = Yup.object().shape({
    title: Yup.string().min(2),
    engine: Yup.string().oneOf(
      ["openai", "anthropic", "google", "azure", "cohere", "mistral", "deepseek", "meta", "local"]
    ),
    type: Yup.string().oneOf(
      ["chat", "completion", "embedding", "image", "audio", "video", "multimodal", "code", "moderation"]
    )
  });

  try {
    await schema.validate(data, { abortEarly: false });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  const entity = await ShowService(id);

  // Si cambia key, verificar que no exista duplicado
  if (data.key && data.key !== entity.key) {
    const existing = await AIEntity.findOne({
      where: { key: data.key }
    });

    if (existing) {
      throw new AppError("ERR_AI_ENTITY_DUPLICATE_KEY", 409);
    }
  }

  // Construir objeto de actualización solo con campos proporcionados
  const updateData: any = {};
  if (data.key !== undefined) updateData.key = data.key;
  if (data.title !== undefined) updateData.title = data.title;
  if (data.engine !== undefined) updateData.engine = data.engine;
  if (data.type !== undefined) updateData.type = data.type;
  if (data.inputPrice !== undefined) updateData.inputPrice = data.inputPrice;
  if (data.outputPrice !== undefined) updateData.outputPrice = data.outputPrice;
  if (data.maxTokens !== undefined) updateData.maxTokens = data.maxTokens;
  if (data.capabilities !== undefined) updateData.capabilities = data.capabilities;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.isSelected !== undefined) updateData.isSelected = data.isSelected;
  if (data.metadata !== undefined) updateData.metadata = data.metadata;

  await entity.update(updateData);
  await entity.reload();

  return entity;
};

export default UpdateService;
