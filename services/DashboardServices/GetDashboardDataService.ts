import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import User from "../../models/User";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import Campaign from "../../models/Campaign";
import Whatsapp from "../../models/Whatsapp";
import Contact from "../../models/Contact";
import { Op } from "sequelize";

interface DashboardResponse {
  totalUsers: number;
  activeConversations: number;
  totalMessages: number;
  aiInteractions: number;
  trends: Array<{ date: string; messages: number; users: number }>;
  tickets: {
    open: number;
    pending: number;
    closed: number;
  };
  unassignedTickets: {
    total: number;
    open: number;
    pending: number;
    closed: number;
  };
  ratings: {
    total: number;
    average: number;
    scale: number;
    positiveRate: number;
    last30Days: number;
    distribution: Array<{ rate: number; count: number }>;
    latest: Array<{
      id: number;
      ticketId: number | null;
      rate: number;
      createdAt: string;
      userName: string;
    }>;
  };
  campaigns: {
    active: number;
    scheduled: number;
    completed: number;
  };
  connections: {
    connected: number;
    disconnected: number;
    total: number;
  };
  topAgents: Array<{
    id: number;
    name: string;
    ticketsClosed: number;
    avgResponseTime: string;
  }>;
  userMetrics: Array<{
    id: number;
    name: string;
    email: string;
    online: boolean;
    onlineSince: string | null;
    onlineDurationMinutes: number;
    lastSeenAt: string | null;
    totalTickets: number;
    openTickets: number;
    pendingTickets: number;
    closedTickets: number;
    avgRating: number;
    ratingCount: number;
    avgResponseTime: string;
  }>;
  recentActivity: Array<{
    id: number;
    type: string;
    message: string;
    time: string;
    user: string;
  }>;
  performance: {
    avgResponseTime: number;
    satisfactionRate: number;
    firstContactResolution: number;
  };
}

