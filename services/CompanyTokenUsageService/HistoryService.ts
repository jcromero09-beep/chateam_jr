import { Op, where, fn, col } from "sequelize";
import CompanyTokenUsage from "../../models/CompanyTokenUsage";
import lodash from "lodash";
const { isEmpty } = lodash;

interface ListUsageRequest {
  companyId: number | string;
  searchParam?: string;
  pageNumber?: string;
}

interface ListUsageResponse {
  records: any[];
  count: number;
  hasMore: boolean;
}

/**
 * Formatea una fecha a string YYYY-MM
 */
const formatMonth = (date: Date): string => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const HistoryService = async ({
  companyId,
  searchParam = "",
  pageNumber = "1"
}: ListUsageRequest): Promise<ListUsageResponse> => {
  let whereCondition: any = {
    companyId: companyId
  };

  if (!isEmpty(searchParam)) {
    whereCondition = {
      ...whereCondition,
      [Op.or]: [
        {
          model: where(
            fn("LOWER", col("CompanyTokenUsage.model")),
            "LIKE",
            `%${searchParam.toLowerCase().trim()}%`
          )
        }
      ]
    };
  }

  const limit = 20;
  const offset = limit * (+pageNumber - 1);

  const { count, rows } = await CompanyTokenUsage.findAndCountAll({
    where: whereCondition,
    limit,
    offset,
    order: [["month", "DESC"], ["model", "ASC"]]
  });

  // Formatear registros para el frontend
  const records = rows.map(r => ({
    id: r.id,
    companyId: r.companyId,
    model: r.model || "unknown",
    month: formatMonth(r.month),
    tokens_month: Number(r.tokensMonth) || 0,
    tokens_total: Number(r.tokensTotal) || 0,
    cost_usd_month: Number(r.costUsdMonth) || 0,
    cost_usd_total: Number(r.costUsdTotal) || 0,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  }));

  const hasMore = count > offset + records.length;

  return {
    records,
    count,
    hasMore
  };
};

export default HistoryService;
