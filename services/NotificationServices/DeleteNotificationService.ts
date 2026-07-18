import Notification from "../../models/Notification";
import AppError from "../../errors/AppError";

interface Request {
  id: number;
  companyId: number;
  userId: number;
}

const DeleteNotificationService = async ({ id, companyId, userId }: Request): Promise<void> => {
  const notification = await Notification.findOne({
    where: { id, companyId, userId }
  });

  if (!notification) {
    throw new AppError("Notificación no encontrada", 404);
  }

  await notification.destroy();
};

export default DeleteNotificationService;
