import AppError from "../../errors/AppError";
import Chatbot from "../../models/Chatbot";

export interface QueueChatbotPayload {
  id?: number;
  name: string;
  greetingMessage?: string;
  chatbotId?: number;
  isAgent?: boolean;
  queueType?: string;
  optQueueId?: number;
  optUserId?: number;
  optIntegrationId?: number;
  optFileId?: number;
  closeTicket?: boolean;
}

const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const hasValue = (value: unknown): boolean => {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return true;
};

const isEmptyChatbotPayload = (chatbot: Partial<QueueChatbotPayload>): boolean => {
  return ![
    chatbot.name,
    chatbot.greetingMessage,
    chatbot.chatbotId,
    chatbot.isAgent,
    chatbot.queueType,
    chatbot.optQueueId,
    chatbot.optUserId,
    chatbot.optIntegrationId,
    chatbot.optFileId,
    chatbot.closeTicket
  ].some(hasValue);
};

const normalizeQueueChatbots = (
  chatbots?: Chatbot[]
): QueueChatbotPayload[] => {
  if (!Array.isArray(chatbots)) {
    return [];
  }

  const normalizedChatbots = chatbots
    .filter((chatbot): chatbot is Chatbot => Boolean(chatbot) && typeof chatbot === "object")
    .map(chatbot => ({
      id: chatbot.id,
      name: typeof chatbot.name === "string" ? chatbot.name.trim() : (chatbot.name as any),
      greetingMessage: typeof chatbot.greetingMessage === "string"
        ? chatbot.greetingMessage.trim()
        : chatbot.greetingMessage,
      chatbotId: chatbot.chatbotId,
      isAgent: chatbot.isAgent,
      queueType: chatbot.queueType,
      optQueueId: chatbot.optQueueId,
      optUserId: chatbot.optUserId,
      optIntegrationId: chatbot.optIntegrationId,
      optFileId: chatbot.optFileId,
      closeTicket: chatbot.closeTicket
    }))
    .filter(chatbot => !isEmptyChatbotPayload(chatbot));

  const invalidChatbot = normalizedChatbots.find(chatbot => !hasText(chatbot.name));

  if (invalidChatbot) {
    throw new AppError("Cada chatbot debe tener un nombre antes de guardar la cola");
  }

  return normalizedChatbots as QueueChatbotPayload[];
};

export default normalizeQueueChatbots;
