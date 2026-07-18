// import AppError from "../../errors/AppError";
// import socketEmit from "../../helpers/socketEmit";
import LogTicket from "../../models/LogTicket";

type logType =
  | "access"
  | "create"
  | "closed"
  | "transfered"
  | "receivedTransfer"
  | "open"
  | "reopen"
  | "pending"
  | "nps"
  | "lgpd"
  | "queue"
  | "userDefine"
  | "delete"
  | "chatBot"
  | "autoClose"
  | "retriesLimitQueue"
  | "retriesLimitUserDefine"
  | "redirect";

interface Request {
  type: logType;
  ticketId: number | string;
  userId?: number | string;
  queueId?: number | string;
}

const CreateLogTicketService = async ({
  type,
  userId,
  ticketId,
  queueId
}: Request): Promise<void> => {
  // Convertir a números para evitar errores de tipo en PostgreSQL
  const ticketIdNum = typeof ticketId === 'string' ? parseInt(ticketId, 10) : ticketId;
  const userIdNum = userId ? (typeof userId === 'string' ? parseInt(userId, 10) : userId) : undefined;
  const queueIdNum = queueId ? (typeof queueId === 'string' ? parseInt(queueId, 10) : queueId) : undefined;

  await LogTicket.create({
    userId: userIdNum,
    ticketId: ticketIdNum,
    type,
    queueId: queueIdNum
  });

  // socketEmit({
  //   companyId,
  //   type: "ticket:update",
  //   payload: ticket
  // });
};

export default CreateLogTicketService;
