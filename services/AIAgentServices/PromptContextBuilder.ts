/**
 * PromptContextBuilder — Constructor de Bloque de Contexto Unificado
 *
 * Construye el bloque "CONTEXTO DISPONIBLE" con etiquetas semánticas
 * que se inyecta al Supervisor antes de rutear al agente especializado.
 *
 * Este bloque le explica al LLM QUÉ información tiene disponible y
 * PARA QUÉ sirve cada sección — en lugar de inyectar texto plano.
 *
 * El bloque se pasa como ticketContext a RAG/Support que agregan
 * sus secciones propias (KB para RAG, diagnosticSteps para Support).
 *
 * @module AIAgentServices/PromptContextBuilder
 */

import TicketContextService from "./TicketContextService";
import QuickReplySemanticService from "./QuickReplySemanticService";
import type { RelevantQuickReply } from "./QuickReplySemanticService";
import ContactMemoryService from "./ContactMemoryService";
import CorrectionSearchService from "./CorrectionSearchService";
import CurrentTicketMemoryService from "./CurrentTicketMemoryService";
import ZepMemoryService from "./ZepMemoryService";
import Company from "../../models/Company";
import logger from "../../utils/logger";

const SERVICE_PREFIX = "[PromptContextBuilder]";

export interface PromptContextRequest {
  companyId: number;
  ticketId?: number;
  contactId?: number;
  currentMessage: string;
  ticketHistory: Array<{ role: string; content: string }>;
  contactInfo?: Record<string, unknown>;
  quickReplyCandidates?: RelevantQuickReply[];
}

/**
 * Construye el bloque CONTEXTO DISPONIBLE para el Supervisor
 *
 * Orden de construcción:
 * 1. Contexto de empresa (nombre, industria, horarios)
 * 2. Estado del ticket (etapa kanban + tags)
 * 3. Historial reciente del chat
 * 4. Quick Replies semánticamente relevantes
 */
