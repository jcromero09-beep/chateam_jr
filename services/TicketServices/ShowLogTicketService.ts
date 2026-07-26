import LogTicket from "../../models/LogTicket";
import User from "../../models/User";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";

interface Request {
  ticketId: string | number;
  companyId: string | number;
}

const ShowLogTicketService = async ({
  ticketId,
  companyId
}: Request): Promise<LogTicket[]> => {
  
  const logs = await LogTicket.findAll({
    where: {
      ticketId
    },
    include: [
      {
        // [P0-A · W1-SEC-03] Acota al tenant. Sin este join, `LogTickets` no tiene
        // `companyId` y el servicio ignoraba el del solicitante → cualquier usuario
        // leía el historial de tickets de otra empresa (IDOR DB-01). `required:true`
        // + `where companyId` = inner join que descarta logs de tickets ajenos;
        // `attributes:[]` no añade columnas al payload.
        model: Ticket,
        as: "ticket",
        required: true,
        where: { companyId },
        attributes: []
      },
      {
        model: User,
        as: "user",
        attributes: ["id", "name"]
      },
      {
        model: Queue,
        as: "queue",
        attributes: ["id", "name"]
      }
    ],
    order: [["createdAt", "DESC"]]
  });

  return logs;
};

export default ShowLogTicketService;
