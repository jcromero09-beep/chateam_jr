import CustomerOrigin from "../../models/CustomerOrigin";
import AppError from "../../errors/AppError";

interface ShowRequest {
  id: number | string;
  companyId: number;
}

const ShowCustomerOriginService = async ({
  id,
  companyId
}: ShowRequest): Promise<CustomerOrigin> => {
  const customerOrigin = await CustomerOrigin.findOne({
    where: {
      id,
      companyId
    }
  });

  if (!customerOrigin) {
    throw new AppError("Origen de cliente no encontrado", 404);
  }

  return customerOrigin;
};

export default ShowCustomerOriginService;
