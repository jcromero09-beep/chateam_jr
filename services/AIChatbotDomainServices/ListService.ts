import AIChatbotDomain from "../../models/AIChatbotDomain";
import AIChatbotConfig from "../../models/AIChatbotConfig";

interface Request {
  companyId: number;
}

const ListService = async ({ companyId }: Request): Promise<AIChatbotDomain[]> => {
  const domains = await AIChatbotDomain.findAll({
    where: { companyId },
    include: [
      {
        model: AIChatbotConfig,
        as: "chatbot",
        attributes: ["id", "name", "status"]
      }
    ],
    order: [["createdAt", "DESC"]]
  });

  return domains;
};

export default ListService;
