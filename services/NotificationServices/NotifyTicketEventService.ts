import { Op } from "sequelize";
import Contact from "../../models/Contact";
import Notification from "../../models/Notification";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import logger from "../../utils/logger";
import CreateNotificationService from "./CreateNotificationService";

const LOG_PREFIX = "[NotifyTicketEvent]";
const DEDUPE_WINDOW_MS = 60 * 1000;

type TicketNotificationEvent = "created" | "assigned";

const getTicketContactName = async (ticket: Ticket): Promise<string> => {
  const contact = (ticket as any).contact;
  if (contact?.name) return contact.name;

  if (ticket.contactId) {
    const dbContact = await Contact.findByPk(ticket.contactId, {
      attributes: ["id", "name", "number"]
    });
    return dbContact?.name || dbContact?.number || "Cliente";
  }

  return "Cliente";
};

const wasRecentlyNotified = async ({
  companyId,
  userId,
  ticketId,
  event
}: {
  companyId: number;
  userId: number;
  ticketId: number;
  event: TicketNotificationEvent;
}): Promise<boolean> => {
  const since = new Date(Date.now() - DEDUPE_WINDOW_MS);

  const existing = await Notification.findOne({
    where: {
      companyId,
      userId,
      category: "ticket",
      actionUrl: "/tickets",
      createdAt: { [Op.gte]: since },
      metadata: {
        [Op.contains]: {
          ticketId,
          event
        }
      } as any
    } as any
  });

  return Boolean(existing);
};

const NotifyTicketEventService = async (
  ticket: Ticket,
  event: TicketNotificationEvent
): Promise<{ sent: number; recipients: number[] }> => {
  try {
    if (!ticket?.id || !ticket.companyId) {
      return { sent: 0, recipients: [] };
    }

    const recipientIds = new Set<number>();
    const assignedUserId = ticket.userId ? Number(ticket.userId) : null;

    if (event === "assigned" && assignedUserId) {
      recipientIds.add(assignedUserId);
    }

    if (event === "created") {
      if (assignedUserId) {
        recipientIds.add(assignedUserId);
      } else {
        const admins = await User.findAll({
          where: {
            companyId: ticket.companyId,
            profile: "admin"
          } as any,
          attributes: ["id"]
        });

        for (const admin of admins) {
          recipientIds.add(admin.id);
        }
      }
    }

    if (recipientIds.size === 0) {
      return { sent: 0, recipients: [] };
    }

    const contactName = await getTicketContactName(ticket);
    const queueName = (ticket as any).queue?.name;

    const title = event === "assigned"
      ? "Ticket asignado"
      : assignedUserId
        ? "Nuevo ticket asignado"
        : "Nuevo ticket pendiente";

    const messageParts = [
      contactName,
      queueName ? `Cola: ${queueName}` : null,
      ticket.lastMessage ? `Último mensaje: ${ticket.lastMessage}` : null
    ].filter(Boolean);

    const message = messageParts.join(" — ");
    const recipients = Array.from(recipientIds);
    let sent = 0;

    for (const userId of recipients) {
      const alreadyNotified = await wasRecentlyNotified({
        companyId: ticket.companyId,
        userId,
        ticketId: ticket.id,
        event
      });

      if (alreadyNotified) continue;

      const result = await CreateNotificationService({
        companyId: ticket.companyId,
        userId,
        type: event === "assigned" ? "success" : "info",
        category: "ticket",
        title,
        message,
        actionUrl: "/tickets",
        metadata: {
          ticketId: ticket.id,
          contactId: ticket.contactId,
          queueId: ticket.queueId,
          assignedUserId,
          status: ticket.status,
          event
        }
      });

      if (result) sent++;
    }

    logger.info(
      `${LOG_PREFIX} ${sent}/${recipients.length} notificaciones creadas para ticket=${ticket.id}, event=${event}`
    );

    return { sent, recipients };
  } catch (err: any) {
    logger.error(`${LOG_PREFIX} Error general: ${err.message}`);
    return { sent: 0, recipients: [] };
  }
};

export default NotifyTicketEventService;
