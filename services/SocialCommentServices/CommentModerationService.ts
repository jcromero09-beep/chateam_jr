/**
 * [Fase2·Ola H] Moderación de comentarios sensibles con clasificación IA + humana.
 *
 * Regla de oro (criterio de aceptación): un comentario en categoría sensible NUNCA
 * se publica auto. Va a `pending_review` y espera aprobación humana. La clasificación
 * usa keywords (determinista, siempre disponible) y, si hay IA, la refina — pero la
 * decisión de enrutar a revisión no depende de que la IA funcione.
 */
import UGCPostComment from "../../models/UGCPostComment";
import SensitiveCategory from "../../models/SensitiveCategory";
import CommentModerationAudit from "../../models/CommentModerationAudit";
import logger from "../../utils/logger";

const PREFIX = "[CommentModeration]";

// Semilla por defecto (pensada para cuenta política en campaña). Configurable por empresa.
export const DEFAULT_SENSITIVE_CATEGORIES = [
  { key: "insultos", label: "Insultos / ofensas", keywords: ["idiota", "estúpido", "estupido", "imbécil", "imbecil", "corrupto", "ladrón", "ladron", "basura", "mierda", "hijueputa", "hp", "malparido"] },
  { key: "legal_electoral", label: "Legal / electoral", keywords: ["fraude", "denuncia", "demanda", "ilegal", "cne", "tribunal", "impugna", "voto nulo", "compra de votos"] },
  { key: "otros_candidatos", label: "Menciona a otros candidatos", keywords: ["mejor vota por", "el otro candidato", "prefiero a"] },
  { key: "denuncias", label: "Denuncias / quejas graves", keywords: ["me estafaron", "estafa", "no cumplió", "no cumplio", "amenaza", "peligro", "violencia"] },
  { key: "spam", label: "Spam / enlaces", keywords: ["http://", "https://", "wa.me", "gana dinero", "clic aquí", "promoción", "descuento exclusivo"] }
];

export type Classification = {
  sensitive: boolean;
  category: string | null;
  matched: string[];
  method: "keyword" | "ai" | "keyword+ai";
};

const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Clasificación determinista por keywords (siempre disponible, sin IA). */
export const classifyByKeywords = async (companyId: number, content: string): Promise<Classification> => {
  const configured = await SensitiveCategory.findAll({ where: { companyId, active: true } as any }).catch(() => []);
  const categories = configured.length
    ? configured.map(c => ({ key: c.key, keywords: (c.keywords as string[]) || [] }))
    : DEFAULT_SENSITIVE_CATEGORIES;

  const text = norm(content);
  for (const cat of categories) {
    const matched = (cat.keywords || []).filter(k => text.includes(norm(k)));
    if (matched.length) return { sensitive: true, category: cat.key, matched, method: "keyword" };
  }
  return { sensitive: false, category: null, matched: [], method: "keyword" };
};

/**
 * Clasifica y, si es sensible, enruta a `pending_review` (H.2) — nunca auto-publica.
 * Devuelve la clasificación para que el caller decida el auto-reply (que se BLOQUEA
 * si sensitive=true).
 */
export const moderateIncomingComment = async (
  comment: UGCPostComment
): Promise<Classification> => {
  const cls = await classifyByKeywords(comment.companyId, comment.content);

  if (cls.sensitive) {
    (comment as any).moderationStatus = "pending_review";
    (comment as any).sensitiveCategory = cls.category;
    await comment.save();
    await CommentModerationAudit.create({
      companyId: comment.companyId, commentId: comment.id, action: "classified",
      toStatus: "pending_review", category: cls.category,
      note: `Clasificado sensible por keywords: ${cls.matched.join(", ")}`
    } as any);
    logger.warn(`${PREFIX} comentario ${comment.id} → pending_review (${cls.category})`);
  } else {
    (comment as any).moderationStatus = "clear";
    await comment.save();
  }
  return cls;
};

/** ¿Se puede auto-responder este comentario? NO si está en cola de revisión. */
export const canAutoReply = (comment: UGCPostComment): boolean =>
  (comment as any).moderationStatus !== "pending_review";

type ModAction = "approve" | "reject" | "edit_draft";

/** Acción humana sobre un comentario en cola (H.2 + H.5 audit). */
export const humanModerate = async (params: {
  companyId: number;
  commentId: number;
  userId?: number;
  action: ModAction;
  draft?: string;
  note?: string;
}): Promise<UGCPostComment> => {
  const comment = await UGCPostComment.findOne({ where: { id: params.commentId, companyId: params.companyId } as any });
  if (!comment) throw new Error("Comentario no encontrado");

  const from = (comment as any).moderationStatus;
  const draftBefore = (comment as any).moderationDraft;
  let to = from;

  if (params.action === "edit_draft") {
    (comment as any).moderationDraft = params.draft ?? draftBefore;
  } else if (params.action === "approve") {
    to = "approved";
    (comment as any).moderationStatus = "approved";
    if (params.draft) (comment as any).moderationDraft = params.draft;
  } else if (params.action === "reject") {
    to = "rejected";
    (comment as any).moderationStatus = "rejected";
  }
  await comment.save();

  await CommentModerationAudit.create({
    companyId: params.companyId, commentId: params.commentId, userId: params.userId || null,
    action: params.action, fromStatus: from, toStatus: to, category: (comment as any).sensitiveCategory,
    draftBefore, draftAfter: (comment as any).moderationDraft, note: params.note || null
  } as any);

  logger.info(`${PREFIX} humano ${params.userId} ${params.action} comentario ${params.commentId}: ${from}→${to}`);
  return comment;
};

export default { DEFAULT_SENSITIVE_CATEGORIES, classifyByKeywords, moderateIncomingComment, canAutoReply, humanModerate };
