/**
 * ContactMemoryService — Memoria Persistente por Contacto
 *
 * Servicio que permite al orquestador IA "recordar" información
 * conocida sobre un cliente de conversaciones pasadas.
 *
 * Flujo de escritura:
 * 1. Ticket se cierra → ExtractMemoryJob analiza conversación
 * 2. LLM extrae max 5 memorias (preferences, facts, objections, interests, decisions)
 * 3. Se guardan en contact_memory con embedding vectorial
 *
 * Flujo de lectura:
 * 1. Al iniciar mensaje, Supervisor llama recall(contactId, mensajeActual)
 * 2. Busca memorias semánticamente relevantes al mensaje actual
 * 3. Top 3 se injectan en el bloque CONTEXTO DISPONIBLE
 *
 * @module AIAgentServices/ContactMemoryService
 */

import { QueryTypes, Op } from "sequelize";
import sequelize from "../../database";
import EmbeddingService from "../RAGServices/EmbeddingService";
import ContactMemory, { ContactMemoryAttributes, MemoryType } from "../../models/ContactMemory";
import Contact from "../../models/Contact";
import logger from "../../utils/logger";
import crypto from "crypto";

const SERVICE_PREFIX = "[ContactMemoryService]";
const MAX_MEMORIES_PER_TICKET = 5;
const RECALL_TOP_K = 3;

export interface ContactMemoryWithScore extends ContactMemoryAttributes {
  similarity?: number;
}

/**
 * Busca memorias semánticamente relevantes para el mensaje actual
 * Se inyectan como "📌 MEMORIAS DEL CONTACTO" en el bloque de contexto
 */
const recall = async (
  contactId: number,
  companyId: number,
  currentMessage?: string
): Promise<ContactMemoryWithScore[]> => {
  if (!currentMessage || currentMessage.trim().length === 0) {
    return [];
  }

  try {
    // Generar embedding del mensaje actual
    const queryEmbedding = await EmbeddingService.generateEmbedding(currentMessage, companyId);
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    const sql = `
      SELECT
        cm.id,
        cm."contactId",
        cm."companyId",
        cm."memoryType",
        cm.content,
        cm.confidence,
        cm."sourceTicketId",
        cm.verified,
        cm."createdAt",
        cm."lastConfirmedAt",
        (1 - (cm.embedding <=> :embedding::vector)) AS similarity
      FROM contact_memory cm
      WHERE cm."contactId" = :contactId
        AND cm."companyId" = :companyId
        AND cm.verified = true
        AND cm.embedding IS NOT NULL
        AND (1 - (cm.embedding <=> :embedding::vector)) >= 0.70
      ORDER BY cm.embedding <=> :embedding::vector ASC
      LIMIT :limit
    `;

    const results = await sequelize.query<{
      id: string;
      contactId: number;
      companyId: number;
      memoryType: MemoryType;
      content: string;
      confidence: number;
      sourceTicketId: number | null;
      verified: boolean;
      createdAt: Date;
      lastConfirmedAt: Date | null;
      similarity: number;
    }>(sql, {
      replacements: {
        embedding: embeddingStr,
        contactId,
        companyId,
        limit: RECALL_TOP_K
      },
      type: QueryTypes.SELECT
    });

    logger.info(
      `${SERVICE_PREFIX} recall: contact=${contactId}, ` +
      `msg="${currentMessage.substring(0, 40)}..." → ${results.length} memorias`
    );

    return results.map(r => ({
      id: r.id,
      contactId: r.contactId,
      companyId: r.companyId,
      memoryType: r.memoryType,
      content: r.content,
      confidence: r.confidence,
      sourceTicketId: r.sourceTicketId ?? undefined,
      verified: r.verified,
      createdAt: r.createdAt,
      lastConfirmedAt: r.lastConfirmedAt ?? undefined,
      similarity: parseFloat(String(r.similarity))
    }));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`${SERVICE_PREFIX} Error en recall: ${msg}`);
    return [];
  }
};

/**
 * Construye el bloque de memorias para el Supervisor
 */
const buildSupervisorBlock = async (
  contactId: number,
  companyId: number,
  currentMessage?: string
): Promise<string> => {
  const memories = await recall(contactId, companyId, currentMessage);

  if (memories.length === 0) {
    return "";
  }

  const iconMap: Record<MemoryType, string> = {
    preference: "💡",
    fact: "📋",
    objection: "⚠️",
    interest: "⭐",
    decision: "✅"
  };

  const lines = [
    `## 🧠 MEMORIAS DEL CONTACTO`,
    `*(Información conocida de conversaciones anteriores)*`,
    ``
  ];

  memories.forEach(m => {
    const icon = iconMap[m.memoryType] || "📌";
    lines.push(
      `${icon} **[${m.memoryType}]** ${m.content}`
    );
  });

  return lines.join("\n");
};

/**
 * Extrae memorias de un ticket cerrado
 * Llamado por ExtractMemoryJob
 * Retorna cuántas memorias se extrajeron
 */
