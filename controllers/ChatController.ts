import * as Yup from "yup";
import { Request, Response } from "express";
import { getIO } from "../libs/socket";

import CreateService from "../services/ChatService/CreateService";
import ListService from "../services/ChatService/ListService";
import ShowFromUuidService from "../services/ChatService/ShowFromUuidService";
import DeleteService from "../services/ChatService/DeleteService";
import FindMessages from "../services/ChatService/FindMessages";
import UpdateService from "../services/ChatService/UpdateService";

import Chat from "../models/Chat";
import ChatMessage from "../models/ChatMessage";
import CreateMessageService from "../services/ChatService/CreateMessageService";
import User from "../models/User";
import ChatUser from "../models/ChatUser";
import { log } from "console";

type IndexQuery = {
    pageNumber: string;
    companyId: string | number;
    ownerId?: number;
};

type StoreData = {
    users: any[];
    title: string;
};

type FindParams = {
    companyId: number;
    ownerId?: number;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
    const { pageNumber } = req.query as unknown as IndexQuery;
    const ownerId = +req.user.id;

    const { records, count, hasMore } = await ListService({
        ownerId,
        pageNumber
    });

    return res.json({ records, count, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
    const { companyId } = req.user;
    const ownerId = +req.user.id;
    const data = req.body as StoreData;

    //console.log(`Chat recibido: ${JSON.stringify(data)}`);

    const record = await CreateService({
        ...data,
        ownerId,
        companyId
    });

    const io = getIO();
    //console.log(`user chat: ${JSON.stringify(record.users)}`);

    record.users.forEach(user => {
        //console.log(`chat user: ${user.userId}`);
        io.of(String(companyId))
            .emit(`company-${companyId}-chat-user-${user.userId}`, {
                action: "create",
                record
            });
    });

    return res.status(200).json(record);
};

export const update = async (
    req: Request,
    res: Response
): Promise<Response> => {
    const { companyId } = req.user;
    const data = req.body;
    const { id } = req.params;

    const record = await UpdateService({
        ...data,
        id: +id
    });

    const io = getIO();

    record.users.forEach(user => {
        io.of(String(companyId))
            .emit(`company-${companyId}-chat-user-${user.userId}`, {
                action: "update",
                record,
                userId: user.userId
            });
    });

    return res.status(200).json(record);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;

    const record = await ShowFromUuidService(id);

    return res.status(200).json(record);
};

export const remove = async (
    req: Request,
    res: Response
): Promise<Response> => {
    const { id } = req.params;
    const { companyId } = req.user;

    await DeleteService(id);

    const io = getIO();
    io.of(String(companyId))
        .emit(`company-${companyId}-chat`, {
            action: "delete",
            id
        });

    return res.status(200).json({ message: "Chat eliminado" });
};

export const saveMessage = async (
    req: Request,
    res: Response
): Promise<Response> => {
    const { companyId } = req.user;
    const { message } = req.body;
    const { id } = req.params;
    const senderId = +req.user.id;

    //console.log(`saveMessage: companyId=${companyId}, chatId=${id}, senderId=${senderId}, message=${message}`);
    if (!id || isNaN(Number(id))) {
        return res.status(400).json({ error: "saveMessage: ID de chat inválido" });
    }

    const chatId = Number(id);

    // Manejar archivo adjunto si existe
    let mediaPath = null;
    let mediaName = null;

    if (req.file) {
        mediaPath = `company${companyId}/chat/${chatId}/${req.file.filename}`;
        mediaName = req.file.originalname;
    }

    const newMessage = await CreateMessageService({
        chatId,
        senderId,
        message,
        mediaPath,
        mediaName,
        companyId
    });
    //console.log('newMessage chatcontroller CreateMessageService')

    const chat = await Chat.findByPk(chatId, {
        include: [
            { model: User, as: "owner" },
            { model: ChatUser, as: "users" }
        ]
    });

    const io = getIO();
    io.of(String(companyId))
        .emit(`company-${companyId}-chat-${chatId}`, {
            action: "new-message",
            newMessage,
            chat
        });

    io.of(String(companyId))
        .emit(`company-${companyId}-chat`, {
            action: "new-message",
            newMessage,
            chat
        });

    return res.json(newMessage);
};

export const checkAsRead = async (
    req: Request,
    res: Response
): Promise<Response> => {
    const { companyId } = req.user;
    const { userId } = req.body;
    const { id } = req.params;

    const chatUser = await ChatUser.findOne({ where: { chatId: id, userId } });
    await chatUser.update({ unreads: 0 });

    const chat = await Chat.findByPk(id, {
        include: [
            { model: User, as: "owner" },
            { model: ChatUser, as: "users" }
        ]
    });

    const io = getIO();
    io.of(String(companyId))
        .emit(`company-${companyId}-chat-${id}`, {
            action: "update",
            chat
        });

    io.of(String(companyId))
        .emit(`company-${companyId}-chat`, {
            action: "update",
            chat
        });

    return res.json(chat);
};

export const messages = async (
    req: Request,
    res: Response
): Promise<Response> => {
    const { pageNumber } = req.query as unknown as IndexQuery;
    const { id: chatId } = req.params;
    const ownerId = +req.user.id;

    const { records, count, hasMore } = await FindMessages({
        chatId,
        ownerId,
        pageNumber
    });

    return res.json({ records, count, hasMore });
};

export const pinMessage = async (
    req: Request,
    res: Response
): Promise<Response> => {
    const { messageId } = req.params;
    const { companyId } = req.user;

    try {
        const ChatMessage = (await import("../models/ChatMessage")).default;

        const message = await ChatMessage.findOne({
            where: {
                id: messageId,
                companyId
            }
        });

        if (!message) {
            return res.status(404).json({ error: "Mensaje no encontrado" });
        }

        message.isPinned = true;
        await message.save();

        const io = getIO();
        io.of(String(companyId))
            .emit(`company-${companyId}-chat-message`, {
                action: "pin",
                message
            });

        return res.json({ message: "Mensaje fijado exitosamente", data: message });
    } catch (error) {
        console.error("Error al fijar mensaje:", error);
        return res.status(500).json({ error: "Error interno del servidor" });
    }
};

export const unpinMessage = async (
    req: Request,
    res: Response
): Promise<Response> => {
    const { messageId } = req.params;
    const { companyId } = req.user;

    try {
        const ChatMessage = (await import("../models/ChatMessage")).default;

        const message = await ChatMessage.findOne({
            where: {
                id: messageId,
                companyId
            }
        });

        if (!message) {
            return res.status(404).json({ error: "Mensaje no encontrado" });
        }

        message.isPinned = false;
        await message.save();

        const io = getIO();
        io.of(String(companyId))
            .emit(`company-${companyId}-chat-message`, {
                action: "unpin",
                message
            });

        return res.json({ message: "Mensaje desfijado exitosamente", data: message });
    } catch (error) {
        console.error("Error al desfijar mensaje:", error);
        return res.status(500).json({ error: "Error interno del servidor" });
    }
};

export const getPinnedMessages = async (
    req: Request,
    res: Response
): Promise<Response> => {
    const { id } = req.params;
    const { companyId } = req.user;

    //console.log(`getPinnedMessages: companyId=${companyId}, chatId=${id}`);
    if (!id || isNaN(Number(id))) {
        return res.status(400).json({ error: "getPinnedMessages: ID de chat inválido" });
    }

    const chatId = Number(id);

    try {
        const ChatMessage = (await import("../models/ChatMessage")).default;
        const User = (await import("../models/User")).default;

        const pinnedMessages = await ChatMessage.findAll({
            where: {
                chatId,
                companyId,
                isPinned: true
            },
            include: [
                {
                    model: User,
                    as: "sender",
                    attributes: ["id", "name"]
                }
            ],
            order: [["createdAt", "DESC"]]
        });

        return res.json(pinnedMessages);
    } catch (error) {
        console.error("Error al obtener mensajes fijados:", error);
        return res.status(500).json({ error: "Error interno del servidor" });
    }
};

// Marcar mensaje como entregado
export const markAsDelivered = async (
    req: Request,
    res: Response
): Promise<Response> => {
    try {
        const { messageId } = req.params;
        const { companyId } = req.user;

        const message = await ChatMessage.findOne({
            where: { id: messageId, companyId }
        });

        if (!message) {
            return res.status(404).json({ error: "Mensaje no encontrado" });
        }

        await message.update({
            status: 'delivered',
            deliveredAt: new Date()
        });

        // Emitir evento via socket
        const io = getIO();
        io.of(String(companyId))
            .emit(`company-${companyId}-chat-${message.chatId}`, {
                action: "messageStatusUpdate",
                messageId: message.id,
                status: 'delivered',
                deliveredAt: message.deliveredAt
            });

        return res.json({ message: "Mensaje marcado como entregado" });
    } catch (error) {
        console.error("Error al marcar mensaje como entregado:", error);
        return res.status(500).json({ error: "Error interno del servidor" });
    }
};

// Marcar mensaje como leído
export const markAsRead = async (
    req: Request,
    res: Response
): Promise<Response> => {
    try {
        const { messageId } = req.params;
        const { companyId } = req.user;

        const message = await ChatMessage.findOne({
            where: { id: messageId, companyId }
        });

        if (!message) {
            return res.status(404).json({ error: "Mensaje no encontrado" });
        }

        await message.update({
            status: 'read',
            readAt: new Date()
        });

        // Emitir evento via socket
        const io = getIO();
        io.of(String(companyId))
            .emit(`company-${companyId}-chat-${message.chatId}`, {
                action: "messageStatusUpdate",
                messageId: message.id,
                status: 'read',
                readAt: message.readAt
            });

        return res.json({ message: "Mensaje marcado como leído" });
    } catch (error) {
        console.error("Error al marcar mensaje como leído:", error);
        return res.status(500).json({ error: "Error interno del servidor" });
    }
};

export const getUnreadCount = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { id: chatId } = req.params;
        if (Number.isNaN(chatId)) {
            return res.status(400).json({ message: "chatId inválido" });
        }

        const { id: userId, companyId } = req.user;

        // 1) Valida que el chat exista y sea de la compañía del usuario
        const chat = await Chat.findOne({ where: { id: chatId, companyId } });
        if (!chat) {
            return res.status(404).json({ message: "Chat no encontrado" });
        }

        // 2) Busca la fila en la tabla pivote ChatUser
        const chatUser = await ChatUser.findOne({
            where: { chatId, userId },
            attributes: ["unreads"]
        });

        if (!chatUser) {
            return res.status(404).json({ message: "No estás asignado a este chat" });
        }

        // 3) Respuesta
        return res.json({
            chatId,
            userId,
            unreads: chatUser.unreads ?? 0
        });
    } catch (err) {
        console.error("getUnreadCount error:", err);
        return res.status(500).json({ message: "Error al obtener no leídos" });
    }
};

// Marcar múltiples mensajes como leídos
export const markMultipleAsRead = async (
    req: Request,
    res: Response
): Promise<Response> => {
    try {
        const { id: chatId } = req.params;
        const { companyId, id: userId } = req.user;

        // Marcar todos los mensajes del chat (excepto los propios) como leídos
        await ChatMessage.update(
            {
                status: 'read',
                readAt: new Date()
            },
            {
                where: {
                    chatId,
                    companyId,
                    senderId: { [require('sequelize').Op.ne]: userId }, // No marcar mensajes propios
                    status: { [require('sequelize').Op.ne]: 'read' } // Solo los no leídos
                }
            }
        );

        // Emitir evento via socket
        const io = getIO();
        io.of(String(companyId))
            .emit(`company-${companyId}-chat-${chatId}`, {
                action: "chatMarkedAsRead",
                chatId,
                userId
            });

        return res.json({ message: "Mensajes marcados como leídos" });
    } catch (error) {
        console.error("Error al marcar mensajes como leídos:", error);
        return res.status(500).json({ error: "Error interno del servidor" });
    }
};
