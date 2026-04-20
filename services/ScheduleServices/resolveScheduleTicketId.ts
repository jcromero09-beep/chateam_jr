import { Op } from "sequelize";

import Ticket from "../../models/Ticket";
import CreateTicketService from "../TicketServices/CreateTicketService";

interface Request {
  companyId: number | string;
  contactId?: number | string | null;
  ticketId?: number | string | null;
  userId?: number | string | null;
  queueId?: number | string | null;
  whatsappId?: number | string | null;
  statusTicket?: string;
  createIfMissing?: boolean;
}

const normalizeId = (
  value?: number | string | null
): number | undefined => {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return undefined;
  }

  return numericValue;
};

const findLatestTicket = async ({
  companyId,
  contactId,
  whatsappId
}: {
  companyId: number;
  contactId: number;
  whatsappId?: number;
}): Promise<Ticket | null> => {
  const baseWhere = {
    companyId,
    contactId,
    ...(whatsappId ? { whatsappId } : {})
  };

  const openTicket = await Ticket.findOne({
    where: {
      ...baseWhere,
      status: {
        [Op.in]: ["open", "pending", "group", "nps", "lgpd"]
      }
    },
    order: [["updatedAt", "DESC"], ["id", "DESC"]]
  });

  if (openTicket) {
    return openTicket;
  }

  return Ticket.findOne({
    where: baseWhere,
    order: [["updatedAt", "DESC"], ["id", "DESC"]]
  });
};

const resolveScheduleTicketId = async ({
  companyId,
  contactId,
  ticketId,
  userId,
  queueId,
  whatsappId,
  statusTicket,
  createIfMissing = false
}: Request): Promise<number | undefined> => {
  const numericCompanyId = normalizeId(companyId);
  const numericContactId = normalizeId(contactId);
  const numericWhatsappId = normalizeId(whatsappId);
  const explicitTicketId = normalizeId(ticketId);

  if (!numericCompanyId) {
    return undefined;
  }

  if (explicitTicketId) {
    const existingExplicitTicket = await Ticket.findOne({
      where: {
        id: explicitTicketId,
        companyId: numericCompanyId
      }
    });

    return existingExplicitTicket?.id;
  }

  if (!numericContactId) {
    return undefined;
  }

  const existingTicket = await findLatestTicket({
    companyId: numericCompanyId,
    contactId: numericContactId,
    whatsappId: numericWhatsappId
  });

  if (existingTicket) {
    return existingTicket.id;
  }

  if (!createIfMissing) {
    return undefined;
  }

  const createdTicket = await CreateTicketService({
    contactId: numericContactId,
    status: statusTicket || "open",
    userId: normalizeId(userId) || 0,
    queueId: normalizeId(queueId),
    companyId: numericCompanyId,
    whatsappId: numericWhatsappId ? String(numericWhatsappId) : ""
  });

  if ((statusTicket || "").toLowerCase() === "closed" && createdTicket.status !== "closed") {
    await createdTicket.update({ status: "closed" });
  }

  return createdTicket.id;
};

export default resolveScheduleTicketId;
