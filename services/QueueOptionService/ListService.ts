import { WhereOptions } from "sequelize/types";
import QueueOption from "../../models/QueueOption";
import Queue from "../../models/Queue";

type QueueOptionFilter = {
  queueId: string | number;
  queueOptionId: string | number;
  parentId: string | number | boolean;
  companyId: string | number;
};

const ListService = async ({ queueId, queueOptionId, parentId, companyId }: QueueOptionFilter): Promise<QueueOption[]> => {

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
    // [Ola 3] Aislamiento tenant: la Queue debe pertenecer a la empresa.
    include: [{ model: Queue, as: "queue", where: { companyId }, attributes: [], required: true }],
    order: [["id", "ASC"]]
  });

  return queueOptions;
};

export default ListService;
