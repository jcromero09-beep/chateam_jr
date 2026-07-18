import { Request, Response } from "express";
import { Op, WhereOptions } from "sequelize";
import KanbanLeadConversionEvent from "../models/KanbanLeadConversionEvent";
import Contact from "../models/Contact";
import Tag from "../models/Tag";
import Ticket from "../models/Ticket";
import { retryKanbanLeadConversion } from "../services/FacebookConversionService/KanbanLeadConversionService";
import logger from "../utils/logger";

const ALLOWED_STATUSES = new Set([
  "pending",
  "sent",
  "success",
  "failed",
  "skipped"
]);

/**
 * Lista paginada de eventos de conversión Kanban Lead.
 *
 * Query params soportados:
 *  - page          (default 1)
 *  - limit         (default 20, max 100)
 *  - q             búsqueda global
 *  - status        pending | sent | success | failed | skipped
 *  - kanbanKey
 *  - ticketId
 *  - contactId
 *  - dateFrom      ISO date
 *  - dateTo        ISO date
 */
export const index = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20)
    );
    const offset = (page - 1) * limit;

    const {
      q,
      status,
      kanbanKey,
      ticketId,
      contactId,
      dateFrom,
      dateTo
    } = req.query as Record<string, string | undefined>;

    const where: WhereOptions = { companyId };

    if (status && ALLOWED_STATUSES.has(status)) {
      (where as any).responseStatus = status;
    }
    if (kanbanKey) (where as any).kanbanKey = kanbanKey;
    if (ticketId) (where as any).ticketId = Number(ticketId);
    if (contactId) (where as any).contactId = Number(contactId);

    if (dateFrom || dateTo) {
      const range: any = {};
      if (dateFrom) range[Op.gte] = new Date(dateFrom);
      if (dateTo) range[Op.lte] = new Date(dateTo);
      (where as any).createdAt = range;
    }

    if (q && q.trim().length > 0) {
      const term = `%${q.trim()}%`;
      const numeric = Number(q);
      const isNumeric = Number.isFinite(numeric);

      (where as any)[Op.and] = [
        {
          [Op.or]: [
            { kanbanKey: { [Op.iLike]: term } },
            { kanbanTagName: { [Op.iLike]: term } },
            { eventName: { [Op.iLike]: term } },
            { eventId: { [Op.iLike]: term } },
            { source: { [Op.iLike]: term } },
            { destinationId: { [Op.iLike]: term } },
            { destinationSource: { [Op.iLike]: term } },
            { responseStatus: { [Op.iLike]: term } },
            { fbtraceId: { [Op.iLike]: term } },
            { errorMessage: { [Op.iLike]: term } },
            { "$contact.name$": { [Op.iLike]: term } },
            { "$contact.number$": { [Op.iLike]: term } },
            { "$kanbanTag.name$": { [Op.iLike]: term } },
            { "$kanbanTag.metaConversionName$": { [Op.iLike]: term } },
            { "$kanbanTag.metaCustomConversionId$": { [Op.iLike]: term } },
            { "$kanbanTag.metaEventName$": { [Op.iLike]: term } },
            { "$kanbanTag.metaLeadStatus$": { [Op.iLike]: term } },
            { "$kanbanTag.metaLastError$": { [Op.iLike]: term } },
            ...(isNumeric
              ? [
                  { ticketId: numeric },
                  { contactId: numeric },
                  { companyId: numeric }
                ]
              : [])
          ]
        }
      ];
    }

    const { count, rows } = await KanbanLeadConversionEvent.findAndCountAll({
      where,
      include: [
        { model: Contact, as: "contact", attributes: ["id", "name", "number"] },
        {
          model: Tag,
          as: "kanbanTag",
          attributes: [
            "id", "name", "key", "color",
            "metaConversionName", "metaEventName", "metaLeadStatus",
            "metaRule", "metaCustomEventType", "metaCustomConversionId",
            "metaConversionStatus", "metaLastSyncAt", "metaLastError"
          ]
        }
      ],
      distinct: true,
      subQuery: false,
      limit,
      offset,
      order: [["createdAt", "DESC"]]
    });

    return res.status(200).json({
      rows,
      count,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(count / limit)),
      hasMore: count > offset + rows.length
    });
  } catch (error: any) {
    logger.error(
      `[KANBAN-CAPI][index] Error listando eventos: ${error?.message || error}`
    );
    return res
      .status(500)
      .json({ error: error?.message || "Error listando eventos" });
  }
};

