import AppError from "../../errors/AppError";
import Chatbot from "../../models/Chatbot";

interface ChatbotData {
  id?: number;
  name?: string;
  greetingMessage?: string;
  options: Chatbot[];
  closeTicket?: boolean;
}

const UpdateChatBotServices = async (
  chatBotId: number | string,
  chatbotData: ChatbotData
): Promise<Chatbot> => {
  const { options } = chatbotData;

  const chatbot = await Chatbot.findOne({
    where: { id: chatBotId },
    include: ["options"],
    order: [["id", "asc"]]
  });

  if (!chatbot) {
    throw new AppError("ERR_NO_CHATBOT_FOUND", 404);
  }

  if (options) {
    // [W1-SEC-IDOR] los hijos heredan companyId del padre (NOT NULL) y no se
    // confía en bot.id del body: si el id no pertenece a este chatbot, se descarta
    // (se crea nuevo) para no sobrescribir un nodo de otra empresa por PK.
    const ownOptionIds = new Set((chatbot.options || []).map((o: any) => o.id));
    await Promise.all(
      options.map(async bot => {
        const safeBot: any =
          bot.id && !ownOptionIds.has(bot.id) ? { ...bot, id: undefined } : bot;
        await Chatbot.upsert({
          ...safeBot,
          chatbotId: chatbot.id,
          companyId: (chatbot as any).companyId
        });
      })
    );

    await Promise.all(
      chatbot.options.map(async oldBot => {
        const stillExists = options.findIndex(bot => bot.id === oldBot.id);

        if (stillExists === -1) {
          await Chatbot.destroy({ where: { id: oldBot.id } });
        }
      })
    );
  }

  await chatbot.update(chatbotData);

  await chatbot.reload({
    include: [
      {
        model: Chatbot,
        as: "mainChatbot",
        attributes: ["id", "name", "greetingMessage", "queueType", "optIntegrationId", "optQueueId", "optUserId","optFileId" ],
        order: [[{ model: Chatbot, as: "mainChatbot" }, "id", "ASC"]]
      },
      {
        model: Chatbot,
        as: "options",
        order: [[{ model: Chatbot, as: "options" }, "id", "ASC"]],
        attributes: ["id", "name", "greetingMessage", "queueType", "optIntegrationId", "optQueueId", "optUserId", "optFileId"]
      }
    ],
    order: [["id", "asc"]]
  });

  return chatbot;
};

export default UpdateChatBotServices;
