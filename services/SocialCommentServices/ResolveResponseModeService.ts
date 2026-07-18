/**
 * ResolveResponseModeService — Módulo Comentarios FB/IG (GAP 3).
 *
 * Resuelve el modo de respuesta activo para un comentario entrante:
 *   1. Override por post  → CommentResponseSettings con socialPostId
 *   2. Modo por conexión  → CommentResponseSettings con socialPostId = null
 *   3. Default            → { mode: 'manual' } (nunca responde solo)
 *
 * Un solo modo activo por ámbito → un comentario JAMÁS recibe 2 respuestas.
 */
import CommentResponseSettings, {
  ResponseMode
} from "../../models/CommentResponseSettings";

export interface ResolvedResponseMode {
  mode: ResponseMode;
  /** Setting que ganó la resolución (null si aplica el default manual). */
  setting: CommentResponseSettings | null;
  /** Ámbito que resolvió el modo (auditoría/logs). */
  scope: "post" | "connection" | "default";
}

const ResolveResponseModeService = async (
  companyId: number,
  whatsappId: number,
  socialPostId?: number | null
): Promise<ResolvedResponseMode> => {
  // 1. Override por post (si el comentario pertenece a un post conocido)
  if (socialPostId) {
    const postOverride = await CommentResponseSettings.findOne({
      where: { companyId, whatsappId, socialPostId, isActive: true }
    });
    if (postOverride) {
      return { mode: postOverride.mode, setting: postOverride, scope: "post" };
    }
  }

  // 2. Modo por conexión (socialPostId null = configuración general)
  const connectionSetting = await CommentResponseSettings.findOne({
    where: { companyId, whatsappId, socialPostId: null, isActive: true }
  });
  if (connectionSetting) {
    return {
      mode: connectionSetting.mode,
      setting: connectionSetting,
      scope: "connection"
    };
  }

  // 3. Default seguro: manual (el humano responde desde el inbox)
  return { mode: "manual", setting: null, scope: "default" };
};

export default ResolveResponseModeService;
