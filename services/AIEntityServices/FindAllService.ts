import AIEntity from "../../models/AIEntity";
import { AIProviderEngine, AIEntityType } from "../../models/AIEntity";

interface Request {
  engine?: AIProviderEngine;
  type?: AIEntityType;
  status?: string;
}

const FindAllService = async ({
  engine,
  type,
  status = "active"
}: Request = {}): Promise<AIEntity[]> => {
  const whereCondition: any = {};

  if (engine) {
    whereCondition.engine = engine;
  }

  if (type) {
    whereCondition.type = type;
  }

  if (status) {
    whereCondition.status = status;
  }

  const entities = await AIEntity.findAll({
    where: whereCondition,
    order: [
      ["engine", "ASC"],
      ["title", "ASC"]
    ]
  });

  return entities;
};

export default FindAllService;
