import * as Yup from "yup";
import AppError from "../../errors/AppError";
import QuickMessage from "../../models/QuickMessage";
import QuickReplySemanticService from "../../services/AIAgentServices/QuickReplySemanticService";
import QuickReplyIntentSuggestionService from "../../services/AIAgentServices/QuickReplyIntentSuggestionService";
import logger from "../../utils/logger";

interface Data {
  shortcode: string;
  message: string;
  companyId: number | string;
  userId: number | string;
  geral: boolean;
  isMedia: boolean;
  mediaPath?: string | null;
  mediaName?: string | null;
  visao: boolean;
  /** Texto de intención para búsqueda semántica por IA (ej: "saludo informal", "pedir email") */
  intent?: string;
  /** Key estable para búsqueda IA (ej: location_question, plan_gold_selection) */
  intentKey?: string;
  /** Si true, genera embedding del intent y habilita uso por IA */
  isAiEnabled?: boolean;
}

const CreateService = async (data: Data): Promise<QuickMessage> => {
  const { shortcode, message, isMedia } = data;

  const ticketnoteSchema = Yup.object().shape({
    shortcode: Yup.string()
      .min(1, "ERR_QUICKMESSAGE_INVALID_NAME")
      .required("ERR_QUICKMESSAGE_REQUIRED"),
    message: isMedia ? Yup.string().notRequired() : Yup.string()
      .min(3, "ERR_QUICKMESSAGE_INVALID_NAME")
      .required("ERR_QUICKMESSAGE_REQUIRED")
  });

  try {
    await ticketnoteSchema.validate({ shortcode, message });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  if (data.isAiEnabled && (!data.intent || !data.intentKey)) {
    try {
      const suggestion = await QuickReplyIntentSuggestionService.suggest({
        companyId: Number(data.companyId),
        shortcode: data.shortcode,
        message: data.message,
        mediaName: data.mediaPath || undefined
      });
      data.intent = data.intent || suggestion.intent;
      data.intentKey = data.intentKey || suggestion.intentKey;
    } catch (suggestErr: any) {
      logger.warn(`[QuickMessage/Create] Error sugiriendo intent IA: ${suggestErr.message}`);
    }
  }

  // Unificación geral/visao: "geral" es el flag autoritativo de "Global" en la UI.
  // Mantenemos "visao" sincronizado como espejo legado para no romper consumidores antiguos.
  const isGlobal = Boolean(data.geral) || Boolean(data.visao);

  const record = await QuickMessage.create({
    ...data,
    geral: isGlobal,
    visao: isGlobal,
    companyId: Number(data.companyId),
    userId: Number(data.userId)
  } as any);

  // ✅ Hook: generar embedding semántico si IA habilitada
  if (data.intent && data.isAiEnabled) {
    try {
      await QuickReplySemanticService.syncEmbedding(record.id);
      logger.info(`[QuickMessage/Create] Embedding generado: qmId=${record.id}, intent="${data.intent}"`);
    } catch (embedErr: any) {
      logger.warn(`[QuickMessage/Create] Error generando embedding: ${embedErr.message}`);
    }
  }

  return record;
};

export default CreateService;
