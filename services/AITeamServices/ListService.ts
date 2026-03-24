import { Sequelize } from "sequelize";
import AITeam from "../../models/AITeam";
import AITeamMember from "../../models/AITeamMember";

interface Request {
  companyId: number;
  searchParam?: string;
  pageNumber?: string;
}

interface Response {
  records: AITeam[];
  count: number;
  hasMore: boolean;
}

const ListService = async ({
  companyId,
  searchParam = "",
  pageNumber = "1"
}: Request): Promise<Response> => {
  const limit = 20;
  const offset = limit * (+pageNumber - 1);

  const whereCondition: any = { companyId };

  if (searchParam) {
    whereCondition.name = Sequelize.where(
      Sequelize.fn("LOWER", Sequelize.col("AITeam.name")),
      "LIKE",
      `%${searchParam.toLowerCase()}%`
    );
  }

  const { count, rows: records } = await AITeam.findAndCountAll({
    where: whereCondition,
    include: [
      {
        model: AITeamMember,
        as: "members",
        attributes: []
      }
    ],
    attributes: {
      include: [
        [
          Sequelize.fn("COUNT", Sequelize.col("members.id")),
          "memberCount"
        ]
      ]
    },
    group: ["AITeam.id"],
    subQuery: false,
    limit,
    offset,
    order: [["name", "ASC"]]
  });

  const totalCount = typeof count === "number" ? count : (count as any[]).length;
  const hasMore = totalCount > offset + records.length;

  return { records, count: totalCount, hasMore };
};

export default ListService;
