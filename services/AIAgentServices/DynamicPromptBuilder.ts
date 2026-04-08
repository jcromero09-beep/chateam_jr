/**
 * DynamicPromptBuilder — Constructor de System Prompts con Identidad y Lenguaje Natural
 *
 * Reemplaza los system prompts genéricos ("Eres un agente especializado...")
 * por prompts dinámicos con:
 *
 * 1. Identidad del agente (nombre, tono, personalidad)
 * 2. Las 7 reglas de lenguaje natural de ChaTeam
 * 3. Capacidades y restricciones explícitas
 * 4. Contexto del contacto formateado de forma legible
 * 5. Instrucciones de tono según sentimiento detectado
 *
 * Basado en la Guía de Agentes IA ChaTeam — Secciones 5.1, 5.2 y 8.1
 *
 * @module AIAgentServices/DynamicPromptBuilder
 */

import SentimentDetectionService, { SentimentResult } from "./SentimentDetectionService";
import { DetectedLanguage } from "./PreprocessingService";
import logger from "../../utils/logger";

const SERVICE_PREFIX = "[DynamicPromptBuilder]";

// ─── INTERFACES ─────────────────────────────────────────────────────────

export interface AgentIdentity {
  /** Nombre del agente (ej: "Sofía", "Carlos"). Null = usar nombre de BD */
  name?: string;
  /** Tono del agente (ej: "amable y profesional", "entusiasta") */
  tone?: string;
  /** Tipo de agente */
  agentType: "rag" | "support" | "sales" | "appointment";
  /** Descripción del rol */
  roleDescription?: string;
  /** Lista de capacidades del agente */
  capabilities?: string[];
  /** Restricciones adicionales */
  restrictions?: string[];
}

export interface ContactContext {
  name?: string;
  phone?: string;
  company?: string;
  plan?: string;
  email?: string;
  totalMessages?: number;
  /** Cualquier campo extra del contacto */
  [key: string]: unknown;
}

export interface CompanyContext {
  name?: string;
  phone?: string;
  email?: string;
  city?: string;
  timezone?: string;
}

export interface PromptBuildOptions {
  agentIdentity: AgentIdentity;
  contactInfo?: ContactContext;
  companyInfo?: CompanyContext;
  sentiment?: SentimentResult;
  language?: DetectedLanguage;
  channel?: string;
  /** System prompt personalizado de BD (AIAgentConfig.systemPrompt) */
  dbSystemPrompt?: string;
}

// ─── REGLAS DE LENGUAJE NATURAL ─────────────────────────────────────────

const NATURAL_LANGUAGE_RULES = `
## Reglas de Lenguaje Natural (OBLIGATORIAS)

1. **Usa el nombre del cliente** cuando lo tengas — nunca digas "Estimado usuario"
2. **Valida antes de preguntar** — no pidas datos que ya tienes en el contexto
3. **Una pregunta a la vez** — nunca hagas preguntas múltiples en un solo mensaje
4. **Verbos activos** — di "Voy a revisar tu cuenta" en vez de "Se procederá a verificar"
5. **Máximo 3-4 oraciones** por mensaje (especialmente en WhatsApp)
6. **Cierra con acción** — termina con algo concreto ("Te llega la confirmación en 2 min") no con "Quedo a sus órdenes"
7. **Refleja el tono del usuario** — si es informal, sé informal. Si es formal, sé formal.
`.trim();

// ─── DEFAULTS POR TIPO DE AGENTE ────────────────────────────────────────

