import TicketNote from "../../models/TicketNote";
import User from "../../models/User";
import Ticket from "../../models/Ticket";

interface Params {
  contactId?: number | string;
  ticketId?: number | string;
  companyId: number;
}

/**
 * Lista las observaciones internas de un ticket.
 *
 * NOTA: la tabla "TicketNotes" en BD NO tiene columna `contactId`
 * (solo: id, note, ticketId, userId, createdAt, updatedAt). Por eso se
 * filtra únicamente por `ticketId`, se acotan los `attributes` a las
 * columnas reales y se elimina el include de Contact, evitando el error
 * "column TicketNote.contactId does not exist".
 */
const FindNotesByContactIdAndTicketId = async ({
  ticketId,
  companyId
}: Params): Promise<TicketNote[]> => {
  const where: { ticketId?: number | string } = {};
  if (ticketId) {
    where.ticketId = ticketId;
  }

  // [W1-SEC-IDOR] Acota al tenant vía el ticket dueño (include required + where
  // companyId): impide leer notas de un ticketId de otra empresa.
  const notes: TicketNote[] = await TicketNote.findAll({
    where,
    attributes: ["id", "note", "userId", "ticketId", "createdAt", "updatedAt"],
    include: [
      { model: User, as: "user", attributes: ["id", "name", "email"] },
      {
        model: Ticket,
        as: "ticket",
        required: true,
        where: { companyId },
        attributes: ["id", "status", "createdAt"]
      }
    ],
    order: [["createdAt", "DESC"]],
    limit: 50
  });

  return notes;
};

export default FindNotesByContactIdAndTicketId;
