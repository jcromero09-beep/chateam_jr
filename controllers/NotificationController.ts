import { Request, Response } from "express";
import AppError from "../errors/AppError";

import ListNotificationsService from "../services/NotificationServices/ListNotificationsService";
import MarkAsReadService from "../services/NotificationServices/MarkAsReadService";
import MarkAllAsReadService from "../services/NotificationServices/MarkAllAsReadService";
import DeleteNotificationService from "../services/NotificationServices/DeleteNotificationService";
import UnreadCountService from "../services/NotificationServices/UnreadCountService";

/**
 * Helper para extraer mensaje y status de errores tipo AppError
 * (AppError no extiende Error, requiere acceso directo a propiedades).
 */
const extractError = (err: any): { message: string; statusCode: number } => {
  if (err && typeof err === "object" && "message" in err) {
    return {
      message: String(err.message),
      statusCode: typeof err.statusCode === "number" ? err.statusCode : 500
    };
  }
  return { message: "Error interno del servidor", statusCode: 500 };
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId, id: userId } = req.user as any;
    const { filter, category, type, pageNumber } = req.query as any;

    const result = await ListNotificationsService({
      companyId,
      userId: Number(userId),
      filter,
      category,
      type,
      pageNumber
    });

    return res.json(result);
  } catch (err) {
    const { message, statusCode } = extractError(err);
    return res.status(statusCode).json({ error: message });
  }
};

export const unreadCount = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId, id: userId } = req.user as any;
    const count = await UnreadCountService({
      companyId,
      userId: Number(userId)
    });
    return res.json({ count });
  } catch (err) {
    const { message, statusCode } = extractError(err);
    return res.status(statusCode).json({ error: message });
  }
};

export const markAsRead = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId, id: userId } = req.user as any;
    const { id } = req.params;

    const notification = await MarkAsReadService({
      id: Number(id),
      companyId,
      userId: Number(userId)
    });

    return res.json(notification);
  } catch (err) {
    const { message, statusCode } = extractError(err);
    return res.status(statusCode).json({ error: message });
  }
};

export const markAllAsRead = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId, id: userId } = req.user as any;
    const updated = await MarkAllAsReadService({
      companyId,
      userId: Number(userId)
    });
    return res.json({ success: true, updated });
  } catch (err) {
    const { message, statusCode } = extractError(err);
    return res.status(statusCode).json({ error: message });
  }
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId, id: userId } = req.user as any;
    const { id } = req.params;

    await DeleteNotificationService({
      id: Number(id),
      companyId,
      userId: Number(userId)
    });

    return res.json({ success: true });
  } catch (err) {
    const { message, statusCode } = extractError(err);
    return res.status(statusCode).json({ error: message });
  }
};
