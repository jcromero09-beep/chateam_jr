import * as Yup from "yup";
import AIChatbotConfig from "../../models/AIChatbotConfig";
import AIChatbotDataSource from "../../models/AIChatbotDataSource";
import AppError from "../../errors/AppError";
import ShowService from "./ShowService";

interface Request {
  id: string | number;
  companyId: number;
  queueId?: number;
  name?: string;
  role?: string;
  firstMessage?: string;
  modelKey?: string;
  instructions?: string;
  interests?: string[];
  temperature?: number;
  maxTokens?: number;
  widgetColor?: string;
  widgetPosition?: string;
  avatarUrl?: string;
  widgetTitle?: string;
  status?: string;
}

const UpdateService = async ({
  id,
  companyId,
  ...data
}: Request): Promise<AIChatbotConfig> => {
  const schema = Yup.object().shape({
    name: Yup.string().min(2, "El nombre debe tener al menos 2 caracteres"),
    temperature: Yup.number().min(0).max(2),
    maxTokens: Yup.number().min(1).max(128000),
    widgetColor: Yup.string().matches(/^#[0-9A-Fa-f]{6}$/, "Color hex no valido"),
    widgetPosition: Yup.string().oneOf(
      ["bottom-right", "bottom-left", "top-right", "top-left"],
      "Posicion no valida"
    ),
    status: Yup.string().oneOf(
      ["draft", "training", "trained", "active"],
      "Estado no valido"
    )
  });

  try {
    await schema.validate(data, { abortEarly: false });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  const chatbot = await ShowService(id, companyId);

  // Construir objeto de actualizacion solo con campos proporcionados
  const updateData: any = {};
  if (data.queueId !== undefined) updateData.queueId = data.queueId;
  if (data.name !== undefined) updateData.name = data.name;
  if (data.role !== undefined) updateData.role = data.role;
  if (data.firstMessage !== undefined) updateData.firstMessage = data.firstMessage;
  if (data.modelKey !== undefined) updateData.modelKey = data.modelKey;
  if (data.instructions !== undefined) updateData.instructions = data.instructions;
  if (data.interests !== undefined) updateData.interests = data.interests;
  if (data.temperature !== undefined) updateData.temperature = data.temperature;
  if (data.maxTokens !== undefined) updateData.maxTokens = data.maxTokens;
  if (data.widgetColor !== undefined) updateData.widgetColor = data.widgetColor;
  if (data.widgetPosition !== undefined) updateData.widgetPosition = data.widgetPosition;
  if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl;
  if (data.widgetTitle !== undefined) updateData.widgetTitle = data.widgetTitle;
  if (data.status !== undefined) updateData.status = data.status;

  await chatbot.update(updateData);
  await chatbot.reload({
    include: [
      {
        model: AIChatbotDataSource,
        as: "dataSources"
      }
    ]
  });

  return chatbot;
};

export default UpdateService;
