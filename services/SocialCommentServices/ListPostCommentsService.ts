/**
 * Service: ListPostCommentsService
 * Lista comentarios top-level de un post (paginados, orden createdAt DESC)
 * con sus replies anidadas (isDeleted=false) vía include separate (sin N+1).
 * Verifica que el post pertenezca a la company (multi-tenant).
 */

import { Op } from "sequelize";
import UGCSocialPost from "../../models/UGCSocialPost";
import UGCPostComment from "../../models/UGCPostComment";
import AppError from "../../errors/AppError";
import { SocialCommentDTO, toSocialCommentDTO } from "./dto";

interface Request {
  companyId: number;
  socialPostId: number;
  pageNumber?: string;
}

interface Response {
  records: SocialCommentDTO[];
  count: number;
  hasMore: boolean;
}

const PAGE_SIZE = 20;

const ListPostCommentsService = async ({
  companyId,
  socialPostId,
  pageNumber = "1"
}: Request): Promise<Response> => {
  // Verificación multi-tenant: el post debe pertenecer a la company
  const post = await UGCSocialPost.findOne({
    where: { id: socialPostId, companyId },
    attributes: ["id"]
  });

  if (!post) {
    throw new AppError("ERR_POST_NOT_FOUND: Post no encontrado", 404);
  }

  const limit = PAGE_SIZE;
  const page = Math.max(parseInt(pageNumber, 10) || 1, 1);
  const offset = limit * (page - 1);

  const { count, rows } = await UGCPostComment.findAndCountAll({
    where: {
      companyId,
      socialPostId,
      parentCommentId: { [Op.is]: null },
      isDeleted: false
    },
    include: [
      {
        model: UGCPostComment,
        as: "replies",
        required: false,
        separate: true,
        where: { isDeleted: false },
        order: [["createdAt", "ASC"]]
      }
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset
  });

  const records = rows.map(toSocialCommentDTO);
  const hasMore = count > offset + rows.length;

  return { records, count, hasMore };
};

export default ListPostCommentsService;
