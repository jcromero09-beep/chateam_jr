/**
 * Service: ReplyLogService
 * Consulta y estadisticas de logs de auto-respuesta de comentarios.
 * Multi-tenant: todas las consultas filtran por companyId.
 */

import { Op, fn, col, literal } from "sequelize";
import CommentAutoReplyLog from "../../models/CommentAutoReplyLog";
import CommentAutoReplyCampaign from "../../models/CommentAutoReplyCampaign";

interface ListLogsParams {
  companyId: number;
  page?: number;
  limit?: number;
  campaignId?: number;
  publicReplyStatus?: string;
  replySource?: string;
}

const listLogs = async (companyId: number, campaignId?: number, params?: Partial<Omit<ListLogsParams, 'companyId' | 'campaignId'>>) => {
  const { page = 1, limit = 20, publicReplyStatus, replySource } = params || {};
  const offset = (page - 1) * limit;

  const where: Record<string, unknown> = { companyId };

  if (campaignId) where.campaignId = campaignId;
  if (publicReplyStatus) where.publicReplyStatus = publicReplyStatus;
  if (replySource) where.replySource = replySource;

  const { rows, count } = await CommentAutoReplyLog.findAndCountAll({
    where,
    limit,
    offset,
    order: [["createdAt", "DESC"]],
    include: [
      {
        model: CommentAutoReplyCampaign,
        as: "campaign",
        attributes: ["id", "name", "platform", "campaignType"]
      }
    ]
  });

  return {
    logs: rows,
    count,
    hasMore: offset + rows.length < count,
    page,
    limit
  };
};

const getCampaignStats = async (companyId: number, campaignId?: number) => {
  const where: Record<string, unknown> = { companyId };
  if (campaignId) where.campaignId = campaignId;

  // Conteo por estado de respuesta publica
  const byStatus = await CommentAutoReplyLog.findAll({
    where,
    attributes: [
      "publicReplyStatus",
      [fn("COUNT", col("id")), "count"]
    ],
    group: ["publicReplyStatus"],
    raw: true
  });

  // Conteo por fuente de respuesta
  const bySource = await CommentAutoReplyLog.findAll({
    where,
    attributes: [
      "replySource",
      [fn("COUNT", col("id")), "count"]
    ],
    group: ["replySource"],
    raw: true
  });

  // Conteo por dia (ultimos 30 dias)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const byDay = await CommentAutoReplyLog.findAll({
    where: {
      ...where,
      createdAt: { [Op.gte]: thirtyDaysAgo }
    },
    attributes: [
      [fn("DATE", col("createdAt")), "date"],
      [fn("COUNT", col("id")), "count"]
    ],
    group: [literal("DATE(\"createdAt\")") as any],
    order: [[literal("DATE(\"createdAt\")") as any, "ASC"]],
    raw: true
  });

  return { byStatus, bySource, byDay };
};

export { listLogs, getCampaignStats };
