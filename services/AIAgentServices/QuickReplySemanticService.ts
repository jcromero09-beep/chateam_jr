/**
 * QuickReplySemanticService — Búsqueda Semántica de QuickReplies con pgvector
 *
 * Permite que el orquestador IA considere respuestas rápidas predefinidas
 * de forma semántica (no solo por shortcode), inyectándolas como opciones
 * relevantes en el bloque de contexto cuando el score de similitud ≥ 0.75.
 *
 * Flujo:
 * 1. Admin marca QuickReply como isAiEnabled=true y escribe un intent
 * 2. Se genera embedding del intent en DB
 * 3. Al llegar mensaje, se busca por similitud vectorial
 * 4. Si score ≥ 0.75 → se incluyen en el bloque de contexto
 *
 * @module AIAgentServices/QuickReplySemanticService
 */

import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import EmbeddingService from "../RAGServices/EmbeddingService";
import QuickMessage from "../../models/QuickMessage";
import logger from "../../utils/logger";

const SERVICE_PREFIX = "[QuickReplySemanticService]";
const DEFAULT_SIMILARITY_THRESHOLD = 0.75;
const MAX_RELEVANT_REPLIES = 5;

export interface RelevantQuickReply {
  id: number;
  shortcode: string;
  message: string;
  intent: string;
  similarity: number;
}

/**
 * Genera / regenera el embedding del campo intent de un QuickMessage
 * Se llama al crear o editar un QuickReply con isAiEnabled=true
 */
const syncEmbedding = async (quickMessageId: number): Promise<void> => {
  try {
    const qm = await QuickMessage.findByPk(quickMessageId);
    if (!qm) {
      logger.warn(`${SERVICE_PREFIX} QuickMessage ${quickMessageId} no encontrado`);
      return;
    }

    if (!qm.intent || !qm.isAiEnabled) {
      // Limpiar embedding si se deshabilitó o borró el intent
      if (qm.intentEmbedding) {
        await sequelize.query(
          `UPDATE "QuickMessages" SET "intentEmbedding" = NULL WHERE id = :id`,
          { replacements: { id: quickMessageId }, type: QueryTypes.UPDATE }
        );
      }
      logger.info(`${SERVICE_PREFIX} Embedding limpiado para QuickMessage ${quickMessageId}`);
      return;
    }

    // Generar embedding del intent
    const embedding = await EmbeddingService.generateEmbedding(qm.intent, qm.companyId);

    await sequelize.query(
      `UPDATE "QuickMessages" SET "intentEmbedding" = :embedding::vector WHERE id = :id`,
      {
        replacements: {
          id: quickMessageId,
          embedding: `[${embedding.join(",")}]`
        },
        type: QueryTypes.UPDATE
      }
    );

    logger.info(`${SERVICE_PREFIX} Embedding generado para QuickMessage ${quickMessageId}: "${qm.intent}"`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`${SERVICE_PREFIX} Error generando embedding: ${msg}`);
  }
};

/**
 * Busca QuickReplies semánticamente relevantes para el mensaje actual
 * Solo retorna los que tienen score >= threshold
 */
const findRelevant = async (
  currentMessage: string,
  companyId: number,
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD
): Promise<RelevantQuickReply[]> => {
  if (!currentMessage || currentMessage.trim().length === 0) {
    return [];
  }

  try {
    // Generar embedding del mensaje actual
    const queryEmbedding = await EmbeddingService.generateEmbedding(currentMessage, companyId);
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    // Búsqueda semántica en QuickMessages habilitadas para IA
    const sql = `
      SELECT
        id,
        shortcode,
        message,
        intent,
        (1 - ("intentEmbedding" <=> :embedding::vector)) AS similarity
      FROM "QuickMessages"
      WHERE "companyId" = :companyId
        AND "isAiEnabled" = true
        AND "intent" IS NOT NULL
        AND "intentEmbedding" IS NOT NULL
        AND (1 - ("intentEmbedding" <=> :embedding::vector)) >= :threshold
      ORDER BY "intentEmbedding" <=> :embedding::vector ASC
      LIMIT :limit
    `;

    const results = await sequelize.query<{
      id: number;
      shortcode: string;
      message: string;
      intent: string;
      similarity: number;
    }>(sql, {
      replacements: {
        embedding: embeddingStr,
        companyId,
        threshold,
        limit: MAX_RELEVANT_REPLIES
      },
      type: QueryTypes.SELECT
    });

    logger.info(
      `${SERVICE_PREFIX} Búsqueda: "${currentMessage.substring(0, 40)}..." → ` +
      `${results.length} QuickReplies relevantes (threshold=${threshold})`
    );

    return results.map(r => ({
      id: r.id,
      shortcode: r.shortcode,
      message: r.message,
      intent: r.intent,
      similarity: parseFloat(String(r.similarity))
    }));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`${SERVICE_PREFIX} Error en búsqueda: ${msg}`);
    return [];
  }
};

/**
 * Construye el bloque de Quick Replies para el Supervisor
 * Se inyecta en el bloque CONTEXTO DISPONIBLE
 */
const buildSupervisorBlock = async (
  currentMessage: string,
  companyId: number
): Promise<string> => {
  const relevant = await findRelevant(currentMessage, companyId);

  if (relevant.length === 0) {
    return "";
  }

  const lines = [
    `## ⚡ RESPUESTAS RÁPIDAS DISPONIBLES (usa solo si aplican)`,
    `Usa SOLO la(s) que matcheen con el mensaje del cliente:`,
    ``
  ];

  relevant.forEach((qr, i) => {
    const matchLabel = qr.similarity >= 0.90 ? "🔴" : qr.similarity >= 0.80 ? "🟡" : "🟢";
    lines.push(
      `[${matchLabel} Opción ${i + 1}] /${qr.shortcode} — intención: "${qr.intent}"`,
      `→ ${qr.message}`,
      ``
    );
  });

  return lines.join("\n");
};

/**
 * Elimina el embedding de un QuickReply (al borrar/deshabilitar)
 */
const removeEmbedding = async (quickMessageId: number): Promise<void> => {
  try {
    await sequelize.query(
      `UPDATE "QuickMessages" SET "intentEmbedding" = NULL WHERE id = :id`,
      { replacements: { id: quickMessageId }, type: QueryTypes.UPDATE }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`${SERVICE_PREFIX} Error eliminando embedding: ${msg}`);
  }
};

export default {
  syncEmbedding,
  findRelevant,
  buildSupervisorBlock,
  removeEmbedding
};
