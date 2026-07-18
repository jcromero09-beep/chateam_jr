import Receipt from "../../models/Receipt";
import AppError from "../../errors/AppError";

const DeleteReceiptService = async (id: string | number): Promise<void> => {
  const receipt = await Receipt.findOne({
    where: { id }
  });

  if (!receipt) {
    throw new AppError("ERR_NO_Receipt_FOUND", 404);
  }

  await receipt.destroy();
};

export default DeleteReceiptService;

