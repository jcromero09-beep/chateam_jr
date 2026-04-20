import * as Yup from "yup";
import AppError from "../../errors/AppError";
import sequelize from "../../database";
import Queue from "../../models/Queue";
import Company from "../../models/Company";
import Plan from "../../models/Plan";
import Chatbot from "../../models/Chatbot";
import User from "../../models/User";
import { logWarn } from "../../utils/logger";
import normalizeQueueChatbots from "./normalizeQueueChatbots";

interface QueueData {
  name: string;
  color: string;
  companyId: number;
  greetingMessage?: string;
  outOfHoursMessage?: string;
  schedules?: any[];
  chatbots?: Chatbot[];
  orderQueue?: number;
  ativarRoteador?: boolean;
  tempoRoteador?: number;
  integrationId?: number;
  fileListId?: number;
  closeTicket?: boolean;
  promptAI?: string;
}

const CreateQueueService = async (queueData: QueueData): Promise<Queue> => {
  const { color, name, companyId } = queueData;
  const normalizedChatbots = normalizeQueueChatbots(queueData.chatbots);

  if (!companyId || Number.isNaN(Number(companyId))) {
    throw new AppError("No fue posible identificar la empresa para crear la cola");
  }

  return sequelize.transaction(async transaction => {
    const company = await Company.findOne({
      where: {
        id: companyId
      },
      include: [{ model: Plan, as: "plan" }],
      transaction
    });

    if (!company) {
      throw new AppError("Empresa no encontrada", 404);
    }

    if (!company.plan) {
      throw new AppError("La empresa no tiene un plan configurado para crear colas");
    }

    const queueLimit = Number(company.plan.queues ?? 0);

    if (queueLimit <= 0) {
      throw new AppError("Tu plan actual no permite crear colas nuevas");
    }

    const queuesCount = await Queue.count({
      where: {
        companyId
      },
      transaction
    });

    if (queuesCount >= queueLimit) {
      logWarn("[CreateQueueService] Queue limit reached", {
        companyId,
        companyName: company.name,
        queuesCount,
        queueLimit
      });

      throw new AppError(
        `Has alcanzado el límite de colas de tu plan (${queueLimit}). Actualmente tu empresa tiene ${queuesCount} cola(s) registradas.`
      );
    }

    const queueSchema = Yup.object().shape({
      name: Yup.string()
        .min(2, "ERR_QUEUE_INVALID_NAME")
        .required("ERR_QUEUE_INVALID_NAME")
        .test(
          "Check-unique-name",
          "ERR_QUEUE_NAME_ALREADY_EXISTS",
          async value => {
            if (value) {
              const queueWithSameName = await Queue.findOne({
                where: { name: value, companyId },
                transaction
              });

              return !queueWithSameName;
            }
            return false;
          }
        ),
      color: Yup.string()
        .required("ERR_QUEUE_INVALID_COLOR")
        .test("Check-color", "ERR_QUEUE_INVALID_COLOR", async value => {
          if (value) {
            const colorTestRegex = /^#[0-9a-f]{3,6}$/i;
            return colorTestRegex.test(value);
          }
          return false;
        })
        .test(
          "Check-color-exists",
          "ERR_QUEUE_COLOR_ALREADY_EXISTS",
          async value => {
            if (value) {
              const queueWithSameColor = await Queue.findOne({
                where: { color: value, companyId },
                transaction
              });
              return !queueWithSameColor;
            }
            return false;
          }
        )
    });

    try {
      await queueSchema.validate({ color, name });
    } catch (err: any) {
      throw new AppError(err.message);
    }

    const { chatbots, ...queueFields } = queueData;

    const queueDataWithDefaults = {
      ...queueFields,
      ativarRoteador: queueData.ativarRoteador ?? false,
      tempoRoteador: queueData.tempoRoteador ?? 0
    };

    const queue = await Queue.create(queueDataWithDefaults, {
      transaction
    });

    if (normalizedChatbots.length > 0) {
      await Chatbot.bulkCreate(
        normalizedChatbots.map(chatbot => ({
          ...chatbot,
          queueId: queue.id
        })) as any,
        { transaction }
      );
    }

    await queue.reload({
      include: [
        {
          model: Chatbot,
          as: "chatbots",
          include: [
            {
              model: User,
              as: "user"
            }
          ]
        }
      ],
      transaction
    });

    return queue;
  });
};

export default CreateQueueService;
