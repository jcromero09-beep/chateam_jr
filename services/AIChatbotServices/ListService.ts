import { Op, Sequelize } from "sequelize";
import AIChatbotConfig from "../../models/AIChatbotConfig";
import AIChatbotDataSource from "../../models/AIChatbotDataSource";

interface Request {
  searchParam?: string;
  pageNumber?: string;
  companyId: number;
  status?: string;
}

interface Response {
  records: AIChatbotConfig[];
  count: number;
  hasMore: boolean;
}

const ListService = async ({
  searchParam = "",
  pageNumber = "1",
  companyId,
  status
}: Request): Promise<Response> => {
  const limit = 20;
  const offset = limit * (+pageNumber - 1);

  const whereCondition: any = {
    companyId
  };

  if (searchParam) {
    whereCondition[Op.or] = [
      {
        name: Sequelize.where(
          Sequelize.fn("LOWER", Sequelize.col("AIChatbotConfig.name")),
          "LIKE",
          `%${searchParam.toLowerCase()}%`
        )
      }
    ];
  }

  if (status) {
    whereCondition.status = status;
  }

  const { count, rows: records } = await AIChatbotConfig.findAndCountAll({
    where: whereCondition,
    include: [
      {
        model: AIChatbotDataSource,
        as: "dataSources",
        attributes: ["id", "type", "status"]
      }
    ],
    limit,
    offset,
    order: [["createdAt", "DESC"]],
    distinct: true
  });

  const hasMore = count > offset + records.length;

  return { records, count, hasMore };
};

export default ListService;
