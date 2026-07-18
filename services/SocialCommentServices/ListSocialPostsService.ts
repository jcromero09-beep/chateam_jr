/**
 * Service: ListSocialPostsService
 * Lista posts de Facebook/Instagram que tienen al menos un comentario,
 * con contadores agregados (totalComments / pendingComments) en UNA sola
 * query extra (sin N+1). Multi-tenant: filtra siempre por companyId.
 */

import { Op, literal, fn, col } from "sequelize";
import UGCSocialPost from "../../models/UGCSocialPost";
import UGCPostComment from "../../models/UGCPostComment";
import { SocialPostDTO, toSocialPostDTO } from "./dto";

interface Request {
  companyId: number;
  platform?: string;
  pageNumber?: string;
}

interface Response {
  records: SocialPostDTO[];
  count: number;
  hasMore: boolean;
}

interface CommentCountRow {
  socialPostId: number;
  totalComments: string;
  pendingComments: string;
}

const ALLOWED_PLATFORMS = ["facebook", "instagram"];
const PAGE_SIZE = 20;

const ListSocialPostsService = async ({
  companyId,
  platform,
  pageNumber = "1"
}: Request): Promise<Response> => {
  const limit = PAGE_SIZE;
  const page = Math.max(parseInt(pageNumber, 10) || 1, 1);
  const offset = limit * (page - 1);

  const platforms =
    platform && ALLOWED_PLATFORMS.includes(platform)
      ? [platform]
      : ALLOWED_PLATFORMS;

  // Posts que tienen al menos 1 comentario no eliminado (subquery, sin include pesado)
  const { count, rows } = await UGCSocialPost.findAndCountAll({
    where: {
      companyId,
      platform: { [Op.in]: platforms },
      id: {
        [Op.in]: literal(
          `(SELECT DISTINCT "socialPostId" FROM "UGCPostComments" ` +
            `WHERE "companyId" = ${Number(companyId)} AND "isDeleted" = false)`
        )
      }
    },
    order: [literal(`"publishedAt" DESC NULLS LAST, "id" DESC`)],
    limit,
    offset
  });

  // Una sola query agregada para contadores de todos los posts de la página
  const postIds = rows.map(p => p.id);
  const countsMap = new Map<
    number,
    { pendingComments: number; totalComments: number }
  >();

  if (postIds.length > 0) {
    const countRows = (await UGCPostComment.findAll({
      attributes: [
        "socialPostId",
        [fn("COUNT", col("id")), "totalComments"],
        [
          literal(
            `COUNT(*) FILTER (WHERE "autoReplyStatus" = 'pending')`
          ),
          "pendingComments"
        ]
      ],
      where: {
        companyId,
        isDeleted: false,
        socialPostId: { [Op.in]: postIds }
      },
      group: ["socialPostId"],
      raw: true
    })) as unknown as CommentCountRow[];

    countRows.forEach(row => {
      countsMap.set(Number(row.socialPostId), {
        totalComments: Number(row.totalComments) || 0,
        pendingComments: Number(row.pendingComments) || 0
      });
    });
  }

  const records = rows.map(post =>
    toSocialPostDTO(
      post,
      countsMap.get(post.id) || { pendingComments: 0, totalComments: 0 }
    )
  );

  const hasMore = count > offset + rows.length;

  return { records, count, hasMore };
};

export default ListSocialPostsService;
