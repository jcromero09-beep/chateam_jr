/**
 * EmailAnalyticsController — Email Marketing Fase 2
 * Endpoints CON auth para dashboard de analytics:
 * - GET /email-analytics/overview — KPIs generales de la company
 * - GET /email-analytics/campaign/:id — Stats detalladas de una campana
 *
 * Multi-tenant: siempre filtra por companyId del usuario autenticado.
 */

import { Request, Response } from "express";
import { fn, col, literal, Op } from "sequelize";
import EmailCampaign from "../models/EmailMarketing/EmailCampaign";
import EmailCampaignRecipient from "../models/EmailMarketing/EmailCampaignRecipient";
import EmailTrackingEvent from "../models/EmailMarketing/EmailTrackingEvent";
import logger from "../utils/logger";

/**
 * GET /email-analytics/overview
 * KPIs generales de email marketing para la company del usuario
 */
export const overview = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;

    // --- KPIs agregados de todas las campanas ---
    const campaignStats = await EmailCampaign.findOne({
      where: { companyId },
      attributes: [
        [fn("COUNT", col("id")), "totalCampaigns"],
        [fn("SUM", col("totalSent")), "totalSent"],
        [fn("SUM", col("totalDelivered")), "totalDelivered"],
        [fn("SUM", col("totalOpened")), "totalOpened"],
        [fn("SUM", col("totalClicked")), "totalClicked"],
        [fn("SUM", col("totalBounced")), "totalBounced"],
        [fn("SUM", col("totalUnsubscribed")), "totalUnsubscribed"],
        [fn("SUM", col("totalSpamComplaints")), "totalSpamComplaints"],
        [fn("SUM", col("totalRecipients")), "totalRecipients"]
      ],
      raw: true
    });

    const stats = campaignStats as unknown as Record<string, string | null>;
    const totalCampaigns = Number(stats?.totalCampaigns || 0);
    const totalSent = Number(stats?.totalSent || 0);
    const totalDelivered = Number(stats?.totalDelivered || 0);
    const totalOpened = Number(stats?.totalOpened || 0);
    const totalClicked = Number(stats?.totalClicked || 0);
    const totalBounced = Number(stats?.totalBounced || 0);
    const totalUnsubscribed = Number(stats?.totalUnsubscribed || 0);
    const totalSpamComplaints = Number(stats?.totalSpamComplaints || 0);

    // Calcular tasas
    const openRate = totalDelivered > 0 ? ((totalOpened / totalDelivered) * 100) : 0;
    const clickRate = totalDelivered > 0 ? ((totalClicked / totalDelivered) * 100) : 0;
    const bounceRate = totalSent > 0 ? ((totalBounced / totalSent) * 100) : 0;
    const unsubscribeRate = totalDelivered > 0 ? ((totalUnsubscribed / totalDelivered) * 100) : 0;

    // --- Emails enviados por dia (ultimos 30 dias) ---
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailySends = await EmailTrackingEvent.findAll({
      where: {
        companyId,
        eventType: "delivery",
        timestamp: { [Op.gte]: thirtyDaysAgo }
      },
      attributes: [
        [fn("DATE", col("timestamp")), "date"],
        [fn("COUNT", col("id")), "count"]
      ],
      group: [fn("DATE", col("timestamp"))],
      order: [[fn("DATE", col("timestamp")), "ASC"]],
      raw: true
    }) as unknown as Array<{ date: string; count: string }>;

    // --- Top 5 campanas por open rate ---
    const topCampaigns = await EmailCampaign.findAll({
      where: {
        companyId,
        totalSent: { [Op.gt]: 0 },
        status: { [Op.in]: ["EN_ANDAMENTO", "FINALIZADA"] }
      },
      attributes: [
        "id",
        "name",
        "subject",
        "totalSent",
        "totalDelivered",
        "totalOpened",
        "totalClicked",
        "totalBounced",
        "createdAt",
        [
          literal(
            'CASE WHEN "totalDelivered" > 0 THEN ROUND(("totalOpened"::numeric / "totalDelivered"::numeric) * 100, 2) ELSE 0 END'
          ),
          "openRate"
        ]
      ],
      order: [[literal('"openRate"'), "DESC"]],
      limit: 5,
      raw: true
    });

    // --- Campanas activas ---
    const activeCampaigns = await EmailCampaign.count({
      where: {
        companyId,
        status: "EN_ANDAMENTO"
      }
    });

    return res.status(200).json({
      success: true,
      message: "Overview de email analytics",
      data: {
        kpis: {
          totalCampaigns,
          activeCampaigns,
          totalSent,
          totalDelivered,
          totalOpened,
          totalClicked,
          totalBounced,
          totalUnsubscribed,
          totalSpamComplaints,
          openRate: Math.round(openRate * 100) / 100,
          clickRate: Math.round(clickRate * 100) / 100,
          bounceRate: Math.round(bounceRate * 100) / 100,
          unsubscribeRate: Math.round(unsubscribeRate * 100) / 100
        },
        dailySends: dailySends.map(d => ({
          date: d.date,
          count: Number(d.count)
        })),
        topCampaigns
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error(`[EmailAnalyticsController] Error en overview: ${err.message}`);
    return res.status(500).json({
      success: false,
      message: "Error obteniendo overview de analytics",
      errors: [err.message]
    });
  }
};

/**
 * GET /email-analytics/campaign/:id
 * Stats detalladas de una campana especifica
 */
export const campaignDetail = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const campaignId = Number(req.params.id);

    if (!campaignId || isNaN(campaignId)) {
      return res.status(400).json({
        success: false,
        message: "ID de campana invalido"
      });
    }

    // Buscar campana con validacion multi-tenant
    const campaign = await EmailCampaign.findOne({
      where: { id: campaignId, companyId },
      attributes: [
        "id",
        "name",
        "subject",
        "fromName",
        "fromEmail",
        "status",
        "sendAt",
        "completedAt",
        "totalRecipients",
        "totalSent",
        "totalDelivered",
        "totalOpened",
        "totalClicked",
        "totalBounced",
        "totalUnsubscribed",
        "totalSpamComplaints",
        "provider",
        "createdAt"
      ]
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campana no encontrada"
      });
    }

    // --- Tasas ---
    const totalDelivered = campaign.totalDelivered || 0;
    const totalSent = campaign.totalSent || 0;
    const openRate = totalDelivered > 0
      ? Math.round(((campaign.totalOpened || 0) / totalDelivered) * 10000) / 100
      : 0;
    const clickRate = totalDelivered > 0
      ? Math.round(((campaign.totalClicked || 0) / totalDelivered) * 10000) / 100
      : 0;
    const bounceRate = totalSent > 0
      ? Math.round(((campaign.totalBounced || 0) / totalSent) * 10000) / 100
      : 0;
    const unsubscribeRate = totalDelivered > 0
      ? Math.round(((campaign.totalUnsubscribed || 0) / totalDelivered) * 10000) / 100
      : 0;

    // --- Timeline: eventos por hora (ultimas 48h) ---
    const fortyEightHoursAgo = new Date();
    fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);

    const timeline = await EmailTrackingEvent.findAll({
      where: {
        campaignId,
        companyId,
        timestamp: { [Op.gte]: fortyEightHoursAgo }
      },
      attributes: [
        [fn("DATE_TRUNC", "hour", col("timestamp")), "hour"],
        "eventType",
        [fn("COUNT", col("id")), "count"]
      ],
      group: [fn("DATE_TRUNC", "hour", col("timestamp")), "eventType"],
      order: [[fn("DATE_TRUNC", "hour", col("timestamp")), "ASC"]],
      raw: true
    }) as unknown as Array<{ hour: string; eventType: string; count: string }>;

    // --- Top links clickeados ---
    const topLinks = await EmailTrackingEvent.findAll({
      where: {
        campaignId,
        companyId,
        eventType: "click",
        linkUrl: { [Op.ne]: null }
      },
      attributes: [
        "linkUrl",
        [fn("COUNT", col("id")), "clicks"]
      ],
      group: ["linkUrl"],
      order: [[fn("COUNT", col("id")), "DESC"]],
      limit: 10,
      raw: true
    }) as unknown as Array<{ linkUrl: string; clicks: string }>;

    // --- Dispositivos agrupados ---
    const devices = await EmailTrackingEvent.findAll({
      where: {
        campaignId,
        companyId,
        deviceType: { [Op.ne]: null }
      },
      attributes: [
        "deviceType",
        [fn("COUNT", col("id")), "count"]
      ],
      group: ["deviceType"],
      order: [[fn("COUNT", col("id")), "DESC"]],
      raw: true
    }) as unknown as Array<{ deviceType: string; count: string }>;

    // --- Email clients agrupados ---
    const emailClients = await EmailTrackingEvent.findAll({
      where: {
        campaignId,
        companyId,
        emailClient: { [Op.ne]: null }
      },
      attributes: [
        "emailClient",
        [fn("COUNT", col("id")), "count"]
      ],
      group: ["emailClient"],
      order: [[fn("COUNT", col("id")), "DESC"]],
      raw: true
    }) as unknown as Array<{ emailClient: string; count: string }>;

    // --- Status breakdown de recipients ---
    const statusBreakdown = await EmailCampaignRecipient.findAll({
      where: { campaignId, companyId },
      attributes: [
        "status",
        [fn("COUNT", col("id")), "count"]
      ],
      group: ["status"],
      raw: true
    }) as unknown as Array<{ status: string; count: string }>;

    return res.status(200).json({
      success: true,
      message: "Detalle de campana",
      data: {
        campaign: {
          id: campaign.id,
          name: campaign.name,
          subject: campaign.subject,
          fromName: campaign.fromName,
          fromEmail: campaign.fromEmail,
          status: campaign.status,
          sendAt: campaign.sendAt,
          completedAt: campaign.completedAt,
          provider: campaign.provider,
          createdAt: campaign.createdAt
        },
        totals: {
          recipients: campaign.totalRecipients || 0,
          sent: totalSent,
          delivered: totalDelivered,
          opened: campaign.totalOpened || 0,
          clicked: campaign.totalClicked || 0,
          bounced: campaign.totalBounced || 0,
          unsubscribed: campaign.totalUnsubscribed || 0,
          spamComplaints: campaign.totalSpamComplaints || 0
        },
        rates: {
          openRate,
          clickRate,
          bounceRate,
          unsubscribeRate
        },
        timeline: timeline.map(t => ({
          hour: t.hour,
          eventType: t.eventType,
          count: Number(t.count)
        })),
        topLinks: topLinks.map(l => ({
          url: l.linkUrl,
          clicks: Number(l.clicks)
        })),
        devices: devices.map(d => ({
          type: d.deviceType,
          count: Number(d.count)
        })),
        emailClients: emailClients.map(c => ({
          client: c.emailClient,
          count: Number(c.count)
        })),
        statusBreakdown: statusBreakdown.map(s => ({
          status: s.status,
          count: Number(s.count)
        }))
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error(
      `[EmailAnalyticsController] Error en campaignDetail: ${err.message}`
    );
    return res.status(500).json({
      success: false,
      message: "Error obteniendo detalle de campana",
      errors: [err.message]
    });
  }
};