const buildSupervisorContext = async (
  request: PromptContextRequest
): Promise<string> => {
  const {
    companyId, ticketId, contactId,
    currentMessage, ticketHistory, contactInfo
  } = request;

  const sections: string[] = [];
  const errors: string[] = [];

  // ── 1. CONTEXTO DE LA EMPRESA ──────────────────────────────────────
  try {
    const company = await Company.findByPk(companyId, {
      attributes: ["id", "name", "phone", "email"]
    });

    if (company) {
      const parts = [`**EMPRESA:** ${company.name || "No configurada"}`];
      if (company.email) parts.push(`**Email:** ${company.email}`);
      if (company.phone) parts.push(`**Teléfono:** ${company.phone}`);
      sections.push(`## 🏢 CONTEXTO DE LA EMPRESA\n${parts.join(" | ")}`);
    } else {
      sections.push(`## 🏢 CONTEXTO DE LA EMPRESA\n*(No disponible)*`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`empresa: ${msg}`);
    sections.push(`## 🏢 CONTEXTO DE LA EMPRESA\n*(No disponible)*`);
  }

  // ── 1a-bis. CORRECCIONES VERIFICADAS (PRIORIDAD MÁXIMA) ──────────────
  try {
    const correctionsBlock = await CorrectionSearchService.buildSupervisorBlock(
      currentMessage, companyId
    );
    if (correctionsBlock.trim()) {
      sections.push(correctionsBlock);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`corrections: ${msg}`);
  }

  // ── 1b. DATOS DEL CLIENTE ────────────────────────────────────────────
  if (contactInfo && Object.keys(contactInfo).length > 0) {
    const ci = contactInfo as Record<string, any>;
    const contactParts: string[] = [];
    if (ci.name) contactParts.push(`**Nombre:** ${ci.name}`);
    if (ci.email) contactParts.push(`**Email:** ${ci.email}`);
    if (ci.number) contactParts.push(`**Teléfono:** ${ci.number}`);
    if (contactParts.length > 0) {
      sections.push(`## 👤 CLIENTE ACTUAL\n${contactParts.join(" | ")}\n*Usa el nombre del cliente en la conversación.*`);
    }
  }

  // ── 2. ESTADO DEL TICKET (Kanban + Tags) ───────────────────────────
  if (ticketId) {
    try {
      const tagContext = await TicketContextService.getTicketContext(ticketId, companyId);
      const ticketBlock = TicketContextService.buildContextPrompt(tagContext);
      if (ticketBlock.trim()) {
        sections.push(`## 🏷️ ESTADO DEL TICKET ACTUAL\n${ticketBlock.trim()}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`ticketContext: ${msg}`);
    }
  }

  // ── 2b. MEMORIA ESTRUCTURADA DEL TICKET (2026-04-22) ───────────────
  //  Se inyecta ANTES del historial crudo para que el LLM "vea" primero
  //  los hechos ya respondidos y preguntas pendientes, en vez de depender
  //  de scrollear 20 mensajes truncados.
  if (ticketId) {
    try {
      const memBlock = await CurrentTicketMemoryService.buildSupervisorBlock(
        ticketId, companyId, currentMessage
      );
      if (memBlock.block && memBlock.block.trim()) {
        sections.push(memBlock.block);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`ticketMemory: ${msg}`);
    }
  }

  // -- 2c. MEMORIA ZEP (opcional, shadow/context por env vars) --------
  if (ticketId) {
    try {
      const zepBlock = await ZepMemoryService.buildSupervisorBlock({
        companyId,
        ticketId,
        contactId
      });
      if (zepBlock.trim()) {
        sections.push(zepBlock);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`zepMemory: ${msg}`);
    }
  }

  // ── 2c. RESUMEN COMPACTO DEL HILO (DERIVADO) ───────────────────────
  //  Lee como máximo los últimos 20 mensajes, pero los compacta en un
  //  resumen operativo breve. Esto reduce ruido sin perder continuidad,
  //  especialmente cuando la memoria estructurada aún está "fría".
  const compactHistoryBlock = buildCompactHistoryDigest(ticketHistory, currentMessage);
  if (compactHistoryBlock.trim()) {
    sections.push(compactHistoryBlock);
  }

  // ── 3. HISTORIAL RECIENTE ───────────────────────────────────────────
  if (ticketHistory && ticketHistory.length > 0) {
    const formatted = ticketHistory
      .slice(-6) // ventana corta: solo lo inmediato
      .map(m => `**${m.role === "assistant" ? "🤖 Agente" : "👤 Cliente"}:** ${truncate(m.content, 150)}`)
      .join("\n");

    sections.push(
      `## 💬 VENTANA CORTA RECIENTE DEL CHAT\n` +
      `*(Solo los últimos ${Math.min(ticketHistory.length, 6)} mensajes literales para referencias inmediatas; prioriza primero la memoria y el resumen compacto)*\n\n` +
      formatted
    );
  }

  // ── 4. RESPUESTAS RÁPIDAS SEMÁNTICAS ────────────────────────────────
  try {
    const quickRepliesBlock = request.quickReplyCandidates
      ? QuickReplySemanticService.buildSupervisorBlockFromCandidates(
          request.quickReplyCandidates
        )
      : await QuickReplySemanticService.buildSupervisorBlock(
          currentMessage, companyId
        );
    if (quickRepliesBlock.trim()) {
      sections.push(quickRepliesBlock);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`quickReplies: ${msg}`);
  }

  // ── 5. MEMORIAS DEL CONTACTO ────────────────────────────────────────
  if (contactId) {
    try {
      const memoriesBlock = await ContactMemoryService.buildSupervisorBlock(
        contactId, companyId, currentMessage
      );
      if (memoriesBlock.trim()) {
        sections.push(memoriesBlock);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`contactMemory: ${msg}`);
    }
  }

  if (errors.length > 0) {
    logger.warn(`${SERVICE_PREFIX} Errores parciales: ${errors.join(", ")}`);
  }

  // ── ENCABEZADO + INSTRUCCIONES ─────────────────────────────────────
  const block = [
    `CONTEXTO DISPONIBLE:`,
    ``,
    ...sections,
    ``,
    `---`,
    `**INSTRUCCIONES:**`,
    `- Lee cada sección antes de responder.`,
    `- Si la sección "MEMORIA ESTRUCTURADA DEL TICKET" indica que la pregunta YA fue respondida, DEBES responder consistentemente con esa respuesta previa — no la contradigas ni la reformules de manera distinta. Si el cliente repite la pregunta porque no quedó claro, resume en 1-2 frases.`,
    `- Usa el "RESUMEN COMPACTO DEL HILO" para continuidad conversacional; úsalo como contexto operativo, no como fuente factual si contradice memoria/KB/correcciones.`,
    `- Prioriza CORRECCIONES VERIFICADAS por encima de todo.`,
    `- Considera las RESPUESTAS RAPIDAS DISPONIBLES solo si en este turno ya vas a compartir una ficha o material concreto.`,
    `- Si aun estas calificando al cliente o te falta contexto para recomendar algo, NO te apoyes en una respuesta rapida.`,
    `- La "VENTANA CORTA RECIENTE DEL CHAT" sirve solo para wording inmediato y referencias muy recientes; no dependas de ella como única memoria.`,
    `- El ESTADO DEL TICKET te indica en qué punto del proceso está el cliente.`,
    `- Las MEMORIAS DEL CONTACTO son hechos conocidos sobre este cliente.`,
    `- Si una sección está vacía o no aplica, ignórala.`,
  ].join("\n");

  logger.info(
    `${SERVICE_PREFIX} Contexto construido: sections=${sections.length}, ` +
    `errors=${errors.length}, ticketId=${ticketId}`
  );

  return block;
};

/**
 * Trunca texto a máximo N caracteres
 */
function truncate(text: string, max: number): string {
  if (!text) return "";
  if (text.length <= max) return text;
  return text.substring(0, max) + "...";
}

function buildCompactHistoryDigest(
  ticketHistory: Array<{ role: string; content: string }>,
  currentMessage: string
): string {
  if (!ticketHistory || ticketHistory.length < 4) return "";

  const recent = ticketHistory
    .slice(-20)
    .filter(item => isMeaningfulHistoryLine(item.content));

  if (recent.length < 3) return "";

  const users = recent.filter(item => item.role !== "assistant");
  const assistants = recent.filter(item => item.role === "assistant");

  const latestUser = users[users.length - 1];
  const previousUser = users.length > 1 ? users[users.length - 2] : undefined;
  const latestAssistant = assistants[assistants.length - 1];

  const followUps = dedupeHistoryLines(
    users
      .slice(-3)
      .map(item => item.content)
      .filter(content => normalizeHistoryLine(content) !== normalizeHistoryLine(currentMessage))
      .map(content => truncate(content, 140))
  );

  const lines: string[] = [
    `## 🪶 RESUMEN COMPACTO DEL HILO`,
    `*(Derivado de los últimos ${Math.min(ticketHistory.length, 20)} mensajes, compactado para evitar ruido)*`
  ];

  if (previousUser) {
    lines.push(`**Venía preguntando por:** ${truncate(previousUser.content, 160)}`);
  }

  if (latestAssistant) {
    lines.push(`**Última respuesta del agente:** ${truncate(latestAssistant.content, 170)}`);
  }

  if (latestUser && normalizeHistoryLine(latestUser.content) !== normalizeHistoryLine(currentMessage)) {
    lines.push(`**Último mensaje del cliente antes de este turno:** ${truncate(latestUser.content, 160)}`);
  }

  if (followUps.length > 0) {
    lines.push(`**Mensajes recientes del cliente a tener presentes:**`);
    followUps.slice(-2).forEach(item => lines.push(`- ${item}`));
  }

  return lines.length > 2 ? lines.join("\n") : "";
}

function isMeaningfulHistoryLine(text: string): boolean {
  const value = (text || "").trim();
  if (!value) return false;
  if (value.length < 3) return false;
  return !/^(ok|okay|oki|dale|listo|gracias|muchas gracias|perfecto|entendido|👍|👌|🙏|🙂)$/i.test(value);
}

function normalizeHistoryLine(text: string): string {
  return (text || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[¿?¡!.,;:()"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeHistoryLines(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = normalizeHistoryLine(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(value);
  }

  return output;
}

export default {
  buildSupervisorContext
};
