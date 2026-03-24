/**
 * Service: SchedulePublishService
 * Programa una publicacion social para una fecha futura.
 * Actualiza scheduledAt y status='scheduled' en el post
 * y encola el job en UGCSocialPublishQueue con delay.
 */

import UGCSocialPost from "../../models/UGCSocialPost";
import { add } from "../../queues";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface SchedulePublishRequest {
  companyId: number;
  socialPostId: number;
  scheduledAt: string | Date;
}

interface SchedulePublishResponse {
  socialPostId: number;
  scheduledAt: Date;
  status: string;
}

const SchedulePublishService = async (
  params: SchedulePublishRequest
): Promise<SchedulePublishResponse> => {
  const { companyId, socialPostId, scheduledAt } = params;

  // Validar fecha
  const scheduledDate = new Date(scheduledAt);

  if (isNaN(scheduledDate.getTime())) {
    throw new AppError("ERR_UGC_SCHEDULE_INVALID_DATE", 400);
  }

  if (scheduledDate <= new Date()) {
    throw new AppError("ERR_UGC_SCHEDULE_DATE_IN_PAST", 400);
  }

  // Buscar el post
  const post = await UGCSocialPost.findOne({
    where: { id: socialPostId, companyId }
  });

  if (!post) {
    throw new AppError("ERR_UGC_SOCIAL_POST_NOT_FOUND", 404);
  }

  // Solo se puede programar desde draft, scheduled o failed
  if (!["draft", "scheduled", "failed"].includes(post.status)) {
    throw new AppError(
      "ERR_UGC_SOCIAL_POST_INVALID_STATUS_FOR_SCHEDULE",
      400
    );
  }

  // Actualizar post
  await post.update({
    scheduledAt: scheduledDate,
    status: "scheduled"
  });

  // Calcular delay en ms
  const delayMs = scheduledDate.getTime() - Date.now();

  // Encolar con delay
  try {
    await add(
      "UGCSocialPublishQueue",
      {
        companyId,
        socialPostId: post.id,
        scheduledAt: scheduledDate.toISOString()
      },
      {
        delay: delayMs,
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 30000
        }
      }
    );
  } catch (queueErr: unknown) {
    const errMsg = queueErr instanceof Error ? queueErr.message : String(queueErr);
    logger.warn(
      `[SchedulePublishService] Error encolando publicacion programada: ${errMsg}. ` +
      `El post queda en status=scheduled pero no en cola.`
    );
  }

  logger.info(
    `[SchedulePublishService] Publicacion programada: postId=${post.id}, ` +
    `scheduledAt=${scheduledDate.toISOString()}, delayMs=${delayMs}, ` +
    `company=${companyId}`
  );

  return {
    socialPostId: post.id,
    scheduledAt: scheduledDate,
    status: "scheduled"
  };
};

export default SchedulePublishService;
