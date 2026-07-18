/**
 * ListTikTokCommentsService — Lista comentarios con threading para un post
 */
import UGCPostComment from "../../models/UGCPostComment";
import AgentIdentity from "../../models/AgentIdentity";
import logger from "../../utils/logger";

interface ListTikTokCommentsRequest {
  companyId: number;
  socialPostId: number;
  page?: number;
  limit?: number;
}

interface ListTikTokCommentsResponse {
  comments: UGCPostComment[];
  total: number;
  page: number;
  limit: number;
}

const ListTikTokCommentsService = async ({
  companyId,
  socialPostId,
  page = 1,
  limit = 50,
}: ListTikTokCommentsRequest): Promise<ListTikTokCommentsResponse> => {
  const offset = (page - 1) * limit;

  // Solo top-level comments (parentCommentId IS NULL)
  const { rows: comments, count: total } = await UGCPostComment.findAndCountAll({
    where: {
      companyId,
      socialPostId,
      parentCommentId: null,
    },
    order: [["postedAt", "DESC"]],
    limit,
    offset,
    include: [
      {
        model: UGCPostComment,
        as: "replies",
        order: [["postedAt", "ASC"]],
        include: [
          {
            model: AgentIdentity,
            as: "assignedAgent",
            attributes: ["id", "name", "usernameSuggestion"],
            required: false,
          },
        ],
      },
      {
        model: AgentIdentity,
        as: "assignedAgent",
        attributes: ["id", "name", "usernameSuggestion"],
        required: false,
      },
    ],
  });

  return { comments, total, page, limit };
};

export default ListTikTokCommentsService;
