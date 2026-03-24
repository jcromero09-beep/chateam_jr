import { Op } from "sequelize";
import AIEmailTemplate from "../../models/AIEmailTemplate";

interface Request {
  companyId: number;
  type?: string;
  searchParam?: string;
}

const ListService = async ({
  companyId,
  type,
  searchParam = ""
}: Request): Promise<AIEmailTemplate[]> => {
  const whereCondition: any = {
    // Templates del sistema (companyId null) + templates de la company
    companyId: {
      [Op.or]: [null, companyId]
    },
    isActive: true
  };

  if (type) {
    whereCondition.type = type;
  }

  if (searchParam) {
    whereCondition[Op.or] = [
      { slug: { [Op.iLike]: `%${searchParam}%` } },
      { subject: { [Op.iLike]: `%${searchParam}%` } }
    ];
  }

  const templates = await AIEmailTemplate.findAll({
    where: whereCondition,
    order: [
      ["type", "ASC"],
      ["slug", "ASC"]
    ]
  });

  return templates;
};

export default ListService;