const extractFromTicket = async (
  ticketId: number,
  companyId: number
): Promise<number> => {
  try {
    const Message = require("../../models/Message").default;
    const Ticket = require("../../models/Ticket").default;

    // Cargar mensajes del ticket
    const messages = await Message.findAll({
      where: { ticketId },
      order: [["createdAt", "ASC"]],
      limit: 50
    });

    if (messages.length < 2) {
      logger.info(`${SERVICE_PREFIX} Ticket ${ticketId} con menos de 2 msgs, se omite`);
      return 0;
    }

    // Extraer contactId del ticket
    const ticket = await Ticket.findByPk(ticketId, { attributes: ["contactId"] });
    if (!ticket?.contactId) return 0;

    const conversation = messages
      .map(m => `${m.fromMe ? "AGENTE" : "CLIENTE"}: ${m.body || ""}`)
      .filter(t => t.length > 5)
      .join("\n");

    // Llamar al LLM para extraer memorias
    const memories = await extractMemoriesWithLLM(conversation, companyId);

    if (memories.length === 0) {
      logger.info(`${SERVICE_PREFIX} No se extrajeron memorias del ticket ${ticketId}`);
      return 0;
    }

    // Guardar memorias
    let saved = 0;
    for (const mem of memories.slice(0, MAX_MEMORIES_PER_TICKET)) {
      const success = await saveMemory(
        ticket.contactId,
        companyId,
        mem.type,
        mem.content,
        ticketId
      );
      if (success) saved++;
    }

    logger.info(`${SERVICE_PREFIX} Extraídas ${saved}/${memories.length} memorias del ticket ${ticketId}`);
    return saved;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`${SERVICE_PREFIX} Error extrayendo memorias: ${msg}`);
    return 0;
  }
};

/**
 * Usa el LLM para extraer memorias de una conversación
 */
async function extractMemoriesWithLLM(
  conversation: string,
  companyId: number
): Promise<Array<{ type: MemoryType; content: string }>> {
  try {
    const AIClientService = require("../AIClientService").default;

    const prompt = `Analiza esta conversación de soporte y extrae información relevante sobre el cliente.

Tipos de información a extraer:
- **preference**: Lo que el cliente prefiere o requiere (ej: "prefiere atención por WhatsApp", "quiere pago en cuotas")
- **fact**: Datos concretos mencionados por el cliente (ej: "tiene empresa de ropa", "trabaja desde casa")
- **objection**: Objeciones o preocupaciones expresadas (ej: "le parece caro", "no tiene tiempo")
- **interest**: Intereses o necesidades expresadas (ej: "le interesa el plan Enterprise", "quiere integración con CRM")
- **decision**: Decisiones tomadas (ej: "aceptó el plan Pro", "decidió no comprar por ahora")

Devuelve SOLO un array JSON válido, sin explicación:
[
  {"type": "preference", "content": "..."},
  {"type": "fact", "content": "..."}
]

Si no hay información relevante, devuelve: []

CONVERSACIÓN:
${conversation}`;

    const response = await AIClientService.generateText({
      prompt,
      modelKey: "gpt-4.1-mini",
      maxTokens: 512,
      temperature: 0.1
    });

    let parsed;
    try {
      const text = response.text?.trim() || "";
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      parsed = [];
    }

    return Array.isArray(parsed) ? parsed : [];
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`${SERVICE_PREFIX} Error en extracción LLM: ${msg}`);
    return [];
  }
}

/**
 * Guarda una memoria individual con embedding
 */
const saveMemory = async (
  contactId: number,
  companyId: number,
  memoryType: MemoryType,
  content: string,
  sourceTicketId?: number
): Promise<boolean> => {
  try {
    // Generar embedding
    const embedding = await EmbeddingService.generateEmbedding(content, companyId);

    // Hash para unicidad
    const contentHash = crypto.createHash("md5").update(content).digest("hex");

    await ContactMemory.create({
      contactId,
      companyId,
      memoryType,
      content,
      embedding,
      confidence: 1.0,
      sourceTicketId,
      verified: true,
      lastConfirmedAt: new Date()
    } as ContactMemory);

    return true;
  } catch (error: unknown) {
    // Ignorar duplicados (unique constraint)
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return false;
    }
    logger.error(`${SERVICE_PREFIX} Error guardando memoria: ${msg}`);
    return false;
  }
};

/**
 * Confirma/upvota una memoria (cuando el cliente ratifica la info)
 */
const confirmMemory = async (memoryId: string): Promise<void> => {
  try {
    const mem = await ContactMemory.findByPk(memoryId);
    if (mem) {
      mem.confidence = Math.min(1.0, mem.confidence + 0.1);
      mem.lastConfirmedAt = new Date();
      await mem.save();
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`${SERVICE_PREFIX} Error confirmando memoria: ${msg}`);
  }
};

/**
 * Confirma todas las memorias recientes de un contacto (llamado tras feedback positivo)
 * Incrementa la confianza de memorias creadas en los últimos 7 días
 */
const confirmMemoriesByContact = async (contactId: number): Promise<void> => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentMemories = await ContactMemory.findAll({
      where: {
        contactId,
        createdAt: { [Op.gte]: sevenDaysAgo }
      }
    });

    for (const mem of recentMemories) {
      mem.confidence = Math.min(1.0, mem.confidence + 0.1);
      mem.lastConfirmedAt = new Date();
      await mem.save();
    }
    logger.info(
      `${SERVICE_PREFIX} Confirmadas ${recentMemories.length} memorias del contacto ${contactId}`
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`${SERVICE_PREFIX} Error confirmando memorias por contacto: ${msg}`);
  }
};

/**
 * Rechaza una memoria (cuando el agente la corrige)
 */
const rejectMemory = async (memoryId: string): Promise<void> => {
  try {
    await ContactMemory.destroy({ where: { id: memoryId } });
    logger.info(`${SERVICE_PREFIX} Memoria ${memoryId} eliminada`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`${SERVICE_PREFIX} Error rechazando memoria: ${msg}`);
  }
};

export default {
  recall,
  buildSupervisorBlock,
  extractFromTicket,
  saveMemory,
  confirmMemory,
  confirmMemoriesByContact,
  rejectMemory
};
