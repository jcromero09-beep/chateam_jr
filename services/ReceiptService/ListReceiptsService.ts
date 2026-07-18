import { Sequelize, Op } from "sequelize";
import Receipt from "../../models/Receipt";
import Company from "../../models/Company";
import AISubplan from "../../models/AISubplan";
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
          Sequelize.where(
            Sequelize.fn("LOWER", Sequelize.col("descripcion")),
            "LIKE",
            `%${searchParam.toLowerCase().trim()}%`
          )
        ]
      }
    : {}; // Sin filtro si no hay `searchParam`

  const limit = 20;
  const offset = limit * (+pageNumber - 1);

  const { count, rows: receipts } = await Receipt.findAndCountAll({
    where: whereCondition,
    limit,
    offset,
    order: [["id", "DESC"]],
    include: [
      {
        model: Company,
        as: "company",
        attributes: ["id", "name"],
      },
      {
        model: AISubplan,
        as: "aiSubplan",
        attributes: ["id", "name", "tokens", "priceUsd"],
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
