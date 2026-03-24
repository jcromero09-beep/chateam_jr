/**
 * Service: CampaignCRUDService
 * Operaciones CRUD para campanas de auto-respuesta de comentarios.
 * Multi-tenant: todas las consultas filtran por companyId.
 * BD SAGRADA: nunca se elimina, solo se marca status='deleted'.
 */

import { Op, fn, col, literal } from "sequelize";
import CommentAutoReplyCampaign from "../../models/CommentAutoReplyCampaign";
import CommentAutoReplyLog from "../../models/CommentAutoReplyLog";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface CreateCampaignData {
  companyId: number;
  name: string;
  campaignType?: "post" | "page" | "all";
  platform?: "facebook" | "instagram";
  pageId?: string;
  pageName?: string;
  pageAccessToken?: string;
  postId?: string;
  postPermalink?: string;
  postDescription?: string;
  postThumbnail?: string;
  replyMode?: "keyword" | "ai" | "generic" | "template";
  triggerMatchingType?: "exact" | "contains";
  keywordRules?: Record<string, unknown>[];
  defaultPublicReply?: string;
  defaultPrivateReply?: string;
  aiEnabled?: boolean;
  aiTrainingData?: string;
  aiAgentIdentityId?: number;
  autoLikeComment?: boolean;
  hideCommentAfterReply?: boolean;
  sendPrivateReply?: boolean;
  sendPublicReply?: boolean;
  offensiveWordsEnabled?: boolean;
  offensiveWords?: string;
  offensiveAction?: "hide" | "delete" | "block";
  offensivePrivateMessage?: string;
  multipleReply?: boolean;
  delayEnabled?: boolean;
  delayMinSeconds?: number;
  delayMaxSeconds?: number;
  status?: "active" | "paused" | "draft";
}

interface ListCampaignsParams {
  companyId: number;
  page?: number;
  limit?: number;
  status?: string;
  platform?: string;
  campaignType?: string;
  search?: string;
}

const ALLOWED_UPDATE_FIELDS = [
  "name", "campaignType", "platform", "pageId", "pageName", "pageAccessToken",
  "postId", "postPermalink", "postDescription", "postThumbnail",
  "replyMode", "triggerMatchingType", "keywordRules",
  "defaultPublicReply", "defaultPrivateReply",
  "aiEnabled", "aiTrainingData", "aiAgentIdentityId",
  "autoLikeComment", "hideCommentAfterReply", "sendPrivateReply", "sendPublicReply",
  "offensiveWordsEnabled", "offensiveWords", "offensiveAction", "offensivePrivateMessage",
  "multipleReply", "delayEnabled", "delayMinSeconds", "delayMaxSeconds", "status"
];

const createCampaign = async (companyId: number, data: Partial<CreateCampaignData>): Promise<CommentAutoReplyCampaign> => {
  if (!companyId) throw new AppError("ERR_CAMPAIGN_COMPANY_REQUIRED", 400);
  if (!data.name) throw new AppError("ERR_CAMPAIGN_NAME_REQUIRED", 400);

  const campaignData = { ...data, companyId };
  const campaign = await CommentAutoReplyCampaign.create(campaignData as any);
  logger.info(`[CampaignCRUD] Campana creada: id=${campaign.id}, name=${data.name}, company=${companyId}`);
  return campaign;
};

const listCampaigns = async (companyId: number, params?: Partial<Omit<ListCampaignsParams, 'companyId'>>) => {
  const { page = 1, limit = 20, status, platform, campaignType, search } = params || {};
  const offset = (page - 1) * limit;

  const where: Record<string, unknown> = {
    companyId,
    status: { [Op.ne]: "deleted" }
  };

  if (status) where.status = status;
  if (platform) where.platform = platform;
  if (campaignType) where.campaignType = campaignType;
  if (search) where.name = { [Op.iLike]: `%${search}%` };

  const { rows, count } = await CommentAutoReplyCampaign.findAndCountAll({
    where,
    limit,
    offset,
    order: [["createdAt", "DESC"]]
  });

  return {
    campaigns: rows,
    count,
    hasMore: offset + rows.length < count,
    page,
    limit
  };
};

