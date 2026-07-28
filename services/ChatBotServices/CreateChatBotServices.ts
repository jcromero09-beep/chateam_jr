import Chatbot from "../../models/Chatbot";

interface ChatbotData {
  name: string;
  color: string;
  greetingMessage?: string;
  queueType?: string;
  optUserId?: number;
  optQueueId?: number;
  optIntegrationId?: number;
  optFileId?: number;
  closeTicket?: boolean;
  companyId: number;
}

const CreateChatBotServices = async (
  chatBotData: ChatbotData
): Promise<Chatbot> => {
  // [W1-SEC-IDOR] companyId es NOT NULL en la tabla — debe venir del usuario
  // autenticado (el controller pasa req.user.companyId), no del body.
  const chatBot = await Chatbot.create(chatBotData);
  return chatBot;
};

export default CreateChatBotServices;
