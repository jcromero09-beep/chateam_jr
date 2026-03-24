import { Op, fn, col, literal, WhereOptions } from "sequelize";
import KanbanMovementLog from "../models/KanbanMovementLog";
import Tag from "../models/Tag";
import TicketTag from "../models/TicketTag";
import Ticket from "../models/Ticket";

interface DateRange {
  from: Date;
  to: Date;
}

interface PrecisionResult {
  totalMovements: number;
  aiMovements: number;
  overriddenMovements: number;
  precision: number;
}

interface StageDistributionItem {
  tagId: number;
  tagName: string;
  tagColor: string;
  ticketCount: number;
}

interface AvgTimeInStageItem {
  tagId: number;
  tagName: string;
  tagColor: string;
  avgTimeMinutes: number;
  avgTimeFormatted: string;
}

interface ConversionRateItem {
  fromTagId: number;
  fromTagName: string;
  toTagId: number;
  toTagName: string;
  transitionCount: number;
  conversionRate: number;
}

interface FunnelStage {
  tagId: number;
  tagName: string;
  tagColor: string;
  ticketsEntered: number;
  ticketsExited: number;
  dropoffRate: number;
}

interface OverviewMetrics {
  totalTicketsInKanban: number;
  globalConversionRate: number;
  avgTimeInPipelineMinutes: number;
  avgTimeInPipelineFormatted: string;
  aiPrecision: number;
}

/**
 * Construye el filtro WHERE base para queries sobre KanbanMovementLog
 */
const buildMovementWhere = (
  companyId: number,
  dateRange?: DateRange
): WhereOptions => {
  const where: Record<string, unknown> = { companyId };
  if (dateRange) {
    where.createdAt = { [Op.between]: [dateRange.from, dateRange.to] };
  }
  return where as WhereOptions;
};

/**
 * Precisión de clasificación IA: 1 - (overrides / total movimientos IA)
 */
const getClassificationPrecision = async (
  companyId: number,
  dateRange: DateRange
): Promise<PrecisionResult> => {
  const where = buildMovementWhere(companyId, dateRange);

  const totalMovements = await KanbanMovementLog.count({ where });

  const aiWhere = { ...where, movedBy: "ai" } as WhereOptions;
  const aiMovements = await KanbanMovementLog.count({ where: aiWhere });

  const overriddenWhere = {
    ...where,
    movedBy: "ai",
    wasOverriddenByUser: true,
  } as WhereOptions;
  const overriddenMovements = await KanbanMovementLog.count({
    where: overriddenWhere,
  });

  const precision =
    aiMovements > 0 ? 1 - overriddenMovements / aiMovements : 1;

  return {
    totalMovements,
    aiMovements,
    overriddenMovements,
    precision: Math.round(precision * 10000) / 10000,
  };
};

/**
 * Distribución actual de tickets por etapa Kanban
 */
const getStageDistribution = async (
  companyId: number
): Promise<StageDistributionItem[]> => {
  const tags = await Tag.findAll({
    where: { companyId, kanban: 1 },
    attributes: [
      "id", "name", "color",
      [fn("COUNT", col("ticketTags.ticketId")), "ticketCount"],
    ],
    include: [
      {
        model: TicketTag,
        as: "ticketTags",
        attributes: [],
        required: false,
        include: [
          {
            model: Ticket,
            as: "ticket",
            attributes: [],
            where: { companyId },
            required: false,
          },
        ],
      },
    ],
    group: ["Tag.id"],
    order: [["id", "ASC"]],
    subQuery: false,
  } as any);

  return tags.map((tag: any) => ({
    tagId: tag.id,
    tagName: tag.name,
    tagColor: tag.color,
    ticketCount: parseInt(tag.getDataValue("ticketCount") || "0", 10),
  }));
};

/**
 * Tiempo promedio que los tickets permanecen en cada etapa
 * Calcula usando la diferencia entre movimiento de entrada y salida
 */