const showCampaign = async (companyId: number, id: number): Promise<CommentAutoReplyCampaign> => {
  const campaign = await CommentAutoReplyCampaign.findOne({
    where: { id, companyId, status: { [Op.ne]: "deleted" } }
  });

  if (!campaign) throw new AppError("ERR_CAMPAIGN_NOT_FOUND", 404);
  return campaign;
};

const updateCampaign = async (
  companyId: number,
  id: number,
  data: Partial<CreateCampaignData>
): Promise<CommentAutoReplyCampaign> => {
  const campaign = await showCampaign(companyId, id);

  // Filtrar solo campos permitidos
  const updateData: Record<string, unknown> = {};
  for (const field of ALLOWED_UPDATE_FIELDS) {
    if (field in data) {
      updateData[field] = (data as Record<string, unknown>)[field];
    }
  }

  await campaign.update(updateData);
  logger.info(`[CampaignCRUD] Campana actualizada: id=${id}, company=${companyId}`);
  return campaign;
};

const softDeleteCampaign = async (companyId: number, id: number): Promise<void> => {
  const campaign = await showCampaign(companyId, id);
  await campaign.update({ status: "deleted" });
  logger.info(`[CampaignCRUD] Campana eliminada (soft): id=${id}, company=${companyId}`);
};

const activateCampaign = async (companyId: number, id: number): Promise<CommentAutoReplyCampaign> => {
  const campaign = await showCampaign(companyId, id);
  await campaign.update({ status: "active" });
  logger.info(`[CampaignCRUD] Campana activada: id=${id}, company=${companyId}`);
  return campaign;
};

const pauseCampaign = async (companyId: number, id: number): Promise<CommentAutoReplyCampaign> => {
  const campaign = await showCampaign(companyId, id);
  await campaign.update({ status: "paused" });
  logger.info(`[CampaignCRUD] Campana pausada: id=${id}, company=${companyId}`);
  return campaign;
};

const getDashboardStats = async (companyId: number) => {
  // Totales de campanas
  const totalCampaigns = await CommentAutoReplyCampaign.count({
    where: { companyId, status: { [Op.ne]: "deleted" } }
  });

  const activeCampaigns = await CommentAutoReplyCampaign.count({
    where: { companyId, status: "active" }
  });

  // Sumar contadores de todas las campanas activas
  const aggregates = await CommentAutoReplyCampaign.findOne({
    where: { companyId, status: { [Op.ne]: "deleted" } },
    attributes: [
      [fn("COALESCE", fn("SUM", col("totalRepliesSent")), 0), "totalRepliesSent"],
      [fn("COALESCE", fn("SUM", col("totalPrivateRepliesSent")), 0), "totalPrivateReplies"],
      [fn("COALESCE", fn("SUM", col("totalCommentsHidden")), 0), "totalHidden"],
      [fn("COALESCE", fn("SUM", col("totalCommentsDeleted")), 0), "totalDeleted"],
      [fn("COALESCE", fn("SUM", col("totalLikesGiven")), 0), "totalLikesGiven"]
    ],
    raw: true
  }) as unknown as Record<string, number> | null;

  // Respuestas por dia (ultimos 7 dias)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const repliesByDay = await CommentAutoReplyLog.findAll({
    where: {
      companyId,
      createdAt: { [Op.gte]: sevenDaysAgo }
    },
    attributes: [
      [fn("DATE", col("createdAt")), "date"],
      [fn("COUNT", col("id")), "count"]
    ],
    group: [literal("DATE(\"createdAt\")") as any],
    order: [[literal("DATE(\"createdAt\")") as any, "ASC"]],
    raw: true
  });

  // Ultimos 10 logs
  const recentLogs = await CommentAutoReplyLog.findAll({
    where: { companyId },
    order: [["createdAt", "DESC"]],
    limit: 10
  });

  return {
    totalCampaigns,
    activeCampaigns,
    totalRepliesSent: aggregates?.totalRepliesSent ?? 0,
    totalPrivateReplies: aggregates?.totalPrivateReplies ?? 0,
    totalHidden: aggregates?.totalHidden ?? 0,
    totalDeleted: aggregates?.totalDeleted ?? 0,
    totalLikesGiven: aggregates?.totalLikesGiven ?? 0,
    repliesByDay,
    recentLogs
  };
};

export {
  createCampaign,
  listCampaigns,
  showCampaign,
  updateCampaign,
  softDeleteCampaign,
  activateCampaign,
  pauseCampaign,
  getDashboardStats
};
