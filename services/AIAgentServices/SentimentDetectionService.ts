/**
 * SentimentDetectionService — Detección de sentimiento y frustración
 *
 * Analiza el mensaje del usuario ANTES de la clasificación de intención
 * para detectar frustración, enojo o urgencia emocional.
 *
 * Si se detecta frustración severa:
 * - Se puede forzar escalado a humano
 * - Se pasa el sentimiento al LLM para que adapte su tono (más empático)
 *
 * Basado en la Guía de Agentes IA ChaTeam — Sección 8.2
 *
 * @module AIAgentServices/SentimentDetectionService
 */

import logger from "../../utils/logger";

const SERVICE_PREFIX = "[SentimentDetection]";

export type SentimentType = "positive" | "neutral" | "negative" | "frustrated";

export interface SentimentResult {
  sentiment: SentimentType;
  confidence: number;
  shouldForceEscalate: boolean;
  frustrationLevel: number; // 0-3 (0=none, 1=mild, 2=moderate, 3=severe)
  matchedPatterns: string[];
}

// ─── PATRONES DE FRUSTRACIÓN (español + inglés) ─────────────────────────

const FRUSTRATION_PATTERNS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  // Frustración directa con el servicio
  { pattern: /no\s+(me|les?)\s+(ayudan?|sirve[ns]?|funciona|resuelven?|entienden?)/i, weight: 2, label: "no_ayudan" },
  { pattern: /(muy|super|demasiado|bien)\s+(malo|pésimo|horrible|terrible|inútil|lento)/i, weight: 2, label: "calificativo_negativo" },
  { pattern: /(esto|este|esta)\s+(es|fue)\s+(un\s+)?(fraude|robo|estafa|engaño|mentira)/i, weight: 3, label: "acusacion_grave" },

  // Tiempo de espera
  { pattern: /(llevo|tengo|van|hace)\s+(\d+)\s+(días?|horas?|semanas?|meses?)\s+(esperando|sin|que)/i, weight: 2, label: "espera_prolongada" },
  { pattern: /nadie\s+(me\s+)?(responde|contesta|ayuda|atiende)/i, weight: 2, label: "nadie_responde" },

  // Solicitud explícita de humano (frustrada)
  { pattern: /quiero\s+hablar\s+(con|a)\s+(un[ao]?\s+)?(persona|humano|asesor|agente|supervisor|jefe)/i, weight: 1, label: "pedir_humano" },
  { pattern: /no\s+quiero\s+(hablar\s+con\s+)?(un\s+)?(bot|robot|máquina|ia|inteligencia)/i, weight: 2, label: "rechazar_bot" },

  // Repetición y cansancio
  { pattern: /(ya\s+les?\s+dije|ya\s+expliqué|es\s+la\s+(segunda|tercera|\d+)\s+vez)/i, weight: 2, label: "repeticion" },
  { pattern: /(siempre|cada\s+vez)\s+(lo\s+mismo|el\s+mismo\s+problema|igual)/i, weight: 2, label: "problema_recurrente" },

  // Amenazas / ultimátums
  { pattern: /(voy\s+a|les\s+voy)\s+(denunciar|demandar|reportar|publicar|poner\s+queja)/i, weight: 3, label: "amenaza_legal" },
  { pattern: /me\s+voy\s+(a\s+)?(la\s+)?competencia/i, weight: 2, label: "amenaza_abandono" },
  { pattern: /(cancel|cerr)ar\s+(mi\s+)?(cuenta|suscripción|plan|contrato|servicio)/i, weight: 2, label: "cancelar_servicio" },

  // Insultos suaves (detección, no filtro)
  { pattern: /(qué\s+)?(pésimo|basura|porquería|asco|vergüenza)\s*(de\s+)?(servicio|atención|empresa)?/i, weight: 2, label: "insulto_servicio" },

  // Frustración emocional
  { pattern: /(estoy|me\s+tienen?)\s+(hart[oa]|cansad[oa]|molest[oa]|frustrad[oa]|indignado)/i, weight: 2, label: "emocion_negativa" },
  { pattern: /no\s+(puede|es\s+posible|puedo\s+creer)\s+que/i, weight: 1, label: "incredulidad" },

  // Inglés (por si el usuario escribe en inglés)
  { pattern: /this\s+is\s+(ridiculous|unacceptable|terrible|awful|the\s+worst)/i, weight: 2, label: "en_frustration" },
  { pattern: /i('ve|\s+have)\s+been\s+waiting\s+(for\s+)?\d+/i, weight: 2, label: "en_waiting" },
];

// Patrones de sentimiento positivo
const POSITIVE_PATTERNS: RegExp[] = [
  /gracias|excelente|genial|perfecto|increíble|maravillos[oa]/i,
  /me\s+(ayudó|sirvió|encantó|gustó)/i,
  /buen(o|a|ísimo)\s+(servicio|atención)/i,
  /thank\s+(you|u)|great|awesome|perfect/i,
];

/**
 * Analiza el sentimiento de un mensaje
 */
const analyze = (text: string): SentimentResult => {
  if (!text || text.trim().length === 0) {
    return {
      sentiment: "neutral",
      confidence: 1.0,
      shouldForceEscalate: false,
      frustrationLevel: 0,
      matchedPatterns: [],
    };
  }

  const normalizedText = text.trim();
  const matchedPatterns: string[] = [];
  let totalWeight = 0;

  // Evaluar patrones de frustración
  for (const { pattern, weight, label } of FRUSTRATION_PATTERNS) {
    if (pattern.test(normalizedText)) {
      matchedPatterns.push(label);
      totalWeight += weight;
    }
  }

  // MAYÚSCULAS = enojo (si más del 60% del texto es mayúscula y tiene más de 10 chars)
  const uppercaseRatio = normalizedText.length > 10
    ? (normalizedText.replace(/[^A-ZÁÉÍÓÚÑÜ]/g, "").length / normalizedText.replace(/[^a-zA-ZáéíóúñüÁÉÍÓÚÑÜ]/g, "").length)
    : 0;

  if (uppercaseRatio > 0.6) {
    totalWeight += 1;
    matchedPatterns.push("mayusculas_excesivas");
  }

  // Signos de exclamación múltiples
  const exclamationCount = (normalizedText.match(/!/g) || []).length;
  if (exclamationCount >= 3) {
    totalWeight += 1;
    matchedPatterns.push("exclamaciones_multiples");
  }

  // Determinar nivel de frustración
  let frustrationLevel: number;
  if (totalWeight === 0) frustrationLevel = 0;
  else if (totalWeight <= 2) frustrationLevel = 1; // mild
  else if (totalWeight <= 4) frustrationLevel = 2; // moderate
  else frustrationLevel = 3; // severe

  // Si hay frustración, evaluar
  if (frustrationLevel > 0) {
    const shouldForceEscalate = frustrationLevel >= 3; // Solo forzar en severa
    const confidence = Math.min(0.5 + totalWeight * 0.1, 0.99);

    logger.info(
      `${SERVICE_PREFIX} Frustración detectada: level=${frustrationLevel}, ` +
      `weight=${totalWeight}, patterns=[${matchedPatterns.join(",")}], ` +
      `forceEscalate=${shouldForceEscalate}`
    );

    return {
      sentiment: frustrationLevel >= 2 ? "frustrated" : "negative",
      confidence,
      shouldForceEscalate,
      frustrationLevel,
      matchedPatterns,
    };
  }

  // Evaluar positivo
  const isPositive = POSITIVE_PATTERNS.some((p) => p.test(normalizedText));
  if (isPositive) {
    return {
      sentiment: "positive",
      confidence: 0.8,
      shouldForceEscalate: false,
      frustrationLevel: 0,
      matchedPatterns: [],
    };
  }

  // Default: neutral
  return {
    sentiment: "neutral",
    confidence: 0.7,
    shouldForceEscalate: false,
    frustrationLevel: 0,
    matchedPatterns: [],
  };
};

/**
 * Genera instrucciones de tono para el LLM basadas en el sentimiento
 * Se inyecta en el system prompt para que el agente adapte su respuesta
 */
const getToneInstructions = (result: SentimentResult): string => {
  switch (result.frustrationLevel) {
    case 0:
      return ""; // No agregar instrucciones extra
    case 1:
      return (
        "\n⚠️ TONO: El cliente muestra leve molestia. " +
        "Sé especialmente empático, valida su preocupación y ofrece soluciones concretas."
      );
    case 2:
      return (
        "\n🔴 TONO: El cliente está frustrado. " +
        "PRIMERO reconoce su frustración con empatía genuina (ej: 'Entiendo tu frustración y lamento la situación'). " +
        "DESPUÉS ofrece una solución concreta o escalado inmediato. " +
        "NO uses frases robóticas como 'lamento los inconvenientes'. Sé humano."
      );
    case 3:
      return (
        "\n🚨 TONO: El cliente está MUY frustrado/enojado. " +
        "PRIORIDAD: Desescalar. Reconoce el problema, discúlpate sinceramente, " +
        "y ofrece transferencia inmediata a un agente humano. " +
        "NO intentes resolver el problema tú solo — el cliente necesita atención humana."
      );
    default:
      return "";
  }
};

export default {
  analyze,
  getToneInstructions,
};