const AGENT_DEFAULTS: Record<string, Partial<AgentIdentity>> = {
  rag: {
    name: "Asistente",
    tone: "amable, profesional y conciso",
    roleDescription: "Respondo preguntas de los clientes usando la base de conocimientos de la empresa.",
    capabilities: [
      "Consultar información de productos y servicios",
      "Responder preguntas frecuentes",
      "Explicar políticas y procedimientos",
      "Orientar al cliente sobre procesos",
    ],
  },
  support: {
    name: "Asistente de Soporte",
    tone: "empático, resolutivo y paciente",
    roleDescription: "Resuelvo problemas técnicos y de cuenta de los clientes.",
    capabilities: [
      "Diagnosticar problemas técnicos",
      "Consultar estado de cuenta",
      "Reportar incidencias",
      "Explicar funcionalidades del producto",
      "Escalar a soporte humano cuando sea necesario",
    ],
  },
  sales: {
    name: "Asesor Comercial",
    tone: "entusiasta, orientado a soluciones y persuasivo sin ser agresivo",
    roleDescription: "Ayudo a clientes a encontrar el plan o producto ideal para sus necesidades.",
    capabilities: [
      "Presentar planes y precios",
      "Comparar opciones según necesidades del cliente",
      "Procesar upgrades de plan",
      "Calificar leads para el equipo comercial",
      "Enviar información adicional o demos",
    ],
  },
  appointment: {
    name: "Asistente de Citas",
    tone: "eficiente, claro y amable",
    roleDescription: "Gestiono agendamiento, reagendamiento y cancelación de citas.",
    capabilities: [
      "Consultar disponibilidad de horarios",
      "Agendar nuevas citas",
      "Reagendar citas existentes",
      "Cancelar citas",
      "Enviar recordatorios de citas",
    ],
  },
};

// ─── CONSTRUCTOR PRINCIPAL ──────────────────────────────────────────────

/**
 * Construye un system prompt dinámico con identidad, reglas y contexto
 *
 * Si existe un dbSystemPrompt (cargado de AIAgentConfig en BD),
 * se usa como BASE y se le añaden las secciones dinámicas.
 * Si no existe, se construye todo desde los defaults.
 */
const buildSystemPrompt = (options: PromptBuildOptions): string => {
  const {
    agentIdentity,
    contactInfo,
    companyInfo,
    sentiment,
    language = "es",
    channel,
    dbSystemPrompt,
  } = options;

  // Merge: BD > opciones explícitas > defaults
  const defaults = AGENT_DEFAULTS[agentIdentity.agentType] || AGENT_DEFAULTS.rag;
  const agentName = agentIdentity.name || defaults.name || "Asistente";
  const agentTone = agentIdentity.tone || defaults.tone || "amable y profesional";
  const roleDesc = agentIdentity.roleDescription || defaults.roleDescription || "";
  const capabilities = agentIdentity.capabilities || defaults.capabilities || [];
  const restrictions = agentIdentity.restrictions || [];

  const languageLabel = language === "en" ? "inglés" : language === "pt" ? "portugués" : "español";

  const sections: string[] = [];

  // ── 1. IDENTIDAD ──────────────────────────────────────────────────
  if (dbSystemPrompt) {
    // Si hay prompt personalizado de BD, usarlo como identidad base
    sections.push(dbSystemPrompt.trim());
  } else {
    sections.push(
      `Eres ${agentName}${companyInfo?.name ? `, asistente especializado de ${companyInfo.name}` : ""}.`
    );
    sections.push(`\n## Tu rol\n${roleDesc}`);
  }

  // ── 2. PERSONALIDAD Y TONO ────────────────────────────────────────
  sections.push(`
## Personalidad y tono
- Responde SIEMPRE en ${languageLabel}
- Tu tono es: ${agentTone}
- Sé conciso: máximo 3-4 oraciones por mensaje${channel === "whatsapp" ? " (es WhatsApp, los mensajes largos NO se leen)" : ""}
- Lenguaje NATURAL, no robótico. Evita: "procesando tu solicitud", "lamento los inconvenientes"
- Si no sabes algo, dilo con honestidad y ofrece una alternativa
- NUNCA inventes datos: precios, disponibilidad, estados de cuenta o información que no tengas
`);

  // ── 3. REGLAS DE LENGUAJE NATURAL ─────────────────────────────────
  sections.push(NATURAL_LANGUAGE_RULES);

  // ── 4. CAPACIDADES ────────────────────────────────────────────────
  if (capabilities.length > 0 && !dbSystemPrompt) {
    sections.push(`
## Capacidades
${capabilities.map(c => `- ${c}`).join("\n")}
`);
  }

  // ── 5. RESTRICCIONES ──────────────────────────────────────────────
  const allRestrictions = [
    "No discutir temas fuera de tu dominio",
    "No compartir datos de otros clientes",
    "No prometer descuentos ni beneficios no autorizados",
    "No dar información médica, legal o financiera específica",
    ...restrictions,
  ];

  sections.push(`
## Restricciones
${allRestrictions.map(r => `- ${r}`).join("\n")}
`);

  // ── 6. REGLAS DE ESCALADO ─────────────────────────────────────────
  sections.push(`
## Cuándo escalar a humano
- El usuario lo pide explícitamente
- Frustración severa (2+ mensajes negativos seguidos)
- Menciona problemas legales, amenazas o acusaciones graves
- No puedes resolver el problema con las herramientas disponibles
- El problema requiere acceso a sistemas internos que no tienes
`);

  // ── 7. CONTEXTO DEL CONTACTO ──────────────────────────────────────
  if (contactInfo && Object.keys(contactInfo).length > 0) {
    const contactLines: string[] = [];

    if (contactInfo.name) contactLines.push(`Nombre: ${contactInfo.name}`);
    if (contactInfo.plan) contactLines.push(`Plan: ${contactInfo.plan}`);
    if (contactInfo.company) contactLines.push(`Empresa: ${contactInfo.company}`);
    if (contactInfo.email) contactLines.push(`Email: ${contactInfo.email}`);
    if (contactInfo.totalMessages) contactLines.push(`Mensajes previos: ${contactInfo.totalMessages}`);

    if (contactLines.length > 0) {
      sections.push(`
## Contexto del cliente
${contactLines.join("\n")}
`);
    }
  } else {
    sections.push(`
## Contexto del cliente
Cliente nuevo — si es natural en la conversación, pregunta su nombre de forma amigable.
`);
  }

  // ── 8. INSTRUCCIONES DE TONO POR SENTIMIENTO ──────────────────────
  if (sentiment) {
    const toneInstructions = SentimentDetectionService.getToneInstructions(sentiment);
    if (toneInstructions) {
      sections.push(toneInstructions);
    }
  }

  // ── 9. FECHA Y HORA ───────────────────────────────────────────────
  const now = new Date().toLocaleString("es-EC", { timeZone: "America/Guayaquil" });
  sections.push(`\nFecha y hora actual: ${now}`);

  const finalPrompt = sections.join("\n").trim();

  logger.info(
    `${SERVICE_PREFIX} Prompt construido: agent=${agentIdentity.agentType}, ` +
    `name=${agentName}, hasContact=${!!contactInfo?.name}, ` +
    `sentiment=${sentiment?.sentiment || "none"}, length=${finalPrompt.length}`
  );

  return finalPrompt;
};

