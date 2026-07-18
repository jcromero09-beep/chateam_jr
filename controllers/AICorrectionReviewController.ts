/**
 * AICorrectionReviewController — Panel de revisión humana de correcciones.
 *
 * Sprint 1 (2026-05-20) — Loop de Aprendizaje desde Correcciones Humanas.
 *
 * Endpoints expuestos:
 *   GET    /ai/correction-review              → list (con filtros status/type)
 *   GET    /ai/correction-review/stats        → KPIs por outcome
 *   GET    /ai/correction-review/:id          → detail
 *   POST   /ai/correction-review/:id/approve  → aprueba (crea AISupportCorrection)
 *   POST   /ai/correction-review/:id/reject   → rechaza
 *   POST   /ai/correction-review/bulk-approve → aprueba múltiples a la vez
 *
 * Multi-tenant: todo filtrado por companyId del usuario autenticado.
 */

import { Request, Response } from "express";
import { Op, QueryTypes } from "sequelize";
import sequelize from "../database";
import AICorrectionReviewQueue from "../models/AICorrectionReviewQueue";
import AICorrectionLearned from "../models/AICorrectionLearned";
import AIAgentLog from "../models/AIAgentLog";
import Ticket from "../models/Ticket";
import Contact from "../models/Contact";
import Queue from "../models/Queue";
import CorrectionLearningService from "../services/AILearningServices/CorrectionLearningService";
import logger from "../utils/logger";

const PAGE_SIZE = 20;