const getAvgTimeInStage = async (
  companyId: number,
  dateRange: DateRange
): Promise<AvgTimeInStageItem[]> => {
  // Obtener todos los tags kanban de la empresa
  const kanbanTags = await Tag.findAll({
    where: { companyId, kanban: 1 },
    attributes: ["id", "name", "color"],
    order: [["id", "ASC"]],
  });

  const results: AvgTimeInStageItem[] = [];

  for (const tag of kanbanTags) {
    // Buscar movimientos donde el ticket SALIÓ de esta etapa (fromTagId = tag.id)
    // El tiempo en etapa = createdAt del movimiento de salida - createdAt del movimiento de entrada
    const avgResult = await KanbanMovementLog.findAll({
      attributes: [
        [
          fn(
            "AVG",
            literal(
              `EXTRACT(EPOCH FROM "KanbanMovementLog"."createdAt" - (
                SELECT ml2."createdAt"
                FROM "KanbanMovementLogs" ml2
                WHERE ml2."toTagId" = "KanbanMovementLog"."fromTagId"
                  AND ml2."ticketId" = "KanbanMovementLog"."ticketId"
                  AND ml2."createdAt" < "KanbanMovementLog"."createdAt"
                ORDER BY ml2."createdAt" DESC
                LIMIT 1
              )) / 60`
            )
          ),
          "avgMinutes",
        ],
      ],
      where: {
        companyId,
        fromTagId: tag.id,
        createdAt: { [Op.between]: [dateRange.from, dateRange.to] },
      } as WhereOptions,
      raw: true,
    });

    const avgMinutes = parseFloat((avgResult[0] as any)?.avgMinutes) || 0;
    const roundedMinutes = Math.round(avgMinutes * 100) / 100;

    results.push({
      tagId: tag.id,
      tagName: tag.name,
      tagColor: tag.color,
      avgTimeMinutes: roundedMinutes,
      avgTimeFormatted: formatMinutes(roundedMinutes),
    });
  }

  return results;
};

/**
 * Tasas de conversión entre etapas consecutivas
 */
const getConversionRates = async (
  companyId: number,
  dateRange: DateRange
): Promise<ConversionRateItem[]> => {
  const where = buildMovementWhere(companyId, dateRange);

  // Agrupar transiciones por fromTagId -> toTagId con conteo
  const transitions = await KanbanMovementLog.findAll({
    attributes: [
      "fromTagId",
      "toTagId",
      [fn("COUNT", col("KanbanMovementLog.id")), "transitionCount"],
    ],
    where: {
      ...where,
      fromTagId: { [Op.ne]: null },
      toTagId: { [Op.ne]: null },
    } as WhereOptions,
    include: [
      {
        model: Tag,
        as: "fromTag",
        attributes: ["name"],
      },
    ],
    group: ["fromTagId", "toTagId", "fromTag.id"],
    order: [[literal('"transitionCount"'), "DESC"]],
    raw: true,
    nest: true,
    subQuery: false,
  } as any);

  // Obtener el total de tickets que pasaron por cada fromTag para calcular tasa
  const fromTagTotals: Record<number, number> = {};
  for (const t of transitions as any[]) {
    const fromId = t.fromTagId;
    if (!fromTagTotals[fromId]) {
      fromTagTotals[fromId] = 0;
    }
    fromTagTotals[fromId] += parseInt(t.transitionCount, 10);
  }

  // Obtener nombres de tags destino
  const toTagIds = [
    ...new Set((transitions as any[]).map((t) => t.toTagId)),
  ];
  const toTags = await Tag.findAll({
    where: { id: toTagIds },
    attributes: ["id", "name"],
  });
  const toTagMap = new Map(toTags.map((t) => [t.id, t.name]));

  return (transitions as any[]).map((t) => {
    const count = parseInt(t.transitionCount, 10);
    const total = fromTagTotals[t.fromTagId] || 1;
    return {
      fromTagId: t.fromTagId,
      fromTagName: t.fromTag?.name || "Desconocido",
      toTagId: t.toTagId,
      toTagName: toTagMap.get(t.toTagId) || "Desconocido",
      transitionCount: count,
      conversionRate: Math.round((count / total) * 10000) / 10000,
    };
  });
};

/**
 * Datos completos para visualización de funnel/pipeline
 */
const getFunnelData = async (
  companyId: number,
  dateRange: DateRange
): Promise<FunnelStage[]> => {
  const kanbanTags = await Tag.findAll({
    where: { companyId, kanban: 1 },
    attributes: ["id", "name", "color"],
    order: [["id", "ASC"]],
  });

  const where = buildMovementWhere(companyId, dateRange);

  const stages: FunnelStage[] = [];

  for (const tag of kanbanTags) {
    // Tickets que entraron a esta etapa (toTagId = tag.id)
    const ticketsEntered = await KanbanMovementLog.count({
      where: { ...where, toTagId: tag.id } as WhereOptions,
      distinct: true,
      col: "ticketId",
    });

    // Tickets que salieron de esta etapa (fromTagId = tag.id)
    const ticketsExited = await KanbanMovementLog.count({
      where: { ...where, fromTagId: tag.id } as WhereOptions,
      distinct: true,
      col: "ticketId",
    });

    const dropoffRate =
      ticketsEntered > 0
        ? Math.round(
            ((ticketsEntered - ticketsExited) / ticketsEntered) * 10000
          ) / 10000
        : 0;

    stages.push({
      tagId: tag.id,
      tagName: tag.name,
      tagColor: tag.color,
      ticketsEntered,
      ticketsExited,
      dropoffRate,
    });
  }

  return stages;
};

