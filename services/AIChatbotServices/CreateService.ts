import * as Yup from "yup";
import AIChatbotConfig from "../../models/AIChatbotConfig";
import AIChatbotDataSource from "../../models/AIChatbotDataSource";
import AppError from "../../errors/AppError";

interface Request {
  companyId: number;
  queueId?: number;
  name: string;
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
}

const CreateService = async (data: Request): Promise<AIChatbotConfig> => {
  const schema = Yup.object().shape({
    companyId: Yup.number().required("El companyId es obligatorio"),
    name: Yup.string()
      .required("El nombre es obligatorio")
      .min(2, "El nombre debe tener al menos 2 caracteres"),
    modelKey: Yup.string(),
    temperature: Yup.number().min(0).max(2),
    maxTokens: Yup.number().min(1).max(128000),
    widgetColor: Yup.string().matches(/^#[0-9A-Fa-f]{6}$/, "Color hex no valido"),
    widgetPosition: Yup.string().oneOf(
      ["bottom-right", "bottom-left", "top-right", "top-left"],
      "Posicion no valida"
    )
  });

  try {
    await schema.validate(data, { abortEarly: false });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  const chatbot = await AIChatbotConfig.create({
    companyId: data.companyId,
    queueId: data.queueId || null,
    name: data.name,
    role: data.role || "",
    firstMessage: data.firstMessage || "",
    modelKey: data.modelKey || "gpt-5.5",
    instructions: data.instructions || "",
    interests: data.interests || [],
    temperature: data.temperature ?? 0.7,
    maxTokens: data.maxTokens || 1024,
    widgetColor: data.widgetColor || "#007bff",
    widgetPosition: data.widgetPosition || "bottom-right",
    avatarUrl: data.avatarUrl || "",
    widgetTitle: data.widgetTitle || "",
    status: "draft"
  } as any);

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

export default CreateService;
