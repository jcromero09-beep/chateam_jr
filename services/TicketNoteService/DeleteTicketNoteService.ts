import TicketNote from "../../models/TicketNote";
import Ticket from "../../models/Ticket";
import AppError from "../../errors/AppError";

const DeleteTicketNoteService = async (
  id: string,
  companyId: number
): Promise<void> => {
  // [W1-SEC-IDOR] TicketNote sin companyId → propiedad validada vía el ticket
  // dueño (include required + where companyId). Impide borrar notas ajenas.
  const ticketnote = await TicketNote.findOne({
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

  if (!ticketnote) {
    throw new AppError("ERR_NO_TICKETNOTE_FOUND", 404);
  }

  await ticketnote.destroy();
};

export default DeleteTicketNoteService;
