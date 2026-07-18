import AIAffiliateProgram from "../../models/AIAffiliateProgram";

const ListService = async (companyId: number): Promise<AIAffiliateProgram[]> => {
  const programs = await AIAffiliateProgram.findAll({
    where: { companyId },
    order: [["createdAt", "DESC"]]
  });
  return programs;
};

export default ListService;
