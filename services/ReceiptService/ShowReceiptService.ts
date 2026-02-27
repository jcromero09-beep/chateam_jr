import Receipt from "../../models/Receipt";
import AppError from "../../errors/AppError";

const ShowReceiptService = async (Receiptid: string | number): Promise<Receipt> => {
  const receipt = await Receipt.findByPk(Receiptid);

  if (!receipt) {
    throw new AppError("ERR_NO_INVOICE_FOUND", 404);
  }

  return receipt;
};

export default ShowReceiptService;
