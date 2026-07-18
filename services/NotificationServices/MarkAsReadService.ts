import Notification from "../../models/Notification";
import AppError from "../../errors/AppError";

interface Request {
  id: number;
  companyId: number;
  userId: number;
}

const MarkAsReadService = async ({ id, companyId, userId }: Request): Promise<Notification> => {
  const notification = await Notification.findOne({
    where: { id, companyId, userId }
  });

  if (!notification) {
    throw new AppError("Notificación no encontrada", 404);
  }

  if (!notification.isRead) {
    await notification.update({ isRead: true, readAt: new Date() });
  }

  return notification;
};

export default MarkAsReadService;
