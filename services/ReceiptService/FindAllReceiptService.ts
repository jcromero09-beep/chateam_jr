import Company from "../../models/Company";
import Receipt from "../../models/Receipt";
import Plan from "../../models/Plan";

interface Request {
  companyId: number;
}

const FindAllReceiptService = async (companyId: number): Promise<Receipt[]> => {
  const receipt = await Receipt.findAll({
    where: {
      companyId
    },
    order: [["id", "ASC"]],
  });
  return receipt;
};

export default FindAllReceiptService;
