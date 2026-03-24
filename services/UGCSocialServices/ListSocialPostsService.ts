/**
 * Service: ListSocialPostsService
 * Lista publicaciones sociales con metricas, paginacion y filtros.
 * Include: socialAccount, campaign, agentIdentity.
 */

import { Op, WhereOptions } from "sequelize";
import UGCSocialPost, { SocialPostPlatform } from "../../models/UGCSocialPost";
import UGCSocialAccount from "../../models/UGCSocialAccount";
import UGCCampaign from "../../models/UGCCampaign";
import AgentIdentity from "../../models/AgentIdentity";
import logger from "../../utils/logger";

interface ListSocialPostsRequest {
  companyId: number;
  page?: number;
  limit?: number;
  platform?: SocialPostPlatform;
  socialAccountId?: number;
  campaignId?: number;
  status?: string;
}

interface ListSocialPostsResponse {
  posts: UGCSocialPost[];
  total: number;
  page: number;
  limit: number;
}

const ListSocialPostsService = async (
  params: ListSocialPostsRequest
): Promise<ListSocialPostsResponse> => {
  const {
    companyId,
    page = 1,
    limit = 20,
    platform,
    socialAccountId,
    campaignId,
    status
  } = params;

  const offset = (page - 1) * limit;

  const whereClause: WhereOptions = { companyId };

  if (platform) {
    (whereClause as Record<string, unknown>).platform = platform;
  }

  if (socialAccountId) {
    (whereClause as Record<string, unknown>).socialAccountId = socialAccountId;
  }

  if (campaignId) {
    (whereClause as Record<string, unknown>).ugcCampaignId = campaignId;
  }

  if (status) {
    (whereClause as Record<string, unknown>).status = status;
  }

  const { rows: posts, count: total } = await UGCSocialPost.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: UGCSocialAccount,
        as: "socialAccount",
        required: false,
        attributes: ["id", "platform", "username", "displayName", "followerCount"]
      },
      {
        model: UGCCampaign,
        as: "ugcCampaign",
        required: false,
        attributes: ["id", "name", "status"]
      },
      {
        model: AgentIdentity,
        as: "agentIdentity",
        required: false,
        attributes: ["id", "name", "usernameSuggestion", "niche"]
      }
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true
  });

  logger.info(
    `[ListSocialPostsService] Listados ${posts.length}/${total} posts, ` +
    `company=${companyId}, page=${page}`
  );

  return {
    posts,
    total,
    page,
    limit
  };
};

export default ListSocialPostsService;
