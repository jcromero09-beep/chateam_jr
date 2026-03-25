import AppError from "../../errors/AppError";
import QuickMessage from "../../models/QuickMessage";
import QuickReplySemanticService from "../../services/AIAgentServices/QuickReplySemanticService";
import logger from "../../utils/logger";

interface Data {
  shortcode: string;
  message: string;
  userId: number | string;
  id?: number | string;
  geral: boolean;
  mediaPath?: string | null;
  visao: boolean;
  /** Texto de intención para búsqueda semántica por IA */
  intent?: string;
  /** Si true, genera embedding del intent y habilita uso por IA */
  isAiEnabled?: boolean;
}

const UpdateService = async (data: Data): Promise<QuickMessage> => {
  const { id, shortcode, message, userId, geral, mediaPath, visao, intent, isAiEnabled } = data;

  const record = await QuickMessage.findByPk(id);

  if (!record) {
    throw new AppError("ERR_NO_TICKETNOTE_FOUND", 404);
  }

  if (!record.geral && record.visao && record.userId !== userId) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const wasAiEnabled = record.isAiEnabled;
  const hadIntent = !!record.intent;

  await record.update({
    shortcode,
    message,
    geral,
    mediaPath,
    visao,
    ...(intent !== undefined && { intent }),
    ...(isAiEnabled !== undefined && { isAiEnabled })
  });

  // ✅ Hook: regenerar embedding si cambió intent o se habilitó IA
  const shouldSync = (intent && isAiEnabled) || (isAiEnabled && !wasAiEnabled && intent);
  if (shouldSync) {
    try {
      await QuickReplySemanticService.syncEmbedding(record.id);
      logger.info(`[QuickMessage/Update] Embedding sincronizado: qmId=${record.id}, intent="${intent || record.intent}"`);
    } catch (embedErr: any) {
      logger.warn(`[QuickMessage/Update] Error generando embedding: ${embedErr.message}`);
    }
  } else if (!isAiEnabled && wasAiEnabled && hadIntent) {
    // Si se desactivó IA, limpiar embedding
    try {
      await record.update({ intentEmbedding: null });
      logger.info(`[QuickMessage/Update] Embedding limpiado (IA desactivada): qmId=${record.id}`);
    } catch (cleanErr: any) {
      logger.warn(`[QuickMessage/Update] Error limpiando embedding: ${cleanErr.message}`);
    }
  }

  return record;
};

export default UpdateService;
