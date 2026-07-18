import AIChatbotDomain from "../../models/AIChatbotDomain";
import AppError from "../../errors/AppError";

const DeleteService = async (id: number, companyId: number): Promise<void> => {
  const record = await AIChatbotDomain.findOne({ where: { id, companyId } });

  if (!record) {
    throw new AppError("ERR_DOMAIN_NOT_FOUND", 404);
  }

  await record.destroy();
};

export default DeleteService;
