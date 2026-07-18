import { Op } from "sequelize";
import * as Yup from "yup";
import AppError from "../../errors/AppError";
import sequelize from "../../database";
import Chatbot from "../../models/Chatbot";
import Queue from "../../models/Queue";
import ShowQueueService from "./ShowQueueService";
import User from "../../models/User";
import { invalidateQueueCache } from "../IntegrationsServices/PromptCacheService";
import normalizeQueueChatbots from "./normalizeQueueChatbots";

interface QueueData {
  name?: string;
  color?: string;
  greetingMessage?: string;
  outOfHoursMessage?: string;
  schedules?: any[];
  chatbots?: Chatbot[];
  orderQueue?: number;
  ativarRoteador?: boolean;
  tempoRoteador?: number;
  integrationId?: number | null;
  fileListId?: number | null;
  closeTicket?: boolean;
  promptAI?: string;
}

const UpdateQueueService = async (
  queueId: number | string,
  queueData: QueueData,
  companyId: number
): Promise<Queue> => {
  const { color, name, chatbots } = queueData;
  const normalizedChatbots = chatbots === undefined ? undefined : normalizeQueueChatbots(chatbots);

  const queue = await sequelize.transaction(async transaction => {
    const queueSchema = Yup.object().shape({
      name: Yup.string()
        .min(2, "ERR_QUEUE_INVALID_NAME")
        .test(
          "Check-unique-name",
          "ERR_QUEUE_NAME_ALREADY_EXISTS",
          async value => {
            if (value) {
              const queueWithSameName = await Queue.findOne({
                where: { name: value, id: { [Op.ne]: queueId }, companyId },
                transaction
              });

              return !queueWithSameName;
            }
            return true;
          }
        ),
      color: Yup.string()
        .required("ERR_QUEUE_INVALID_COLOR")
        .test("Check-color", "ERR_QUEUE_INVALID_COLOR", async value => {
          if (value) {
            const colorTestRegex = /^#[0-9a-f]{3,6}$/i;
            return colorTestRegex.test(value);
          }
          return true;
        })
        .test(
          "Check-color-exists",
          "ERR_QUEUE_COLOR_ALREADY_EXISTS",
          async value => {
            if (value) {
              const queueWithSameColor = await Queue.findOne({
                where: { color: value, id: { [Op.ne]: queueId }, companyId },
                transaction
              });
              return !queueWithSameColor;
            }
            return true;
          }
        )
    });

    try {
      await queueSchema.validate({ color, name });
    } catch (err: any) {
      throw new AppError(err.message);
    }

    const queue = await ShowQueueService(queueId, companyId, transaction);

    if (queue.companyId !== companyId) {
      throw new AppError("Não é permitido alterar registros de outra empresa");
    }

    if (normalizedChatbots !== undefined) {
      await Promise.all(
        normalizedChatbots.map(async bot => {
          await Chatbot.upsert({ ...bot, queueId: queue.id } as any, { transaction });
        })
      );

      await Promise.all(
        queue.chatbots.map(async oldBot => {
          const stillExists = normalizedChatbots.findIndex(bot => bot.id === oldBot.id);

          if (stillExists === -1) {
            await Chatbot.destroy({ where: { id: oldBot.id }, transaction });
          }
        })
      );
    }

    const queueFields: any = { ...queueData };
    delete queueFields.chatbots;

    const queueDataWithDefaults: any = {
      ...queueFields,
      ativarRoteador: queueData.ativarRoteador ?? queue.ativarRoteador,
      tempoRoteador: queueData.tempoRoteador ?? queue.tempoRoteador
    };

    await queue.update(queueDataWithDefaults, { transaction });

    await queue.reload({
      include: [
        {
          model: Chatbot,
          as: "chatbots",
          include: [
            {
              model: User,
              as: "user"
            },
          ],
          order: [[{ model: Chatbot, as: "chatbots" }, "id", "asc"], ["id", "ASC"]]
        }
      ],
      transaction,
      order: [[{ model: Chatbot, as: "chatbots" }, "id", "asc"], ["id", "ASC"]]
    });

    return queue;
  });

  await invalidateQueueCache(queue.id, companyId);

  return queue;
};

export default UpdateQueueService;
