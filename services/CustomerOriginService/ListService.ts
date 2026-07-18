import { Op, fn, col, where } from "sequelize";
import CustomerOrigin from "../../models/CustomerOrigin";

interface ListRequest {
  searchParam?: string;
  pageNumber?: string;
  companyId: number;
  showAll?: boolean; // Si es true, muestra también los inactivos
}

interface ListResponse {
  records: CustomerOrigin[];
  count: number;
  hasMore: boolean;
}

const ListCustomerOriginService = async ({
  searchParam = "",
  pageNumber = "1",
  companyId,
  showAll = false
}: ListRequest): Promise<ListResponse> => {
  let whereCondition: any = {
    companyId
  };

  // Solo mostrar activos si showAll es false
  if (!showAll) {
    whereCondition.isActive = true;
  }

  // Búsqueda por nombre (case-insensitive)
  if (searchParam && searchParam.trim() !== "") {
    whereCondition = {
      ...whereCondition,
      [Op.or]: [
        {
          name: where(
            fn("LOWER", col("CustomerOrigin.name")),
            "LIKE",
            `%${searchParam.toLowerCase().trim()}%`
          )
        },
        {
          description: where(
            fn("LOWER", col("CustomerOrigin.description")),
            "LIKE",
            `%${searchParam.toLowerCase().trim()}%`
          )
        }
      ]
    };
  }

  const limit = 20;
  const offset = limit * (+pageNumber - 1);

  const { count, rows: records } = await CustomerOrigin.findAndCountAll({
    where: whereCondition,
    limit,
    offset,
    order: [["name", "ASC"]]
  });

  const hasMore = count > offset + records.length;

  return { records, count, hasMore };
};

export default ListCustomerOriginService;
