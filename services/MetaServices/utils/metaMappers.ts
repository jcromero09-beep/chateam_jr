export type MetaMsgKind =
  | "text" | "image" | "document" | "audio" | "video" | "sticker"
  | "location" | "contacts" | "interactive" | "unknown";

export function extractMetaKind(message: any): MetaMsgKind {
  const t = message?.type as string;
  if (!t) return "unknown";
  if (["text","image","document","audio","video","sticker","location","contacts","interactive"].includes(t)) {
    return t as MetaMsgKind;
  }
  return "unknown";
}

export function extractBodyPreview(message: any): string {
  const kind = extractMetaKind(message);
  switch (kind) {
    case "text":
      return message?.text?.body ?? "";
    case "interactive":
      return (
        message?.interactive?.button_reply?.title ||
        message?.interactive?.list_reply?.title ||
        "[interactive]"
      );
    case "location":
      const loc = message?.location;
      return loc ? `📍 ${loc?.name || ""} (${loc?.latitude}, ${loc?.longitude})` : "[location]";
    case "contacts":
      const c = message?.contacts?.[0];
      return c?.name?.formatted_name ? `👤 ${c.name.formatted_name}` : "[contact]";
    case "image":
    case "document":
    case "audio":
    case "video":
    case "sticker":
      return `[${kind}]`;
    default:
      return "[unknown]";
  }
}
