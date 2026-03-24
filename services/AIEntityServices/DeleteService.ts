import AIEntity from "../../models/AIEntity";
import AppError from "../../errors/AppError";

const DeleteService = async (id: string | number): Promise<void> => {
  const entity = await AIEntity.findByPk(id);

  if (!entity) {
    throw new AppError("ERR_AI_ENTITY_NOT_FOUND", 404);
  }

  await entity.destroy();
};

export default DeleteService;
