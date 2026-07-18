/**
 * PreprocessingService — Preprocesamiento de mensajes entrantes
 *
 * Normaliza el texto del usuario ANTES de que entre al pipeline de IA.
 * Garantiza que el LLM reciba inputs limpios y consistentes.
 *
 * Responsabilidades:
 * 1. Normalizar texto (espacios, caracteres de control, sanitización)
 * 2. Detectar idioma del mensaje
 * 3. Detectar tipo de mensaje (texto, audio transcrito, botón, etc.)
 * 4. Metadata útil para el orquestador
 *
 * Basado en la Guía de Agentes IA ChaTeam — Sección 3
 *
 * @module AIAgentServices/PreprocessingService
 */

import logger from "../../utils/logger";

const SERVICE_PREFIX = "[Preprocessing]";

export type DetectedLanguage = "es" | "en" | "pt" | "unknown";

export interface ProcessedMessage {
  originalText: string;       // Texto original sin modificar
  normalizedText: string;     // Texto limpio para el LLM
  language: DetectedLanguage; // Idioma detectado
  wordCount: number;          // Conteo de palabras
  hasEmojis: boolean;         // Si contiene emojis
  isShortMessage: boolean;    // < 5 palabras (saludo, sí/no, etc.)
  channel?: "whatsapp" | "webchat" | "facebook" | "instagram" | "telegram" | "unknown";
}

// ─── DETECCIÓN DE IDIOMA (heurística ligera, sin LLM) ──────────────────

const SPANISH_MARKERS = [
  /\b(hola|buenos|buenas|gracias|quiero|necesito|tengo|puedo|puede|cómo|qué|cuándo|dónde|por\s+qué)\b/i,
  /\b(también|después|aquí|ahora|todavía|siempre|nunca|porque|pero|aunque)\b/i,
  /[áéíóúñü¿¡]/i,
];

const ENGLISH_MARKERS = [
  /\b(hello|hi|hey|thanks|thank|please|want|need|have|can|could|how|what|when|where|why)\b/i,
  /\b(also|after|here|now|still|always|never|because|but|although|the|is|are)\b/i,
];

const PORTUGUESE_MARKERS = [
  /\b(olá|obrigado|obrigada|preciso|tenho|posso|como|quando|onde|por\s+que)\b/i,
  /\b(também|depois|aqui|agora|ainda|sempre|nunca|porque|mas|embora)\b/i,
  /[ãõçê]/i,
];

/**
 * Detecta el idioma del mensaje por marcadores léxicos
 */
const detectLanguage = (text: string): DetectedLanguage => {
  if (!text || text.trim().length < 3) return "unknown";

  const lower = text.toLowerCase();

  let esScore = 0;
  let enScore = 0;
  let ptScore = 0;

  for (const pattern of SPANISH_MARKERS) {
    if (pattern.test(lower)) esScore++;
  }
  for (const pattern of ENGLISH_MARKERS) {
    if (pattern.test(lower)) enScore++;
  }
  for (const pattern of PORTUGUESE_MARKERS) {
    if (pattern.test(lower)) ptScore++;
  }

  // Si ninguno tiene score, default a español (mercado principal de ChaTeam)
  if (esScore === 0 && enScore === 0 && ptScore === 0) return "es";

  if (ptScore > esScore && ptScore > enScore) return "pt";
  if (enScore > esScore && enScore > ptScore) return "en";
  return "es";
};

// ─── NORMALIZACIÓN DE TEXTO ─────────────────────────────────────────────

/**
 * Normaliza el texto del usuario para procesamiento por el LLM
 *
 * NO hace lowercase (el LLM necesita la capitalización original para
 * detectar tono/urgencia). Solo limpia ruido técnico.
 */
const normalizeText = (raw: string): string => {
  if (!raw) return "";

  return raw
    .trim()
    // Remover caracteres de control unicode (excepto newlines)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    // Remover zero-width spaces y caracteres invisibles
    .replace(/[\u200B-\u200F\u2028-\u202F\u2060\uFEFF]/g, "")
    // Colapsar espacios múltiples en uno solo
    .replace(/[ \t]+/g, " ")
    // Colapsar múltiples newlines en máximo 2
    .replace(/\n{3,}/g, "\n\n")
    // Remover espacios antes de signos de puntuación
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
};

/**
 * Detecta si el texto contiene emojis
 */
const hasEmojis = (text: string): boolean => {
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/u;
  return emojiRegex.test(text);
};

// ─── SERVICIO PRINCIPAL ─────────────────────────────────────────────────

/**
 * Preprocesa un mensaje entrante antes de enviarlo al pipeline de IA
 */
const process = (
  rawText: string,
  channel?: string
): ProcessedMessage => {
  const normalizedText = normalizeText(rawText);
  const words = normalizedText.split(/\s+/).filter(w => w.length > 0);
  const language = detectLanguage(normalizedText);

  // Mapear canal
  let mappedChannel: ProcessedMessage["channel"] = "unknown";
  if (channel) {
    const lowerChannel = channel.toLowerCase();
    if (lowerChannel.includes("whatsapp") || lowerChannel.includes("wbot") || lowerChannel.includes("baileys") || lowerChannel.includes("meta")) {
      mappedChannel = "whatsapp";
    } else if (lowerChannel.includes("web") || lowerChannel.includes("chat")) {
      mappedChannel = "webchat";
    } else if (lowerChannel.includes("facebook") || lowerChannel.includes("fb")) {
      mappedChannel = "facebook";
    } else if (lowerChannel.includes("instagram") || lowerChannel.includes("ig")) {
      mappedChannel = "instagram";
    } else if (lowerChannel.includes("telegram") || lowerChannel.includes("tg")) {
      mappedChannel = "telegram";
    }
  }

  const result: ProcessedMessage = {
    originalText: rawText,
    normalizedText,
    language,
    wordCount: words.length,
    hasEmojis: hasEmojis(normalizedText),
    isShortMessage: words.length <= 4,
    channel: mappedChannel,
  };

  logger.info(
    `${SERVICE_PREFIX} Procesado: lang=${language}, words=${words.length}, ` +
    `channel=${mappedChannel}, emojis=${result.hasEmojis}`
  );

  return result;
};

/**
 * Retorna max_tokens apropiado según el canal
 *
 * WhatsApp = mensajes cortos (500 tokens)
 * WebChat = puede ser más largo (1024 tokens)
 */
const getMaxTokensForChannel = (channel?: ProcessedMessage["channel"]): number => {
  switch (channel) {
    case "whatsapp":
      return 500;   // WhatsApp: mensajes cortos, 3-4 oraciones máx
    case "telegram":
      return 700;   // Telegram: un poco más de espacio
    case "webchat":
      return 1024;  // WebChat: más espacio para respuestas detalladas
    case "facebook":
    case "instagram":
      return 600;   // Redes sociales: moderado
    default:
      return 800;   // Default: balance
  }
};

export default {
  process,
  normalizeText,
  detectLanguage,
  getMaxTokensForChannel,
};
