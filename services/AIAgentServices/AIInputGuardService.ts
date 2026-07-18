export interface NormalizedAIInput {
  text: string;
  reason?: string;
  wasSanitized: boolean;
  originalChars: number;
}

const MEDIA_ONLY_PLACEHOLDERS = new Set([
  "audio",
  "áudio",
  "sticker",
  "reaction",
  "sem nome do evento",
  "archivo",
  "documento",
  "imagen",
  "image",
  "video",
  "document",
  "location",
  "media"
]);

const hasLetters = (value: string) => /[a-záéíóúüñ]/i.test(value);

const looksLikeUrl = (value: string) => /^https?:\/\//i.test(value);

const looksLikeCoordinates = (value: string) => /^-?\d{1,3}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?$/.test(value);

const startsWithDataUri = (value: string) => /^data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,/i.test(value);

const looksLikeBase64Blob = (value: string) => {
  const compact = value.replace(/\s+/g, "");
  if (compact.length < 500) return false;
  if (/^data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,/i.test(compact)) return true;
  if (/^[a-z0-9+/=]+$/i.test(compact) && /(\/9j\/|ivbor|aaaa|qk|sukq)/i.test(compact.slice(0, 80))) return true;
  return false;
};

const extractTextFromCompositeMediaPayload = (value: string) => {
  if (!value.includes("|")) return "";

  return value
    .split("|")
    .map(part => part.trim())
    .filter(part => {
      if (!part) return false;
      if (startsWithDataUri(part)) return false;
      if (looksLikeUrl(part)) return false;
      if (looksLikeCoordinates(part)) return false;
      if (looksLikeBase64Blob(part)) return false;
      if (!hasLetters(part)) return false;
      return true;
    })
    .join(" ")
    .trim();
};

export const normalizeSupervisorAIText = (rawBody: string | null | undefined): NormalizedAIInput => {
  const original = (rawBody || "").trim();
  const originalChars = original.length;

  if (!original) {
    return { text: "", reason: "empty_body", wasSanitized: false, originalChars };
  }

  const lower = original.toLowerCase();
  const placeholderKey = lower.replace(/^\[(.+)\]$/, "$1").trim();
  if (MEDIA_ONLY_PLACEHOLDERS.has(lower) || MEDIA_ONLY_PLACEHOLDERS.has(placeholderKey)) {
    return { text: "", reason: "media_only_placeholder", wasSanitized: false, originalChars };
  }

  if (startsWithDataUri(original)) {
    const extractedText = extractTextFromCompositeMediaPayload(original);
    if (extractedText) {
      return {
        text: extractedText,
        reason: "media_payload_sanitized",
        wasSanitized: true,
        originalChars
      };
    }

    return { text: "", reason: "media_base64_payload", wasSanitized: true, originalChars };
  }

  if (looksLikeBase64Blob(original)) {
    return { text: "", reason: "base64_blob_payload", wasSanitized: true, originalChars };
  }

  return { text: original, wasSanitized: false, originalChars };
};