/**
 * KPIs principales del Kanban: total tickets, conversión global, tiempo promedio, precisión IA
 */
const getOverviewMetrics = async (
  companyId: number,
  dateRange: DateRange
): Promise<OverviewMetrics> => {
  // 1. Total tickets actualmente en el Kanban
  const totalTicketsInKanban = await TicketTag.count({
    include: [
      {
        model: Tag,
        as: "tag",
        where: { companyId, kanban: 1 },
        attributes: [],
      },
      {
        model: Ticket,
        as: "ticket",
        where: { companyId },
        attributes: [],
      },
    ],
    distinct: true,
    col: "ticketId",
  });

  // 2. Conversión global: tickets que llegaron a la última etapa / tickets que entraron a la primera
  const kanbanTags = await Tag.findAll({
    where: { companyId, kanban: 1 },
    attributes: ["id"],
    order: [["id", "ASC"]],
  });

  let globalConversionRate = 0;
  if (kanbanTags.length >= 2) {
    const firstTagId = kanbanTags[0].id;
    const lastTagId = kanbanTags[kanbanTags.length - 1].id;

    const where = buildMovementWhere(companyId, dateRange);

    const enteredFirst = await KanbanMovementLog.count({
      where: { ...where, toTagId: firstTagId } as WhereOptions,
      distinct: true,
      col: "ticketId",
    });

    const reachedLast = await KanbanMovementLog.count({
      where: { ...where, toTagId: lastTagId } as WhereOptions,
      distinct: true,
      col: "ticketId",
    });

    globalConversionRate =
      enteredFirst > 0
        ? Math.round((reachedLast / enteredFirst) * 10000) / 10000
        : 0;
  }

  // 3. Tiempo promedio total en el pipeline (desde primer movimiento hasta último)
  const avgPipelineResult = await KanbanMovementLog.findAll({
    attributes: [
      [
        fn(
          "AVG",
          literal(
            `EXTRACT(EPOCH FROM (
              (SELECT MAX(ml2."createdAt") FROM "KanbanMovementLogs" ml2 WHERE ml2."ticketId" = "KanbanMovementLog"."ticketId" AND ml2."companyId" = ${companyId})
              -
              (SELECT MIN(ml3."createdAt") FROM "KanbanMovementLogs" ml3 WHERE ml3."ticketId" = "KanbanMovementLog"."ticketId" AND ml3."companyId" = ${companyId})
            )) / 60`
          )
        ),
        "avgPipelineMinutes",
      ],
    ],
    where: {
      companyId,
      createdAt: { [Op.between]: [dateRange.from, dateRange.to] },
    },
    // Agrupar por ticketId para no contar el mismo ticket múltiples veces
    group: ["ticketId"],
    raw: true,
  });

  // Calcular el promedio de los promedios por ticket
  let avgTimeInPipelineMinutes = 0;
  if (avgPipelineResult.length > 0) {
    const total = (avgPipelineResult as any[]).reduce(
      (sum, r) => sum + (parseFloat(r.avgPipelineMinutes) || 0),
      0
    );
    avgTimeInPipelineMinutes =
      Math.round((total / avgPipelineResult.length) * 100) / 100;
  }

  // 4. Precisión IA
  const precision = await getClassificationPrecision(companyId, dateRange);

  return {
    totalTicketsInKanban,
    globalConversionRate,
    avgTimeInPipelineMinutes,
    avgTimeInPipelineFormatted: formatMinutes(avgTimeInPipelineMinutes),
    aiPrecision: precision.precision,
  };
};

/**
 * Formatea minutos a un string legible (ej: "2h 30m" o "45m")
 */
function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0m";

  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = Math.round(minutes % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0 || parts.length === 0) parts.push(`${mins}m`);

  return parts.join(" ");
}

export default {
  getClassificationPrecision,
  getStageDistribution,
  getAvgTimeInStage,
  getConversionRates,
  getFunnelData,
  getOverviewMetrics,
};
