import { Op } from "sequelize";
import Notification from "../../models/Notification";

interface Request {
  companyId: number;
  userId: number;
  filter?: "all" | "unread" | "read";
  category?: string;
  type?: string;
  pageNumber?: string;
}

const PAGE_SIZE = 20;

const ListNotificationsService = async ({
  companyId,
  userId,
  filter = "all",
  category,
  type,
  pageNumber = "1"
}: Request) => {
  const limit = PAGE_SIZE;
  const page = Math.max(1, parseInt(pageNumber, 10) || 1);
  const offset = limit * (page - 1);

  const where: any = { companyId, userId };

  if (filter === "unread") where.isRead = false;
  if (filter === "read") where.isRead = true;
  if (category && category !== "all") where.category = category;
  if (type && type !== "all") where.type = type;

  const { count, rows } = await Notification.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    limit,
    offset
  });

  const unreadCount = await Notification.count({
    where: { companyId, userId, isRead: false }
  });

  const hasMore = count > offset + rows.length;

  return {
    records: rows,
    count,
    unreadCount,
    page,
    hasMore
  };
};

export default ListNotificationsService;
