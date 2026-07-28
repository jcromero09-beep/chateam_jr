import AppError from "../../errors/AppError";
import QueueOption from "../../models/QueueOption";
import Queue from "../../models/Queue";

const ShowService = async (
  queueOptionId: number | string,
  companyId: number | string
): Promise<QueueOption> => {
  const queue = await QueueOption.findOne({
    where: {
      id: queueOptionId
    },
    include: [
      {
        model: QueueOption,
        as: 'parent',
        where: { parentId: queueOptionId },
        required: false
      },
      // [W1-SEC-IDOR] la Queue dueña debe pertenecer a la empresa.
      {
        model: Queue,
        as: "queue",
        where: { companyId },
        attributes: [],
        required: true
      }
    ]
  });

  if (!queue) {
    throw new AppError("ERR_QUEUE_NOT_FOUND");
  }

  return queue;
};

export default ShowService;
