/**
 * ListTikTokPostsService — Lista videos/posts de TikTok por conexion
 */
import UGCSocialPost from "../../models/UGCSocialPost";
import UGCSocialAccount from "../../models/UGCSocialAccount";
import logger from "../../utils/logger";

interface ListTikTokPostsRequest {
  companyId: number;
  page?: number;
  limit?: number;
}

interface ListTikTokPostsResponse {
  posts: UGCSocialPost[];
  total: number;
  page: number;
  limit: number;
}

const ListTikTokPostsService = async ({
  companyId,
  page = 1,
  limit = 20,
}: ListTikTokPostsRequest): Promise<ListTikTokPostsResponse> => {
  const offset = (page - 1) * limit;

  const { rows: posts, count: total } = await UGCSocialPost.findAndCountAll({
    where: {
      companyId,
      platform: "tiktok",
    },
    order: [["publishedAt", "DESC"]],
    limit,
    offset,
    include: [
      {
        model: UGCSocialAccount,
        as: "socialAccount",
        attributes: ["id", "username", "displayName", "profileImageUrl"],
      },
    ],
  });

  return { posts, total, page, limit };
};

export default ListTikTokPostsService;
