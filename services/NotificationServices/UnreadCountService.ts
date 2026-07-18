import Notification from "../../models/Notification";

interface Request {
  companyId: number;
  userId: number;
}

const UnreadCountService = async ({ companyId, userId }: Request): Promise<number> => {
  return Notification.count({
    where: { companyId, userId, isRead: false }
  });
};

export default UnreadCountService;