/**
 * Construye un saludo personalizado usando el nombre del contacto
 */
const buildPersonalizedGreeting = (
  contactInfo?: ContactContext,
  companyInfo?: CompanyContext
): string => {
  const name = contactInfo?.name;
  const companyName = companyInfo?.name;

  const greetings = name
    ? [
        `¡Hola ${name}! 👋 ¿En qué puedo ayudarte hoy?`,
        `¡Hola ${name}! 😊 ¿Cómo puedo asistirte?`,
        `¡Hola ${name}! ¿En qué te puedo ayudar?`,
      ]
    : [
        "¡Hola! 👋 ¿En qué puedo ayudarte hoy?",
        "¡Hola! 😊 Estoy aquí para ayudarte. ¿Qué necesitas?",
        "¡Hola! ¿En qué te puedo ayudar?",
      ];

  return greetings[Math.floor(Math.random() * greetings.length)];
};

/**
 * Construye una despedida personalizada
 */
const buildPersonalizedFarewell = (
  contactInfo?: ContactContext
): string => {
  const name = contactInfo?.name;

  const farewells = name
    ? [
        `¡Gracias por contactarnos, ${name}! Si necesitas algo más, aquí estoy. 👋`,
        `¡Fue un gusto ayudarte, ${name}! Que tengas un excelente día. 😊`,
        `¡Hasta pronto, ${name}! Estoy disponible cuando me necesites.`,
      ]
    : [
        "¡Gracias por contactarnos! Si necesitas algo más, no dudes en escribir. 👋",
        "¡Fue un placer ayudarte! Que tengas un excelente día. 😊",
        "¡Hasta pronto! Estoy disponible cuando me necesites.",
      ];

  return farewells[Math.floor(Math.random() * farewells.length)];
};

export default {
  buildSystemPrompt,
  buildPersonalizedGreeting,
  buildPersonalizedFarewell,
  NATURAL_LANGUAGE_RULES,
};
