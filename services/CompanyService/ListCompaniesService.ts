import { Sequelize, Op } from "sequelize";
import Company from "../../models/Company";
import Plan from "../../models/Plan";

interface Request {
  searchParam?: string;
  pageNumber?: string;
  companyId?: number;
}

interface Response {
  companies: Company[];
  count: number;
  hasMore: boolean;
}

const ListCompaniesService = async ({
  searchParam = "",
  pageNumber = "1",
  companyId
}: Request): Promise<Response> => {

  const limit = 20;
  const offset = limit * (+pageNumber - 1);

  // [Ola 0.1] Aislamiento tenant: si viene companyId (no-super), acotar SIEMPRE a esa empresa.
  // Antes el searchParam se ignoraba en el query → se devolvían TODAS las companies a cualquier user.
  const where: any = {};
  if (companyId) {
    where.id = companyId;
  } else if (searchParam) {
    where.name = { [Op.iLike]: `%${searchParam}%` };
  }

  const { count, rows: companies } = await Company.findAndCountAll({
    // [Ola 0.1] Nunca exponer secretos de pasarela en el listado de companies.
    attributes: { exclude: ["stripeSecretKey", "paypalSecretKey", "facebookAppSecret"] },
    where,
    include: [{
      model: Plan,
      as: "plan",
      attributes: ["name"]
    }],
    limit,
    offset,
    order: [["name", "ASC"]]
  });

  const hasMore = count > offset + companies.length;

  return {
    companies,
    count,
    hasMore
  };
};

export default ListCompaniesService;
