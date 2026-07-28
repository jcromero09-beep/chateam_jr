/**
 * wbotRating.ts — [Refactor Ola 1] Predicado puro de rating extraído de
 * wbotMessageListener. Nota: handleRating permanece en el monolito por ahora —
 * depende de verifyMessage (definida in-file), así que moverla crearía un import
 * circular. Extracción parcial deliberada (solo la parte pura).
 */
import TicketTraking from "../../models/TicketTraking";

export const verifyRating = (ticketTraking: TicketTraking): boolean => {
  if (
    ticketTraking &&
    ticketTraking.finishedAt === null &&
    ticketTraking.closedAt !== null &&
    ticketTraking.userId !== null &&
    ticketTraking.ratingAt === null
  ) {
    return true;
  }
  return false;
};
