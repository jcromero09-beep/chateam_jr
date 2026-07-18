/**
 * ListTikTokPostsService — Lista videos/posts de TikTok por conexion
 */
import UGCSocialPost from "../../models/UGCSocialPost";
import UGCSocialAccount from "../../models/UGCSocialAccount";
import Whatsapp from "../../models/Whatsapp";

interface ListTikTokPostsRequest {
  companyId: number;
  tiktokId?: number;
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
  tiktokId,
  page = 1,
  limit = 20,
}: ListTikTokPostsRequest): Promise<ListTikTokPostsResponse> => {
  const offset = (page - 1) * limit;
  const where: Record<string, unknown> = {
    companyId,
    platform: "tiktok",
  };

  if (tiktokId) {
    const connection = await Whatsapp.findOne({
      where: { id: tiktokId, companyId, channel: "tiktok" },
      attributes: ["id", "tiktokOpenId"],
    });

    if (!connection?.tiktokOpenId) {
      return { posts: [], total: 0, page, limit };
    }

    const socialAccount = await UGCSocialAccount.findOne({
      where: {
        companyId,
        platform: "tiktok",
        platformAccountId: connection.tiktokOpenId,
      },
      attributes: ["id"],
    });

    if (!socialAccount) {
      return { posts: [], total: 0, page, limit };
    }

    where.socialAccountId = socialAccount.id;
  }

  const { rows: posts, count: total } = await UGCSocialPost.findAndCountAll({
    where,
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
