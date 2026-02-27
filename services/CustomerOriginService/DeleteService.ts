import CustomerOrigin from "../../models/CustomerOrigin";
import Ticket from "../../models/Ticket";
import AppError from "../../errors/AppError";

interface DeleteRequest {
  id: number | string;
  companyId: number;
}

const DeleteCustomerOriginService = async ({
  id,
  companyId
}: DeleteRequest): Promise<void> => {
  const customerOrigin = await CustomerOrigin.findOne({
    where: {
      id,
      companyId
    }
  });

  if (!customerOrigin) {
    throw new AppError("Origen de cliente no encontrado", 404);
  }

  // Verificar si hay tickets asociados
  const ticketCount = await Ticket.count({
    where: {
      customerOriginId: id,
      companyId
    }
  });

  if (ticketCount > 0) {
    throw new AppError(
      `No se puede eliminar: hay ${ticketCount} ticket(s) asociados a este origen. ` +
      `Considera desactivarlo en lugar de eliminarlo.`
    );
  }

  await customerOrigin.destroy();
};

export default DeleteCustomerOriginService;
