import Whatsapp from "../../models/Whatsapp";
import AppError from "../../errors/AppError";
import Queue from "../../models/Queue";
import QueueIntegrations from "../../models/QueueIntegrations";
import Prompt from "../../models/Prompt";
import { FlowBuilderModel } from "../../models/FlowBuilder";

const ShowTelegramService = async (
  id: string | number,
  companyId: number
): Promise<Whatsapp> => {
  const telegram = await Whatsapp.findOne({
    where: {
      id,
      companyId,
      channel: "telegram"
    },
    include: [
      {
        model: Queue,
        as: "queues",
        attributes: ["id", "name", "color", "greetingMessage"],
        include: [
          {
            model: QueueIntegrations,
            as: "queueIntegrations"
          }
        ]
      },
      {
        model: QueueIntegrations,
        as: "queueIntegrations"
      },
      {
        model: Prompt,
        as: "prompt"
      },
      {
        model: FlowBuilderModel,
        as: "flowBuilder"
      }
    ]
  });

  if (!telegram) {
    throw new AppError("Bot Telegram no encontrado", 404);
  }

  return telegram;
};

export default ShowTelegramService;
