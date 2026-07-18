import AppError from "../../errors/AppError";
import QuickMessage from "../../models/QuickMessage";
import QuickReplySemanticService from "../../services/AIAgentServices/QuickReplySemanticService";
import QuickReplyIntentSuggestionService from "../../services/AIAgentServices/QuickReplyIntentSuggestionService";
import logger from "../../utils/logger";

interface Data {
  shortcode: string;
  message: string;
  userId: number | string;
  companyId: number | string;
  id?: number | string;
  geral: boolean;
  mediaPath?: string | null;
  mediaName?: string | null;
  visao: boolean;
  /** Texto de intención para búsqueda semántica por IA */
  intent?: string;
  /** Key estable para búsqueda IA */
  intentKey?: string;
  /** Si true, genera embedding del intent y habilita uso por IA */
  isAiEnabled?: boolean;
}

const UpdateService = async (data: Data): Promise<QuickMessage> => {
  const { id, shortcode, message, userId, geral, mediaPath, visao, intent, intentKey, isAiEnabled, companyId } = data;

  const record = await QuickMessage.findOne({ where: { id, companyId } });

  if (!record) {
    throw new AppError("ERR_NO_TICKETNOTE_FOUND", 404);
  }

  if (!record.geral && record.visao && record.userId !== userId) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const wasAiEnabled = record.isAiEnabled;
  const hadIntent = !!record.intent;
  const previousIntent = record.intent;
  const previousIntentKey = record.intentKey;
  const previousShortcode = record.shortcode;
  const previousMessage = record.message;
  const previousMediaPath = record.mediaPath;

  if (isAiEnabled && (!intent && !record.intent || !intentKey && !record.intentKey)) {
    try {
      const suggestion = await QuickReplyIntentSuggestionService.suggest({
        companyId: Number(record.companyId),
        shortcode,
        message,
        mediaName: record.mediaName || mediaPath || undefined,
        mediaUrl: record.mediaPath || undefined
      });
      if (!data.intent && !record.intent) data.intent = suggestion.intent;
      if (!data.intentKey && !record.intentKey) data.intentKey = suggestion.intentKey;
    } catch (suggestErr: any) {
      logger.warn(`[QuickMessage/Update] Error sugiriendo intent IA: ${suggestErr.message}`);
    }
  }

  // Unificación geral/visao: "geral" es el flag autoritativo de "Global" en la UI.
  // Si cualquiera de los dos viene en true, ambos se persisten en true para mantener
  // sincronización con consumidores legados que aún leen "visao".
  const isGlobal = Boolean(geral) || Boolean(visao);

  await record.update({
    shortcode,
    message,
    geral: isGlobal,
    mediaPath,
    visao: isGlobal,
    ...(data.intent !== undefined && { intent: data.intent }),
    ...(data.intentKey !== undefined && { intentKey: data.intentKey }),
    ...(isAiEnabled !== undefined && { isAiEnabled })
  });

  // ✅ Hook: regenerar embedding si cambió intent o se habilitó IA
  const effectiveAiEnabled = isAiEnabled ?? record.isAiEnabled;
  const intentChanged = data.intent !== undefined && data.intent !== previousIntent;
  const intentKeyChanged = data.intentKey !== undefined && data.intentKey !== previousIntentKey;
  const contentChanged = shortcode !== previousShortcode || message !== previousMessage || mediaPath !== previousMediaPath;
  const shouldSync = Boolean(effectiveAiEnabled && record.intent && (!wasAiEnabled || intentChanged || intentKeyChanged || contentChanged));
  if (shouldSync) {
    try {
      await QuickReplySemanticService.syncEmbedding(record.id);
      logger.info(`[QuickMessage/Update] Embedding sincronizado: qmId=${record.id}, key="${record.intentKey || ""}", intent="${record.intent}"`);
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
