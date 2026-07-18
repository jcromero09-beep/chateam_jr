import AIEntity from "../../models/AIEntity";
import AppError from "../../errors/AppError";

const ShowService = async (id: string | number): Promise<AIEntity> => {
  const entity = await AIEntity.findByPk(id);

  if (!entity) {
    throw new AppError("ERR_AI_ENTITY_NOT_FOUND", 404);
  }

  return entity;
};

export default ShowService;
