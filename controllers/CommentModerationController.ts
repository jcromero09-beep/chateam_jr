// [Fase2·Ola H · H.2/H.5/H.6] API de la cola de moderación humana.
import { Request, Response } from "express";
import UGCPostComment from "../models/UGCPostComment";
import SensitiveCategory from "../models/SensitiveCategory";
import CommentModerationAudit from "../models/CommentModerationAudit";
import * as Mod from "../services/SocialCommentServices/CommentModerationService";

const wrap = (fn: (req: Request, res: Response) => Promise<Response>) =>
  async (req: Request, res: Response) => {
    try { return await fn(req, res); }
    catch (e: any) { return res.status(e?.statusCode || 500).json({ success: false, message: e.message }); }
  };

/** [H.6] Cola: comentarios en revisión humana. */
export const queue = wrap(async (req, res) => {
  const { companyId } = req.user;
  const { category } = req.query as any;
  const where: any = { companyId, moderationStatus: "pending_review" };
  if (category) where.sensitiveCategory = category;
  const rows = await UGCPostComment.findAll({ where, order: [["id", "DESC"]], limit: 200 });
  return res.status(200).json({ success: true, comments: rows, count: rows.length });
});

/** [H.4] Badge: nº de comentarios pendientes. */
export const pendingCount = wrap(async (req, res) => {
  const { companyId } = req.user;
  const count = await UGCPostComment.count({ where: { companyId, moderationStatus: "pending_review" } as any });
  return res.status(200).json({ success: true, count });
});

/** Acciones humanas (aprobar/rechazar/editar borrador) — registra auditoría (H.5). */
export const act = wrap(async (req, res) => {
  const { companyId, id: userId } = req.user;
  const comment = await Mod.humanModerate({
    companyId, userId, commentId: Number(req.params.commentId),
    action: req.body.action, draft: req.body.draft, note: req.body.note
  });
  return res.status(200).json({ success: true, comment });
});

/** [H.5] Auditoría de un comentario (quién hizo qué). */
export const audit = wrap(async (req, res) => {
  const { companyId } = req.user;
  const rows = await CommentModerationAudit.findAll({
    where: { companyId, commentId: Number(req.params.commentId) } as any,
    order: [["id", "ASC"]]
  });
  return res.status(200).json({ success: true, audit: rows });
});

/** Clasificar un texto (para probar/manual). */
export const classify = wrap(async (req, res) => {
  const { companyId } = req.user;
  const cls = await Mod.classifyByKeywords(companyId, req.body.content || "");
  return res.status(200).json({ success: true, ...cls });
});

/** [H.1] Categorías sensibles configurables. */
export const listCategories = wrap(async (req, res) => {
  const { companyId } = req.user;
  const rows = await SensitiveCategory.findAll({ where: { companyId } as any, order: [["id", "ASC"]] });
  return res.status(200).json({
    success: true,
    categories: rows.length ? rows : Mod.DEFAULT_SENSITIVE_CATEGORIES,
    usingDefaults: rows.length === 0
  });
});

export const upsertCategory = wrap(async (req, res) => {
  const { companyId } = req.user;
  const { key, label, keywords, description, requiresHuman, active } = req.body;
  if (!key || !label) return res.status(400).json({ success: false, message: "key y label requeridos" });
  const [cat] = await SensitiveCategory.findOrCreate({ where: { companyId, key } as any, defaults: { companyId, key, label } as any });
  cat.label = label ?? cat.label;
  if (keywords !== undefined) cat.keywords = keywords;
  if (description !== undefined) cat.description = description;
  if (requiresHuman !== undefined) cat.requiresHuman = !!requiresHuman;
  if (active !== undefined) cat.active = !!active;
  await cat.save();
  return res.status(200).json({ success: true, category: cat });
});
