import AICreditType from "../../models/AICreditType";

interface Request {
  isActive?: boolean;
}

const ListCreditTypesService = async ({
  isActive = true
}: Request = {}): Promise<AICreditType[]> => {
  const whereCondition: any = {};

  if (isActive !== undefined) {
    whereCondition.isActive = isActive;
  }

  const creditTypes = await AICreditType.findAll({
    where: whereCondition,
    order: [["name", "ASC"]]
  });

  return creditTypes;
};

export default ListCreditTypesService;