/**
 * Resumen agregado: total, success, failed, pending, skipped.
 * Útil para los KPIs/cards en la cabecera del frontend.
 */
export const stats = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { dateFrom, dateTo } = req.query as Record<string, string | undefined>;

    const where: any = { companyId };
    if (dateFrom || dateTo) {
      const range: any = {};
      if (dateFrom) range[Op.gte] = new Date(dateFrom);
      if (dateTo) range[Op.lte] = new Date(dateTo);
      where.createdAt = range;
    }

    const [total, success, failed, pending, sent, skipped] = await Promise.all([
      KanbanLeadConversionEvent.count({ where }),
      KanbanLeadConversionEvent.count({ where: { ...where, responseStatus: "success" } }),
      KanbanLeadConversionEvent.count({ where: { ...where, responseStatus: "failed" } }),
      KanbanLeadConversionEvent.count({ where: { ...where, responseStatus: "pending" } }),
      KanbanLeadConversionEvent.count({ where: { ...where, responseStatus: "sent" } }),
      KanbanLeadConversionEvent.count({ where: { ...where, responseStatus: "skipped" } })
    ]);

    return res.status(200).json({
      total,
      success,
      failed,
      pending,
      sent,
      skipped,
      // alias agradable para UI ("enviados" = sent + success)
      sentOrSuccess: sent + success
    });
  } catch (error: any) {
    logger.error(
      `[KANBAN-CAPI][stats] Error: ${error?.message || error}`
    );
    return res
      .status(500)
      .json({ error: error?.message || "Error consultando stats" });
  }
};

/**
 * Detalle de un evento puntual (incluye relaciones).
 */
export const show = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "ID inválido" });
    }

    const record = await KanbanLeadConversionEvent.findOne({
      where: { id, companyId },
      include: [
        { model: Contact, as: "contact", attributes: ["id", "name", "number", "email"] },
        {
          model: Tag,
          as: "kanbanTag",
          attributes: [
            "id", "name", "key", "color", "kanban",
            "metaConversionName", "metaEventName", "metaLeadStatus",
            "metaRule", "metaCustomEventType", "metaCustomConversionId",
            "metaConversionStatus", "metaLastSyncAt", "metaLastError"
          ]
        },
        { model: Ticket, as: "ticket", attributes: ["id", "status", "lastMessage", "updatedAt"] }
      ]
    });
    if (!record) return res.status(404).json({ error: "Evento no encontrado" });

    return res.status(200).json(record);
  } catch (error: any) {
    logger.error(
      `[KANBAN-CAPI][show] Error: ${error?.message || error}`
    );
    return res
      .status(500)
      .json({ error: error?.message || "Error consultando detalle" });
  }
};

/**
 * Reintenta un evento en estado `failed`.
 */
export const retry = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "ID inválido" });
    }

    const result = await retryKanbanLeadConversion(companyId, id);

    if (!result.ok && result.reason === "not_found") {
      return res.status(404).json({ error: "Evento no encontrado" });
    }
    if (!result.ok && result.reason === "not_failed") {
      return res
        .status(409)
        .json({ error: `Solo se reintentan eventos failed. Estado actual: ${result.status}` });
    }

    const record = await KanbanLeadConversionEvent.findOne({
      where: { id, companyId }
    });
    return res.status(200).json({ result, record });
  } catch (error: any) {
    logger.error(
      `[KANBAN-CAPI][retry] Error: ${error?.message || error}`
    );
    return res
      .status(500)
      .json({ error: error?.message || "Error en retry" });
  }
};
