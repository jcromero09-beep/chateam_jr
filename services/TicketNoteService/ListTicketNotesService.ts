import { Sequelize, Op } from "sequelize";
import TicketNote from "../../models/TicketNote";
import Ticket from "../../models/Ticket";

interface Request {
  searchParam?: string;
  pageNumber?: string;
  companyId: number;
}

interface Response {
  ticketNotes: TicketNote[];
  count: number;
  hasMore: boolean;
}

const ListTicketNotesService = async ({
  searchParam = "",
  pageNumber = "1",
  companyId
}: Request): Promise<Response> => {
  const whereCondition = {
    [Op.or]: [
      {
        note: Sequelize.where(
          Sequelize.fn("LOWER", Sequelize.col("note")),
          "LIKE",
          `%${searchParam.toLowerCase().trim()}%`
        )
      }
    ]
  };
  const limit = 20;
  const offset = limit * (+pageNumber - 1);

  // [W1-SEC-IDOR] TicketNote no tiene columna companyId → se acota al tenant
  // vía el ticket dueño (include required + where companyId). distinct:true para
  // que el count no infle por el JOIN.
  const { count, rows: ticketNotes } = await TicketNote.findAndCountAll({
    where: whereCondition,
    // La tabla "TicketNotes" NO tiene columna contactId (el modelo la declara);
    // acotar attributes a las columnas reales evita el 500 preexistente.
    attributes: ["id", "note", "userId", "ticketId", "createdAt", "updatedAt"],
    include: [
      {
        model: Ticket,
        as: "ticket",
        required: true,
        where: { companyId },
        attributes: ["id"]
      }
    ],
    distinct: true,
    limit,
    offset,
    order: [["createdAt", "DESC"]]
  });

  const hasMore = count > offset + ticketNotes.length;

  return {
    ticketNotes,
    count,
    hasMore
  };
};

export default ListTicketNotesService;
