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

    // 10. Actividad reciente (últimos 5 eventos)
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

    // 11. Métricas de performance
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
