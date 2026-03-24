import { Op } from "sequelize";
import AIAgentConfig from "../../models/AIAgentConfig";

interface Request {
  companyId: number;
  agentType?: string;
  department?: string;
  isActive?: boolean;
}

const ListService = async ({
  companyId,
  agentType,
  department,
  isActive
}: Request): Promise<AIAgentConfig[]> => {
  const whereCondition: any = {
    [Op.or]: [
      { companyId },       // Configuraciones de la empresa
      { companyId: null }  // Configuraciones globales
    ]
  };

  if (agentType) {
    whereCondition.agentType = agentType;
  }

  if (department) {
    whereCondition.department = department;
  }

  if (isActive !== undefined) {
    whereCondition.isActive = isActive;
  }

  const configs = await AIAgentConfig.findAll({
    where: whereCondition,
    order: [
      ["companyId", "ASC NULLS FIRST"],
      ["department", "ASC"],
      ["sortOrder", "ASC"],
      ["agentType", "ASC"]
    ]
  });

  return configs;
};

export default ListService;
