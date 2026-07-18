/**
 * extractCommentEvents — Normalización de eventos de comentarios del webhook Meta.
 *
 * Fuente ÚNICA de verdad para extraer comentarios FB/IG de un payload de
 * webhook (entry[].changes[]). La usan tanto MetaWebhookController (/webhook/metaws)
 * como WebHookController (/webhook, callback del objeto 'page'/'instagram').
 *
 *  - Facebook: change.field === 'feed' && change.value.item === 'comment'
 *    (entry.id = page id, verbs add/edited/remove/hide/unhide)
 *  - Instagram: change.field === 'comments'
 *    (entry.id = instagram business account id; IG solo notifica altas)
 *
 * Devuelve [] si el payload no contiene comentarios.
 */
import {
  NormalizedCommentEvent,
  SocialCommentVerb
} from "./IngestCommentService";

export const FB_COMMENT_VERBS: SocialCommentVerb[] = [
  "add",
  "edited",
  "remove",
  "hide",
  "unhide"
];

export const extractCommentEvents = (
  body: unknown
): NormalizedCommentEvent[] => {
  const events: NormalizedCommentEvent[] = [];
  const payload = body as {
    object?: string;
    entry?: Array<{
      id?: string | number;
      time?: number;
      changes?: Array<{ field?: string; value?: Record<string, unknown> }>;
    }>;
  };

  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = (change?.value || {}) as Record<string, unknown>;

      // ── Facebook: field 'feed' con item 'comment' ────────────────
      if (change?.field === "feed" && value.item === "comment") {
        const verb = String(value.verb || "add") as SocialCommentVerb;
        if (!FB_COMMENT_VERBS.includes(verb)) continue;
        const from = (value.from || {}) as { id?: string; name?: string };
        if (!value.comment_id || !value.post_id) continue;

        events.push({
          platform: "facebook",
          pageOrIgId: String(entry.id ?? ""),
          verb,
          commentId: String(value.comment_id),
          parentExternalId: value.parent_id ? String(value.parent_id) : null,
          postExternalId: String(value.post_id),
          text: typeof value.message === "string" ? value.message : "",
          fromId: from.id ? String(from.id) : "",
          fromName: from.name || "Usuario Facebook",
          createdTime:
            typeof value.created_time === "number"
              ? value.created_time
              : entry.time ?? null,
          permalink:
            typeof value.permalink_url === "string"
              ? value.permalink_url
              : null
        });
        continue;
      }

      // ── Instagram: field 'comments' (entry.id = ig-business-id) ──
      if (change?.field === "comments" && value.id) {
        const from = (value.from || {}) as { id?: string; username?: string };
        const media = (value.media || {}) as { id?: string };
        if (!media.id) continue;

        events.push({
          platform: "instagram",
          pageOrIgId: String(entry.id ?? ""),
          verb: "add",
          commentId: String(value.id),
          parentExternalId: value.parent_id ? String(value.parent_id) : null,
          postExternalId: String(media.id),
          text: typeof value.text === "string" ? value.text : "",
          fromId: from.id ? String(from.id) : "",
          fromName: from.username || "Usuario Instagram",
          createdTime: entry.time ?? null,
          permalink: null
        });
      }
    }
  }

  return events;
};

export default extractCommentEvents;
