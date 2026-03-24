import * as Yup from "yup";
import crypto from "crypto";
import AIChatbotDomain from "../../models/AIChatbotDomain";
import AIChatbotConfig from "../../models/AIChatbotConfig";
import AppError from "../../errors/AppError";

interface Request {
  companyId: number;
  chatbotId: number;
  domain: string;
  customCss?: string;
  customJs?: string;
  allowedOrigins?: string[];
}

const CreateService = async (data: Request): Promise<AIChatbotDomain> => {
  const schema = Yup.object().shape({
    chatbotId: Yup.number().required("chatbotId es obligatorio"),
    domain: Yup.string().required("El dominio es obligatorio").matches(
      /^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      "Formato de dominio invalido"
    )
  });

  try {
    await schema.validate(data, { abortEarly: false });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  // Verify chatbot belongs to company
  const chatbot = await AIChatbotConfig.findOne({
    where: { id: data.chatbotId, companyId: data.companyId }
  });
  if (!chatbot) {
    throw new AppError("ERR_CHATBOT_NOT_FOUND", 404);
  }

  // Check domain uniqueness
  const existing = await AIChatbotDomain.findOne({ where: { domain: data.domain } });
  if (existing) {
    throw new AppError("ERR_DOMAIN_ALREADY_EXISTS", 409);
  }

  // Generate unique app key
  const appKey = `ck_live_${crypto.randomBytes(24).toString('hex')}`;

  const record = await AIChatbotDomain.create({
    companyId: data.companyId,
    chatbotId: data.chatbotId,
    domain: data.domain,
    appKey,
    sslEnabled: false,
    customCss: data.customCss || null,
    customJs: data.customJs || null,
    allowedOrigins: data.allowedOrigins || ["*"],
    status: "pending_dns"
  } as any);

  await record.reload({
    include: [{ model: AIChatbotConfig, as: "chatbot", attributes: ["id", "name"] }]
  });

  return record;
};

export default CreateService;
