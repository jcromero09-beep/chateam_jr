import Receipt from "../../models/Receipt";
import AISubplan from "../../models/AISubplan";
import Company from "../../models/Company";
import AppError from "../../errors/AppError";

const ShowReceiptService = async (Receiptid: string | number): Promise<Receipt> => {
  const receipt = await Receipt.findByPk(Receiptid, {
    include: [
      { model: Company, as: "company", attributes: ["id", "name"] },
      { model: AISubplan, as: "aiSubplan", attributes: ["id", "name", "tokens", "priceUsd"] }
    ]
  });

  if (!receipt) {
    throw new AppError("ERR_NO_INVOICE_FOUND", 404);
  }

  return receipt;
};

export default ShowReceiptService;
