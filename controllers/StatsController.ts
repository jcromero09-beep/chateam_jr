// [Fase2·Ola D] API del motor estadístico + panel de Recomendaciones (Flujo 6).
import { Request, Response } from "express";
import { Op } from "sequelize";
import RecommendationRun from "../models/RecommendationRun";
import { runStatsForCompany } from "../services/StatsRecommendationService";
import logger from "../utils/logger";

/** POST /stats/run — corre el motor ahora y persiste las recomendaciones. */
export const runNow = async (req: Request, res: Response): Promise<Response> => {
  try {
    let { companyId } = req.user;
    // Override por query SOLO para super (patrón SettingController/signal-monitor).
    const isSuper = req.user?.super === true;
    const q = req.query.companyId ? Number(req.query.companyId) : undefined;
    if (isSuper && q && Number.isFinite(q)) companyId = q;
    const { recorded, drafts } = await runStatsForCompany(companyId);
    return res.status(200).json({ success: true, recorded, drafts });
  } catch (error: any) {
    logger.error(`[StatsController.runNow] ${error.message}`);
    return res.status(error?.statusCode || 500).json({ success: false, message: error.message });
  }
};

/** GET /stats/recommendations — panel: últimas recomendaciones (método+prob+supuesto). */
export const listRecommendations = async (req: Request, res: Response): Promise<Response> => {
  try {
    let { companyId } = req.user;
    const { status, kind, days = "30" } = req.query as any;
    const isSuper = req.user?.super === true;
    const q = req.query.companyId ? Number(req.query.companyId) : undefined;
    if (isSuper && q && Number.isFinite(q)) companyId = q;
    const where: any = {
      companyId,
      runDate: { [Op.gte]: new Date(Date.now() - Number(days) * 86400000).toISOString().slice(0, 10) }
    };
    if (status) where.status = status;
    if (kind) where.kind = kind;

    const rows = await RecommendationRun.findAll({
      where, order: [["runDate", "DESC"], ["id", "DESC"]], limit: 200
    });
    const withData = rows.filter(r => r.sufficientData).length;
    return res.status(200).json({
      success: true,
      recommendations: rows,
      resumen: { total: rows.length, conDatos: withData, insuficientes: rows.length - withData }
    });
  } catch (error: any) {
    return res.status(error?.statusCode || 500).json({ success: false, message: error.message });
  }
};

/** PUT /stats/recommendations/:id — aplicar/descartar (para medir acierto después). */
export const updateRecommendation = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { status, outcome } = req.body;
    const rec = await RecommendationRun.findOne({ where: { id: req.params.id, companyId } });
    if (!rec) return res.status(404).json({ success: false, message: "Recomendación no encontrada" });

    if (status && ["applied", "dismissed", "pending"].includes(status)) {
      rec.status = status;
      if (status === "applied") rec.appliedAt = new Date();
    }
    if (outcome && ["hit", "miss", "unknown"].includes(outcome)) rec.outcome = outcome;
    await rec.save();
    return res.status(200).json({ success: true, recommendation: rec });
  } catch (error: any) {
    return res.status(error?.statusCode || 500).json({ success: false, message: error.message });
  }
};

/** GET /stats/accuracy — tasa de acierto mensual (recommendation_runs mide acierto). */
export const accuracy = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const rows = await RecommendationRun.findAll({
      where: { companyId, outcome: { [Op.ne]: null } as any },
      attributes: ["outcome", "runDate"]
    });
    const applied = await RecommendationRun.count({ where: { companyId, status: "applied" } });
    const hits = rows.filter(r => r.outcome === "hit").length;
    const evaluated = rows.length;
    return res.status(200).json({
      success: true,
      accuracy: { evaluated, hits, hitRate: evaluated > 0 ? Math.round((hits / evaluated) * 100) : null, applied }
    });
  } catch (error: any) {
    return res.status(error?.statusCode || 500).json({ success: false, message: error.message });
  }
};
