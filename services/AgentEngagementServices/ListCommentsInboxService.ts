/**
 * Service: ListCommentsInboxService
 * Lista comentarios para la bandeja de entrada con paginacion y filtros.
 * Incluye socialPost, assignedAgent con profilePhotos.
 * Ordenado por postedAt DESC.
 */

import { Op, WhereOptions } from "sequelize";
import UGCPostComment, {
  CommentType,
  AutoReplyStatus,
  CommentPlatform
} from "../../models/UGCPostComment";
import UGCSocialPost from "../../models/UGCSocialPost";
import AgentIdentity from "../../models/AgentIdentity";
import AgentProfilePhoto from "../../models/AgentProfilePhoto";
import logger from "../../utils/logger";

interface ListCommentsInboxRequest {
  companyId: number;
  page?: number;
  limit?: number;
  commentType?: CommentType;
  platform?: CommentPlatform;
  autoReplyStatus?: AutoReplyStatus;
  searchParam?: string;
}

interface ListCommentsInboxResponse {
  comments: UGCPostComment[];
  total: number;
  page: number;
  limit: number;
}

const ListCommentsInboxService = async (
  params: ListCommentsInboxRequest
): Promise<ListCommentsInboxResponse> => {
  const {
    companyId,
    page = 1,
    limit = 20,
    commentType,
    platform,
    autoReplyStatus,
    searchParam
  } = params;

  const offset = (page - 1) * limit;

  const whereClause: WhereOptions = { companyId };

  if (commentType) {
    (whereClause as Record<string, unknown>).commentType = commentType;
  }

  if (platform) {
    (whereClause as Record<string, unknown>).platform = platform;
  }

  if (autoReplyStatus) {
    (whereClause as Record<string, unknown>).autoReplyStatus = autoReplyStatus;
  }

  if (searchParam) {
    (whereClause as Record<string, unknown>)[Op.or as unknown as string] = [
      { content: { [Op.iLike]: `%${searchParam}%` } },
      { authorUsername: { [Op.iLike]: `%${searchParam}%` } }
    ];
  }

  const { rows: comments, count: total } = await UGCPostComment.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: UGCSocialPost,
        as: "socialPost",
        required: false,
        attributes: [
          "id", "platform", "platformPostId", "caption",
          "status", "likes", "comments", "views"
        ]
      },
      {
        model: AgentIdentity,
        as: "assignedAgent",
        required: false,
        attributes: ["id", "name", "usernameSuggestion", "niche", "status"],
        include: [
          {
            model: AgentProfilePhoto,
            as: "profilePhotos",
            required: false,
            attributes: ["id", "imageUrl", "photoType"]
          }
        ]
      }
    ],
    order: [["postedAt", "DESC"]],
    limit,
    offset,
    distinct: true
  });

  logger.info(
    `[ListCommentsInboxService] Listados ${comments.length}/${total} comentarios, ` +
    `company=${companyId}, page=${page}`
  );

  return {
    comments,
    total,
    page,
    limit
  };
};

export default ListCommentsInboxService;