const GetDashboardDataService = async (
  companyId: number,
  userId?: number,
  showAll: boolean = true
): Promise<DashboardResponse> => {
  try {
    console.log('🎯 GetDashboardDataService - Parámetros:', { companyId, userId, showAll });

    // 1. Total de usuarios activos
    const totalUsers = await User.count({
      where: { companyId }
    });

    // 2. Conversaciones activas (tickets open + pending en las últimas 24h)
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);

    const activeConversations = await Ticket.count({
      where: {
        companyId,
        status: { [Op.in]: ['open', 'pending'] },
        updatedAt: { [Op.gte]: oneDayAgo }
      }
    });

    // 3. Total de mensajes del mes actual
    const firstDayOfMonth = new Date();
    firstDayOfMonth.setDate(1);
    firstDayOfMonth.setHours(0, 0, 0, 0);

    const totalMessages = await Message.count({
      where: {
        companyId,
        createdAt: { [Op.gte]: firstDayOfMonth }
      }
    });

    // 4. Interacciones con IA (mensajes fromMe = false del mes)
    const aiInteractions = await Message.count({
      where: {
        companyId,
        fromMe: false,
        createdAt: { [Op.gte]: firstDayOfMonth }
      }
    });

    // 5. Tendencias de los últimos 7 días
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const trendsQuery = `
      SELECT
        DATE(m."createdAt") as date,
        COUNT(m.id) as messages,
        COUNT(DISTINCT m."contactId") as users
      FROM "Messages" m
      WHERE m."companyId" = :companyId
        AND m."createdAt" >= :sevenDaysAgo
      GROUP BY DATE(m."createdAt")
      ORDER BY date ASC
    `;

    const trends: any[] = await sequelize.query(trendsQuery, {
      replacements: { companyId, sevenDaysAgo },
      type: QueryTypes.SELECT
    });

    const formattedTrends = trends.map((t: any) => ({
      date: t.date,
      messages: parseInt(t.messages),
      users: parseInt(t.users)
    }));

    // 6. Contadores de tickets
    console.log('🎯 GetDashboardDataService - Consultando tickets para companyId:', companyId);

    // Crear whereCondition base
    const ticketWhereBase: any = { companyId };

    // Si showAll es false, filtrar solo por userId (incluir tickets sin usuario asignado)
    if (!showAll && userId) {
      ticketWhereBase[Op.or] = [
        { userId },
        { userId: null }  // Incluir tickets sin usuario asignado
      ];
    }

    const [openTickets, pendingTickets, closedTickets] = await Promise.all([
      Ticket.count({ where: { ...ticketWhereBase, status: 'open' } }),
      Ticket.count({ where: { ...ticketWhereBase, status: 'pending' } }),
      Ticket.count({ where: { ...ticketWhereBase, status: 'closed' } })
    ]);
    console.log('📊 Contadores de tickets:', { openTickets, pendingTickets, closedTickets, showAll, userId });

    const [unassignedOpenTickets, unassignedPendingTickets, unassignedClosedTickets] = await Promise.all([
      Ticket.count({ where: { companyId, userId: null, status: 'open' } }),
      Ticket.count({ where: { companyId, userId: null, status: 'pending' } }),
      Ticket.count({ where: { companyId, userId: null, status: 'closed' } })
    ]);

    const unassignedTickets = {
      open: unassignedOpenTickets,
      pending: unassignedPendingTickets,
      closed: unassignedClosedTickets,
      total: unassignedOpenTickets + unassignedPendingTickets + unassignedClosedTickets
    };

    // 7. Campañas
    const [activeCampaigns, scheduledCampaigns, completedCampaigns] = await Promise.all([
      Campaign.count({ where: { companyId, status: 'INPROGRESS' } }),
      Campaign.count({ where: { companyId, status: 'PROGRAMADA' } }),
      Campaign.count({ where: { companyId, status: 'FINALIZADA' } })
    ]);

    // 8. Conexiones de WhatsApp
    const connections = await Whatsapp.findAll({
      where: { companyId },
      attributes: ['id', 'status']
    });

    const connectedCount = connections.filter(c => c.status === 'CONNECTED').length;
    const disconnectedCount = connections.filter(c => c.status !== 'CONNECTED').length;

    // 9. Top 5 agentes del mes
    const topAgentsQuery = `
      SELECT
        u.id,
        u.name,
        COUNT(t.id) as "ticketsClosed",
        COALESCE(ROUND(AVG(
          EXTRACT(EPOCH FROM (t."updatedAt" - t."createdAt")) / 60
        )::numeric, 1), 0) as "avgResponseTime"
      FROM "Users" u
      LEFT JOIN "Tickets" t ON t."userId" = u.id
        AND t.status = 'closed'
        AND t."updatedAt" >= :firstDayOfMonth
      WHERE u."companyId" = :companyId
        AND u.profile IN ('user', 'admin')
      GROUP BY u.id, u.name
      HAVING COUNT(t.id) > 0
      ORDER BY "ticketsClosed" DESC
      LIMIT 5
    `;

    const topAgentsData: any[] = await sequelize.query(topAgentsQuery, {
      replacements: { companyId, firstDayOfMonth },
      type: QueryTypes.SELECT
    });

    const topAgents = topAgentsData.map((agent: any) => ({
      id: agent.id,
      name: agent.name,
      ticketsClosed: parseInt(agent.ticketsClosed),
      avgResponseTime: `${parseFloat(agent.avgResponseTime).toFixed(1)} min`
    }));

    // 10. Resumen de reseñas/NPS
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const ratingsSummaryQuery = `
      SELECT
        COUNT(ur.id) as total,
        COALESCE(ROUND(AVG(ur.rate)::numeric, 1), 0) as average,
        COALESCE(MAX(ur.rate), 0) as "maxRate",
        COUNT(CASE WHEN ur.rate >= 4 THEN 1 END) as positive,
        COUNT(CASE WHEN ur."createdAt" >= :thirtyDaysAgo THEN 1 END) as "last30Days"
      FROM "UserRatings" ur
      WHERE ur."companyId" = :companyId
        AND ur.rate > 0
    `;

    const ratingsSummaryData: any = await sequelize.query(ratingsSummaryQuery, {
      replacements: { companyId, thirtyDaysAgo },
      type: QueryTypes.SELECT,
      plain: true
    });

    const ratingsDistributionQuery = `
      SELECT ur.rate, COUNT(ur.id) as count
      FROM "UserRatings" ur
      WHERE ur."companyId" = :companyId
        AND ur.rate > 0
      GROUP BY ur.rate
      ORDER BY ur.rate ASC
    `;

    const ratingsDistributionData: any[] = await sequelize.query(ratingsDistributionQuery, {
      replacements: { companyId },
      type: QueryTypes.SELECT
    });

    const latestRatingsQuery = `
      SELECT
        ur.id,
        ur."ticketId",
        ur.rate,
        ur."createdAt",
        COALESCE(u.name, 'Sin agente') as "userName"
      FROM "UserRatings" ur
      LEFT JOIN "Users" u ON u.id = ur."userId"
      WHERE ur."companyId" = :companyId
        AND ur.rate > 0
      ORDER BY ur."createdAt" DESC
      LIMIT 5
    `;

    const latestRatingsData: any[] = await sequelize.query(latestRatingsQuery, {
      replacements: { companyId },
      type: QueryTypes.SELECT
    });

    const ratingsTotal = parseInt(ratingsSummaryData?.total || 0);
    const positiveRatings = parseInt(ratingsSummaryData?.positive || 0);
    const maxObservedRate = parseInt(ratingsSummaryData?.maxRate || 0);
    const ratings = {
      total: ratingsTotal,
      average: parseFloat(ratingsSummaryData?.average || 0),
      scale: maxObservedRate > 5 ? 10 : 5,
      positiveRate: ratingsTotal > 0 ? Math.round((positiveRatings / ratingsTotal) * 100) : 0,
      last30Days: parseInt(ratingsSummaryData?.last30Days || 0),
      distribution: ratingsDistributionData.map((item: any) => ({
        rate: parseInt(item.rate),
        count: parseInt(item.count)
      })),
      latest: latestRatingsData.map((item: any) => ({
        id: parseInt(item.id),
        ticketId: item.ticketId ? parseInt(item.ticketId) : null,
        rate: parseInt(item.rate),
        createdAt: item.createdAt,
        userName: item.userName
      }))
    };

    // 11. Métricas por usuario/agente
    const userMetricsQuery = `
      WITH ticket_stats AS (
        SELECT
          t."userId",
          COUNT(t.id) as "totalTickets",
          COUNT(CASE WHEN t.status = 'open' THEN 1 END) as "openTickets",
          COUNT(CASE WHEN t.status = 'pending' THEN 1 END) as "pendingTickets",
          COUNT(CASE WHEN t.status = 'closed' THEN 1 END) as "closedTickets",
          COALESCE(ROUND(AVG(
            CASE WHEN t.status = 'closed' THEN EXTRACT(EPOCH FROM (t."updatedAt" - t."createdAt")) / 60 END
          )::numeric, 1), 0) as "avgResponseTime"
        FROM "Tickets" t
        WHERE t."companyId" = :companyId
          AND t."userId" IS NOT NULL
        GROUP BY t."userId"
      ),
      rating_stats AS (
        SELECT
          ur."userId",
          COUNT(ur.id) as "ratingCount",
          COALESCE(ROUND(AVG(ur.rate)::numeric, 1), 0) as "avgRating"
        FROM "UserRatings" ur
        WHERE ur."companyId" = :companyId
          AND ur.rate > 0
          AND ur."userId" IS NOT NULL
        GROUP BY ur."userId"
      ),
      latest_session AS (
        SELECT DISTINCT ON (s."userId")
          s."userId",
          s."lastSeenAt"
        FROM "Sessions" s
        WHERE s."revokedAt" IS NULL
          AND s."expiresAt" > NOW()
        ORDER BY s."userId", s."lastSeenAt" DESC NULLS LAST
      )
      SELECT
        u.id,
        u.name,
        u.email,
        u.online,
        CASE
          WHEN u.online = true THEN COALESCE(NULLIF(u.metadata->>'lastOnlineAt', '')::timestamptz, u."updatedAt")
          ELSE NULL
        END as "onlineSince",
        CASE
          WHEN u.online = true THEN FLOOR(EXTRACT(EPOCH FROM (
            NOW() - COALESCE(NULLIF(u.metadata->>'lastOnlineAt', '')::timestamptz, u."updatedAt")
          )) / 60)
          ELSE 0
        END as "onlineDurationMinutes",
        COALESCE(ls."lastSeenAt", NULLIF(u.metadata->>'lastSeenAt', '')::timestamptz, u."updatedAt") as "lastSeenAt",
        COALESCE(ts."totalTickets", 0) as "totalTickets",
        COALESCE(ts."openTickets", 0) as "openTickets",
        COALESCE(ts."pendingTickets", 0) as "pendingTickets",
        COALESCE(ts."closedTickets", 0) as "closedTickets",
        COALESCE(rs."avgRating", 0) as "avgRating",
        COALESCE(rs."ratingCount", 0) as "ratingCount",
        COALESCE(ts."avgResponseTime", 0) as "avgResponseTime"
      FROM "Users" u
      LEFT JOIN ticket_stats ts ON ts."userId" = u.id
      LEFT JOIN rating_stats rs ON rs."userId" = u.id
      LEFT JOIN latest_session ls ON ls."userId" = u.id
      WHERE u."companyId" = :companyId
        AND u.profile IN ('admin', 'supervisor', 'user')
      ORDER BY u.online DESC, COALESCE(ts."totalTickets", 0) DESC, u.name ASC
    `;

    const userMetricsData: any[] = await sequelize.query(userMetricsQuery, {
      replacements: { companyId },
      type: QueryTypes.SELECT
    });

    const userMetrics = userMetricsData.map((agent: any) => ({
      id: parseInt(agent.id),
      name: agent.name,
      email: agent.email,
      online: Boolean(agent.online),
      onlineSince: agent.onlineSince || null,
      onlineDurationMinutes: Math.max(0, parseInt(agent.onlineDurationMinutes || 0)),
      lastSeenAt: agent.lastSeenAt || null,
      totalTickets: parseInt(agent.totalTickets || 0),
      openTickets: parseInt(agent.openTickets || 0),
      pendingTickets: parseInt(agent.pendingTickets || 0),
      closedTickets: parseInt(agent.closedTickets || 0),
      avgRating: parseFloat(agent.avgRating || 0),
      ratingCount: parseInt(agent.ratingCount || 0),
      avgResponseTime: `${parseFloat(agent.avgResponseTime || 0).toFixed(1)} min`
    }));

    // 12. Actividad reciente (últimos 5 eventos)
    const recentTickets = await Ticket.findAll({
      where: { companyId },
      include: [
        {
          association: 'contact',
          attributes: ['name']
        },
        {
          association: 'user',
          attributes: ['name']
        }
      ],
      order: [['updatedAt', 'DESC']],
      limit: 5,
      attributes: ['id', 'status', 'updatedAt']
    });

    const recentActivity = recentTickets.map((ticket: any) => {
      const minutesAgo = Math.floor((Date.now() - new Date(ticket.updatedAt).getTime()) / 60000);
      let timeString = '';

      if (minutesAgo < 60) {
        timeString = `Hace ${minutesAgo} min`;
      } else if (minutesAgo < 1440) {
        timeString = `Hace ${Math.floor(minutesAgo / 60)} hora${Math.floor(minutesAgo / 60) > 1 ? 's' : ''}`;
      } else {
        timeString = `Hace ${Math.floor(minutesAgo / 1440)} día${Math.floor(minutesAgo / 1440) > 1 ? 's' : ''}`;
      }

      let message = '';
      if (ticket.status === 'open') {
        message = `Ticket #${ticket.id} abierto`;
      } else if (ticket.status === 'pending') {
        message = `Ticket #${ticket.id} pendiente`;
      } else if (ticket.status === 'closed') {
        message = `Ticket #${ticket.id} cerrado`;
      }

      return {
        id: ticket.id,
        type: 'ticket',
        message,
        time: timeString,
        user: ticket.user?.name || ticket.contact?.name || 'Sistema'
      };
    });

    // 13. Métricas de performance
    const performanceQuery = `
      SELECT
        COALESCE(ROUND(AVG(
          EXTRACT(EPOCH FROM (t."updatedAt" - t."createdAt")) / 60
        )::numeric, 1), 0) as "avgResponseTime",
        COALESCE(ROUND(((COUNT(CASE WHEN ur.rate >= 4 THEN 1 END)::float /
          NULLIF(COUNT(ur.id), 0)) * 100)::numeric, 0), 0) as "satisfactionRate",
        COALESCE(ROUND(((COUNT(CASE WHEN t.status = 'closed' AND
          (SELECT COUNT(*) FROM "Messages" WHERE "ticketId" = t.id) <= 5 THEN 1 END)::float /
          NULLIF(COUNT(CASE WHEN t.status = 'closed' THEN 1 END), 0)) * 100)::numeric, 0), 0) as "firstContactResolution"
      FROM "Tickets" t
      LEFT JOIN "UserRatings" ur ON ur."ticketId" = t.id
      WHERE t."companyId" = :companyId
        AND t."updatedAt" >= :firstDayOfMonth
    `;

    const performanceData: any = await sequelize.query(performanceQuery, {
      replacements: { companyId, firstDayOfMonth },
      type: QueryTypes.SELECT,
      plain: true
    });

    const performance = {
      avgResponseTime: parseFloat(performanceData?.avgResponseTime || 0),
      satisfactionRate: parseInt(performanceData?.satisfactionRate || 0),
      firstContactResolution: parseInt(performanceData?.firstContactResolution || 0)
    };

    // Retornar datos completos
    const result = {
      totalUsers,
      activeConversations,
      totalMessages,
      aiInteractions,
      trends: formattedTrends,
      tickets: {
        open: openTickets,
        pending: pendingTickets,
        closed: closedTickets
      },
      unassignedTickets,
      ratings,
      campaigns: {
        active: activeCampaigns,
        scheduled: scheduledCampaigns,
        completed: completedCampaigns
      },
      connections: {
        connected: connectedCount,
        disconnected: disconnectedCount,
        total: connections.length
      },
      topAgents,
      userMetrics,
      recentActivity,
      performance
    };

    console.log('✅ GetDashboardDataService - Resultado final:', JSON.stringify(result, null, 2));
    return result;

  } catch (error) {
    console.error('Error in GetDashboardDataService:', error);
    throw error;
  }
};

export default GetDashboardDataService;
