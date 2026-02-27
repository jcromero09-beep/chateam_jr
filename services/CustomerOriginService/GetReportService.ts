import { Op, fn, col, literal } from "sequelize";
import Ticket from "../../models/Ticket";
import CustomerOrigin from "../../models/CustomerOrigin";
import sequelize from "../../database";

interface ReportRequest {
  companyId: number;
  startDate?: string;
  endDate?: string;
}

interface OriginStats {
  originId: number | null;
  originName: string;
  originColor: string;
  ticketCount: number;
  percentage: number;
}

interface TrendData {
  date: string;
  total: number;
  byOrigin: { [originName: string]: number };
}

interface CustomerOriginReport {
  summary: {
    totalTickets: number;
    ticketsWithOrigin: number;
    ticketsWithoutOrigin: number;
  };
  byOrigin: OriginStats[];
  trends: TrendData[];
}

const GetCustomerOriginReportService = async ({
  companyId,
  startDate,
  endDate
}: ReportRequest): Promise<CustomerOriginReport> => {
  // Calcular fechas por defecto (últimos 30 días)
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Ajustar horas para incluir el día completo
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  // 1. Obtener total de tickets en el período
  const totalTickets = await Ticket.count({
    where: {
      companyId,
      createdAt: {
        [Op.between]: [start, end]
      }
    }
  });

  // 2. Obtener tickets con origen asignado
  const ticketsWithOrigin = await Ticket.count({
    where: {
      companyId,
      customerOriginId: {
        [Op.not]: null
      },
      createdAt: {
        [Op.between]: [start, end]
      }
    }
  });

  const ticketsWithoutOrigin = totalTickets - ticketsWithOrigin;

  // 3. Obtener conteo por origen
  const originCounts = await Ticket.findAll({
    attributes: [
      'customerOriginId',
      [fn('COUNT', col('Ticket.id')), 'ticketCount']
    ],
    where: {
      companyId,
      createdAt: {
        [Op.between]: [start, end]
      }
    },
    include: [{
      model: CustomerOrigin,
      as: 'customerOrigin',
      attributes: ['id', 'name', 'color'],
      required: false
    }],
    group: ['customerOriginId', 'customerOrigin.id', 'customerOrigin.name', 'customerOrigin.color'],
    raw: false
  });

  // 4. Formatear datos por origen
  const byOrigin: OriginStats[] = originCounts.map((row: any) => {
    const ticketCount = parseInt(row.getDataValue('ticketCount') || 0);
    return {
      originId: row.customerOriginId,
      originName: row.customerOrigin?.name || 'Sin origen',
      originColor: row.customerOrigin?.color || '#94a3b8',
      ticketCount,
      percentage: totalTickets > 0 ? Math.round((ticketCount / totalTickets) * 100 * 10) / 10 : 0
    };
  });

  // Ordenar por cantidad de tickets (descendente)
  byOrigin.sort((a, b) => b.ticketCount - a.ticketCount);

  // 5. Obtener tendencias por día
  const trendsQuery = await sequelize.query(`
    SELECT
      DATE("createdAt") as date,
      COUNT(*) as total,
      "customerOriginId"
    FROM "Tickets"
    WHERE "companyId" = :companyId
      AND "createdAt" BETWEEN :startDate AND :endDate
    GROUP BY DATE("createdAt"), "customerOriginId"
    ORDER BY DATE("createdAt") ASC
  `, {
    replacements: {
      companyId,
      startDate: start.toISOString(),
      endDate: end.toISOString()
    },
    type: 'SELECT'
  }) as any[];

  // Obtener todos los orígenes para el mapeo
  const allOrigins = await CustomerOrigin.findAll({
    where: { companyId },
    attributes: ['id', 'name']
  });

  const originMap = new Map<number, string>();
  allOrigins.forEach(o => originMap.set(o.id, o.name));

  // 6. Agrupar tendencias por fecha
  const trendsMap = new Map<string, TrendData>();

  trendsQuery.forEach((row: any) => {
    const dateStr = new Date(row.date).toISOString().split('T')[0];
    const originName = row.customerOriginId ? (originMap.get(row.customerOriginId) || 'Otro') : 'Sin origen';
    const count = parseInt(row.total);

    if (!trendsMap.has(dateStr)) {
      trendsMap.set(dateStr, {
        date: dateStr,
        total: 0,
        byOrigin: {}
      });
    }

    const trend = trendsMap.get(dateStr)!;
    trend.total += count;
    trend.byOrigin[originName] = (trend.byOrigin[originName] || 0) + count;
  });

  // Convertir a array ordenado por fecha
  const trends = Array.from(trendsMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  return {
    summary: {
      totalTickets,
      ticketsWithOrigin,
      ticketsWithoutOrigin
    },
    byOrigin,
    trends
  };
};

export default GetCustomerOriginReportService;