// ── LIST ───────────────────────────────────────────────────────
export const index = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const {
      status, correctionType, searchParam,
      pageNumber = "1"
    } = req.query as Record<string, string>;

    const offset = (Math.max(1, parseInt(pageNumber, 10) || 1) - 1) * PAGE_SIZE;

    const where: any = { companyId };
    if (status) where.status = status;
    if (correctionType) where.correctionType = correctionType;
    if (searchParam) {
      where[Op.or] = [
        { wrongAiClaim: { [Op.iLike]: `%${searchParam}%` } },
        { correctHumanClaim: { [Op.iLike]: `%${searchParam}%` } },
        { entity: { [Op.iLike]: `%${searchParam}%` } }
      ];
    }

    const { count, rows } = await AICorrectionReviewQueue.findAndCountAll({
      where,
      include: [
        { model: Ticket, attributes: ["id", "status", "contactId", "queueId"], required: false },
        { model: Queue, attributes: ["id", "name"], required: false },
        { model: Contact, attributes: ["id", "name", "number"], required: false }
      ] as any,
      order: [["createdAt", "DESC"]],
      limit: PAGE_SIZE,
      offset
    });

    return res.json({
      success: true,
      data: {
        records: rows,
        count,
        hasMore: count > offset + rows.length,
        pageNumber: parseInt(pageNumber, 10) || 1
      }
    });
  } catch (err: any) {
    logger.error(`[CorrectionReview] index error: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── STATS (KPIs para el panel) ──────────────────────────────────
export const stats = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const days = Math.max(1, parseInt((req.query.days as string) || "30", 10));

    const reviewStats = await sequelize.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count
         FROM "AICorrectionReviewQueue"
        WHERE "companyId" = :companyId
          AND "createdAt" >= NOW() - (:days || ' days')::interval
        GROUP BY status`,
      { replacements: { companyId, days }, type: QueryTypes.SELECT }
    );

    const learnedStats = await sequelize.query<{ outcome: string; count: string }>(
      `SELECT outcome, COUNT(*)::text AS count
         FROM "AICorrectionLearned"
        WHERE "companyId" = :companyId
          AND "createdAt" >= NOW() - (:days || ' days')::interval
        GROUP BY outcome`,
      { replacements: { companyId, days }, type: QueryTypes.SELECT }
    );

    return res.json({
      success: true,
      data: {
        days,
        reviewByStatus: reviewStats.reduce((acc, r) => {
          acc[r.status] = parseInt(r.count, 10) || 0;
          return acc;
        }, {} as Record<string, number>),
        learnedByOutcome: learnedStats.reduce((acc, r) => {
          acc[r.outcome] = parseInt(r.count, 10) || 0;
          return acc;
        }, {} as Record<string, number>)
      }
    });
  } catch (err: any) {
    logger.error(`[CorrectionReview] stats error: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── SHOW (detalle) ─────────────────────────────────────────────
export const show = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: "id inválido" });
    }

    const item = await AICorrectionReviewQueue.findOne({
      where: { id, companyId },
      include: [
        { model: Ticket, required: false },
        { model: Queue, attributes: ["id", "name"], required: false },
        { model: Contact, attributes: ["id", "name", "number", "email"], required: false }
      ] as any
    });

    if (!item) {
      return res.status(404).json({ success: false, message: "Review no encontrado" });
    }

    // Adjuntar el AIAgentLog original para preview side-by-side
    let aiLog: any = null;
    if (item.aiAgentLogId) {
      try {
        aiLog = await AIAgentLog.findOne({
          where: { id: item.aiAgentLogId, companyId },
          attributes: ["id", "agentType", "modelUsed", "inputSummary", "outputSummary",
                       "confidence", "humanCorrection", "createdAt"]
        });
      } catch { /* silent */ }
    }

    return res.json({ success: true, data: { review: item, aiLog } });
  } catch (err: any) {
    logger.error(`[CorrectionReview] show error: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── APPROVE ────────────────────────────────────────────────────
export const approve = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId, id: userId } = req.user as any;
    const reviewId = parseInt(req.params.id, 10);
    if (!Number.isFinite(reviewId)) {
      return res.status(400).json({ success: false, message: "id inválido" });
    }

    const { overrideProblem, overrideSolution, reviewNotes } = req.body || {};

    const result = await CorrectionLearningService.approveFromReview({
      reviewQueueId: reviewId,
      companyId,
      approvedByUserId: userId,
      overrideProblem,
      overrideSolution,
      reviewNotes
    });

    if (!result.ok) {
      return res.status(400).json({ success: false, message: result.reason || "approve_failed" });
    }

    return res.json({ success: true, data: { supportCorrectionId: result.supportCorrectionId } });
  } catch (err: any) {
    logger.error(`[CorrectionReview] approve error: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── REJECT ─────────────────────────────────────────────────────
export const reject = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId, id: userId } = req.user as any;
    const reviewId = parseInt(req.params.id, 10);
    if (!Number.isFinite(reviewId)) {
      return res.status(400).json({ success: false, message: "id inválido" });
    }

    const { reviewNotes } = req.body || {};

    const result = await CorrectionLearningService.rejectFromReview({
      reviewQueueId: reviewId,
      companyId,
      rejectedByUserId: userId,
      reviewNotes
    });

    if (!result.ok) {
      return res.status(400).json({ success: false, message: result.reason || "reject_failed" });
    }

    return res.json({ success: true });
  } catch (err: any) {
    logger.error(`[CorrectionReview] reject error: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── BULK APPROVE ───────────────────────────────────────────────
export const bulkApprove = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId, id: userId } = req.user as any;
    const { ids } = req.body || {};

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "ids debe ser array no vacío" });
    }
    if (ids.length > 50) {
      return res.status(400).json({ success: false, message: "máximo 50 ids por llamada" });
    }

    const results: Array<{ id: number; ok: boolean; reason?: string; supportCorrectionId?: number }> = [];
    for (const rawId of ids) {
      const id = parseInt(String(rawId), 10);
      if (!Number.isFinite(id)) {
        results.push({ id: rawId, ok: false, reason: "id_invalido" });
        continue;
      }
      const r = await CorrectionLearningService.approveFromReview({
        reviewQueueId: id,
        companyId,
        approvedByUserId: userId
      });
      results.push({ id, ok: r.ok, reason: r.reason, supportCorrectionId: r.supportCorrectionId });
    }

    return res.json({ success: true, data: results });
  } catch (err: any) {
    logger.error(`[CorrectionReview] bulkApprove error: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
};
