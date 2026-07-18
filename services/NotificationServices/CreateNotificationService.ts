import Notification, {
  NotificationCategory,
  NotificationType
} from "../../models/Notification";
import { getIO } from "../../libs/socket";
import logger from "../../utils/logger";

interface CreateNotificationData {
  companyId: number;
  userId: number;
  type?: NotificationType;
  category?: NotificationCategory;
  title: string;
  message?: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
}

/**
 * Crea una notificación en BD y emite evento Socket.IO al destinatario.
 *
 * Evento emitido (namespace = companyId):
 *   `user-${userId}-notification` → payload: Notification
 *
 * Falla silenciosamente para no interrumpir el flujo del caller (la creación
 * de la cita o entidad de origen NO debe abortarse si falla la notificación).
 */
const CreateNotificationService = async (
  data: CreateNotificationData
): Promise<Notification | null> => {
  try {
    const notification = await Notification.create({
      companyId: data.companyId,
      userId: data.userId,
      type: data.type || "info",
      category: data.category || "system",
      title: data.title,
      message: data.message || null,
      actionUrl: data.actionUrl || null,
      metadata: data.metadata || null,
      isRead: false
    } as any);

    // Emitir evento Socket.IO al usuario destinatario
    try {
      const io = getIO();
      io.of(String(data.companyId)).emit(
        `user-${data.userId}-notification`,
        {
          action: "create",
          notification
        }
      );
    } catch (socketErr: any) {
      logger.warn(
        `[CreateNotification] Socket emit falló (notificación creada igual): ${socketErr.message}`
      );
    }

    return notification;
  } catch (err: any) {
    logger.error(`[CreateNotification] Error creando notificación: ${err.message}`);
    return null;
  }
};

export default CreateNotificationService;
