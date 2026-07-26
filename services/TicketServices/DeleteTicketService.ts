import Ticket from "../../models/Ticket";
import AppError from "../../errors/AppError";
import CreateLogTicketService from "./CreateLogTicketService";

const DeleteTicketService = async (id: string | number, userId: number, companyId: number): Promise<Ticket> => {
  // [P0-B · W1-SEC-12] Acota al tenant. Antes hacía `where:{id}` e ignoraba el
  // `companyId` que recibe → un usuario de otra empresa podía DELETE /tickets/:id
  // y destruir el ticket ajeno con CASCADE (Messages/LogTickets). Con el filtro,
  // un id de otra company no se encuentra y se responde 404 sin borrar nada.
  const ticket = await Ticket.findOne({
    where: { id, companyId }
  });

  if (!ticket) {
    throw new AppError("ERR_NO_TICKET_FOUND", 404);
  }

  await ticket.destroy();

  return ticket;
};

export default DeleteTicketService;
