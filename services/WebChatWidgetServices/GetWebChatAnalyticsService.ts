import { Op } from "sequelize";
import WebChatWidget from "../../models/WebChatWidget";
import Company from "../../models/Company";
import Whatsapp from "../../models/Whatsapp";
import WebChatConversation from "../../models/WebChatConversation";
import WebChatConversationMessage from "../../models/WebChatConversationMessage";

interface Request {
  companyId?: number; // Si es null, es super admin y ve todo
  startDate?: string;
  endDate?: string;
}

interface WidgetStats {
  id: number;
  name: string;
  channel: string;
  status: boolean;
  apiKey: string;
  companyId: number;
  companyName?: string;
  whatsappName?: string;
  ticketsCreated: number;
  messagesReceived: number;
  messagesSent: number;
  lastActivity: Date | null;
  createdAt: Date;
}

interface AnalyticsResponse {
  summary: {
    totalWidgets: number;
    activeWidgets: number;
    inactiveWidgets: number;
    totalTickets: number;
    totalMessages: number;
    avgTicketsPerWidget: number;
  };
  widgets: WidgetStats[];
  ticketsByDay: { date: string; count: number }[];
  messagesByDay: { date: string; sent: number; received: number }[];
}

const GetWebChatAnalyticsService = async ({
  companyId,
  startDate,
  endDate
}: Request): Promise<AnalyticsResponse> => {
  // Definir rango de fechas (por defecto últimos 30 días)
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Condición base para filtrar por compañía (si no es super admin)
  const whereCompany = companyId ? { companyId } : {};

  // Obtener todos los widgets
  const widgets = await WebChatWidget.findAll({
    where: whereCompany,
    include: [
      {
        model: Company,
        as: "company",
        attributes: ["id", "name"]
      },
      {
        model: Whatsapp,
        as: "whatsapp",
        attributes: ["id", "name", "status"]
      }
    ],
    order: [["createdAt", "DESC"]]
  });

  // Obtener estadísticas por widget
  const widgetStats: WidgetStats[] = await Promise.all(
    widgets.map(async (widget) => {
      const ticketsCreated = await WebChatConversation.count({
        where: {
          companyId: widget.companyId,
          widgetId: widget.id,
          createdAt: { [Op.between]: [start, end] }
        }
      });

      const messagesReceived = await WebChatConversationMessage.count({
        include: [
          {
            model: WebChatConversation,
            as: "conversation",
            where: {
              companyId: widget.companyId,
              widgetId: widget.id
            },
            required: true
          }
        ],
        where: {
          direction: "inbound",
          createdAt: { [Op.between]: [start, end] }
        }
      });

      const messagesSent = await WebChatConversationMessage.count({
        include: [
          {
            model: WebChatConversation,
            as: "conversation",
            where: {
              companyId: widget.companyId,
              widgetId: widget.id
            },
            required: true
          }
        ],
        where: {
          direction: "outbound",
          createdAt: { [Op.between]: [start, end] }
        }
      });

      const lastMessage = await WebChatConversationMessage.findOne({
        include: [
          {
            model: WebChatConversation,
            as: "conversation",
            where: {
              companyId: widget.companyId,
              widgetId: widget.id
            },
            required: true
          }
        ],
        order: [["createdAt", "DESC"]]
      });

      return {
        id: widget.id,
        name: widget.name,
        channel: widget.channel,
        status: widget.status,
        apiKey: widget.apiKey,
        companyId: widget.companyId,
        companyName: (widget as any).company?.name,
        whatsappName: (widget as any).whatsapp?.name,
        ticketsCreated,
        messagesReceived,
        messagesSent,
        lastActivity: lastMessage?.createdAt || null,
        createdAt: widget.createdAt
      };
    })
  );

  // Calcular resumen
  const totalWidgets = widgets.length;
  const activeWidgets = widgets.filter(w => w.status).length;
  const inactiveWidgets = totalWidgets - activeWidgets;
  const totalTickets = widgetStats.reduce((sum, w) => sum + w.ticketsCreated, 0);
  const totalMessages = widgetStats.reduce((sum, w) => sum + w.messagesReceived + w.messagesSent, 0);
  const avgTicketsPerWidget = totalWidgets > 0 ? Math.round(totalTickets / totalWidgets) : 0;

  // Tickets por día (últimos 7 días para gráfico)
  const ticketsByDay: { date: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(end);
    dayStart.setDate(dayStart.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const count = await WebChatConversation.count({
      where: {
        ...whereCompany,
        createdAt: { [Op.between]: [dayStart, dayEnd] }
      }
    });

    ticketsByDay.push({
      date: dayStart.toISOString().split("T")[0],
      count
    });
  }

  // Mensajes por día
  const messagesByDay: { date: string; sent: number; received: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(end);
    dayStart.setDate(dayStart.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const sent = await WebChatConversationMessage.count({
      include: [{
        model: WebChatConversation,
        as: "conversation",
        where: whereCompany,
        required: true
      }],
      where: {
        direction: "outbound",
        createdAt: { [Op.between]: [dayStart, dayEnd] }
      }
    });

    const received = await WebChatConversationMessage.count({
      include: [{
        model: WebChatConversation,
        as: "conversation",
        where: whereCompany,
        required: true
      }],
      where: {
        direction: "inbound",
        createdAt: { [Op.between]: [dayStart, dayEnd] }
      }
    });

    messagesByDay.push({
      date: dayStart.toISOString().split("T")[0],
      sent,
      received
    });
  }

  return {
    summary: {
      totalWidgets,
      activeWidgets,
      inactiveWidgets,
      totalTickets,
      totalMessages,
      avgTicketsPerWidget
    },
    widgets: widgetStats,
    ticketsByDay,
    messagesByDay
  };
};

export default GetWebChatAnalyticsService;
