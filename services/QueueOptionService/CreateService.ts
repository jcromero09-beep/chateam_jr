import QueueOption from "../../models/QueueOption";
import Queue from "../../models/Queue";
import AppError from "../../errors/AppError";

interface QueueOptionData {
  queueId: string;
  title: string;
  option: string;
  message?: string;
  parentId?: string;
  companyId?: number | string;
}

const CreateService = async (queueOptionData: QueueOptionData): Promise<QueueOption> => {
  const { companyId, ...data } = queueOptionData;

  // [W1-SEC-IDOR] la Queue destino debe pertenecer a la empresa del usuario.
  const queue = await Queue.findOne({
    where: { id: Number(data.queueId), companyId }
  });
  if (!queue) {
    throw new AppError("ERR_QUEUE_NOT_FOUND", 404);
  }

  const queueOption = await QueueOption.create({
    ...data,
    queueId: Number(data.queueId)
  } as any);
  return queueOption;
};

export default CreateService;
