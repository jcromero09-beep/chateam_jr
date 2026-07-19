import { Op, fn, col, where } from "sequelize";
import lodash from "lodash";
const { isEmpty } = lodash;
import Announcement from "../../models/Announcement";

interface Request {
  searchParam?: string;
  pageNumber?: string;
  companyId?: number | string;
}

interface Response {
  records: Announcement[];
  count: number;
  hasMore: boolean;
}

const ListService = async ({
  searchParam = "",
  pageNumber = "1",
  companyId
}: Request): Promise<Response> => {
  // [FIX fuga tenant] Antes solo filtraba status:true → devolvía anuncios de TODAS las empresas.
  // Ahora se acota por companyId (cada empresa ve solo los suyos; base del broadcast per-empresa).
  let whereCondition: any = {
    status: true,
    ...(companyId ? { companyId } : {})
  };

  if (!isEmpty(searchParam)) {
    whereCondition = {
      ...whereCondition,
      [Op.or]: [
        {
          title: where(
            fn("LOWER", col("Announcement.title")),
            "LIKE",
            `%${searchParam.toLowerCase().trim()}%`
          )
        }
      ]
    };
  }

  const limit = 20;
  const offset = limit * (+pageNumber - 1);

  const { count, rows: records } = await Announcement.findAndCountAll({
    where: whereCondition,
    limit,
    offset,
    order: [["createdAt", "DESC"]]
  });

  const hasMore = count > offset + records.length;

  return {
    records,
    count,
    hasMore
  };
};

export default ListService;
