import AppError from "../../errors/AppError";
import TicketNote from "../../models/TicketNote";
import Ticket from "../../models/Ticket";

interface TicketNoteData {
  note: string;
  id?: number | string;
}

const UpdateTicketNoteService = async (
  ticketNoteData: TicketNoteData,
  companyId: number
): Promise<TicketNote> => {
  const { id, note } = ticketNoteData;

  // [W1-SEC-IDOR] TicketNote sin companyId → propiedad validada vía el ticket
  // dueño (include required + where companyId). Impide editar notas ajenas.
  const ticketNote = await TicketNote.findOne({
    where: { id },
    include: [
      {
        model: Ticket,
        as: "ticket",
        required: true,
        where: { companyId },
        attributes: ["id"]
      }
    ]
  });

  if (!ticketNote) {
    throw new AppError("ERR_NO_TICKETNOTE_FOUND", 404);
  }

  await ticketNote.update({
    note
  });

  return ticketNote;
};

export default UpdateTicketNoteService;
