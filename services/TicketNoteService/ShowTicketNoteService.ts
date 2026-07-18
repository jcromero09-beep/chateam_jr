import TicketNote from "../../models/TicketNote";
import Ticket from "../../models/Ticket";
import AppError from "../../errors/AppError";

const ShowTicketNoteService = async (
  id: string | number,
  companyId: string | number
): Promise<TicketNote> => {
  const ticketNote = await TicketNote.findOne({
    where: { id },
    include: [{ model: Ticket, as: "ticket", where: { companyId }, attributes: ["id"] }]
  });

  if (!ticketNote) {
    throw new AppError("ERR_NO_TICKETNOTE_FOUND", 404);
  }

  return ticketNote;
};

export default ShowTicketNoteService;
