import AICreditBalance from "../../models/AICreditBalance";
import AICreditType from "../../models/AICreditType";

interface Request {
  companyId: number;
}

const ListBalancesService = async ({
  companyId
}: Request): Promise<AICreditBalance[]> => {
  const balances = await AICreditBalance.findAll({
    where: { companyId },
    include: [
      {
        model: AICreditType,
        as: "creditType",
        attributes: ["id", "key", "name", "description", "unit", "defaultCost", "isActive"]
      }
    ],
    order: [[{ model: AICreditType, as: "creditType" }, "name", "ASC"]]
  });

  return balances;
};

export default ListBalancesService;
