import Notification from "../../models/Notification";

interface Request {
  companyId: number;
  userId: number;
}

const MarkAllAsReadService = async ({ companyId, userId }: Request): Promise<number> => {
  const [affectedCount] = await Notification.update(
    { isRead: true, readAt: new Date() },
    { where: { companyId, userId, isRead: false } }
  );

  return affectedCount;
};

export default MarkAllAsReadService;
