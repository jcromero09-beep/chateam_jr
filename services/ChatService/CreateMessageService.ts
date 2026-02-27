import { Op } from "sequelize";
import Chat from "../../models/Chat";
import ChatMessage from "../../models/ChatMessage";
import ChatUser from "../../models/ChatUser";
import User from "../../models/User";
import { getIO } from "../../libs/socket";

export interface ChatMessageData {
  senderId: number;
  chatId: number;
  message: string;
  mediaPath?: string;
  mediaName?: string;
  companyId: number;
}

export default async function CreateMessageService({
  senderId,
  chatId,
  message,
  mediaPath,
  mediaName,
  companyId
}: ChatMessageData) {
  const newMessage = await ChatMessage.create({
    senderId,
    chatId,
    message,
    mediaPath,
    mediaName,
    companyId,
    status: 'delivered', // Marcamos como entregado inmediatamente
    deliveredAt: new Date() // Fecha de entrega
  });

  await newMessage.reload({
    include: [
      { model: User, as: "sender", attributes: ["id", "name"] },
      {
        model: Chat,
        as: "chat",
        include: [{ model: ChatUser, as: "users" }]
      }
    ]
  });

  const sender = await User.findByPk(senderId);

  // Actualizar último mensaje del chat
  let lastMessageText = `${sender.name}: ${message}`;
  if (mediaName && !message) {
    lastMessageText = `${sender.name}: 📎 ${mediaName}`;
  } else if (mediaName && message) {
    lastMessageText = `${sender.name}: ${message} 📎 ${mediaName}`;
  }

  await newMessage.chat.update({ lastMessage: lastMessageText });

  const chatUsers = await ChatUser.findAll({
    where: { chatId }
  });

  for (let chatUser of chatUsers) {
    if (chatUser.userId === senderId) {
      await chatUser.update({ unreads: 0 });
    } else {
      await chatUser.update({ unreads: chatUser.unreads + 1 });
    }
  }

  // Emitir evento de estado del mensaje
  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-chat-${chatId}`, {
      action: "messageStatusUpdate",
      messageId: newMessage.id,
      status: 'delivered',
      deliveredAt: newMessage.deliveredAt
    });

  return newMessage;
}
