import { WhereOptions } from "sequelize/types";
import QueueOption from "../../models/QueueOption";

type QueueOptionFilter = {
  queueId: string | number;
  queueOptionId: string | number;
  parentId: string | number | boolean;
};

const ListService = async ({ queueId, queueOptionId, parentId }: QueueOptionFilter): Promise<QueueOption[]> => {

  const whereOptions: WhereOptions = {};

  if (queueId) {
    whereOptions.queueId = queueId;
  }

  if (queueOptionId) {
    whereOptions.id = queueOptionId;
  }

  const numParentId = Number(parentId);
  if (numParentId === -1) {
    whereOptions.parentId = null;
  }

  if (numParentId > 0) {
    whereOptions.parentId = numParentId;
  }

  const queueOptions = await QueueOption.findAll({
    where: whereOptions,
    order: [["id", "ASC"]]
  });

  return queueOptions;
};

export default ListService;
