import * as Yup from "yup";
import AIChatbotConfig from "../../models/AIChatbotConfig";
import AIChatbotDataSource from "../../models/AIChatbotDataSource";
import AppError from "../../errors/AppError";

interface Request {
  chatbotId: number;
  companyId: number;
  type: string;
  content?: string;
  fileUrl?: string;
  sourceUrl?: string;
}

const AddDataSourceService = async (
  data: Request
): Promise<AIChatbotDataSource> => {
  const schema = Yup.object().shape({
    chatbotId: Yup.number().required("El chatbotId es obligatorio"),
    companyId: Yup.number().required("El companyId es obligatorio"),
    type: Yup.string()
      .required("El tipo es obligatorio")
      .oneOf(
        ["text", "file", "url", "qa_pairs", "ticket_history"],
        "Tipo de fuente no valido"
      ),
    content: Yup.string().when("type", {
      is: (val: string) => val === "text" || val === "qa_pairs",
      then: (schema) =>
        schema.required("El contenido es obligatorio para este tipo")
    }),
    fileUrl: Yup.string().when("type", {
      is: "file",
      then: (schema) =>
        schema.required("La URL del archivo es obligatoria para tipo file")
    }),
    sourceUrl: Yup.string().when("type", {
      is: "url",
      then: (schema) =>
        schema.required("La URL de origen es obligatoria para tipo url")
    })
  });

  try {
    await schema.validate(data, { abortEarly: false });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  // Verificar que el chatbot existe y pertenece a la empresa
  const chatbot = await AIChatbotConfig.findOne({
    where: { id: data.chatbotId, companyId: data.companyId }
  });

  if (!chatbot) {
    throw new AppError("ERR_AI_CHATBOT_NOT_FOUND", 404);
  }

  const dataSource = await AIChatbotDataSource.create({
    chatbotId: data.chatbotId,
    companyId: data.companyId,
    type: data.type,
    content: data.content || "",
    fileUrl: data.fileUrl || "",
    sourceUrl: data.sourceUrl || "",
    status: "pending",
    chunksCount: 0,
    tokensCount: 0
  } as any);

  await dataSource.reload();

  // Si el chatbot estaba trained o active, volver a draft
  if (chatbot.status === "trained" || chatbot.status === "active") {
    await chatbot.update({ status: "draft" });
  }

  return dataSource;
};

export default AddDataSourceService;
