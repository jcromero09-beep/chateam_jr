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
import ContactMemoryService from "./ContactMemoryService";
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
      const tagContext = await TicketContextService.getTicketContext(ticketId);
      const ticketBlock = TicketContextService.buildContextPrompt(tagContext);
      if (ticketBlock.trim()) {
        sections.push(`## 🏷️ ESTADO DEL TICKET ACTUAL\n${ticketBlock.trim()}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`ticketContext: ${msg}`);
    }
  }

  // ── 3. HISTORIAL RECIENTE ───────────────────────────────────────────
  if (ticketHistory && ticketHistory.length > 0) {
    const formatted = ticketHistory
      .slice(-20) // últimos 20 mensajes
      .map(m => `**${m.role === "assistant" ? "🤖 Agente" : "👤 Cliente"}:** ${truncate(m.content, 150)}`)
      .join("\n");

    sections.push(
      `## 💬 HISTORIAL RECIENTE DE ESTE CHAT\n` +
      `*(Los últimos ${Math.min(ticketHistory.length, 20)} mensajes)*\n\n` +
      formatted
    );
  }

  // ── 4. RESPUESTAS RÁPIDAS SEMÁNTICAS ────────────────────────────────
  try {
    const quickRepliesBlock = await QuickReplySemanticService.buildSupervisorBlock(
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
    `- prioriza RESPUESTAS RÁPIDAS DISPONIBLES si hay match de intent.`,
    `- El HISTORIAL te da contexto de la conversación previa.`,
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

export default {
  buildSupervisorContext
};
