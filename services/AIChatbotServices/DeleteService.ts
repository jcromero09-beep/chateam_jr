import AIChatbotConfig from "../../models/AIChatbotConfig";
import AIChatbotDataSource from "../../models/AIChatbotDataSource";
import AppError from "../../errors/AppError";

const DeleteService = async (
  id: string | number,
  companyId: number
): Promise<void> => {
  const chatbot = await AIChatbotConfig.findOne({
    where: { id, companyId }
  });

  if (!chatbot) {
    throw new AppError("ERR_AI_CHATBOT_NOT_FOUND", 404);
  }

  // Eliminar data sources asociados primero
  await AIChatbotDataSource.destroy({
    where: { chatbotId: chatbot.id, companyId }
  });

  await chatbot.destroy();
};

export default DeleteService;
