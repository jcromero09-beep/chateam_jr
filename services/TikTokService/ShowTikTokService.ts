import Whatsapp from "../../models/Whatsapp";
import AppError from "../../errors/AppError";
import Queue from "../../models/Queue";
import QueueIntegrations from "../../models/QueueIntegrations";
import Prompt from "../../models/Prompt";
import { FlowBuilderModel } from "../../models/FlowBuilder";

const ShowTikTokService = async (
  id: string | number,
  companyId: number
): Promise<Whatsapp> => {
  const tiktok = await Whatsapp.findOne({
    where: {
      id,
      companyId,
      channel: "tiktok"
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

  if (!tiktok) {
    throw new AppError("Conexión TikTok no encontrada", 404);
  }

  return tiktok;
};

export default ShowTikTokService;
