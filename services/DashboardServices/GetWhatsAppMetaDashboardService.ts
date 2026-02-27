/**
 * GetWhatsAppMetaDashboardService
 * Dashboard de WhatsApp Business API (canal Meta) filtrado por companyId
 */

import { Op, QueryTypes } from "sequelize";
import Whatsapp from "../../models/Whatsapp";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import sequelize from "../../database";

interface Request {
  companyId: number;
}

interface ConnectionData {
  id: number;
  name: string;
  number: string;
  status: string;
  channel: string;
  messagesLast24h: number;
  lastSync: Date;
}

interface DashboardMetrics {
  totalConnections: number;
  activeConnections: number;
  messagesLast24h: number;
  messagesSent24h: number;
  messagesReceived24h: number;
  activeConversations: number;
  avgResponseTime: number;
}

interface DashboardResponse {
  connections: ConnectionData[];
  metrics: DashboardMetrics;
}

const GetWhatsAppMetaDashboardService = async ({
  companyId
}: Request): Promise<DashboardResponse> => {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // 1. Obtener conexiones con channel = "meta"
  const whatsapps = await Whatsapp.findAll({
    where: {
      companyId,
      channel: "meta"
    },
    attributes: ["id", "name", "number", "status", "channel", "updatedAt"],
    order: [["name", "ASC"]]
  });

  // 2. Contar mensajes por conexión (últimas 24h)
  const messagesByConnection = await sequelize.query<{
    whatsappId: number;
    count: string;
  }>(
    `
    SELECT t."whatsappId", COUNT(m.id)::text as count
    FROM "Messages" m
    JOIN "Tickets" t ON m."ticketId" = t.id
    WHERE t."companyId" = :companyId
      AND t.channel = 'meta'
      AND m."createdAt" >= :last24h
    GROUP BY t."whatsappId"
    `,
    {
      replacements: { companyId, last24h },
      type: QueryTypes.SELECT
    }
  );

  const messagesMap = new Map<number, number>();
  messagesByConnection.forEach(row => {
    messagesMap.set(row.whatsappId, parseInt(row.count, 10));
  });

  // 3. Construir datos de conexiones
  const connections: ConnectionData[] = whatsapps.map(wa => ({
    id: wa.id,
    name: wa.name || `WhatsApp ${wa.id}`,
    number: wa.number || "",
    status: wa.status || "DISCONNECTED",
    channel: wa.channel || "meta",
    messagesLast24h: messagesMap.get(wa.id) || 0,
    lastSync: wa.updatedAt
  }));

  // 4. Calcular métricas

  // Total y activas
  const totalConnections = connections.length;
  const activeConnections = connections.filter(
    c => c.status === "CONNECTED" || c.status === "qrcode"
  ).length;

  // Mensajes enviados (24h) - fromMe = true
  const messagesSent24h = await Message.count({
    where: {
      fromMe: true,
      createdAt: { [Op.gte]: last24h }
    },
    include: [
      {
        model: Ticket,
        as: "ticket",
        where: {
          companyId,
          channel: "meta"
        },
        required: true
      }
    ]
  });

  // Mensajes recibidos (24h) - fromMe = false
  const messagesReceived24h = await Message.count({
    where: {
      fromMe: false,
      createdAt: { [Op.gte]: last24h }
    },
    include: [
      {
        model: Ticket,
        as: "ticket",
        where: {
          companyId,
          channel: "meta"
        },
        required: true
      }
    ]
  });

  const messagesLast24h = messagesSent24h + messagesReceived24h;

  // Conversaciones activas (tickets open/pending con channel meta)
  const activeConversations = await Ticket.count({
    where: {
      companyId,
      channel: "meta",
      status: { [Op.in]: ["open", "pending"] }
    }
  });

  // Tiempo promedio de respuesta (últimas 24h)
  const avgResponseResult = await sequelize.query<{ avg_response: string }>(
    `
    SELECT COALESCE(
      ROUND(AVG(
        EXTRACT(EPOCH FROM (
          (SELECT MIN(m2."createdAt")
           FROM "Messages" m2
           WHERE m2."ticketId" = t.id
             AND m2."fromMe" = true
             AND m2."createdAt" > m."createdAt")
          - m."createdAt"
        ))
      )::numeric, 0),
      0
    )::text as avg_response
    FROM "Messages" m
    JOIN "Tickets" t ON m."ticketId" = t.id
    WHERE t."companyId" = :companyId
      AND t.channel = 'meta'
      AND m."fromMe" = false
      AND m."createdAt" >= :last24h
    LIMIT 100
    `,
    {
      replacements: { companyId, last24h },
      type: QueryTypes.SELECT
    }
  );

  const avgResponseTime = avgResponseResult[0]?.avg_response
    ? parseInt(avgResponseResult[0].avg_response, 10)
    : 0;

  return {
    connections,
    metrics: {
      totalConnections,
      activeConnections,
      messagesLast24h,
      messagesSent24h,
      messagesReceived24h,
      activeConversations,
      avgResponseTime
    }
  };
};

export default GetWhatsAppMetaDashboardService;
