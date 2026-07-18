/**
 * Service: CommentSettingsService
 * Configuración de modos de respuesta a comentarios FB/IG por conexión
 * (whatsappId) con override opcional por post (socialPostId).
 * Modos: manual | auto_message | ai (mutuamente excluyentes por ámbito).
 */

import CommentResponseSettings, {
  ResponseMode
} from "../../models/CommentResponseSettings";
import Whatsapp from "../../models/Whatsapp";
import UGCSocialPost from "../../models/UGCSocialPost";
import AppError from "../../errors/AppError";
import { getIO } from "../../libs/socket";
import logger from "../../utils/logger";

const VALID_MODES: ResponseMode[] = ["manual", "auto_message", "ai"];
const PAGE_SIZE = 20;

interface ListRequest {
  companyId: number;
  pageNumber?: string;
}

/** Estado de conexión de página FB/IG por conexión (derivado, sin exponer token). */
interface PageConnectionStatus {
  whatsappId: number;
  pageConnected: boolean;
  hasInstagram: boolean;
}

interface ListResponse {
  records: CommentResponseSettings[];
  count: number;
  hasMore: boolean;
  pageStatus: PageConnectionStatus[];
}

interface UpsertRequest {
  companyId: number;
  whatsappId: number;
  socialPostId?: number | null;
  mode: string;
  autoMessage?: string | null;
  aiAgentConfigId?: number | null;
  isActive?: boolean;
}

/** Lista la configuración de la company (paginada) con nombre de la conexión. */
export const listSettings = async ({
  companyId,
  pageNumber = "1"
}: ListRequest): Promise<ListResponse> => {
  const limit = PAGE_SIZE;
  const page = Math.max(parseInt(pageNumber, 10) || 1, 1);
  const offset = limit * (page - 1);

  const { count, rows } = await CommentResponseSettings.findAndCountAll({
    where: { companyId },
    include: [
      {
        model: Whatsapp,
        as: "whatsapp",
        attributes: ["id", "name", "channel"],
        required: false
      },
      {
        model: UGCSocialPost,
        as: "socialPost",
        attributes: ["id", "platform", "caption", "platformPostId"],
        required: false
      }
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset
  });

  const hasMore = count > offset + rows.length;

  // Estado de conexión de página por Whatsapp de la company — se expone solo
  // el boolean derivado (NUNCA el pageAccessToken).
  const whatsapps = await Whatsapp.findAll({
    where: { companyId },
    attributes: [
      "id",
      "pageAccessToken",
      "facebookUserToken",
      "instagramBusinessAccountId"
    ],
    limit: 500,
    offset: 0
  });

  const pageStatus: PageConnectionStatus[] = whatsapps.map(w => ({
    whatsappId: w.id,
    pageConnected: !!(w.pageAccessToken || w.facebookUserToken),
    hasInstagram: !!w.instagramBusinessAccountId
  }));

  return { records: rows, count, hasMore, pageStatus };
};

/**
 * Crea o actualiza la configuración del ámbito (companyId, whatsappId, socialPostId).
 * Valida modo, mensaje automático y pertenencia multi-tenant.
 */
export const upsertSettings = async ({
  companyId,
  whatsappId,
  socialPostId,
  mode,
  autoMessage,
  aiAgentConfigId,
  isActive
}: UpsertRequest): Promise<CommentResponseSettings> => {
  if (!whatsappId) {
    throw new AppError("ERR_WHATSAPP_REQUIRED: whatsappId es requerido", 400);
  }

  if (!VALID_MODES.includes(mode as ResponseMode)) {
    throw new AppError(
      "ERR_INVALID_MODE: El modo debe ser manual, auto_message o ai",
      400
    );
  }

  if (mode === "auto_message" && (!autoMessage || !autoMessage.trim())) {
    throw new AppError(
      "ERR_AUTO_MESSAGE_REQUIRED: El mensaje automático es requerido para el modo auto_message",
      400
    );
  }

  // Multi-tenant: la conexión debe pertenecer a la company
  const whatsapp = await Whatsapp.findOne({
    where: { id: whatsappId, companyId },
    attributes: ["id", "name"]
  });
  if (!whatsapp) {
    throw new AppError("ERR_WHATSAPP_NOT_FOUND: Conexión no encontrada", 404);
  }

  // Override por post: el post debe pertenecer a la company
  const normalizedPostId = socialPostId ?? null;
  if (normalizedPostId !== null) {
    const post = await UGCSocialPost.findOne({
      where: { id: normalizedPostId, companyId },
      attributes: ["id"]
    });
    if (!post) {
      throw new AppError("ERR_POST_NOT_FOUND: Post no encontrado", 404);
    }
  }

  const values = {
    mode: mode as ResponseMode,
    autoMessage:
      mode === "auto_message" ? (autoMessage || "").trim() : autoMessage ?? null,
    aiAgentConfigId: aiAgentConfigId ?? null,
    isActive: isActive ?? true
  };

  let record = await CommentResponseSettings.findOne({
    where: { companyId, whatsappId, socialPostId: normalizedPostId }
  });

  if (record) {
    await record.update(values);
  } else {
    record = await CommentResponseSettings.create({
      companyId,
      whatsappId,
      socialPostId: normalizedPostId,
      ...values
    });
  }

  // Tiempo real: notificar cambio de configuración
  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-comment-settings`, {
    action: "upsert",
    record
  });

  logger.info(
    `[SocialComments] Settings upsert (company ${companyId}, whatsapp ${whatsappId}, post ${normalizedPostId ?? "global"}, mode ${mode})`
  );

  return record;
};
