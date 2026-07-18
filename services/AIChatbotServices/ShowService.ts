import AIChatbotConfig from "../../models/AIChatbotConfig";
import AIChatbotDataSource from "../../models/AIChatbotDataSource";
import AppError from "../../errors/AppError";

const ShowService = async (
  id: string | number,
  companyId: number
): Promise<AIChatbotConfig> => {
  const chatbot = await AIChatbotConfig.findOne({
    where: { id, companyId },
    include: [
      {
        model: AIChatbotDataSource,
        as: "dataSources"
      }
    ]
  });

  if (!chatbot) {
    throw new AppError("ERR_AI_CHATBOT_NOT_FOUND", 404);
  }

  return chatbot;
};

export default ShowService;
