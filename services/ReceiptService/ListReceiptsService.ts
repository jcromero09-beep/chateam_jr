import { Sequelize, Op } from "sequelize";
import Receipt from "../../models/Receipt";
import Company from "../../models/Company";
interface Request {
  searchParam?: string;
  pageNumber?: string;
}

interface Response {
  receipts: Receipt[];
  count: number;
  hasMore: boolean;
}

const ListReceiptsService = async ({
  searchParam = "",
  pageNumber = "1"
}: Request): Promise<Response> => {
  const whereCondition = searchParam
    ? {
        [Op.or]: [
          {
            description: Sequelize.where(
              Sequelize.fn("LOWER", Sequelize.col("description")),
              "LIKE",
              `%${searchParam.toLowerCase().trim()}%`
            )
          }
        ]
      }
    : {}; // Sin filtro si no hay `searchParam`

  const limit = 20;
  const offset = limit * (+pageNumber - 1);

  const { count, rows: receipts } = await Receipt.findAndCountAll({
    where: whereCondition,
    limit,
    offset,
    order: [["id", "ASC"]],
    include: [
      {
        model: Company,
        as: "company",
        attributes: ["id", "name"],
      },
    ],
  });

  const hasMore = count > offset + receipts.length;

  return {
    receipts,
    count,
    hasMore
  };
};

export default ListReceiptsService;
