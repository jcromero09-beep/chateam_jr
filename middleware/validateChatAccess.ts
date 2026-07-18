import { Request, Response, NextFunction } from "express";
import Chat from "../models/Chat";
import ChatUser from "../models/ChatUser";

interface AuthenticatedRequest extends Request {
  user: {
    id: number;
    profile: string;
    companyId: number;
    super?: boolean;
  };
}

export const validateChatAccess = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id: chatId } = req.params;
    const userId = req.user.id;
    const companyId = req.user.companyId;

    // Validar que chatId sea un número válido
    if (!chatId || isNaN(Number(chatId))) {
      res.status(400).json({ error: "ID de chat inválido" });
      return;
    }

    // Verificar que el chat existe y pertenece a la empresa del usuario
    const chat = await Chat.findOne({
      where: {
        id: Number(chatId),
        companyId: companyId
      }
    });

    if (!chat) {
      res.status(404).json({ error: "Chat no encontrado o no tienes acceso a él" });
      return;
    }

    // Verificar que el usuario es miembro del chat
    const chatUser = await ChatUser.findOne({
      where: {
        chatId: Number(chatId),
        userId: userId
      }
    });

    if (!chatUser) {
      res.status(403).json({ error: "No tienes acceso a este chat" });
      return;
    }

    // Verificación admin/owner para PUT y DELETE
    const method = req.method;
    if (method === 'PUT' || method === 'DELETE') {
      const isOwner = chat.ownerId === userId;
      const isAdmin = req.user.profile === 'admin';
      const isSuper = req.user.super === true;

      if (!isOwner && !isAdmin && !isSuper) {
        res.status(403).json({ error: "Solo el creador del chat, admins o super pueden realizar esta accion" });
        return;
      }
    }

    // Si todas las validaciones pasan, continuar
    next();
  } catch (error) {
    console.error("Error validating chat access:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};
