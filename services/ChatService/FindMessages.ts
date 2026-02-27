import AppError from "../../errors/AppError";
import ChatMessage from "../../models/ChatMessage";
import ChatUser from "../../models/ChatUser";
import User from "../../models/User";
import { Op } from "sequelize";
import { getIO } from "../../libs/socket";

import { sortBy } from "lodash";

interface Request {
  chatId: string;
  ownerId: number;
  pageNumber?: string;
}

interface Response {
  records: ChatMessage[];
  count: number;
  hasMore: boolean;
}

const FindMessages = async ({
  chatId,
  ownerId,
  pageNumber = "1"
}: Request): Promise<Response> => {
  const userInChat = await ChatUser.count({
    where: { chatId, userId: ownerId }
  });

  if (userInChat === 0) {
    throw new AppError("UNAUTHORIZED", 400);
  }

  const limit = 20;
  const offset = limit * (+pageNumber - 1);

  const { count, rows: records } = await ChatMessage.findAndCountAll({
    where: {
      chatId
    },
    include: [{ model: User, as: "sender", attributes: ["id", "name"] }],
    limit,
    offset,

    order: [["createdAt", "DESC"]]
  });

  const hasMore = count > offset + records.length;

  const sorted = sortBy(records, ["id", "ASC"]);

  // Marcar mensajes como leídos (excepto los propios)
  const messagesToMarkAsRead = sorted.filter(msg => 
    msg.senderId !== ownerId && msg.status !== 'read'
  );

  if (messagesToMarkAsRead.length > 0) {
    const messageIds = messagesToMarkAsRead.map(msg => msg.id);
    await ChatMessage.update(
      {
        status: 'read',
        readAt: new Date()
      },
      {
        where: {
          id: messageIds
        }
      }
    );

    // Actualizar los registros localmente
    messagesToMarkAsRead.forEach(msg => {
      msg.status = 'read';
      msg.readAt = new Date();
    });

    // Emitir eventos socket para cada mensaje marcado como leído
    const firstMessage = messagesToMarkAsRead[0];
    if (firstMessage) {
      const chatUser = await ChatUser.findOne({
        where: { chatId, userId: ownerId },
        include: [{ model: User, as: "user", attributes: ["companyId"] }]
      });

      if (chatUser && chatUser.user) {
        const io = getIO();
        messagesToMarkAsRead.forEach(msg => {
          io.of(String(chatUser.user.companyId))
            .emit(`company-${chatUser.user.companyId}-chat-${chatId}`, {
              action: "messageStatusUpdate",
              messageId: msg.id,
              status: 'read',
              readAt: msg.readAt
            });
        });
      }
    }
  }

  return {
    records: sorted,
    count,
    hasMore
  };
};

export default FindMessages;
