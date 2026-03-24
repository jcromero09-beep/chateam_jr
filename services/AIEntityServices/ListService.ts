import { Op, Sequelize } from "sequelize";
import AIEntity from "../../models/AIEntity";
import { AIProviderEngine, AIEntityType } from "../../models/AIEntity";

interface Request {
  searchParam?: string;
  pageNumber?: string;
  companyId: number;
  engine?: AIProviderEngine;
  type?: AIEntityType;
  status?: string;
}

interface Response {
  records: AIEntity[];
  count: number;
  hasMore: boolean;
}

const ListService = async ({
  searchParam = "",
  pageNumber = "1",
  engine,
  type,
  status
}: Request): Promise<Response> => {
  const limit = 20;
  const offset = limit * (+pageNumber - 1);

  const whereCondition: any = {};

  if (searchParam) {
    whereCondition[Op.or] = [
      {
        title: Sequelize.where(
          Sequelize.fn("LOWER", Sequelize.col("title")),
          "LIKE",
          `%${searchParam.toLowerCase()}%`
        )
      },
      {
        key: Sequelize.where(
          Sequelize.fn("LOWER", Sequelize.col("key")),
          "LIKE",
          `%${searchParam.toLowerCase()}%`
        )
      }
    ];
  }

  if (engine) {
    whereCondition.engine = engine;
  }

  if (type) {
    whereCondition.type = type;
  }

  if (status) {
    whereCondition.status = status;
  }

  const { count, rows: records } = await AIEntity.findAndCountAll({
    where: whereCondition,
    limit,
    offset,
    order: [
      ["engine", "ASC"],
      ["title", "ASC"]
    ]
  });

  const hasMore = count > offset + records.length;

  return { records, count, hasMore };
};

export default ListService;
